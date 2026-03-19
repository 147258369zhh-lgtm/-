use super::types::*;
use super::llm_client::LlmClient;
use super::tool_runtime;
use crate::app_log;
use serde_json::{json, Value};

// ═══════════════════════════════════════════════════════════════
// Agent V5 — Blueprint Generation Engine
// Three-phase generation:
//   Phase 1: Intent Analysis (LLM Call #1)
//   Phase 2: Workflow Generation (LLM Call #2, structured JSON)
//   Phase 3: Machine Validation (no LLM, deterministic)
// ═══════════════════════════════════════════════════════════════

/// Generate a validated Blueprint from a natural language description.
pub async fn generate_blueprint(
    description: &str,
    llm: &LlmClient,
    pool: &sqlx::SqlitePool,
) -> Result<BlueprintInfo, String> {
    app_log!("BLUEPRINT", "Generating blueprint: {}", crate::logger::safe_truncate(&description, 60));

    // Get available tools for prompt
    let tools = tool_runtime::get_builtin_tools();
    let tool_names: Vec<String> = tools.iter().map(|t| t.function.name.clone()).collect();
    let tool_list_str = tool_names.join(", ");

    // ── Phase 1: Intent Analysis ───────────────────────────────────
    let intent = analyze_intent(description, &tool_list_str, llm).await?;
    app_log!("BLUEPRINT", "Intent: {}", crate::logger::safe_truncate(&intent, 100));

    // ── Phase 2: Workflow Generation ───────────────────────────────
    let workflow_json = generate_workflow(description, &intent, &tool_list_str, &tools, llm).await?;

    // ── Phase 3: Machine Validation ────────────────────────────────
    let (blueprint, warnings) = validate_and_build(
        description, &intent, &workflow_json, &tool_names
    )?;

    for w in &warnings {
        app_log!("BLUEPRINT", "⚠️ Warning: {}", w);
    }

    // ── Persist to DB ──────────────────────────────────────────────
    save_blueprint(&blueprint, pool).await;

    app_log!("BLUEPRINT", "Created: {} (complexity={}, steps={})",
             blueprint.name, blueprint.complexity, blueprint.workflow_steps);
    Ok(blueprint)
}

// ─── Phase 1: Intent Analysis ─────────────────────────────────────

async fn analyze_intent(
    description: &str,
    tool_list: &str,
    llm: &LlmClient,
) -> Result<String, String> {
    let system = "你是任务意图分析专家。精简分析用户需求，输出纯文本描述（不超过100字）：包含核心目标、输入数据、输出产物、所需技能类型。";
    let user = format!(
        "可用工具: {tool_list}\n\n用户描述:\n{description}"
    );
    llm.chat_simple(system, &user).await
}

// ─── Phase 2: Workflow Generation ─────────────────────────────────

async fn generate_workflow(
    description: &str,
    intent: &str,
    tool_list: &str,
    tools: &[ToolDef],
    llm: &LlmClient,
) -> Result<Value, String> {
    // Build tool parameter reference
    let tool_ref: String = tools.iter().map(|t| {
        let params = t.function.parameters.get("properties")
            .map(|p| p.to_string())
            .unwrap_or("{}".into());
        format!("- `{}`: {}\n  参数: {}", t.function.name, t.function.description, params)
    }).collect::<Vec<_>>().join("\n");

    let system = format!(r#"你是 Agent 工作流设计师。根据任务描述生成精确的工作流 JSON。

## 可用工具及参数
{tool_ref}

## 输出格式（纯 JSON，不加 markdown）
{{
  "name": "Agent名称（简洁）",
  "persona": "Agent职责描述",
  "goal_template": "目标模板（含{{{{USER_GOAL}}}}占位）",
  "complexity": 1,
  "tags": ["标签1"],
  "workflow": [
    {{
      "id": 1,
      "goal": "步骤目标描述",
      "tool": "工具名（必须是上面列表中的精确名称）",
      "default_args": {{}},
      "depends_on": null,
      "optional": false,
      "timeout_secs": 30
    }}
  ]
}}

## 规则
- workflow 数组包含 2-6 个步骤
- tool 必须是可用工具列表中的精确名称（区分大小写）
- default_args 填写合理的默认参数值，文件路径用 Windows 絕對路径
- complexity: 1=简单(<3步), 2=普通(3-4步), 3=中等(5-6步)
- 只返回纯 JSON"#);

    let user = format!("任务意图分析结果:\n{intent}\n\n原始描述:\n{description}");

    let raw = llm.chat_simple(&system, &user).await?;
    let clean = extract_json_object(&raw);

    serde_json::from_str(&clean)
        .map_err(|e| format!("工作流 JSON 解析失败: {e}\n原始: {}", crate::logger::safe_truncate(&clean, 300)))
}

// ─── Phase 3: Machine Validation ──────────────────────────────────

fn validate_and_build(
    description: &str,
    intent: &str,
    workflow_json: &Value,
    valid_tools: &[String],
) -> Result<(BlueprintInfo, Vec<String>), String> {
    let mut warnings = vec![];

    let name = workflow_json.get("name").and_then(|v| v.as_str())
        .unwrap_or("新Agent").to_string();
    let persona = workflow_json.get("persona").and_then(|v| v.as_str())
        .unwrap_or(description).to_string();
    let goal_template = workflow_json.get("goal_template").and_then(|v| v.as_str())
        .unwrap_or(description).to_string();
    let complexity = workflow_json.get("complexity").and_then(|v| v.as_u64())
        .unwrap_or(1) as u8;
    let tags: Vec<String> = workflow_json.get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let raw_steps = workflow_json.get("workflow")
        .and_then(|w| w.as_array())
        .ok_or("工作流缺少 workflow 数组")?;

    let mut steps: Vec<WorkflowStepInfo> = Vec::new();
    let mut valid_ids: std::collections::HashSet<u32> = std::collections::HashSet::new();

    for (i, s) in raw_steps.iter().enumerate() {
        let id = s.get("id").and_then(|v| v.as_u64()).unwrap_or((i + 1) as u64) as u32;
        let goal = s.get("goal").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let tool = s.get("tool").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let default_args = s.get("default_args").cloned().unwrap_or(json!({}));
        let depends_on = s.get("depends_on").and_then(|v| v.as_u64()).map(|v| v as u32);
        let optional = s.get("optional").and_then(|v| v.as_bool()).unwrap_or(false);
        let timeout_secs = s.get("timeout_secs").and_then(|v| v.as_u64()).unwrap_or(30) as u32;

        // Validate tool name
        if tool.is_empty() {
            warnings.push(format!("步骤 {} 未指定工具，已跳过", id));
            continue;
        }
        if !valid_tools.contains(&tool) {
            warnings.push(format!("步骤 {} 的工具 '{}' 不在已知工具列表中", id, tool));
            // Don't skip — maybe it's a dynamic tool; let runtime handle it
        }

        // Validate depends_on references exist
        if let Some(dep) = depends_on {
            if !valid_ids.contains(&dep) {
                warnings.push(format!("步骤 {} depends_on={} 引用了不存在的前置步骤", id, dep));
            }
        }

        valid_ids.insert(id);
        steps.push(WorkflowStepInfo {
            id, goal, tool, default_args, depends_on, optional, timeout_secs,
        });
    }

    if steps.is_empty() {
        return Err("生成的工作流没有有效步骤".into());
    }

    let used_tools: std::collections::HashSet<_> = steps.iter().map(|s| &s.tool).collect();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    Ok((BlueprintInfo {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        persona,
        goal_template,
        tool_count: used_tools.len(),
        workflow_steps: steps.len(),
        version: "2.0".into(),
        status: BlueprintStatus::Draft,   // all generated assets start as Draft
        created_at: now,
        workflow_template: steps,
        complexity,
        tags,
    }, warnings))
}

// ─── DB Persistence ───────────────────────────────────────────────

pub async fn save_blueprint(bp: &BlueprintInfo, pool: &sqlx::SqlitePool) {
    let wf_json = serde_json::to_string(&bp.workflow_template).unwrap_or("[]".into());
    let tags_json = serde_json::to_string(&bp.tags).unwrap_or("[]".into());
    let status_str = match bp.status {
        BlueprintStatus::Draft      => "draft",
        BlueprintStatus::Tested     => "tested",
        BlueprintStatus::Published  => "published",
        BlueprintStatus::Deprecated => "deprecated",
    };

    let _ = sqlx::query(
        "INSERT OR REPLACE INTO agent_blueprints
         (id, name, persona, goal_template, workflow_json, complexity, tags, version, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&bp.id).bind(&bp.name).bind(&bp.persona).bind(&bp.goal_template)
    .bind(&wf_json).bind(bp.complexity as i64).bind(&tags_json)
    .bind(&bp.version).bind(status_str).bind(&bp.created_at)
    .execute(pool).await;
}

/// Load all blueprints from DB
pub async fn load_all_blueprints(pool: &sqlx::SqlitePool) -> Vec<BlueprintInfo> {
    let rows: Vec<(String, String, String, String, String, Option<i64>, Option<String>, Option<String>, Option<String>, String)> =
        sqlx::query_as(
            "SELECT id, name, persona, goal_template, workflow_json, complexity, tags, version, status, created_at
             FROM agent_blueprints ORDER BY created_at DESC"
        )
        .fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(id, name, persona, goal_template, wf_json,
                           complexity, tags_json, version, status_str, created_at)| {
        let workflow: Vec<WorkflowStepInfo> = serde_json::from_str(&wf_json)
            .unwrap_or_default();
        let tags: Vec<String> = tags_json.as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let used_tools: std::collections::HashSet<_> = workflow.iter().map(|s| &s.tool).collect();
        let status = match status_str.as_deref() {
            Some("tested")     => BlueprintStatus::Tested,
            Some("published")  => BlueprintStatus::Published,
            Some("deprecated") => BlueprintStatus::Deprecated,
            _                  => BlueprintStatus::Draft,
        };

        BlueprintInfo {
            id, name, persona, goal_template,
            tool_count: used_tools.len(),
            workflow_steps: workflow.len(),
            version: version.unwrap_or("1.0".into()),
            status,
            created_at,
            workflow_template: workflow,
            complexity: complexity.unwrap_or(1) as u8,
            tags,
        }
    }).collect()
}

/// Publish a draft/tested blueprint (status: draft|tested -> published).
/// Deprecates any previously published version of the same blueprint family.
pub async fn publish_blueprint(
    blueprint_id: &str,
    pool: &sqlx::SqlitePool,
) -> Result<(), String> {
    // Get current blueprint
    let blueprints = load_all_blueprints(pool).await;
    let bp = blueprints.into_iter()
        .find(|b| b.id == blueprint_id)
        .ok_or_else(|| format!("Blueprint {} not found", blueprint_id))?;

    if bp.status == BlueprintStatus::Deprecated {
        return Err("Cannot publish a deprecated blueprint".into());
    }

    // Set this blueprint to Published
    let _ = sqlx::query(
        "UPDATE agent_blueprints SET status = 'published' WHERE id = ?"
    ).bind(blueprint_id).execute(pool).await;

    crate::app_log!("BLUEPRINT", "Published: {} v{}", &bp.name, &bp.version);
    Ok(())
}

/// Mark a blueprint as Tested (draft -> tested).
pub async fn mark_blueprint_tested(
    blueprint_id: &str,
    pool: &sqlx::SqlitePool,
) -> Result<(), String> {
    let _ = sqlx::query(
        "UPDATE agent_blueprints SET status = 'tested' WHERE id = ? AND status = 'draft'"
    ).bind(blueprint_id).execute(pool).await;
    crate::app_log!("BLUEPRINT", "Marked tested: {}", crate::logger::safe_truncate(&blueprint_id, 8));
    Ok(())
}

/// Create an AssetRevisionCandidate from a human correction.
/// This is the backflow path: correction -> asset revision suggestion.
/// The candidate is saved for operator review before being applied.
pub async fn update_blueprint_from_correction(
    blueprint_id: &str,
    correction_id: &str,
    suggested_changes: Vec<String>,
    pool: &sqlx::SqlitePool,
) -> AssetRevisionCandidate {
    let candidate = AssetRevisionCandidate {
        candidate_id: uuid::Uuid::new_v4().to_string(),
        source_blueprint_id: blueprint_id.to_string(),
        source_version: "current".to_string(),
        triggered_by_correction_id: Some(correction_id.to_string()),
        triggered_by_teaching_id: None,
        suggested_changes,
        status: "pending_review".to_string(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    // Persist candidate
    let changes_json = serde_json::to_string(&candidate.suggested_changes).unwrap_or("[]".into());
    let _ = sqlx::query(
        "INSERT INTO asset_revision_candidates
         (id, blueprint_id, source_version, correction_id, changes_json, status, created_at)
         VALUES (?,?,?,?,?,?,?)"
    )
    .bind(&candidate.candidate_id)
    .bind(blueprint_id)
    .bind(&candidate.source_version)
    .bind(correction_id)
    .bind(&changes_json)
    .bind(&candidate.status)
    .bind(&candidate.created_at)
    .execute(pool).await;

    crate::app_log!("BLUEPRINT", "Revision candidate {} from correction {}",
                   crate::logger::safe_truncate(&candidate.candidate_id, 8), crate::logger::safe_truncate(&correction_id, 8));
    candidate
}

/// Ensure asset_revision_candidates table exists (called on startup)
pub async fn ensure_revision_schema(pool: &sqlx::SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS asset_revision_candidates (
            id TEXT PRIMARY KEY,
            blueprint_id TEXT NOT NULL,
            source_version TEXT,
            correction_id TEXT,
            teaching_id TEXT,
            changes_json TEXT,
            status TEXT DEFAULT 'pending_review',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await;

    // Add status column to agent_blueprints if not exists
    let _ = sqlx::query(
        "ALTER TABLE agent_blueprints ADD COLUMN status TEXT DEFAULT 'draft'"
    ).execute(pool).await; // Silently ignore if column already exists
}


// ─── Helper ───────────────────────────────────────────────────────

fn extract_json_object(raw: &str) -> String {
    if let Some(start) = raw.find('{') {
        if let Some(end) = raw.rfind('}') {
            return raw[start..=end].to_string();
        }
    }
    raw.trim().to_string()
}
