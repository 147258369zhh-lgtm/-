use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;
use super::trace_recorder;

// ═══════════════════════════════════════════════════════════════
// Human Layer — Correction
// Handles cases where the system failed and human corrects/resumes.
// Goal: "System failed → human fixes → execution resumes → failure logged"
//
// Key difference from teaching:
//   - System ALREADY TRIED and got wrong result
//   - Human's job is to FIX and RESUME, not to demonstrate
//   - Output goes into failure case library, not pattern library
//   - reason_code is REQUIRED for every correction
// ═══════════════════════════════════════════════════════════════

/// Request a human correction for a failed step.
/// Emits waiting_human_correction event to frontend.
pub async fn request_correction(
    run_id: &str,
    node_id: Option<u32>,
    original_action: &str,
    error_result: &str,
    reason_code: CorrectionReasonCode,
    pool: &SqlitePool,
) -> HumanCorrectionRecord {
    let record = HumanCorrectionRecord {
        record_id: uuid::Uuid::new_v4().to_string(),
        run_id: run_id.to_string(),
        node_id,
        original_action: original_action.to_string(),
        error_result: error_result.to_string(),
        reason_code,
        corrected_output: None,
        corrected_action: None,
        resume_from: ResumeMode::ContinueCurrentNode,
        recovery_success: false,
        formed_new_rule: false,
        notes: None,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    save_correction_record(&record, pool).await;
    app_log!("CORRECTION", "Record {} for run={} reason={:?}",
             &record.record_id[..8], run_id, record.reason_code);
    record
}

/// Complete a correction — human has provided the fix.
/// Records what was corrected and the chosen resume mode.
pub async fn complete_correction(
    record_id: &str,
    corrected_output: String,
    corrected_action: Option<String>,
    resume_mode: ResumeMode,
    recovery_success: bool,
    formed_new_rule: bool,
    notes: Option<String>,
    trace: Option<ActionTrace>,
    pool: &SqlitePool,
) -> Result<(), String> {
    if let Some(t) = &trace {
        trace_recorder::record_trace(t, pool).await;
    }

    let resume_str = match &resume_mode {
        ResumeMode::ContinueCurrentNode    => "continue_current",
        ResumeMode::ResumeFromSubstep(_s) => "resume_substep",
        ResumeMode::RollbackAndRetry(_s)  => "rollback_retry",
    };

    let trace_id_owned = trace.as_ref().map(|t| t.trace_id.clone());
    let trace_id = trace_id_owned.as_deref().unwrap_or("");

    let _ = sqlx::query(
        "UPDATE agent_correction_records SET
         corrected_output=?, corrected_action=?, resume_mode=?,
         recovery_success=?, formed_new_rule=?, notes=?, trace_id=?, completed=1
         WHERE id=?"
    )
    .bind(&corrected_output).bind(&corrected_action).bind(resume_str)
    .bind(recovery_success as i64).bind(formed_new_rule as i64)
    .bind(&notes).bind(trace_id).bind(record_id)
    .execute(pool).await;

    app_log!("CORRECTION", "Completed {} success={} new_rule={}", crate::logger::safe_truncate(&record_id, 8), recovery_success, formed_new_rule);

    // Tool Platform feedback: record which tool required human intervention.
    // This is how CorrectionReasonCode::ToolParameterError or AgentPlanError
    // raises manual_frequency in tool_registry → eventually flags tool for upgrade.
    if let Some(t) = &trace {
        // Extract tool name from actor field (actor = tool_name for tool calls)
        let tool_name = &t.actor;
        if !tool_name.is_empty() && tool_name != "human" && tool_name != "agent" {
            crate::agent::tool_platform::registry::record_manual_intervention(tool_name, pool).await;
        }
    }

    Ok(())
}

/// List recent corrections by reason code (for analytics / tool gap analysis)
pub async fn list_by_reason(
    reason: &CorrectionReasonCode,
    limit: i64,
    pool: &SqlitePool,
) -> Vec<HumanCorrectionRecord> {
    let reason_str = format!("{:?}", reason);
    let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, run_id, original_action, error_result, reason_code
         FROM agent_correction_records WHERE reason_code = ? ORDER BY created_at DESC LIMIT ?"
    )
    .bind(&reason_str).bind(limit).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, run_id, orig, err, _reason)| {
        HumanCorrectionRecord {
            record_id: id, run_id, node_id: None,
            original_action: orig, error_result: err,
            reason_code: reason.clone(),
            corrected_output: None, corrected_action: None,
            resume_from: ResumeMode::ContinueCurrentNode,
            recovery_success: false, formed_new_rule: false,
            notes: None, created_at: String::new(),
        }
    }).collect()
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_correction_records (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            node_id INTEGER,
            original_action TEXT,
            error_result TEXT,
            reason_code TEXT NOT NULL,
            corrected_output TEXT,
            corrected_action TEXT,
            resume_mode TEXT,
            recovery_success INTEGER DEFAULT 0,
            formed_new_rule INTEGER DEFAULT 0,
            notes TEXT,
            trace_id TEXT,
            completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}

async fn save_correction_record(r: &HumanCorrectionRecord, pool: &SqlitePool) {
    let _ = sqlx::query(
        "INSERT INTO agent_correction_records (id, run_id, node_id, original_action, error_result, reason_code)
         VALUES (?,?,?,?,?,?)"
    )
    .bind(&r.record_id).bind(&r.run_id).bind(r.node_id.map(|n| n as i64))
    .bind(&r.original_action).bind(&r.error_result).bind(format!("{:?}", r.reason_code))
    .execute(pool).await;
}
