use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════
// Stop Judge — 独立终止判断器（不依赖 LLM）
// ═══════════════════════════════════════════════

/// Evaluate whether execution should stop
/// Returns StopDecision::Continue or a stop variant with reason
pub fn evaluate(
    completed_count: usize,
    total_steps: usize,
    consecutive_failures: u32,
    total_failures: u32,
    budget: &CostBudget,
    elapsed_secs: u64,
) -> StopDecision {
    // 1. All steps completed → success
    if completed_count >= total_steps && total_steps > 0 {
        app_log!("STOP_JUDGE", "All {} steps completed → StopSuccess", total_steps);
        return StopDecision::StopSuccess("所有步骤已完成".into());
    }

    // 2. Max steps exceeded
    if completed_count as u32 >= budget.max_steps {
        app_log!("STOP_JUDGE", "Max steps ({}) reached → StopFailure", budget.max_steps);
        return StopDecision::StopFailure(format!(
            "已达到最大步骤数限制 ({})", budget.max_steps
        ));
    }

    // 3. Consecutive failures → no useful progress
    if consecutive_failures >= 3 {
        app_log!("STOP_JUDGE", "3 consecutive failures → StopFailure");
        return StopDecision::StopFailure(
            "连续 3 次失败，无有效进展".into()
        );
    }

    // 4. Too many total failures
    if total_failures >= 5 {
        app_log!("STOP_JUDGE", "5 total failures → StopFailure");
        return StopDecision::StopFailure(
            "总失败次数过多 (5次)，终止执行".into()
        );
    }

    // 5. Time budget exceeded
    if elapsed_secs > budget.max_time_secs {
        app_log!("STOP_JUDGE", "Time budget {}s exceeded (elapsed {}s) → StopFailure",
            budget.max_time_secs, elapsed_secs);
        return StopDecision::StopFailure(format!(
            "执行超时（已用 {}秒，限制 {}秒）", elapsed_secs, budget.max_time_secs
        ));
    }

    StopDecision::Continue
}
