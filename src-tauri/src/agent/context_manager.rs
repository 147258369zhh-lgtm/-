use serde_json::Value;
use crate::app_log;

// ═══════════════════════════════════════════════
// Context Manager — 运行态上下文管理（最小版）
// ═══════════════════════════════════════════════
//
// 职责：管理运行中的工作上下文（不做持久化，那是 memory.rs 的事）
// - 历史步骤摘要
// - 最近 N 步保留完整
// - Token 上限截断

/// Maximum messages to keep in full detail
const MAX_RECENT_MESSAGES: usize = 6;  // system + user + 最近2轮的 assistant+tool

/// Maximum total messages before compression
const MAX_TOTAL_MESSAGES: usize = 20;

/// Compress messages array to stay within token budget.
/// Keeps: system message + user message + last N messages.
/// Older messages are summarized into a single "history summary" message.
pub fn compress_messages(messages: &mut Vec<Value>) {
    if messages.len() <= MAX_TOTAL_MESSAGES {
        return;  // No compression needed
    }

    app_log!("CONTEXT", "Compressing messages: {} → ~{}", messages.len(), MAX_RECENT_MESSAGES + 3);

    // Always keep first 2 messages (system + original user prompt)
    let head: Vec<Value> = messages.iter().take(2).cloned().collect();

    // Keep last N messages (recent context)
    let tail_start = messages.len().saturating_sub(MAX_RECENT_MESSAGES);
    let tail: Vec<Value> = messages.iter().skip(tail_start).cloned().collect();

    // Summarize middle messages
    let middle: Vec<&Value> = messages.iter().skip(2).take(tail_start - 2).collect();
    let summary = summarize_messages(&middle);

    // Rebuild
    messages.clear();
    messages.extend(head);
    messages.push(serde_json::json!({
        "role": "system",
        "content": format!("## 历史执行摘要\n{}", summary)
    }));
    messages.extend(tail);

    app_log!("CONTEXT", "Compressed to {} messages", messages.len());
}

/// Summarize a set of messages into a brief text
fn summarize_messages(messages: &[&Value]) -> String {
    let mut summary_parts: Vec<String> = Vec::new();
    let mut step_count = 0;

    for msg in messages {
        let role = msg["role"].as_str().unwrap_or("");
        let content = msg["content"].as_str().unwrap_or("");

        match role {
            "assistant" => {
                // Extract tool calls if any
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

/// Build a compressed step result for context injection.
/// Used to summarize previous step results (max 200 chars).
pub fn compress_step_result(result: &str) -> String {
    if result.len() <= 200 {
        result.to_string()
    } else {
        format!("{}...(共{}字符)", &result[..200], result.len())
    }
}
