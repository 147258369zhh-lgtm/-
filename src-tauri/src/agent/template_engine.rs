use super::types::*;
use crate::app_log;
use crate::db::DbPool;

// ═══════════════════════════════════════════════
// Template Engine — 模板匹配 + 自动进化
// ═══════════════════════════════════════════════
// 唯一核心输出: MatchedTemplate
// 职责: 正向模板（成功套路）+ 负向模板（失败黑名单）

/// A matched template with its confidence
#[derive(Debug, Clone)]
pub struct MatchedTemplate {
    pub template_name: String,
    pub workflow: Vec<PlanStep>,
    pub confidence: f32,
    pub source: TemplateSource,
}

#[derive(Debug, Clone)]
pub enum TemplateSource {
    Builtin,
    LearnedFromExperience,
}

/// Built-in templates for common task patterns
pub fn match_builtin_template(intent: &TaskIntent, goal: &str) -> Option<MatchedTemplate> {
    let g = goal.to_lowercase();

    match intent {
        TaskIntent::InformationGathering => {
            if g.contains("新闻") || g.contains("news") {
                return Some(MatchedTemplate {
                    template_name: "新闻采集".into(),
                    workflow: vec![
                        PlanStep { id: 1, task: "使用 web_scrape 爬取新闻网站首页".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                        PlanStep { id: 2, task: "使用 web_scrape 提取新闻标题和链接".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                        PlanStep { id: 3, task: "使用 file_write 将新闻汇总写入文件".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                    ],
                    confidence: 0.9,
                    source: TemplateSource::Builtin,
                });
            }
            if g.contains("天气") || g.contains("weather") {
                return Some(MatchedTemplate {
                    template_name: "天气查询".into(),
                    workflow: vec![
                        PlanStep { id: 1, task: "使用 web_scrape 爬取天气网站获取天气信息".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                        PlanStep { id: 2, task: "使用 file_write 将天气信息整理输出".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                    ],
                    confidence: 0.95,
                    source: TemplateSource::Builtin,
                });
            }
            None
        }
        TaskIntent::DataAnalysis => {
            if g.contains("excel") || g.contains("表格") {
                return Some(MatchedTemplate {
                    template_name: "Excel数据分析".into(),
                    workflow: vec![
                        PlanStep { id: 1, task: "使用 excel_read 读取Excel文件内容".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                        PlanStep { id: 2, task: "使用 excel_analyze 对数据进行统计分析".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                        PlanStep { id: 3, task: "使用 file_write 将分析结果写入文件".into(), status: StepStatus::Pending, result: None, depends_on: vec![] },
                    ],
                    confidence: 0.85,
                    source: TemplateSource::Builtin,
                });
            }
            None
        }
        _ => None,
    }
}

/// Check if a workflow matches any known failure pattern (negative template)
pub fn check_failure_blacklist(intent: &TaskIntent, tools: &[String]) -> Option<String> {
    // Known bad patterns
    if tools.contains(&"browser_navigate".to_string())
        && !tools.contains(&"web_scrape".to_string())
        && matches!(intent, TaskIntent::InformationGathering) {
        return Some("信息采集任务应优先使用 web_scrape 而非 browser_navigate".into());
    }

    if tools.iter().filter(|t| t.as_str() == "shell_run").count() > 3 {
        return Some("过多 shell_run 调用可能导致不稳定".into());
    }

    None
}

/// Try to create a template from successful experience
pub async fn learn_template_from_experience(
    pool: &DbPool,
    intent: &TaskIntent,
) -> Option<MatchedTemplate> {
    // Find the best successful plan for this intent
    let best_plan = super::experience::get_best_plan(pool, intent).await?;

    // Parse the plan
    if let Ok(steps) = serde_json::from_str::<Vec<PlanStep>>(&best_plan) {
        if !steps.is_empty() {
            app_log!("TEMPLATE", "Learned template from experience for {:?}: {} steps",
                intent, steps.len());
            return Some(MatchedTemplate {
                template_name: format!("{:?}_learned", intent),
                workflow: steps,
                confidence: 0.7,
                source: TemplateSource::LearnedFromExperience,
            });
        }
    }

    None
}
