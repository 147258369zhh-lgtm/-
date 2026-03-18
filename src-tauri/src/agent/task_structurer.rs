use serde_json::{json, Value};
use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════
// Task Structurer — 用户自然语言 → 结构化任务
// ═══════════════════════════════════════════════

/// Public wrapper: intent classification for agent_factory
pub fn classify_intent_from_keywords_pub(goal: &str) -> TaskIntent {
    classify_intent_from_keywords(goal).unwrap_or(TaskIntent::Unknown)
}

/// Public wrapper: tools for intent for agent_factory
pub fn tools_for_intent_pub(intent: &TaskIntent) -> Vec<&'static str> {
    tools_for_intent(intent)
}

/// Intent-to-tools mapping: which tools are relevant for each intent
/// 每个意图都包含核心基础工具 (shell_run, file_create, date_now)
fn tools_for_intent(intent: &TaskIntent) -> Vec<&'static str> {
    // 所有意图都需要的基础工具
    let mut tools: Vec<&'static str> = vec![
        "shell_run", "file_create", "file_read", "file_write",
        "file_list", "date_now",
    ];

    let extra = match intent {
        TaskIntent::InformationGathering => vec![
            "web_scrape", "browser_navigate", "browser_script",
            "translate_text",
        ],
        TaskIntent::DataAnalysis => vec![
            "excel_read", "excel_write", "excel_analyze",
            "csv_to_excel", "data_merge", "table_transform",
            "chart_generate", "json_process",
        ],
        TaskIntent::DocumentGeneration => vec![
            "word_write", "word_read", "ppt_create", "ppt_read",
            "pdf_read", "report_generate", "doc_convert",
            "markdown_convert", "excel_read", "excel_write",
            "chart_generate", "image_process",
        ],
        TaskIntent::FileOperation => vec![
            "file_delete", "file_move", "file_search",
            "compress_archive",
        ],
        TaskIntent::SystemCommand => vec![
            "file_search",
        ],
        TaskIntent::ContentCreation => vec![
            "translate_text", "markdown_convert", "qrcode_generate",
            "image_process",
        ],
        TaskIntent::Unknown => vec![
            "web_scrape", "excel_read", "word_write",
        ],
    };

    for t in extra {
        if !tools.contains(&t) {
            tools.push(t);
        }
    }

    tools
}

/// Classify intent from keywords (fast path, no LLM needed)
fn classify_intent_from_keywords(goal: &str) -> Option<TaskIntent> {
    let g = goal.to_lowercase();

    // Information gathering
    let info_kw = ["搜索", "查找", "查询", "爬取", "新闻", "天气", "网页",
                   "网站", "抓取", "浏览", "下载网", "获取网", "search", "scrape",
                   "crawl", "browse", "news", "weather"];
    if info_kw.iter().any(|k| g.contains(k)) {
        return Some(TaskIntent::InformationGathering);
    }

    // Data analysis
    let data_kw = ["分析", "统计", "汇总", "数据", "excel", "表格", "图表",
                   "csv", "chart", "柱状图", "折线图", "饼图", "计算", "对比"];
    if data_kw.iter().any(|k| g.contains(k)) {
        return Some(TaskIntent::DataAnalysis);
    }

    // Document generation
    let doc_kw = ["报告", "文档", "word", "ppt", "pdf", "docx", "幻灯片",
                  "论文", "简历", "方案", "report", "document", "演示"];
    if doc_kw.iter().any(|k| g.contains(k)) {
        return Some(TaskIntent::DocumentGeneration);
    }

    // File operations
    let file_kw = ["复制", "移动", "删除", "重命名", "压缩", "解压",
                   "zip", "文件夹", "整理文件", "备份"];
    if file_kw.iter().any(|k| g.contains(k)) {
        return Some(TaskIntent::FileOperation);
    }

    // System commands
    let sys_kw = ["安装", "编译", "运行", "命令", "pip", "npm", "执行",
                  "install", "build", "compile", "deploy", "部署"];
    if sys_kw.iter().any(|k| g.contains(k)) {
        return Some(TaskIntent::SystemCommand);
    }

    // Content creation
    let content_kw = ["翻译", "转换", "二维码", "qr", "translate",
                      "markdown", "写作", "生成图片"];
    if content_kw.iter().any(|k| g.contains(k)) {
        return Some(TaskIntent::ContentCreation);
    }

    None
}

/// Estimate complexity from goal text
fn estimate_complexity(goal: &str) -> TaskComplexity {
    let g = goal.to_lowercase();

    // Complex indicators
    let complex_kw = ["所有", "批量", "多个", "对比", "综合", "自动化", "全面",
                      "系统", "完整", "all", "batch", "multiple", "comprehensive"];
    let complex_count = complex_kw.iter().filter(|k| g.contains(*k)).count();

    if complex_count >= 2 || g.len() > 100 {
        TaskComplexity::Complex
    } else if complex_count >= 1 || g.len() > 50 {
        TaskComplexity::Medium
    } else {
        TaskComplexity::Simple
    }
}

/// Extract keywords from goal for experience matching
fn extract_keywords(goal: &str) -> Vec<String> {
    let stop_words = ["的", "了", "和", "与", "在", "是", "不", "我", "你",
                      "他", "她", "它", "们", "这", "那", "个", "一",
                      "把", "帮", "请", "给", "做", "用", "到"];
    goal.chars()
        .collect::<String>()
        .split(|c: char| c.is_whitespace() || is_cjk_punct(c))
        .filter(|w| w.len() >= 2 && !stop_words.contains(w))
        .map(|w| w.to_string())
        .collect()
}

fn is_cjk_punct(c: char) -> bool {
    matches!(c, '\u{FF0C}' | '\u{3002}' | '\u{FF01}' | '\u{FF1F}' |
                '\u{3001}' | '\u{FF1B}' | '\u{FF1A}' | '\u{201C}' |
                '\u{201D}' | '\u{2018}' | '\u{2019}' | '\u{300C}' |
                '\u{300D}' | '\u{FF08}' | '\u{FF09}')
}

/// Main entry: structurize a user's natural language goal
/// Fast path uses keyword matching; LLM fallback for ambiguous tasks.
pub async fn structurize_task(
    goal: &str,
    llm: &LlmConfig,
    client: &reqwest::Client,
) -> Result<StructuredTask, String> {
    app_log!("STRUCTURER", "Structurizing goal: {}", goal);

    // 1. Try fast keyword-based classification
    let intent = match classify_intent_from_keywords(goal) {
        Some(i) => {
            app_log!("STRUCTURER", "Fast-path intent: {:?}", i);
            i
        }
        None => {
            // 2. Fallback: LLM-based classification
            app_log!("STRUCTURER", "Using LLM for intent classification");
            classify_intent_via_llm(goal, llm, client).await
                .unwrap_or(TaskIntent::Unknown)
        }
    };

    let keywords = extract_keywords(goal);
    let complexity = estimate_complexity(goal);
    let required_tools: Vec<String> = tools_for_intent(&intent)
        .iter()
        .map(|s| s.to_string())
        .collect();

    let task = StructuredTask {
        goal: goal.to_string(),
        intent,
        keywords,
        inputs: vec![],  // will be enriched by LLM or template
        expected_output: infer_output(goal),
        required_tools,
        complexity,
    };

    app_log!("STRUCTURER", "Result: intent={:?}, tools={}, complexity={:?}",
        task.intent, task.required_tools.len(), task.complexity);

    Ok(task)
}

/// Infer expected output from goal text
fn infer_output(goal: &str) -> String {
    let g = goal.to_lowercase();
    if g.contains("报告") || g.contains("report") {
        "生成报告文件".into()
    } else if g.contains("图表") || g.contains("chart") {
        "生成图表图片".into()
    } else if g.contains("excel") || g.contains("表格") {
        "生成 Excel 文件".into()
    } else if g.contains("文件") {
        "生成文件".into()
    } else {
        "文本输出".into()
    }
}

/// LLM-based intent classification (fallback)
async fn classify_intent_via_llm(
    goal: &str,
    llm: &LlmConfig,
    client: &reqwest::Client,
) -> Result<TaskIntent, String> {
    let prompt = format!(
        r#"请分析以下用户任务的意图类型，只返回一个英文标签：

任务: "{}"

可选标签（只能选一个）:
- information_gathering（搜索、爬虫、查询网页信息）
- data_analysis（Excel分析、统计、图表、数据处理）
- document_generation（生成报告、Word、PPT、PDF）
- file_operation（文件复制、移动、删除、压缩）
- system_command（安装软件、编译代码、执行命令）
- content_creation（翻译、写作、图片生成、格式转换）
- unknown

只返回标签，不要其他文字。"#,
        goal
    );

    let payload = json!({
        "model": llm.model_name,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 50
    });

    let mut req = client.post(&llm.endpoint).json(&payload);
    if !llm.api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", llm.api_key));
    }

    let resp = req.send().await.map_err(|e| format!("LLM 请求失败: {}", e))?;
    let json_resp: Value = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    let label = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("unknown")
        .trim()
        .to_lowercase();

    Ok(match label.as_str() {
        "information_gathering" => TaskIntent::InformationGathering,
        "data_analysis" => TaskIntent::DataAnalysis,
        "document_generation" => TaskIntent::DocumentGeneration,
        "file_operation" => TaskIntent::FileOperation,
        "system_command" => TaskIntent::SystemCommand,
        "content_creation" => TaskIntent::ContentCreation,
        _ => TaskIntent::Unknown,
    })
}

/// Generate an AgentConfig from a StructuredTask
pub fn build_agent_config(task: &StructuredTask) -> AgentConfig {
    let role = match &task.intent {
        TaskIntent::InformationGathering => AgentRole {
            name: "信息采集专家".into(),
            expertise: vec!["网页爬取".into(), "数据提取".into(), "信息整理".into()],
        },
        TaskIntent::DataAnalysis => AgentRole {
            name: "数据分析师".into(),
            expertise: vec!["数据处理".into(), "统计分析".into(), "可视化".into()],
        },
        TaskIntent::DocumentGeneration => AgentRole {
            name: "文档专家".into(),
            expertise: vec!["报告撰写".into(), "文档格式化".into(), "排版设计".into()],
        },
        TaskIntent::FileOperation => AgentRole {
            name: "文件管理员".into(),
            expertise: vec!["文件操作".into(), "目录管理".into(), "批处理".into()],
        },
        TaskIntent::SystemCommand => AgentRole {
            name: "系统管理员".into(),
            expertise: vec!["命令行操作".into(), "脚本执行".into(), "环境配置".into()],
        },
        TaskIntent::ContentCreation => AgentRole {
            name: "内容创作者".into(),
            expertise: vec!["文本处理".into(), "格式转换".into(), "创意生成".into()],
        },
        TaskIntent::Unknown => AgentRole {
            name: "通用助手".into(),
            expertise: vec!["任务执行".into()],
        },
    };

    let constraints = match &task.complexity {
        TaskComplexity::Simple => ExecutionConstraints {
            max_retries_per_step: 1,
            max_total_failures: 2,
            timeout_per_step_secs: 30,
            fallback_strategy: "skip".into(),
        },
        TaskComplexity::Medium => ExecutionConstraints {
            max_retries_per_step: 2,
            max_total_failures: 3,
            timeout_per_step_secs: 60,
            fallback_strategy: "retry".into(),
        },
        TaskComplexity::Complex => ExecutionConstraints {
            max_retries_per_step: 2,
            max_total_failures: 4,
            timeout_per_step_secs: 90,
            fallback_strategy: "replan".into(),
        },
    };

    AgentConfig {
        role,
        tools: task.required_tools.clone(),
        constraints,
    }
}
