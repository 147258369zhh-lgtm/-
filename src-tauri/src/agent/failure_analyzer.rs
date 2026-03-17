use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════
// Failure Analyzer — 失败归因标签化
// ═══════════════════════════════════════════════
// 唯一核心输出: FailureCategory
// 职责: 从错误信息自动归因失败类型
// 数据流: ExecutionRecord → FailureAnalyzer → ToolKnowledge/Experience

/// Analyze a tool failure and categorize it
pub fn categorize_failure(
    tool_name: &str,
    error_msg: &str,
    step_task: &str,
    consecutive_failures: u32,
) -> FailureCategory {
    let err = error_msg.to_lowercase();

    // Network errors
    if err.contains("timeout") || err.contains("超时") || err.contains("timed out") {
        return FailureCategory::TimeoutExceeded;
    }
    if err.contains("network") || err.contains("connection") || err.contains("网络")
        || err.contains("dns") || err.contains("refused") {
        return FailureCategory::NetworkError;
    }

    // Bad parameters
    if err.contains("not found") || err.contains("找不到") || err.contains("不存在")
        || err.contains("no such file") || err.contains("path") {
        return FailureCategory::BadToolParameter;
    }
    if err.contains("invalid") || err.contains("无效") || err.contains("格式错误")
        || err.contains("parse") || err.contains("syntax") {
        return FailureCategory::BadToolParameter;
    }

    // Missing precondition
    if err.contains("permission") || err.contains("权限") || err.contains("denied")
        || err.contains("not installed") || err.contains("未安装") {
        return FailureCategory::MissingPrecondition;
    }

    // Looping detection
    if consecutive_failures >= 3 {
        return FailureCategory::LoopingBehavior;
    }

    // Context overload (large data issues)
    if err.contains("too large") || err.contains("过大") || err.contains("memory")
        || err.contains("overflow") {
        return FailureCategory::ContextOverload;
    }

    // Default: wrong tool selection
    FailureCategory::WrongToolSelection
}

/// Generate a recommended fix action based on failure category
pub fn recommend_fix(
    category: &FailureCategory,
    tool_name: &str,
) -> FailureFix {
    match category {
        FailureCategory::BadToolParameter => FailureFix {
            action: FixAction::RetryWithDifferentParams,
            suggestion: "检查并修正参数（路径/URL/格式）".into(),
            alternative_tool: None,
        },
        FailureCategory::WrongToolSelection => {
            let alt = super::tool_knowledge::get_fallback(tool_name);
            FailureFix {
                action: if alt.is_some() { FixAction::SwitchTool } else { FixAction::Skip },
                suggestion: format!("当前工具 {} 可能不适合此任务", tool_name),
                alternative_tool: alt.map(|s| s.to_string()),
            }
        }
        FailureCategory::MissingPrecondition => FailureFix {
            action: FixAction::RetryWithDifferentParams,
            suggestion: "需要先满足前置条件（安装依赖/创建目录/获取权限）".into(),
            alternative_tool: None,
        },
        FailureCategory::NetworkError | FailureCategory::TimeoutExceeded => FailureFix {
            action: FixAction::Retry,
            suggestion: "网络问题，等待后重试".into(),
            alternative_tool: None,
        },
        FailureCategory::LoopingBehavior => FailureFix {
            action: FixAction::Replan,
            suggestion: "重复失败，需要重新规划此步骤".into(),
            alternative_tool: None,
        },
        FailureCategory::ContextOverload => FailureFix {
            action: FixAction::Skip,
            suggestion: "数据过大，跳过此步骤或拆分处理".into(),
            alternative_tool: None,
        },
        FailureCategory::WeakPlan | FailureCategory::AmbiguousTask => FailureFix {
            action: FixAction::Replan,
            suggestion: "计划不够明确，需要重新规划".into(),
            alternative_tool: None,
        },
    }
}

/// Failure fix recommendation
#[derive(Debug, Clone)]
pub struct FailureFix {
    pub action: FixAction,
    pub suggestion: String,
    pub alternative_tool: Option<String>,
}

/// Possible fix actions
#[derive(Debug, Clone, PartialEq)]
pub enum FixAction {
    Retry,
    RetryWithDifferentParams,
    SwitchTool,
    Skip,
    Replan,
}
