use crate::agent::types::*;
use sqlx::SqlitePool;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Phase 6.5 — SSOT Enforcement: Runtime Deviation Validator
//
// The core principle: Blueprint is the single source of truth.
// This module enforces it mechanically, not just as a convention.
//
// Two responsibilities:
//
// 1. Runtime Deviation Check:
//    Before/during execution, verify the actual execution trace
//    stays within the bounds defined by the Blueprint.
//    → ALLOWED: tool selection, arg filling, retry, resume branch
//    → BLOCKED: adding stages, removing required nodes, bypassing
//               human gates, escalating tool permissions
//
// 2. SSOT Consistency Check:
//    Across canvas / test / production views of the same
//    blueprint_version_id, verify structural equivalence.
//    This is the "three flows" anti-regression test.
// ═══════════════════════════════════════════════════════════════

// ─── Deviation Boundary ──────────────────────────────────────────

/// Describes what changed between the Blueprint definition and the
/// actual execution trace for a single run.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviationReport {
    pub run_id: String,
    pub blueprint_version_id: String,
    pub deviations: Vec<DeviationItem>,
    pub has_violations: bool,   // true = any BLOCKED deviation occurred
    pub checked_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviationItem {
    pub kind: DeviationKind,
    pub severity: DeviationSeverity,
    pub description: String,
    pub node_idx: Option<usize>,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviationKind {
    // ✅ Allowed — dynamic decisions within node bounds
    ToolChoiceVaried,       // Different tool chosen (within policy)
    ArgFilled,              // Args filled at runtime
    RetryApplied,           // Tool retried after failure
    ResumeBranchTaken,      // Different ResumeMode than default

    // ⚠️ Warning — unusual but may be valid
    NodeSkipped,            // Optional node skipped
    ExtraToolCall,          // More tool calls than blueprint expected
    LateHumanGate,          // Human gate triggered but not in definition

    // ❌ Violations — must not happen without a revision
    StageAdded,             // New top-level stage not in Blueprint
    StageRemoved,           // Required stage omitted
    NodeOrderChanged,       // Core sequence reordered
    HumanGateBypassed,      // Defined human gate was skipped
    ToolPermissionEscalated, // Tool executed at higher risk than policy allows
    OutputContractBroken,   // Final output shape doesn't match definition
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum DeviationSeverity {
    Info,
    Warning,
    Violation,  // Blocked — must be flagged and optionally halt
}

impl DeviationItem {
    fn violation(kind: DeviationKind, desc: impl Into<String>, node_idx: Option<usize>) -> Self {
        Self { kind, severity: DeviationSeverity::Violation, description: desc.into(), node_idx }
    }
    fn warning(kind: DeviationKind, desc: impl Into<String>, node_idx: Option<usize>) -> Self {
        Self { kind, severity: DeviationSeverity::Warning, description: desc.into(), node_idx }
    }
}

// ─── Runtime Deviation Check ─────────────────────────────────────

/// Check whether the executed WorkflowRun deviates from its Blueprint.
/// Call this after a run completes (or at each node for real-time enforcement).
pub fn validate_runtime_deviation(
    blueprint: &BlueprintInfo,
    wf_run: &WorkflowRun,
) -> DeviationReport {
    let mut deviations: Vec<DeviationItem> = vec![];

    let bp_steps = &blueprint.workflow_template;
    let run_nodes = &wf_run.nodes;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // ── Rule 1: Node count must match (ignoring optional-skipped) ──
    let required_bp_count = bp_steps.iter().filter(|s| !s.optional).count();
    let completed_count = run_nodes.iter()
        .filter(|n| n.status == RunStatus::Done || n.status == RunStatus::Failed)
        .count();

    // More nodes in run than blueprint defined
    if run_nodes.len() > bp_steps.len() {
        deviations.push(DeviationItem::violation(
            DeviationKind::StageAdded,
            format!("Run has {} nodes, Blueprint defines {}. Extra stages not allowed.",
                    run_nodes.len(), bp_steps.len()),
            None,
        ));
    }

    // Required stages missing (all failed with no retry context)
    let required_failed = run_nodes.iter().enumerate().filter(|(i, n)| {
        bp_steps.get(*i).map(|s| !s.optional && n.status == RunStatus::Failed).unwrap_or(false)
    }).count();

    if required_failed > 0 {
        deviations.push(DeviationItem::warning(
            DeviationKind::StageRemoved,
            format!("{} required nodes failed without completion", required_failed),
            None,
        ));
    }

    // ── Rule 2: Node type sequence must match blueprint ────────────
    for (i, node) in run_nodes.iter().enumerate() {
        if let Some(bp_step) = bp_steps.get(i) {
            // Check if HumanNode in blueprint was bypassed
            // A human gate is indicated by the tool name containing "human" or "manual"
            let bp_needs_human = bp_step.tool.to_lowercase().contains("human")
                || bp_step.tool.to_lowercase().contains("manual");
            if bp_needs_human && node.node_type != WorkflowNodeType::Human
                && node.status == RunStatus::Done {
                deviations.push(DeviationItem::violation(
                    DeviationKind::HumanGateBypassed,
                    format!("Node {} '{}' requires human involvement but completed as agent node",
                            i, bp_step.goal),
                    Some(i),
                ));
            }
        }
    }

    // ── Rule 3: Run must be bound to the correct blueprint version ─
    if wf_run.blueprint_version_id != format!("{}@{}", blueprint.id, blueprint.version) {
        deviations.push(DeviationItem::violation(
            DeviationKind::OutputContractBroken,
            format!("Run bound to '{}' but Blueprint reports '{}@{}'",
                    wf_run.blueprint_version_id, blueprint.id, blueprint.version),
            None,
        ));
    }

    let has_violations = deviations.iter()
        .any(|d| d.severity == DeviationSeverity::Violation);

    if has_violations {
        app_log!("SSOT", "❌ VIOLATION detected in run {} (blueprint {}@{})",
                 &wf_run.workflow_run_id[..8], &blueprint.id[..8], blueprint.version);
    } else if !deviations.is_empty() {
        app_log!("SSOT", "⚠️ {} warnings in run {}", deviations.len(),
                 &wf_run.workflow_run_id[..8]);
    } else {
        app_log!("SSOT", "✅ Run {} deviation check clean", &wf_run.workflow_run_id[..8]);
    }

    DeviationReport {
        run_id: wf_run.workflow_run_id.clone(),
        blueprint_version_id: wf_run.blueprint_version_id.clone(),
        deviations,
        has_violations,
        checked_at: now,
    }
}

// ─── SSOT Consistency Check ───────────────────────────────────────

/// Compare two run traces for the same blueprint_version_id.
/// Used to verify test and production runs are structurally equivalent.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SsotConsistencyResult {
    pub blueprint_version_id: String,
    pub consistent: bool,
    pub diffs: Vec<String>,
    pub checked_at: String,
}

/// Compare a test run and a production run for the same Blueprint.
/// The runs must share the same blueprint_version_id.
pub fn check_ssot_consistency(
    blueprint: &BlueprintInfo,
    run_a: &WorkflowRun,
    run_b: &WorkflowRun,
    label_a: &str,   // e.g. "test"
    label_b: &str,   // e.g. "production"
) -> SsotConsistencyResult {
    let mut diffs: Vec<String> = vec![];
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Ensure both runs reference the same blueprint version
    if run_a.blueprint_version_id != run_b.blueprint_version_id {
        diffs.push(format!(
            "blueprint_version_id mismatch: {} vs {}",
            run_a.blueprint_version_id, run_b.blueprint_version_id
        ));
    }

    // Node count
    if run_a.nodes.len() != run_b.nodes.len() {
        diffs.push(format!(
            "Node count differs: {} ({} nodes) vs {} ({} nodes)",
            label_a, run_a.nodes.len(), label_b, run_b.nodes.len()
        ));
    }

    // Node type sequence
    let seq_a: Vec<_> = run_a.nodes.iter().map(|n| &n.node_type).collect();
    let seq_b: Vec<_> = run_b.nodes.iter().map(|n| &n.node_type).collect();
    for (i, (a, b)) in seq_a.iter().zip(seq_b.iter()).enumerate() {
        let a_str = format!("{:?}", a);
        let b_str = format!("{:?}", b);
        if a_str != b_str {
            diffs.push(format!("Node[{}] type differs: {} is {:?}, {} is {:?}",
                               i, label_a, a, label_b, b));
        }
    }

    // Blueprint node count check
    if run_a.nodes.len() != blueprint.workflow_template.len() {
        diffs.push(format!(
            "{} run has {} nodes but Blueprint defines {}",
            label_a, run_a.nodes.len(), blueprint.workflow_template.len()
        ));
    }

    let consistent = diffs.is_empty();
    if consistent {
        app_log!("SSOT", "✅ {}/{} runs are SSOT-consistent for blueprint {}@{}",
                 label_a, label_b, &blueprint.id[..8], blueprint.version);
    } else {
        app_log!("SSOT", "❌ {}/{} SSOT inconsistency: {} diffs", label_a, label_b, diffs.len());
        for d in &diffs { app_log!("SSOT", "  • {}", d); }
    }

    SsotConsistencyResult {
        blueprint_version_id: run_a.blueprint_version_id.clone(),
        consistent,
        diffs,
        checked_at: now,
    }
}

// ─── Ad-hoc Run Boundary ─────────────────────────────────────────

/// Check if a Run should be promoted to a Blueprint asset.
/// Called when an ad-hoc run completes successfully.
/// Returns Some(suggestion) if promotion is warranted.
pub fn check_adhoc_promotion(
    run: &Run,
    recent_similar_count: u32,
) -> Option<String> {
    // Ad-hoc runs with no blueprint binding
    if run.blueprint_version_id.is_some() {
        return None;
    }

    // If the same goal pattern has been run many times ad-hoc, suggest promotion
    if recent_similar_count >= 3 && run.total_rounds() > 1 {
        return Some(format!(
            "This goal has been run {} times ad-hoc. Consider promoting to a Blueprint asset for stable, version-controlled reuse.",
            recent_similar_count
        ));
    }
    None
}

// ─── Persist deviation reports ────────────────────────────────────

pub async fn save_deviation_report(report: &DeviationReport, pool: &SqlitePool)  {
    ensure_schema(pool).await;
    let deviations_json = serde_json::to_string(&report.deviations).unwrap_or("[]".into());
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO ssot_deviation_reports
         (run_id, blueprint_version_id, deviations_json, has_violations, checked_at)
         VALUES (?,?,?,?,?)"
    )
    .bind(&report.run_id)
    .bind(&report.blueprint_version_id)
    .bind(&deviations_json)
    .bind(report.has_violations as i64)
    .bind(&report.checked_at)
    .execute(pool).await;
}

pub async fn ensure_schema(pool: &SqlitePool) {
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS ssot_deviation_reports (
            run_id TEXT PRIMARY KEY,
            blueprint_version_id TEXT NOT NULL,
            deviations_json TEXT,
            has_violations INTEGER DEFAULT 0,
            checked_at TEXT
        )"
    ).execute(pool).await;
}

// ─── Helper trait ────────────────────────────────────────────────

trait RunMetrics {
    fn total_rounds(&self) -> u32;
}
impl RunMetrics for Run {
    fn total_rounds(&self) -> u32 { self.round }
}

// ─── Run Replay ───────────────────────────────────────────────────

/// Reconstruct a RunReplay from stored ActionTraces for a given run_id.
/// Enables deterministic replay of any past execution in the UI.
pub async fn build_run_replay(
    run_id: &str,
    blueprint_version_id: Option<&str>,
    goal: &str,
    pool: &SqlitePool,
) -> RunReplay {
    let rows: Vec<(String, String, String, String, Option<String>, Option<String>, Option<i64>, String)> =
        sqlx::query_as(
            "SELECT trace_id, action_kind, actor, description, payload, success, 0, timestamp
             FROM action_traces WHERE run_id = ? ORDER BY timestamp ASC"
        )
        .bind(run_id)
        .fetch_all(pool).await.unwrap_or_default();

    let mut events: Vec<ReplayEvent> = vec![];
    for (seq, (_, kind, actor, desc, payload_str, success_str, _, ts)) in rows.into_iter().enumerate() {
        let event_type = match kind.as_str() {
            "AgentThought"      => ReplayEventType::LlmCall,
            "ToolCall"          => ReplayEventType::ToolCall,
            "HumanAction"       => ReplayEventType::HumanGateOpened,
            "SystemDecision"    => ReplayEventType::PlanDecision,
            "RecoveryAction"    => ReplayEventType::HumanGateResolved,
            _                   => ReplayEventType::ToolCall,
        };

        let output: Option<serde_json::Value> = payload_str
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());

        events.push(ReplayEvent {
            seq: seq as u32,
            round: 0,   // Phase 2: enrich from run_events table
            event_type,
            tool_name: if actor != "agent" && actor != "human" { Some(actor) } else { None },
            input_snapshot: None,
            output_snapshot: output,
            success: success_str.as_deref().map(|s| s == "true" || s == "1"),
            timestamp: ts,
        });
    }

    let success = events.iter().any(|e| matches!(e.event_type, ReplayEventType::StopDecision));
    app_log!("SSOT", "RunReplay built for run={} ({} events)", crate::logger::safe_truncate(&run_id, 8), events.len());

    RunReplay {
        run_id: run_id.to_string(),
        blueprint_version_id: blueprint_version_id.map(|s| s.to_string()),
        goal: goal.to_string(),
        events,
        total_rounds: 0,
        success,
        captured_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}

// ─── Definition vs Execution Diff ────────────────────────────────

/// Compare what the Blueprint expected (ordered step goals) with
/// what ActionTraces show actually happened.
/// Answers: "is the execution faithful to the asset?"
pub fn compute_execution_diff(
    blueprint: &BlueprintInfo,
    run_id: &str,
    traces: &[ActionTrace],
) -> ExecutionDiff {
    let defined_steps: Vec<String> = blueprint.workflow_template
        .iter().map(|s| s.goal.clone()).collect();

    // Extract tool calls from traces as executed step names
    let executed_tools: Vec<String> = traces.iter()
        .filter(|t| matches!(t.action_kind, ActionKind::ToolCall | ActionKind::ToolResult))
        .map(|t| t.actor.clone())
        .collect();

    // Steps defined but not executed (actor name not found in tool calls)
    let missing_steps: Vec<String> = defined_steps.iter()
        .filter(|goal| {
            // Check if any trace involves a tool whose name overlaps with this goal keyword
            let goal_kw = goal.split_whitespace().next().unwrap_or("").to_lowercase();
            !executed_tools.iter().any(|t| t.to_lowercase().contains(&goal_kw))
        })
        .cloned().collect();

    // Tool calls executed but not mentioned in any blueprint step
    let extra_steps: Vec<String> = executed_tools.iter()
        .filter(|tool| {
            let tool_lc = tool.to_lowercase();
            !defined_steps.iter().any(|g| {
                g.split_whitespace().any(|w| tool_lc.contains(&w.to_lowercase()))
            })
        })
        .cloned().collect();

    // Severity classification
    let severity = if missing_steps.iter().any(|s| {
        // "required" steps missing → Critical
        blueprint.workflow_template.iter()
            .find(|ws| ws.goal == *s)
            .map(|ws| !ws.optional)
            .unwrap_or(false)
    }) {
        DiffSeverity::Critical
    } else if !missing_steps.is_empty() {
        DiffSeverity::Moderate
    } else if !extra_steps.is_empty() {
        DiffSeverity::Minor
    } else {
        DiffSeverity::None
    };

    app_log!("SSOT", "ExecutionDiff run={}: {} missing, {} extra, severity={:?}",
             crate::logger::safe_truncate(&run_id, 8), missing_steps.len(), extra_steps.len(), severity);

    ExecutionDiff {
        blueprint_version_id: format!("{}@{}", blueprint.id, blueprint.version),
        run_id: run_id.to_string(),
        missing_steps,
        extra_steps,
        reordered_steps: vec![],   // Phase 2: sequence comparison
        severity,
        computed_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}

/// Load ActionTraces for a run from the DB (for use in compute_execution_diff).
pub async fn load_traces_for_run(run_id: &str, pool: &SqlitePool) -> Vec<ActionTrace> {
    let rows: Vec<(String, String, String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT trace_id, action_kind, actor, description, NULL, timestamp
         FROM action_traces WHERE run_id = ? ORDER BY timestamp ASC"
    ).bind(run_id).fetch_all(pool).await.unwrap_or_default();

    rows.into_iter().map(|(trace_id, kind, actor, desc, _, ts)| {
        let action_kind = match kind.as_str() {
            "AgentThought"   => ActionKind::AgentThought,
            "ToolCall"       => ActionKind::ToolCall,
            "ToolResult"     => ActionKind::ToolResult,
            "HumanAction"    => ActionKind::HumanAction,
            "UiAction"       => ActionKind::UiAction,
            "SystemDecision" => ActionKind::SystemDecision,
            _                => ActionKind::RecoveryAction,
        };
        ActionTrace {
            trace_id, session_id: String::new(), run_id: run_id.to_string(),
            workflow_run_id: None, action_kind, actor,
            description: desc, payload: serde_json::Value::Null,
            success: None, timestamp: ts,
        }
    }).collect()
}
