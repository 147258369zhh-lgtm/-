use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Human Layer — Trace Recorder
// Records unified ActionTrace for all action types:
//   AgentThought / ToolCall / ToolResult / UiAction / HumanAction
//   / SystemDecision / RecoveryAction
//
// This is first-class data — not a log. Enables:
//   - Frontend full execution timeline
//   - Failure attribution
//   - Teaching pattern extraction  
//   - Audit and replay
// ═══════════════════════════════════════════════════════════════

pub async fn record_trace(trace: &ActionTrace, pool: &SqlitePool) {
    ensure_schema(pool).await;

    let kind_str = format!("{:?}", trace.action_kind);
    let payload = serde_json::to_string(&trace.payload).unwrap_or("{}".into());

    let _ = sqlx::query(
        "INSERT INTO action_traces
         (id, session_id, run_id, workflow_run_id, action_kind, actor, description, payload, success, timestamp)
         VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .bind(&trace.trace_id)
    .bind(&trace.session_id)
    .bind(&trace.run_id)
    .bind(&trace.workflow_run_id)
    .bind(&kind_str)
    .bind(&trace.actor)
    .bind(&trace.description)
    .bind(&payload)
    .bind(trace.success.map(|s| s as i64))
    .bind(&trace.timestamp)
    .execute(pool).await;

    app_log!("TRACE", "[{:?}] {} — {}", trace.action_kind, trace.actor, crate::logger::safe_truncate(&trace.description, 60));
}

pub async fn record_agent_thought(
    run_id: &str, session_id: &str, thought: &str,
) -> ActionTrace {
    ActionTrace::new(
        session_id, run_id, None,
        ActionKind::AgentThought,
        "agent", thought,
        serde_json::json!({"text": thought}),
        Some(true),
    )
}

pub async fn record_tool_call(
    run_id: &str, session_id: &str,
    tool_name: &str, args: &serde_json::Value,
) -> ActionTrace {
    ActionTrace::new(
        session_id, run_id, None,
        ActionKind::ToolCall,
        tool_name, &format!("call {}", tool_name),
        args.clone(),
        None, // success unknown until result
    )
}

pub async fn record_tool_result(
    run_id: &str, session_id: &str,
    tool_name: &str, result: &str, success: bool,
) -> ActionTrace {
    ActionTrace::new(
        session_id, run_id, None,
        ActionKind::ToolResult,
        tool_name, &format!("result from {}", tool_name),
        serde_json::json!({"content": crate::logger::safe_truncate(&result, 500)}),
        Some(success),
    )
}

pub async fn record_human_action(
    run_id: &str, session_id: &str,
    workflow_run_id: Option<&str>,
    operator: &str, description: &str,
    payload: serde_json::Value,
) -> ActionTrace {
    ActionTrace::new(
        session_id, run_id, workflow_run_id,
        ActionKind::HumanAction,
        operator, description,
        payload,
        Some(true),
    )
}

pub async fn record_recovery(
    run_id: &str, session_id: &str,
    resume_mode: &str, description: &str,
) -> ActionTrace {
    ActionTrace::new(
        session_id, run_id, None,
        ActionKind::RecoveryAction,
        "system", description,
        serde_json::json!({"resume_mode": resume_mode}),
        None,
    )
}

/// Get full trace for a run (for replay/debug)
pub async fn get_run_traces(run_id: &str, pool: &SqlitePool) -> Vec<serde_json::Value> {
    ensure_schema(pool).await;
    let rows: Vec<(String, String, String, String, String, Option<i64>, String)> = sqlx::query_as(
        "SELECT id, action_kind, actor, description, payload, success, timestamp
         FROM action_traces WHERE run_id=? ORDER BY timestamp"
    ).bind(run_id).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, kind, actor, desc, payload, success, ts)| {
        serde_json::json!({
            "trace_id": id,
            "kind": kind,
            "actor": actor,
            "description": desc,
            "payload": payload,
            "success": success,
            "timestamp": ts,
        })
    }).collect()
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS action_traces (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            run_id TEXT,
            workflow_run_id TEXT,
            action_kind TEXT NOT NULL,
            actor TEXT,
            description TEXT,
            payload TEXT,
            success INTEGER,
            timestamp TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;

    // Index for fast run-level retrieval
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_traces_run ON action_traces(run_id)"
    ).execute(pool).await;
}
