// ═══════════════════════════════════════════════════════
// Multi-Model Router — Capability-Based Model Selection
// ═══════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};

/// Capability types that different models excel at
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelCapability {
    /// Complex planning, multi-step reasoning
    Planning,
    /// Document understanding, OCR, layout
    DocumentExtraction,
    /// Code generation and review
    CodeGeneration,
    /// Simple text tasks, classification
    SimpleText,
    /// Vision tasks (image understanding)
    Vision,
    /// Tool use / function calling
    ToolUse,
}

/// A model configuration for routing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub api_key: String,
    pub model_name: String,
    /// What this model is good at
    pub capabilities: Vec<ModelCapability>,
    /// Priority (lower = preferred)
    pub priority: u8,
    /// Cost per 1K tokens (for budget control)
    pub cost_per_1k_tokens: f64,
    /// Max tokens this model supports
    pub max_tokens: u32,
    pub enabled: bool,
}

/// The model router selects the best model for a given task
pub struct ModelRouter {
    models: Vec<ModelConfig>,
    /// Default model ID for fallback
    default_model_id: Option<String>,
}

impl ModelRouter {
    pub fn new() -> Self {
        Self {
            models: Vec::new(),
            default_model_id: None,
        }
    }

    /// Add a model to the router
    pub fn add_model(&mut self, config: ModelConfig) {
        if self.default_model_id.is_none() {
            self.default_model_id = Some(config.id.clone());
        }
        self.models.push(config);
    }

    /// Set the default fallback model
    pub fn set_default(&mut self, model_id: &str) {
        self.default_model_id = Some(model_id.to_string());
    }

    /// Select the best model for a given capability
    pub fn select(&self, capability: &ModelCapability) -> Option<&ModelConfig> {
        // Find all enabled models that support this capability
        let mut candidates: Vec<&ModelConfig> = self.models.iter()
            .filter(|m| m.enabled && m.capabilities.contains(capability))
            .collect();

        // Sort by priority (lower = better)
        candidates.sort_by_key(|m| m.priority);

        candidates.first().copied()
            .or_else(|| self.get_default())
    }

    /// Select the cheapest model for simple tasks
    pub fn select_cheapest(&self) -> Option<&ModelConfig> {
        self.models.iter()
            .filter(|m| m.enabled)
            .min_by(|a, b| a.cost_per_1k_tokens.partial_cmp(&b.cost_per_1k_tokens).unwrap_or(std::cmp::Ordering::Equal))
    }

    /// Get the default model
    pub fn get_default(&self) -> Option<&ModelConfig> {
        self.default_model_id.as_ref()
            .and_then(|id| self.models.iter().find(|m| &m.id == id && m.enabled))
            .or_else(|| self.models.iter().find(|m| m.enabled))
    }

    /// Infer the best capability type from a task description
    pub fn infer_capability(task: &str) -> ModelCapability {
        let task_lower = task.to_lowercase();

        if task_lower.contains("计划") || task_lower.contains("规划") || task_lower.contains("plan") || task_lower.contains("分析") {
            ModelCapability::Planning
        } else if task_lower.contains("代码") || task_lower.contains("code") || task_lower.contains("编程") || task_lower.contains("函数") {
            ModelCapability::CodeGeneration
        } else if task_lower.contains("文档") || task_lower.contains("ocr") || task_lower.contains("pdf") || task_lower.contains("提取") {
            ModelCapability::DocumentExtraction
        } else if task_lower.contains("图片") || task_lower.contains("图像") || task_lower.contains("截图") || task_lower.contains("image") {
            ModelCapability::Vision
        } else if task_lower.contains("工具") || task_lower.contains("调用") || task_lower.contains("tool") || task_lower.contains("执行") {
            ModelCapability::ToolUse
        } else {
            ModelCapability::SimpleText
        }
    }

    /// List all registered models
    pub fn list_models(&self) -> &[ModelConfig] {
        &self.models
    }
}
