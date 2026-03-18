use super::types::*;
use crate::app_log;
use serde_json::{json, Value};

// ═══════════════════════════════════════════════
// Agent Factory v2 — 一句话 → Agent Manifest
// ═══════════════════════════════════════════════
// Inspired by Coze/Cloud Code Agent Manifest design:
// Blueprint not only describes "what the agent does" but also
// defines hard constraints, success criteria, and fallback strategies.

/// Generate an AgentBlueprint (Manifest) from a user description
pub async fn create_blueprint(
    description: &str,
    llm: &LlmConfig,
    client: &reqwest::Client,
) -> Result<AgentBlueprint, String> {
    app_log!("FACTORY", "Creating blueprint for: {}", description);

    // 1. Classify what kind of Agent the user wants
    let intent = super::task_structurer::classify_intent_from_keywords_pub(description);
    let tools = super::task_structurer::tools_for_intent_pub(&intent);

    // 2. Capture environment for constraints
    let env = super::env_snapshot::EnvSnapshot::capture().await;

    // 3. Generate persona and workflow via LLM — enhanced prompt with constraints extraction
    let prompt = format!(
        r#"根据以下用户描述，生成一个 Agent Manifest（JSON格式）。

用户描述: "{desc}"

当前运行环境:
- 操作系统: {os}
- 用户: {user}
- 桌面: {desktop}
- Python: {python}

请返回以下 JSON 格式：
{{
  "name": "Agent名称（简短，中文）",
  "persona": "角色描述（一句话，说明该Agent的核心能力）",
  "goal_template": "目标模板（用 {{{{input}}}} 表示用户输入）",
  "workflow": [
    {{"step": "步骤描述", "tool": "推荐工具名", "fallback": "备选工具名（可选）",
      "args": {{"key": "value"}},
      "expected_output": "预期结果描述"}}
  ],
  "success_criteria": ["具体的、可验证的成功标准"],
  "output_spec": {{
    "format": "输出格式（docx/xlsx/txt/json/none）",
    "save_to": "建议保存路径或 none",
    "description": "输出内容一句话描述"
  }}
}}

注意：
- tool 必须从可用工具列表中选择: {available_tools}
- workflow 步骤尽量精简（2-4步）
- success_criteria 必须具体、可验证
- 只返回 JSON，不要其他文字"#,
        desc = description,
        os = env.os,
        user = env.username,
        desktop = env.desktop_path,
        python = if env.python_available { "可用" } else { "不可用" },
        available_tools = tools.join(", "),
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

    // Build workflow template as PlanNodes (v2: with fallback tools)
    let workflow: Vec<PlanNode> = bp["workflow"].as_array()
        .map(|arr| {
            arr.iter().enumerate().map(|(i, w)| {
                PlanNode {
                    id: (i + 1) as u32,
                    goal: w["step"].as_str().unwrap_or("").to_string(),
                    recommended_tool: w["tool"].as_str().unwrap_or("").to_string(),
                    preconditions: vec![],
                    success_criteria: String::new(),
                    fallback_tool: w["fallback"].as_str().map(String::from),
                    status: StepStatus::Pending,
                    result: None,
                }
            }).collect()
        })
        .unwrap_or_default();

    let success_criteria: Vec<String> = bp["success_criteria"].as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    // Get timestamp without chrono
    let timestamp = get_timestamp().await;

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
            max_total_failures: 5,  // More generous with fallback chains
            timeout_per_step_secs: 30,
            fallback_strategy: "auto_degradation".into(),  // Use tool fallback chains
        },
        success_criteria,
        version: "2.0".into(),
        created_at: timestamp,
        done_spec: None,
    };

    app_log!("FACTORY", "Blueprint v2 created: {} ({}) — {} workflow steps, {} success criteria",
        blueprint.name, blueprint.id, blueprint.workflow_template.len(), blueprint.success_criteria.len());
    Ok(blueprint)
}

/// Get timestamp string without chrono dependency
async fn get_timestamp() -> String {
    if let Ok(Ok(output)) = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        tokio::process::Command::new("python")
            .args(&["-c", "from datetime import datetime; print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))"])
            .output()
    ).await {
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !s.is_empty() { return s; }
    }
    // Fallback
    format!("{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs())
}
