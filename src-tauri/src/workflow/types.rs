// ═══════════════════════════════════════════════════════
// Workflow Engine — Core Types
// ═══════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Workflow Definition ──────────────────────────────

/// A complete workflow definition (persisted)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<WorkflowNode>,
    pub version: u32,
    pub created_at: String,
    pub updated_at: String,
}

/// A single node in the workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub name: String,
    pub node_type: NodeType,
    pub config: NodeConfig,
    /// Index of the next node (None = end of workflow)
    pub next_node: Option<String>,
    /// Condition to evaluate before executing (optional)  
    pub condition: Option<String>,
}

/// The three fundamental node types
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Agent,
    Skill,
    Human,
}

/// Node-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    // ── Agent node config ──
    /// The prompt / goal for the agent to execute
    pub prompt: Option<String>,
    /// System prompt override for this agent node
    pub system_prompt: Option<String>,
    /// Which tools the agent can use
    pub allowed_tools: Option<Vec<String>>,
    /// Max execution rounds for agent
    pub max_rounds: Option<u32>,
    /// Model config id override for this node
    pub model_config_id: Option<String>,

    // ── Skill node config ──
    /// Skill ID to execute
    pub skill_id: Option<String>,
    /// Input parameters for the skill
    pub skill_params: Option<Value>,

    // ── Human node config ──
    /// Message to display to the user
    pub human_message: Option<String>,
    /// What kind of human input is needed
    pub human_input_type: Option<HumanInputType>,
    /// Timeout in seconds (0 = wait forever)
    pub human_timeout_secs: Option<u64>,

    // ── Shared config ──
    /// Retry count on failure
    pub retry_count: Option<u32>,
    /// Timeout for this node in seconds
    pub timeout_secs: Option<u64>,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            prompt: None,
            system_prompt: None,
            allowed_tools: None,
            max_rounds: None,
            model_config_id: None,
            skill_id: None,
            skill_params: None,
            human_message: None,
            human_input_type: None,
            human_timeout_secs: None,
            retry_count: Some(1),
            timeout_secs: Some(300),
        }
    }
}

/// Types of human interaction
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HumanInputType {
    /// Simple confirm/reject
    Confirm,
    /// Free-form text input
    TextInput,
    /// Edit existing content
    Edit,
    /// File selection
    FileSelect,
    /// Review and approve
    Review,
}

// ── Workflow Execution ──────────────────────────────

/// Status of a workflow execution
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    Created,
    Running,
    Paused,
    WaitingHuman,
    Completed,
    Failed,
    Cancelled,
}

impl WorkflowStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Running => "running",
            Self::Paused => "paused",
            Self::WaitingHuman => "waiting_human",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "created" => Self::Created,
            "running" => Self::Running,
            "paused" => Self::Paused,
            "waiting_human" => Self::WaitingHuman,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            _ => Self::Created,
        }
    }
}

/// A running instance of a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecution {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub status: WorkflowStatus,
    pub current_node_index: usize,
    pub total_nodes: usize,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error: Option<String>,
    pub result: Option<Value>,
}

/// Result of a single node execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResult {
    pub node_id: String,
    pub node_name: String,
    pub node_type: NodeType,
    pub success: bool,
    pub output: Option<Value>,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub started_at: String,
    pub completed_at: String,
}

/// Step log entry (persisted)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepLog {
    pub id: String,
    pub execution_id: String,
    pub node_index: usize,
    pub node_type: String,
    pub status: String,
    pub input_json: Option<String>,
    pub output_json: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

/// Checkpoint for resuming an interrupted workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowCheckpoint {
    pub execution_id: String,
    pub current_node_index: usize,
    pub accumulated_results: Vec<NodeResult>,
    pub context_data: Value,
    pub saved_at: String,
}

// ── Events (emitted to frontend) ──────────────────

/// Event payload emitted to frontend during workflow execution
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowEvent {
    pub execution_id: String,
    pub event_type: WorkflowEventType,
    pub node_index: Option<usize>,
    pub node_name: Option<String>,
    pub message: Option<String>,
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowEventType {
    Started,
    NodeStarted,
    NodeCompleted,
    NodeFailed,
    WaitingHuman,
    HumanResponded,
    Paused,
    Resumed,
    Completed,
    Failed,
    Cancelled,
}

// ── Request types (from frontend) ──────────────────

/// Request to create a new workflow
#[derive(Debug, Deserialize)]
pub struct CreateWorkflowRequest {
    pub name: String,
    pub description: String,
    pub nodes: Vec<WorkflowNode>,
}

/// Request to run a workflow
#[derive(Debug, Deserialize)]
pub struct RunWorkflowRequest {
    pub workflow_id: String,
    /// Optional initial context data
    pub context: Option<Value>,
}

/// Human node response from frontend
#[derive(Debug, Deserialize)]
pub struct HumanNodeResponse {
    pub execution_id: String,
    pub node_id: String,
    pub action: HumanAction,
    pub data: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HumanAction {
    Approve,
    Reject,
    Edit,
    Input,
    Skip,
}
