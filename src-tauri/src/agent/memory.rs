use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Agent V5 — Memory System
// Dual-layer memory:
//   Short-term: SessionState.messages (in-memory, context window)
//   Long-term:  SQLite `agent_experiences` table (persistent)
// ═══════════════════════════════════════════════════════════════

// ─── Schema ───────────────────────────────────────────────────────

pub async fn ensure_schema(pool: &sqlx::SqlitePool) {
    // Experience log
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_experiences (
            id TEXT PRIMARY KEY,
            goal TEXT NOT NULL,
            tool_sequence TEXT,
            success INTEGER NOT NULL DEFAULT 0,
            rounds INTEGER NOT NULL DEFAULT 0,
            final_answer TEXT,
            tags TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;

    // Blueprint table (V2 schema with complexity + tags)
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_blueprints (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            persona TEXT,
            goal_template TEXT,
            workflow_json TEXT,
            complexity INTEGER DEFAULT 1,
            tags TEXT DEFAULT '[]',
            version TEXT DEFAULT '2.0',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;

    // Add new columns if upgrading from V1 (ignore errors)
    let _ = sqlx::query("ALTER TABLE agent_blueprints ADD COLUMN complexity INTEGER DEFAULT 1")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE agent_blueprints ADD COLUMN tags TEXT DEFAULT '[]'")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE agent_blueprints ADD COLUMN version TEXT DEFAULT '2.0'")
        .execute(pool).await;
}

// ─── Save Experience (Long-term Memory) ───────────────────────────

/// Called when a ReAct session completes. Persists the session
/// outcome so it can be retrieved as few-shot context in future runs.
pub async fn save_experience(
    session: &SessionState,
    final_answer: &str,
    pool: &sqlx::SqlitePool,
) {
    // Extract which tools were called (in order)
    let tool_sequence: Vec<String> = session.messages.iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .filter_map(|m| m.tool_calls.as_ref())
        .flat_map(|calls| calls.iter().map(|c| c.function.name.clone()))
        .collect();

    let id = uuid::Uuid::new_v4().to_string();
    let tool_seq_str = tool_sequence.join(",");
    let tags = extract_tags(&session.goal, &tool_sequence);
    let tags_str = serde_json::to_string(&tags).unwrap_or("[]".into());
    let success = if final_answer.contains("失败") || final_answer.contains("error") { 0i64 } else { 1i64 };

    let _ = sqlx::query(
        "INSERT INTO agent_experiences (id, goal, tool_sequence, success, rounds, final_answer, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&session.goal)
    .bind(&tool_seq_str)
    .bind(success)
    .bind(session.round as i64)
    .bind(crate::logger::safe_truncate(&final_answer, 1000))
    .bind(&tags_str)
    .execute(pool).await;

    app_log!("MEMORY", "Saved experience {} (success={}, rounds={}, tools={})",
             &id[..8], success, session.round, tool_sequence.len());
}

// ─── Retrieve Similar Experiences (Few-shot hints) ────────────────

/// Retrieve up to 3 recent successful experiences that share tags with `goal`.
/// Returns a formatted string suitable for injection into the system prompt.
pub async fn retrieve_similar(goal: &str, pool: &sqlx::SqlitePool) -> Option<String> {
    let rows: Vec<(String, String, String, i64)> = sqlx::query_as(
        "SELECT goal, tool_sequence, final_answer, rounds
         FROM agent_experiences
         WHERE success = 1
         ORDER BY created_at DESC
         LIMIT 5"
    )
    .fetch_all(pool).await.ok()?;

    if rows.is_empty() {
        return None;
    }

    // Simple keyword overlap to find relevant ones
    let goal_words: std::collections::HashSet<&str> = goal.split_whitespace().collect();
    let mut scored: Vec<(usize, &(String, String, String, i64))> = rows.iter()
        .map(|r| {
            let row_words: std::collections::HashSet<&str> = r.0.split_whitespace().collect();
            let overlap = goal_words.intersection(&row_words).count();
            (overlap, r)
        })
        .filter(|(score, _)| *score > 0)
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));

    let top3: Vec<String> = scored.into_iter().take(3).map(|(_, r)| {
        format!("- 目标: {}\n  工具链: {}\n  用时: {} 轮", r.0, r.1, r.3)
    }).collect();

    if top3.is_empty() {
        None
    } else {
        Some(top3.join("\n"))
    }
}

// ─── List Experiences for Frontend ────────────────────────────────

pub async fn list_experiences(pool: &sqlx::SqlitePool) -> Vec<ExperienceInfo> {
    let rows: Vec<(String, String, i64, i64, String)> = sqlx::query_as(
        "SELECT id, goal, success, rounds, created_at FROM agent_experiences ORDER BY created_at DESC LIMIT 50"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, goal, success, rounds, created_at)| {
        ExperienceInfo {
            id,
            task_summary: goal.chars().take(80).collect(),
            intent: "task".into(),
            success: success == 1,
            score: ExperienceScore {
                accuracy: if success == 1 { 1.0 } else { 0.0 },
                efficiency: (1.0 / rounds.max(1) as f32).min(1.0),
                tool_usage: 0.8,
            },
            created_at,
        }
    }).collect()
}

// ─── Internal Helpers ─────────────────────────────────────────────

fn extract_tags(goal: &str, tools: &[String]) -> Vec<String> {
    let mut tags = vec![];
    if tools.iter().any(|t| t.contains("word") || t.contains("file")) { tags.push("文档".into()); }
    if tools.iter().any(|t| t.contains("excel")) { tags.push("数据".into()); }
    if tools.iter().any(|t| t.contains("ppt")) { tags.push("演示".into()); }
    if tools.iter().any(|t| t.contains("web") || t.contains("scrape")) { tags.push("网络".into()); }
    if tools.iter().any(|t| t.contains("shell")) { tags.push("系统".into()); }
    if goal.contains("报告") || goal.contains("分析") { tags.push("报告".into()); }
    if goal.contains("通信") || goal.contains("项目") { tags.push("通信项目".into()); }
    tags
}
