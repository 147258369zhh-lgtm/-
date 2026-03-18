use super::types::{AgentPlan, LlmConfig, PlanStep, StepStatus, TaskIntent};
use serde_json::{json, Value};
use crate::app_log;
use crate::db::DbPool;

// ═══════════════════════════════════════════════
// Planner Engine v3.0 — Experience-Aware Planning
// ═══════════════════════════════════════════════

/// Generate a plan with experience retrieval (v3)
pub async fn generate_plan_with_experience(
    llm: &LlmConfig,
    client: &reqwest::Client,
    goal: &str,
    tool_descriptions: &str,
    pool: &DbPool,
    intent: &TaskIntent,
    keywords: &[String],
) -> Result<AgentPlan, String> {
    // 1. Search for similar past experiences
    let experiences = super::experience::search_similar(pool, intent, keywords, 5).await;

    // 2. Build experience hint: BOTH success recommendations AND failure constraints
    let mut exp_sections = Vec::new();

    // Success experiences → recommendations
    let success_hints: Vec<String> = experiences.iter()
        .filter(|e| e.success)
        .take(2)
        .map(|e| {
            format!("- 类似任务「{}」成功使用了: {}",
                &e.task_summary[..e.task_summary.len().min(50)],
                e.tools_used.join(", "))
        })
        .collect();
    if !success_hints.is_empty() {
        exp_sections.push(format!(
            "## ✅ 历史成功经验（推荐参考）\n{}", success_hints.join("\n")));
    }

    // Failed experiences → hard constraints (CRITICAL: this makes Experience actually affect decisions)
    let failure_constraints: Vec<String> = experiences.iter()
        .filter(|e| !e.success)
        .take(3)
        .map(|e| {
            let reason = e.failure_reason.as_deref().unwrap_or("未知原因");
            format!("- ❌ 工具 [{}] 执行「{}」时失败: {}",
                e.tools_used.join(", "),
                &e.task_summary[..e.task_summary.len().min(40)],
                &reason[..reason.len().min(80)])
        })
        .collect();
    if !failure_constraints.is_empty() {
        exp_sections.push(format!(
            "## ⛔ 历史失败记录（必须避免）\n{}\n**以上失败过的工具和方法不要再重复使用，必须选择替代方案。**",
            failure_constraints.join("\n")));
    }

    let exp_hint = if exp_sections.is_empty() {
        String::new()
    } else {
        format!("\n{}\n", exp_sections.join("\n\n"))
    };

    // 1.2: 关键日志节点 — Experience 注入后
    app_log!("PLANNER", "Experience injected: {} success hints, {} failure constraints",
        success_hints.len(), failure_constraints.len());

    // 3. Generate plan with enriched prompt
    let base_prompt = super::prompt_builder::build_planner_prompt(goal, tool_descriptions);
    let prompt = format!("{}\n{}", base_prompt, exp_hint);

    // 1.2: 关键日志节点 — LLM 调用前
    app_log!("PLANNER", "Calling LLM for plan generation (prompt={} chars)...", prompt.len());

    let messages = vec![
        json!({"role": "system", "content": prompt}),
        json!({"role": "user", "content": format!("请为以下目标生成执行计划（JSON格式）：\n{}", goal)}),
    ];

    let payload = json!({
        "model": llm.model_name,
        "messages": messages,
        "temperature": 0.2
    });

    let mut request = client.post(&llm.endpoint).json(&payload);
    if !llm.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", llm.api_key));
    }

    let resp = match tokio::time::timeout(
        std::time::Duration::from_secs(60),
        request.send()
    ).await {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => {
            app_log!("PLANNER", "HTTP request FAILED: {}", e);
            return Err(format!("规划请求失败: {}", e));
        }
        Err(_) => {
            app_log!("PLANNER", "⏰ TIMEOUT: LLM planner call exceeded 60s");
            return Err("规划超时: LLM 响应超过 60 秒，请检查网络连接或更换模型".into());
        }
    };

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("规划响应错误: {}", body));
    }

    let json_resp: Value = resp.json().await
        .map_err(|e| format!("规划 JSON 解析失败: {}", e))?;

    let content = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // 1.2: 关键日志节点 — LLM 响应后
    app_log!("PLANNER", "LLM responded: {} chars, parsing plan...", content.len());
    app_log!("PLANNER", "v3 plan response ({} chars, {} exp refs)",
        content.len(), experiences.len());

    parse_plan_response(&content)
}

/// Generate a structured plan from a goal (v2 compat)
pub async fn generate_plan(
    llm: &LlmConfig,
    client: &reqwest::Client,
    goal: &str,
    tool_descriptions: &str,
) -> Result<AgentPlan, String> {
    let prompt = super::prompt_builder::build_planner_prompt(goal, tool_descriptions);

    let messages = vec![
        json!({"role": "system", "content": prompt}),
        json!({"role": "user", "content": format!("请为以下目标生成执行计划（JSON格式）：\n{}", goal)}),
    ];

    let payload = json!({
        "model": llm.model_name,
        "messages": messages,
        "temperature": 0.2
    });

    let mut request = client.post(&llm.endpoint).json(&payload);
    if !llm.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", llm.api_key));
    }

    let resp = request
        .send()
        .await
        .map_err(|e| {
            app_log!("PLANNER", "HTTP request FAILED: {}", e);
            format!("规划请求失败: {}", e)
        })?;

    app_log!("PLANNER", "HTTP status: {}", resp.status());

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("规划响应错误: {}", body));
    }

    let json_resp: Value = resp
        .json()
        .await
        .map_err(|e| format!("规划 JSON 解析失败: {}", e))?;

    let content = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    app_log!("PLANNER", "LLM planner response ({} chars): {}", content.len(), &content[..content.len().min(2000)]);

    parse_plan_response(&content)
}

/// Re-plan after failures
pub async fn replan(
    llm: &LlmConfig,
    client: &reqwest::Client,
    goal: &str,
    failed_step: &PlanStep,
    completed: &[PlanStep],
) -> Result<AgentPlan, String> {
    let prompt = super::prompt_builder::build_replan_prompt(goal, failed_step, completed);

    let messages = vec![json!({"role": "user", "content": prompt})];

    let payload = json!({
        "model": llm.model_name,
        "messages": messages,
        "temperature": 0.2
    });

    let mut request = client.post(&llm.endpoint).json(&payload);
    if !llm.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", llm.api_key));
    }

    let resp = request
        .send()
        .await
        .map_err(|e| format!("重规划请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err("重规划响应错误".into());
    }

    let json_resp: Value = resp
        .json()
        .await
        .map_err(|e| format!("重规划 JSON 解析失败: {}", e))?;

    let content = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    app_log!("PLANNER", "Replan response: {}", &content[..content.len().min(1000)]);

    parse_plan_response(&content)
}

/// Parse LLM response into structured AgentPlan
/// v2: Supports tool_hint field, more robust JSON extraction
fn parse_plan_response(content: &str) -> Result<AgentPlan, String> {
    // Try to extract JSON from markdown code block or raw text
    let clean = extract_json_from_text(content);

    // Try parsing as {"steps": [...]} format
    if let Ok(plan_json) = serde_json::from_str::<Value>(&clean) {
        if let Some(steps) = plan_json["steps"].as_array() {
            let plan_steps: Vec<PlanStep> = steps
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    let mut task = s["task"]
                        .as_str()
                        .unwrap_or(s.as_str().unwrap_or(""))
                        .to_string();

                    // If there's a tool_hint, prepend it to the task description
                    // so extract_tool_hint can find it later
                    if let Some(hint) = s["tool_hint"].as_str() {
                        if !hint.is_empty() && !task.contains(hint) {
                            task = format!("使用 {} {}", hint, task);
                        }
                    }

                    PlanStep {
                        id: s["id"].as_u64().unwrap_or((i + 1) as u64) as u32,
                        task,
                        status: StepStatus::Pending,
                        result: None,
                        depends_on: vec![],
                    }
                })
                .filter(|s| !s.task.is_empty())
                .collect();

            if !plan_steps.is_empty() {
                app_log!("PLANNER", "Parsed {} steps from JSON", plan_steps.len());
                for s in &plan_steps {
                    app_log!("PLANNER", "  step {}: {}", s.id, s.task);
                }
                return Ok(AgentPlan { steps: plan_steps });
            }
        }

        // Try {"subtasks": [...]} format (backward compat)
        if let Some(subtasks) = plan_json["subtasks"].as_array() {
            let plan_steps: Vec<PlanStep> = subtasks
                .iter()
                .enumerate()
                .map(|(i, t)| PlanStep {
                    id: (i + 1) as u32,
                    task: t.as_str().unwrap_or("").to_string(),
                    status: StepStatus::Pending,
                    result: None,
                    depends_on: vec![],
                })
                .filter(|s| !s.task.is_empty())
                .collect();

            if !plan_steps.is_empty() {
                return Ok(AgentPlan { steps: plan_steps });
            }
        }
    }

    // Fallback: try to parse numbered list (e.g. "1. do X\n2. do Y")
    let lines: Vec<&str> = content.lines()
        .filter(|l| {
            let trimmed = l.trim();
            trimmed.starts_with("1.") || trimmed.starts_with("2.") || trimmed.starts_with("3.")
                || trimmed.starts_with("4.") || trimmed.starts_with("5.") || trimmed.starts_with("6.")
                || trimmed.starts_with("- ")
        })
        .collect();

    if !lines.is_empty() {
        let plan_steps: Vec<PlanStep> = lines
            .iter()
            .enumerate()
            .map(|(i, line)| {
                let task = line.trim()
                    .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == '-' || c == ' ')
                    .trim()
                    .to_string();
                PlanStep {
                    id: (i + 1) as u32,
                    task,
                    status: StepStatus::Pending,
                    result: None,
                    depends_on: vec![],
                }
            })
            .filter(|s| !s.task.is_empty() && s.task.len() > 3)
            .collect();

        if !plan_steps.is_empty() {
            app_log!("PLANNER", "Parsed {} steps from numbered list", plan_steps.len());
            return Ok(AgentPlan { steps: plan_steps });
        }
    }

    // Last resort: create a single-step plan
    app_log!("PLANNER", "Fallback: single-step plan");
    Ok(AgentPlan {
        steps: vec![PlanStep {
            id: 1,
            task: format!("直接完成: {}", content.lines().next().unwrap_or("执行用户目标")),
            status: StepStatus::Pending,
            result: None,
            depends_on: vec![],
        }],
    })
}

/// Extract JSON content from text that may contain markdown code blocks
/// Extract JSON content from text that may contain markdown code blocks (public for agent_factory)
pub fn extract_json_from_response(content: &str) -> String {
    extract_json_from_text(content)
}

fn extract_json_from_text(content: &str) -> String {
    let trimmed = content.trim();

    // Try to find JSON in code blocks
    if let Some(start) = trimmed.find("```json") {
        let after_marker = &trimmed[start + 7..];
        if let Some(end) = after_marker.find("```") {
            return after_marker[..end].trim().to_string();
        }
    }
    if let Some(start) = trimmed.find("```") {
        let after_marker = &trimmed[start + 3..];
        if let Some(end) = after_marker.find("```") {
            let block = after_marker[..end].trim();
            if block.starts_with('{') || block.starts_with('[') {
                return block.to_string();
            }
        }
    }

    // Try to find raw JSON object
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end > start {
                return trimmed[start..=end].to_string();
            }
        }
    }

    trimmed.to_string()
}

// ═══════════════════════════════════════════════
// v4: Phase 2 — Generator-Critic 计划审查
// ═══════════════════════════════════════════════

/// 2.4 validate_plan — 规则式计划审查（不需要 LLM）
/// 返回 issues 列表，空 = 审查通过
pub fn validate_plan(
    plan: &AgentPlan,
    available_tools: &[String],
    done_spec: Option<&super::types::DoneSpec>,
) -> Vec<String> {
    let mut issues: Vec<String> = Vec::new();

    // 规则1: 步骤数合理性
    if plan.steps.is_empty() {
        issues.push("计划没有任何步骤".into());
        return issues;
    }
    if plan.steps.len() > 10 {
        issues.push(format!("计划步骤过多({}步)，建议精简到6步以内", plan.steps.len()));
    }

    // 规则2: 每个步骤必须有可识别的工具
    for step in &plan.steps {
        let hint = super::prompt_builder::extract_tool_hint(&step.task);
        match hint {
            Some(ref tool) => {
                if !available_tools.is_empty() && !available_tools.iter().any(|t| t == tool) {
                    issues.push(format!(
                        "步骤 {} 使用了不可用工具 `{}`，可用工具: [{}]",
                        step.id, tool,
                        available_tools.iter().take(5).cloned().collect::<Vec<_>>().join(", ")
                    ));
                }
            }
            None => {
                issues.push(format!(
                    "步骤 {} 没有明确的工具提示: \"{}\"",
                    step.id,
                    &step.task[..step.task.len().min(60)]
                ));
            }
        }
    }

    // 规则3: DoneSpec 对齐检查
    if let Some(spec) = done_spec {
        let last_step = plan.steps.last().unwrap();
        let last_task_lower = last_step.task.to_lowercase();

        // 检查最后一步的输出格式是否匹配
        let expected_type = &spec.deliverable_type.to_lowercase();
        if expected_type != "none" {
            let type_match = match expected_type.as_str() {
                "docx" => last_task_lower.contains("word") || last_task_lower.contains("docx") || last_task_lower.contains("word_write"),
                "xlsx" => last_task_lower.contains("excel") || last_task_lower.contains("xlsx") || last_task_lower.contains("excel_write"),
                "txt" => last_task_lower.contains("file_write") || last_task_lower.contains("写入") || last_task_lower.contains("保存"),
                _ => true,
            };
            if !type_match {
                issues.push(format!(
                    "验收要求输出 {} 格式，但最后一步 \"{}\" 似乎不是在创建该格式文件",
                    spec.deliverable_type,
                    &last_step.task[..last_step.task.len().min(40)]
                ));
            }
        }

        // 检查保存路径是否出现在计划中
        if let Some(ref path) = spec.save_path {
            let plan_text = plan.steps.iter().map(|s| &s.task).cloned().collect::<Vec<_>>().join(" ");
            if !plan_text.contains(path) && !plan_text.contains("桌面") && path.contains("Desktop") {
                issues.push(format!("验收要求保存到 `{}`，但计划中未提及此路径", path));
            }
        }
    }

    issues
}

/// 2.1 从用户 prompt 提取 DoneSpec（规则式，不需要 LLM）
pub fn extract_done_spec(prompt: &str) -> super::types::DoneSpec {
    let p = prompt.to_lowercase();

    // 提取交付物类型
    let deliverable_type = if p.contains("word") || p.contains("docx") || p.contains("文档") {
        "docx"
    } else if p.contains("excel") || p.contains("xlsx") || p.contains("表格") {
        "xlsx"
    } else if p.contains("ppt") || p.contains("pptx") || p.contains("演示") {
        "pptx"
    } else if p.contains("pdf") {
        "pdf"
    } else if p.contains("txt") || p.contains("文本") {
        "txt"
    } else {
        "none"
    }.to_string();

    // 提取保存路径
    let save_path = if p.contains("桌面") || p.contains("desktop") {
        Some(r"C:\Users\29136\Desktop".to_string())
    } else {
        None
    };

    // 提取内容要求
    let mut required_content = Vec::new();
    if p.contains("故事") { required_content.push("故事内容".into()); }
    if p.contains("新闻") { required_content.push("新闻信息".into()); }
    if p.contains("天气") { required_content.push("天气数据".into()); }
    if p.contains("分析") { required_content.push("分析结果".into()); }

    // 生成成功条件
    let mut success_checks = Vec::new();
    if deliverable_type != "none" {
        success_checks.push(format!("成功创建 {} 格式文件", deliverable_type));
    }
    if save_path.is_some() {
        success_checks.push("文件保存到指定位置".into());
    }

    super::types::DoneSpec {
        deliverable_type,
        save_path,
        filename_pattern: None,
        required_content,
        success_checks,
    }
}

