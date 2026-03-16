use super::types::*;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

// ═══════════════════════════════════════════════
// Step Executor — executes PlanSteps via LLM + tools
// ═══════════════════════════════════════════════

/// Execute a single plan step using LLM with tool calling
/// Returns the step result text, and mutates messages in place
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

    // Build step-specific prompt
    let step_prompt = super::prompt_builder::build_executor_prompt(ctx, step);

    // Replace system message with step prompt
    if !ctx.messages.is_empty() {
        ctx.messages[0] = json!({"role": "system", "content": step_prompt});
    }

    // Serialize tools
    let tools_json: Vec<Value> = ctx
        .tools
        .iter()
        .map(|t| serde_json::to_value(t).unwrap())
        .collect();

    // Multi-turn tool loop for this step (max 5 tool rounds per step)
    let mut step_result = String::new();

    for _tool_round in 0..5 {
        let payload = json!({
            "model": llm.model_name,
            "messages": ctx.messages,
            "tools": tools_json,
            "tool_choice": "auto",
            "temperature": 0.2
        });

        let start = std::time::Instant::now();
        let mut request = client.post(&llm.endpoint).json(&payload);
        if !llm.api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", llm.api_key));
        }

        let resp = request
            .send()
            .await
            .map_err(|e| format!("LLM 请求失败: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("LLM 响应错误: {}", body));
        }

        let json_resp: Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON 解析失败: {}", e))?;
        let elapsed = start.elapsed().as_millis() as u64;

        let message = &json_resp["choices"][0]["message"];

        if let Some(tool_calls) = message["tool_calls"].as_array() {
            // LLM wants to call tools
            ctx.messages.push(message.clone());

            for tc in tool_calls {
                let tc_id = tc["id"].as_str().unwrap_or("").to_string();
                let func = &tc["function"];
                let tool_name = func["name"].as_str().unwrap_or("unknown");
                let args_str = func["arguments"].as_str().unwrap_or("{}");
                let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));

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
                    tool_result: Some(result_str.clone()),
                    content: None,
                    duration_ms: Some(tool_elapsed),
                };
                let _ = app_handle.emit("agent-event", AgentEvent {
                    event_type: "tool_result".into(),
                    step: Some(result_step.clone()),
                    message: Some(format!("{} 完成", tool_name)),
                });
                steps_log.push(result_step);

                // Append tool result to messages
                ctx.messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": result_str,
                }));

                // Save to memory
                super::memory::save_memory(pool, &ctx.task_id, step.id, "tool", Some(&result_str), Some(&tc_id), Some(tool_name)).await;

                if !tool_success {
                    // Inject reflection
                    let reflection_msg = super::reflection::build_reflection_message(tool_name, &result_str);
                    ctx.messages.push(json!({"role": "system", "content": reflection_msg}));

                    let refl_step = AgentStep {
                        round: step.id,
                        step_type: "reflection".into(),
                        tool_name: Some(tool_name.to_string()),
                        tool_args: None,
                        tool_result: None,
                        content: Some("分析失败原因...".into()),
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

        // No tool calls — LLM gave a text response (step done)
        let content = message["content"].as_str().unwrap_or("").to_string();

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

        // Save step result
        ctx.messages.push(json!({"role": "assistant", "content": content}));
        super::memory::save_memory(pool, &ctx.task_id, step.id, "assistant", Some(&content), None, None).await;

        step_result = content;
        break;
    }

    Ok(step_result)
}
