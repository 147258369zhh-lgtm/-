use super::types::{LlmConfig, PlanStep, FailureCategory};
use super::failure_analyzer::{self, FailureFix, FixAction};
use serde_json::{json, Value};

// ═══════════════════════════════════════════════
// Reflection Engine v3.0 — Structured Failure Analysis
// ═══════════════════════════════════════════════
// 唯一核心输出: ReflectionResult
// 职责: 分析失败原因 + 给出选项（重试/换参数/换工具/跳过/重规划）
// 边界: 不执行修复，只给建议

/// Structured reflection result
#[derive(Debug, Clone)]
pub struct ReflectionResult {
    pub category: FailureCategory,
    pub fix: FailureFix,
    pub reflection_message: String,
}

/// Analyze failure with structured categorization (v3)
pub fn reflect_with_analysis(
    tool_name: &str,
    error: &str,
    step_task: &str,
    consecutive_failures: u32,
) -> ReflectionResult {
    // 1. Categorize the failure
    let category = failure_analyzer::categorize_failure(
        tool_name, error, step_task, consecutive_failures,
    );

    // 2. Get recommended fix
    let fix = failure_analyzer::recommend_fix(&category, tool_name);

    // 3. Build human-readable reflection message
    let reflection_message = build_smart_reflection(tool_name, error, step_task);

    ReflectionResult {
        category,
        fix,
        reflection_message,
    }
}

/// Analyze a tool failure and suggest a fix (LLM-driven)
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

/// Build smart reflection message based on error pattern matching
/// v2: Analyzes error type and provides specific, actionable recovery instructions
pub fn build_smart_reflection(tool_name: &str, error: &str, step_task: &str) -> String {
    let error_lower = error.to_lowercase();

    // ── Pattern 1: File/Path not found ──
    if error_lower.contains("not found") || error_lower.contains("找不到")
        || error_lower.contains("no such file") || error_lower.contains("不存在")
        || error_lower.contains("cannot find") || error_lower.contains("无法找到")
    {
        return format!(
            "⚠️ 工具 `{}` 失败: 文件或路径不存在。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. **检查路径** — 使用 `file_list` 先查看目录内容，确认文件名正确\n\
             2. **使用绝对路径** — Windows 格式如 `C:\\Users\\...`\n\
             3. **检查拼写** — 文件名大小写和扩展名是否正确\n\
             4. 如果用户提供了文件路径，请使用上面系统提示中的真实路径\n\n\
             请先用 `file_list` 查看正确路径，然后重试。",
            tool_name, error
        );
    }

    // ── Pattern 2: Permission denied ──
    if error_lower.contains("permission") || error_lower.contains("access denied")
        || error_lower.contains("权限") || error_lower.contains("拒绝访问")
    {
        return format!(
            "⚠️ 工具 `{}` 失败: 权限不足。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. 尝试不同的输出目录（如用户 Desktop 或 Documents）\n\
             2. 检查文件是否被其他程序占用\n\
             3. 使用 `shell_run` 执行 PowerShell 命令作为替代方案\n\n\
             请调整路径后重试。",
            tool_name, error
        );
    }

    // ── Pattern 3: Python module not found ──
    if error_lower.contains("modulenotfounderror") || error_lower.contains("no module named")
        || error_lower.contains("import error") || error_lower.contains("importerror")
    {
        // Extract module name if possible
        let module = if let Some(pos) = error_lower.find("no module named") {
            let rest = &error[pos + 16..];
            rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().unwrap_or("unknown")
        } else {
            "required_module"
        };
        return format!(
            "⚠️ 工具 `{}` 失败: Python 模块缺失。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. 先用 `shell_run` 安装缺失模块: `pip install {}`\n\
             2. 安装完成后再重新调用 `{}` 工具\n\n\
             请先安装模块再重试。",
            tool_name, error, module, tool_name
        );
    }

    // ── Pattern 4: JSON/Parse error ──
    if error_lower.contains("json") && (error_lower.contains("parse") || error_lower.contains("解析")
        || error_lower.contains("invalid") || error_lower.contains("syntax"))
    {
        return format!(
            "⚠️ 工具 `{}` 失败: 数据格式错误。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. 检查传入的参数是否为合法 JSON 格式\n\
             2. 字符串值需要用双引号包裹\n\
             3. 不要在 JSON 中使用单引号或尾逗号\n\
             4. 先用 `json_process` 的 validate 功能验证数据格式\n\n\
             请修正参数格式后重试。",
            tool_name, error
        );
    }

    // ── Pattern 5: Timeout ──
    if error_lower.contains("timeout") || error_lower.contains("超时")
        || error_lower.contains("timed out")
    {
        return format!(
            "⚠️ 工具 `{}` 执行超时。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. 如果是网络操作，检查 URL 是否可达\n\
             2. 如果是大文件，尝试分批处理\n\
             3. 如果是外部命令，检查命令是否会长时间阻塞\n\n\
             请简化操作后重试。",
            tool_name, error
        );
    }

    // ── Pattern 6: Connection/Network error ──
    if error_lower.contains("connection") || error_lower.contains("network")
        || error_lower.contains("网络") || error_lower.contains("连接")
    {
        return format!(
            "⚠️ 工具 `{}` 失败: 网络连接问题。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. 检查 URL 是否正确（包含 https://）\n\
             2. 尝试替代网站或 API\n\
             3. 使用 `shell_run` 执行 `ping` 检查连通性\n\n\
             请检查网络后重试。",
            tool_name, error
        );
    }

    // ── Pattern 7: Encoding/Unicode error ──
    if error_lower.contains("encoding") || error_lower.contains("codec")
        || error_lower.contains("编码") || error_lower.contains("utf")
        || error_lower.contains("gbk") || error_lower.contains("charmap")
    {
        return format!(
            "⚠️ 工具 `{}` 失败: 文件编码问题。\n\n\
             错误: {}\n\n\
             ## 修复指导\n\
             1. 如果是 CSV 文件，尝试指定编码为 'gbk' 或 'gb2312'（中文常用）\n\
             2. 如果是 Excel，使用 `excel_read` 代替直接读取\n\
             3. 使用 `shell_run` 执行 `Get-Content -Encoding UTF8` 读取\n\n\
             请尝试不同编码后重试。",
            tool_name, error
        );
    }

    // ── Default: Generic reflection with context ──
    format!(
        "⚠️ 工具 `{}` 执行失败。\n\n\
         错误: {}\n\n\
         当前步骤: {}\n\n\
         ## 修复指导\n\
         1. 检查参数是否正确\n\
         2. 确认文件路径存在且可访问\n\
         3. 考虑是否有替代工具可以完成同样的任务\n\
         4. 如果需要先执行其他操作（如创建目录、安装依赖），请先处理\n\n\
         请分析错误原因并调用正确的工具重试。",
        tool_name, error, step_task
    )
}

/// Legacy: Build a simple reflection message (kept for backward compat)
pub fn build_reflection_message(tool_name: &str, error: &str) -> String {
    build_smart_reflection(tool_name, error, "")
}
