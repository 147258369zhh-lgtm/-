mod agent;
mod ai;
mod automation;
mod commands;
mod db;
pub mod logger;
mod mcp;
mod models;
mod rag;
pub mod tools;
pub mod utils;

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
            get_log_path
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
