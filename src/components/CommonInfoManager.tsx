import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import { Database, Plus, Trash2, Save, Search, Key, X, FolderOpen, Sparkles, FileText } from 'lucide-react';

type AiStructuredData = {
    title?: string;
    summary?: string;
    key_points?: string[];
    contacts?: { name?: string; role?: string; phone?: string; email?: string }[];
    locations?: string[];
    values?: { label?: string; value?: string }[];
};

type CommonInfoRecord = {
    id: string;
    key: string;
    value: string;
    remarks?: string | null;
    info_type?: string | null;
    file_path?: string | null;
    url?: string | null;
    category?: string | null;
    ai_structured?: string | null;
};

export const CommonInfoManager: React.FC = () => {
    const [infoList, setInfoList] = useState<CommonInfoRecord[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newInfo, setNewInfo] = useState({ key: '', value: '', remarks: '', info_type: 'text', file_path: '', url: '', category: '通用' });
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('全部');
    const [activeInfo, setActiveInfo] = useState<CommonInfoRecord | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [structuredPreview, setStructuredPreview] = useState<AiStructuredData | null>(null);

    const fetchInfo = async () => {
        try {
            const data: CommonInfoRecord[] = await invoke('list_common_info');
            setInfoList(data);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        let unlisten: () => void;
        const setup = async () => {
            unlisten = await listen('tauri://drop', (event: any) => {
                if (isAdding) {
                    const paths = event.payload?.paths;
                    if (paths?.length > 0) setNewInfo(prev => (prev.info_type === 'image' || prev.info_type === 'file') ? { ...prev, file_path: paths[0], value: '已绑定文件' } : prev);
                }
            });
        };
        setup();
        return () => { if (unlisten) unlisten(); };
    }, [isAdding]);

    useEffect(() => { fetchInfo(); }, []);

    const handleSave = async () => {
        if (!newInfo.key) return;
        if (newInfo.info_type === 'text' && !newInfo.value) return;
        try {
            await invoke('update_common_info', {
                key: newInfo.key,
                value: newInfo.value,
                remarks: newInfo.remarks || null,
                infoType: newInfo.info_type,
                filePath: newInfo.file_path || null,
                url: newInfo.url || null,
                category: newInfo.category || null,
                aiStructured: null
            });
            setIsAdding(false);
            setNewInfo({ key: '', value: '', remarks: '', info_type: 'text', file_path: '', url: '', category: '通用' });
            fetchInfo();
        } catch (e) {
            alert(e);
        }
    };

    const handleSelectFile = async () => {
        const selected = await open({ multiple: false, directory: false });
        if (selected) setNewInfo({ ...newInfo, file_path: selected as string, value: '已绑定文件' });
    };

    const parseAiStructured = (raw?: string | null): AiStructuredData | null => {
        if (!raw) return null;
        try {
            return JSON.parse(raw) as AiStructuredData;
        } catch {
            return null;
        }
    };

    const extractTextFromDocx = async (path: string) => {
        const data = await readFile(path);
        const zip = new PizZip(data);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        const text = doc.getFullText();
        return text.replace(/\s+/g, ' ').trim();
    };

    const extractTextFromXlsx = async (path: string) => {
        const data = await readFile(path);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data as any);
        const chunks: string[] = [];
        workbook.eachSheet(sheet => {
            chunks.push(`Sheet: ${sheet.name}`);
            sheet.eachRow((row, rowNumber) => {
                const rowText = row.values
                    .map(v => (typeof v === 'object' && v && 'text' in v ? (v as any).text : v))
                    .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
                    .map(v => String(v).trim())
                    .join(' | ');
                if (rowText) chunks.push(`Row ${rowNumber}: ${rowText}`);
            });
        });
        return chunks.join('\n');
    };

    const extractTextFromFile = async (path: string) => {
        const lower = path.toLowerCase();
        if (lower.endsWith('.docx')) return extractTextFromDocx(path);
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return extractTextFromXlsx(path);
        if (lower.endsWith('.txt')) {
            const data = await readFile(path);
            const text = new TextDecoder('utf-8').decode(data);
            return text.replace(/\s+/g, ' ').trim();
        }
        return '';
    };

    const buildAiPrompt = (content: string, info: CommonInfoRecord) => {
        return `你是通信工程资料整理专家。请从给定资料中抽取关键结构化信息，并严格输出 JSON，不要 Markdown。

目标：用于“全局通用信息库”展示与检索。
资料标题: ${info.key}
备注: ${info.remarks || '无'}
类别: ${info.category || '通用'}

要求 JSON 格式：
{
  "title": "资料标题",
  "summary": "一句话摘要",
  "key_points": ["关键点1", "关键点2"],
  "contacts": [{"name": "", "role": "", "phone": "", "email": ""}],
  "locations": ["地点"],
  "values": [{"label": "字段", "value": "内容"}]
}

资料内容：
${content}`;
    };

    const handleAiParse = async (info: CommonInfoRecord) => {
        if (!info.file_path && info.info_type !== 'text') return;
        setIsParsing(true);
        try {
            const rawContent = info.info_type === 'text' ? info.value : await extractTextFromFile(info.file_path || '');
            if (!rawContent) {
                alert('无法解析该文件内容，请确认文件格式或内容。');
                return;
            }
            const req = { prompt: buildAiPrompt(rawContent, info), module: 'chat' };
            const response: string = await invoke('chat_with_ai', { req });
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            const structured = jsonMatch ? jsonMatch[0] : response;
            await invoke('update_common_info_structured', {
                id: info.id,
                aiStructured: structured
            });
            setStructuredPreview(parseAiStructured(structured));
            fetchInfo();
        } catch (e) {
            alert(`AI 解析失败: ${e}`);
        } finally {
            setIsParsing(false);
        }
    };

    const handleOpenDetail = (info: CommonInfoRecord) => {
        setActiveInfo(info);
        setStructuredPreview(parseAiStructured(info.ai_structured));
    };

    const handleDelete = async (id: string) => {
        if (confirm('确定删除此公共信息吗？')) { await invoke('delete_common_info', { id }); fetchInfo(); }
    };

    const filteredList = infoList.filter(i =>
        (i.key.toLowerCase().includes(searchQuery.toLowerCase()) || i.value.toLowerCase().includes(searchQuery.toLowerCase()))
        && (categoryFilter === '全部' || (i.category || '通用') === categoryFilter)
    );

    const categoryOptions = ['全部', ...Array.from(new Set(infoList.map(i => i.category || '通用')))].filter(Boolean);

    const summaryText = infoList.map(i => {
        const structured = parseAiStructured(i.ai_structured);
        return `【${i.key}】${structured?.summary || i.remarks || i.value || ''}`;
    }).filter(Boolean).join('\n');

    const inp: React.CSSProperties = {
        width: '100%', padding: '11px 14px',
        borderRadius: 10, border: '1.5px solid var(--border)',
        backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
        fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
    };

    return (
        <div className="animate-in fade-in duration-500" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 32, overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Database style={{ color: 'var(--brand)' }} size={22} />全局通用信息库
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>维护跨项目共享的变量，如常用地址、联系人、设计标准等。</p>
                </div>
                <button onClick={() => setIsAdding(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 20px', borderRadius: 12, border: 'none',
                    backgroundColor: 'var(--brand)', color: '#fff',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.3)', transition: 'var(--transition)',
                }}>
                    <Plus size={16} />新建变量
                </button>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexShrink: 0 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                    <input type="text" placeholder="搜索变量名或取值..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        style={{ ...inp, paddingLeft: 38 }}
                        onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                    style={{ ...inp, width: 160, appearance: 'none', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {categoryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>

            {/* Summary */}
            <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 14, border: '1px dashed var(--border)', backgroundColor: 'var(--bg-raised)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>全局综述</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{summaryText || '暂无综合综述，请先解析通用信息库内容。'}</div>
            </div>

            {/* Table */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 16, overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
                    {/* Table Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 4fr 4fr 1.5fr', padding: '12px 20px', backgroundColor: 'var(--table-header)', borderBottom: '1px solid var(--border)' }}>
                        {['主要字段', '关键信息', '综述', '操作'].map((h, i) => (
                            <span key={h} style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: i === 3 ? 'right' : 'left' }}>{h}</span>
                        ))}
                    </div>
                    {filteredList.length > 0 ? filteredList.map(info => {
                        const structured = parseAiStructured(info.ai_structured);
                        const keyPoints = structured?.key_points || [];
                        const values = structured?.values || [];
                        const mainFields = [
                            ...values.slice(0, 2).map(v => `${v.label || '字段'}: ${v.value || ''}`),
                            ...keyPoints.slice(0, 2)
                        ].filter(Boolean);
                        const overview = structured?.summary || info.remarks || info.value || '尚未生成综述';
                        return (
                            <div key={info.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 4fr 4fr 1.5fr', padding: '14px 20px', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', transition: 'var(--transition)' }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-raised)')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ padding: 6, backgroundColor: 'var(--brand-subtle)', borderRadius: 6 }}><Key size={12} style={{ color: 'var(--brand)' }} /></div>
                                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--brand-text)', fontWeight: 600 }}>{`{{${info.key}}}`}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{info.category || '通用'}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 16 }}>
                                    {mainFields.length > 0 ? mainFields.map((field, idx) => (
                                        <div key={idx} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{field}</div>
                                    )) : (
                                        <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>等待 AI 解析</div>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, paddingRight: 12 }}>
                                    {overview}
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                    <button onClick={() => handleOpenDetail(info)} style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
                                        详情
                                    </button>
                                    <button onClick={() => handleAiParse(info)} style={{ background: 'var(--brand-subtle)', border: '1px solid var(--brand)', cursor: 'pointer', color: 'var(--brand)', padding: '4px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
                                        {isParsing ? '处理中' : 'AI 解析'}
                                    </button>
                                    <button onClick={() => handleDelete(info.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 6, borderRadius: 6, transition: 'var(--transition)' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                                    ><Trash2 size={14} /></button>
                                </div>
                            </div>
                        );
                    }) : (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-faint)', fontStyle: 'italic' }}>尚未配置通用变量</div>
                    )}
                </div>
            </div>

            {/* Add Modal */}
            {isAdding && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'var(--modal-bg)', backdropFilter: 'blur(8px)' }}>
                    <div className="animate-in zoom-in-95 duration-200" style={{
                        width: '100%', maxWidth: 500,
                        backgroundColor: 'var(--bg-surface)', border: '1.5px solid var(--border)',
                        borderRadius: 24, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
                    }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-raised)' }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>配置全局变量</h3>
                            <button onClick={() => setIsAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                                    <Key size={10} />变量名 (Key)
                                </label>
                                <input value={newInfo.key} onChange={e => setNewInfo({ ...newInfo, key: e.target.value })} style={inp} placeholder="例如: 设计负责人"
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            </div>
                            <div>
                                <label style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'block' }}>变量类型</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {['text', 'image', 'file', 'link'].map(t => (
                                        <button key={t}
                                            onClick={() => setNewInfo({ ...newInfo, info_type: t, value: '', file_path: '', url: '' })}
                                            style={{
                                                flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'var(--transition)',
                                                border: `1.5px solid ${newInfo.info_type === t ? 'var(--brand)' : 'var(--border)'}`,
                                                backgroundColor: newInfo.info_type === t ? 'var(--brand-subtle)' : 'var(--bg-raised)',
                                                color: newInfo.info_type === t ? 'var(--brand)' : 'var(--text-muted)',
                                            }}
                                        >
                                            {t === 'text' ? '纯文本' : t === 'image' ? '图片' : t === 'file' ? '文件' : '链接'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'block' }}>归档类别</label>
                                <input value={newInfo.category} onChange={e => setNewInfo({ ...newInfo, category: e.target.value })}
                                    style={inp} placeholder="例如：合同 / 设计标准 / 造价 / 供应商"
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            </div>
                            {newInfo.info_type === 'text' && (
                                <textarea value={newInfo.value} onChange={e => setNewInfo({ ...newInfo, value: e.target.value })}
                                    style={{ ...inp, height: 80, resize: 'none', fontFamily: 'inherit' }} placeholder="输入该变量对应的实际文字内容..."
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            )}
                            {(newInfo.info_type === 'image' || newInfo.info_type === 'file') && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input readOnly value={newInfo.file_path} style={{ ...inp, flex: 1 }} placeholder="请选择文件..." />
                                    <button onClick={handleSelectFile} style={{ padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-muted)', color: 'var(--text-secondary)', cursor: 'pointer' }}><FolderOpen size={16} /></button>
                                </div>
                            )}
                            {newInfo.info_type === 'link' && (
                                <input value={newInfo.url} onChange={e => setNewInfo({ ...newInfo, url: e.target.value, value: '已绑定链接' })}
                                    style={inp} placeholder="例如: https://example.com"
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            )}
                            <input value={newInfo.remarks} onChange={e => setNewInfo({ ...newInfo, remarks: e.target.value })}
                                style={inp} placeholder="简短记录该变量的使用场合（可选）..."
                                onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                        </div>
                        <div style={{ padding: '16px 24px', backgroundColor: 'var(--bg-raised)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button onClick={() => setIsAdding(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>放弃</button>
                            <button onClick={handleSave} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '10px 20px', borderRadius: 10, border: 'none',
                                backgroundColor: 'var(--brand)', color: '#fff',
                                fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                            }}>
                                <Save size={15} />立即生效
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeInfo && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'var(--modal-bg)', backdropFilter: 'blur(8px)' }}>
                    <div style={{ width: '100%', maxWidth: 720, backgroundColor: 'var(--bg-surface)', border: '1.5px solid var(--border)', borderRadius: 24, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-raised)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FileText size={18} style={{ color: 'var(--brand)' }} />
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{activeInfo.key}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeInfo.category || '通用'}</div>
                                </div>
                            </div>
                            <button onClick={() => setActiveInfo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <div className="custom-scrollbar" style={{ padding: 20, maxHeight: '65vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <section style={{ padding: 16, borderRadius: 16, backgroundColor: 'var(--popover-bg)', border: '1px solid var(--popover-border)', boxShadow: 'var(--popover-shadow)' }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>原始摘要</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{activeInfo.value}</div>
                            </section>
                            <section style={{ padding: 16, borderRadius: 16, backgroundColor: 'var(--popover-bg)', border: '1px solid var(--popover-border)', boxShadow: 'var(--popover-shadow)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>AI 结构化结果</div>
                                    <button onClick={() => handleAiParse(activeInfo)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, border: '1px solid var(--brand)', backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)', fontSize: 11, fontWeight: 700 }}>
                                        <Sparkles size={12} />{isParsing ? '解析中...' : '重新解析'}
                                    </button>
                                </div>
                                {structuredPreview ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {structuredPreview.summary && (
                                            <div style={{ padding: '10px 12px', backgroundColor: 'var(--popover-bg)', borderRadius: 10, border: '1px solid var(--popover-border)', boxShadow: 'var(--popover-shadow)', fontSize: 12, color: 'var(--text-secondary)' }}>{structuredPreview.summary}</div>
                                        )}
                                        {structuredPreview.key_points && structuredPreview.key_points.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', marginBottom: 6 }}>关键点</div>
                                                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                    {structuredPreview.key_points.map((p, i) => <li key={i}>{p}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                        {structuredPreview.values && structuredPreview.values.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', marginBottom: 6 }}>字段/数值</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                    {structuredPreview.values.map((v, i) => (
                                                        <div key={i} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-muted)' }}>
                                                            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)' }}>{v.label}</div>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{v.value}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {structuredPreview.contacts && structuredPreview.contacts.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', marginBottom: 6 }}>联系人</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {structuredPreview.contacts.map((c, i) => (
                                                        <div key={i} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-muted)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                                            <div>{c.name || '未知'} {c.role ? `· ${c.role}` : ''}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.phone || ''} {c.email ? `· ${c.email}` : ''}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>尚未生成 AI 结构化内容</div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
