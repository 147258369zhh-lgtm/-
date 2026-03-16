use super::types::{LlmConfig, PlanStep};
use serde_json::{json, Value};

// ═══════════════════════════════════════════════
// Reflection Engine — failure analysis + fix
// ═══════════════════════════════════════════════

/// Analyze a tool failure and suggest a fix
pub async fn analyze_failure(
    llm: &LlmConfig,
    client: &reqwest::Client,
    goal: &str,
    step: &PlanStep,
    error: &str,
) -> Result<String, String> {
    let prompt = super::prompt_builder::build_reflection_prompt(goal, step, error);

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
        .map_err(|e| format!("反思请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err("反思响应错误".into());
    }

    let json_resp: Value = resp
        .json()
        .await
        .map_err(|e| format!("反思 JSON 解析失败: {}", e))?;

    let fix = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("请重试")
        .to_string();

    Ok(fix)
}

/// Build a reflection message to inject into the conversation
pub fn build_reflection_message(tool_name: &str, error: &str) -> String {
    format!(
        "⚠️ 工具 {} 执行失败: {}\n请分析失败原因，考虑：\n\
         1. 参数是否正确？\n\
         2. 是否有替代方法？\n\
         3. 是否需要先执行其他步骤？\n\
         请调整策略后重试。",
        tool_name, error
    )
}
