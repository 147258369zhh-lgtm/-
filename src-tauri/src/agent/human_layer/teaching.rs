use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;
use super::trace_recorder;

// ═══════════════════════════════════════════════════════════════
// Human Layer — Teaching
// Handles human demonstrations that teach the system new capabilities.
// Goal: "Human shows once → system records → pattern can be reused"
//
// Phase 1: Record, store, emit
// Phase 2: Abstract, parameterize, promote to ReusablePattern
// ═══════════════════════════════════════════════════════════════

/// Begin a teaching session — creates the session record and emits the
/// waiting_human_teaching event so the frontend shows the teaching UI.
pub async fn begin_teaching_session(
    run_id: &str,
    objective: &str,
    context_snapshot: Option<String>,
    pool: &SqlitePool,
) -> HumanTeachingSession {
    let session = HumanTeachingSession {
        session_id: uuid::Uuid::new_v4().to_string(),
        run_id: run_id.to_string(),
        objective: objective.to_string(),
        preconditions: context_snapshot.clone(),
        action_sequence: vec![],
        variable_fields: vec![],
        stable_anchors: vec![],
        risk_points: vec![],
        reusable: false,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        completed_at: None,
        promoted_to_pattern_id: None,
    };

    save_teaching_session(&session, pool).await;
    app_log!("TEACHING", "Session {} started for run={}", &session.session_id[..8], run_id);
    session
}

/// Complete a teaching session: record the human's action trace and
/// store the result. In Phase 2 this will trigger pattern extraction.
pub async fn complete_teaching_session(
    session_id: &str,
    trace: ActionTrace,
    pool: &SqlitePool,
) -> Result<(), String> {
    // Record the action trace
    trace_recorder::record_trace(&trace, pool).await;

    // Update session as complete
    let _ = sqlx::query(
        "UPDATE agent_teaching_sessions SET completed = 1, trace_id = ? WHERE id = ?"
    )
    .bind(&trace.trace_id)
    .bind(session_id)
    .execute(pool).await;

    app_log!("TEACHING", "Session {} completed, trace={}", crate::logger::safe_truncate(&session_id, 8), crate::logger::safe_truncate(&trace.trace_id, 8));

    // Phase 2 hook: pattern extraction
    // TODO: analyze trace → produce ReusablePattern
    Ok(())
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_teaching_sessions (
            id TEXT PRIMARY KEY,
            run_id TEXT,
            objective TEXT NOT NULL,
            preconditions TEXT,
            trace_id TEXT,
            reusable INTEGER DEFAULT 0,
            promoted_to_pattern_id TEXT,
            completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}

async fn save_teaching_session(s: &HumanTeachingSession, pool: &SqlitePool) {
    let _ = sqlx::query(
        "INSERT INTO agent_teaching_sessions (id, run_id, objective, preconditions) VALUES (?,?,?,?)"
    )
    .bind(&s.session_id).bind(&s.run_id).bind(&s.objective).bind(&s.preconditions)
    .execute(pool).await;
}
