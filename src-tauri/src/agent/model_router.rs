use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Agent Runtime V5 — Model Router
//
// Routes LLM calls to the right model based on task type.
// Falls back gracefully if the preferred model is unavailable.
// ═══════════════════════════════════════════════════════════════

pub struct ModelRouter {
    profiles: Vec<ModelProfile>,
    /// The always-available fallback (from ai_configs.is_active)
    default: LlmConfig,
}

impl ModelRouter {
    pub fn new(default: LlmConfig) -> Self {
        Self { profiles: vec![], default }
    }

    pub fn with_profiles(mut self, profiles: Vec<ModelProfile>) -> Self {
        self.profiles = profiles;
        self
    }

    /// Select the best model config for a given task type.
    pub fn select(&self, capability: ModelCapability) -> LlmConfig {
        // Find a model that matches the requested capability
        if let Some(p) = self.profiles.iter().find(|p| p.capabilities.contains(&capability)) {
            app_log!("MODEL_ROUTER", "→ {} (capability={:?})", p.model_name, capability);
            return LlmConfig {
                endpoint: resolve_endpoint(&p.endpoint),
                api_key: p.api_key.clone(),
                model_name: p.model_name.clone(),
            };
        }
        // Fallback to default active model
        app_log!("MODEL_ROUTER", "→ default (no profile matched {:?})", capability);
        self.default.clone()
    }

    /// Agent/ReAct runs → prefer planning-capable model
    pub fn for_agent(&self) -> LlmConfig {
        self.select(ModelCapability::Planning)
    }

    /// Blueprint generation → prefer planning model
    pub fn for_blueprint(&self) -> LlmConfig {
        self.select(ModelCapability::Planning)
    }

    /// Document extraction → prefer long-context model
    pub fn for_extraction(&self) -> LlmConfig {
        self.select(ModelCapability::DocumentExtraction)
    }

    /// Code generation → prefer coding model
    pub fn for_coding(&self) -> LlmConfig {
        self.select(ModelCapability::Coding)
    }
}

fn resolve_endpoint(url: &str) -> String {
    if url.ends_with("/chat/completions") {
        url.to_string()
    } else if url.ends_with('/') {
        format!("{}chat/completions", url)
    } else {
        format!("{}/chat/completions", url)
    }
}
