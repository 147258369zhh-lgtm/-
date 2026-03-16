use super::types::{AgentPlan, LlmConfig, PlanStep, StepStatus};
use serde_json::{json, Value};

// ═══════════════════════════════════════════════
// Planner Engine — Goal → Structured Plan
// ═══════════════════════════════════════════════

/// Generate a structured plan from a goal
pub async fn generate_plan(
    llm: &LlmConfig,
    client: &reqwest::Client,
    goal: &str,
) -> Result<AgentPlan, String> {
    let prompt = super::prompt_builder::build_planner_prompt(goal);

    let messages = vec![
        json!({"role": "system", "content": prompt}),
        json!({"role": "user", "content": format!("目标: {}", goal)}),
    ];

    let payload = json!({
        "model": llm.model_name,
        "messages": messages,
        "temperature": 0.3
    });

    let mut request = client.post(&llm.endpoint).json(&payload);
    if !llm.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", llm.api_key));
    }

    let resp = request
        .send()
        .await
        .map_err(|e| format!("规划请求失败: {}", e))?;

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
        "temperature": 0.3
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

    parse_plan_response(&content)
}

/// Parse LLM response into structured AgentPlan
fn parse_plan_response(content: &str) -> Result<AgentPlan, String> {
    let clean = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    // Try parsing as {"steps": [...]} format first
    if let Ok(plan_json) = serde_json::from_str::<Value>(clean) {
        if let Some(steps) = plan_json["steps"].as_array() {
            let plan_steps: Vec<PlanStep> = steps
                .iter()
                .enumerate()
                .map(|(i, s)| PlanStep {
                    id: s["id"].as_u64().unwrap_or((i + 1) as u64) as u32,
                    task: s["task"]
                        .as_str()
                        .unwrap_or(s.as_str().unwrap_or(""))
                        .to_string(),
                    status: StepStatus::Pending,
                    result: None,
                })
                .filter(|s| !s.task.is_empty())
                .collect();

            if !plan_steps.is_empty() {
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

    // Fallback: create a single-step plan
    Ok(AgentPlan {
        steps: vec![PlanStep {
            id: 1,
            task: "直接执行用户目标".to_string(),
            status: StepStatus::Pending,
            result: None,
        }],
    })
}
