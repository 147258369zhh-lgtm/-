use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Agent V5 — Context Manager
// Manages conversation history and Token Budget for the LLM.
// The LLM is stateless; we pass the full history on every call.
// ═══════════════════════════════════════════════════════════════

/// Maximum characters for a single tool result in history.
/// Prevents large file reads from filling the context window.
const MAX_TOOL_RESULT_CHARS: usize = 3000;

/// Approximate character budget for the full message list.
/// Rough heuristic: 1 token ≈ 3 Chinese chars / 4 English chars.
/// 8000 chars ≈ ~2500-3000 tokens, leaving room for tools + response.
const CONTEXT_CHAR_BUDGET: usize = 24_000;

pub struct ContextManager {
    pub tools: Vec<ToolDef>,
}

impl ContextManager {
    pub fn new(tools: Vec<ToolDef>) -> Self {
        Self { tools }
    }

    // ─── Session Creation ─────────────────────────────────────────

    /// Build the initial SessionState for a new agent run.
    pub fn new_session(
        &self,
        goal: &str,
        system_prompt: Option<&str>,
        allowed_paths: Option<Vec<String>>,
        max_rounds: u32,
        experience_hint: Option<String>,
    ) -> SessionState {
        let session_id = uuid::Uuid::new_v4().to_string();

        // Build the system prompt
        let mut sys = if let Some(sp) = system_prompt {
            sp.to_string()
        } else {
            build_default_system_prompt()
        };

        // Inject few-shot experience hints if available
        if let Some(hint) = experience_hint {
            sys.push_str("\n\n## 历史成功经验参考\n");
            sys.push_str(&hint);
        }

        let messages = vec![
            Message::system(sys),
            Message::user(goal),
        ];

        SessionState {
            session_id,
            goal: goal.to_string(),
            messages,
            round: 0,
            max_rounds,
            tools: self.tools.clone(),
            allowed_paths,
        }
    }

    // ─── Message Appending ────────────────────────────────────────

    /// Append the LLM's assistant message to history.
    pub fn append_assistant(&self, sess: &mut SessionState, msg: Message) {
        sess.messages.push(msg);
    }

    /// Append tool execution results back into conversation history.
    /// Each ToolResult becomes a role=tool message.
    pub fn append_tool_results(&self, sess: &mut SessionState, results: &[ToolResult]) {
        for r in results {
            // Truncate extremely long outputs
            let content = if r.content.len() > MAX_TOOL_RESULT_CHARS {
                format!(
                    "{}\n\n[output truncated: {} chars total]",
                    &r.content[..MAX_TOOL_RESULT_CHARS],
                    r.content.len()
                )
            } else {
                r.content.clone()
            };

            // Prefix with status icon so LLM can easily see success/failure
            let prefixed = if r.success {
                format!("✅ {content}")
            } else {
                format!("❌ 工具执行失败: {content}")
            };

            sess.messages.push(Message::tool_result(
                &r.call_id,
                &r.tool_name,
                prefixed,
            ));
        }
    }

    // ─── Token Budget Management ──────────────────────────────────

    /// Ensure total message content stays within CONTEXT_CHAR_BUDGET.
    /// Strategy: keep system + user(goal), then drop oldest middle messages.
    pub fn trim_to_budget(&self, sess: &mut SessionState) {
        let total: usize = sess.messages.iter()
            .map(|m| m.content.as_deref().map(|c| c.len()).unwrap_or(0))
            .sum();

        if total <= CONTEXT_CHAR_BUDGET {
            return;
        }

        app_log!("CONTEXT", "trimming: {} chars > budget {}",
                 total, CONTEXT_CHAR_BUDGET);

        // Always preserve: messages[0] = system, messages[1] = user(goal)
        // Remove messages from index 2 one-by-one until under budget
        let mut chars = total;
        let mut i = 2usize;
        while chars > CONTEXT_CHAR_BUDGET && i < sess.messages.len() {
            let removed_len = sess.messages[i].content.as_deref()
                .map(|c| c.len()).unwrap_or(0);
            // Don't remove the very last message (it's the most recent context)
            if i < sess.messages.len() - 1 {
                sess.messages.remove(i);
                chars = chars.saturating_sub(removed_len);
            } else {
                i += 1;
            }
        }

        app_log!("CONTEXT", "after trim: {} messages, ~{} chars",
                 sess.messages.len(), chars);
    }
}

// ─── Default System Prompt ─────────────────────────────────────────

fn build_default_system_prompt() -> String {
    r#"你是一个专业的通信工程项目助手 Agent。

## 核心行为准则
1. **使用工具完成任务**：你拥有文件读写、Office文档生成、网络抓取、系统命令等工具。你必须通过调用工具来完成任务，而不是仅仅描述如何做。
2. **观察工具结果，动态调整**：每次工具调用后，仔细阅读返回结果。如果失败，分析原因并尝试修正（换参数、换工具、换路径等）。
3. **逐步推进**：将复杂任务分解为小步骤，每步调用一个工具，观察结果，再决定下一步。
4. **明确告知完成状态**：所有工具调用结束后，用中文总结你完成了什么、生成了哪些文件。

## 工具使用规则
- 文件路径必须使用 Windows 绝对路径（如 `C:\Users\29136\Desktop\报告.docx`）
- 不确定路径时，先用 `file_list` 查看目录内容
- 创建 Office 文档时，优先使用 `word_write`、`excel_write`、`ppt_create`

## 完成标志
当所有任务执行完毕，直接输出最终的中文总结（不再调用工具），说明完成了什么。"#.to_string()
}
