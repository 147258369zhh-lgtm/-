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
                description: "获取网页内容。访问指定 URL 并返回页面的文本内容。用于获取天气、新闻等网络信息。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "要访问的网页 URL" }
                    },
                    "required": ["url"]
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
                description: "创建 Excel 文件（.xlsx）。传入表头和数据行即可，无需写代码。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "headers": { "type": "string", "description": "列名，用逗号分隔。例如：'姓名,年龄,城市'" },
                        "rows": { "type": "string", "description": "数据行，每行用逗号分隔，行之间用 ||| 分隔。例如：'张三,25,北京|||李四,30,上海'" },
                        "output_path": { "type": "string", "description": "输出 Excel 文件的绝对路径" },
                        "sheet_name": { "type": "string", "description": "工作表名称（默认 Sheet1）" }
                    },
                    "required": ["headers", "output_path"]
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
                description: "创建 Word 文档（.docx）。传入标题和内容即可，无需写代码。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "文档标题" },
                        "content": { "type": "string", "description": "文档正文内容。支持用 \\n 换行分段。" },
                        "output_path": { "type": "string", "description": "输出 Word 文件的绝对路径，如 C:\\Users\\用户名\\Desktop\\report.docx" }
                    },
                    "required": ["title", "content", "output_path"]
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
                description: "创建 PowerPoint 演示文稿（.pptx）。传入标题和每页内容即可。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "演示文稿总标题" },
                        "slides": { "type": "string", "description": "每页内容，用 ||| 分隔。每页格式为：标题::内容。例如：'封面页::公司简介|||市场分析::市场规模达100亿|||总结::谢谢观看'" },
                        "output_path": { "type": "string", "description": "输出 PPT 文件的绝对路径" }
                    },
                    "required": ["title", "slides", "output_path"]
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
        // ── New Communication Design Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_analyze".into(),
                description: "分析 Excel 数据：统计求和、计数、去重、交叉统计、频率分布等。返回分析结果文本。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件的绝对路径" },
                        "analysis": { "type": "string", "description": "分析指令，例如：'统计每列的非空数量和唯一值' 或 '按A列分组统计B列求和'" },
                        "sheet": { "type": "string", "description": "工作表名称（可选）" }
                    },
                    "required": ["path", "analysis"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "csv_to_excel".into(),
                description: "CSV 文件转 Excel 格式，支持指定编码和分隔符。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "input_path": { "type": "string", "description": "CSV 文件路径" },
                        "output_path": { "type": "string", "description": "输出 Excel 文件路径" },
                        "encoding": { "type": "string", "description": "CSV 编码（默认 utf-8-sig）" },
                        "separator": { "type": "string", "description": "分隔符（默认逗号）" }
                    },
                    "required": ["input_path", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "data_merge".into(),
                description: "合并多个 Excel/CSV 文件的数据到一个文件中。支持纵向拼接或按关键列横向合并。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "input_paths": { "type": "string", "description": "输入文件路径列表，用分号(;)分隔" },
                        "output_path": { "type": "string", "description": "输出文件路径" },
                        "merge_type": { "type": "string", "description": "合并方式: concat(纵向拼接) 或 merge(按键合并)，默认 concat" },
                        "merge_key": { "type": "string", "description": "合并键列名（merge 模式必填）" }
                    },
                    "required": ["input_paths", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "text_extract".into(),
                description: "从文本中提取结构化信息（如表格、关键参数、设备清单等）。返回 JSON 格式结果。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "要提取的文本内容" },
                        "extract_type": { "type": "string", "description": "提取目标：table(表格)、params(参数)、list(清单)、custom(自定义)" },
                        "custom_prompt": { "type": "string", "description": "自定义提取指令（extract_type=custom 时使用）" }
                    },
                    "required": ["text", "extract_type"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "report_generate".into(),
                description: "基于数据和模板生成 Word 设计报告文档。支持自动填充表格、插入统计结果。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python 代码（可使用 docx 库），生成 .docx 报告。" },
                        "output_path": { "type": "string", "description": "输出 Word 报告的绝对路径" }
                    },
                    "required": ["code", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "table_transform".into(),
                description: "表格数据转换：行列转置、数据透视、列重命名、格式标准化、数据清洗。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "input_path": { "type": "string", "description": "输入 Excel/CSV 文件路径" },
                        "output_path": { "type": "string", "description": "输出文件路径" },
                        "operations": { "type": "string", "description": "转换操作描述，如 '转置' '按A列数据透视' '删除空行' '列名重命名'" }
                    },
                    "required": ["input_path", "output_path", "operations"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "pdf_read".into(),
                description: "读取 PDF 文件的文本内容。支持多页提取。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "PDF 文件的绝对路径" },
                        "max_pages": { "type": "integer", "description": "最多读取页数（默认20）" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "json_process".into(),
                description: "JSON 数据处理：提取字段、过滤数组、转换结构、验证格式。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "input": { "type": "string", "description": "JSON 字符串或 JSON 文件路径" },
                        "operation": { "type": "string", "description": "操作类型: extract(提取)、filter(过滤)、transform(转换)、validate(验证)、format(格式化)" },
                        "expression": { "type": "string", "description": "操作表达式，如提取: '.data.items[0].name'，过滤: '.items[] | select(.age > 20)'" }
                    },
                    "required": ["input", "operation"]
                }),
            },
        },
        // ── New expanded tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "image_process".into(),
                description: "图片处理：裁剪、缩放、旋转、加水印、格式转换、拼接等。使用 Python Pillow 库。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python 代码，使用 PIL/Pillow 库处理图片。例如：from PIL import Image; img = Image.open('input.png'); img.resize((800,600)).save('output.jpg')" },
                        "output_path": { "type": "string", "description": "输出文件路径" }
                    },
                    "required": ["code"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "chart_generate".into(),
                description: "生成数据图表（折线图、柱状图、饼图、散点图等）。使用 Python matplotlib 库，返回图片文件路径。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python matplotlib 代码。必须包含 plt.savefig(output_path) 保存图片。" },
                        "output_path": { "type": "string", "description": "图表保存路径（如 C:\\Users\\29136\\Desktop\\chart.png）" }
                    },
                    "required": ["code", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "qrcode_generate".into(),
                description: "生成二维码图片。输入文本/URL，输出二维码 PNG 图片。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "content": { "type": "string", "description": "二维码内容（文本或 URL）" },
                        "output_path": { "type": "string", "description": "二维码图片保存路径" },
                        "size": { "type": "integer", "description": "二维码尺寸（默认 300）" }
                    },
                    "required": ["content", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "markdown_convert".into(),
                description: "Markdown 文件转换为 HTML 或其他格式。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "input_path": { "type": "string", "description": "Markdown 文件路径" },
                        "output_path": { "type": "string", "description": "输出文件路径（.html）" },
                        "format": { "type": "string", "description": "目标格式: html（默认）" }
                    },
                    "required": ["input_path", "output_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "web_scrape".into(),
                description: "从网页提取结构化数据。使用 Python requests + BeautifulSoup 爬取指定 URL 的标题、段落、链接、表格等。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "要爬取的网页 URL" },
                        "selector": { "type": "string", "description": "CSS 选择器（可选，如 h1, .article, table）" },
                        "output_path": { "type": "string", "description": "提取结果保存路径（可选，.json 或 .txt）" }
                    },
                    "required": ["url"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "translate_text".into(),
                description: "文本翻译。使用在线翻译 API 将文本翻译为目标语言。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "要翻译的文本" },
                        "target_language": { "type": "string", "description": "目标语言代码（如 en, zh, ja, ko, fr, de）" },
                        "source_language": { "type": "string", "description": "源语言代码（可选，自动检测）" }
                    },
                    "required": ["text", "target_language"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "compress_archive".into(),
                description: "压缩或解压文件。支持 ZIP 格式。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "action": { "type": "string", "description": "操作: compress（压缩）或 extract（解压）" },
                        "source_path": { "type": "string", "description": "源文件/文件夹路径" },
                        "output_path": { "type": "string", "description": "输出文件路径" }
                    },
                    "required": ["action", "source_path", "output_path"]
                }),
            },
        },
        // ── High-level utility tools (Phase 3 fix) ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "date_now".into(),
                description: "获取当前日期和时间。可指定格式。返回格式化后的日期时间字符串。不需要 shell_run，直接调用即可。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "format": { "type": "string", "description": "日期格式，默认 '%Y-%m-%d_%H-%M-%S'。常用：'%Y年%m月%d日'、'%Y-%m-%d %H:%M:%S'、'%Y%m%d'" }
                    },
                    "required": []
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_create".into(),
                description: "创建一个新的 Excel 文件（.xlsx）。只需指定保存路径和文件名，可选添加表头。适合创建空白或带表头的 Excel 文件。不需要写代码。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "filename": { "type": "string", "description": "文件名（含 .xlsx 后缀），如 '2026-03-18_报告.xlsx'" },
                        "save_dir": { "type": "string", "description": "保存目录，如 'C:\\Users\\29136\\Desktop'" },
                        "headers": { "type": "string", "description": "可选表头，逗号分隔，如 '姓名,年龄,城市'" },
                        "sheet_name": { "type": "string", "description": "工作表名称，默认 'Sheet1'" }
                    },
                    "required": ["filename", "save_dir"]
                }),
            },
        },
    ]
}

// ═══════════════════════════════════════════════
// Tool Executor
// ═══════════════════════════════════════════════

/// 统一 Python 脚本执行器 —— 写临时文件再执行，彻底消灭路径转义问题
async fn run_python_script(script: &str) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(format!("agent_tool_{}.py", uuid::Uuid::new_v4().simple()));
    
    tokio::fs::write(&script_path, script)
        .await
        .map_err(|e| format!("写入临时脚本失败: {}", e))?;
    
    let output = tokio::process::Command::new("python")
        .arg(&script_path)
        .output()
        .await
        .map_err(|e| format!("执行 Python 失败（请确保已安装 Python）: {}", e));
    
    // 清理临时文件
    let _ = tokio::fs::remove_file(&script_path).await;
    
    let output = output?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("{}{}", stderr.trim(), if stdout.trim().is_empty() { String::new() } else { format!("\nstdout: {}", stdout.trim()) }))
    }
}


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

    // Global timeout: no tool should run longer than 30 seconds
    let result = match tokio::time::timeout(
        std::time::Duration::from_secs(30),
        execute_tool_inner(tool_name, arguments, pool, app_handle)
    ).await {
        Ok(r) => r,
        Err(_) => Err(format!("工具 {} 执行超时（30秒），已自动终止", tool_name)),
    };

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

            let sheet_clause = if sheet_arg.is_empty() {
                "ws = wb.active".to_string()
            } else {
                format!("ws = wb['{}']", sheet_arg)
            };

            let script = format!(
                r#"import openpyxl, sys
try:
    wb = openpyxl.load_workbook(r'{path}', read_only=True, data_only=True)
    {sheet}
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= {max_rows}:
            break
        rows.append('\t'.join([str(c) if c is not None else '' for c in row]))
    print('\n'.join(rows))
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                path = path, sheet = sheet_clause, max_rows = max_rows
            );

            let result = run_python_script(&script).await?;
            if result.len() > 15000 {
                Ok(format!("{}...\n\n[Excel 内容已截断，共 {} 字符]", &result[..15000], result.len()))
            } else {
                Ok(result)
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

            // Try Playwright first (full browser), fallback to PowerShell
            let pw_script = format!(
                "const {{ chromium }} = require('playwright');\n\
                (async () => {{\n\
                    const browser = await chromium.launch({{ headless: true }});\n\
                    const page = await browser.newPage();\n\
                    try {{\n\
                        await page.goto('{}', {{ waitUntil: 'domcontentloaded', timeout: 20000 }});\n\
                        await page.waitForTimeout(2000);\n\
                        const text = await page.evaluate(() => {{\n\
                            const el = document.querySelector('article') || document.querySelector('main') || document.body;\n\
                            return el ? el.innerText.substring(0, 8000) : document.body.innerText.substring(0, 8000);\n\
                        }});\n\
                        console.log(text);\n\
                    }} catch (e) {{ console.error('ERROR: ' + e.message); process.exit(1); }}\n\
                    finally {{ await browser.close(); }}\n\
                }})();",
                url.replace('\'', "\\'"),
            );

            let pw_result = tokio::process::Command::new("node")
                .args(&["-e", &pw_script])
                .output()
                .await;

            match pw_result {
                Ok(ref output) if output.status.success() => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let text = stdout.trim();
                    if text.is_empty() || text.len() < 20 {
                        Err("Playwright returned empty content".into())
                    } else {
                        Ok(format!("网页内容 ({}):\n{}", url, text))
                    }
                }
                _ => {
                    // Fallback: PowerShell Invoke-WebRequest
                    let ps_script = format!(
                        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                        try {{ $r = Invoke-WebRequest -Uri '{}' -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop; \
                        $body = $r.Content; if ($body.Length -gt 8000) {{ $body.Substring(0, 8000) }} else {{ $body }} }} \
                        catch {{ Write-Error $_.Exception.Message; exit 1 }}",
                        url.replace("'", "''")
                    );
                    let output = tokio::process::Command::new("powershell")
                        .args(&["-NoProfile", "-Command", &ps_script])
                        .output()
                        .await
                        .map_err(|e| format!("网页获取失败: {}", e))?;

                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                        let clean = extract_text_from_html(&stdout);
                        Ok(format!("网页内容 ({}):\n{}", url, clean))
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                        Err(format!("网页获取失败: {}", stderr.trim()))
                    }
                }
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

        // ── High-level utility tools (Phase 3 fix) ──

        "date_now" => {
            let fmt = arguments["format"]
                .as_str()
                .unwrap_or("%Y-%m-%d_%H-%M-%S");
            let now = chrono::Local::now();
            let formatted = now.format(fmt).to_string();
            Ok(formatted)
        }

        "excel_create" => {
            let filename = arguments["filename"]
                .as_str()
                .ok_or("excel_create: missing filename")?;
            let save_dir = arguments["save_dir"]
                .as_str()
                .ok_or("excel_create: missing save_dir")?;
            let headers = arguments["headers"].as_str().unwrap_or("");
            let sheet_name = arguments["sheet_name"].as_str().unwrap_or("Sheet1");
            let full_path = std::path::Path::new(save_dir).join(filename);
            let full_path_str = full_path.to_string_lossy();

            if let Some(parent) = full_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            let script = format!(
                r#"import openpyxl, os
path = r'{path}'
os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
wb = openpyxl.Workbook()
ws = wb.active
ws.title = '{sheet}'
headers = '{headers}'
if headers:
    ws.append([h.strip() for h in headers.split(',')])
wb.save(path)
print(f'Excel 文件已创建: {{path}}')
"#,
                path = full_path_str, sheet = sheet_name, headers = headers
            );
            let result = run_python_script(&script).await?;
            Ok(format!("Excel 文件已创建: {}\n{}", full_path_str, result.trim()))
        }

        // ── Office Document Tools (Python-based, all via run_python_script) ──

        "excel_write" => {
            let output_path = arguments["output_path"]
                .as_str()
                .ok_or("excel_write: missing output_path")?;

            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            let args_json = serde_json::to_string(arguments).map_err(|e| e.to_string())?;
            let args_json_escaped = args_json.replace('\\', "\\\\").replace('\'', "\\'");

            let script = format!(
                r#"import json
import os
import openpyxl

args = json.loads('''{args_json}''')
path = args.get('output_path', '')
sheet_name = args.get('sheet_name', 'Sheet1')
headers_str = args.get('headers', '')
rows_str = args.get('rows', '')

os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
wb = openpyxl.Workbook()
ws = wb.active
ws.title = sheet_name

if headers_str:
    ws.append([h.strip() for h in headers_str.split(',')])

if rows_str:
    for row_line in rows_str.split('|||'):
        row_line = row_line.strip()
        if row_line:
            ws.append([c.strip() for c in row_line.split(',')])

wb.save(path)
print(f'Excel 文件已创建: {{path}}')
"#,
                args_json = args_json_escaped
            );
            let result = run_python_script(&script).await?;
            Ok(format!("Excel 文件已创建: {}\n{}", output_path, result.trim()))
        }

        "word_write" => {
            let output_path = arguments["output_path"]
                .as_str()
                .ok_or("word_write: missing output_path")?;

            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            // Safe JSON injection to avoid Python syntax errors caused by quotes/backslashes
            let args_json = serde_json::to_string(arguments).map_err(|e| e.to_string())?;
            // Escape literal backslashes and quotes for rust format! macro
            let args_json_escaped = args_json.replace('\\', "\\\\").replace('\'', "\\'");

            let script = format!(
                r#"import json
import os
from docx import Document

args = json.loads('''{args_json}''')
path = args.get('output_path', '')
title = args.get('title', '文档')
content = args.get('content', '')

os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
doc = Document()
doc.add_heading(title, level=0)

for para in content.split('\n'):
    para = para.strip()
    if para:
        doc.add_paragraph(para)
doc.save(path)
print(f'Word 文档已创建: {{path}}')
"#,
                args_json = args_json_escaped
            );
            let result = run_python_script(&script).await?;
            Ok(format!("Word 文档已创建: {}\n{}", output_path, result.trim()))
        }

        "ppt_create" => {
            let output_path = arguments["output_path"]
                .as_str()
                .ok_or("ppt_create: missing output_path")?;

            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            
            let args_json = serde_json::to_string(arguments).map_err(|e| e.to_string())?;
            let args_json_escaped = args_json.replace('\\', "\\\\").replace('\'', "\\'");

            let script = format!(
                r#"import json
import os
from pptx import Presentation

args = json.loads('''{args_json}''')
path = args.get('output_path', '')
title = args.get('title', '演示文稿')
slides_data = args.get('slides', '')

os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
prs = Presentation()
title_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_layout)
slide.shapes.title.text = title
if len(slide.placeholders) > 1:
    slide.placeholders[1].text = ''

if slides_data:
    for slide_str in slides_data.split('|||'):
        slide_str = slide_str.strip()
        if not slide_str:
            continue
        parts = slide_str.split('::', 1)
        s_title = parts[0].strip()
        s_body = parts[1].strip() if len(parts) > 1 else ''
        content_layout = prs.slide_layouts[1]
        s = prs.slides.add_slide(content_layout)
        s.shapes.title.text = s_title
        if len(s.placeholders) > 1:
            s.placeholders[1].text = s_body

prs.save(path)
print(f'PPT 已创建: {{path}}')
"#,
                args_json = args_json_escaped
            );
            let result = run_python_script(&script).await?;
            Ok(format!("PPT 已创建: {}\n{}", output_path, result.trim()))
        }

        "word_read" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("word_read: missing path")?;
            let script = format!(
                r#"import docx, sys
try:
    doc = docx.Document(r'{path}')
    lines = []
    for p in doc.paragraphs:
        if p.text.strip():
            lines.append(f'[{{p.style.name}}] {{p.text}}')
    for t in doc.tables:
        lines.append('\n--- 表格 ---')
        for r in t.rows:
            lines.append('\t'.join([c.text.strip() for c in r.cells]))
    o = '\n'.join(lines)
    print(o[:15000] + '\n...(已截断)' if len(o) > 15000 else o)
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                path = path
            );
            run_python_script(&script).await
        }

        "ppt_read" => {
            let path = arguments["path"]
                .as_str()
                .ok_or("ppt_read: missing path")?;
            let script = format!(
                r#"from pptx import Presentation
import sys
try:
    prs = Presentation(r'{path}')
    lines = []
    for i, s in enumerate(prs.slides, 1):
        lines.append(f'\n=== 第 {{i}} 页 ===')
        for sh in s.shapes:
            if hasattr(sh, 'text') and sh.text.strip():
                lines.append(sh.text)
            if sh.has_table:
                for r in sh.table.rows:
                    lines.append('\t'.join([c.text.strip() for c in r.cells]))
    o = '\n'.join(lines)
    print(o[:15000] + '\n...(已截断)' if len(o) > 15000 else o)
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                path = path
            );
            run_python_script(&script).await
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
                r#"import sys, os
inp = r'{inp}'
out = r'{out}'
ie = '{ie}'
oe = '{oe}'
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
try:
    if ie == 'docx' and oe == 'txt':
        import docx
        d = docx.Document(inp)
        open(out, 'w', encoding='utf-8').write('\n'.join([p.text for p in d.paragraphs]))
    elif ie in ('xlsx', 'xls') and oe == 'csv':
        import pandas as pd
        pd.read_excel(inp).to_csv(out, index=False, encoding='utf-8-sig')
    elif ie == 'csv' and oe in ('xlsx', 'xls'):
        import pandas as pd
        pd.read_csv(inp).to_excel(out, index=False)
    elif ie == 'docx' and oe == 'html':
        import docx
        d = docx.Document(inp)
        h = '<html><body>' + ''.join([f'<p>{{p.text}}</p>' for p in d.paragraphs]) + '</body></html>'
        open(out, 'w', encoding='utf-8').write(h)
    elif ie == 'txt' and oe == 'docx':
        import docx
        d = docx.Document()
        for l in open(inp, 'r', encoding='utf-8'):
            d.add_paragraph(l.strip())
        d.save(out)
    else:
        print(f'不支持: {{ie}}->{{oe}}', file=sys.stderr)
        sys.exit(1)
    print(f'转换完成: {{out}}')
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                inp = input_path, out = output_path, ie = in_ext, oe = out_ext
            );
            let result = run_python_script(&script).await?;
            Ok(result.trim().to_string())
        }

        // ── New Communication Design Tools ──

        "excel_analyze" => {
            let path = arguments["path"].as_str().ok_or("excel_analyze: missing path")?;
            let analysis = arguments["analysis"].as_str().ok_or("excel_analyze: missing analysis")?;
            let sheet = arguments["sheet"].as_str().unwrap_or("");
            let sheet_clause = if sheet.is_empty() { "None".to_string() } else { format!("'{}'", sheet) };
            let script = format!(
                r#"import pandas as pd, sys
try:
    df = pd.read_excel(r'{path}', sheet_name={sheet})
    print(f'数据维度: {{df.shape[0]}} 行 x {{df.shape[1]}} 列')
    print(f'\n列名: {{list(df.columns)}}')
    print(f'\n数据类型:\n{{df.dtypes.to_string()}}')
    print(f'\n前5行:\n{{df.head().to_string()}}')
    print(f'\n统计摘要:\n{{df.describe(include="all").to_string()}}')
    print(f'\n非空统计:\n{{df.count().to_string()}}')
    print(f'\n唯一值数:\n{{df.nunique().to_string()}}')
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                path = path, sheet = sheet_clause
            );
            let result = run_python_script(&script).await?;
            if result.len() > 15000 { Ok(format!("{}\n...(已截断)", &result[..15000])) } else { Ok(result) }
        }

        "csv_to_excel" => {
            let input_path = arguments["input_path"].as_str().ok_or("csv_to_excel: missing input_path")?;
            let output_path = arguments["output_path"].as_str().ok_or("csv_to_excel: missing output_path")?;
            let encoding = arguments["encoding"].as_str().unwrap_or("utf-8-sig");
            let sep = arguments["separator"].as_str().unwrap_or(",");
            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let script = format!(
                r#"import pandas as pd, sys, os
try:
    os.makedirs(os.path.dirname(r'{out}') or '.', exist_ok=True)
    df = pd.read_csv(r'{inp}', encoding='{enc}', sep='{sep}')
    df.to_excel(r'{out}', index=False)
    print(f'转换完成: {{df.shape[0]}} 行 x {{df.shape[1]}} 列')
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                inp = input_path, out = output_path, enc = encoding, sep = sep
            );
            let result = run_python_script(&script).await?;
            Ok(format!("文件已转换: {}\n{}", output_path, result.trim()))
        }

        "data_merge" => {
            let input_paths = arguments["input_paths"].as_str().ok_or("data_merge: missing input_paths")?;
            let output_path = arguments["output_path"].as_str().ok_or("data_merge: missing output_path")?;
            let merge_type = arguments["merge_type"].as_str().unwrap_or("concat");
            let _merge_key = arguments["merge_key"].as_str().unwrap_or("");
            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let script = format!(
                r#"import pandas as pd, sys, os
try:
    paths = r'{paths}'
    file_list = [p.strip() for p in paths.split(';') if p.strip()]
    dfs = []
    for f in file_list:
        if f.endswith('.csv'):
            dfs.append(pd.read_csv(f))
        else:
            dfs.append(pd.read_excel(f))
    result = pd.concat(dfs, ignore_index=True)
    out = r'{out}'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    if out.endswith('.csv'):
        result.to_csv(out, index=False, encoding='utf-8-sig')
    else:
        result.to_excel(out, index=False)
    print(f'合并完成: {{len(dfs)}} 个文件 -> {{result.shape[0]}} 行 x {{result.shape[1]}} 列')
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                paths = input_paths, out = output_path
            );
            let result = run_python_script(&script).await?;
            Ok(format!("文件已合并: {}\n{}", output_path, result.trim()))
        }

        "text_extract" => {
            let text = arguments["text"].as_str().ok_or("text_extract: missing text")?;
            let extract_type = arguments["extract_type"].as_str().ok_or("text_extract: missing extract_type")?;
            let custom_prompt = arguments["custom_prompt"].as_str().unwrap_or("");
            let instruction = match extract_type {
                "table" => "请从以下文本中提取表格数据，以JSON数组格式返回，每个元素为一行数据的对象。",
                "params" => "请从以下文本中提取所有参数和数值，以JSON对象格式返回，键为参数名，值为参数值。",
                "list" => "请从以下文本中提取清单/列表项，以JSON数组格式返回。",
                _ => custom_prompt,
            };
            Ok(format!("[text_extract] 提取指令: {}\n\n源文本({} 字符):\n{}\n\n请 Agent 使用 ai_chat 工具处理此提取任务。",
                instruction, text.len(), if text.len() > 2000 { &text[..2000] } else { text }))
        }

        "report_generate" => {
            let code = arguments["code"].as_str().ok_or("report_generate: missing code")?;
            let output_path = arguments["output_path"].as_str().ok_or("report_generate: missing output_path")?;
            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let result = run_python_script(code).await?;
            if tokio::fs::metadata(output_path).await.is_ok() {
                Ok(format!("报告已生成: {}\n{}", output_path, result.trim()))
            } else {
                Ok(format!("Python 执行成功但未检测到报告文件。stdout: {}", result.trim()))
            }
        }

        "table_transform" => {
            let input_path = arguments["input_path"].as_str().ok_or("table_transform: missing input_path")?;
            let output_path = arguments["output_path"].as_str().ok_or("table_transform: missing output_path")?;
            let operations = arguments["operations"].as_str().ok_or("table_transform: missing operations")?;
            if let Some(parent) = std::path::Path::new(output_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let script = format!(
                r#"import pandas as pd, sys, os
try:
    inp = r'{inp}'
    if inp.endswith('.csv'):
        df = pd.read_csv(inp)
    else:
        df = pd.read_excel(inp)
    ops = '{ops}'
    if '转置' in ops:
        df = df.T
        df.columns = df.iloc[0]
        df = df[1:]
    if '删除空行' in ops:
        df = df.dropna(how='all')
    if '删除空列' in ops:
        df = df.dropna(axis=1, how='all')
    if '去重' in ops:
        df = df.drop_duplicates()
    out = r'{out}'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    if out.endswith('.csv'):
        df.to_csv(out, index=False, encoding='utf-8-sig')
    else:
        df.to_excel(out, index=False)
    print(f'转换完成: {{df.shape[0]}} 行 x {{df.shape[1]}} 列 -> {{out}}')
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                inp = input_path, ops = operations, out = output_path
            );
            let result = run_python_script(&script).await?;
            Ok(format!("表格转换完成: {}\n{}", output_path, result.trim()))
        }

        "pdf_read" => {
            let path = arguments["path"].as_str().ok_or("pdf_read: missing path")?;
            let max_pages = arguments["max_pages"].as_u64().unwrap_or(20);
            let script = format!(
                r#"import sys
try:
    import fitz
    doc = fitz.open(r'{path}')
    pages = min(len(doc), {max_pages})
    text = []
    for i in range(pages):
        page = doc[i]
        text.append(f'\n=== 第 {{i+1}} 页 ===\n{{page.get_text()}}')
    result = '\n'.join(text)
    print(result[:20000] + '\n...(已截断)' if len(result) > 20000 else result)
except ImportError:
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(r'{path}')
        pages = min(len(reader.pages), {max_pages})
        text = []
        for i in range(pages):
            text.append(f'\n=== 第 {{i+1}} 页 ===\n{{reader.pages[i].extract_text() or ""}}')
        result = '\n'.join(text)
        print(result[:20000] + '\n...(已截断)' if len(result) > 20000 else result)
    except Exception as e2:
        print(f'ERROR: pip install pymupdf PyPDF2. {{e2}}', file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
                path = path, max_pages = max_pages
            );
            run_python_script(&script).await
        }

        "json_process" => {
            let input = arguments["input"].as_str().ok_or("json_process: missing input")?;
            let operation = arguments["operation"].as_str().ok_or("json_process: missing operation")?;
            let expression = arguments["expression"].as_str().unwrap_or("");
            let json_str = if input.trim().starts_with('{') || input.trim().starts_with('[') {
                input.to_string()
            } else if std::path::Path::new(input).exists() {
                tokio::fs::read_to_string(input).await.map_err(|e| format!("读取文件失败: {}", e))?
            } else {
                input.to_string()
            };
            match operation {
                "validate" => {
                    match serde_json::from_str::<Value>(&json_str) {
                        Ok(v) => Ok(format!("JSON 格式有效, 类型: {}, 大小: {} 字符",
                            if v.is_object() { "Object" } else if v.is_array() { "Array" } else { "Primitive" },
                            json_str.len())),
                        Err(e) => Ok(format!("JSON 格式无效: {}", e)),
                    }
                }
                "format" => {
                    match serde_json::from_str::<Value>(&json_str) {
                        Ok(v) => Ok(serde_json::to_string_pretty(&v).unwrap_or_default()),
                        Err(e) => Err(format!("JSON 解析失败: {}", e)),
                    }
                }
                "extract" => {
                    match serde_json::from_str::<Value>(&json_str) {
                        Ok(v) => {
                            let parts: Vec<&str> = expression.split('.').filter(|s| !s.is_empty()).collect();
                            let mut current = &v;
                            for part in &parts {
                                if let Some(idx) = part.strip_suffix(']').and_then(|s| s.strip_prefix('[')) {
                                    if let Ok(i) = idx.parse::<usize>() {
                                        current = &current[i];
                                    }
                                } else {
                                    current = &current[*part];
                                }
                            }
                            Ok(serde_json::to_string_pretty(current).unwrap_or_else(|_| "null".into()))
                        }
                        Err(e) => Err(format!("JSON 解析失败: {}", e)),
                    }
                }
                _ => Ok(format!("[json_process] 操作: {}, 表达式: {}, 数据: {} 字符", operation, expression, json_str.len())),
            }
        }

        // ── image_process: Python Pillow ──
        "image_process" => {
            let code = arguments["code"].as_str().ok_or("image_process: missing code")?;
            let result = run_python_script(code).await?;
            Ok(format!("图片处理完成\n{}", result.trim()))
        }

        // ── chart_generate: Python matplotlib ──
        "chart_generate" => {
            let code = arguments["code"].as_str().ok_or("chart_generate: missing code")?;
            let output_path = arguments["output_path"].as_str().unwrap_or("chart.png");
            let full_code = format!(
                "import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\n{}\nprint('图表已保存到: {}')",
                code, output_path
            );
            let result = run_python_script(&full_code).await?;
            Ok(format!("图表生成完成: {}\n{}", output_path, result.trim()))
        }

        // ── qrcode_generate ──
        "qrcode_generate" => {
            let content = arguments["content"].as_str().ok_or("qrcode_generate: missing content")?;
            let output_path = arguments["output_path"].as_str().ok_or("qrcode_generate: missing output_path")?;
            let _size = arguments["size"].as_u64().unwrap_or(300);
            let script = format!(
                "import qrcode, os\npath = r'{}'\nos.makedirs(os.path.dirname(path) or '.', exist_ok=True)\nimg = qrcode.make('{}')\nimg.save(path)\nprint('二维码已保存')",
                output_path, content
            );
            let result = run_python_script(&script).await?;
            Ok(format!("二维码已生成: {}\n{}", output_path, result.trim()))
        }

        // ── markdown_convert ──
        "markdown_convert" => {
            let input_path = arguments["input_path"].as_str().ok_or("markdown_convert: missing input_path")?;
            let output_path = arguments["output_path"].as_str().ok_or("markdown_convert: missing output_path")?;
            let script = format!(
                r#"import markdown, os
inp = r'{inp}'
out = r'{out}'
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
with open(inp, 'r', encoding='utf-8') as f:
    md = f.read()
html = markdown.markdown(md, extensions=['tables', 'fenced_code'])
with open(out, 'w', encoding='utf-8') as f:
    f.write('<html><head><meta charset="utf-8"></head><body>' + html + '</body></html>')
print('Markdown 转换完成')
"#,
                inp = input_path, out = output_path
            );
            let result = run_python_script(&script).await?;
            Ok(format!("Markdown 转换完成: {} -> {}\n{}", input_path, output_path, result.trim()))
        }

        // ── web_scrape ──
        "web_scrape" => {
            let url = arguments["url"].as_str().ok_or("web_scrape: missing url")?;
            let selector = arguments["selector"].as_str().unwrap_or("");
            let output_path = arguments["output_path"].as_str();
            let selector_line = if selector.is_empty() {
                "elements = soup.find_all(['h1','h2','h3','p','li'])".to_string()
            } else {
                format!("elements = soup.select('{}')", selector)
            };
            let save_line = match output_path {
                Some(path) => format!(
                    "import json\nwith open(r'{}', 'w', encoding='utf-8') as f:\n    json.dump(results, f, ensure_ascii=False, indent=2)\nprint('已保存数据')",
                    path
                ),
                None => "for r in results[:30]:\n    print(r)".to_string(),
            };
            let script = format!(
                r#"import requests
from bs4 import BeautifulSoup
r = requests.get('{url}', timeout=15, headers={{'User-Agent': 'Mozilla/5.0'}})
r.encoding = r.apparent_encoding
soup = BeautifulSoup(r.text, 'lxml')
{selector}
results = [el.get_text(strip=True) for el in elements if el.get_text(strip=True)]
{save}
"#,
                url = url, selector = selector_line, save = save_line
            );
            let result = run_python_script(&script).await?;
            Ok(format!("网页数据提取完成:\n{}", result.trim()))
        }

        // ── translate_text ──
        "translate_text" => {
            let text = arguments["text"].as_str().ok_or("translate_text: missing text")?;
            let target_lang = arguments["target_language"].as_str().ok_or("translate_text: missing target_language")?;
            let script = format!(
                r#"import urllib.request, urllib.parse, json
text = r'''{text}'''
tl = '{tl}'
encoded = urllib.parse.quote(text)
url = f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={{tl}}&dt=t&q={{encoded}}'
req = urllib.request.Request(url, headers={{'User-Agent': 'Mozilla/5.0'}})
with urllib.request.urlopen(req, timeout=10) as r:
    data = json.loads(r.read())
    result = ''.join([s[0] for s in data[0] if s[0]])
    print(result)
"#,
                text = text, tl = target_lang
            );
            let result = run_python_script(&script).await?;
            Ok(format!("翻译结果 ({}): {}", target_lang, result.trim()))
        }
        // ── compress_archive: PowerShell Compress-Archive / Expand-Archive ──
        "compress_archive" => {
            let action = arguments["action"]
                .as_str()
                .ok_or("compress_archive: missing action")?;
            let source = arguments["source_path"]
                .as_str()
                .ok_or("compress_archive: missing source_path")?;
            let output_path = arguments["output_path"]
                .as_str()
                .ok_or("compress_archive: missing output_path")?;

            let ps_cmd = match action {
                "compress" => format!(
                    "Compress-Archive -Path '{}' -DestinationPath '{}' -Force; Write-Output '压缩完成: {}'",
                    source, output_path, output_path
                ),
                "extract" => format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force; Write-Output '解压完成: {}'",
                    source, output_path, output_path
                ),
                _ => return Err(format!("未知操作: {}，请使用 compress 或 extract", action)),
            };

            let output = tokio::process::Command::new("powershell")
                .args(&["-NoProfile", "-Command", &ps_cmd])
                .output()
                .await
                .map_err(|e| format!("PowerShell 执行失败: {}", e))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(stdout.trim().to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                Err(format!("压缩/解压失败: {}", stderr.trim()))
            }
        }

        _ => {
            // Bridge 2: 尝试作为 MCP 工具调用（动态代理）
            if let Ok(result) = try_mcp_tool_call(
                tool_name, arguments, app_handle
            ).await {
                return Ok(result);
            }
            Err(format!("Unknown tool: {}", tool_name))
        }
    }
}

// ═══════════════════════════════════════════════
// Bridge 1: Dynamic Tool Discovery — MCP + Registry
// ═══════════════════════════════════════════════

/// 获取所有可用工具：内置 + MCP Server 工具 + 注册表插件
pub async fn get_all_available_tools(
    app_handle: &AppHandle,
    pool: &sqlx::SqlitePool,
) -> Vec<ToolDef> {
    let mut tools = get_builtin_tools();
    let mut seen: std::collections::HashSet<String> = tools.iter()
        .map(|t| t.function.name.clone())
        .collect();

    // 1. 从 MCP Server 获取工具
    let mcp_tools = get_mcp_tools(app_handle).await;
    for tool in mcp_tools {
        if !seen.contains(&tool.function.name) {
            seen.insert(tool.function.name.clone());
            tools.push(tool);
        }
    }

    // 2. 从插件注册表获取已启用的工具
    let registry_tools = get_registry_tools(pool).await;
    for tool in registry_tools {
        if !seen.contains(&tool.function.name) {
            seen.insert(tool.function.name.clone());
            tools.push(tool);
        }
    }

    tools
}

/// 从已连接的 MCP Server 获取工具定义
async fn get_mcp_tools(app_handle: &AppHandle) -> Vec<ToolDef> {
    let mut result = Vec::new();

    let mgr: tauri::State<'_, McpClientManager> = app_handle.state::<McpClientManager>();
    match mgr.list_tools().await {
        Ok(tools_val) => {
            if let Some(servers) = tools_val.as_array() {
                for server_entry in servers {
                    let server_name = server_entry.get("server")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");

                    // MCP tools/list response: { result: { tools: [...] } }
                    let tools_array = server_entry.get("info")
                        .and_then(|v| v.get("result"))
                        .and_then(|v| v.get("tools"))
                        .and_then(|v| v.as_array())
                        // 部分 MCP 实现直接返回 { tools: [...] }
                        .or_else(|| server_entry.get("info")
                            .and_then(|v| v.get("tools"))
                            .and_then(|v| v.as_array()));

                    if let Some(tools) = tools_array {
                        for tool in tools {
                            let name = match tool.get("name").and_then(|v| v.as_str()) {
                                Some(n) => n,
                                None => continue,
                            };
                            let description = tool.get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("MCP tool");
                            let parameters = tool.get("inputSchema")
                                .cloned()
                                .unwrap_or(json!({"type": "object", "properties": {}}));

                            // 用 "mcp:{server}:{tool}" 命名，避免与内置工具冲突
                            let qualified_name = format!("mcp:{}:{}", server_name, name);

                            result.push(ToolDef {
                                tool_type: "function".into(),
                                function: ToolFunction {
                                    name: qualified_name,
                                    description: format!("[MCP:{}] {}", server_name, description),
                                    parameters,
                                },
                            });
                        }
                    }
                }
            }
        }
        Err(e) => {
            tracing::warn!("Failed to list MCP tools: {}", e);
        }
    }

    result
}

/// 从插件注册表获取已启用的工具定义
async fn get_registry_tools(pool: &sqlx::SqlitePool) -> Vec<ToolDef> {
    let mut result = Vec::new();

    // 查询 status=enabled 且 component_type 为 mcp 或 skill 的组件
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String)>(
        "SELECT name, component_type, description_zh, COALESCE(npm_package, source_url, '') as source \
         FROM components WHERE status = 'enabled' AND component_type IN ('mcp', 'skill')"
    )
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        for (name, comp_type, desc_zh, _source) in rows {
            let description = desc_zh.unwrap_or_else(|| format!("{} 插件", comp_type));

            // 为每个注册表组件创建一个通用的 invoke 工具定义
            let tool_name = format!("plugin:{}", name.replace(' ', "_").to_lowercase());

            result.push(ToolDef {
                tool_type: "function".into(),
                function: ToolFunction {
                    name: tool_name,
                    description: format!("[{}插件] {}", comp_type.to_uppercase(), description),
                    parameters: json!({
                        "type": "object",
                        "properties": {
                            "action": { "type": "string", "description": "要执行的操作" },
                            "input": { "type": "string", "description": "输入参数" }
                        },
                        "required": ["action"]
                    }),
                },
            });
        }
    }

    result
}

// ═══════════════════════════════════════════════
// Bridge 2: MCP Proxy Execution
// ═══════════════════════════════════════════════

/// 尝试将未知工具调用代理到 MCP Server
/// 工具名格式: "mcp:{server_name}:{tool_name}" 或直接匹配 MCP 工具名
async fn try_mcp_tool_call(
    tool_name: &str,
    arguments: &Value,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let mgr: tauri::State<'_, McpClientManager> = app_handle.state::<McpClientManager>();

    // Case 1: 格式化名称 "mcp:server:tool"
    if tool_name.starts_with("mcp:") {
        let parts: Vec<&str> = tool_name.splitn(3, ':').collect();
        if parts.len() == 3 {
            let server_name = parts[1];
            let mcp_tool = parts[2];

            let result = mgr.call_tool(server_name, mcp_tool, arguments)
                .await
                .map_err(|e| format!("MCP {} 调用失败: {}", tool_name, e))?;

            // 提取 MCP 返回值中的 content 文本
            return Ok(extract_mcp_result(&result));
        }
    }

    // Case 2: 遍历所有 MCP server 找到匹配的工具
    let clients = mgr.clients.lock().await;
    let server_names: Vec<String> = clients.keys().cloned().collect();
    drop(clients);

    for server_name in &server_names {
        // 尝试调用，如果工具不存在 MCP server 会返回错误，继续尝试下一个
        match mgr.call_tool(server_name, tool_name, arguments).await {
            Ok(result) => {
                // 检查是否是 MCP 错误响应
                if result.get("error").is_some() {
                    continue;
                }
                return Ok(extract_mcp_result(&result));
            }
            Err(_) => continue,
        }
    }

    Err(format!("MCP proxy: tool '{}' not found on any connected server", tool_name))
}

/// 从 MCP 响应中提取人类可读的结果文本
fn extract_mcp_result(result: &Value) -> String {
    // MCP 标准响应: { result: { content: [{ type: "text", text: "..." }] } }
    if let Some(content) = result.get("result")
        .and_then(|r| r.get("content"))
        .and_then(|c| c.as_array()) {
        let texts: Vec<&str> = content.iter()
            .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
            .collect();
        if !texts.is_empty() {
            return texts.join("\n");
        }
    }
    // Fallback: 直接 pretty-print JSON
    serde_json::to_string_pretty(result).unwrap_or_else(|_| format!("{:?}", result))
}

/// Extract readable text from HTML content (simple tag stripping)
fn extract_text_from_html(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;

    let lower = html.to_lowercase();
    let chars: Vec<char> = html.chars().collect();
    let lower_chars: Vec<char> = lower.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        // Check for script/style start
        if i + 7 < lower_chars.len() && &lower[i..i+7] == "<script" {
            in_script = true;
        }
        if i + 6 < lower_chars.len() && &lower[i..i+6] == "<style" {
            in_style = true;
        }
        // Check for script/style end
        if i + 9 < lower_chars.len() && &lower[i..i+9] == "</script>" {
            in_script = false;
            i += 9;
            continue;
        }
        if i + 8 < lower_chars.len() && &lower[i..i+8] == "</style>" {
            in_style = false;
            i += 8;
            continue;
        }

        if chars[i] == '<' {
            in_tag = true;
            // Add newline for block tags
            if i + 3 < chars.len() {
                let tag_start = &lower[i..lower.len().min(i+5)];
                if tag_start.starts_with("<br") || tag_start.starts_with("<p") || tag_start.starts_with("<div") || tag_start.starts_with("<h") || tag_start.starts_with("<li") {
                    result.push('\n');
                }
            }
        } else if chars[i] == '>' {
            in_tag = false;
        } else if !in_tag && !in_script && !in_style {
            result.push(chars[i]);
        }
        i += 1;
    }

    // Decode common HTML entities
    let result = result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&nbsp;", " ")
        .replace("&#39;", "'");

    // Collapse whitespace
    let lines: Vec<String> = result.lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect();

    let text = lines.join("\n");
    // Truncate for LLM context
    if text.len() > 6000 {
        format!("{}...\n\n(已截断，共 {} 字符)", &text[..6000], text.len())
    } else {
        text
    }
}
