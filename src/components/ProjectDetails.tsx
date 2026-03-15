import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { 
    FileText, 
    Sparkles, 
    Loader2, 
    Layers, 
    CheckCircle2, 
    Clock,
    User,
    MapPin,
    AlertCircle
} from 'lucide-react';

export const ProjectDetails: React.FC = () => {
    const { activeProject, setActiveProject, setProjects } = useStore();
    const [files, setFiles] = useState<any[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState("直接输出最终的项目综述 Markdown，不需要任何多余的寒暄或解释。");

    const fetchProjectData = async () => {
        if (!activeProject) return;
        try {
            const fileData: any = await invoke('list_project_files', { projectId: activeProject.id });
            setFiles(fileData || []);
        } catch (error) {
            console.error('Failed to fetch project files:', error);
        }
    };

    useEffect(() => {
        fetchProjectData();
    }, [activeProject?.id]);

    // 加载自定义项目综述系统提示词（若设置里有）
    useEffect(() => {
        const loadPrompt = async () => {
            try {
                const sData: any[] = await invoke('list_settings');
                const val = sData.find(s => s.key === 'prompt_project_summary_system')?.value;
                if (val && val.trim()) setSystemPrompt(val);
            } catch {
                // ignore and keep default
            }
        };
        loadPrompt();
    }, []);

    const handleGenerateSummary = async () => {
        if (!activeProject) return;
        setIsGenerating(true);
        try {
            // Get design context (all files, common info, etc.)
            const context: string = await invoke('get_design_context', { projectId: activeProject.id });
            
            const prompt = `你是一个资深的通信工程项目管理专家。请根据以下项目的所有背景资料和现存文件列表，为该项目生成一个全面的“项目详情介绍”综述。

项目基本资料：
- 名称: ${activeProject.name}
- 编号: ${activeProject.number || '未记录'}
- 地市: ${activeProject.city || '未记录'}
- 类型: ${activeProject.project_type || '未记录'}
- 备注: ${activeProject.remarks || '无'}

背景资料详情:
${context}

要求：
1. 采用专业、结构化、清晰的语言。
2. 总结项目的核心目标、目前已有的资料情况、还需要完善的部分。
3. 对每个主要文件类别进行简要描述。
4. 总字数在 500 字左右，支持 Markdown 格式。
5. 不要只是列出文件，要进行深度提炼和综述。`;

            const req = { prompt, system_prompt: systemPrompt, module: 'project_summary' };
            const res: string = await invoke('chat_with_ai', { req });
            
            // Save summary to project
            await invoke('update_project', { 
                id: activeProject.id, 
                summary: res,
                aiProfile: activeProject.ai_profile || null
            });

            // Update local state
            const updatedProjects: any = await invoke('list_projects');
            setProjects(updatedProjects);
            const newActive = updatedProjects.find((p: any) => p.id === activeProject.id);
            if (newActive) setActiveProject(newActive);

        } catch (error) {
            alert(`生成项目综述失败: ${error}`);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!activeProject) return null;

    const fileCounts = files.reduce((acc: any, file) => {
        acc[file.category] = (acc[file.category] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="custom-scrollbar animate-in fade-in duration-500" style={{ flex: 1, padding: '32px', overflowY: 'auto', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
                
                {/* Statistics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    <div style={cardStyle}>
                        <div style={iconBoxStyle('var(--brand)')}><FileText size={20} /></div>
                        <div>
                            <div style={labelStyle}>文件总数</div>
                            <div style={valueStyle}>{files.length} 个</div>
                        </div>
                    </div>
                    <div style={cardStyle}>
                        <div style={iconBoxStyle('var(--success)')}><CheckCircle2 size={20} /></div>
                        <div>
                            <div style={labelStyle}>当前阶段</div>
                            <div style={valueStyle}>{activeProject.stage}</div>
                        </div>
                    </div>
                    <div style={cardStyle}>
                        <div style={iconBoxStyle('var(--warning)')}><Layers size={20} /></div>
                        <div>
                            <div style={labelStyle}>资料类别</div>
                            <div style={valueStyle}>{Object.keys(fileCounts).length} 类</div>
                        </div>
                    </div>
                    <div style={cardStyle}>
                        <div style={iconBoxStyle('var(--purple)')}><Clock size={20} /></div>
                        <div>
                            <div style={labelStyle}>创建时间</div>
                            <div style={valueStyle}>{new Date(activeProject.created_at).toLocaleDateString()}</div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
                    
                    {/* Project Summary Board */}
                    <div style={{ ...sectionStyle, minHeight: 400 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={sectionTitleStyle}>
                                <Sparkles size={18} style={{ color: 'var(--brand)' }} />
                                AI 项目深度综述
                            </h3>
                            <button 
                                onClick={handleGenerateSummary} 
                                disabled={isGenerating}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 16px', borderRadius: 12,
                                    backgroundColor: 'var(--brand)', color: '#fff',
                                    border: 'none', fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                                    opacity: isGenerating ? 0.7 : 1
                                }}
                            >
                                {isGenerating ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                                {activeProject.summary ? '重新提炼' : '一键 AI 提炼综述'}
                            </button>
                        </div>

                        {(activeProject.summary || activeProject.ai_profile) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {activeProject.ai_profile && (
                                    <div style={{
                                        padding: '16px 18px',
                                        borderRadius: 14,
                                        backgroundColor: 'var(--popover-bg)',
                                        border: '1px solid var(--popover-border)',
                                        boxShadow: 'var(--popover-shadow)',
                                        color: 'var(--text-secondary)',
                                        fontSize: 12,
                                        lineHeight: 1.7
                                    }}>
                                        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 6 }}>AI 项目画像</div>
                                        <div>{activeProject.ai_profile}</div>
                                    </div>
                                )}
                                {activeProject.summary && (
                                    <div className="prose prose-sm dark:prose-invert max-w-none" style={{ 
                                        color: 'var(--text-primary)', 
                                        lineHeight: 1.7, 
                                        fontSize: 14,
                                        backgroundColor: 'var(--popover-bg)',
                                        padding: '24px',
                                        borderRadius: '16px',
                                        border: '1px solid var(--popover-border)',
                                        boxShadow: 'var(--popover-shadow)'
                                    }}>
                                        <div dangerouslySetInnerHTML={{ __html: formatMarkdown(activeProject.summary) }} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ 
                                flex: 1, display: 'flex', flexDirection: 'column', 
                                alignItems: 'center', justifyContent: 'center', 
                                padding: '60px 40px', color: 'var(--text-faint)',
                                backgroundColor: 'var(--popover-bg)', borderRadius: 16,
                                border: '1.5px dashed var(--popover-border)',
                                boxShadow: 'var(--popover-shadow)'
                            }}>
                                <Sparkles size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                                <p style={{ fontSize: 14, margin: 0 }}>尚未生成项目提炼说明</p>
                                <p style={{ fontSize: 12, marginTop: 8 }}>点击右上角按钮，AI 将分析所有项目资料并为您生成深度综述。</p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        
                        {/* Project Context */}
                        <div style={sectionStyle}>
                            <h4 style={{ ...sectionTitleStyle, fontSize: 15, marginBottom: 16 }}>基础背景</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <InfoItem icon={<MapPin size={14} />} label="所属地市" value={activeProject.city || '未填写'} />
                                <InfoItem icon={<User size={14} />} label="项目编号" value={activeProject.number || '未填写'} />
                                <InfoItem icon={<Layers size={14} />} label="业务类型" value={activeProject.project_type || '未填写'} />
                            </div>
                        </div>

                        {/* File Distribution */}
                        <div style={sectionStyle}>
                            <h4 style={{ ...sectionTitleStyle, fontSize: 15, marginBottom: 16 }}>资料分布</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {Object.entries(fileCounts).length > 0 ? (
                                    Object.entries(fileCounts).map(([cat, count]: [string, any]) => (
                                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{cat}</span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', backgroundColor: 'var(--brand-subtle)', padding: '2px 8px', borderRadius: 6 }}>{count}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>暂无文件资料</div>
                                )}
                            </div>
                        </div>

                        <div style={{ 
                            padding: '16px', borderRadius: 16, 
                            backgroundColor: 'var(--brand-subtle)', 
                            border: '1px solid var(--brand)',
                            display: 'flex', gap: 12
                        }}>
                            <AlertCircle size={18} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--brand-text)', lineHeight: 1.5 }}>
                                综述信息已保存至项目库。下次进入项目时，AI 将直接读取以上精炼信息以节省 Token 并提高响应速度。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Utils & Styles
const cardStyle: React.CSSProperties = {
    padding: '20px', backgroundColor: 'var(--bg-raised)',
    border: '1.5px solid var(--border)', borderRadius: 20,
    display: 'flex', alignItems: 'center', gap: 16,
};
const iconBoxStyle = (color: string): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: color + '15', color: color
});
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const valueStyle: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 };
const sectionStyle: React.CSSProperties = {
    padding: '24px', backgroundColor: 'var(--bg-raised)',
    border: '1.5px solid var(--border)', borderRadius: 24,
};
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 };

const InfoItem = ({ icon, label, value }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: 'var(--text-faint)' }}>{icon}</div>
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{value}</div>
        </div>
    </div>
);

// Simple Markdown Formatter (can be replaced by a proper lib if available)
const formatMarkdown = (text: string) => {
    return text
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\n\n/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');
};
