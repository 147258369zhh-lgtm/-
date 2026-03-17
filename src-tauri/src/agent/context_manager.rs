use serde_json::Value;
use crate::app_log;

// ═══════════════════════════════════════════════
// Context Manager v2 — 三层压缩策略
// ═══════════════════════════════════════════════
//
// 借鉴 learn-claude-code s06 Context Compact 模式：
//   Layer 1: micro_compact — 每轮替换旧 tool_result 为占位符
//   Layer 2: auto_compact  — 超阈值自动摘要
//   Layer 3: manual compact — 由调用方显式触发（预留接口）
//
// 职责：管理运行中的工作上下文
// - 历史步骤摘要
// - 最近 N 步保留完整
// - Token 上限截断

/// 保留最近 N 条消息不压缩（system + user + 最近2轮 assistant+tool）
const KEEP_RECENT: usize = 6;

/// 超过此数量触发 Layer 2 auto_compact
const AUTO_COMPACT_THRESHOLD: usize = 12;

/// 工具结果超过此长度自动截断（Layer 1）
const TOOL_RESULT_MAX_LEN: usize = 500;

/// Layer 1: micro_compact — 将旧 tool 结果替换为占位符
/// 每次 LLM 调用前执行，静默替换，不改变消息结构
pub fn micro_compact(messages: &mut Vec<Value>) {
    if messages.len() <= KEEP_RECENT + 2 {
        return; // 消息太少，不需要压缩
    }

    let keep_start = messages.len().saturating_sub(KEEP_RECENT);
    let mut compacted = 0;

    for i in 2..keep_start {  // 跳过 system(0) + user(1)
        let role = messages[i]["role"].as_str().unwrap_or("");

        if role == "tool" {
            let content = messages[i]["content"].as_str().unwrap_or("");
            if content.len() > 100 {
                let tool_name = messages[i]["name"].as_str().unwrap_or("tool");
                messages[i]["content"] = Value::String(
                    format!("[Previous: used {}, result truncated ({} chars)]", tool_name, content.len())
                );
                compacted += 1;
            }
        } else if role == "assistant" {
            // 压缩旧的 assistant tool_call 响应中的冗余内容
            if let Some(tool_calls) = messages[i].get("tool_calls") {
                if tool_calls.is_array() {
                    // 保留 tool_calls 结构，不压缩（模型需要看到调用了什么）
                    continue;
                }
            }
            // 压缩旧的纯文本 assistant 消息
            let content = messages[i]["content"].as_str().unwrap_or("");
            if content.len() > TOOL_RESULT_MAX_LEN {
                messages[i]["content"] = Value::String(
                    format!("{}...(共{}字符)", &content[..200], content.len())
                );
                compacted += 1;
            }
        }
    }

    if compacted > 0 {
        app_log!("CONTEXT", "Layer 1 micro_compact: {} messages compacted", compacted);
    }
}

/// Layer 2: auto_compact — 超阈值自动摘要
/// 保留 system + user + 摘要 + 最近 N 条
pub fn auto_compact(messages: &mut Vec<Value>) {
    if messages.len() <= AUTO_COMPACT_THRESHOLD {
        return; // 未达阈值
    }

    app_log!("CONTEXT", "Layer 2 auto_compact: {} → ~{} messages",
        messages.len(), KEEP_RECENT + 3);

    // 保留头部 2 条（system + 原始 user prompt）
    let head: Vec<Value> = messages.iter().take(2).cloned().collect();

    // 保留尾部最近 N 条
    let tail_start = messages.len().saturating_sub(KEEP_RECENT);
    let tail: Vec<Value> = messages.iter().skip(tail_start).cloned().collect();

    // 中间部分做摘要
    let middle: Vec<&Value> = messages.iter().skip(2).take(tail_start - 2).collect();
    let summary = summarize_messages(&middle);

    // 重建消息数组
    messages.clear();
    messages.extend(head);
    messages.push(serde_json::json!({
        "role": "system",
        "content": format!("## 历史执行摘要\n{}", summary)
    }));
    messages.extend(tail);

    app_log!("CONTEXT", "Layer 2 compacted to {} messages", messages.len());
}

/// 主入口：执行完整的三层压缩流程
/// 每次 LLM 调用前调用此函数
pub fn compress_messages(messages: &mut Vec<Value>) {
    // Layer 1: 先做 micro compact（替换旧结果为占位符）
    micro_compact(messages);

    // Layer 2: 如果仍然超过阈值，执行 auto_compact（摘要压缩）
    auto_compact(messages);
}

/// 摘要生成：提取中间消息的关键信息
fn summarize_messages(messages: &[&Value]) -> String {
    let mut summary_parts: Vec<String> = Vec::new();
    let mut step_count = 0;

    for msg in messages {
        let role = msg["role"].as_str().unwrap_or("");
        let content = msg["content"].as_str().unwrap_or("");

        match role {
            "assistant" => {
                if let Some(tool_calls) = msg["tool_calls"].as_array() {
                    for tc in tool_calls {
                        let fname = tc["function"]["name"].as_str().unwrap_or("unknown");
                        step_count += 1;
                        summary_parts.push(format!("- 调用了 `{}`", fname));
                    }
                } else if !content.is_empty() {
                    let preview = if content.len() > 80 {
                        format!("{}...", &content[..80])
                    } else {
                        content.to_string()
                    };
                    summary_parts.push(format!("- AI: {}", preview));
                }
            }
            "tool" => {
                // 已被 micro_compact 处理过的只显示占位符
                let preview = if content.len() > 100 {
                    format!("{}...", &content[..100])
                } else {
                    content.to_string()
                };
                summary_parts.push(format!("  → 结果: {}", preview));
            }
            _ => {}
        }
    }

    if summary_parts.is_empty() {
        "（无历史记录）".into()
    } else {
        format!("已执行 {} 次工具调用：\n{}", step_count, summary_parts.join("\n"))
    }
}

/// 压缩单步工具结果（给 executor 用）
pub fn compress_step_result(result: &str) -> String {
    if result.len() <= TOOL_RESULT_MAX_LEN {
        result.to_string()
    } else {
        format!("{}...(共{}字符，已截断)", &result[..TOOL_RESULT_MAX_LEN], result.len())
    }
}
