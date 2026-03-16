use super::types::PlanStep;

// ═══════════════════════════════════════════════
// Memory Engine — persists agent state to SQLite
// ═══════════════════════════════════════════════

/// Save a message to agent_memory
pub async fn save_memory(
    pool: &sqlx::SqlitePool,
    task_id: &str,
    round: u32,
    role: &str,
    content: Option<&str>,
    tool_call_id: Option<&str>,
    tool_name: Option<&str>,
) {
    let _ = sqlx::query(
        "INSERT INTO agent_memory (id, task_id, round, role, content, tool_call_id, tool_name) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(task_id)
    .bind(round)
    .bind(role)
    .bind(content)
    .bind(tool_call_id)
    .bind(tool_name)
    .execute(pool)
    .await;
}

/// Update working memory key-value
pub async fn update_working_memory(pool: &sqlx::SqlitePool, task_id: &str, key: &str, value: &str) {
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO agent_working_memory (id, task_id, key, value) VALUES (?, ?, ?, ?)",
    )
    .bind(format!("{}_{}", task_id, key))
    .bind(task_id)
    .bind(key)
    .bind(value)
    .execute(pool)
    .await;
}

/// Update task status
pub async fn update_task_status(
    pool: &sqlx::SqlitePool,
    task_id: &str,
    status: &str,
    current_step: u32,
    final_result: Option<&str>,
) {
    let _ = sqlx::query(
        "UPDATE agent_tasks SET status = ?, current_step = ?, final_result = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(status).bind(current_step).bind(final_result).bind(task_id)
    .execute(pool).await;
}

/// Save a plan step result to agent_steps
pub async fn save_step_result(pool: &sqlx::SqlitePool, task_id: &str, step: &PlanStep) {
    let status_str = match step.status {
        super::types::StepStatus::Pending => "pending",
        super::types::StepStatus::Running => "running",
        super::types::StepStatus::Done => "done",
        super::types::StepStatus::Failed => "failed",
    };
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO agent_steps (id, task_id, step_index, task, status, result, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    )
    .bind(format!("{}_{}", task_id, step.id))
    .bind(task_id)
    .bind(step.id)
    .bind(&step.task)
    .bind(status_str)
    .bind(step.result.as_deref())
    .execute(pool)
    .await;
}

/// Save plan JSON to agent_plans
pub async fn save_plan(pool: &sqlx::SqlitePool, task_id: &str, plan_json: &str) {
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO agent_plans (task_id, plan_json, created_at) VALUES (?, ?, datetime('now'))"
    )
    .bind(task_id)
    .bind(plan_json)
    .execute(pool)
    .await;
}

/// Summarize completed steps into a final answer
pub fn summarize_results(completed: &[PlanStep]) -> String {
    completed
        .iter()
        .filter_map(|s| {
            s.result
                .as_ref()
                .map(|r| format!("{}. {} → {}", s.id, s.task, r))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Ensure new v2 tables exist
pub async fn ensure_v2_tables(pool: &sqlx::SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_steps (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            step_index INTEGER NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(task_id, step_index)
        )",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_plans (
            task_id TEXT PRIMARY KEY,
            plan_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await;
}
