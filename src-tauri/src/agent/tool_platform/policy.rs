use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Tool Platform — Policy
//
// Controls what tools are allowed, under what conditions, and with
// what level of human oversight. Three-level risk classification:
//
//   Low    → Execute freely
//   Medium → Log and optionally notify, but proceed
//   High   → Require human approval before execution
//   Blocked → Never execute; always route to human or reject
//
// Policies are evaluated PRE-execution by the ReAct loop.
// This gives the system safe-by-default behavior without
// making every tool call slow.
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,        // Read-only, reversible, low blast radius
    Medium,     // Write operations with limited scope
    High,       // Destructive, broad scope, or external API calls
    Blocked,    // Never auto-run
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolPolicy {
    pub tool_name: String,
    pub risk_level: RiskLevel,
    /// Max calls per run (None = unlimited)
    pub max_calls_per_run: Option<u32>,
    /// Require human approval before executing
    pub require_approval: bool,
    /// Allowed path prefixes (for file tools); empty = use session's allowed_paths
    pub allowed_path_prefixes: Vec<String>,
    /// Block execution if no allowed paths set
    pub require_path_restriction: bool,
    pub notes: String,
    pub updated_at: String,
}

impl ToolPolicy {
    pub fn default_for(tool_name: &str) -> Self {
        let risk = classify_default_risk(tool_name);
        let require_approval = risk == RiskLevel::High;
        Self {
            tool_name: tool_name.to_string(),
            risk_level: risk,
            max_calls_per_run: None,
            require_approval,
            allowed_path_prefixes: vec![],
            require_path_restriction: false,
            notes: String::new(),
            updated_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }
}

/// Evaluate a policy decision before tool execution.
#[derive(Debug)]
pub enum PolicyDecision {
    /// Allow execution
    Allow,
    /// Allow but log a warning
    AllowWithWarning(String),
    /// Block — require human approval first
    RequireApproval(String),
    /// Block completely
    Blocked(String),
}

/// Policy engine: check if a tool call is allowed.
/// Called by react_loop BEFORE executing each tool.
pub async fn evaluate(
    tool_name: &str,
    args: &serde_json::Value,
    call_count_this_run: u32,
    allowed_paths: &[String],
    pool: &SqlitePool,
) -> PolicyDecision {
    ensure_schema(pool).await;

    let policy = get_policy(tool_name, pool).await;

    // Blocked tools
    if policy.risk_level == RiskLevel::Blocked {
        return PolicyDecision::Blocked(
            format!("Tool '{}' is blocked by policy", tool_name)
        );
    }

    // Max calls per run
    if let Some(max) = policy.max_calls_per_run {
        if call_count_this_run >= max {
            return PolicyDecision::Blocked(
                format!("Tool '{}' exceeded max_calls_per_run ({})", tool_name, max)
            );
        }
    }

    // Path restriction for file tools
    if policy.require_path_restriction && allowed_paths.is_empty() {
        return PolicyDecision::Blocked(
            format!("Tool '{}' requires path restriction but no allowed_paths set", tool_name)
        );
    }

    // Check file path args against allowed_path_prefixes
    if let Some(path_arg) = extract_path_arg(args) {
        if !allowed_paths.is_empty() && !is_path_allowed(&path_arg, allowed_paths) {
            return PolicyDecision::Blocked(
                format!("Path '{}' is outside allowed paths", &path_arg[..path_arg.len().min(80)])
            );
        }
    }

    // High risk: require approval
    if policy.require_approval || policy.risk_level == RiskLevel::High {
        return PolicyDecision::RequireApproval(
            format!("Tool '{}' (High Risk) requires human approval", tool_name)
        );
    }

    // Medium risk: allow with warning
    if policy.risk_level == RiskLevel::Medium {
        return PolicyDecision::AllowWithWarning(
            format!("Tool '{}' is Medium risk — logging", tool_name)
        );
    }

    PolicyDecision::Allow
}

/// Get or create a policy for a tool
pub async fn get_policy(tool_name: &str, pool: &SqlitePool) -> ToolPolicy {
    let row: Option<(String, String, Option<i64>, bool, bool)> = sqlx::query_as(
        "SELECT tool_name, risk_level, max_calls_per_run, require_approval, require_path_restriction
         FROM tool_policies WHERE tool_name = ?"
    ).bind(tool_name).fetch_optional(pool).await.unwrap_or(None);

    match row {
        Some((name, risk_str, max_calls, req_approval, req_path)) => ToolPolicy {
            tool_name: name,
            risk_level: parse_risk(&risk_str),
            max_calls_per_run: max_calls.map(|n| n as u32),
            require_approval: req_approval,
            allowed_path_prefixes: vec![],
            require_path_restriction: req_path,
            notes: String::new(),
            updated_at: String::new(),
        },
        None => {
            // Auto-create default policy on first encounter
            let pol = ToolPolicy::default_for(tool_name);
            upsert_policy(&pol, pool).await;
            pol
        }
    }
}

pub async fn upsert_policy(pol: &ToolPolicy, pool: &SqlitePool) {
    let risk_str = match pol.risk_level {
        RiskLevel::Low     => "low",
        RiskLevel::Medium  => "medium",
        RiskLevel::High    => "high",
        RiskLevel::Blocked => "blocked",
    };
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO tool_policies
         (tool_name, risk_level, max_calls_per_run, require_approval, require_path_restriction, notes, updated_at)
         VALUES (?,?,?,?,?,?,?)"
    )
    .bind(&pol.tool_name).bind(risk_str)
    .bind(pol.max_calls_per_run.map(|n| n as i64))
    .bind(pol.require_approval as i64)
    .bind(pol.require_path_restriction as i64)
    .bind(&pol.notes).bind(&pol.updated_at)
    .execute(pool).await;
}

pub async fn list_policies(pool: &SqlitePool) -> Vec<serde_json::Value> {
    ensure_schema(pool).await;
    let rows: Vec<(String, String, Option<i64>, bool)> = sqlx::query_as(
        "SELECT tool_name, risk_level, max_calls_per_run, require_approval FROM tool_policies"
    ).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(name, risk, max_calls, req_approval)| {
        serde_json::json!({
            "tool_name": name,
            "risk_level": risk,
            "max_calls_per_run": max_calls,
            "require_approval": req_approval,
        })
    }).collect()
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS tool_policies (
            tool_name TEXT PRIMARY KEY,
            risk_level TEXT DEFAULT 'low',
            max_calls_per_run INTEGER,
            require_approval INTEGER DEFAULT 0,
            require_path_restriction INTEGER DEFAULT 0,
            notes TEXT,
            updated_at TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;
}

// ─── Helpers ─────────────────────────────────────────────────────

fn classify_default_risk(tool_name: &str) -> RiskLevel {
    // Heuristic based on tool name patterns
    let name = tool_name.to_lowercase();
    if name.contains("delete") || name.contains("remove") || name.contains("drop") {
        return RiskLevel::High;
    }
    if name.contains("write") || name.contains("create") || name.contains("upload")
        || name.contains("post") || name.contains("send") || name.contains("exec") {
        return RiskLevel::Medium;
    }
    RiskLevel::Low
}

fn parse_risk(s: &str) -> RiskLevel {
    match s {
        "medium"  => RiskLevel::Medium,
        "high"    => RiskLevel::High,
        "blocked" => RiskLevel::Blocked,
        _         => RiskLevel::Low,
    }
}

fn extract_path_arg(args: &serde_json::Value) -> Option<String> {
    let obj = args.as_object()?;
    for key in &["path", "file_path", "input_path", "output_path", "dir"] {
        if let Some(v) = obj.get(*key) {
            if let Some(s) = v.as_str() {
                return Some(s.to_string());
            }
        }
    }
    None
}

fn is_path_allowed(path: &str, allowed: &[String]) -> bool {
    let norm = path.replace('\\', "/").to_lowercase();
    allowed.iter().any(|prefix| {
        let p = prefix.replace('\\', "/").to_lowercase();
        norm.starts_with(&p)
    })
}
