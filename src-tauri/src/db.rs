use sqlx::{sqlite::SqliteConnectOptions, Pool, Sqlite};
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db(app_handle: &AppHandle) -> Result<DbPool, Box<dyn std::error::Error>> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|_| "Could not find app data directory")?;

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }

    let db_path = app_dir.join("project_manager.db");

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = Pool::connect_with(options).await?;

    // Initial Schema
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            number TEXT,
            city TEXT,
            project_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            path TEXT NOT NULL,
            remarks TEXT,
            last_opened_at DATETIME,
            stage TEXT DEFAULT '立项',
            ai_profile TEXT
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            original_name TEXT,
            path TEXT NOT NULL,
            category TEXT NOT NULL,
            stage TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_latest BOOLEAN DEFAULT 1,
            is_deleted BOOLEAN DEFAULT 0,
            remarks TEXT,
            ai_summary TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS surveys (
            project_id TEXT PRIMARY KEY,
            date TEXT,
            location TEXT,
            surveyor TEXT,
            summary TEXT,
            ai_structured TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS survey_media (
            id TEXT PRIMARY KEY,
            survey_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            path TEXT NOT NULL,
            media_type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            stage TEXT,
            label TEXT,
            name_pattern TEXT,
            source_file_path TEXT,
            ai_structured TEXT
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS common_info (
            id TEXT PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            remarks TEXT,
            info_type TEXT DEFAULT 'text', -- text, image, file, link
            file_path TEXT,
            url TEXT,
            category TEXT DEFAULT '通用',
            ai_structured TEXT
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ai_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL, -- openai, deepseek, ollama, custom
            api_key TEXT,
            base_url TEXT,
            model_name TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            purpose TEXT DEFAULT 'core_chat' -- core_chat, vision, automation
        );",
    )
    .execute(&pool)
    .await?;

    // Attempt to add 'purpose' column to existing DB gracefully
    let _ = sqlx::query("ALTER TABLE ai_configs ADD COLUMN purpose TEXT DEFAULT 'core_chat'")
        .execute(&pool)
        .await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            remarks TEXT
        );",
    )
    .execute(&pool)
    .await?;

    // Attempt to add 'summary' column to projects table
    let _ = sqlx::query("ALTER TABLE projects ADD COLUMN summary TEXT")
        .execute(&pool)
        .await;

    // Attempt to add AI profile column to projects table
    let _ = sqlx::query("ALTER TABLE projects ADD COLUMN ai_profile TEXT")
        .execute(&pool)
        .await;

    // Attempt to add missing columns to common_info for compatibility
    let _ = sqlx::query("ALTER TABLE common_info ADD COLUMN info_type TEXT DEFAULT 'text'")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE common_info ADD COLUMN file_path TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE common_info ADD COLUMN url TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE common_info ADD COLUMN category TEXT DEFAULT '通用'")
        .execute(&pool)
        .await;

    // Attempt to add AI summary column to files
    let _ = sqlx::query("ALTER TABLE files ADD COLUMN ai_summary TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE common_info ADD COLUMN ai_structured TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE templates ADD COLUMN ai_structured TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE surveys ADD COLUMN ai_structured TEXT")
        .execute(&pool)
        .await;

    // Pre-populate default settings
    sqlx::query("INSERT OR IGNORE INTO settings (key, value, remarks) VALUES ('trash_retention_days', '10', '回收站保留天数')")
        .execute(&pool)
        .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS automation_schemes (
            id TEXT PRIMARY KEY,
            project_id TEXT, -- 为 NULL 时代表全局方案库
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS automation_instructions (
            id TEXT PRIMARY KEY,
            scheme_id TEXT NOT NULL,
            op_type TEXT NOT NULL, -- WordReplace, ExcelWrite, FileNameChange
            data_source_type TEXT NOT NULL, -- Static, ExcelCell, WordParagraph
            source_file_path TEXT, -- 来源文件（可选）
            source_params TEXT, -- 来源参数（Sheet/Cell 或 关键词）
            target_params TEXT, -- 目标参数（占位符或 Sheet/Cell）
            order_index INTEGER NOT NULL,
            FOREIGN KEY(scheme_id) REFERENCES automation_schemes(id)
        );",
    )
    .execute(&pool)
    .await?;

    // RAG: Knowledge Base chunks with embeddings
    // Drop old table with FK constraint and recreate without it
    let _ = sqlx::query("DROP TABLE IF EXISTS kb_chunks_old")
        .execute(&pool)
        .await;
    let has_fk: bool = sqlx::query_scalar::<_, String>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_chunks'",
    )
    .fetch_optional(&pool)
    .await
    .unwrap_or(None)
    .map(|sql| sql.contains("FOREIGN KEY"))
    .unwrap_or(false);

    if has_fk {
        // Migrate: rename old table, create new, copy data, drop old
        let _ = sqlx::query("ALTER TABLE kb_chunks RENAME TO kb_chunks_old")
            .execute(&pool)
            .await;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS kb_chunks (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                embedding BLOB
            );",
        )
        .execute(&pool)
        .await?;
        let _ = sqlx::query("INSERT INTO kb_chunks SELECT * FROM kb_chunks_old")
            .execute(&pool)
            .await;
        let _ = sqlx::query("DROP TABLE IF EXISTS kb_chunks_old")
            .execute(&pool)
            .await;
    } else {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS kb_chunks (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                embedding BLOB
            );",
        )
        .execute(&pool)
        .await?;
    }

    // Default embedding engine setting
    sqlx::query("INSERT OR IGNORE INTO settings (key, value, remarks) VALUES ('embedding_engine', 'local', '嵌入引擎: local/lmstudio/online')")
        .execute(&pool)
        .await?;

    // Performance indexes on frequently queried foreign key columns
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_kb_chunks_template_id ON kb_chunks(template_id)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_automation_instructions_scheme_id ON automation_instructions(scheme_id)")
        .execute(&pool)
        .await?;

    // ═══════════════════════════════════════════════
    // Agent System Tables
    // ═══════════════════════════════════════════════

    // Agent tasks: persistent goal tracking
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_tasks (
            id TEXT PRIMARY KEY,
            goal TEXT NOT NULL,
            status TEXT DEFAULT 'running',
            plan TEXT,
            current_step INTEGER DEFAULT 0,
            total_steps INTEGER DEFAULT 0,
            model_config_id TEXT,
            project_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            final_result TEXT
        );",
    )
    .execute(&pool)
    .await?;

    // Agent short-term memory: conversation history per task
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_memory (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            round INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            tool_call_id TEXT,
            tool_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .execute(&pool)
    .await?;

    // Agent working memory: key-value state snapshots
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_working_memory (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .execute(&pool)
    .await?;

    // Indexes for agent tables
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agent_memory_task_id ON agent_memory(task_id)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agent_working_memory_task_id ON agent_working_memory(task_id)")
        .execute(&pool)
        .await?;

    Ok(pool)
}
