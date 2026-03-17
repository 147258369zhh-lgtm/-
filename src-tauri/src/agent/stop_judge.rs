use super::types::*;
use crate::app_log;

// ═══════════════════════════════════════════════
// Stop Judge v3 — 同质/异质失败 + ForceReplan
// ═══════════════════════════════════════════════
// 借鉴 Agentic Design Patterns 的"独立裁判"模式
// - 同质失败（同一工具同类错误≥2） → ForceReplan 换策略
// - 异质失败（不同工具/策略≥3） → StopFailure 终止

/// Evaluate whether execution should stop
/// v3: Returns ForceReplan for homogeneous failures
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

    // 3. 同质失败检测 — 连续2次失败先尝试 ForceReplan
    if consecutive_failures == 2 {
        app_log!("STOP_JUDGE", "{} consecutive failures → ForceReplan", consecutive_failures);
        return StopDecision::ForceReplan(
            format!("连续 {} 次同质失败，强制换策略重规划", consecutive_failures)
        );
    }

    // 4. 连续失败达到4次 — 即使重规划也救不了
    if consecutive_failures >= 4 {
        app_log!("STOP_JUDGE", "{} consecutive failures → StopFailure", consecutive_failures);
        return StopDecision::StopFailure(
            format!("连续 {} 次失败（含重规划尝试），无有效进展", consecutive_failures)
        );
    }

    // 5. Total failures — lenient with fallbacks
    if total_failures >= 7 {
        app_log!("STOP_JUDGE", "{} total failures → StopFailure", total_failures);
        return StopDecision::StopFailure(
            format!("总失败次数过多 ({}次)，终止执行", total_failures)
        );
    }

    // 6. Time budget exceeded
    if elapsed_secs > budget.max_time_secs {
        app_log!("STOP_JUDGE", "Time budget {}s exceeded (elapsed {}s) → StopFailure",
            budget.max_time_secs, elapsed_secs);
        return StopDecision::StopFailure(format!(
            "执行超时（已用 {}秒，限制 {}秒）", elapsed_secs, budget.max_time_secs
        ));
    }

    // 7. Near-complete leniency
    if total_steps > 0 && completed_count * 4 >= total_steps * 3 {
        if total_failures >= 10 {
            app_log!("STOP_JUDGE", "Near-complete ({}%) but too many failures", 
                completed_count * 100 / total_steps);
            return StopDecision::StopFailure("接近完成但失败过多".into());
        }
    }

    StopDecision::Continue
}
