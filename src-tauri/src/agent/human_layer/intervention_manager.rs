use crate::agent::types::*;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Human Layer — Intervention Manager
// Central dispatcher: routes all human requests, emits the
// complete lifecycle event stream (requested→started→completed→resumed).
// Delegates to teaching.rs or correction.rs based on gate type.
// ═══════════════════════════════════════════════════════════════

pub async fn open_gate(
    run_id: &str,
    gate_type: HumanGateType,
    prompt: &str,
    context: Option<String>,
    pool: &SqlitePool,
    app: &AppHandle,
) -> HumanIntervention {
    let mut iv = HumanIntervention::new(run_id, gate_type, prompt);
    iv.context = context;

    save_intervention(&iv, pool).await;

    // Phase 1: full lifecycle events
    emit_human_event(app, "human_intervention_requested", &iv);
    emit_needs_human_block(app, &iv);

    app_log!("INTERVENTION_MGR", "Opened {:?} for run={}", iv.gate_type, run_id);
    iv
}

pub async fn resolve_gate(
    intervention_id: &str,
    response: &str,
    pool: &SqlitePool,
    app: &AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE agent_human_gates SET response=?, resolved=1 WHERE id=?")
        .bind(response).bind(intervention_id)
        .execute(pool).await
        .map_err(|e| format!("DB update failed: {e}"))?;

    // Emit: human_input_received (human done, but system not yet resumed)
    let _ = app.emit("human-lifecycle", serde_json::json!({
        "type": "human_input_received",
        "intervention_id": intervention_id,
        "response_preview": crate::logger::safe_truncate(&response, 100),
    }));

    // Signal the parked async waiter in recovery_bridge
    let _ = app.emit("human-gate-resolved", serde_json::json!({
        "intervention_id": intervention_id,
        "response": response,
    }));

    app_log!("INTERVENTION_MGR", "Resolved {}", crate::logger::safe_truncate(&intervention_id, 8));
    Ok(())
}

pub async fn emit_resumed(app: &AppHandle, run_id: &str, intervention_id: &str) {
    // "resumed_after_human" ≠ "human_completed"
    // Human done ≠ system running again successfully
    let _ = app.emit("human-lifecycle", serde_json::json!({
        "type": "resumed_after_human",
        "run_id": run_id,
        "intervention_id": intervention_id,
    }));
}

pub async fn emit_recovery_failed(app: &AppHandle, run_id: &str, reason: &str) {
    let _ = app.emit("human-lifecycle", serde_json::json!({
        "type": "recovery_failed_after_human",
        "run_id": run_id,
        "reason": reason,
    }));
}

pub async fn list_pending_interventions(pool: &SqlitePool) -> Vec<HumanIntervention> {
    let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT id, run_id, gate_type, prompt, context FROM agent_human_gates WHERE resolved=0 ORDER BY created_at"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, run_id, gt, prompt, ctx)| HumanIntervention {
        intervention_id: id, run_id,
        gate_type: parse_gate(&gt), prompt, context: ctx,
        response: None, resolved: false, created_at: String::new(),
    }).collect()
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_human_gates (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            gate_type TEXT NOT NULL,
            prompt TEXT NOT NULL,
            context TEXT,
            response TEXT,
            resolved INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}

// ─── Internal ────────────────────────────────────────────────────

async fn save_intervention(iv: &HumanIntervention, pool: &SqlitePool) {
    let _ = sqlx::query(
        "INSERT INTO agent_human_gates (id,run_id,gate_type,prompt,context) VALUES (?,?,?,?,?)"
    ).bind(&iv.intervention_id).bind(&iv.run_id)
     .bind(gate_str(&iv.gate_type)).bind(&iv.prompt).bind(&iv.context)
     .execute(pool).await;
}

fn emit_human_event(app: &AppHandle, event_name: &str, iv: &HumanIntervention) {
    let _ = app.emit("human-lifecycle", serde_json::json!({
        "type": event_name,
        "intervention_id": iv.intervention_id,
        "run_id": iv.run_id,
        "gate_type": gate_str(&iv.gate_type),
        "prompt": iv.prompt,
        "timestamp": chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
    }));
}

fn emit_needs_human_block(app: &AppHandle, iv: &HumanIntervention) {
    let label = match iv.gate_type {
        HumanGateType::TeachingRequired   => "⏸️ 需要人工示教",
        HumanGateType::CorrectionRequired => "⏸️ 需要人工校正",
        HumanGateType::LoginRequired      => "⏸️ 需要人工登录",
        HumanGateType::ApprovalRequired   => "⏸️ 需要人工审批",
        HumanGateType::InputRequired      => "⏸️ 需要人工输入",
        HumanGateType::ReviewRequired     => "⏸️ 需要人工复核",
    };
    let _ = app.emit("agent-event", AgentEvent {
        event_type: "needs_human".into(),
        step: Some(AgentStep {
            round: 0, step_type: "needs_human".into(),
            tool_name: None, tool_args: None, tool_result: None,
            content: Some(format!("{}: {}", label, iv.prompt)),
            duration_ms: None,
        }),
        message: Some(iv.intervention_id.clone()),
    });
}

fn gate_str(g: &HumanGateType) -> &'static str {
    match g {
        HumanGateType::LoginRequired      => "login_required",
        HumanGateType::TeachingRequired   => "teaching_required",
        HumanGateType::CorrectionRequired => "correction_required",
        HumanGateType::ApprovalRequired   => "approval_required",
        HumanGateType::InputRequired      => "input_required",
        HumanGateType::ReviewRequired     => "review_required",
    }
}

fn parse_gate(s: &str) -> HumanGateType {
    match s {
        "login_required"      => HumanGateType::LoginRequired,
        "teaching_required"   => HumanGateType::TeachingRequired,
        "correction_required" => HumanGateType::CorrectionRequired,
        "approval_required"   => HumanGateType::ApprovalRequired,
        "input_required"      => HumanGateType::InputRequired,
        _                     => HumanGateType::ReviewRequired,
    }
}
