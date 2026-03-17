// TokenMonitor.tsx — 独立 Token 用量监控面板
// 遵循 ARCHITECTURE.md 模块化规范：自包含状态、不依赖外部组件

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Zap, Trash2, RefreshCw, MessageSquare, FileText, Link2, Bot, BarChart3, Wifi, HardDrive, Filter } from 'lucide-react';

// ──── Types ────

interface TokenSummary {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    call_count: number;
}

interface TimelineBucket {
    time_label: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

interface ModuleUsage {
    module: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    call_count: number;
    percentage: number;
}

interface ProviderUsage {
    provider: string;
    total_tokens: number;
    call_count: number;
    percentage: number;
}

interface TokenStatsResponse {
    summary: TokenSummary;
    timeline: TimelineBucket[];
    by_module: ModuleUsage[];
    by_provider: ProviderUsage[];
    available_providers: string[];
}

// ──── Helpers ────

const MODULE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    ai_chat: { icon: <MessageSquare size={14} />, label: 'AI 对话', color: '#3b82f6' },
    project_summary: { icon: <FileText size={14} />, label: '项目综述', color: '#10b981' },
    scheme: { icon: <Link2 size={14} />, label: '联动方案', color: '#f59e0b' },
    agent: { icon: <Bot size={14} />, label: 'Agent', color: '#8b5cf6' },
};

function getModuleMeta(module: string) {
    return MODULE_META[module] || { icon: <BarChart3 size={14} />, label: module, color: '#6b7280' };
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return n.toString();
}

// ──── SVG Bar Chart ────

const BarChart: React.FC<{ data: TimelineBucket[]; height?: number }> = ({ data, height = 160 }) => {
    if (data.length === 0) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 11 }}>
                暂无数据
            </div>
        );
    }

    const maxTotal = Math.max(...data.map(d => d.total_tokens), 1);
    const barWidth = Math.max(5, Math.min(18, (340 / data.length) - 2));
    const chartWidth = data.length * (barWidth + 2) + 50;
    const chartHeight = height - 24;
    const ySteps = 3;
    const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round((maxTotal / ySteps) * i));

    return (
        <div style={{ overflowX: 'auto', paddingBottom: 2 }} className="custom-scrollbar">
            <svg width={Math.max(chartWidth, 200)} height={height} viewBox={`0 0 ${Math.max(chartWidth, 200)} ${height}`}>
                {yLabels.map((val, i) => {
                    const y = chartHeight - (chartHeight * (val / maxTotal));
                    return (
                        <g key={i}>
                            <line x1={40} y1={y} x2={chartWidth - 5} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2" />
                            <text x={36} y={y + 3} textAnchor="end" fontSize={7} fill="var(--text-faint)">{formatTokens(val)}</text>
                        </g>
                    );
                })}
                {data.map((bucket, i) => {
                    const x = 44 + i * (barWidth + 2);
                    const promptH = (bucket.prompt_tokens / maxTotal) * chartHeight;
                    const compH = (bucket.completion_tokens / maxTotal) * chartHeight;
                    const showLabel = i % Math.max(1, Math.floor(data.length / 6)) === 0;
                    return (
                        <g key={i}>
                            <rect x={x} y={chartHeight - promptH - compH} width={barWidth / 2 - 1} height={promptH} rx={1.5}
                                fill="rgba(59, 130, 246, 0.7)" />
                            <rect x={x + barWidth / 2} y={chartHeight - compH} width={barWidth / 2 - 1} height={compH} rx={1.5}
                                fill="rgba(16, 185, 129, 0.6)" />
                            <title>{`${bucket.time_label}\n输入: ${bucket.prompt_tokens}\n输出: ${bucket.completion_tokens}`}</title>
                            {showLabel && (
                                <text x={x + barWidth / 2} y={height - 2} textAnchor="middle" fontSize={7} fill="var(--text-faint)">
                                    {bucket.time_label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

// ──── Filter Pill Button ────

const Pill: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
        padding: '4px 10px', borderRadius: 8, border: 'none',
        backgroundColor: active ? 'var(--brand-subtle)' : 'var(--bg-muted)',
        color: active ? 'var(--brand)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 500, fontSize: 11, cursor: 'pointer',
        transition: 'all 0.12s', whiteSpace: 'nowrap',
    }}>
        {children}
    </button>
);

// ──── Main Component ────

const TokenMonitor: React.FC = () => {
    const [range, setRange] = useState<'day' | 'week' | 'all'>('day');
    const [source, setSource] = useState<'all' | 'local' | 'network'>('all');
    const [providerFilter, setProviderFilter] = useState<string>('');
    const [stats, setStats] = useState<TokenStatsResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const result = await invoke<TokenStatsResponse>('get_token_stats', {
                range,
                source: source === 'all' ? null : source,
                provider: providerFilter || null,
            });
            setStats(result);
        } catch (e) {
            console.error('获取 token 统计失败:', e);
        } finally {
            setLoading(false);
        }
    }, [range, source, providerFilter]);

    useEffect(() => {
        fetchStats();
        const timer = setInterval(fetchStats, 30000);
        return () => clearInterval(timer);
    }, [fetchStats]);

    const handleClear = async () => {
        if (!confirm('确定清除所有 Token 记录吗？此操作不可恢复。')) return;
        try {
            await invoke('clear_token_stats');
            fetchStats();
        } catch (e) {
            alert(`清除失败: ${e}`);
        }
    };

    const summary = stats?.summary || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, call_count: 0 };
    const rangeButtons: { key: 'day' | 'week' | 'all'; label: string }[] = [
        { key: 'day', label: '今天' },
        { key: 'week', label: '本周' },
        { key: 'all', label: '全部' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ═══ Token 监控面板 ═══ */}
            <div style={{
                backgroundColor: 'var(--bg-raised)', borderRadius: 18,
                border: '1px solid var(--border)', padding: '20px 22px',
                boxShadow: 'var(--shadow-sm)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ padding: 6, borderRadius: 10, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                            <Zap size={16} />
                        </div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Token 用量监控</div>
                            <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>每 30 秒自动刷新</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={fetchStats} disabled={loading} style={{
                            padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                            <RefreshCw size={10} /> 刷新
                        </button>
                        <button onClick={handleClear} style={{
                            padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-surface)', color: '#ef4444',
                            cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                            <Trash2 size={10} /> 清除
                        </button>
                    </div>
                </div>

                {/* Range Selector */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 12, backgroundColor: 'var(--bg-muted)', padding: 2, borderRadius: 9 }}>
                    {rangeButtons.map(btn => (
                        <button key={btn.key} onClick={() => setRange(btn.key)} style={{
                            flex: 1, padding: '6px 0', borderRadius: 7, border: 'none',
                            backgroundColor: range === btn.key ? 'var(--bg-surface)' : 'transparent',
                            color: range === btn.key ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontWeight: 700, fontSize: 11, cursor: 'pointer',
                            boxShadow: range === btn.key ? 'var(--shadow-sm)' : 'none',
                            transition: 'all 0.12s',
                        }}>
                            {btn.label}
                        </button>
                    ))}
                </div>

                {/* Source Filter: 本地 / 网络 */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center' }}>
                    <Filter size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    <Pill active={source === 'all'} onClick={() => setSource('all')}>全部</Pill>
                    <Pill active={source === 'local'} onClick={() => setSource('local')}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><HardDrive size={10} /> 本地</span>
                    </Pill>
                    <Pill active={source === 'network'} onClick={() => setSource('network')}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Wifi size={10} /> 网络</span>
                    </Pill>
                    {/* Provider Filter */}
                    {(stats?.available_providers || []).length > 0 && (
                        <>
                            <div style={{ width: 1, height: 14, backgroundColor: 'var(--border)', margin: '0 2px' }} />
                            <Pill active={providerFilter === ''} onClick={() => setProviderFilter('')}>所有供应商</Pill>
                            {(stats?.available_providers || []).map(p => (
                                <Pill key={p} active={providerFilter === p} onClick={() => setProviderFilter(providerFilter === p ? '' : p)}>
                                    {p}
                                </Pill>
                            ))}
                        </>
                    )}
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 12, backgroundColor: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#3b82f6' }} /> 输入
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{formatTokens(summary.prompt_tokens)}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} /> 输出
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{formatTokens(summary.completion_tokens)}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 12, backgroundColor: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#f59e0b' }} /> 共计
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{formatTokens(summary.total_tokens)}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-faint)', marginTop: 1 }}>{summary.call_count} 次调用</div>
                    </div>
                </div>

                {/* Bar Chart */}
                <div style={{ marginBottom: 2, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>用量趋势 (5min/柱)</div>
                <div style={{
                    backgroundColor: 'var(--bg-surface)', borderRadius: 12, padding: '8px 6px',
                    border: '1px solid var(--border)', marginBottom: 16,
                }}>
                    <BarChart data={stats?.timeline || []} />
                </div>

                {/* Module Ranking */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>模块用量排行</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {(stats?.by_module || []).length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11 }}>暂无调用记录</div>
                    ) : (
                        (stats?.by_module || []).map((m, i) => {
                            const meta = getModuleMeta(m.module);
                            return (
                                <div key={m.module} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', borderRadius: 10,
                                    backgroundColor: i === 0 ? 'var(--brand-subtle)' : 'var(--bg-surface)',
                                    border: `1px solid ${i === 0 ? 'var(--brand)' : 'var(--border)'}`,
                                }}>
                                    <div style={{ padding: 5, borderRadius: 7, backgroundColor: `${meta.color}15`, color: meta.color, flexShrink: 0 }}>
                                        {meta.icon}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{meta.label}</div>
                                        <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>
                                            {m.call_count} 次 · 入 {formatTokens(m.prompt_tokens)} · 出 {formatTokens(m.completion_tokens)}
                                        </div>
                                        <div style={{ marginTop: 4, height: 3, borderRadius: 2, backgroundColor: 'var(--bg-muted)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${m.percentage}%`, borderRadius: 2, backgroundColor: meta.color, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{formatTokens(m.total_tokens)}</div>
                                        <div style={{ fontSize: 9, fontWeight: 700, color: meta.color }}>{m.percentage}%</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Provider Breakdown (仅网络模式或 all 时显示) */}
                {(stats?.by_provider || []).length > 0 && source !== 'local' && (
                    <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 16, marginBottom: 8 }}>供应商用量</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {(stats?.by_provider || []).map(p => (
                                <div key={p.provider} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 12px', borderRadius: 8,
                                    backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Wifi size={12} style={{ color: 'var(--text-faint)' }} />
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{p.provider || '未知'}</span>
                                        <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{p.call_count} 次</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{formatTokens(p.total_tokens)}</span>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', padding: '2px 6px', borderRadius: 4 }}>{p.percentage}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ═══ 预留扩展区 ═══ */}
            <div style={{
                backgroundColor: 'var(--bg-raised)', borderRadius: 18,
                border: '1px dashed var(--border)', padding: '28px 22px',
                textAlign: 'center',
            }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🔮</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>更多功能即将到来</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>此区域预留用于后续扩展</div>
            </div>
        </div>
    );
};

export default TokenMonitor;
