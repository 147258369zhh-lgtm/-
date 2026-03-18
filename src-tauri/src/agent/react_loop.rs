use super::types::*;
use super::llm_client::LlmClient;
use super::context::ContextManager;
use super::tool_runtime;
use super::memory;
use tauri::{AppHandle, Emitter};
use crate::app_log;
use std::time::Instant;

// ═══════════════════════════════════════════════════════════════
// Agent V5 — ReAct Loop Engine
//
// Architecture (inspired by Claude Code):
//   loop {
//     1. LLM call: messages[] + tools[] → response
//     2. If response has tool_calls → execute tools, append results, continue
//     3. If response has plain text → done (final answer)
//     4. If max_rounds exceeded → abort
//   }
//
// No pre-planning. LLM dynamically decides tools each round.
// ═══════════════════════════════════════════════════════════════

pub async fn run(
    mut session: SessionState,
    llm: &LlmClient,
    ctx: &ContextManager,
    pool: &sqlx::SqlitePool,
    app: &AppHandle,
) -> AgentRunResult {
    app_log!("REACT", "═══ Session {} START (max_rounds={}) ═══",
             &session.session_id[..8], session.max_rounds);

    let session_start = Instant::now();

    loop {
        // ── Guard: max rounds ──────────────────────────────────────
        if session.round >= session.max_rounds {
            app_log!("REACT", "max_rounds {} exceeded", session.max_rounds);
            emit_event(app, "done", session.round, None, None, None,
                Some(&format!("⚠️ 已达最大轮数限制 ({}轮)", session.max_rounds)), None);
            let elapsed = session_start.elapsed().as_millis() as u64;
            return AgentRunResult {
                success: false,
                final_answer: format!("任务已达最大轮数限制 ({})", session.max_rounds),
                steps: vec![],
                total_rounds: session.round,
                error: Some("max_rounds exceeded".into()),
            };
        }

        session.round += 1;
        app_log!("REACT", "─── Round {} ───", session.round);

        // ── Emit: thinking ────────────────────────────────────────
        emit_event(app, "thinking", session.round, None, None, None,
            Some(&format!("🧠 第 {} 轮推理中...", session.round)), None);

        // ── Context trimming ──────────────────────────────────────
        ctx.trim_to_budget(&mut session);

        // ── LLM Call ───────────────────────────────────────────────
        let llm_start = Instant::now();
        let response = match llm.chat_with_tools(
            &session.messages,
            &session.tools,
            Some(app),
            session.round,
        ).await {
            Ok(r) => r,
            Err(e) => {
                app_log!("REACT", "[round {}] LLM error: {}", session.round, e);
                emit_event(app, "error", session.round, None, None, None,
                    Some(&format!("❌ LLM 调用失败: {e}")), None);
                return AgentRunResult {
                    success: false,
                    final_answer: format!("LLM 调用失败: {e}"),
                    steps: vec![], total_rounds: session.round,
                    error: Some(e),
                };
            }
        };
        let llm_elapsed = llm_start.elapsed().as_millis() as u64;

        // ── Evaluate Response ──────────────────────────────────────
        match response.into_action() {

            // ── Case A: Tool Calls ─────────────────────────────────
            LoopAction::CallTools(tool_calls) => {
                app_log!("REACT", "[round {}] {} tool call(s)", session.round, tool_calls.len());

                // Append assistant's tool_call message to history
                let assistant_msg = Message::assistant_tool_calls(tool_calls.clone());
                ctx.append_assistant(&mut session, assistant_msg);

                // Execute each tool call
                let mut results: Vec<ToolResult> = Vec::new();
                for tc in &tool_calls {
                    let args = tc.parsed_args();
                    app_log!("REACT", "  CALL {} (id={})", tc.function.name, &tc.id[..8.min(tc.id.len())]);

                    // Emit tool_call event
                    emit_event(app, "tool_call", session.round,
                        Some(&tc.function.name), Some(&args), None,
                        Some(&format!("🔧 调用工具: {}", tc.function.name)), None);

                    // Execute with per-tool timeout
                    let tool_start = Instant::now();
                    let exec_result = tokio::time::timeout(
                        std::time::Duration::from_secs(90),
                        tool_runtime::execute_tool(
                            &tc.function.name, &args,
                            pool, &session.allowed_paths, app,
                        ),
                    ).await;

                    let duration_ms = tool_start.elapsed().as_millis() as u64;

                    let (content, success) = match exec_result {
                        Ok(Ok(out)) => {
                            app_log!("REACT", "  ✅ {} → {}ms, {} chars",
                                     tc.function.name, duration_ms, out.len());
                            (out, true)
                        }
                        Ok(Err(e)) => {
                            app_log!("REACT", "  ❌ {} FAILED: {}", tc.function.name, e);
                            (format!("工具执行失败: {e}"), false)
                        }
                        Err(_) => {
                            app_log!("REACT", "  ⏱️ {} TIMEOUT", tc.function.name);
                            (format!("工具超时 (90s): {}", tc.function.name), false)
                        }
                    };

                    // Emit tool_result event
                    emit_event(app, "tool_result", session.round,
                        Some(&tc.function.name), Some(&args),
                        Some(&content),
                        Some(&if success {
                            format!("✅ {} 完成 ({}ms)", tc.function.name, duration_ms)
                        } else {
                            format!("❌ {} 失败", tc.function.name)
                        }),
                        Some(duration_ms));

                    results.push(ToolResult {
                        call_id: tc.id.clone(),
                        tool_name: tc.function.name.clone(),
                        content,
                        success,
                        duration_ms,
                    });
                }

                // Append all tool results to conversation history
                ctx.append_tool_results(&mut session, &results);

                // Emit step_done
                emit_event(app, "step_done", session.round, None, None, None,
                    Some(&format!("✅ 第 {} 轮完成，继续推理...", session.round)),
                    Some(llm_elapsed));
            }

            // ── Case B: Final Answer ───────────────────────────────
            LoopAction::FinalAnswer(answer) => {
                let total_elapsed = session_start.elapsed().as_millis() as u64;
                app_log!("REACT", "═══ DONE after {} rounds ({}ms) ═══",
                         session.round, total_elapsed);

                emit_event(app, "done", session.round, None, None, None,
                    Some(&answer), Some(total_elapsed));

                // Save to long-term memory
                memory::save_experience(&session, &answer, pool).await;

                return AgentRunResult {
                    success: true,
                    final_answer: answer,
                    steps: vec![],
                    total_rounds: session.round,
                    error: None,
                };
            }

            // ── Case C: Error ──────────────────────────────────────
            LoopAction::Error(e) => {
                app_log!("REACT", "[round {}] loop error: {}", session.round, e);
                emit_event(app, "error", session.round, None, None, None,
                    Some(&format!("❌ {e}")), None);
                return AgentRunResult {
                    success: false,
                    final_answer: format!("执行出错: {e}"),
                    steps: vec![], total_rounds: session.round,
                    error: Some(e),
                };
            }
        }
    }
}

// ─── Event Emitter Helper ──────────────────────────────────────────

fn emit_event(
    app: &AppHandle,
    event_type: &str,
    round: u32,
    tool_name: Option<&str>,
    tool_args: Option<&serde_json::Value>,
    tool_result: Option<&str>,
    content: Option<&str>,
    duration_ms: Option<u64>,
) {
    let step = AgentStep {
        round,
        step_type: event_type.to_string(),
        tool_name: tool_name.map(|s| s.to_string()),
        tool_args: tool_args.cloned(),
        tool_result: tool_result.map(|s| s.to_string()),
        content: content.map(|s| s.to_string()),
        duration_ms,
    };
    let msg = content.map(|s| s[..s.len().min(300)].to_string());
    let _ = app.emit("agent-event", AgentEvent {
        event_type: event_type.to_string(),
        step: Some(step),
        message: msg,
    });
}
