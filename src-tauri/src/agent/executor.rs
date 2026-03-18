use super::types::*;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use crate::app_log;

// ═══════════════════════════════════════════════
// Step Executor v2.0 — Enhanced Context + Smart Retry
// ═══════════════════════════════════════════════

/// Execute a single plan step using LLM with tool calling
/// v2: Enhanced step context, smart retry, better tool guidance
pub async fn execute_step(
    ctx: &mut AgentContext,
    step: &mut PlanStep,
    llm: &LlmConfig,
    client: &reqwest::Client,
    pool: &sqlx::SqlitePool,
    app_handle: &AppHandle,
    allowed_paths: &Option<Vec<String>>,
    steps_log: &mut Vec<AgentStep>,
) -> Result<String, String> {
    step.status = StepStatus::Running;

    // Emit step start event
    let step_event = AgentStep {
        round: step.id,
        step_type: "planning".into(),
        tool_name: None,
        tool_args: None,
        tool_result: None,
        content: Some(format!("▶ 步骤 {}: {}", step.id, step.task)),
        duration_ms: None,
    };
    let _ = app_handle.emit("agent-event", AgentEvent {
        event_type: "step_start".into(),
        step: Some(step_event.clone()),
        message: Some(format!("开始执行步骤 {}: {}", step.id, step.task)),
    });
    steps_log.push(step_event);

    // ── Build enhanced step instruction ──
    // Include previous step results for data flow continuity
    let prev_context = if !ctx.completed_steps.is_empty() {
        let last_step = ctx.completed_steps.last().unwrap();
        let result_preview = last_step.result.as_deref().unwrap_or("");
        let truncated = if result_preview.len() > 1500 {
            format!("{}...(截断)", &result_preview[..1500])
        } else {
            result_preview.to_string()
        };
        format!(
            "\n## 上一步结果（供参考）\n步骤 {}: {}\n结果: {}\n",
            last_step.id, last_step.task, truncated
        )
    } else {
        String::new()
    };

    // Extract tool hint from step description
    let tool_hint = super::prompt_builder::extract_tool_hint(&step.task);
    let tool_guidance = if let Some(ref hint) = tool_hint {
        format!(
            "\n**你必须调用 `{}` 工具来完成此步骤。** 不要使用其他工具。不要返回文本回复。立即调用 `{}`。\n",
            hint, hint
        )
    } else {
        "\n你必须调用一个工具来完成此步骤。不要返回文本回复。立即调用工具。\n".to_string()
    };

    let tool_names: Vec<String> = ctx.tools.iter().map(|t| t.function.name.clone()).collect();
    let step_instruction = format!(
        "## 执行指令\n执行步骤 {step_id}: {step_task}\n{prev_context}{tool_guidance}\n可用工具: {tools}",
        step_id = step.id,
        step_task = step.task,
        prev_context = prev_context,
        tool_guidance = tool_guidance,
        tools = tool_names.join(", ")
    );
    ctx.messages.push(json!({"role": "user", "content": step_instruction}));

    // Serialize tools
    let tools_json: Vec<Value> = ctx
        .tools
        .iter()
        .map(|t| serde_json::to_value(t).unwrap())
        .collect();

    // Multi-turn tool loop for this step (max 6 tool rounds per step)
    let mut step_result = String::new();
    let mut text_retry_count = 0u32;
    let max_text_retries = 2u32;
    let mut tool_fail_count = 0u32;  // Per-step tool failure counter
    let max_tool_failures = 2u32;    // Max 2 failures per step, then force-skip

    // Bug 3 fix: 重复行为检测 — 跟踪最近工具调用签名
    let mut recent_tool_signatures: Vec<String> = Vec::new();

    for _tool_round in 0..6 {
        // ── Context compression via context_manager ──
        super::context_manager::compress_messages(&mut ctx.messages);
        app_log!("EXECUTOR", "[step {}] tool_round={}, messages_count={}, tools_count={}", step.id, _tool_round, ctx.messages.len(), tools_json.len());

        let mut payload = json!({
            "model": llm.model_name,
            "messages": ctx.messages,
            "temperature": 0.05
        });
        if !tools_json.is_empty() {
            payload["tools"] = json!(tools_json);
            // v3.1: Use "auto" for broader model compatibility (many SiliconFlow models don't support "required")
            payload["tool_choice"] = json!("auto");
        }

        let start = std::time::Instant::now();
        let mut request = client.post(&llm.endpoint).json(&payload);
        if !llm.api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", llm.api_key));
        }

        let resp = match tokio::time::timeout(
            std::time::Duration::from_secs(90),
            request.send()
        ).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => return Err(format!("LLM 请求失败: {}", e)),
            Err(_) => {
                app_log!("EXECUTOR", "[step {}] ⏰ TIMEOUT: LLM call exceeded 90s", step.id);
                return Err("LLM 响应超时(90s)，请检查网络或更换模型".into());
            }
        };

        // ── Compatibility fallback: if 400 error with tools, retry without tools ──
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            app_log!("EXECUTOR", "[step {}] LLM ERROR status={} body={}", step.id, status, &body[..body.len().min(1000)]);

            // If it's a 400/422 error (likely tool_choice or tools not supported),
            // retry without tools — let the model respond with text instructions
            if (status.as_u16() == 400 || status.as_u16() == 422) && !tools_json.is_empty() {
                app_log!("EXECUTOR", "[step {}] Retrying WITHOUT tools (model may not support function calling)", step.id);

                let fallback_payload = json!({
                    "model": llm.model_name,
                    "messages": ctx.messages,
                    "temperature": 0.05
                });

                let mut fallback_req = client.post(&llm.endpoint).json(&fallback_payload);
                if !llm.api_key.is_empty() {
                    fallback_req = fallback_req.header("Authorization", format!("Bearer {}", llm.api_key));
                }

                let fallback_resp = fallback_req.send().await
                    .map_err(|e| format!("降级请求失败: {}", e))?;

                if !fallback_resp.status().is_success() {
                    let fb_body = fallback_resp.text().await.unwrap_or_default();
                    return Err(format!("LLM 响应错误（降级也失败）: {}", fb_body));
                }

                let fb_json: Value = match fallback_resp.json().await {
                    Ok(j) => j,
                    Err(e) => return Err(format!("降级 JSON 解析失败: {}", e)),
                };
                let fb_content = fb_json.get("choices")
                    .and_then(|c| c.as_array())
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("")
                    .to_string();

                // Use the text response as the step result
                let done_step = AgentStep {
                    round: step.id,
                    step_type: "step_done".into(),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    content: Some(format!("[降级模式] {}", fb_content)),
                    duration_ms: Some(start.elapsed().as_millis() as u64),
                };
                let _ = app_handle.emit("agent-event", AgentEvent {
                    event_type: "step_done".into(),
                    step: Some(done_step.clone()),
                    message: Some(format!("步骤 {} 降级完成", step.id)),
                });
                steps_log.push(done_step);
                ctx.messages.push(json!({"role": "assistant", "content": fb_content}));
                step_result = fb_content;
                break;
            }

            return Err(format!("LLM 响应错误: {}", body));
        }

        let json_resp: Value = match resp.json().await {
            Ok(j) => j,
            Err(e) => return Err(format!("主流程 JSON 解析失败: {}", e)),
        };
        let elapsed = start.elapsed().as_millis() as u64;

        let message = json_resp.get("choices")
            .and_then(|c| c.as_array())
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .ok_or_else(|| {
                let err_msg = json_resp.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("未知格式");
                format!("模型返回非法格式: {}", err_msg)
            })?;
            
        let finish_reason = json_resp.get("choices").and_then(|c| c.as_array()).and_then(|c| c.get(0)).and_then(|c| c.get("finish_reason")).and_then(|f| f.as_str()).unwrap_or("unknown");
        let has_tool_calls = message.get("tool_calls").map(|tc| tc.is_array()).unwrap_or(false);
        let msg_content = message.get("content").and_then(|c| c.as_str()).unwrap_or("");
        app_log!("EXECUTOR", "[step {}] LLM: finish={}, tools={}, content_len={}, {}ms", step.id, finish_reason, has_tool_calls, msg_content.len(), elapsed);

        if let Some(tool_calls) = message["tool_calls"].as_array() {
            // LLM wants to call tools — process them
            ctx.messages.push(message.clone());
            text_retry_count = 0; // Reset retry counter on successful tool call

            for tc in tool_calls {
                let tc_id = tc["id"].as_str().unwrap_or("").to_string();
                let func = &tc["function"];
                let tool_name = func["name"].as_str().unwrap_or("unknown");
                let args_str = func["arguments"].as_str().unwrap_or("{}");
                let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));

                app_log!("EXECUTOR", "[step {}] TOOL: {} args={}", step.id, tool_name, &args_str[..args_str.len().min(500)]);

                // Bug 3 fix: 重复行为检测
                let sig = format!("{}:{}", tool_name, &args_str[..args_str.len().min(80)]);
                recent_tool_signatures.push(sig.clone());
                let repeat_count = recent_tool_signatures.iter().filter(|s| {
                    // 同一工具名即视为相似调用
                    s.starts_with(&format!("{}:", tool_name))
                }).count();
                if repeat_count >= 3 {
                    app_log!("EXECUTOR", "[step {}] ⛔ REPETITION DETECTED: {} called {} times, breaking loop",
                        step.id, tool_name, repeat_count);
                    let repeat_step = AgentStep {
                        round: step.id,
                        step_type: "reflection".into(),
                        tool_name: Some(tool_name.to_string()),
                        tool_args: None, tool_result: None,
                        content: Some(format!("⛔ 检测到重复行为: `{}` 已被调用 {} 次，终止循环", tool_name, repeat_count)),
                        duration_ms: None,
                    };
                    let _ = app_handle.emit("agent-event", AgentEvent {
                        event_type: "reflection".into(),
                        step: Some(repeat_step.clone()),
                        message: Some(format!("重复检测: {} 被调用 {} 次", tool_name, repeat_count)),
                    });
                    steps_log.push(repeat_step);
                    return Err(format!("工具 {} 重复调用 {} 次，步骤终止", tool_name, repeat_count));
                }

                // Emit tool_call event
                let call_step = AgentStep {
                    round: step.id,
                    step_type: "tool_call".into(),
                    tool_name: Some(tool_name.to_string()),
                    tool_args: Some(args.clone()),
                    tool_result: None,
                    content: None,
                    duration_ms: Some(elapsed),
                };
                let _ = app_handle.emit("agent-event", AgentEvent {
                    event_type: "tool_call".into(),
                    step: Some(call_step.clone()),
                    message: Some(format!("调用工具: {}", tool_name)),
                });
                steps_log.push(call_step);

                // Execute tool
                let tool_start = std::time::Instant::now();
                let result = super::tool_runtime::execute_tool(
                    tool_name, &args, pool, allowed_paths, app_handle,
                ).await;
                let tool_elapsed = tool_start.elapsed().as_millis() as u64;

                let (result_str, tool_success) = match &result {
                    Ok(s) => (s.clone(), true),
                    Err(e) => (format!("工具执行错误: {}", e), false),
                };

                // Emit tool_result event
                let result_step = AgentStep {
                    round: step.id,
                    step_type: "tool_result".into(),
                    tool_name: Some(tool_name.to_string()),
                    tool_args: None,
                    tool_result: Some(if result_str.len() > 500 { format!("{}...", &result_str[..500]) } else { result_str.clone() }),
                    content: None,
                    duration_ms: Some(tool_elapsed),
                };
                let _ = app_handle.emit("agent-event", AgentEvent {
                    event_type: "tool_result".into(),
                    step: Some(result_step.clone()),
                    message: Some(format!("{} {}", tool_name, if tool_success { "✅" } else { "❌" })),
                });
                steps_log.push(result_step);

                // Truncate large results for message context
                let truncated_result = if result_str.len() > 6000 {
                    format!("{}...\n\n[结果已截断，原始长度: {} 字符]", &result_str[..6000], result_str.len())
                } else {
                    result_str.clone()
                };
                ctx.messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": truncated_result,
                }));

                // Save to memory
                super::memory::save_memory(pool, &ctx.task_id, step.id, "tool", Some(&result_str), Some(&tc_id), Some(tool_name)).await;

                if !tool_success {
                    tool_fail_count += 1;

                    // ── CRITICAL: Stop retrying after max failures ──
                    if tool_fail_count >= max_tool_failures {
                        app_log!("EXECUTOR", "[step {}] Tool {} failed {} times, force-skipping step", step.id, tool_name, tool_fail_count);
                        let skip_msg = format!("⛔ 工具 `{}` 连续失败 {} 次，跳过此步骤。错误: {}", tool_name, tool_fail_count, &result_str[..result_str.len().min(200)]);
                        let skip_step = AgentStep {
                            round: step.id,
                            step_type: "reflection".into(),
                            tool_name: Some(tool_name.to_string()),
                            tool_args: None,
                            tool_result: None,
                            content: Some(skip_msg.clone()),
                            duration_ms: None,
                        };
                        let _ = app_handle.emit("agent-event", AgentEvent {
                            event_type: "reflection".into(),
                            step: Some(skip_step.clone()),
                            message: Some(format!("跳过步骤: {} 连续失败", tool_name)),
                        });
                        steps_log.push(skip_step);
                        ctx.failure_count += 1;
                        step_result = format!("步骤失败: {}", result_str);
                        // Break out of the tool loop — this step is done (failed)
                        return Err(format!("工具 {} 连续失败 {} 次: {}", tool_name, tool_fail_count, &result_str[..result_str.len().min(300)]));
                    }

                    // First failure: inject smart reflection and retry once
                    let reflection_msg = super::reflection::build_smart_reflection(tool_name, &result_str, &step.task);
                    ctx.messages.push(json!({"role": "system", "content": reflection_msg}));

                    let refl_step = AgentStep {
                        round: step.id,
                        step_type: "reflection".into(),
                        tool_name: Some(tool_name.to_string()),
                        tool_args: None,
                        tool_result: None,
                        content: Some(format!("分析 {} 失败原因（{}/{}次）...", tool_name, tool_fail_count, max_tool_failures)),
                        duration_ms: None,
                    };
                    let _ = app_handle.emit("agent-event", AgentEvent {
                        event_type: "reflection".into(),
                        step: Some(refl_step.clone()),
                        message: Some("Agent 反思中...".into()),
                    });
                    steps_log.push(refl_step);

                    ctx.failure_count += 1;
                }

                step_result = result_str;
            }

            // Continue inner loop for more tool calls
            continue;
        }

        // ── No tool calls — LLM gave text response ──
        let content = message["content"].as_str().unwrap_or("").to_string();

        // Smart retry: if we have tools and LLM isn't calling them
        if text_retry_count < max_text_retries && !tools_json.is_empty() {
            text_retry_count += 1;

            let retry_msg = if let Some(ref hint) = tool_hint {
                // We know which tool should be used — be very specific
                format!(
                    "⚠️ 你必须调用 `{}` 工具。不要返回文本回复。\n\n请立即调用 `{}` 工具，参数如下：\n{}",
                    hint, hint,
                    get_tool_usage_example(hint)
                )
            } else if _tool_round == 0 {
                format!(
                    "⚠️ 你必须通过调用工具来完成此任务。不要返回文本。\n\n\
                     可用工具: {}\n\n\
                     请选择最合适的工具并立即调用。",
                    tool_names.join(", ")
                )
            } else {
                "你必须调用工具函数完成此步骤。直接调用工具，不要回复文本。".to_string()
            };

            app_log!("EXECUTOR", "[step {}] LLM returned text, smart retry #{} (hint={:?})", step.id, text_retry_count, tool_hint);
            ctx.messages.push(json!({"role": "user", "content": retry_msg}));
            continue;
        }

        // Accept text response if we've exhausted retries or this is a summarization step
        let done_step = AgentStep {
            round: step.id,
            step_type: "step_done".into(),
            tool_name: None,
            tool_args: None,
            tool_result: None,
            content: Some(content.clone()),
            duration_ms: Some(elapsed),
        };
        let _ = app_handle.emit("agent-event", AgentEvent {
            event_type: "step_done".into(),
            step: Some(done_step.clone()),
            message: Some(format!("步骤 {} 完成", step.id)),
        });
        steps_log.push(done_step);

        ctx.messages.push(json!({"role": "assistant", "content": content}));
        super::memory::save_memory(pool, &ctx.task_id, step.id, "assistant", Some(&content), None, None).await;

        // Use text content as step result if we don't have a tool result
        if step_result.is_empty() {
            step_result = content;
        }
        break;
    }

    Ok(step_result)
}

/// Provide a tool-specific usage example for the retry prompt
fn get_tool_usage_example(tool_name: &str) -> String {
    match tool_name {
        "web_scrape" => r#"调用示例: web_scrape({"url": "https://news.sina.com.cn", "selector": "h3,a"})"#.into(),
        "file_read" => r#"调用示例: file_read({"path": "C:\\Users\\...\\file.txt"})"#.into(),
        "file_write" => r#"调用示例: file_write({"path": "C:\\Users\\...\\output.txt", "content": "内容"})"#.into(),
        "file_list" => r#"调用示例: file_list({"path": "C:\\Users\\...\\folder"})"#.into(),
        "excel_read" => r#"调用示例: excel_read({"path": "C:\\Users\\...\\data.xlsx"})"#.into(),
        "excel_write" => r#"调用示例: excel_write({"path": "C:\\...\\out.xlsx", "data": "[{\"col1\":\"val1\"}]"})"#.into(),
        "excel_analyze" => r#"调用示例: excel_analyze({"path": "C:\\...\\data.xlsx", "analysis": "统计每列的非空数量"})"#.into(),
        "browser_navigate" => r#"调用示例: browser_navigate({"url": "https://www.example.com"})"#.into(),
        "shell_run" => r#"调用示例: shell_run({"command": "Get-Date"})"#.into(),
        "data_merge" => r#"调用示例: data_merge({"input_paths": "C:\\a.csv;C:\\b.csv", "output_path": "C:\\merged.xlsx"})"#.into(),
        "csv_to_excel" => r#"调用示例: csv_to_excel({"input_path": "C:\\data.csv", "output_path": "C:\\data.xlsx"})"#.into(),
        "pdf_read" => r#"调用示例: pdf_read({"path": "C:\\...\\doc.pdf"})"#.into(),
        "json_process" => r#"调用示例: json_process({"input": "{\"key\":\"value\"}", "operation": "format"})"#.into(),
        "report_generate" => r#"调用示例: report_generate({"code": "from docx import Document; ...", "output_path": "C:\\report.docx"})"#.into(),
        "chart_generate" => r#"调用示例: chart_generate({"code": "import matplotlib.pyplot as plt; ...", "output_path": "C:\\chart.png"})"#.into(),
        "translate_text" => r#"调用示例: translate_text({"text": "Hello world", "target_lang": "zh"})"#.into(),
        "image_process" => r#"调用示例: image_process({"code": "from PIL import Image; ..."})"#.into(),
        "qrcode_generate" => r#"调用示例: qrcode_generate({"data": "https://example.com", "output_path": "C:\\qr.png"})"#.into(),
        _ => format!("请立即调用 {} 工具，使用正确的参数格式。", tool_name),
    }
}
