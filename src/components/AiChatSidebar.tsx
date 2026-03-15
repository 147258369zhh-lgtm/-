import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Send,
    Bot,
    User,
    Loader2,
    ChevronRight,
    Sparkles,
    Image as ImageIcon,
    Camera,
    Mic,
    X,
    Cpu
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { FileAutomationEngine } from '../utils/FileAutomationEngine';
import { BrowserAutomationEngine } from '../utils/BrowserAutomationEngine';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ActionBatchResult {
    ok: boolean;
    action: string;
    detail?: string;
}

interface AiChatSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AiChatSidebar: React.FC<AiChatSidebarProps> = ({ isOpen, onClose }) => {
    const { activeProject, chatAttachments, addChatAttachment, clearChatAttachments, setChatAttachments } = useStore();
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: '您好！我是您的通信设计项目助手。有什么我可以帮您的吗？' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeConfig, setActiveConfig] = useState<any>(null);
    const [isCommandRunning, setIsCommandRunning] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState(`你是一个专业的通信工程设计与规则执行专家。
你拥有【全量动态业务数据感知能力】，当前项目的全量字段、勘察详情、关联文件、全局报价/合同、以及现有的自动化指令明细已全部挂载在大纲中。
你的职责：
1. 设计辅助：基于现有的勘察数据（如经纬度、现场情况）和全局报价单提供设计建议。
2. 自动化编排：若用户要求生成文档，请优先查阅现有的自动化逻辑与执行方案，并据此输出执行指令。
3. 网页自动化：根据用户描述的 CMS 填表逻辑，提取项目数据并生成抓取/填写指令。

你可以输出以下 JSON 指令来执行自动化任务：
- Word/Excel 生成：[{"action": "fill_document", "type": "word|excel", "template_name": "...", "mappings": {"{{占位符}}": "值"}}]
- CMS 填表：[{"action": "fill_web_form", "url": "...", "actions": [{"action": "fill", "label": "输入框标签名", "value": "值"}]}]
- 查询文件摘要：[{"action": "get_file_summary", "file_name": "..."}]
- 查询通用信息：[{"action": "get_common_info", "key": "..."}]
- 更新项目画像：[{"action": "update_project_profile", "profile": "..."}]

输出指令时，确保引用大纲中存在的真实数据值。`);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    useEffect(() => {
        loadActiveConfig();
    }, [isOpen]);

    // 读取自定义 AI 对话系统提示词
    useEffect(() => {
        const loadPrompt = async () => {
            try {
                const sData: any[] = await invoke('list_settings');
                const val = sData.find(s => s.key === 'prompt_ai_chat_system')?.value;
                if (val && val.trim()) setSystemPrompt(val);
            } catch {
                // ignore and keep default
            }
        };
        loadPrompt();
    }, []);

    const loadActiveConfig = async () => {
        try {
            const configs: any[] = await invoke('list_ai_configs');
            const active = configs.find(c => c.is_active);
            setActiveConfig(active || null);
        } catch (e) {
            console.error('加载 AI 配置失败:', e);
        }
    };

    const handleCaptureScreen = async () => {
        try {
            // 提醒用户：部分浏览器或 Tauri 环境需要授权
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();

            video.onloadedmetadata = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                
                // 给一点点延迟确保视频帧加载
                setTimeout(() => {
                    ctx?.drawImage(video, 0, 0);
                    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    addChatAttachment(base64);
                    
                    // 停止所有轨道
                    stream.getTracks().forEach(track => track.stop());
                }, 300);
            };
        } catch (e) {
            console.error('截图失败:', e);
            alert('无法启动截图，请检查浏览器权限。');
        }
    };

    const isCommandText = (text: string) => {
        const trimmed = text.trim();
        if (trimmed.startsWith('/')) return true;
        return /(生成|创建|导入|整理|分析|查询|总结|输出|替换|填报|填表|提炼|同步|更新)/.test(trimmed);
    };

    const normalizeCommand = (text: string) => {
        const trimmed = text.trim();
        if (trimmed.startsWith('/')) return trimmed.replace(/^\//, '').trim();
        return trimmed;
    };

    const handleCommand = async (commandText: string) => {
        if (!activeProject) {
            setMessages(prev => [...prev, { role: 'assistant', content: '当前未进入项目，请先进入一个项目再执行指令。' }]);
            return;
        }
        setIsCommandRunning(true);
        try {
            const context: string = await invoke('get_design_context', { projectId: activeProject.id });
            const prompt = `你是通信工程项目智能执行助手。根据用户指令直接输出 JSON 指令数组，不要 Markdown。

指令支持：
- 生成 Word/Excel 文档：{"action":"fill_document","type":"word|excel","template_name":"模板名","mappings":{}}
- 查询文件摘要：{"action":"get_file_summary","file_name":"文件名"}
- 查询通用信息：{"action":"get_common_info","key":"字段名"}
- 更新项目画像：{"action":"update_project_profile","profile":"内容"}
- 整理通用信息库：{"action":"summarize_common_info","focus":"你要的整理方向"}
- 批量执行：输出多个 action 组成数组

用户指令：${commandText}

项目大纲：
${context}`;

            const response: string = await invoke('chat_with_ai', {
                req: {
                    prompt,
                    system_prompt: systemPrompt,
                    module: 'chat'
                }
            });

            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
            const resultSummary = await executeAiActions(response, commandText);
            if (resultSummary) {
                setMessages(prev => [...prev, { role: 'assistant', content: resultSummary }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: `指令执行失败: ${e}` }]);
        } finally {
            setIsCommandRunning(false);
        }
    };

    const handleSend = async (overrideInput?: string) => {
        const textToSend = overrideInput || input;
        if ((!textToSend.trim() && chatAttachments.length === 0) || isLoading || isCommandRunning) return;

        const userMsg: Message = { 
            role: 'user', 
            content: textToSend + (chatAttachments.length > 0 ? ` [包含 ${chatAttachments.length} 张图片图片]` : '') 
        };
        setMessages(prev => [...prev, userMsg]);
        if (!overrideInput) setInput('');
        setIsLoading(true);

        const currentAttachments = [...chatAttachments];
        clearChatAttachments(); // 发送后清空预览区

        if (isCommandText(textToSend)) {
            await handleCommand(normalizeCommand(textToSend));
            setIsLoading(false);
            return;
        }

        try {
            const response: string = await invoke('chat_with_ai', {
                req: {
                    prompt: textToSend,
                    images: currentAttachments.length > 0 ? currentAttachments : null,
                    system_prompt: systemPrompt,
                    module: 'chat'
                }
            });
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
            
            // 执行指令
            await executeAiActions(response, textToSend);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: `抱歉，出错了: ${e}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    // 自动挂载语境：打开即感知
    useEffect(() => {
        if (isOpen && activeProject && messages.length <= 1) {
            handleSyncDesign(true);
        }
    }, [isOpen, activeProject]);

    /**
     * 解析并执行 AI 输出的 JSON 指令
     */
    const executeAiActions = async (content: string, userRequest?: string) => {
        const results: ActionBatchResult[] = [];
        try {
            const jsonMatch = content.match(/\[\s*\{.*\}\s*\]/s);
            if (!jsonMatch) return null;

            const actions = JSON.parse(jsonMatch[0]);
            for (const action of actions) {
                if (action.action === 'fill_document') {
                    const isWord = action.type === 'word';
                    const isExcel = action.type === 'excel';

                    if (!isWord && !isExcel) {
                        results.push({ ok: false, action: 'fill_document', detail: '类型无效' });
                        continue;
                    }

                    setMessages(prev => [...prev, { role: 'assistant', content: `⚙️ 正在为您自动生成 ${isWord ? 'Word' : 'Excel'} 文档：${action.template_name}...` }]);
                    
                    const allTemplates: any[] = await invoke('list_templates');
                    const targetTemplate = allTemplates.find(t => 
                        t.name.includes(action.template_name) || action.template_name.includes(t.name)
                    );

                    if (!targetTemplate || !targetTemplate.source_file_path) {
                        setMessages(prev => [...prev, { role: 'assistant', content: `❌ 自动生成失败：在模板库中找不到匹配 "${action.template_name}" 的物理文件。` }]);
                        results.push({ ok: false, action: 'fill_document', detail: '模板未找到' });
                        continue;
                    }

                    const fillData = {
                        ...activeProject,
                        ...action.mappings
                    };

                    const result = isWord 
                        ? await FileAutomationEngine.fillWord(targetTemplate.source_file_path, fillData, activeProject!.path, `${activeProject?.name}_${action.template_name}_${Date.now()}.docx`, '输出成果')
                        : await FileAutomationEngine.fillExcel(targetTemplate.source_file_path, fillData, activeProject!.path, `${activeProject?.name}_${action.template_name}_${Date.now()}.xlsx`, '输出成果');

                    if (result.success) {
                        setMessages(prev => [...prev, { role: 'assistant', content: `✅ ${isWord ? 'Word' : 'Excel'} 文档生成成功！已存入“输出成果”目录。` }]);
                        results.push({ ok: true, action: 'fill_document', detail: action.template_name });
                    } else {
                        setMessages(prev => [...prev, { role: 'assistant', content: `❌ 文档生成失败：${result.error}` }]);
                        results.push({ ok: false, action: 'fill_document', detail: result.error });
                    }
                } else if (action.action === 'fill_web_form') {
                    setMessages(prev => [...prev, { role: 'assistant', content: `🌐 正在启动浏览器执行 CMS 自动填报：${action.url}...` }]);
                    
                    await BrowserAutomationEngine.runActions([
                        { action: 'goto', value: action.url },
                        ...action.actions
                    ]);
                    
                    setMessages(prev => [...prev, { role: 'assistant', content: `✅ 网页填表指令已下达，请查看开启的浏览器窗口完成最终提交。` }]);
                    results.push({ ok: true, action: 'fill_web_form', detail: action.url });
                } else if (action.action === 'get_file_summary') {
                    const files: any[] = await invoke('list_project_files', { projectId: activeProject?.id });
                    const target = files.find(f => f.name.includes(action.file_name) || action.file_name.includes(f.name));
                    if (!target) {
                        setMessages(prev => [...prev, { role: 'assistant', content: `未找到匹配的文件：${action.file_name}` }]);
                        results.push({ ok: false, action: 'get_file_summary', detail: action.file_name });
                        continue;
                    }
                    const summary = target.ai_summary || target.remarks || '暂无 AI 摘要，请先在项目文件库中导入并解析。';
                    setMessages(prev => [...prev, { role: 'assistant', content: `文件：${target.name}\n摘要：${summary}` }]);
                    results.push({ ok: true, action: 'get_file_summary', detail: target.name });
                } else if (action.action === 'get_common_info') {
                    const infos: any[] = await invoke('list_common_info');
                    const target = infos.find((i: any) => i.key.includes(action.key) || action.key.includes(i.key));
                    if (!target) {
                        setMessages(prev => [...prev, { role: 'assistant', content: `未找到通用信息：${action.key}` }]);
                        results.push({ ok: false, action: 'get_common_info', detail: action.key });
                        continue;
                    }
                    const structured = target.ai_structured ? `\n结构化：${target.ai_structured}` : '';
                    setMessages(prev => [...prev, { role: 'assistant', content: `通用信息：${target.key}\n内容：${target.value}${structured}` }]);
                    results.push({ ok: true, action: 'get_common_info', detail: target.key });
                } else if (action.action === 'update_project_profile') {
                    if (!action.profile) {
                        results.push({ ok: false, action: 'update_project_profile', detail: '画像为空' });
                        continue;
                    }
                    await invoke('update_project', { id: activeProject?.id, aiProfile: action.profile });
                    const updated: any[] = await invoke('list_projects');
                    setProjects(updated);
                    const newActive = updated.find(p => p.id === activeProject?.id);
                    if (newActive) setActiveProject(newActive);
                    setMessages(prev => [...prev, { role: 'assistant', content: '已更新项目 AI 画像。' }]);
                    results.push({ ok: true, action: 'update_project_profile' });
                } else if (action.action === 'summarize_common_info') {
                    const infos: any[] = await invoke('list_common_info');
                    const merged = infos.map(i => `${i.key}: ${i.value}`).join('\n');
                    const prompt = `请根据以下通用信息整理总结，按“${action.focus || userRequest || '关键点'}”输出：\n${merged}`;
                    const response: string = await invoke('chat_with_ai', { req: { prompt, module: 'chat' } });
                    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
                    results.push({ ok: true, action: 'summarize_common_info' });
                }
            }

            if (results.length === 0) return null;
            const okCount = results.filter(r => r.ok).length;
            const failCount = results.length - okCount;
            const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.action}${r.detail ? `：${r.detail}` : ''}`);
            return `批量指令执行完成：成功 ${okCount} 条，失败 ${failCount} 条。\n${lines.join('\n')}`;
        } catch (e) {
            console.error('指令执行失败:', e);
            return null;
        }
    };

    const handleSyncDesign = async (silent = false) => {
        try {
            const context: string = await invoke('get_design_context', { projectId: activeProject?.id || null });
            const prompt = `[系统指令：已同步当前项目全字段语境]\n以下是最新项目大纲，请在后续对话中基于此数据提供建议：\n\n${context}`;
            if (silent) {
                // 静默同步不显示在对话流中，直接注入作为上下文背景（这里简单处理为一条隐形消息或直接开始对话）
                setMessages(prev => [...prev, { role: 'assistant', content: `✨ 已为您自动关联项目：${activeProject?.name}。我已同步所有项目字段、勘察详情及现有文件，您可以直接问我关于这个项目的任何事。` }]);
            } else {
                handleSend(prompt);
            }
        } catch (e) {
            if (!silent) alert(`同步设计失败，请重试: ${e}`);
        }
    };

    return (
        <div
            className={`fixed top-10 right-0 bottom-0 z-50 transition-all duration-500 transform border-l shadow-2xl flex flex-col ${isOpen ? 'w-96 translate-x-0' : 'w-0 translate-x-full pointer-events-none'
                } backdrop-blur-2xl`}
            style={{ backgroundColor: 'var(--bg-overlay)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        >
            {/* Header */}
            <div
                className="h-14 border-b flex items-center justify-between px-6 shrink-0"
                style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Bot size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-widest uppercase">AI 智行对话</h3>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] text-slate-500 font-bold uppercase italic">Ready to assist</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeConfig && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border rounded-xl"
                            style={{ backgroundColor: 'var(--popover-bg)', borderColor: 'var(--popover-border)', boxShadow: 'var(--shadow-sm)' }}>
                            <Cpu size={12} className="text-blue-500" />
                            <span className="text-[10px] font-black uppercase truncate max-w-[80px]" style={{ color: 'var(--text-secondary)' }}>
                                {activeConfig.name}
                            </span>
                        </div>
                    )}

                    <button onClick={() => handleSyncDesign()} title="同步当前大纲" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95 text-[10px] font-bold uppercase tracking-widest"
                        style={{ backgroundColor: 'var(--purple-subtle)', color: 'var(--purple)', border: '1px solid rgba(167,139,250,0.3)' }}>
                        <Sparkles size={12} />
                        Sync
                    </button>
                    <button onClick={onClose} className="p-2 rounded-xl transition-all" style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-muted)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`flex items-center gap-2 mb-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${msg.role === 'user' ? 'text-slate-500' : 'text-blue-600'}`}
                                style={{ backgroundColor: 'var(--popover-bg)', border: '1px solid var(--popover-border)', boxShadow: 'var(--shadow-sm)' }}>
                                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                                {msg.role === 'user' ? 'You' : 'Ai Assistant'}
                            </span>
                        </div>
                        <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                : 'border text-slate-800 dark:text-slate-200'
                            }`}
                            style={msg.role === 'user' ? undefined : { backgroundColor: 'var(--popover-bg)', borderColor: 'var(--popover-border)', boxShadow: 'var(--popover-shadow)' }}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 animate-pulse">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs italic font-medium">AI 正在思考中...</span>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-5 border-t shrink-0 backdrop-blur-md" style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
                {/* Image Preview Area */}
                {chatAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4 p-2 rounded-xl border border-dashed animate-in fade-in slide-in-from-bottom-1"
                        style={{ backgroundColor: 'var(--popover-bg)', borderColor: 'var(--popover-border)', boxShadow: 'var(--popover-shadow)' }}>
                        {chatAttachments.map((img, i) => (
                            <div key={i} className="relative group/img w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                                <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover" />
                                <button 
                                    onClick={() => setChatAttachments(chatAttachments.filter((_, idx) => idx !== i))}
                                    className="absolute -top-1 -right-1 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <textarea
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="在此询问 AI 助手..."
                        className="flex-1 border rounded-2xl px-4 py-3 text-sm focus:outline-none transition-all resize-none custom-scrollbar"
                        style={{
                            backgroundColor: 'var(--popover-bg)',
                            borderColor: 'var(--popover-border)',
                            color: 'var(--text-primary)',
                            boxShadow: 'var(--popover-shadow)'
                        }}
                    />
                    
                    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-xl border"
                        style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                        <button 
                            title="上传图片"
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = (e: any) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (re: any) => {
                                            const base64 = re.target.result.split(',')[1];
                                            addChatAttachment(base64);
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                };
                                input.click();
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                            style={{ backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                        >
                            <ImageIcon size={14} />
                        </button>
                        <button 
                            title="屏幕截图"
                            onClick={handleCaptureScreen}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                            style={{ backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                        >
                            <Camera size={14} />
                        </button>
                        <button 
                            title="录制语音"
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                            style={{ backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                        >
                            <Mic size={14} />
                        </button>
                        <button
                            onClick={() => handleSend()}
                            disabled={(!input.trim() && chatAttachments.length === 0) || isLoading}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all shadow-lg active:scale-90"
                            style={{ backgroundColor: 'var(--brand)', color: '#fff', opacity: (!input.trim() && chatAttachments.length === 0) || isLoading ? 0.5 : 1 }}
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-700 mt-3 italic text-center">
                    AI 生成的内容可能不完全准确，建议对关键设计参数进行核对。
                </p>
            </div>
        </div>
    );
};
