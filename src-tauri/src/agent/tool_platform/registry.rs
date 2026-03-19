use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Tool Platform — Registry
//
// Tracks every tool the system knows about, including:
//   - Execution stats (call count, success rate, avg latency)
//   - Manual frequency: how often human had to step in for this tool
//   - Classification: builtin / mcp / script / human_substitute
//
// The `manual_frequency` field is the key learning signal:
//   High manual_frequency = tool gap or inadequate tool
//   → feeds into tool gap analysis and platform roadmap
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolRegistryEntry {
    pub tool_name: String,
    pub display_name: String,
    pub description: String,
    pub category: ToolCategory,
    pub enabled: bool,

    // Execution statistics (rolling window)
    pub total_calls: u64,
    pub success_count: u64,
    pub failure_count: u64,
    pub avg_latency_ms: f64,

    // Learning signals
    /// How many times a human had to step in BECAUSE this tool failed/was missing.
    /// High value = tool gap or capability boundary.
    pub manual_frequency: u64,
    /// Was this tool replaced by human action in the last N runs?
    pub human_replacement_rate: f64,    // 0.0–1.0
    /// Last time human corrected an output from this tool
    pub last_human_fix_at: Option<String>,
    /// Annotated: does this tool need a capability upgrade?
    pub flagged_for_upgrade: bool,

    pub version: String,
    pub last_called_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    Builtin,        // Compiled into tool_runtime.rs
    Mcp,            // Loaded from MCP server
    Script,         // User-defined script
    HumanDelegate,  // Placeholder — always routes to human
}

impl ToolRegistryEntry {
    pub fn from_builtin(name: &str, description: &str) -> Self {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        Self {
            tool_name: name.to_string(),
            display_name: name.to_string(),
            description: description.to_string(),
            category: ToolCategory::Builtin,
            enabled: true,
            total_calls: 0,
            success_count: 0,
            failure_count: 0,
            avg_latency_ms: 0.0,
            manual_frequency: 0,
            human_replacement_rate: 0.0,
            last_human_fix_at: None,
            flagged_for_upgrade: false,
            version: "1.0".into(),
            last_called_at: None,
            created_at: now,
        }
    }

    pub fn success_rate(&self) -> f64 {
        if self.total_calls == 0 { return 0.0; }
        self.success_count as f64 / self.total_calls as f64
    }

    /// Tool gap score: combines manual frequency + human replacement rate.
    /// Higher = more urgent for capability investment.
    pub fn gap_score(&self) -> f64 {
        let freq_factor = (self.manual_frequency as f64).ln_1p() / 10.0;
        let replace_factor = self.human_replacement_rate;
        let failure_factor = 1.0 - self.success_rate();
        (freq_factor + replace_factor + failure_factor).min(1.0)
    }
}

// ─── Registry Operations ─────────────────────────────────────────

/// Register or sync builtin tools (called on startup)
pub async fn sync_builtin_tools(pool: &SqlitePool) {
    ensure_schema(pool).await;
    let builtin_tools = crate::agent::tool_runtime::get_builtin_tools();

    for tool_def in &builtin_tools {
        // Upsert: insert if not exists, preserve stats if already exists
        let _ = sqlx::query(
            "INSERT OR IGNORE INTO tool_registry
             (tool_name, display_name, description, category, enabled, version, created_at)
             VALUES (?, ?, ?, 'builtin', 1, '1.0', CURRENT_TIMESTAMP)"
        )
        .bind(&tool_def.function.name)
        .bind(&tool_def.function.name)
        .bind(&tool_def.function.description)
        .execute(pool).await;
    }
    app_log!("TOOL_REGISTRY", "Synced {} builtin tools", builtin_tools.len());
}

/// Record a tool call result (called from react_loop after each tool execution)
pub async fn record_tool_call(
    tool_name: &str,
    success: bool,
    latency_ms: u64,
    pool: &SqlitePool,
) {
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let _ = sqlx::query(
        "UPDATE tool_registry SET
         total_calls = total_calls + 1,
         success_count = success_count + CASE WHEN ? THEN 1 ELSE 0 END,
         failure_count = failure_count + CASE WHEN ? THEN 0 ELSE 1 END,
         avg_latency_ms = (avg_latency_ms * total_calls + ?) / (total_calls + 1),
         last_called_at = ?
         WHERE tool_name = ?"
    )
    .bind(success as i64)
    .bind(success as i64)
    .bind(latency_ms as f64)
    .bind(&now)
    .bind(tool_name)
    .execute(pool).await;
}

/// Record a human had to intervene because of this tool (manual_frequency signal)
pub async fn record_manual_intervention(tool_name: &str, pool: &SqlitePool) {
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let _ = sqlx::query(
        "UPDATE tool_registry SET
         manual_frequency = manual_frequency + 1,
         last_human_fix_at = ?
         WHERE tool_name = ?"
    )
    .bind(&now).bind(tool_name)
    .execute(pool).await;

    // Auto-flag for upgrade if manual_frequency crosses threshold
    let _ = sqlx::query(
        "UPDATE tool_registry SET flagged_for_upgrade = 1
         WHERE tool_name = ? AND manual_frequency >= 5"
    ).bind(tool_name).execute(pool).await;

    app_log!("TOOL_REGISTRY", "Manual intervention recorded for '{}'", tool_name);
}

/// Get tools sorted by gap_score (highest first) — for roadmap prioritization
pub async fn get_tool_gap_report(pool: &SqlitePool) -> Vec<serde_json::Value> {
    ensure_schema(pool).await;
    let rows: Vec<(String, i64, i64, i64, f64, i64, f64, bool)> = sqlx::query_as(
        "SELECT tool_name, total_calls, success_count, failure_count,
                avg_latency_ms, manual_frequency, human_replacement_rate, flagged_for_upgrade
         FROM tool_registry ORDER BY manual_frequency DESC, failure_count DESC LIMIT 20"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(name, total, succ, fail, lat, manual, hrr, flag)| {
        let success_rate = if total > 0 { succ as f64 / total as f64 } else { 0.0 };
        let freq_factor = (manual as f64).ln_1p() / 10.0;
        let gap_score = (freq_factor + hrr + (1.0 - success_rate)).min(1.0);
        serde_json::json!({
            "tool_name": name,
            "total_calls": total,
            "success_rate": success_rate,
            "avg_latency_ms": lat,
            "manual_frequency": manual,
            "human_replacement_rate": hrr,
            "flagged_for_upgrade": flag,
            "gap_score": gap_score,
        })
    }).collect()
}

pub async fn list_all_tools(pool: &SqlitePool) -> Vec<serde_json::Value> {
    ensure_schema(pool).await;
    let rows: Vec<(String, String, String, bool, i64, i64, i64)> = sqlx::query_as(
        "SELECT tool_name, display_name, category, enabled, total_calls, success_count, manual_frequency
         FROM tool_registry ORDER BY total_calls DESC"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(name, display, cat, enabled, calls, succ, manual)| {
        serde_json::json!({
            "tool_name": name,
            "display_name": display,
            "category": cat,
            "enabled": enabled,
            "total_calls": calls,
            "success_count": succ,
            "manual_frequency": manual,
        })
    }).collect()
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS tool_registry (
            tool_name TEXT PRIMARY KEY,
            display_name TEXT,
            description TEXT,
            category TEXT DEFAULT 'builtin',
            enabled INTEGER DEFAULT 1,
            total_calls INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            failure_count INTEGER DEFAULT 0,
            avg_latency_ms REAL DEFAULT 0,
            manual_frequency INTEGER DEFAULT 0,
            human_replacement_rate REAL DEFAULT 0,
            last_human_fix_at TEXT,
            flagged_for_upgrade INTEGER DEFAULT 0,
            version TEXT DEFAULT '1.0',
            last_called_at TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}

// ─── Tool Candidate Ingestion ─────────────────────────────────────
//
// When correction or teaching identifies a missing tool capability,
// the suggestion is stored here for operator review.
// This is the "tool candidate ingestion" pipeline:
//   correction/teaching identifies gap
//   → ingest_tool_candidate() stores suggestion
//   → Operator reviews in Tool Platform UI
//   → Promotes to real tool (builtin or MCP)

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolCandidate {
    pub candidate_id: String,
    pub source: String,             // "correction" | "teaching" | "adhoc"
    pub source_id: String,          // correction_record_id / teaching_session_id
    pub suggested_name: String,     // Proposed tool name
    pub suggested_description: String,
    pub example_usage: String,      // What this tool would have done
    pub status: String,             // "pending_review" | "approved" | "rejected" | "implemented"
    pub created_at: String,
}

pub async fn ingest_tool_candidate(
    source: &str,
    source_id: &str,
    suggested_name: &str,
    suggested_description: &str,
    example_usage: &str,
    pool: &SqlitePool,
) {
    ensure_candidate_schema(pool).await;
    let candidate_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let _ = sqlx::query(
        "INSERT OR IGNORE INTO tool_candidate_queue
         (candidate_id, source, source_id, suggested_name, suggested_description, example_usage, status, created_at)
         VALUES (?,?,?,?,?,?,'pending_review',?)"
    )
    .bind(&candidate_id)
    .bind(source)
    .bind(source_id)
    .bind(suggested_name)
    .bind(suggested_description)
    .bind(example_usage)
    .bind(&now)
    .execute(pool).await;

    app_log!("TOOL_REGISTRY", "Tool candidate ingested: '{}' from {} ({})", suggested_name, source, crate::logger::safe_truncate(&source_id, 8));
}

pub async fn list_tool_candidates(pool: &SqlitePool) -> Vec<serde_json::Value> {
    ensure_candidate_schema(pool).await;
    let rows: Vec<(String, String, String, String, String, String, String, String)> = sqlx::query_as(
        "SELECT candidate_id, source, source_id, suggested_name, suggested_description, example_usage, status, created_at
         FROM tool_candidate_queue ORDER BY created_at DESC LIMIT 50"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, src, src_id, name, desc, ex, status, at)| serde_json::json!({
        "candidate_id": id,
        "source": src,
        "source_id": src_id,
        "suggested_name": name,
        "suggested_description": desc,
        "example_usage": ex,
        "status": status,
        "created_at": at,
    })).collect()
}

pub async fn update_candidate_status(candidate_id: &str, status: &str, pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("UPDATE tool_candidate_queue SET status = ? WHERE candidate_id = ?")
        .bind(status).bind(candidate_id)
        .execute(pool).await
        .map_err(|e| format!("Failed to update candidate: {e}"))?;
    Ok(())
}

async fn ensure_candidate_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS tool_candidate_queue (
            candidate_id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            source_id TEXT,
            suggested_name TEXT NOT NULL,
            suggested_description TEXT,
            example_usage TEXT,
            status TEXT DEFAULT 'pending_review',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}
