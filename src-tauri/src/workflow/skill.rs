// ═══════════════════════════════════════════════════════
// Skill System — Reusable Capability Packages
// ═══════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::db::DbPool;

/// A reusable Skill definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    /// The steps this skill performs (as workflow nodes)
    pub steps_json: String,
    /// Input parameters schema
    pub input_schema: Option<Value>,
    /// Output schema
    pub output_schema: Option<Value>,
    /// Version number
    pub version: u32,
    /// Tags for search
    pub tags: Vec<String>,
    /// Number of times this skill has been used
    pub usage_count: u64,
    /// Average success rate
    pub success_rate: f64,
    pub created_at: String,
    pub updated_at: String,
}

/// Request to create a skill
#[derive(Debug, Deserialize)]
pub struct CreateSkillRequest {
    pub name: String,
    pub description: String,
    pub category: String,
    pub steps_json: String,
    pub input_schema: Option<Value>,
    pub output_schema: Option<Value>,
    pub tags: Vec<String>,
}

/// Skill persistence layer
pub struct SkillPersistence {
    pool: DbPool,
}

impl SkillPersistence {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub async fn create_skill(&self, skill: &SkillDefinition) -> Result<(), String> {
        let tags_json = serde_json::to_string(&skill.tags).unwrap_or("[]".into());
        sqlx::query(
            "INSERT INTO skills (id, name, description, category, steps_json, input_schema, output_schema, version, tags, usage_count, success_rate, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&skill.id)
        .bind(&skill.name)
        .bind(&skill.description)
        .bind(&skill.category)
        .bind(&skill.steps_json)
        .bind(skill.input_schema.as_ref().map(|v| v.to_string()))
        .bind(skill.output_schema.as_ref().map(|v| v.to_string()))
        .bind(skill.version)
        .bind(&tags_json)
        .bind(skill.usage_count as i64)
        .bind(skill.success_rate)
        .bind(&skill.created_at)
        .bind(&skill.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create skill: {}", e))?;
        Ok(())
    }

    pub async fn list_skills(&self) -> Result<Vec<SkillDefinition>, String> {
        let rows: Vec<(String, String, String, String, String, Option<String>, Option<String>, i64, String, i64, f64, String, String)> = sqlx::query_as(
            "SELECT id, name, description, category, steps_json, input_schema, output_schema, version, tags, usage_count, success_rate, created_at, updated_at
             FROM skills ORDER BY usage_count DESC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list skills: {}", e))?;

        Ok(rows.into_iter().map(|(id, name, desc, cat, steps, inp, out, ver, tags_s, usage, rate, created, updated)| {
            SkillDefinition {
                id, name, description: desc, category: cat, steps_json: steps,
                input_schema: inp.and_then(|s| serde_json::from_str(&s).ok()),
                output_schema: out.and_then(|s| serde_json::from_str(&s).ok()),
                version: ver as u32,
                tags: serde_json::from_str(&tags_s).unwrap_or_default(),
                usage_count: usage as u64, success_rate: rate,
                created_at: created, updated_at: updated,
            }
        }).collect())
    }

    pub async fn get_skill(&self, skill_id: &str) -> Result<SkillDefinition, String> {
        let row: (String, String, String, String, String, Option<String>, Option<String>, i64, String, i64, f64, String, String) = sqlx::query_as(
            "SELECT id, name, description, category, steps_json, input_schema, output_schema, version, tags, usage_count, success_rate, created_at, updated_at
             FROM skills WHERE id = ?"
        )
        .bind(skill_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Skill not found: {}", e))?;

        Ok(SkillDefinition {
            id: row.0, name: row.1, description: row.2, category: row.3, steps_json: row.4,
            input_schema: row.5.and_then(|s| serde_json::from_str(&s).ok()),
            output_schema: row.6.and_then(|s| serde_json::from_str(&s).ok()),
            version: row.7 as u32,
            tags: serde_json::from_str(&row.8).unwrap_or_default(),
            usage_count: row.9 as u64, success_rate: row.10,
            created_at: row.11, updated_at: row.12,
        })
    }

    pub async fn update_skill(&self, skill: &SkillDefinition) -> Result<(), String> {
        let tags_json = serde_json::to_string(&skill.tags).unwrap_or("[]".into());
        sqlx::query(
            "UPDATE skills SET name=?, description=?, category=?, steps_json=?, input_schema=?, output_schema=?, version=?, tags=?, updated_at=? WHERE id=?"
        )
        .bind(&skill.name)
        .bind(&skill.description)
        .bind(&skill.category)
        .bind(&skill.steps_json)
        .bind(skill.input_schema.as_ref().map(|v| v.to_string()))
        .bind(skill.output_schema.as_ref().map(|v| v.to_string()))
        .bind(skill.version)
        .bind(&tags_json)
        .bind(&skill.updated_at)
        .bind(&skill.id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update skill: {}", e))?;
        Ok(())
    }

    pub async fn delete_skill(&self, skill_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM skills WHERE id = ?")
            .bind(skill_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete skill: {}", e))?;
        Ok(())
    }

    pub async fn search_skills(&self, query: &str) -> Result<Vec<SkillDefinition>, String> {
        let q = format!("%{}%", query);
        let rows: Vec<(String, String, String, String, String, Option<String>, Option<String>, i64, String, i64, f64, String, String)> = sqlx::query_as(
            "SELECT id, name, description, category, steps_json, input_schema, output_schema, version, tags, usage_count, success_rate, created_at, updated_at
             FROM skills WHERE name LIKE ? OR description LIKE ? OR tags LIKE ? ORDER BY usage_count DESC LIMIT 20"
        )
        .bind(&q).bind(&q).bind(&q)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to search skills: {}", e))?;

        Ok(rows.into_iter().map(|(id, name, desc, cat, steps, inp, out, ver, tags_s, usage, rate, created, updated)| {
            SkillDefinition {
                id, name, description: desc, category: cat, steps_json: steps,
                input_schema: inp.and_then(|s| serde_json::from_str(&s).ok()),
                output_schema: out.and_then(|s| serde_json::from_str(&s).ok()),
                version: ver as u32,
                tags: serde_json::from_str(&tags_s).unwrap_or_default(),
                usage_count: usage as u64, success_rate: rate,
                created_at: created, updated_at: updated,
            }
        }).collect())
    }

    pub async fn increment_usage(&self, skill_id: &str, success: bool) -> Result<(), String> {
        if success {
            sqlx::query(
                "UPDATE skills SET usage_count = usage_count + 1, success_rate = (success_rate * usage_count + 1.0) / (usage_count + 1) WHERE id = ?"
            )
        } else {
            sqlx::query(
                "UPDATE skills SET usage_count = usage_count + 1, success_rate = (success_rate * usage_count) / (usage_count + 1) WHERE id = ?"
            )
        }
        .bind(skill_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update usage: {}", e))?;
        Ok(())
    }
}
