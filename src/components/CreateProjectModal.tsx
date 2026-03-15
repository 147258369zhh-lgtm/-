import React, { useState, useEffect } from 'react';
import { X, FolderOpen, History } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreated }) => {
    const [name, setName] = useState('');
    const [number, setNumber] = useState('');
    const [city, setCity] = useState('');
    const [type, setType] = useState('');
    const [rootPath, setRootPath] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAiProfiling, setIsAiProfiling] = useState(false);
    const [history, setHistory] = useState<{ cities: string[], types: string[] }>({ cities: [], types: [] });

    useEffect(() => {
        if (isOpen) {
            const fetch = async () => {
                try {
                    const [cities, types]: any = await invoke('get_project_meta_history');
                    setHistory({ cities, types });
                    const settings: any[] = await invoke('list_settings');
                    const dp = settings.find(s => s.key === 'default_root_path')?.value;
                    if (dp) setRootPath(dp);
                } catch (e) { console.error(e); }
            };
            fetch();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSelectPath = async () => {
        const selected = await open({ directory: true, multiple: false, title: '选择项目存储根目录' });
        if (selected) setRootPath(selected as string);
    };

    const buildProjectProfilePrompt = (commonInfo: any[], templates: string[]) => {
        const commonSummary = commonInfo.map(i => `${i.key}: ${i.value}`).join('\n');
        const templateSummary = templates.join('\n');
        return `你是通信工程项目规划专家。请根据项目基本信息与既有知识库，输出一段项目画像描述（80-160字），必须是自然中文，不要 JSON。

项目名称: ${name}
立项编号: ${number || '未填写'}
城市: ${city || '未填写'}
项目类型: ${type || '未填写'}
备注: ${remarks || '无'}

通用信息库摘要:
${commonSummary || '无'}

模板库清单:
${templateSummary || '无'}
`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !rootPath) return;
        setIsSubmitting(true);
        try {
            const project: any = await invoke('create_project', { name, number: number || null, city: city || null, projectType: type || null, rootPath, remarks: remarks || null });
            setIsAiProfiling(true);
            try {
                const [commonInfo, templates] = await Promise.all([
                    invoke('list_common_info'),
                    invoke('list_templates')
                ]);
                const structuredTemplates = (templates as any[]).map(t => {
                    if (!t.ai_structured) return `${t.name}`;
                    try {
                        const parsed = JSON.parse(t.ai_structured);
                        return `${t.name}: ${parsed.summary || ''}`;
                    } catch {
                        return `${t.name}`;
                    }
                });
                const profilePrompt = buildProjectProfilePrompt(commonInfo as any[], structuredTemplates);
                const aiProfile: string = await invoke('chat_with_ai', { req: { prompt: profilePrompt, module: 'chat' } });
                await invoke('update_project', { id: project.id, aiProfile });
            } catch (e) {
                console.warn('AI 项目画像生成失败:', e);
            } finally {
                setIsAiProfiling(false);
            }
            onCreated();
            onClose();
        } catch (error) {
            alert('创建项目失败: ' + error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '12px 16px',
        borderRadius: 12, border: '1.5px solid var(--border)',
        backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
        fontSize: 13, outline: 'none', transition: 'all 0.2s ease',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: 10, fontWeight: 900,
        color: 'var(--text-faint)', textTransform: 'uppercase',
        letterSpacing: '0.15em', marginBottom: 6,
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            backgroundColor: 'var(--modal-bg)',
            backdropFilter: 'blur(8px)',
        }} onClick={onClose}>
            <div
                className="animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 560,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 28,
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                {/* Modal Header */}
                <div style={{
                    padding: '28px 32px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    backgroundColor: 'var(--bg-raised)',
                }}>
                    <div>
                        <h2 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>启动新项目</h2>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 900 }}>New Project Initiation</p>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 6, borderRadius: 8,
                        transition: 'var(--transition)',
                    }}>
                        <X size={22} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="custom-scrollbar" style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '55vh', overflowY: 'auto' }}>
                        <div>
                            <label style={labelStyle}>项目核心名称 <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input
                                required autoFocus value={name} onChange={e => setName(e.target.value)}
                                style={inputStyle} placeholder="例如：XX县高层住宅5G深度覆盖设计"
                                onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
                                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div>
                                <label style={labelStyle}>立项编号</label>
                                <input value={number} onChange={e => setNumber(e.target.value)} style={inputStyle} placeholder="PROJ-2024-XXX"
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
                                    onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            </div>
                            <div>
                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    项目类型 {history.types.length > 0 && <History size={9} style={{ color: 'var(--brand)' }} />}
                                </label>
                                <input list="type-sugg" value={type} onChange={e => setType(e.target.value)} style={inputStyle} placeholder="选择或输入"
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
                                    onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                                <datalist id="type-sugg">{history.types.map(t => <option key={t} value={t} />)}</datalist>
                            </div>
                        </div>
                        <div>
                            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                                所属地市 {history.cities.length > 0 && <History size={9} style={{ color: 'var(--brand)' }} />}
                            </label>
                            <input list="city-sugg" value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="搜索历史地市..."
                                onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
                                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            <datalist id="city-sugg">{history.cities.map(c => <option key={c} value={c} />)}</datalist>
                        </div>
                        <div>
                            <label style={labelStyle}>物理存储根路径 <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input readOnly required value={rootPath} style={{ ...inputStyle, flex: 1, cursor: 'default', color: 'var(--text-muted)' }} placeholder="系统将在此目录下创建项目文件夹" />
                                <button type="button" onClick={handleSelectPath} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '0 16px', borderRadius: 12,
                                    border: '1.5px solid var(--border)',
                                    backgroundColor: 'var(--bg-muted)', color: 'var(--text-secondary)',
                                    fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
                                    transition: 'var(--transition)',
                                }}>
                                    <FolderOpen size={14} />选择
                                </button>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>备注说明</label>
                            <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
                                style={{ ...inputStyle, height: 80, resize: 'none', fontFamily: 'inherit' }}
                                placeholder="记录该项目的特殊情况、对接人等..."
                                onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
                                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '20px 32px',
                        borderTop: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-raised)',
                        display: 'flex', justifyContent: 'flex-end', gap: 12,
                    }}>
                        <button type="button" onClick={onClose} style={{
                            padding: '11px 24px', borderRadius: 12, border: '1.5px solid var(--border)',
                            background: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                            transition: 'var(--transition)',
                        }}>放弃</button>
                        <button type="submit" disabled={isSubmitting || !name || !rootPath} style={{
                            padding: '11px 28px', borderRadius: 12, border: 'none',
                            backgroundColor: 'var(--brand)', color: '#fff',
                            fontWeight: 700, fontSize: 13, cursor: isSubmitting ? 'wait' : 'pointer',
                            opacity: (!name || !rootPath) ? 0.4 : 1,
                            transition: 'var(--transition)',
                            boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                        }}>
                            {isSubmitting ? (isAiProfiling ? 'AI 画像生成中...' : '正在初始化...') : '确认创建并同步'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
