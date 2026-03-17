import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Bot, Plus, Trash2, Play, Search, Brain, Zap,
  Clock, CheckCircle2, XCircle, BarChart3, ChevronDown,
  ChevronUp, Sparkles, Target, Wrench, Shield, Square, Loader
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ═══════════════════════════════════════════════
// Agent Manager — Blueprint CRUD + 点击即用执行
// ═══════════════════════════════════════════════

interface BlueprintInfo {
  id: string;
  name: string;
  persona: string;
  goal_template: string;
  tool_count: number;
  workflow_steps: number;
  version: string;
  created_at: string;
}

interface ExperienceInfo {
  id: string;
  task_summary: string;
  intent: string;
  success: boolean;
  score: { accuracy: number; efficiency: number; tool_usage: number };
  created_at: string;
}

interface AgentStep {
  step_type: string;
  content: string;
  tool_name?: string;
  tool_args?: any;
  tool_result?: string;
  duration_ms?: number;
}

interface RunState {
  blueprintId: string;
  blueprintName: string;
  status: 'running' | 'success' | 'failed';
  steps: AgentStep[];
  finalAnswer: string;
  currentStep: string;
}

export default function AgentManager() {
  const [activeView, setActiveView] = useState<'blueprints' | 'experiences' | 'create'>('blueprints');
  const [blueprints, setBlueprints] = useState<BlueprintInfo[]>([]);
  const [experiences, setExperiences] = useState<ExperienceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [createInput, setCreateInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedExp, setExpandedExp] = useState<string | null>(null);

  // Execution state
  const [runState, setRunState] = useState<RunState | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest step
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runState?.steps.length]);

  // Load data
  const loadBlueprints = useCallback(async () => {
    try {
      const bps = await invoke<BlueprintInfo[]>('agent_list_blueprints');
      setBlueprints(bps);
    } catch (e) {
      console.error('Failed to load blueprints:', e);
    }
  }, []);

  const loadExperiences = useCallback(async () => {
    try {
      const exps = await invoke<ExperienceInfo[]>('agent_list_experiences', { limit: 20 });
      setExperiences(exps);
    } catch (e) {
      console.error('Failed to load experiences:', e);
    }
  }, []);

  useEffect(() => {
    loadBlueprints();
    loadExperiences();
  }, [loadBlueprints, loadExperiences]);

  // ── Execute Blueprint ──
  const handleRun = async (bp: BlueprintInfo) => {
    if (runState?.status === 'running') return;

    // Initialize run state
    setRunState({
      blueprintId: bp.id,
      blueprintName: bp.name,
      status: 'running',
      steps: [],
      finalAnswer: '',
      currentStep: '正在初始化...',
    });

    // Listen for agent events
    const unlisten = await listen<any>('agent-event', (event) => {
      const step = event.payload;
      if (!step) return;

      setRunState(prev => {
        if (!prev) return prev;

        // Update current step display
        let currentStep = prev.currentStep;
        if (step.step_type === 'planning') currentStep = '📋 生成执行计划...';
        else if (step.step_type === 'tool_call') currentStep = `⚡ 调用工具: ${step.tool_name || ''}`;
        else if (step.step_type === 'reflection') currentStep = '🔄 反思分析...';
        else if (step.step_type === 'final') currentStep = '🎯 生成最终结果';

        return {
          ...prev,
          steps: [...prev.steps, step],
          currentStep,
        };
      });
    });
    unlistenRef.current = unlisten;

    try {
      // Build the goal from template
      const goal = bp.goal_template || bp.name;

      const result: any = await invoke('agent_run', {
        req: {
          prompt: goal,
          system_prompt: bp.persona ? `你是 ${bp.persona}` : null,
          project_id: null,
          allowed_paths: null,
          max_rounds: 15,
          model_config_id: null,
          goal: goal,
          task_id: null,
          enabled_tools: null,
          context_files: null,
        }
      });

      setRunState(prev => prev ? {
        ...prev,
        status: result.success ? 'success' : 'failed',
        finalAnswer: result.final_answer || '(Agent 未返回结果)',
        currentStep: result.success ? '✅ 执行完成' : '❌ 执行失败',
      } : null);

      // Reload experiences after run
      loadExperiences();
    } catch (e: any) {
      setRunState(prev => prev ? {
        ...prev,
        status: 'failed',
        finalAnswer: `执行失败: ${e?.toString() || '未知错误'}`,
        currentStep: '❌ 执行出错',
      } : null);
    } finally {
      unlisten();
      unlistenRef.current = null;
    }
  };

  // Create blueprint
  const handleCreate = async () => {
    if (!createInput.trim() || creating) return;
    setCreating(true);
    try {
      await invoke<BlueprintInfo>('agent_create_blueprint', {
        description: createInput,
      });
      setCreateInput('');
      setActiveView('blueprints');
      await loadBlueprints();
    } catch (e) {
      console.error('Failed to create blueprint:', e);
      alert(`创建失败: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  // Delete blueprint
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此 Agent？')) return;
    try {
      await invoke('agent_delete_blueprint', { id });
      await loadBlueprints();
    } catch (e) {
      console.error('Failed to delete blueprint:', e);
    }
  };

  // Step type icon
  const StepIcon = ({ type }: { type: string }) => {
    if (type === 'planning') return <span>📋</span>;
    if (type === 'tool_call') return <span>⚡</span>;
    if (type === 'reflection') return <span>🔄</span>;
    if (type === 'final') return <span>🎯</span>;
    return <span>▶️</span>;
  };

  // Score bar
  const ScoreBar = ({ value, max = 10, label }: { value: number; max?: number; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <span style={{ color: 'var(--text-secondary)', width: '48px' }}>{label}</span>
      <div style={{ flex: 1, height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${(value / max) * 100}%`, height: '100%', borderRadius: '3px',
          background: value >= 7 ? 'var(--accent-success)' : value >= 4 ? 'var(--accent-warning)' : 'var(--accent-danger)',
          transition: 'width 0.3s ease'
        }} />
      </div>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600, width: '20px', textAlign: 'right' }}>{value}</span>
    </div>
  );

  // Intent badge
  const IntentBadge = ({ intent }: { intent: string }) => {
    const clean = intent.replace(/"/g, '');
    const colors: Record<string, string> = {
      'InformationGathering': '#3b82f6', 'DataAnalysis': '#8b5cf6',
      'DocumentGeneration': '#f59e0b', 'FileOperation': '#10b981', 'SystemCommand': '#ef4444',
    };
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 500,
        background: `${colors[clean] || '#6b7280'}20`, color: colors[clean] || '#6b7280',
        border: `1px solid ${colors[clean] || '#6b7280'}40`,
      }}>{clean}</span>
    );
  };

  // ═══════════════════════════════════════════════
  // Execution Progress Panel (overlays on top when running)
  // ═══════════════════════════════════════════════
  if (runState) {
    const isRunning = runState.status === 'running';
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={18} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontWeight: 700, fontSize: '15px' }}>{runState.blueprintName}</span>
            <span style={{
              fontSize: '11px', padding: '2px 10px', borderRadius: '10px', fontWeight: 600,
              background: isRunning ? '#3b82f620' : runState.status === 'success' ? '#10b98120' : '#ef444420',
              color: isRunning ? '#3b82f6' : runState.status === 'success' ? '#10b981' : '#ef4444',
            }}>
              {isRunning ? '执行中...' : runState.status === 'success' ? '成功' : '失败'}
            </span>
          </div>
          {!isRunning && (
            <button onClick={() => { setRunState(null); }} style={{
              padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
            }}>← 返回列表</button>
          )}
        </div>

        {/* Current status bar */}
        <div style={{
          padding: '10px 20px', background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {isRunning && (
            <div style={{
              width: '14px', height: '14px', border: '2px solid var(--accent-primary)',
              borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
            }} />
          )}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{runState.currentStep}</span>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {runState.steps.length} 步
          </span>
        </div>

        {/* Steps list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          {runState.steps
            .filter(s => ['planning', 'tool_call', 'reflection', 'final'].includes(s.step_type))
            .map((step, i) => (
            <div key={i} style={{
              padding: '10px 14px', marginBottom: '8px', borderRadius: '10px',
              border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <StepIcon type={step.step_type} />
                <span style={{ fontWeight: 600, fontSize: '13px' }}>
                  {step.step_type === 'tool_call' ? `工具: ${step.tool_name}` :
                   step.step_type === 'planning' ? '任务规划' :
                   step.step_type === 'reflection' ? '反思修正' : '最终结果'}
                </span>
                {step.duration_ms && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {(step.duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto',
                background: 'var(--bg-primary)', borderRadius: '6px', padding: '8px', marginTop: '4px',
              }}>
                {step.content
                  ? step.content.slice(0, 500) + (step.content.length > 500 ? '...' : '')
                  : step.tool_result
                  ? step.tool_result.slice(0, 300) + (step.tool_result.length > 300 ? '...' : '')
                  : step.tool_args
                  ? JSON.stringify(step.tool_args, null, 2).slice(0, 200)
                  : '(无内容)'}
              </div>
            </div>
          ))}
          <div ref={stepsEndRef} />
        </div>

        {/* Final answer (when done) */}
        {!isRunning && runState.finalAnswer && (
          <div style={{
            padding: '16px 20px', borderTop: '2px solid var(--border-color)',
            background: runState.status === 'success' ? '#10b98108' : '#ef444408',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              {runState.status === 'success' ? '✅ 执行结果' : '❌ 错误信息'}
            </div>
            <div style={{
              fontSize: '13px', whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto',
              background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px',
              border: '1px solid var(--border-color)',
            }}>
              {runState.finalAnswer}
            </div>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // Main Management View
  // ═══════════════════════════════════════════════
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Brain size={20} style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontWeight: 700, fontSize: '16px' }}>Agent 管理中心</span>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'var(--accent-primary)', color: 'white' }}>v3</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 20px', gap: '4px', borderBottom: '1px solid var(--border-color)' }}>
        {([
          { key: 'blueprints', label: '我的 Agent', icon: <Bot size={14} />, count: blueprints.length },
          { key: 'experiences', label: '执行记录', icon: <BarChart3 size={14} />, count: experiences.length },
          { key: 'create', label: '创建 Agent', icon: <Plus size={14} /> },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveView(tab.key)} style={{
            padding: '10px 16px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
            background: 'transparent', border: 'none',
            color: activeView === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
            borderBottom: activeView === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
            fontWeight: activeView === tab.key ? 600 : 400, transition: 'all 0.2s ease',
          }}>
            {tab.icon} {tab.label}
            {'count' in tab && tab.count !== undefined && (
              <span style={{ fontSize: '11px', padding: '0 6px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {/* ── Blueprints ── */}
        {activeView === 'blueprints' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {blueprints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <Bot size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p style={{ fontSize: '15px', marginBottom: '8px' }}>还没有 Agent</p>
                <p style={{ fontSize: '13px', opacity: 0.7 }}>切换到「创建 Agent」标签，一句话描述你想要的 Agent</p>
              </div>
            ) : blueprints.map(bp => (
              <div key={bp.id} style={{
                padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Bot size={16} style={{ color: 'var(--accent-primary)' }} />
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{bp.name}</span>
                      <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>v{bp.version}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>{bp.persona}</p>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Wrench size={12} /> {bp.tool_count} 工具</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Target size={12} /> {bp.workflow_steps} 步骤</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {bp.created_at}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleRun(bp)} style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)',
                      color: 'white', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600,
                    }}>
                      <Play size={14} /> 运行
                    </button>
                    <button onClick={() => handleDelete(bp.id)} style={{
                      padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)',
                      background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Experiences ── */}
        {activeView === 'experiences' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {experiences.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                {[
                  { label: '成功', val: experiences.filter(e => e.success).length, color: 'var(--accent-success)' },
                  { label: '失败', val: experiences.filter(e => !e.success).length, color: 'var(--accent-danger)' },
                  { label: '成功率', val: `${Math.round(experiences.filter(e => e.success).length / experiences.length * 100)}%`, color: 'var(--accent-primary)' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            {experiences.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <BarChart3 size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p style={{ fontSize: '15px' }}>暂无执行记录</p>
              </div>
            ) : experiences.map(exp => (
              <div key={exp.id} style={{
                padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)', cursor: 'pointer',
              }} onClick={() => setExpandedExp(expandedExp === exp.id ? null : exp.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {exp.success ? <CheckCircle2 size={16} style={{ color: 'var(--accent-success)' }} /> : <XCircle size={16} style={{ color: 'var(--accent-danger)' }} />}
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.task_summary}</span>
                  <IntentBadge intent={exp.intent} />
                  {expandedExp === exp.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                {expandedExp === exp.id && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                    <ScoreBar value={exp.score.accuracy} label="准确度" />
                    <ScoreBar value={exp.score.efficiency} label="效率" />
                    <ScoreBar value={exp.score.tool_usage} label="工具" />
                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right' }}>{exp.created_at}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Create ── */}
        {activeView === 'create' && (
          <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px', padding: '20px' }}>
              <Sparkles size={40} style={{ color: 'var(--accent-primary)', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>一句话创建 Agent</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                描述你想要的 Agent，系统会自动生成角色定义、工具配置和工作流程
              </p>
            </div>
            <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <textarea value={createInput} onChange={e => setCreateInput(e.target.value)}
                placeholder="例如：帮我创建一个每天自动搜集科技新闻并整理成报告的 Agent"
                style={{
                  width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: '14px', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={handleCreate} disabled={!createInput.trim() || creating} style={{
                width: '100%', marginTop: '12px', padding: '12px', borderRadius: '8px', border: 'none',
                background: creating ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: 'white',
                fontSize: '14px', fontWeight: 600, cursor: creating ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                {creating ? (
                  <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> 正在生成 Agent...</>
                ) : (
                  <><Zap size={16} /> 生成 Agent Blueprint</>
                )}
              </button>
            </div>
            {/* Quick templates */}
            <div style={{ marginTop: '24px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💡 快速模板</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { icon: '📰', text: '每日新闻采集 Agent — 自动搜集指定领域新闻并整理输出' },
                  { icon: '📊', text: 'Excel 数据分析 Agent — 读取表格自动统计分析并生成图表' },
                  { icon: '📝', text: '文档生成 Agent — 根据模板自动生成格式化报告文档' },
                  { icon: '🔍', text: '文件整理 Agent — 自动扫描指定目录并按规则分类归档' },
                ].map((tpl, i) => (
                  <button key={i} onClick={() => setCreateInput(tpl.text)} style={{
                    padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px',
                    textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    transition: 'border-color 0.2s ease',
                  }}
                    onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                    onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                  >
                    <span style={{ fontSize: '16px' }}>{tpl.icon}</span> {tpl.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
