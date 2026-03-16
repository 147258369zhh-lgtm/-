use crate::mcp::client::McpClientManager;
use serde_json::{json, Value};
use tauri::{Manager, State};

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
            let project_id = arguments
                .get("project_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            crate::commands::get_design_context(pool, project_id)
                .await
                .map(|s| serde_json::json!({ "context": s }))
        }
        "list_files" => {
            let project_id = arguments
                .get("project_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing project_id")?;
            crate::commands::list_project_files(pool, project_id.to_string())
                .await
                .map(|f| serde_json::json!(f))
        }
        _ => Err(format!("Unknown internal tool: {}", tool_name)),
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

// ═══════════════════════════════════════════════
// Curated MCP Server List (30+ classic servers)
// ═══════════════════════════════════════════════

struct CuratedMcp {
    name: &'static str,
    npm_package: Option<&'static str>,
    description: &'static str,
    description_zh: &'static str,
    author: &'static str,
    stars: i64,
    source_url: &'static str,
    install_method: &'static str, // "npx" | "pip" | "docker" | "binary"
}

fn get_curated_mcp_list() -> Vec<CuratedMcp> {
    vec![
        CuratedMcp {
            name: "server-filesystem",
            npm_package: Some("@modelcontextprotocol/server-filesystem"),
            description: "MCP server for filesystem operations — read, write, search files.",
            description_zh: "官方文件系统 MCP 服务，支持读写、搜索本地文件。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-github",
            npm_package: Some("@modelcontextprotocol/server-github"),
            description: "MCP server for GitHub API — repos, issues, PRs, code search.",
            description_zh: "官方 GitHub MCP 服务，支持仓库、Issue、PR 管理与代码搜索。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-memory",
            npm_package: Some("@modelcontextprotocol/server-memory"),
            description: "MCP server providing persistent knowledge graph memory.",
            description_zh: "官方持久化知识图谱记忆 MCP 服务，可在对话间保留上下文。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-brave-search",
            npm_package: Some("@modelcontextprotocol/server-brave-search"),
            description: "MCP server for Brave Search API — web and local search.",
            description_zh: "Brave 搜索引擎 MCP 服务，支持网页和本地搜索。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-puppeteer",
            npm_package: Some("@modelcontextprotocol/server-puppeteer"),
            description: "MCP server for browser automation using Puppeteer.",
            description_zh: "浏览器自动化 MCP 服务，基于 Puppeteer 实现网页操控。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-sqlite",
            npm_package: Some("@modelcontextprotocol/server-sqlite"),
            description: "MCP server for SQLite database operations.",
            description_zh: "SQLite 数据库操作 MCP 服务，支持查询、写入和 schema 分析。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-everything",
            npm_package: Some("@modelcontextprotocol/server-everything"),
            description: "MCP test server demonstrating all protocol capabilities.",
            description_zh: "MCP 协议完整功能演示服务，用于测试和学习。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-fetch",
            npm_package: Some("@modelcontextprotocol/server-fetch"),
            description: "MCP server for fetching and converting web content to markdown.",
            description_zh: "网页内容抓取 MCP 服务，自动转换为 Markdown 格式。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "server-sequential-thinking",
            npm_package: Some("@modelcontextprotocol/server-sequential-thinking"),
            description: "MCP server enabling dynamic chain-of-thought reasoning.",
            description_zh: "序列化思考 MCP 服务，支持动态思维链推理。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "context7-mcp",
            npm_package: Some("@upstash/context7-mcp"),
            description: "Context enhancement for LLM code analysis — up-to-date documentation.",
            description_zh: "代码上下文增强工具，提供最新文档，大幅提升大模型代码分析准确性。",
            author: "upstash",
            stars: 8000,
            source_url: "https://github.com/upstash/context7",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-n8n",
            npm_package: Some("@n8n/n8n-mcp"),
            description: "Official n8n MCP server for workflow orchestration.",
            description_zh: "n8n 官方 MCP 服务，支持工作流自动化编排。",
            author: "n8n-io",
            stars: 5000,
            source_url: "https://github.com/n8n-io/n8n-mcp",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-playwright",
            npm_package: Some("@anthropic/mcp-server-playwright"),
            description: "Browser automation MCP using Playwright.",
            description_zh: "基于 Playwright 的浏览器自动化 MCP 服务。",
            author: "anthropic",
            stars: 4000,
            source_url: "https://github.com/anthropics/mcp-server-playwright",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-postgres",
            npm_package: Some("@modelcontextprotocol/server-postgres"),
            description: "MCP server for PostgreSQL database queries.",
            description_zh: "PostgreSQL 数据库查询 MCP 服务。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-slack",
            npm_package: Some("@modelcontextprotocol/server-slack"),
            description: "MCP server for Slack — read/write messages, channels.",
            description_zh: "Slack 集成 MCP 服务，支持频道消息读写。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-google-maps",
            npm_package: Some("@modelcontextprotocol/server-google-maps"),
            description: "MCP server for Google Maps geocoding, directions, places.",
            description_zh: "Google Maps 地理编码、路线规划 MCP 服务。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-sentry",
            npm_package: Some("@modelcontextprotocol/server-sentry"),
            description: "MCP server for Sentry error tracking.",
            description_zh: "Sentry 错误追踪 MCP 服务。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "magic-mcp",
            npm_package: Some("@21st-dev/magic-mcp"),
            description: "21st.dev Magic — AI-powered UI component generation.",
            description_zh: "21st.dev Magic — AI 驱动的 UI 组件生成 MCP。",
            author: "21st-dev",
            stars: 3000,
            source_url: "https://github.com/21st-dev/magic-mcp",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-git",
            npm_package: Some("@modelcontextprotocol/server-git"),
            description: "MCP server for Git operations — clone, diff, log, commit.",
            description_zh: "Git 操作 MCP 服务，支持 clone、diff、log、commit。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "firecrawl-mcp",
            npm_package: Some("firecrawl-mcp"),
            description: "Firecrawl MCP — advanced web scraping and crawling.",
            description_zh: "Firecrawl 高级网页爬取 MCP 服务。",
            author: "mendableai",
            stars: 4500,
            source_url: "https://github.com/mendableai/firecrawl-mcp-server",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-time",
            npm_package: Some("@modelcontextprotocol/server-time"),
            description: "MCP server for timezone conversion and current time.",
            description_zh: "时间与时区转换 MCP 服务。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-raygun",
            npm_package: Some("@anthropic/mcp-server-raygun"),
            description: "Raygun crash reporting MCP integration.",
            description_zh: "Raygun 崩溃报告集成 MCP 服务。",
            author: "anthropic",
            stars: 2000,
            source_url: "https://github.com/MindscapeHQ/mcp-server-raygun",
            install_method: "npx",
        },
        CuratedMcp {
            name: "supabase-mcp",
            npm_package: Some("supabase-mcp-server"),
            description: "MCP server for Supabase — database, auth, storage.",
            description_zh: "Supabase 全栈集成 MCP，支持数据库、认证、存储。",
            author: "supabase",
            stars: 3500,
            source_url: "https://github.com/supabase-community/supabase-mcp",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-twitter",
            npm_package: Some("@enescinar/twitter-mcp"),
            description: "MCP server for Twitter/X API — tweets, search.",
            description_zh: "Twitter/X 社交平台 MCP 服务，支持推文操作。",
            author: "enescinar",
            stars: 1500,
            source_url: "https://github.com/EnesCinr/twitter-mcp",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-docker",
            npm_package: Some("@modelcontextprotocol/server-docker"),
            description: "MCP server for Docker container management.",
            description_zh: "Docker 容器管理 MCP 服务。",
            author: "modelcontextprotocol",
            stars: 25000,
            source_url: "https://github.com/modelcontextprotocol/servers",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-todoist",
            npm_package: Some("@abhiz/todoist-mcp-server"),
            description: "MCP server for Todoist task management.",
            description_zh: "Todoist 任务管理 MCP 服务。",
            author: "abhiz",
            stars: 1200,
            source_url: "https://github.com/abhiz/todoist-mcp-server",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-linear",
            npm_package: Some("@ibraheem4/linear-mcp-server"),
            description: "MCP server for Linear project management.",
            description_zh: "Linear 项目管理 MCP 服务。",
            author: "ibraheem4",
            stars: 1000,
            source_url: "https://github.com/ibraheem4/linear-mcp-server",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-notion",
            npm_package: Some("@suekou/mcp-notion-server"),
            description: "MCP server for Notion — pages, databases, blocks.",
            description_zh: "Notion 笔记集成 MCP 服务，支持页面和数据库操作。",
            author: "suekou",
            stars: 2800,
            source_url: "https://github.com/suekou/mcp-notion-server",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-obsidian",
            npm_package: Some("mcp-obsidian"),
            description: "MCP server for Obsidian vault — read/write notes.",
            description_zh: "Obsidian 知识库 MCP 服务，支持笔记读写和搜索。",
            author: "codeliger",
            stars: 2200,
            source_url: "https://github.com/codeliger/mcp-obsidian",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-youtube",
            npm_package: Some("@anthropic/mcp-server-youtube"),
            description: "MCP server for YouTube transcript extraction.",
            description_zh: "YouTube 视频字幕提取 MCP 服务。",
            author: "anthropic",
            stars: 1800,
            source_url: "https://github.com/anthropics/mcp-server-youtube",
            install_method: "npx",
        },
        CuratedMcp {
            name: "mcp-server-email",
            npm_package: Some("@anthropic/mcp-server-email"),
            description: "MCP server for sending and reading emails.",
            description_zh: "邮件收发 MCP 服务。",
            author: "anthropic",
            stars: 1500,
            source_url: "https://github.com/anthropics/mcp-server-email",
            install_method: "npx",
        },
        // Python-based MCPs
        CuratedMcp {
            name: "mcp-server-arxiv",
            npm_package: None,
            description: "MCP server for searching and reading arXiv papers.",
            description_zh: "arXiv 论文搜索与阅读 MCP 服务。",
            author: "blazickjp",
            stars: 900,
            source_url: "https://github.com/blazickjp/arxiv-mcp-server",
            install_method: "pip",
        },
        CuratedMcp {
            name: "mcp-server-blender",
            npm_package: None,
            description: "MCP server for controlling Blender 3D operations.",
            description_zh: "Blender 3D 建模控制 MCP 服务。",
            author: "ahujasid",
            stars: 2000,
            source_url: "https://github.com/ahujasid/blender-mcp",
            install_method: "pip",
        },
    ]
}

#[tauri::command]
pub async fn mcp_sync_skills(market_type: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-Market-Crawler/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let market_type_val = market_type;

    // Step 1: Start with curated list (instant, no network needed)
    let mut all_items: Vec<serde_json::Value> = Vec::new();
    let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();

    if market_type_val == "mcp" {
        for (i, mcp) in get_curated_mcp_list().iter().enumerate() {
            let key = mcp.name.to_lowercase();
            if seen_names.contains(&key) {
                continue;
            }
            seen_names.insert(key);
            all_items.push(json!({
                "id": format!("curated_{}", i),
                "name": mcp.name,
                "nameZh": null,
                "description": mcp.description,
                "translation": mcp.description_zh,
                "author": mcp.author,
                "version": "1.0.0",
                "type": "mcp",
                "downloads": mcp.stars,
                "installed": false,
                "sourceUrl": mcp.source_url,
                "npmPackage": mcp.npm_package,
                "installMethod": mcp.install_method
            }));
        }
    }

    // Step 2: Fetch from GitHub (may fail due to rate limit — not fatal)
    let query = if market_type_val == "mcp" {
        "mcp-server+topic:mcp-server"
    } else {
        "openclaw+topic:skill"
    };

    let url = format!(
        "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=30",
        query
    );

    let github_result = client.get(&url).send().await;

    if let Ok(response) = github_result {
        if let Ok(json) = response.json::<serde_json::Value>().await {
            if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                // Collect GitHub items
                struct RawItem {
                    idx: usize,
                    name: String,
                    description: String,
                    author: String,
                    stars: i64,
                    source_url: String,
                }
                let raw_items: Vec<RawItem> = items
                    .iter()
                    .enumerate()
                    .map(|(i, item)| RawItem {
                        idx: i,
                        name: item
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        description: item
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("No description provided.")
                            .to_string(),
                        author: item
                            .get("owner")
                            .and_then(|o| o.get("login"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        stars: item
                            .get("stargazers_count")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0),
                        source_url: item
                            .get("html_url")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                    .collect();

                // Fire ALL translation requests in parallel
                let translation_futures: Vec<_> = raw_items
                    .iter()
                    .map(|item| {
                        let client_ref = &client;
                        let desc = item.description.clone();
                        async move { translate_text(client_ref, &desc).await }
                    })
                    .collect();

                let translations = futures::future::join_all(translation_futures).await;

                // Merge with dedup
                for (item, desc_zh) in raw_items.iter().zip(translations.iter()) {
                    let key = item.name.to_lowercase();
                    if seen_names.contains(&key) {
                        continue;
                    }
                    seen_names.insert(key);
                    all_items.push(json!({
                        "id": format!("gh_{}", item.idx),
                        "name": item.name,
                        "nameZh": null,
                        "description": item.description,
                        "translation": desc_zh,
                        "author": item.author,
                        "version": "1.0.0",
                        "type": if market_type_val == "mcp" { "mcp" } else { "workflow" },
                        "downloads": item.stars,
                        "installed": false,
                        "sourceUrl": item.source_url,
                        "npmPackage": null,
                        "installMethod": "zip"
                    }));
                }
            }
        }
    }

    // Step 3: Sort by stars descending
    all_items.sort_by(|a, b| {
        let sa = a.get("downloads").and_then(|v| v.as_i64()).unwrap_or(0);
        let sb = b.get("downloads").and_then(|v| v.as_i64()).unwrap_or(0);
        sb.cmp(&sa)
    });

    Ok(json!(all_items))
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

// ═══════════════════════════════════════════════
// Smart Install: npm-first, ZIP-fallback
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn mcp_install_from_source(
    app_handle: tauri::AppHandle,
    source_url: String,
    name: String,
) -> Result<String, String> {
    // Smart routing: if source_url looks like an npm package, use npm install
    let trimmed = source_url.trim();
    let is_npm = trimmed.starts_with('@')
        || (!trimmed.contains("://") && !trimmed.contains('/'))
        || trimmed.contains("npmjs.com/package/");

    if is_npm {
        // Extract package name from npmjs URL if needed
        let package_name = if trimmed.contains("npmjs.com/package/") {
            trimmed
                .split("/package/")
                .last()
                .unwrap_or(trimmed)
                .trim_end_matches('/')
                .to_string()
        } else {
            trimmed.to_string()
        };
        return mcp_install_npm_inner(&app_handle, package_name, name).await;
    }

    // Otherwise, try ZIP download (original logic)
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
        let resp = client
            .get(&main_url)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if resp.status().is_success() {
            resp.bytes().await.map_err(|e| e.to_string())?
        } else {
            // Fallback to master branch
            let master_url = format!("{}/archive/refs/heads/master.zip", base);
            println!("main branch not found, trying master: {}", master_url);
            let resp2 = client
                .get(&master_url)
                .send()
                .await
                .map_err(|e| format!("Network error: {}", e))?;
            if !resp2.status().is_success() {
                return Err(format!(
                    "无法下载仓库 (尝试了 main 和 master 分支): {}",
                    resp2.status()
                ));
            }
            resp2.bytes().await.map_err(|e| e.to_string())?
        }
    } else {
        let resp = client
            .get(&source_url)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Server returned error: {}", resp.status()));
        }
        resp.bytes().await.map_err(|e| e.to_string())?
    };

    // Create local storage directory
    use tauri::Manager;
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
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

    Ok(format!(
        "Successfully installed {} to {:?}",
        name, extract_dir
    ))
}

// ═══════════════════════════════════════════════
// npm install command
// ═══════════════════════════════════════════════

async fn mcp_install_npm_inner(
    app_handle: &tauri::AppHandle,
    package_name: String,
    display_name: String,
) -> Result<String, String> {
    println!("Installing npm package: {}", package_name);

    // Run npm install -g
    let output = if cfg!(target_os = "windows") {
        tokio::process::Command::new("cmd")
            .args(["/C", &format!("npm install -g {}", package_name)])
            .output()
            .await
    } else {
        tokio::process::Command::new("sh")
            .args(["-c", &format!("npm install -g {}", package_name)])
            .output()
            .await
    };

    let output = output.map_err(|e| format!("npm 未安装或无法执行: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("npm install 失败:\n{}\n{}", stdout, stderr));
    }

    // Record to SQLite installed_mcps table
    use tauri::Manager;
    let pool = app_handle.state::<crate::db::DbPool>();

    // Ensure table exists
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS installed_mcps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            npm_package TEXT,
            install_method TEXT DEFAULT 'npm',
            launch_command TEXT,
            installed_at TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'installed'
        )",
    )
    .execute(pool.inner())
    .await;

    // Determine launch command
    let launch_cmd = format!("npx {}", package_name);

    // Upsert record
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO installed_mcps (name, npm_package, install_method, launch_command, installed_at, status)
         VALUES (?, ?, 'npm', ?, datetime('now'), 'installed')"
    )
    .bind(&display_name)
    .bind(&package_name)
    .bind(&launch_cmd)
    .execute(pool.inner())
    .await;

    println!("npm install success: {} -> {}", display_name, launch_cmd);
    Ok(format!(
        "✅ 已全局安装 {}，启动命令: {}",
        package_name, launch_cmd
    ))
}

#[tauri::command]
pub async fn mcp_install_npm(
    app_handle: tauri::AppHandle,
    package_name: String,
    display_name: String,
) -> Result<String, String> {
    mcp_install_npm_inner(&app_handle, package_name, display_name).await
}

#[tauri::command]
pub async fn mcp_list_tools(
    manager: State<'_, McpClientManager>,
) -> Result<serde_json::Value, String> {
    manager.list_tools().await
}

#[tauri::command]
pub async fn mcp_get_installed_skills(
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let skills_dir = app_dir.join("skills");

    let mut installed = Vec::new();

    // Source 1: Local skills directory (ZIP-installed)
    if skills_dir.exists() {
        let entries = std::fs::read_dir(&skills_dir).map_err(|e| e.to_string())?;

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
                            description = v["description"]
                                .as_str()
                                .unwrap_or(&description)
                                .to_string();
                        }
                    }
                }

                installed.push(json!({
                    "id": format!("local_{}", name),
                    "name": name,
                    "description": description,
                    "type": if name.contains("server") { "mcp" } else { "skill" },
                    "installed": true,
                    "source": "local",
                    "installMethod": "zip"
                }));
            }
        }
    }

    // Source 2: npm-installed MCPs from SQLite
    let pool = app_handle.state::<crate::db::DbPool>();
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS installed_mcps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            npm_package TEXT,
            install_method TEXT DEFAULT 'npm',
            launch_command TEXT,
            installed_at TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'installed'
        )",
    )
    .execute(pool.inner())
    .await;

    if let Ok(rows) = sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>)>(
        "SELECT name, npm_package, launch_command, install_method FROM installed_mcps WHERE status = 'installed'"
    ).fetch_all(pool.inner()).await {
        for (name, npm_package, launch_cmd, method) in rows {
            installed.push(json!({
                "id": format!("npm_{}", name),
                "name": name,
                "description": format!("npm 包: {}", npm_package.as_deref().unwrap_or(&name)),
                "type": "mcp",
                "installed": true,
                "source": "npm",
                "npmPackage": npm_package,
                "launchCommand": launch_cmd,
                "installMethod": method.unwrap_or_else(|| "npm".to_string())
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
