use super::types::{AgentContext, PlanStep};

// ═══════════════════════════════════════════════
// Unified Prompt Construction
// ═══════════════════════════════════════════════

/// Build system prompt for the planner (goal → structured plan)
pub fn build_planner_prompt(goal: &str) -> String {
    format!(
        "你是一个任务规划专家。请将用户的目标拆解为 3-7 个可执行的子任务步骤。\n\
         每个步骤应该是具体的、可执行的操作。\n\n\
         用 JSON 格式返回:\n\
         {{\"steps\": [{{\"id\": 1, \"task\": \"步骤描述\"}}, {{\"id\": 2, \"task\": \"步骤描述\"}}]}}\n\n\
         只返回 JSON，不要其他内容。\n\n\
         目标: {}",
        goal
    )
}

/// Build prompt for step executor (execute a single plan step)
pub fn build_executor_prompt(ctx: &AgentContext, step: &PlanStep) -> String {
    let completed = ctx
        .completed_steps
        .iter()
        .enumerate()
        .map(|(i, s)| {
            format!(
                "  {}. {} → {}",
                i + 1,
                s.task,
                s.result.as_deref().unwrap_or("(无结果)")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{}

📋 当前执行计划:
目标: {}

✅ 已完成步骤:
{}

▶ 当前步骤 (第 {} 步): {}

请执行当前步骤。如果需要使用工具，请调用相应工具。
如果当前步骤无需工具即可完成，请直接给出结果。
完成后简要报告本步骤的结果。",
        ctx.system_prompt,
        ctx.goal,
        if completed.is_empty() {
            "  (尚无)".to_string()
        } else {
            completed
        },
        step.id,
        step.task
    )
}

/// Build reflection prompt when a tool fails
pub fn build_reflection_prompt(goal: &str, step: &PlanStep, error: &str) -> String {
    format!(
        "⚠️ 工具执行失败，请分析原因并提出修复方案。\n\n\
         目标: {}\n\
         当前步骤: {}\n\
         错误信息: {}\n\n\
         请分析：\n\
         1. 失败的原因是什么？\n\
         2. 参数是否正确？\n\
         3. 是否有替代方法？\n\
         4. 是否需要先执行其他步骤？\n\n\
         请调整策略后重试。",
        goal, step.task, error
    )
}

/// Build replan prompt when multiple steps fail
pub fn build_replan_prompt(goal: &str, failed_step: &PlanStep, completed: &[PlanStep]) -> String {
    let done = completed
        .iter()
        .map(|s| format!("  ✅ {}", s.task))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "当前计划部分失败，需要重新规划。\n\n\
         目标: {}\n\n\
         已完成步骤:\n{}\n\n\
         失败步骤: {}\n\n\
         请根据已完成的工作，重新规划剩余任务。\n\
         用 JSON 格式返回:\n\
         {{\"steps\": [{{\"id\": 1, \"task\": \"步骤描述\"}}]}}\n\n\
         只返回 JSON，不要其他内容。",
        goal,
        if done.is_empty() {
            "  (尚无)".to_string()
        } else {
            done
        },
        failed_step.task
    )
}

/// Build progress check prompt (injected every N rounds)
pub fn build_progress_check(goal: &str, completed: usize, total: usize, round: u32) -> String {
    format!(
        "⏸️ 进度检查 (第 {} 轮):\n\
         目标: {}\n\
         已完成 {} / {} 步。\n\
         如果目标已基本完成，请直接给出最终总结。\n\
         如果遇到困难，请调整策略。",
        round, goal, completed, total
    )
}

/// Build final summary prompt
pub fn build_summary_prompt(goal: &str, completed: &[PlanStep]) -> String {
    let results = completed
        .iter()
        .map(|s| {
            format!(
                "步骤 {}: {} → {}",
                s.id,
                s.task,
                s.result.as_deref().unwrap_or("完成")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "所有步骤已完成。请给出最终总结。\n\n\
         目标: {}\n\n\
         执行结果:\n{}\n\n\
         请根据以上结果，给出清晰、简洁的最终总结。",
        goal, results
    )
}

/// Inject context files into system prompt
pub async fn inject_context_files(base_prompt: &str, files: &[String]) -> String {
    let mut result = base_prompt.to_string();
    let mut ctx = String::from("\n\n以下是用户提供的参考文件内容:\n");

    for path in files {
        match tokio::fs::read_to_string(path).await {
            Ok(content) => {
                let truncated = if content.len() > 3000 {
                    let end = content
                        .char_indices()
                        .take_while(|&(i, _)| i <= 3000)
                        .last()
                        .map(|(i, _)| i)
                        .unwrap_or(content.len());
                    format!("{}\\n...(已截断)", &content[..end])
                } else {
                    content
                };
                ctx.push_str(&format!("\n--- 文件: {} ---\n{}\n", path, truncated));
            }
            Err(_) => {
                ctx.push_str(&format!("\n--- 文件: {} (无法读取) ---\n", path));
            }
        }
    }

    result.push_str(&ctx);
    result
}
