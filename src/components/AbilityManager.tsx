import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Cpu
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
    const url = skill.sourceUrl || '';
    if (!url) {
      alert('无法导入：该技能缺少有效的源地址 (Source URL)。');
      return;
    }
    try {
      // Step 1: Trigger real backend download/install
      await invoke('mcp_install_from_source', { 
        sourceUrl: url, 
        name: skill.name 
      });
      
      // Step 2: Notify parent to add to local library
      onInstall(skill);
      
      // Step 3: Update local UI state
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
                  <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">Status</div>
                  <div className="text-[11px] font-black text-slate-700 truncate">GitHub Auth</div>
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
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real Source</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleInstall(skill);
                }}
                className={`flex items-center gap-2 px-6 py-3 rounded-[18px] text-sm font-black transition-all ${skill.installed ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-slate-900 text-white hover:bg-black shadow-xl active:scale-95'}`}
              >
                {skill.installed ? <><CheckCircle2 size={18} /> 已就绪</> : <><Download size={18} /> 导入到库</>}
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
  const [chatMessages, setChatMessages] = useState<{role: string; content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [expandedSections, setExpandedSections] = useState<{mcp: boolean; skill: boolean}>({ mcp: true, skill: false });
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Split installed skills into MCP and Skill categories
  const mcpSkills = installedSkills.filter(s => s.type === 'mcp');
  const skillItems = installedSkills.filter(s => s.type !== 'mcp');

  // Helper to update node data
  const updateNodeData = (nodeId: string, newData: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    setSelectedNode(prev => prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev);
  };

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }, eds)), [setEdges]);
  const onNodeClick = (_: any, node: Node) => setSelectedNode(node);

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string, detail: string) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, label, detail }));
    event.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    const { nodeType, label, detail } = JSON.parse(raw);
    
    // Use wrapper ref for accurate position calculation
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: nodeType,
      position,
      data: { label, detail },
    };
    setNodes((nds) => nds.concat(newNode));
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
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    
    const compiled = compileAgent();
    setChatMessages(prev => [...prev, { role: 'assistant', content: `[Agent 编译结果]\n模型: ${compiled.model}\n系统提示词: ${compiled.systemPrompt || '(空)'}\n工具数量: ${compiled.tools.length}\n\n⚠️ LLM 接口尚未接入，以上是 Agent 编译后的配置预览。接入 LLM 后，这里将显示真实对话。` }]);
  };



  return (
    <div className="flex flex-1 overflow-hidden animate-in fade-in duration-300">
      {/* Left: Asset Panel */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto rounded-r-2xl">
        <div className="flex items-center gap-2 p-5 pb-3 border-b border-slate-100">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-700"><ArrowLeft size={18} /></button>
          <h2 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.15em]">资产面板</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {/* MCP Tools Section */}
          <div>
            <button
              onClick={() => setExpandedSections(prev => ({ ...prev, mcp: !prev.mcp }))}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-purple-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition-colors"><Zap size={16} /></div>
                <div className="text-left">
                  <div className="text-sm font-bold text-slate-700">MCP 工具</div>
                  <div className="text-[9px] text-slate-400 font-medium">{mcpSkills.length} 个已安装</div>
                </div>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.mcp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedSections.mcp && (
              <div className="pl-4 pr-2 pb-2 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                {mcpSkills.length > 0 ? mcpSkills.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 bg-purple-50/50 border border-purple-100/60 rounded-xl text-xs font-bold text-purple-700 cursor-grab hover:bg-purple-100 hover:border-purple-200 hover:shadow-md transition-all active:scale-95"
                    draggable
                    onDragStart={(e) => onDragStart(e, 'agent-mcp', s.name, s.description)}
                  >
                    <Zap size={12} className="text-purple-500 shrink-0" />
                    <div className="truncate">
                      <div className="truncate">{s.nameZh || s.name}</div>
                      {s.nameZh && <div className="text-[9px] text-purple-400 truncate font-normal">{s.name}</div>}
                    </div>
                  </div>
                )) : (
                  <div className="px-3 py-4 text-center text-[10px] text-slate-300 italic">前往技能市场安装 MCP</div>
                )}
              </div>
            )}
          </div>

          {/* Skills Section */}
          <div>
            <button
              onClick={() => setExpandedSections(prev => ({ ...prev, skill: !prev.skill }))}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-blue-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors"><FileText size={16} /></div>
                <div className="text-left">
                  <div className="text-sm font-bold text-slate-700">Skill 知识</div>
                  <div className="text-[9px] text-slate-400 font-medium">{skillItems.length} 个已安装</div>
                </div>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.skill ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedSections.skill && (
              <div className="pl-4 pr-2 pb-2 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                {skillItems.length > 0 ? skillItems.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-50/50 border border-blue-100/60 rounded-xl text-xs font-bold text-blue-700 cursor-grab hover:bg-blue-100 hover:border-blue-200 hover:shadow-md transition-all active:scale-95"
                    draggable
                    onDragStart={(e) => onDragStart(e, 'agent-skill', s.name, s.description)}
                  >
                    <FileText size={12} className="text-blue-500 shrink-0" />
                    <div className="truncate">
                      <div className="truncate">{s.nameZh || s.name}</div>
                      {s.nameZh && <div className="text-[9px] text-blue-400 truncate font-normal">{s.name}</div>}
                    </div>
                  </div>
                )) : (
                  <div className="px-3 py-4 text-center text-[10px] text-slate-300 italic">前往技能市场安装 Skill</div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 my-2" />

          {/* Standalone draggable items */}
          <div
            className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-grab hover:bg-emerald-50 transition-all active:scale-95 group"
            draggable
            onDragStart={(e) => onDragStart(e, 'agent-file', '文件/数据', '加载文件或数据作为上下文')}
          >
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors"><Database size={16} /></div>
            <div>
              <div className="text-sm font-bold text-slate-700">文件/数据</div>
              <div className="text-[9px] text-slate-400 font-medium">拖入作为上下文</div>
            </div>
          </div>

          <div
            className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-grab hover:bg-amber-50 transition-all active:scale-95 group"
            draggable
            onDragStart={(e) => onDragStart(e, 'agent-instruction', '自定义指令', '写入自由文字要求和约束')}
          >
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors"><Edit3 size={16} /></div>
            <div>
              <div className="text-sm font-bold text-slate-700">自定义指令</div>
              <div className="text-[9px] text-slate-400 font-medium">自由文字要求</div>
            </div>
          </div>

          <div
            className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-grab hover:bg-rose-50 transition-all active:scale-95 group"
            draggable
            onDragStart={(e) => onDragStart(e, 'agent-llm', 'LLM 大模型', '选择大模型')}
          >
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-100 transition-colors"><Cpu size={16} /></div>
            <div>
              <div className="text-sm font-bold text-slate-700">LLM 大模型</div>
              <div className="text-[9px] text-slate-400 font-medium">拖入选择模型</div>
            </div>
          </div>

          <div
            className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-grab hover:bg-teal-50 transition-all active:scale-95 group"
            draggable
            onDragStart={(e) => onDragStart(e, 'agent-output', '对话输出', 'Agent 回复用户的出口')}
          >
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-100 transition-colors"><MessageSquare size={16} /></div>
            <div>
              <div className="text-sm font-bold text-slate-700">对话输出</div>
              <div className="text-[9px] text-slate-400 font-medium">Agent 回复出口</div>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 h-full relative bg-slate-50 rounded-2xl overflow-hidden m-1"
        onDragOver={onDragOver} onDrop={onDrop}
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
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl"><Bot size={18} className="text-blue-600" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">Agent 测试</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">编译预览模式</p>
                </div>
              </div>
              <button onClick={() => setChatMessages([])} className="p-2 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Bot size={48} className="text-slate-100 mb-4" />
                  <p className="text-sm text-slate-300 font-bold">发送消息测试你的 Agent</p>
                  <p className="text-[10px] text-slate-300 mt-1">将展示编译后的配置预览</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100">
              <div className="flex gap-2">
                <input
                  type="text" value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTestChat()}
                  placeholder="输入消息测试 Agent..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-colors"
                />
                <button onClick={handleTestChat} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all">
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

// --- Agent List Component ---
const AgentList = ({ onCreateAgent, onOpenAgent, agents, onDeleteAgent }: { onCreateAgent: () => void; onOpenAgent: (id: string) => void; agents: AgentConfig[]; onDeleteAgent: (id: string) => void }) => (
  <div className="p-12 max-w-5xl mx-auto animate-in fade-in duration-500">
    <div className="flex items-center justify-between mb-12">
      <div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tighter">我的 Agent</h2>
        <p className="text-slate-400 mt-1 font-medium italic">组装 MCP + Skills + LLM，创造你的智能代理</p>
      </div>
      <button onClick={onCreateAgent} className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all">
        <Plus size={18} /> 创建 Agent
      </button>
    </div>

    {agents.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {agents.map(agent => (
          <div key={agent.id} className="group bg-white border border-slate-200 rounded-[32px] p-8 hover:shadow-2xl hover:border-blue-400 transition-all cursor-pointer relative" onClick={() => onOpenAgent(agent.id)}>
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onDeleteAgent(agent.id); }} className="p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-100 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
                <Bot size={28} className="text-white" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-xl tracking-tight">{agent.name}</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1">{agent.nodes.length} 节点 · {agent.edges.length} 连线</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-6 line-clamp-2 leading-relaxed">{agent.description || '点击进入编辑和测试此 Agent'}</p>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">更新于 {new Date(agent.updatedAt).toLocaleDateString('zh-CN')}</span>
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
        <p className="text-slate-400 leading-relaxed font-medium">Agent 是你的智能代理。通过拖拽 MCP 工具、Skills 知识、指令等节点，连接到 LLM，组装出能执行复杂任务的 AI 助手。</p>
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
              onDeleteAgent={deleteAgent}
            />
          )
        )}
      </div>
    </div>
  );
};

export default AbilityManager;
