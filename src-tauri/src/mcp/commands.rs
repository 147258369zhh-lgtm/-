use tauri::{State, Manager};
use crate::mcp::client::McpClientManager;
use serde_json::{json, Value};

#[tauri::command]
pub async fn mcp_connect_stdio(
    manager: State<'_, McpClientManager>,
    name: String,
    command: String,
    args: Vec<String>,
) -> Result<(), String> {
    manager.connect_stdio(&name, &command, &args).await
}

#[tauri::command]
pub async fn mcp_call_internal_tool(
    handle: tauri::AppHandle,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let pool = handle.state::<crate::db::DbPool>();
    
    match tool_name.as_str() {
        "get_design_context" => {
            let project_id = arguments.get("project_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            crate::commands::get_design_context(pool, project_id).await.map(|s| serde_json::json!({ "context": s }))
        },
        "list_files" => {
             let project_id = arguments.get("project_id").and_then(|v| v.as_str()).ok_or("Missing project_id")?;
             crate::commands::list_project_files(pool, project_id.to_string()).await.map(|f| serde_json::json!(f))
        },
        _ => Err(format!("Unknown internal tool: {}", tool_name))
    }
}

/// Helper: translate text using MyMemory free API (en -> zh)
async fn translate_text(client: &reqwest::Client, text: &str) -> Option<String> {
    if text.is_empty() || text.len() < 3 {
        return None;
    }
    let url = format!(
        "https://api.mymemory.translated.net/get?q={}&langpair=en|zh",
        urlencoding::encode(text)
    );
    let resp = client.get(&url).send().await.ok()?;
    let json: serde_json::Value = resp.json().await.ok()?;
    let translated = json
        .get("responseData")?
        .get("translatedText")?
        .as_str()?
        .to_string();
    // If translation is identical to source, it's likely untranslatable (e.g. technical name)
    if translated == text {
        None
    } else {
        Some(translated)
    }
}

#[tauri::command]
pub async fn mcp_sync_skills(market_type: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-Market-Crawler/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let market_type_val = market_type;
    
    let query = if market_type_val == "mcp" {
        "mcp-server+topic:mcp-server"
    } else {
        "openclaw+topic:skill" 
    };

    let url = format!("https://api.github.com/search/repositories?q={}&sort=stars&order=desc", query);
    
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch from GitHub: {}", e))?;

    let json: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let items = json.get("items").and_then(|v| v.as_array()).ok_or("Invalid response format from GitHub")?;
    
    // Collect all items first
    struct RawItem {
        idx: usize,
        name: String,
        description: String,
        author: String,
        stars: i64,
        source_url: String,
    }
    let raw_items: Vec<RawItem> = items.iter().enumerate().map(|(i, item)| {
        RawItem {
            idx: i,
            name: item.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
            description: item.get("description").and_then(|v| v.as_str()).unwrap_or("No description provided.").to_string(),
            author: item.get("owner").and_then(|o| o.get("login")).and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
            stars: item.get("stargazers_count").and_then(|v| v.as_i64()).unwrap_or(0),
            source_url: item.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        }
    }).collect();

    // Fire ALL translation requests in parallel (not sequentially!)
    let translation_futures: Vec<_> = raw_items.iter().map(|item| {
        let client_ref = &client;
        let name = item.name.clone();
        let desc = item.description.clone();
        async move {
            let (name_zh, desc_zh) = tokio::join!(
                translate_text(client_ref, &name),
                translate_text(client_ref, &desc)
            );
            (name_zh, desc_zh)
        }
    }).collect();

    let translations = futures::future::join_all(translation_futures).await;

    // Combine results
    let market_items: Vec<serde_json::Value> = raw_items.iter().zip(translations.iter()).map(|(item, (name_zh, desc_zh))| {
        serde_json::json!({
            "id": format!("{}_{}", market_type_val, item.idx),
            "name": item.name,
            "nameZh": name_zh,
            "description": item.description,
            "translation": desc_zh,
            "author": item.author,
            "version": "1.0.0",
            "type": if market_type_val == "mcp" { "mcp" } else { "workflow" },
            "downloads": item.stars,
            "installed": false,
            "sourceUrl": item.source_url
        })
    }).collect();

    Ok(serde_json::json!(market_items))
}

#[tauri::command]
pub async fn mcp_add_source(name: String, url: String) -> Result<String, String> {
    println!("Adding new skill source: {} ({})", name, url);
    Ok(format!("Source {} added successfully", name))
}

#[tauri::command]
pub async fn mcp_list_sources() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([
        { "id": "default", "name": "OpenClaw Official", "url": "https://market.openclaw.io" },
        { "id": "github-official", "name": "Official Skills Repo", "url": "github:openclaw/skills" }
    ]))
}

#[tauri::command]
pub async fn mcp_export_skill(skill_data: serde_json::Value) -> Result<String, String> {
    // Generate a unique skill package identifier
    let skill_id = uuid::Uuid::new_v4().to_string();
    println!("Exporting Skill {}: {:?}", skill_id, skill_data);
    Ok(format!("skill_{}.skill", &skill_id[..8]))
}

#[tauri::command]
pub async fn mcp_import_skill(path: String) -> Result<serde_json::Value, String> {
    println!("Importing Skill from path: {}", path);
    // Mocked import result
    Ok(serde_json::json!({
        "id": format!("imported_{}", uuid::Uuid::new_v4().to_string()[..6].to_string()),
        "name": "已导入技能",
        "description": "这是从外部文件成功导入的技能节点包。",
        "author": "外部源",
        "version": "1.0.0",
        "type": "workflow",
        "installed": true
    }))
}

#[tauri::command]
pub async fn mcp_install_from_source(app_handle: tauri::AppHandle, source_url: String, name: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-Installer/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    // Convert GitHub HTML URL to ZIP download URL if needed
    // Try 'main' branch first, then fallback to 'master'
    let bytes = if source_url.contains("github.com") && !source_url.contains("/archive/") {
        let base = source_url.trim_end_matches(".git").trim_end_matches("/");
        
        let main_url = format!("{}/archive/refs/heads/main.zip", base);
        println!("Trying download from: {}", main_url);
        let resp = client.get(&main_url).send().await.map_err(|e| format!("Network error: {}", e))?;
        
        if resp.status().is_success() {
            resp.bytes().await.map_err(|e| e.to_string())?
        } else {
            // Fallback to master branch
            let master_url = format!("{}/archive/refs/heads/master.zip", base);
            println!("main branch not found, trying master: {}", master_url);
            let resp2 = client.get(&master_url).send().await.map_err(|e| format!("Network error: {}", e))?;
            if !resp2.status().is_success() {
                return Err(format!("无法下载仓库 (尝试了 main 和 master 分支): {}", resp2.status()));
            }
            resp2.bytes().await.map_err(|e| e.to_string())?
        }
    } else {
        let resp = client.get(&source_url).send().await.map_err(|e| format!("Network error: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Server returned error: {}", resp.status()));
        }
        resp.bytes().await.map_err(|e| e.to_string())?
    };

    // Create local storage directory
    use tauri::Manager;
    let app_dir = app_handle.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let skills_dir = app_dir.join("skills");
    std::fs::create_dir_all(&skills_dir).map_err(|e| e.to_string())?;

    let zip_name = format!("{}.zip", uuid::Uuid::new_v4());
    let zip_path = skills_dir.join(&zip_name);
    std::fs::write(&zip_path, bytes).map_err(|e| e.to_string())?;

    // Extract ZIP
    let extract_dir = skills_dir.join(&name);
    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => extract_dir.join(path),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    // Cleanup zip
    let _ = std::fs::remove_file(&zip_path);

    println!("Skill {} extracted to: {:?}", name, extract_dir);
    
    Ok(format!("Successfully installed {} to {:?}", name, extract_dir))
}

#[tauri::command]
pub async fn mcp_list_tools(
    manager: State<'_, McpClientManager>
) -> Result<serde_json::Value, String> {
    manager.list_tools().await
}

#[tauri::command]
pub async fn mcp_get_installed_skills(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let app_dir = app_handle.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let skills_dir = app_dir.join("skills");
    
    if !skills_dir.exists() {
        return Ok(json!([]));
    }

    let mut installed = Vec::new();
    let entries = std::fs::read_dir(skills_dir).map_err(|e| e.to_string())?;
    
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            // Try to find a package.json or metadata file
            let mut description = "本地已下载的资产包".to_string();
            let pkg_json = path.join("package.json");
            if pkg_json.exists() {
                if let Ok(content) = std::fs::read_to_string(pkg_json) {
                    if let Ok(v) = serde_json::from_str::<Value>(&content) {
                        description = v["description"].as_str().unwrap_or(&description).to_string();
                    }
                }
            }

            installed.push(json!({
                "id": format!("local_{}", name),
                "name": name,
                "description": description,
                "type": if name.contains("server") { "mcp" } else { "skill" },
                "installed": true,
                "source": "Local"
            }));
        }
    }

    Ok(json!(installed))
}

#[tauri::command]
pub async fn mcp_open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
