use super::types::*;
use super::tool_runtime;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use crate::app_log;

// ═══════════════════════════════════════════════
// Step Executor v3.0 — Deterministic Tool Dispatch
// ═══════════════════════════════════════════════
//
// 核心变化：不再调用 LLM！
// Planner 已经输出了 {tool, args}，Executor 直接调用 tool_runtime。
// 这消除了所有 LLM function-calling 兼容性问题。

/// 确定性执行单步：直接调用 tool_runtime，不做 LLM 请求
pub async fn execute_step_direct(
    step: &PlanStep,
    prev_result: Option<&str>,
    pool: &sqlx::SqlitePool,
    app_handle: &AppHandle,
    allowed_paths: &Option<Vec<String>>,
) -> Result<String, String> {
    let tool_name = step.tool.trim();
    if tool_name.is_empty() {
        return Err(format!("步骤 {} 未指定工具名", step.id));
    }

    // ── 1. 注入 prev_result 占位符 ──
    let mut args = step.args.clone();
    inject_prev_result(&mut args, prev_result);

    app_log!("EXECUTOR", "[step {}] DIRECT CALL: tool={}, args={}",
        step.id, tool_name, &serde_json::to_string(&args).unwrap_or_default()[..200.min(serde_json::to_string(&args).unwrap_or_default().len())]);

    // ── 2. Emit tool_call event (让画布节点亮起呼吸灯) ──
    let call_step = AgentStep {
        round: step.id,
        step_type: "tool_call".into(),
        tool_name: Some(tool_name.to_string()),
        tool_args: Some(args.clone()),
        tool_result: None,
        content: None,
        duration_ms: None,
    };
    let _ = app_handle.emit("agent-event", AgentEvent {
        event_type: "tool_call".into(),
        step: Some(call_step),
        message: Some(format!("正在执行: {}", tool_name)),
    });

    // ── 3. 带超时地执行工具 ──
    let start = std::time::Instant::now();
    let result = match tokio::time::timeout(
        std::time::Duration::from_secs(60),
        tool_runtime::execute_tool(tool_name, &args, pool, allowed_paths, app_handle)
    ).await {
        Ok(Ok(output)) => {
            let elapsed = start.elapsed().as_millis() as u64;
            app_log!("EXECUTOR", "[step {}] ✅ SUCCESS: {}ms, output_len={}",
                step.id, elapsed, output.len());

            // Emit tool_result event (让画布节点变绿)
            let result_step = AgentStep {
                round: step.id,
                step_type: "tool_result".into(),
                tool_name: Some(tool_name.to_string()),
                tool_args: Some(args.clone()),
                tool_result: Some(output.clone()),
                content: None,
                duration_ms: Some(elapsed),
            };
            let _ = app_handle.emit("agent-event", AgentEvent {
                event_type: "tool_result".into(),
                step: Some(result_step),
                message: Some(format!("{} 执行成功", tool_name)),
            });

            Ok(output)
        }
        Ok(Err(e)) => {
            let elapsed = start.elapsed().as_millis() as u64;
            app_log!("EXECUTOR", "[step {}] ❌ TOOL ERROR: {} ({}ms)",
                step.id, &e, elapsed);

            // Emit error event (让画布节点变红)
            let err_step = AgentStep {
                round: step.id,
                step_type: "tool_result".into(),
                tool_name: Some(tool_name.to_string()),
                tool_args: Some(args.clone()),
                tool_result: Some(format!("ERROR: {}", &e)),
                content: Some(format!("❌ {}", &e)),
                duration_ms: Some(elapsed),
            };
            let _ = app_handle.emit("agent-event", AgentEvent {
                event_type: "tool_result".into(),
                step: Some(err_step),
                message: Some(format!("{} 执行失败: {}", tool_name, &e)),
            });

            Err(e)
        }
        Err(_) => {
            app_log!("EXECUTOR", "[step {}] ⏰ TIMEOUT: {} exceeded 60s", step.id, tool_name);

            let timeout_step = AgentStep {
                round: step.id,
                step_type: "tool_result".into(),
                tool_name: Some(tool_name.to_string()),
                tool_args: Some(args),
                tool_result: Some("ERROR: 执行超时(60s)".into()),
                content: Some("⏰ 工具执行超时".into()),
                duration_ms: Some(60_000),
            };
            let _ = app_handle.emit("agent-event", AgentEvent {
                event_type: "tool_result".into(),
                step: Some(timeout_step),
                message: Some(format!("{} 执行超时(60s)", tool_name)),
            });

            Err(format!("工具 {} 执行超时(60s)", tool_name))
        }
    };

    result
}

/// 将 prev_result 注入 args 中所有包含 "{{prev_result}}" 的字符串值
fn inject_prev_result(args: &mut Value, prev_result: Option<&str>) {
    let prev = prev_result.unwrap_or("");
    match args {
        Value::Object(map) => {
            for (_key, val) in map.iter_mut() {
                inject_prev_result(val, Some(prev));
            }
        }
        Value::String(s) => {
            if s.contains("{{prev_result}}") {
                *s = s.replace("{{prev_result}}", prev);
            }
        }
        Value::Array(arr) => {
            for val in arr.iter_mut() {
                inject_prev_result(val, Some(prev));
            }
        }
        _ => {}
    }
}
