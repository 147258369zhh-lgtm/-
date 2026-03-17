// ═══════════════════════════════════════════════════════
// Workflow Engine — Core State Machine
// ═══════════════════════════════════════════════════════

use crate::workflow::types::*;
use crate::workflow::persistence::WorkflowPersistence;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock, oneshot};
use tauri::{AppHandle, Emitter, Manager};

/// Active workflow execution state (in-memory)
struct ActiveExecution {
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    accumulated_results: Vec<NodeResult>,
    context_data: Value,
    /// Channel to send human response to waiting node
    human_response_tx: Option<oneshot::Sender<HumanNodeResponse>>,
}

/// The main Workflow Engine — manages all running workflows
pub struct WorkflowEngine {
    /// All active (running/paused/waiting) executions
    active_executions: Arc<RwLock<HashMap<String, Arc<Mutex<ActiveExecution>>>>>,
    app_handle: AppHandle,
}

impl WorkflowEngine {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            active_executions: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    /// Start executing a workflow
    pub async fn run_workflow(
        &self,
        workflow: WorkflowDefinition,
        context: Option<Value>,
        persistence: &WorkflowPersistence,
    ) -> Result<String, String> {
        let execution_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let execution = WorkflowExecution {
            id: execution_id.clone(),
            workflow_id: workflow.id.clone(),
            workflow_name: workflow.name.clone(),
            status: WorkflowStatus::Running,
            current_node_index: 0,
            total_nodes: workflow.nodes.len(),
            started_at: Some(now.clone()),
            completed_at: None,
            error: None,
            result: None,
        };

        // Persist execution record
        persistence.create_execution(&execution).await?;

        let active = Arc::new(Mutex::new(ActiveExecution {
            execution: execution.clone(),
            workflow: workflow.clone(),
            accumulated_results: Vec::new(),
            context_data: context.unwrap_or(json!({})),
            human_response_tx: None,
        }));

        // Register in active map
        {
            let mut map = self.active_executions.write().await;
            map.insert(execution_id.clone(), active.clone());
        }

        // Emit start event
        self.emit_event(WorkflowEvent {
            execution_id: execution_id.clone(),
            event_type: WorkflowEventType::Started,
            node_index: None,
            node_name: Some(workflow.name.clone()),
            message: Some(format!("Workflow '{}' started with {} nodes", workflow.name, workflow.nodes.len())),
            data: None,
        });

        // Spawn execution in background (supports parallel workflows)
        let engine_handle = self.app_handle.clone();
        let active_executions = self.active_executions.clone();
        let exec_id = execution_id.clone();

        tokio::spawn(async move {
            let result = Self::execute_loop(
                active.clone(),
                engine_handle.clone(),
                &exec_id,
            ).await;

            // Finalize
            let mut state = active.lock().await;
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

            match result {
                Ok(final_result) => {
                    state.execution.status = WorkflowStatus::Completed;
                    state.execution.completed_at = Some(now);
                    state.execution.result = Some(final_result.clone());

                    let _ = engine_handle.emit("workflow-event", WorkflowEvent {
                        execution_id: exec_id.clone(),
                        event_type: WorkflowEventType::Completed,
                        node_index: None,
                        node_name: None,
                        message: Some("Workflow completed successfully".into()),
                        data: Some(final_result),
                    });
                }
                Err(err) => {
                    // Check if it was cancelled or paused (not a real error)
                    if state.execution.status == WorkflowStatus::Paused
                        || state.execution.status == WorkflowStatus::Cancelled
                    {
                        // Don't overwrite status
                    } else {
                        state.execution.status = WorkflowStatus::Failed;
                        state.execution.completed_at = Some(now);
                        state.execution.error = Some(err.clone());

                        let _ = engine_handle.emit("workflow-event", WorkflowEvent {
                            execution_id: exec_id.clone(),
                            event_type: WorkflowEventType::Failed,
                            node_index: None,
                            node_name: None,
                            message: Some(format!("Workflow failed: {}", err)),
                            data: None,
                        });
                    }
                }
            }

            // Persist final state
            {
                let pool: tauri::State<'_, crate::db::DbPool> = engine_handle.state::<crate::db::DbPool>();
                let persistence = WorkflowPersistence::new((*pool).clone());
                let _ = persistence.update_execution(&state.execution).await;
            }

            // Remove from active map (unless paused/waiting)
            if state.execution.status == WorkflowStatus::Completed
                || state.execution.status == WorkflowStatus::Failed
                || state.execution.status == WorkflowStatus::Cancelled
            {
                let mut map = active_executions.write().await;
                map.remove(&exec_id);
            }
        });

        Ok(execution_id)
    }

    /// The main execution loop — iterates through workflow nodes
    async fn execute_loop(
        active: Arc<Mutex<ActiveExecution>>,
        app_handle: AppHandle,
        execution_id: &str,
    ) -> Result<Value, String> {
        let mut accumulated_output = json!({});

        loop {
            let (node, node_index, status) = {
                let state = active.lock().await;
                let idx = state.execution.current_node_index;
                if idx >= state.workflow.nodes.len() {
                    return Ok(accumulated_output);
                }
                let node = state.workflow.nodes[idx].clone();
                (node, idx, state.execution.status.clone())
            };

            // Check if paused or cancelled
            if status == WorkflowStatus::Paused || status == WorkflowStatus::Cancelled {
                return Err(format!("Workflow {}", status.as_str()));
            }

            // Emit node start
            let _ = app_handle.emit("workflow-event", WorkflowEvent {
                execution_id: execution_id.to_string(),
                event_type: WorkflowEventType::NodeStarted,
                node_index: Some(node_index),
                node_name: Some(node.name.clone()),
                message: Some(format!("Executing node: {}", node.name)),
                data: None,
            });

            let start_time = std::time::Instant::now();

            // Execute the node based on type
            let node_result = match node.node_type {
                NodeType::Agent => {
                    Self::execute_agent_node(&node, &accumulated_output, &app_handle).await
                }
                NodeType::Skill => {
                    Self::execute_skill_node(&node, &accumulated_output).await
                }
                NodeType::Human => {
                    Self::execute_human_node(&node, &accumulated_output, &app_handle, execution_id, active.clone()).await
                }
            };

            let duration_ms = start_time.elapsed().as_millis() as u64;
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

            match node_result {
                Ok(output) => {
                    let result = NodeResult {
                        node_id: node.id.clone(),
                        node_name: node.name.clone(),
                        node_type: node.node_type.clone(),
                        success: true,
                        output: Some(output.clone()),
                        error: None,
                        duration_ms,
                        started_at: now.clone(),
                        completed_at: now,
                    };

                    // Merge output into accumulated
                    if let Some(obj) = output.as_object() {
                        for (k, v) in obj {
                            accumulated_output[k.clone()] = v.clone();
                        }
                    }
                    // Also store under node_id key
                    accumulated_output[&node.id] = output;

                    let _ = app_handle.emit("workflow-event", WorkflowEvent {
                        execution_id: execution_id.to_string(),
                        event_type: WorkflowEventType::NodeCompleted,
                        node_index: Some(node_index),
                        node_name: Some(node.name.clone()),
                        message: Some(format!("Node '{}' completed ({}ms)", node.name, duration_ms)),
                        data: Some(json!({"duration_ms": duration_ms})),
                    });

                    // Save result and advance
                    let mut state = active.lock().await;
                    state.accumulated_results.push(result);
                    state.execution.current_node_index = node_index + 1;

                    // Persist checkpoint
                    {
                        let pool: tauri::State<'_, crate::db::DbPool> = app_handle.state::<crate::db::DbPool>();
                        let persistence = WorkflowPersistence::new((*pool).clone());
                        let _ = persistence.save_step_log(&StepLog {
                            id: uuid::Uuid::new_v4().to_string(),
                            execution_id: execution_id.to_string(),
                            node_index,
                            node_type: format!("{:?}", node.node_type).to_lowercase(),
                            status: "completed".to_string(),
                            input_json: None,
                            output_json: Some(accumulated_output[&node.id].to_string()),
                            started_at: state.accumulated_results.last().map(|r| r.started_at.clone()).unwrap_or_default(),
                            completed_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                            duration_ms: Some(duration_ms),
                            error: None,
                        }).await;
                        let _ = persistence.update_execution(&state.execution).await;
                    }
                }
                Err(err) => {
                    // Handle retry
                    let retry_count = node.config.retry_count.unwrap_or(1);
                    let mut retried = false;

                    if retry_count > 0 {
                        // Simple retry: try once more
                        let _ = app_handle.emit("workflow-event", WorkflowEvent {
                            execution_id: execution_id.to_string(),
                            event_type: WorkflowEventType::NodeFailed,
                            node_index: Some(node_index),
                            node_name: Some(node.name.clone()),
                            message: Some(format!("Node '{}' failed, retrying... Error: {}", node.name, err)),
                            data: None,
                        });
                        // For now, don't retry (just report failure)
                        // TODO: implement retry logic in P1
                    }

                    if !retried {
                        return Err(format!("Node '{}' failed: {}", node.name, err));
                    }
                }
            }
        }
    }

    /// Execute an Agent node
    async fn execute_agent_node(
        node: &WorkflowNode,
        context: &Value,
        _app_handle: &AppHandle,
    ) -> Result<Value, String> {
        let prompt = node.config.prompt.as_deref().unwrap_or("Execute this task");

        // Build context-aware prompt
        let full_prompt = if context.as_object().map(|o| o.is_empty()).unwrap_or(true) {
            prompt.to_string()
        } else {
            format!("{}\n\n前置节点输出:\n{}", prompt, serde_json::to_string_pretty(context).unwrap_or_default())
        };

        // P0: Agent node returns a structured result with the prompt.
        // Full agent integration (calling the LLM via ai::chat_with_ai) will be done in P1.
        Ok(json!({
            "status": "agent_executed",
            "prompt": full_prompt,
            "node_name": node.name,
            "note": "Agent LLM integration will be completed in P1 phase",
        }))
    }

    /// Execute a Skill node (stub for P0, full implementation in P1)
    async fn execute_skill_node(
        node: &WorkflowNode,
        _context: &Value,
    ) -> Result<Value, String> {
        let skill_id = node.config.skill_id.as_deref().unwrap_or("unknown");
        let params = node.config.skill_params.as_ref();

        // P0: Skills are not yet implemented, return placeholder
        Ok(json!({
            "status": "skill_executed",
            "skill_id": skill_id,
            "params": params,
            "note": "Skill system will be fully implemented in P1",
        }))
    }

    /// Execute a Human node — pause and wait for user input
    async fn execute_human_node(
        node: &WorkflowNode,
        context: &Value,
        app_handle: &AppHandle,
        execution_id: &str,
        active: Arc<Mutex<ActiveExecution>>,
    ) -> Result<Value, String> {
        let message = node.config.human_message.as_deref()
            .unwrap_or("Please review and confirm to continue");
        let input_type = node.config.human_input_type.clone()
            .unwrap_or(HumanInputType::Confirm);

        // Create a channel to wait for human response
        let (tx, rx) = oneshot::channel::<HumanNodeResponse>();

        {
            let mut state = active.lock().await;
            state.execution.status = WorkflowStatus::WaitingHuman;
            state.human_response_tx = Some(tx);
        }

        // Emit waiting event to frontend
        let _ = app_handle.emit("workflow-event", WorkflowEvent {
            execution_id: execution_id.to_string(),
            event_type: WorkflowEventType::WaitingHuman,
            node_index: None,
            node_name: Some(node.name.clone()),
            message: Some(message.to_string()),
            data: Some(json!({
                "node_id": node.id,
                "input_type": input_type,
                "context": context,
            })),
        });

        // Wait for human response (blocks this task, not the engine)
        let timeout = node.config.human_timeout_secs.unwrap_or(0);
        let response = if timeout > 0 {
            tokio::time::timeout(
                std::time::Duration::from_secs(timeout),
                rx,
            ).await
            .map_err(|_| "Human node timed out".to_string())?
            .map_err(|_| "Human response channel closed".to_string())?
        } else {
            rx.await.map_err(|_| "Human response channel closed".to_string())?
        };

        // Process human response
        {
            let mut state = active.lock().await;
            state.execution.status = WorkflowStatus::Running;
            state.human_response_tx = None;
        }

        let _ = app_handle.emit("workflow-event", WorkflowEvent {
            execution_id: execution_id.to_string(),
            event_type: WorkflowEventType::HumanResponded,
            node_index: None,
            node_name: Some(node.name.clone()),
            message: Some(format!("Human responded: {:?}", response.action)),
            data: response.data.clone(),
        });

        match response.action {
            HumanAction::Approve | HumanAction::Input | HumanAction::Edit => {
                Ok(json!({
                    "human_action": response.action,
                    "human_data": response.data,
                    "status": "human_approved",
                }))
            }
            HumanAction::Reject => {
                Err("Human rejected this step".to_string())
            }
            HumanAction::Skip => {
                Ok(json!({
                    "human_action": "skip",
                    "status": "human_skipped",
                }))
            }
        }
    }

    /// Submit a human response to a waiting workflow
    pub async fn submit_human_response(&self, response: HumanNodeResponse) -> Result<(), String> {
        let map = self.active_executions.read().await;
        let active = map.get(&response.execution_id)
            .ok_or("Execution not found or not active")?;

        let mut state = active.lock().await;
        if state.execution.status != WorkflowStatus::WaitingHuman {
            return Err("Execution is not waiting for human input".to_string());
        }

        if let Some(tx) = state.human_response_tx.take() {
            tx.send(response).map_err(|_| "Failed to send human response")?;
            Ok(())
        } else {
            Err("No active human response channel".to_string())
        }
    }

    /// Pause a running workflow
    pub async fn pause(&self, execution_id: &str) -> Result<(), String> {
        let map = self.active_executions.read().await;
        let active = map.get(execution_id)
            .ok_or("Execution not found")?;
        let mut state = active.lock().await;

        if state.execution.status != WorkflowStatus::Running {
            return Err(format!("Cannot pause: status is {}", state.execution.status.as_str()));
        }

        state.execution.status = WorkflowStatus::Paused;

        self.emit_event(WorkflowEvent {
            execution_id: execution_id.to_string(),
            event_type: WorkflowEventType::Paused,
            node_index: Some(state.execution.current_node_index),
            node_name: None,
            message: Some("Workflow paused".into()),
            data: None,
        });

        Ok(())
    }

    /// Cancel a running workflow
    pub async fn cancel(&self, execution_id: &str) -> Result<(), String> {
        let map = self.active_executions.read().await;
        let active = map.get(execution_id)
            .ok_or("Execution not found")?;
        let mut state = active.lock().await;

        state.execution.status = WorkflowStatus::Cancelled;

        self.emit_event(WorkflowEvent {
            execution_id: execution_id.to_string(),
            event_type: WorkflowEventType::Cancelled,
            node_index: None,
            node_name: None,
            message: Some("Workflow cancelled".into()),
            data: None,
        });

        // If waiting for human input, close the channel
        if let Some(tx) = state.human_response_tx.take() {
            let _ = tx.send(HumanNodeResponse {
                execution_id: execution_id.to_string(),
                node_id: String::new(),
                action: HumanAction::Reject,
                data: None,
            });
        }

        Ok(())
    }

    /// Get status of all active executions
    pub async fn list_active(&self) -> Vec<WorkflowExecution> {
        let map = self.active_executions.read().await;
        let mut result = Vec::new();
        for active in map.values() {
            let state = active.lock().await;
            result.push(state.execution.clone());
        }
        result
    }

    /// Get status of a specific execution
    pub async fn get_execution_status(&self, execution_id: &str) -> Option<WorkflowExecution> {
        let map = self.active_executions.read().await;
        if let Some(active) = map.get(execution_id) {
            let state = active.lock().await;
            Some(state.execution.clone())
        } else {
            None
        }
    }

    fn emit_event(&self, event: WorkflowEvent) {
        let _ = self.app_handle.emit("workflow-event", &event);
    }
}
