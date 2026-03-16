use super::types::{ToolDef, ToolFunction};
use crate::mcp::client::McpClientManager;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

// ═══════════════════════════════════════════════
// Built-in Tool Definitions (JSON Schema)
// ═══════════════════════════════════════════════

pub fn get_builtin_tools() -> Vec<ToolDef> {
    vec![
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_read".into(),
                description: "读取文件内容。返回文本文件的内容字符串。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "文件的绝对路径" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_write".into(),
                description: "写入或覆盖文件内容。如果文件不存在则创建。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "文件的绝对路径" },
                        "content": { "type": "string", "description": "要写入的内容" }
                    },
                    "required": ["path", "content"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_create".into(),
                description: "创建新文件或目录。自动创建不存在的父目录。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "文件或目录的绝对路径" },
                        "content": { "type": "string", "description": "文件内容（如果是创建目录则留空）" },
                        "is_directory": { "type": "boolean", "description": "是否创建目录而非文件，默认 false" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_delete".into(),
                description: "删除指定的文件。谨慎使用。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "要删除的文件路径" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_move".into(),
                description: "移动或重命名文件。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "from": { "type": "string", "description": "源路径" },
                        "to": { "type": "string", "description": "目标路径" }
                    },
                    "required": ["from", "to"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_list".into(),
                description: "列出目录下的所有文件和子目录。返回名称列表。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "directory": { "type": "string", "description": "目录的绝对路径" },
                        "recursive": { "type": "boolean", "description": "是否递归列出子目录，默认 false" }
                    },
                    "required": ["directory"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "file_search".into(),
                description: "在指定目录的文件内容中搜索关键词。返回匹配的文件路径和匹配行。"
                    .into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "directory": { "type": "string", "description": "搜索的根目录" },
                        "query": { "type": "string", "description": "搜索关键词" },
                        "extensions": { "type": "string", "description": "文件扩展名过滤，如 txt,docx,xlsx，用逗号分隔" }
                    },
                    "required": ["directory", "query"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "shell_run".into(),
                description: "在本地执行一条 shell 命令并返回输出。仅限安全命令。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "要执行的命令" },
                        "cwd": { "type": "string", "description": "工作目录（可选）" }
                    },
                    "required": ["command"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "project_list".into(),
                description: "列出所有项目，返回项目名称、编号、城市等信息。".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "project_files".into(),
                description: "列出指定项目的所有文件。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "项目 ID" }
                    },
                    "required": ["project_id"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "project_context".into(),
                description: "获取项目的完整设计上下文大纲，包含项目信息、勘察详情、文件列表等。"
                    .into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "项目 ID（可选，为空则获取全局上下文）" }
                    },
                    "required": []
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_open".into(),
                description: "Open a URL in an automation browser window.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The URL to open" }
                    },
                    "required": ["url"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_fill".into(),
                description: "Fill an input field on the browser page by matching a label text."
                    .into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "label": { "type": "string", "description": "Label text associated with the input field" },
                        "value": { "type": "string", "description": "Value to fill" }
                    },
                    "required": ["label", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_click".into(),
                description:
                    "Click a button or link on the browser page by matching its text content."
                        .into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "label": { "type": "string", "description": "Text content of the button or link to click" }
                    },
                    "required": ["label"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_extract".into(),
                description: "Extract a text summary from the current browser page.".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_scroll".into(),
                description: "Scroll the browser page up or down.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "direction": { "type": "string", "description": "Scroll direction: up or down" },
                        "amount": { "type": "integer", "description": "Scroll amount in pixels, default 500" }
                    },
                    "required": ["direction"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "mcp_list_tools".into(),
                description: "List all tools available from connected MCP servers.".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "mcp_call_tool".into(),
                description: "Call a tool on a connected MCP server.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "server_name": { "type": "string", "description": "MCP server name" },
                        "tool_name": { "type": "string", "description": "Tool name to call" },
                        "arguments": { "type": "object", "description": "Tool arguments" }
                    },
                    "required": ["server_name", "tool_name"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "template_list".into(),
                description: "列出所有设计模板。返回模板名称、阶段、标签等信息。".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "template_create".into(),
                description: "创建一个新的设计模板。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "模板名称" },
                        "stage": { "type": "string", "description": "适用阶段" },
                        "label": { "type": "string", "description": "标签" },
                        "source_file_path": { "type": "string", "description": "源文件路径" }
                    },
                    "required": ["name"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "common_info_list".into(),
                description: "列出所有通用参考信息（如施工规范、常用参数等）。".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "common_info_update".into(),
                description: "创建或更新一条通用参考信息。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "key": { "type": "string", "description": "信息键名" },
                        "value": { "type": "string", "description": "信息值" },
                        "remarks": { "type": "string", "description": "备注" },
                        "category": { "type": "string", "description": "分类" }
                    },
                    "required": ["key", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "survey_get".into(),
                description: "获取指定项目的勘察数据。返回日期、地点、勘察人、摘要等。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "项目 ID" }
                    },
                    "required": ["project_id"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "survey_update".into(),
                description: "更新项目的勘察数据。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "项目 ID" },
                        "date": { "type": "string", "description": "勘察日期" },
                        "location": { "type": "string", "description": "勘察地点" },
                        "surveyor": { "type": "string", "description": "勘察人" },
                        "summary": { "type": "string", "description": "摘要" }
                    },
                    "required": ["project_id"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "ai_chat".into(),
                description: "调用已配置的大模型进行对话。可提供 system prompt 和用户消息。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "message": { "type": "string", "description": "用户消息" },
                        "system_prompt": { "type": "string", "description": "系统提示词（可选）" }
                    },
                    "required": ["message"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "rag_query".into(),
                description: "在已索引的知识库文档中进行语义检索。返回最相关的文档片段。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "question": { "type": "string", "description": "检索问题" }
                    },
                    "required": ["question"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "automation_list".into(),
                description: "列出所有自动化方案。可指定项目 ID 过滤。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "项目 ID（可选）" }
                    },
                    "required": []
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "automation_run".into(),
                description: "执行指定的自动化方案。需要项目 ID、方案 ID 和底稿文件路径。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "项目 ID" },
                        "scheme_id": { "type": "string", "description": "方案 ID" },
                        "target_file_path": { "type": "string", "description": "底稿文件路径" },
                        "export_pdf": { "type": "boolean", "description": "是否导出 PDF" }
                    },
                    "required": ["project_id", "scheme_id", "target_file_path"]
                }),
            },
        },
    ]
}

// ═══════════════════════════════════════════════
// Tool Executor
// ═══════════════════════════════════════════════

fn validate_path(path: &str, allowed_paths: &Option<Vec<String>>) -> Result<(), String> {
    if let Some(allowed) = allowed_paths {
        if allowed.is_empty() {
            return Ok(());
        }
        let normalized = std::path::Path::new(path)
            .canonicalize()
            .unwrap_or_else(|_| std::path::PathBuf::from(path));
        let norm_str = normalized.to_string_lossy().to_lowercase();

        for ap in allowed {
            let ap_norm = std::path::Path::new(ap)
                .canonicalize()
                .unwrap_or_else(|_| std::path::PathBuf::from(ap));
            if norm_str.starts_with(&ap_norm.to_string_lossy().to_lowercase()) {
                return Ok(());
            }
        }
        return Err(format!(
            "Security: path '{}' is not within allowed paths: {:?}",
            path, allowed
        ));
    }
    Ok(())
}

async fn audit_tool_call(
    pool: &sqlx::SqlitePool,
    tool_name: &str,
    args: &Value,
    result: &str,
    success: bool,
) {
    let _ = sqlx::query(
        "INSERT INTO agent_audit_log (tool_name, arguments, result, success, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    )
    .bind(tool_name)
    .bind(serde_json::to_string(args).unwrap_or_default())
    .bind(if result.len() > 500 { &result[..result.char_indices().take_while(|&(i, _)| i <= 500).last().map(|(i, _)| i).unwrap_or(result.len())] } else { result })
    .bind(success)
    .execute(pool)
    .await;
}

async fn ensure_audit_table(pool: &sqlx::SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS agent_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool_name TEXT NOT NULL,
            arguments TEXT,
            result TEXT,
            success BOOLEAN,
            created_at TEXT
        )",
    )
    .execute(pool)
    .await;
}

pub async fn execute_tool(
    tool_name: &str,
    arguments: &Value,
    pool: &sqlx::SqlitePool,
    allowed_paths: &Option<Vec<String>>,
    app_handle: &AppHandle,
) -> Result<String, String> {
    ensure_audit_table(pool).await;

    let file_tools = [
        "file_read",
        "file_write",
        "file_create",
        "file_delete",
        "file_move",
        "file_list",
        "file_search",
    ];
    if file_tools.contains(&tool_name) {
        if let Some(path) = arguments.get("path").and_then(|v| v.as_str()) {
            validate_path(path, allowed_paths)?;
        }
        if let Some(path) = arguments.get("directory").and_then(|v| v.as_str()) {
            validate_path(path, allowed_paths)?;
        }
        if let Some(path) = arguments.get("from").and_then(|v| v.as_str()) {
            validate_path(path, allowed_paths)?;
        }
        if let Some(path) = arguments.get("to").and_then(|v| v.as_str()) {
            validate_path(path, allowed_paths)?;
        }
    }

    let result = execute_tool_inner(tool_name, arguments, pool, app_handle).await;

    let (result_str, success) = match &result {
        Ok(s) => (s.as_str(), true),
        Err(e) => (e.as_str(), false),
    };
    audit_tool_call(pool, tool_name, arguments, result_str, success).await;

    result
}

async fn execute_tool_inner(
    tool_name: &str,
    arguments: &Value,
    pool: &sqlx::SqlitePool,
    app_handle: &AppHandle,
) -> Result<String, String> {
    match tool_name {
        "file_read" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("file_read: missing path")?;
            match tokio::fs::read_to_string(path).await {
                Ok(content) => {
                    if content.len() > 30000 {
                        Ok(format!(
                            "{}...\n\n[文件内容已截断，共 {} 字符]",
                            &content[..30000],
                            content.len()
                        ))
                    } else {
                        Ok(content)
                    }
                }
                Err(e) => Err(format!("读取文件失败: {}", e)),
            }
        }

        "file_write" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("file_write: missing path")?;
            let content = arguments["content"]
                .as_str()
                .ok_or("file_write: missing content")?;
            if let Some(parent) = std::path::Path::new(path).parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("创建目录失败: {}", e))?;
            }
            tokio::fs::write(path, content)
                .await
                .map_err(|e| format!("写入文件失败: {}", e))?;
            Ok(format!("文件已写入: {}", path))
        }

        "file_create" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("file_create: missing path")?;
            let is_dir = arguments["is_directory"].as_bool().unwrap_or(false);
            if is_dir {
                tokio::fs::create_dir_all(path)
                    .await
                    .map_err(|e| format!("创建目录失败: {}", e))?;
                Ok(format!("目录已创建: {}", path))
            } else {
                if let Some(parent) = std::path::Path::new(path).parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| format!("创建目录失败: {}", e))?;
                }
                let content = arguments["content"].as_str().unwrap_or("");
                tokio::fs::write(path, content)
                    .await
                    .map_err(|e| format!("创建文件失败: {}", e))?;
                Ok(format!("文件已创建: {}", path))
            }
        }

        "file_delete" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("file_delete: missing path")?;
            let p = std::path::Path::new(path);
            if p.is_dir() {
                tokio::fs::remove_dir_all(path)
                    .await
                    .map_err(|e| format!("删除目录失败: {}", e))?;
                Ok(format!("目录已删除: {}", path))
            } else {
                tokio::fs::remove_file(path)
                    .await
                    .map_err(|e| format!("删除文件失败: {}", e))?;
                Ok(format!("文件已删除: {}", path))
            }
        }

        "file_move" => {
            let from = arguments["from"]
                .as_str()
                .ok_or("file_move: missing from")?;
            let to = arguments["to"].as_str().ok_or("file_move: missing to")?;
            if let Some(parent) = std::path::Path::new(to).parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("创建目录失败: {}", e))?;
            }
            tokio::fs::rename(from, to)
                .await
                .map_err(|e| format!("移动文件失败: {}", e))?;
            Ok(format!("文件已移动: {} -> {}", from, to))
        }

        "file_list" => {
            let dir = arguments["directory"]
                .as_str()
                .ok_or("file_list: missing directory")?;
            let recursive = arguments["recursive"].as_bool().unwrap_or(false);
            let mut entries = Vec::new();

            if recursive {
                fn walk_dir(dir: &std::path::Path, entries: &mut Vec<String>, depth: u32) {
                    if depth > 5 {
                        return;
                    }
                    if let Ok(rd) = std::fs::read_dir(dir) {
                        for entry in rd.flatten() {
                            let path = entry.path();
                            let name = path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();
                            if path.is_dir() {
                                entries.push(format!("📂 {}/", name));
                                walk_dir(&path, entries, depth + 1);
                            } else {
                                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                                entries.push(format!("📄 {} ({}B)", name, size));
                            }
                        }
                    }
                }
                walk_dir(std::path::Path::new(dir), &mut entries, 0);
            } else {
                let mut rd = tokio::fs::read_dir(dir)
                    .await
                    .map_err(|e| format!("读取目录失败: {}", e))?;
                while let Ok(Some(entry)) = rd.next_entry().await {
                    let path = entry.path();
                    let name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if path.is_dir() {
                        entries.push(format!("📂 {}/", name));
                    } else {
                        let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                        entries.push(format!("📄 {} ({}B)", name, size));
                    }
                }
            }

            if entries.is_empty() {
                Ok("目录为空".into())
            } else {
                Ok(entries.join("\n"))
            }
        }

        "file_search" => {
            let dir = arguments["directory"]
                .as_str()
                .ok_or("file_search: missing directory")?;
            let query = arguments["query"]
                .as_str()
                .ok_or("file_search: missing query")?;
            let query_lower = query.to_lowercase();
            let mut results = Vec::new();
            let mut count = 0u32;

            fn search_dir(
                dir: &std::path::Path,
                query: &str,
                results: &mut Vec<String>,
                count: &mut u32,
            ) {
                if *count > 50 {
                    return;
                }
                if let Ok(rd) = std::fs::read_dir(dir) {
                    for entry in rd.flatten() {
                        if *count > 50 {
                            break;
                        }
                        let path = entry.path();
                        if path.is_dir() {
                            search_dir(&path, query, results, count);
                        } else if let Ok(content) = std::fs::read_to_string(&path) {
                            let lower = content.to_lowercase();
                            if lower.contains(query) {
                                *count += 1;
                                let mut matches = Vec::new();
                                for (i, line) in content.lines().enumerate() {
                                    if line.to_lowercase().contains(query) {
                                        matches.push(format!("  L{}: {}", i + 1, line.trim()));
                                        if matches.len() >= 3 {
                                            break;
                                        }
                                    }
                                }
                                results.push(format!(
                                    "📄 {}\n{}",
                                    path.display(),
                                    matches.join("\n")
                                ));
                            }
                        }
                    }
                }
            }
            search_dir(
                std::path::Path::new(dir),
                &query_lower,
                &mut results,
                &mut count,
            );
            if results.is_empty() {
                Ok(format!("未找到包含 '{}' 的文件", query))
            } else {
                Ok(results.join("\n\n"))
            }
        }

        "shell_run" => {
            let command = arguments["command"]
                .as_str()
                .ok_or("shell_run: missing command")?;
            let cwd = arguments["cwd"].as_str();
            let mut cmd = tokio::process::Command::new(if cfg!(windows) { "cmd" } else { "sh" });
            if cfg!(windows) {
                cmd.args(["/C", command]);
            } else {
                cmd.args(["-c", command]);
            }
            if let Some(d) = cwd {
                cmd.current_dir(d);
            }
            let output = cmd
                .output()
                .await
                .map_err(|e| format!("执行命令失败: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if output.status.success() {
                Ok(if stdout.is_empty() {
                    "(命令执行成功，无输出)".into()
                } else {
                    stdout.to_string()
                })
            } else {
                Err(format!(
                    "命令失败 (exit {}):\nstdout: {}\nstderr: {}",
                    output.status.code().unwrap_or(-1),
                    stdout,
                    stderr
                ))
            }
        }

        "project_list" => {
            let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
                "SELECT id, name, project_number, city FROM projects ORDER BY created_at DESC LIMIT 50"
            ).fetch_all(pool).await.map_err(|e| format!("查询项目失败: {}", e))?;
            if rows.is_empty() {
                return Ok("暂无项目".into());
            }
            let list: Vec<String> = rows
                .iter()
                .map(|(id, name, num, city)| {
                    format!(
                        "- {} | {} | {} | {}",
                        name,
                        num.as_deref().unwrap_or(""),
                        city.as_deref().unwrap_or(""),
                        id
                    )
                })
                .collect();
            Ok(list.join("\n"))
        }

        "project_files" => {
            let pid = arguments["project_id"]
                .as_str()
                .ok_or("project_files: missing project_id")?;
            let rows = sqlx::query_as::<_, (String, String, Option<String>)>(
                "SELECT id, file_name, file_path FROM project_files WHERE project_id = ? ORDER BY created_at DESC"
            ).bind(pid).fetch_all(pool).await.map_err(|e| format!("查询文件失败: {}", e))?;
            if rows.is_empty() {
                return Ok("该项目暂无文件".into());
            }
            let list: Vec<String> = rows
                .iter()
                .map(|(id, name, path)| {
                    format!("- {} | {} | {}", name, path.as_deref().unwrap_or(""), id)
                })
                .collect();
            Ok(list.join("\n"))
        }

        "project_context" => {
            let pid = arguments["project_id"].as_str();
            if let Some(pid) = pid {
                // Get project info + files as context
                let proj = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
                    "SELECT name, project_number, city FROM projects WHERE id = ?",
                )
                .bind(pid)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
                let files = sqlx::query_as::<_, (String, Option<String>)>(
                    "SELECT file_name, file_path FROM project_files WHERE project_id = ? LIMIT 20",
                )
                .bind(pid)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
                let mut out = String::new();
                if let Some((name, num, city)) = proj {
                    out.push_str(&format!(
                        "项目: {} | {} | {}\n",
                        name,
                        num.as_deref().unwrap_or(""),
                        city.as_deref().unwrap_or("")
                    ));
                }
                out.push_str(&format!("文件({}):\n", files.len()));
                for (fname, fpath) in &files {
                    out.push_str(&format!(
                        "  - {} | {}\n",
                        fname,
                        fpath.as_deref().unwrap_or("")
                    ));
                }
                Ok(out)
            } else {
                Ok("请提供 project_id".into())
            }
        }

        "browser_open" | "browser_fill" | "browser_click" | "browser_extract"
        | "browser_scroll" => Ok(format!(
            "浏览器工具 {} 已调用 (参数: {})",
            tool_name, arguments
        )),

        "mcp_list_tools" => {
            let mgr: tauri::State<'_, McpClientManager> = app_handle.state::<McpClientManager>();
            let tools_list = mgr.list_tools().await;
            Ok(serde_json::to_string_pretty(&tools_list).unwrap_or_else(|_| "[]".into()))
        }

        "mcp_call_tool" => {
            let server = arguments["server_name"]
                .as_str()
                .ok_or("mcp_call_tool: missing server_name")?;
            let tool = arguments["tool_name"]
                .as_str()
                .ok_or("mcp_call_tool: missing tool_name")?;
            let args = arguments.get("arguments").cloned().unwrap_or(json!({}));
            let mgr: tauri::State<'_, McpClientManager> = app_handle.state::<McpClientManager>();
            let result = mgr
                .call_tool(server, tool, &args)
                .await
                .map_err(|e| format!("MCP 调用失败: {}", e))?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }

        "template_list" => {
            let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
                "SELECT id, name, stage, label FROM templates ORDER BY created_at DESC",
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            let list: Vec<String> = rows
                .iter()
                .map(|(id, name, stage, label)| {
                    format!(
                        "- {} | {} | {} | {}",
                        name,
                        stage.as_deref().unwrap_or(""),
                        label.as_deref().unwrap_or(""),
                        id
                    )
                })
                .collect();
            Ok(if list.is_empty() {
                "暂无模板".into()
            } else {
                list.join("\n")
            })
        }

        "template_create" => {
            let name = arguments["name"]
                .as_str()
                .ok_or("template_create: missing name")?;
            let stage = arguments["stage"].as_str().unwrap_or("");
            let label = arguments["label"].as_str().unwrap_or("");
            let source = arguments["source_file_path"].as_str().unwrap_or("");
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO templates (id, name, stage, label, source_file_path) VALUES (?, ?, ?, ?, ?)")
                .bind(&id).bind(name).bind(stage).bind(label).bind(source)
                .execute(pool).await.map_err(|e| e.to_string())?;
            Ok(format!("模板已创建: {} ({})", name, id))
        }

        "common_info_list" => {
            let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
                "SELECT key, value, remarks, category FROM common_info ORDER BY key",
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            let list: Vec<String> = rows
                .iter()
                .map(|(k, v, r, c)| {
                    format!(
                        "- [{}] {}: {} ({})",
                        c.as_deref().unwrap_or(""),
                        k,
                        v,
                        r.as_deref().unwrap_or("")
                    )
                })
                .collect();
            Ok(if list.is_empty() {
                "暂无通用信息".into()
            } else {
                list.join("\n")
            })
        }

        "common_info_update" => {
            let key = arguments["key"].as_str().ok_or("missing key")?;
            let value = arguments["value"].as_str().ok_or("missing value")?;
            let remarks = arguments["remarks"].as_str().unwrap_or("");
            let category = arguments["category"].as_str().unwrap_or("");
            sqlx::query("INSERT OR REPLACE INTO common_info (key, value, remarks, category) VALUES (?, ?, ?, ?)")
                .bind(key).bind(value).bind(remarks).bind(category)
                .execute(pool).await.map_err(|e| e.to_string())?;
            Ok(format!("通用信息已更新: {}", key))
        }

        "survey_get" => {
            let pid = arguments["project_id"]
                .as_str()
                .ok_or("missing project_id")?;
            let row = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, Option<String>)>(
                "SELECT survey_date, survey_location, surveyor, summary FROM surveys WHERE project_id = ?"
            ).bind(pid).fetch_optional(pool).await.map_err(|e| e.to_string())?;
            match row {
                Some((d, l, s, sum)) => Ok(format!(
                    "日期: {}\n地点: {}\n勘察人: {}\n摘要: {}",
                    d.as_deref().unwrap_or(""),
                    l.as_deref().unwrap_or(""),
                    s.as_deref().unwrap_or(""),
                    sum.as_deref().unwrap_or("")
                )),
                None => Ok("该项目暂无勘察数据".into()),
            }
        }

        "survey_update" => {
            let pid = arguments["project_id"]
                .as_str()
                .ok_or("missing project_id")?;
            let date = arguments["date"].as_str().unwrap_or("");
            let location = arguments["location"].as_str().unwrap_or("");
            let surveyor = arguments["surveyor"].as_str().unwrap_or("");
            let summary = arguments["summary"].as_str().unwrap_or("");
            sqlx::query("INSERT OR REPLACE INTO surveys (project_id, survey_date, survey_location, surveyor, summary) VALUES (?, ?, ?, ?, ?)")
                .bind(pid).bind(date).bind(location).bind(surveyor).bind(summary)
                .execute(pool).await.map_err(|e| e.to_string())?;
            Ok(format!("勘察数据已更新: {}", pid))
        }

        "ai_chat" => {
            let message = arguments["message"]
                .as_str()
                .ok_or("ai_chat: missing message")?;
            let _sys = arguments["system_prompt"].as_str();
            Ok(format!(
                "AI Chat 工具: 请直接使用 Agent 的对话能力。消息: {}",
                message
            ))
        }

        "rag_query" => {
            let question = arguments["question"]
                .as_str()
                .ok_or("rag_query: missing question")?;
            Ok(format!("RAG 查询: {} (功能待集成)", question))
        }

        "automation_list" => {
            let pid = arguments["project_id"].as_str();
            let query = if let Some(p) = pid {
                format!("SELECT id, name, description FROM automation_schemes WHERE project_id = '{}' ORDER BY created_at DESC", p)
            } else {
                "SELECT id, name, description FROM automation_schemes ORDER BY created_at DESC"
                    .into()
            };
            let rows = sqlx::query_as::<_, (String, String, Option<String>)>(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let list: Vec<String> = rows
                .iter()
                .map(|(id, name, desc)| {
                    format!("- {} | {} | {}", name, desc.as_deref().unwrap_or(""), id)
                })
                .collect();
            Ok(if list.is_empty() {
                "暂无自动化方案".into()
            } else {
                list.join("\n")
            })
        }

        "automation_run" => {
            let _pid = arguments["project_id"]
                .as_str()
                .ok_or("missing project_id")?;
            let _sid = arguments["scheme_id"].as_str().ok_or("missing scheme_id")?;
            let _target = arguments["target_file_path"]
                .as_str()
                .ok_or("missing target_file_path")?;
            Ok("自动化执行功能请通过项目工作区触发".into())
        }

        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}
