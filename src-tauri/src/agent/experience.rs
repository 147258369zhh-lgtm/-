use super::types::*;
use crate::app_log;
use crate::db::DbPool;
use serde_json;

// ═══════════════════════════════════════════════
// Experience System — Agent 经验记忆
// ═══════════════════════════════════════════════

/// Ensure the experience table exists
pub async fn ensure_experience_table(pool: &DbPool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_experiences (
            id TEXT PRIMARY KEY,
            task_summary TEXT NOT NULL,
            intent TEXT NOT NULL,
            plan_json TEXT,
            tools_used TEXT,
            success INTEGER NOT NULL DEFAULT 0,
            score_accuracy INTEGER DEFAULT 0,
            score_efficiency INTEGER DEFAULT 0,
            score_tool_usage INTEGER DEFAULT 0,
            failure_reason TEXT,
            created_at TEXT NOT NULL
        )"
    ).execute(pool).await;

    // Index for fast similarity search
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_exp_intent ON agent_experiences(intent)"
    ).execute(pool).await;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_exp_success ON agent_experiences(success)"
    ).execute(pool).await;
}

/// Save an experience after task execution
pub async fn save_experience(pool: &DbPool, exp: &Experience) {
    let tools_json = serde_json::to_string(&exp.tools_used).unwrap_or_default();
    let intent_str = serde_json::to_string(&exp.intent)
        .unwrap_or_else(|_| "\"unknown\"".to_string());

    let result = sqlx::query(
        "INSERT OR REPLACE INTO agent_experiences
         (id, task_summary, intent, plan_json, tools_used, success,
          score_accuracy, score_efficiency, score_tool_usage,
          failure_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&exp.id)
    .bind(&exp.task_summary)
    .bind(&intent_str)
    .bind(&exp.plan_json)
    .bind(&tools_json)
    .bind(exp.success as i32)
    .bind(exp.score.accuracy as i32)
    .bind(exp.score.efficiency as i32)
    .bind(exp.score.tool_usage as i32)
    .bind(exp.failure_reason.as_deref())
    .bind(&exp.created_at)
    .execute(pool)
    .await;

    match result {
        Ok(_) => app_log!("EXPERIENCE", "Saved experience: {} (success={})", exp.id, exp.success),
        Err(e) => app_log!("EXPERIENCE", "Failed to save experience: {}", e),
    }
}

/// Search for similar past experiences by intent and keywords
pub async fn search_similar(
    pool: &DbPool,
    intent: &TaskIntent,
    keywords: &[String],
    limit: u32,
) -> Vec<Experience> {
    let intent_str = serde_json::to_string(intent)
        .unwrap_or_else(|_| "\"unknown\"".to_string());

    // First: find by same intent, ordered by success and recency
    let rows = sqlx::query_as::<_, ExperienceRow>(
        "SELECT id, task_summary, intent, plan_json, tools_used, success,
                score_accuracy, score_efficiency, score_tool_usage,
                failure_reason, created_at
         FROM agent_experiences
         WHERE intent = ?
         ORDER BY success DESC, created_at DESC
         LIMIT ?"
    )
    .bind(&intent_str)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut results: Vec<Experience> = rows.into_iter()
        .map(|r| r.into_experience())
        .collect();

    // Boost results that have keyword overlap
    if !keywords.is_empty() {
        results.sort_by(|a, b| {
            let score_a = keyword_overlap_score(&a.task_summary, keywords);
            let score_b = keyword_overlap_score(&b.task_summary, keywords);
            score_b.cmp(&score_a)
        });
    }

    app_log!("EXPERIENCE", "Found {} similar experiences for {:?}", results.len(), intent);
    results
}

/// Get the best successful plan for a given intent
pub async fn get_best_plan(pool: &DbPool, intent: &TaskIntent) -> Option<String> {
    let intent_str = serde_json::to_string(intent)
        .unwrap_or_else(|_| "\"unknown\"".to_string());

    let row = sqlx::query_scalar::<_, String>(
        "SELECT plan_json FROM agent_experiences
         WHERE intent = ? AND success = 1 AND plan_json IS NOT NULL
         ORDER BY (score_accuracy + score_efficiency + score_tool_usage) DESC,
                  created_at DESC
         LIMIT 1"
    )
    .bind(&intent_str)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if row.is_some() {
        app_log!("EXPERIENCE", "Found best plan for {:?}", intent);
    }
    row
}

/// Score execution for experience recording
pub fn score_execution(
    completed_steps: &[PlanStep],
    total_steps: usize,
    failure_count: u32,
    tools_used: &[String],
    expected_tools: &[String],
) -> AgentScore {
    // Accuracy: how many steps completed
    let completion_rate = if total_steps > 0 {
        (completed_steps.len() as f32 / total_steps as f32 * 10.0) as u8
    } else { 0 };

    // Efficiency: penalize failures
    let efficiency = if failure_count == 0 { 10 }
        else if failure_count == 1 { 7 }
        else if failure_count == 2 { 5 }
        else { 3 };

    // Tool usage: did the agent use the right tools?
    let tool_match = if expected_tools.is_empty() { 5 } else {
        let matched = tools_used.iter()
            .filter(|t| expected_tools.contains(t))
            .count();
        ((matched as f32 / expected_tools.len().max(1) as f32) * 10.0) as u8
    };

    AgentScore {
        accuracy: completion_rate.min(10),
        efficiency: efficiency.min(10) as u8,
        tool_usage: tool_match.min(10),
    }
}

// ───────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────

fn keyword_overlap_score(text: &str, keywords: &[String]) -> usize {
    keywords.iter().filter(|kw| text.contains(kw.as_str())).count()
}

/// SQLite row mapping
#[derive(Debug, sqlx::FromRow)]
struct ExperienceRow {
    id: String,
    task_summary: String,
    intent: String,
    plan_json: Option<String>,
    tools_used: Option<String>,
    success: i32,
    score_accuracy: i32,
    score_efficiency: i32,
    score_tool_usage: i32,
    failure_reason: Option<String>,
    created_at: String,
}

impl ExperienceRow {
    fn into_experience(self) -> Experience {
        let intent: TaskIntent = serde_json::from_str(&self.intent)
            .unwrap_or(TaskIntent::Unknown);
        let tools: Vec<String> = self.tools_used
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        Experience {
            id: self.id,
            task_summary: self.task_summary,
            intent,
            plan_json: self.plan_json.unwrap_or_default(),
            tools_used: tools,
            success: self.success != 0,
            score: AgentScore {
                accuracy: self.score_accuracy as u8,
                efficiency: self.score_efficiency as u8,
                tool_usage: self.score_tool_usage as u8,
            },
            failure_reason: self.failure_reason,
            created_at: self.created_at,
        }
    }
}

// ═══════════════════════════════════════════════
// v4: Phase 3 — Experience 强约束
// ═══════════════════════════════════════════════

/// 3.3 获取历史失败工具列表（用于 planner 黑名单注入）
/// 返回 (tool_name, failure_reason) 对
pub async fn get_failed_tools(
    pool: &DbPool,
    intent: &TaskIntent,
) -> Vec<(String, String)> {
    let intent_str = serde_json::to_string(intent)
        .unwrap_or_else(|_| "\"unknown\"".to_string());

    // 查找同 intent 下最近失败的经验
    let rows = sqlx::query_as::<_, ExperienceRow>(
        "SELECT id, task_summary, intent, plan_json, tools_used, success,
                score_accuracy, score_efficiency, score_tool_usage,
                failure_reason, created_at
         FROM agent_experiences
         WHERE intent = ? AND success = 0
         ORDER BY created_at DESC
         LIMIT 5"
    )
    .bind(&intent_str)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut failed_tools: Vec<(String, String)> = Vec::new();

    for row in rows {
        let exp = row.into_experience();
        let reason = exp.failure_reason.unwrap_or_else(|| "未知原因".into());
        for tool in &exp.tools_used {
            if !failed_tools.iter().any(|(t, _)| t == tool) {
                failed_tools.push((tool.clone(), reason.clone()));
            }
        }
    }

    if !failed_tools.is_empty() {
        app_log!("EXPERIENCE", "Found {} historically failed tools for {:?}",
            failed_tools.len(), intent);
    }
    failed_tools
}

