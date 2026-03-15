use crate::db::DbPool;
use crate::models::{Project, ProjectFile};
use std::fs;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn create_project(
    pool: State<'_, DbPool>,
    name: String,
    number: Option<String>,
    city: Option<String>,
    project_type: Option<String>,
    root_path: String,
    remarks: Option<String>,
) -> Result<Project, String> {
    let id = Uuid::new_v4().to_string();
    let project_path = Path::new(&root_path).join(&id);

    // 1. Create directory structure
    let dirs = ["文件", "历史版本", "输出成果", "原始资料", ".trash"];
    for dir in &dirs {
        fs::create_dir_all(project_path.join(dir)).map_err(|e| e.to_string())?;
    }
    let _ = fs::write(
        project_path.join("README.txt"),
        format!("项目名称: {}\n创建时间: {}", name, chrono::Local::now()),
    );

    let path_str = project_path.to_string_lossy().to_string();

    // 2. Save to DB
    sqlx::query(
        "INSERT INTO projects (id, name, number, city, project_type, path, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&name)
    .bind(&number)
    .bind(&city)
    .bind(&project_type)
    .bind(&path_str)
    .bind(&remarks)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. Initialize survey record
    sqlx::query("INSERT INTO surveys (project_id) VALUES (?)")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Project {
        id,
        name,
        number,
        city,
        project_type,
        created_at: chrono::Utc::now().to_rfc3339(),
        path: path_str,
        remarks,
        last_opened_at: None,
        stage: "立项".to_string(),
        summary: None,
        ai_profile: None,
    })
}

#[tauri::command]
pub async fn list_projects(pool: State<'_, DbPool>) -> Result<Vec<Project>, String> {
    sqlx::query_as::<_, Project>(
        "SELECT * FROM projects ORDER BY last_opened_at DESC, created_at DESC",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_project(
    pool: State<'_, DbPool>,
    id: String,
    name: Option<String>,
    number: Option<String>,
    city: Option<String>,
    project_type: Option<String>,
    remarks: Option<String>,
    summary: Option<String>,
    ai_profile: Option<String>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE projects SET name = COALESCE(?, name), number = COALESCE(?, number), city = COALESCE(?, city), project_type = COALESCE(?, project_type), remarks = COALESCE(?, remarks), summary = COALESCE(?, summary), ai_profile = COALESCE(?, ai_profile) WHERE id = ?"
    )
    .bind(name)
    .bind(number)
    .bind(city)
    .bind(project_type)
    .bind(remarks)
    .bind(summary)
    .bind(ai_profile)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_project(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE projects SET last_opened_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn import_files(
    pool: State<'_, DbPool>,
    project_id: String,
    source_paths: Vec<String>,
    category: String,
    stage: String,
) -> Result<Vec<ProjectFile>, String> {
    let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
        .bind(&project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut imported_files = Vec::new();

    for source_path in source_paths {
        let source = Path::new(&source_path);
        if !source.exists() {
            continue; // Skip non-existent files
        }

        let file_name = source
            .file_name()
            .ok_or("无效的文件名")?
            .to_string_lossy()
            .to_string();

        let dest_dir = Path::new(&project.path).join("文件");
        let dest_path = dest_dir.join(&file_name);

        let existing_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE project_id = ? AND name = ?")
                .bind(&project_id)
                .bind(&file_name)
                .fetch_one(&*pool)
                .await
                .map_err(|e| e.to_string())?;

        let version = existing_count + 1;

        fs::copy(source, &dest_path).map_err(|e| e.to_string())?;

        let file_id = Uuid::new_v4().to_string();
        let file_path_str = dest_path.to_string_lossy().to_string();

        sqlx::query("UPDATE files SET is_latest = 0 WHERE project_id = ? AND name = ?")
            .bind(&project_id)
            .bind(&file_name)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO files (id, project_id, name, original_name, path, category, stage, version, is_latest) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(&file_id)
        .bind(&project_id)
        .bind(&file_name)
        .bind(&file_name)
        .bind(&file_path_str)
        .bind(&category)
        .bind(&stage)
        .bind(version)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        imported_files.push(ProjectFile {
            id: file_id,
            project_id: project_id.clone(),
            name: file_name.clone(),
            original_name: Some(file_name),
            path: file_path_str,
            category: category.clone(),
            stage: stage.clone(),
            version,
            created_at: chrono::Utc::now().to_rfc3339(),
            is_latest: true,
            is_deleted: false,
            remarks: None,
            ai_summary: None,
        });
    }

    Ok(imported_files)
}

#[tauri::command]
pub async fn list_project_files(
    pool: State<'_, DbPool>,
    project_id: String,
) -> Result<Vec<ProjectFile>, String> {
    sqlx::query_as::<_, ProjectFile>(
        "SELECT * FROM files WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_file_metadata(
    pool: State<'_, DbPool>,
    id: String,
    category: Option<String>,
    stage: Option<String>,
    remarks: Option<String>,
    ai_summary: Option<String>,
) -> Result<(), String> {
    if let Some(c) = category {
        sqlx::query("UPDATE files SET category = ? WHERE id = ?")
            .bind(c)
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(s) = stage {
        sqlx::query("UPDATE files SET stage = ? WHERE id = ?")
            .bind(s)
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(r) = remarks {
        sqlx::query("UPDATE files SET remarks = ? WHERE id = ?")
            .bind(r)
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(summary) = ai_summary {
        sqlx::query("UPDATE files SET ai_summary = ? WHERE id = ?")
            .bind(summary)
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_file(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    let file = sqlx::query_as::<_, ProjectFile>("SELECT * FROM files WHERE id = ?")
        .bind(&id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
        .bind(&file.project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let trash_dir = Path::new(&project.path).join(".trash");
    let file_path = Path::new(&file.path);
    let dest_path = trash_dir.join(file_path.file_name().ok_or("无效文件名")?);

    if file_path.exists() {
        fs::rename(file_path, dest_path).map_err(|e| e.to_string())?;
    }

    sqlx::query("UPDATE files SET is_deleted = 1, is_latest = 0 WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_survey(
    pool: State<'_, DbPool>,
    project_id: String,
) -> Result<crate::models::Survey, String> {
    sqlx::query_as::<_, crate::models::Survey>("SELECT * FROM surveys WHERE project_id = ?")
        .bind(project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_survey(
    pool: State<'_, DbPool>,
    project_id: String,
    date: Option<String>,
    location: Option<String>,
    surveyor: Option<String>,
    summary: Option<String>,
    ai_structured: Option<String>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE surveys SET date = ?, location = ?, surveyor = ?, summary = ?, ai_structured = COALESCE(?, ai_structured) WHERE project_id = ?",
    )
    .bind(date)
    .bind(location)
    .bind(surveyor)
    .bind(summary)
    .bind(ai_structured)
    .bind(project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn add_survey_media(
    pool: State<'_, DbPool>,
    project_id: String,
    source_path: String,
    media_type: String,
) -> Result<crate::models::SurveyMedia, String> {
    let source = Path::new(&source_path);
    let name = source
        .file_name()
        .ok_or("无效文件名")?
        .to_string_lossy()
        .to_string();

    let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
        .bind(&project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let dest_dir = Path::new(&project.path).join("原始资料");
    let dest_path = dest_dir.join(&name);

    fs::copy(source, &dest_path).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let path_str = dest_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO survey_media (id, survey_id, project_id, path, media_type) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&project_id) // Using project_id as survey_id since 1-to-1
    .bind(&project_id)
    .bind(&path_str)
    .bind(&media_type)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(crate::models::SurveyMedia {
        id,
        survey_id: project_id.clone(),
        project_id,
        path: path_str,
        media_type,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn list_survey_media(
    pool: State<'_, DbPool>,
    project_id: String,
) -> Result<Vec<crate::models::SurveyMedia>, String> {
    sqlx::query_as::<_, crate::models::SurveyMedia>(
        "SELECT * FROM survey_media WHERE project_id = ? ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_templates(
    pool: State<'_, DbPool>,
) -> Result<Vec<crate::models::Template>, String> {
    sqlx::query_as::<_, crate::models::Template>("SELECT * FROM templates")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_template(
    pool: State<'_, DbPool>,
    name: String,
    stage: Option<String>,
    label: Option<String>,
    name_pattern: Option<String>,
    source_file_path: Option<String>,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO templates (id, name, stage, label, name_pattern, source_file_path, ai_structured) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(id)
    .bind(name)
    .bind(stage)
    .bind(label)
    .bind(name_pattern)
    .bind(source_file_path)
    .bind(None::<String>)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_template(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM templates WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_template_structured(
    pool: State<'_, DbPool>,
    id: String,
    ai_structured: String,
) -> Result<(), String> {
    sqlx::query("UPDATE templates SET ai_structured = ? WHERE id = ?")
        .bind(ai_structured)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_common_info(
    pool: State<'_, DbPool>,
) -> Result<Vec<crate::models::CommonInfo>, String> {
    sqlx::query_as::<_, crate::models::CommonInfo>("SELECT * FROM common_info")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_common_info_structured(
    pool: State<'_, DbPool>,
    id: String,
    ai_structured: String,
) -> Result<(), String> {
    sqlx::query("UPDATE common_info SET ai_structured = ? WHERE id = ?")
        .bind(ai_structured)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_common_info(
    pool: State<'_, DbPool>,
    key: String,
    value: String,
    remarks: Option<String>,
    info_type: Option<String>,
    file_path: Option<String>,
    url: Option<String>,
    category: Option<String>,
    ai_structured: Option<String>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO common_info (id, key, value, remarks, info_type, file_path, url, category, ai_structured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, remarks = excluded.remarks, info_type = excluded.info_type, file_path = excluded.file_path, url = excluded.url, category = excluded.category, ai_structured = excluded.ai_structured",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(key)
    .bind(value)
    .bind(remarks)
    .bind(info_type.unwrap_or_else(|| "text".to_string()))
    .bind(file_path)
    .bind(url)
    .bind(category.unwrap_or_else(|| "通用".to_string()))
    .bind(ai_structured)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_common_info(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM common_info WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_settings(pool: State<'_, DbPool>) -> Result<Vec<crate::models::Setting>, String> {
    sqlx::query_as::<_, crate::models::Setting>("SELECT * FROM settings")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_setting(
    pool: State<'_, DbPool>,
    key: String,
    value: String,
) -> Result<(), String> {
    // 改为 UPSERT，方便新增自定义提示词等配置项
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_project_meta_history(
    pool: State<'_, DbPool>,
) -> Result<(Vec<String>, Vec<String>), String> {
    let cities: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT city FROM projects WHERE city IS NOT NULL AND city != ''",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let types: Vec<String> = sqlx::query_scalar("SELECT DISTINCT project_type FROM projects WHERE project_type IS NOT NULL AND project_type != ''")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok((cities, types))
}

#[tauri::command]
pub async fn cleanup_trash_auto(pool: State<'_, DbPool>) -> Result<usize, String> {
    let retention_str: String =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'trash_retention_days'")
            .fetch_one(&*pool)
            .await
            .unwrap_or_else(|_| "10".to_string());

    let days = retention_str.parse::<i64>().unwrap_or(10);

    let expired_files = sqlx::query_as::<_, crate::models::ProjectFile>(
        "SELECT * FROM files WHERE is_deleted = 1 AND created_at < datetime('now', ?)",
    )
    .bind(format!("-{} days", days))
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let count = expired_files.len();
    for file in expired_files {
        let path = Path::new(&file.path);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        let _ = sqlx::query("DELETE FROM files WHERE id = ?")
            .bind(file.id)
            .execute(&*pool)
            .await;
    }

    Ok(count)
}

// --- Automation Schemes & Instructions ---

#[tauri::command]
pub async fn list_automation_schemes(
    pool: State<'_, DbPool>,
    project_id: Option<String>,
) -> Result<Vec<crate::models::AutomationScheme>, String> {
    let query = if let Some(pid) = project_id {
        sqlx::query_as::<_, crate::models::AutomationScheme>(
            "SELECT * FROM automation_schemes WHERE project_id = ? OR project_id IS NULL ORDER BY updated_at DESC"
        ).bind(pid)
    } else {
        sqlx::query_as::<_, crate::models::AutomationScheme>(
            "SELECT * FROM automation_schemes WHERE project_id IS NULL ORDER BY updated_at DESC",
        )
    };

    query.fetch_all(&*pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_automation_scheme(
    pool: State<'_, DbPool>,
    id: Option<String>,
    project_id: Option<String>,
    name: String,
    description: Option<String>,
) -> Result<String, String> {
    let final_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO automation_schemes (id, project_id, name, description, updated_at) VALUES (?, ?, ?, ?, datetime('now')) 
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, project_id = excluded.project_id, updated_at = datetime('now')"
    )
    .bind(&final_id)
    .bind(project_id)
    .bind(name)
    .bind(description)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(final_id)
}

#[tauri::command]
pub async fn delete_automation_scheme(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    // Also delete child instructions
    sqlx::query("DELETE FROM automation_instructions WHERE scheme_id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM automation_schemes WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_automation_instructions(
    pool: State<'_, DbPool>,
    scheme_id: String,
) -> Result<Vec<crate::models::AutomationInstruction>, String> {
    sqlx::query_as::<_, crate::models::AutomationInstruction>(
        "SELECT * FROM automation_instructions WHERE scheme_id = ? ORDER BY order_index ASC",
    )
    .bind(scheme_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_automation_instruction(
    pool: State<'_, DbPool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM automation_instructions WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn upsert_automation_instruction(
    pool: State<'_, DbPool>,
    id: Option<String>,
    scheme_id: String,
    op_type: String,
    data_source_type: String,
    source_file_path: Option<String>,
    source_params: Option<String>,
    target_params: Option<String>,
    order_index: i32,
) -> Result<(), String> {
    let final_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO automation_instructions (id, scheme_id, op_type, data_source_type, source_file_path, source_params, target_params, order_index) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET 
            op_type = excluded.op_type, 
            data_source_type = excluded.data_source_type, 
            source_file_path = excluded.source_file_path,
            source_params = excluded.source_params,
            target_params = excluded.target_params,
            order_index = excluded.order_index"
    )
    .bind(final_id)
    .bind(scheme_id)
    .bind(op_type)
    .bind(data_source_type)
    .bind(source_file_path)
    .bind(source_params)
    .bind(target_params)
    .bind(order_index)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_design_context(
    pool: State<'_, DbPool>,
    project_id: Option<String>,
) -> Result<String, String> {
    // 1. 获取全局通用信息 (合同、参数、报价等)
    let common_data: Vec<crate::models::CommonInfo> = sqlx::query_as("SELECT * FROM common_info")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut ctx = String::from("## 全局通用参考信息 (合同/参数/报价)\n");
    if common_data.is_empty() {
        ctx.push_str("暂无全局参考数据。\n\n");
    } else {
        for info in common_data {
            ctx.push_str(&format!("- [{}] {}: {} (备注: {})\n", 
                info.category.unwrap_or_else(|| "未分类".to_string()),
                info.key, 
                info.value,
                info.remarks.unwrap_or_default()));
        }
        ctx.push_str("\n");
    }

    if let Some(pid) = project_id {
        // 2. 获取项目全量字段 (动态序列化)
        let project_val: serde_json::Value = sqlx_query_as_json("SELECT * FROM projects WHERE id = ?", &pid, &*pool).await?;
        
        // 3. 获取勘察记录
        let survey_val: serde_json::Value = sqlx_query_as_json("SELECT * FROM surveys WHERE project_id = ?", &pid, &*pool).await?;

        // 4. 获取文件列表（需要完整字段以匹配 ProjectFile 结构）
        let files = sqlx::query_as::<_, ProjectFile>("SELECT * FROM files WHERE project_id = ? AND is_deleted = 0")
            .bind(&pid)
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        // 5. 获取自动化方案及其详细指令（同样使用 * 以匹配结构体字段）
        let schemes = sqlx::query_as::<_, crate::models::AutomationScheme>("SELECT * FROM automation_schemes WHERE project_id = ? OR project_id IS NULL")
            .bind(&pid)
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        // 构造项目具体内容
        ctx.push_str(&format!("## 当前项目核心数据 (ID: {})\n```json\n{}\n```\n\n", 
            pid,
            serde_json::to_string_pretty(&project_val).unwrap_or_default()));

        ctx.push_str("## 勘察详情\n");
        if !survey_val.is_null() && survey_val.as_array().map_or(false, |a| !a.is_empty()) {
            ctx.push_str(&format!("```json\n{}\n```\n\n", serde_json::to_string_pretty(&survey_val).unwrap_or_default()));
        } else {
            ctx.push_str("暂无勘察记录\n\n");
        }

        ctx.push_str("## 现存设计文件资产\n");
        if files.is_empty() {
            ctx.push_str("暂无已导入文件\n\n");
        } else {
            for f in files {
                ctx.push_str(&format!("- [{}] {} (阶段: {}, 备注: {})\n", 
                    f.category, f.name, f.stage, f.remarks.unwrap_or_default()));
            }
            ctx.push_str("\n");
        }

        ctx.push_str("## 自动化逻辑与执行方案\n");
        if schemes.is_empty() {
            ctx.push_str("  暂无配置好的自动化方案\n");
        } else {
            for s in schemes {
                ctx.push_str(&format!("### 方案: {}\n说明: {}\n", s.name, s.description.unwrap_or_default()));
                // 获取具体的指令明细
                let inst: Vec<crate::models::AutomationInstruction> = sqlx::query_as("SELECT * FROM automation_instructions WHERE scheme_id = ? ORDER BY order_index ASC")
                    .bind(&s.id)
                    .fetch_all(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                
                if inst.is_empty() {
                    ctx.push_str("  - (暂无关联指令)\n");
                } else {
                    for i in inst {
                        ctx.push_str(&format!("  - [{}] 操作: {}, 来源: {}, 目标: {}\n", 
                            i.order_index, i.op_type, i.data_source_type, i.target_params.unwrap_or_default()));
                    }
                }
                ctx.push_str("\n");
            }
        }

        Ok(ctx)
    } else {
        ctx.push_str("## 状态提示\n目前未进入任何特定项目。AI 助手现在处于全局通用模式，主要参考上述全局参考信息。");
        Ok(ctx)
    }
}

// 辅助函数：将查询结果直接转为 JSON Value (通用动态化)
async fn sqlx_query_as_json(query: &str, id: &str, pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<serde_json::Value, String> {
    use sqlx::{Row, Column};
    use serde_json::json;
    let row = sqlx::query(query)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    match row {
        Some(r) => {
            let mut map = serde_json::Map::new();
            for col in r.columns() {
                let name = col.name();
                let val: Option<String> = r.try_get(name).unwrap_or(None);
                map.insert(name.to_string(), json!(val));
            }
            Ok(serde_json::Value::Object(map))
        },
        None => Ok(serde_json::Value::Null)
    }
}

#[tauri::command]
pub async fn run_browser_script(
    app: tauri::AppHandle,
    window_label: String,
    script: String,
) -> Result<(), String> {
    use tauri::Manager;
    let window = app
        .get_webview_window(&window_label)
        .ok_or_else(|| format!("找不到窗口: {}", window_label))?;

    window
        .eval(&script)
        .map_err(|e| format!("脚本执行失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn rename_file(from: String, to: String) -> Result<(), String> {
    let source = Path::new(&from);
    let target = Path::new(&to);
    if !source.exists() {
        return Err(format!("源文件不存在: {}", from));
    }
    if target.exists() {
        return Err(format!("目标文件已存在: {}", to));
    }
    fs::rename(source, target).map_err(|e| format!("重命名失败: {}", e))?;
    Ok(())
}
