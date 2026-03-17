use super::types::*;
use crate::app_log;
use serde_json::{json, Value};

// ═══════════════════════════════════════════════
// Agent Factory — 一句话 → AgentBlueprint
// ═══════════════════════════════════════════════
// 唯一核心输出: AgentBlueprint
// 职责: 当意图是 CreateAgent 时，把需求转成可保存的 Agent 定义
// 边界: 不参与任务执行

/// Generate an AgentBlueprint from a user description
pub async fn create_blueprint(
    description: &str,
    llm: &LlmConfig,
    client: &reqwest::Client,
) -> Result<AgentBlueprint, String> {
    app_log!("FACTORY", "Creating blueprint for: {}", description);

    // 1. Classify what kind of Agent the user wants
    let intent = super::task_structurer::classify_intent_from_keywords_pub(description);
    let tools = super::task_structurer::tools_for_intent_pub(&intent);

    // 2. Generate persona and workflow via LLM
    let prompt = format!(
        r#"根据以下用户描述，生成一个 Agent Blueprint（JSON格式）：

用户描述: "{}"

请返回以下 JSON 格式：
{{
  "name": "Agent名称（简短）",
  "persona": "角色描述（一句话）",
  "goal_template": "目标模板（用 {{input}} 表示用户输入）",
  "workflow": [
    {{"step": "步骤1描述", "tool": "推荐工具名"}},
    {{"step": "步骤2描述", "tool": "推荐工具名"}}
  ],
  "success_criteria": ["成功标准1", "成功标准2"]
}}

只返回 JSON，不要其他文字。"#,
        description
    );

    let payload = json!({
        "model": llm.model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
    });

    let mut req = client.post(&llm.endpoint).json(&payload);
    if !llm.api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", llm.api_key));
    }

    let resp = req.send().await
        .map_err(|e| format!("Blueprint生成请求失败: {}", e))?;

    let json_resp: Value = resp.json().await
        .map_err(|e| format!("Blueprint响应解析失败: {}", e))?;

    let content = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("{}")
        .to_string();

    // Parse the LLM response
    let bp_json = super::planner::extract_json_from_response(&content);
    let bp: Value = serde_json::from_str(&bp_json)
        .unwrap_or(json!({}));

    // Build workflow template as PlanNodes
    let workflow: Vec<PlanNode> = bp["workflow"].as_array()
        .map(|arr| {
            arr.iter().enumerate().map(|(i, w)| {
                PlanNode {
                    id: (i + 1) as u32,
                    goal: w["step"].as_str().unwrap_or("").to_string(),
                    recommended_tool: w["tool"].as_str().unwrap_or("").to_string(),
                    preconditions: vec![],
                    success_criteria: String::new(),
                    fallback_tool: None,
                    status: StepStatus::Pending,
                    result: None,
                }
            }).collect()
        })
        .unwrap_or_default();

    let success_criteria: Vec<String> = bp["success_criteria"].as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let blueprint = AgentBlueprint {
        id: uuid::Uuid::new_v4().to_string(),
        name: bp["name"].as_str().unwrap_or("自定义Agent").to_string(),
        persona: bp["persona"].as_str().unwrap_or("通用助手").to_string(),
        goal_template: bp["goal_template"].as_str().unwrap_or(description).to_string(),
        tool_scope: ToolScope {
            included: tools.iter().map(|s| s.to_string()).collect(),
            excluded: vec!["ai_chat".into()],
        },
        workflow_template: workflow,
        constraints: ExecutionConstraints {
            max_retries_per_step: 2,
            max_total_failures: 3,
            timeout_per_step_secs: 60,
            fallback_strategy: "retry".into(),
        },
        success_criteria,
        version: "1.0".into(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    app_log!("FACTORY", "Blueprint created: {} ({})", blueprint.name, blueprint.id);
    Ok(blueprint)
}
