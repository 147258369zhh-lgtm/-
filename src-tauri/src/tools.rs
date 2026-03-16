// ═══════════════════════════════════════════════════════
// Agent Tool Implementations — Real backend for all tools
// ═══════════════════════════════════════════════════════

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;

/// Helper: get required string arg
fn arg_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing required argument: {}", key))
}

/// Helper: get optional string arg
fn arg_opt(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

// ═══════════════════════════════════════════════════════
// DISPATCH: Route tool_name to implementation
// ═══════════════════════════════════════════════════════

pub async fn execute_tool(tool_name: &str, args: Value) -> Result<Value, String> {
    match tool_name {
        // --- 📂 File & Document ---
        "file_read" => tool_file_read(&args),
        "file_write" => tool_file_write(&args),
        "file_create" => tool_file_create(&args),
        "file_delete" => tool_file_delete(&args),
        "file_move" => tool_file_move(&args),
        "file_list" => tool_file_list(&args),
        "file_search" => tool_file_search(&args),
        "file_compress" => tool_file_compress(&args),
        "file_hash" => tool_file_hash(&args),

        // --- 📝 Office ---
        "excel_read" => tool_excel_read(&args),
        "excel_write" => tool_excel_write(&args),
        "word_read" => tool_word_read(&args),
        "word_write" => tool_word_write(&args),
        "ppt_read" => tool_ppt_read(&args),
        "ppt_create" => Ok(json!({"error": "PPT creation not yet supported", "status": "unsupported"})),
        "pdf_read" => tool_pdf_read(&args),
        "pdf_generate" => Ok(json!({"error": "PDF generation requires template engine", "status": "unsupported"})),
        "doc_convert" => tool_doc_convert(&args),

        // --- 🌐 Web & Browser ---
        "browser_open" => tool_browser_open(&args),
        "browser_fill" | "browser_click" | "browser_scroll" | "browser_navigate" => {
            Ok(json!({"error": "Browser automation requires Playwright MCP", "status": "use_mcp", "suggestion": "Install browser MCP server"}))
        }
        "browser_extract" => tool_browser_extract(&args).await,
        "browser_script" => tool_shell_run(&json!({"command": arg_str(&args, "script")?})),

        // --- 🧠 AI ---
        "ai_chat" | "ai_summary" | "ai_translate" | "ai_classify" => {
            // These are handled by the LLM node in the agent flow, not standalone tools
            Ok(json!({"status": "ai_passthrough", "message": "AI tools are executed via the LLM node. Pass the content to the LLM with appropriate instructions."}))
        }
        "rag_query" => Ok(json!({"status": "rag_passthrough", "message": "RAG queries are handled by the RAG engine. Use the knowledge retrieval node."})),

        // --- 🔗 Network ---
        "http_request" => tool_http_request(&args).await,
        "api_call" => tool_http_request(&args).await, // Same as http_request
        "download_file" => tool_download_file(&args).await,
        "upload_file" => Ok(json!({"error": "Upload requires target server configuration", "status": "needs_config"})),

        // --- 📧 Communication ---
        "send_email" => tool_send_email(&args),
        "send_notification" => tool_send_notification(&args),

        // --- 🗄️ Data ---
        "sql_query" => Ok(json!({"status": "sql_passthrough", "message": "SQL queries execute against the app database via project tools."})),
        "json_parse" => tool_json_parse(&args),
        "csv_process" => tool_csv_process(&args),
        "data_chart" => Ok(json!({"error": "Chart generation requires frontend rendering", "status": "frontend_only"})),
        "data_stats" => tool_data_stats(&args),

        // --- 💻 System ---
        "shell_run" => tool_shell_run(&args),
        "clipboard_read" => tool_clipboard_read(),
        "clipboard_write" => tool_clipboard_write(&args),
        "env_info" => tool_env_info(),

        // --- 🎨 Multimedia ---
        "image_process" => Ok(json!({"error": "Image processing requires image crate", "status": "not_yet"})),
        "ocr_recognize" => Ok(json!({"error": "OCR requires Tesseract or cloud API", "status": "needs_setup"})),
        "tts_speak" => tool_tts_speak(&args),
        "qrcode_generate" => Ok(json!({"error": "QR code generation requires qrcode crate", "status": "not_yet"})),

        // --- ⏰ Flow Control ---
        "delay_wait" => tool_delay_wait(&args).await,
        "condition_check" => tool_condition_check(&args),
        "loop_repeat" => Ok(json!({"status": "flow_control", "message": "Loop execution is managed by the agent runtime, not a standalone tool."})),

        // --- 🔌 Extensions ---
        "mcp_list_tools" | "mcp_call_tool" | "automation_list" | "automation_run" => {
            Ok(json!({"status": "mcp_passthrough", "message": "MCP/automation tools are dispatched through the MCP client manager."}))
        }

        // --- 📊 Project Management ---
        // These are handled by the existing Tauri commands, dispatched separately
        "project_list" | "project_files" | "project_context" | "template_list" |
        "template_create" | "common_info_list" | "common_info_update" |
        "survey_get" | "survey_update" => {
            Ok(json!({"status": "db_passthrough", "message": "Project tools are dispatched via Tauri commands with database state."}))
        }

        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

// ═══════════════════════════════════════════════════════
// FILE OPERATIONS
// ═══════════════════════════════════════════════════════

fn tool_file_read(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("File too large (>10MB). Use streaming for large files.".into());
    }
    let content = fs::read_to_string(&p).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(json!({
        "path": path,
        "content": content,
        "size": metadata.len(),
        "lines": content.lines().count()
    }))
}

fn tool_file_write(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let content = arg_str(args, "content")?;
    let append = args.get("append").and_then(|v| v.as_bool()).unwrap_or(false);
    
    if append {
        let mut file = fs::OpenOptions::new().append(true).create(true).open(&path)
            .map_err(|e| format!("Failed to open file: {}", e))?;
        file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    } else {
        fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))?;
    }
    Ok(json!({"path": path, "bytes_written": content.len(), "mode": if append {"append"} else {"overwrite"}}))
}

fn tool_file_create(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let is_dir = args.get("directory").and_then(|v| v.as_bool()).unwrap_or(false);
    if is_dir {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        Ok(json!({"path": path, "type": "directory", "created": true}))
    } else {
        if let Some(parent) = Path::new(&path).parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::File::create(&path).map_err(|e| e.to_string())?;
        Ok(json!({"path": path, "type": "file", "created": true}))
    }
}

fn tool_file_delete(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path not found: {}", path));
    }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(json!({"path": path, "deleted": true}))
}

fn tool_file_move(args: &Value) -> Result<Value, String> {
    let from = arg_str(args, "from")?;
    let to = arg_str(args, "to")?;
    fs::rename(&from, &to).map_err(|e| format!("Move failed: {}", e))?;
    Ok(json!({"from": from, "to": to, "moved": true}))
}

fn tool_file_list(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let mut items = Vec::new();
    for entry in fs::read_dir(&p).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        items.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "path": entry.path().to_string_lossy(),
            "is_dir": meta.is_dir(),
            "size": meta.len(),
        }));
    }
    Ok(json!({"path": path, "count": items.len(), "items": items}))
}

fn tool_file_search(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let keyword = arg_str(args, "keyword")?;
    let p = Path::new(&path);
    let mut results = Vec::new();

    fn search_dir(dir: &Path, kw: &str, results: &mut Vec<Value>, depth: usize) {
        if depth > 5 { return; }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let ep = entry.path();
                if ep.is_dir() {
                    search_dir(&ep, kw, results, depth + 1);
                } else if let Ok(content) = fs::read_to_string(&ep) {
                    let matches: Vec<usize> = content.lines().enumerate()
                        .filter(|(_, line)| line.contains(kw))
                        .map(|(i, _)| i + 1)
                        .collect();
                    if !matches.is_empty() {
                        results.push(json!({
                            "file": ep.to_string_lossy(),
                            "match_lines": matches,
                            "match_count": matches.len()
                        }));
                    }
                }
                if results.len() >= 50 { return; }
            }
        }
    }
    search_dir(p, &keyword, &mut results, 0);
    Ok(json!({"keyword": keyword, "results": results, "total_matches": results.len()}))
}

fn tool_file_compress(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let output = arg_opt(args, "output");
    let mode = arg_opt(args, "mode").unwrap_or_else(|| "compress".into());

    if mode == "decompress" || mode == "extract" {
        // Decompress ZIP
        let output_dir = output.unwrap_or_else(|| {
            let p = Path::new(&path);
            p.parent().unwrap_or(Path::new(".")).join(p.file_stem().unwrap_or_default())
                .to_string_lossy().to_string()
        });
        let file = fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
        archive.extract(&output_dir).map_err(|e| e.to_string())?;
        Ok(json!({"mode": "extract", "source": path, "output": output_dir, "files_count": archive.len()}))
    } else {
        // Compress to ZIP
        let out_path = output.unwrap_or_else(|| format!("{}.zip", path));
        let file = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        let mut zip_writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let p = Path::new(&path);
        if p.is_dir() {
            fn add_dir(writer: &mut zip::ZipWriter<fs::File>, dir: &Path, prefix: &str, opts: zip::write::SimpleFileOptions) -> Result<u32, String> {
                let mut count = 0u32;
                for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let ep = entry.path();
                    let name = format!("{}/{}", prefix, entry.file_name().to_string_lossy());
                    if ep.is_dir() {
                        count += add_dir(writer, &ep, &name, opts)?;
                    } else {
                        let mut buf = Vec::new();
                        fs::File::open(&ep).map_err(|e| e.to_string())?.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                        writer.start_file(&name, opts).map_err(|e| e.to_string())?;
                        writer.write_all(&buf).map_err(|e| e.to_string())?;
                        count += 1;
                    }
                }
                Ok(count)
            }
            let basename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            let count = add_dir(&mut zip_writer, p, &basename, options)?;
            zip_writer.finish().map_err(|e| e.to_string())?;
            Ok(json!({"mode": "compress", "source": path, "output": out_path, "files_count": count}))
        } else {
            let mut buf = Vec::new();
            fs::File::open(p).map_err(|e| e.to_string())?.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            let fname = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            zip_writer.start_file(&fname, options).map_err(|e| e.to_string())?;
            zip_writer.write_all(&buf).map_err(|e| e.to_string())?;
            zip_writer.finish().map_err(|e| e.to_string())?;
            Ok(json!({"mode": "compress", "source": path, "output": out_path, "files_count": 1}))
        }
    }
}

fn tool_file_hash(args: &Value) -> Result<Value, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let path = arg_str(args, "path")?;
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    let hash = hasher.finish();
    let size = data.len();
    // Simple hash (not cryptographic, but functional)
    Ok(json!({"path": path, "hash": format!("{:016x}", hash), "size": size, "algorithm": "sip_hash"}))
}

// ═══════════════════════════════════════════════════════
// OFFICE TOOLS
// ═══════════════════════════════════════════════════════

fn tool_excel_read(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let sheet_name = arg_opt(args, "sheet");
    let max_rows: usize = args.get("max_rows").and_then(|v| v.as_u64()).unwrap_or(500) as usize;

    use calamine::{Reader, open_workbook_auto};
    let mut workbook = open_workbook_auto(&path).map_err(|e| format!("Failed to open Excel: {}", e))?;
    
    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
    let target_sheet = sheet_name.unwrap_or_else(|| sheet_names.first().cloned().unwrap_or_default());

    let range = workbook.worksheet_range(&target_sheet)
        .map_err(|e| format!("Failed to read sheet '{}': {}", target_sheet, e))?;

    let mut rows_data: Vec<Vec<Value>> = Vec::new();
    for (i, row) in range.rows().enumerate() {
        if i >= max_rows { break; }
        let row_data: Vec<Value> = row.iter().map(|cell| {
            match cell {
                calamine::Data::Empty => json!(null),
                calamine::Data::String(s) => json!(s),
                calamine::Data::Float(f) => json!(f),
                calamine::Data::Int(i) => json!(i),
                calamine::Data::Bool(b) => json!(b),
                _ => json!(cell.to_string()),
            }
        }).collect();
        rows_data.push(row_data);
    }

    let total_rows = range.rows().count();
    Ok(json!({
        "path": path,
        "sheet": target_sheet,
        "all_sheets": sheet_names,
        "total_rows": total_rows,
        "returned_rows": rows_data.len(),
        "columns": if !rows_data.is_empty() { rows_data[0].len() } else { 0 },
        "data": rows_data,
        "header": if !rows_data.is_empty() { json!(&rows_data[0]) } else { json!([]) }
    }))
}

fn tool_excel_write(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let data = args.get("data").ok_or("Missing 'data' argument")?;
    
    let mut book = umya_spreadsheet::new_file();
    let sheet = book.get_sheet_mut(&0usize).ok_or("Failed to get sheet")?;
    
    if let Some(rows) = data.as_array() {
        for (r, row) in rows.iter().enumerate() {
            if let Some(cells) = row.as_array() {
                for (c, cell) in cells.iter().enumerate() {
                    let cell_val = match cell {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        Value::Null => String::new(),
                        _ => cell.to_string(),
                    };
                    sheet.get_cell_mut(((c + 1) as u32, (r + 1) as u32)).set_value(&cell_val);
                }
            }
        }
    }
    
    umya_spreadsheet::writer::xlsx::write(&book, &path).map_err(|e| e.to_string())?;
    Ok(json!({"path": path, "written": true}))
}

fn tool_word_read(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let data = fs::read(&path).map_err(|e| format!("Failed to read Word file: {}", e))?;
    let docx = docx_rs::read_docx(&data).map_err(|e| format!("Failed to parse Word: {}", e))?;
    
    // Extract text from all paragraphs
    let mut texts = Vec::new();
    for child in docx.document.children.iter() {
        if let docx_rs::DocumentChild::Paragraph(p) = child {
            let mut para_text = String::new();
            for child in &p.children {
                if let docx_rs::ParagraphChild::Run(run) = child {
                    for child in &run.children {
                        if let docx_rs::RunChild::Text(t) = child {
                            para_text.push_str(&t.text);
                        }
                    }
                }
            }
            if !para_text.is_empty() {
                texts.push(para_text);
            }
        }
    }
    
    let full_text = texts.join("\n");
    Ok(json!({
        "path": path,
        "paragraphs": texts.len(),
        "characters": full_text.len(),
        "content": full_text,
        "paragraphs_list": texts
    }))
}

fn tool_word_write(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let content = arg_str(args, "content")?;
    
    use docx_rs::*;
    let mut doc = Docx::new();
    for line in content.lines() {
        doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(line)));
    }
    let file = fs::File::create(&path).map_err(|e| e.to_string())?;
    doc.build().pack(file).map_err(|e| e.to_string())?;
    Ok(json!({"path": path, "written": true, "lines": content.lines().count()}))
}

fn tool_ppt_read(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    // PPT files are ZIP archives with XML inside. We can extract text from slides.
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Not a valid PPTX: {}", e))?;
    
    let mut slides_text = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut content = String::new();
            file.read_to_string(&mut content).map_err(|e| e.to_string())?;
            // Simple regex-free text extraction: find all <a:t>...</a:t>
            let mut texts = Vec::new();
            let mut remaining = content.as_str();
            while let Some(start) = remaining.find("<a:t>") {
                remaining = &remaining[start + 5..];
                if let Some(end) = remaining.find("</a:t>") {
                    texts.push(remaining[..end].to_string());
                    remaining = &remaining[end + 6..];
                }
            }
            slides_text.push(json!({"slide": name, "texts": texts}));
        }
    }
    Ok(json!({"path": path, "slides_count": slides_text.len(), "slides": slides_text}))
}

fn tool_pdf_read(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let content = pdf_extract::extract_text(&path).map_err(|e| format!("Failed to extract PDF: {}", e))?;
    let pages: Vec<&str> = content.split('\u{000C}').collect(); // Form feed = page break
    Ok(json!({
        "path": path,
        "pages": pages.len(),
        "characters": content.len(),
        "content": content,
        "pages_list": pages
    }))
}

fn tool_doc_convert(args: &Value) -> Result<Value, String> {
    let input = arg_str(args, "input")?;
    let output_dir = arg_opt(args, "output_dir").unwrap_or_else(|| {
        Path::new(&input).parent().unwrap_or(Path::new(".")).to_string_lossy().to_string()
    });
    let result = crate::utils::office_converter::convert_office_to_pdf(
        Path::new(&input), Path::new(&output_dir)
    ).map_err(|e| format!("Conversion failed: {}", e))?;
    Ok(json!({"input": input, "output": result.to_string_lossy(), "converted": true}))
}

// ═══════════════════════════════════════════════════════
// WEB / BROWSER
// ═══════════════════════════════════════════════════════

fn tool_browser_open(args: &Value) -> Result<Value, String> {
    let url = arg_str(args, "url")?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd").args(["/C", "start", &url]).spawn().map_err(|e| e.to_string())?;
    }
    Ok(json!({"url": url, "opened": true}))
}

async fn tool_browser_extract(args: &Value) -> Result<Value, String> {
    let url = arg_str(args, "url")?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = resp.text().await.map_err(|e| e.to_string())?;
    // Simple HTML to text: strip tags
    let text = strip_html_tags(&html);
    Ok(json!({"url": url, "content": text, "html_length": html.len(), "text_length": text.len()}))
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Collapse whitespace
    let mut collapsed = String::new();
    let mut prev_space = false;
    for ch in result.chars() {
        if ch.is_whitespace() {
            if !prev_space { collapsed.push(' '); }
            prev_space = true;
        } else {
            collapsed.push(ch);
            prev_space = false;
        }
    }
    collapsed.trim().to_string()
}

// ═══════════════════════════════════════════════════════
// NETWORK
// ═══════════════════════════════════════════════════════

async fn tool_http_request(args: &Value) -> Result<Value, String> {
    let url = arg_str(args, "url")?;
    let method = arg_opt(args, "method").unwrap_or_else(|| "GET".into()).to_uppercase();
    let body = arg_opt(args, "body");
    let headers: HashMap<String, String> = args.get("headers")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build().map_err(|e| e.to_string())?;

    let mut req = match method.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => client.get(&url),
    };

    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let resp_headers: HashMap<String, String> = resp.headers().iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let resp_body = resp.text().await.map_err(|e| e.to_string())?;

    // Try to parse as JSON
    let body_json: Value = serde_json::from_str(&resp_body).unwrap_or(json!(resp_body));

    Ok(json!({
        "status": status,
        "headers": resp_headers,
        "body": body_json,
        "url": url
    }))
}

async fn tool_download_file(args: &Value) -> Result<Value, String> {
    let url = arg_str(args, "url")?;
    let output = arg_str(args, "output")?;
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    
    if let Some(parent) = Path::new(&output).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&output, &bytes).map_err(|e| e.to_string())?;
    Ok(json!({"url": url, "output": output, "size": bytes.len(), "downloaded": true}))
}

// ═══════════════════════════════════════════════════════
// COMMUNICATION
// ═══════════════════════════════════════════════════════

fn tool_send_email(args: &Value) -> Result<Value, String> {
    // Simple implementation using PowerShell SMTP
    let to = arg_str(args, "to")?;
    let subject = arg_str(args, "subject")?;
    let body = arg_str(args, "body")?;
    let smtp_server = arg_opt(args, "smtp_server").unwrap_or_else(|| "smtp.qq.com".into());
    let from = arg_opt(args, "from").unwrap_or_else(|| to.clone());
    let password = arg_opt(args, "password");

    if password.is_none() {
        return Ok(json!({"status": "config_needed", "message": "Email requires SMTP password. Set 'password' argument.", "to": to, "subject": subject}));
    }

    let ps_script = format!(
        r#"
        $smtp = New-Object Net.Mail.SmtpClient('{}', 587)
        $smtp.EnableSsl = $true
        $smtp.Credentials = New-Object Net.NetworkCredential('{}', '{}')
        $msg = New-Object Net.Mail.MailMessage('{}', '{}', '{}', '{}')
        $smtp.Send($msg)
        "#,
        smtp_server, from, password.unwrap_or_default(), from, to, subject, body
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(json!({"sent": true, "to": to, "subject": subject}))
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("Email failed: {}", err))
    }
}

fn tool_send_notification(args: &Value) -> Result<Value, String> {
    let title = arg_opt(args, "title").unwrap_or_else(|| "通知".into());
    let message = arg_str(args, "message")?;
    
    // Windows toast notification via PowerShell
    let ps = format!(
        r#"
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $texts = $template.GetElementsByTagName('text')
        $texts.Item(0).AppendChild($template.CreateTextNode('{}')) > $null
        $texts.Item(1).AppendChild($template.CreateTextNode('{}')) > $null
        $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('TONGX').Show($toast)
        "#,
        title.replace("'", "''"), message.replace("'", "''")
    );
    
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .spawn();
    
    Ok(json!({"sent": true, "title": title, "message": message}))
}

// ═══════════════════════════════════════════════════════
// DATA PROCESSING
// ═══════════════════════════════════════════════════════

fn tool_json_parse(args: &Value) -> Result<Value, String> {
    if let Some(input) = args.get("input") {
        if let Some(s) = input.as_str() {
            let parsed: Value = serde_json::from_str(s).map_err(|e| format!("JSON parse error: {}", e))?;
            return Ok(json!({"parsed": parsed, "type": match &parsed { Value::Object(_) => "object", Value::Array(_) => "array", _ => "primitive" }}));
        }
        return Ok(json!({"parsed": input, "type": "already_parsed"}));
    }
    // If a file path is given, read and parse
    if let Ok(path) = arg_str(args, "path") {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let parsed: Value = serde_json::from_str(&content).map_err(|e| format!("JSON parse error: {}", e))?;
        return Ok(json!({"path": path, "parsed": parsed}));
    }
    Err("Provide 'input' (JSON string) or 'path' (file path)".into())
}

fn tool_csv_process(args: &Value) -> Result<Value, String> {
    let path = arg_str(args, "path")?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let delimiter = arg_opt(args, "delimiter").unwrap_or_else(|| ",".into());
    let delim_char = delimiter.chars().next().unwrap_or(',');
    
    let mut rows: Vec<Vec<String>> = Vec::new();
    for line in content.lines() {
        if line.trim().is_empty() { continue; }
        let cols: Vec<String> = line.split(delim_char).map(|s| s.trim().to_string()).collect();
        rows.push(cols);
    }
    
    let header = if !rows.is_empty() { rows[0].clone() } else { vec![] };
    let filter_col = arg_opt(args, "filter_column");
    let filter_val = arg_opt(args, "filter_value");
    
    let filtered: Vec<&Vec<String>> = if let (Some(col), Some(val)) = (&filter_col, &filter_val) {
        if let Some(col_idx) = header.iter().position(|h| h == col) {
            rows.iter().skip(1).filter(|r| r.get(col_idx).map(|v| v.contains(val.as_str())).unwrap_or(false)).collect()
        } else {
            rows.iter().skip(1).collect()
        }
    } else {
        rows.iter().skip(1).collect()
    };

    Ok(json!({
        "path": path,
        "total_rows": rows.len(),
        "header": header,
        "columns": header.len(),
        "filtered_rows": filtered.len(),
        "data": filtered
    }))
}

fn tool_data_stats(args: &Value) -> Result<Value, String> {
    let data = args.get("data").ok_or("Missing 'data' argument")?;
    let numbers: Vec<f64> = if let Some(arr) = data.as_array() {
        arr.iter().filter_map(|v| v.as_f64()).collect()
    } else if let Some(s) = data.as_str() {
        s.split(&[',', ' ', '\n', '\t'][..]).filter_map(|s| s.trim().parse::<f64>().ok()).collect()
    } else {
        return Err("'data' should be an array of numbers or a comma-separated string".into());
    };

    if numbers.is_empty() {
        return Err("No numeric data found".into());
    }

    let n = numbers.len() as f64;
    let sum: f64 = numbers.iter().sum();
    let mean = sum / n;
    let min = numbers.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = numbers.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let variance = numbers.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let std_dev = variance.sqrt();
    
    let mut sorted = numbers.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = if sorted.len() % 2 == 0 {
        (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
    } else {
        sorted[sorted.len() / 2]
    };

    Ok(json!({
        "count": numbers.len(),
        "sum": sum, "mean": mean, "median": median,
        "min": min, "max": max,
        "std_dev": std_dev, "variance": variance,
        "range": max - min
    }))
}

// ═══════════════════════════════════════════════════════
// SYSTEM
// ═══════════════════════════════════════════════════════

fn tool_shell_run(args: &Value) -> Result<Value, String> {
    let command = arg_str(args, "command")?;
    let cwd = arg_opt(args, "cwd");
    
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", &command]);
    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }
    
    let output = cmd.output().map_err(|e| format!("Failed to execute command: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    Ok(json!({
        "command": command,
        "exit_code": output.status.code(),
        "stdout": stdout,
        "stderr": stderr,
        "success": output.status.success()
    }))
}

fn tool_clipboard_read() -> Result<Value, String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-Clipboard"])
        .output()
        .map_err(|e| e.to_string())?;
    let content = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(json!({"content": content}))
}

fn tool_clipboard_write(args: &Value) -> Result<Value, String> {
    let content = arg_str(args, "content")?;
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!("Set-Clipboard '{}'", content.replace("'", "''"))])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(json!({"written": true, "length": content.len()}))
}

fn tool_env_info() -> Result<Value, String> {
    Ok(json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
        "current_dir": std::env::current_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "home_dir": std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default(),
        "temp_dir": std::env::temp_dir().to_string_lossy().to_string(),
        "num_cpus": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
    }))
}

// ═══════════════════════════════════════════════════════
// MULTIMEDIA
// ═══════════════════════════════════════════════════════

fn tool_tts_speak(args: &Value) -> Result<Value, String> {
    let text = arg_str(args, "text")?;
    let output = arg_opt(args, "output");
    
    if let Some(out_path) = &output {
        // Save to file
        let ps = format!(
            r#"
            Add-Type -AssemblyName System.Speech
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $synth.SetOutputToWaveFile('{}')
            $synth.Speak('{}')
            $synth.Dispose()
            "#,
            out_path.replace("'", "''"), text.replace("'", "''")
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(json!({"spoken": true, "output": out_path, "text": text}))
    } else {
        // Speak aloud
        let ps = format!(
            r#"
            Add-Type -AssemblyName System.Speech
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $synth.Speak('{}')
            $synth.Dispose()
            "#,
            text.replace("'", "''")
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps])
            .spawn();
        Ok(json!({"spoken": true, "text": text}))
    }
}

// ═══════════════════════════════════════════════════════
// FLOW CONTROL
// ═══════════════════════════════════════════════════════

async fn tool_delay_wait(args: &Value) -> Result<Value, String> {
    let ms = args.get("ms").and_then(|v| v.as_u64()).unwrap_or(1000);
    let seconds = args.get("seconds").and_then(|v| v.as_u64());
    let wait_ms = if let Some(s) = seconds { s * 1000 } else { ms };
    
    if wait_ms > 60000 {
        return Err("Maximum delay is 60 seconds".into());
    }
    tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
    Ok(json!({"waited_ms": wait_ms, "done": true}))
}

fn tool_condition_check(args: &Value) -> Result<Value, String> {
    let left = args.get("left").cloned().unwrap_or(Value::Null);
    let op = arg_opt(args, "operator").unwrap_or_else(|| "eq".into());
    let right = args.get("right").cloned().unwrap_or(Value::Null);

    let result = match op.as_str() {
        "eq" | "==" => left == right,
        "neq" | "!=" => left != right,
        "gt" | ">" => left.as_f64().unwrap_or(0.0) > right.as_f64().unwrap_or(0.0),
        "lt" | "<" => left.as_f64().unwrap_or(0.0) < right.as_f64().unwrap_or(0.0),
        "gte" | ">=" => left.as_f64().unwrap_or(0.0) >= right.as_f64().unwrap_or(0.0),
        "lte" | "<=" => left.as_f64().unwrap_or(0.0) <= right.as_f64().unwrap_or(0.0),
        "contains" => left.as_str().unwrap_or("").contains(right.as_str().unwrap_or("")),
        "not_empty" => !left.is_null() && left.as_str().map(|s| !s.is_empty()).unwrap_or(true),
        "is_null" => left.is_null(),
        _ => return Err(format!("Unknown operator: {}", op)),
    };

    Ok(json!({"result": result, "left": left, "operator": op, "right": right}))
}
