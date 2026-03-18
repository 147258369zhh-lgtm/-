use crate::agent::types::*;
use crate::agent::llm_client::LlmClient;
use crate::agent::context::ContextManager;
use crate::agent::react_loop;
use crate::agent::human_layer::intervention_manager;
use crate::agent::human_layer::recovery_bridge::ResumeRegistry;
use super::state::{WorkflowStateMachine, save_workflow_run};
use super::nodes::{build_node_specs, human_gate_for_node, WorkflowNodeType};
use tauri::{AppHandle, Emitter};
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Workflow Runtime — Engine
// Orchestrates multi-node workflow execution:
//   For agent nodes → delegates to react_loop
//   For human nodes → opens a gate and waits for resume
//   Chains results between nodes
//   Handles dependency checking and optional step skip
// ═══════════════════════════════════════════════════════════════

pub async fn run_workflow(
    blueprint: &BlueprintInfo,
    goal: &str,
    llm: &LlmClient,
    ctx: &ContextManager,
    pool: &sqlx::SqlitePool,
    app: &AppHandle,
    allowed_paths: Option<Vec<String>>,
    resume_registry: &ResumeRegistry,
) -> WorkflowRun {
    let mut machine = WorkflowStateMachine::new(blueprint, goal);
    let node_specs = build_node_specs(blueprint);

    app_log!("WORKFLOW", "═══ WorkflowRun {} START: {} nodes ═══",
             &machine.wf_run.workflow_run_id[..8], node_specs.len());

    // Emit workflow started
    emit_progress(app, &machine.wf_run.workflow_run_id, 0, RunStatus::Running);

    while !machine.is_finished() {
        let idx = machine.wf_run.current_node_idx;
        let spec = match node_specs.get(idx) {
            Some(s) => s.clone(),
            None    => break,
        };

        app_log!("WORKFLOW", "─── Node {} [{}] {:?}", idx, spec.goal, spec.node_type);

        // Check dependency — skip if blocked
        let step = &blueprint.workflow_template[idx];
        if machine.should_skip_current(step) {
            app_log!("WORKFLOW", "  ⏭️ Skipping node {} (dependency failed)", spec.node_id);
            machine.mark_node_done("⏭️ 已跳过（前置步骤失败）".into());
            emit_progress(app, &machine.wf_run.workflow_run_id, idx, RunStatus::Done);
            continue;
        }

        // Build effective goal (inject previous result)
        let prev = machine.get_previous_result().map(|s| s.to_string());
        let node_goal = spec.build_goal(prev.as_deref());

        match spec.node_type {
            // ── Agent Node: delegate to ReAct loop ────────────────
            WorkflowNodeType::Agent | WorkflowNodeType::Skill => {
                let experience_hint = crate::agent::memory::retrieve_similar(&node_goal, pool).await;

                let session = ctx.new_session(
                    &node_goal,
                    None,
                    allowed_paths.clone(),
                    step.timeout_secs.max(3),
                    experience_hint,
                );

                let run_id = uuid::Uuid::new_v4().to_string();
                machine.mark_node_running(&run_id);
                emit_progress(app, &machine.wf_run.workflow_run_id, idx, RunStatus::Running);

                let result = react_loop::run(session, llm, ctx, pool, app).await;

                if result.success {
                    machine.mark_node_done(result.final_answer.clone());
                    emit_progress(app, &machine.wf_run.workflow_run_id, idx + 1, RunStatus::Done);
                } else if step.optional {
                    app_log!("WORKFLOW", "  ⚠️ Optional node {} failed, continuing", spec.node_id);
                    machine.mark_node_done(format!("⚠️ 可选步骤失败: {}", result.final_answer));
                } else {
                    machine.mark_node_failed(result.final_answer.clone());
                    emit_progress(app, &machine.wf_run.workflow_run_id, idx, RunStatus::Failed);
                    // Non-optional failure → abort workflow
                    app_log!("WORKFLOW", "  ❌ Required node {} failed → abort", spec.node_id);
                    machine.finish(false);
                    save_workflow_run(&machine.wf_run, pool).await;
                    return machine.wf_run;
                }
            }

            // ── Human Node: gate + wait ────────────────────────────
            WorkflowNodeType::Human => {
                machine.mark_node_running("human");
                machine.mark_node_waiting_human();
                emit_progress(app, &machine.wf_run.workflow_run_id, idx, RunStatus::WaitingHuman);

                let gate_type = human_gate_for_node(&spec);
                let intervention = intervention_manager::open_gate(
                    &machine.wf_run.workflow_run_id,
                    gate_type,
                    &spec.goal,
                    prev.clone(),
                    pool,
                    app,
                ).await;

                save_workflow_run(&machine.wf_run, pool).await;

                // Asynchronously wait for human to resolve
                match crate::agent::human_layer::recovery_bridge::wait_for_human(
                    resume_registry,
                    &intervention.intervention_id,
                ).await {
                    Ok(response) => {
                        app_log!("WORKFLOW", "  ✅ Human gate resolved: {}", &response[..response.len().min(50)]);
                        machine.mark_node_done(response);
                        emit_progress(app, &machine.wf_run.workflow_run_id, idx + 1, RunStatus::Done);
                    }
                    Err(e) => {
                        app_log!("WORKFLOW", "  ❌ Human gate failed: {}", e);
                        machine.mark_node_failed(e.clone());
                        machine.finish(false);
                        save_workflow_run(&machine.wf_run, pool).await;
                        return machine.wf_run;
                    }
                }
            }
        }

        // Persist state after each node
        save_workflow_run(&machine.wf_run, pool).await;
    }

    machine.finish(true);
    save_workflow_run(&machine.wf_run, pool).await;

    app_log!("WORKFLOW", "═══ WorkflowRun {} DONE ═══",
             &machine.wf_run.workflow_run_id[..8]);

    machine.wf_run
}

fn emit_progress(app: &AppHandle, wf_run_id: &str, node_idx: usize, status: RunStatus) {
    let _ = app.emit("workflow-event", serde_json::json!({
        "workflow_run_id": wf_run_id,
        "node_idx": node_idx,
        "status": status,
    }));
}
