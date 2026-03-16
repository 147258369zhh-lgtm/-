import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { SchemeEditor } from './SchemeEditor';
import {
    ArrowLeft, File, ClipboardCheck, Zap, Info, LayoutList,
    ExternalLink, Trash2, Play, FileVideo, Plus, Sparkles, Loader2, FileText, X
} from 'lucide-react';
import { ProjectDetails } from './ProjectDetails';
import { FileAutomationEngine } from '../utils/FileAutomationEngine';
import { readFile } from '@tauri-apps/plugin-fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ExcelJS from 'exceljs';

const inp: React.CSSProperties = {
    width: '100%', padding: '12px 16px',
    border: '1.5px solid var(--border)',
    borderRadius: 14, backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
    transition: 'border-color 0.2s', boxSizing: 'border-box',
    fontFamily: 'inherit',
};

export const ProjectWorkspace: React.FC = () => {
    const { activeProject, setActiveProject, setProjects } = useStore();
    const [currentView, setCurrentView] = useState('details');
    const [files, setFiles] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [fileSearch, setFileSearch] = useState('');
    const [fileCategoryFilter, setFileCategoryFilter] = useState('全部');
    const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);

    const [templates, setTemplates] = useState<any[]>([]);
    const [isImportTemplateModalOpen, setIsImportTemplateModalOpen] = useState(false);

    const [surveyData, setSurveyData] = useState<any>({ date: '', location: '', surveyor: '', summary: '' });
    const [surveyMedia, setSurveyMedia] = useState<any[]>([]);
    const [isSavingSurvey, setIsSavingSurvey] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [isSurveyStructuring, setIsSurveyStructuring] = useState(false);
    const [surveyStructured, setSurveyStructured] = useState<any | null>(null);
    const [surveySystemPrompt, setSurveySystemPrompt] = useState("你是国家级通信工程勘察设计专家。直接输出最终的勘察综述段落，不需要任何多余的寒暄或解释。");
    const [fileAnalysisPrompt, setFileAnalysisPrompt] = useState("你是通信工程项目资料分析专家。请根据文件内容提炼关键信息，输出 JSON。");

    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editInfo, setEditInfo] = useState<any>({});
    const [isSavingInfo, setIsSavingInfo] = useState(false);

    const fetchFiles = async () => {
        if (!activeProject) return;
        try {
            const data: any = await invoke('list_project_files', { projectId: activeProject.id });
            setFiles(data);
        } catch (error) { console.error(error); }
    };

    const fileCategoryOptions = useMemo(() => ['全部', ...Array.from(new Set(files.map(f => f.category || '未分类')))].filter(Boolean), [files]);
    const filteredFiles = useMemo(() => files.filter(file => {
        const matchText = `${file.name} ${file.ai_summary || ''}`.toLowerCase();
        const searchMatch = matchText.includes(fileSearch.toLowerCase());
        const categoryMatch = fileCategoryFilter === '全部' || (file.category || '未分类') === fileCategoryFilter;
        return searchMatch && categoryMatch;
    }), [files, fileSearch, fileCategoryFilter]);

    const fetchSurvey = async () => {
        if (!activeProject) return;
        try {
            const data: any = await invoke('get_survey', { projectId: activeProject.id });
            setSurveyData({ date: data.date || '', location: data.location || '', surveyor: data.surveyor || '', summary: data.summary || '' });
            setSurveyStructured(data.ai_structured ? parseSurveyStructured(data.ai_structured) : null);
            const media: any = await invoke('list_survey_media', { projectId: activeProject.id });
            setSurveyMedia(media);
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        if (activeProject) {
            fetchFiles();
            if (currentView === 'survey') fetchSurvey();
            setEditInfo({ ...activeProject });
        }
    }, [activeProject, currentView]);

    // 读取勘察综述的自定义系统提示词
    useEffect(() => {
        const loadPrompt = async () => {
            try {
                const sData: any[] = await invoke('list_settings');
                const val = sData.find(s => s.key === 'prompt_survey_summary_system')?.value;
                if (val && val.trim()) setSurveySystemPrompt(val);
                const filePrompt = sData.find(s => s.key === 'prompt_file_analysis_system')?.value;
                if (filePrompt && filePrompt.trim()) setFileAnalysisPrompt(filePrompt);
            } catch {
                // ignore
            }
        };
        loadPrompt();
    }, []);

    if (!activeProject) return null;

    const handleImportFile = async () => {
        setIsImporting(true);
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                multiple: true,
                title: '导入项目文件',
                filters: [
                    { name: '文档与图纸', extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'wps', 'et', 'dps', 'pdf', 'dwg', 'vsd', 'vsdx', 'txt'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });
            if (selected && Array.isArray(selected)) {
                // 批量导入
                await invoke('import_files', {
                    projectId: activeProject.id,
                    sourcePaths: selected,
                    category: '外来文档',
                    stage: activeProject.stage
                });
                fetchFiles();
                await handleAnalyzeFiles(selected);
            } else if (selected && typeof selected === 'string') {
                // 单个文件（降级兼容）
                await invoke('import_files', {
                    projectId: activeProject.id,
                    sourcePaths: [selected],
                    category: '外来文档',
                    stage: activeProject.stage
                });
                fetchFiles();
                await handleAnalyzeFiles([selected]);
            }
        } catch (error) {
            alert(`导入失败: ${error}`);
        } finally {
            setIsImporting(false);
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

    const buildFileAnalysisPrompt = (content: string, fileName: string) => {
        return `你是通信工程项目资料分析专家。请根据文件内容提炼关键信息，并严格输出 JSON，不要 Markdown。

项目: ${activeProject?.name}
文件名: ${fileName}
项目阶段: ${activeProject?.stage}

输出 JSON 格式：
{
  "file_summary": "文件一句话摘要",
  "suggested_category": "文件分类建议",
  "suggested_stage": "文件阶段建议",
  "project_profile": {
    "location": "项目地点或地市",
    "scale": "建设规模或范围",
    "keywords": ["关键词1", "关键词2"],
    "notes": "对设计说明/预算/勘察有帮助的提炼"
  }
}

文件内容：
${content}`;
    };

    const parseSurveyStructured = (raw?: string | null) => {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    const buildSurveyStructurePrompt = () => {
        return `你是通信工程现场勘察记录整理专家。请根据勘察信息输出结构化 JSON，不要 Markdown。

项目: ${activeProject?.name}
勘察日期: ${surveyData.date || '未记录'}
勘察地点: ${surveyData.location || '未记录'}
勘察人员: ${surveyData.surveyor || '未记录'}
综述: ${surveyData.summary || '未填写'}

输出 JSON 格式：
{
  "summary": "一句话综述",
  "key_points": ["关键点1", "关键点2"],
  "risks": ["风险1", "风险2"],
  "environment": "现场环境要点",
  "recommendations": ["建议1", "建议2"],
  "equipment": ["设备/资源"],
  "photos": "如有照片请描述重点"
}
`;
    };

    const handleStructureSurvey = async () => {
        if (!activeProject) return;
        setIsSurveyStructuring(true);
        try {
            const req = { prompt: buildSurveyStructurePrompt(), system_prompt: surveySystemPrompt, module: 'survey_summary' };
            const response: string = await invoke('chat_with_ai', { req });
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            const structured = jsonMatch ? jsonMatch[0] : response;
            await invoke('update_survey', { projectId: activeProject.id, ...surveyData, aiStructured: structured });
            setSurveyStructured(parseSurveyStructured(structured));
        } catch (e) {
            alert(`结构化失败: ${e}`);
        } finally {
            setIsSurveyStructuring(false);
        }
    };

    const handleAnalyzeFiles = async (paths: string[]) => {
        if (!activeProject || paths.length === 0) return;
        setIsAnalyzing(true);
        try {
            const files: any[] = await invoke('list_project_files', { projectId: activeProject.id });
            for (const path of paths) {
                const fileName = path.split(/[\\/]/).pop() || path;
                const record = files.find(f => f.name === fileName && f.is_latest);
                if (!record) continue;
                const content = await extractTextFromFile(path);
                if (!content) continue;

                const req = { prompt: buildFileAnalysisPrompt(content, fileName), system_prompt: fileAnalysisPrompt, module: 'chat' };
                const response: string = await invoke('chat_with_ai', { req });
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const rawJson = jsonMatch ? jsonMatch[0] : response;
                let parsed: any = null;
                try {
                    parsed = JSON.parse(rawJson);
                } catch {
                    parsed = null;
                }

                const summary = parsed?.file_summary || rawJson;
                await invoke('update_file_metadata', {
                    id: record.id,
                    aiSummary: summary,
                    category: parsed?.suggested_category || record.category,
                    stage: parsed?.suggested_stage || record.stage
                });

                if (parsed?.project_profile) {
                    const profileText = `地点: ${parsed.project_profile.location || '未知'}\n规模: ${parsed.project_profile.scale || '未提取'}\n关键词: ${(parsed.project_profile.keywords || []).join('、')}\n备注: ${parsed.project_profile.notes || ''}`.trim();
                    await invoke('update_project', {
                        id: activeProject.id,
                        aiProfile: profileText
                    });
                }
            }

            const updatedProjects: any = await invoke('list_projects');
            setProjects(updatedProjects);
            const newActive = updatedProjects.find((p: any) => p.id === activeProject.id);
            if (newActive) setActiveProject(newActive);
            fetchFiles();
        } catch (e) {
            alert(`AI 分析失败: ${e}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const analyzeTemplateFile = async (tpl: any) => {
        if (tpl.ai_structured) {
            try {
                return JSON.parse(tpl.ai_structured);
            } catch {
                // ignore
            }
        }
        if (!tpl.source_file_path) return null;
        const content = await extractTextFromFile(tpl.source_file_path);
        if (!content) return null;
        const prompt = `你是通信工程模板解析助手。请从模板内容中提取可替换的关键字段与用途说明，输出 JSON，不要 Markdown。

模板名称: ${tpl.name}
输出 JSON 格式：
{
  "summary": "模板用途摘要",
  "placeholders": ["字段1", "字段2"],
  "category": "模板分类建议",
  "stage": "建议阶段"
}

模板内容：
${content}`;
        const response: string = await invoke('chat_with_ai', { req: { prompt, module: 'chat' } });
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            return null;
        }
    };

    const handleImportTemplatesIntoProject = async () => {
        if (!activeProject) return;
        setIsImporting(true);
        try {
            const templates: any[] = await invoke('list_templates');
            if (templates.length === 0) {
                alert('模板库为空，请先在模板库管理中导入模板。');
                return;
            }

            for (const tpl of templates) {
                if (!tpl.source_file_path) continue;
                const analysis = await analyzeTemplateFile(tpl);
                const fileName = `${tpl.name}_${activeProject.name}.docx`;
                const fillData = { ...activeProject };
                const result = await FileAutomationEngine.fillWord(tpl.source_file_path, fillData, activeProject.path, fileName, '输出成果');

                if (analysis) {
                    await invoke('update_project', {
                        id: activeProject.id,
                        aiProfile: `${activeProject.ai_profile || ''}\n模板: ${tpl.name} -> ${analysis.summary || ''}`.trim()
                    });
                }

                if (result.success) {
                    await invoke('import_files', {
                        projectId: activeProject.id,
                        sourcePaths: [result.outputPath],
                        category: analysis?.category || tpl.label || '输出成果',
                        stage: analysis?.stage || tpl.stage || activeProject.stage
                    });
                }
            }

            fetchFiles();
        } catch (e) {
            alert(`模板导入失败: ${e}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleOpenImportTemplate = async () => {
        try {
            const data: any = await invoke('list_templates');
            setTemplates(data);
            setIsImportTemplateModalOpen(true);
        } catch(e) { console.error(e); }
    };

    const handleImportTemplate = async (tpl: any) => {
        if (!tpl.source_file_path) {
            alert('该模板尚未绑定源文件');
            return;
        }
        setIsImporting(true);
        try {
            await invoke('import_files', {
                projectId: activeProject.id,
                sourcePaths: [tpl.source_file_path],
                category: tpl.label || '模板文件',
                stage: tpl.stage || activeProject.stage
            });
            fetchFiles();
            setIsImportTemplateModalOpen(false);
        } catch(e) {
            alert(`导入失败: ${e}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleUpdateInfo = async () => {
        setIsSavingInfo(true);
        try {
            await invoke('update_project', { id: activeProject.id, name: editInfo.name, number: editInfo.number, city: editInfo.city, projectType: editInfo.project_type, remarks: editInfo.remarks, aiProfile: editInfo.ai_profile });
            const updatedProjects: any = await invoke('list_projects');
            setProjects(updatedProjects);
            const newActive = updatedProjects.find((p: any) => p.id === activeProject.id);
            if (newActive) setActiveProject(newActive);
            setIsEditingInfo(false);
            alert('项目信息已更新');
        } catch (e) { alert(e); } finally { setIsSavingInfo(false); }
    };

    const handleUploadMedia = async () => { /* implementation */ };

    const handleAIGenerateSummary = async () => {
        setIsGeneratingSummary(true);
        try {
            const mediaInfo = surveyMedia.length > 0 ? `附带收集了${surveyMedia.length}个多媒体文件。` : '无多媒体资料。';
            const prompt = `请帮我自动生成一份《现场勘察情况综述》。\n项目：${activeProject?.name}\n勘察日期：${surveyData.date || '未记录'}\n勘察地点：${surveyData.location || '未记录'}\n参与人员：${surveyData.surveyor || '未记录'}\n素材：${mediaInfo}\n\n要求：采用专业严谨的通信工程勘察术语，生成200字可直接用于正式报告的正文。`;
            const req = { prompt, system_prompt: surveySystemPrompt, module: 'survey_summary' };
            const res: string = await invoke('chat_with_ai', { req });
            setSurveyData((prev: any) => ({ ...prev, summary: res }));
        } catch (e) { alert(`生成失败: ${e}`); }
        finally { setIsGeneratingSummary(false); }
    };

    const TABS = [
        { id: 'details', label: '项目详情', icon: LayoutList },
        { id: 'files', label: '项目文件', icon: File },
        { id: 'survey', label: '勘察记录', icon: ClipboardCheck },
        { id: 'automation', label: '联动方案', icon: Zap },
        { id: 'info', label: '基础信息', icon: Info },
    ];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}
            className="animate-in slide-in-from-right duration-300">

            {/* Header */}
            <div style={{
                height: 56, flexShrink: 0,
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px', backgroundColor: 'var(--bg-raised)',
            }}>
                {/* Left */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setActiveProject(null)} style={{
                        padding: 8, borderRadius: 10, border: 'none',
                        backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s',
                    }}><ArrowLeft size={18} /></button>
                    <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{activeProject.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <span style={{
                                fontSize: 9, backgroundColor: 'var(--brand)', color: '#fff',
                                padding: '1px 8px', borderRadius: 100, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                            }}>{activeProject.stage} 阶段</span>
                            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', fontWeight: 700 }}>#{activeProject.number || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {/* Tab Nav */}
                <nav style={{
                    display: 'flex', gap: 4, padding: 6,
                    backgroundColor: 'var(--bg-muted)',
                    borderRadius: 16, border: '1px solid var(--border)',
                }}>
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setCurrentView(tab.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 16px', borderRadius: 12,
                            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                            transition: 'all 0.2s',
                            backgroundColor: currentView === tab.id ? 'var(--bg-surface)' : 'transparent',
                            color: currentView === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                            boxShadow: currentView === tab.id ? 'var(--shadow-sm)' : 'none',
                        }}>
                            <tab.icon size={13} />{tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* ── 项目详情 (AI 综述) ── */}
                {currentView === 'details' && <ProjectDetails />}

                {/* ── 项目文件 ── */}
                {currentView === 'files' && (
                    <div className="animate-in fade-in duration-500" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <File style={{ color: 'var(--brand)' }} size={20} />全量文件库
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, backgroundColor: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{filteredFiles.length}/{files.length}</span>
                            </h3>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={handleOpenImportTemplate} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '9px 16px', backgroundColor: 'var(--bg-muted)', color: 'var(--text-secondary)',
                                    border: '1.5px solid var(--border)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}><FileText size={16} />从全局模板导入</button>
                                <button onClick={handleImportFile} disabled={isImporting || isAnalyzing} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '9px 20px', backgroundColor: 'var(--brand)', color: '#fff',
                                    border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(37,99,235,0.3)', opacity: isImporting || isAnalyzing ? 0.7 : 1
                                }}><Plus size={16} />{isImporting ? '导入中...' : isAnalyzing ? '分析中...' : '本地导入'}</button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                                <input value={fileSearch} onChange={e => setFileSearch(e.target.value)} placeholder="搜索文件名或 AI 摘要..." style={{ ...inp, paddingLeft: 38, boxShadow: '0 6px 18px rgba(15,23,42,0.08)' }}
                                    onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            </div>
                            <div style={{ position: 'relative' }}>
                                <select value={fileCategoryFilter} onChange={e => setFileCategoryFilter(e.target.value)}
                                    style={{ ...inp, width: 180, appearance: 'none', fontWeight: 700, color: 'var(--text-secondary)', boxShadow: '0 6px 18px rgba(15,23,42,0.08)' }}>
                                    {fileCategoryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-faint)' }}>▼</span>
                            </div>
                        </div>
                        <div className="custom-scrollbar" style={{
                            flex: 1, overflowY: 'auto',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1.5px solid var(--border)', borderRadius: 20,
                        }}>
                            {files.length > 0 ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--table-header)' }}>
                                            {['文件名', '属性标记', '版本链', '管理'].map((h, i) => (
                                                <th key={h} style={{
                                                    padding: '14px 20px', textAlign: i === 3 ? 'right' : 'left',
                                                    fontSize: 10, fontWeight: 900, color: 'var(--text-faint)',
                                                    textTransform: 'uppercase', letterSpacing: '0.1em',
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFiles.map(file => (
                                            <tr key={file.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s, box-shadow 0.2s', position: 'relative' }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                                                    e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(59,130,246,0.15)';
                                                    setHoveredFileId(file.id);
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                    setHoveredFileId(null);
                                                }}>
                                                <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', position: 'relative' }}>
                                                    {file.name}
                                                    {hoveredFileId === file.id && file.ai_summary && (
                                                        <div style={{ position: 'absolute', left: 20, top: '100%', marginTop: 8, padding: '10px 12px', maxWidth: 280, backgroundColor: 'var(--popover-bg)', border: '1px solid var(--popover-border)', borderRadius: 12, boxShadow: 'var(--popover-shadow)', fontSize: 11, color: 'var(--text-secondary)', zIndex: 10 }}>
                                                            <div style={{ position: 'absolute', top: -5, left: 18, width: 10, height: 10, backgroundColor: 'var(--popover-bg)', borderLeft: '1px solid var(--popover-border)', borderTop: '1px solid var(--popover-border)', transform: 'rotate(45deg)' }} />
                                                            <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>AI 摘要</div>
                                                            <div style={{ lineHeight: 1.6 }}>{file.ai_summary}</div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '14px 20px' }}>
                                                    <span style={{ fontSize: 10, backgroundColor: 'var(--bg-muted)', border: '1px solid var(--border)', padding: '3px 9px', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 700, marginRight: 6 }}>{file.category}</span>
                                                    <span style={{ fontSize: 10, backgroundColor: 'var(--brand-subtle)', border: '1px solid rgba(59,130,246,0.2)', padding: '3px 9px', borderRadius: 8, color: 'var(--brand-text)', fontWeight: 700 }}>{file.stage}</span>
                                                </td>
                                                <td style={{ padding: '14px 20px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 700 }}>v{file.version}</td>
                                                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                                        <button title="打开文件" style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer', boxShadow: '0 4px 10px rgba(15,23,42,0.08)', transition: 'transform 0.15s ease' }}
                                                            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                                                            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                                                        ><ExternalLink size={15} /></button>
                                                        <button title="移入回收站" style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer', boxShadow: '0 4px 10px rgba(15,23,42,0.08)', transition: 'transform 0.15s ease' }}
                                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                                        ><Trash2 size={15} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ padding: '28px 32px', borderRadius: 18, border: '1.5px dashed var(--border)', backgroundColor: 'var(--bg-raised)', color: 'var(--text-faint)', fontStyle: 'italic', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>暂无文件</div>
                                        <div>请点击右上角「本地导入」开始建立项目资料库</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── 勘察记录 ── */}
                {currentView === 'survey' && (
                    <div className="custom-scrollbar animate-in fade-in duration-500" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
                            {/* Section Header */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '24px 28px', borderRadius: 24,
                                backgroundColor: 'var(--bg-raised)', border: '1.5px solid var(--border)',
                            }}>
                                <div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>现场勘察记录表</h3>
                                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>数据将自动提取并填入方案占位符。</p>
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button onClick={handleStructureSurvey} disabled={isSurveyStructuring}
                                        style={{ padding: '9px 18px', borderRadius: 14, border: '1px solid var(--brand)', backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                                        {isSurveyStructuring ? '结构化中...' : 'AI 结构化'}
                                    </button>
                                    <button onClick={async () => { setIsSavingSurvey(true); await invoke('update_survey', { projectId: activeProject.id, ...surveyData }); setIsSavingSurvey(false); alert('保存成功'); }} disabled={isSavingSurvey}
                                        style={{ padding: '11px 24px', borderRadius: 14, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
                                        {isSavingSurvey ? '同步中...' : '保存并同步方案'}
                                    </button>
                                </div>
                            </div>

                            {/* Form Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                <div style={{ padding: '28px', borderRadius: 24, backgroundColor: 'var(--bg-raised)', border: '1.5px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>勘察日期</label>
                                        <input type="date" value={surveyData.date} onChange={e => setSurveyData({ ...surveyData, date: e.target.value })} style={inp}
                                            onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>勘察人员</label>
                                        <input value={surveyData.surveyor} onChange={e => setSurveyData({ ...surveyData, surveyor: e.target.value })} style={inp} placeholder="输入姓名"
                                            onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>勘察地点</label>
                                        <input value={surveyData.location} onChange={e => setSurveyData({ ...surveyData, location: e.target.value })} style={inp} placeholder="输入详细地址、基站名称或经纬度"
                                            onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <label style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>情况综述</label>
                                            <button type="button" onClick={handleAIGenerateSummary} disabled={isGeneratingSummary} style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                padding: '4px 12px', borderRadius: 8,
                                                border: '1px solid var(--brand-subtle)',
                                                backgroundColor: 'var(--brand-subtle)', color: 'var(--brand-text)',
                                                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                            }}>
                                                {isGeneratingSummary ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={11} />}
                                                {isGeneratingSummary ? 'AI 创作中...' : 'AI 智能生成'}
                                            </button>
                                        </div>
                                        <textarea value={surveyData.summary} onChange={e => setSurveyData({ ...surveyData, summary: e.target.value })}
                                            style={{ ...inp, height: 160, resize: 'vertical' }} placeholder="详细描述现场环境、特殊安装要求、电力引入方案等..."
                                            onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                                    </div>
                                </div>
                                <div style={{ padding: '24px', borderRadius: 24, backgroundColor: 'var(--popover-bg)', border: '1.5px solid var(--popover-border)', boxShadow: 'var(--popover-shadow)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>AI 结构化摘要</div>
                                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{surveyStructured ? '已生成' : '未生成'}</span>
                                    </div>
                                    {surveyStructured ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            <div><strong>综述：</strong>{surveyStructured.summary || '—'}</div>
                                            <div><strong>关键点：</strong>{(surveyStructured.key_points || []).join('、') || '—'}</div>
                                            <div><strong>风险：</strong>{(surveyStructured.risks || []).join('、') || '—'}</div>
                                            <div><strong>环境：</strong>{surveyStructured.environment || '—'}</div>
                                            <div><strong>建议：</strong>{(surveyStructured.recommendations || []).join('、') || '—'}</div>
                                            <div><strong>设备：</strong>{(surveyStructured.equipment || []).join('、') || '—'}</div>
                                            <div><strong>照片要点：</strong>{surveyStructured.photos || '—'}</div>
                                        </div>
                                    ) : (
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontStyle: 'italic' }}>点击上方“AI 结构化”生成摘要</div>
                                    )}
                                </div>
                            </div>

                            {/* Media */}
                            <div style={{ padding: '28px', borderRadius: 24, backgroundColor: 'var(--bg-raised)', border: '1.5px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>现场原始媒体库</h4>
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>支持 jpg, png, mp4 格式。</p>
                                    </div>
                                    <button onClick={handleUploadMedia} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '9px 18px', borderRadius: 12,
                                        border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-surface)',
                                        color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    }}><Plus size={15} />批量添加媒体</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                                    {surveyMedia.map(m => (
                                        <div key={m.id} style={{ aspectRatio: '1', backgroundColor: 'var(--bg-muted)', borderRadius: 14, overflow: 'hidden', border: '1.5px solid var(--border)', position: 'relative' }}>
                                            {m.media_type === 'image'
                                                ? <img src={`https://asset.localhost/${m.path}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}><FileVideo size={32} /></div>}
                                        </div>
                                    ))}
                                    {surveyMedia.length === 0 && (
                                        <div style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center', color: 'var(--text-faint)', fontStyle: 'italic', border: '2px dashed var(--border)', borderRadius: 16 }}>暂无媒体记录</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── 基础信息 ── */}
                {currentView === 'info' && (
                    <div className="custom-scrollbar animate-in fade-in duration-500" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: 700, margin: '0 auto', paddingBottom: 40 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>项目元数据</h3>
                                <button onClick={() => setIsEditingInfo(!isEditingInfo)} style={{
                                    padding: '8px 18px', borderRadius: 12, border: '1.5px solid var(--border)',
                                    backgroundColor: isEditingInfo ? 'var(--danger-subtle)' : 'var(--bg-muted)',
                                    color: isEditingInfo ? 'var(--danger)' : 'var(--text-muted)',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}>{isEditingInfo ? '放弃修改' : '修正资料'}</button>
                            </div>
                            <div style={{ border: '1.5px solid var(--border)', borderRadius: 22, overflow: 'hidden', backgroundColor: 'var(--bg-raised)' }}>
                                {[
                                    { l: '项目全称', k: 'name' }, { l: '官方编号', k: 'number' },
                                    { l: '所属地市', k: 'city' }, { l: '业务分类', k: 'project_type' }, { l: '备注说明', k: 'remarks' }
                                ].map((item, idx) => (
                                    <div key={item.k} style={{
                                        display: 'grid', gridTemplateColumns: '160px 1fr',
                                        padding: '18px 24px', alignItems: 'center',
                                        borderBottom: idx < 4 ? '1px solid var(--border-subtle)' : 'none',
                                    }}>
                                        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.l}</span>
                                        {isEditingInfo
                                            ? <input value={editInfo[item.k] || ''} onChange={e => setEditInfo({ ...editInfo, [item.k]: e.target.value })} style={inp}
                                                onFocus={e => (e.target.style.borderColor = 'var(--brand)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                                            : <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{activeProject[item.k as keyof typeof activeProject] || '—'}</span>
                                        }
                                    </div>
                                ))}
                            </div>
                            {isEditingInfo && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                                    <button onClick={handleUpdateInfo} disabled={isSavingInfo} style={{
                                        padding: '12px 32px', borderRadius: 14, border: 'none',
                                        backgroundColor: 'var(--brand)', color: '#fff',
                                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                        boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                                    }}>{isSavingInfo ? '同步中...' : '保存并更新全局索引'}</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── 联动方案 ── */}
                {currentView === 'automation' && (
                    <div className="animate-in fade-in duration-500" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    联动方案枢纽 <Zap style={{ color: 'var(--brand)' }} size={20} />
                                </h3>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>编排多指令流水线，一键驱动 Word/Excel/文件名 全方位联动。</p>
                            </div>
                            <button style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '11px 24px', borderRadius: 14, border: 'none',
                                backgroundColor: 'var(--brand)', color: '#fff',
                                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                            }}><Play size={16} />立即执行当前方案</button>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <SchemeEditor projectId={activeProject.id} />
                        </div>
                    </div>
                )}

            </div>

            {/* Template Import Modal */}
            {isImportTemplateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'var(--modal-bg)', backdropFilter: 'blur(8px)' }}>
                    <div className="animate-in zoom-in-95 duration-200" style={{
                        width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                        backgroundColor: 'var(--bg-surface)', border: '1.5px solid var(--border)',
                        borderRadius: 24, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
                    }}>
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-raised)' }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>从模板库导入</h3>
                            <button onClick={() => setIsImportTemplateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
                        </div>
                        <div className="custom-scrollbar" style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {templates.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '20px 0', fontStyle: 'italic' }}>模板库为空，请先在左侧菜单“全案模板”中添加</div>
                            ) : (
                                templates.map(tpl => (
                                    <div key={tpl.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: 16, borderRadius: 16, border: '1.5px solid var(--border)',
                                        backgroundColor: 'var(--bg-muted)', transition: 'border-color 0.2s'
                                    }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{tpl.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tpl.stage} • {tpl.label || '通用'}</div>
                                        </div>
                                        <button onClick={() => handleImportTemplate(tpl)} disabled={isImporting} style={{
                                            padding: '8px 16px', borderRadius: 10, border: 'none',
                                            backgroundColor: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                            opacity: isImporting ? 0.7 : 1
                                        }}>
                                            导入
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
