pub use crate::agent::types::{WorkflowNodeType, HumanGateType, BlueprintInfo, WorkflowStepInfo};

// ═══════════════════════════════════════════════════════════════
// Workflow Runtime — Node Definitions
// Three node types: Agent, Skill, Human
// Each provides a trait-like interface for the engine to drive.
// ═══════════════════════════════════════════════════════════════

/// Specification for a single workflow node, derived from BlueprintInfo.
#[derive(Debug, Clone)]
pub struct NodeSpec {
    pub node_id: u32,
    pub node_type: WorkflowNodeType,
    pub goal: String,
    pub tool: String,
    pub default_args: serde_json::Value,
    pub depends_on: Option<u32>,
    pub optional: bool,
    pub timeout_secs: u32,
}

impl NodeSpec {
    /// Build a goal string for an AgentNode run, injecting previous result.
    pub fn build_goal(&self, prev_result: Option<&str>) -> String {
        let base = &self.goal;
        if let Some(prev) = prev_result {
            if base.contains("{prev}") {
                return base.replace("{prev}", prev);
            }
            // Append context if no explicit placeholder
            format!("{}\n\n上一步结果参考:\n{}", base, crate::logger::safe_truncate(&prev, 500))
        } else {
            base.clone()
        }
    }
}

/// Convert a WorkflowStepInfo to a NodeSpec.
impl From<&WorkflowStepInfo> for NodeSpec {
    fn from(step: &WorkflowStepInfo) -> Self {
        // Detect if this is a human node (tool == "human_input" or "human_review")
        let node_type = match step.tool.as_str() {
            "human_input" | "human_review" | "human_approval" => WorkflowNodeType::Human,
            _ => WorkflowNodeType::Agent,
        };
        NodeSpec {
            node_id: step.id,
            node_type,
            goal: step.goal.clone(),
            tool: step.tool.clone(),
            default_args: step.default_args.clone(),
            depends_on: step.depends_on,
            optional: step.optional,
            timeout_secs: step.timeout_secs,
        }
    }
}

/// Build all NodeSpecs from a blueprint.
pub fn build_node_specs(blueprint: &BlueprintInfo) -> Vec<NodeSpec> {
    blueprint.workflow_template.iter().map(NodeSpec::from).collect()
}

/// Classify what kind of human gate this node needs.
pub fn human_gate_for_node(spec: &NodeSpec) -> HumanGateType {
    match spec.tool.as_str() {
        "human_approval" => HumanGateType::ApprovalRequired,
        "human_review"   => HumanGateType::ReviewRequired,
        _                => HumanGateType::InputRequired,
    }
}
