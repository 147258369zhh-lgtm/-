use super::types::*;
use crate::app_log;
use serde_json::{json, Value};

// ═══════════════════════════════════════════════════════════════
// Constraint Extractor — Rule-Based User Requirement Analysis
//
// Extracts structured UserConstraints + DoneSpec from natural language.
// Pure keyword matching — no LLM calls. Fast and deterministic.
// ═══════════════════════════════════════════════════════════════

/// Extract structured constraints from a user's natural language request.
pub fn extract_constraints(description: &str) -> UserConstraints {
    let desc = description.to_lowercase();
    let mut c = UserConstraints::default();

    // ── Output Format Detection ──
    if desc.contains("word") || desc.contains("文档") || desc.contains(".docx") {
        c.output_format = Some("docx".into());
    } else if desc.contains("excel") || desc.contains("表格") || desc.contains(".xlsx")
        || desc.contains("电子表格") || desc.contains("工作表")
    {
        c.output_format = Some("xlsx".into());
    } else if desc.contains("txt") || desc.contains("文本文件") || desc.contains("纯文本") {
        c.output_format = Some("txt".into());
    } else if desc.contains("ppt") || desc.contains("幻灯片") || desc.contains("演示文稿") {
        c.output_format = Some("pptx".into());
    } else if desc.contains("pdf") {
        c.output_format = Some("pdf".into());
    }

    // ── Output Location Detection ──
    if desc.contains("桌面") || desc.contains("desktop") {
        c.output_location = Some("desktop".into());
    } else if desc.contains("文档文件夹") || desc.contains("我的文档") || desc.contains("documents") {
        c.output_location = Some("documents".into());
    }

    // ── Filename Rule Detection ──
    if desc.contains("时间命名") || desc.contains("时间戳") || desc.contains("按时间")
        || desc.contains("日期命名")
    {
        c.filename_rule = Some("timestamp".into());
    }

    // ── Content Requirement Detection ──
    // Look for content after keywords like "写", "内容", "包含"
    let content_patterns = ["写", "内容是", "内容为", "包含", "填入", "填写"];
    for pattern in &content_patterns {
        if let Some(pos) = desc.find(pattern) {
            let after = &description[pos + pattern.len()..];
            let content = after.trim().trim_matches(|c: char| c == '：' || c == ':' || c == '"' || c == '"' || c == '"');
            if !content.is_empty() && content.len() < 200 {
                c.content_requirement = Some(content.to_string());
                break;
            }
        }
    }

    // ── Workflow Type Detection ──
    c.workflow_type = Some(detect_workflow_type(description));

    app_log!("CONSTRAINT", "Extracted: format={:?} location={:?} filename={:?} workflow={:?}",
        c.output_format, c.output_location, c.filename_rule, c.workflow_type);

    c
}

/// Detect the workflow type from the description.
pub fn detect_workflow_type(description: &str) -> WorkflowType {
    let desc = description.to_lowercase();

    let has_word = desc.contains("word") || desc.contains("文档") || desc.contains(".docx");
    let has_excel = desc.contains("excel") || desc.contains("表格") || desc.contains(".xlsx");
    let has_browser = desc.contains("浏览器") || desc.contains("网页") || desc.contains("表单")
        || desc.contains("填报") || desc.contains("网站");
    let has_extract = desc.contains("提取") || desc.contains("读取") || desc.contains("获取")
        || desc.contains("抽取");
    let has_modify = desc.contains("修改") || desc.contains("替换") || desc.contains("更新")
        || desc.contains("批量");
    let has_create = desc.contains("创建") || desc.contains("生成") || desc.contains("新建")
        || desc.contains("空白");
    let has_export = desc.contains("导出") || desc.contains("转换") || desc.contains("导入");
    let has_fill = desc.contains("填充") || desc.contains("填入") || desc.contains("写入");
    let has_cross = (has_word && has_excel) || desc.contains("→") || desc.contains("到");

    // Cross-document flows take priority
    if has_word && has_browser {
        return WorkflowType::LocalToBrowser;
    }
    if has_excel && has_browser {
        return WorkflowType::LocalToBrowser;
    }

    if has_cross && has_word && has_excel {
        if desc.contains("word") && (desc.contains("写入excel") || desc.contains("填入excel") || desc.contains("到excel")) {
            return WorkflowType::WordToExcel;
        }
        if desc.contains("excel") && (desc.contains("写入word") || desc.contains("填入word") || desc.contains("到word")) {
            return WorkflowType::ExcelToWord;
        }
        // Default cross: whichever is mentioned first as source
        if let (Some(w_pos), Some(e_pos)) = (desc.find("word"), desc.find("excel")) {
            if w_pos < e_pos {
                return WorkflowType::WordToExcel;
            } else {
                return WorkflowType::ExcelToWord;
            }
        }
    }

    // Word-only flows
    if has_word && !has_excel {
        if has_extract {
            return WorkflowType::WordExtract;
        }
        if has_modify {
            return WorkflowType::WordModify;
        }
        if has_create {
            return WorkflowType::FileCreate;
        }
        return WorkflowType::WordModify;
    }

    // Excel-only flows
    if has_excel && !has_word {
        if has_extract {
            return WorkflowType::ExcelExtract;
        }
        if has_modify {
            return WorkflowType::ExcelModify;
        }
        if has_create {
            return WorkflowType::FileCreate;
        }
        return WorkflowType::ExcelModify;
    }

    // Export/Convert
    if has_export {
        return WorkflowType::Export;
    }

    // Simple file creation (no specific document type mentioned clearly)
    if has_create {
        return WorkflowType::FileCreate;
    }

    // Browser-only
    if has_browser {
        return WorkflowType::LocalToBrowser;
    }

    // Default fallback
    WorkflowType::FileCreate
}

/// Build a DoneSpec from UserConstraints.
pub fn build_done_spec(constraints: &UserConstraints) -> DoneSpec {
    let deliverable_type = constraints.output_format.clone().unwrap_or_else(|| "file".into());

    let success_checks = match deliverable_type.as_str() {
        "docx" => vec!["文件存在且为有效 .docx".into()],
        "xlsx" => vec!["文件存在且为有效 .xlsx".into()],
        "txt" => vec!["文件存在且内容不为空".into()],
        "browser_submit" => vec!["表单提交成功".into()],
        _ => vec!["任务完成".into()],
    };

    DoneSpec {
        deliverable_type,
        save_path: constraints.output_location.clone(),
        filename_pattern: constraints.filename_rule.clone(),
        required_content: constraints.content_requirement.iter().cloned().collect(),
        success_checks,
    }
}
