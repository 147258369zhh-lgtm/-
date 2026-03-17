use super::types::{AgentContext, PlanStep};

// ═══════════════════════════════════════════════
// Unified Prompt Construction v2.0 — Intelligence Upgrade
// ═══════════════════════════════════════════════

/// Build system prompt for the planner (goal → structured plan)
/// v2: Chain-of-thought + few-shot examples + tool_hint per step
pub fn build_planner_prompt(goal: &str, tool_descriptions: &str) -> String {
    format!(
        r#"你是一个高级任务规划引擎。你的职责是将用户目标拆解为可执行的步骤计划。

## 思考流程（按顺序执行）
1. **分析目标**：理解用户真正需要什么
2. **评估工具**：查看可用工具列表，选择最匹配的工具
3. **设计步骤**：用 2-6 步完成，每步必须明确指定要使用的工具
4. **数据流设计**：确保步骤间的数据传递清晰（上一步的输出是下一步的输入）

## ⚠️ 工具选择指南（必须严格遵守）

### 网络信息获取（优先级从高到低）
| 场景 | 使用工具 | 说明 |
|------|---------|------|
| 爬取网页的标题/段落/链接/表格 | **web_scrape** | 提取结构化数据，支持 CSS 选择器 |
| 需要浏览器渲染的动态网页 | browser_navigate | 使用 Playwright 渲染后获取文本 |
| **搜索新闻、查天气、获取网页信息** | **web_scrape** | ⭐ 首选！速度快、结果结构化 |

### 文件操作
| 场景 | 使用工具 |
|------|---------|
| 读/写文本文件 | file_read / file_write |
| 列出文件夹内容 | file_list |
| 创建/删除/移动文件 | file_create / file_delete / file_move |
| 搜索文件内容 | file_search |

### 数据处理
| 场景 | 使用工具 |
|------|---------|
| 读/写 Excel | excel_read / excel_write |
| 分析 Excel 数据 | excel_analyze |
| 读/写 Word | word_read / word_write |
| 读 PDF | pdf_read |
| 读 PPT | ppt_read |
| 合并多个数据文件 | data_merge |
| 生成数据图表（折线/柱状/饼图） | **chart_generate** |
| 生成专业报告 | report_generate |

### 新增工具
| 场景 | 使用工具 |
|------|---------|
| 图片裁剪/缩放/水印/格式转换 | **image_process** |
| 生成二维码 | **qrcode_generate** |
| Markdown 转 HTML | **markdown_convert** |
| 文本翻译 | **translate_text** |
| 压缩/解压 ZIP | **compress_archive** |

### 其他
| 场景 | 使用工具 |
|------|---------|
| 执行系统命令（安装包、编译等） | shell_run（PowerShell 语法） |
| **禁止使用** | ~~ai_chat~~（已禁用） |

## 严格规则
- 每步必须指定 `tool_hint`（要使用的工具名）
- 步骤描述必须具体到操作级别
- 文件路径：使用 Windows 风格绝对路径
- **抓取网页数据优先用 web_scrape，不要用 browser_navigate**

## 可用工具
{tool_descriptions}

## 示例

### 示例 1：Excel 数据处理
目标: "读取项目表格，统计每个项目的预算总和"
```json
{{"steps": [
  {{"id": 1, "task": "使用 excel_read 读取项目表格文件，获取所有数据行和列", "tool_hint": "excel_read"}},
  {{"id": 2, "task": "使用 excel_analyze 对读取的数据按项目分组统计预算总和", "tool_hint": "excel_analyze"}},
  {{"id": 3, "task": "使用 file_write 将统计结果写入总结文件", "tool_hint": "file_write"}}
]}}
```

### 示例 2：网络新闻爬取
目标: "搜索各大门户网站的最新新闻"
```json
{{"steps": [
  {{"id": 1, "task": "使用 web_scrape 爬取新浪新闻首页 https://news.sina.com.cn 提取新闻标题和链接", "tool_hint": "web_scrape"}},
  {{"id": 2, "task": "使用 web_scrape 爬取网易新闻首页 https://news.163.com 提取新闻标题和链接", "tool_hint": "web_scrape"}},
  {{"id": 3, "task": "使用 file_write 将所有新闻整理汇总写入文件", "tool_hint": "file_write"}}
]}}
```

### 示例 3：数据可视化
目标: "读取销售数据并生成图表"
```json
{{"steps": [
  {{"id": 1, "task": "使用 excel_read 读取销售数据表格", "tool_hint": "excel_read"}},
  {{"id": 2, "task": "使用 chart_generate 生成销售趋势折线图并保存为 PNG", "tool_hint": "chart_generate"}}
]}}
```

## 输出格式
只返回 JSON，不要其他文字：
{{"steps": [{{"id": 1, "task": "具体描述", "tool_hint": "tool_name"}}, ...]}}

目标: {goal}"#,
        tool_descriptions = tool_descriptions,
        goal = goal
    )
}

/// v4: 增强版 planner prompt — 注入工具白/黑名单 + DoneSpec
/// 2.3 + 2.1
pub fn build_planner_prompt_v4(
    goal: &str,
    tool_descriptions: &str,
    unavailable_tools: &[(String, String)],  // (tool_name, reason)
    done_spec: Option<&super::types::DoneSpec>,
) -> String {
    let mut prompt = build_planner_prompt(goal, tool_descriptions);

    // 2.3: 注入不可用工具黑名单
    if !unavailable_tools.is_empty() {
        let blacklist = unavailable_tools.iter()
            .map(|(name, reason)| format!("- ❌ `{}`: {}", name, reason))
            .collect::<Vec<_>>()
            .join("\n");
        prompt.push_str(&format!(
            "\n\n## 🚫 不可用工具（严禁使用以下工具）\n{}\n**以上工具已被系统确认不可用，请勿规划使用。**\n",
            blacklist
        ));
    }

    // 2.1: 注入验收标准
    if let Some(spec) = done_spec {
        let mut spec_text = format!(
            "\n## 🎯 验收标准（最终输出必须满足）\n- 交付物类型: {}\n",
            spec.deliverable_type
        );
        if let Some(ref path) = spec.save_path {
            spec_text.push_str(&format!("- 保存路径: {}\n", path));
        }
        if let Some(ref pattern) = spec.filename_pattern {
            spec_text.push_str(&format!("- 文件名规则: {}\n", pattern));
        }
        if !spec.required_content.is_empty() {
            spec_text.push_str(&format!("- 必须包含: {}\n", spec.required_content.join("、")));
        }
        if !spec.success_checks.is_empty() {
            spec_text.push_str(&format!("- 成功条件: {}\n", spec.success_checks.join("；")));
        }
        spec_text.push_str("**最后一步的输出格式和路径必须匹配以上验收标准。**\n");
        prompt.push_str(&spec_text);
    }

    prompt
}

/// Build system prompt for the executor — v3 ReAct format
/// Injects: role, filtered tools, ReAct thinking structure, experience reference
pub fn build_executor_prompt(
    ctx: &AgentContext,
    step: &PlanStep,
    role_name: Option<&str>,
    filtered_tool_names: Option<&[String]>,
    experience_hint: Option<&str>,
) -> String {
    // Build completed steps summary (compressed)
    let completed = ctx
        .completed_steps
        .iter()
        .map(|s| {
            let result_preview = s.result.as_deref().unwrap_or("(无结果)");
            let preview = if result_preview.len() > 200 {
                format!("{}...", &result_preview[..200])
            } else {
                result_preview.to_string()
            };
            format!("  ✅ 步骤 {}: {} → {}", s.id, s.task, preview)
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Extract tool hint
    let tool_hint = extract_tool_hint(&step.task);

    // Build filtered tools section
    let tools_section = if let Some(tools) = filtered_tool_names {
        let list = tools.iter()
            .map(|t| format!("  - `{}`", t))
            .collect::<Vec<_>>()
            .join("\n");
        format!("## 本任务可用工具（只能用以下工具）\n{}", list)
    } else {
        String::new()
    };

    // Role section
    let role_section = match role_name {
        Some(name) => format!("## 你的角色\n你是{}。\n", name),
        None => String::new(),
    };

    // Experience section
    let exp_section = match experience_hint {
        Some(hint) if !hint.is_empty() => {
            format!("\n## 历史经验参考\n{}\n", hint)
        }
        _ => String::new(),
    };

    format!(
        r#"{system_prompt}

{role_section}
{tools_section}
{exp_section}
## 📋 当前执行计划
**目标**: {goal}

### 已完成步骤
{completed}

### ▶ 当前步骤 (第 {step_id} 步)
**任务**: {step_task}
{tool_suggestion}

## ⚠️ 执行规则（必须遵守）

### 思考格式
你必须先在心里思考以下问题，然后直接调用工具：
1. 这一步需要做什么？
2. 为什么选这个工具？
3. 参数应该怎么填？
4. 预期结果是什么？

### 强制要求
- ✅ **必须调用工具** — 不准只返回文字，必须发起 function call
- ✅ **使用 Windows 路径** — 反斜杠 `\`
- ✅ **利用前一步结果** — 如果前一步有文件路径或数据，在本步使用
- ❌ **禁止 ai_chat**
- ❌ **不要描述你打算做什么，直接做**"#,
        system_prompt = ctx.system_prompt,
        role_section = role_section,
        tools_section = tools_section,
        exp_section = exp_section,
        goal = ctx.goal,
        completed = if completed.is_empty() { "  (尚无)".to_string() } else { completed },
        step_id = step.id,
        step_task = step.task,
        tool_suggestion = if let Some(ref hint) = tool_hint {
            format!("**推荐工具**: `{}`", hint)
        } else {
            String::new()
        }
    )
}

/// Extract tool name hint from step task description
/// v3: Prioritizes web_scrape over browser_navigate for web tasks
pub fn extract_tool_hint(task: &str) -> Option<String> {
    // Direct tool name mention
    let tool_names = [
        "web_scrape", "file_read", "file_write", "file_create", "file_delete",
        "file_move", "file_list", "file_search", "excel_read", "excel_write",
        "excel_analyze", "csv_to_excel", "data_merge", "table_transform",
        "word_read", "word_write", "ppt_read", "ppt_create", "pdf_read",
        "doc_convert", "image_process", "report_generate", "browser_navigate",
        "browser_script", "shell_run", "json_process", "chart_generate",
        "qrcode_generate", "markdown_convert", "translate_text",
        "compress_archive",
    ];
    for name in &tool_names {
        if task.contains(name) {
            return Some(name.to_string());
        }
    }

    // Keyword-based inference (priority order matters!)
    let task_lower = task.to_lowercase();

    // Web scraping — PRIORITY over browser_navigate
    if task_lower.contains("爬取") || task_lower.contains("爬虫") || task_lower.contains("提取")
        || task_lower.contains("scrape") || task_lower.contains("抓取数据")
    {
        return Some("web_scrape".into());
    }
    // General web access
    if task_lower.contains("网页") || task_lower.contains("网站") || task_lower.contains("搜索")
        || task_lower.contains("新闻") || task_lower.contains("天气") || task_lower.contains("http")
        || task_lower.contains("url") || task_lower.contains("查询")
    {
        return Some("web_scrape".into());  // Default to web_scrape, not browser_navigate
    }
    // Browser only for dynamic/interactive
    if task_lower.contains("浏览器") || task_lower.contains("动态页面") || task_lower.contains("javascript") {
        return Some("browser_navigate".into());
    }

    // Excel
    if task_lower.contains("excel") || task_lower.contains("表格") || task_lower.contains("xlsx") {
        if task_lower.contains("分析") || task_lower.contains("统计") {
            return Some("excel_analyze".into());
        }
        if task_lower.contains("写入") || task_lower.contains("创建") || task_lower.contains("生成") {
            return Some("excel_write".into());
        }
        return Some("excel_read".into());
    }
    if task_lower.contains("csv") { return Some("csv_to_excel".into()); }
    if task_lower.contains("pdf") { return Some("pdf_read".into()); }

    // Documents
    if task_lower.contains("word") || task_lower.contains("docx") {
        if task_lower.contains("写") || task_lower.contains("生成") || task_lower.contains("报告") {
            return Some("report_generate".into());
        }
        return Some("word_read".into());
    }

    // Charts
    if task_lower.contains("图表") || task_lower.contains("chart") || task_lower.contains("折线")
        || task_lower.contains("柱状") || task_lower.contains("饼图") {
        return Some("chart_generate".into());
    }

    // Translation
    if task_lower.contains("翻译") || task_lower.contains("translate") {
        return Some("translate_text".into());
    }

    // QR code
    if task_lower.contains("二维码") || task_lower.contains("qr") {
        return Some("qrcode_generate".into());
    }

    // Image
    if task_lower.contains("图片") || task_lower.contains("image") || task_lower.contains("缩放")
        || task_lower.contains("裁剪") || task_lower.contains("水印") {
        return Some("image_process".into());
    }

    // Compression
    if task_lower.contains("压缩") || task_lower.contains("解压") || task_lower.contains("zip") {
        return Some("compress_archive".into());
    }

    // Markdown
    if task_lower.contains("markdown") { return Some("markdown_convert".into()); }

    // Shell
    if task_lower.contains("命令") || task_lower.contains("执行") || task_lower.contains("安装")
        || task_lower.contains("shell") || task_lower.contains("pip") || task_lower.contains("npm") {
        return Some("shell_run".into());
    }

    // File operations
    if task_lower.contains("读取") || task_lower.contains("读文件") { return Some("file_read".into()); }
    if task_lower.contains("写入") || task_lower.contains("保存") || task_lower.contains("写文件") { return Some("file_write".into()); }
    if task_lower.contains("列出") || task_lower.contains("目录") { return Some("file_list".into()); }
    if task_lower.contains("合并") { return Some("data_merge".into()); }
    if task_lower.contains("json") { return Some("json_process".into()); }
    if task_lower.contains("报告") || task_lower.contains("报表") { return Some("report_generate".into()); }

    None
}

/// Build reflection prompt when a tool fails
pub fn build_reflection_prompt(goal: &str, step: &PlanStep, error: &str) -> String {
    format!(
        "⚠️ 工具执行失败，请分析原因并提出修复方案。\n\n\
         目标: {}\n\
         当前步骤: {}\n\
         错误信息: {}\n\n\
         请分析：\n\
         1. 失败的原因是什么？\n\
         2. 参数是否正确？\n\
         3. 是否有替代方法？\n\
         4. 是否需要先执行其他步骤？\n\n\
         请调整策略后重试。",
        goal, step.task, error
    )
}

/// Build replan prompt when multiple steps fail
pub fn build_replan_prompt(goal: &str, failed_step: &PlanStep, completed: &[PlanStep]) -> String {
    let done = completed
        .iter()
        .map(|s| format!("  ✅ {}: {}", s.task, s.result.as_deref().unwrap_or("完成")))
        .collect::<Vec<_>>()
        .join("\n");

    // Classify failure type from error message
    let err_msg = failed_step.result.as_deref().unwrap_or("未知错误");
    let error_type = classify_error(err_msg);

    // Extract tool name from failed step
    let failed_tool = extract_tool_hint(&failed_step.task)
        .unwrap_or_else(|| "unknown".into());

    // Build list of tools already tried
    let tried_tools: Vec<String> = completed.iter()
        .filter_map(|s| extract_tool_hint(&s.task))
        .collect();

    format!(
        r#"当前计划部分失败，需要重新规划。

目标: {goal}

已完成步骤:
{done}

## 失败详情（结构化）
- 失败步骤: {failed_task}
- 失败工具: {failed_tool}
- 错误类型: {error_type}
- 错误信息: {err_msg}
- 已尝试工具: [{tried}]

## 约束规则（必须严格遵守）
1. **绝对不要再使用** `{failed_tool}` 执行同样的操作，必须换替代方案
2. 保留已完成的工作成果，不要重复已完成的步骤
3. 只规划新的剩余步骤
4. 每步必须指定 tool_hint
5. 优先选择更简单、更可靠的工具

## 常用替代方案
- shell_run 失败 → 尝试用 python 在 shell_run 中执行
- word_write 失败 → 用 file_write 创建纯文本
- excel_write 失败 → 用 file_write 创建 CSV
- web_scrape 失败 → 用 shell_run + curl
- file_list 失败 → 用 shell_run + dir 命令

用 JSON 格式返回：
{{"steps": [{{"id": 1, "task": "步骤描述", "tool_hint": "tool_name"}}]}}
只返回 JSON。"#,
        goal = goal,
        done = if done.is_empty() { "  (尚无)".to_string() } else { done },
        failed_task = failed_step.task,
        failed_tool = failed_tool,
        error_type = error_type,
        err_msg = err_msg,
        tried = tried_tools.join(", "),
    )
}

/// Classify error type from error message (for structured replan context)
fn classify_error(err_msg: &str) -> &str {
    if err_msg.contains("超时") || err_msg.contains("timeout") {
        "Timeout（执行超时）"
    } else if err_msg.contains("权限") || err_msg.contains("permission") || err_msg.contains("denied") {
        "PermissionDenied（权限不足）"
    } else if err_msg.contains("ModuleNotFoundError") || err_msg.contains("缺少库") || err_msg.contains("import") {
        "DependencyMissing（缺少依赖）"
    } else if err_msg.contains("FileNotFoundError") || err_msg.contains("找不到") || err_msg.contains("not found") {
        "FileNotFound（文件不存在）"
    } else if err_msg.contains("ConnectionError") || err_msg.contains("网络") || err_msg.contains("connect") {
        "NetworkError（网络连接失败）"
    } else if err_msg.contains("SyntaxError") || err_msg.contains("语法") {
        "SyntaxError（代码语法错误）"
    } else {
        "Unknown（未知错误）"
    }
}

/// Build progress check prompt (injected every N rounds)
pub fn build_progress_check(goal: &str, completed: usize, total: usize, round: u32) -> String {
    format!(
        "⏸️ 进度检查 (第 {} 轮):\n\
         目标: {}\n\
         已完成 {} / {} 步。\n\
         如果目标已基本完成，请直接给出最终总结。\n\
         如果遇到困难，请调整策略。",
        round, goal, completed, total
    )
}

/// Build final summary prompt — LLM generates intelligent summary
pub fn build_summary_prompt(goal: &str, completed: &[PlanStep]) -> String {
    let results = completed
        .iter()
        .map(|s| {
            let result_preview = s.result.as_deref().unwrap_or("完成");
            let preview = if result_preview.len() > 500 {
                format!("{}...", &result_preview[..500])
            } else {
                result_preview.to_string()
            };
            format!("步骤 {}: {} → {}", s.id, s.task, preview)
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"所有步骤已完成。请给出最终总结。

## 原始目标
{goal}

## 执行结果
{results}

## 总结要求
1. 用中文，简洁明了
2. 告诉用户任务完成了什么
3. 如果有生成文件，列出文件路径
4. 如果有关键数据/结果，直接展示
5. 不要重复步骤详情，提炼关键信息"#,
        goal = goal,
        results = results
    )
}

/// Inject context files into system prompt
pub async fn inject_context_files(base_prompt: &str, files: &[String]) -> String {
    let mut result = base_prompt.to_string();

    if files.is_empty() {
        return result;
    }

    let mut ctx = String::from("\n\n## 用户提供的文件\n");
    ctx.push_str("以下是用户附带的文件。你必须使用这些真实路径，不要自己编造路径：\n\n");

    for path in files {
        let ext = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let is_binary = matches!(ext.as_str(), "xlsx" | "xls" | "doc" | "docx" | "pdf" | "ppt" | "pptx" | "zip" | "png" | "jpg" | "jpeg");

        if is_binary {
            let tool_hint = match ext.as_str() {
                "xlsx" | "xls" => "→ 使用 `excel_read` 或 `excel_analyze`",
                "doc" | "docx" => "→ 使用 `word_read`",
                "pdf" => "→ 使用 `pdf_read`",
                "ppt" | "pptx" => "→ 使用 `ppt_read`",
                _ => "→ 此文件为二进制格式",
            };
            ctx.push_str(&format!("- 📄 `{}`（{} 文件）{}\n", path, ext.to_uppercase(), tool_hint));
        } else {
            match tokio::fs::read_to_string(path).await {
                Ok(content) => {
                    let truncated = if content.len() > 3000 {
                        format!("{}...\n(已截断，共{}字符)", &content[..3000], content.len())
                    } else {
                        content
                    };
                    ctx.push_str(&format!("- 📄 `{}`\n```\n{}\n```\n\n", path, truncated));
                }
                Err(e) => {
                    ctx.push_str(&format!("- 📄 `{}`（读取失败: {}）\n", path, e));
                }
            }
        }
    }

    result.push_str(&ctx);
    result
}
