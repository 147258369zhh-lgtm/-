// ═══════════════════════════════════════════════════════
// Experience System — Action Recording & Template Learning (P3)
// Records successful/failed operations, builds reusable templates
// ═══════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::db::DbPool;

/// A recorded action template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    /// The sequence of actions (browser ops, tool calls, etc.)
    pub actions_json: String,
    /// Source: "recorded" (from user demo) or "generated" (from AI)
    pub source: String,
    /// Domain/site this template applies to
    pub domain: Option<String>,
    /// How many times used successfully
    pub success_count: u64,
    /// How many times failed
    pub failure_count: u64,
    /// Last failure reason (for debugging)
    pub last_failure_reason: Option<String>,
    /// Version (incremented on correction)
    pub version: u32,
    pub created_at: String,
    pub updated_at: String,
}

/// An experience record (success or failure case)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperienceRecord {
    pub id: String,
    pub template_id: Option<String>,
    pub task_description: String,
    /// "success" or "failure"
    pub outcome: String,
    /// The actual actions taken
    pub actions_json: String,
    /// Human correction notes (if any)
    pub correction_notes: Option<String>,
    /// Context data (URL, page state, etc.)
    pub context_json: Option<String>,
    pub created_at: String,
}

/// Persistence for the experience system
pub struct ExperiencePersistence {
    pool: DbPool,
}

impl ExperiencePersistence {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    // ── Action Templates ──

    pub async fn save_template(&self, template: &ActionTemplate) -> Result<(), String> {
        sqlx::query(
            "INSERT OR REPLACE INTO action_templates (id, name, description, actions_json, source, domain, success_count, failure_count, last_failure_reason, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&template.id)
        .bind(&template.name)
        .bind(&template.description)
        .bind(&template.actions_json)
        .bind(&template.source)
        .bind(&template.domain)
        .bind(template.success_count as i64)
        .bind(template.failure_count as i64)
        .bind(&template.last_failure_reason)
        .bind(template.version)
        .bind(&template.created_at)
        .bind(&template.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save template: {}", e))?;
        Ok(())
    }

    pub async fn list_templates(&self, domain: Option<&str>) -> Result<Vec<ActionTemplate>, String> {
        let query = if let Some(d) = domain {
            format!("SELECT id, name, description, actions_json, source, domain, success_count, failure_count, last_failure_reason, version, created_at, updated_at FROM action_templates WHERE domain = '{}' ORDER BY success_count DESC", d)
        } else {
            "SELECT id, name, description, actions_json, source, domain, success_count, failure_count, last_failure_reason, version, created_at, updated_at FROM action_templates ORDER BY success_count DESC".to_string()
        };

        let rows: Vec<(String, String, String, String, String, Option<String>, i64, i64, Option<String>, i64, String, String)> =
            sqlx::query_as(&query)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list templates: {}", e))?;

        Ok(rows.into_iter().map(|(id, name, desc, actions, source, domain, sc, fc, lfr, ver, created, updated)| {
            ActionTemplate {
                id, name, description: desc, actions_json: actions, source, domain,
                success_count: sc as u64, failure_count: fc as u64,
                last_failure_reason: lfr, version: ver as u32,
                created_at: created, updated_at: updated,
            }
        }).collect())
    }

    pub async fn get_template(&self, template_id: &str) -> Result<ActionTemplate, String> {
        let row: (String, String, String, String, String, Option<String>, i64, i64, Option<String>, i64, String, String) =
            sqlx::query_as(
                "SELECT id, name, description, actions_json, source, domain, success_count, failure_count, last_failure_reason, version, created_at, updated_at FROM action_templates WHERE id = ?"
            )
            .bind(template_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Template not found: {}", e))?;

        Ok(ActionTemplate {
            id: row.0, name: row.1, description: row.2, actions_json: row.3,
            source: row.4, domain: row.5,
            success_count: row.6 as u64, failure_count: row.7 as u64,
            last_failure_reason: row.8, version: row.9 as u32,
            created_at: row.10, updated_at: row.11,
        })
    }

    pub async fn delete_template(&self, template_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM action_templates WHERE id = ?")
            .bind(template_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete template: {}", e))?;
        Ok(())
    }

    /// Record a success → increment success count
    pub async fn record_success(&self, template_id: &str) -> Result<(), String> {
        sqlx::query("UPDATE action_templates SET success_count = success_count + 1, updated_at = datetime('now') WHERE id = ?")
            .bind(template_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to record success: {}", e))?;
        Ok(())
    }

    /// Record a failure → increment failure count + save reason
    pub async fn record_failure(&self, template_id: &str, reason: &str) -> Result<(), String> {
        sqlx::query("UPDATE action_templates SET failure_count = failure_count + 1, last_failure_reason = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(reason)
            .bind(template_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to record failure: {}", e))?;
        Ok(())
    }

    /// Apply human correction → update template + bump version
    pub async fn apply_correction(&self, template_id: &str, new_actions_json: &str) -> Result<(), String> {
        sqlx::query("UPDATE action_templates SET actions_json = ?, version = version + 1, failure_count = 0, updated_at = datetime('now') WHERE id = ?")
            .bind(new_actions_json)
            .bind(template_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to apply correction: {}", e))?;
        Ok(())
    }

    // ── Experience Records ──

    pub async fn save_experience(&self, record: &ExperienceRecord) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO experience_records (id, template_id, task_description, outcome, actions_json, correction_notes, context_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&record.id)
        .bind(&record.template_id)
        .bind(&record.task_description)
        .bind(&record.outcome)
        .bind(&record.actions_json)
        .bind(&record.correction_notes)
        .bind(&record.context_json)
        .bind(&record.created_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save experience: {}", e))?;
        Ok(())
    }

    pub async fn list_experiences(&self, limit: i64) -> Result<Vec<ExperienceRecord>, String> {
        let rows: Vec<(String, Option<String>, String, String, String, Option<String>, Option<String>, String)> =
            sqlx::query_as(
                "SELECT id, template_id, task_description, outcome, actions_json, correction_notes, context_json, created_at FROM experience_records ORDER BY created_at DESC LIMIT ?"
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list experiences: {}", e))?;

        Ok(rows.into_iter().map(|(id, tid, desc, outcome, actions, notes, ctx, created)| {
            ExperienceRecord {
                id, template_id: tid, task_description: desc, outcome,
                actions_json: actions, correction_notes: notes,
                context_json: ctx, created_at: created,
            }
        }).collect())
    }

    /// Search for similar past experiences by task description
    pub async fn search_experiences(&self, query: &str) -> Result<Vec<ExperienceRecord>, String> {
        let q = format!("%{}%", query);
        let rows: Vec<(String, Option<String>, String, String, String, Option<String>, Option<String>, String)> =
            sqlx::query_as(
                "SELECT id, template_id, task_description, outcome, actions_json, correction_notes, context_json, created_at FROM experience_records WHERE task_description LIKE ? ORDER BY created_at DESC LIMIT 20"
            )
            .bind(&q)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to search experiences: {}", e))?;

        Ok(rows.into_iter().map(|(id, tid, desc, outcome, actions, notes, ctx, created)| {
            ExperienceRecord {
                id, template_id: tid, task_description: desc, outcome,
                actions_json: actions, correction_notes: notes,
                context_json: ctx, created_at: created,
            }
        }).collect())
    }
}
