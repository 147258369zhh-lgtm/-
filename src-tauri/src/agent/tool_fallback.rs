// ═══════════════════════════════════════════════
// Tool Fallback Chains — Auto-degradation on failure
// ═══════════════════════════════════════════════
//
// When a tool fails, the system automatically tries the next
// tool in the fallback chain WITHOUT re-calling the LLM.
// This is a system-level optimization, not a model decision.

use std::collections::HashMap;
use crate::app_log;

/// Get the fallback chain for a given tool
pub fn get_fallback(tool_name: &str) -> Option<Vec<FallbackOption>> {
    let chains = build_fallback_chains();
    chains.get(tool_name).cloned()
}

#[derive(Debug, Clone)]
pub struct FallbackOption {
    pub tool_name: String,
    pub transform_args: ArgTransform,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub enum ArgTransform {
    /// Use the same args as-is
    SameArgs,
    /// Transform specific arg keys
    MapArgs(Vec<(String, String)>),
    /// Use a completely different set of args constructed from originals
    CustomTemplate(String),
}

fn build_fallback_chains() -> HashMap<String, Vec<FallbackOption>> {
    let mut chains = HashMap::new();

    // shell_run fallback: PowerShell → cmd → python
    chains.insert("shell_run".to_string(), vec![
        FallbackOption {
            tool_name: "shell_run".to_string(),
            transform_args: ArgTransform::CustomTemplate("cmd_fallback".into()),
            reason: "PowerShell 失败，尝试 cmd".into(),
        },
    ]);

    // word_write fallback: word_write → file_write (txt)
    chains.insert("word_write".to_string(), vec![
        FallbackOption {
            tool_name: "file_write".to_string(),
            transform_args: ArgTransform::CustomTemplate("word_to_txt".into()),
            reason: "Word 创建失败，降级为纯文本文件".into(),
        },
    ]);

    // excel_write fallback: excel_write → file_write (csv)
    chains.insert("excel_write".to_string(), vec![
        FallbackOption {
            tool_name: "file_write".to_string(),
            transform_args: ArgTransform::CustomTemplate("excel_to_csv".into()),
            reason: "Excel 创建失败，降级为 CSV".into(),
        },
    ]);

    // web_scrape fallback: web_scrape → shell_run (curl)
    chains.insert("web_scrape".to_string(), vec![
        FallbackOption {
            tool_name: "shell_run".to_string(),
            transform_args: ArgTransform::CustomTemplate("web_to_curl".into()),
            reason: "Python 爬取失败，尝试 curl".into(),
        },
    ]);

    // excel_read fallback: excel_read → file_read
    chains.insert("excel_read".to_string(), vec![
        FallbackOption {
            tool_name: "file_read".to_string(),
            transform_args: ArgTransform::SameArgs,
            reason: "Excel 读取失败，尝试纯文本读取".into(),
        },
    ]);

    chains
}

/// Transform arguments for fallback tool based on template
pub fn transform_args_for_fallback(
    original_tool: &str,
    original_args: &serde_json::Value,
    fallback: &FallbackOption,
) -> serde_json::Value {
    match &fallback.transform_args {
        ArgTransform::SameArgs => original_args.clone(),
        ArgTransform::MapArgs(mappings) => {
            let mut new_args = original_args.clone();
            for (from, to) in mappings {
                if let Some(val) = original_args.get(from) {
                    new_args[to] = val.clone();
                }
            }
            new_args
        }
        ArgTransform::CustomTemplate(template) => {
            match template.as_str() {
                "cmd_fallback" => {
                    // Convert PowerShell command to cmd
                    let cmd = original_args["command"].as_str().unwrap_or("");
                    serde_json::json!({
                        "command": format!("cmd /c {}", cmd)
                    })
                }
                "word_to_txt" => {
                    let title = original_args["title"].as_str().unwrap_or("文档");
                    let content = original_args["content"].as_str().unwrap_or("");
                    let path = original_args["output_path"].as_str().unwrap_or("")
                        .replace(".docx", ".txt");
                    serde_json::json!({
                        "path": path,
                        "content": format!("{}\n\n{}", title, content)
                    })
                }
                "excel_to_csv" => {
                    let headers = original_args["headers"].as_str().unwrap_or("");
                    let rows = original_args["rows"].as_str().unwrap_or("");
                    let path = original_args["output_path"].as_str().unwrap_or("")
                        .replace(".xlsx", ".csv").replace(".xls", ".csv");
                    let mut csv_content = headers.to_string();
                    for row in rows.split("|||") {
                        let row = row.trim();
                        if !row.is_empty() {
                            csv_content.push('\n');
                            csv_content.push_str(row);
                        }
                    }
                    serde_json::json!({
                        "path": path,
                        "content": csv_content
                    })
                }
                "web_to_curl" => {
                    let url = original_args["url"].as_str().unwrap_or("");
                    serde_json::json!({
                        "command": format!("curl -s -L --max-time 10 \"{}\"", url)
                    })
                }
                _ => original_args.clone(),
            }
        }
    }
}
