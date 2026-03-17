# Agent v3 Learning Agent System 升级文档

> 日期：2026-03-17  
> 版本：v3.0  
> 范围：Rust 后端 18 模块 + React 前端 Agent 管理产品层

---

## 一、升级概述

本次升级将 Agent 系统从 **"单次任务执行器"** 进化为 **"持续进化的 Learning Agent System"**，实现了 6 层架构 × 4 阶段实施，新增 12 个 Rust 模块和 1 个 React 组件。

### 核心变化

| 维度 | v2（旧） | v3（新） |
|------|---------|---------|
| 架构 | 单文件 agent.rs | 18 模块分层架构 |
| 规划 | 纯 LLM 生成 | 经验检索 + LLM 生成（v3） |
| 执行 | 单轮调用 | ReAct 循环 + 工具治理 |
| 终止 | LLM 判断 | 5 种硬判断（不依赖 LLM） |
| 反思 | 简单总结 | 结构化归因（9 种失败分类） |
| 学习 | 无 | 经验 SQLite 存储 + 模板自学习 |
| 产品层 | 仅 chat 调用 | Agent 管理中心（创建/运行/记录） |

---

## 二、新增模块清单

### P1: 最小稳定闭环

| 模块 | 文件 | 核心能力 |
|------|------|---------|
| 类型系统 | `types.rs` | 冻结全部核心类型：PlanNode, CostBudget, AgentBlueprint 等 |
| 任务结构化 | `task_structurer.rs` | 7 种意图分类 + 工具过滤 + 复杂度预估 |
| 经验系统 | `experience.rs` | SQLite 存储/检索/评分，支持意图相似搜索 |
| 停止判断 | `stop_judge.rs` | 5 种硬判断：步数上限、连续失败、超时、重复输出、空执行 |
| 上下文管理 | `context_manager.rs` | 消息压缩（保留 head+tail，摘要 middle） |
| 提示词构建 | `prompt_builder.rs` | ReAct 格式 + web_scrape 优先提示 |
| 执行器 | `executor.rs` | ReAct 循环 + tool_choice=required |

### P2: 控制能力

| 模块 | 文件 | 核心能力 |
|------|------|---------|
| 规划器 v3 | `planner.rs` | 经验检索 → 注入 prompt → 生成计划 |
| 工具知识 | `tool_knowledge.rs` | 11 个工具知识卡片（最佳场景/限制/常见错误/替代） |
| 工具策略 | `tool_policy.rs` | 分级治理 + 参数校验 + 调用限制 + 危险命令拦截 |
| 成本追踪 | `cost_tracker.rs` | 步骤/工具/时间三维预算 + 80% 预警 |
| 失败分析 | `failure_analyzer.rs` | 9 种失败归因 + 5 种修复建议 |

### P3: 学习与记忆增强

| 模块 | 文件 | 核心能力 |
|------|------|---------|
| 反思引擎 v3 | `reflection.rs` | 结构化 ReflectionResult（FailureCategory + FixAction） |

### P4: Agent Factory

| 模块 | 文件 | 核心能力 |
|------|------|---------|
| Agent 工厂 | `agent_factory.rs` | LLM 生成 AgentBlueprint（角色/目标/工作流/工具范围） |
| Agent 注册 | `agent_registry.rs` | SQLite CRUD + 版本管理 + 使用计数 + 成功率追踪 |
| 模板引擎 | `template_engine.rs` | 内置模板 + 失败黑名单 + 从经验自动学习新模板 |

---

## 三、产品层（前端）

### 新增 Tauri Commands

| 命令 | 功能 |
|------|------|
| `agent_create_blueprint` | 一句话创建 Agent Blueprint |
| `agent_list_blueprints` | 列出全部已保存 Agent |
| `agent_delete_blueprint` | 删除 Agent |
| `agent_list_experiences` | 查询最近执行记录 |

### AgentManager.tsx

新增独立 React 组件，通过侧边栏「Agent 中心」入口访问：

- **我的 Agent** — Blueprint 卡片列表，点击「运行」直接执行
- **执行面板** — 实时监听 `agent-event`，展示：
  - 📋 任务规划
  - ⚡ 工具调用（工具名 + 参数 + 耗时）
  - 🔄 反思修正
  - 🎯 最终结果
- **执行记录** — 成功/失败/成功率统计 + 准确度/效率/工具评分条
- **创建 Agent** — 一句话输入 + 4 个快速模板

---

## 四、架构设计原则

### 模块边界不变式

```
runtime ≠ policy      → tool_runtime="能不能执行" / tool_policy="应不应该执行"
memory ≠ context       → memory="持久化存储" / context_manager="运行态管理"
单向沉淀               → experience → failure_analyzer → tool_knowledge（不反向）
唯一输出               → 每个模块只产出一种核心数据结构
```

### 数据流

```
用户输入
  → task_structurer（意图分类+工具过滤）
  → planner v3（经验检索+计划生成）
  → executor（ReAct 循环）
    → tool_policy（准入判断）
    → tool_runtime（执行）
    → stop_judge（终止判断）
    → context_manager（消息压缩）
  → reflection v3（结构化归因）
  → experience（经验写回 SQLite）
```

---

## 五、修改文件清单

### 后端（Rust）

**新增文件（12 个）：**
- `src-tauri/src/agent/task_structurer.rs`
- `src-tauri/src/agent/experience.rs`
- `src-tauri/src/agent/stop_judge.rs`
- `src-tauri/src/agent/context_manager.rs`
- `src-tauri/src/agent/tool_knowledge.rs`
- `src-tauri/src/agent/tool_policy.rs`
- `src-tauri/src/agent/cost_tracker.rs`
- `src-tauri/src/agent/failure_analyzer.rs`
- `src-tauri/src/agent/agent_factory.rs`
- `src-tauri/src/agent/agent_registry.rs`
- `src-tauri/src/agent/template_engine.rs`
- `src/utils/logger.ts`

**修改文件（15 个）：**
- `src-tauri/src/agent/mod.rs` — 模块注册 + Blueprint CRUD commands
- `src-tauri/src/agent/types.rs` — 冻结类型系统
- `src-tauri/src/agent/planner.rs` — 升级 v3（经验驱动）
- `src-tauri/src/agent/reflection.rs` — 升级 v3（结构化归因）
- `src-tauri/src/agent/executor.rs` — ReAct 循环
- `src-tauri/src/agent/prompt_builder.rs` — ReAct 格式
- `src-tauri/src/agent/tool_runtime.rs` — 工具执行
- `src-tauri/src/lib.rs` — 注册新 Tauri commands
- `src-tauri/src/commands.rs` — 命令调整
- `src-tauri/src/logger.rs` — 日志增强

### 前端（React/TSX）

**新增：**
- `src/components/AgentManager.tsx` — Agent 管理中心（CRUD + 执行 + 记录）

**修改：**
- `src/components/Sidebar.tsx` — 新增「Agent 中心」导航项
- `src/App.tsx` — 路由集成 AgentManager
- `src/components/AbilityManager.tsx` — 调整

---

## 六、编译状态

| 检查项 | 状态 |
|--------|------|
| `cargo check`（Rust 后端） | ✅ 通过 |
| `tsc --noEmit`（TypeScript 前端） | ✅ 通过 |
| `tauri dev`（完整运行） | ✅ 通过 |
