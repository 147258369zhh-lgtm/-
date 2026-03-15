import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
    Plus, Trash2, ChevronUp, ChevronDown, Save,
    FileText, Table, Type, Database, Edit3, MoreVertical,
    X, Loader2, Sparkles, FolderOpen, Play,
    ArrowRight, FolderInput, FolderOutput, CheckCircle2, Bot
} from 'lucide-react';

interface Instruction {
    id: string;
    scheme_id: string;
    op_type: 'WordReplace' | 'ExcelWrite' | 'FileNameChange';
    data_source_type: 'Static' | 'ExcelCell' | 'WordParagraph';
    source_file_path?: string;
    source_params?: string;
    target_params?: string;
    order_index: number;
}

interface Scheme {
    id: string;
    project_id: string | null;
    name: string;
    description?: string;
}

const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    border: '1.5px solid var(--border)', borderRadius: 12,
    backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
    fontSize: 12, outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box', fontFamily: 'inherit',
};

const opMeta = {
    WordReplace:    { color: 'var(--brand)',   bg: 'var(--brand-subtle)',   label: 'Word 替换',  icon: FileText },
    ExcelWrite:     { color: 'var(--success)', bg: 'var(--success-subtle)', label: 'Excel 写入', icon: Table },
    FileNameChange: { color: '#f59e0b',        bg: 'rgba(245,158,11,0.1)', label: '文件名联动', icon: Type },
} as const;

export const SchemeEditor: React.FC<{ projectId: string | null, onUpdated?: () => void }> = ({ projectId }) => {
    const [schemes, setSchemes] = useState<Scheme[]>([]);
    const [activeSchemeId, setActiveSchemeId] = useState<string | null>(null);
    const [instructions, setInstructions] = useState<Instruction[]>([]);
    const [aiOptimization, setAiOptimization] = useState<string | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [aiAssistantInput, setAiAssistantInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showAiAssistant, setShowAiAssistant] = useState(false);

    // ── 方案级文件绑定（全局，非每条指令）──
    const [sourceFile, setSourceFile] = useState<string>('');
    const [targetFile, setTargetFile] = useState<string>('');

    // 可配置系统提示词（从 settings 表读取）
    const [optimizeSystemPrompt, setOptimizeSystemPrompt] = useState(
        '你是高级通信设计自动化专家。直接输出联动方案的建设性优化建议。'
    );
    const [generateSystemPrompt, setGenerateSystemPrompt] = useState(
        `你是一个自动化专家。按照以下 JSON 格式生成指令数组，不需要其它文字。不要有 Markdown 格式，只要纯数组。
类型 (op_type): WordReplace (Word替换), ExcelWrite (Excel写入), FileNameChange (文件名更改)。
数据源 (data_source_type): Static (静态), ExcelCell (单元格), WordParagraph (Word段落)。
输出示例: [{"op_type": "WordReplace", "data_source_type": "ExcelCell", "source_params": "Sheet1!A1", "target_params": "关键词"}]`
    );

    const fetchSchemes = async () => {
        try {
            const data: any = await invoke('list_automation_schemes', { projectId });
            setSchemes(data);
            if (data.length > 0 && !activeSchemeId) setActiveSchemeId(data[0].id);
        } catch (e) { console.error(e); }
    };

    const fetchInstructions = async (schemeId: string) => {
        try {
            const data: any = await invoke('list_automation_instructions', { schemeId });
            setInstructions(data);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchSchemes(); }, [projectId]);
    useEffect(() => { if (activeSchemeId) fetchInstructions(activeSchemeId); }, [activeSchemeId]);

    // 从 settings 加载联动方案相关系统提示词
    useEffect(() => {
        const loadPrompts = async () => {
            try {
                const sData: any[] = await invoke('list_settings');
                const getVal = (key: string) => sData.find(s => s.key === key)?.value?.trim();
                const opt = getVal('prompt_scheme_optimize_system');
                const gen = getVal('prompt_scheme_generate_system');
                if (opt) setOptimizeSystemPrompt(opt);
                if (gen) setGenerateSystemPrompt(gen);
            } catch {
                // ignore, keep defaults
            }
        };
        loadPrompts();
    }, []);

    const handleCreateScheme = async () => {
        const name = prompt('请输入方案名称:');
        if (!name) return;
        try {
            const id = await invoke('upsert_automation_scheme', { projectId, name });
            setActiveSchemeId(id as string);
            fetchSchemes();
        } catch (e) { alert(e); }
    };

    const handleDeleteScheme = async (id: string) => {
        if (!confirm('确定删除此方案及其所有指令吗？')) return;
        try {
            await invoke('delete_automation_scheme', { id });
            if (activeSchemeId === id) setActiveSchemeId(null);
            fetchSchemes();
        } catch (e) { alert(e); }
    };

    const handleAddInstruction = async (opType: Instruction['op_type']) => {
        if (!activeSchemeId) return;
        try {
            await invoke('upsert_automation_instruction', {
                id: null, schemeId: activeSchemeId, opType,
                dataSourceType: 'Static', sourceFilePath: null,
                sourceParams: '', targetParams: '', orderIndex: instructions.length
            });
            fetchInstructions(activeSchemeId);
        } catch (e) { alert(`添加指令失败: ${e}`); }
    };

    const localUpdate = (id: string, patch: Partial<Instruction>) =>
        setInstructions(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));

    const saveInst = async (inst: Instruction) => {
        try {
            await invoke('upsert_automation_instruction', {
                id: inst.id, schemeId: inst.scheme_id, opType: inst.op_type,
                dataSourceType: inst.data_source_type,
                sourceFilePath: inst.source_file_path || null,
                sourceParams: inst.source_params || null,
                targetParams: inst.target_params || null,
                orderIndex: inst.order_index
            });
        } catch (e) { console.error(e); }
    };

    const moveInst = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= instructions.length) return;
        const newInsts = [...instructions];
        [newInsts[index], newInsts[newIndex]] = [newInsts[newIndex], newInsts[index]];
        const updated = newInsts.map((inst, i) => ({ ...inst, order_index: i }));
        setInstructions(updated);
        for (const inst of updated) await saveInst(inst);
    };

    const handleDeleteInst = async (id: string) => {
        if (!confirm('确定删除此指令吗？')) return;
        try {
            await invoke('delete_automation_instruction', { id });
            if (activeSchemeId) fetchInstructions(activeSchemeId);
        } catch (e) { alert(`删除失败: ${e}`); }
    };

    const pickFile = async (type: 'source' | 'target') => {
        const selected = await open({ multiple: false });
        if (selected) {
            if (type === 'source') setSourceFile(selected as string);
            else setTargetFile(selected as string);
        }
    };

    const handleExecute = async () => {
        if (!activeSchemeId) { alert('请先选择一个方案'); return; }
        if (!targetFile) { alert('请先选择被修改文件'); return; }
        setIsExecuting(true);
        try {
            await invoke('execute_automation_scheme', {
                schemeId: activeSchemeId,
                sourceFilePath: sourceFile || null,
                targetFilePath: targetFile,
            });
            alert('✅ 方案执行成功！');
        } catch (e) { alert(`执行失败: ${e}`); }
        finally { setIsExecuting(false); }
    };

    const handleAIOptimize = async () => {
        if (instructions.length === 0) { alert('目前没有指令可供分析。'); return; }
        setIsOptimizing(true);
        try {
            const instListStr = instructions.map((i, idx) =>
                `${idx + 1}. [${i.op_type}] From ${i.data_source_type}(${i.source_params || 'N/A'}) -> To: ${i.target_params || 'N/A'}`
            ).join('\n');
            const req = {
                prompt: `分析以下方案指令流是否存在逻辑冲突。方案: ${activeScheme?.name}\n${instListStr}\n指出漏洞和优化建议，Markdown列表。`,
                system_prompt: optimizeSystemPrompt
            };
            const res: string = await invoke('chat_with_ai', { req: { ...req, module: 'scheme_optimize' } });
            setAiOptimization(res);
        } catch (e) { alert(`AI 分析失败: ${e}`); }
        finally { setIsOptimizing(false); }
    };

    const handleAIGenerateInstructions = async () => {
        if (!activeSchemeId || !aiAssistantInput.trim()) return;
        setIsGenerating(true);
        try {
            const req = {
                prompt: `基于以下需求生成自动化指令：\n${aiAssistantInput}`,
                system_prompt: generateSystemPrompt
            };
            
            const response: string = await invoke('chat_with_ai', { req: { ...req, module: 'scheme_generate' } });
            // 尝试提取 JSON 数组
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            const insts = JSON.parse(jsonMatch ? jsonMatch[0] : response);
            
            for (const item of insts) {
                await invoke('upsert_automation_instruction', {
                    id: null, schemeId: activeSchemeId, 
                    opType: item.op_type, dataSourceType: item.data_source_type,
                    sourceFilePath: null, sourceParams: item.source_params,
                    targetParams: item.target_params, orderIndex: instructions.length
                });
            }
            fetchInstructions(activeSchemeId);
            setAiAssistantInput('');
            setShowAiAssistant(false);
        } catch (e) {
            alert(`AI 生成失败: ${e}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const activeScheme = schemes.find(s => s.id === activeSchemeId);
    const canExecute = !!activeSchemeId && !!targetFile;

    const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

    /* ─── File Picker Row ─── */
    const FilePicker = ({
        label, icon: Icon, iconColor, value, onPick, placeholder
    }: {
        label: string; icon: any; iconColor: string;
        value: string; onPick: () => void; placeholder: string;
    }) => (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon size={10} style={{ color: iconColor }} />{label}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onPick} style={{
                    flexShrink: 0, padding: '0 12px', borderRadius: 11, height: 38,
                    border: `1.5px solid ${value ? iconColor + '60' : 'var(--border)'}`,
                    backgroundColor: value ? `${iconColor}14` : 'var(--bg-muted)',
                    color: value ? iconColor : 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
                }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = iconColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = value ? `${iconColor}60` : 'var(--border)')}
                >
                    <FolderOpen size={14} />选择文件
                </button>
                <div style={{
                    flex: 1, display: 'flex', alignItems: 'center',
                    padding: '0 12px', borderRadius: 11, height: 38,
                    border: `1.5px solid ${value ? iconColor + '40' : 'var(--border)'}`,
                    backgroundColor: value ? `${iconColor}0a` : 'var(--bg-subtle)',
                    fontSize: 12, color: value ? 'var(--text-primary)' : 'var(--text-faint)',
                    overflow: 'hidden',
                }}>
                    {value ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <CheckCircle2 size={14} style={{ color: iconColor, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 11 }}>{fileName(value)}</span>
                        </div>
                    ) : (
                        <span style={{ fontStyle: 'italic', fontSize: 11 }}>{placeholder}</span>
                    )}
                </div>
                {value && (
                    <button onClick={() => { if (label.includes('数据')) setSourceFile(''); else setTargetFile(''); }}
                        style={{ padding: '0 8px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-faint)', cursor: 'pointer', height: 38 }}>
                        <X size={13} />
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="animate-in fade-in duration-500" style={{
            display: 'flex', height: '100%', overflow: 'hidden',
            backgroundColor: 'var(--bg-surface)',
            border: '1.5px solid var(--border)', borderRadius: 24,
        }}>
            {/* ── Sidebar: Schemes ── */}
            <div style={{
                width: 200, flexShrink: 0,
                borderRight: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
                backgroundColor: 'var(--bg-raised)',
            }}>
                <div style={{ padding: '14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>方案列表</span>
                    <button onClick={handleCreateScheme} style={{ padding: 6, borderRadius: 8, border: 'none', backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Plus size={14} />
                    </button>
                </div>
                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {schemes.map(s => (
                        <div key={s.id} onClick={() => setActiveSchemeId(s.id)} style={{
                            padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 4, transition: 'all 0.2s',
                            backgroundColor: activeSchemeId === s.id ? 'var(--brand)' : 'transparent',
                            color: activeSchemeId === s.id ? '#fff' : 'var(--text-muted)',
                        }}
                            onMouseEnter={e => { if (activeSchemeId !== s.id) e.currentTarget.style.backgroundColor = 'var(--bg-subtle)'; }}
                            onMouseLeave={e => { if (activeSchemeId !== s.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <button onClick={e => { e.stopPropagation(); handleDeleteScheme(s.id); }}
                                style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.4, flexShrink: 0 }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'inherit'; e.currentTarget.style.opacity = '0.4'; }}
                            ><Trash2 size={11} /></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {activeScheme ? (
                    <>
                        {/* ── 执行面板（顶部）── */}
                        <div style={{
                            flexShrink: 0,
                            backgroundColor: 'var(--bg-raised)',
                            borderBottom: '1px solid var(--border)',
                            padding: '16px 20px',
                            display: 'flex', flexDirection: 'column', gap: 14,
                        }}>
                            {/* 标题行 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {activeScheme.name}
                                        <span style={{ fontSize: 9, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)', padding: '1px 7px', borderRadius: 4, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                            {instructions.length} 条指令
                                        </span>
                                    </h3>
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{activeScheme.description || '选择好源文件与被修改文件后，点击"立即执行"触发联动。'}</p>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    <button onClick={handleAIOptimize} disabled={isOptimizing} style={{
                                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                                        border: '1.5px solid var(--purple-subtle)', borderRadius: 10,
                                        backgroundColor: 'var(--purple-subtle)', color: 'var(--purple)',
                                        fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: isOptimizing ? 0.6 : 1,
                                    }}>
                                        {isOptimizing ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={11} />}
                                        AI 启发优化
                                    </button>
                                    <button style={{
                                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                                        border: '1.5px solid var(--border)', borderRadius: 10,
                                        backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)',
                                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                    }}><Save size={11} />保存方案</button>
                                </div>
                            </div>

                            {/* ── 文件选择区 ── */}
                            <div style={{
                                display: 'flex', gap: 14, alignItems: 'flex-end',
                                padding: '14px 16px', borderRadius: 16,
                                backgroundColor: 'var(--bg-surface)',
                                border: '1.5px solid var(--border)',
                            }}>
                                {/* 数据源文件 */}
                                <FilePicker
                                    label="数据源文件（读取来源）"
                                    icon={FolderInput}
                                    iconColor="var(--success)"
                                    value={sourceFile}
                                    onPick={() => pickFile('source')}
                                    placeholder="可选：Excel/Word 数据来源文件..."
                                />

                                {/* 箭头 */}
                                <div style={{ flexShrink: 0, paddingBottom: 6, color: 'var(--border-strong)' }}>
                                    <ArrowRight size={18} />
                                </div>

                                {/* 被修改文件 */}
                                <FilePicker
                                    label="被修改文件（写入目标）"
                                    icon={FolderOutput}
                                    iconColor="var(--brand)"
                                    value={targetFile}
                                    onPick={() => pickFile('target')}
                                    placeholder="必选：需要被修改的 Word/Excel 文件..."
                                />

                                {/* 执行按钮 */}
                                <button
                                    onClick={handleExecute}
                                    disabled={!canExecute || isExecuting}
                                    style={{
                                        flexShrink: 0, height: 38, padding: '0 22px',
                                        borderRadius: 11, border: 'none',
                                        backgroundColor: canExecute ? 'var(--brand)' : 'var(--bg-muted)',
                                        color: canExecute ? '#fff' : 'var(--text-faint)',
                                        fontSize: 13, fontWeight: 800, cursor: canExecute ? 'pointer' : 'not-allowed',
                                        display: 'flex', alignItems: 'center', gap: 7,
                                        boxShadow: canExecute ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
                                        transition: 'all 0.25s',
                                    }}
                                >
                                    {isExecuting
                                        ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                        : <Play size={15} />
                                    }
                                    {isExecuting ? '执行中...' : '立即执行'}
                                </button>
                            </div>
                        </div>

                        {/* ── 指令列表（下方）── */}
                        <div style={{
                            flexShrink: 0, padding: '8px 20px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            backgroundColor: 'var(--bg-muted)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                                    联动指令序列 · {instructions.length} 条
                                </span>
                                <button 
                                    onClick={() => setShowAiAssistant(!showAiAssistant)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                                        borderRadius: 8, border: 'none', backgroundColor: showAiAssistant ? 'var(--brand)' : 'var(--brand-subtle)',
                                        color: showAiAssistant ? '#fff' : 'var(--brand)', fontWeight: 800, fontSize: 10, cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Sparkles size={11} /> AI 助手快速策划
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {(['WordReplace', 'ExcelWrite', 'FileNameChange'] as const).map(op => {
                                    const m = opMeta[op];
                                    const Ic = m.icon;
                                    return (
                                        <button key={op} onClick={() => handleAddInstruction(op)} style={{
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            padding: '5px 12px', borderRadius: 8,
                                            border: '1.5px solid var(--border)',
                                            backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)',
                                            fontSize: 10, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                                        }}
                                            onMouseEnter={e => { e.currentTarget.style.color = m.color; e.currentTarget.style.borderColor = m.color; e.currentTarget.style.backgroundColor = m.bg; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
                                        >
                                            <Ic size={11} /><Plus size={9} />{m.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {showAiAssistant && (
                            <div className="animate-in slide-in-from-top-2" style={{ padding: '14px 20px', backgroundColor: 'var(--brand-subtle)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 6 }}><Bot size={14} /> 告诉我你想实现什么自动化替换？</div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <textarea 
                                        value={aiAssistantInput}
                                        onChange={e => setAiAssistantInput(e.target.value)}
                                        placeholder="例如：把 Excel 中的站点名替换到 Word 的标题位置..."
                                        style={{ ...inp, border: '1.5px solid var(--border)', flex: 1, resize: 'none', padding: '10px 12px' }}
                                        rows={2}
                                    />
                                    <button 
                                        onClick={handleAIGenerateInstructions}
                                        disabled={isGenerating || !aiAssistantInput.trim()}
                                        style={{
                                            padding: '0 20px', borderRadius: 12, border: 'none',
                                            backgroundColor: 'var(--brand)', color: '#fff',
                                            fontWeight: 700, fontSize: 12, cursor: (isGenerating || !aiAssistantInput.trim()) ? 'not-allowed' : 'pointer',
                                            opacity: (isGenerating || !aiAssistantInput.trim()) ? 0.6 : 1, transition: 'all 0.2s'
                                        }}
                                    >
                                        {isGenerating ? '处理中...' : '生成规则'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {instructions.map((inst, idx) => {
                                const meta = opMeta[inst.op_type];
                                const Icon = meta.icon;
                                return (
                                    <div key={inst.id} style={{
                                        backgroundColor: 'var(--bg-raised)',
                                        border: '1.5px solid var(--border)',
                                        borderRadius: 18, overflow: 'hidden',
                                        transition: 'border-color 0.2s',
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.borderColor = meta.color)}
                                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                    >
                                        {/* Card Header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '9px 16px', backgroundColor: 'var(--bg-muted)',
                                            borderBottom: '1px solid var(--border)',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }}>{idx + 1}</span>
                                                <Icon size={12} style={{ color: meta.color }} />
                                                <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-primary)' }}>{inst.op_type}</span>
                                                <span style={{ fontSize: 9, fontWeight: 700, backgroundColor: meta.bg, color: meta.color, padding: '1px 7px', borderRadius: 100 }}>{meta.label}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 2 }}>
                                                <button onClick={() => moveInst(idx, 'up')} style={{ padding: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 6 }}><ChevronUp size={13} /></button>
                                                <button onClick={() => moveInst(idx, 'down')} style={{ padding: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 6 }}><ChevronDown size={13} /></button>
                                                <button onClick={() => handleDeleteInst(inst.id)} style={{ padding: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', borderRadius: 6, marginLeft: 4 }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                                                ><Trash2 size={12} /></button>
                                            </div>
                                        </div>

                                        {/* Card Body */}
                                        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 0 }}>
                                            {/* Source */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 16 }}>
                                                <label style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Database size={8} />数据来源
                                                </label>
                                                <select value={inst.data_source_type}
                                                    onChange={e => { const u = { ...inst, data_source_type: e.target.value as any }; localUpdate(inst.id, { data_source_type: e.target.value as any }); saveInst(u); }}
                                                    style={{ ...inp, cursor: 'pointer' }}
                                                    onFocus={e => (e.target.style.borderColor = meta.color)}
                                                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                                                >
                                                    <option value="Static">固定文本</option>
                                                    <option value="ExcelCell">Excel 单元格读取</option>
                                                    <option value="WordParagraph">Word 段落搜寻</option>
                                                </select>
                                                {inst.data_source_type === 'Static' ? (
                                                    <textarea value={inst.source_params || ''}
                                                        onChange={e => localUpdate(inst.id, { source_params: e.target.value })}
                                                        onBlur={() => saveInst(inst)}
                                                        style={{ ...inp, height: 70, resize: 'none' }} placeholder="输入固定替换内容..."
                                                        onFocus={e => (e.target.style.borderColor = meta.color)}
                                                    />
                                                ) : (
                                                    <input value={inst.source_params || ''}
                                                        onChange={e => localUpdate(inst.id, { source_params: e.target.value })}
                                                        onBlur={() => saveInst(inst)}
                                                        style={{ ...inp, fontFamily: 'monospace' }}
                                                        placeholder={inst.data_source_type === 'ExcelCell' ? 'Sheet1!A1' : '输入搜寻关键词'}
                                                        onFocus={e => (e.target.style.borderColor = meta.color)}
                                                    />
                                                )}
                                            </div>

                                            {/* Arrow */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ArrowRight size={14} style={{ color: 'var(--border-strong)' }} />
                                            </div>

                                            {/* Target */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 16, borderLeft: '1px solid var(--border)' }}>
                                                <label style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Edit3 size={8} />指令目标
                                                </label>
                                                <div style={{ padding: 12, backgroundColor: meta.bg, borderRadius: 12, border: `1.5px solid ${meta.color}30`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <input value={inst.target_params || ''}
                                                        onChange={e => localUpdate(inst.id, { target_params: e.target.value })}
                                                        onBlur={() => saveInst(inst)}
                                                        placeholder={inst.op_type === 'WordReplace' ? '{{目标占位符}}' : inst.op_type === 'ExcelWrite' ? 'Sheet1!B2' : '目标文件名特征'}
                                                        style={{ ...inp, color: meta.color, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, backgroundColor: 'var(--input-bg)' }}
                                                        onFocus={e => (e.target.style.borderColor = meta.color)}
                                                    />
                                                    <p style={{ margin: 0, fontSize: 9, color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.65 }}>
                                                        {inst.op_type === 'WordReplace' ? '在被修改文档中搜寻此占位符并替换' : inst.op_type === 'ExcelWrite' ? '指定数据写入的具体单元格位置' : '输出文件名中的待替换字符串'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {instructions.length === 0 && (
                                <div style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: 18, padding: '40px 20px', color: 'var(--text-faint)', gap: 10 }}>
                                    <Plus size={36} style={{ opacity: 0.1 }} />
                                    <p style={{ margin: 0, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.3 }}>请添加至少一条联动指令</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                        <MoreVertical size={52} style={{ color: 'var(--border)', transform: 'rotate(90deg)' }} />
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-faint)', opacity: 0.4 }}>未激活任何方案</p>
                            <button onClick={handleCreateScheme} style={{ padding: '10px 26px', borderRadius: 13, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
                                + 立即创建新方案
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* AI Modal */}
            {aiOptimization && (
                <div className="animate-in fade-in duration-200" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'var(--modal-bg)', backdropFilter: 'blur(8px)' }}>
                    <div className="animate-in zoom-in-95 duration-200" style={{ width: '100%', maxWidth: 600, backgroundColor: 'var(--bg-surface)', border: '1.5px solid var(--border)', borderRadius: 26, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--purple-subtle)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ padding: 9, borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#2563eb)', color: '#fff' }}><Sparkles size={15} /></div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>流水线优化建议</h3>
                            </div>
                            <button onClick={() => setAiOptimization(null)} style={{ padding: 7, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={17} /></button>
                        </div>
                        <div className="custom-scrollbar" style={{ padding: '20px 22px', overflowY: 'auto', maxHeight: '55vh', backgroundColor: 'var(--bg-raised)' }}>
                            {aiOptimization.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 7px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, minHeight: '1em' }}>{line}</p>)}
                        </div>
                        <div style={{ padding: '13px 22px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-raised)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setAiOptimization(null)} style={{ padding: '9px 24px', borderRadius: 11, border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>知道了</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
