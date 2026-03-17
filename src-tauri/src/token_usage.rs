// Token Usage tracking module — 独立模块，追踪 AI API 调用的 token 消耗
// 遵循 ARCHITECTURE.md 模块化规范

use serde::Serialize;
use sqlx::SqlitePool;

/// 记录一条 token 使用记录（由 ai.rs 调用）
pub async fn record_token_usage(
    pool: &SqlitePool,
    module: &str,
    model_name: &str,
    provider: &str,
    prompt_tokens: i64,
    completion_tokens: i64,
) {
    let id = uuid::Uuid::new_v4().to_string();
    let total = prompt_tokens + completion_tokens;
    // 判断本地/网络
    let source = if provider == "ollama" || provider == "lmstudio" || provider == "local" {
        "local"
    } else {
        "network"
    };
    let _ = sqlx::query(
        "INSERT INTO token_usage (id, module, model_name, provider, source, prompt_tokens, completion_tokens, total_tokens) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    )
    .bind(&id)
    .bind(module)
    .bind(model_name)
    .bind(provider)
    .bind(source)
    .bind(prompt_tokens)
    .bind(completion_tokens)
    .bind(total)
    .execute(pool)
    .await;
}

// ── 查询返回结构 ──

#[derive(Serialize, Clone)]
pub struct TokenSummary {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub call_count: i64,
}

#[derive(Serialize, Clone)]
pub struct TimelineBucket {
    pub time_label: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Serialize, Clone)]
pub struct ModuleUsage {
    pub module: String,
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub call_count: i64,
    pub percentage: f64,
}

#[derive(Serialize, Clone)]
pub struct ProviderUsage {
    pub provider: String,
    pub total_tokens: i64,
    pub call_count: i64,
    pub percentage: f64,
}

#[derive(Serialize, Clone)]
pub struct TokenStatsResponse {
    pub summary: TokenSummary,
    pub timeline: Vec<TimelineBucket>,
    pub by_module: Vec<ModuleUsage>,
    pub by_provider: Vec<ProviderUsage>,
    pub available_providers: Vec<String>,
}

/// Tauri 命令: 获取 token 统计数据
/// source: "all" | "local" | "network"
/// provider: "" (all) | specific provider name
#[tauri::command]
pub async fn get_token_stats(
    range: String,
    source: Option<String>,
    provider: Option<String>,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<TokenStatsResponse, String> {
    // Build WHERE clauses
    let mut filters = vec!["1=1".to_string()];

    match range.as_str() {
        "day" => filters.push("timestamp >= datetime('now', '-1 day', 'localtime')".to_string()),
        "week" => filters.push("timestamp >= datetime('now', '-7 days', 'localtime')".to_string()),
        _ => {} // "all"
    }

    if let Some(ref s) = source {
        if s == "local" {
            filters.push("source = 'local'".to_string());
        } else if s == "network" {
            filters.push("source = 'network'".to_string());
        }
    }

    if let Some(ref p) = provider {
        if !p.is_empty() {
            filters.push(format!("provider = '{}'", p.replace('\'', "''")));
        }
    }

    let where_clause = filters.join(" AND ");

    // 1) Summary
    let summary_sql = format!(
        "SELECT COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(total_tokens),0), COUNT(*) FROM token_usage WHERE {}",
        where_clause
    );
    let row = sqlx::query_as::<_, (i64, i64, i64, i64)>(&summary_sql)
        .fetch_one(pool.inner())
        .await
        .unwrap_or((0, 0, 0, 0));
    let summary = TokenSummary {
        prompt_tokens: row.0,
        completion_tokens: row.1,
        total_tokens: row.2,
        call_count: row.3,
    };

    // 2) Timeline — 5 分钟分组
    let timeline_sql = format!(
        "SELECT strftime('%H:', timestamp) || printf('%02d', (CAST(strftime('%M', timestamp) AS INTEGER) / 5) * 5) as bucket,
         COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(total_tokens),0)
         FROM token_usage WHERE {}
         GROUP BY bucket ORDER BY bucket",
        where_clause
    );
    let timeline_rows = sqlx::query_as::<_, (String, i64, i64, i64)>(&timeline_sql)
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let timeline: Vec<TimelineBucket> = timeline_rows
        .into_iter()
        .map(|(label, pt, ct, tt)| TimelineBucket {
            time_label: label,
            prompt_tokens: pt,
            completion_tokens: ct,
            total_tokens: tt,
        })
        .collect();

    // 3) By module
    let module_sql = format!(
        "SELECT module, COALESCE(SUM(total_tokens),0), COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COUNT(*)
         FROM token_usage WHERE {}
         GROUP BY module ORDER BY SUM(total_tokens) DESC",
        where_clause
    );
    let module_rows = sqlx::query_as::<_, (String, i64, i64, i64, i64)>(&module_sql)
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let grand_total = summary.total_tokens.max(1) as f64;
    let by_module: Vec<ModuleUsage> = module_rows
        .into_iter()
        .map(|(m, tt, pt, ct, cc)| ModuleUsage {
            module: m,
            total_tokens: tt,
            prompt_tokens: pt,
            completion_tokens: ct,
            call_count: cc,
            percentage: (tt as f64 / grand_total * 100.0 * 10.0).round() / 10.0,
        })
        .collect();

    // 4) By provider
    let provider_sql = format!(
        "SELECT provider, COALESCE(SUM(total_tokens),0), COUNT(*)
         FROM token_usage WHERE {}
         GROUP BY provider ORDER BY SUM(total_tokens) DESC",
        where_clause
    );
    let provider_rows = sqlx::query_as::<_, (String, i64, i64)>(&provider_sql)
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let by_provider: Vec<ProviderUsage> = provider_rows
        .into_iter()
        .map(|(p, tt, cc)| ProviderUsage {
            provider: p,
            total_tokens: tt,
            call_count: cc,
            percentage: (tt as f64 / grand_total * 100.0 * 10.0).round() / 10.0,
        })
        .collect();

    // 5) All available providers (for filter dropdown)
    let all_providers: Vec<String> = sqlx::query_as::<_, (String,)>(
        "SELECT DISTINCT provider FROM token_usage WHERE provider IS NOT NULL AND provider != '' ORDER BY provider"
    )
    .fetch_all(pool.inner())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(p,)| p)
    .collect();

    Ok(TokenStatsResponse {
        summary,
        timeline,
        by_module,
        by_provider,
        available_providers: all_providers,
    })
}

/// Tauri 命令: 清除所有 token 记录
#[tauri::command]
pub async fn clear_token_stats(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    sqlx::query("DELETE FROM token_usage")
        .execute(pool.inner())
        .await
        .map_err(|e| format!("清除失败: {}", e))?;
    Ok("已清除所有 Token 记录".to_string())
}
