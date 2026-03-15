use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub number: Option<String>,
    pub city: Option<String>,
    pub project_type: Option<String>,
    pub created_at: String,
    pub path: String,
    pub remarks: Option<String>,
    pub last_opened_at: Option<String>,
    pub stage: String,
    pub summary: Option<String>,
    pub ai_profile: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct ProjectFile {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub original_name: Option<String>,
    pub path: String,
    pub category: String,
    pub stage: String,
    pub version: i32,
    pub created_at: String,
    pub is_latest: bool,
    pub is_deleted: bool,
    pub remarks: Option<String>,
    pub ai_summary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Survey {
    pub project_id: String,
    pub date: Option<String>,
    pub location: Option<String>,
    pub surveyor: Option<String>,
    pub summary: Option<String>,
    pub ai_structured: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct SurveyMedia {
    pub id: String,
    pub survey_id: String,
    pub project_id: String,
    pub path: String,
    pub media_type: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub stage: Option<String>,
    pub label: Option<String>,
    pub name_pattern: Option<String>,
    pub source_file_path: Option<String>,
    pub ai_structured: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct CommonInfo {
    pub id: String,
    pub key: String,
    pub value: String,
    pub remarks: Option<String>,
    pub info_type: Option<String>,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub category: Option<String>,
    pub ai_structured: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct AutomationScheme {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct AutomationInstruction {
    pub id: String,
    pub scheme_id: String,
    pub op_type: String,
    pub data_source_type: String,
    pub source_file_path: Option<String>,
    pub source_params: Option<String>,
    pub target_params: Option<String>,
    pub order_index: i32,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub remarks: Option<String>,
}
