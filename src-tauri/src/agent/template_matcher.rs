use super::types::*;
use crate::app_log;
use serde_json::{json, Value};

// ═══════════════════════════════════════════════════════════════
// Template Matcher — Predefined Office Workflow Templates
//
// 8 core templates that bypass LLM planning for high-frequency tasks.
// Each template is a deterministic or semi-deterministic workflow.
// ═══════════════════════════════════════════════════════════════

/// Get all built-in office workflow templates.
pub fn get_templates() -> Vec<AgentTemplate> {
    vec![
        // ── Template 1: Word 提取 Agent ──
        AgentTemplate {
            template_id: "tpl_word_extract".into(),
            intent: "从 Word 文档中提取信息".into(),
            execution_mode: TemplateExecutionMode::Deterministic,
            trigger_patterns: vec![
                "word".into(), "文档".into(), "提取".into(), "读取".into(),
                "获取".into(), "抽取".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "word_read".into(),
                    goal: "读取 Word 文档全文".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "word_extract_fields".into(),
                    goal: "按字段提取关键信息".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "vars_set".into(),
                    goal: "保存提取结果到变量".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 2: Excel 提取 Agent ──
        AgentTemplate {
            template_id: "tpl_excel_extract".into(),
            intent: "从 Excel 中提取数据".into(),
            execution_mode: TemplateExecutionMode::Deterministic,
            trigger_patterns: vec![
                "excel".into(), "表格".into(), "提取".into(), "读取".into(),
                "获取".into(), "查找".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "excel_read".into(),
                    goal: "读取 Excel 数据".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "excel_extract_rows".into(),
                    goal: "按条件提取行".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "vars_set".into(),
                    goal: "保存提取结果".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 3: Word → Word 修改 Agent ──
        AgentTemplate {
            template_id: "tpl_word_to_word".into(),
            intent: "从 Word A 提取信息，修改 Word B".into(),
            execution_mode: TemplateExecutionMode::SkeletonWithLlm,
            trigger_patterns: vec![
                "word".into(), "修改".into(), "替换".into(), "批量".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "word_read".into(),
                    goal: "读取源 Word 文档".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "word_extract_fields".into(),
                    goal: "提取关键字段".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "record_map_fields".into(),
                    goal: "字段映射转换".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "word_replace_text".into(),
                    goal: "批量替换目标 Word 文本".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 4: Excel → Excel 更新 Agent ──
        AgentTemplate {
            template_id: "tpl_excel_to_excel".into(),
            intent: "从 Excel A 提取数据，更新 Excel B".into(),
            execution_mode: TemplateExecutionMode::Deterministic,
            trigger_patterns: vec![
                "excel".into(), "更新".into(), "同步".into(), "批量".into(),
                "主键".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "excel_read".into(),
                    goal: "读取源 Excel".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "excel_extract_rows".into(),
                    goal: "提取需要的数据行".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "record_map_fields".into(),
                    goal: "字段映射".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "excel_replace_by_key".into(),
                    goal: "按主键批量更新目标 Excel".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 5: Word → Excel 填充 Agent ──
        AgentTemplate {
            template_id: "tpl_word_to_excel".into(),
            intent: "从 Word 提取字段，写入 Excel".into(),
            execution_mode: TemplateExecutionMode::Deterministic,
            trigger_patterns: vec![
                "word".into(), "excel".into(), "填充".into(), "写入".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "word_extract_fields".into(),
                    goal: "从 Word 提取字段".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "record_build".into(),
                    goal: "构造结构化记录".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "excel_write_cell".into(),
                    goal: "写入 Excel 单元格".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 6: Excel → Word 填充 Agent ──
        AgentTemplate {
            template_id: "tpl_excel_to_word".into(),
            intent: "从 Excel 提取数据，填充 Word 模板".into(),
            execution_mode: TemplateExecutionMode::SkeletonWithLlm,
            trigger_patterns: vec![
                "excel".into(), "word".into(), "模板".into(), "填充".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "excel_extract_rows".into(),
                    goal: "提取 Excel 数据".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "record_build".into(),
                    goal: "构造记录".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "word_fill_template".into(),
                    goal: "填充 Word 模板".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 7: 本地 → 浏览器填报 Agent ──
        AgentTemplate {
            template_id: "tpl_local_to_browser".into(),
            intent: "从本地文件提取数据，自动填写网页表单".into(),
            execution_mode: TemplateExecutionMode::SkeletonWithLlm,
            trigger_patterns: vec![
                "浏览器".into(), "网页".into(), "表单".into(), "填报".into(),
                "提交".into(), "填写".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "word_extract_fields".into(),
                    goal: "从本地文件提取数据".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "record_build".into(),
                    goal: "构造填报数据".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "browser_fill_input".into(),
                    goal: "填写网页输入框".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "browser_submit_form".into(),
                    goal: "提交表单".into(),
                    default_args: json!({}),
                },
            ],
        },

        // ── Template 8: 文件创建 / 导出 Agent ──
        AgentTemplate {
            template_id: "tpl_file_create".into(),
            intent: "创建空白或有内容的办公文件".into(),
            execution_mode: TemplateExecutionMode::Deterministic,
            trigger_patterns: vec![
                "创建".into(), "新建".into(), "生成".into(), "空白".into(),
            ],
            default_steps: vec![
                TemplateStep {
                    tool_name: "desktop_path_get".into(),
                    goal: "获取桌面路径".into(),
                    default_args: json!({}),
                },
                TemplateStep {
                    tool_name: "word_write".into(),
                    goal: "创建文件".into(),
                    default_args: json!({}),
                },
            ],
        },
    ]
}

/// Match a user description against all templates.
/// Returns the best match with constraints and done spec.
pub fn match_template(description: &str) -> Option<TemplateMatch> {
    let desc_lower = description.to_lowercase();
    let constraints = super::constraint_extractor::extract_constraints(description);
    let done_spec = super::constraint_extractor::build_done_spec(&constraints);

    let templates = get_templates();
    let mut best_match: Option<(AgentTemplate, f64)> = None;

    for template in templates {
        let score = calculate_match_score(&desc_lower, &template, &constraints);
        if score > 0.3 {
            if let Some((_, current_best)) = &best_match {
                if score > *current_best {
                    best_match = Some((template, score));
                }
            } else {
                best_match = Some((template, score));
            }
        }
    }

    if let Some((template, confidence)) = best_match {
        app_log!("TEMPLATE", "✅ Matched: {} (confidence={:.2})", template.template_id, confidence);
        Some(TemplateMatch {
            template,
            constraints,
            done_spec,
            confidence,
        })
    } else {
        app_log!("TEMPLATE", "❌ No template matched, falling back to LLM planner");
        None
    }
}

/// Calculate a match score between description and template.
fn calculate_match_score(
    desc_lower: &str,
    template: &AgentTemplate,
    constraints: &UserConstraints,
) -> f64 {
    let mut score: f64 = 0.0;
    let mut matched_keywords = 0;

    // Keyword matching
    for pattern in &template.trigger_patterns {
        if desc_lower.contains(pattern.as_str()) {
            matched_keywords += 1;
        }
    }

    if matched_keywords == 0 {
        return 0.0;
    }

    // Base score from keyword matches
    let keyword_ratio = matched_keywords as f64 / template.trigger_patterns.len() as f64;
    score += keyword_ratio * 0.5;

    // Boost for workflow type alignment
    if let Some(ref wf_type) = constraints.workflow_type {
        let type_match = match (wf_type, template.template_id.as_str()) {
            (WorkflowType::WordExtract, "tpl_word_extract") => true,
            (WorkflowType::ExcelExtract, "tpl_excel_extract") => true,
            (WorkflowType::WordModify, "tpl_word_to_word") => true,
            (WorkflowType::WordToWord, "tpl_word_to_word") => true,
            (WorkflowType::ExcelModify, "tpl_excel_to_excel") => true,
            (WorkflowType::ExcelToExcel, "tpl_excel_to_excel") => true,
            (WorkflowType::WordToExcel, "tpl_word_to_excel") => true,
            (WorkflowType::ExcelToWord, "tpl_excel_to_word") => true,
            (WorkflowType::LocalToBrowser, "tpl_local_to_browser") => true,
            (WorkflowType::FileCreate, "tpl_file_create") => true,
            (WorkflowType::Export, "tpl_file_create") => true,
            _ => false,
        };
        if type_match {
            score += 0.4;
        }
    }

    // Boost for having output format constraint
    if constraints.output_format.is_some() {
        score += 0.1;
    }

    score.min(1.0)
}

/// Convert a matched template into a BlueprintInfo.
pub fn template_to_blueprint(
    template_match: &TemplateMatch,
    description: &str,
) -> BlueprintInfo {
    let template = &template_match.template;
    let constraints = &template_match.constraints;

    let steps: Vec<WorkflowStepInfo> = template.default_steps.iter().enumerate().map(|(i, step)| {
        WorkflowStepInfo {
            id: (i + 1) as u32,
            goal: step.goal.clone(),
            tool: step.tool_name.clone(),
            default_args: step.default_args.clone(),
            depends_on: if i > 0 { Some(i as u32) } else { None },
            optional: false,
            timeout_secs: 30,
        }
    }).collect();

    let name = format!("{}", template.intent);
    let tool_count = steps.len();

    BlueprintInfo {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        persona: template.intent.clone(),
        goal_template: description.to_string(),
        tool_count,
        workflow_steps: tool_count,
        version: "1.0".into(),
        status: BlueprintStatus::Draft,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        workflow_template: steps,
        complexity: match template.default_steps.len() {
            0..=2 => 1,
            3..=4 => 2,
            _ => 3,
        },
        tags: vec![
            format!("template:{}", template.template_id),
            format!("mode:{:?}", template.execution_mode),
        ],
    }
}
