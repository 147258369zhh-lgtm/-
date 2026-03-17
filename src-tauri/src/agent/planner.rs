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
    let experiences = super::experience::search_similar(pool, intent, keywords, 3).await;

    // 2. Build experience hint for the prompt
    let exp_hint = if !experiences.is_empty() {
        let hints: Vec<String> = experiences.iter()
            .filter(|e| e.success)
            .take(2)
            .map(|e| {
                format!("- 类似任务「{}」成功使用了计划: {}",
                    &e.task_summary[..e.task_summary.len().min(50)],
                    &e.plan_json[..e.plan_json.len().min(200)])
            })
            .collect();
        if hints.is_empty() {
            String::new()
        } else {
            format!("\n## 历史成功经验（供参考，可调整）\n{}\n", hints.join("\n"))
        }
    } else {
        String::new()
    };

    // 3. Generate plan with enriched prompt
    let base_prompt = super::prompt_builder::build_planner_prompt(goal, tool_descriptions);
    let prompt = format!("{}\n{}", base_prompt, exp_hint);

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

    let resp = request.send().await.map_err(|e| {
        app_log!("PLANNER", "HTTP request FAILED: {}", e);
        format!("规划请求失败: {}", e)
    })?;

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
