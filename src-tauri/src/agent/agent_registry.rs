use super::types::*;
use crate::app_log;
use crate::db::DbPool;

// ═══════════════════════════════════════════════
// Agent Registry — Agent 保存/加载/版本管理
// ═══════════════════════════════════════════════
// 唯一核心输出: AgentBlueprint (CRUD)
// 职责: 持久化 Agent 定义，支持搜索和版本管理

/// Ensure the registry table exists
pub async fn ensure_registry_table(pool: &DbPool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_blueprints (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            persona TEXT,
            goal_template TEXT,
            tool_scope_json TEXT,
            workflow_json TEXT,
            constraints_json TEXT,
            success_criteria_json TEXT,
            version TEXT DEFAULT '1.0',
            usage_count INTEGER DEFAULT 0,
            success_rate REAL DEFAULT 0.0,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )"
    ).execute(pool).await;
}

/// Save a blueprint to the registry
pub async fn save_blueprint(pool: &DbPool, bp: &AgentBlueprint) {
    let tool_scope_json = serde_json::to_string(&bp.tool_scope).unwrap_or_default();
    let workflow_json = serde_json::to_string(&bp.workflow_template).unwrap_or_default();
    let constraints_json = serde_json::to_string(&bp.constraints).unwrap_or_default();
    let criteria_json = serde_json::to_string(&bp.success_criteria).unwrap_or_default();

    let result = sqlx::query(
        "INSERT OR REPLACE INTO agent_blueprints
         (id, name, persona, goal_template, tool_scope_json, workflow_json,
          constraints_json, success_criteria_json, version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&bp.id)
    .bind(&bp.name)
    .bind(&bp.persona)
    .bind(&bp.goal_template)
    .bind(&tool_scope_json)
    .bind(&workflow_json)
    .bind(&constraints_json)
    .bind(&criteria_json)
    .bind(&bp.version)
    .bind(&bp.created_at)
    .execute(pool)
    .await;

    match result {
        Ok(_) => app_log!("REGISTRY", "Saved blueprint: {} v{}", bp.name, bp.version),
        Err(e) => app_log!("REGISTRY", "Failed to save blueprint: {}", e),
    }
}

/// Load a blueprint by ID
pub async fn load_blueprint(pool: &DbPool, id: &str) -> Option<AgentBlueprint> {
    let row = sqlx::query_as::<_, BlueprintRow>(
        "SELECT * FROM agent_blueprints WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    row.map(|r| r.into_blueprint())
}

/// List all blueprints
pub async fn list_blueprints(pool: &DbPool) -> Vec<AgentBlueprint> {
    sqlx::query_as::<_, BlueprintRow>(
        "SELECT * FROM agent_blueprints ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| r.into_blueprint())
    .collect()
}

/// Search blueprints by name
pub async fn search_blueprints(pool: &DbPool, query: &str) -> Vec<AgentBlueprint> {
    let pattern = format!("%{}%", query);
    sqlx::query_as::<_, BlueprintRow>(
        "SELECT * FROM agent_blueprints WHERE name LIKE ? OR persona LIKE ? ORDER BY usage_count DESC"
    )
    .bind(&pattern)
    .bind(&pattern)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| r.into_blueprint())
    .collect()
}

/// Increment usage count for a blueprint
pub async fn record_usage(pool: &DbPool, id: &str, success: bool) {
    let _ = sqlx::query(
        "UPDATE agent_blueprints SET usage_count = usage_count + 1 WHERE id = ?"
    ).bind(id).execute(pool).await;

    // Update success rate
    if success {
        let _ = sqlx::query(
            "UPDATE agent_blueprints SET success_rate =
             (success_rate * (usage_count - 1) + 1.0) / usage_count WHERE id = ?"
        ).bind(id).execute(pool).await;
    }
}

/// Delete a blueprint
pub async fn delete_blueprint(pool: &DbPool, id: &str) {
    let _ = sqlx::query("DELETE FROM agent_blueprints WHERE id = ?")
        .bind(id).execute(pool).await;
}

// ─── Internal ───

#[derive(Debug, sqlx::FromRow)]
struct BlueprintRow {
    id: String,
    name: String,
    persona: Option<String>,
    goal_template: Option<String>,
    tool_scope_json: Option<String>,
    workflow_json: Option<String>,
    constraints_json: Option<String>,
    success_criteria_json: Option<String>,
    version: Option<String>,
    #[allow(dead_code)]
    usage_count: Option<i64>,
    #[allow(dead_code)]
    success_rate: Option<f64>,
    created_at: String,
    #[allow(dead_code)]
    updated_at: Option<String>,
}

impl BlueprintRow {
    fn into_blueprint(self) -> AgentBlueprint {
        AgentBlueprint {
            id: self.id,
            name: self.name,
            persona: self.persona.unwrap_or_default(),
            goal_template: self.goal_template.unwrap_or_default(),
            tool_scope: self.tool_scope_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(ToolScope { included: vec![], excluded: vec![] }),
            workflow_template: self.workflow_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            constraints: self.constraints_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(ExecutionConstraints {
                    max_retries_per_step: 2,
                    max_total_failures: 3,
                    timeout_per_step_secs: 60,
                    fallback_strategy: "retry".into(),
                }),
            success_criteria: self.success_criteria_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            version: self.version.unwrap_or_else(|| "1.0".into()),
            created_at: self.created_at,
        }
    }
}
