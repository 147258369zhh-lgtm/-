use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Agent Runtime V5 — Stop Judge
//
// Independent module that evaluates every round and decides
// whether to continue or abort the ReAct loop.
// This is NOT the LLM's job — it's a deterministic safety layer.
// ═══════════════════════════════════════════════════════════════

pub struct StopJudge {
    budget: RunBudget,
    consecutive_failures: u32,
    last_tool_calls: Vec<String>, // track tool-call patterns for no-progress detection
}

impl StopJudge {
    pub fn new(budget: RunBudget) -> Self {
        Self {
            budget,
            consecutive_failures: 0,
            last_tool_calls: vec![],
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(RunBudget::default())
    }

    // ─── Called before each LLM invocation ───────────────────────

    /// Check all budget limits BEFORE the next round.
    pub fn check_before_round(&self, run: &Run, elapsed_secs: u64) -> StopDecision {
        // Max rounds
        if run.round >= self.budget.max_rounds {
            return StopDecision::stop(
                StopReason::MaxRoundsExceeded,
                format!("已达最大轮数 ({})", self.budget.max_rounds),
            );
        }
        // Max tool calls
        if run.tool_trace.len() as u32 >= self.budget.max_tool_calls {
            return StopDecision::stop(
                StopReason::BudgetExceeded,
                format!("工具调用次数超限 ({})", self.budget.max_tool_calls),
            );
        }
        // Max time
        if elapsed_secs >= self.budget.max_elapsed_secs {
            return StopDecision::stop(
                StopReason::BudgetExceeded,
                format!("执行时间超限 ({}s)", self.budget.max_elapsed_secs),
            );
        }
        // Max tokens
        if run.tokens_used >= self.budget.max_tokens {
            return StopDecision::stop(
                StopReason::BudgetExceeded,
                format!("Token 用量超限 ({})", self.budget.max_tokens),
            );
        }
        StopDecision::keep_going()
    }

    // ─── Called after tool execution ─────────────────────────────

    /// Record tool results and check for consecutive failures.
    pub fn record_tool_results(&mut self, results: &[ToolResult]) -> StopDecision {
        let all_failed = !results.is_empty() && results.iter().all(|r| !r.success);

        if all_failed {
            self.consecutive_failures += 1;
            app_log!("STOPJUDGE", "consecutive_failures={}", self.consecutive_failures);

            if self.consecutive_failures >= self.budget.max_consecutive_failures {
                return StopDecision::stop(
                    StopReason::ConsecutiveToolFailures,
                    format!(
                        "连续 {} 轮工具全部失败",
                        self.budget.max_consecutive_failures
                    ),
                );
            }
        } else {
            // Reset on any partial success
            self.consecutive_failures = 0;
        }

        // Check for no-progress loop: same tool called 3 times in a row
        let current_tools: Vec<String> = results.iter().map(|r| r.tool_name.clone()).collect();
        self.last_tool_calls.extend(current_tools.iter().cloned());
        if self.last_tool_calls.len() > 6 {
            let recent = &self.last_tool_calls[self.last_tool_calls.len()-6..];
            if recent.windows(2).all(|w| w[0] == w[1]) {
                return StopDecision::stop(
                    StopReason::NoProgress,
                    format!("重复调用相同工具未取得进展: {}", recent[0]),
                );
            }
        }

        StopDecision::keep_going()
    }

    /// Called when a human intervention is needed — triggers WaitingHuman state.
    pub fn needs_human(gate: HumanGateType, reason: &str) -> StopDecision {
        StopDecision::stop(
            StopReason::LoginRequired,  // reuse as "human needed"
            format!("{:?}: {}", gate, reason),
        )
    }
}
