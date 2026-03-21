use super::types::{ToolDef, ToolFunction};
use serde_json::json;

// Built-in Tool Definitions (JSON Schema)

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
        // ═══════════════════════════════════════════════
        // P0 Office Workflow Tools — Phase 1 Restructure
        // ═══════════════════════════════════════════════

        // ── Domain 1: Location & Path Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "desktop_path_get".into(),
                description: "获取当前用户的桌面文件夹绝对路径。无需参数，直接返回如 C:\\Users\\xxx\\Desktop。".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "documents_path_get".into(),
                description: "获取当前用户的「我的文档」文件夹绝对路径。无需参数。".into(),
                parameters: json!({"type": "object", "properties": {}, "required": []}),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "path_exists".into(),
                description: "检查指定路径（文件或目录）是否存在。返回 true/false。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "要检查的路径" }
                    },
                    "required": ["path"]
                }),
            },
        },

        // ── Domain 2: Word Extraction Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_extract_fields".into(),
                description: "从 Word 文档中按关键词或规则提取字段值。例如提取「姓名」「编号」「日期」「金额」等。返回 JSON 键值对。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Word 文件绝对路径" },
                        "fields": { "type": "string", "description": "要提取的字段名，逗号分隔，如 '姓名,编号,日期,金额'" }
                    },
                    "required": ["path", "fields"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_read_tables".into(),
                description: "读取 Word 文档中所有表格的内容。返回每个表格的行列数据。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Word 文件绝对路径" },
                        "table_index": { "type": "integer", "description": "指定读取第几个表格（从0开始），不填则读取全部" }
                    },
                    "required": ["path"]
                }),
            },
        },

        // ── Domain 3: Word Modification Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_replace_text".into(),
                description: "批量替换 Word 文档中的文本。支持多组替换。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Word 文件绝对路径" },
                        "replacements": { "type": "string", "description": "替换规则，格式：'旧文本1→新文本1|||旧文本2→新文本2'，用 ||| 分隔多组" },
                        "output_path": { "type": "string", "description": "输出路径（可选，不填则覆盖原文件）" }
                    },
                    "required": ["path", "replacements"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_fill_template".into(),
                description: "按字段映射填充 Word 模板。模板中用 {{字段名}} 作为占位符，传入键值对自动替换。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "template_path": { "type": "string", "description": "Word 模板文件路径（含 {{占位符}}）" },
                        "output_path": { "type": "string", "description": "输出文件路径" },
                        "fields": { "type": "string", "description": "字段值，格式：'姓名=张三|||编号=A001|||日期=2026-03-18'" }
                    },
                    "required": ["template_path", "output_path", "fields"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "word_create_empty".into(),
                description: "创建一个空白的 Word 文档（.docx）。只需指定保存路径和文件名。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "filename": { "type": "string", "description": "文件名（含 .docx 后缀）" },
                        "save_dir": { "type": "string", "description": "保存目录，如桌面路径" }
                    },
                    "required": ["filename", "save_dir"]
                }),
            },
        },

        // ── Domain 4: Excel Extraction Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_read_headers".into(),
                description: "读取 Excel 文件的第一行表头列名。返回列名列表。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件路径" },
                        "sheet": { "type": "string", "description": "工作表名称（可选，默认第一个）" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_find_cell".into(),
                description: "在 Excel 中查找包含指定值的单元格。返回单元格位置和值。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件路径" },
                        "value": { "type": "string", "description": "要查找的值" },
                        "sheet": { "type": "string", "description": "工作表名称（可选）" }
                    },
                    "required": ["path", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_extract_rows".into(),
                description: "按条件提取 Excel 中的行。可按列值筛选。返回匹配行的数据。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件路径" },
                        "column": { "type": "string", "description": "筛选列名" },
                        "condition": { "type": "string", "description": "条件，如 '=张三' 或 '>100' 或 'contains:北京'" },
                        "sheet": { "type": "string", "description": "工作表名称（可选）" }
                    },
                    "required": ["path", "column", "condition"]
                }),
            },
        },

        // ── Domain 5: Excel Modification Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_write_cell".into(),
                description: "写入 Excel 指定单元格的值。通过行列坐标定位。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件路径" },
                        "cell": { "type": "string", "description": "单元格坐标，如 'A1' 或 'B3'" },
                        "value": { "type": "string", "description": "要写入的值" },
                        "sheet": { "type": "string", "description": "工作表名称（可选）" }
                    },
                    "required": ["path", "cell", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_update_rows".into(),
                description: "按条件批量更新 Excel 中的行。匹配指定列的值后，更新目标列。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excel 文件路径" },
                        "match_column": { "type": "string", "description": "匹配列名" },
                        "match_value": { "type": "string", "description": "匹配值" },
                        "update_column": { "type": "string", "description": "要更新的列名" },
                        "new_value": { "type": "string", "description": "新值" },
                        "sheet": { "type": "string", "description": "工作表名称（可选）" }
                    },
                    "required": ["path", "match_column", "match_value", "update_column", "new_value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "excel_replace_by_key".into(),
                description: "按主键列匹配后，批量替换目标列的值。适合 Excel ↔ Excel 数据同步。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "目标 Excel 文件路径" },
                        "key_column": { "type": "string", "description": "主键列名（用于匹配行）" },
                        "updates": { "type": "string", "description": "更新数据，格式：'主键值1:列名=新值|||主键值2:列名=新值'" },
                        "sheet": { "type": "string", "description": "工作表名称（可选）" }
                    },
                    "required": ["path", "key_column", "updates"]
                }),
            },
        },

        // ── Domain 6: Intermediate Data Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "vars_set".into(),
                description: "在当前 Agent 会话中设置一个变量，供后续步骤使用。变量在整个 Agent 运行期间有效。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "变量名" },
                        "value": { "type": "string", "description": "变量值" }
                    },
                    "required": ["name", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "vars_get".into(),
                description: "获取当前 Agent 会话中之前设置的变量值。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "变量名" }
                    },
                    "required": ["name"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "record_build".into(),
                description: "从键值对构造一条结构化记录（JSON 对象）。用于将提取结果标准化。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "fields": { "type": "string", "description": "键值对，格式：'姓名=张三|||编号=A001|||日期=2026-03-18'" }
                    },
                    "required": ["fields"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "record_map_fields".into(),
                description: "对结构化记录进行字段名映射转换。将源字段名映射为目标字段名。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "record": { "type": "string", "description": "JSON 格式的源记录" },
                        "mapping": { "type": "string", "description": "映射规则，格式：'源字段1→目标字段1|||源字段2→目标字段2'" }
                    },
                    "required": ["record", "mapping"]
                }),
            },
        },

        // ── Domain 7: Browser Form-Filling Tools ──
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_fill_input".into(),
                description: "在网页中填写输入框。通过 CSS 选择器定位元素并填入文本。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "网页 URL（如果当前没有打开页面）" },
                        "selector": { "type": "string", "description": "CSS 选择器，如 '#name' 或 'input[name=phone]'" },
                        "value": { "type": "string", "description": "要填入的值" }
                    },
                    "required": ["selector", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_select_option".into(),
                description: "在网页中选择下拉框选项。通过 CSS 选择器定位 select 元素并选择指定选项。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "网页 URL（可选）" },
                        "selector": { "type": "string", "description": "CSS 选择器，如 '#city' 或 'select[name=province]'" },
                        "value": { "type": "string", "description": "要选择的选项值或文本" }
                    },
                    "required": ["selector", "value"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_click".into(),
                description: "点击网页中的按钮或元素。通过 CSS 选择器定位。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "网页 URL（可选）" },
                        "selector": { "type": "string", "description": "CSS 选择器，如 '#submit-btn' 或 'button[type=submit]'" }
                    },
                    "required": ["selector"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_upload_file".into(),
                description: "在网页中上传本地文件。通过 CSS 选择器定位 file input 并上传。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "网页 URL（可选）" },
                        "selector": { "type": "string", "description": "CSS 选择器，如 'input[type=file]'" },
                        "file_path": { "type": "string", "description": "要上传的本地文件绝对路径" }
                    },
                    "required": ["selector", "file_path"]
                }),
            },
        },
        ToolDef {
            tool_type: "function".into(),
            function: ToolFunction {
                name: "browser_submit_form".into(),
                description: "提交网页表单。可指定表单选择器或提交按钮选择器。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "网页 URL（可选）" },
                        "form_selector": { "type": "string", "description": "表单 CSS 选择器，默认 'form'" },
                        "submit_selector": { "type": "string", "description": "提交按钮选择器（可选，指定后点击该按钮而不是直接 submit）" }
                    },
                    "required": []
                }),
            },
        },
    ]
}
