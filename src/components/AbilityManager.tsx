import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  Zap, 
  Database, 
  Settings, 
  Code, 
  Download, 
  Upload, 
  Globe, 
  Library, 
  Edit3, 
  Plus, 
  Search,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Copy,
  Layout,
  Github,
  Server,
  X,
  Bot,
  FileText,
  MessageSquare,
  Play,
  Save,
  ArrowLeft,
  Send,
  Cpu,
  Wrench,
  Package,
  Terminal,
  Clipboard,
  Compass,
  BookOpen,
  Cog
} from 'lucide-react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  ReactFlowProvider,
  BackgroundVariant,
  useReactFlow,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// --- Types ---
type TabType = 'market' | 'library' | 'agent';
type CategoryType = 'all' | 'mcp' | 'workflow' | 'script';

interface SkillItem {
  id: string;
  name: string;
  nameZh?: string;
  description: string;
  author: string;
  version: string;
  type: 'mcp' | 'workflow' | 'script';
  installed: boolean;
  downloads?: number;
  sourceUrl?: string;
  translation?: string;
  npmPackage?: string;
  installMethod?: string; // 'npx' | 'pip' | 'zip' | 'docker'
  source?: string; // 'local' | 'npm' | 'curated'
  launchCommand?: string;
}

interface RepoSource {
  id: string;
  url: string;
  name: string;
  type: 'github' | 'custom';
}

const MOCK_MARKET_SKILLS: SkillItem[] = [
  { 
    id: '1', 
    name: 'n8n-mcp', 
    description: 'Offical n8n MCP server for workflow orchestration.', 
    translation: 'n8n 官方 MCP 服务，支持工作流节点深度调用与自动化编排。',
    author: 'n8n-io', 
    version: '1.0.0', 
    type: 'mcp', 
    installed: false, 
    downloads: 1240, 
    sourceUrl: 'https://github.com/n8n-io/mcp-server-n8n' 
  },
  { 
    id: '2', 
    name: 'gemini-cli', 
    description: 'Google Gemini integration for terminal and tool calling.', 
    translation: 'Google Gemini 官方集成，支持终端交互与大模型工具调用能力。',
    author: 'google-gemini', 
    version: '1.0.0', 
    type: 'mcp', 
    installed: false, 
    downloads: 850, 
    sourceUrl: 'https://github.com/google-gemini/gemini-cli' 
  },
  { 
    id: '3', 
    name: 'context7', 
    description: 'Context enhancement for LLM code analysis.', 
    translation: '深度代码上下文增强工具，大幅提升大模型分析代码的准确性。',
    author: 'upstash', 
    version: '1.0.0', 
    type: 'mcp', 
    installed: false, 
    downloads: 3200, 
    sourceUrl: 'https://github.com/upstash/mcp-server-context7' 
  },
];

// ═══════════════════════════════════════════════
// Built-in Tools: matches agent.rs get_builtin_tools()
// ═══════════════════════════════════════════════
interface BuiltinTool {
  name: string;
  label: string;
  description: string;
  category: 'file' | 'system' | 'project' | 'browser' | 'mcp';
}

const BUILTIN_TOOLS: BuiltinTool[] = [
  // File tools
  { name: 'file_read', label: '读取文件', description: '读取文本文件的内容', category: 'file' },
  { name: 'file_write', label: '写入文件', description: '写入或覆盖文件内容', category: 'file' },
  { name: 'file_create', label: '创建文件', description: '创建新文件或目录', category: 'file' },
  { name: 'file_delete', label: '删除文件', description: '删除指定文件', category: 'file' },
  { name: 'file_move', label: '移动文件', description: '移动或重命名文件', category: 'file' },
  { name: 'file_list', label: '列出目录', description: '列出目录下所有文件', category: 'file' },
  { name: 'file_search', label: '搜索文件', description: '在文件内容中搜索关键词', category: 'file' },
  // System
  { name: 'shell_run', label: '执行命令', description: '在本地执行 shell 命令', category: 'system' },
  // Project
  { name: 'project_list', label: '项目列表', description: '列出所有项目信息', category: 'project' },
  { name: 'project_files', label: '项目文件', description: '列出指定项目的文件', category: 'project' },
  { name: 'project_context', label: '项目上下文', description: '获取项目设计上下文', category: 'project' },
  // Browser
  { name: 'browser_open', label: '打开网页', description: '在自动化浏览器中打开 URL', category: 'browser' },
  { name: 'browser_fill', label: '填写表单', description: '在网页中填写输入框', category: 'browser' },
  { name: 'browser_click', label: '点击元素', description: '点击网页上的按钮或链接', category: 'browser' },
  { name: 'browser_extract', label: '提取内容', description: '提取当前网页的文本摘要', category: 'browser' },
  { name: 'browser_scroll', label: '滚动页面', description: '滚动网页页面', category: 'browser' },
  // MCP
  { name: 'mcp_list_tools', label: 'MCP 列表', description: '列出已连接 MCP 的所有工具', category: 'mcp' },
  { name: 'mcp_call_tool', label: 'MCP 调用', description: '调用 MCP Server 上的工具', category: 'mcp' },
  // Template
  { name: 'template_list', label: '模板列表', description: '列出所有设计模板', category: 'template' },
  { name: 'template_create', label: '创建模板', description: '从文件创建新模板', category: 'template' },
  // Common Info
  { name: 'common_info_list', label: '通用信息', description: '列出所有通用参考信息', category: 'info' },
  { name: 'common_info_update', label: '更新信息', description: '创建或更新通用参考条目', category: 'info' },
  // Survey
  { name: 'survey_get', label: '获取勘察', description: '获取项目的勘察数据', category: 'survey' },
  { name: 'survey_update', label: '更新勘察', description: '更新勘察日期/地点/摘要', category: 'survey' },
  // AI
  { name: 'ai_chat', label: 'AI 对话', description: '调用已配置的大模型进行对话', category: 'ai' },
  { name: 'rag_query', label: '知识检索', description: '在已索引文档中进行语义检索', category: 'ai' },
  // Automation
  { name: 'automation_list', label: '方案列表', description: '列出自动化方案', category: 'automation' },
  { name: 'automation_run', label: '执行方案', description: '执行指定的自动化方案', category: 'automation' },
];

const CATEGORY_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  file: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  system: { icon: Terminal, color: 'text-orange-500', bg: 'bg-orange-50' },
  project: { icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  browser: { icon: Globe, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  mcp: { icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50' },
  template: { icon: Clipboard, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  info: { icon: BookOpen, color: 'text-teal-500', bg: 'bg-teal-50' },
  survey: { icon: Compass, color: 'text-rose-500', bg: 'bg-rose-50' },
  ai: { icon: Cpu, color: 'text-violet-500', bg: 'bg-violet-50' },
  automation: { icon: Cog, color: 'text-amber-500', bg: 'bg-amber-50' },
};

const INITIAL_REPOS: RepoSource[] = [
  { id: 'default', name: 'OpenClaw Official', url: 'https://market.openclaw.io', type: 'custom' },
  { id: 'github-official', name: 'Official Skills Repo', url: 'github:openclaw/skills', type: 'github' },
];

// --- Custom Node Components ---
const CustomNode = ({ data, selected, type }: any) => {
  const configs = {
    skill: { icon: Zap, color: 'border-purple-500', bg: 'bg-purple-50', label: 'AI 技能' },
    input: { icon: Database, color: 'border-blue-500', bg: 'bg-blue-50', label: '项目数据' },
    llm: { icon: Settings, color: 'border-orange-500', bg: 'bg-orange-50', label: '处理器' },
    script: { icon: Code, color: 'border-emerald-500', bg: 'bg-emerald-50', label: '脚本' },
  }[type as keyof typeof nodeTypes] || { icon: Plus, color: 'border-slate-300', bg: 'bg-slate-50', label: '节点' };

  return (
    <div className={`px-4 py-3 shadow-xl rounded-xl bg-white border-2 transition-all ${selected ? configs.color : 'border-slate-200'} min-w-[200px]`}>
      <div className="flex items-center mb-1">
        <div className={`p-1.5 rounded-lg ${configs.bg} mr-2`}>
          <configs.icon size={14} className={configs.color.replace('border-', 'text-')} />
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{configs.label}</div>
          <div className="text-sm font-bold text-slate-800">{data.label}</div>
        </div>
      </div>
      {data.status && <div className="text-[9px] text-slate-400 mt-1 italic">{data.status}</div>}
    </div>
  );
};

const nodeTypes = {
  skill: (props: any) => <CustomNode {...props} type="skill" />,
  input: (props: any) => <CustomNode {...props} type="input" />,
  llm: (props: any) => <CustomNode {...props} type="llm" />,
  script: (props: any) => <CustomNode {...props} type="script" />,
};

// --- Modal Component ---
const SourceSettingsModal = ({ onClose, repos, setRepos }: any) => {
  const [newUrl, setNewUrl] = useState('');
  
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">管理下载源</h3>
            <p className="text-xs text-slate-400 mt-1">配置技能市场同步的远程仓库地址</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="space-y-3">
            {repos.map((repo: any) => (
              <div key={repo.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-xl shadow-sm">
                    {repo.type === 'github' ? <Github size={18} className="text-slate-800" /> : <Server size={18} className="text-blue-500" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-700">{repo.name}</div>
                    <div className="text-[10px] text-slate-400">{repo.url}</div>
                  </div>
                </div>
                {repo.id !== 'default' && (
                  <button 
                    onClick={() => setRepos(repos.filter((r: any) => r.id !== repo.id))}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <div className="pt-4 border-t border-slate-100">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">添加新源</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="例如: github:user/repo 或 https://..." 
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-blue-500 transition-all"
              />
              <button 
                onClick={() => {
                  if (!newUrl) return;
                  const id = `repo_${Date.now()}`;
                  setRepos([...repos, { id, name: '三方仓库', url: newUrl, type: newUrl.includes('github') ? 'github' : 'custom' }]);
                  setNewUrl('');
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Components ---
const SkillHubMarket = ({ onInstall }: { onInstall: (skill: SkillItem) => void }) => {
  const [skills, setSkills] = useState<SkillItem[]>(MOCK_MARKET_SKILLS);
  const [category, setCategory] = useState<CategoryType>('all');
  const [marketType, setMarketType] = useState<'mcp' | 'skill'>('mcp');
  const [showSources, setShowSources] = useState(false);
  const [repos, setRepos] = useState<RepoSource[]>(INITIAL_REPOS);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleInstall = async (skill: SkillItem) => {
    const npmPkg = (skill as any).npmPackage;
    const sourceUrl = skill.sourceUrl || '';
    
    if (!npmPkg && !sourceUrl) {
      alert('无法导入：该技能缺少有效的源地址。');
      return;
    }
    try {
      if (npmPkg) {
        // npm-based install
        await invoke('mcp_install_npm', { 
          packageName: npmPkg, 
          displayName: skill.name 
        });
      } else {
        // ZIP/GitHub install
        await invoke('mcp_install_from_source', { 
          sourceUrl, 
          name: skill.name 
        });
      }
      
      onInstall(skill);
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, installed: true } : s));
      alert(`成功导入: ${skill.name}`);
    } catch (e) {
      alert(`导入失败: ${e}`);
    }
  };

  const [urlToInstall, setUrlToInstall] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);

  const handleRemoteInstall = async () => {
    if (!urlToInstall) return;
    setIsInstalling(true);
    try {
      // Basic name parsing from URL: https://github.com/user/repo -> repo
      const name = urlToInstall.split('/').pop()?.replace('.git', '') || 'remote-skill';
      await invoke('mcp_install_from_source', { sourceUrl: urlToInstall, name });
      alert(`远程安装成功: ${name}`);
      setUrlToInstall('');
      onInstall({ id: `remote_${Date.now()}`, name, description: '远程安装的技能', author: 'Remote', version: '1.0.0', type: 'mcp', installed: true });
    } catch (e) {
      alert(`远程安装失败: ${e}`);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSkills([]); // Clear current skills to show fresh results
    try {
      const results: any = await invoke('mcp_sync_skills', { marketType: marketType });
      setSkills(results);
    } catch (e) {
      alert('同步失败: ' + e);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredSkills = skills.filter(skill => {
    if (category === 'all') return true;
    return skill.type === category;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 pb-32">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-6">
           <div className="p-4 bg-slate-900 rounded-[28px] shadow-2xl">
             <Globe className="text-blue-400" size={32} />
           </div>
           <div>
             <h2 className="text-3xl font-black text-slate-800 tracking-tighter">全球资源中心</h2>
             <p className="text-slate-400 mt-1 font-medium italic">正在通过爬虫协议实时索引互联网核心资产...</p>
           </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group/search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="搜索全网技能/MCP..." 
              className="pl-10 pr-6 py-3 bg-white border border-slate-200 rounded-2xl w-80 text-sm outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm font-bold"
            />
          </div>
          <button 
            onClick={() => setShowSources(true)}
            className="p-3.5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:shadow-xl transition-all active:scale-95 group"
          >
            <Settings size={22} className="group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </div>

      {/* Import Methods Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        <div className="bg-blue-50/50 border-2 border-dashed border-blue-200 rounded-[32px] p-8 flex items-center justify-between group hover:border-blue-400 transition-all">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-blue-100/50 rounded-2xl text-blue-600 group-hover:scale-110 transition-transform">
              <Upload size={24} />
            </div>
            <div>
              <h4 className="font-black text-slate-800">拖拽或导入本地包</h4>
              <p className="text-xs text-blue-600/60 font-medium">支持 .zip / .skill 格式的一键解析</p>
            </div>
          </div>
          <button className="px-6 py-3 bg-white border border-blue-200 rounded-xl font-bold text-sm text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm">浏览文件</button>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-[32px] p-8 flex items-center gap-6 group hover:border-slate-300 transition-all">
          <div className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-600 shadow-sm group-hover:rotate-12 transition-transform">
            <Plus size={24} />
          </div>
          <div className="flex-1 space-y-3">
             <div className="flex justify-between items-center">
               <h4 className="font-black text-slate-800">通过 URL 远程安装</h4>
               <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-black uppercase">GitHub / URL</span>
             </div>
             <div className="flex gap-2">
                <input 
                  type="text" 
                  value={urlToInstall}
                  onChange={(e) => setUrlToInstall(e.target.value)}
                  placeholder="输入 GitHub 仓库地址..."
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-blue-500"
                />
                <button 
                  onClick={handleRemoteInstall}
                  disabled={isInstalling || !urlToInstall}
                  className={`p-2 rounded-xl transition-colors ${isInstalling ? 'bg-slate-300' : 'bg-slate-900 text-white hover:bg-black'}`}
                >
                  {isInstalling ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={16} />}
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* Primary Hub Switch */}
      <div className="flex bg-slate-100 p-1.5 rounded-[24px] w-fit mb-10 border border-slate-200 shadow-inner">
        <button 
          onClick={() => { setMarketType('mcp'); setSkills([]); }}
          className={`px-10 py-3 rounded-[20px] text-sm font-black transition-all flex items-center gap-3 ${marketType === 'mcp' ? 'bg-white text-blue-600 shadow-xl scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>
          <Server size={18} /> MCP 生态广场
        </button>
        <button 
          onClick={() => { setMarketType('skill'); setSkills([]); }}
          className={`px-10 py-3 rounded-[20px] text-sm font-black transition-all flex items-center gap-3 ${marketType === 'skill' ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>
          <Database size={18} /> 复合技能大厅
        </button>
      </div>

      {/* Category & Action */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          {[
            { id: 'all', label: marketType === 'mcp' ? '所有 MCP' : '所有技能' },
            { id: 'mcp', label: '原子节点', type: 'mcp' },
            { id: 'workflow', label: '逻辑流', type: 'workflow' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id as CategoryType)}
              className={`px-6 py-2 rounded-xl text-[11px] font-black transition-all ${
                category === cat.id 
                  ? 'bg-slate-900 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className={`px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-3 transition-all active:scale-95 ${
            isSyncing ? 'bg-slate-100 text-slate-400 outline-none' : 'bg-blue-600 text-white shadow-xl shadow-blue-500/30 hover:bg-blue-700'
          }`}
        >
          {isSyncing ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <Download size={18} />}
          {isSyncing ? '正在爬取全球源...' : '全网同步索引'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredSkills.length > 0 ? filteredSkills.map(skill => (
          <div key={skill.id} className="group bg-white border border-slate-200 rounded-[32px] p-8 hover:shadow-2xl hover:border-blue-400 transition-all cursor-pointer relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  navigator.clipboard.writeText(skill.sourceUrl || '');
                  alert('链接已复制到剪贴板');
                }}
                className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 hover:text-blue-500 transition-all hover:shadow-md"
                title="复制原始地址"
              >
                <Copy size={16} />
              </button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  invoke('mcp_open_url', { url: skill.sourceUrl || '' });
                }}
                className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 hover:text-blue-500 transition-all hover:shadow-md"
                title="前往 GitHub 验证"
              >
                <ExternalLink size={16} />
              </button>
            </div>
            {/* Rest of the Card UI remains same... */}
            <div className="flex items-start gap-5 mb-6">
              <div className={`p-4 rounded-[22px] shadow-lg shadow-current/5 ${skill.type === 'mcp' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                {skill.type === 'mcp' ? <Zap size={28} /> : <Layout size={28} />}
              </div>
              <div className="flex-1">
                <h3 className="font-black text-slate-800 text-xl group-hover:text-blue-600 transition-colors tracking-tight line-clamp-1">{skill.name}</h3>
                {skill.nameZh && (
                  <p className="text-[11px] text-blue-500/70 font-bold mt-0.5 line-clamp-1">{skill.nameZh}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-black tracking-widest uppercase truncate max-w-[120px]">
                    {skill.author}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">v{skill.version}</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4 line-clamp-1 leading-relaxed italic h-4">{skill.description}</p>
            
            {skill.translation && (
              <div className="mb-8 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 relative overflow-hidden group/trans">
                <div className="absolute top-0 right-0 px-2 py-0.5 bg-blue-100 text-[8px] text-blue-500 font-black rounded-bl-lg uppercase tracking-widest">中文详述</div>
                <p className="text-sm text-slate-700 font-bold leading-6 line-clamp-2">
                  {skill.translation}
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 mb-8">
               <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">安装方式</div>
                  <div className="flex items-center gap-1.5">
                     <Package size={10} className="text-slate-500" />
                     <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-md ${
                       (skill as any).installMethod === 'npx' ? 'bg-green-100 text-green-700' :
                       (skill as any).installMethod === 'pip' ? 'bg-yellow-100 text-yellow-700' :
                       'bg-slate-100 text-slate-600'
                     }`}>{(skill as any).installMethod || 'zip'}</span>
                  </div>
               </div>
               <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">Stars</div>
                  <div className="flex items-center gap-1.5 text-orange-500">
                     <Zap size={10} fill="currentColor" />
                     <span className="text-[11px] font-black uppercase">{(skill.downloads || 0).toLocaleString()}</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-50">
              <div className="flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{(skill as any).npmPackage ? 'npm' : 'source'}</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleInstall(skill);
                }}
                className={`flex items-center gap-2 px-6 py-3 rounded-[18px] text-sm font-black transition-all ${skill.installed ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-slate-900 text-white hover:bg-black shadow-xl active:scale-95'}`}
              >
                {skill.installed ? <><CheckCircle2 size={18} /> 已就绪</> : <><Download size={18} /> {(skill as any).installMethod === 'npx' ? 'npm 安装' : '导入到库'}</>}
              </button>
            </div>
          </div>
        )) : (
          <div className="col-span-3 py-32 flex flex-col items-center text-center">
            <div className="p-10 bg-white rounded-[40px] shadow-2xl mb-8 group-hover:scale-110 transition-transform duration-500">
              <Globe size={80} className="text-slate-100 animate-pulse" />
            </div>
            <h3 className="text-2xl font-black text-slate-300 tracking-tight mb-4">准备爬取互联网核心资源...</h3>
            <p className="text-sm text-slate-300 max-w-xs leading-relaxed font-bold">请点击右上角的“全网同步”按钮，我们将立即根据您的源设置，从 GitHub 等平台索引最新能力包。</p>
          </div>
        )}
      </div>

      {showSources && <SourceSettingsModal onClose={() => setShowSources(false)} repos={repos} setRepos={setRepos} />}
    </div>
  );
};

// --- Agent Module Types ---
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
}

const AGENTS_CACHE_KEY = 'openclaw_agents';

const loadAgents = (): AgentConfig[] => {
  try {
    const cached = localStorage.getItem(AGENTS_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch { return []; }
};

const saveAgents = (agents: AgentConfig[]) => {
  localStorage.setItem(AGENTS_CACHE_KEY, JSON.stringify(agents));
};

// --- Agent Node Components ---
const AgentNode = ({ data, selected, type }: any) => {
  const configs: Record<string, { icon: any; color: string; bg: string; borderColor: string; handleColor: string; label: string }> = {
    'agent-mcp': { icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50', borderColor: 'border-purple-400', handleColor: '#a855f7', label: 'MCP 工具' },
    'agent-skill': { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', borderColor: 'border-blue-400', handleColor: '#3b82f6', label: 'Skill 知识' },
    'agent-file': { icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-50', borderColor: 'border-emerald-400', handleColor: '#10b981', label: '文件/数据' },
    'agent-instruction': { icon: Edit3, color: 'text-amber-500', bg: 'bg-amber-50', borderColor: 'border-amber-400', handleColor: '#f59e0b', label: '自定义指令' },
    'agent-llm': { icon: Cpu, color: 'text-rose-500', bg: 'bg-rose-50', borderColor: 'border-rose-400', handleColor: '#f43f5e', label: 'LLM 大模型' },
    'agent-output': { icon: MessageSquare, color: 'text-teal-500', bg: 'bg-teal-50', borderColor: 'border-teal-400', handleColor: '#14b8a6', label: '输出/对话' },
  };
  const config = configs[type] || { icon: Plus, color: 'text-slate-400', bg: 'bg-slate-50', borderColor: 'border-slate-300', handleColor: '#94a3b8', label: '节点' };
  const IconComp = config.icon;

  return (
    <div className={`px-5 py-4 shadow-xl rounded-2xl bg-white border-2 transition-all ${selected ? config.borderColor : 'border-slate-200'} min-w-[200px] hover:shadow-2xl relative`}>
      {/* Target Handle (left side - receives connections) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 12, height: 12, background: config.handleColor, border: '2px solid white', borderRadius: '50%', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
      />
      <div className="flex items-center gap-3 mb-1">
        <div className={`p-2 rounded-xl ${config.bg}`}>
          <IconComp size={16} className={config.color} />
        </div>
        <div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">{config.label}</div>
          <div className="text-sm font-bold text-slate-800">{data.label}</div>
        </div>
      </div>
      {data.detail && <div className="text-[10px] text-slate-400 mt-1 italic line-clamp-2">{data.detail}</div>}
      {data.model && <div className="mt-2 px-2 py-1 bg-rose-50 rounded-lg text-[10px] font-bold text-rose-600 inline-block">{data.model}</div>}
      {/* Source Handle (right side - sends connections) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 12, height: 12, background: config.handleColor, border: '2px solid white', borderRadius: '50%', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
      />
    </div>
  );
};

const agentNodeTypes = {
  'agent-mcp': (props: any) => <AgentNode {...props} type="agent-mcp" />,
  'agent-skill': (props: any) => <AgentNode {...props} type="agent-skill" />,
  'agent-file': (props: any) => <AgentNode {...props} type="agent-file" />,
  'agent-instruction': (props: any) => <AgentNode {...props} type="agent-instruction" />,
  'agent-llm': (props: any) => <AgentNode {...props} type="agent-llm" />,
  'agent-output': (props: any) => <AgentNode {...props} type="agent-output" />,
  'agent-exec': ({ data, selected }: any) => {
    const stepColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      'planning': { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', icon: '📋' },
      'tool_call': { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700', icon: '⚡' },
      'tool_result': { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', icon: '✅' },
      'tool_done': { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', icon: '✅' },
      'reflection': { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', icon: '🔄' },
      'thinking': { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', icon: '🧠' },
      'final': { bg: 'bg-teal-50', border: 'border-teal-400', text: 'text-teal-700', icon: '🎯' },
      'goal': { bg: 'bg-indigo-100', border: 'border-indigo-500', text: 'text-indigo-800', icon: '🚀' },
    };
    const c = stepColors[data.stepType] || stepColors['thinking'];
    return (
      <div className={`px-4 py-3 rounded-2xl border-2 shadow-lg min-w-[180px] max-w-[260px] ${c.bg} ${selected ? c.border : 'border-white/60'} ${data.active ? 'animate-pulse ring-2 ring-offset-2 ring-blue-400' : ''} transition-all`}>
        <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: '#6366f1', border: '2px solid white', borderRadius: '50%' }} />
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{c.icon}</span>
          <span className={`text-[10px] font-black uppercase tracking-widest ${c.text}`}>{data.stepLabel || data.stepType}</span>
          {data.duration && <span className="text-[8px] text-slate-400 ml-auto">{data.duration}ms</span>}
        </div>
        <div className={`text-xs font-bold ${c.text} line-clamp-2`}>{data.label}</div>
        {data.detail && <div className="text-[9px] text-slate-400 mt-1 line-clamp-2 italic">{data.detail}</div>}
        <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: '#6366f1', border: '2px solid white', borderRadius: '50%' }} />
      </div>
    );
  },
};

const DEFAULT_AGENT_NODES: Node[] = [
  { id: 'llm_1', position: { x: 450, y: 250 }, data: { label: '选择大模型', model: '未选择', detail: '所有 Skill/MCP 节点连接到此节点' }, type: 'agent-llm' },
  { id: 'output_1', position: { x: 800, y: 250 }, data: { label: '对话输出', detail: 'Agent 的最终回答' }, type: 'agent-output' },
];
const DEFAULT_AGENT_EDGES: Edge[] = [
  { id: 'e_llm_out', source: 'llm_1', target: 'output_1', animated: true, style: { stroke: '#f43f5e', strokeWidth: 3 } },
];

// --- Agent Editor Component ---
const AgentEditor = ({ agent, onBack, onSave, installedSkills }: { agent: AgentConfig; onBack: () => void; onSave: (a: AgentConfig) => void; installedSkills: SkillItem[] }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(agent.nodes.length > 0 ? agent.nodes : DEFAULT_AGENT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(agent.edges.length > 0 ? agent.edges : DEFAULT_AGENT_EDGES);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [agentName, setAgentName] = useState(agent.name);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string; content: string; steps?: any[]}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentSteps, setAgentSteps] = useState<any[]>([]);
  const [expandedSections, setExpandedSections] = useState<{builtin: boolean; mcp: boolean; skill: boolean}>({ builtin: true, mcp: true, skill: false });
  const [assetSearch, setAssetSearch] = useState('');
  // Five-layer Agent: Model selection & task tracking
  const [aiConfigs, setAiConfigs] = useState<{id: string; name: string; provider: string; model_name: string}[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [agentPlan, setAgentPlan] = useState<string>('');
  // Canvas execution visualization
  const savedCanvasRef = useRef<{nodes: Node[]; edges: Edge[]} | null>(null);
  const execNodeCountRef = useRef(0);
  // Agent Configuration Form
  const [agentDesc, setAgentDesc] = useState(agent.description || '');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set(BUILTIN_TOOLS.map(t => t.name)));
  const [configSection, setConfigSection] = useState<string>('tools');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Split installed skills into MCP and Skill categories
  const mcpSkills = installedSkills.filter(s => s.type === 'mcp');
  const skillItems = installedSkills.filter(s => s.type !== 'mcp');

  // Fetch available AI configs for model selector
  useEffect(() => {
    invoke('list_ai_configs').then((configs: any) => {
      if (Array.isArray(configs) && configs.length > 0) {
        setAiConfigs(configs);
        // Auto-select the first active config
        const active = configs.find((c: any) => c.is_active) || configs[0];
        if (active && !selectedModelId) setSelectedModelId(active.id);
      }
    }).catch(() => {});
  }, []);

  // Helper to update node data
  const updateNodeData = (nodeId: string, newData: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    setSelectedNode(prev => prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev);
  };

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }, eds)), [setEdges]);
  const onNodeClick = (_: any, node: Node) => setSelectedNode(node);

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string, detail: string) => {
    const payload = JSON.stringify({ nodeType, label, detail });
    event.dataTransfer.setData('application/reactflow', payload);
    event.dataTransfer.setData('text/plain', payload); // Fallback for Tauri WebView2
    event.dataTransfer.effectAllowed = 'move';
    console.log('[DnD] dragStart:', nodeType, label);
  };

  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: any) => {
    event.preventDefault();
    // Try both MIME types for maximum compatibility
    const raw = event.dataTransfer.getData('application/reactflow')
      || event.dataTransfer.getData('text/plain')
      || event.dataTransfer.getData('text');
    console.log('[DnD] drop raw data:', raw);
    if (!raw) {
      console.warn('[DnD] No drag data found in drop event');
      return;
    }
    try {
      const { nodeType, label, detail } = JSON.parse(raw);
      if (!nodeType) {
        console.warn('[DnD] nodeType missing from drag data');
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      console.log('[DnD] creating node at position:', position);

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: nodeType,
        position,
        data: { label, detail },
      };
      setNodes((nds) => nds.concat(newNode));
      console.log('[DnD] node created successfully:', newNode.id);
    } catch (err) {
      console.error('[DnD] Drop handling failed:', err);
    }
  }, [screenToFlowPosition, setNodes]);

  // Native DOM listeners as ultimate fallback — guaranteed to work in Tauri WebView2
  useEffect(() => {
    const el = reactFlowWrapper.current;
    if (!el) return;
    const handleNativeDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };
    const handleNativeDrop = (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      const raw = e.dataTransfer.getData('application/reactflow')
        || e.dataTransfer.getData('text/plain')
        || e.dataTransfer.getData('text');
      if (!raw) return;
      try {
        const { nodeType, label, detail } = JSON.parse(raw);
        if (!nodeType) return;
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const newNode: Node = { id: `node_${Date.now()}`, type: nodeType, position, data: { label, detail } };
        setNodes((nds) => nds.concat(newNode));
        console.log('[DnD native] node created:', newNode.id);
      } catch (err) {
        console.error('[DnD native] failed:', err);
      }
    };
    el.addEventListener('dragover', handleNativeDragOver, true); // capture phase
    el.addEventListener('drop', handleNativeDrop, true); // capture phase
    return () => {
      el.removeEventListener('dragover', handleNativeDragOver, true);
      el.removeEventListener('drop', handleNativeDrop, true);
    };
  }, [screenToFlowPosition, setNodes]);

  const handleSave = () => {
    onSave({ ...agent, name: agentName, nodes, edges, updatedAt: new Date().toISOString() });
  };

  // Compile agent: convert visual flow to Prompt + Tools + Model
  const compileAgent = () => {
    const llmNode = nodes.find(n => n.type === 'agent-llm');
    const connectedNodeIds = edges.filter(e => e.target === llmNode?.id).map(e => e.source);
    const connectedNodes = nodes.filter(n => connectedNodeIds.includes(n.id));
    
    const skills = connectedNodes.filter(n => n.type === 'agent-skill');
    const mcps = connectedNodes.filter(n => n.type === 'agent-mcp');
    const files = connectedNodes.filter(n => n.type === 'agent-file');
    const instructions = connectedNodes.filter(n => n.type === 'agent-instruction');

    let systemPrompt = '';
    instructions.forEach(n => { systemPrompt += (n.data.detail || n.data.label) + '\n'; });
    skills.forEach(n => { systemPrompt += `[Skill: ${n.data.label}] ${n.data.detail || ''}\n`; });
    files.forEach(n => { systemPrompt += `[Context: ${n.data.label}] ${n.data.detail || ''}\n`; });

    const tools = mcps.map(n => ({
      type: 'function',
      function: { name: (n.data.label as string)?.replace(/[^a-zA-Z0-9_]/g, '_') || 'tool', description: (n.data.detail as string) || (n.data.label as string) }
    }));

    return { systemPrompt, tools, model: (llmNode?.data.model as string) || 'unknown', agentName };
  };

  const handleTestChat = async () => {
    if (!chatInput.trim() || isAgentRunning) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAgentRunning(true);
    setAgentSteps([]);

    // Subscribe to real-time agent events
    const unlisten = await listen<any>('agent-event', (event) => {
      const data = event.payload;
      if (data.step) {
        setAgentSteps(prev => [...prev, data.step]);
        // Capture planning step content
        if (data.step.step_type === 'planning' && data.step.content) {
          setAgentPlan(data.step.content);
        }
        // === Canvas Visualization: clean horizontal chain ===
        const step = data.step;

        // tool_result: merge into previous tool_call node instead of creating new node
        if (step.step_type === 'tool_result') {
          setNodes(nds => nds.map(n => {
            if (n.id.startsWith('exec_') && n.data.stepType === 'tool_call' && n.data.label === step.tool_name && n.data.active) {
              return {
                ...n,
                data: {
                  ...n.data,
                  active: false,
                  stepType: 'tool_done',
                  stepLabel: '✅ 完成',
                  detail: (step.tool_result || '').slice(0, 60),
                  duration: step.duration_ms,
                }
              };
            }
            return n;
          }));
          return;
        }

        // Only create nodes for: planning, tool_call, reflection, final
        if (['planning', 'tool_call', 'reflection', 'final'].includes(step.step_type)) {
          execNodeCountRef.current += 1;
          const idx = execNodeCountRef.current;
          // Horizontal chain: 3 per row, then wrap down
          const row = Math.floor((idx - 1) / 3);
          const col = (idx - 1) % 3;
          const x = 420 + col * 320;
          const y = 120 + row * 180;
          const nodeId = `exec_${idx}`;
          const prevId = idx === 1 ? 'exec_goal' : `exec_${idx - 1}`;

          const stepLabel = step.step_type === 'planning' ? '📋 任务规划'
            : step.step_type === 'tool_call' ? '⚡ 工具调用'
            : step.step_type === 'reflection' ? '🔄 反思'
            : '🎯 完成';

          const label = step.tool_name || stepLabel;
          const detail = step.step_type === 'planning'
            ? (step.content || '').replace('📋 任务计划:\n', '').slice(0, 60)
            : step.step_type === 'final'
            ? (step.content || '').slice(0, 60)
            : step.tool_args ? JSON.stringify(step.tool_args).slice(0, 50) : '';

          const newNode: Node = {
            id: nodeId,
            type: 'agent-exec',
            position: { x, y },
            data: { label, detail, stepType: step.step_type, stepLabel, duration: step.duration_ms, active: step.step_type !== 'final' },
          };
          const edgeColor = step.step_type === 'reflection' ? '#f97316'
            : step.step_type === 'tool_call' ? '#a855f7'
            : step.step_type === 'final' ? '#14b8a6'
            : '#6366f1';
          const newEdge: Edge = {
            id: `e_exec_${idx}`,
            source: prevId,
            target: nodeId,
            animated: true,
            style: { stroke: edgeColor, strokeWidth: 2.5 },
          };
          setNodes(nds => {
            const updated = nds.map(n => n.id.startsWith('exec_') && n.data.active ? { ...n, data: { ...n.data, active: false } } : n);
            return [...updated, newNode];
          });
          setEdges(eds => [...eds, newEdge]);
        }
      }
    });

    try {
      const compiled = compileAgent();
      setAgentPlan('');

      // === Canvas: Save original canvas and create goal node ===
      savedCanvasRef.current = { nodes: [...nodes], edges: [...edges] };
      execNodeCountRef.current = 0;
      const goalNode: Node = {
        id: 'exec_goal',
        type: 'agent-exec',
        position: { x: 180, y: 200 },
        data: { label: userMsg.slice(0, 40), detail: '用户目标', stepType: 'goal', stepLabel: '目标', active: true },
      };
      setNodes([goalNode]);
      setEdges([]);
      const result: any = await invoke('agent_run', {
        req: {
          prompt: userMsg,
          system_prompt: systemInstruction || null,
          project_id: null,
          allowed_paths: null,
          max_rounds: 15,
          model_config_id: selectedModelId || null,
          goal: userMsg,
          task_id: null,
          enabled_tools: enabledTools.size < BUILTIN_TOOLS.length ? Array.from(enabledTools) : null,
          context_files: contextFiles.length > 0 ? contextFiles : null,
        }
      });

      // Show final result with steps
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: result.final_answer || '(Agent 未返回结果)',
        steps: result.steps || [],
      }]);
    } catch (e: any) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Agent 执行失败:\n${e?.toString() || '未知错误'}\n\n请检查 AI 设置中是否配置了支持 Function Calling 的模型（如 DeepSeek、GPT-4 等）。`,
      }]);
    } finally {
      unlisten();
      setIsAgentRunning(false);
      setAgentSteps([]);
      // Deactivate all exec nodes (keep the graph visible)
      setNodes(nds => nds.map(n => n.id.startsWith('exec_') ? { ...n, data: { ...n.data, active: false } } : n));
    }
  };



  return (
    <div className="flex flex-1 overflow-hidden animate-in fade-in duration-300">
      {/* Left: Agent Configuration Panel */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden rounded-r-2xl">
        <div className="flex items-center gap-2 p-5 pb-3 border-b border-slate-100">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-700"><ArrowLeft size={18} /></button>
          <h2 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.15em]">Agent 配置</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 1. Basic Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-blue-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">基本信息</span>
            </div>
            <input
              type="text" value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-colors"
              placeholder="Agent 名称"
            />
            <textarea
              value={agentDesc}
              onChange={(e) => setAgentDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 transition-colors resize-none"
              placeholder="Agent 描述（可选）"
              rows={2}
            />
          </div>

          {/* 2. Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-rose-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">模型选择</span>
            </div>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="">自动选择模型</option>
              {aiConfigs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.provider === 'ollama' ? '🖥️ 本地' : '☁️ 在线'} {c.name} ({c.model_name})
                </option>
              ))}
            </select>
          </div>

          {/* 3. System Instructions */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Edit3 size={14} className="text-amber-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">系统指令</span>
            </div>
            <textarea
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 transition-colors resize-none leading-relaxed"
              placeholder="定义 Agent 的角色、行为规则和限制条件...&#10;例如：你是一名通信工程项目助手，擅长处理 Excel 数据和生成项目文档。"
              rows={4}
            />
          </div>

          {/* 4. Context Files */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-emerald-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">输入文件</span>
              </div>
              {contextFiles.length > 0 && (
                <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">{contextFiles.length} 个文件</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const files = await open({ multiple: true, title: '选择输入文件' });
                    if (files) {
                      const fileList = Array.isArray(files) ? files : [files];
                      const paths = fileList.map((f: any) => typeof f === 'string' ? f : f.path);
                      setContextFiles(prev => [...prev, ...paths]);
                    }
                  } catch (e) { console.error('File dialog failed:', e); }
                }}
                className="flex-1 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-100 active:scale-95 transition-all border border-emerald-200"
              >
                <Upload size={12} /> 选择文件
              </button>
              <button
                onClick={async () => {
                  try {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const folder = await open({ directory: true, title: '选择文件夹' });
                    if (folder) {
                      const folderPath = typeof folder === 'string' ? folder : (folder as any).path || String(folder);
                      setContextFiles(prev => [...prev, `📂 ${folderPath}`]);
                    }
                  } catch (e) { console.error('Folder dialog failed:', e); }
                }}
                className="flex-1 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-100 active:scale-95 transition-all border border-emerald-200"
              >
                <Database size={12} /> 选择文件夹
              </button>
            </div>
            {contextFiles.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {contextFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-emerald-50/60 rounded-lg text-[10px] text-emerald-700 font-medium border border-emerald-100">
                    <span className="truncate flex-1 mr-2">{f.includes('📂') ? f : f.split(/[\\/]/).pop()}</span>
                    <button onClick={() => setContextFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 shrink-0"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Tool Toggles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench size={14} className="text-purple-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">可用工具</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEnabledTools(new Set(BUILTIN_TOOLS.map(t => t.name)))}
                  className="text-[9px] font-bold text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded-full hover:bg-blue-50 transition-colors"
                >全选</button>
                <button
                  onClick={() => setEnabledTools(new Set())}
                  className="text-[9px] font-bold text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded-full hover:bg-slate-50 transition-colors"
                >清空</button>
              </div>
            </div>
            <div className="text-[9px] text-slate-400 font-medium">
              已启用 {enabledTools.size}/{BUILTIN_TOOLS.length} 个工具
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(
                BUILTIN_TOOLS.reduce((acc, tool) => {
                  (acc[tool.category] = acc[tool.category] || []).push(tool);
                  return acc;
                }, {} as Record<string, BuiltinTool[]>)
              ).map(([cat, tools]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between px-1 py-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{cat}</span>
                    <button
                      onClick={() => {
                        const catTools = tools.map(t => t.name);
                        const allEnabled = catTools.every(n => enabledTools.has(n));
                        setEnabledTools(prev => {
                          const next = new Set(prev);
                          catTools.forEach(n => allEnabled ? next.delete(n) : next.add(n));
                          return next;
                        });
                      }}
                      className="text-[8px] font-bold text-blue-400 hover:text-blue-600"
                    >{tools.every(t => enabledTools.has(t.name)) ? '取消' : '全选'}</button>
                  </div>
                  {tools.map(tool => (
                    <label key={tool.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={enabledTools.has(tool.name)}
                        onChange={() => {
                          setEnabledTools(prev => {
                            const next = new Set(prev);
                            next.has(tool.name) ? next.delete(tool.name) : next.add(tool.name);
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">{tool.label}</div>
                      </div>
                      <span className="text-[8px] text-slate-300 font-mono shrink-0">{tool.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 h-full relative bg-slate-50 rounded-2xl overflow-hidden m-1"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeClick={onNodeClick}
          nodeTypes={agentNodeTypes}
          deleteKeyCode="Delete"
          edgesFocusable={true}
          fitView
          defaultEdgeOptions={{ animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <Background color="#cbd5e1" variant={BackgroundVariant.Dots} />
          <Controls className="bg-white border border-slate-200 shadow-xl rounded-xl" />
          <MiniMap className="bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden" zoomable pannable />
        </ReactFlow>

        {/* Top Bar */}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-center pointer-events-none">
          <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl px-6 py-3 shadow-xl flex items-center gap-6 pointer-events-auto">
            <div className="flex items-center gap-3">
              <Bot size={20} className="text-blue-600" />
              <input
                type="text" value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="text-sm font-black text-slate-800 bg-transparent outline-none border-b-2 border-transparent focus:border-blue-500 transition-colors w-40"
                placeholder="Agent 名称"
              />
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex gap-2">
              <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black shadow-sm hover:shadow-lg transition-all active:scale-95">
                <Save size={14} /> 保存
              </button>
              <button onClick={() => setChatOpen(!chatOpen)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 ${chatOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-900 text-white hover:bg-black shadow-lg'}`}>
                <Play size={14} /> {chatOpen ? '关闭测试' : '测试 Agent'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Properties Panel or Chat Test */}
      <div className="w-80 bg-white border-l border-slate-100 flex flex-col shrink-0 shadow-xl z-10 rounded-l-2xl">
        {chatOpen ? (
          /* Agent Test Chat Panel */
          <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${isAgentRunning ? 'bg-amber-50' : 'bg-blue-50'}`}>
                    <Bot size={18} className={isAgentRunning ? 'text-amber-600 animate-pulse' : 'text-blue-600'} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">Agent 测试</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                      {isAgentRunning ? '🟢 正在执行...' : '五层 Agent 架构'}
                    </p>
                  </div>
                </div>
                <button onClick={() => {
                setChatMessages([]); setAgentSteps([]); setAgentPlan('');
                // Restore original canvas if saved
                if (savedCanvasRef.current) {
                  setNodes(savedCanvasRef.current.nodes);
                  setEdges(savedCanvasRef.current.edges);
                  savedCanvasRef.current = null;
                }
              }} className="p-2 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
              </div>
              {/* Model Selector */}
              <div className="flex items-center gap-2">
                <Cpu size={12} className="text-slate-400 shrink-0" />
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  disabled={isAgentRunning}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors disabled:opacity-50 appearance-none cursor-pointer"
                >
                  <option value="">自动选择模型</option>
                  {aiConfigs.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.provider === 'ollama' ? '🖥️' : '☁️'} {c.name} ({c.model_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 && !isAgentRunning && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Bot size={48} className="text-slate-100 mb-4" />
                  <p className="text-sm text-slate-300 font-bold">发送消息测试 Agent</p>
                  <p className="text-[10px] text-slate-300 mt-1">Agent 将通过 ReAct Loop 自主调用工具完成任务</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'}`}>
                    {msg.content}
                  </div>
                  {/* Tool execution steps */}
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="mt-2 max-w-[90%] space-y-1.5">
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">执行日志 ({msg.steps.filter((s: any) => s.step_type === 'tool_call').length} 次工具调用)</div>
                      {msg.steps.filter((s: any) => ['tool_call', 'tool_result', 'planning', 'reflection'].includes(s.step_type)).map((step: any, j: number) => (
                        <div key={j} className={`px-3 py-2 rounded-xl text-[10px] border ${
                          step.step_type === 'planning'
                            ? 'bg-blue-50 border-blue-100 text-blue-700'
                            : step.step_type === 'reflection'
                            ? 'bg-orange-50 border-orange-100 text-orange-700'
                            : step.step_type === 'tool_call'
                            ? 'bg-purple-50 border-purple-100 text-purple-700'
                            : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            {step.step_type === 'planning' ? '📋' : step.step_type === 'reflection' ? '🔄' : step.step_type === 'tool_call' ? '⚡' : '✅'}
                            <span className="font-black">{step.tool_name || (step.step_type === 'planning' ? '任务规划' : step.step_type === 'reflection' ? '反思调整' : '完成')}</span>
                            {step.duration_ms && <span className="text-[8px] opacity-60 ml-auto">{step.duration_ms}ms</span>}
                          </div>
                          {step.tool_args && (
                            <pre className="mt-1 text-[9px] opacity-70 max-h-16 overflow-y-auto">{JSON.stringify(step.tool_args, null, 1)}</pre>
                          )}
                          {step.tool_result && (
                            <pre className="mt-1 text-[9px] opacity-70 max-h-20 overflow-y-auto whitespace-pre-wrap">{step.tool_result.length > 200 ? step.tool_result.slice(0, 200) + '...' : step.tool_result}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {/* Real-time execution indicator */}
              {/* Task Plan Display */}
              {agentPlan && (
                <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl">
                  <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2">📋 任务计划</div>
                  <pre className="text-[10px] text-blue-700 whitespace-pre-wrap leading-relaxed font-medium">{agentPlan.replace('📋 任务计划:\n', '')}</pre>
                </div>
              )}
              {isAgentRunning && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-amber-700">Agent 正在思考和执行...</span>
                  </div>
                  {agentSteps.map((step, i) => (
                    <div key={i} className={`px-3 py-2 rounded-xl text-[10px] border animate-in fade-in duration-300 ${
                      step.step_type === 'planning'
                        ? 'bg-blue-50 border-blue-100 text-blue-700'
                        : step.step_type === 'reflection'
                        ? 'bg-orange-50 border-orange-100 text-orange-700'
                        : step.step_type === 'tool_call'
                        ? 'bg-purple-50 border-purple-100 text-purple-700'
                        : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {step.step_type === 'planning' ? '📋' : step.step_type === 'reflection' ? '🔄' : step.step_type === 'tool_call' ? '⚡' : '✅'}
                        <span className="font-black">{step.tool_name || (step.step_type === 'planning' ? '任务规划' : step.step_type === 'reflection' ? '反思调整' : '完成')}</span>
                        {step.duration_ms && <span className="text-[8px] opacity-60 ml-auto">{step.duration_ms}ms</span>}
                      </div>
                      {step.content && step.step_type === 'reflection' && (
                        <div className="mt-1 text-[9px] opacity-70">{step.content}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <div className="flex gap-2">
                <input
                  type="text" value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isAgentRunning && handleTestChat()}
                  placeholder={isAgentRunning ? 'Agent 执行中...' : '输入指令测试 Agent...'}
                  disabled={isAgentRunning}
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                />
                <button onClick={handleTestChat} disabled={isAgentRunning} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : selectedNode ? (
          /* Node Properties Panel - Type-Specific */
          <div className="p-6 overflow-y-auto flex-1 animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-800 text-lg tracking-tight">节点属性</h3>
              <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-slate-600 transition-colors"><X size={18} /></button>
            </div>

            {/* Common: Name field */}
            <div className="space-y-2 mb-5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] block">名称</label>
              <input type="text" value={(selectedNode.data.label as string) || ''} onChange={(e) => {
                const label = e.target.value;
                setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label } } : n));
                setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, label } } : null);
              }} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-blue-500 font-bold" />
            </div>

            {/* Type-specific panels */}
            {selectedNode.type === 'agent-file' && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-3">📁 输入文件</div>
                  <div className="space-y-2">
                    <button
                      onClick={async () => {
                        try {
                          const { open } = await import('@tauri-apps/plugin-dialog');
                          const files = await open({ multiple: true, title: '选择输入文件' });
                          if (files) {
                            const fileList = Array.isArray(files) ? files : [files];
                            const currentFiles = ((selectedNode.data.files as string[]) || []);
                            const updated = [...currentFiles, ...fileList.map((f: any) => typeof f === 'string' ? f : f.path)];
                            updateNodeData(selectedNode.id, { files: updated, detail: `输入 ${updated.length} 个文件` });
                          }
                        } catch (e) { console.error('File dialog failed:', e); }
                      }}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all shadow-lg"
                    >
                      <Upload size={14} /> 选择文件
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const { open } = await import('@tauri-apps/plugin-dialog');
                          const folder = await open({ directory: true, title: '选择文件夹' });
                          if (folder) {
                            const folderPath = typeof folder === 'string' ? folder : (folder as any).path || String(folder);
                            const currentFiles = ((selectedNode.data.files as string[]) || []);
                            const updated = [...currentFiles, `📂 ${folderPath}`];
                            updateNodeData(selectedNode.id, { files: updated, detail: `包含 ${updated.length} 个资源` });
                          }
                        } catch (e) { console.error('Folder dialog failed:', e); }
                      }}
                      className="w-full py-3 bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-95 transition-all"
                    >
                      <Database size={14} /> 选择文件夹
                    </button>
                  </div>
                  {((selectedNode.data.files as string[]) || []).length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">已选择 ({((selectedNode.data.files as string[]) || []).length})</div>
                      {((selectedNode.data.files as string[]) || []).map((f: string, i: number) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 bg-white rounded-xl text-[10px] text-slate-600 font-medium border border-emerald-100">
                          <span className="truncate flex-1">{f.includes('📂') ? f : f.split(/[\\/]/).pop()}</span>
                          <button onClick={() => {
                            const updated = ((selectedNode.data.files as string[]) || []).filter((_: string, idx: number) => idx !== i);
                            updateNodeData(selectedNode.id, { files: updated, detail: updated.length > 0 ? `包含 ${updated.length} 个资源` : '' });
                          }} className="text-red-400 hover:text-red-600 ml-2 shrink-0"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Output Path */}
                <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100">
                  <div className="text-[9px] font-black text-sky-500 uppercase tracking-widest mb-3">📤 输出路径 (可选)</div>
                  <div className="flex gap-2">
                    <input type="text" value={(selectedNode.data.outputPath as string) || ''}
                      onChange={(e) => updateNodeData(selectedNode.id, { outputPath: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-white border border-sky-200 rounded-xl text-xs outline-none focus:border-sky-500 font-medium"
                      placeholder="C:\\output\\result.txt" />
                    <button
                      onClick={async () => {
                        try {
                          const { save } = await import('@tauri-apps/plugin-dialog');
                          const path = await save({ title: '选择输出位置' });
                          if (path) updateNodeData(selectedNode.id, { outputPath: path });
                        } catch (e) { console.error(e); }
                      }}
                      className="px-3 py-2.5 bg-sky-500 text-white rounded-xl text-xs font-bold hover:bg-sky-600 active:scale-95 transition-all shrink-0"
                    >浏览</button>
                  </div>
                </div>
                {/* Paste Text Data */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">📋 粘贴数据 (可选)</div>
                  <textarea rows={4}
                    value={(selectedNode.data.pasteData as string) || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { pasteData: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 font-mono resize-none leading-relaxed"
                    placeholder='直接粘贴 CSV/JSON/文本数据...' />
                </div>
              </div>
            )}

            {selectedNode.type === 'agent-instruction' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest">✒️ 指令编辑器</div>
                    <select
                      value={(selectedNode.data.lang as string) || 'text'}
                      onChange={(e) => updateNodeData(selectedNode.id, { lang: e.target.value })}
                      className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700 outline-none"
                    >
                      <option value="text">自然语言</option>
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                      <option value="shell">Shell 命令</option>
                      <option value="prompt">Prompt 模板</option>
                    </select>
                  </div>
                  <textarea
                    rows={12}
                    value={(selectedNode.data.detail as string) || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { detail: e.target.value })}
                    className={`w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-xs outline-none focus:border-amber-500 resize-none leading-relaxed ${(selectedNode.data.lang as string) !== 'text' ? 'font-mono' : 'font-medium'}`}
                    placeholder={{
                      python: '# Python 脚本\nimport os\nprint(os.listdir("."))',
                      javascript: '// JavaScript\nconsole.log("Hello")',
                      shell: '# Shell 命令\nls -la /tmp\necho "done"',
                      prompt: '你是一个{{role}}专家，擅长{{skill}}\n请用{{language}}回答',
                      text: '输入自定义指令...\n例如：请用中文回答，并以表格形式展示'
                    }[(selectedNode.data.lang as string) || 'text']}
                  />
                  {(selectedNode.data.lang as string) === 'prompt' && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-amber-100">
                      <div className="text-[9px] font-bold text-amber-500 mb-1">💡 变量提示</div>
                      <div className="text-[10px] text-slate-500">使用 {'{{'}variable{'}}'}  语法，运行时自动替换</div>
                    </div>
                  )}
                  {((selectedNode.data.lang as string) === 'python' || (selectedNode.data.lang as string) === 'shell') && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-amber-100">
                      <div className="text-[9px] font-bold text-amber-500 mb-1">⚠️ 执行模式</div>
                      <div className="text-[10px] text-slate-500">此脚本将在 Agent 运行时作为可调用工具注册</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedNode.type === 'agent-llm' && (
              <div className="space-y-4">
                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                  <div className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-3">🧠 模型选择</div>
                  <select
                    value={(selectedNode.data.model as string) || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { model: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-rose-200 rounded-xl text-sm font-bold outline-none focus:border-rose-500"
                  >
                    <option value="">-- 选择大模型 --</option>
                    <optgroup label="在线模型">
                      <option value="deepseek-ai/DeepSeek-V3">DeepSeek V3</option>
                      <option value="deepseek-ai/DeepSeek-R1">DeepSeek R1 (推理)</option>
                      <option value="Qwen/Qwen2.5-72B-Instruct">Qwen 2.5 72B</option>
                      <option value="meta-llama/Llama-3.3-70B-Instruct">Llama 3.3 70B</option>
                    </optgroup>
                    <optgroup label="本地模型">
                      <option value="local">LM Studio 本地模型</option>
                    </optgroup>
                  </select>
                  {(selectedNode.data.model as string) && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-rose-100">
                      <div className="text-[10px] font-bold text-rose-600">当前: {(selectedNode.data.model as string)}</div>
                      <div className="text-[9px] text-slate-400 mt-1">{(selectedNode.data.model as string) === 'local' ? '请确保 LM Studio 已启动并加载模型' : '将通过 SiliconFlow API 调用'}</div>
                    </div>
                  )}
                </div>
                {/* Parameters */}
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
                  <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-4">⚙️ 参数设置</div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500">Temperature</span>
                        <span className="text-[10px] font-bold text-rose-500">{((selectedNode.data.temperature as number) ?? 70) / 100}</span>
                      </div>
                      <input type="range" min="0" max="100" value={((selectedNode.data.temperature as number) ?? 70)}
                        onChange={(e) => updateNodeData(selectedNode.id, { temperature: Number(e.target.value) })}
                        className="w-full accent-rose-500 h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500">Max Tokens</span>
                        <span className="text-[10px] font-bold text-rose-500">{(selectedNode.data.maxTokens as number) || 2048}</span>
                      </div>
                      <input type="range" min="256" max="8192" step="256" value={((selectedNode.data.maxTokens as number) || 2048)}
                        onChange={(e) => updateNodeData(selectedNode.id, { maxTokens: Number(e.target.value) })}
                        className="w-full accent-rose-500 h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500">Top-P</span>
                        <span className="text-[10px] font-bold text-rose-500">{((selectedNode.data.topP as number) ?? 90) / 100}</span>
                      </div>
                      <input type="range" min="0" max="100" value={((selectedNode.data.topP as number) ?? 90)}
                        onChange={(e) => updateNodeData(selectedNode.id, { topP: Number(e.target.value) })}
                        className="w-full accent-rose-500 h-1.5" />
                    </div>
                  </div>
                </div>
                {/* Response options */}
                <div className="p-4 bg-rose-50/30 rounded-2xl border border-rose-100">
                  <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-3">📨 响应设置</div>
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">响应格式</span>
                      <select value={(selectedNode.data.responseFormat as string) || 'text'}
                        onChange={(e) => updateNodeData(selectedNode.id, { responseFormat: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs font-bold outline-none"
                      >
                        <option value="text">纯文本</option>
                        <option value="markdown">Markdown</option>
                        <option value="json">JSON 模式</option>
                      </select>
                    </div>
                    <label className="flex items-center justify-between p-3 bg-white rounded-xl border border-rose-100 cursor-pointer">
                      <span className="text-xs font-bold text-slate-700">流式输出</span>
                      <div className="relative">
                        <input type="checkbox" checked={!!selectedNode.data.streaming}
                          onChange={(e) => updateNodeData(selectedNode.id, { streaming: e.target.checked })}
                          className="sr-only peer" />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-rose-500 transition-colors" />
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {selectedNode.type === 'agent-output' && (
              <div className="space-y-4">
                <div className="p-4 bg-teal-50 rounded-2xl border border-teal-100">
                  <div className="text-[9px] font-black text-teal-500 uppercase tracking-widest mb-3">💬 输出方式</div>
                  <div className="space-y-2">
                    {[
                      { value: 'chat', label: '💬 对话显示', desc: '结果在聊天窗口展示' },
                      { value: 'file', label: '📄 导出文件', desc: '自动保存为本地文件' },
                      { value: 'clipboard', label: '📋 复制到剪贴板', desc: '结果自动复制' },
                      { value: 'notify', label: '🔔 系统通知', desc: '完成后弹出通知' },
                    ].map(opt => (
                      <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        (selectedNode.data.outputMode as string) === opt.value || (!selectedNode.data.outputMode && opt.value === 'chat')
                          ? 'bg-teal-100/50 border-teal-300 shadow-sm' : 'bg-white border-teal-100 hover:border-teal-300'
                      }`}>
                        <input type="radio" name="outputMode" value={opt.value}
                          checked={(selectedNode.data.outputMode as string) === opt.value || (!selectedNode.data.outputMode && opt.value === 'chat')}
                          onChange={() => updateNodeData(selectedNode.id, { outputMode: opt.value, detail: `输出: ${opt.label}` })}
                          className="accent-teal-500 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-slate-700">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                {(selectedNode.data.outputMode as string) === 'file' && (
                  <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 space-y-3">
                    <div className="text-[9px] font-black text-sky-500 uppercase tracking-widest">📁 文件输出设置</div>
                    <select value={(selectedNode.data.fileFormat as string) || 'txt'}
                      onChange={(e) => updateNodeData(selectedNode.id, { fileFormat: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-sky-200 rounded-xl text-xs font-bold outline-none">
                      <option value="txt">.txt 文本文件</option>
                      <option value="md">.md Markdown</option>
                      <option value="json">.json JSON</option>
                      <option value="csv">.csv 表格</option>
                      <option value="py">.py Python</option>
                    </select>
                    <div className="flex gap-2">
                      <input type="text" value={(selectedNode.data.savePath as string) || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, { savePath: e.target.value })}
                        className="flex-1 px-3 py-2.5 bg-white border border-sky-200 rounded-xl text-xs outline-none font-medium"
                        placeholder="保存路径..." />
                      <button
                        onClick={async () => {
                          try {
                            const { save } = await import('@tauri-apps/plugin-dialog');
                            const path = await save({ title: '选择保存位置' });
                            if (path) updateNodeData(selectedNode.id, { savePath: path });
                          } catch (e) { console.error(e); }
                        }}
                        className="px-3 py-2.5 bg-sky-500 text-white rounded-xl text-xs font-bold hover:bg-sky-600 active:scale-95 shrink-0"
                      >浏览</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(selectedNode.type === 'agent-mcp' || selectedNode.type === 'agent-skill') && (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border ${selectedNode.type === 'agent-mcp' ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'}`}>
                  <div className={`text-[9px] font-black uppercase tracking-widest mb-3 ${selectedNode.type === 'agent-mcp' ? 'text-purple-500' : 'text-blue-500'}`}>
                    {selectedNode.type === 'agent-mcp' ? '⚡ MCP Server 信息' : '📝 Skill 内容'}
                  </div>
                  <textarea
                    rows={8}
                    value={(selectedNode.data.detail as string) || ''}
                    onChange={(e) => {
                      const detail = e.target.value;
                      setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, detail } } : n));
                      setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, detail } } : null);
                    }}
                    className={`w-full px-4 py-3 bg-white border rounded-xl text-xs outline-none font-medium resize-none leading-relaxed ${selectedNode.type === 'agent-mcp' ? 'border-purple-200 focus:border-purple-500' : 'border-blue-200 focus:border-blue-500'}`}
                    placeholder={selectedNode.type === 'agent-mcp' ? '描述此 MCP 提供的工具能力...' : '输入 Skill 提示词/知识内容...'}
                  />
                </div>
              </div>
            )}

            {/* Delete Node Button */}
            <div className="pt-6 mt-6 border-t border-slate-100">
              <button onClick={() => { setNodes(nds => nds.filter(n => n.id !== selectedNode.id)); setSelectedNode(null); }} className="w-full py-4 bg-red-50 text-red-500 rounded-xl text-xs font-black hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
                <Trash2 size={14} /> 删除节点
              </button>
              <p className="text-[9px] text-slate-300 text-center mt-3 italic">提示：点击连线后按 Delete 键可删除连线</p>
            </div>
          </div>
        ) : (
          /* Default: Compile Preview */
          <div className="p-6 overflow-y-auto">
            <h3 className="font-black text-slate-800 text-lg tracking-tight mb-2">Agent 编译预览</h3>
            <p className="text-[10px] text-slate-400 mb-6 leading-relaxed">点击节点编辑属性，或拖入新节点。连线到 LLM 节点完成组装。</p>
            <div className="space-y-4">
              {(() => {
                const compiled = compileAgent();
                return (
                  <>
                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2">LLM 模型</div>
                      <div className="text-sm font-bold text-rose-700">{compiled.model || '未选择'}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">System Prompt</div>
                      <pre className="text-[10px] text-blue-700 font-medium whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{compiled.systemPrompt || '(空 - 请拖入 Skill/指令/文件节点并连线到 LLM)'}</pre>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                      <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-2">MCP 工具 ({compiled.tools.length})</div>
                      {compiled.tools.length > 0 ? compiled.tools.map((t: any, i: number) => (
                        <div key={i} className="text-[10px] text-purple-700 font-medium py-1">• {t.function.name}</div>
                      )) : <div className="text-[10px] text-purple-300 italic">无 - 拖入 MCP 节点并连线到 LLM</div>}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Agent Runner Modal ---
const AgentRunnerModal = ({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) => {
  const [messages, setMessages] = useState<{role: string; content: string; steps?: any[]}[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [configs, setConfigs] = useState<{id: string; name: string; provider: string; model_name: string}[]>([]);
  const [modelId, setModelId] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke('list_ai_configs').then((c: any) => {
      if (Array.isArray(c) && c.length > 0) {
        setConfigs(c);
        const active = c.find((x: any) => x.is_active) || c[0];
        if (active) setModelId(active.id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, steps]);

  const send = async () => {
    if (!input.trim() || running) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setRunning(true);
    setSteps([]);

    const unlisten = await listen<any>('agent-event', (ev) => {
      if (ev.payload?.step) setSteps(prev => [...prev, ev.payload.step]);
    });

    try {
      const result: any = await invoke('agent_run', {
        req: {
          prompt: msg,
          system_prompt: agent.description || null,
          project_id: null,
          allowed_paths: null,
          max_rounds: 15,
          model_config_id: modelId || null,
          goal: msg,
          task_id: null,
          enabled_tools: null,
          context_files: files.length > 0 ? files : null,
        }
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.final_answer || '(Agent 未返回结果)',
        steps: result.steps || [],
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${e?.toString() || '未知错误'}` }]);
    } finally {
      unlisten();
      setRunning(false);
      setSteps([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-8 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl"><Bot size={18} className="text-white" /></div>
            <div>
              <h3 className="text-sm font-black text-slate-800">{agent.name}</h3>
              <p className="text-[9px] text-slate-400 font-bold">{running ? '🟢 正在执行...' : '就绪'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={modelId} onChange={e => setModelId(e.target.value)} disabled={running}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold outline-none disabled:opacity-50">
              <option value="">自动</option>
              {configs.map(c => <option key={c.id} value={c.id}>{c.provider === 'ollama' ? '🖥️' : '☁️'} {c.name}</option>)}
            </select>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* Files bar */}
        <div className="px-6 py-2 border-b border-slate-50 flex items-center gap-2 shrink-0">
          <button onClick={async () => {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const f = await open({ multiple: true, title: '选择文件' });
              if (f) {
                const list = (Array.isArray(f) ? f : [f]).map((x: any) => typeof x === 'string' ? x : x.path);
                setFiles(prev => [...prev, ...list]);
              }
            } catch {}
          }} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-emerald-100 transition-colors border border-emerald-200">
            <Upload size={10} /> 添加文件
          </button>
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 rounded-lg text-[9px] text-emerald-700 font-medium border border-emerald-100">
              {f.split(/[\\/]/).pop()}
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={8} /></button>
            </span>
          ))}
        </div>

        {/* Chat area */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot size={48} className="text-blue-200 mb-4" />
              <p className="text-slate-400 text-sm font-medium">输入指令开始使用 {agent.name}</p>
              {agent.description && <p className="text-[10px] text-slate-300 mt-2 max-w-xs">{agent.description}</p>}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-lg'
                  : 'bg-slate-100 text-slate-800 rounded-bl-lg'
              }`}>
                <pre className="whitespace-pre-wrap text-xs font-medium leading-relaxed">{msg.content}</pre>
                {msg.steps && msg.steps.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-200/50 pt-2">
                    <div className="text-[8px] font-black text-slate-400 uppercase">执行日志</div>
                    {msg.steps.filter((s: any) => s.step_type === 'tool_call').map((s: any, j: number) => (
                      <div key={j} className="text-[9px] text-purple-600 font-bold">⚡ {s.tool_name} {s.duration_ms && `(${s.duration_ms}ms)`}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {running && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-amber-700">Agent 正在思考和执行...</span>
              </div>
              {steps.filter(s => ['tool_call', 'planning', 'reflection'].includes(s.step_type)).map((s, i) => (
                <div key={i} className={`px-3 py-2 rounded-xl text-[10px] border animate-in fade-in ${
                  s.step_type === 'tool_call' ? 'bg-purple-50 border-purple-100 text-purple-700'
                  : s.step_type === 'planning' ? 'bg-blue-50 border-blue-100 text-blue-700'
                  : 'bg-orange-50 border-orange-100 text-orange-700'
                }`}>
                  {s.step_type === 'planning' ? '📋' : s.step_type === 'reflection' ? '🔄' : '⚡'} <span className="font-black">{s.tool_name || (s.step_type === 'planning' ? '任务规划' : '反思')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-100 shrink-0">
          <div className="flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              disabled={running}
              placeholder="输入指令..."
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
            />
            <button onClick={send} disabled={running || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
              <Send size={14} /> 发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Agent List Component ---
const AgentList = ({ onCreateAgent, onOpenAgent, onRunAgent, agents, onDeleteAgent }: { onCreateAgent: () => void; onOpenAgent: (id: string) => void; onRunAgent: (id: string) => void; agents: AgentConfig[]; onDeleteAgent: (id: string) => void }) => (
  <div className="p-12 max-w-5xl mx-auto animate-in fade-in duration-500">
    <div className="flex items-center justify-between mb-12">
      <div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tighter">我的 Agent</h2>
        <p className="text-slate-400 mt-1 font-medium italic">配置 + 测试 + 运行你的智能代理</p>
      </div>
      <button onClick={onCreateAgent} className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all">
        <Plus size={18} /> 创建 Agent
      </button>
    </div>

    {agents.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {agents.map(agent => (
          <div key={agent.id} className="group bg-white border border-slate-200 rounded-[32px] p-8 hover:shadow-2xl hover:border-blue-400 transition-all relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button onClick={(e) => { e.stopPropagation(); onDeleteAgent(agent.id); }} className="p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-100 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-4 cursor-pointer" onClick={() => onOpenAgent(agent.id)}>
              <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
                <Bot size={28} className="text-white" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-xl tracking-tight">{agent.name}</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1">{agent.description || '点击编辑配置'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">更新于 {new Date(agent.updatedAt).toLocaleDateString('zh-CN')}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onRunAgent(agent.id)}
                className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
              >
                <Play size={12} /> 运行
              </button>
              <button
                onClick={() => onOpenAgent(agent.id)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 hover:bg-slate-200 active:scale-95 transition-all"
              >
                <Edit3 size={12} /> 编辑
              </button>
            </div>
          </div>
        ))}
        <div onClick={onCreateAgent} className="border-4 border-dashed border-slate-200 rounded-[32px] p-8 flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 hover:bg-white hover:shadow-xl transition-all cursor-pointer min-h-[200px]">
          <Plus size={40} className="mb-4" />
          <span className="font-black text-sm uppercase tracking-widest">新建 Agent</span>
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-32 text-center max-w-md mx-auto">
        <div className="p-12 bg-white rounded-[48px] mb-10 shadow-xl">
          <Bot size={80} className="text-blue-500/20" />
        </div>
        <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-4">创建你的第一个 Agent</h3>
        <p className="text-slate-400 leading-relaxed font-medium">配置 AI 模型 + 系统指令 + 工具权限 + 输入文件，创建能执行复杂任务的 Agent。</p>
        <button onClick={onCreateAgent} className="mt-10 px-10 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-500/40 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-3">
          <Plus size={20} /> 开始创建
        </button>
      </div>
    )}
  </div>
);

const SKILLS_CACHE_KEY = 'openclaw_installed_skills';

const AbilityManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('market');
  const [mySkills, setMySkills] = useState<SkillItem[]>(() => {
    try {
      const cached = localStorage.getItem(SKILLS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [agents, setAgents] = useState<AgentConfig[]>(loadAgents);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);

  const fetchInstalled = async () => {
    try {
      const installed: any = await invoke('mcp_get_installed_skills');
      if (installed && installed.length > 0) {
        setMySkills(installed);
        localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(installed));
      }
    } catch (e) {
      console.error('Failed to fetch installed skills', e);
    }
  };

  useEffect(() => {
    fetchInstalled();
  }, []);

  const handleInstall = async (skill: SkillItem) => {
    // Optimistically add skill to local state & cache
    setMySkills(prev => {
      const next = [...prev, { ...skill, installed: true }];
      localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
    await fetchInstalled();
  };

  const createAgent = () => {
    const newAgent: AgentConfig = {
      id: `agent_${Date.now()}`,
      name: '新 Agent',
      description: '',
      nodes: [],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [...agents, newAgent];
    setAgents(next);
    saveAgents(next);
    setEditingAgentId(newAgent.id);
  };

  const saveAgent = (updated: AgentConfig) => {
    const next = agents.map(a => a.id === updated.id ? updated : a);
    setAgents(next);
    saveAgents(next);
  };

  const deleteAgent = (id: string) => {
    const next = agents.filter(a => a.id !== id);
    setAgents(next);
    saveAgents(next);
  };

  const tabs = [
    { id: 'market', label: '技能市场', icon: Globe, desc: '发现社群流行技能' },
    { id: 'library', label: '我的库', icon: Library, desc: '管理本地与已安装' },
    { id: 'agent', label: 'Agent', icon: Bot, desc: '创建智能代理' },
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Navbar */}
      <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-white z-20">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-3xl shadow-2xl shadow-blue-500/30">
            <Zap size={28} className="text-white" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none mb-1">AI SKILLS HUB</h1>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MCP Core v2.0 READY</span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100/80 backdrop-blur-md p-1.5 rounded-[22px] border border-slate-200/50 shadow-inner">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2.5 px-8 py-3 rounded-2xl text-sm font-black transition-all ${
                activeTab === tab.id 
                  ? 'bg-white text-blue-600 shadow-xl ring-1 ring-slate-200/40' 
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
           <button 
             onClick={async () => {
               try {
                 const importedSkill: any = await invoke('mcp_import_skill', { path: 'selected_file.skill' });
                 handleInstall(importedSkill);
                 alert(`成功导入技能: ${importedSkill.name}`);
               } catch (e) {
                 alert('导入失败: ' + e);
               }
             }}
             className="px-6 py-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl text-xs font-black shadow-sm flex items-center gap-2 hover:bg-white hover:shadow-lg transition-all active:scale-95"
           >
             <Upload size={16} /> 外部导入
           </button>
           <button className="p-3 bg-white border border-slate-200 text-slate-400 rounded-2xl hover:text-slate-600 hover:shadow-md transition-all"><Copy size={20} /></button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto flex flex-col relative bg-slate-50 scroll-smooth">
        {activeTab === 'market' && <SkillHubMarket onInstall={handleInstall} />}
        {activeTab === 'library' && (
          <div className="p-12 max-w-7xl mx-auto w-full overflow-y-auto pb-32">
            {mySkills.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in zoom-in-95 duration-500">
                 {mySkills.map(skill => (
                   <div key={skill.id} className="group bg-white border border-slate-200 rounded-[36px] p-8 hover:shadow-2xl hover:border-blue-400 transition-all flex flex-col relative overflow-hidden">
                     <div className="flex items-start gap-5 mb-6">
                        <div className={`p-4 rounded-[22px] shadow-lg shadow-current/10 ${skill.type === 'mcp' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                          {skill.type === 'mcp' ? <Zap size={32} /> : <Layout size={32} />}
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800 text-xl tracking-tight">{skill.name}</h3>
                          {skill.nameZh && (
                            <p className="text-[11px] text-blue-500/70 font-bold mt-0.5 line-clamp-1">{skill.nameZh}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                             <span className="text-[10px] px-2.5 py-1 bg-slate-50 text-slate-400 rounded-lg font-black uppercase tracking-widest">{skill.type} CORE</span>
                             <span className="text-[10px] text-slate-300 font-bold italic">v{skill.version}</span>
                          </div>
                        </div>
                     </div>
                     <p className="text-sm text-slate-500 mb-4 line-clamp-2 leading-relaxed font-medium">{skill.description}</p>
                     {skill.translation && (
                       <div className="mb-6 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                         <div className="flex items-center gap-1 mb-1">
                           <span className="text-[8px] bg-blue-100 text-blue-500 font-black px-1.5 py-0.5 rounded uppercase tracking-widest">中文简述</span>
                         </div>
                         <p className="text-xs text-slate-600 font-bold leading-5 line-clamp-2">{skill.translation}</p>
                       </div>
                     )}
                     <div className="mt-auto flex gap-4">
                        <button 
                          onClick={() => setActiveTab('agent')}
                          className="flex-1 py-4 bg-slate-900 text-white rounded-[20px] text-xs font-black hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-2"
                        >
                          <Edit3 size={16} /> 调起编排
                        </button>
                        <button 
                          onClick={() => setMySkills(prev => {
                            const next = prev.filter(s => s.id !== skill.id);
                            localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(next));
                            return next;
                          })}
                          className="p-4 bg-red-50 text-red-600 rounded-[20px] hover:bg-red-100 transition-all active:scale-90"
                        >
                          <Trash2 size={20} />
                        </button>
                     </div>
                   </div>
                 ))}
                 <div 
                   className="border-4 border-dashed border-slate-200 rounded-[36px] p-8 flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 hover:bg-white hover:shadow-2xl transition-all cursor-pointer group"
                   onClick={() => setActiveTab('agent')}
                 >
                    <div className="p-6 rounded-3xl border-2 border-dashed border-current mb-6 group-hover:rotate-180 transition-transform duration-700 ease-out">
                      <Plus size={40} />
                    </div>
                    <span className="font-black text-sm uppercase tracking-[0.2em]">创建新 Agent</span>
                 </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[600px] text-center max-w-md mx-auto">
                <div className="p-12 bg-white rounded-[60px] mb-10 shadow-2xl animate-bounce duration-[3s]">
                  <Library size={100} className="text-blue-500/20" />
                </div>
                <h2 className="text-4xl font-black text-slate-800 tracking-tighter mb-4">技能库空无一人</h2>
                <p className="text-slate-400 leading-relaxed font-medium">您的个人本地库中尚未沉淀任何核心资产。您可以从市场同步官方或社区技能，也可以立即开启第一场编排。</p>
                <div className="flex gap-4 mt-12 w-full">
                  <button onClick={() => setActiveTab('market')} className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black shadow-sm hover:shadow-lg transition-all active:scale-95">逛一逛市场</button>
                  <button onClick={() => setActiveTab('agent')} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-500/40 hover:bg-blue-700 active:scale-95 transition-all">创建 Agent</button>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'agent' && (
          editingAgentId ? (
            <ReactFlowProvider>
              <AgentEditor
                agent={agents.find(a => a.id === editingAgentId)!}
                onBack={() => setEditingAgentId(null)}
                onSave={saveAgent}
                installedSkills={mySkills}
              />
            </ReactFlowProvider>
          ) : (
            <AgentList
              agents={agents}
              onCreateAgent={createAgent}
              onOpenAgent={(id) => setEditingAgentId(id)}
              onRunAgent={(id) => setRunningAgentId(id)}
              onDeleteAgent={deleteAgent}
            />
          )
        )}
      </div>
      {/* Agent Runner Modal */}
      {runningAgentId && (
        <AgentRunnerModal
          agent={agents.find(a => a.id === runningAgentId)!}
          onClose={() => setRunningAgentId(null)}
        />
      )}
    </div>
  );
};

export default AbilityManager;
