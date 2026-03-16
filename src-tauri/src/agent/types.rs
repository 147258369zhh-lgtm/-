use serde::{Deserialize, Serialize};
use serde_json::Value;

// ═══════════════════════════════════════════════
// Core Agent Types
// ═══════════════════════════════════════════════

/// A single tool definition in OpenAI function calling format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

/// Request from frontend to run the agent
#[derive(Debug, Deserialize)]
pub struct AgentRunRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub project_id: Option<String>,
    pub allowed_paths: Option<Vec<String>>,
    pub max_rounds: Option<u32>,
    pub model_config_id: Option<String>,
    pub goal: Option<String>,
    pub task_id: Option<String>,
    pub enabled_tools: Option<Vec<String>>,
    pub context_files: Option<Vec<String>>,
}

/// A single step in the agent execution log
#[derive(Debug, Clone, Serialize)]
pub struct AgentStep {
    pub round: u32,
    pub step_type: String,
    pub tool_name: Option<String>,
    pub tool_args: Option<Value>,
    pub tool_result: Option<String>,
    pub content: Option<String>,
    pub duration_ms: Option<u64>,
}

/// Final result returned to frontend
#[derive(Debug, Serialize)]
pub struct AgentRunResult {
    pub success: bool,
    pub final_answer: String,
    pub steps: Vec<AgentStep>,
    pub total_rounds: u32,
    pub error: Option<String>,
}

/// Event payload emitted to frontend during execution
#[derive(Debug, Clone, Serialize)]
pub struct AgentEvent {
    pub event_type: String,
    pub step: Option<AgentStep>,
    pub message: Option<String>,
}

// ═══════════════════════════════════════════════
// v2: Structured Plan Types
// ═══════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StepStatus {
    Pending,
    Running,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: u32,
    pub task: String,
    pub status: StepStatus,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPlan {
    pub steps: Vec<PlanStep>,
}

/// Runtime context passed between modules
#[derive(Debug, Clone)]
pub struct AgentContext {
    pub goal: String,
    pub task_id: String,
    pub plan: Option<AgentPlan>,
    pub current_step_index: usize,
    pub completed_steps: Vec<PlanStep>,
    pub failure_count: u32,
    pub tools: Vec<ToolDef>,
    pub system_prompt: String,
    pub messages: Vec<Value>,
}

/// LLM provider config needed for API calls
#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub endpoint: String,
    pub api_key: String,
    pub model_name: String,
    pub is_local: bool,
}
