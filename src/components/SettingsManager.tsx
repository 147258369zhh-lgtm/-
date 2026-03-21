import React, { useState, useEffect, useRef } from 'react';
import { Settings, Moon, Sun, FolderOpen, RefreshCcw, ShieldCheck, Database, HardDrive, MonitorPlay, Zap, Cloud, Cpu, Trash2, Droplets, Search, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTemplateStore } from '../store/useTemplateStore';
import TokenMonitor from './TokenMonitor';

export const SettingsManager: React.FC = () => {
    const { theme, setTheme } = useStore();
    const { templates } = useTemplateStore();
    const [settings, setSettings] = useState<{ key: string, value: string }[]>([]);

    // ── 响应式缩放：窗口小于设计宽度时按比例缩小 ──
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const DESIGN_WIDTH = 1200; // 设计基准宽度

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                setScale(w < DESIGN_WIDTH ? w / DESIGN_WIDTH : 1);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const [aiConfigs, setAiConfigs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'system' | 'ai'>('system');
    const [publicNodes, setPublicNodes] = useState<any[]>([]); // New state for auto fetch endpoints
    const [editAiId, setEditAiId] = useState<string | null>(null);
    const [aiForm, setAiForm] = useState<any>({});
    const [fetchedModels, setFetchedModels] = useState<string[]>([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [embeddingStatus, setEmbeddingStatus] = useState<any>(null);
    const [isInitEmbed, setIsInitEmbed] = useState(false);
    const [isRebuildingIdx, setIsRebuildingIdx] = useState(false);
    const [embeddingEngine, setEmbeddingEngine] = useState('local');
    const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({ siliconflow: true, deepseek: true, gemini: true, custom: true });
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // AI 提示词本地表单状态
    const [promptProjectSummary, setPromptProjectSummary] = useState('');
    const [promptSurveySummary, setPromptSurveySummary] = useState('');
    const [promptAiChat, setPromptAiChat] = useState('');
    const [promptSchemeOptimize, setPromptSchemeOptimize] = useState('');
    const [promptSchemeGenerate, setPromptSchemeGenerate] = useState('');

    const defaultRootPath = settings.find(s => s.key === 'default_root_path')?.value || '';
    const trashRetention = settings.find(s => s.key === 'trash_retention_days')?.value || '10';

    useEffect(() => { loadData(); }, []);

    // 默认提示词（作为占位和兜底）
    const defaultPrompts = {
        projectSummary: '直接输出最终的项目综述 Markdown，不需要任何多余的寒暄或解释。',
        surveySummary: '你是国家级通信工程勘察设计专家。直接输出最终的勘察综述段落，不需要任何多余的寒暄或解释。',
        aiChat: `你是一个专业的通信工程设计与规则执行专家。
你拥有【全量动态业务数据感知能力】，当前项目的全量字段、勘察详情、关联文件、全局报价/合同、以及现有的自动化指令明细已全部挂载在大纲中。
你的职责：
1. 设计辅助：基于现有的勘察数据和全局报价单提供设计建议。
2. 自动化编排：若用户要求生成文档，请优先查阅现有的自动化逻辑与执行方案，并据此输出执行指令。
3. 网页自动化：根据用户描述的 CMS 填表逻辑，提取项目数据并生成抓取/填写指令。

输出时请尽量结构化、简明。`,
        schemeOptimize: '你是高级通信设计自动化专家。请从专业角度审查联动指令流水线，指出潜在风险、重复步骤和可优化点，并给出建设性建议（Markdown 列表）。',
        schemeGenerate: `你是一个自动化规则设计专家。根据用户自然语言描述，输出联动指令数组的 JSON（不需要额外说明文字、不要 Markdown）。
类型 (op_type): WordReplace (Word替换), ExcelWrite (Excel写入), FileNameChange (文件名更改)。
数据源 (data_source_type): Static (静态), ExcelCell (单元格), WordParagraph (Word段落)。
示例: [{"op_type": "WordReplace", "data_source_type": "ExcelCell", "source_params": "Sheet1!A1", "target_params": "关键词"}]`,
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const sData: any[] = await invoke('list_settings');
            const aData: any[] = await invoke('list_ai_configs');
            setSettings(sData);
            setAiConfigs(aData);
            // 初始化提示词表单（从设置表加载，若无则使用默认值）
            const getVal = (key: string, fallback: string) =>
                (sData.find(s => s.key === key)?.value?.trim() || fallback);
            setPromptProjectSummary(getVal('prompt_project_summary_system', defaultPrompts.projectSummary));
            setPromptSurveySummary(getVal('prompt_survey_summary_system', defaultPrompts.surveySummary));
            setPromptAiChat(getVal('prompt_ai_chat_system', defaultPrompts.aiChat));
            setPromptSchemeOptimize(getVal('prompt_scheme_optimize_system', defaultPrompts.schemeOptimize));
            setPromptSchemeGenerate(getVal('prompt_scheme_generate_system', defaultPrompts.schemeGenerate));
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    const loadEmbeddingStatus = async () => {
        try {
            const status = await invoke('get_embedding_status');
            setEmbeddingStatus(status);
            if ((status as any)?.engine) setEmbeddingEngine((status as any).engine);
        } catch { /* ignore */ }
    };

    useEffect(() => { loadEmbeddingStatus(); }, []);

    const handleUpdateSetting = async (key: string, value: string) => {
        try {
            await invoke('update_setting', { key, value });
            setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
        } catch (e) { alert(`更新失败: ${e}`); }
    };

    const handleSelectDefaultPath = async () => {
        const selected = await open({ directory: true, multiple: false, title: '选择默认项目存储根目录' });
        if (selected) handleUpdateSetting('default_root_path', selected as string);
    };

    const runCleanup = async () => {
        if (!confirm('确定现在清理过期的回收站文件吗？')) return;
        try {
            const count: number = await invoke('cleanup_trash_auto');
            alert(`清理完成，删除了 ${count} 个过期文件。`);
        } catch (e) { alert(`清理失败: ${e}`); }
    };

    const handleSaveAiConfig = async (purpose: string) => {
        try {
            await invoke('upsert_ai_config', { config: { ...aiForm, purpose } });
            setEditAiId(null);
            loadData();
        } catch (e) { alert(`保存失败: ${e}`); }
    };

    const handleFetchPublicNodes = async () => {
        setIsLoading(true);
        try {
            const nodes: any[] = await invoke('fetch_public_free_apis');
            setPublicNodes(nodes);
        } catch (e) {
            alert('获取公共节点失败: ' + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAiConfig = (id: string) => {
        setConfirmDeleteId(id);
    };
    const executeDelete = async () => {
        if (!confirmDeleteId) return;
        try {
            await invoke('delete_ai_config', { id: confirmDeleteId });
            loadData();
        } catch (e) { alert(e); }
        finally { setConfirmDeleteId(null); }
    };

    const handleTestConnection = async () => {
        if (!aiForm.base_url) { alert('请先填写 API 地址'); return; }
        setIsTesting(true);
        try {
            const req = {
                prompt: "Hello, this is a connectivity test. Respond with 'OK'.",
                system_prompt: "Connectivity Test Mode. Response: 'OK'."
            };
            // 直接用当前表单进行临时测试，不要求先保存/激活配置
            const config = {
                id: aiForm.id || '',
                name: aiForm.name || '临时测试',
                provider: aiForm.provider || 'openai',
                api_key: aiForm.api_key || '',
                base_url: aiForm.base_url,
                model_name: aiForm.model_name || '__auto_detect__',
                is_active: true,
                purpose: aiForm.purpose || 'core_chat'
            };
            await invoke('chat_with_ai_config', { payload: { config, req } });
            alert('✅ 连接成功！AI 响应正常。');
        } catch (e) {
            alert(`❌ 连接失败: ${e}`);
        } finally {
            setIsTesting(false);
        }
    };

    // Styles migrated to CSS: .settings-section, .form-label, .form-input (index.css)

    if (isLoading) return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-surface)', flexDirection: 'column', gap: 16 }}>
            <RefreshCcw size={28} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Loading Settings...</p>
        </div>
    );


    return (
        <div ref={containerRef} className="custom-scrollbar animate-in fade-in duration-500" style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-surface)', overflow: 'auto' }}>
        <div style={{
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
            width: scale < 1 ? `${100 / scale}%` : '100%',
            padding: '28px clamp(16px, 3vw, 40px)',
        }}>
            {/* Header */}
            <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, letterSpacing: '-0.02em' }}>
                        <Settings style={{ color: 'var(--brand)' }} size={26} />
                        系统与 AI 设置
                    </h2>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Global Application Configuration & AI Engines</p>
                </div>
            </div>

            {/* 三栏布局 */}
            <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'ai' ? '160px 1fr 380px' : '160px 1fr', gap: 24, alignItems: 'start' }}>

                {/* ═══ 左栏：竖向导航 ═══ */}
                <div style={{
                    position: 'sticky', top: 20,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    backgroundColor: 'var(--bg-raised)', borderRadius: 16,
                    border: '1px solid var(--border)', padding: 8,
                }}>
                    {[
                        { key: 'system' as const, icon: <MonitorPlay size={16} />, label: '运行与维护' },
                        { key: 'ai' as const, icon: <Cpu size={16} />, label: 'AI 模型引擎' },
                    ].map(item => (
                        <button key={item.key} onClick={() => setActiveTab(item.key)} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 12, border: 'none',
                            backgroundColor: activeTab === item.key ? 'var(--brand-subtle)' : 'transparent',
                            color: activeTab === item.key ? 'var(--brand)' : 'var(--text-muted)',
                            fontWeight: activeTab === item.key ? 800 : 600,
                            fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'left',
                            transition: 'all 0.15s',
                            boxShadow: activeTab === item.key ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                        }}>
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                    {/* 分隔线 + 未来子项占位 */}
                    <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 8px' }} />
                    <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.1em' }}>更多功能</div>
                </div>

                {/* ═══ 中间：内容区 ═══ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                {activeTab === 'system' && (
                    <>
                        {/* Appearance */}
                        <div className="settings-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ padding: 12, borderRadius: 16, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)' }}>
                                        {theme === 'dark' ? <Moon size={22} /> : theme === 'glass' ? <Droplets size={22} /> : <Sun size={22} />}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>外观主题</h3>
                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>切换界面的视觉风格</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[
                                        { key: 'light' as const, icon: <Sun size={15} />, label: '浅色' },
                                        { key: 'dark' as const, icon: <Moon size={15} />, label: '暗色' },
                                        { key: 'glass' as const, icon: <Droplets size={15} />, label: '液态玻璃' },
                                    ].map(opt => (
                                        <button key={opt.key}
                                            onClick={() => { if (theme !== opt.key) setTheme(opt.key); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                padding: '9px 16px', borderRadius: 12,
                                                border: theme === opt.key ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                                                backgroundColor: theme === opt.key ? 'var(--brand-subtle)' : 'var(--bg-muted)',
                                                color: theme === opt.key ? 'var(--brand)' : 'var(--text-muted)',
                                                fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                                transition: 'var(--transition)',
                                            }}
                                        >
                                            {opt.icon} {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Storage */}
                        <div className="settings-section">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                                <div style={{ padding: 12, borderRadius: 16, backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>
                                    <HardDrive size={22} />
                                </div>
                                <div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>存储与路径</h3>
                                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>管理项目存储及其默认位置</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                <div>
                                    <label className="form-label">默认项目根目录</label>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <input readOnly value={defaultRootPath} placeholder="尚未设置默认路径" className="form-input flex-1" />
                                        <button onClick={handleSelectDefaultPath} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px', borderRadius: 12, border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-muted)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                                            <FolderOpen size={15} />浏览
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div>
                                        <label className="form-label">回收站保留天数</label>
                                        <input type="number" value={trashRetention} onChange={(e) => handleUpdateSetting('trash_retention_days', e.target.value)} className="form-input" />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                        <button onClick={runCleanup} style={{ width: '100%', padding: 13, borderRadius: 12, border: '2px dashed var(--warning)', background: 'var(--warning-subtle)', color: 'var(--warning)', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <RefreshCcw size={14} />手动触发过期清理
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Engine Routing */}
                        <div className="settings-section">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                <div style={{ padding: 12, borderRadius: 16, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)' }}>
                                    <Zap size={22} />
                                </div>
                                <div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>AI 引擎路由</h3>
                                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>为不同功能模块独立指定使用哪个 AI 引擎。未指定时使用第一个已连接引擎。</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { key: 'chat', label: '💬 AI 对话', desc: '侧栏对话、项目助手' },
                                    { key: 'project_summary', label: '📊 项目综述', desc: '自动生成项目概述' },
                                    { key: 'survey_summary', label: '📋 勘察综述', desc: '勘察情况分析生成' },
                                    { key: 'rag', label: '🔍 知识库问答', desc: '模板库智能问答' },
                                    { key: 'scheme_optimize', label: '⚙️ 联动优化', desc: '审查优化联动方案' },
                                    { key: 'scheme_generate', label: '🔧 联动生成', desc: '自然语言生成指令' },
                                ].map(mod => {
                                    const routeKey = `ai_route_${mod.key}`;
                                    const currentRoute = settings.find(s => s.key === routeKey)?.value || '';
                                    return (
                                        <div key={mod.key} style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '12px 16px', borderRadius: 12,
                                            backgroundColor: 'var(--bg-muted)',
                                            border: '1px solid var(--border)',
                                        }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{mod.label}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{mod.desc}</div>
                                            </div>
                                            <select
                                                value={currentRoute}
                                                onChange={async (e) => {
                                                    await invoke('update_setting', { key: routeKey, value: e.target.value });
                                                    setSettings(prev => {
                                                        const exists = prev.find(s => s.key === routeKey);
                                                        if (exists) return prev.map(s => s.key === routeKey ? { ...s, value: e.target.value } : s);
                                                        return [...prev, { key: routeKey, value: e.target.value }];
                                                    });
                                                }}
                                                style={{
                                                    width: 240, padding: '8px 12px', borderRadius: 10,
                                                    border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-surface)',
                                                    color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                                                    cursor: 'pointer', outline: 'none',
                                                }}
                                            >
                                                <option value="">自动 (第一个已连接引擎)</option>
                                                {aiConfigs.map(c => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.is_active ? '🟢' : '⬜'} {c.name} ({c.model_name})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Data */}
                        <div className="settings-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ padding: 12, borderRadius: 16, backgroundColor: 'var(--purple-subtle)', color: 'var(--purple)' }}>
                                        <Database size={22} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>数据同步</h3>
                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>本地数据库健康状态与备份</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', backgroundColor: 'var(--success-subtle)', color: 'var(--success)', borderRadius: 10, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    <ShieldCheck size={13} />Connected
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'ai' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">

                        {/* ═══════════════════════════════════════════════
                            ENGINE CARD RENDERER
                        ═══════════════════════════════════════════════ */}

                        {(() => {
                            // — Engine Card Component (inline) —
                            const EngineCard = ({ config, onEdit, onDelete, onToggle, onTest }: {
                                config: any;
                                onEdit: () => void;
                                onDelete: () => void;
                                onToggle: () => void;
                                onTest: () => void;
                            }) => {
                                const isActive = config.is_active;
                                return (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        padding: '16px 20px', borderRadius: 16,
                                        border: isActive ? '1.5px solid #22c55e' : '1px solid var(--border)',
                                        backgroundColor: isActive ? 'rgba(34,197,94,0.06)' : 'var(--bg-muted)',
                                        transition: 'all 0.3s ease',
                                    }}>
                                        {/* Status dot */}
                                        <div style={{
                                            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                            backgroundColor: isActive ? '#22c55e' : 'var(--border-strong)',
                                            boxShadow: isActive ? '0 0 8px rgba(34,197,94,0.5)' : 'none',
                                            transition: 'all 0.3s',
                                        }} />
                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: isActive ? '#16a34a' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                {config.name}
                                                {isActive && <span style={{ fontSize: 9, padding: '2px 8px', backgroundColor: '#22c55e', color: '#fff', borderRadius: 6, textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em' }}>已连接</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: isActive ? 'rgba(22,163,74,0.7)' : 'var(--text-muted)', marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {config.model_name || '未配置模型'} · {config.base_url || '未配置地址'}
                                            </div>
                                        </div>
                                        {/* Action buttons — aligned */}
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button onClick={onTest} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>测试</button>
                                            <button onClick={onToggle} style={{
                                                padding: '6px 14px', borderRadius: 8, border: 'none',
                                                backgroundColor: isActive ? 'rgba(239,68,68,0.1)' : '#22c55e',
                                                color: isActive ? '#ef4444' : '#fff',
                                                fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                                            }}>{isActive ? '断开' : '连接'}</button>
                                            <button onClick={onEdit} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>编辑</button>
                                            <button onClick={onDelete} title="删除" style={{
                                                padding: '6px 10px', borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                backgroundColor: 'var(--bg-surface)',
                                                color: 'var(--text-muted)',
                                                fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                                transition: 'all 0.15s',
                                                display: 'flex', alignItems: 'center', gap: 4,
                                            }}><Trash2 size={13} style={{ color: '#ef4444', opacity: 0.7 }} /><span style={{ color: 'var(--text-secondary)' }}>删除</span></button>
                                        </div>
                                    </div>
                                );
                            };

                            // — Section Header Component —
                            const SectionHeader = ({ icon, title, desc, badge }: { icon: React.ReactNode; title: string; desc: string; badge?: React.ReactNode }) => (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                    <div style={{ padding: 12, borderRadius: 16, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)' }}>{icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{desc}</p>
                                    </div>
                                    {badge}
                                </div>
                            );

                            // — Quick-add presets —
                            const localPresets = [
                                { name: 'LM Studio', provider: 'openai', base_url: 'http://127.0.0.1:1234/v1', model_name: '__auto_detect__', api_key: '', purpose: 'local' },
                                { name: 'Ollama', provider: 'ollama', base_url: 'http://127.0.0.1:11434/v1', model_name: '__auto_detect__', api_key: '', purpose: 'local' },
                            ];
                            const onlinePresets = [
                                { name: '硅基流动 (SiliconFlow)', provider: 'openai', base_url: 'https://api.siliconflow.cn/v1', model_name: 'deepseek-ai/DeepSeek-V3', api_key: '', purpose: 'online' },
                                { name: 'DeepSeek 官方', provider: 'openai', base_url: 'https://api.deepseek.com/v1', model_name: 'deepseek-chat', api_key: '', purpose: 'online' },
                                { name: 'Google Gemini', provider: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model_name: 'gemini-2.0-flash', api_key: '', purpose: 'online' },
                                { name: '通用自定义', provider: 'openai', base_url: '', model_name: '', api_key: '', purpose: 'online' },
                            ];

                            const handleQuickAdd = (preset: any) => {
                                setEditAiId(`new_${preset.purpose}`);
                                setAiForm({ id: '', ...preset, is_active: true });
                            };

                            const handleToggleActive = async (config: any) => {
                                try {
                                    await invoke('upsert_ai_config', { config: { ...config, is_active: !config.is_active } });
                                    loadData();
                                } catch (e) { alert(`操作失败: ${e}`); }
                            };

                            const handleTestConfig = async (config: any) => {
                                setIsTesting(true);
                                try {
                                    const req = { prompt: "Hello, test.", system_prompt: "Connectivity test. Respond: 'OK'." };
                                    await invoke('chat_with_ai_config', { payload: { config: { ...config, is_active: true }, req } });
                                    alert('✅ 连接成功！AI 响应正常。');
                                } catch (e) { alert(`❌ 连接失败: ${e}`); }
                                finally { setIsTesting(false); }
                            };

                            const localConfigs = aiConfigs.filter(c => c.purpose === 'local');
                            const onlineConfigs = aiConfigs.filter(c => c.purpose === 'online' || c.purpose === 'core_chat');
                            const hasActiveEngine = aiConfigs.some(c => c.is_active);
                            const handleDisconnectAll = async () => {
                                try {
                                    // 把所有激活配置设为非激活
                                    for (const c of aiConfigs.filter(x => x.is_active)) {
                                        await invoke('upsert_ai_config', { config: { ...c, is_active: false } });
                                    }
                                    // 清除模块路由
                                    await invoke('update_setting', { key: 'ai_route_chat', value: '' });
                                    await invoke('update_setting', { key: 'ai_route_scheme', value: '' });
                                    loadData();
                                } catch (e) { alert(`断开失败: ${e}`); }
                            };

                            return (
                                <>
                                    {/* Global status bar */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                                        borderRadius: 16, marginBottom: 24,
                                        backgroundColor: hasActiveEngine ? 'rgba(34,197,94,0.08)' : 'var(--bg-muted)',
                                        border: hasActiveEngine ? '1.5px solid rgba(34,197,94,0.3)' : '1px solid var(--border)',
                                    }}>
                                        <div style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            backgroundColor: hasActiveEngine ? '#22c55e' : 'var(--border-strong)',
                                            boxShadow: hasActiveEngine ? '0 0 10px rgba(34,197,94,0.6)' : 'none',
                                        }} />
                                        <span style={{ fontSize: 13, fontWeight: 700, color: hasActiveEngine ? '#16a34a' : 'var(--text-muted)', flex: 1 }}>
                                            {hasActiveEngine
                                                ? `引擎在线 · ${aiConfigs.filter(c => c.is_active).map(c => `${c.name} · ${c.model_name}`).join(', ')}`
                                                : '所有引擎离线 · 请连接至少一个模型'}
                                        </span>
                                        {hasActiveEngine && (
                                            <button onClick={handleDisconnectAll} style={{
                                                padding: '5px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
                                                backgroundColor: 'rgba(239,68,68,0.06)', color: '#ef4444',
                                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 4,
                                            }}>
                                                <X size={12} /> 断开
                                            </button>
                                        )}
                                    </div>

                                    {/* ══ Section 1: LOCAL MODELS ══ */}
                                    <div className="settings-section">
                                        <SectionHeader
                                            icon={<MonitorPlay size={22} />}
                                            title="Ⅰ. 本地模型"
                                            desc="基于本机运行的推理引擎，数据完全隐私，零延迟。推荐 AMD GPU 使用 Ollama。"
                                            badge={
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    {localPresets.map((p, i) => (
                                                        <button key={i} onClick={() => handleQuickAdd(p)} style={{
                                                            padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)',
                                                            backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
                                                            fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                        }}>+ {p.name}</button>
                                                    ))}
                                                </div>
                                            }
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {localConfigs.length === 0 && (
                                                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, borderRadius: 12, border: '2px dashed var(--border)' }}>
                                                    暂无本地模型配置，点击上方按钮一键添加
                                                </div>
                                            )}
                                            {localConfigs.map(c => (
                                                <EngineCard key={c.id} config={c}
                                                    onTest={() => handleTestConfig(c)}
                                                    onToggle={() => handleToggleActive(c)}
                                                    onEdit={() => { setEditAiId(`edit_local_${c.id}`); setAiForm(c); }}
                                                    onDelete={() => handleDeleteAiConfig(c.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ height: 16 }} />

                                    {/* ══ Section 2: ONLINE MODELS ══ */}
                                    {(() => {
                                        // Provider categorization
                                        const providerBlocks = [
                                            {
                                                key: 'siliconflow',
                                                label: '硅基流动',
                                                color: '#6366f1',
                                                desc: 'SiliconFlow 开放平台 · 多模型聚合服务',
                                                icon: '🔮',
                                                match: (c: any) => (c.base_url || '').includes('siliconflow'),
                                                preset: onlinePresets[0],
                                            },
                                            {
                                                key: 'deepseek',
                                                label: 'DeepSeek',
                                                color: '#0ea5e9',
                                                desc: 'DeepSeek 官方 API · 深度推理模型',
                                                icon: '🧠',
                                                match: (c: any) => (c.base_url || '').includes('deepseek') || (c.name || '').toLowerCase().includes('deepseek'),
                                                preset: onlinePresets[1],
                                            },
                                            {
                                                key: 'gemini',
                                                label: 'Google Gemini',
                                                color: '#f59e0b',
                                                desc: 'Google AI · Gemini 系列多模态模型',
                                                icon: '✨',
                                                match: (c: any) => (c.base_url || '').includes('googleapis') || (c.base_url || '').includes('gemini') || (c.name || '').toLowerCase().includes('gemini'),
                                                preset: onlinePresets[2],
                                            },
                                            {
                                                key: 'custom',
                                                label: '通用自定义',
                                                color: '#8b5cf6',
                                                desc: '兼容 OpenAI 协议的第三方平台',
                                                icon: '🔧',
                                                match: () => false, // fallback — everything else
                                                preset: onlinePresets[3],
                                            },
                                        ];

                                        // Categorize configs
                                        const categorized: Record<string, any[]> = { siliconflow: [], deepseek: [], gemini: [], custom: [] };
                                        onlineConfigs.forEach(c => {
                                            let placed = false;
                                            for (const blk of providerBlocks) {
                                                if (blk.key !== 'custom' && blk.match(c)) {
                                                    categorized[blk.key].push(c);
                                                    placed = true;
                                                    break;
                                                }
                                            }
                                            if (!placed) categorized.custom.push(c);
                                        });

                                        return (
                                            <div className="settings-section">
                                                {/* Section header */}
                                                <SectionHeader
                                                    icon={<Cloud size={22} />}
                                                    title="Ⅱ. 在线模型"
                                                    desc="接入云端 AI 服务，按平台分组管理引擎连接。"
                                                />

                                                {/* ── 自动扫网独立横条 ── */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 14,
                                                    padding: '12px 18px', borderRadius: 14, marginBottom: 20,
                                                    backgroundColor: 'var(--bg-surface)',
                                                    border: '1.5px dashed var(--border)',
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <Zap size={14} style={{ color: 'var(--brand)' }} /> 自动扫网 · 社区公共节点探测
                                                        </div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                            {publicNodes.length > 0
                                                                ? `发现 ${publicNodes.length} 个可尝试节点 · 点击下方「一键接入」选用`
                                                                : '自动检测互联网上可用的免费 OpenAI 兼容 API 端点'}
                                                        </div>
                                                    </div>
                                                    <button onClick={handleFetchPublicNodes} disabled={isLoading} style={{
                                                        padding: '8px 18px', borderRadius: 10, border: 'none', flexShrink: 0,
                                                        backgroundColor: 'var(--brand)', color: '#fff',
                                                        fontSize: 11, fontWeight: 800, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                        opacity: isLoading ? 0.6 : 1,
                                                    }}>
                                                        <Zap size={12} /> {isLoading ? '扫描中...' : '开始扫描'}
                                                    </button>
                                                </div>

                                                {/* Auto-scan results strip */}
                                                {publicNodes.length > 0 && (() => {
                                                    // Signup URL mapping for known providers
                                                    const getSignupInfo = (baseUrl: string): { url: string; label: string } | null => {
                                                        if (baseUrl.includes('siliconflow')) return { url: 'https://cloud.siliconflow.cn/', label: '硅基流动控制台' };
                                                        if (baseUrl.includes('deepseek')) return { url: 'https://platform.deepseek.com/api_keys', label: 'DeepSeek 平台' };
                                                        if (baseUrl.includes('groq')) return { url: 'https://console.groq.com/keys', label: 'Groq 控制台' };
                                                        if (baseUrl.includes('openrouter')) return { url: 'https://openrouter.ai/keys', label: 'OpenRouter 控制台' };
                                                        if (baseUrl.includes('cerebras')) return { url: 'https://cloud.cerebras.ai/', label: 'Cerebras 控制台' };
                                                        if (baseUrl.includes('googleapis') || baseUrl.includes('gemini')) return { url: 'https://aistudio.google.com/apikey', label: 'Google AI Studio' };
                                                        return null;
                                                    };

                                                    const needsKey = (n: any) => (n.name || '').includes('需填写');

                                                    return (
                                                        <div className="animate-in fade-in slide-in-from-top-2" style={{
                                                            marginBottom: 20, padding: '16px 18px', borderRadius: 14,
                                                            backgroundColor: 'rgba(34,197,94,0.06)',
                                                            border: '1.5px solid rgba(34,197,94,0.3)',
                                                        }}>
                                                            <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                                                                扫描到 {publicNodes.length} 个端点
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                                {publicNodes.map((n: any, i: number) => {
                                                                    const signup = getSignupInfo(n.base_url || '');
                                                                    const reqKey = needsKey(n);
                                                                    return (
                                                                        <div key={i} style={{
                                                                            padding: '14px 16px', borderRadius: 12,
                                                                            backgroundColor: 'var(--bg-raised)',
                                                                            border: reqKey ? '1.5px solid #f59e0b40' : '1px solid var(--border)',
                                                                        }}>
                                                                            {/* Row 1: Name + status */}
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                                                                <div style={{
                                                                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                                                    backgroundColor: reqKey ? '#f59e0b' : '#22c55e',
                                                                                }} />
                                                                                <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                                                                                    {n.name?.replace(' (需填写 API Key)', '') || n.name}
                                                                                </div>
                                                                                {reqKey && (
                                                                                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 800 }}>需 API Key</span>
                                                                                )}
                                                                                {!reqKey && (
                                                                                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, backgroundColor: '#dcfce7', color: '#166534', fontWeight: 800 }}>可直接用</span>
                                                                                )}
                                                                            </div>
                                                                            {/* Row 2: Model + URL info */}
                                                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 8 }}>
                                                                                模型: {n.model_name} · 地址: {n.base_url}
                                                                            </div>
                                                                            {/* Row 3: API Key input + signup link + connect button */}
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder={reqKey ? '请粘贴你的 API Key...' : 'API Key（可选）'}
                                                                                    value={n._inputKey || ''}
                                                                                    onChange={e => {
                                                                                        const val = e.target.value;
                                                                                        setPublicNodes(prev => prev.map((nd: any, idx: number) =>
                                                                                            idx === i ? { ...nd, _inputKey: val } : nd
                                                                                        ));
                                                                                    }}
                                                                                    style={{
                                                                                        flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 11,
                                                                                        border: reqKey ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                                                                                        backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
                                                                                        outline: 'none', fontFamily: 'monospace',
                                                                                    }}
                                                                                />
                                                                                {signup && (
                                                                                    <button
                                                                                        onClick={() => { (window as any).__TAURI__?.shell?.open(signup.url) || window.open(signup.url, '_blank'); }}
                                                                                        style={{
                                                                                            padding: '7px 12px', borderRadius: 8, flexShrink: 0,
                                                                                            border: '1px solid var(--border)',
                                                                                            backgroundColor: 'var(--bg-surface)', color: 'var(--brand)',
                                                                                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                                                            whiteSpace: 'nowrap',
                                                                                        }}
                                                                                    >🔗 {signup.label}</button>
                                                                                )}
                                                                                <button onClick={async () => {
                                                                                    const apiKey = n._inputKey || n.api_key || '';
                                                                                    if (reqKey && !apiKey.trim()) {
                                                                                        alert('此端点需要 API Key 才能使用，请先填写。');
                                                                                        return;
                                                                                    }
                                                                                    try {
                                                                                        await invoke('upsert_ai_config', {
                                                                                            config: { ...n, id: '', api_key: apiKey, is_active: true, purpose: 'online', _inputKey: undefined }
                                                                                        });
                                                                                        setPublicNodes(prev => prev.filter((_: any, idx: number) => idx !== i));
                                                                                        loadData();
                                                                                    } catch (e) { alert('接入失败: ' + e); }
                                                                                }} style={{
                                                                                    padding: '7px 16px', borderRadius: 8, border: 'none', flexShrink: 0,
                                                                                    backgroundColor: '#22c55e', color: '#fff',
                                                                                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                                                                                    whiteSpace: 'nowrap',
                                                                                }}>一键接入</button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                                                提示：大部分平台需注册获取 API Key · 点击右侧链接直达注册页面
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* ── 4 Provider Accordion Blocks ── */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                    {providerBlocks.map(blk => {
                                                        const configs = categorized[blk.key];
                                                        const activeCount = configs.filter(c => c.is_active).length;
                                                        const expanded = expandedProviders[blk.key] ?? true;
                                                        const toggleExpanded = () => setExpandedProviders(prev => ({ ...prev, [blk.key]: !prev[blk.key] }));

                                                        return (
                                                            <div key={blk.key} style={{
                                                                borderRadius: 16, overflow: 'hidden',
                                                                border: `1.5px solid ${activeCount > 0 ? blk.color + '40' : 'var(--border)'}`,
                                                                backgroundColor: 'var(--bg-muted)',
                                                                transition: 'all 0.3s',
                                                            }}>
                                                                {/* Block Header — clickable to expand/collapse */}
                                                                <div
                                                                    onClick={toggleExpanded}
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: 14,
                                                                        padding: '14px 20px', cursor: 'pointer',
                                                                        borderBottom: expanded ? '1px solid var(--border)' : 'none',
                                                                        transition: 'background 0.2s',
                                                                    }}
                                                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-raised)')}
                                                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                                >
                                                                    <span style={{ fontSize: 22 }}>{blk.icon}</span>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                            {blk.label}
                                                                            {activeCount > 0 && (
                                                                                <span style={{
                                                                                    fontSize: 9, padding: '2px 8px', borderRadius: 6,
                                                                                    backgroundColor: blk.color + '20', color: blk.color,
                                                                                    fontWeight: 900, textTransform: 'uppercase',
                                                                                }}>
                                                                                    {activeCount} 已连接
                                                                                </span>
                                                                            )}
                                                                            {configs.length > 0 && activeCount === 0 && (
                                                                                <span style={{
                                                                                    fontSize: 9, padding: '2px 8px', borderRadius: 6,
                                                                                    backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)',
                                                                                    fontWeight: 800,
                                                                                }}>
                                                                                    {configs.length} 个配置
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{blk.desc}</div>
                                                                    </div>
                                                                    <div style={{
                                                                        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                                                                    }}>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleQuickAdd(blk.preset); }}
                                                                            style={{
                                                                                padding: '5px 12px', borderRadius: 8,
                                                                                border: `1px solid ${blk.color}40`,
                                                                                backgroundColor: blk.color + '10',
                                                                                color: blk.color,
                                                                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                                                display: 'flex', alignItems: 'center', gap: 4,
                                                                            }}
                                                                        >
                                                                            + 添加
                                                                        </button>
                                                                        <span style={{
                                                                            fontSize: 14, color: 'var(--text-faint)',
                                                                            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                                                                            transition: 'transform 0.25s ease',
                                                                            display: 'flex',
                                                                        }}>▼</span>
                                                                    </div>
                                                                </div>

                                                                {/* Block Body — engines list */}
                                                                {expanded && (
                                                                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                        {configs.length === 0 ? (
                                                                            <div style={{
                                                                                padding: 16, textAlign: 'center',
                                                                                color: 'var(--text-faint)', fontSize: 12,
                                                                                border: '1.5px dashed var(--border)',
                                                                                borderRadius: 10, fontStyle: 'italic',
                                                                            }}>
                                                                                暂无 {blk.label} 引擎，点击右上方 「+ 添加」快速配置
                                                                            </div>
                                                                        ) : (
                                                                            configs.map(c => (
                                                                                <EngineCard key={c.id} config={c}
                                                                                    onTest={() => handleTestConfig(c)}
                                                                                    onToggle={() => handleToggleActive(c)}
                                                                                    onEdit={() => { setEditAiId(`edit_online_${c.id}`); setAiForm(c); }}
                                                                                    onDelete={() => handleDeleteAiConfig(c.id)}
                                                                                />
                                                                            ))
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div style={{ height: 16 }} />

                                    {/* ══ Section 3: EMBEDDING ENGINE ══ */}
                                    <div className="settings-section">
                                        <SectionHeader
                                            icon={<Cpu size={22} />}
                                            title="Ⅲ. 嵌入引擎"
                                            desc="用于知识库 RAG 语义检索的向量嵌入模型。"
                                        />
                                        {/* Engine Type Selector */}
                                        <div style={{ marginBottom: 16 }}>
                                            <label className="form-label">嵌入引擎类型</label>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {[
                                                    { key: 'local', label: '本地内置 (推荐)', desc: '自动下载 ~23MB 模型' },
                                                    { key: 'lmstudio', label: 'LM Studio', desc: '使用已加载的嵌入模型' },
                                                    { key: 'online', label: '在线 API', desc: '使用云端嵌入服务' },
                                                ].map(opt => (
                                                    <button key={opt.key}
                                                        onClick={async () => {
                                                            setEmbeddingEngine(opt.key);
                                                            await invoke('update_setting', { key: 'embedding_engine', value: opt.key });
                                                            loadEmbeddingStatus();
                                                        }}
                                                        style={{
                                                            flex: 1, padding: '12px 16px', borderRadius: 12,
                                                            border: embeddingEngine === opt.key ? '2px solid var(--brand)' : '1px solid var(--border)',
                                                            backgroundColor: embeddingEngine === opt.key ? 'var(--brand-subtle)' : 'var(--bg-muted)',
                                                            cursor: 'pointer', textAlign: 'left',
                                                        }}
                                                    >
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: embeddingEngine === opt.key ? 'var(--brand)' : 'var(--text-primary)' }}>{opt.label}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Status & Actions */}
                                        <div style={{
                                            display: 'flex', gap: 12, alignItems: 'center',
                                            padding: '16px 20px', borderRadius: 12,
                                            backgroundColor: embeddingStatus?.model_ready ? 'rgba(34,197,94,0.06)' : 'var(--bg-muted)',
                                            border: embeddingStatus?.model_ready ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border)',
                                        }}>
                                            <div style={{
                                                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                                backgroundColor: embeddingStatus?.model_ready ? '#22c55e' : 'var(--border-strong)',
                                                boxShadow: embeddingStatus?.model_ready ? '0 0 8px rgba(34,197,94,0.5)' : 'none',
                                            }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: embeddingStatus?.model_ready ? '#16a34a' : 'var(--text-primary)', marginBottom: 2 }}>
                                                    模型: {embeddingStatus?.model_name || '未加载'}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                    状态: {embeddingStatus?.model_ready ? '✅ 已就绪' : '⏳ 未下载/未连接'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    setIsInitEmbed(true);
                                                    try {
                                                        const msg: string = await invoke('init_embedding_model');
                                                        alert(`✅ ${msg}`);
                                                        loadEmbeddingStatus();
                                                    } catch (e) { alert(`❌ ${e}`); }
                                                    finally { setIsInitEmbed(false); }
                                                }}
                                                disabled={isInitEmbed}
                                                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', opacity: isInitEmbed ? 0.5 : 1 }}
                                            >
                                                {isInitEmbed ? '下载中...' : embeddingStatus?.model_ready ? '验证模型' : '下载模型'}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('确定重建所有知识库文件的索引吗？')) return;
                                                    setIsRebuildingIdx(true);
                                                    try {
                                                        const items = templates.map(t => ({ id: t.id, file_path: t.file_path, file_ext: t.file_ext }));
                                                        const msg: string = await invoke('rebuild_all_indexes', { items });
                                                        alert(`✅ ${msg}`);
                                                    } catch (e) { alert(`❌ ${e}`); }
                                                    finally { setIsRebuildingIdx(false); }
                                                }}
                                                disabled={isRebuildingIdx}
                                                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', opacity: isRebuildingIdx ? 0.5 : 1 }}
                                            >
                                                {isRebuildingIdx ? '索引中...' : '重建索引'}
                                            </button>
                                        </div>
                                        {embeddingEngine !== 'local' && (
                                            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                <div>
                                                    <label className="form-label">嵌入 API 地址</label>
                                                    <input defaultValue={embeddingEngine === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : ''} onBlur={e => invoke('update_setting', { key: 'embedding_base_url', value: e.target.value })} className="form-input" placeholder="http://127.0.0.1:1234/v1" />
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                    <div>
                                                        <label className="form-label">嵌入模型名</label>
                                                        <input defaultValue="nomic-embed-text" onBlur={e => invoke('update_setting', { key: 'embedding_model_name', value: e.target.value })} className="form-input" placeholder="nomic-embed-text" />
                                                    </div>
                                                    <div>
                                                        <label className="form-label">API Key (可选)</label>
                                                        <input type="password" onBlur={e => invoke('update_setting', { key: 'embedding_api_key', value: e.target.value })} className="form-input" placeholder="本地模型可留白" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ══ CUSTOM DELETE CONFIRM MODAL ══ */}
                                    {confirmDeleteId && (
                                        <div style={{
                                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                                            zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }} onClick={() => setConfirmDeleteId(null)}>
                                            <div className="animate-in fade-in zoom-in-95" style={{
                                                width: 380, padding: '28px 32px', borderRadius: 20,
                                                backgroundColor: 'rgba(255,255,255,0.75)',
                                                backdropFilter: 'blur(24px) saturate(180%)',
                                                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                                                border: '1px solid rgba(239,68,68,0.2)',
                                                boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.1) inset',
                                            }} onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <Trash2 size={20} style={{ color: '#ef4444' }} />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>删除模型配置</div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>此操作不可撤销</div>
                                                    </div>
                                                </div>
                                                <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                    确定要删除该模型配置吗？删除后相关的连接和设置将被永久移除。
                                                </p>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                                    <button onClick={() => setConfirmDeleteId(null)} style={{
                                                        padding: '9px 20px', borderRadius: 10,
                                                        border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)',
                                                        color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                                    }}>取消</button>
                                                    <button onClick={executeDelete} style={{
                                                        padding: '9px 20px', borderRadius: 10,
                                                        border: 'none', backgroundColor: '#ef4444',
                                                        color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                                        boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
                                                    }}>确认删除</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ══ EDIT MODAL (floating overlay) ══ */}
                                    {editAiId && (
                                        <div style={{
                                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                                            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }} onClick={e => { if (e.target === e.currentTarget) { setEditAiId(null); setFetchedModels([]); } }}>
                                            <div className="animate-in fade-in zoom-in-95 custom-scrollbar" style={{
                                                width: '92%', maxWidth: 820,
                                                padding: '32px 36px', borderRadius: 24,
                                                backgroundColor: 'var(--bg-raised)',
                                                border: '1.5px solid var(--brand)',
                                                boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
                                                maxHeight: '90vh', overflowY: 'auto',
                                            }} onClick={e => e.stopPropagation()}>
                                                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <Zap size={22} style={{ color: 'var(--brand)' }} />
                                                    {editAiId.startsWith('new_') ? '添加引擎' : '编辑引擎'}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <label className="form-label">显示名称</label>
                                                        <input value={aiForm.name || ''} onChange={e => setAiForm({ ...aiForm, name: e.target.value })} className="form-input" placeholder="例如：本地 Ollama 或 DeepSeek" />
                                                    </div>
                                                    <div>
                                                        <label className="form-label">提供商类型</label>
                                                        <select value={aiForm.provider || 'openai'} onChange={e => setAiForm({ ...aiForm, provider: e.target.value })} className="form-input">
                                                            <option value="ollama">Ollama (本地)</option>
                                                            <option value="openai">OpenAI 兼容 (SF/DeepSeek/LM Studio)</option>
                                                            <option value="gemini">Google Gemini</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="form-label">安全秘钥 (API KEY)</label>
                                                        <input value={aiForm.api_key || ''} onChange={e => setAiForm({ ...aiForm, api_key: e.target.value })} className="form-input" placeholder="本地模型可留白" type="password" />
                                                    </div>
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <label className="form-label">API Base URL</label>
                                                        <input value={aiForm.base_url || ''} onChange={e => setAiForm({ ...aiForm, base_url: e.target.value })} className="form-input" placeholder="http://127.0.0.1:11434/v1" />
                                                    </div>
                                                    {/* 模型选择区 - 占满整行 */}
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <label className="form-label">模型名 {fetchedModels.length > 0 && <span style={{ color: 'var(--brand)', fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>· {fetchedModels.length} 个可用</span>}</label>
                                                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                                            <input value={aiForm.model_name || ''} onChange={e => setAiForm({ ...aiForm, model_name: e.target.value })} className="form-input flex-1" placeholder="如 deepseek-ai/DeepSeek-V3 或点击右侧获取列表" />
                                                            <button onClick={async () => {
                                                                if (!aiForm.base_url) { alert('请先填写 API 地址'); return; }
                                                                setIsFetchingModels(true);
                                                                try {
                                                                    const models: string[] = await invoke('fetch_ai_models', { baseUrl: aiForm.base_url, apiKey: aiForm.api_key });
                                                                    setFetchedModels(models);
                                                                    if (models.length === 0) alert('未获取到模型列表，该服务可能不支持 /models 端点。');
                                                                } catch (e) { alert(`获取模型失败: ${e}`); }
                                                                finally { setIsFetchingModels(false); }
                                                            }} disabled={isFetchingModels} title="从服务器获取可用模型列表" style={{
                                                                padding: '0 18px', flexShrink: 0, borderRadius: 12,
                                                                border: '1.5px solid var(--border)',
                                                                backgroundColor: isFetchingModels ? 'var(--bg-muted)' : 'var(--brand-subtle)',
                                                                color: 'var(--brand)', cursor: 'pointer',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                                            }}>
                                                                <RefreshCcw size={13} className={isFetchingModels ? 'spin' : ''} />
                                                                {isFetchingModels ? '获取中...' : '获取列表'}
                                                            </button>
                                                        </div>
                                                        {aiForm.provider === 'openai' && (
                                                            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <input type="checkbox" id="autoDetect" checked={aiForm.model_name === '__auto_detect__'} onChange={e => setAiForm({ ...aiForm, model_name: e.target.checked ? '__auto_detect__' : '' })} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                                                                <label htmlFor="autoDetect" style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', cursor: 'pointer' }}>随动模式 (自动识别服务器当前模型)</label>
                                                            </div>
                                                        )}
                                                        {/* 模型列表 - 内嵌展示，非悬浮 */}
                                                        {fetchedModels.length > 0 && (
                                                            <div data-model-container="1" style={{
                                                                border: '1.5px solid var(--border)', borderRadius: 14,
                                                                backgroundColor: 'var(--bg-surface)', overflow: 'hidden',
                                                            }}>
                                                                {/* 搜索栏 */}
                                                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-muted)' }}>
                                                                    <Search size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                                                                    <input
                                                                        placeholder={`搜索 ${fetchedModels.length} 个模型...`}
                                                                        onChange={e => {
                                                                            const q = e.target.value.toLowerCase();
                                                                            e.target.closest('[data-model-container]')?.querySelectorAll('[data-model-item]').forEach((el: any) => {
                                                                                el.style.display = el.dataset.modelItem.toLowerCase().includes(q) ? '' : 'none';
                                                                            });
                                                                        }}
                                                                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, backgroundColor: 'transparent', color: 'var(--text-primary)' }}
                                                                    />
                                                                    <button onClick={() => setFetchedModels([])} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2 }}>
                                                                        <X size={13} />
                                                                    </button>
                                                                </div>
                                                                {/* 模型网格 */}
                                                                <div className="custom-scrollbar" style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                                                    {fetchedModels.map(name => (
                                                                        <div key={name}
                                                                            data-model-item={name}
                                                                            onClick={() => { setAiForm({ ...aiForm, model_name: name }); setFetchedModels([]); }}
                                                                            style={{
                                                                                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                                                                fontSize: 11, fontFamily: 'monospace',
                                                                                color: name === aiForm.model_name ? 'var(--brand)' : 'var(--text-secondary)',
                                                                                fontWeight: name === aiForm.model_name ? 700 : 400,
                                                                                backgroundColor: name === aiForm.model_name ? 'var(--brand-subtle)' : 'transparent',
                                                                                border: name === aiForm.model_name ? '1px solid var(--brand)' : '1px solid transparent',
                                                                                transition: 'all 0.12s',
                                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                                overflow: 'hidden',
                                                                            }}
                                                                            onMouseEnter={e => { if (name !== aiForm.model_name) { e.currentTarget.style.backgroundColor = 'var(--bg-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}
                                                                            onMouseLeave={e => { if (name !== aiForm.model_name) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
                                                                        >
                                                                            <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, backgroundColor: name === aiForm.model_name ? 'var(--brand)' : 'var(--border)' }} />
                                                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                                                    <button onClick={() => { setEditAiId(null); setFetchedModels([]); }} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>取消</button>
                                                    <button onClick={handleTestConnection} disabled={isTesting} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--brand)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                                                        {isTesting ? '测试中...' : '测试连接'}
                                                    </button>
                                                    <button onClick={() => handleSaveAiConfig(aiForm.purpose || 'local')} style={{ padding: '9px 24px', borderRadius: 10, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>保存配置</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ height: 16 }} />

                                    {/* ══ AI Prompts Section ══ */}
                                    <div className="settings-section">
                                        <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>AI 提示词模板</h3>
                                        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)' }}>
                                            可为不同环节单独配置系统提示词。留空时将回退到内置默认提示。
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div>
                                                <label className="form-label">项目综述 · 系统提示词</label>
                                                <textarea value={promptProjectSummary} onChange={e => setPromptProjectSummary(e.target.value)} onBlur={() => handleUpdateSetting('prompt_project_summary_system', promptProjectSummary)} placeholder={defaultPrompts.projectSummary} className="form-input" style={{ minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
                                            </div>
                                            <div>
                                                <label className="form-label">勘察情况综述 · 系统提示词</label>
                                                <textarea value={promptSurveySummary} onChange={e => setPromptSurveySummary(e.target.value)} onBlur={() => handleUpdateSetting('prompt_survey_summary_system', promptSurveySummary)} placeholder={defaultPrompts.surveySummary} className="form-input" style={{ minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
                                            </div>
                                            <div>
                                                <label className="form-label">AI 对话侧栏 · 系统提示词</label>
                                                <textarea value={promptAiChat} onChange={e => setPromptAiChat(e.target.value)} onBlur={() => handleUpdateSetting('prompt_ai_chat_system', promptAiChat)} placeholder={defaultPrompts.aiChat} className="form-input" style={{ minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }} />
                                            </div>
                                            <div>
                                                <label className="form-label">联动方案优化 · 系统提示词</label>
                                                <textarea value={promptSchemeOptimize} onChange={e => setPromptSchemeOptimize(e.target.value)} onBlur={() => handleUpdateSetting('prompt_scheme_optimize_system', promptSchemeOptimize)} placeholder={defaultPrompts.schemeOptimize} className="form-input" style={{ minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
                                            </div>
                                            <div>
                                                <label className="form-label">联动规则生成 · 系统提示词</label>
                                                <textarea value={promptSchemeGenerate} onChange={e => setPromptSchemeGenerate(e.target.value)} onBlur={() => handleUpdateSetting('prompt_scheme_generate_system', promptSchemeGenerate)} placeholder={defaultPrompts.schemeGenerate} className="form-input" style={{ minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--border-strong)', fontWeight: 900, letterSpacing: '0.4em', textTransform: 'uppercase', padding: '40px 0 20px' }}>
                    GO-TONGX Build v2024.03.11
                </p>
            </div>

            {/* ═══ 右栏：Token 监控（仅 AI tab 显示） ═══ */}
            {activeTab === 'ai' && (
                <div style={{ minWidth: 0, position: 'sticky', top: 20 }}>
                    <TokenMonitor />
                </div>
            )}

            </div>
        </div>
        </div>
    );
};
