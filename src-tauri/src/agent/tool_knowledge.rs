use super::types::*;

// ═══════════════════════════════════════════════
// Tool Knowledge — 每个工具的硬编码知识卡片
// ═══════════════════════════════════════════════
// 唯一核心输出: ToolKnowledge
// 职责: 沉淀工具级知识（适用/不适用/失败案例/替代工具）

/// Get knowledge for a specific tool
pub fn get_knowledge(tool_name: &str) -> Option<ToolKnowledge> {
    match tool_name {
        "web_scrape" => Some(ToolKnowledge {
            name: "web_scrape".into(),
            best_for: vec!["爬取网页内容", "提取新闻标题", "获取天气信息", "搜索结果提取"],
            not_for: vec!["需要登录的页面", "动态加载的SPA页面", "需要JS交互的页面"],
            common_failures: vec!["目标网站反爬", "CSS选择器不匹配", "网络超时"],
            fallback: Some("browser_navigate"),
        }),
        "browser_navigate" => Some(ToolKnowledge {
            name: "browser_navigate".into(),
            best_for: vec!["需要JS渲染的页面", "动态内容加载", "需要浏览器环境的操作"],
            not_for: vec!["简单的静态页面抓取", "API数据获取"],
            common_failures: vec!["页面加载超时", "弹窗阻挡", "CAPTCHA"],
            fallback: None,
        }),
        "excel_read" => Some(ToolKnowledge {
            name: "excel_read".into(),
            best_for: vec!["读取xlsx/xls文件内容", "查看表格结构"],
            not_for: vec!["修改Excel", "大文件(>50MB)"],
            common_failures: vec!["文件路径不存在", "文件格式损坏", "文件被锁定"],
            fallback: Some("file_read"),
        }),
        "excel_write" => Some(ToolKnowledge {
            name: "excel_write".into(),
            best_for: vec!["创建新Excel", "写入数据到表格"],
            not_for: vec!["读取Excel", "复杂图表生成"],
            common_failures: vec!["路径无写入权限", "数据格式不正确"],
            fallback: None,
        }),
        "excel_analyze" => Some(ToolKnowledge {
            name: "excel_analyze".into(),
            best_for: vec!["统计分析", "数据汇总", "字段计数", "数据透视"],
            not_for: vec!["简单读取", "写入操作"],
            common_failures: vec!["分析指令不明确", "列名不存在"],
            fallback: Some("excel_read"),
        }),
        "file_read" => Some(ToolKnowledge {
            name: "file_read".into(),
            best_for: vec!["读取文本文件", "查看配置文件", "读取日志"],
            not_for: vec!["二进制文件", "Excel/Word/PDF"],
            common_failures: vec!["文件不存在", "编码问题", "文件过大"],
            fallback: None,
        }),
        "file_write" => Some(ToolKnowledge {
            name: "file_write".into(),
            best_for: vec!["写入文本文件", "保存结果", "创建配置文件"],
            not_for: vec!["创建Excel/Word格式文档"],
            common_failures: vec!["路径不存在", "无写入权限"],
            fallback: None,
        }),
        "shell_run" => Some(ToolKnowledge {
            name: "shell_run".into(),
            best_for: vec!["执行PowerShell命令", "安装软件包", "系统操作"],
            not_for: vec!["Linux命令", "危险操作(格式化/删除系统文件)"],
            common_failures: vec!["命令语法错误", "权限不足", "程序未安装"],
            fallback: None,
        }),
        "report_generate" => Some(ToolKnowledge {
            name: "report_generate".into(),
            best_for: vec!["生成Word文档", "创建格式化报告"],
            not_for: vec!["简单文本输出", "Excel生成"],
            common_failures: vec!["Python依赖未安装", "代码语法错误"],
            fallback: Some("file_write"),
        }),
        "chart_generate" => Some(ToolKnowledge {
            name: "chart_generate".into(),
            best_for: vec!["生成折线图", "柱状图", "饼图", "数据可视化"],
            not_for: vec!["表格数据输出", "文字报告"],
            common_failures: vec!["matplotlib未安装", "数据格式不匹配"],
            fallback: None,
        }),
        "pdf_read" => Some(ToolKnowledge {
            name: "pdf_read".into(),
            best_for: vec!["读取PDF文本", "提取PDF内容"],
            not_for: vec!["扫描件/图片PDF", "编辑PDF"],
            common_failures: vec!["文件加密", "纯图片PDF无法提取文字"],
            fallback: None,
        }),
        _ => None,
    }
}

/// Get fallback tool suggestion when a tool fails
pub fn get_fallback(tool_name: &str) -> Option<&'static str> {
    match tool_name {
        "web_scrape" => Some("browser_navigate"),
        "browser_navigate" => Some("web_scrape"),
        "excel_read" => Some("file_read"),
        "excel_analyze" => Some("excel_read"),
        "report_generate" => Some("file_write"),
        "word_read" => Some("file_read"),
        _ => None,
    }
}

/// Check if a tool is suitable for a given task description
pub fn is_suitable(tool_name: &str, task: &str) -> bool {
    if let Some(knowledge) = get_knowledge(tool_name) {
        let task_lower = task.to_lowercase();
        // Check if any "not_for" patterns match
        for anti in &knowledge.not_for {
            if task_lower.contains(&anti.to_lowercase()) {
                return false;
            }
        }
        true
    } else {
        true // Unknown tools are assumed suitable
    }
}
