use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════
// Cost Tracker — 成本追踪与预算控制
// ═══════════════════════════════════════════════
// 唯一核心输出: CostStatus
// 职责: Token/步骤/时间/工具调用预算管控

/// Current cost status
#[derive(Debug, Clone)]
pub struct CostStatus {
    pub within_budget: bool,
    pub warning: Option<String>,
    pub usage_percent: f32,
}

/// Runtime cost tracker
#[derive(Debug)]
pub struct CostTracker {
    pub budget: CostBudget,
    pub steps_used: u32,
    pub tool_calls_used: u32,
    pub start_time: std::time::Instant,
}

impl CostTracker {
    pub fn new(budget: CostBudget) -> Self {
        Self {
            budget,
            steps_used: 0,
            tool_calls_used: 0,
            start_time: std::time::Instant::now(),
        }
    }

    /// Record a step completion
    pub fn record_step(&mut self) {
        self.steps_used += 1;
    }

    /// Record a tool call
    pub fn record_tool_call(&mut self) {
        self.tool_calls_used += 1;
    }

    /// Check current cost status
    pub fn check(&self) -> CostStatus {
        let elapsed = self.start_time.elapsed().as_secs();

        // Calculate usage percentages
        let step_pct = self.steps_used as f32 / self.budget.max_steps.max(1) as f32;
        let tool_pct = self.tool_calls_used as f32 / self.budget.max_tool_calls.max(1) as f32;
        let time_pct = elapsed as f32 / self.budget.max_time_secs.max(1) as f32;
        let max_pct = step_pct.max(tool_pct).max(time_pct);

        // Over budget
        if self.steps_used >= self.budget.max_steps {
            return CostStatus {
                within_budget: false,
                warning: Some(format!("步骤数已达上限 ({}/{})",
                    self.steps_used, self.budget.max_steps)),
                usage_percent: max_pct * 100.0,
            };
        }
        if self.tool_calls_used >= self.budget.max_tool_calls {
            return CostStatus {
                within_budget: false,
                warning: Some(format!("工具调用已达上限 ({}/{})",
                    self.tool_calls_used, self.budget.max_tool_calls)),
                usage_percent: max_pct * 100.0,
            };
        }
        if elapsed >= self.budget.max_time_secs {
            return CostStatus {
                within_budget: false,
                warning: Some(format!("执行时间已超限 ({}s/{}s)",
                    elapsed, self.budget.max_time_secs)),
                usage_percent: max_pct * 100.0,
            };
        }

        // Warning at 80%
        if max_pct >= 0.8 {
            let warning = if step_pct >= 0.8 {
                format!("步骤数已用 80% ({}/{})", self.steps_used, self.budget.max_steps)
            } else if tool_pct >= 0.8 {
                format!("工具调用已用 80% ({}/{})", self.tool_calls_used, self.budget.max_tool_calls)
            } else {
                format!("时间已用 80% ({}s/{}s)", elapsed, self.budget.max_time_secs)
            };
            app_log!("COST", "⚠️ {}", warning);
            return CostStatus {
                within_budget: true,
                warning: Some(warning),
                usage_percent: max_pct * 100.0,
            };
        }

        CostStatus {
            within_budget: true,
            warning: None,
            usage_percent: max_pct * 100.0,
        }
    }

    /// Get a summary string
    pub fn summary(&self) -> String {
        let elapsed = self.start_time.elapsed().as_secs();
        format!("步骤 {}/{}, 工具调用 {}/{}, 时间 {}s/{}s",
            self.steps_used, self.budget.max_steps,
            self.tool_calls_used, self.budget.max_tool_calls,
            elapsed, self.budget.max_time_secs)
    }
}
