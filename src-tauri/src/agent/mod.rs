// Agent Runtime V5.1 -- Module Entry Point
//
// Full stack:
//   types.rs          -> All shared types (3-layer object model)
//   llm_client.rs     -> Unified LLM HTTP client
//   context.rs        -> Session context + Token Budget
//   react_loop.rs     -> ReAct execution engine (inner loop)
//   stop_judge.rs     -> Independent stop/budget controller
//   model_router.rs   -> Multi-model routing
//   blueprint_engine.rs -> 3-phase blueprint generation
//   memory.rs         -> Short + long-term memory
//   human_layer/      -> Teaching / Correction / Trace / Recovery
//   workflow_runtime/ -> Multi-node workflow orchestration
//   tool_runtime.rs   -> Tool implementations (unchanged)

pub mod types;
mod llm_client;
mod context;
mod react_loop;
mod stop_judge;
mod model_router;
mod blueprint_engine;
pub mod memory;
pub mod human_layer;
pub mod workflow_runtime;
pub mod tool_runtime;
pub mod tool_platform;
pub mod ssot_validator;

use types::*;
use tauri::AppHandle;
use crate::app_log;
use crate::db::DbPool;

// ===============================================================
// Command 1: agent_run -- Single goal via ReAct Loop
// ===============================================================

#[tauri::command]
pub async fn agent_run(
    app_handle: AppHandle,
    pool: tauri::State<'_, DbPool>,
    req: AgentRunRequest,
) -> Result<AgentRunResult, String> {
    let goal = req.goal.clone().unwrap_or_else(|| req.prompt.clone());
    app_log!("AGENT", "=== agent_run: {} ===", &goal[..goal.len().min(80)]);

    let pool_ref: &sqlx::SqlitePool = &*pool;
    memory::ensure_schema(pool_ref).await;
    human_layer::intervention_manager::ensure_schema(pool_ref).await;

    let llm_config = get_llm_config(pool_ref, req.model_config_id.as_deref()).await?;

    let router = model_router::ModelRouter::new(llm_config);
    let agent_config = router.for_agent();
    let llm = llm_client::LlmClient::new(agent_config)?;

    let tools = tool_runtime::get_builtin_tools();
    let ctx = context::ContextManager::new(tools);

    let experience_hint = memory::retrieve_similar(&goal, pool_ref).await;
    let max_rounds = req.max_rounds.unwrap_or(10);

    let session = ctx.new_session(
        &goal,
        req.system_prompt.as_deref(),
        req.allowed_paths.clone(),
        max_rounds,
        experience_hint,
    );

    let result = react_loop::run(session, &llm, &ctx, pool_ref, &app_handle).await;

    app_log!("AGENT", "=== agent_run END: success={}, rounds={} ===",
             result.success, result.total_rounds);
    Ok(result)
}

// ===============================================================
// Command 2: agent_run_workflow -- Multi-node workflow execution
// ===============================================================

#[tauri::command]
pub async fn agent_run_workflow(
    app_handle: AppHandle,
    pool: tauri::State<'_, DbPool>,
    blueprint_id: String,
    goal: String,
    allowed_paths: Option<Vec<String>>,
    model_config_id: Option<String>,
) -> Result<serde_json::Value, String> {
    app_log!("AGENT", "=== agent_run_workflow: blueprint={} ===",
             &blueprint_id[..8.min(blueprint_id.len())]);

    let pool_ref: &sqlx::SqlitePool = &*pool;
    memory::ensure_schema(pool_ref).await;
    human_layer::intervention_manager::ensure_schema(pool_ref).await;

    // Load blueprint
    let blueprints = blueprint_engine::load_all_blueprints(pool_ref).await;
    let blueprint = blueprints.into_iter()
        .find(|b| b.id == blueprint_id)
        .ok_or_else(|| format!("Blueprint {} not found", blueprint_id))?;

    let llm_config = get_llm_config(pool_ref, model_config_id.as_deref()).await?;
    let router = model_router::ModelRouter::new(llm_config);
    let llm = llm_client::LlmClient::new(router.for_agent())?;

    let tools = tool_runtime::get_builtin_tools();
    let ctx = context::ContextManager::new(tools);

    // Create a shared resume registry for human gates
    let resume_registry = human_layer::recovery_bridge::new_registry();

    let wf_run = workflow_runtime::engine::run_workflow(
        &blueprint,
        &goal,
        &llm,
        &ctx,
        pool_ref,
        &app_handle,
        allowed_paths,
        &resume_registry,
    ).await;

    Ok(serde_json::to_value(&wf_run).unwrap_or_default())
}

// ===============================================================
// Command 3: agent_human_resolve -- Resolve a human gate
// ===============================================================

#[tauri::command]
pub async fn agent_human_resolve(
    app_handle: AppHandle,
    pool: tauri::State<'_, DbPool>,
    intervention_id: String,
    response: String,
) -> Result<(), String> {
    let pool_ref: &sqlx::SqlitePool = &*pool;
    human_layer::intervention_manager::resolve_gate(
        &intervention_id, &response, pool_ref, &app_handle,
    ).await?;
    app_log!("AGENT", "Human gate {} resolved",
             &intervention_id[..8.min(intervention_id.len())]);
    Ok(())
}

// ===============================================================
// Command 4: agent_create_blueprint -- 3-Phase Blueprint Generator
// ===============================================================

#[tauri::command]
pub async fn agent_create_blueprint(
    _app_handle: AppHandle,
    pool: tauri::State<'_, DbPool>,
    description: String,
) -> Result<BlueprintInfo, String> {
    app_log!("AGENT", "Creating blueprint: {}", &description[..description.len().min(60)]);
    let pool_ref: &sqlx::SqlitePool = &*pool;
    memory::ensure_schema(pool_ref).await;

    let llm_config = get_llm_config(pool_ref, None).await?;
    let router = model_router::ModelRouter::new(llm_config);
    let llm = llm_client::LlmClient::new(router.for_blueprint())?;

    blueprint_engine::generate_blueprint(&description, &llm, pool_ref).await
}

// ===============================================================
// Command 5: agent_list_blueprints
// ===============================================================

#[tauri::command]
pub async fn agent_list_blueprints(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<BlueprintInfo>, String> {
    let pool_ref: &sqlx::SqlitePool = &*pool;
    memory::ensure_schema(pool_ref).await;
    Ok(blueprint_engine::load_all_blueprints(pool_ref).await)
}

// ===============================================================
// Command 6: agent_delete_blueprint
// ===============================================================

#[tauri::command]
pub async fn agent_delete_blueprint(
    pool: tauri::State<'_, DbPool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM agent_blueprints WHERE id = ?")
        .bind(&id).execute(&*pool).await
        .map_err(|e| format!("Delete failed: {e}"))?;
    app_log!("AGENT", "Blueprint deleted: {}", id);
    Ok(())
}

// ===============================================================
// Command 7: agent_list_experiences
// ===============================================================

#[tauri::command]
pub async fn agent_list_experiences(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<ExperienceInfo>, String> {
    let pool_ref: &sqlx::SqlitePool = &*pool;
    memory::ensure_schema(pool_ref).await;
    Ok(memory::list_experiences(pool_ref).await)
}

// ===============================================================
// Command 8: agent_test_blueprint
// SSOT Enforcement: test MUST receive blueprint_version_id.
// Tests run the existing asset — they never regenerate the blueprint.
// ===============================================================

#[tauri::command]
pub async fn agent_test_blueprint(
    app_handle: AppHandle,
    pool: tauri::State<'_, DbPool>,
    blueprint_id: String,      // which blueprint to test
    blueprint_version: String, // REQUIRED: pinned version — enforces SSOT
    goal: Option<String>,      // optional override; default = blueprint.goal_template
) -> Result<serde_json::Value, String> {
    let pool_ref: &sqlx::SqlitePool = &*pool;
    app_log!("AGENT", "=== agent_test_blueprint: {}@{} ===", &blueprint_id[..8.min(blueprint_id.len())], blueprint_version);

    // Load the specific blueprint — do NOT regenerate
    let blueprints = blueprint_engine::load_all_blueprints(pool_ref).await;
    let blueprint = blueprints.into_iter()
        .find(|b| b.id == blueprint_id && b.version == blueprint_version)
        .ok_or_else(|| format!(
            "Blueprint {}@{} not found. Test run requires exact version — do not regenerate.",
            blueprint_id, blueprint_version
        ))?;

    let test_goal = goal.unwrap_or_else(|| blueprint.goal_template.clone());
    app_log!("AGENT", "Testing blueprint '{}' v{} — goal: {}", blueprint.name, blueprint.version, &test_goal[..test_goal.len().min(60)]);

    // Execute via workflow runtime (same path as production — SSOT)
    let llm_config = get_llm_config(pool_ref, None).await?;
    let router = model_router::ModelRouter::new(llm_config);
    let llm = llm_client::LlmClient::new(router.for_agent())?;
    let tools = tool_runtime::get_builtin_tools();
    let ctx = context::ContextManager::new(tools);
    let resume_registry = human_layer::recovery_bridge::new_registry();

    let wf_run = workflow_runtime::engine::run_workflow(
        &blueprint, &test_goal, &llm, &ctx, pool_ref, &app_handle, None, &resume_registry,
    ).await;

    // After test: check SSOT deviation and auto-mark as tested if clean
    let report = ssot_validator::validate_runtime_deviation(&blueprint, &wf_run);
    ssot_validator::save_deviation_report(&report, pool_ref).await;

    if !report.has_violations {
        blueprint_engine::mark_blueprint_tested(&blueprint_id, pool_ref).await.ok();
        app_log!("AGENT", "Blueprint {}@{} auto-marked as Tested (no violations)", &blueprint_id[..8], blueprint_version);
    } else {
        app_log!("AGENT", "Blueprint {}@{} has {} violations — NOT marked tested", &blueprint_id[..8], blueprint_version, report.deviations.len());
    }

    Ok(serde_json::json!({
        "workflow_run": serde_json::to_value(&wf_run).unwrap_or_default(),
        "ssot_report": serde_json::to_value(&report).unwrap_or_default(),
        "auto_marked_tested": !report.has_violations,
    }))
}

// ===============================================================
// Command 9: agent_publish_blueprint / agent_mark_blueprint_tested
// ===============================================================

#[tauri::command]
pub async fn agent_publish_blueprint(
    pool: tauri::State<'_, DbPool>,
    blueprint_id: String,
) -> Result<(), String> {
    blueprint_engine::publish_blueprint(&blueprint_id, &*pool).await
}

#[tauri::command]
pub async fn agent_mark_blueprint_tested(
    pool: tauri::State<'_, DbPool>,
    blueprint_id: String,
) -> Result<(), String> {
    blueprint_engine::mark_blueprint_tested(&blueprint_id, &*pool).await
}

// ===============================================================
// Command 10-12: Tool Platform introspection
// ===============================================================

#[tauri::command]
pub async fn agent_tool_gap_report(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(tool_platform::registry::get_tool_gap_report(&*pool).await)
}

#[tauri::command]
pub async fn agent_list_tools(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(tool_platform::registry::list_all_tools(&*pool).await)
}

#[tauri::command]
pub async fn agent_list_tool_policies(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(tool_platform::policy::list_policies(&*pool).await)
}

// ===============================================================
// Command 13: agent_get_run_replay
// Reconstruct a complete RunReplay from stored ActionTraces.
// Enables deterministic replay of any past execution in the UI.
// ===============================================================

#[tauri::command]
pub async fn agent_get_run_replay(
    pool: tauri::State<'_, DbPool>,
    run_id: String,
    blueprint_version_id: Option<String>,
    goal: Option<String>,
) -> Result<serde_json::Value, String> {
    let replay = ssot_validator::build_run_replay(
        &run_id,
        blueprint_version_id.as_deref(),
        goal.as_deref().unwrap_or(""),
        &*pool,
    ).await;
    serde_json::to_value(&replay).map_err(|e| e.to_string())
}

// ===============================================================
// Command 14: agent_execution_diff
// Compare Blueprint definition plan vs actual execution trace.
// Returns missing steps, extra steps, and overall severity.
// ===============================================================

#[tauri::command]
pub async fn agent_execution_diff(
    pool: tauri::State<'_, DbPool>,
    blueprint_id: String,
    blueprint_version: String,
    run_id: String,
) -> Result<serde_json::Value, String> {
    let pool_ref: &sqlx::SqlitePool = &*pool;

    // Load blueprint
    let blueprints = blueprint_engine::load_all_blueprints(pool_ref).await;
    let blueprint = blueprints.into_iter()
        .find(|b| b.id == blueprint_id && b.version == blueprint_version)
        .ok_or_else(|| format!("Blueprint {}@{} not found", blueprint_id, blueprint_version))?;

    // Load traces
    let traces = ssot_validator::load_traces_for_run(&run_id, pool_ref).await;

    // Compute diff
    let diff = ssot_validator::compute_execution_diff(&blueprint, &run_id, &traces);
    serde_json::to_value(&diff).map_err(|e| e.to_string())
}

// ===============================================================
// Command 15: agent_list_revision_candidates
// Lists AssetRevisionCandidates for frontend review tab.
// These are generated by correction/teaching and need operator sign-off
// before being merged as a new Blueprint version.
// ===============================================================

#[tauri::command]
pub async fn agent_list_revision_candidates(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    let rows: Vec<(String, String, String, Option<String>, Option<String>, Vec<u8>, String, String)> = sqlx::query_as(
        "SELECT candidate_id, source_blueprint_id, source_version,
                triggered_by_correction_id, triggered_by_teaching_id,
                suggested_changes_json, status, created_at
         FROM asset_revision_candidates ORDER BY created_at DESC LIMIT 50"
    ).fetch_all(&*pool).await.unwrap_or_default();

    Ok(rows.into_iter().map(|(id, bp_id, ver, corr, teach, changes_raw, status, at)| {
        let changes: Vec<String> = serde_json::from_slice(&changes_raw).unwrap_or_default();
        serde_json::json!({
            "candidate_id": id,
            "source_blueprint_id": bp_id,
            "source_version": ver,
            "triggered_by_correction_id": corr,
            "triggered_by_teaching_id": teach,
            "suggested_changes": changes,
            "status": status,
            "created_at": at,
        })
    }).collect())
}

#[tauri::command]
pub async fn agent_review_revision_candidate(
    pool: tauri::State<'_, DbPool>,
    candidate_id: String,
    action: String,   // "approve" | "reject"
) -> Result<(), String> {
    let status = if action == "approve" { "applied" } else { "rejected" };
    sqlx::query("UPDATE asset_revision_candidates SET status = ? WHERE id = ?")
        .bind(status).bind(&candidate_id)
        .execute(&*pool).await.map_err(|e| e.to_string())?;
    app_log!("AGENT", "Revision candidate {} {}", &candidate_id[..8.min(candidate_id.len())], status);
    Ok(())
}

// ===============================================================
// Command 16: agent_check_ssot_consistency
// Exposes SSOT consistency check to frontend.
// Compare two runs for the same blueprint_version_id.
// ===============================================================

#[tauri::command]
pub async fn agent_check_ssot_consistency(
    pool: tauri::State<'_, DbPool>,
    blueprint_id: String,
    blueprint_version: String,
    run_id_a: String,
    run_id_b: String,
) -> Result<serde_json::Value, String> {
    let pool_ref: &sqlx::SqlitePool = &*pool;

    // Load blueprint
    let blueprints = blueprint_engine::load_all_blueprints(pool_ref).await;
    let blueprint = blueprints.into_iter()
        .find(|b| b.id == blueprint_id && b.version == blueprint_version)
        .ok_or_else(|| format!("Blueprint {}@{} not found", blueprint_id, blueprint_version))?;

    // Load workflow runs
    let run_a: crate::agent::types::WorkflowRun =
        workflow_runtime::state::load_workflow_run(&run_id_a, pool_ref).await
        .ok_or_else(|| format!("Run {} not found", run_id_a))?;
    let run_b: crate::agent::types::WorkflowRun =
        workflow_runtime::state::load_workflow_run(&run_id_b, pool_ref).await
        .ok_or_else(|| format!("Run {} not found", run_id_b))?;

    let result = ssot_validator::check_ssot_consistency(&blueprint, &run_a, &run_b, "run_a", "run_b");
    serde_json::to_value(&result).map_err(|e| e.to_string())
}

// ===============================================================
// Commands 17-19: Tool Candidate Ingestion
// Full lifecycle: list → ingest → review (approve/reject)
// ===============================================================

#[tauri::command]
pub async fn agent_list_tool_candidates(
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(tool_platform::registry::list_tool_candidates(&*pool).await)
}

#[tauri::command]
pub async fn agent_ingest_tool_candidate(
    pool: tauri::State<'_, DbPool>,
    source: String,               // "correction" | "teaching" | "manual"
    source_id: String,
    suggested_name: String,
    suggested_description: String,
    example_usage: String,
) -> Result<(), String> {
    tool_platform::registry::ingest_tool_candidate(
        &source, &source_id, &suggested_name, &suggested_description, &example_usage, &*pool,
    ).await;
    Ok(())
}

#[tauri::command]
pub async fn agent_review_tool_candidate(
    pool: tauri::State<'_, DbPool>,
    candidate_id: String,
    action: String,   // "approve" | "reject" | "implemented"
) -> Result<(), String> {
    tool_platform::registry::update_candidate_status(&candidate_id, &action, &*pool).await
}

// ===============================================================
// Internal Helpers
// ===============================================================

async fn get_llm_config(
    pool: &sqlx::SqlitePool,
    config_id: Option<&str>,
) -> Result<LlmConfig, String> {
    let row: (String, String, String) = if let Some(id) = config_id {
        sqlx::query_as(
            "SELECT base_url, api_key, model_name FROM ai_configs WHERE id = ?"
        ).bind(id).fetch_one(pool).await
            .map_err(|_| "Specified AI model config not found".to_string())?
    } else {
        sqlx::query_as(
            "SELECT base_url, api_key, model_name FROM ai_configs WHERE is_active = 1 LIMIT 1"
        ).fetch_one(pool).await
            .map_err(|_| "No AI model configured. Please add a model config in settings.".to_string())?
    };

    let (base_url, api_key, model_name) = row;
    let endpoint = if base_url.ends_with("/chat/completions") {
        base_url
    } else if base_url.ends_with('/') {
        format!("{}chat/completions", base_url)
    } else {
        format!("{}/chat/completions", base_url)
    };

    Ok(LlmConfig { endpoint, api_key, model_name })
}
