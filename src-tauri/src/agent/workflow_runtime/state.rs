use crate::agent::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Workflow Runtime — State Machine
// Manages the state of a WorkflowRun across multiple nodes.
// Each node (Agent/Skill/Human) gets its own Run.
// ═══════════════════════════════════════════════════════════════

pub struct WorkflowStateMachine {
    pub wf_run: WorkflowRun,
}

impl WorkflowStateMachine {
    pub fn new(blueprint: &BlueprintInfo, goal: &str) -> Self {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let nodes = blueprint.workflow_template.iter().map(|step| {
            WorkflowNodeRun {
                node_id: step.id,
                node_type: WorkflowNodeType::Agent,
                status: RunStatus::Pending,
                run_id: None,
                result: None,
                error: None,
            }
        }).collect();

        Self {
            wf_run: WorkflowRun {
                workflow_run_id: uuid::Uuid::new_v4().to_string(),
                blueprint_id: blueprint.id.clone(),
                // SSOT: immutable version reference — test and production must use same value
                blueprint_version_id: format!("{}@{}", blueprint.id, blueprint.version),
                goal: goal.to_string(),
                status: RunStatus::Pending,
                nodes,
                current_node_idx: 0,
                created_at: now,
                finished_at: None,
            }
        }
    }

    pub fn current_node(&self) -> Option<&WorkflowNodeRun> {
        self.wf_run.nodes.get(self.wf_run.current_node_idx)
    }

    pub fn mark_node_running(&mut self, run_id: &str) {
        if let Some(node) = self.wf_run.nodes.get_mut(self.wf_run.current_node_idx) {
            node.status = RunStatus::Running;
            node.run_id = Some(run_id.to_string());
        }
        if self.wf_run.status == RunStatus::Pending {
            self.wf_run.status = RunStatus::Running;
        }
    }

    pub fn mark_node_done(&mut self, result: String) {
        if let Some(node) = self.wf_run.nodes.get_mut(self.wf_run.current_node_idx) {
            node.status = RunStatus::Done;
            node.result = Some(result);
        }
        self.wf_run.current_node_idx += 1;
    }

    pub fn mark_node_failed(&mut self, error: String) {
        if let Some(node) = self.wf_run.nodes.get_mut(self.wf_run.current_node_idx) {
            node.status = RunStatus::Failed;
            node.error = Some(error);
        }
    }

    pub fn mark_node_waiting_human(&mut self) {
        if let Some(node) = self.wf_run.nodes.get_mut(self.wf_run.current_node_idx) {
            node.status = RunStatus::WaitingHuman;
        }
        self.wf_run.status = RunStatus::WaitingHuman;
    }

    pub fn is_finished(&self) -> bool {
        self.wf_run.current_node_idx >= self.wf_run.nodes.len()
    }

    pub fn finish(&mut self, success: bool) {
        self.wf_run.status = if success { RunStatus::Done } else { RunStatus::Failed };
        self.wf_run.finished_at = Some(
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
        );
        app_log!("WORKFLOW", "WorkflowRun {} finished: {:?}",
                 &self.wf_run.workflow_run_id[..8], self.wf_run.status);
    }

    /// Get the output of a previous node (for chaining context)
    pub fn get_previous_result(&self) -> Option<&str> {
        let idx = self.wf_run.current_node_idx.checked_sub(1)?;
        self.wf_run.nodes.get(idx)?.result.as_deref()
    }

    /// Check if a node should skip (it depends on a failed node)
    pub fn should_skip_current(&self, blueprint_step: &WorkflowStepInfo) -> bool {
        if let Some(dep_id) = blueprint_step.depends_on {
            let failed = self.wf_run.nodes.iter().any(|n| {
                n.node_id == dep_id && n.status == RunStatus::Failed
            });
            if failed && !blueprint_step.optional {
                return true;
            }
        }
        false
    }
}

/// Persist a WorkflowRun to DB
pub async fn save_workflow_run(wf: &WorkflowRun, pool: &sqlx::SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            blueprint_id TEXT,
            blueprint_version_id TEXT,
            goal TEXT,
            status TEXT,
            nodes_json TEXT,
            current_node_idx INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME
        )"
    ).execute(pool).await;

    let nodes_json = serde_json::to_string(&wf.nodes).unwrap_or("[]".into());
    let status = serde_json::to_string(&wf.status).unwrap_or("\"pending\"".into());

    let _ = sqlx::query(
        "INSERT OR REPLACE INTO workflow_runs
         (id, blueprint_id, blueprint_version_id, goal, status, nodes_json, current_node_idx, created_at, finished_at)
         VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .bind(&wf.workflow_run_id).bind(&wf.blueprint_id).bind(&wf.blueprint_version_id)
    .bind(&wf.goal).bind(&status).bind(&nodes_json).bind(wf.current_node_idx as i64)
    .bind(&wf.created_at).bind(&wf.finished_at)
    .execute(pool).await;
}

/// Load a WorkflowRun from DB by its workflow_run_id
pub async fn load_workflow_run(run_id: &str, pool: &sqlx::SqlitePool) -> Option<WorkflowRun> {
    let row: Option<(String, String, String, String, String, String, i64, String, Option<String>)> =
        sqlx::query_as(
            "SELECT id, blueprint_id, blueprint_version_id, goal, status, nodes_json,
                    current_node_idx, created_at, finished_at
             FROM workflow_runs WHERE id = ?"
        ).bind(run_id).fetch_optional(pool).await.ok().flatten();

    row.map(|(id, bp_id, bp_ver, goal, status_str, nodes_str, node_idx, created, finished)| {
        let status: RunStatus = serde_json::from_str(&status_str).unwrap_or(RunStatus::Failed);
        let nodes: Vec<WorkflowNodeRun> = serde_json::from_str(&nodes_str).unwrap_or_default();
        WorkflowRun {
            workflow_run_id: id,
            blueprint_id: bp_id,
            blueprint_version_id: bp_ver,
            goal,
            status,
            nodes,
            current_node_idx: node_idx as usize,
            created_at: created,
            finished_at: finished,
        }
    })
}
