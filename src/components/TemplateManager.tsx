import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTemplateStore } from '../store/useTemplateStore';
import type { TemplateItem } from '../store/useTemplateStore';
import { Search, Plus, FileText, Archive, Box, Database, UploadCloud, Link, Type, ChevronRight, File, MessageSquare, Loader2, RefreshCw } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Setup the PDF worker using CDN to bypass Tauri's strict local asset isolation
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const TemplateManager: React.FC = () => {
    const { templates, addTemplate, deleteTemplate, updateTemplate } = useTemplateStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedExt, setSelectedExt] = useState<string>('all');
    const [isDropping, setIsDropping] = useState(false);
    
    // Quick Input State
    const [quickInputText, setQuickInputText] = useState('');
    
    // Detail View State
    const [selectedItem, setSelectedItem] = useState<TemplateItem | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [pdfPreviewData, setPdfPreviewData] = useState<Uint8Array | null>(null);
    const [pdfNumPages, setPdfNumPages] = useState<number>(1);
    const [isConverting, setIsConverting] = useState(false);
    const [conversionError, setConversionError] = useState<string | null>(null);
    const [pdfRenderError, setPdfRenderError] = useState<Error | null>(null);

    // Memoize the PDF file object to prevent react-pdf from re-parsing on every render
    const pdfFileObject = useMemo(() => {
        if (pdfPreviewData) return { data: pdfPreviewData };
        return null;
    }, [pdfPreviewData]);

    // Sequential Queue mechanism for AI processing (one at a time)
    const isProcessingQueue = useRef(false);

    // RAG Q&A State
    const [ragQuestion, setRagQuestion] = useState('');
    const [ragAnswer, setRagAnswer] = useState<string | null>(null);
    const [ragLoading, setRagLoading] = useState(false);
    const [indexStatuses, setIndexStatuses] = useState<Record<string, number>>({});
    const [isRebuilding, setIsRebuilding] = useState(false);

    // Track already-added file paths to prevent duplicates (survives across rapid re-renders)
    const addedPathsRef = useRef<Set<string>>(new Set());
    // Sync ref on mount from existing templates
    useEffect(() => {
        templates.forEach(t => addedPathsRef.current.add(t.file_path));
    }, []); // only on mount

    // Helper: generate unique ID
    const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 9);

    // processFiles is used by both drag-drop and file dialog
    const processFiles = useCallback((paths: string[]) => {
        paths.forEach(fullPath => {
            // Dedup: skip if this file path was already added (ref-based, immune to React state lag)
            if (addedPathsRef.current.has(fullPath)) return;
            addedPathsRef.current.add(fullPath);

            const fileName = fullPath.split(/[\\/]/).pop() || 'Untitled';
            const extMatch = fileName.match(/\.([^.]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'unknown';

            const newItem: TemplateItem = {
                id: generateId(),
                file_name: fileName,
                file_path: fullPath,
                file_ext: ext,
                import_date: new Date().toISOString(),
                category: 'Uncategorized',
                tags: [],
                ai_status: 'pending',
            };
            addTemplate(newItem);

            // Auto-trigger RAG indexing for this file (async, fire-and-forget)
            invoke('index_document', { templateId: newItem.id, filePath: fullPath, fileExt: ext })
                .then(() => refreshIndexStatus())
                .catch(err => console.warn('Auto-index failed:', err));
        });
    }, [addTemplate]);

    // Wrapper for delete that also cleans the dedup ref
    const handleDeleteTemplate = useCallback((id: string) => {
        const tpl = templates.find(t => t.id === id);
        if (tpl) {
            addedPathsRef.current.delete(tpl.file_path);
        }
        deleteTemplate(id);
    }, [templates, deleteTemplate]);

    // Refresh index statuses
    const refreshIndexStatus = useCallback(async () => {
        try {
            const statuses: { template_id: string; chunk_count: number }[] = await invoke('get_index_status');
            const map: Record<string, number> = {};
            statuses.forEach(s => { map[s.template_id] = s.chunk_count; });
            setIndexStatuses(map);
        } catch { /* ignore */ }
    }, []);

    // Load index statuses on mount
    useEffect(() => { refreshIndexStatus(); }, [refreshIndexStatus]);

    // RAG Q&A handler
    const handleRagQuery = useCallback(async () => {
        if (!ragQuestion.trim() || ragLoading) return;
        setRagLoading(true);
        setRagAnswer(null);
        try {
            const answer: string = await invoke('rag_query', { question: ragQuestion });
            setRagAnswer(answer);
        } catch (err) {
            setRagAnswer(`❌ 查询失败: ${String(err)}`);
        } finally {
            setRagLoading(false);
        }
    }, [ragQuestion, ragLoading]);

    // FIX 1: Tauri v2 drag-drop via correct event listener
    useEffect(() => {
        let unlistenDrop: (() => void) | undefined;
        let unlistenHover: (() => void) | undefined;
        let unlistenCancel: (() => void) | undefined;

        const setup = async () => {
            unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
                if (event.payload.paths && event.payload.paths.length > 0) {
                    processFiles(event.payload.paths);
                }
                setIsDropping(false);
            });
            unlistenHover = await listen('tauri://drag-over', () => {
                setIsDropping(true);
            });
            unlistenCancel = await listen('tauri://drag-leave', () => {
                setIsDropping(false);
            });
        };
        setup();
        return () => {
            unlistenDrop?.();
            unlistenHover?.();
            unlistenCancel?.();
        };
    }, [processFiles]);

    // FIX 3: Real AI analysis - sequential queue processor with file-type-aware strategies
    useEffect(() => {
        const processNextInQueue = async () => {
            if (isProcessingQueue.current) return;
            
            const nextPending = templates.find(t => t.ai_status === 'pending');
            if (!nextPending) return;

            isProcessingQueue.current = true;
            updateTemplate({ ...nextPending, ai_status: 'processing' });
            
            try {
                const ext = nextPending.file_ext.toLowerCase();
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'].includes(ext);
                const isOfficeDoc = ['doc', 'docx'].includes(ext);
                const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
                const isPresentation = ['ppt', 'pptx'].includes(ext);
                const isPdf = ext === 'pdf';
                const isCode = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'vb', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sql', 'html', 'css', 'xml', 'json', 'yaml', 'yml', 'sh', 'bat', 'cmd', 'ps1'].includes(ext);
                const isCad = ['dwg', 'dxf', 'rvt', 'skp', '3ds', 'max', 'blend'].includes(ext);

                let prompt = '';
                let images: string[] | undefined = undefined;

                if (isImage) {
                    // Strategy: Multimodal - read image as base64 and send to vision model
                    try {
                        const data = await readFile(nextPending.file_path);
                        const base64 = btoa(String.fromCharCode(...data));
                        images = [`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`];
                        prompt = `请分析这张图片的内容。返回JSON格式：
{
  "summary": "图片内容的详细描述（200字以内，描述图片中可见的内容、场景、文字等）",
  "category": "推荐分类（如：设计图纸、现场照片、产品图片、证件扫描、截图文档、其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                    } catch {
                        // If image read fails, fall back to filename-based analysis
                        prompt = `这是一个图片文件。文件名: ${nextPending.file_name}，格式: ${ext}。
请根据文件名推测图片可能的内容。返回JSON格式：
{"summary": "基于文件名推测的图片内容描述", "category": "推荐分类", "tags": ["关键词"]}
只返回JSON。`;
                    }
                } else if (isOfficeDoc) {
                    prompt = `这是一个Word文档。
文件名: ${nextPending.file_name}
格式: ${ext}（${ext === 'doc' ? '旧版Word' : '新版Word'}文档）

请根据文件名深度分析这份文档可能包含的内容。返回JSON格式：
{
  "summary": "基于文件名推测的文档内容综述（200字以内，推测文档的主题、结构、关键内容）",
  "category": "推荐分类（合同文档/技术规范/设计说明/工程报告/管理制度/招标文件/会议纪要/其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                } else if (isSpreadsheet) {
                    prompt = `这是一个电子表格文件。
文件名: ${nextPending.file_name}
格式: ${ext}（${ext === 'csv' ? 'CSV逗号分隔' : ext === 'xls' ? '旧版Excel' : '新版Excel'}表格）

请根据文件名分析这份表格可能包含的数据内容。返回JSON格式：
{
  "summary": "基于文件名推测的表格数据综述（200字以内，推测表格的数据类型、用途）",
  "category": "推荐分类（报价清单/预算表/材料统计/人员名单/设备台账/工程量表/其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                } else if (isPresentation) {
                    prompt = `这是一个演示文稿文件。
文件名: ${nextPending.file_name}
格式: ${ext}（PowerPoint演示文稿）

请根据文件名分析这份演示文稿可能包含的内容。返回JSON格式：
{
  "summary": "基于文件名推测的演示内容综述（200字以内）",
  "category": "推荐分类（项目汇报/技术方案/培训材料/产品介绍/其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                } else if (isPdf) {
                    prompt = `这是一个PDF文档。
文件名: ${nextPending.file_name}

请根据文件名深度分析这份PDF文档可能包含的内容。返回JSON格式：
{
  "summary": "基于文件名推测的PDF文档内容综述（200字以内，推测文档的主题、性质等）",
  "category": "推荐分类（合同文档/技术规范/设计图纸/工程报告/管理制度/通信标准/施工方案/其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                } else if (isCode) {
                    prompt = `这是一个源代码/脚本文件。
文件名: ${nextPending.file_name}
编程语言: ${ext.toUpperCase()}

请根据文件名和编程语言推测代码的用途和功能。返回JSON格式：
{
  "summary": "基于文件名和语言推测的代码功能描述（200字以内）",
  "category": "推荐分类（前端代码/后端代码/脚本工具/配置文件/数据库脚本/自动化脚本/其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                } else if (isCad) {
                    prompt = `这是一个CAD/3D设计文件。
文件名: ${nextPending.file_name}
格式: ${ext.toUpperCase()}

请根据文件名推测这个设计文件可能包含的内容。返回JSON格式：
{
  "summary": "基于文件名推测的设计文件内容描述（200字以内）",
  "category": "推荐分类（建筑设计/结构设计/机电设计/装饰设计/总平面图/其他）",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                } else {
                    // Generic fallback for any other file type
                    prompt = `这是一个文件。
文件名: ${nextPending.file_name}
文件格式: ${ext}

请根据文件名和格式推测这个文件可能包含的内容和用途。返回JSON格式：
{
  "summary": "基于文件名和格式推测的文件内容描述（200字以内）",
  "category": "推荐分类",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
只返回JSON。`;
                }

                const response: string = await invoke('chat_with_ai', {
                    req: {
                        prompt,
                        system_prompt: '你是一个专业的文档分析助手，擅长根据文件信息进行智能分类和摘要提取。请始终返回有效的JSON格式。',
                        ...(images ? { images } : {})
                    }
                });

                // Try to parse AI response as JSON
                let summary = response;
                let category = '已分析';
                let tags: string[] = [];
                
                try {
                    const jsonMatch = response.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        summary = parsed.summary || summary;
                        category = parsed.category || category;
                        tags = Array.isArray(parsed.tags) ? parsed.tags : [];
                    }
                } catch {
                    console.warn('AI response was not valid JSON, using raw text as summary');
                }

                updateTemplate({ 
                    ...nextPending, 
                    ai_status: 'success',
                    category,
                    tags,
                    ai_summary: summary
                });
            } catch (err) {
                console.error("AI Analysis failed for item", nextPending.id, err);
                updateTemplate({ 
                    ...nextPending, 
                    ai_status: 'failed',
                    ai_summary: `分析失败: ${String(err)}`
                });
            } finally {
                isProcessingQueue.current = false;
            }
        };

        processNextInQueue();
    }, [templates, updateTemplate]);

    // Extract dynamic categories from existing templates
    const dynamicCategories = useMemo(() => {
        const cats = new Set<string>();
        templates.forEach(t => cats.add(t.category));
        return Array.from(cats).sort();
    }, [templates]);

    const extensions = [
        { id: 'all', label: '全部格式' },
        { id: 'pdf', label: 'PDF' },
        { id: 'img', label: '图片' },
        { id: 'doc', label: '文档' },
        { id: 'link', label: '网页/链接' },
        { id: 'txt', label: '文本片段' },
    ];

    const handleImportFile = async () => {
        try {
            const selected = await open({
                multiple: true,
                title: '选择导入文件',
            });
            if (Array.isArray(selected)) {
                processFiles(selected);
            } else if (selected) {
                processFiles([selected]);
            }
        } catch (e) {
            console.error("Failed to open file dialog", e);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDropping(false);
        const files = e.dataTransfer.files;
        // 1. Prioritize actual file drops (any extension)
        if (files && files.length > 0) {
            // In Tauri Webview, the raw path is sometimes exposed as `.path` on the File object.
            const paths: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i] as any;
                // Favor absolute paths string, fallback to name only if necessary
                if (f.path && typeof f.path === 'string') {
                    paths.push(f.path);
                } else if (f.name) {
                    paths.push(f.name);
                }
            }
            
            if (paths.length > 0) {
                processFiles(paths);
                return;
            }
        }
        
        // 2. Check for dropped text/links if no files
        const url = e.dataTransfer.getData('text/uri-list');
        const text = e.dataTransfer.getData('text/plain');
            
        if (url) {
             const newItem: TemplateItem = {
                id: generateId(),
                file_name: url,
                file_path: url,
                file_ext: 'link',
                import_date: new Date().toISOString(),
                category: 'Uncategorized',
                tags: [],
                ai_status: 'pending',
            };
            addTemplate(newItem);
        } else if (text) {
            const newItem: TemplateItem = {
                id: generateId(),
                file_name: text.substring(0, 20) + '...',
                file_path: text, // Store the raw text here for now
                file_ext: 'txt',
                import_date: new Date().toISOString(),
                category: 'Uncategorized',
                tags: [],
                ai_status: 'pending',
            };
            addTemplate(newItem);
        }
    };

    const handleQuickInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && quickInputText.trim()) {
            const isUrl = quickInputText.startsWith('http://') || quickInputText.startsWith('https://');
            const newItem: TemplateItem = {
                id: generateId(),
                file_name: isUrl ? quickInputText : (quickInputText.substring(0, 20) + '...'),
                file_path: quickInputText,
                file_ext: isUrl ? 'link' : 'txt',
                import_date: new Date().toISOString(),
                category: 'Uncategorized',
                tags: [],
                ai_status: 'pending',
            };
            addTemplate(newItem);
            setQuickInputText('');
        }
    };

    const handleSelectTemplate = async (item: TemplateItem) => {
        setSelectedItem(item);
        setPdfPreviewUrl(null);
        setPdfPreviewData(null);
        setConversionError(null);
        setPdfRenderError(null);

        // FIX 2: Use readFile to get binary data, bypassing asset:// CORS
        // Natively supported image formats - still use convertFileSrc for <img>
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(item.file_ext)) {
            try {
                const data = await readFile(item.file_path);
                const blob = new Blob([data], { type: `image/${item.file_ext === 'jpg' ? 'jpeg' : item.file_ext}` });
                setPdfPreviewUrl(URL.createObjectURL(blob));
            } catch (err) {
                console.error('Failed to read image:', err);
                setConversionError(String(err));
            }
        // Direct PDF preview via binary data
        } else if (item.file_ext === 'pdf') {
            try {
                const data = await readFile(item.file_path);
                setPdfPreviewData(data);
            } catch (err) {
                console.error('Failed to read PDF:', err);
                setConversionError(String(err));
            }
        // Office documents that need conversion
        } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(item.file_ext)) {
            setIsConverting(true);
            try {
                const pdfPath: string = await invoke('convert_to_pdf', { inputPath: item.file_path });
                const data = await readFile(pdfPath);
                setPdfPreviewData(data);
            } catch (err) {
                console.error('Failed to convert document to PDF:', err);
                setConversionError(String(err));
            } finally {
                setIsConverting(false);
            }
        }
    };

    const filteredTemplates = templates.filter(t => {
        const matchesSearch = t.file_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (t.ai_summary && t.ai_summary.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCat = selectedCategory === 'all' || t.category === selectedCategory;
        
        // Basic ext filter matching
        let matchesExt = true;
        if (selectedExt !== 'all') {
            if (selectedExt === 'img') matchesExt = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(t.file_ext);
            else if (selectedExt === 'doc') matchesExt = ['doc', 'docx', 'txt', 'rtf'].includes(t.file_ext);
            else if (selectedExt === 'link') matchesExt = t.file_ext === 'link';
            else if (selectedExt === 'txt') matchesExt = t.file_ext === 'txt';
            else matchesExt = t.file_ext === selectedExt;
        }

        return matchesSearch && matchesCat && matchesExt;
    });

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-surface)' }}
             onDragOver={(e) => { e.preventDefault(); setIsDropping(true); }}
             onDragLeave={() => setIsDropping(false)}
             onDrop={handleDrop}
        >
            {/* Header Area with Quick Input */}
            <div style={{ padding: '32px 32px 0 32px', display: 'flex', gap: 24, alignItems: 'center', marginBottom: 28, flexShrink: 0 }}>
                {/* Title */}
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, letterSpacing: '-0.02em' }}>
                        <Database style={{ color: 'var(--brand)' }} />模板与知识库
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Global Template & Knowledge Base</p>
                </div>
                
                {/* Dashed Quick Input Area */}
                <div style={{ 
                    flex: 1, 
                    border: '2px dashed var(--border-strong)', 
                    borderRadius: 16, 
                    padding: '12px 20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12,
                    backgroundColor: 'var(--bg-subtle)',
                    transition: 'all 0.2s'
                }}>
                    <Plus size={20} style={{ color: 'var(--text-faint)' }} />
                    <input 
                        type="text" 
                        placeholder="输入文字片段内容、粘贴网页链接，或直接将文件拖拽至全屏工作区内任意位置..." 
                        value={quickInputText}
                        onChange={e => setQuickInputText(e.target.value)}
                        onKeyDown={handleQuickInputSubmit}
                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
                    />
                    <button onClick={handleImportFile} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                        <UploadCloud size={16} /> 选择文件
                    </button>
                </div>
            </div>

            {/* RAG Q&A Bar */}
            {!selectedItem && templates.length > 0 && (
                <div style={{ padding: '0 32px 16px 32px', flexShrink: 0 }}>
                    <div style={{
                        display: 'flex', gap: 12, alignItems: 'flex-start',
                        padding: 16, borderRadius: 16,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(168,85,247,0.05))',
                        border: '1px solid rgba(99,102,241,0.15)',
                    }}>
                        <MessageSquare size={20} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="text"
                                    placeholder="基于知识库中所有已索引文件提问... (例: 电缆报价是多少?)"
                                    value={ragQuestion}
                                    onChange={e => setRagQuestion(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleRagQuery(); }}
                                    style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', backgroundColor: 'var(--bg-raised)', color: 'var(--text-primary)', outline: 'none', fontSize: 13 }}
                                />
                                <button
                                    onClick={handleRagQuery}
                                    disabled={ragLoading || !ragQuestion.trim()}
                                    style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: ragLoading || !ragQuestion.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    {ragLoading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> 检索中...</> : '智能问答'}
                                </button>
                                <button
                                    onClick={async () => {
                                        setIsRebuilding(true);
                                        try {
                                            const items = templates.map(t => ({ id: t.id, file_path: t.file_path, file_ext: t.file_ext }));
                                            const result: string = await invoke('rebuild_all_indexes', { items });
                                            setRagAnswer(`✅ ${result}`);
                                            refreshIndexStatus();
                                        } catch (err) {
                                            setRagAnswer(`❌ 重建失败: ${String(err)}`);
                                        } finally {
                                            setIsRebuilding(false);
                                        }
                                    }}
                                    disabled={isRebuilding}
                                    style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, opacity: isRebuilding ? 0.5 : 1 }}
                                >
                                    <RefreshCw size={13} style={isRebuilding ? { animation: 'spin 1s linear infinite' } : {}} /> {isRebuilding ? '索引中...' : '重建索引'}
                                </button>
                            </div>
                            {ragAnswer && (
                                <div style={{ padding: 14, borderRadius: 10, backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                                    {ragAnswer}
                                </div>
                            )}
                            {/* Index summary */}
                            <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span>📊 已索引 {Object.keys(indexStatuses).length} 个文件 / 共 {templates.length} 个</span>
                                {Object.keys(indexStatuses).length < templates.length && <span style={{ color: 'var(--warning)' }}>• 有文件未索引，请点击「重建索引」</span>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Layout */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Sidebar Filters (Hidden if item is selected) */}
                {!selectedItem && (
                    <div style={{ width: 220, borderRight: '1px solid var(--border)', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', flexShrink: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                            <input type="text" placeholder="搜索知识库..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-raised)', color: 'var(--text-primary)', outline: 'none', fontSize: 13 }} />
                        </div>

                        <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                智能分类 
                                <span style={{ fontSize: 10, fontWeight: 500, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)', padding: '2px 6px', borderRadius: 10 }}>AI</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <button onClick={() => setSelectedCategory('all')}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: selectedCategory === 'all' ? 'var(--brand-subtle)' : 'transparent', color: selectedCategory === 'all' ? 'var(--brand)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: selectedCategory === 'all' ? 700 : 500 }}>
                                    <Box size={15} />全部智能分类
                                </button>
                                {dynamicCategories.map(cat => (
                                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: selectedCategory === cat ? 'var(--brand-subtle)' : 'transparent', color: selectedCategory === cat ? 'var(--brand)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: selectedCategory === cat ? 700 : 500 }}>
                                        <Archive size={15} />{cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>文件格式</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {extensions.map(ext => (
                                    <button key={ext.id} onClick={() => setSelectedExt(ext.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: selectedExt === ext.id ? 'var(--bg-raised)' : 'transparent', color: selectedExt === ext.id ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: selectedExt === ext.id ? 700 : 500 }}>
                                        {ext.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content Area OR Split Detail View */}
                <div style={{ flex: 1, padding: selectedItem ? 0 : '0 32px 32px', overflowY: 'auto', position: 'relative', display: 'flex' }}>
                    
                    {isDropping && !selectedItem && (
                        <div style={{ position: 'absolute', inset: 16, backgroundColor: 'var(--brand-subtle)', border: '2px dashed var(--brand)', borderRadius: 24, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                            <UploadCloud size={64} style={{ marginBottom: 16 }} />
                            <h3 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>松开鼠标导入知识库</h3>
                        </div>
                    )}

                    {selectedItem ? (
                        // --- DETAIL VIEW ---
                        <div style={{ flex: 1, display: 'flex', width: '100%', height: '100%' }}>
                            {/* Left Panel: AI Summary & Metadata */}
                            <div style={{ width: 340, backgroundColor: 'var(--bg-subtle)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                                <div style={{ padding: 24, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button onClick={() => setSelectedItem(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                        <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
                                    </button>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedItem.file_name}</h3>
                                </div>
                                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
                                    
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>AI 智能综述</div>
                                        {selectedItem.ai_status === 'pending' || selectedItem.ai_status === 'processing' ? (
                                            <div>
                                                <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'var(--bg-raised)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                                    <div className="spinner" style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                    <span style={{ fontSize: 13 }}>AI 正在努力阅读文档并提取核心信息...</span>
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--text-faint)', paddingLeft: 8 }}>
                                                    <span style={{ animation: 'pulse 2s infinite' }}>正在理解文档结构与段落意图，由于本地模型处理需一定时间，请稍候...</span>
                                                </div>
                                           </div>
                                        ) : selectedItem.ai_summary ? (
                                            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                                {selectedItem.ai_summary}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>暂无分析结果</div>
                                        )}
                                    </div>

                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>分类 & 标签</div>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ padding: '4px 10px', borderRadius: 12, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
                                                {selectedItem.category}
                                            </span>
                                            {selectedItem.tags.map(tag => (
                                                <span key={tag} style={{ padding: '4px 10px', borderRadius: 12, backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>导入日期: {new Date(selectedItem.import_date).toLocaleDateString()}</span>
                                        <button onClick={() => { handleDeleteTemplate(selectedItem.id); setSelectedItem(null); }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>删除</button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Right Panel: Document Preview */}
                            <div style={{ flex: 1, backgroundColor: 'var(--bg-root)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative' }}>
                                 {selectedItem.file_ext === 'link' ? (
                                      <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                          <Link size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                                          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>外部网页链接</h3>
                                          <a href={selectedItem.file_path} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'none' }}>{selectedItem.file_path}</a>
                                      </div>
                                 ) : selectedItem.file_ext === 'txt' ? (
                                    <div style={{ width: '100%', maxWidth: 800, height: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 8px 30px rgba(0,0,0,0.05)', overflowY: 'auto' }}>
                                        <div style={{ fontSize: 15, lineHeight: 1.6, color: '#333', whiteSpace: 'pre-wrap' }}>
                                            {selectedItem.file_path}
                                        </div>
                                    </div>
                                 ) : isConverting ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                                        <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>正在排版转换中...</h3>
                                        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>请稍候，我们正在后台原生级渲染 Office 格式</p>
                                    </div>
                                 ) : conversionError ? (
                                    <div style={{ textAlign: 'center', color: 'var(--danger)' }}>
                                        <FileText size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                                        <h3 style={{ margin: '0 0 8px' }}>转换预览失败</h3>
                                        <p style={{ fontSize: 13, opacity: 0.8, maxWidth: 300 }}>{conversionError}</p>
                                    </div>
                                 ) : pdfPreviewUrl && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(selectedItem.file_ext) ? (
                                    <img src={pdfPreviewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }} />
                                 ) : pdfFileObject ? (
                                    <div style={{ width: '100%', height: '100%', overflow: 'auto', backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
                                        <Document
                                            file={pdfFileObject}
                                            onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                                            onLoadError={(err) => {
                                                console.error("PDF Load Error:", err);
                                                setPdfRenderError(err);
                                            }}
                                            loading={<div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>PDF 加载中...</div>}
                                            error={<div style={{ textAlign: 'center', padding: 40, color: 'var(--danger)' }}>
                                                无法渲染此 PDF，请尝试使用外部阅读器
                                                {pdfRenderError && <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8, color: '#ff4444' }}>{pdfRenderError.message || String(pdfRenderError)}</div>}
                                            </div>}
                                        >
                                            {Array.from({ length: pdfNumPages }, (_, i) => (
                                                <div key={i} style={{ marginBottom: 16 }}>
                                                    <Page 
                                                        pageNumber={i + 1} 
                                                        renderTextLayer={true} 
                                                        renderAnnotationLayer={true} 
                                                        width={Math.min(window.innerWidth * 0.45, 800)} 
                                                    />
                                                    <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', padding: '6px 0', borderBottom: i < pdfNumPages - 1 ? '1px dashed var(--border)' : 'none' }}>
                                                        第 {i + 1} / {pdfNumPages} 页
                                                    </div>
                                                </div>
                                            ))}
                                        </Document>
                                    </div>
                                 ) : (
                                     <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                          <File size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                                          <p>此文件格式暂不提供应用内原生预览</p>
                                          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>建议使用外部软件打开</p>
                                      </div>
                                 )}
                            </div>
                        </div>
                    ) : (
                        // --- LIST VIEW ---
                        templates.length === 0 ? (
                            <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                                <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Box size={36} style={{ opacity: 0.2 }} /></div>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>知识库还是空的</p>
                                <p style={{ margin: '8px 0 0', fontSize: 13 }}>点击上方框或者直接拖入文件开始积累</p>
                            </div>
                        ) : (
                            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignContent: 'flex-start' }}>
                                {filteredTemplates.map(tmp => (
                                    <div 
                                        key={tmp.id} 
                                        onClick={() => handleSelectTemplate(tmp)}
                                        style={{ 
                                            padding: 16, 
                                            borderRadius: 16, 
                                            backgroundColor: 'var(--bg-raised)', 
                                            border: '1px solid var(--border)', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.borderColor = 'var(--brand)';
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                            const delBtn = e.currentTarget.querySelector('.card-delete-btn') as HTMLElement;
                                            if (delBtn) delBtn.style.opacity = '1';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.borderColor = 'var(--border)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            const delBtn = e.currentTarget.querySelector('.card-delete-btn') as HTMLElement;
                                            if (delBtn) delBtn.style.opacity = '0';
                                        }}
                                    >
                                        {/* Hover delete button */}
                                        <button 
                                            className="card-delete-btn"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmp.id); }}
                                            style={{ 
                                                position: 'absolute', 
                                                bottom: 8, 
                                                right: 8, 
                                                padding: '4px 10px', 
                                                borderRadius: 8, 
                                                border: '1px solid rgba(220,38,38,0.2)', 
                                                backgroundColor: 'rgba(254,226,226,0.9)', 
                                                color: '#dc2626', 
                                                cursor: 'pointer', 
                                                fontSize: 11, 
                                                fontWeight: 600,
                                                opacity: 0, 
                                                transition: 'opacity 0.2s',
                                                zIndex: 2,
                                                backdropFilter: 'blur(4px)'
                                            }}
                                        >
                                            删除
                                        </button>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 44, height: 44, borderRadius: '12px', backgroundColor: tmp.file_ext === 'link' ? 'rgba(59,130,246,0.1)' : tmp.file_ext==='txt' ? 'var(--bg-muted)' : 'var(--brand-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tmp.file_ext === 'link' ? '#3b82f6' : 'var(--brand)' }}>
                                                {tmp.file_ext === 'link' ? <Link size={20} /> : tmp.file_ext === 'txt' ? <Type size={20} /> : <FileText size={20} />}
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{tmp.file_name}</div>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{tmp.file_ext}</span>
                                                    <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: 'var(--border-strong)' }} />
                                                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{tmp.category}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {tmp.ai_status === 'pending' && <div style={{ fontSize: 11, color: 'var(--brand)', backgroundColor: 'var(--brand-subtle)', padding: '4px 8px', borderRadius: 4, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}><div className="spinner" style={{ width: 10, height: 10, border: '1.5px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}/>等待 AI 扫描提取摘要</div>}
                                        {indexStatuses[tmp.id] != null && indexStatuses[tmp.id] > 0 && (
                                            <div style={{ fontSize: 10, color: 'var(--success)', backgroundColor: 'var(--success-subtle)', padding: '3px 8px', borderRadius: 4, alignSelf: 'flex-start', fontWeight: 600 }}>
                                                ✓ 已索引 {indexStatuses[tmp.id]} 块
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>
            {/* Inject global style for spinner if not present */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}} />
        </div>
    );
};
