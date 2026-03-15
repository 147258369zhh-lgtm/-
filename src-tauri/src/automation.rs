use crate::db::DbPool;
use crate::models::{AutomationInstruction, AutomationScheme};
use chrono::Local;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use tauri::State;
use zip::write::SimpleFileOptions;

#[derive(Debug, Serialize, Deserialize)]
pub struct AutomationRunRequest {
    pub project_id: String,
    pub scheme_id: String,
    pub target_file_path: Option<String>, // 若手动选择则由此处提供
    pub export_pdf: bool,
}

#[tauri::command]
pub async fn run_automation_v2(
    pool: State<'_, DbPool>,
    req: AutomationRunRequest,
) -> Result<String, String> {
    // 1. 获取方案与指令
    let scheme =
        sqlx::query_as::<_, AutomationScheme>("SELECT * FROM automation_schemes WHERE id = ?")
            .bind(&req.scheme_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| format!("方案不存在: {}", e))?;

    let instructions = sqlx::query_as::<_, AutomationInstruction>(
        "SELECT * FROM automation_instructions WHERE scheme_id = ? ORDER BY order_index ASC",
    )
    .bind(&req.scheme_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("指令拉取失败: {}", e))?;

    if instructions.is_empty() {
        return Err("该方案下没有任何指令".to_string());
    }

    // 2. 确定目标文件（取第一条指令代表的目标，或由请求提供）
    // 实际上新逻辑是：复制出一个副本，然后在副本上串行跑完所有指令。
    // 我们假设首个指令提供的内容来源即为目标文件（副本的蓝本）。
    // 在真实场景中，用户可能需要选择一个“底稿文件”。

    // 简单起见，从项目文件库找一个 docx/xlsx 作为蓝本（稍后由前端传参优化）
    let base_file_path = req.target_file_path.ok_or("请指定底稿文件路径")?;
    let base_path = Path::new(&base_file_path);
    if !base_path.exists() {
        return Err("底稿文件不存在".to_string());
    }

    // 3. 准备副本路径：项目名称 + 方案名 + 时间
    let project =
        sqlx::query_as::<_, crate::models::Project>("SELECT * FROM projects WHERE id = ?")
            .bind(&req.project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let ext = base_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("docx");
    let new_file_name = format!("{}_{}_{}.{}", project.name, scheme.name, timestamp, ext);
    let dest_path = Path::new(&project.path).join("文件").join(&new_file_name);

    fs::copy(base_path, &dest_path).map_err(|e| format!("副本创建失败: {}", e))?;

    // 4. 执行指令流水线
    for inst in instructions {
        let data = get_source_data(&inst).await?;

        match inst.op_type.as_str() {
            "WordReplace" => {
                if ext == "docx" {
                    process_word_replace(
                        &dest_path,
                        &inst.target_params.unwrap_or_default(),
                        &data,
                    )?;
                }
            }
            "ExcelWrite" => {
                if ext == "xlsx" {
                    // process_excel_write(...)
                }
            }
            "FileNameChange" => {
                // 后端处理完所有替换后，最后可以改名。此处逻辑需略微调整为结束时统一改名。
            }
            _ => {}
        }
    }

    // 5. 自动注册到库
    let new_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO files (id, project_id, name, path, category, stage, version, is_latest) 
         VALUES (?, ?, ?, ?, '联动结果', ?, 1, 1)",
    )
    .bind(&new_id)
    .bind(&req.project_id)
    .bind(&new_file_name)
    .bind(dest_path.to_string_lossy().to_string())
    .bind(&project.stage)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(format!(
        "方案【{}】执行成功，生成文件：{}",
        scheme.name, new_file_name
    ))
}

async fn get_source_data(inst: &AutomationInstruction) -> Result<String, String> {
    match inst.data_source_type.as_str() {
        "Static" => Ok(inst.source_params.clone().unwrap_or_default()),
        "ExcelCell" => {
            // TODO: 调用 Excel 读逻辑
            Ok("EXCEL_VAL".to_string())
        }
        "WordParagraph" => {
            // TODO: 调用 Word 段落提取逻辑
            Ok("WORD_EXTRACT".to_string())
        }
        _ => Err("未知数据源".to_string()),
    }
}

fn process_word_replace(file_path: &Path, target: &str, value: &str) -> Result<(), String> {
    // 采用流式内存替换，覆盖 document.xml 及页眉页脚
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // 临时目录处理
    let temp_file_path = file_path.with_extension("tmp");
    let dest_file = File::create(&temp_file_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(dest_file);

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();

        let options = SimpleFileOptions::default()
            .compression_method(f.compression())
            .unix_permissions(f.unix_mode().unwrap_or(0o755));

        zip.start_file(name.clone(), options)
            .map_err(|e| e.to_string())?;

        if name.ends_with(".xml")
            && (name.contains("word/document")
                || name.contains("word/header")
                || name.contains("word/footer"))
        {
            let mut content = String::new();
            f.read_to_string(&mut content).map_err(|e| e.to_string())?;

            let pattern = format!(r"\{{\{{\s*{}\s*\}}\}}", regex::escape(target));
            let re = Regex::new(&pattern).unwrap();
            let replaced = re.replace_all(&content, value).to_string();

            zip.write_all(replaced.as_bytes())
                .map_err(|e| e.to_string())?;
        } else {
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    // 覆盖原副本
    fs::rename(temp_file_path, file_path).map_err(|e| e.to_string())?;

    Ok(())
}
