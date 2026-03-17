use serde::{Serialize, Deserialize};

// ═══════════════════════════════════════════════
// RunTrace — 结构化执行追踪
// ═══════════════════════════════════════════════
// 每次 Agent 执行生成完整的 trace，用于：
// - 调试和分析
// - Experience 学习
// - UI 展示

/// 一次完整执行的结构化追踪
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunTrace {
    /// 关联的任务 ID
    pub task_id: String,
    /// 运行 ID
    pub run_id: String,
    /// 追踪事件列表
    pub events: Vec<TraceEvent>,
}

/// 追踪事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceEvent {
    /// 事件时间戳（ISO 8601）
    pub timestamp: String,
    /// 事件类型
    pub event_type: TraceEventType,
    /// 事件详情
    pub detail: String,
    /// 相关数据（JSON）
    pub metadata: Option<serde_json::Value>,
}

/// 事件类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TraceEventType {
    /// 任务开始
    TaskStart,
    /// 计划生成
    PlanGenerated,
    /// 计划审查
    PlanValidated,
    /// 步骤开始执行
    StepStart,
    /// 步骤成功
    StepSuccess,
    /// 步骤失败
    StepFailed,
    /// 工具降级
    ToolFallback,
    /// 重规划
    Replan,
    /// 目标检测
    GoalCheck,
    /// 任务完成
    TaskCompleted,
    /// 任务失败
    TaskFailed,
    /// 上下文压缩
    ContextCompressed,
}

impl RunTrace {
    /// 创建新的 trace
    pub fn new(task_id: String, run_id: String) -> Self {
        Self {
            task_id,
            run_id,
            events: Vec::new(),
        }
    }

    /// 添加事件
    pub fn add_event(&mut self, event_type: TraceEventType, detail: String) {
        self.events.push(TraceEvent {
            timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            event_type,
            detail,
            metadata: None,
        });
    }

    /// 添加带元数据的事件
    pub fn add_event_with_meta(
        &mut self,
        event_type: TraceEventType,
        detail: String,
        metadata: serde_json::Value,
    ) {
        self.events.push(TraceEvent {
            timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            event_type,
            detail,
            metadata: Some(metadata),
        });
    }

    /// 导出为 JSON 字符串
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}
