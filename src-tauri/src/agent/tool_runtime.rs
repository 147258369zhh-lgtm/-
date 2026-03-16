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
                name: "excel_read".into(),
                description: "读取 Excel 文件（.xlsx/.xls）的内容。返回表格数据的文本形式。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件的绝对路径" },
                        "sheet": { "type": "string", "description": "工作表名称（可选，默认第一个）" },
                        "max_rows": { "type": "integer", "description": "最多读取行数（可选，默认50）" }
                    },
                    "required": ["path"]
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
                name: "browser_navigate".into(),
                description: "使用 Playwright 打开指定 URL 并截图保存。返回截图文件路径。适合对网页（如地图）进行截图。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "要打开的网页 URL" },
                        "screenshot_path": { "type": "string", "description": "截图保存的绝对路径（如 K:\\screenshots\\map.png）" },
                        "wait_seconds": { "type": "integer", "description": "页面加载后等待秒数（默认3秒）" },
                        "width": { "type": "integer", "description": "浏览器窗口宽度（默认1920）" },
                        "height": { "type": "integer", "description": "浏览器窗口高度（默认1080）" }
                    },
                    "required": ["url", "screenshot_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_script".into(),
                description: "执行自定义 Playwright 脚本。脚本中可用 page 对象操作浏览器（导航、点击、填写、截图等）。适合复杂的多步浏览器操作。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "script": { "type": "string", "description": "Playwright JavaScript 脚本内容。可使用 page 对象，如：await page.goto('url'); await page.screenshot({path:'file.png'});" },
                        "headless": { "type": "boolean", "description": "是否无头模式（默认 true）" }
                    },
                    "required": ["script"]
                }),
            },
        },
        // ── Office Document Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_write".into(),
                description: "使用 Pandas 创建或写入 Excel 文件。支持多 Sheet、数据筛选、合并、排序等高级操作。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python 代码（可使用 pandas as pd、openpyxl）。代码必须生成输出文件。示例：df = pd.DataFrame({'列A': [1,2], '列B': [3,4]}); df.to_excel('output.xlsx', index=False)" },
                        "output_path": { "type": "string", "description": "输出 Excel 文件的绝对路径" }
                    },
                    "required": ["code", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_read".into(),
                description: "读取 Word 文档（.docx）的文本内容，包括段落和表格。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Word 文件的绝对路径" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_write".into(),
                description: "创建或修改 Word 文档（.docx）。支持添加标题、段落、表格、图片。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python 代码（可使用 docx 库）。代码必须生成 .docx 文件。示例：from docx import Document; doc = Document(); doc.add_heading('标题'); doc.save('output.docx')" },
                        "output_path": { "type": "string", "description": "输出 Word 文件的绝对路径" }
                    },
                    "required": ["code", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "ppt_read".into(),
                description: "读取 PowerPoint（.pptx）文件内容，包括每页的标题和文本。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "PPT 文件的绝对路径" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "ppt_create".into(),
                description: "创建 PowerPoint（.pptx）演示文稿。支持添加幻灯片、标题、内容、图片、表格。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python 代码（可使用 pptx 库）。代码必须生成 .pptx 文件。示例：from pptx import Presentation; prs = Presentation(); slide = prs.slides.add_slide(prs.slide_layouts[0]); slide.shapes.title.text='标题'; prs.save('output.pptx')" },
                        "output_path": { "type": "string", "description": "输出 PPT 文件的绝对路径" }
                    },
                    "required": ["code", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "image_process".into(),
                description: "使用 Pillow 处理图片：裁剪、缩放、旋转、加水印、格式转换、拼接等。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python 代码（可使用 PIL/Pillow）。示例：from PIL import Image; img = Image.open('input.png'); img = img.resize((800,600)); img.save('output.jpg')" },
                        "output_path": { "type": "string", "description": "输出图片的绝对路径" }
                    },
                    "required": ["code", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "doc_convert".into(),
                description: "文档格式转换。支持 Word→PDF、Markdown→Word、HTML→Word 等。使用 Python 库实现。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "input_path": { "type": "string", "description": "输入文件的绝对路径" },
                        "output_path": { "type": "string", "description": "输出文件的绝对路径（扩展名决定输出格式）" },
                        "format_from": { "type": "string", "description": "源格式（如 docx, md, html, txt）" },
                        "format_to": { "type": "string", "description": "目标格式（如 pdf, docx, html, txt）" }
                    },
                    "required": ["input_path", "output_path"]
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
        "excel_read",
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

        "excel_read" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("excel_read: missing path")?;
            let max_rows = arguments["max_rows"].as_u64().unwrap_or(50);
            let sheet_arg = arguments["sheet"].as_str().unwrap_or("");

            // Use Python to read Excel — this is the most reliable cross-platform approach
            let sheet_clause = if sheet_arg.is_empty() {
                "wb.active".to_string()
            } else {
                format!("wb['{}']", sheet_arg)
            };

            let python_script = format!(
                r#"
import openpyxl, sys
try:
    wb = openpyxl.load_workbook('{}', read_only=True, data_only=True)
    ws = {}
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= {}:
            break
        rows.append('\t'.join([str(c) if c is not None else '' for c in row]))
    print('\n'.join(rows))
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                path.replace('\\', "\\\\").replace('\'', "\\'"),
                sheet_clause,
                max_rows
            );

            let output = tokio::process::Command::new("python")
                .args(&["-c", &python_script])
                .output()
                .await
                .map_err(|e| format!("执行 Python 失败（请确保已安装 Python 和 openpyxl）: {}", e))?;

            if output.status.success() {
                let content = String::from_utf8_lossy(&output.stdout).to_string();
                if content.len() > 15000 {
                    Ok(format!("{}...\n\n[Excel 内容已截断，共 {} 字符]", &content[..15000], content.len()))
                } else {
                    Ok(content)
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("读取 Excel 失败: {}", stderr))
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
            let max_entries: usize = 200;

            // Safety: block recursive on drive roots
            if recursive && dir.len() <= 3 {
                return Err("安全限制：不允许对磁盘根目录递归列举，请指定子目录。".into());
            }

            if recursive {
                fn walk_dir(dir: &std::path::Path, entries: &mut Vec<String>, depth: u32, max: usize) {
                    if depth > 3 || entries.len() >= max { return; }
                    if let Ok(rd) = std::fs::read_dir(dir) {
                        for entry in rd.flatten() {
                            if entries.len() >= max { break; }
                            let path = entry.path();
                            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                            if path.is_dir() {
                                entries.push(format!("📂 {}/", name));
                                walk_dir(&path, entries, depth + 1, max);
                            } else {
                                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                                entries.push(format!("📄 {} ({}B)", name, size));
                            }
                        }
                    }
                }
                walk_dir(std::path::Path::new(dir), &mut entries, 0, max_entries);
            } else {
                let mut rd = tokio::fs::read_dir(dir)
                    .await
                    .map_err(|e| format!("读取目录失败: {}", e))?;
                while let Ok(Some(entry)) = rd.next_entry().await {
                    if entries.len() >= max_entries { break; }
                    let path = entry.path();
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
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
                let t = if entries.len() >= max_entries {
                    format!("\n...(已截断，仅显示前{}条)", max_entries)
                } else { String::new() };
                Ok(format!("{}{}", entries.join("\n"), t))
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

        "browser_navigate" => {
            let url = arguments["url"]
                .as_str()
                .ok_or("browser_navigate: missing url")?;
            let screenshot_path = arguments["screenshot_path"]
                .as_str()
                .ok_or("browser_navigate: missing screenshot_path")?;
            let wait_secs = arguments["wait_seconds"].as_u64().unwrap_or(3);
            let width = arguments["width"].as_u64().unwrap_or(1920);
            let height = arguments["height"].as_u64().unwrap_or(1080);

            // Ensure screenshot directory exists
            if let Some(parent) = std::path::Path::new(screenshot_path).parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("创建截图目录失败: {}", e))?;
            }

            let script = format!(
                r#"
const {{ chromium }} = require('playwright');
(async () => {{
    const browser = await chromium.launch({{ headless: true }});
    const context = await browser.newContext({{
        viewport: {{ width: {width}, height: {height} }}
    }});
    const page = await context.newPage();
    try {{
        await page.goto('{url}', {{ waitUntil: 'networkidle', timeout: 30000 }});
        await page.waitForTimeout({wait_ms});
        await page.screenshot({{ path: '{path}', fullPage: false }});
        console.log('SUCCESS: Screenshot saved to {path}');
    }} catch (e) {{
        console.error('ERROR: ' + e.message);
        process.exit(1);
    }} finally {{
        await browser.close();
    }}
}})();
"#,
                width = width,
                height = height,
                url = url.replace('\'', "\\'"),
                wait_ms = wait_secs * 1000,
                path = screenshot_path.replace('\\', "\\\\").replace('\'', "\\'"),
            );

            let output = tokio::process::Command::new("node")
                .args(&["-e", &script])
                .output()
                .await
                .map_err(|e| format!("执行 Playwright 失败（请确保已安装 node 和 playwright）: {}", e))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(format!("截图已保存到: {}\n{}", screenshot_path, stdout.trim()))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Err(format!("浏览器截图失败:\nstdout: {}\nstderr: {}", stdout.trim(), stderr.trim()))
            }
        }

        "browser_script" => {
            let user_script = arguments["script"]
                .as_str()
                .ok_or("browser_script: missing script")?;
            let headless = arguments["headless"].as_bool().unwrap_or(true);

            let full_script = format!(
                r#"
const {{ chromium }} = require('playwright');
(async () => {{
    const browser = await chromium.launch({{ headless: {headless} }});
    const context = await browser.newContext({{
        viewport: {{ width: 1920, height: 1080 }}
    }});
    const page = await context.newPage();
    try {{
        {user_script}
        console.log('SUCCESS: Script completed');
    }} catch (e) {{
        console.error('ERROR: ' + e.message);
        process.exit(1);
    }} finally {{
        await browser.close();
    }}
}})();
"#,
                headless = if headless { "true" } else { "false" },
                user_script = user_script,
            );

            let output = tokio::process::Command::new("node")
                .args(&["-e", &full_script])
                .env("PLAYWRIGHT_BROWSERS_PATH", "0")
                .output()
                .await
                .map_err(|e| format!("执行 Playwright 脚本失败: {}", e))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(stdout.trim().to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Err(format!("Playwright 脚本执行失败:\nstdout: {}\nstderr: {}", stdout.trim(), stderr.trim()))
            }
        }

        // ── Office Document Tools (Python-based) ──

        "excel_write" | "word_write" | "ppt_create" | "image_process" => {
            let code = arguments["code"]
                .as_str()
                .ok_or(format!("{}: missing code", tool_name))?;
            let output_path = arguments["output_path"]
                .as_str()
                .ok_or(format!("{}: missing output_path", tool_name))?;

            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            let output = tokio::process::Command::new("python")
                .args(&["-c", code])
                .output()
                .await
                .map_err(|e| format!("执行 Python 失败: {}", e))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                if tokio::fs::metadata(output_path).await.is_ok() {
                    Ok(format!("文件已生成: {}\n{}", output_path, stdout.trim()))
                } else {
                    Ok(format!("Python 执行成功但未检测到输出文件。stdout: {}", stdout.trim()))
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("{} 执行失败:\n{}", tool_name, stderr.trim()))
            }
        }

        "word_read" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("word_read: missing path")?;
            let script = format!(
                "import docx,sys\ntry:\n doc=docx.Document('{}')\n lines=[]\n for p in doc.paragraphs:\n  if p.text.strip(): lines.append(f'[{{p.style.name}}] {{p.text}}')\n for t in doc.tables:\n  lines.append('\\n--- 表格 ---')\n  for r in t.rows: lines.append('\\t'.join([c.text.strip() for c in r.cells]))\n o='\\n'.join(lines)\n print(o[:15000]+'\\n...(已截断)' if len(o)>15000 else o)\nexcept Exception as e: print(f'ERROR: {{e}}',file=sys.stderr);sys.exit(1)",
                path.replace('\\', "\\\\").replace('\'', "\\'")
            );
            let output = tokio::process::Command::new("python")
                .args(&["-c", &script]).output().await
                .map_err(|e| format!("执行 Python 失败: {}", e))?;
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(format!("读取 Word 失败: {}", String::from_utf8_lossy(&output.stderr).trim()))
            }
        }

        "ppt_read" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("ppt_read: missing path")?;
            let script = format!(
                "from pptx import Presentation\nimport sys\ntry:\n prs=Presentation('{}')\n lines=[]\n for i,s in enumerate(prs.slides,1):\n  lines.append(f'\\n=== 第 {{i}} 页 ===')\n  for sh in s.shapes:\n   if hasattr(sh,'text') and sh.text.strip(): lines.append(sh.text)\n   if sh.has_table:\n    for r in sh.table.rows: lines.append('\\t'.join([c.text.strip() for c in r.cells]))\n o='\\n'.join(lines)\n print(o[:15000]+'\\n...(已截断)' if len(o)>15000 else o)\nexcept Exception as e: print(f'ERROR: {{e}}',file=sys.stderr);sys.exit(1)",
                path.replace('\\', "\\\\").replace('\'', "\\'")
            );
            let output = tokio::process::Command::new("python")
                .args(&["-c", &script]).output().await
                .map_err(|e| format!("执行 Python 失败: {}", e))?;
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(format!("读取 PPT 失败: {}", String::from_utf8_lossy(&output.stderr).trim()))
            }
        }

        "doc_convert" => {
            let input_path = arguments["input_path"]
                .as_str()
                .ok_or("doc_convert: missing input_path")?;
            let output_path = arguments["output_path"]
                .as_str()
                .ok_or("doc_convert: missing output_path")?;

            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            let out_ext = std::path::Path::new(output_path)
                .extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            let in_ext = std::path::Path::new(input_path)
                .extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

            let script = format!(
                "import sys\ninp='{}'\nout='{}'\nie='{}'\noe='{}'\ntry:\n if ie=='docx' and oe=='txt':\n  import docx;d=docx.Document(inp);open(out,'w',encoding='utf-8').write('\\n'.join([p.text for p in d.paragraphs]))\n elif ie in('xlsx','xls') and oe=='csv':\n  import pandas as pd;pd.read_excel(inp).to_csv(out,index=False,encoding='utf-8-sig')\n elif ie=='csv' and oe in('xlsx','xls'):\n  import pandas as pd;pd.read_csv(inp).to_excel(out,index=False)\n elif ie=='docx' and oe=='html':\n  import docx;d=docx.Document(inp);h='<html><body>'+''.join([f'<p>{{p.text}}</p>' for p in d.paragraphs])+'</body></html>';open(out,'w',encoding='utf-8').write(h)\n elif ie=='txt' and oe=='docx':\n  import docx;d=docx.Document()\n  for l in open(inp,'r',encoding='utf-8'): d.add_paragraph(l.strip())\n  d.save(out)\n else: print(f'不支持: {{ie}}->{{oe}}',file=sys.stderr);sys.exit(1)\n print(f'转换完成: {{out}}')\nexcept Exception as e: print(f'ERROR: {{e}}',file=sys.stderr);sys.exit(1)",
                input_path.replace('\\', "\\\\").replace('\'', "\\'"),
                output_path.replace('\\', "\\\\").replace('\'', "\\'"),
                in_ext, out_ext
            );
            let output = tokio::process::Command::new("python")
                .args(&["-c", &script]).output().await
                .map_err(|e| format!("执行转换失败: {}", e))?;
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                Err(format!("文档转换失败: {}", String::from_utf8_lossy(&output.stderr).trim()))
            }
        }

        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}
