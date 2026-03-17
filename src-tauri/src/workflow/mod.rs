// ═══════════════════════════════════════════════════════
// Workflow Engine — Module Entry & Tauri Commands
// ═══════════════════════════════════════════════════════

pub mod types;
pub mod engine;
pub mod node_executor;
pub mod persistence;
pub mod tool_registry;
pub mod skill;
pub mod model_router;
pub mod browser;
pub mod experience;
pub mod migration;

use crate::db::DbPool;
use engine::WorkflowEngine;
use persistence::WorkflowPersistence;
use skill::{SkillPersistence, SkillDefinition, CreateSkillRequest};
use tool_registry::{ToolRegistry, ToolCategory};
use browser::{BrowserManager, BrowserAction};
use experience::{ExperiencePersistence, ActionTemplate, ExperienceRecord};
use types::*;
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use std::sync::Arc;
use tokio::sync::OnceCell;

/// Global workflow engine instance (lazy init)
static ENGINE: OnceCell<Arc<WorkflowEngine>> = OnceCell::const_new();

/// Global tool registry (sync lazy init)
static TOOL_REGISTRY: std::sync::OnceLock<Arc<ToolRegistry>> = std::sync::OnceLock::new();

/// Global browser manager
static BROWSER_MANAGER: std::sync::OnceLock<Arc<tokio::sync::Mutex<BrowserManager>>> = std::sync::OnceLock::new();

/// Get or initialize the workflow engine
async fn get_engine(app_handle: &AppHandle) -> &Arc<WorkflowEngine> {
    ENGINE.get_or_init(|| async {
        Arc::new(WorkflowEngine::new(app_handle.clone()))
    }).await
}

/// Get or initialize the tool registry
fn get_tool_registry() -> &'static Arc<ToolRegistry> {
    TOOL_REGISTRY.get_or_init(|| {
        Arc::new(ToolRegistry::new())
    })
}

/// Get or initialize the browser manager
fn get_browser_manager() -> &'static Arc<tokio::sync::Mutex<BrowserManager>> {
    BROWSER_MANAGER.get_or_init(|| {
        Arc::new(tokio::sync::Mutex::new(BrowserManager::new()))
    })
}

// ═══════════════════════════════════════════════
// P0: Workflow Tauri Commands
// ═══════════════════════════════════════════════

/// Create a new workflow definition
#[tauri::command]
pub async fn workflow_create(
    pool: State<'_, DbPool>,
    app_handle: AppHandle,
    req: CreateWorkflowRequest,
) -> Result<Value, String> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = uuid::Uuid::new_v4().to_string();

    let def = WorkflowDefinition {
        id: id.clone(),
        name: req.name,
        description: req.description,
        nodes: req.nodes,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
    };

    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.create_workflow(&def).await?;

    crate::app_log!("WORKFLOW", "Created workflow '{}' ({})", def.name, id);

    Ok(json!({
        "id": id,
        "name": def.name,
        "nodes_count": def.nodes.len(),
    }))
}

/// List all workflow definitions
#[tauri::command]
pub async fn workflow_list(
    pool: State<'_, DbPool>,
) -> Result<Vec<WorkflowDefinition>, String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.list_workflows().await
}

/// Get a specific workflow definition
#[tauri::command]
pub async fn workflow_get(
    pool: State<'_, DbPool>,
    workflow_id: String,
) -> Result<WorkflowDefinition, String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.get_workflow(&workflow_id).await
}

/// Update a workflow definition
#[tauri::command]
pub async fn workflow_update(
    pool: State<'_, DbPool>,
    workflow: WorkflowDefinition,
) -> Result<(), String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.update_workflow(&workflow).await
}

/// Delete a workflow definition
#[tauri::command]
pub async fn workflow_delete(
    pool: State<'_, DbPool>,
    workflow_id: String,
) -> Result<(), String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.delete_workflow(&workflow_id).await?;
    crate::app_log!("WORKFLOW", "Deleted workflow {}", workflow_id);
    Ok(())
}

/// Run a workflow
#[tauri::command]
pub async fn workflow_run(
    pool: State<'_, DbPool>,
    app_handle: AppHandle,
    req: RunWorkflowRequest,
) -> Result<String, String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    let workflow = persistence.get_workflow(&req.workflow_id).await?;

    let engine = get_engine(&app_handle).await;
    let execution_id = engine.run_workflow(workflow, req.context, &persistence).await?;

    crate::app_log!("WORKFLOW", "Started execution {} for workflow {}", execution_id, req.workflow_id);

    Ok(execution_id)
}

/// Pause a running workflow
#[tauri::command]
pub async fn workflow_pause(
    app_handle: AppHandle,
    execution_id: String,
) -> Result<(), String> {
    let engine = get_engine(&app_handle).await;
    engine.pause(&execution_id).await
}

/// Cancel a running workflow
#[tauri::command]
pub async fn workflow_cancel(
    app_handle: AppHandle,
    execution_id: String,
) -> Result<(), String> {
    let engine = get_engine(&app_handle).await;
    engine.cancel(&execution_id).await
}

/// Submit human response to a waiting workflow
#[tauri::command]
pub async fn workflow_human_respond(
    app_handle: AppHandle,
    response: HumanNodeResponse,
) -> Result<(), String> {
    let engine = get_engine(&app_handle).await;
    engine.submit_human_response(response).await
}

/// List active workflow executions
#[tauri::command]
pub async fn workflow_list_active(
    app_handle: AppHandle,
) -> Result<Vec<WorkflowExecution>, String> {
    let engine = get_engine(&app_handle).await;
    Ok(engine.list_active().await)
}

/// Get execution status
#[tauri::command]
pub async fn workflow_get_status(
    pool: State<'_, DbPool>,
    app_handle: AppHandle,
    execution_id: String,
) -> Result<Option<WorkflowExecution>, String> {
    // First try active
    let engine = get_engine(&app_handle).await;
    if let Some(exec) = engine.get_execution_status(&execution_id).await {
        return Ok(Some(exec));
    }
    // Then try DB
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    let list = persistence.list_executions(100).await?;
    Ok(list.into_iter().find(|e| e.id == execution_id))
}

/// List execution history
#[tauri::command]
pub async fn workflow_list_executions(
    pool: State<'_, DbPool>,
    limit: Option<i64>,
) -> Result<Vec<WorkflowExecution>, String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.list_executions(limit.unwrap_or(50)).await
}

/// Get step logs for an execution
#[tauri::command]
pub async fn workflow_get_step_logs(
    pool: State<'_, DbPool>,
    execution_id: String,
) -> Result<Vec<StepLog>, String> {
    let persistence = WorkflowPersistence::new(pool.inner().clone());
    persistence.get_step_logs(&execution_id).await
}

// ═══════════════════════════════════════════════
// P1: Skill System Commands
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn skill_create(
    pool: State<'_, DbPool>,
    req: CreateSkillRequest,
) -> Result<Value, String> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = uuid::Uuid::new_v4().to_string();

    let def = SkillDefinition {
        id: id.clone(),
        name: req.name.clone(),
        description: req.description,
        category: req.category,
        steps_json: req.steps_json,
        input_schema: req.input_schema,
        output_schema: req.output_schema,
        version: 1,
        tags: req.tags,
        usage_count: 0,
        success_rate: 1.0,
        created_at: now.clone(),
        updated_at: now,
    };

    let persistence = SkillPersistence::new(pool.inner().clone());
    persistence.create_skill(&def).await?;

    crate::app_log!("SKILL", "Created skill '{}' ({})", req.name, id);

    Ok(json!({ "id": id, "name": def.name }))
}

#[tauri::command]
pub async fn skill_list(
    pool: State<'_, DbPool>,
) -> Result<Vec<SkillDefinition>, String> {
    let persistence = SkillPersistence::new(pool.inner().clone());
    persistence.list_skills().await
}

#[tauri::command]
pub async fn skill_get(
    pool: State<'_, DbPool>,
    skill_id: String,
) -> Result<SkillDefinition, String> {
    let persistence = SkillPersistence::new(pool.inner().clone());
    persistence.get_skill(&skill_id).await
}

#[tauri::command]
pub async fn skill_update(
    pool: State<'_, DbPool>,
    skill: SkillDefinition,
) -> Result<(), String> {
    let persistence = SkillPersistence::new(pool.inner().clone());
    persistence.update_skill(&skill).await
}

#[tauri::command]
pub async fn skill_delete(
    pool: State<'_, DbPool>,
    skill_id: String,
) -> Result<(), String> {
    let persistence = SkillPersistence::new(pool.inner().clone());
    persistence.delete_skill(&skill_id).await?;
    crate::app_log!("SKILL", "Deleted skill {}", skill_id);
    Ok(())
}

#[tauri::command]
pub async fn skill_search(
    pool: State<'_, DbPool>,
    query: String,
) -> Result<Vec<SkillDefinition>, String> {
    let persistence = SkillPersistence::new(pool.inner().clone());
    persistence.search_skills(&query).await
}

// ═══════════════════════════════════════════════
// P1: Tool Registry Commands
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn tool_list(
    category: Option<String>,
) -> Result<Vec<tool_registry::ToolContract>, String> {
    let registry = get_tool_registry();
    let cat = category.and_then(|c| serde_json::from_str::<ToolCategory>(&format!("\"{}\"", c)).ok());
    Ok(registry.list(cat, None))
}

#[tauri::command]
pub async fn tool_search(
    query: String,
) -> Result<Vec<tool_registry::ToolContract>, String> {
    let registry = get_tool_registry();
    Ok(registry.search(&query))
}

#[tauri::command]
pub async fn tool_set_enabled(
    tool_id: String,
    enabled: bool,
) -> Result<bool, String> {
    let registry = get_tool_registry();
    Ok(registry.set_enabled(&tool_id, enabled))
}

// ═══════════════════════════════════════════════
// P2: Browser Automation Commands
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn browser_create_session(
    name: String,
) -> Result<browser::BrowserSession, String> {
    let mgr = get_browser_manager();
    let mgr = mgr.lock().await;
    mgr.create_session(&name).await
}

#[tauri::command]
pub async fn browser_execute_action(
    action: BrowserAction,
) -> Result<Value, String> {
    let mgr = get_browser_manager();
    let mgr = mgr.lock().await;
    mgr.execute_action(&action).await
}

#[tauri::command]
pub async fn browser_list_sessions() -> Result<Vec<browser::BrowserSession>, String> {
    let mgr = get_browser_manager();
    let mgr = mgr.lock().await;
    Ok(mgr.list_sessions().await)
}

#[tauri::command]
pub async fn browser_close_session(
    session_id: String,
) -> Result<(), String> {
    let mgr = get_browser_manager();
    let mgr = mgr.lock().await;
    mgr.close_session(&session_id).await
}

// ═══════════════════════════════════════════════
// P3: Experience System Commands
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn experience_save_template(
    pool: State<'_, DbPool>,
    template: ActionTemplate,
) -> Result<(), String> {
    let persistence = ExperiencePersistence::new(pool.inner().clone());
    persistence.save_template(&template).await
}

#[tauri::command]
pub async fn experience_list_templates(
    pool: State<'_, DbPool>,
    domain: Option<String>,
) -> Result<Vec<ActionTemplate>, String> {
    let persistence = ExperiencePersistence::new(pool.inner().clone());
    persistence.list_templates(domain.as_deref()).await
}

#[tauri::command]
pub async fn experience_delete_template(
    pool: State<'_, DbPool>,
    template_id: String,
) -> Result<(), String> {
    let persistence = ExperiencePersistence::new(pool.inner().clone());
    persistence.delete_template(&template_id).await
}

#[tauri::command]
pub async fn experience_apply_correction(
    pool: State<'_, DbPool>,
    template_id: String,
    new_actions_json: String,
) -> Result<(), String> {
    let persistence = ExperiencePersistence::new(pool.inner().clone());
    persistence.apply_correction(&template_id, &new_actions_json).await
}

#[tauri::command]
pub async fn experience_record_outcome(
    pool: State<'_, DbPool>,
    template_id: Option<String>,
    task_description: String,
    outcome: String,
    actions_json: String,
    correction_notes: Option<String>,
) -> Result<(), String> {
    let persistence = ExperiencePersistence::new(pool.inner().clone());
    let record = ExperienceRecord {
        id: uuid::Uuid::new_v4().to_string(),
        template_id,
        task_description,
        outcome,
        actions_json,
        correction_notes,
        context_json: None,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    persistence.save_experience(&record).await
}

#[tauri::command]
pub async fn experience_search(
    pool: State<'_, DbPool>,
    query: String,
) -> Result<Vec<ExperienceRecord>, String> {
    let persistence = ExperiencePersistence::new(pool.inner().clone());
    persistence.search_experiences(&query).await
}

// ═══════════════════════════════════════════════
// P3: Migration Commands
// ═══════════════════════════════════════════════

#[tauri::command]
pub async fn migration_get_version(
    pool: State<'_, DbPool>,
) -> Result<u32, String> {
    migration::get_schema_version(pool.inner()).await
}

#[tauri::command]
pub async fn migration_run(
    pool: State<'_, DbPool>,
) -> Result<String, String> {
    migration::run_migrations(pool.inner()).await?;
    Ok(format!("Migrated to schema version {}", migration::CURRENT_SCHEMA_VERSION))
}
