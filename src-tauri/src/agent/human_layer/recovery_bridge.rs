use crate::agent::types::*;
use crate::app_log;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

// ═══════════════════════════════════════════════════════════════
// Human Layer — Recovery Bridge
// Safely returns control to react_loop or workflow_runtime after
// human intervention. Implements 3 resume modes:
//
//  1. ContinueCurrentNode — human fixed a param; keep going in same context
//  2. ResumeFromSubstep(step_id) — jump to a specific inner step
//  3. RollbackAndRetry(node_id) — revert to an earlier node and re-execute
//
// Distinction: "human completed" ≠ "system resumed successfully"
// This bridge is responsible for confirming the latter.
// ═══════════════════════════════════════════════════════════════

/// Async wait registry: intervention_id → oneshot::Sender<String>
pub type ResumeRegistry = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

pub fn new_registry() -> ResumeRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Register a park point — react_loop/workflow calls .await on the returned future.
pub async fn wait_for_human(
    registry: &ResumeRegistry,
    intervention_id: &str,
) -> Result<String, String> {
    let (tx, rx) = oneshot::channel::<String>();

    {
        let mut map = registry.lock().map_err(|_| "lock poisoned")?;
        map.insert(intervention_id.to_string(), tx);
    }

    app_log!("RECOVERY_BRIDGE", "Parking on intervention {}", crate::logger::safe_truncate(&intervention_id, 8));

    match tokio::time::timeout(
        std::time::Duration::from_secs(600), // 10-min human timeout
        rx,
    ).await {
        Ok(Ok(resp)) => {
            app_log!("RECOVERY_BRIDGE", "Resumed: {}", crate::logger::safe_truncate(&resp, 50));
            Ok(resp)
        }
        Ok(Err(_)) => Err("human gate channel closed".into()),
        Err(_) => {
            // Timeout — clean registry
            let mut map = registry.lock().unwrap_or_else(|e| e.into_inner());
            map.remove(intervention_id);
            Err("等待人工响应超时 (10分钟)".into())
        }
    }
}

/// Called when frontend resolves a gate — wakes the parked future.
pub fn signal_resume(
    registry: &ResumeRegistry,
    intervention_id: &str,
    response: String,
) -> bool {
    let mut map = match registry.lock() {
        Ok(m) => m,
        Err(_) => return false,
    };
    if let Some(tx) = map.remove(intervention_id) {
        let _ = tx.send(response);
        app_log!("RECOVERY_BRIDGE", "Signalled resume for {}", crate::logger::safe_truncate(&intervention_id, 8));
        true
    } else {
        false
    }
}

/// Apply a ResumeMode after human intervention completes.
/// Returns the effective context/instruction to inject back into execution.
pub fn apply_resume_mode(
    mode: &ResumeMode,
    human_response: &str,
) -> ResumeContext {
    match mode {
        ResumeMode::ContinueCurrentNode => {
            app_log!("RECOVERY_BRIDGE", "Resume: ContinueCurrentNode");
            ResumeContext {
                resume_type: "continue_current".into(),
                inject_content: human_response.to_string(),
                rollback_to_node: None,
                skip_to_substep: None,
            }
        }
        ResumeMode::ResumeFromSubstep(step_id) => {
            app_log!("RECOVERY_BRIDGE", "Resume: ResumeFromSubstep({})", step_id);
            ResumeContext {
                resume_type: "resume_substep".into(),
                inject_content: human_response.to_string(),
                rollback_to_node: None,
                skip_to_substep: Some(step_id.clone()),
            }
        }
        ResumeMode::RollbackAndRetry(node_id) => {
            app_log!("RECOVERY_BRIDGE", "Resume: RollbackAndRetry({})", node_id);
            ResumeContext {
                resume_type: "rollback_retry".into(),
                inject_content: human_response.to_string(),
                rollback_to_node: Some(node_id.clone()),
                skip_to_substep: None,
            }
        }
    }
}

/// The output of apply_resume_mode — consumed by the caller (react_loop or workflow engine).
#[derive(Debug, Clone)]
pub struct ResumeContext {
    pub resume_type: String,
    pub inject_content: String,
    pub rollback_to_node: Option<String>,
    pub skip_to_substep: Option<String>,
}
