use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct AiConfig {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model_name: String,
    pub is_active: bool,
    pub purpose: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub model_override: Option<String>, // 前端指定的模型名
    pub images: Option<Vec<String>>,    // Base64 字符串数组
    pub module: Option<String>,         // 功能模块标识，用于路由到指定引擎
}

#[derive(Debug, Deserialize)]
pub struct ChatWithConfigRequest {
    pub config: AiConfig,
    pub req: ChatRequest,
}

pub async fn resolve_local_bearer_token(mut api_key: String, is_local: bool) -> String {
    if api_key.is_empty() && is_local {
        if let Ok(v) = std::env::var("LM_API_TOKEN") {
            let t = v.trim();
            if !t.is_empty() {
                api_key = t.to_string();
            }
        }
        if api_key.is_empty() {
            if let Ok(v) = std::env::var("LMSTUDIO_API_TOKEN") {
                let t = v.trim();
                if !t.is_empty() {
                    api_key = t.to_string();
                }
            }
        }
    }
    api_key
}

fn extract_text_from_response(
    json_resp: &serde_json::Value,
    is_gemini: bool,
) -> Result<String, String> {
    if is_gemini {
        let text = json_resp["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or_else(|| "无法从 Gemini 响应中提取文字".to_string())?;
        return Ok(text.to_string());
    }

    let content = &json_resp["choices"][0]["message"]["content"];

    // 1) 经典 OpenAI：content 是字符串
    if let Some(s) = content.as_str() {
        return Ok(s.to_string());
    }

    // 2) OpenAI 兼容实现：content 是数组，每项有 text / content 字段
    if let Some(arr) = content.as_array() {
        let mut pieces: Vec<String> = Vec::new();
        for item in arr {
            if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                pieces.push(t.to_string());
            } else if let Some(t) = item.get("content").and_then(|v| v.as_str()) {
                pieces.push(t.to_string());
            }
        }
        if !pieces.is_empty() {
            return Ok(pieces.join(""));
        }
    }

    // 3) 最后兜底：直接把整个 JSON 序列化返回，至少前端能看到原始结果，便于调试
    Ok(json_resp.to_string())
}

#[tauri::command]
pub async fn list_ai_configs(pool: State<'_, DbPool>) -> Result<Vec<AiConfig>, String> {
    sqlx::query_as::<_, AiConfig>("SELECT id, name, provider, api_key, base_url, model_name, is_active, purpose FROM ai_configs ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_ai_config(pool: State<'_, DbPool>, config: AiConfig) -> Result<(), String> {
    let id = if config.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        config.id.clone()
    };

    // 全局激活策略：如果当前配置设置为 is_active，则先取消所有其它配置的激活状态
    if config.is_active {
        sqlx::query("UPDATE ai_configs SET is_active = 0")
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO ai_configs (id, name, provider, api_key, base_url, model_name, is_active, purpose) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET 
            name = excluded.name, 
            provider = excluded.provider, 
            api_key = excluded.api_key, 
            base_url = excluded.base_url, 
            model_name = excluded.model_name,
            is_active = excluded.is_active,
            purpose = excluded.purpose",
    )
    .bind(id)
    .bind(config.name)
    .bind(config.provider)
    .bind(config.api_key)
    .bind(config.base_url)
    .bind(config.model_name)
    .bind(config.is_active)
    .bind(config.purpose)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_ai_config(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM ai_configs WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 模块级 AI 引擎路由解析
/// 1. 如果 module 有值，先查 settings 表 `ai_route_{module}` 拿到 config_id
/// 2. 通过 config_id 找到对应的 AiConfig
/// 3. 如果没有配置路由或找不到对应 config，回退到第一个 is_active=1 的配置
pub async fn resolve_ai_config(
    pool: &sqlx::SqlitePool,
    module: Option<&str>,
) -> Result<AiConfig, String> {
    // Step 1: 尝试按模块路由
    if let Some(m) = module {
        let route_key = format!("ai_route_{}", m);
        let route: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
            .bind(&route_key)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

        if let Some((config_id,)) = route {
            if !config_id.is_empty() {
                let routed = sqlx::query_as::<_, AiConfig>("SELECT * FROM ai_configs WHERE id = ?")
                    .bind(&config_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?;

                if let Some(cfg) = routed {
                    return Ok(cfg);
                }
            }
        }
    }

    // Step 2: 回退到第一个激活的配置
    sqlx::query_as::<_, AiConfig>("SELECT * FROM ai_configs WHERE is_active = 1 LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未配置激活的 AI 模型，请先在设置中配置".to_string())
}

#[tauri::command]
pub async fn chat_with_ai(pool: State<'_, DbPool>, req: ChatRequest) -> Result<String, String> {
    // 模块级引擎路由：优先查找模块指定的引擎，否则回退到第一个激活引擎
    let active_config = resolve_ai_config(&*pool, req.module.as_deref()).await?;

    // 确定使用的模型：优先使用前端传来的覆盖参数，否则使用配置中的模型名
    let mut model_name = req
        .model_override
        .clone()
        .unwrap_or(active_config.model_name.clone());

    // 协议纠偏与基本链接处理
    let mut url = active_config
        .base_url
        .clone()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string())
        .trim()
        .to_string();

    // 协议纠偏：如果用户没输入 http，自动加上
    if !url.starts_with("http") {
        url = format!("https://{}", url);
    }

    // 智能代理策略：检测是否为本地请求以应用特殊兼容逻辑
    let is_local = url.contains("localhost") || url.contains("127.0.0.1");

    // 本地模型推理可能较慢，适当放宽超时时间
    let timeout = if is_local {
        std::time::Duration::from_secs(300)
    } else {
        std::time::Duration::from_secs(60)
    };

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(std::time::Duration::from_secs(5))
        .no_proxy() // 避免系统代理干扰本地 LM Studio / Ollama 等
        .build()
        .map_err(|e| format!("无法构建 HTTP 客户端: {}", e))?;

    let is_gemini = url.contains("googleapis.com");
    let api_key = resolve_local_bearer_token(
        active_config.api_key.unwrap_or_default().trim().to_string(),
        is_local,
    )
    .await;
    // 智能模型对齐：随动模式 (针对 LM Studio / Ollama 等无固定模型名或动态载入的情况)
    // 触发条件：模型名为 __auto_detect__ 或者为空，且不是 Gemini
    if (model_name == "__auto_detect__" || model_name.is_empty()) && !is_gemini {
        let models_url = format!("{}/models", url.trim_end_matches('/'));
        let mut models_req = client.get(&models_url);
        if !api_key.is_empty() {
            models_req = models_req.header("Authorization", format!("Bearer {}", api_key));
        }

        if let Ok(resp) = models_req.send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    // OpenAI 兼容格式通常在 data 数组中，Ollama 也有类似结构
                    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                        if let Some(first_model) = data
                            .get(0)
                            .and_then(|m| m.get("id"))
                            .and_then(|i| i.as_str())
                        {
                            model_name = first_model.to_string();
                            println!("AI 智能对齐：自动检测到可用模型: {}", model_name);
                        }
                    } else if let Some(m_list) = json.as_array() {
                        // 某些极简实现直接返回数组
                        if let Some(first_model) = m_list.get(0).and_then(|m| m.as_str()) {
                            model_name = first_model.to_string();
                        }
                    }
                }
            }
        }
    }

    // 兜底逻辑：如果仍然为空，对于本地模型给一个通用默认值，避免请求失败
    if model_name.is_empty() || model_name == "__auto_detect__" {
        if is_local {
            model_name = "local-model".to_string();
        } else {
            return Err("无法确定模型名称，请在 AI 设置中手动指定模型名。".to_string());
        }
    }

    // 调试辅助（生产环境应移除）：记录密钥首位以核对 OCR 准确性
    if is_gemini && api_key.len() > 10 {
        println!(
            "Gemini API Key Debug: {}...{}",
            &api_key[..4],
            &api_key[api_key.len() - 4..]
        );
    }

    let mut final_prompt = req.prompt.clone();
    let mut final_images = req.images.clone().unwrap_or_default();

    // 如果不是 Gemini 且包含 PDF，执行文本提取 fallback
    if !is_gemini {
        let mut pdf_texts = vec![];
        let mut filtered_images = vec![];

        for img in final_images {
            if img.starts_with("JVBERi") {
                // 是 PDF
                use base64::Engine as _;
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&img) {
                    // pdf-extract 通常需要文件路径，我们写入临时文件 or 使用内存读取（如果库支持）
                    // 这里的 pdf-extract 0.7.2 提供 extract_text(path)
                    let temp_id = uuid::Uuid::new_v4().to_string();
                    let temp_path = std::env::temp_dir().join(format!("{}.pdf", temp_id));
                    if std::fs::write(&temp_path, &bytes).is_ok() {
                        if let Ok(text) = pdf_extract::extract_text(&temp_path) {
                            pdf_texts.push(text);
                        }
                        let _ = std::fs::remove_file(&temp_path);
                    }
                }
            } else {
                // 是图片
                filtered_images.push(img);
            }
        }

        if !pdf_texts.is_empty() {
            final_prompt = format!(
                "{}\n\n以下是从无法直接视觉识别的 PDF 文件中提取的文本内容，请结合此内容进行分析：\n{}",
                final_prompt,
                pdf_texts.join("\n---\n")
            );
        }
        final_images = filtered_images;
    }

    let (endpoint, body) = if is_gemini {
        // ... (Gemini logic updated to use original images if they are PDF since Gemini supports it)
        // 注意：Gemini 还是按照原来的逻辑走，因为它支持 application/pdf
        let clean_url = url.trim_end_matches('/');
        let base_endpoint = if clean_url.contains("/openai") {
            clean_url.replace("/openai", "")
        } else {
            clean_url.to_string()
        };

        let target = format!(
            "{}/models/{}:generateContent?key={}",
            base_endpoint, model_name, api_key
        );

        let mut contents = vec![];
        if let Some(sys) = req.system_prompt {
            contents.push(json!({"role": "user", "parts": [{"text": sys}]}));
            contents
                .push(json!({"role": "model", "parts": [{"text": "理解，我将按此要求执行。"}]}));
        }

        let mut parts = vec![json!({"text": final_prompt})];
        // 重新获取原始 images 进行 Gemini 处理 (Gemini 支持 PDF)
        if let Some(orig_imgs) = &req.images {
            for img in orig_imgs {
                let mime_type = if img.starts_with("JVBERi") {
                    "application/pdf"
                } else {
                    "image/jpeg"
                };
                parts.push(json!({
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": img
                    }
                }));
            }
        }

        contents.push(json!({"role": "user", "parts": parts}));

        (
            target,
            json!({ "contents": contents, "generationConfig": { "temperature": 0.3 } }), // 降低温度以提高 JSON 稳定性
        )
    } else {
        // 标准 OpenAI 兼容模式
        let target = format!("{}/chat/completions", url.trim_end_matches('/'));
        let mut messages = vec![];
        if let Some(sys) = req.system_prompt {
            messages.push(json!({"role": "system", "content": sys}));
        }

        // 构建多模态内容或纯文本内容
        let user_content = if !final_images.is_empty() {
            let mut content_parts = vec![json!({ "type": "text", "text": final_prompt })];
            for img in final_images {
                // 能走到这里的 final_images 肯定都是图片（PDF 已经被提取成文本了）
                content_parts.push(json!({
                    "type": "image_url",
                    "image_url": { "url": format!("data:image/jpeg;base64,{}", img) }
                }));
            }
            json!(content_parts)
        } else {
            json!(final_prompt)
        };

        messages.push(json!({"role": "user", "content": user_content}));

        let payload = json!({
            "model": model_name,
            "messages": messages,
            "temperature": 0.3
        });
        (target, payload)
    };

    let mut request = client.post(&endpoint).json(&body);

    // 如果不是 Gemini 或者用户明确配置了 Headers 鉴权（比如中转站）
    if !is_gemini && !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = request.send().await.map_err(|e| {
        // 展开更详细的底层错误，便于排查本地服务连接问题
        format!(
            "网络请求失败 (端点: {}): {:#?}",
            endpoint.split('?').next().unwrap_or(""),
            e
        )
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let raw_text = resp
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误响应体".to_string());

        // 尝试从 JSON 中提取错误，如果不行就直接返回 raw_text
        let err_msg = if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&raw_text) {
            err_json["error"]["message"]
                .as_str()
                .or_else(|| err_json["message"].as_str())
                .unwrap_or(&raw_text)
                .to_string()
        } else {
            raw_text
        };

        // 针对本地模型常见鉴权问题给更友好的提示
        if status.as_u16() == 401 && is_local {
            return Err(format!(
                "AI 响应错误 ({}): {}\n\n提示：你的 LM Studio Server 开启了鉴权，需要请求头 `Authorization: Bearer <token>`。\n- 方案1：在【设置 → AI】里填写 API KEY（只填 token 本体，不要加 Bearer）。\n- 方案2：在系统环境变量里设置 `LM_API_TOKEN` 后重启本程序。\n",
                status, err_msg
            ));
        }

        return Err(format!("AI 响应错误 ({}): {}", status, err_msg));
    }

    let json_resp: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    extract_text_from_response(&json_resp, is_gemini)
}

#[tauri::command]
pub async fn chat_with_ai_config(payload: ChatWithConfigRequest) -> Result<String, String> {
    let cfg = payload.config;
    let req = payload.req;

    let mut url = cfg
        .base_url
        .clone()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string())
        .trim()
        .to_string();

    if !url.starts_with("http") {
        url = format!("https://{}", url);
    }
    let is_local = url.contains("localhost") || url.contains("127.0.0.1");
    let is_gemini = url.contains("googleapis.com");

    let timeout = if is_local {
        std::time::Duration::from_secs(300)
    } else {
        std::time::Duration::from_secs(60)
    };

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(std::time::Duration::from_secs(5))
        .no_proxy()
        .build()
        .map_err(|e| format!("无法构建 HTTP 客户端: {}", e))?;

    let mut model_name = req.model_override.clone().unwrap_or(cfg.model_name.clone());

    let api_key =
        resolve_local_bearer_token(cfg.api_key.unwrap_or_default().trim().to_string(), is_local)
            .await;

    // 沿用与 chat_with_ai 相同的自动模型探测/兜底策略
    if (model_name == "__auto_detect__" || model_name.is_empty()) && !is_gemini {
        let models_url = format!("{}/models", url.trim_end_matches('/'));
        let mut models_req = client.get(&models_url);
        if !api_key.is_empty() {
            models_req = models_req.header("Authorization", format!("Bearer {}", api_key));
        }
        if let Ok(resp) = models_req.send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                        if let Some(first_model) = data
                            .get(0)
                            .and_then(|m| m.get("id"))
                            .and_then(|i| i.as_str())
                        {
                            model_name = first_model.to_string();
                        }
                    } else if let Some(m_list) = json.as_array() {
                        if let Some(first_model) = m_list.get(0).and_then(|m| m.as_str()) {
                            model_name = first_model.to_string();
                        }
                    }
                }
            }
        }
    }

    if model_name.is_empty() || model_name == "__auto_detect__" {
        if is_local {
            model_name = "local-model".to_string();
        } else {
            return Err("无法确定模型名称，请在 AI 设置中手动指定模型名。".to_string());
        }
    }

    // 复用现有 chat 逻辑：这里走 OpenAI 兼容 / Gemini 的主体逻辑（与上面保持一致）
    let mut final_prompt = req.prompt.clone();
    let mut final_images = req.images.clone().unwrap_or_default();

    if !is_gemini {
        let mut pdf_texts = vec![];
        let mut filtered_images = vec![];
        for img in final_images {
            if img.starts_with("JVBERi") {
                use base64::Engine as _;
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&img) {
                    let temp_id = uuid::Uuid::new_v4().to_string();
                    let temp_path = std::env::temp_dir().join(format!("{}.pdf", temp_id));
                    if std::fs::write(&temp_path, &bytes).is_ok() {
                        if let Ok(text) = pdf_extract::extract_text(&temp_path) {
                            pdf_texts.push(text);
                        }
                        let _ = std::fs::remove_file(&temp_path);
                    }
                }
            } else {
                filtered_images.push(img);
            }
        }
        if !pdf_texts.is_empty() {
            final_prompt = format!(
                "{}\n\n以下是从无法直接视觉识别的 PDF 文件中提取的文本内容，请结合此内容进行分析：\n{}",
                final_prompt,
                pdf_texts.join("\n---\n")
            );
        }
        final_images = filtered_images;
    }

    let (endpoint, body) = if is_gemini {
        let clean_url = url.trim_end_matches('/');
        let base_endpoint = if clean_url.contains("/openai") {
            clean_url.replace("/openai", "")
        } else {
            clean_url.to_string()
        };
        let target = format!(
            "{}/models/{}:generateContent?key={}",
            base_endpoint, model_name, api_key
        );

        let mut contents = vec![];
        if let Some(sys) = req.system_prompt {
            contents.push(json!({"role": "user", "parts": [{"text": sys}]}));
            contents
                .push(json!({"role": "model", "parts": [{"text": "理解，我将按此要求执行。"}]}));
        }

        let mut parts = vec![json!({"text": final_prompt})];
        if let Some(orig_imgs) = &req.images {
            for img in orig_imgs {
                let mime_type = if img.starts_with("JVBERi") {
                    "application/pdf"
                } else {
                    "image/jpeg"
                };
                parts.push(json!({
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": img
                    }
                }));
            }
        }

        contents.push(json!({"role": "user", "parts": parts}));
        (
            target,
            json!({ "contents": contents, "generationConfig": { "temperature": 0.3 } }),
        )
    } else {
        let target = format!("{}/chat/completions", url.trim_end_matches('/'));
        let mut messages = vec![];
        if let Some(sys) = req.system_prompt {
            messages.push(json!({"role": "system", "content": sys}));
        }
        let user_content = if !final_images.is_empty() {
            let mut content_parts = vec![json!({ "type": "text", "text": final_prompt })];
            for img in final_images {
                content_parts.push(json!({
                    "type": "image_url",
                    "image_url": { "url": format!("data:image/jpeg;base64,{}", img) }
                }));
            }
            json!(content_parts)
        } else {
            json!(final_prompt)
        };
        messages.push(json!({"role": "user", "content": user_content}));
        let payload = json!({
            "model": model_name,
            "messages": messages,
            "temperature": 0.3
        });
        (target, payload)
    };

    let mut request = client.post(&endpoint).json(&body);
    if !is_gemini && !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = request.send().await.map_err(|e| {
        format!(
            "网络请求失败 (端点: {}): {:#?}",
            endpoint.split('?').next().unwrap_or(""),
            e
        )
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let raw_text = resp
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误响应体".to_string());
        let err_msg = if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&raw_text) {
            err_json["error"]["message"]
                .as_str()
                .or_else(|| err_json["message"].as_str())
                .unwrap_or(&raw_text)
                .to_string()
        } else {
            raw_text
        };

        if status.as_u16() == 401 && is_local {
            return Err(format!(
                "AI 响应错误 ({}): {}\n\n提示：你的 LM Studio Server 开启了鉴权，需要请求头 `Authorization: Bearer <token>`。\n- 方案1：在【设置 → AI】里填写 API KEY（只填 token 本体，不要加 Bearer）。\n- 方案2：在系统环境变量里设置 `LM_API_TOKEN` 后重启本程序。\n",
                status, err_msg
            ));
        }

        return Err(format!("AI 响应错误 ({}): {}", status, err_msg));
    }

    let json_resp: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    extract_text_from_response(&json_resp, is_gemini)
}

#[tauri::command]
pub async fn fetch_public_free_apis() -> Result<Vec<AiConfig>, String> {
    // 真实扫网：逐一探测已知的免费/社区 API 端点，只返回真正可连通的节点
    let candidates = vec![
        (
            "硅基流动 (免费额度)",
            "openai",
            "https://api.siliconflow.cn/v1",
            "Qwen/Qwen2.5-72B-Instruct",
            "",
        ),
        (
            "DeepSeek 官方",
            "openai",
            "https://api.deepseek.com/v1",
            "deepseek-chat",
            "",
        ),
        (
            "Groq 免费层",
            "openai",
            "https://api.groq.com/openai/v1",
            "llama-3.3-70b-versatile",
            "",
        ),
        (
            "OpenRouter 免费",
            "openai",
            "https://openrouter.ai/api/v1",
            "meta-llama/llama-3-8b-instruct:free",
            "",
        ),
        (
            "Cerebras 免费推理",
            "openai",
            "https://api.cerebras.ai/v1",
            "llama3.1-8b",
            "",
        ),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let mut alive: Vec<AiConfig> = Vec::new();

    for (name, provider, base_url, model, key) in &candidates {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let mut req = client.get(&url);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
        match req.send().await {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 401 => {
                // 401 means endpoint exists but needs auth — still a valid discovery
                let needs_key = resp.status().as_u16() == 401;
                alive.push(AiConfig {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: if needs_key {
                        format!("{} (需填写 API Key)", name)
                    } else {
                        name.to_string()
                    },
                    provider: provider.to_string(),
                    api_key: Some(key.to_string()),
                    base_url: Some(base_url.to_string()),
                    model_name: model.to_string(),
                    is_active: false,
                    purpose: "online".to_string(),
                });
            }
            _ => { /* 无法连通，跳过 */ }
        }
    }

    if alive.is_empty() {
        return Err("未扫描到任何可用的公共 API 端点，请检查网络连接。".to_string());
    }

    Ok(alive)
}

#[tauri::command]
pub async fn fetch_ai_models(
    base_url: String,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let mut request = client.get(&url);
    if let Some(key) = api_key {
        let trimmed_key = key.trim();
        if !trimmed_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", trimmed_key));
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("服务器返回错误: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析失败: {}", e))?;

    let mut models = vec![];
    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        for m in data {
            if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                models.push(id.to_string());
            }
        }
    } else if let Some(m_list) = json.as_array() {
        for m in m_list {
            if let Some(id) = m.as_str() {
                models.push(id.to_string());
            } else if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                models.push(id.to_string());
            }
        }
    }

    if models.is_empty() {
        return Err("未发现任何可用模型".to_string());
    }

    models.sort();
    Ok(models)
}
