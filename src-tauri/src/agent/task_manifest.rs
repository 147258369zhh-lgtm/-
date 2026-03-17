use serde::{Serialize, Deserialize};
use super::types::*;

// ═══════════════════════════════════════════════
// TaskManifest — 单一事实源
// ═══════════════════════════════════════════════
// 统一：用户需求 + 执行计划 + UI表示
// 所有模块读写同一个 Manifest，消除不一致

/// 任务全生命周期的单一事实源
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskManifest {
    /// 唯一任务 ID
    pub task_id: String,
    /// 运行 ID（每次执行都有新 ID）
    pub run_id: String,
    /// 触发来源
    pub triggered_by: String,

    // ── 用户意图层 ──
    /// 原始 prompt
    pub raw_prompt: String,
    /// 结构化任务
    pub structured_task: Option<StructuredTask>,
    /// 验收标准
    pub done_spec: DoneSpec,

    // ── 执行计划层 ──
    /// 当前执行计划
    pub plan: Option<AgentPlan>,
    /// 计划审查结果
    pub plan_issues: Vec<String>,
    /// 重规划次数
    pub replan_count: u32,

    // ── 运行时状态层 ──
    /// 任务状态
    pub status: ManifestStatus,
    /// 已完成步骤
    pub completed_steps: Vec<PlanStep>,
    /// 失败计数
    pub failure_count: u32,
    /// 使用的工具
    pub tools_used: Vec<String>,

    // ── 元数据层 ──
    /// 开始时间
    pub started_at: String,
    /// 结束时间
    pub ended_at: Option<String>,
    /// 使用的模型
    pub model_name: String,
}

/// 任务全局状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ManifestStatus {
    /// 规划中
    Planning,
    /// 执行中
    Executing,
    /// 重规划中
    Replanning,
    /// 成功完成
    Completed,
    /// 失败终止
    Failed,
    /// 用户取消
    Cancelled,
}

impl TaskManifest {
    /// 创建新的 TaskManifest
    pub fn new(
        task_id: String,
        run_id: String,
        triggered_by: String,
        raw_prompt: String,
        done_spec: DoneSpec,
        model_name: String,
    ) -> Self {
        Self {
            task_id,
            run_id,
            triggered_by,
            raw_prompt,
            structured_task: None,
            done_spec,
            plan: None,
            plan_issues: Vec::new(),
            replan_count: 0,
            status: ManifestStatus::Planning,
            completed_steps: Vec::new(),
            failure_count: 0,
            tools_used: Vec::new(),
            started_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            ended_at: None,
            model_name,
        }
    }

    /// 切换到执行状态
    pub fn start_executing(&mut self, plan: AgentPlan) {
        self.plan = Some(plan);
        self.status = ManifestStatus::Executing;
    }

    /// 记录步骤完成
    pub fn complete_step(&mut self, step: PlanStep, tool_name: Option<String>) {
        self.completed_steps.push(step);
        if let Some(tool) = tool_name {
            if !self.tools_used.contains(&tool) {
                self.tools_used.push(tool);
            }
        }
    }

    /// 记录失败
    pub fn record_failure(&mut self) {
        self.failure_count += 1;
    }

    /// 标记任务完成
    pub fn mark_completed(&mut self) {
        self.status = ManifestStatus::Completed;
        self.ended_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    }

    /// 标记任务失败
    pub fn mark_failed(&mut self) {
        self.status = ManifestStatus::Failed;
        self.ended_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    }

    /// 进入重规划
    pub fn start_replan(&mut self) {
        self.status = ManifestStatus::Replanning;
        self.replan_count += 1;
    }
}
