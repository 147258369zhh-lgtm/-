use crate::db::DbPool;
use serde::Serialize;
use tauri::State;
use std::sync::{Mutex, OnceLock};

// ─── Multi-backend Embedding Engine ───────────────────────────────

// Module-level lazy model singleton
static LOCAL_MODEL: OnceLock<Mutex<fastembed::TextEmbedding>> = OnceLock::new();

fn get_local_model_embed(texts: Vec<&str>) -> Result<Vec<Vec<f32>>, String> {
    let model = LOCAL_MODEL.get_or_init(|| {
        let opts = fastembed::InitOptions::new(fastembed::EmbeddingModel::AllMiniLML6V2)
            .with_show_download_progress(true);
        let m = fastembed::TextEmbedding::try_new(opts)
            .expect("Failed to initialize local embedding model");
        Mutex::new(m)
    });
    
    let guard = model.lock().map_err(|e| format!("模型锁失败: {}", e))?;
    guard.embed(texts, None).map_err(|e| format!("本地嵌入计算失败: {}", e))
}

fn is_local_model_ready() -> bool {
    LOCAL_MODEL.get().is_some()
}

/// Generate embeddings using the configured engine
async fn generate_embeddings(
    pool: &DbPool,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    // Read engine setting
    let engine: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'embedding_engine'")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "local".to_string());

    match engine.as_str() {
        "lmstudio" | "online" => {
            // Use external OpenAI-compatible /v1/embeddings API
            let base_url: String = sqlx::query_scalar(
                "SELECT value FROM settings WHERE key = 'embedding_base_url'"
            )
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "http://127.0.0.1:1234/v1".to_string());

            let api_key: String = sqlx::query_scalar(
                "SELECT value FROM settings WHERE key = 'embedding_api_key'"
            )
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or_default();

            let model_name: String = sqlx::query_scalar(
                "SELECT value FROM settings WHERE key = 'embedding_model_name'"
            )
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "nomic-embed-text".to_string());

            call_api_embeddings(&base_url, &api_key, &model_name, &texts).await
        }
        _ => {
            // Default: use local fastembed (run in blocking thread to avoid freezing async runtime)
            let texts_owned = texts.clone();
            tokio::task::spawn_blocking(move || {
                let texts_ref: Vec<&str> = texts_owned.iter().map(|s| s.as_str()).collect();
                get_local_model_embed(texts_ref)
            })
            .await
            .map_err(|e| format!("嵌入线程异常: {}", e))?
        }
    }
}

/// Call an OpenAI-compatible /v1/embeddings endpoint
async fn call_api_embeddings(
    base_url: &str,
    api_key: &str,
    model: &str,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/embeddings", base_url.trim_end_matches('/'));

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "input": texts
        }));

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("嵌入API请求失败: {}", e))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析嵌入API响应失败: {}", e))?;

    let data = body["data"]
        .as_array()
        .ok_or("嵌入API响应格式错误: 缺少 data 字段")?;

    let mut embeddings = Vec::new();
    for item in data {
        let emb: Vec<f32> = item["embedding"]
            .as_array()
            .ok_or("嵌入API响应格式错误: 缺少 embedding")?
            .iter()
            .filter_map(|v| v.as_f64().map(|f| f as f32))
            .collect();
        embeddings.push(emb);
    }

    Ok(embeddings)
}

// ─── Text Extraction ──────────────────────────────────────────────

fn extract_text(file_path: &str, ext: &str) -> Result<String, String> {
    match ext.to_lowercase().as_str() {
        "pdf" => extract_pdf(file_path),
        "doc" | "docx" => extract_docx(file_path),
        "xls" | "xlsx" => extract_excel(file_path),
        "csv" => std::fs::read_to_string(file_path).map_err(|e| e.to_string()),
        "txt" | "md" | "json" | "xml" | "yaml" | "yml" | "html" | "css" |
        "js" | "ts" | "tsx" | "jsx" | "py" | "java" | "cpp" | "c" | "h" |
        "cs" | "vb" | "go" | "rs" | "rb" | "php" | "swift" | "kt" | "sql" |
        "sh" | "bat" | "cmd" | "ps1" | "ini" | "cfg" | "log" => {
            std::fs::read_to_string(file_path).map_err(|e| e.to_string())
        }
        _ => Err(format!("不支持提取此文件格式的文本: {}", ext)),
    }
}

fn extract_pdf(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    pdf_extract::extract_text_from_mem(&bytes).map_err(|e| format!("PDF文本提取失败: {}", e))
}

fn extract_docx(path: &str) -> Result<String, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| format!("打开DOCX文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("DOCX不是有效的ZIP: {}", e))?;

    // Read word/document.xml
    let mut xml_content = String::new();
    {
        let mut doc_xml = archive.by_name("word/document.xml")
            .map_err(|e| format!("找不到document.xml: {}", e))?;
        doc_xml.read_to_string(&mut xml_content)
            .map_err(|e| format!("读取document.xml失败: {}", e))?;
    }

    // Extract text from <w:t ...>text</or:t> tags using regex
    let re = regex::Regex::new(r"<w:t[^>]*>([^<]*)</w:t>").unwrap();
    let mut text = String::new();
    let mut last_was_para_end = false;

    for cap in re.captures_iter(&xml_content) {
        if let Some(m) = cap.get(1) {
            text.push_str(m.as_str());
            last_was_para_end = false;
        }
    }

    // Also add paragraph breaks at </w:p> boundaries
    // Simple approach: split by paragraph markers
    let para_re = regex::Regex::new(r"</w:p>").unwrap();
    let segments: Vec<&str> = para_re.split(&xml_content).collect();
    if segments.len() > 1 {
        // Re-extract with paragraph awareness
        text.clear();
        for segment in &segments {
            let seg_text: String = re.captures_iter(segment)
                .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
                .collect::<Vec<_>>()
                .join("");
            if !seg_text.is_empty() {
                text.push_str(&seg_text);
                text.push('\n');
            }
        }
    }

    let _ = last_was_para_end; // suppress warning
    Ok(text)
}

fn extract_excel(path: &str) -> Result<String, String> {
    use calamine::{Reader, open_workbook_auto};

    let mut workbook = open_workbook_auto(path)
        .map_err(|e| format!("Excel读取失败: {}", e))?;

    let mut text = String::new();
    let sheet_names = workbook.sheet_names().to_vec();

    for name in &sheet_names {
        text.push_str(&format!("=== Sheet: {} ===\n", name));
        if let Ok(range) = workbook.worksheet_range(name) {
            for row in range.rows() {
                let row_parts: Vec<String> = row.iter()
                    .filter_map(|cell| {
                        let s = cell.to_string();
                        if s.is_empty() { None } else { Some(s) }
                    })
                    .collect();
                if !row_parts.is_empty() {
                    text.push_str(&row_parts.join("\t"));
                    text.push('\n');
                }
            }
        }
        text.push('\n');
    }
    Ok(text)
}

// ─── Text Chunking ────────────────────────────────────────────────

fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= chunk_size {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();
        if !chunk.trim().is_empty() {
            chunks.push(chunk);
        }
        if end >= chars.len() {
            break;
        }
        start += chunk_size - overlap;
    }
    chunks
}

// ─── Cosine Similarity ───────────────────────────────────────────

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

fn f32_vec_to_bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn bytes_to_f32_vec(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

// ─── Tauri Commands ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct IndexStatus {
    pub template_id: String,
    pub chunk_count: i64,
    pub status: String, // "indexed", "none"
}

/// Index a document: extract text → chunk → embed → store
#[tauri::command]
pub async fn index_document(
    pool: State<'_, DbPool>,
    template_id: String,
    file_path: String,
    file_ext: String,
) -> Result<String, String> {
    // 1. Extract text
    let text = extract_text(&file_path, &file_ext)?;
    if text.trim().is_empty() {
        return Err("文件内容为空，无法索引".into());
    }

    // 2. Chunk text
    let chunks = chunk_text(&text, 2000, 300);
    if chunks.is_empty() {
        return Err("切片后无有效内容".into());
    }

    // 3. Delete old chunks for this template
    sqlx::query("DELETE FROM kb_chunks WHERE template_id = ?")
        .bind(&template_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // 4. Generate embeddings (batch)
    let embeddings = generate_embeddings(pool.inner(), chunks.clone()).await?;

    // 5. Store chunks + embeddings
    for (i, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        let emb_bytes = f32_vec_to_bytes(emb);
        sqlx::query(
            "INSERT INTO kb_chunks (id, template_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&template_id)
        .bind(i as i64)
        .bind(chunk)
        .bind(&emb_bytes)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(format!("成功索引 {} 个文本块", chunks.len()))
}

/// Query the knowledge base with RAG (hybrid: keyword + semantic)
#[tauri::command]
pub async fn rag_query(
    pool: State<'_, DbPool>,
    question: String,
) -> Result<String, String> {
    // 1. Embed the question
    let q_embeddings = generate_embeddings(pool.inner(), vec![question.clone()]).await?;
    let q_vec = q_embeddings.first().ok_or("嵌入问题向量失败")?;

    // 2. Load all chunks from DB
    let rows: Vec<(String, String, Vec<u8>)> = sqlx::query_as(
        "SELECT template_id, content, embedding FROM kb_chunks WHERE embedding IS NOT NULL"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Err("知识库尚无已索引的文档，请先导入文件并等待索引完成".into());
    }

    // 3. Normalize text helper for matching (× → x, full-width → ascii, etc.)
    fn normalize_for_match(s: &str) -> String {
        s.to_lowercase()
            .replace('×', "x")
            .replace('✕', "x")
            .replace('＊', "*")
            .replace('＋', "+")
            .replace('\u{00d7}', "x")  // Unicode multiplication sign
            .replace('Ｘ', "x")
            .replace('ｘ', "x")
    }

    let q_norm = normalize_for_match(&question);
    // Extract meaningful keywords (split on spaces, punctuation, and Chinese stop words)
    let keywords: Vec<String> = q_norm
        .split(|c: char| c.is_whitespace() || "，？?。、的是多少钱价格".contains(c))
        .filter(|w| w.chars().count() >= 2)
        .map(|s| s.to_string())
        .collect();

    // 4. Hybrid scoring: semantic similarity + keyword bonus
    let mut scored: Vec<(f32, &str, &str)> = rows
        .iter()
        .map(|(tid, content, emb_bytes)| {
            let emb = bytes_to_f32_vec(emb_bytes);
            let semantic_score = cosine_similarity(q_vec, &emb);

            // Keyword bonus with normalized text
            let content_norm = normalize_for_match(content);
            let mut keyword_bonus: f32 = 0.0;
            for kw in &keywords {
                if content_norm.contains(kw.as_str()) {
                    keyword_bonus += 0.2; // each matched keyword adds 20% bonus
                }
            }
            // Also boost if the entire normalized query appears
            if content_norm.contains(&q_norm) {
                keyword_bonus += 0.3;
            }

            let final_score = (semantic_score + keyword_bonus).min(1.0);
            (final_score, tid.as_str(), content.as_str())
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // 5. Take top 5 most relevant chunks (keep context small for local models)
    let top_chunks: Vec<&(f32, &str, &str)> = scored.iter().take(5).collect();

    // 6. Build context for AI (truncate each chunk to keep total context manageable)
    let max_chunk_len = 1500;
    let mut context = String::from("以下是从知识库中检索到的与问题最相关的文档片段：\n\n");
    for (i, (score, _tid, content)) in top_chunks.iter().enumerate() {
        let truncated = if content.chars().count() > max_chunk_len {
            let s: String = content.chars().take(max_chunk_len).collect();
            format!("{}...(截断)", s)
        } else {
            content.to_string()
        };
        context.push_str(&format!(
            "【片段 {}】(相关度: {:.0}%)\n{}\n\n",
            i + 1,
            score * 100.0,
            truncated
        ));
    }

    // 7. Call AI to answer with stricter prompt
    let prompt = format!(
        "{}\n\n请仔细阅读以上文档片段，回答用户问题。请直接从片段中查找数据并给出准确答案。如果片段中包含表格数据，请仔细逐行查找匹配的型号和对应的价格数据。\n\n问题：{}",
        context, question
    );

    // Get AI config via module routing (module = "rag")
    let config = crate::ai::resolve_ai_config(pool.inner(), Some("rag")).await
        .map_err(|e| format!("未配置激活的 AI 模型，请先在设置中配置: {}", e))?;

    // Build the chat request
    let base_url = config.base_url.clone().unwrap_or_default();
    let api_key = config.api_key.clone().unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": config.model_name,
        "messages": [
            { "role": "system", "content": "你是一个专业的知识库问答助手。请基于提供的文档片段准确回答用户的问题。回答要简洁、准确、有条理。" },
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.3,
        "max_tokens": 2000,
        "stream": false
    });

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.send().await.map_err(|e| format!("AI请求失败: {}", e))?;
    let resp_json: serde_json::Value = resp.json().await.map_err(|e| format!("解析AI响应失败: {}", e))?;

    let answer = resp_json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string());

    match answer {
        Some(a) if !a.trim().is_empty() => Ok(a),
        _ => {
            // Return diagnostic info: what chunks were found + raw AI response
            let mut diag = String::from("⚠️ AI 模型未返回有效回答。\n\n");
            diag.push_str(&format!("📡 AI 原始响应: {}\n\n", serde_json::to_string_pretty(&resp_json).unwrap_or_default()));
            diag.push_str("📋 检索到的相关数据片段预览:\n\n");
            for (i, (score, _tid, content)) in top_chunks.iter().take(3).enumerate() {
                let preview: String = content.chars().take(300).collect();
                diag.push_str(&format!("片段{} (相关度{:.0}%): {}...\n\n", i+1, score*100.0, preview));
            }
            Ok(diag)
        }
    }
}

/// Get indexing status for all knowledge base items
#[tauri::command]
pub async fn get_index_status(
    pool: State<'_, DbPool>,
) -> Result<Vec<IndexStatus>, String> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT template_id, COUNT(*) as cnt FROM kb_chunks GROUP BY template_id"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(tid, cnt)| IndexStatus {
            template_id: tid,
            chunk_count: cnt,
            status: if cnt > 0 { "indexed".into() } else { "none".into() },
        })
        .collect())
}

/// Get embedding engine status (model downloaded, etc.)
#[tauri::command]
pub async fn get_embedding_status(
    pool: State<'_, DbPool>,
) -> Result<serde_json::Value, String> {
    let engine: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'embedding_engine'")
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "local".to_string());

    let model_ready = if engine == "local" {
        is_local_model_ready()
    } else {
        true // API-based engines are always "ready"
    };

    Ok(serde_json::json!({
        "engine": engine,
        "model_ready": model_ready,
        "model_name": match engine.as_str() {
            "local" => "all-MiniLM-L6-v2 (本地ONNX)",
            "lmstudio" => "LM Studio 嵌入模型",
            "online" => "在线嵌入API",
            _ => "未知"
        }
    }))
}

/// Initialize/download the embedding model (called from settings UI)
#[tauri::command]
pub async fn init_embedding_model(
    pool: State<'_, DbPool>,
) -> Result<String, String> {
    // Trigger local model init by embedding a test string
    let result = generate_embeddings(pool.inner(), vec!["test".to_string()]).await;
    match result {
        Ok(_) => Ok("嵌入模型已就绪".to_string()),
        Err(e) => Err(format!("初始化嵌入模型失败: {}", e)),
    }
}

/// Rebuild indexes for all templates (frontend sends the list)
#[tauri::command]
pub async fn rebuild_all_indexes(
    pool: State<'_, DbPool>,
    items: Vec<serde_json::Value>,
) -> Result<String, String> {
    if items.is_empty() {
        return Err("知识库中没有可索引的文件".into());
    }

    // Wipe all old chunks to start fresh
    let _ = sqlx::query("DELETE FROM kb_chunks")
        .execute(pool.inner())
        .await;

    let mut success_count = 0;
    let mut fail_count = 0;
    let mut errors: Vec<String> = Vec::new();
    let total = items.len();

    for item in &items {
        let template_id = item["id"].as_str().unwrap_or("").to_string();
        let file_path = item["file_path"].as_str().unwrap_or("").to_string();
        let ext = item["file_ext"].as_str().unwrap_or("unknown").to_string();

        if template_id.is_empty() || file_path.is_empty() {
            fail_count += 1;
            errors.push(format!("空路径: id={}", template_id));
            continue;
        }

        // Try to extract and index
        match extract_text(&file_path, &ext) {
            Ok(text) if !text.trim().is_empty() => {
                let chunks = chunk_text(&text, 2000, 300);
                if chunks.is_empty() {
                    fail_count += 1;
                    errors.push(format!("分块为空: {}", file_path));
                    continue;
                }

                // Delete old chunks
                let _ = sqlx::query("DELETE FROM kb_chunks WHERE template_id = ?")
                    .bind(&template_id)
                    .execute(pool.inner())
                    .await;

                // Generate embeddings
                match generate_embeddings(pool.inner(), chunks.clone()).await {
                    Ok(embeddings) => {
                        let mut chunk_ok = 0;
                        for (i, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                            let id = uuid::Uuid::new_v4().to_string();
                            let emb_bytes = f32_vec_to_bytes(emb);
                            match sqlx::query(
                                "INSERT INTO kb_chunks (id, template_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)"
                            )
                            .bind(&id)
                            .bind(&template_id)
                            .bind(i as i64)
                            .bind(chunk)
                            .bind(&emb_bytes)
                            .execute(pool.inner())
                            .await {
                                Ok(_) => { chunk_ok += 1; }
                                Err(e) => {
                                    errors.push(format!("块写入失败[{}#{}]: {}", template_id, i, e));
                                }
                            }
                        }
                        if chunk_ok > 0 { success_count += 1; } else { fail_count += 1; }
                    }
                    Err(e) => {
                        fail_count += 1;
                        errors.push(format!("嵌入失败: {} => {}", file_path, e));
                    }
                }
            }
            Ok(_) => {
                fail_count += 1;
                errors.push(format!("提取文本为空: {}", file_path));
            }
            Err(e) => {
                fail_count += 1;
                errors.push(format!("提取失败: {} => {}", file_path, e));
            }
        }
    }

    // Verify: count actual chunks in DB
    let total_chunks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM kb_chunks")
        .fetch_one(pool.inner())
        .await
        .unwrap_or(0);

    let mut msg = format!("索引完成: {}/{} 个文件成功, {} 个失败 (数据库共 {} 个文本块)", success_count, total, fail_count, total_chunks);
    if !errors.is_empty() {
        msg.push_str(&format!("\n错误详情: {}", errors.join("; ")));
    }
    Ok(msg)
}
