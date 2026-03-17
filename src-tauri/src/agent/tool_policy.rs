use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════
// Tool Policy — 工具治理（"应不应该执行"）
// ═══════════════════════════════════════════════
// 唯一核心输出: ToolDecision
// 职责: 工具分级、参数预校验、调用限制
// 边界: 不做执行（那是 tool_runtime 的事）

/// Decision about whether a tool call should proceed
#[derive(Debug, Clone)]
pub enum ToolDecision {
    Allow,
    AllowWithWarning(String),
    Block(String),
}

/// Per-task tool call counter
#[derive(Debug, Default)]
pub struct ToolCallTracker {
    calls: std::collections::HashMap<String, u32>,
    total_calls: u32,
}

impl ToolCallTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_call(&mut self, tool_name: &str) {
        *self.calls.entry(tool_name.to_string()).or_insert(0) += 1;
        self.total_calls += 1;
    }

    pub fn count_for(&self, tool_name: &str) -> u32 {
        *self.calls.get(tool_name).unwrap_or(&0)
    }

    pub fn total(&self) -> u32 {
        self.total_calls
    }
}

/// Check if a tool call should be allowed
pub fn check_tool_call(
    tool_name: &str,
    args: &serde_json::Value,
    tracker: &ToolCallTracker,
    budget: &CostBudget,
) -> ToolDecision {
    // 1. Total call limit
    if tracker.total() >= budget.max_tool_calls {
        return ToolDecision::Block(format!(
            "已达工具调用上限 ({}次)", budget.max_tool_calls
        ));
    }

    // 2. Per-tool frequency limit
    let per_tool_limit = per_tool_max(tool_name);
    if tracker.count_for(tool_name) >= per_tool_limit {
        return ToolDecision::Block(format!(
            "工具 {} 已调用 {} 次（上限 {}）", tool_name, tracker.count_for(tool_name), per_tool_limit
        ));
    }

    // 3. Banned tools
    if is_banned(tool_name) {
        return ToolDecision::Block(format!("工具 {} 已被禁用", tool_name));
    }

    // 4. High-risk tools need warning
    if is_high_risk(tool_name) {
        return ToolDecision::AllowWithWarning(format!(
            "⚠️ {} 是高风险工具，请确认参数正确", tool_name
        ));
    }

    // 5. Parameter validation
    if let Some(issue) = validate_params(tool_name, args) {
        return ToolDecision::Block(format!("参数校验失败: {}", issue));
    }

    ToolDecision::Allow
}

/// Maximum calls per tool per task
fn per_tool_max(tool_name: &str) -> u32 {
    match tool_name {
        "shell_run" => 5,          // Shell commands are risky
        "file_delete" => 3,        // Destructive
        "file_move" => 5,
        "web_scrape" => 10,        // May need multiple scrapes
        "browser_navigate" => 5,
        _ => 15,                   // Default generous limit
    }
}

/// Tools that are completely banned
fn is_banned(tool_name: &str) -> bool {
    matches!(tool_name, "ai_chat")
}

/// High-risk tools that need extra caution
fn is_high_risk(tool_name: &str) -> bool {
    matches!(tool_name, "shell_run" | "file_delete" | "file_move")
}

/// Basic parameter validation
fn validate_params(tool_name: &str, args: &serde_json::Value) -> Option<String> {
    match tool_name {
        // File operations need a path
        "file_read" | "file_write" | "file_delete" | "file_move" |
        "file_list" | "file_search" | "excel_read" | "excel_write" |
        "excel_analyze" | "pdf_read" | "word_read" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            if path.is_empty() {
                return Some("缺少必填参数: path".into());
            }
            // Windows path validation
            if !path.contains(':') && !path.starts_with("\\\\") {
                return Some(format!("路径格式不正确(需要Windows绝对路径): {}", path));
            }
            None
        }
        // Web operations need a URL
        "web_scrape" | "browser_navigate" => {
            let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if url.is_empty() {
                return Some("缺少必填参数: url".into());
            }
            if !url.starts_with("http://") && !url.starts_with("https://") {
                return Some(format!("URL格式不正确: {}", url));
            }
            None
        }
        // Shell needs a command
        "shell_run" => {
            let cmd = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
            if cmd.is_empty() {
                return Some("缺少必填参数: command".into());
            }
            // Block dangerous commands
            let dangerous = ["format", "rm -rf", "del /s /q C:\\", "rmdir /s"];
            for d in &dangerous {
                if cmd.to_lowercase().contains(d) {
                    return Some(format!("检测到危险命令: {}", d));
                }
            }
            None
        }
        _ => None,
    }
}
