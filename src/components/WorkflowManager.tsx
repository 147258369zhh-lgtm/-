import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    Plus, Play, Pause, StopCircle, CheckCircle, XCircle, Clock,
    AlertCircle, User, Bot, Zap, ChevronRight, Trash2, RefreshCw,
    GitBranch
} from 'lucide-react';

// ── Types ────────────────────────────────────────

interface WorkflowNode {
    id: string;
    name: string;
    node_type: 'agent' | 'skill' | 'human';
    config: any;
    next_node: string | null;
    condition: string | null;
}

interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    nodes: WorkflowNode[];
    version: number;
    created_at: string;
    updated_at: string;
}

interface WorkflowExecution {
    id: string;
    workflow_id: string;
    workflow_name: string;
    status: string;
    current_node_index: number;
    total_nodes: number;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
}

interface WorkflowEvent {
    execution_id: string;
    event_type: string;
    node_index: number | null;
    node_name: string | null;
    message: string | null;
    data: any;
}

// ── Status helpers ─────────────────────────────

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    created:        { color: '#94a3b8', icon: <Clock size={14} />,        label: '待运行' },
    running:        { color: '#3b82f6', icon: <Play size={14} />,         label: '运行中' },
    paused:         { color: '#f59e0b', icon: <Pause size={14} />,        label: '已暂停' },
    waiting_human:  { color: '#8b5cf6', icon: <User size={14} />,         label: '等待人工' },
    completed:      { color: '#22c55e', icon: <CheckCircle size={14} />,  label: '已完成' },
    failed:         { color: '#ef4444', icon: <XCircle size={14} />,      label: '失败' },
    cancelled:      { color: '#6b7280', icon: <StopCircle size={14} />,   label: '已取消' },
};

const nodeTypeConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    agent: { color: '#3b82f6', icon: <Bot size={16} />,  label: 'Agent' },
    skill: { color: '#22c55e', icon: <Zap size={16} />,  label: 'Skill' },
    human: { color: '#8b5cf6', icon: <User size={16} />, label: '人工' },
};

// ── Main Component ─────────────────────────────

const WorkflowManager: React.FC = () => {
    const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
    const [activeExecutions, setActiveExecutions] = useState<WorkflowExecution[]>([]);
    const [executionHistory, setExecutionHistory] = useState<WorkflowExecution[]>([]);
    const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [eventLogs, setEventLogs] = useState<WorkflowEvent[]>([]);
    const [view, setView] = useState<'list' | 'detail' | 'running'>('list');
    const [isLoading, setIsLoading] = useState(false);

    // ── Human node interaction state ──
    const [humanWaiting, setHumanWaiting] = useState<{
        execution_id: string;
        node_id: string;
        message: string;
        input_type: string;
    } | null>(null);
    const [humanInput, setHumanInput] = useState('');

    // ── Data loading ──

    const loadWorkflows = useCallback(async () => {
        try {
            const data = await invoke('workflow_list') as WorkflowDefinition[];
            setWorkflows(data || []);
        } catch (e) {
            console.error('Failed to load workflows:', e);
        }
    }, []);

    const loadActiveExecutions = useCallback(async () => {
        try {
            const data = await invoke('workflow_list_active') as WorkflowExecution[];
            setActiveExecutions(data || []);
        } catch (e) {
            console.error('Failed to load active executions:', e);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        try {
            const data = await invoke('workflow_list_executions', { limit: 50 }) as WorkflowExecution[];
            setExecutionHistory(data || []);
        } catch (e) {
            console.error('Failed to load execution history:', e);
        }
    }, []);

    useEffect(() => {
        loadWorkflows();
        loadActiveExecutions();
        loadHistory();
    }, []);

    // ── Event listener ──

    useEffect(() => {
        const unlisten = listen<WorkflowEvent>('workflow-event', (event) => {
            const e = event.payload;
            setEventLogs(prev => [e, ...prev].slice(0, 100));

            // Handle human waiting event
            if (e.event_type === 'waiting_human') {
                setHumanWaiting({
                    execution_id: e.execution_id,
                    node_id: e.data?.node_id || '',
                    message: e.message || '请确认后继续',
                    input_type: e.data?.input_type || 'confirm',
                });
            }

            // Refresh on status changes
            if (['completed', 'failed', 'cancelled', 'human_responded'].includes(e.event_type)) {
                loadActiveExecutions();
                loadHistory();
                if (e.event_type === 'human_responded') {
                    setHumanWaiting(null);
                }
            }
        });

        return () => { unlisten.then(fn => fn()); };
    }, []);

    // ── Actions ──

    const runWorkflow = async (workflowId: string) => {
        try {
            setIsLoading(true);
            const execId = await invoke('workflow_run', {
                req: { workflow_id: workflowId, context: null }
            }) as string;
            setView('running');
            loadActiveExecutions();
        } catch (e: any) {
            alert('运行失败: ' + (e?.toString() || '未知错误'));
        } finally {
            setIsLoading(false);
        }
    };

    const pauseExecution = async (execId: string) => {
        try {
            await invoke('workflow_pause', { executionId: execId });
            loadActiveExecutions();
        } catch (e: any) {
            alert('暂停失败: ' + e?.toString());
        }
    };

    const cancelExecution = async (execId: string) => {
        try {
            await invoke('workflow_cancel', { executionId: execId });
            loadActiveExecutions();
            loadHistory();
        } catch (e: any) {
            alert('取消失败: ' + e?.toString());
        }
    };

    const submitHumanResponse = async (action: string) => {
        if (!humanWaiting) return;
        try {
            await invoke('workflow_human_respond', {
                response: {
                    execution_id: humanWaiting.execution_id,
                    node_id: humanWaiting.node_id,
                    action: action,
                    data: humanInput ? { input: humanInput } : null,
                }
            });
            setHumanWaiting(null);
            setHumanInput('');
        } catch (e: any) {
            alert('提交失败: ' + e?.toString());
        }
    };

    const deleteWorkflow = async (id: string) => {
        if (!confirm('确定删除此 Workflow？')) return;
        try {
            await invoke('workflow_delete', { workflowId: id });
            loadWorkflows();
            if (selectedWorkflow?.id === id) {
                setSelectedWorkflow(null);
                setView('list');
            }
        } catch (e: any) {
            alert('删除失败: ' + e?.toString());
        }
    };

    // ═══════════════════════════════════════════
    // Render
    // ═══════════════════════════════════════════

    return (
        <div className="animate-in fade-in duration-500" style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '32px 32px', overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-end', marginBottom: 24, flexShrink: 0,
            }}>
                <div>
                    <h1 style={{
                        margin: 0, fontSize: 32, fontWeight: 900,
                        color: 'var(--text-primary)', letterSpacing: '-0.03em',
                    }}>
                        <GitBranch size={28} style={{ marginRight: 10, verticalAlign: 'middle' }} />
                        Workflow 中心
                    </h1>
                    <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Office Automation Workflow Engine
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {/* Tab Buttons */}
                    {[
                        { key: 'list', label: '流程列表' },
                        { key: 'running', label: `运行中 (${activeExecutions.length})` },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setView(tab.key as any)}
                            style={{
                                padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                border: view === tab.key ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                                background: view === tab.key ? 'var(--brand)' : 'var(--bg-subtle)',
                                color: view === tab.key ? '#fff' : 'var(--text-secondary)',
                                cursor: 'pointer', transition: 'var(--transition)',
                            }}
                        >{tab.label}</button>
                    ))}
                    <button onClick={() => setShowCreateModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 20px', borderRadius: 10, border: 'none',
                            background: 'var(--brand)', color: '#fff',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
                            transition: 'var(--transition)',
                        }}
                    >
                        <Plus size={16} /> 创建 Workflow
                    </button>
                </div>
            </div>

            {/* Human Node Modal */}
            {humanWaiting && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                }}>
                    <div style={{
                        background: 'var(--bg-surface)', borderRadius: 16,
                        padding: 32, width: 480, maxWidth: '90vw',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <User size={24} color="#8b5cf6" />
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>需要人工操作</h3>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                            {humanWaiting.message}
                        </p>
                        {humanWaiting.input_type !== 'confirm' && (
                            <textarea
                                value={humanInput}
                                onChange={e => setHumanInput(e.target.value)}
                                placeholder="请输入内容..."
                                style={{
                                    width: '100%', minHeight: 80, padding: 12, borderRadius: 10,
                                    border: '1.5px solid var(--border)', background: 'var(--input-bg)',
                                    color: 'var(--text-primary)', fontSize: 14, resize: 'vertical',
                                    outline: 'none', boxSizing: 'border-box', marginBottom: 16,
                                }}
                            />
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => submitHumanResponse('reject')}
                                style={{
                                    padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--border)',
                                    background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                                    fontWeight: 600, cursor: 'pointer',
                                }}>拒绝</button>
                            <button onClick={() => submitHumanResponse('skip')}
                                style={{
                                    padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--border)',
                                    background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                                    fontWeight: 600, cursor: 'pointer',
                                }}>跳过</button>
                            <button onClick={() => submitHumanResponse(humanWaiting.input_type === 'confirm' ? 'approve' : 'input')}
                                style={{
                                    padding: '10px 20px', borderRadius: 10, border: 'none',
                                    background: 'var(--brand)', color: '#fff',
                                    fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
                                }}>{humanWaiting.input_type === 'confirm' ? '确认通过' : '提交'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {view === 'list' ? (
                    /* ── Workflow List ── */
                    workflows.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {workflows.map(wf => (
                                <div key={wf.id} style={{
                                    padding: 20, borderRadius: 14,
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center',
                                    gap: 16, cursor: 'pointer',
                                    transition: 'var(--transition)',
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0,
                                    }}>
                                        <GitBranch size={22} color="#fff" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontWeight: 700, fontSize: 15, color: 'var(--text-primary)',
                                            marginBottom: 4,
                                        }}>{wf.name}</div>
                                        <div style={{
                                            fontSize: 13, color: 'var(--text-muted)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{wf.description || '暂无描述'}</div>
                                    </div>
                                    {/* Node tags */}
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        {wf.nodes.map((node, i) => {
                                            const cfg = nodeTypeConfig[node.node_type] || nodeTypeConfig.agent;
                                            return (
                                                <div key={i} title={node.name} style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    padding: '4px 8px', borderRadius: 8,
                                                    background: cfg.color + '15',
                                                    color: cfg.color, fontSize: 12, fontWeight: 600,
                                                }}>
                                                    {cfg.icon}
                                                    <span>{node.name.length > 8 ? node.name.slice(0, 8) + '…' : node.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                        <button title="运行"
                                            onClick={(e) => { e.stopPropagation(); runWorkflow(wf.id); }}
                                            disabled={isLoading}
                                            style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                border: 'none', background: '#22c55e20', color: '#22c55e',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', transition: 'var(--transition)',
                                            }}>
                                            <Play size={16} />
                                        </button>
                                        <button title="删除"
                                            onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }}
                                            style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                border: 'none', background: '#ef444420', color: '#ef4444',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', transition: 'var(--transition)',
                                            }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState message="还没有 Workflow，点击右上角创建第一个" />
                    )
                ) : view === 'running' ? (
                    /* ── Active Executions ── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {activeExecutions.length === 0 && executionHistory.length === 0 ? (
                            <EmptyState message="暂无运行中或历史记录" />
                        ) : (
                            <>
                                {activeExecutions.length > 0 && (
                                    <>
                                        <SectionTitle>运行中</SectionTitle>
                                        {activeExecutions.map(exec => (
                                            <ExecutionCard key={exec.id} exec={exec}
                                                onPause={pauseExecution} onCancel={cancelExecution} />
                                        ))}
                                    </>
                                )}
                                {executionHistory.length > 0 && (
                                    <>
                                        <SectionTitle>历史记录</SectionTitle>
                                        {executionHistory.map(exec => (
                                            <ExecutionCard key={exec.id} exec={exec} />
                                        ))}
                                    </>
                                )}
                            </>
                        )}

                        {/* Event Log */}
                        {eventLogs.length > 0 && (
                            <>
                                <SectionTitle>实时日志</SectionTitle>
                                <div style={{
                                    borderRadius: 12, background: '#0f172a', padding: 16,
                                    maxHeight: 300, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12,
                                }}>
                                    {eventLogs.map((log, i) => (
                                        <div key={i} style={{ color: '#94a3b8', marginBottom: 4 }}>
                                            <span style={{ color: '#60a5fa' }}>[{log.event_type}]</span>
                                            {log.node_name && <span style={{ color: '#34d399' }}> {log.node_name}</span>}
                                            {log.message && <span> — {log.message}</span>}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Create Workflow Modal */}
            {showCreateModal && (
                <CreateWorkflowModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); loadWorkflows(); }}
                />
            )}
        </div>
    );
};

// ── Sub-components ─────────────────────────────

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <div style={{
        height: '100%', minHeight: 200, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-faint)',
    }}>
        <GitBranch size={64} style={{ opacity: 0.1, marginBottom: 16 }} />
        <p style={{ fontSize: 16, opacity: 0.3, fontStyle: 'italic', margin: 0 }}>{message}</p>
    </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 style={{
        margin: '8px 0 4px', fontSize: 14, fontWeight: 700,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.08em',
    }}>{children}</h3>
);

const ExecutionCard: React.FC<{
    exec: WorkflowExecution;
    onPause?: (id: string) => void;
    onCancel?: (id: string) => void;
}> = ({ exec, onPause, onCancel }) => {
    const sc = statusConfig[exec.status] || statusConfig.created;
    const progress = exec.total_nodes > 0
        ? Math.round((exec.current_node_index / exec.total_nodes) * 100)
        : 0;

    return (
        <div style={{
            padding: 16, borderRadius: 14, background: 'var(--bg-card)',
            border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 8,
                    background: sc.color + '20', color: sc.color,
                    fontSize: 12, fontWeight: 700,
                }}>
                    {sc.icon} {sc.label}
                </div>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                    {exec.workflow_name}
                </span>
                <span style={{ flex: 1 }} />
                {exec.started_at && (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                        {exec.started_at}
                    </span>
                )}
                {onPause && (exec.status === 'running') && (
                    <button onClick={() => onPause(exec.id)} title="暂停"
                        style={{
                            width: 30, height: 30, borderRadius: 8, border: 'none',
                            background: '#f59e0b20', color: '#f59e0b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}><Pause size={14} /></button>
                )}
                {onCancel && ['running', 'paused', 'waiting_human'].includes(exec.status) && (
                    <button onClick={() => onCancel(exec.id)} title="取消"
                        style={{
                            width: 30, height: 30, borderRadius: 8, border: 'none',
                            background: '#ef444420', color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}><StopCircle size={14} /></button>
                )}
            </div>
            {/* Progress bar */}
            <div style={{
                height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%', borderRadius: 3,
                    background: exec.status === 'completed' ? '#22c55e'
                        : exec.status === 'failed' ? '#ef4444' : 'var(--brand)',
                    width: `${progress}%`,
                    transition: 'width 0.5s ease',
                }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                进度: {exec.current_node_index}/{exec.total_nodes} 节点
                {exec.error && (
                    <span style={{ color: '#ef4444', marginLeft: 12 }}>
                        <AlertCircle size={12} style={{ verticalAlign: 'middle' }} /> {exec.error}
                    </span>
                )}
            </div>
        </div>
    );
};

// ── Create Workflow Modal ──────────────────────

const CreateWorkflowModal: React.FC<{
    onClose: () => void;
    onCreated: () => void;
}> = ({ onClose, onCreated }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [nodes, setNodes] = useState<Array<{
        name: string;
        node_type: 'agent' | 'skill' | 'human';
        prompt: string;
        human_message: string;
    }>>([
        { name: '步骤 1', node_type: 'agent', prompt: '', human_message: '' }
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const addNode = (type: 'agent' | 'skill' | 'human') => {
        const labels = { agent: 'Agent 节点', skill: 'Skill 节点', human: '人工节点' };
        setNodes([...nodes, {
            name: `${labels[type]} ${nodes.length + 1}`,
            node_type: type,
            prompt: '',
            human_message: type === 'human' ? '请确认后继续' : '',
        }]);
    };

    const removeNode = (index: number) => {
        if (nodes.length <= 1) return;
        setNodes(nodes.filter((_, i) => i !== index));
    };

    const updateNode = (index: number, field: string, value: string) => {
        const newNodes = [...nodes];
        (newNodes[index] as any)[field] = value;
        setNodes(newNodes);
    };

    const handleSubmit = async () => {
        if (!name.trim()) return alert('请输入 Workflow 名称');
        if (nodes.length === 0) return alert('请至少添加一个节点');

        setIsSubmitting(true);
        try {
            const workflowNodes = nodes.map((n, i) => ({
                id: `node_${i + 1}_${Date.now()}`,
                name: n.name,
                node_type: n.node_type,
                config: {
                    prompt: n.node_type === 'agent' ? n.prompt : null,
                    human_message: n.node_type === 'human' ? n.human_message : null,
                    human_input_type: n.node_type === 'human' ? 'confirm' : null,
                    retry_count: 1,
                    timeout_secs: 300,
                },
                next_node: null,
                condition: null,
            }));

            await invoke('workflow_create', {
                req: { name: name.trim(), description: description.trim(), nodes: workflowNodes }
            });
            onCreated();
        } catch (e: any) {
            alert('创建失败: ' + e?.toString());
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
            <div style={{
                background: 'var(--bg-surface)', borderRadius: 16,
                padding: 32, width: 600, maxWidth: '90vw', maxHeight: '85vh',
                boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflowY: 'auto',
            }}>
                <h2 style={{ margin: '0 0 20px', color: 'var(--text-primary)', fontSize: 20, fontWeight: 800 }}>
                    创建 Workflow
                </h2>

                {/* Name */}
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    名称 *
                </label>
                <input value={name} onChange={e => setName(e.target.value)}
                    placeholder="例如：批量网页填表"
                    style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10,
                        border: '1.5px solid var(--border)', background: 'var(--input-bg)',
                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                        boxSizing: 'border-box', marginBottom: 16,
                    }} />

                {/* Description */}
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    描述
                </label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="简述这个 Workflow 的用途"
                    style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10,
                        border: '1.5px solid var(--border)', background: 'var(--input-bg)',
                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                        boxSizing: 'border-box', marginBottom: 20,
                    }} />

                {/* Nodes */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        节点列表 ({nodes.length})
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['agent', 'skill', 'human'] as const).map(type => {
                            const cfg = nodeTypeConfig[type];
                            return (
                                <button key={type} onClick={() => addNode(type)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        border: `1.5px solid ${cfg.color}30`, background: cfg.color + '10',
                                        color: cfg.color, cursor: 'pointer',
                                    }}>
                                    <Plus size={12} /> {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {nodes.map((node, i) => {
                        const cfg = nodeTypeConfig[node.node_type];
                        return (
                            <div key={i} style={{
                                padding: 14, borderRadius: 12,
                                border: `1.5px solid ${cfg.color}30`,
                                background: cfg.color + '05',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 24, height: 24, borderRadius: 6,
                                        background: cfg.color + '20', color: cfg.color,
                                        fontSize: 11, fontWeight: 800,
                                    }}>{i + 1}</div>
                                    <div style={{ color: cfg.color, fontWeight: 600, fontSize: 12 }}>{cfg.label}</div>
                                    <input value={node.name} onChange={e => updateNode(i, 'name', e.target.value)}
                                        style={{
                                            flex: 1, padding: '5px 10px', borderRadius: 8,
                                            border: '1px solid var(--border)', background: 'var(--input-bg)',
                                            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                                        }} />
                                    {nodes.length > 1 && (
                                        <button onClick={() => removeNode(i)} title="移除"
                                            style={{
                                                width: 28, height: 28, borderRadius: 6,
                                                border: 'none', background: '#ef444415', color: '#ef4444',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', fontSize: 12,
                                            }}><Trash2 size={14} /></button>
                                    )}
                                </div>
                                {node.node_type === 'agent' && (
                                    <textarea value={node.prompt}
                                        onChange={e => updateNode(i, 'prompt', e.target.value)}
                                        placeholder="Agent 任务描述（提示词）..."
                                        rows={2}
                                        style={{
                                            width: '100%', padding: '8px 10px', borderRadius: 8,
                                            border: '1px solid var(--border)', background: 'var(--input-bg)',
                                            color: 'var(--text-primary)', fontSize: 13, resize: 'vertical',
                                            outline: 'none', boxSizing: 'border-box',
                                        }} />
                                )}
                                {node.node_type === 'human' && (
                                    <input value={node.human_message}
                                        onChange={e => updateNode(i, 'human_message', e.target.value)}
                                        placeholder="人工提示信息..."
                                        style={{
                                            width: '100%', padding: '8px 10px', borderRadius: 8,
                                            border: '1px solid var(--border)', background: 'var(--input-bg)',
                                            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                                            boxSizing: 'border-box',
                                        }} />
                                )}
                                {node.node_type === 'skill' && (
                                    <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', padding: '4px 0' }}>
                                        Skill 系统将在 P1 阶段支持配置
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose}
                        style={{
                            padding: '10px 20px', borderRadius: 10,
                            border: '1.5px solid var(--border)', background: 'var(--bg-subtle)',
                            color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer',
                        }}>取消</button>
                    <button onClick={handleSubmit} disabled={isSubmitting}
                        style={{
                            padding: '10px 24px', borderRadius: 10, border: 'none',
                            background: 'var(--brand)', color: '#fff',
                            fontWeight: 700, cursor: 'pointer',
                            opacity: isSubmitting ? 0.6 : 1,
                            boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
                        }}>{isSubmitting ? '创建中...' : '创建 Workflow'}</button>
                </div>
            </div>
        </div>
    );
};

export default WorkflowManager;
