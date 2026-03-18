use serde::{Deserialize, Serialize};
use serde_json::Value;

// ═══════════════════════════════════════════════════════════════
// Agent V5 — Type System
// Aligned with OpenAI Chat Completions API / Function Calling
// ═══════════════════════════════════════════════════════════════

// ─── LLM Config ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub endpoint: String,
    pub api_key: String,
    pub model_name: String,
}

// ─── Tool Definitions (sent to LLM) ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub tool_type: String, // always "function"
    pub function: ToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

// ─── Conversation Messages ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// A single message in the conversation history.
/// Fully aligned with OpenAI Chat Completions API format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    /// Text content (None when role=assistant with tool_calls)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Tool calls requested by the LLM (role=assistant only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Links a tool result back to the tool_call (role=tool only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// Tool name (role=tool only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl Message {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: MessageRole::System, content: Some(content.into()), tool_calls: None, tool_call_id: None, name: None }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self { role: MessageRole::User, content: Some(content.into()), tool_calls: None, tool_call_id: None, name: None }
    }
    pub fn assistant_text(content: impl Into<String>) -> Self {
        Self { role: MessageRole::Assistant, content: Some(content.into()), tool_calls: None, tool_call_id: None, name: None }
    }
    pub fn assistant_tool_calls(calls: Vec<ToolCall>) -> Self {
        Self { role: MessageRole::Assistant, content: None, tool_calls: Some(calls), tool_call_id: None, name: None }
    }
    pub fn tool_result(call_id: impl Into<String>, tool_name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::Tool,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: Some(call_id.into()),
            name: Some(tool_name.into()),
        }
    }
}

// ─── Tool Calls (LLM → Runtime) ──────────────────────────────────

/// A tool call requested by the LLM in its response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String, // always "function"
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    /// Raw JSON string from LLM (parsed lazily)
    pub arguments: String,
}

impl ToolCall {
    /// Parse arguments string into a serde_json::Value
    pub fn parsed_args(&self) -> Value {
        serde_json::from_str(&self.function.arguments).unwrap_or(Value::Object(Default::default()))
    }
}

// ─── Session State ────────────────────────────────────────────────

/// Full state for one agent execution session.
/// The LLM is stateless; we carry all history here.
#[derive(Debug, Clone)]
pub struct SessionState {
    pub session_id: String,
    pub goal: String,
    /// Full conversation history (system + user + assistant + tool results)
    pub messages: Vec<Message>,
    pub round: u32,
    pub max_rounds: u32,
    pub tools: Vec<ToolDef>,
    pub allowed_paths: Option<Vec<String>>,
}

// ─── ReAct Loop Action ────────────────────────────────────────────

/// What the engine does after each LLM response.
#[derive(Debug)]
pub enum LoopAction {
    /// LLM wants to call tools — continue the loop
    CallTools(Vec<ToolCall>),
    /// LLM produced a final text answer — stop the loop
    FinalAnswer(String),
    /// Unrecoverable error
    Error(String),
}

// ─── Tool Execution Result ────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ToolResult {
    pub call_id: String,
    pub tool_name: String,
    pub content: String,
    pub success: bool,
    pub duration_ms: u64,
}

// ─── Frontend ↔ Backend DTOs ──────────────────────────────────────

/// Frontend → Backend request
#[derive(Debug, Deserialize)]
pub struct AgentRunRequest {
    pub prompt: String,
    pub goal: Option<String>,
    pub system_prompt: Option<String>,
    pub project_id: Option<String>,
    pub allowed_paths: Option<Vec<String>>,
    pub max_rounds: Option<u32>,
    pub model_config_id: Option<String>,
    pub task_id: Option<String>,
    pub enabled_tools: Option<Vec<String>>,
    pub context_files: Option<Vec<String>>,
    pub triggered_by: Option<String>,
}

/// Backend → Frontend result
#[derive(Debug, Serialize)]
pub struct AgentRunResult {
    pub success: bool,
    pub final_answer: String,
    pub steps: Vec<AgentStep>,
    pub total_rounds: u32,
    pub error: Option<String>,
}

/// Single step event (emitted via agent-event)
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

/// Event payload emitted to frontend
#[derive(Debug, Clone, Serialize)]
pub struct AgentEvent {
    pub event_type: String,
    pub step: Option<AgentStep>,
    pub message: Option<String>,
}

// ─── Blueprint Types (V2) ─────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BlueprintInfo {
    pub id: String,
    pub name: String,
    pub persona: String,
    pub goal_template: String,
    pub tool_count: usize,
    pub workflow_steps: usize,
    // Asset versioning — Single Source of Truth
    // Canvas / test / production all reference the same (id, version)
    pub version: String,
    pub status: BlueprintStatus,       // draft -> tested -> published -> deprecated
    pub created_at: String,
    pub workflow_template: Vec<WorkflowStepInfo>,
    pub complexity: u8,
    pub tags: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct WorkflowStepInfo {
    pub id: u32,
    pub goal: String,
    pub tool: String,
    pub default_args: Value,
    pub depends_on: Option<u32>,
    pub optional: bool,
    pub timeout_secs: u32,
}

// ─── Experience (for memory system) ──────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExperienceInfo {
    pub id: String,
    pub task_summary: String,
    pub intent: String,
    pub success: bool,
    pub score: ExperienceScore,
    pub created_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExperienceScore {
    pub accuracy: f32,
    pub efficiency: f32,
    pub tool_usage: f32,
}

// ═══════════════════════════════════════════════════════════════
// Agent Runtime V5.1 — Three-Layer Object Model
// Session → Run → WorkflowRun  +  Unified Event Protocol
// ═══════════════════════════════════════════════════════════════

// ─── Run (concrete execution instance) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Pending,
    Running,
    WaitingHuman,
    Done,
    Failed,
    Cancelled,
}

/// One concrete execution instance. Tracks state, cost, and trace.
/// react_loop operates on a Session; Run is the outer wrapper.
/// blueprint_version_id: which asset version this run is executing —
/// required for audit, regression, human correction backflow.
#[derive(Debug, Clone, Serialize)]
pub struct Run {
    pub run_id: String,
    pub goal: String,
    pub status: RunStatus,
    pub round: u32,
    pub max_rounds: u32,
    pub tool_trace: Vec<String>,
    pub tokens_used: u32,
    pub elapsed_ms: u64,
    pub plan: Option<PlanState>,
    pub stop_reason: Option<StopReason>,
    pub error: Option<String>,
    /// Points to the BlueprintInfo (id, version) this run was launched from.
    /// None for ad-hoc single runs.
    pub blueprint_version_id: Option<String>,
}

impl Run {
    pub fn new(goal: &str, max_rounds: u32) -> Self {
        Self {
            run_id: uuid::Uuid::new_v4().to_string(),
            goal: goal.to_string(),
            status: RunStatus::Pending,
            round: 0,
            max_rounds,
            tool_trace: vec![],
            tokens_used: 0,
            elapsed_ms: 0,
            plan: None,
            stop_reason: None,
            error: None,
            blueprint_version_id: None,
        }
    }

    pub fn new_from_blueprint(goal: &str, max_rounds: u32, bp: &BlueprintInfo) -> Self {
        let mut r = Self::new(goal, max_rounds);
        r.blueprint_version_id = Some(format!("{}@{}", bp.id, bp.version));
        r
    }

    pub fn record_tool(&mut self, name: &str) {
        self.tool_trace.push(name.to_string());
    }
}


// ─── WorkflowRun (multi-node workflow instance) ───────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    pub workflow_run_id: String,
    pub blueprint_id: String,
    /// "blueprint_id@version" — immutable after run starts.
    /// TEST and PRODUCTION must reference the same value for the same asset.
    pub blueprint_version_id: String,
    pub goal: String,
    pub status: RunStatus,
    pub nodes: Vec<WorkflowNodeRun>,
    pub current_node_idx: usize,
    pub created_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNodeRun {
    pub node_id: u32,
    pub node_type: WorkflowNodeType,
    pub status: RunStatus,
    /// Inner Run id (agent/skill nodes only)
    pub run_id: Option<String>,
    pub result: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowNodeType {
    Agent,
    Skill,
    Human,
}

// ─── Unified RunEvent Protocol ────────────────────────────────────
// All runtime events use this single type.
// Frontend, logs, replay, and debug all consume this stream.

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RunEvent {
    Thinking    { run_id: String, round: u32, text: String },
    ToolCall    { run_id: String, round: u32, tool_name: String, args: Value },
    ToolResult  { run_id: String, round: u32, tool_name: String, success: bool, content: String, duration_ms: u64 },
    RoundDone   { run_id: String, round: u32 },
    Done        { run_id: String, rounds: u32, answer: String },
    Stopped     { run_id: String, reason: StopReason },
    NeedsHuman  { run_id: String, gate: HumanGateType, prompt: String },
    Error       { run_id: String, round: u32, message: String },
    WorkflowProgress { workflow_run_id: String, node_idx: usize, status: RunStatus },
}

// ─── Stop Decision ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    GoalAchieved,
    MaxRoundsExceeded,
    ConsecutiveToolFailures,
    NoProgress,
    BudgetExceeded,
    LoginRequired,
    HumanCancelled,
    FatalError,
}

#[derive(Debug, Clone)]
pub struct StopDecision {
    pub should_stop: bool,
    pub reason: Option<StopReason>,
    pub message: Option<String>,
}

impl StopDecision {
    pub fn keep_going() -> Self {
        Self { should_stop: false, reason: None, message: None }
    }
    pub fn stop(reason: StopReason, msg: impl Into<String>) -> Self {
        Self { should_stop: true, reason: Some(reason), message: Some(msg.into()) }
    }
}

// ─── Lightweight Plan State ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanState {
    pub current_objective: String,
    pub completed: Vec<String>,
    pub pending: Vec<String>,
    pub current_strategy: String,
    pub last_replan_reason: Option<String>,
}

impl PlanState {
    pub fn new(goal: &str) -> Self {
        Self {
            current_objective: goal.to_string(),
            completed: vec![],
            pending: vec![goal.to_string()],
            current_strategy: "逐步调用工具完成目标".into(),
            last_replan_reason: None,
        }
    }
    pub fn mark_done(&mut self, step: impl Into<String>) {
        let s = step.into();
        self.pending.retain(|p| p != &s);
        self.completed.push(s);
    }
}

// ─── Human Interaction ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HumanGateType {
    LoginRequired,
    TeachingRequired,    // Human demos new capability → teaching.rs pipeline
    CorrectionRequired,  // Human fixes failed step → correction.rs pipeline
    ApprovalRequired,
    InputRequired,
    ReviewRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanIntervention {
    pub intervention_id: String,
    pub run_id: String,
    pub gate_type: HumanGateType,
    pub prompt: String,
    pub context: Option<String>,
    pub response: Option<String>,
    pub resolved: bool,
    pub created_at: String,
}

impl HumanIntervention {
    pub fn new(run_id: &str, gate: HumanGateType, prompt: &str) -> Self {
        Self {
            intervention_id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            gate_type: gate,
            prompt: prompt.to_string(),
            context: None, response: None, resolved: false,
            created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }
}

// ─── Run Budget Controller ────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RunBudget {
    pub max_rounds: u32,
    pub max_tokens: u32,
    pub max_tool_calls: u32,
    pub max_elapsed_secs: u64,
    pub max_consecutive_failures: u32,
}

impl Default for RunBudget {
    fn default() -> Self {
        Self {
            max_rounds: 10,
            max_tokens: 60_000,
            max_tool_calls: 30,
            max_elapsed_secs: 600,
            max_consecutive_failures: 3,
        }
    }
}

// ─── Model Profile (for multi-model routing) ─────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProfile {
    pub model_id: String,
    pub model_name: String,
    pub endpoint: String,
    pub api_key: String,
    pub capabilities: Vec<ModelCapability>,
    pub context_window: u32,
    pub cost_per_1k_tokens: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModelCapability {
    Planning,
    Coding,
    DocumentExtraction,
    LongContext,
    Classification,
    General,
}

// ═══════════════════════════════════════════════════════════════
// ActionTrace — Unified Execution Timeline
// First-class data (NOT logs). All action kinds flow into one model.
// agent/tool/ui/human/system/recovery — all the same struct.
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    AgentThought,
    ToolCall,
    ToolResult,
    UiAction,
    HumanAction,
    SystemDecision,
    RecoveryAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTrace {
    pub trace_id: String,
    pub session_id: String,
    pub run_id: String,
    pub workflow_run_id: Option<String>,
    pub action_kind: ActionKind,
    pub actor: String,                // "agent" | tool_name | "human" | "system"
    pub description: String,
    pub payload: Value,
    pub success: Option<bool>,
    pub timestamp: String,
}

impl ActionTrace {
    pub fn new(
        session_id: &str,
        run_id: &str,
        workflow_run_id: Option<&str>,
        kind: ActionKind,
        actor: &str,
        description: &str,
        payload: Value,
        success: Option<bool>,
    ) -> Self {
        Self {
            trace_id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            workflow_run_id: workflow_run_id.map(|s| s.to_string()),
            action_kind: kind,
            actor: actor.to_string(),
            description: description.to_string(),
            payload,
            success,
            timestamp: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string(),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Human Interaction — Teaching Pipeline Types
// Teaching = "human demos a NEW capability the system doesn't have"
// Output target: ReusablePattern (Phase 2)
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanTeachingSession {
    pub session_id: String,
    pub run_id: String,
    pub objective: String,
    pub preconditions: Option<String>,   // was: String (changed to Option for flexibility)
    pub action_sequence: Vec<String>,    // Phase 2: structured ActionTrace refs
    pub variable_fields: Vec<String>,
    pub stable_anchors: Vec<String>,
    pub risk_points: Vec<String>,
    pub reusable: bool,
    pub created_at: String,
    pub completed_at: Option<String>,    // None = session still in progress
    pub promoted_to_pattern_id: Option<String>,
}

/// Phase 2 target: what a teaching session should produce.
/// Contains structured extraction from human demonstration traces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReusablePattern {
    pub pattern_id: String,
    pub name: String,
    pub description: String,            // was: objective
    pub objective: String,
    pub preconditions: Vec<String>,
    pub key_steps: Vec<String>,
    pub variable_params: Vec<String>,
    pub stable_anchors: Vec<String>,
    pub risk_points: Vec<String>,
    pub applicable_scope: String,
    pub source_session_id: String,
    // Backflow fields (added for teaching_backflow.rs)
    pub extracted_from_session_id: Option<String>,
    pub applicable_tool_names: Vec<String>,
    pub action_sequence: Vec<Value>,    // Structured action steps from ActionTrace
    pub trigger_condition: Option<String>,
    pub confidence: f64,               // 0.0–1.0 extraction confidence
    pub version: u32,
    pub created_at: String,
}

// ═══════════════════════════════════════════════════════════════
// Human Interaction — Correction Pipeline Types
// Correction = "system tried, failed, human fixes and resumes"
// Key: reason_code REQUIRED — "why it failed" drives future prevention
// ═══════════════════════════════════════════════════════════════

/// 10-category classification — required for every correction.
/// Enables: failure analytics, tool gap identification, policy generation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CorrectionReasonCode {
    PageStructureChanged,
    SelectorInvalid,
    LoginExpired,
    DocumentRecognitionError,
    ToolParameterError,
    AgentPlanError,
    ContextMissing,
    ExternalSystemError,
    BusinessRuleSpecial,
    Unknown,
}

/// 3 resume modes for workflow_runtime + react_loop after correction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResumeMode {
    /// Human fixed a small thing; continue current node unchanged
    ContinueCurrentNode,
    /// Jump to specific inner sub-step (current node is composite)
    ResumeFromSubstep(String),
    /// Roll back to an earlier node and re-execute from there
    RollbackAndRetry(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanCorrectionRecord {
    pub record_id: String,
    pub run_id: String,
    pub node_id: Option<u32>,
    pub original_action: String,
    pub error_result: String,
    pub reason_code: CorrectionReasonCode,       // REQUIRED — never Unknown if avoidable
    pub corrected_output: Option<String>,
    pub corrected_action: Option<String>,
    pub resume_from: ResumeMode,
    pub recovery_success: bool,
    pub formed_new_rule: bool,
    pub notes: Option<String>,
    pub created_at: String,
}

// Extended HumanGateType — TeachingRequired and CorrectionRequired are FIRST-CLASS
// They are NOT variants of Approval. They have separate pipelines.
impl HumanGateType {
    pub fn is_teaching(&self) -> bool {
        matches!(self, HumanGateType::TeachingRequired)
    }
    pub fn is_correction(&self) -> bool {
        matches!(self, HumanGateType::CorrectionRequired)
    }
}

// ═══════════════════════════════════════════════════════════════
// Blueprint Asset Lifecycle — Single Source of Truth
// Canvas / Test / Production all derive from the SAME BlueprintV2.
// ReAct Loop is the inner execution layer; it cannot restructure
// the Blueprint's macro skeleton without going through asset revision.
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BlueprintStatus {
    /// Just generated — not yet tested
    Draft,
    /// Passed basic test run(s)
    Tested,
    /// Published — new WorkflowRuns must bind this version
    Published,
    /// Superseded by newer version — preserved for audit
    Deprecated,
}

impl Default for BlueprintStatus {
    fn default() -> Self { BlueprintStatus::Draft }
}

/// An asset revision candidate — created when human correction
/// suggests a structural change to the blueprint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetRevisionCandidate {
    pub candidate_id: String,
    pub source_blueprint_id: String,
    pub source_version: String,
    pub triggered_by_correction_id: Option<String>,
    pub triggered_by_teaching_id: Option<String>,
    pub suggested_changes: Vec<String>,
    pub status: String,   // "pending_review" | "applied" | "rejected"
    pub created_at: String,
}

// ═══════════════════════════════════════════════════════════════
// BlueprintDefinition — Proper Asset Object (Phase 6.5 Review #2)
//
// blueprint_version_id ("id@version") is a REFERENCE KEY into this.
// Not a substitute for this object.
//
// Tracks full asset lineage:
//   - derived_from: which version this was forked from
//   - change_reason: why this version was created
//   - test_report_ref: what test run validated this
//   - publish_meta: when/who published
//
// Canvas, Test, and Production all resolve this from the DB
// and verify blueprint_version_id == format!("{}@{}", id, version)
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlueprintDefinition {
    /// Unique identity of this blueprint family
    pub definition_id: String,
    /// Monotonic semver (1.0, 1.1, 2.0, ...)
    pub version: String,
    /// Computed reference key — canvas/test/prod bind this
    pub blueprint_version_id: String,   // = "definition_id@version"

    /// Status in the publication lifecycle
    pub status: BlueprintStatus,

    /// Full structured content (same as BlueprintInfo)
    pub name: String,
    pub persona: String,
    pub goal_template: String,
    pub workflow_template: Vec<WorkflowStepInfo>,
    pub complexity: u8,
    pub tags: Vec<String>,

    // ── Lineage ──────────────────────────────────────────────────
    /// Which BlueprintDefinition version this was forked from,
    /// or None for the initial generated version.
    pub derived_from: Option<String>,    // "definition_id@prev_version"
    /// Why this version was created (human correction / teaching / regenerate)
    pub change_reason: Option<String>,
    /// ID of the AssetRevisionCandidate that triggered this version
    pub revision_candidate_id: Option<String>,

    // ── Test Evidence ─────────────────────────────────────────────
    /// workflow_run_id of the test run that validated this definition
    pub test_report_ref: Option<String>,
    /// ID of the ssot_deviation_reports entry for this version's test
    pub ssot_report_ref: Option<String>,
    pub tested_at: Option<String>,

    // ── Publish Metadata ──────────────────────────────────────────
    pub published_at: Option<String>,
    pub published_by: Option<String>,   // user ID or "auto"
    pub deprecated_at: Option<String>,

    pub created_at: String,
}

impl BlueprintDefinition {
    /// Compute the canonical reference key for this asset version.
    pub fn version_id(&self) -> String {
        format!("{}@{}", self.definition_id, self.version)
    }

    /// Promote from BlueprintInfo (generated asset) → BlueprintDefinition.
    pub fn from_blueprint_info(bp: &BlueprintInfo) -> Self {
        let def_id = bp.id.clone();
        let ver = bp.version.clone();
        let vid = format!("{}@{}", def_id, ver);
        Self {
            definition_id: def_id,
            version: ver,
            blueprint_version_id: vid,
            status: bp.status.clone(),
            name: bp.name.clone(),
            persona: bp.persona.clone(),
            goal_template: bp.goal_template.clone(),
            workflow_template: bp.workflow_template.clone(),
            complexity: bp.complexity,
            tags: bp.tags.clone(),
            derived_from: None,
            change_reason: None,
            revision_candidate_id: None,
            test_report_ref: None,
            ssot_report_ref: None,
            tested_at: None,
            published_at: None,
            published_by: None,
            deprecated_at: None,
            created_at: bp.created_at.clone(),
        }
    }

    /// Fork this definition into a new version after human correction.
    pub fn fork_from_correction(
        &self,
        new_version: &str,
        change_reason: &str,
        revision_candidate_id: &str,
    ) -> Self {
        let derived = self.version_id();
        let mut forked = self.clone();
        forked.version = new_version.to_string();
        forked.blueprint_version_id = format!("{}@{}", self.definition_id, new_version);
        forked.status = BlueprintStatus::Draft;
        forked.derived_from = Some(derived);
        forked.change_reason = Some(change_reason.to_string());
        forked.revision_candidate_id = Some(revision_candidate_id.to_string());
        forked.test_report_ref = None;
        forked.ssot_report_ref = None;
        forked.tested_at = None;
        forked.published_at = None;
        forked.deprecated_at = None;
        forked.created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        forked
    }
}

// ═══════════════════════════════════════════════════════════════
// Run Replay Infrastructure
//
// A RunReplay bundles all events from a run so they can be
// replayed deterministically in the UI or compared with
// another run's trace (definition vs execution diff).
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunReplay {
    pub run_id: String,
    pub blueprint_version_id: Option<String>,
    pub goal: String,
    pub events: Vec<ReplayEvent>,
    pub total_rounds: u32,
    pub success: bool,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayEvent {
    pub seq: u32,
    pub round: u32,
    pub event_type: ReplayEventType,
    pub tool_name: Option<String>,
    pub input_snapshot: Option<Value>,
    pub output_snapshot: Option<Value>,
    pub success: Option<bool>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplayEventType {
    LlmCall,
    ToolCall,
    HumanGateOpened,
    HumanGateResolved,
    PlanDecision,
    StopDecision,
    Error,
}

/// Definition vs Execution diff — what the Blueprint expected vs what happened.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionDiff {
    pub blueprint_version_id: String,
    pub run_id: String,
    /// Steps defined in the Blueprint that were NOT executed
    pub missing_steps: Vec<String>,
    /// Steps executed that were NOT in the Blueprint
    pub extra_steps: Vec<String>,
    /// Steps where execution order differed
    pub reordered_steps: Vec<(String, String)>,  // (expected, actual)
    /// Overall deviation severity
    pub severity: DiffSeverity,
    pub computed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffSeverity {
    None,
    Minor,      // extra retries, optional step skipped
    Moderate,   // node reorder, unexpected tool
    Critical,   // missing required stage, gate bypassed
}
