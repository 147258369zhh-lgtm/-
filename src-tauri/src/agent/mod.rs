// ═══════════════════════════════════════════════
// Agent Runtime v2 — Modular Architecture
// ═══════════════════════════════════════════════

pub mod executor;
pub mod memory;
pub mod planner;
pub mod prompt_builder;
pub mod reflection;
pub mod tool_runtime;
pub mod types;

use crate::ai::resolve_ai_config;
use crate::db::DbPool;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use types::*;

// ═══════════════════════════════════════════════
// Agent Run — v2 Step-based Executor
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn agent_run(
    app_handle: AppHandle,
    pool: State<'_, DbPool>,
    req: AgentRunRequest,
) -> Result<AgentRunResult, String> {
    let mut steps_log: Vec<AgentStep> = Vec::new();

    // ── Layer 1: LLM Provider Selection ──
    let config = if let Some(ref config_id) = req.model_config_id {
        sqlx::query_as::<_, crate::ai::AiConfig>(
            "SELECT id, name, provider, api_key, base_url, model_name, is_active, purpose FROM ai_configs WHERE id = ?"
        )
        .bind(config_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| format!("找不到指定的模型配置 '{}': {}", config_id, e))?
    } else {
        match resolve_ai_config(&*pool, Some("agent")).await {
            Ok(cfg) => cfg,
            Err(_) => resolve_ai_config(&*pool, None).await?,
        }
    };

    let provider_info = format!("{} ({})", config.name, config.provider);

    // Build LLM config
    let mut url = config
        .base_url
        .clone()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string())
        .trim()
        .to_string();
    if !url.starts_with("http") {
        url = format!("https://{}", url);
    }
    let is_local = url.contains("localhost") || url.contains("127.0.0.1");
    let is_gemini = url.contains("googleapis.com");

    if is_gemini {
        return Err("Agent 模式目前仅支持 OpenAI 兼容 API（包括 DeepSeek、LM Studio、Ollama 等）。\nGemini API 不支持标准 function calling 格式。\n请在设置中添加一个 OpenAI 兼容引擎。".into());
    }

    let timeout = if is_local {
        std::time::Duration::from_secs(300)
    } else {
        std::time::Duration::from_secs(120)
    };

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(std::time::Duration::from_secs(5))
        .no_proxy()
        .build()
        .map_err(|e| format!("无法构建 HTTP 客户端: {}", e))?;

    let api_key = crate::ai::resolve_local_bearer_token(
        config.api_key.unwrap_or_default().trim().to_string(),
        is_local,
    )
    .await;

    let llm = LlmConfig {
        endpoint: format!("{}/chat/completions", url.trim_end_matches('/')),
        api_key,
        model_name: config.model_name.clone(),
        is_local,
    };

    // ── Layer 4: Memory — Create or Resume Task ──
    let task_id = if let Some(ref existing_id) = req.task_id {
        existing_id.clone()
    } else {
        let new_id = uuid::Uuid::new_v4().to_string();
        let goal = req.goal.as_deref().unwrap_or(&req.prompt);
        let _ = sqlx::query(
            "INSERT INTO agent_tasks (id, goal, status, model_config_id, project_id) VALUES (?, ?, 'running', ?, ?)"
        )
        .bind(&new_id).bind(goal)
        .bind(req.model_config_id.as_deref())
        .bind(req.project_id.as_deref())
        .execute(&*pool).await;
        new_id
    };

    // Ensure v2 tables
    memory::ensure_v2_tables(&*pool).await;

    // Build tools list (filtered by enabled_tools)
    let all_tools = tool_runtime::get_builtin_tools();
    let tools: Vec<ToolDef> = if let Some(ref enabled) = req.enabled_tools {
        all_tools
            .into_iter()
            .filter(|t| enabled.contains(&t.function.name))
            .collect()
    } else {
        all_tools
    };

    // Build system prompt
    let mut system_prompt = req.system_prompt.unwrap_or_else(|| {
        "你是一个专业的通信工程项目 AI 助手。你可以通过调用工具来完成用户的任务。\n\
         当需要操作文件、查询项目数据或执行命令时，请调用相应的工具。\n\
         完成任务后，请给出清晰的总结。如果任务无法完成，请说明原因。\n\
         如果工具调用失败，请分析原因并尝试其他方法。"
            .into()
    });

    // Inject context files
    if let Some(ref files) = req.context_files {
        system_prompt = prompt_builder::inject_context_files(&system_prompt, files).await;
    }

    // Emit start event
    let _ = app_handle.emit(
        "agent-event",
        AgentEvent {
            event_type: "thinking".into(),
            step: None,
            message: Some(format!("Agent 启动中... 使用模型: {}", provider_info)),
        },
    );

    // ── Layer 2: Task Planning ──
    let goal = req.goal.as_deref().unwrap_or(&req.prompt).to_string();

    let plan = match planner::generate_plan(&llm, &client, &goal).await {
        Ok(p) => p,
        Err(_) => {
            // Fallback: single step plan
            AgentPlan {
                steps: vec![PlanStep {
                    id: 1,
                    task: goal.clone(),
                    status: StepStatus::Pending,
                    result: None,
                }],
            }
        }
    };

    // Save plan to DB
    if let Ok(plan_json) = serde_json::to_string(&plan) {
        memory::save_plan(&*pool, &task_id, &plan_json).await;
    }

    // Emit planning result
    let plan_text = plan
        .steps
        .iter()
        .map(|s| format!("{}. {}", s.id, s.task))
        .collect::<Vec<_>>()
        .join("\n");

    let plan_step = AgentStep {
        round: 0,
        step_type: "planning".into(),
        tool_name: None,
        tool_args: None,
        tool_result: None,
        content: Some(format!(
            "📋 任务计划 ({} 步):\n{}",
            plan.steps.len(),
            plan_text
        )),
        duration_ms: None,
    };
    let _ = app_handle.emit(
        "agent-event",
        AgentEvent {
            event_type: "planning".into(),
            step: Some(plan_step.clone()),
            message: Some(format!("已生成 {} 步任务计划", plan.steps.len())),
        },
    );
    steps_log.push(plan_step);

    // Build initial messages
    let messages = vec![
        json!({"role": "system", "content": system_prompt}),
        json!({"role": "user", "content": req.prompt}),
    ];

    // Save initial messages to memory
    memory::save_memory(
        &*pool,
        &task_id,
        0,
        "system",
        Some(&system_prompt),
        None,
        None,
    )
    .await;
    memory::save_memory(&*pool, &task_id, 0, "user", Some(&req.prompt), None, None).await;

    // Build context
    let mut ctx = AgentContext {
        goal: goal.clone(),
        task_id: task_id.clone(),
        plan: Some(plan.clone()),
        current_step_index: 0,
        completed_steps: Vec::new(),
        failure_count: 0,
        tools: tools.clone(),
        system_prompt: system_prompt.clone(),
        messages,
    };

    // ── Layer 3: Step-based Execution Loop ──
    let mut plan_steps = plan.steps;
    let max_replan = 2u32;
    let mut replan_count = 0u32;

    let mut step_idx = 0;
    while step_idx < plan_steps.len() {
        let mut step = plan_steps[step_idx].clone();

        let result = executor::execute_step(
            &mut ctx,
            &mut step,
            &llm,
            &client,
            &*pool,
            &app_handle,
            &req.allowed_paths,
            &mut steps_log,
        )
        .await;

        match result {
            Ok(output) => {
                step.status = StepStatus::Done;
                step.result = Some(output);
                ctx.completed_steps.push(step.clone());

                // Save step result
                memory::save_step_result(&*pool, &task_id, &step).await;
                memory::update_task_status(
                    &*pool,
                    &task_id,
                    "running",
                    ctx.completed_steps.len() as u32,
                    None,
                )
                .await;

                step_idx += 1;
            }
            Err(err) => {
                step.status = StepStatus::Failed;
                ctx.failure_count += 1;

                // Save failed step
                memory::save_step_result(&*pool, &task_id, &step).await;
                memory::update_working_memory(&*pool, &task_id, "last_error", &err).await;

                // Emit failure
                let fail_step = AgentStep {
                    round: step.id,
                    step_type: "reflection".into(),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    content: Some(format!("步骤 {} 失败: {}", step.id, err)),
                    duration_ms: None,
                };
                let _ = app_handle.emit(
                    "agent-event",
                    AgentEvent {
                        event_type: "reflection".into(),
                        step: Some(fail_step.clone()),
                        message: Some("正在分析失败原因...".into()),
                    },
                );
                steps_log.push(fail_step);

                // RePlan if too many failures
                if ctx.failure_count > 1 && replan_count < max_replan {
                    replan_count += 1;
                    if let Ok(new_plan) =
                        planner::replan(&llm, &client, &goal, &step, &ctx.completed_steps).await
                    {
                        plan_steps = new_plan.steps;
                        step_idx = 0;

                        let replan_step = AgentStep {
                            round: 0,
                            step_type: "planning".into(),
                            tool_name: None,
                            tool_args: None,
                            tool_result: None,
                            content: Some(format!("🔄 重新规划 ({} 步)", plan_steps.len())),
                            duration_ms: None,
                        };
                        let _ = app_handle.emit(
                            "agent-event",
                            AgentEvent {
                                event_type: "replan".into(),
                                step: Some(replan_step.clone()),
                                message: Some("已重新规划任务".into()),
                            },
                        );
                        steps_log.push(replan_step);
                        continue;
                    }
                }

                // Skip failed step and continue
                step_idx += 1;
            }
        }
    }

    // ── Finalize ──
    let final_answer = if ctx.completed_steps.is_empty() {
        "Agent 未能完成任何步骤".to_string()
    } else {
        memory::summarize_results(&ctx.completed_steps)
    };

    // Emit done
    let done_step = AgentStep {
        round: ctx.completed_steps.len() as u32,
        step_type: "final".into(),
        tool_name: None,
        tool_args: None,
        tool_result: None,
        content: Some(final_answer.clone()),
        duration_ms: None,
    };
    let _ = app_handle.emit(
        "agent-event",
        AgentEvent {
            event_type: "done".into(),
            step: Some(done_step.clone()),
            message: Some("Agent 任务完成".into()),
        },
    );
    steps_log.push(done_step);

    // Update task status
    memory::update_task_status(
        &*pool,
        &task_id,
        "completed",
        ctx.completed_steps.len() as u32,
        Some(&final_answer),
    )
    .await;
    memory::save_memory(
        &*pool,
        &task_id,
        0,
        "assistant",
        Some(&final_answer),
        None,
        None,
    )
    .await;

    Ok(AgentRunResult {
        success: !ctx.completed_steps.is_empty(),
        final_answer,
        steps: steps_log,
        total_rounds: ctx.completed_steps.len() as u32,
        error: None,
    })
}
