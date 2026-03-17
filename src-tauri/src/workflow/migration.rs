// ═══════════════════════════════════════════════════════
// Data Migration — Schema Versioning & Auto Backup (P3)
// Ensures safe upgrades without data loss
// ═══════════════════════════════════════════════════════

use crate::db::DbPool;

/// Current schema version
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Check and run any needed migrations
pub async fn run_migrations(pool: &DbPool) -> Result<(), String> {
    // Ensure version table exists
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY DEFAULT 1,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create schema_version table: {}", e))?;

    // Get current version
    let current: Option<(i64,)> = sqlx::query_as(
        "SELECT version FROM schema_version WHERE id = 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to read schema version: {}", e))?;

    let version = match current {
        Some((v,)) => v as u32,
        None => {
            // First run — insert initial version
            sqlx::query("INSERT INTO schema_version (id, version) VALUES (1, 1)")
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to init schema version: {}", e))?;
            1
        }
    };

    // Run migrations sequentially
    if version < 2 {
        migrate_v1_to_v2(pool).await?;
    }

    // Update version to current
    if version < CURRENT_SCHEMA_VERSION {
        sqlx::query("UPDATE schema_version SET version = ?, updated_at = datetime('now') WHERE id = 1")
            .bind(CURRENT_SCHEMA_VERSION as i64)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update schema version: {}", e))?;
    }

    Ok(())
}

/// Migration: v1 → v2 (P3 tables)
async fn migrate_v1_to_v2(pool: &DbPool) -> Result<(), String> {
    // Action templates table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS action_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            actions_json TEXT NOT NULL,
            source TEXT DEFAULT 'recorded',
            domain TEXT,
            success_count INTEGER DEFAULT 0,
            failure_count INTEGER DEFAULT 0,
            last_failure_reason TEXT,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Migration v2 failed (action_templates): {}", e))?;

    // Experience records table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS experience_records (
            id TEXT PRIMARY KEY,
            template_id TEXT,
            task_description TEXT NOT NULL,
            outcome TEXT NOT NULL DEFAULT 'success',
            actions_json TEXT,
            correction_notes TEXT,
            context_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Migration v2 failed (experience_records): {}", e))?;

    // Index for searching
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_exp_outcome ON experience_records(outcome)")
        .execute(pool)
        .await
        .map_err(|e| format!("Migration v2 failed (index): {}", e))?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tmpl_domain ON action_templates(domain)")
        .execute(pool)
        .await
        .map_err(|e| format!("Migration v2 failed (index): {}", e))?;

    Ok(())
}

/// Create a backup of the database file before migration
pub async fn backup_database(db_path: &str) -> Result<String, String> {
    let backup_path = format!("{}.backup.{}", db_path, chrono::Local::now().format("%Y%m%d_%H%M%S"));
    
    tokio::fs::copy(db_path, &backup_path)
        .await
        .map_err(|e| format!("Failed to backup database: {}", e))?;
    
    Ok(backup_path)
}

/// Get current schema version
pub async fn get_schema_version(pool: &DbPool) -> Result<u32, String> {
    let result: Option<(i64,)> = sqlx::query_as(
        "SELECT version FROM schema_version WHERE id = 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to read schema version: {}", e))?;

    Ok(result.map(|(v,)| v as u32).unwrap_or(1))
}
