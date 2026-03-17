// ═══════════════════════════════════════════════════════════
// Plugin Registry — 统一模块化注册表
// 所有工具/MCP/Skill/Agent 的生命周期管理
// 支持: 安装/卸载/启用/禁用/导出/导入/更新
// ═══════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use crate::app_log;

/// 组件类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ComponentType {
    Tool,       // 内置工具（文件/Excel/AI 等）
    Mcp,        // MCP Server
    Skill,      // Skill 定义
    Agent,      // Agent 蓝图
    Composite,  // Agent 综合体
}

/// 组件来源
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ComponentSource {
    Builtin,    // 核心内置（不可真正卸载，只能禁用）
    Local,      // 本地创建
    Network,    // 从网络安装
    Import,     // 从文件导入
}

/// 组件状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ComponentStatus {
    Enabled,
    Disabled,
    Installing,
    Error,
}

/// 组件定义 — 注册表中每个组件的完整信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentEntry {
    pub id: String,
    pub name: String,
    pub name_zh: String,           // 中文名
    pub description: String,
    pub description_zh: String,    // 中文描述
    pub component_type: ComponentType,
    pub source: ComponentSource,
    pub status: ComponentStatus,
    pub version: String,
    pub author: String,
    pub category: String,          // 分类: file/office/document/ai/browser/system/mcp/...
    pub icon: String,              // lucide icon name
    pub install_path: Option<String>,   // 安装路径（MCP/Skill 等）
    pub launch_command: Option<String>, // 启动命令（MCP Server）
    pub launch_args: Option<Vec<String>>,
    pub config: HashMap<String, serde_json::Value>, // 自定义配置
    pub created_at: String,
    pub updated_at: String,
    pub source_url: Option<String>,     // 来源 URL
    pub npm_package: Option<String>,    // npm 包名
}

/// 注册表整体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub version: String,
    pub components: Vec<ComponentEntry>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            version: "1.0.0".into(),
            components: get_builtin_components(),
        }
    }
}

// ═══════════════════════════════════════════════════
// 注册表文件 I/O
// ═══════════════════════════════════════════════════

fn get_registry_path() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    exe_dir.join("aihub_registry.json")
}

fn load_registry() -> Registry {
    let path = get_registry_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<Registry>(&content) {
                Ok(mut reg) => {
                    // 确保所有内置组件都存在（新版本可能添加了新的内置工具）
                    let builtins = get_builtin_components();
                    for builtin in &builtins {
                        if !reg.components.iter().any(|c| c.id == builtin.id) {
                            reg.components.push(builtin.clone());
                        }
                    }
                    reg
                }
                Err(_) => Registry::default(),
            },
            Err(_) => Registry::default(),
        }
    } else {
        let reg = Registry::default();
        save_registry(&reg);
        reg
    }
}

fn save_registry(reg: &Registry) {
    let path = get_registry_path();
    if let Ok(json) = serde_json::to_string_pretty(reg) {
        let _ = std::fs::write(path, json);
    }
}

// ═══════════════════════════════════════════════════
// 内置组件定义 — 30+ 个工具模块化
// ═══════════════════════════════════════════════════

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn builtin(id: &str, name: &str, name_zh: &str, desc: &str, desc_zh: &str, cat: &str, icon: &str) -> ComponentEntry {
    ComponentEntry {
        id: id.into(),
        name: name.into(),
        name_zh: name_zh.into(),
        description: desc.into(),
        description_zh: desc_zh.into(),
        component_type: ComponentType::Tool,
        source: ComponentSource::Builtin,
        status: ComponentStatus::Enabled,
        version: "1.0.0".into(),
        author: "OpenClaw".into(),
        category: cat.into(),
        icon: icon.into(),
        install_path: None,
        launch_command: None,
        launch_args: None,
        config: HashMap::new(),
        created_at: now_str(),
        updated_at: now_str(),
        source_url: None,
        npm_package: None,
    }
}

fn get_builtin_components() -> Vec<ComponentEntry> {
    vec![
        // ── 文件操作 ──
        builtin("file_read",    "File Read",      "读取文件",   "Read text file contents",       "读取文本文件的内容",    "file",     "file-text"),
        builtin("file_write",   "File Write",     "写入文件",   "Write or overwrite file",       "写入或覆盖文件内容",    "file",     "file-edit"),
        builtin("file_create",  "File Create",    "创建文件",   "Create new file or directory",   "创建新文件或目录",     "file",     "file-plus"),
        builtin("file_delete",  "File Delete",    "删除文件",   "Delete specified file",          "删除指定文件",        "file",     "file-x"),
        builtin("file_move",    "File Move",      "移动文件",   "Move or rename file",            "移动或重命名文件",     "file",     "file-output"),
        builtin("file_list",    "File List",      "列出目录",   "List directory contents",        "列出目录下所有文件",    "file",     "folder-open"),
        builtin("file_search",  "File Search",    "搜索文件",   "Search keywords in files",       "在文件内容中搜索关键词", "file",     "search"),

        // ── Office 表格 ──
        builtin("excel_read",    "Excel Read",     "Excel 读取",  "Read Excel spreadsheet data",    "读取 Excel 表格数据",       "office",   "table"),
        builtin("excel_write",   "Excel Write",    "Excel 写入",  "Create or write Excel file",     "创建或写入 Excel 文件",     "office",   "table-2"),
        builtin("excel_analyze", "Excel Analyze",  "Excel 分析",  "Statistical analysis of Excel",   "统计分析 Excel 数据",       "office",   "bar-chart-3"),
        builtin("csv_to_excel",  "CSV to Excel",   "CSV 转 Excel","Convert CSV to Excel format",     "CSV 文件转 Excel 格式",     "office",   "file-spreadsheet"),
        builtin("data_merge",    "Data Merge",     "数据合并",    "Merge multiple Excel/CSV files",  "合并多个 Excel/CSV 文件",   "office",   "git-merge"),
        builtin("table_transform","Table Transform","表格转换",   "Transpose/pivot/clean tables",    "行列转置/透视/清洗",        "office",   "table-properties"),

        // ── 文档处理 ──
        builtin("word_read",    "Word Read",       "Word 读取",   "Read Word document content",      "读取 Word 文档内容",        "document", "file-text"),
        builtin("word_write",   "Word Write",      "Word 写入",   "Create or edit Word document",    "创建或修改 Word 文档",      "document", "file-pen"),
        builtin("ppt_read",     "PPT Read",        "PPT 读取",    "Read PowerPoint content",         "读取 PowerPoint 内容",      "document", "presentation"),
        builtin("ppt_create",   "PPT Create",      "PPT 创建",    "Create PowerPoint presentation",  "创建 PowerPoint 演示",      "document", "layout"),
        builtin("pdf_read",     "PDF Read",        "PDF 读取",    "Read PDF file text",              "读取 PDF 文件文本",         "document", "file-text"),
        builtin("doc_convert",  "Doc Convert",     "格式转换",    "Word/CSV/HTML format conversion", "Word/CSV/HTML 格式互转",     "document", "repeat"),
        builtin("image_process","Image Process",   "图片处理",    "Crop/resize/watermark/stitch",    "裁剪/缩放/水印/拼接",       "document", "image"),
        builtin("report_generate","Report Generate","生成报告",   "Data-driven Word report",         "数据驱动生成 Word 报告",     "document", "file-bar-chart"),

        // ── AI 能力 ──
        builtin("ai_chat",      "AI Chat",         "AI 对话",    "Call LLM for conversation",       "调用大模型进行对话",         "ai",       "message-square"),
        builtin("rag_query",    "RAG Query",       "知识检索",   "Semantic search in documents",    "在文档中语义检索",          "ai",       "book-open"),
        builtin("text_extract", "Text Extract",    "文本提取",   "AI-powered structured extraction","AI 提取结构化信息",         "ai",       "scan-text"),

        // ── 浏览器自动化 ──
        builtin("browser_navigate","Browser Navigate","打开网页", "Open URL and screenshot",         "打开 URL 并截图",           "browser",  "globe"),
        builtin("browser_script","Browser Script",  "浏览器脚本", "Playwright automation script",    "Playwright 自动化脚本",     "browser",  "code"),

        // ── 系统工具 ──
        builtin("shell_run",    "Shell Run",       "执行命令",   "Execute local shell command",     "在本地执行 shell 命令",     "system",   "terminal"),
        builtin("json_process", "JSON Process",    "JSON 处理",  "JSON extract/validate/format",    "JSON 提取/验证/格式化",     "system",   "braces"),

        // ── MCP 调用 ──
        builtin("mcp_list_tools","MCP List Tools", "MCP 列表",   "List connected MCP tools",        "列出已连接 MCP 的所有工具", "mcp",      "list"),
        builtin("mcp_call_tool","MCP Call Tool",   "MCP 调用",   "Call tool on MCP Server",         "调用 MCP Server 上的工具",  "mcp",      "zap"),

        // ── 项目管理 ──
        builtin("project_list",   "Project List",   "项目列表",   "List all projects",               "列出所有项目信息",          "project",  "folder-kanban"),
        builtin("project_files",  "Project Files",  "项目文件",   "List project files",              "列出指定项目的文件",         "project",  "files"),
        builtin("project_context","Project Context", "项目上下文", "Get project design context",      "获取项目设计上下文",         "project",  "layout-dashboard"),

        // ── 模板 ──
        builtin("template_list",  "Template List",   "模板列表",  "List all design templates",       "列出所有设计模板",          "template", "clipboard"),
        builtin("template_create","Template Create",  "创建模板",  "Create template from file",       "从文件创建新模板",          "template", "clipboard-plus"),

        // ── 自动化 ──
        builtin("automation_list","Automation List",  "方案列表",  "List automation plans",           "列出自动化方案",            "automation","cog"),
        builtin("automation_run", "Automation Run",   "执行方案",  "Run automation plan",             "执行指定的自动化方案",       "automation","play"),
    ]
}

// ═══════════════════════════════════════════════════
// Tauri 命令
// ═══════════════════════════════════════════════════

/// 获取注册表所有组件
#[tauri::command]
pub fn registry_list() -> Vec<ComponentEntry> {
    let reg = load_registry();
    reg.components
}

/// 获取指定类型的组件
#[tauri::command]
pub fn registry_list_by_type(component_type: String) -> Vec<ComponentEntry> {
    let reg = load_registry();
    let ct = match component_type.as_str() {
        "tool" => ComponentType::Tool,
        "mcp" => ComponentType::Mcp,
        "skill" => ComponentType::Skill,
        "agent" => ComponentType::Agent,
        "composite" => ComponentType::Composite,
        _ => return reg.components,
    };
    reg.components.into_iter().filter(|c| c.component_type == ct).collect()
}

/// 启用组件
#[tauri::command]
pub fn registry_enable(id: String) -> Result<String, String> {
    let mut reg = load_registry();
    let idx = reg.components.iter().position(|c| c.id == id);
    match idx {
        Some(i) => {
            reg.components[i].status = ComponentStatus::Enabled;
            reg.components[i].updated_at = now_str();
            let name_zh = reg.components[i].name_zh.clone();
            save_registry(&reg);
            app_log!("REGISTRY", "Enabled component: {}", id);
            Ok(format!("已启用: {}", name_zh))
        }
        None => Err(format!("组件不存在: {}", id)),
    }
}

/// 禁用组件
#[tauri::command]
pub fn registry_disable(id: String) -> Result<String, String> {
    let mut reg = load_registry();
    let idx = reg.components.iter().position(|c| c.id == id);
    match idx {
        Some(i) => {
            reg.components[i].status = ComponentStatus::Disabled;
            reg.components[i].updated_at = now_str();
            let name_zh = reg.components[i].name_zh.clone();
            save_registry(&reg);
            app_log!("REGISTRY", "Disabled component: {}", id);
            Ok(format!("已禁用: {}", name_zh))
        }
        None => Err(format!("组件不存在: {}", id)),
    }
}

/// 安装新组件（MCP/Skill/Agent）
#[tauri::command]
pub fn registry_install(entry_json: String) -> Result<String, String> {
    let entry: ComponentEntry = serde_json::from_str(&entry_json)
        .map_err(|e| format!("解析组件数据失败: {}", e))?;
    
    let mut reg = load_registry();
    
    // 检查是否已存在
    if reg.components.iter().any(|c| c.id == entry.id) {
        return Err(format!("组件已存在: {}", entry.id));
    }
    
    app_log!("REGISTRY", "Installing component: {} ({})", entry.name, entry.id);
    reg.components.push(entry);
    save_registry(&reg);
    Ok("安装成功".into())
}

/// 卸载组件
#[tauri::command]
pub fn registry_uninstall(id: String) -> Result<String, String> {
    let mut reg = load_registry();
    
    // 先查找并提取信息
    let entry_info = reg.components.iter()
        .find(|c| c.id == id)
        .map(|c| (c.source.clone(), c.install_path.clone()));
    
    match entry_info {
        Some((source, install_path)) => {
            // 内置组件不能卸载，只能禁用
            if source == ComponentSource::Builtin {
                return Err("内置组件不能卸载，请使用禁用功能".into());
            }
            
            // 如果有安装路径，清理文件
            if let Some(ref path) = install_path {
                let p = PathBuf::from(path);
                if p.exists() {
                    let _ = std::fs::remove_dir_all(&p);
                    app_log!("REGISTRY", "Cleaned install path: {}", path);
                }
            }
        }
        None => {
            return Err(format!("组件不存在: {}", id));
        }
    }
    
    reg.components.retain(|c| c.id != id);
    save_registry(&reg);
    app_log!("REGISTRY", "Uninstalled component: {}", id);
    Ok("卸载成功".into())
}

/// 导出组件为 JSON
#[tauri::command]
pub fn registry_export(id: String) -> Result<String, String> {
    let reg = load_registry();
    if let Some(entry) = reg.components.iter().find(|c| c.id == id) {
        serde_json::to_string_pretty(entry)
            .map_err(|e| format!("导出失败: {}", e))
    } else {
        Err(format!("组件不存在: {}", id))
    }
}

/// 导出所有组件
#[tauri::command]
pub fn registry_export_all() -> Result<String, String> {
    let reg = load_registry();
    serde_json::to_string_pretty(&reg)
        .map_err(|e| format!("导出失败: {}", e))
}

/// 从 JSON 导入组件
#[tauri::command]
pub fn registry_import(json_str: String) -> Result<String, String> {
    let entry: ComponentEntry = serde_json::from_str(&json_str)
        .map_err(|e| format!("解析导入数据失败: {}", e))?;
    
    let mut reg = load_registry();
    
    // 如果已存在，更新；否则新增
    if let Some(existing) = reg.components.iter_mut().find(|c| c.id == entry.id) {
        *existing = entry.clone();
        existing.updated_at = now_str();
        app_log!("REGISTRY", "Updated component via import: {}", entry.id);
    } else {
        reg.components.push(entry.clone());
        app_log!("REGISTRY", "Imported new component: {}", entry.id);
    }
    
    save_registry(&reg);
    Ok(format!("导入成功: {}", entry.name_zh))
}

/// 更新组件
#[tauri::command]
pub fn registry_update(id: String, update_json: String) -> Result<String, String> {
    let updates: serde_json::Value = serde_json::from_str(&update_json)
        .map_err(|e| format!("解析更新数据失败: {}", e))?;
    
    let mut reg = load_registry();
    if let Some(entry) = reg.components.iter_mut().find(|c| c.id == id) {
        // 允许更新有限的字段
        if let Some(name) = updates["name"].as_str() { entry.name = name.into(); }
        if let Some(name_zh) = updates["name_zh"].as_str() { entry.name_zh = name_zh.into(); }
        if let Some(desc) = updates["description"].as_str() { entry.description = desc.into(); }
        if let Some(desc_zh) = updates["description_zh"].as_str() { entry.description_zh = desc_zh.into(); }
        if let Some(ver) = updates["version"].as_str() { entry.version = ver.into(); }
        if let Some(cat) = updates["category"].as_str() { entry.category = cat.into(); }
        entry.updated_at = now_str();
        save_registry(&reg);
        app_log!("REGISTRY", "Updated component: {}", id);
        Ok("更新成功".into())
    } else {
        Err(format!("组件不存在: {}", id))
    }
}

/// 获取已启用工具的 ID 列表（供 Agent 运行时使用）
#[tauri::command]
pub fn registry_get_enabled_tools() -> Vec<String> {
    let reg = load_registry();
    reg.components.iter()
        .filter(|c| c.status == ComponentStatus::Enabled && c.component_type == ComponentType::Tool)
        .map(|c| c.id.clone())
        .collect()
}

/// 从 npm registry 搜索 MCP/Skill 包
#[tauri::command]
pub async fn registry_search_npm(keyword: String) -> Result<Vec<serde_json::Value>, String> {
    let query = if keyword.is_empty() { "mcp-server".to_string() } else { keyword };
    let encoded = query.replace(' ', "+").replace('@', "%40");
    let url = format!(
        "https://registry.npmjs.org/-/v1/search?text={}&size=30",
        encoded
    );
    
    app_log!("REGISTRY", "Searching npm: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-AIHub/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;
    
    let resp = client.get(&url).send().await
        .map_err(|e| format!("网络请求失败: {}", e))?;
    
    if !resp.status().is_success() {
        return Err(format!("npm 搜索失败 (HTTP {})", resp.status()));
    }
    
    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("解析 JSON 失败: {}", e))?;
    
    let objects = body["objects"].as_array()
        .ok_or("npm 返回数据格式异常")?;
    
    let results: Vec<serde_json::Value> = objects.iter().filter_map(|obj| {
        let pkg = &obj["package"];
        let name = pkg["name"].as_str()?;
        let desc = pkg["description"].as_str().unwrap_or("");
        let version = pkg["version"].as_str().unwrap_or("0.0.0");
        let author = pkg["author"]["name"].as_str()
            .or(pkg["publisher"]["username"].as_str())
            .unwrap_or("unknown");
        let links_npm = pkg["links"]["npm"].as_str().unwrap_or("");
        let links_repo = pkg["links"]["repository"].as_str().unwrap_or("");
        
        Some(serde_json::json!({
            "name": name,
            "description": desc,
            "version": version,
            "author": author,
            "npm_url": links_npm,
            "repo_url": links_repo,
            "npm_package": name,
        }))
    }).collect();
    
    app_log!("REGISTRY", "Found {} packages for '{}'", results.len(), query);
    Ok(results)
}

/// 翻译缓存（全局静态）
use std::sync::Mutex;
fn translate_cache() -> &'static Mutex<std::collections::HashMap<String, String>> {
    static CACHE: std::sync::OnceLock<Mutex<std::collections::HashMap<String, String>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

/// 批量翻译英文文本为中文（使用 MyMemory 免费 API，无需 API Key）
#[tauri::command]
pub async fn registry_translate_batch(texts: Vec<String>) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-Translate/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let mut results = Vec::with_capacity(texts.len());
    
    for text in &texts {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            results.push("无描述".to_string());
            continue;
        }
        
        // 检查缓存
        {
            let cache = translate_cache().lock().unwrap();
            if let Some(cached) = cache.get(trimmed) {
                results.push(cached.clone());
                continue;
            }
        }
        
        // 调用 MyMemory 免费翻译 API
        let encoded = trimmed.replace(' ', "+");
        let url = format!(
            "https://api.mymemory.translated.net/get?q={}&langpair=en|zh-CN",
            encoded
        );
        
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    let translated = body["responseData"]["translatedText"]
                        .as_str()
                        .unwrap_or(trimmed)
                        .to_string();
                    
                    // 存入缓存
                    {
                        let mut cache = translate_cache().lock().unwrap();
                        cache.insert(trimmed.to_string(), translated.clone());
                    }
                    results.push(translated);
                } else {
                    results.push(trimmed.to_string());
                }
            }
            _ => {
                results.push(trimmed.to_string());
            }
        }
    }
    
    app_log!("REGISTRY", "Translated {} texts", results.len());
    Ok(results)
}
