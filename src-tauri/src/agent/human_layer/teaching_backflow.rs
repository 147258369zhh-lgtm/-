use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Human Layer — Teaching Backflow
//
// Completes the teaching loop:
//   HumanTeachingSession → ActionTrace
//     → ReusablePattern extraction
//       → Blueprint patch candidate  (sub-flow template)
//       → SkillNode candidate        (new standalone skill)
//
// This is the path by which human demonstrations become
// reusable, version-controlled assets — NOT just recordings.
// ═══════════════════════════════════════════════════════════════

/// Attempt to extract a ReusablePattern from a completed teaching session.
/// This is the Phase 1 extraction: structural + goal-based pattern.
/// Phase 2 would use LLM to generalize parameters.
pub async fn extract_pattern_from_teaching(
    session: &HumanTeachingSession,
    traces: &[ActionTrace],
    pool: &SqlitePool,
) -> Option<ReusablePattern> {
    if traces.is_empty() || session.completed_at.is_none() {
        app_log!("TEACHING_BACKFLOW", "Session {} not complete or no traces", &session.session_id[..8]);
        return None;
    }

    // Build the action sequence from human action traces
    let human_actions: Vec<_> = traces.iter()
        .filter(|t| matches!(t.action_kind, ActionKind::HumanAction | ActionKind::UiAction))
        .collect();

    if human_actions.is_empty() {
        app_log!("TEACHING_BACKFLOW", "No human actions found in session {}", &session.session_id[..8]);
        return None;
    }

    // Construct a ReusablePattern from the teaching session
    let steps: Vec<serde_json::Value> = human_actions.iter().map(|t| {
        serde_json::json!({
            "kind": format!("{:?}", t.action_kind),
            "tool": t.actor,
            "summary": t.description,
            "duration_ms": 0,
        })
    }).collect();

    let tool_names: Vec<String> = human_actions.iter()
        .map(|t| t.actor.clone())
        .filter(|s| !s.is_empty() && s != "human")
        .collect();

    let pattern = ReusablePattern {
        pattern_id: uuid::Uuid::new_v4().to_string(),
        name: format!("Pattern from: {}", &session.objective[..session.objective.len().min(40)]),
        description: session.objective.clone(),
        objective: session.objective.clone(),
        preconditions: vec![],
        key_steps: session.action_sequence.clone(),
        variable_params: vec![],
        stable_anchors: vec![],
        risk_points: vec![],
        applicable_scope: "general".into(),
        source_session_id: session.session_id.clone(),
        extracted_from_session_id: Some(session.session_id.clone()),
        applicable_tool_names: tool_names,
        action_sequence: steps,
        trigger_condition: session.preconditions.clone(),
        confidence: compute_confidence(human_actions.len(), session),
        version: 1,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    save_pattern(&pattern, pool).await;

    app_log!("TEACHING_BACKFLOW",
             "Extracted pattern '{}' (confidence={:.2}) from session {}",
             &pattern.name, pattern.confidence, &session.session_id[..8]);

    Some(pattern)
}

/// Promote a ReusablePattern into a Blueprint patch candidate.
/// The candidate suggests adding a new sub-flow or node to an existing Blueprint.
pub async fn promote_pattern_to_blueprint_candidate(
    pattern: &ReusablePattern,
    target_blueprint_id: Option<&str>,
    pool: &SqlitePool,
) -> AssetRevisionCandidate {
    let candidate = AssetRevisionCandidate {
        candidate_id: uuid::Uuid::new_v4().to_string(),
        source_blueprint_id: target_blueprint_id.unwrap_or("new").to_string(),
        source_version: "pending".to_string(),
        triggered_by_correction_id: None,
        triggered_by_teaching_id: Some(pattern.pattern_id.clone()),
        suggested_changes: vec![
            format!("Add sub-flow from teaching: '{}'", pattern.name),
            format!("Steps: {}", pattern.action_sequence.len()),
            format!("Confidence: {:.2}", pattern.confidence),
            format!("Trigger: {}", pattern.trigger_condition.as_deref().unwrap_or("any")),
        ],
        status: "pending_review".to_string(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    // Persist candidate
    let changes_json = serde_json::to_string(&candidate.suggested_changes).unwrap_or("[]".into());
    let _ = sqlx::query(
        "INSERT INTO asset_revision_candidates
         (id, blueprint_id, source_version, teaching_id, changes_json, status, created_at)
         VALUES (?,?,?,?,?,?,?)"
    )
    .bind(&candidate.candidate_id)
    .bind(&candidate.source_blueprint_id)
    .bind(&candidate.source_version)
    .bind(&pattern.pattern_id)
    .bind(&changes_json)
    .bind(&candidate.status)
    .bind(&candidate.created_at)
    .execute(pool).await;

    app_log!("TEACHING_BACKFLOW",
             "Blueprint patch candidate {} from pattern '{}'",
             &candidate.candidate_id[..8], &pattern.name);

    candidate
}

/// Promote a ReusablePattern into a SkillNode candidate.
/// A SkillNode candidate becomes a new standalone skill in the Tool Platform.
pub async fn promote_pattern_to_skill_candidate(
    pattern: &ReusablePattern,
    pool: &SqlitePool,
) -> serde_json::Value {
    let candidate_id = uuid::Uuid::new_v4().to_string();
    let skill_spec = serde_json::json!({
        "candidate_id": &candidate_id,
        "kind": "skill_node_candidate",
        "name": pattern.name,
        "description": pattern.description,
        "trigger_condition": pattern.trigger_condition,
        "steps": pattern.action_sequence,
        "applicable_tools": pattern.applicable_tool_names,
        "confidence": pattern.confidence,
        "source_pattern_id": pattern.pattern_id,
        "status": "pending_review",
        "created_at": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    });

    // Register as a tool candidate in tool_platform
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO tool_registry
         (tool_name, display_name, description, category, enabled, version, created_at)
         VALUES (?, ?, ?, 'human_delegate', 0, '0.1-candidate', CURRENT_TIMESTAMP)"
    )
    .bind(format!("skill_candidate_{}", &candidate_id[..8]))
    .bind(&pattern.name)
    .bind(&pattern.description)
    .execute(pool).await;

    app_log!("TEACHING_BACKFLOW",
             "SkillNode candidate '{}' registered (pending review)",
             &pattern.name);

    skill_spec
}

// ─── Full backflow pipeline ───────────────────────────────────────

/// Run the full teaching backflow pipeline:
/// session + traces → pattern → blueprint_candidate + skill_candidate
pub async fn run_teaching_backflow(
    session: &HumanTeachingSession,
    traces: &[ActionTrace],
    target_blueprint_id: Option<&str>,
    pool: &SqlitePool,
) {
    let pattern = match extract_pattern_from_teaching(session, traces, pool).await {
        Some(p) => p,
        None => {
            app_log!("TEACHING_BACKFLOW", "No pattern extracted from session {}", &session.session_id[..8]);
            return;
        }
    };

    // Two paths: patch existing blueprint or create a new skill candidate
    if let Some(_bp_id) = target_blueprint_id {
        promote_pattern_to_blueprint_candidate(&pattern, target_blueprint_id, pool).await;
    } else {
        promote_pattern_to_skill_candidate(&pattern, pool).await;
    }
}

// ─── DB helpers ──────────────────────────────────────────────────

async fn save_pattern(pattern: &ReusablePattern, pool: &SqlitePool) {
    ensure_schema(pool).await;
    let seq_json = serde_json::to_string(&pattern.action_sequence).unwrap_or("[]".into());
    let tools_json = serde_json::to_string(&pattern.applicable_tool_names).unwrap_or("[]".into());
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO reusable_patterns
         (id, name, description, trigger_condition, action_sequence, applicable_tools,
          extracted_from_session_id, confidence, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .bind(&pattern.pattern_id).bind(&pattern.name).bind(&pattern.description)
    .bind(&pattern.trigger_condition).bind(&seq_json).bind(&tools_json)
    .bind(&pattern.extracted_from_session_id).bind(pattern.confidence)
    .bind(&pattern.created_at)
    .execute(pool).await;
}

pub async fn list_patterns(pool: &SqlitePool) -> Vec<serde_json::Value> {
    ensure_schema(pool).await;
    let rows: Vec<(String, String, f64, String)> = sqlx::query_as(
        "SELECT id, name, confidence, created_at FROM reusable_patterns ORDER BY confidence DESC"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, name, conf, at)| {
        serde_json::json!({ "pattern_id": id, "name": name, "confidence": conf, "created_at": at })
    }).collect()
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS reusable_patterns (
            id TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            trigger_condition TEXT,
            action_sequence TEXT,
            applicable_tools TEXT,
            extracted_from_session_id TEXT,
            confidence REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}

// ─── Internals ───────────────────────────────────────────────────

fn compute_confidence(action_count: usize, session: &HumanTeachingSession) -> f64 {
    // More actions = more concrete pattern, up to a point
    let action_factor = (action_count as f64 / 10.0).min(1.0);
    // If objective is clear (long description) = higher confidence
    let desc_factor = (session.objective.len() as f64 / 100.0).min(0.5);
    // Preconditions lift confidence
    let precond_factor = if session.preconditions.is_some() { 0.2 } else { 0.0 };
    (action_factor * 0.6 + desc_factor + precond_factor).min(1.0)
}
