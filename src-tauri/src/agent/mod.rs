// ═══════════════════════════════════════════════
// Agent Runtime v2 — Modular Architecture
// ═══════════════════════════════════════════════

pub mod agent_factory;
pub mod agent_registry;
pub mod context_manager;
pub mod cost_tracker;
pub mod env_snapshot;
pub mod executor;
pub mod experience;
pub mod failure_analyzer;
pub mod memory;
pub mod planner;
pub mod prompt_builder;
pub mod reflection;
pub mod run_trace;
pub mod stop_judge;
pub mod task_manifest;
pub mod task_structurer;
pub mod template_engine;
pub mod tool_fallback;
pub mod tool_knowledge;
pub mod tool_policy;
pub mod tool_runtime;
pub mod types;

use crate::ai::resolve_ai_config;
use crate::db::DbPool;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use types::*;
use crate::app_log;
use std::sync::{Mutex, LazyLock};
use std::collections::HashSet;

// ═══════════════════════════════════════════════
// 1.1 Agent 启动去重锁 — 防止前端重复触发
// ═══════════════════════════════════════════════

static RUNNING_AGENTS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
static IS_AGENT_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Drop guard — 函数退出时自动清理运行锁
struct RunGuard(String);
impl Drop for RunGuard {
    fn drop(&mut self) {
        if let Ok(mut running) = RUNNING_AGENTS.lock() {
            running.remove(&self.0);
        }
    }
}

// ═══════════════════════════════════════════════
// Agent Run — v4 Step-based Executor + 基础闭环
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn agent_run(
    app_handle: AppHandle,
    pool: State<'_, DbPool>,
    req: AgentRunRequest,
) -> Result<AgentRunResult, String> {
    crate::logger::init();

    // ── 全局单运行锁: 同一时间只允许一个 Agent 运行 ──
    if IS_AGENT_RUNNING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Err("Agent 正在运行中，请等待当前任务完成".into());
    }
    // Drop guard for global lock
    struct GlobalRunGuard;
    impl Drop for GlobalRunGuard {
        fn drop(&mut self) {
            IS_AGENT_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    }
    let _global_guard = GlobalRunGuard;

    // ── 1.1: 来源标识 + 去重锁 ──
    let run_id = uuid::Uuid::new_v4().to_string();
    let triggered_by = req.triggered_by.clone().unwrap_or_else(|| "unknown".into());
    app_log!("AGENT", "========== AGENT RUN START ==========");
    app_log!("AGENT", "RUN_ID={} triggered_by={}", &run_id, &triggered_by);
    app_log!("AGENT", "prompt: {}", &req.prompt);
    app_log!("AGENT", "goal: {:?}", &req.goal);
    app_log!("AGENT", "model_config_id: {:?}", &req.model_config_id);
    app_log!("AGENT", "enabled_tools count: {:?}", req.enabled_tools.as_ref().map(|v| v.len()));
    app_log!("AGENT", "context_files: {:?}", &req.context_files);
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

    let mut client_builder = reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(std::time::Duration::from_secs(30));

    // Only bypass proxy for local models (localhost/127.0.0.1)
    // Remote APIs (SiliconFlow, OpenAI etc.) need system proxy
    if is_local {
        client_builder = client_builder.no_proxy();
    }

    let client = client_builder
        .build()
        .map_err(|e| format!("无法构建 HTTP 客户端: {}", e))?;

    app_log!("AGENT", "HTTP client built: is_local={}, proxy={}", is_local, if is_local { "disabled" } else { "system" });

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

    app_log!("AGENT", "LLM endpoint: {}", &llm.endpoint);
    app_log!("AGENT", "LLM model: {}", &llm.model_name);
    app_log!("AGENT", "LLM is_local: {}", llm.is_local);
    app_log!("AGENT", "LLM api_key present: {}", !llm.api_key.is_empty());

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

    // ── 1.1: 去重锁 — 同一 task 拒绝重复启动 ──
    {
        let mut running = RUNNING_AGENTS.lock().unwrap();
        if running.contains(&task_id) {
            app_log!("AGENT", "⚠️ DUPLICATE: task {} already running, REJECTED", task_id);
            return Err("该任务已在执行中，请勿重复启动".into());
        }
        running.insert(task_id.clone());
    }
    let _run_guard = RunGuard(task_id.clone()); // Drop 时自动清理锁

    // Ensure v2 tables + experience table
    memory::ensure_v2_tables(&*pool).await;
    experience::ensure_experience_table(&*pool).await;

    // ── Layer 1.5: Environment Snapshot (Cloud Code pattern) ──
    // Capture runtime environment BEFORE planning so Planner makes realistic plans
    let env = env_snapshot::EnvSnapshot::capture().await;
    let env_context = env.to_prompt_context();
    let tool_health = env.get_tool_health();

    // Build tools list (filtered by enabled_tools, health check, always exclude ai_chat)
    let all_tools = tool_runtime::get_all_available_tools(&app_handle, &*pool).await;
    let mut tools: Vec<ToolDef> = if let Some(ref enabled) = req.enabled_tools {
        all_tools
            .iter()
            .filter(|t| enabled.contains(&t.function.name) && t.function.name != "ai_chat")
            .cloned()
            .collect()
    } else {
        all_tools.iter().filter(|t| t.function.name != "ai_chat").cloned().collect()
    };
    // Fallback: if filtering left us with zero tools, provide all tools (minus ai_chat)
    if tools.is_empty() {
        app_log!("AGENT", "WARNING: enabled_tools filter resulted in 0 tools, falling back to all tools");
        tools = all_tools.into_iter().filter(|t| t.function.name != "ai_chat").collect();
    }

    // Health check filter: remove tools that are known-broken in current environment
    let unhealthy_tools: Vec<String> = tool_health.iter()
        .filter(|(_, ok, _)| !ok)
        .map(|(name, _, reason)| {
            app_log!("AGENT", "Tool health FAIL: {} — {}", name, reason);
            name.clone()
        })
        .collect();
    let pre_filter_count = tools.len();
    tools.retain(|t| !unhealthy_tools.contains(&t.function.name));
    if tools.len() < pre_filter_count {
        app_log!("AGENT", "Health check: {} → {} tools (removed {} unhealthy)",
            pre_filter_count, tools.len(), pre_filter_count - tools.len());
    }

    // Build enhanced system prompt with environment context
    let mut system_prompt = req.system_prompt.unwrap_or_else(|| {
        r#"你是一个高效的任务执行 AI Agent。

## 核心原则
你必须通过调用工具来完成任务。收到指令后，立即分析并调用最合适的工具。

## 绝对禁止
- ❌ 禁止使用 ai_chat 工具
- ❌ 不要只返回文本回复
- ❌ 不要生成代码让用户去执行
- ❌ 不要请求用户确认
- ❌ 不要使用 Linux 命令或路径格式

## 工具选择规则
| 任务类型 | 使用工具 |
|---------|--------|
| 读取文件 | file_read |
| 写入/创建文件 | file_write |
| 创建 Word 文档 | word_write（传 title+content）|
| 创建 Excel | excel_write（传 headers+rows）|
| 创建 PPT | ppt_create（传 title+slides）|
| 列出目录文件 | file_list |
| 读取 Excel | excel_read |
| 分析 Excel 数据 | excel_analyze |
| 网络爬取/新闻 | web_scrape（首选）|
| 执行系统命令 | shell_run |

## 执行要求
1. 收到步骤指令后，立即调用工具
2. 利用前一步骤的结果作为输入
3. 工具执行完成后简要报告结果"#.into()
    });

    // Inject environment snapshot (replaces old hardcoded env info)
    system_prompt.push_str("\n\n");
    system_prompt.push_str(&env_context);

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

    // ── Layer 2: Task Structuring (v3) ──
    let goal = req.goal.as_deref().unwrap_or(&req.prompt).to_string();

    // Structurize the task: intent classification + tool filtering
    let structured_task = task_structurer::structurize_task(&goal, &llm, &client).await
        .unwrap_or_else(|_| StructuredTask {
            goal: goal.clone(),
            intent: TaskIntent::Unknown,
            keywords: vec![],
            inputs: vec![],
            expected_output: "文本输出".into(),
            required_tools: vec![],
            complexity: TaskComplexity::Medium,
        });
    let agent_config = task_structurer::build_agent_config(&structured_task);
    app_log!("AGENT", "Task structured: intent={:?}, tools={}, role={}",
        structured_task.intent, structured_task.required_tools.len(), agent_config.role.name);

    // Filter tools by structured task recommendation (if available)
    if !structured_task.required_tools.is_empty() {
        let recommended = &structured_task.required_tools;
        let filtered: Vec<ToolDef> = tools.iter()
            .filter(|t| recommended.contains(&t.function.name))
            .cloned()
            .collect();
        if !filtered.is_empty() {
            app_log!("AGENT", "Tools filtered: {} → {} (by intent {:?})",
                tools.len(), filtered.len(), structured_task.intent);
            tools = filtered;
        }
    }

    // Build tool descriptions for planner
    let tool_descriptions: String = tools
        .iter()
        .map(|t| format!("- `{}`: {}", t.function.name, t.function.description))
        .collect::<Vec<_>>()
        .join("\n");

    app_log!("AGENT", "tools count: {} (after health filter)", tools.len());
    app_log!("AGENT", "Calling planner v3 (experience-aware)...");

    let plan = match planner::generate_plan_with_experience(
        &llm, &client, &goal, &tool_descriptions,
        &*pool, &structured_task.intent, &structured_task.keywords,
    ).await {
        Ok(p) => {
            app_log!("AGENT", "Plan generated: {} steps", p.steps.len());
            for s in &p.steps {
                app_log!("AGENT", "  step {}: {}", s.id, s.task);
            }
            p
        }
        Err(e) => {
            app_log!("AGENT", "Plan generation FAILED: {}", e);
            AgentPlan {
                steps: vec![PlanStep {
                    id: 1,
                    task: goal.clone(),
                    status: StepStatus::Pending,
                    result: None,
                    depends_on: vec![],
                }],
            }
        }
    };

    // ── Phase 2: DoneSpec 提取 + Generator-Critic 审查 ──
    let done_spec = planner::extract_done_spec(&req.prompt);
    app_log!("AGENT", "DoneSpec: type={}, path={:?}, required_content={:?}",
        done_spec.deliverable_type,
        done_spec.save_path,
        done_spec.required_content);

    // 2.4: validate_plan — 规则式审查
    let tool_names: Vec<String> = tools.iter()
        .map(|t| t.function.name.clone())
        .collect();
    let plan_issues = planner::validate_plan(&plan, &tool_names, Some(&done_spec));
    let mut plan = plan; // make mutable for potential replan
    if !plan_issues.is_empty() {
        app_log!("AGENT", "⚠️ Plan Critic found {} issues, triggering auto-replan:", plan_issues.len());
        for issue in &plan_issues {
            app_log!("AGENT", "  - {}", issue);
        }
        // 自动重新规划：将可用工具列表和错误信息一起传给 planner
        let replan_hint = format!(
            "上一次规划有问题: {}\n你只能使用以下工具: {}\n请重新规划。",
            plan_issues.join("; "),
            tool_names.join(", ")
        );
        let augmented_goal = format!("{}\n\n{}", goal, replan_hint);
        if let Ok(new_plan) = planner::generate_plan_with_experience(
            &llm, &client, &augmented_goal, &tool_descriptions,
            &*pool, &structured_task.intent, &structured_task.keywords,
        ).await {
            app_log!("AGENT", "✅ Auto-replan succeeded: {} steps", new_plan.steps.len());
            plan = new_plan;
        } else {
            app_log!("AGENT", "⚠️ Auto-replan failed, proceeding with original plan");
        }
    } else {
        app_log!("AGENT", "✅ Plan Critic: all checks passed");
    }

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

    // ── Layer 3: Step-based Execution Loop (v3: with stop_judge) ──
    let mut plan_steps = plan.steps;
    let max_replan = 2u32;
    let mut replan_count = 0u32;
    let cost_budget = CostBudget::default();
    let execution_start = std::time::Instant::now();
    let mut tools_used: Vec<String> = Vec::new();
    let mut consecutive_failures: u32 = 0;

    let mut step_idx = 0;
    while step_idx < plan_steps.len() {
        // ── Stop Judge check before each step ──
        let stop_decision = stop_judge::evaluate(
            ctx.completed_steps.len(),
            plan_steps.len(),
            consecutive_failures,
            ctx.failure_count,
            &cost_budget,
            execution_start.elapsed().as_secs(),
        );
        match stop_decision {
            StopDecision::StopSuccess(reason) => {
                app_log!("AGENT", "STOP_JUDGE: Success - {}", reason);
                break;
            }
            StopDecision::StopFailure(reason) => {
                app_log!("AGENT", "STOP_JUDGE: Failure - {}", reason);
                let stop_step = AgentStep {
                    round: step_idx as u32,
                    step_type: "stop".into(),
                    tool_name: None, tool_args: None, tool_result: None,
                    content: Some(format!("⛔ 终止: {}", reason)),
                    duration_ms: None,
                };
                let _ = app_handle.emit("agent-event", AgentEvent {
                    event_type: "stop".into(),
                    step: Some(stop_step.clone()),
                    message: Some(reason),
                });
                steps_log.push(stop_step);
                break;
            }
            StopDecision::Continue => {}
            StopDecision::ForceReplan(reason) => {
                app_log!("AGENT", "STOP_JUDGE: ForceReplan - {}", reason);
                // 强制重规划：重置连续失败计数，触发 replan 而非终止
                consecutive_failures = 0;
                // 让执行循环继续，下一轮 replan 逻辑会接管
            }
        }

        let mut step = plan_steps[step_idx].clone();
        app_log!("AGENT", "--- Executing step {} / {}: {} ---", step.id, plan_steps.len(), step.task);

        // ── 3.2: depends_on 前置条件验证（借鉴 s07 blockedBy）──
        if !step.depends_on.is_empty() {
            let unmet: Vec<u32> = step.depends_on.iter()
                .filter(|dep_id| {
                    !ctx.completed_steps.iter().any(|s| s.id == **dep_id)
                })
                .cloned()
                .collect();
            if !unmet.is_empty() {
                app_log!("AGENT", "⏸️ Step {} blocked by unmet depends_on: {:?}", step.id, unmet);
                // 跳过该步骤，等后续轮次重试
                continue;
            }
        }

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
                consecutive_failures = 0;  // Reset on success

                // Track tools used
                if let Some(hint) = prompt_builder::extract_tool_hint(&step.task) {
                    if !tools_used.contains(&hint) {
                        tools_used.push(hint);
                    }
                }

                memory::save_step_result(&*pool, &task_id, &step).await;
                memory::update_task_status(
                    &*pool,
                    &task_id,
                    "running",
                    ctx.completed_steps.len() as u32,
                    None,
                )
                .await;

                // ── 4.2: Goal Monitoring — 检查目标是否已提前完成 ──
                if done_spec.deliverable_type != "none" {
                    if let Some(ref result_text) = step.result {
                        let r = result_text.to_lowercase();
                        // 检测文件已成功创建
                        let file_created = r.contains("successfully") || r.contains("成功")
                            || r.contains("已创建") || r.contains("已保存")
                            || r.contains("已写入") || r.contains("wrote");
                        if file_created && ctx.completed_steps.len() >= 2 {
                            app_log!("AGENT", "🎯 Goal Monitor: deliverable likely created at step {}, checking early completion",
                                step.id);
                        }
                    }
                }

                step_idx += 1;
            }
            Err(err) => {
                step.status = StepStatus::Failed;

                // ── Tool Fallback Chain (Phase 2) ──
                // Before counting as failure, try fallback tools
                let tool_hint = prompt_builder::extract_tool_hint(&step.task);
                let mut fallback_succeeded = false;
                if let Some(ref hint) = tool_hint {
                    if let Some(fallbacks) = tool_fallback::get_fallback(hint) {
                        for fb in &fallbacks {
                            app_log!("AGENT", "Trying fallback: {} → {} ({})", hint, fb.tool_name, fb.reason);
                            // Get original args from the last executor call
                            let fb_args = if let Some(last_step) = steps_log.last() {
                                if let Some(ref original_args) = last_step.tool_args {
                                    tool_fallback::transform_args_for_fallback(hint.as_str(), original_args, fb)
                                } else {
                                    json!({})
                                }
                            } else {
                                json!({})
                            };

                            match tool_runtime::execute_tool(
                                &fb.tool_name, &fb_args, &*pool, &req.allowed_paths, &app_handle
                            ).await {
                                Ok(result) => {
                                    app_log!("AGENT", "Fallback {} succeeded!", fb.tool_name);
                                    step.status = StepStatus::Done;
                                    step.result = Some(format!("[降级] {} → {}\n{}", hint, fb.tool_name, result));
                                    ctx.completed_steps.push(step.clone());
                                    consecutive_failures = 0;
                                    fallback_succeeded = true;

                                    let fb_step = AgentStep {
                                        round: step.id,
                                        step_type: "fallback".into(),
                                        tool_name: Some(fb.tool_name.clone()),
                                        tool_args: serde_json::to_value(&fb_args).ok(),
                                        tool_result: step.result.clone(),
                                        content: Some(format!("🔄 {} 失败，已降级到 {} 成功", hint, fb.tool_name)),
                                        duration_ms: None,
                                    };
                                    let _ = app_handle.emit("agent-event", AgentEvent {
                                        event_type: "fallback".into(),
                                        step: Some(fb_step.clone()),
                                        message: Some(fb.reason.clone()),
                                    });
                                    steps_log.push(fb_step);
                                    break;
                                }
                                Err(e) => {
                                    app_log!("AGENT", "Fallback {} also failed: {}", fb.tool_name, e);
                                }
                            }
                        }
                    }
                }

                if fallback_succeeded {
                    step_idx += 1;
                    continue;
                }

                // Original failure handling
                ctx.failure_count += 1;
                consecutive_failures += 1;

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

    // ── Finalize: LLM-generated intelligent summary ──
    let final_answer = if ctx.completed_steps.is_empty() {
        "Agent 未能完成任何步骤".to_string()
    } else {
        // Try to get LLM-generated summary
        let summary_prompt = prompt_builder::build_summary_prompt(&goal, &ctx.completed_steps);
        let summary_result: Option<String> = async {
            let payload = json!({
                "model": llm.model_name,
                "messages": [
                    {"role": "system", "content": "你是一个任务总结助手。用中文简洁地总结任务执行结果。"},
                    {"role": "user", "content": summary_prompt}
                ],
                "temperature": 0.3
            });
            let mut req_builder = client.post(&llm.endpoint).json(&payload);
            if !llm.api_key.is_empty() {
                req_builder = req_builder.header("Authorization", format!("Bearer {}", llm.api_key));
            }
            match req_builder.send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(json_resp) = resp.json::<Value>().await {
                        json_resp["choices"][0]["message"]["content"]
                            .as_str()
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                }
                _ => None,
            }
        }.await;

        match summary_result {
            Some(summary) => {
                app_log!("AGENT", "LLM summary generated: {} chars", summary.len());
                summary
            }
            None => {
                app_log!("AGENT", "LLM summary failed, falling back to mechanical summary");
                memory::summarize_results(&ctx.completed_steps)
            }
        }
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

    // ── v3: Write experience to learning system ──
    let score = experience::score_execution(
        &ctx.completed_steps,
        plan_steps.len(),
        ctx.failure_count,
        &tools_used,
        &structured_task.required_tools,
    );
    let plan_json = serde_json::to_string(&plan_steps).unwrap_or_default();
    let exp = Experience {
        id: uuid::Uuid::new_v4().to_string(),
        task_summary: goal.clone(),
        intent: structured_task.intent.clone(),
        plan_json,
        tools_used: tools_used.clone(),
        success: !ctx.completed_steps.is_empty(),
        score: score.clone(),
        failure_reason: if ctx.failure_count > 0 {
            Some(format!("{}次失败", ctx.failure_count))
        } else {
            None
        },
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    experience::save_experience(&*pool, &exp).await;
    app_log!("AGENT", "Experience saved: accuracy={}, efficiency={}, tool_usage={}",
        score.accuracy, score.efficiency, score.tool_usage);

    Ok(AgentRunResult {
        success: !ctx.completed_steps.is_empty(),
        final_answer,
        steps: steps_log,
        total_rounds: ctx.completed_steps.len() as u32,
        error: None,
    })
}

// ═══════════════════════════════════════════════
// Product Layer — Blueprint CRUD Commands
// ═══════════════════════════════════════════════

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct BlueprintInfo {
    pub id: String,
    pub name: String,
    pub persona: String,
    pub goal_template: String,
    pub tool_count: usize,
    pub workflow_steps: usize,
    pub version: String,
    pub created_at: String,
    pub workflow_template: Vec<WorkflowStepInfo>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkflowStepInfo {
    pub id: u32,
    pub goal: String,
    pub tool: String,
    pub args: Option<serde_json::Value>,
    pub expected_output: Option<String>,
}

impl From<AgentBlueprint> for BlueprintInfo {
    fn from(bp: AgentBlueprint) -> Self {
        let workflow_template: Vec<WorkflowStepInfo> = bp.workflow_template.iter().map(|s| {
            WorkflowStepInfo {
                id: s.id,
                goal: s.goal.clone(),
                tool: s.recommended_tool.clone(),
                args: None,
                expected_output: None,
            }
        }).collect();
        BlueprintInfo {
            id: bp.id.clone(),
            name: bp.name.clone(),
            persona: bp.persona.clone(),
            goal_template: bp.goal_template.clone(),
            tool_count: bp.tool_scope.included.len(),
            workflow_steps: bp.workflow_template.len(),
            version: bp.version.clone(),
            created_at: bp.created_at.clone(),
            workflow_template,
        }
    }
}

/// Create a new Agent Blueprint from description
#[tauri::command]
pub async fn agent_create_blueprint(
    pool: State<'_, DbPool>,
    description: String,
    model_config_id: Option<String>,
) -> Result<BlueprintInfo, String> {
    crate::logger::init();
    app_log!("AGENT", "Creating blueprint: {}", description);

    let config = if let Some(ref config_id) = model_config_id {
        sqlx::query_as::<_, crate::ai::AiConfig>(
            "SELECT id, name, provider, api_key, base_url, model_name, is_active, purpose FROM ai_configs WHERE id = ?"
        ).bind(config_id).fetch_one(&*pool).await
            .map_err(|e| format!("找不到模型配置: {}", e))?
    } else {
        match resolve_ai_config(&*pool, Some("agent")).await {
            Ok(cfg) => cfg,
            Err(_) => resolve_ai_config(&*pool, None).await
                .map_err(|e| format!("无可用模型: {}", e))?,
        }
    };

    let url = config.base_url.clone()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
    let is_local = url.contains("localhost") || url.contains("127.0.0.1");
    let llm = LlmConfig {
        endpoint: format!("{}/chat/completions", url.trim_end_matches('/')),
        api_key: config.api_key.clone().unwrap_or_default(),
        model_name: config.model_name.clone(),
        is_local,
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    agent_registry::ensure_registry_table(&*pool).await;

    let bp = agent_factory::create_blueprint(&description, &llm, &client).await?;
    agent_registry::save_blueprint(&*pool, &bp).await;

    Ok(BlueprintInfo::from(bp))
}

/// List all saved blueprints
#[tauri::command]
pub async fn agent_list_blueprints(
    pool: State<'_, DbPool>,
) -> Result<Vec<BlueprintInfo>, String> {
    agent_registry::ensure_registry_table(&*pool).await;
    let bps = agent_registry::list_blueprints(&*pool).await;
    Ok(bps.into_iter().map(BlueprintInfo::from).collect())
}

/// Delete a blueprint
#[tauri::command]
pub async fn agent_delete_blueprint(
    pool: State<'_, DbPool>,
    id: String,
) -> Result<(), String> {
    agent_registry::delete_blueprint(&*pool, &id).await;
    Ok(())
}

/// List recent experiences
#[tauri::command]
pub async fn agent_list_experiences(
    pool: State<'_, DbPool>,
    limit: Option<u32>,
) -> Result<Vec<serde_json::Value>, String> {
    experience::ensure_experience_table(&*pool).await;
    let rows = sqlx::query_as::<_, (String, String, String, i32, i32, i32, i32, String)>(
        "SELECT id, task_summary, intent, success,
                score_accuracy, score_efficiency, score_tool_usage, created_at
         FROM agent_experiences
         ORDER BY created_at DESC
         LIMIT ?"
    )
    .bind(limit.unwrap_or(20) as i64)
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    let results: Vec<serde_json::Value> = rows.iter().map(|r| {
        serde_json::json!({
            "id": r.0,
            "task_summary": r.1,
            "intent": r.2,
            "success": r.3 != 0,
            "score": { "accuracy": r.4, "efficiency": r.5, "tool_usage": r.6 },
            "created_at": r.7,
        })
    }).collect();

    Ok(results)
}

