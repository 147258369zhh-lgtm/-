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

// ═══════════════════════════════════════════════
// v3: Learning Agent Types
// ═══════════════════════════════════════════════

/// Task intent classification
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskIntent {
    InformationGathering,  // 信息采集（搜索、爬虫、查询）
    DataAnalysis,          // 数据分析（Excel、统计、图表）
    DocumentGeneration,    // 文档生成（报告、Word、PPT）
    FileOperation,         // 文件操作（读写、移动、压缩）
    SystemCommand,         // 系统命令（安装、编译、脚本）
    ContentCreation,       // 内容创作（翻译、写作、转换）
    Unknown,               // 无法识别
}

/// Task complexity level
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskComplexity {
    Simple,   // 1-2 steps
    Medium,   // 3-4 steps
    Complex,  // 5+ steps
}

/// Structured task (extracted from user's natural language)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredTask {
    pub goal: String,
    pub intent: TaskIntent,
    pub keywords: Vec<String>,
    pub inputs: Vec<String>,         // input sources (files, URLs, text)
    pub expected_output: String,     // what user expects
    pub required_tools: Vec<String>, // filtered tool list
    pub complexity: TaskComplexity,
}

/// Agent role definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRole {
    pub name: String,
    pub expertise: Vec<String>,
}

/// Execution constraints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConstraints {
    pub max_retries_per_step: u32,
    pub max_total_failures: u32,
    pub timeout_per_step_secs: u64,
    pub fallback_strategy: String,  // "skip", "retry", "replan"
}

/// Agent configuration object (NOT a prompt!)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub role: AgentRole,
    pub tools: Vec<String>,              // filtered tool names
    pub constraints: ExecutionConstraints,
}

/// Agent execution score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentScore {
    pub accuracy: u8,     // 0-10: did it meet the goal?
    pub efficiency: u8,   // 0-10: steps used vs optimal
    pub tool_usage: u8,   // 0-10: right tools chosen?
}

/// Experience record (written after each task execution)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experience {
    pub id: String,
    pub task_summary: String,
    pub intent: TaskIntent,
    pub plan_json: String,
    pub tools_used: Vec<String>,
    pub success: bool,
    pub score: AgentScore,
    pub failure_reason: Option<String>,
    pub created_at: String,
}

/// Tool knowledge entry
#[derive(Debug, Clone)]
pub struct ToolKnowledge {
    pub name: String,
    pub best_for: Vec<&'static str>,
    pub not_for: Vec<&'static str>,
    pub common_failures: Vec<&'static str>,
    pub fallback: Option<&'static str>,
}

/// Stop decision from the independent stop judge
#[derive(Debug, Clone, PartialEq)]
pub enum StopDecision {
    Continue,
    StopSuccess(String),
    StopFailure(String),
}

// ═══════════════════════════════════════════════
// v3.1: Structured Plan, Failure, Blueprint
// ═══════════════════════════════════════════════

/// Structured plan node (replaces flat PlanStep for execution)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanNode {
    pub id: u32,
    pub goal: String,
    pub recommended_tool: String,
    pub preconditions: Vec<String>,
    pub success_criteria: String,
    pub fallback_tool: Option<String>,
    pub status: StepStatus,
    pub result: Option<String>,
}

/// Failure categorization labels
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureCategory {
    WrongToolSelection,
    BadToolParameter,
    MissingPrecondition,
    ContextOverload,
    LoopingBehavior,
    WeakPlan,
    NetworkError,
    TimeoutExceeded,
    AmbiguousTask,
}

/// Cost budget for execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostBudget {
    pub max_steps: u32,
    pub max_tool_calls: u32,
    pub max_time_secs: u64,
}

impl Default for CostBudget {
    fn default() -> Self {
        Self {
            max_steps: 10,
            max_tool_calls: 30,
            max_time_secs: 300,
        }
    }
}

/// Tool scope for an Agent (included/excluded/high-risk)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolScope {
    pub included: Vec<String>,
    pub excluded: Vec<String>,
}

/// Agent Blueprint — a reusable, saveable Agent definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentBlueprint {
    pub id: String,
    pub name: String,
    pub persona: String,
    pub goal_template: String,
    pub tool_scope: ToolScope,
    pub workflow_template: Vec<PlanNode>,
    pub constraints: ExecutionConstraints,
    pub success_criteria: Vec<String>,
    pub version: String,
    pub created_at: String,
}

