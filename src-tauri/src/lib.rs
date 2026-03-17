mod agent;
mod ai;
mod automation;
mod commands;
mod db;
pub mod logger;
mod mcp;
mod models;
pub mod plugin_registry;
mod rag;
pub mod tools;
pub mod utils;
mod token_usage;
mod workflow;

use std::path::PathBuf;
use tauri::Manager;

/// Tauri command: allow frontend to write logs to the same log file
#[tauri::command]
fn frontend_log(level: String, module: String, message: String) {
    match level.to_uppercase().as_str() {
        "ERROR" => logger::error(&format!("FE:{}", module), &message),
        "WARN" => logger::warn(&format!("FE:{}", module), &message),
        _ => logger::log(&format!("FE:{}", module), &message),
    }
}

/// Tauri command: get the current log file path for display/debug
#[tauri::command]
fn get_log_path() -> String {
    let path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("openclaw_debug.log")))
        .unwrap_or_else(|| PathBuf::from("openclaw_debug.log"));
    path.display().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // --- Initialize Logger ---
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()));
            if let Some(dir) = exe_dir {
                logger::set_log_dir(dir);
            }
            logger::init();
            app_log!("APP", "═══ Application Starting ═══");
            app_log!("APP", "Version: {}", env!("CARGO_PKG_VERSION"));
            app_log!("APP", "Debug mode: {}", cfg!(debug_assertions));

            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                app_log!("APP", "Initializing database...");
                let pool = db::init_db(&handle)
                    .await
                    .expect("Failed to initialize database");
                app_log!("APP", "Database initialized successfully");

                // Initialize MCP Client Manager
                app_log!("APP", "Initializing MCP Client Manager...");
                let mcp_manager = mcp::client::McpClientManager::new();
                app_log!("APP", "MCP Client Manager initialized");

                handle.manage(pool);
                handle.manage(mcp_manager);
            });

            app_log!("APP", "Loading plugins: dialog, fs, log...");
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_fs::init())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app_log!("APP", "All plugins loaded. Application ready.");
            app_log!("APP", "═══ Startup Complete ═══");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::list_projects,
            commands::update_project,
            commands::open_project,
            commands::import_files,
            commands::list_project_files,
            commands::update_file_metadata,
            commands::delete_file,
            commands::get_survey,
            commands::update_survey,
            commands::add_survey_media,
            commands::list_survey_media,
            commands::list_templates,
            commands::create_template,
            commands::delete_template,
            commands::list_common_info,
            commands::update_common_info,
            commands::update_common_info_structured,
            commands::delete_common_info,
            commands::list_settings,
            commands::update_setting,
            commands::get_project_meta_history,
            commands::cleanup_trash_auto,
            commands::list_automation_schemes,
            commands::upsert_automation_scheme,
            commands::delete_automation_scheme,
            commands::list_automation_instructions,
            commands::upsert_automation_instruction,
            commands::delete_automation_instruction,
            commands::get_design_context,
            automation::run_automation_v2,
            ai::list_ai_configs,
            ai::upsert_ai_config,
            ai::delete_ai_config,
            ai::chat_with_ai,
            ai::chat_with_ai_config,
            ai::fetch_public_free_apis,
            ai::fetch_ai_models,
            commands::run_browser_script,
            commands::rename_file,
            mcp::commands::mcp_connect_stdio,
            mcp::commands::mcp_list_tools,
            mcp::commands::mcp_call_internal_tool,
            mcp::commands::mcp_sync_skills,
            mcp::commands::mcp_export_skill,
            mcp::commands::mcp_add_source,
            mcp::commands::mcp_list_sources,
            mcp::commands::mcp_import_skill,
            mcp::commands::mcp_install_from_source,
            mcp::commands::mcp_install_npm,
            mcp::commands::mcp_get_installed_skills,
            mcp::commands::mcp_startup_all,
            mcp::commands::mcp_open_url,
            rag::index_document,
            rag::rag_query,
            rag::get_index_status,
            rag::get_embedding_status,
            rag::init_embedding_model,
            rag::rebuild_all_indexes,
            convert_to_pdf,
            agent::agent_run,
            agent::agent_create_blueprint,
            agent::agent_list_blueprints,
            agent::agent_delete_blueprint,
            agent::agent_list_experiences,
            frontend_log,
            get_log_path,
            // ── Workflow Engine (P0) ──
            workflow::workflow_create,
            workflow::workflow_list,
            workflow::workflow_get,
            workflow::workflow_update,
            workflow::workflow_delete,
            workflow::workflow_run,
            workflow::workflow_pause,
            workflow::workflow_cancel,
            workflow::workflow_human_respond,
            workflow::workflow_list_active,
            workflow::workflow_get_status,
            workflow::workflow_list_executions,
            workflow::workflow_get_step_logs,
            // ── P1: Skill System ──
            workflow::skill_create,
            workflow::skill_list,
            workflow::skill_get,
            workflow::skill_update,
            workflow::skill_delete,
            workflow::skill_search,
            // ── P1: Tool Registry ──
            workflow::tool_list,
            workflow::tool_search,
            workflow::tool_set_enabled,
            // ── P2: Browser Automation ──
            workflow::browser_create_session,
            workflow::browser_execute_action,
            workflow::browser_list_sessions,
            workflow::browser_close_session,
            // ── P3: Experience System ──
            workflow::experience_save_template,
            workflow::experience_list_templates,
            workflow::experience_delete_template,
            workflow::experience_apply_correction,
            workflow::experience_record_outcome,
            workflow::experience_search,
            // ── P3: Migration ──
            workflow::migration_get_version,
            workflow::migration_run,
            // ── Plugin Registry ──
            plugin_registry::registry_list,
            plugin_registry::registry_list_by_type,
            plugin_registry::registry_enable,
            plugin_registry::registry_disable,
            plugin_registry::registry_install,
            plugin_registry::registry_uninstall,
            plugin_registry::registry_export,
            plugin_registry::registry_export_all,
            plugin_registry::registry_import,
            plugin_registry::registry_update,
            plugin_registry::registry_get_enabled_tools,
            plugin_registry::registry_search_npm,
            plugin_registry::registry_translate_batch,
            // ── Token Usage Tracking ──
            token_usage::get_token_stats,
            token_usage::clear_token_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn convert_to_pdf(input_path: String) -> Result<String, String> {
    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err("Input file does not exist".into());
    }

    // Use the system's temp dir for generated PDFs
    let output_dir = std::env::temp_dir().join("go_tongx_pdf_cache");
    if !output_dir.exists() {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    }

    // Call our utility
    match utils::office_converter::convert_office_to_pdf(&input, &output_dir) {
        Ok(pdf_path) => Ok(pdf_path.to_string_lossy().into_owned()),
        Err(e) => Err(e.to_string()),
    }
}
