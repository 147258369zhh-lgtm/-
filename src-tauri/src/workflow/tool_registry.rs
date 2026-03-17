// ═══════════════════════════════════════════════════════
// Tool Registry — Unified Tool Governance
// ═══════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::RwLock;

/// The standard contract for every tool in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolContract {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub category: ToolCategory,
    pub source: ToolSource,
    pub tier: ToolTier,
    /// JSON Schema for input parameters
    pub input_schema: Option<Value>,
    /// JSON Schema for output
    pub output_schema: Option<Value>,
    /// Risk level (1-5, 5 = highest)
    pub risk_level: u8,
    /// Timeout in seconds
    pub timeout_secs: u64,
    /// Success count (tracked at runtime)
    pub success_count: u64,
    /// Failure count
    pub failure_count: u64,
    /// Whether the tool is enabled
    pub enabled: bool,
}

/// Tool categories
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    FileOperation,
    OfficeDocument,
    WebBrowser,
    Network,
    DataProcessing,
    SystemCommand,
    Communication,
    AiModel,
    Custom,
}

/// Where the tool comes from
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolSource {
    /// Built-in to the application
    Builtin,
    /// From MCP server
    Mcp,
    /// User-created skill
    Skill,
    /// External plugin
    Plugin,
}

/// Tool governance tiers
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolTier {
    /// Core tools, always available
    Core,
    /// Reviewed and approved
    Reviewed,
    /// Experimental, use with caution
    Experimental,
    /// Disabled, not available
    Disabled,
}

/// The global tool registry
pub struct ToolRegistry {
    tools: RwLock<HashMap<String, ToolContract>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            tools: RwLock::new(HashMap::new()),
        };
        registry.register_builtin_tools();
        registry
    }

    /// Register all built-in tools from the existing tools.rs
    fn register_builtin_tools(&mut self) {
        let builtin = vec![
            // ── File Operations ──
            ("file_read", "读取文件", "读取本地文件内容", ToolCategory::FileOperation, 1),
            ("file_write", "写入文件", "写入内容到本地文件", ToolCategory::FileOperation, 2),
            ("file_list", "列出文件", "列出目录下的文件", ToolCategory::FileOperation, 1),
            ("file_search", "搜索文件", "在目录中搜索文件", ToolCategory::FileOperation, 1),
            ("file_copy", "复制文件", "复制文件到新位置", ToolCategory::FileOperation, 2),
            ("file_move", "移动文件", "移动文件到新位置", ToolCategory::FileOperation, 3),
            ("file_delete", "删除文件", "删除指定文件", ToolCategory::FileOperation, 4),

            // ── Office Documents ──
            ("excel_read", "读取Excel", "读取Excel表格数据", ToolCategory::OfficeDocument, 1),
            ("excel_write", "写入Excel", "写入数据到Excel表格", ToolCategory::OfficeDocument, 2),
            ("excel_analyze", "分析Excel", "分析Excel表格数据", ToolCategory::OfficeDocument, 1),
            ("word_read", "读取Word", "读取Word文档内容", ToolCategory::OfficeDocument, 1),
            ("word_template", "Word模板", "使用模板生成Word文档", ToolCategory::OfficeDocument, 2),
            ("pdf_read", "读取PDF", "读取PDF文档内容", ToolCategory::OfficeDocument, 1),
            ("csv_read", "读取CSV", "读取CSV文件数据", ToolCategory::OfficeDocument, 1),

            // ── Network ──
            ("http_request", "HTTP请求", "发送HTTP网络请求", ToolCategory::Network, 2),
            ("web_scrape", "网页抓取", "抓取网页内容", ToolCategory::Network, 2),
            ("browser_open", "打开浏览器", "打开系统浏览器", ToolCategory::WebBrowser, 1),

            // ── System ──
            ("shell_execute", "执行命令", "执行系统Shell命令", ToolCategory::SystemCommand, 5),
            ("screenshot", "截图", "捕获屏幕截图", ToolCategory::SystemCommand, 1),
            ("clipboard", "剪贴板", "读写系统剪贴板", ToolCategory::SystemCommand, 2),

            // ── Data Processing ──
            ("json_parse", "JSON解析", "解析JSON数据", ToolCategory::DataProcessing, 1),
            ("text_extract", "文本提取", "从文档中提取关键信息", ToolCategory::DataProcessing, 1),
            ("data_transform", "数据转换", "数据格式转换", ToolCategory::DataProcessing, 1),
        ];

        let mut map = self.tools.write().unwrap();
        for (id, name, desc, category, risk) in builtin {
            map.insert(id.to_string(), ToolContract {
                id: id.to_string(),
                name: id.to_string(),
                display_name: name.to_string(),
                description: desc.to_string(),
                category,
                source: ToolSource::Builtin,
                tier: ToolTier::Core,
                input_schema: None,
                output_schema: None,
                risk_level: risk,
                timeout_secs: 300,
                success_count: 0,
                failure_count: 0,
                enabled: true,
            });
        }
    }

    /// Register a new tool
    pub fn register(&self, contract: ToolContract) {
        let mut map = self.tools.write().unwrap();
        map.insert(contract.id.clone(), contract);
    }

    /// Get a tool by ID
    pub fn get(&self, tool_id: &str) -> Option<ToolContract> {
        let map = self.tools.read().unwrap();
        map.get(tool_id).cloned()
    }

    /// List all tools, optionally filtered
    pub fn list(&self, category: Option<ToolCategory>, tier: Option<ToolTier>) -> Vec<ToolContract> {
        let map = self.tools.read().unwrap();
        map.values()
            .filter(|t| {
                let cat_match = category.as_ref().map_or(true, |c| &t.category == c);
                let tier_match = tier.as_ref().map_or(true, |ti| &t.tier == ti);
                cat_match && tier_match && t.enabled
            })
            .cloned()
            .collect()
    }

    /// Search tools by keyword
    pub fn search(&self, query: &str) -> Vec<ToolContract> {
        let q = query.to_lowercase();
        let map = self.tools.read().unwrap();
        map.values()
            .filter(|t| {
                t.name.to_lowercase().contains(&q)
                    || t.display_name.to_lowercase().contains(&q)
                    || t.description.to_lowercase().contains(&q)
            })
            .cloned()
            .collect()
    }

    /// Record a tool call result (for success rate tracking)
    pub fn record_result(&self, tool_id: &str, success: bool) {
        let mut map = self.tools.write().unwrap();
        if let Some(tool) = map.get_mut(tool_id) {
            if success {
                tool.success_count += 1;
            } else {
                tool.failure_count += 1;
            }
        }
    }

    /// Get success rate for a tool
    pub fn success_rate(&self, tool_id: &str) -> Option<f64> {
        let map = self.tools.read().unwrap();
        map.get(tool_id).map(|t| {
            let total = t.success_count + t.failure_count;
            if total == 0 { 1.0 } else { t.success_count as f64 / total as f64 }
        })
    }

    /// Enable/disable a tool
    pub fn set_enabled(&self, tool_id: &str, enabled: bool) -> bool {
        let mut map = self.tools.write().unwrap();
        if let Some(tool) = map.get_mut(tool_id) {
            tool.enabled = enabled;
            true
        } else {
            false
        }
    }

    /// Change tool tier
    pub fn set_tier(&self, tool_id: &str, tier: ToolTier) -> bool {
        let mut map = self.tools.write().unwrap();
        if let Some(tool) = map.get_mut(tool_id) {
            tool.tier = tier;
            true
        } else {
            false
        }
    }
}
