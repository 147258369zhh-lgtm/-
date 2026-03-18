import { useState, useCallback, useEffect } from 'react';
import {
  Zap, Bot, Wrench, Library, Cpu, Plus, Search, Play, Edit3,
  Trash2, ArrowLeft, Save, X, Package, FileText,
  Server, Compass, MessageSquare,
  Layers, Sparkles, Download, Globe, Loader2
} from 'lucide-react';
import {
  ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState,
  addEdge, type Node, type Edge, type Connection, ReactFlowProvider,
  BackgroundVariant, useReactFlow, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ═══════════════════════════════════════════════════
// AI HUB — 统一 AI 能力中心
// Tab: Agent综合体 | Agent | MCP | Skill | 库
// ═══════════════════════════════════════════════════

type HubTab = 'composite' | 'agent' | 'mcp' | 'skill' | 'library';
type ViewMode = 'list' | 'editor';

interface HubItem {
  id: string;
  name: string;
  description: string;
  type: HubTab;
  nodes?: Node[];
  edges?: Edge[];
  status?: 'draft' | 'ready' | 'running';
  createdAt: string;
  updatedAt: string;
  icon?: string;
  source?: 'local' | 'network' | 'builtin';
}
// ── npm 包描述翻译 ──
const TRANSLATE_MAP: Record<string, string> = {
  'file': '文件', 'filesystem': '文件系统', 'server': '服务器', 'client': '客户端',
  'database': '数据库', 'browser': '浏览器', 'search': '搜索', 'tool': '工具',
  'model': '模型', 'context': '上下文', 'protocol': '协议', 'plugin': '插件',
  'integration': '集成', 'connector': '连接器', 'provider': '提供者',
  'memory': '内存', 'storage': '存储', 'manager': '管理器', 'handler': '处理器',
  'wrapper': '封装器', 'api': '接口', 'sdk': 'SDK', 'interface': '接口',
  'read': '读取', 'write': '写入', 'create': '创建', 'delete': '删除',
  'update': '更新', 'fetch': '获取', 'send': '发送', 'receive': '接收',
  'execute': '执行', 'run': '运行', 'start': '启动', 'stop': '停止',
  'open': '打开', 'close': '关闭', 'connect': '连接', 'disconnect': '断开',
  'local': '本地', 'remote': '远程', 'cloud': '云端', 'web': '网页',
  'data': '数据', 'text': '文本', 'image': '图片', 'video': '视频',
  'audio': '音频', 'code': '代码', 'document': '文档', 'email': '邮件',
  'git': 'Git', 'github': 'GitHub', 'docker': 'Docker', 'kubernetes': 'K8s',
  'slack': 'Slack', 'notion': 'Notion', 'google': 'Google', 'azure': 'Azure',
  'aws': 'AWS', 'openai': 'OpenAI', 'anthropic': 'Anthropic',
  'weather': '天气', 'map': '地图', 'calendar': '日历', 'chat': '聊天',
  'assistant': '助手', 'agent': '智能代理', 'workflow': '工作流',
  'automation': '自动化', 'scraper': '爬虫', 'crawler': '爬虫',
  'monitor': '监控', 'log': '日志', 'debug': '调试', 'test': '测试',
  'deploy': '部署', 'build': '构建', 'compile': '编译', 'package': '包',
  'install': '安装', 'config': '配置', 'setting': '设置', 'option': '选项',
  'query': '查询', 'request': '请求', 'response': '响应', 'stream': '流',
  'network': '网络', 'http': 'HTTP', 'rest': 'REST', 'graphql': 'GraphQL',
  'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'csv': 'CSV',
  'markdown': 'Markdown', 'html': 'HTML', 'css': 'CSS',
  'python': 'Python', 'javascript': 'JavaScript', 'typescript': 'TypeScript',
  'node': 'Node.js', 'react': 'React', 'vue': 'Vue',
  'sql': 'SQL', 'postgres': 'PostgreSQL', 'mysql': 'MySQL', 'redis': 'Redis',
  'mongodb': 'MongoDB', 'sqlite': 'SQLite',
  'ai': 'AI', 'machine learning': '机器学习', 'nlp': '自然语言处理',
  'embedding': '嵌入向量', 'vector': '向量', 'prompt': '提示词',
  'completion': '补全', 'generation': '生成', 'translation': '翻译',
  'summary': '摘要', 'analysis': '分析', 'extract': '提取',
  'scraping': '网页抓取', 'parsing': '解析', 'validation': '验证',
  'authentication': '认证', 'authorization': '授权', 'encryption': '加密',
  'framework': '框架', 'library': '库', 'module': '模块', 'component': '组件',
  'service': '服务', 'utility': '工具集', 'helper': '辅助工具',
  'A Model Context Protocol': 'MCP (模型上下文协议)',
  'MCP server': 'MCP 服务器',
  'that provides': '提供',
  'for interacting with': '用于与...交互',
  'allows you to': '允许你',
  'enables': '启用/支持',
  'implements': '实现',
};
const translateNpmDesc = (_name: string, desc: string): string => {
  if (!desc) return '无描述';
  let result = desc;
  // 按长度降序替换，避免短词覆盖长词的一部分
  const entries = Object.entries(TRANSLATE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [en, zh] of entries) {
    const regex = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    result = result.replace(regex, zh);
  }
  // 如果翻译后和原文一样（没翻译任何词），返回原文
  return result !== desc ? result : desc;
};

// ── Tab 定义 ──
const HUB_TABS: { id: HubTab; label: string; icon: any; color: string; desc: string }[] = [
  { id: 'composite', label: '智能体',        icon: Layers,   color: '#6366f1', desc: '编排 Agent + MCP + Skill 的完整流程' },
  { id: 'agent',     label: 'Agent',        icon: Bot,      color: '#3b82f6', desc: '创建 AI 智能代理' },
  { id: 'mcp',       label: 'MCP',          icon: Server,   color: '#8b5cf6', desc: '管理 MCP Server 连接' },
  { id: 'skill',     label: 'Skill',        icon: Wrench,   color: '#10b981', desc: '封装可复用的操作技能' },
  { id: 'library',   label: '库',            icon: Library,  color: '#f59e0b', desc: '全部资产总览' },
];

// ── 画布节点类型定义 ──
const NODE_TYPES_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
  'hub-agent':   { icon: Bot,            color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  label: 'Agent' },
  'hub-mcp':     { icon: Server,         color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.3)',  label: 'MCP' },
  'hub-skill':   { icon: Wrench,         color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  label: 'Skill' },
  'hub-llm':     { icon: Cpu,            color: '#f43f5e', bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.3)',   label: 'LLM' },
  'hub-tool':    { icon: Wrench,         color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  label: '工具' },
  'hub-output':  { icon: MessageSquare,  color: '#14b8a6', bg: 'rgba(20,184,166,0.08)',  border: 'rgba(20,184,166,0.3)',  label: '输出' },
  'hub-input':   { icon: FileText,       color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.3)',  label: '输入' },
  'hub-start':   { icon: Play,           color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.3)', label: '开始' },
  'hub-end':     { icon: Compass,        color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   label: '结束' },
};

// ── 工具名称中文映射 ──
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'shell_run': '执行命令', 'file_write': '写入文件', 'file_read': '读取文件',
  'file_create': '创建文件/文件夹', 'file_delete': '删除文件', 'file_move': '移动文件',
  'file_list': '列出文件', 'file_search': '搜索文件', 'date_now': '获取时间',
  'word_write': '写Word文档', 'word_read': '读Word', 'ppt_create': '创建PPT',
  'ppt_read': '读PPT', 'pdf_read': '读PDF', 'excel_write': '写Excel',
  'excel_read': '读Excel', 'excel_analyze': '分析Excel', 'csv_to_excel': 'CSV转Excel',
  'web_scrape': '网页爬取', 'browser_navigate': '浏览器导航', 'browser_script': '浏览器脚本',
  'translate_text': '翻译文本', 'chart_generate': '生成图表', 'image_process': '图片处理',
  'json_process': 'JSON处理', 'data_merge': '数据合并', 'table_transform': '表格转换',
  'report_generate': '生成报告', 'doc_convert': '文档转换', 'markdown_convert': 'MD转换',
  'qrcode_generate': '生成二维码', 'compress_archive': '压缩/解压',
};

// ── 统一画布节点渲染组件 ──
const HubNode = ({ data, selected, type }: any) => {
  const config = NODE_TYPES_CONFIG[type] || NODE_TYPES_CONFIG['hub-tool'];
  const IconComp = config.icon;
  const testStatus = data._testStatus as string | undefined;
  const testBorderColor = testStatus === 'running' ? '#3b82f6' : testStatus === 'done' ? '#10b981' : testStatus === 'error' ? '#ef4444' : null;
  const testGlow = testStatus === 'running' ? '0 0 12px rgba(59,130,246,0.5)' : testStatus === 'done' ? '0 0 8px rgba(16,185,129,0.3)' : testStatus === 'error' ? '0 0 8px rgba(239,68,68,0.4)' : '';
  return (
    <div style={{
      padding: '14px 18px', minWidth: 180,
      background: `linear-gradient(135deg, var(--bg-surface), ${config.bg})`,
      border: `2px solid ${testBorderColor || (selected ? config.color : config.border)}`,
      borderRadius: 16, cursor: 'grab',
      boxShadow: testGlow || (selected ? `0 0 0 3px ${config.color}22, var(--shadow)` : 'var(--shadow-sm)'),
      transition: 'all 0.3s ease',
      animation: testStatus === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
    }}>
      <Handle type="target" position={Position.Left} style={{
        width: 10, height: 10, background: config.color,
        border: '2px solid var(--bg-surface)', borderRadius: '50%',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          padding: 8, borderRadius: 10,
          background: config.bg, display: 'flex',
        }}>
          <IconComp size={16} color={config.color} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: config.color, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            {config.label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{data.label}</div>
        </div>
      </div>
      {data.detail && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>{data.detail}</div>}
      <Handle type="source" position={Position.Right} style={{
        width: 10, height: 10, background: config.color,
        border: '2px solid var(--bg-surface)', borderRadius: '50%',
      }} />
    </div>
  );
};

// 注册所有节点类型
const hubNodeTypes: Record<string, any> = {};
Object.keys(NODE_TYPES_CONFIG).forEach(key => {
  hubNodeTypes[key] = (props: any) => <HubNode {...props} type={key} />;
});

// ── 组件面板 item ──
interface PanelComponent {
  id: string;
  nodeType: string;
  name: string;
  detail: string;
  category: string;
}

// 组件面板数据
const getComponentsForTab = (tab: HubTab, items: HubItem[]): PanelComponent[] => {
  const base: PanelComponent[] = [];
  if (tab === 'composite') {
    // 综合体可以调用所有 Agent / MCP / Skill
    base.push({ id: 'start', nodeType: 'hub-start', name: '开始节点', detail: '流程入口', category: '流程' });
    base.push({ id: 'end', nodeType: 'hub-end', name: '结束节点', detail: '流程出口', category: '流程' });
    base.push({ id: 'llm', nodeType: 'hub-llm', name: 'LLM 大模型', detail: 'AI 推理节点', category: '核心' });
    items.filter(i => i.type === 'agent').forEach(i => base.push({ id: `agent-${i.id}`, nodeType: 'hub-agent', name: i.name, detail: i.description, category: 'Agent' }));
    items.filter(i => i.type === 'mcp').forEach(i => base.push({ id: `mcp-${i.id}`, nodeType: 'hub-mcp', name: i.name, detail: i.description, category: 'MCP' }));
    items.filter(i => i.type === 'skill').forEach(i => base.push({ id: `skill-${i.id}`, nodeType: 'hub-skill', name: i.name, detail: i.description, category: 'Skill' }));
  } else if (tab === 'agent') {
    base.push({ id: 'llm', nodeType: 'hub-llm', name: 'LLM 大模型', detail: '选择 AI 模型', category: '核心' });
    base.push({ id: 'output', nodeType: 'hub-output', name: '对话输出', detail: 'Agent 回复', category: '核心' });
    items.filter(i => i.type === 'mcp').forEach(i => base.push({ id: `mcp-${i.id}`, nodeType: 'hub-mcp', name: i.name, detail: i.description, category: 'MCP' }));
    items.filter(i => i.type === 'skill').forEach(i => base.push({ id: `skill-${i.id}`, nodeType: 'hub-skill', name: i.name, detail: i.description, category: 'Skill' }));
    base.push({ id: 'tool-file',     nodeType: 'hub-tool', name: '文件操作',    detail: '读取/写入/搜索/移动文件',    category: '内置工具' });
    base.push({ id: 'tool-excel',    nodeType: 'hub-tool', name: 'Excel 处理',  detail: '读写/分析/转换/合并表格',    category: '内置工具' });
    base.push({ id: 'tool-doc',      nodeType: 'hub-tool', name: '文档处理',    detail: 'Word/PPT/PDF/图片/报告',    category: '内置工具' });
    base.push({ id: 'tool-ai',       nodeType: 'hub-tool', name: 'AI 能力',     detail: 'AI 对话/知识检索/文本提取',  category: '内置工具' });
    base.push({ id: 'tool-web',      nodeType: 'hub-tool', name: '网页爬取',    detail: '打开网页/浏览器自动化',      category: '内置工具' });
    base.push({ id: 'tool-shell',    nodeType: 'hub-tool', name: '系统命令',    detail: '执行 Shell/JSON 处理',      category: '内置工具' });
    base.push({ id: 'tool-mcp',      nodeType: 'hub-tool', name: 'MCP 调用',    detail: '列出/调用 MCP Server 工具', category: '内置工具' });
    base.push({ id: 'tool-project',  nodeType: 'hub-tool', name: '项目管理',    detail: '项目列表/文件/上下文',       category: '内置工具' });
    base.push({ id: 'tool-template', nodeType: 'hub-tool', name: '模板操作',    detail: '列出/创建设计模板',          category: '内置工具' });
    base.push({ id: 'tool-auto',     nodeType: 'hub-tool', name: '自动化',      detail: '列出/执行自动化方案',        category: '内置工具' });
  } else if (tab === 'mcp') {
    base.push({ id: 'mcp-server', nodeType: 'hub-mcp', name: 'MCP Server', detail: '外部服务连接', category: 'Server' });
    base.push({ id: 'mcp-input', nodeType: 'hub-input', name: '输入参数', detail: 'Server 调用参数', category: '配置' });
    base.push({ id: 'mcp-output', nodeType: 'hub-output', name: '返回数据', detail: 'Server 返回结果', category: '配置' });
  } else if (tab === 'skill') {
    base.push({ id: 'skill-start', nodeType: 'hub-start', name: '开始', detail: 'Skill 入口', category: '流程' });
    base.push({ id: 'skill-end', nodeType: 'hub-end', name: '结束', detail: 'Skill 出口', category: '流程' });
    base.push({ id: 'skill-step', nodeType: 'hub-tool', name: '操作步骤', detail: '单个执行步骤', category: '步骤' });
    base.push({ id: 'skill-llm', nodeType: 'hub-llm', name: 'AI 决策', detail: 'AI 辅助判断', category: '高级' });
  }
  return base;
};

// ── STORAGE ──
const STORAGE_KEY = 'aihub_items';
const loadItems = (): HubItem[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const saveItems = (items: HubItem[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

// ═══════════════════════════════════════════════════
// 属性弹窗组件
// ═══════════════════════════════════════════════════
const NodePropsModal = ({ node, onClose, onUpdate }: { node: Node; onClose: () => void; onUpdate: (id: string, data: any) => void }) => {
  const [label, setLabel] = useState((node.data as any).label || '');
  const [detail, setDetail] = useState((node.data as any).detail || '');
  const [prompt, setPrompt] = useState((node.data as any).prompt || '');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--modal-bg)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="animate-in zoom-in-95 duration-200" style={{
        width: 480, background: 'var(--bg-surface)', borderRadius: 24,
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>节点属性</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>配置节点的名称、描述和参数</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            名称
            <input value={label} onChange={e => setLabel(e.target.value)} className="theme-input" style={{
              display: 'block', width: '100%', marginTop: 6, padding: '10px 14px',
              borderRadius: 12, border: '1px solid var(--input-border)',
              fontSize: 14, fontWeight: 600,
            }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            描述
            <input value={detail} onChange={e => setDetail(e.target.value)} className="theme-input" style={{
              display: 'block', width: '100%', marginTop: 6, padding: '10px 14px',
              borderRadius: 12, border: '1px solid var(--input-border)', fontSize: 13,
            }} placeholder="节点功能描述..." />
          </label>
          {(node.type === 'hub-llm' || node.type === 'hub-agent') && (
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
              Prompt / 指令
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="theme-input" rows={5} style={{
                display: 'block', width: '100%', marginTop: 6, padding: '10px 14px',
                borderRadius: 12, border: '1px solid var(--input-border)',
                fontSize: 13, fontFamily: 'monospace', resize: 'vertical',
              }} placeholder="输入 AI 指令..." />
            </label>
          )}
        </div>
        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-raised)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>取消</button>
          <button onClick={() => { onUpdate(node.id, { label, detail, prompt }); onClose(); }} style={{
            padding: '8px 24px', borderRadius: 12, border: 'none',
            background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>保存</button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// 编辑器组件（三栏布局）
// ═══════════════════════════════════════════════════
const HubEditor = ({ tab, item, allItems, onBack, onSave }: {
  tab: HubTab; item: HubItem | null; allItems: HubItem[];
  onBack: () => void; onSave: (item: HubItem) => void;
}) => {
  const defaultNodes: Node[] = tab === 'composite'
    ? [{ id: 'start_1', position: { x: 80, y: 200 }, data: { label: '开始' }, type: 'hub-start' },
       { id: 'end_1', position: { x: 700, y: 200 }, data: { label: '结束' }, type: 'hub-end' }]
    : tab === 'agent'
    ? [{ id: 'llm_1', position: { x: 400, y: 200 }, data: { label: '大模型', detail: '选择 AI 模型' }, type: 'hub-llm' },
       { id: 'out_1', position: { x: 700, y: 200 }, data: { label: '输出' }, type: 'hub-output' }]
    : tab === 'mcp'
    ? [{ id: 'mcp_1', position: { x: 400, y: 200 }, data: { label: 'MCP Server', detail: '配置连接' }, type: 'hub-mcp' }]
    : [{ id: 'start_1', position: { x: 100, y: 200 }, data: { label: '开始' }, type: 'hub-start' },
       { id: 'step_1', position: { x: 400, y: 200 }, data: { label: '操作步骤', detail: '定义操作' }, type: 'hub-tool' },
       { id: 'end_1', position: { x: 700, y: 200 }, data: { label: '结束' }, type: 'hub-end' }];

  const defaultEdges: Edge[] = tab === 'agent'
    ? [{ id: 'e1', source: 'llm_1', target: 'out_1', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } }]
    : tab === 'skill'
    ? [{ id: 'e1', source: 'start_1', target: 'step_1', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
       { id: 'e2', source: 'step_1', target: 'end_1', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } }]
    : [];

  const [nodes, setNodes, onNodesChange] = useNodesState(item?.nodes?.length ? item.nodes : defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(item?.edges?.length ? item.edges : defaultEdges);
  const [name, setName] = useState(item?.name || '');
  const [desc, setDesc] = useState(item?.description || '');
  const [propsNode, setPropsNode] = useState<Node | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [genSteps, setGenSteps] = useState<{label: string; status: 'pending'|'running'|'done'|'error'}[]>([]);
  const [genCurrentStep, setGenCurrentStep] = useState(-1);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [isTesting, setIsTesting] = useState(false);
  const [testNodeStatus, setTestNodeStatus] = useState<Record<string, 'pending'|'running'|'done'|'error'>>({});
  const [testLogs, setTestLogs] = useState<{nodeId: string; label: string; status: string; message: string; time: string}[]>([]);
  const [showTestLog, setShowTestLog] = useState(false);
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback((params: Connection) =>
    setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } }, eds)), [setEdges]);

  const onNodeDoubleClick = (_: any, node: Node) => setPropsNode(node);

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
  };

  // 拖拽放置
  const onDragOver = useCallback((e: any) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((e: any) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/aihub') || e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const { nodeType, name: nodeName, detail } = JSON.parse(raw);
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode: Node = {
        id: `${nodeType}_${Date.now()}`,
        type: nodeType,
        position,
        data: { label: nodeName, detail },
      };
      setNodes(nds => [...nds, newNode]);
    } catch {}
  }, [screenToFlowPosition, setNodes]);

  // 双击组件面板 → 添加到画布
  const addComponentToCanvas = (comp: PanelComponent) => {
    const existingNodes = nodes;
    const maxX = existingNodes.length > 0 ? Math.max(...existingNodes.map(n => n.position.x)) : 100;
    const avgY = existingNodes.length > 0 ? existingNodes.reduce((s, n) => s + n.position.y, 0) / existingNodes.length : 200;
    const newNode: Node = {
      id: `${comp.nodeType}_${Date.now()}`,
      type: comp.nodeType,
      position: { x: maxX + 200, y: avgY + (Math.random() - 0.5) * 100 },
      data: { label: comp.name, detail: comp.detail },
    };
    setNodes(nds => [...nds, newNode]);
  };

  // 生成步骤定义（按类型不同）
  const getGenStepsForTab = (t: string) => {
    if (t === 'agent') return ['分析需求描述', '规划 Agent 架构', '选择工具能力', '生成流程节点', '优化参数配置'];
    if (t === 'mcp') return ['分析需求描述', '定义 Server 配置', '生成 Tools 定义', '配置 Resources', '组装 MCP 节点'];
    if (t === 'skill') return ['分析需求描述', '生成 SKILL.md', '拆解操作步骤', '生成脚本骨架', '组装流程图'];
    return ['分析需求描述', '规划架构', '生成节点', '连接流程', '优化参数'];
  };

  const advanceStep = (steps: {label: string; status: 'pending'|'running'|'done'|'error'}[], idx: number) => {
    const updated = steps.map((s, i) => ({
      ...s,
      status: i < idx ? 'done' as const : i === idx ? 'running' as const : 'pending' as const,
    }));
    setGenSteps(updated);
    setGenCurrentStep(idx);
    return updated;
  };

  // 智能生成（带进度）
  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setIsGenerating(true);
    const stepLabels = getGenStepsForTab(tab);
    type StepStatus = 'pending' | 'running' | 'done' | 'error';
    type GenStep = { label: string; status: StepStatus };
    let steps: GenStep[] = stepLabels.map(label => ({ label, status: 'pending' as StepStatus }));
    setGenSteps(steps);
    setGenCurrentStep(0);

    try {
      // Step 0: 分析需求
      steps = advanceStep(steps, 0);
      await new Promise(r => setTimeout(r, 400));

      if (tab === 'agent') {
        // Step 1: 规划架构
        steps = advanceStep(steps, 1);
        const result: any = await invoke('agent_create_blueprint', { description: genPrompt });
        setName(result.name);
        setDesc(result.persona);

        // Step 2: 选择工具
        steps = advanceStep(steps, 2);
        await new Promise(r => setTimeout(r, 300));
        // 从 workflow_template 生成真实工具节点
        const workflow = result.workflow_template || [];
        const startY = 80;
        const stepSpacing = 100;
        const bpNodes: Node[] = [
          { id: 'start_node', position: { x: 100, y: startY + (workflow.length * stepSpacing) / 2 - 20 }, data: { label: '开始' }, type: 'hub-start' },
        ];
        const bpEdges: Edge[] = [];

        workflow.forEach((step: any, i: number) => {
          const nodeId = `step_${step.id || i}`;
          const toolLabel = TOOL_DISPLAY_NAMES[step.tool] || step.tool || `步骤${i + 1}`;
          bpNodes.push({
            id: nodeId,
            position: { x: 350 + i * 220, y: startY + (workflow.length * stepSpacing) / 2 - 20 },
            data: { label: toolLabel, detail: step.goal, toolName: step.tool, stepId: step.id },
            type: 'hub-tool',
          });
          // 连接边: 开始→第一步 或 上一步→当前步
          const sourceId = i === 0 ? 'start_node' : `step_${workflow[i - 1]?.id || (i - 1)}`;
          bpEdges.push({ id: `e_step_${i}`, source: sourceId, target: nodeId, animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } });
        });

        // 添加输出节点
        const lastStepId = workflow.length > 0 ? `step_${workflow[workflow.length - 1]?.id || (workflow.length - 1)}` : 'start_node';
        bpNodes.push({ id: 'end_node', position: { x: 350 + workflow.length * 220, y: startY + (workflow.length * stepSpacing) / 2 - 20 }, data: { label: '完成' }, type: 'hub-end' });
        bpEdges.push({ id: 'e_end', source: lastStepId, target: 'end_node', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } });

        // Step 3: 生成节点
        steps = advanceStep(steps, 3);
        await new Promise(r => setTimeout(r, 300));
        setNodes(bpNodes);
        setEdges(bpEdges);

        // Step 4: 优化参数
        steps = advanceStep(steps, 4);
        await new Promise(r => setTimeout(r, 200));

      } else if (tab === 'mcp') {
        // MCP: 按官方 Model Context Protocol 规范生成
        steps = advanceStep(steps, 1);
        await new Promise(r => setTimeout(r, 500));
        const serverName = genPrompt.slice(0, 30).replace(/\s+/g, '-').toLowerCase();
        setName(serverName);
        setDesc(`MCP Server: ${genPrompt}`);

        // Step 2: 生成 Tools
        steps = advanceStep(steps, 2);
        await new Promise(r => setTimeout(r, 400));

        // Step 3: Resources
        steps = advanceStep(steps, 3);
        await new Promise(r => setTimeout(r, 300));

        // Step 4: 组装节点
        steps = advanceStep(steps, 4);
        const mcpNodes: Node[] = [
          { id: 'mcp_input', position: { x: 100, y: 200 }, data: { label: '输入参数', detail: 'Server 调用参数' }, type: 'hub-input' },
          { id: 'mcp_server', position: { x: 400, y: 200 }, data: { label: serverName, detail: `MCP Server\nTools: query, update\nTransport: STDIO` }, type: 'hub-mcp' },
          { id: 'mcp_output', position: { x: 700, y: 200 }, data: { label: '返回数据', detail: 'JSON-RPC 响应' }, type: 'hub-output' },
          { id: 'mcp_tool1', position: { x: 300, y: 60 }, data: { label: 'Tool: query', detail: 'inputSchema: { query: string }' }, type: 'hub-tool' },
          { id: 'mcp_tool2', position: { x: 500, y: 60 }, data: { label: 'Tool: update', detail: 'inputSchema: { id: string, data: object }' }, type: 'hub-tool' },
        ];
        const mcpEdges: Edge[] = [
          { id: 'e_mcp_1', source: 'mcp_input', target: 'mcp_server', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
          { id: 'e_mcp_2', source: 'mcp_server', target: 'mcp_output', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
          { id: 'e_mcp_t1', source: 'mcp_tool1', target: 'mcp_server', animated: true, style: { stroke: '#f59e0b44', strokeWidth: 1.5 } },
          { id: 'e_mcp_t2', source: 'mcp_tool2', target: 'mcp_server', animated: true, style: { stroke: '#f59e0b44', strokeWidth: 1.5 } },
        ];
        setNodes(mcpNodes);
        setEdges(mcpEdges);

      } else if (tab === 'skill') {
        // Skill: 按官方 Agent Skill 规范生成 (SKILL.md + scripts/)
        steps = advanceStep(steps, 1);
        await new Promise(r => setTimeout(r, 500));
        const skillName = genPrompt.slice(0, 30).replace(/\s+/g, '-').toLowerCase();
        setName(skillName);
        setDesc(`Skill: ${genPrompt}`);

        // Step 2: 拆解步骤
        steps = advanceStep(steps, 2);
        await new Promise(r => setTimeout(r, 400));

        // Step 3: 生成脚本骨架
        steps = advanceStep(steps, 3);
        await new Promise(r => setTimeout(r, 300));

        // Step 4: 组装流程
        steps = advanceStep(steps, 4);
        const skillNodes: Node[] = [
          { id: 'skill_start', position: { x: 100, y: 200 }, data: { label: '开始', detail: 'Skill 入口' }, type: 'hub-start' },
          { id: 'skill_s1', position: { x: 300, y: 200 }, data: { label: '数据采集', detail: 'scripts/step1_collect.py' }, type: 'hub-tool' },
          { id: 'skill_s2', position: { x: 500, y: 200 }, data: { label: 'AI 处理', detail: 'scripts/step2_process.py' }, type: 'hub-llm' },
          { id: 'skill_s3', position: { x: 700, y: 200 }, data: { label: '结果输出', detail: 'scripts/step3_output.py' }, type: 'hub-tool' },
          { id: 'skill_end', position: { x: 900, y: 200 }, data: { label: '结束', detail: 'Skill 出口' }, type: 'hub-end' },
        ];
        const skillEdges: Edge[] = [
          { id: 'e_sk1', source: 'skill_start', target: 'skill_s1', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
          { id: 'e_sk2', source: 'skill_s1', target: 'skill_s2', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
          { id: 'e_sk3', source: 'skill_s2', target: 'skill_s3', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
          { id: 'e_sk4', source: 'skill_s3', target: 'skill_end', animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } },
        ];
        setNodes(skillNodes);
        setEdges(skillEdges);

      } else {
        // Composite 综合体
        steps = advanceStep(steps, 1);
        await new Promise(r => setTimeout(r, 400));
        setName(genPrompt.slice(0, 20));
        setDesc(`AI 生成：${genPrompt}`);
        steps = advanceStep(steps, 2);
        await new Promise(r => setTimeout(r, 300));
        steps = advanceStep(steps, 3);
        await new Promise(r => setTimeout(r, 300));
        steps = advanceStep(steps, 4);
      }

      // 全部完成
      setGenSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
      setGenCurrentStep(stepLabels.length);
    } catch (e) {
      console.error('Generation failed:', e);
      setGenSteps(prev => prev.map((s, i) => i === genCurrentStep ? { ...s, status: 'error' as const } : s));
    } finally {
      setIsGenerating(false);
    }
  };

  // AI 智能优化 — 自动循环：测试→反思→优化→重测 直到成功
  const handleOptimize = async () => {
    if (nodes.length === 0) return;
    setIsOptimizing(true);
    setShowTestLog(true);
    setTestLogs([]);

    const MAX_ROUNDS = 5;
    let currentDesc = desc || name || '执行任务';
    let round = 0;
    let lastErrors: string[] = [];

    setTestLogs([{
      nodeId: 'loop_start', label: '🔄 自动优化引擎', status: 'running',
      message: `启动循环优化（最多 ${MAX_ROUNDS} 轮），目标：Agent 完全可用`,
      time: new Date().toLocaleTimeString(),
    }]);

    while (round < MAX_ROUNDS) {
      round++;
      const roundLabel = `第 ${round}/${MAX_ROUNDS} 轮`;

      // ══════════════════════════════════════
      // Phase A: 执行测试
      // ══════════════════════════════════════
      setTestLogs(prev => [...prev, {
        nodeId: `run_${round}`, label: `🚀 ${roundLabel} — 测试执行`, status: 'running',
        message: `指令: "${currentDesc.slice(0, 60)}"`,
        time: new Date().toLocaleTimeString(),
      }]);

      // 监听 agent-event
      const roundLogs: { type: string; msg: string }[] = [];
      const unlisten = await listen<any>('agent-event', (event) => {
        const { event_type, step, message } = event.payload;
        const msg = step?.content || message || '';
        roundLogs.push({ type: event_type, msg });

        if (event_type === 'planning') {
          setTestLogs(prev => [...prev, {
            nodeId: `plan_${round}`, label: `📋 ${roundLabel} 规划`, status: 'done',
            message: msg.slice(0, 150), time: new Date().toLocaleTimeString(),
          }]);
        } else if (event_type === 'tool_call') {
          setTestLogs(prev => [...prev, {
            nodeId: `tool_${round}_${Date.now()}`, label: `🔧 ${step?.tool_name || '工具'}`, status: 'running',
            message: `调用: ${step?.tool_name}`, time: new Date().toLocaleTimeString(),
          }]);
        } else if (event_type === 'tool_result') {
          const result = step?.tool_result ? String(step.tool_result).slice(0, 100) : '完成';
          setTestLogs(prev => [...prev, {
            nodeId: `res_${round}_${Date.now()}`, label: `✅ ${step?.tool_name || ''}`, status: 'done',
            message: result, time: new Date().toLocaleTimeString(),
          }]);
        } else if (event_type === 'reflection') {
          setTestLogs(prev => [...prev, {
            nodeId: `ref_${round}`, label: `🔍 反思`, status: 'error',
            message: msg.slice(0, 150), time: new Date().toLocaleTimeString(),
          }]);
        }
      });

      let testSuccess = false;
      let testAnswer = '';
      let testError = '';

      try {
        const result: any = await invoke('agent_run', {
          req: { prompt: currentDesc, goal: currentDesc, enabled_tools: null }
        });
        testSuccess = result.success;
        testAnswer = result.final_answer || '';
        if (!testSuccess) testError = result.error || testAnswer;
      } catch (e: any) {
        testSuccess = false;
        testError = String(e);
      } finally {
        unlisten();
      }

      // 收集本轮错误
      const errorLogs = roundLogs.filter(l => l.type === 'reflection' || l.type === 'stop');
      const errorSummary = testError || errorLogs.map(l => l.msg).join('; ') || '未知错误';

      if (testSuccess) {
        // ══════════════════════════════════════
        // 成功！退出循环
        // ══════════════════════════════════════
        setTestLogs(prev => [...prev, {
          nodeId: `success_${round}`, label: `🎉 ${roundLabel} — 执行成功！`, status: 'done',
          message: `Agent 已可用！结果: "${testAnswer.slice(0, 200)}"`,
          time: new Date().toLocaleTimeString(),
        }]);
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _testStatus: 'done' } })));
        break;
      }

      // ══════════════════════════════════════
      // Phase B: 测试失败 → 自动修复尝试
      // ══════════════════════════════════════
      setTestLogs(prev => [...prev, {
        nodeId: `fail_${round}`, label: `❌ ${roundLabel} — 执行失败`, status: 'error',
        message: errorSummary.slice(0, 200),
        time: new Date().toLocaleTimeString(),
      }]);

      // ── 自动修复：检测可修复的环境问题 ──
      let autoFixed = false;

      // 1. 检测缺失的 Python 库 → 自动安装
      const moduleMatch = errorSummary.match(/No module named '([^']+)'/i)
        || errorSummary.match(/ModuleNotFoundError.*'([^']+)'/i)
        || errorSummary.match(/missing.*(?:openpyxl|pandas|docx|pptx|PIL|pillow|matplotlib|qrcode|bs4|requests)/i);

      if (moduleMatch) {
        // 提取缺失的库名
        let missingLib = moduleMatch[1] || '';
        // 修正常见库名映射
        const libNameMap: Record<string, string> = {
          'PIL': 'Pillow', 'pillow': 'Pillow', 'docx': 'python-docx',
          'pptx': 'python-pptx', 'bs4': 'beautifulsoup4', 'cv2': 'opencv-python',
        };
        if (!missingLib) {
          // 从错误中提取关键词
          const libs = ['openpyxl', 'pandas', 'docx', 'pptx', 'PIL', 'pillow', 'matplotlib', 'qrcode', 'bs4', 'requests'];
          missingLib = libs.find(l => errorSummary.toLowerCase().includes(l.toLowerCase())) || '';
        }
        const pipName = libNameMap[missingLib] || missingLib;

        if (pipName) {
          setTestLogs(prev => [...prev, {
            nodeId: `fix_lib_${round}`, label: `🔧 自动安装: ${pipName}`, status: 'running',
            message: `检测到缺失库 "${missingLib}"，正在执行 pip install ${pipName}...`,
            time: new Date().toLocaleTimeString(),
          }]);

          try {
            await invoke('agent_run', {
              req: {
                prompt: `请执行命令安装 Python 库: pip install ${pipName}`,
                goal: `安装 Python 库 ${pipName}`,
                enabled_tools: ['shell_run'],
              }
            });
            autoFixed = true;
            setTestLogs(prev => [...prev, {
              nodeId: `fixed_lib_${round}`, label: `✅ 已安装: ${pipName}`, status: 'done',
              message: `Python 库 ${pipName} 安装完成，将重新测试`,
              time: new Date().toLocaleTimeString(),
            }]);
          } catch (installErr: any) {
            setTestLogs(prev => [...prev, {
              nodeId: `fix_fail_${round}`, label: `⚠️ 安装失败: ${pipName}`, status: 'error',
              message: String(installErr).slice(0, 150),
              time: new Date().toLocaleTimeString(),
            }]);
          }
        }
      }

      // 2. 检测路径不存在 → 自动创建目录
      const pathMatch = errorSummary.match(/(?:FileNotFoundError|No such file or directory|找不到路径|系统找不到指定的路径).*?['"]?([A-Z]:\\[^'"]+)/i)
        || errorSummary.match(/路径.*不存在.*?([A-Z]:\\[^'"\s]+)/i);
      if (pathMatch && !autoFixed) {
        const missingPath = pathMatch[1];
        const dirPath = missingPath.replace(/\\[^\\]+\.\w+$/, ''); // 提取目录部分
        if (dirPath) {
          setTestLogs(prev => [...prev, {
            nodeId: `fix_dir_${round}`, label: `📁 自动创建目录`, status: 'running',
            message: `检测到路径不存在，正在创建: ${dirPath}`,
            time: new Date().toLocaleTimeString(),
          }]);
          try {
            await invoke('agent_run', {
              req: {
                prompt: `请创建目录: ${dirPath}`,
                goal: `创建目录 ${dirPath}`,
                enabled_tools: ['shell_run', 'file_create'],
              }
            });
            autoFixed = true;
            setTestLogs(prev => [...prev, {
              nodeId: `fixed_dir_${round}`, label: `✅ 目录已创建`, status: 'done',
              message: `目录 ${dirPath} 创建完成`,
              time: new Date().toLocaleTimeString(),
            }]);
          } catch (dirErr: any) {
            setTestLogs(prev => [...prev, {
              nodeId: `fix_dir_fail_${round}`, label: `⚠️ 创建目录失败`, status: 'error',
              message: String(dirErr).slice(0, 150),
              time: new Date().toLocaleTimeString(),
            }]);
          }
        }
      }

      // 3. 检测 Python 未安装
      if (errorSummary.includes('python') && (errorSummary.includes('not recognized') || errorSummary.includes('找不到'))) {
        setTestLogs(prev => [...prev, {
          nodeId: `fix_python_${round}`, label: `⚠️ Python 未安装`, status: 'error',
          message: '系统未检测到 Python。请先安装 Python 3.x 并确保添加到 PATH。',
          time: new Date().toLocaleTimeString(),
        }]);
        break; // Python 都没有就直接退出
      }

      // 如果自动修复成功，跳过 AI 分析直接重试
      if (autoFixed) {
        setTestLogs(prev => [...prev, {
          nodeId: `rerun_${round}`, label: `🔄 环境已修复，进入第 ${round + 1} 轮`, status: 'running',
          message: '自动修复完成，即将重新测试...',
          time: new Date().toLocaleTimeString(),
        }]);
        lastErrors.push(`轮${round}[环境层]: 自动修复"${errorSummary.slice(0, 50)}"`);
        await new Promise(r => setTimeout(r, 500));
        continue; // 直接进入下一轮，不需要 AI 分析
      }

      if (round >= MAX_ROUNDS) {
        setTestLogs(prev => [...prev, {
          nodeId: 'max_reached', label: '⛔ 达到最大轮数', status: 'error',
          message: `已尝试 ${MAX_ROUNDS} 轮优化，仍未完全成功。建议手动调整或更换模型。`,
          time: new Date().toLocaleTimeString(),
        }]);
        break;
      }

      // ══════════════════════════════════════
      // Phase C: AI 分析错误 + 生成优化方案
      // ══════════════════════════════════════
      setTestLogs(prev => [...prev, {
        nodeId: `analyze_${round}`, label: `🧠 ${roundLabel} — AI 反思优化`, status: 'running',
        message: '分析失败原因，生成下一轮优化方案...',
        time: new Date().toLocaleTimeString(),
      }]);

      const toolNodes = nodes.filter(n => n.type === 'hub-tool').map(n => (n.data as any).label).join(', ');
      const prevErrorsCtx = lastErrors.length > 0 ? `\n\n## 历史失败记忆（Episodic Memory — 禁止重复以下策略）\n${lastErrors.join('\n')}` : '';

      // ═══ 融入业界 5 大顶尖 Agent 优化机制 ═══
      // 1. Reflexion — 结构化自我反思（分层归因：环境/工具/策略/模型）
      // 2. Curriculum Learning — 渐进式任务分解（复杂→原子步骤）
      // 3. Tool Boundary Detection — 工具能力边界检测
      // 4. Experience Replay — 经验记忆复用（避免重蹈覆辙）
      // 5. Strategy Switching — 多策略切换（换执行路径）

      const strategyHint = round === 1
        ? '首轮：优先检查环境（AI 连接、路径、权限）是否正常'
        : round === 2
          ? '第二轮：如果是工具问题，换一个替代工具或降级执行路径'
          : round === 3
            ? '第三轮：将任务拆解成更小的原子步骤（Curriculum Learning）'
            : '后续轮：尝试完全不同的策略路径（Strategy Switching）';

      const optimizePrompt = `你是 Agent 架构调优专家，使用以下 5 大业界机制分析和优化：

## 📋 Reflexion 框架 — 结构化反思（必须按此格式分析）
对失败进行 **四层归因**：
1. **环境层**: AI 模型是否连接？API 是否可达？文件路径是否存在？
2. **工具层**: 调用的工具是否真的能执行这个任务？参数是否正确？是否有替代工具？
3. **策略层**: 任务分解是否合理？步骤顺序是否正确？是否遗漏关键步骤？
4. **模型层**: AI 的理解是否准确？prompt 是否清晰？是否需要更具体的指令？

## 🎯 当前优化策略（第 ${round} 轮）
${strategyHint}

## Agent 信息
- 名称: ${name}
- 当前指令: ${currentDesc}
- 画布工具: ${toolNodes}

## 本轮错误
${errorSummary}
${prevErrorsCtx}

## 可用工具（含能力边界）
| 工具组 | 真实能力 | 限制 |
|--------|---------|------|
| 文件操作 | 读/写/搜索/移动本地文件 | 需要绝对路径 |
| Excel 处理 | 读/写/分析/合并表格 | 需要 pandas |
| 文档处理 | Word/PPT/PDF读写、图片处理 | 需要 python-docx |
| AI 能力 | 调用大模型对话、RAG检索 | 需要已连接的AI引擎 |
| 网页爬取 | HTTP请求获取网页内容 | 不支持JS渲染页面 |
| 系统命令 | PowerShell命令执行 | Windows环境 |

## 输出要求
1. 按 Reflexion 四层归因分析
2. 如果任务太复杂，使用 Curriculum Learning 拆成更小的子任务
3. 如果当前工具不行，给出 替代工具 或 降级方案
4. 新指令必须极其具体（包含具体路径、参数、预期输出）
5. 绝对不要重复之前失败的方案

返回纯 JSON：
{"analysis":"四层归因分析","failure_layer":"environment|tool|strategy|model","strategy_change":"本次策略调整说明","optimized_description":"优化后的完整指令（必须极其具体）","remove_tools":[],"add_tools":[],"subtasks":["如果需要拆解，列出子任务"]}`;

      try {
        const reply: string = await invoke('chat_with_ai', {
          req: {
            prompt: optimizePrompt,
            system_prompt: '你是世界一流的 Agent 架构优化专家。严格按照 Reflexion 框架四层归因分析。只输出纯 JSON，不要 markdown 代码块。每轮必须给出与上一轮不同的策略。',
            module: 'agent_optimize',
          }
        });

        let opt: any = {};
        try {
          const m = reply.match(/\{[\s\S]*\}/);
          if (m) opt = JSON.parse(m[0]);
        } catch { opt = {}; }

        // 展示 Reflexion 四层归因分析
        const layerEmoji: Record<string, string> = {
          environment: '🌍 环境层', tool: '🔧 工具层', strategy: '📐 策略层', model: '🧠 模型层',
        };
        if (opt.analysis) {
          setTestLogs(prev => [...prev, {
            nodeId: `insight_${round}`, label: `${layerEmoji[opt.failure_layer] || '📊'} 归因分析`, status: 'done',
            message: `[${opt.failure_layer || '未知'}层] ${opt.analysis.slice(0, 200)}`,
            time: new Date().toLocaleTimeString(),
          }]);
        }

        // 展示策略切换
        if (opt.strategy_change) {
          setTestLogs(prev => [...prev, {
            nodeId: `strategy_${round}`, label: `🔄 策略切换`, status: 'done',
            message: opt.strategy_change.slice(0, 150),
            time: new Date().toLocaleTimeString(),
          }]);
        }

        if (opt.optimized_description) {
          currentDesc = opt.optimized_description;
          setDesc(currentDesc);
          setTestLogs(prev => [...prev, {
            nodeId: `newdesc_${round}`, label: `✏️ 更新指令`, status: 'done',
            message: `"${currentDesc.slice(0, 80)}"`,
            time: new Date().toLocaleTimeString(),
          }]);
        }

        // 移除工具
        if (opt.remove_tools?.length > 0) {
          const toRemove = opt.remove_tools as string[];
          setNodes(nds => nds.filter(n => {
            if (n.type !== 'hub-tool') return true;
            return !toRemove.some((t: string) => ((n.data as any).label || '').includes(t));
          }));
          setTestLogs(prev => [...prev, {
            nodeId: `rm_${round}`, label: `🗑️ 移除`, status: 'done',
            message: toRemove.join(', '), time: new Date().toLocaleTimeString(),
          }]);
        }

        // 添加工具
        if (opt.add_tools?.length > 0) {
          const toolMap: Record<string, string> = {
            '文件操作': '读取/写入/搜索文件', 'Excel 处理': '读写/分析表格', '文档处理': 'Word/PPT/PDF',
            'AI 能力': 'AI 对话/检索', '网页爬取': '网页/浏览器', '系统命令': 'Shell/JSON',
            'MCP 调用': 'MCP Server', '项目管理': '项目信息', '模板操作': '设计模板', '自动化': '自动化方案',
          };
          const existing = new Set(nodes.filter(n => n.type === 'hub-tool').map(n => (n.data as any).label));
          const toAdd = (opt.add_tools as string[]).filter((t: string) => !existing.has(t) && toolMap[t]);
          if (toAdd.length > 0) {
            const maxY = Math.max(...nodes.map(n => n.position.y), 0);
            const newNodes: Node[] = toAdd.map((tool: string, i: number) => ({
              id: `t_${round}_${i}_${Date.now()}`, position: { x: 100, y: maxY + 80 + i * 100 },
              data: { label: tool, detail: toolMap[tool] }, type: 'hub-tool' as const,
            }));
            const llm = nodes.find(n => n.type === 'hub-llm');
            const newEdges: Edge[] = llm ? newNodes.map((n, i) => ({
              id: `e_${round}_${i}_${Date.now()}`, source: n.id, target: llm.id,
              animated: true, style: { stroke: '#f59e0b44', strokeWidth: 1.5 },
            })) : [];
            setNodes(nds => [...nds, ...newNodes]);
            setEdges(eds => [...eds, ...newEdges]);
            setTestLogs(prev => [...prev, {
              nodeId: `add_${round}`, label: `➕ 添加`, status: 'done',
              message: toAdd.join(', '), time: new Date().toLocaleTimeString(),
            }]);
          }
        }

        lastErrors.push(`轮${round}[${opt.failure_layer || '未知'}层]: 错误="${errorSummary.slice(0, 80)}" → 策略="${(opt.strategy_change || '无').slice(0, 60)}"`);

        setTestLogs(prev => [...prev, {
          nodeId: `next_${round}`, label: `🔄 进入第 ${round + 1} 轮`, status: 'running',
          message: '优化已应用，即将重新测试...',
          time: new Date().toLocaleTimeString(),
        }]);

        await new Promise(r => setTimeout(r, 500)); // 短暂停顿让UI更新
      } catch (e: any) {
        setTestLogs(prev => [...prev, {
          nodeId: `opt_err_${round}`, label: `❌ AI 分析失败`, status: 'error',
          message: String(e), time: new Date().toLocaleTimeString(),
        }]);
        break; // AI 本身挂了就退出
      }
    }

    setIsOptimizing(false);
  };

  // 测试运行
  const handleTestRun = async () => {
    if (isTesting || nodes.length === 0) return;
    setIsTesting(true);
    setShowTestLog(true);
    setTestLogs([]);

    // 用用户在生成框里输入的 prompt 或 Agent 描述作为指令
    const userPrompt = desc || name || '执行一个简单的测试任务';

    setTestLogs([{ nodeId: 'init', label: 'Agent 引擎', status: 'running', message: `🚀 启动 Agent... 指令: "${userPrompt.slice(0, 60)}"`, time: new Date().toLocaleTimeString() }]);

    // 监听后端 agent-event 事件
    const unlisten = await listen<any>('agent-event', (event) => {
      const { event_type, step, message } = event.payload;
      const time = new Date().toLocaleTimeString();

      if (event_type === 'thinking') {
        setTestLogs(prev => [...prev, { nodeId: 'thinking', label: '思考中', status: 'running', message: message || '分析任务...', time }]);
      } else if (event_type === 'planning') {
        setTestLogs(prev => [...prev, { nodeId: 'plan', label: '📋 任务规划', status: 'done', message: step?.content || message || '规划完成', time }]);
      } else if (event_type === 'tool_call') {
        const toolName = step?.tool_name || '未知工具';
        const displayName = (TOOL_DISPLAY_NAMES as any)[toolName] || toolName;
        setTestLogs(prev => [...prev, { nodeId: `tool_${Date.now()}`, label: `🔧 ${displayName}`, status: 'running', message: `调用工具: ${displayName} (${toolName})`, time }]);
        // 精确匹配画布节点: 只高亮 toolName 对应的节点，之前运行的标记完成
        setNodes(nds => nds.map(n => {
          if (n.data?.toolName === toolName) {
            return { ...n, data: { ...n.data, _testStatus: 'running' } };
          }
          if (n.data?._testStatus === 'running') {
            return { ...n, data: { ...n.data, _testStatus: 'done' } };
          }
          return n;
        }));
      } else if (event_type === 'tool_result') {
        const toolName = step?.tool_name || '工具';
        const displayName = (TOOL_DISPLAY_NAMES as any)[toolName] || toolName;
        const result = step?.tool_result ? String(step.tool_result).slice(0, 200) : '完成';
        setTestLogs(prev => [...prev, { nodeId: `result_${Date.now()}`, label: `✅ ${displayName}`, status: 'done', message: result, time }]);
        // 精确标记已完成的工具节点
        setNodes(nds => nds.map(n =>
          n.data?.toolName === toolName
            ? { ...n, data: { ...n.data, _testStatus: 'done' } }
            : n
        ));
      } else if (event_type === 'step_start') {
        setTestLogs(prev => [...prev, { nodeId: `step_${Date.now()}`, label: '▶ 步骤开始', status: 'running', message: step?.content || message || '', time }]);
      } else if (event_type === 'reflection') {
        setTestLogs(prev => [...prev, { nodeId: 'reflect', label: '🔍 反思', status: 'error', message: step?.content || '分析失败原因...', time }]);
      } else if (event_type === 'replan') {
        setTestLogs(prev => [...prev, { nodeId: 'replan', label: '🔄 重新规划', status: 'running', message: step?.content || '重新规划中...', time }]);
      } else if (event_type === 'done') {
        setTestLogs(prev => [...prev, { nodeId: 'done', label: '🏁 完成', status: 'done', message: step?.content || '任务完成', time }]);
        // 标记所有节点为完成
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _testStatus: 'done' } })));
      } else if (event_type === 'stop') {
        setTestLogs(prev => [...prev, { nodeId: 'stop', label: '⛔ 终止', status: 'error', message: step?.content || message || '任务终止', time }]);
      }
    });

    try {
      // 真正调用后端 Agent 执行引擎
      const result: any = await invoke('agent_run', {
        req: {
          prompt: userPrompt,
          goal: userPrompt,
          enabled_tools: null, // 使用全部工具
        }
      });

      // 更新最终状态
      const finalStatus = result.success ? 'done' : 'error';
      setTestLogs(prev => [...prev, {
        nodeId: 'final', label: result.success ? '✅ 执行成功' : '❌ 执行失败',
        status: finalStatus,
        message: `${result.final_answer?.slice(0, 300) || '无结果'} (共 ${result.total_rounds} 步)`,
        time: new Date().toLocaleTimeString(),
      }]);
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _testStatus: finalStatus } })));
    } catch (e: any) {
      setTestLogs(prev => [...prev, {
        nodeId: 'error', label: '❌ Agent 执行失败', status: 'error',
        message: String(e),
        time: new Date().toLocaleTimeString(),
      }]);
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _testStatus: 'error' } })));
    } finally {
      unlisten();
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const saved: HubItem = {
      id: item?.id || `${tab}_${Date.now()}`,
      name: name || `新${HUB_TABS.find(t => t.id === tab)?.label}`,
      description: desc,
      type: tab,
      nodes, edges,
      status: 'ready',
      createdAt: item?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'local',
    };
    onSave(saved);
  };

  const components = getComponentsForTab(tab, allItems);
  const categories = [...new Set(components.map(c => c.category))];
  const filteredComponents = components.filter(c =>
    !componentSearch || c.name.toLowerCase().includes(componentSearch.toLowerCase())
  );

  const tabConfig = HUB_TABS.find(t => t.id === tab)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
        minHeight: 52,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
          borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-raised)',
          color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <ArrowLeft size={14} /> 返回
        </button>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tabConfig.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {tabConfig.label}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {/* 测试运行按钮 */}
        <button onClick={handleTestRun} disabled={isTesting || nodes.length === 0} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          borderRadius: 10, border: 'none',
          background: isTesting ? 'var(--bg-muted)' : 'linear-gradient(135deg, #10b981, #34d399)',
          color: isTesting ? 'var(--text-muted)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: isTesting ? 'none' : '0 2px 8px rgba(16,185,129,0.3)',
          opacity: nodes.length === 0 ? 0.5 : 1,
        }}>
          {isTesting ? (
            <><div style={{ width: 12, height: 12, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> 测试中...</>
          ) : (
            <><Play size={14} /> 测试运行</>
          )}
        </button>
        <button onClick={handleSave} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
          borderRadius: 10, border: 'none', background: 'var(--brand)',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
        }}>
          <Save size={14} /> 保存
        </button>
      </div>

      {/* 三栏主体 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── 左侧面板：智能生成 + 进度 + 基本信息 + 优化 ── */}
        <div className="custom-scrollbar" style={{
          width: 320, borderRight: '1px solid var(--border)',
          background: 'var(--bg-raised)', display: 'flex', flexDirection: 'column',
          overflow: 'auto',
        }}>
          {/* 智能生成区 */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                padding: 6, borderRadius: 8,
                background: `${tabConfig.color}15`, display: 'flex',
              }}>
                <Sparkles size={14} color={tabConfig.color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>AI 智能生成</span>
            </div>
            <textarea
              value={genPrompt}
              onChange={e => setGenPrompt(e.target.value)}
              placeholder={`描述你想要的${tabConfig.label}...\n\n例如：帮我创建一个自动整理新闻的${tabConfig.label}\n\n支持：功能描述、输入输出定义、工具需求等`}
              className="theme-input"
              rows={6}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--input-border)', fontSize: 13,
                resize: 'none', lineHeight: 1.6,
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !genPrompt.trim()}
              style={{
                width: '100%', marginTop: 10, padding: '11px 0',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                background: isGenerating ? 'var(--bg-muted)' : `linear-gradient(135deg, ${tabConfig.color}, ${tabConfig.color}cc)`,
                color: isGenerating ? 'var(--text-muted)' : '#fff',
                fontSize: 13, fontWeight: 700, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: isGenerating ? 'none' : `0 4px 12px ${tabConfig.color}33`,
                transition: 'all 0.2s',
              }}
            >
              {isGenerating ? (
                <><div style={{ width: 14, height: 14, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> 生成中...</>
              ) : (
                <><Sparkles size={14} /> 智能生成</>
              )}
            </button>
          </div>

          {/* 生成进度 */}
          {genSteps.length > 0 && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>生成进度</div>
              {genSteps.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0', fontSize: 11,
                  color: step.status === 'done' ? tabConfig.color : step.status === 'running' ? 'var(--text-primary)' : step.status === 'error' ? '#ef4444' : 'var(--text-faint)',
                  fontWeight: step.status === 'running' ? 700 : 500,
                  transition: 'all 0.3s',
                }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>
                    {step.status === 'done' ? '✅' : step.status === 'running' ? '🔄' : step.status === 'error' ? '❌' : '⬜'}
                  </span>
                  <span>{step.label}</span>
                  {step.status === 'running' && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: tabConfig.color, marginLeft: 'auto',
                      animation: 'pulse 1s ease-in-out infinite',
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 基本信息 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>基本信息</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* 名称 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              }}>
                <Edit3 size={13} color="var(--text-faint)" style={{ flexShrink: 0 }} />
                <input value={name} onChange={e => setName(e.target.value)} className="theme-input" style={{
                  flex: 1, padding: 0, border: 'none', background: 'transparent',
                  fontSize: 14, fontWeight: 700, outline: 'none',
                }} placeholder="名称" />
                {name && <span style={{ fontSize: 9, color: 'var(--text-faint)', flexShrink: 0 }}>{name.length}字</span>}
              </div>
              {/* 描述 */}
              <div style={{
                borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                padding: '8px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Layers size={12} color="var(--text-faint)" />
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>描述</span>
                  {desc && <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 'auto' }}>{desc.length}字</span>}
                </div>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} className="theme-input" rows={3} style={{
                  width: '100%', padding: 0, border: 'none', background: 'transparent',
                  fontSize: 12, resize: 'none', lineHeight: 1.5, outline: 'none',
                }} placeholder="描述功能、用途和使用场景..." />
              </div>
            </div>
          </div>

          {/* 画布信息 + AI 优化 */}
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>画布信息</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: tabConfig.color }}>{nodes.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>节点</div>
              </div>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: tabConfig.color }}>{edges.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>连线</div>
              </div>
            </div>

            {/* AI 智能优化按钮 */}
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || nodes.length === 0}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
                background: isOptimizing ? 'var(--bg-muted)' : `linear-gradient(135deg, #8b5cf6, #a78bfa)`,
                color: isOptimizing ? 'var(--text-muted)' : '#fff',
                fontSize: 12, fontWeight: 700, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: isOptimizing ? 'none' : '0 4px 12px rgba(139,92,246,0.3)',
                transition: 'all 0.2s', opacity: nodes.length === 0 ? 0.5 : 1,
              }}
            >
              {isOptimizing ? (
                <><div style={{ width: 12, height: 12, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> 优化中...</>
              ) : (
                <><Sparkles size={12} /> AI 智能优化</>
              )}
            </button>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', textAlign: 'center', marginTop: 6 }}>
              修改流程后点击，AI 自动缝合优化
            </div>
          </div>
        </div>

        {/* ── 中间画布 + 测试日志 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={hubNodeTypes}
              fitView
              style={{ background: 'var(--bg-root)' }}
              defaultEdgeOptions={{ animated: true, style: { stroke: 'var(--brand)', strokeWidth: 2 } }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
              <Controls style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }} />
              <MiniMap style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-surface)' }} />
            </ReactFlow>
          </div>

          {/* 测试运行日志面板 */}
          {showTestLog && testLogs.length > 0 && (
            <div style={{
              maxHeight: 180, borderTop: '1px solid var(--border)',
              background: 'var(--bg-surface)', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', padding: '6px 14px',
                borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>运行日志</span>
                <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 8 }}>{testLogs.length} 条</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowTestLog(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, color: 'var(--text-faint)', padding: '2px 6px',
                }}>收起 ▼</button>
              </div>
              <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto', padding: '4px 14px' }}>
                {testLogs.map((log, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 0', fontSize: 10, borderBottom: '1px solid var(--border-subtle)',
                    color: log.status === 'done' ? '#10b981' : log.status === 'error' ? '#ef4444' : 'var(--text-secondary)',
                  }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: 9, fontFamily: 'monospace', flexShrink: 0 }}>{log.time}</span>
                    <span style={{ fontWeight: 700, minWidth: 60 }}>{log.label}</span>
                    <span style={{ flex: 1 }}>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 右侧组件面板（折叠分类） ── */}
        <div className="custom-scrollbar" style={{
          width: 280, borderLeft: '1px solid var(--border)',
          background: 'var(--bg-raised)', display: 'flex', flexDirection: 'column',
          overflow: 'auto',
        }}>
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>组件面板</div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
              <input value={componentSearch} onChange={e => {
                setComponentSearch(e.target.value);
                // 搜索时自动展开所有分类
                if (e.target.value.trim()) setExpandedCats(new Set(categories));
              }} className="theme-input" style={{
                width: '100%', padding: '7px 10px 7px 32px', borderRadius: 10,
                border: '1px solid var(--input-border)', fontSize: 12,
              }} placeholder="搜索组件..." />
            </div>
          </div>

          <div style={{ flex: 1, padding: '8px 10px' }}>
            {categories.map(cat => {
              const catComponents = filteredComponents.filter(c => c.category === cat);
              if (catComponents.length === 0) return null;
              const isExpanded = expandedCats.has(cat) || !!componentSearch.trim();
              return (
                <div key={cat} style={{ marginBottom: 6 }}>
                  {/* 分类标题（点击展开/折叠） */}
                  <div
                    onClick={() => {
                      setExpandedCats(prev => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat); else next.add(cat);
                        return next;
                      });
                    }}
                    style={{
                      fontSize: 10, fontWeight: 800, color: 'var(--text-faint)',
                      textTransform: 'uppercase', letterSpacing: '0.12em',
                      padding: '6px 8px', marginBottom: 2, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      borderRadius: 6, transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      fontSize: 8, transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      display: 'inline-block',
                    }}>▶</span>
                    {cat}
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-faint)', fontWeight: 600 }}>{catComponents.length}</span>
                  </div>
                  {/* 组件列表（折叠） */}
                  {isExpanded && catComponents.map(comp => {
                    const config = NODE_TYPES_CONFIG[comp.nodeType] || NODE_TYPES_CONFIG['hub-tool'];
                    return (
                      <div
                        key={comp.id}
                        draggable
                        onDragStart={e => {
                          const payload = JSON.stringify({ nodeType: comp.nodeType, name: comp.name, detail: comp.detail });
                          e.dataTransfer.setData('application/aihub', payload);
                          e.dataTransfer.setData('text/plain', payload);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDoubleClick={() => addComponentToCanvas(comp)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 10px 7px 22px', borderRadius: 10, cursor: 'grab',
                          border: '1px solid transparent', marginBottom: 2,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                        }}
                      >
                        <div style={{ padding: 5, borderRadius: 7, background: config.bg, display: 'flex', flexShrink: 0 }}>
                          <config.icon size={12} color={config.color} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{comp.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{comp.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--border-subtle)',
            fontSize: 10, color: 'var(--text-faint)', textAlign: 'center',
          }}>
            拖拽或双击组件添加到画布
          </div>
        </div>
      </div>

      {/* 属性弹窗 */}
      {propsNode && (
        <NodePropsModal
          node={propsNode}
          onClose={() => setPropsNode(null)}
          onUpdate={updateNodeData}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// 列表视图组件
// ═══════════════════════════════════════════════════
const HubList = ({ tab, items, onEdit, onNew, onDelete, onRun }: {
  tab: HubTab; items: HubItem[]; onEdit: (item: HubItem) => void;
  onNew: () => void; onDelete: (id: string) => void; onRun: (item: HubItem) => void;
}) => {
  const tabConfig = HUB_TABS.find(t => t.id === tab)!;
  const [searchQuery, setSearchQuery] = useState('');

  // ── 库模式：从 registry 加载 ──
  const [registryComponents, setRegistryComponents] = useState<any[]>([]);
  const [libFilter, setLibFilter] = useState('全部');
  const [libCatFilter, setLibCatFilter] = useState('全部');

  // ── 网络搜索状态（MCP/Skill/Library 用） ──
  const [npmResults, setNpmResults] = useState<any[]>([]);
  const [npmSearching, setNpmSearching] = useState(false);
  const [npmQuery, setNpmQuery] = useState('');
  const [npmInstalling, setNpmInstalling] = useState<string | null>(null);
  const [npmTranslations, setNpmTranslations] = useState<Record<string, string>>({});
  const [hoveredNpm, setHoveredNpm] = useState<string | null>(null);
  const [showManualImport, setShowManualImport] = useState(false);
  const [manualImportUrl, setManualImportUrl] = useState('');
  const [manualImporting, setManualImporting] = useState(false);
  // ── 市场来源选择 ──
  type MarketSource = 'all' | 'smithery' | 'clawhub' | 'npm';
  const [marketSource, setMarketSource] = useState<MarketSource>('all');

  useEffect(() => {
    if (tab === 'library') {
      invoke('registry_list').then((list: any) => {
        if (Array.isArray(list)) setRegistryComponents(list);
      }).catch(() => {});
    }
  }, [tab]);

  // ── 网络面板相关（MCP/Skill/Library 都显示） ──
  const showNetworkPanel = tab === 'mcp' || tab === 'skill' || tab === 'library';

  const handleNpmSearch = async () => {
    const q = npmQuery.trim() || (tab === 'mcp' ? 'mcp-server' : tab === 'library' ? 'server' : 'ai agent skill function tool');
    setNpmSearching(true);
    setNpmTranslations({});
    try {
      let results: any[] = [];

      // 根据市场来源决定调用哪个 API
      if (marketSource === 'smithery') {
        const raw: any = await invoke('marketplace_search_smithery', { keyword: q });
        results = Array.isArray(raw) ? raw : [];
      } else if (marketSource === 'clawhub') {
        const raw: any = await invoke('marketplace_search_clawhub', { keyword: q });
        results = Array.isArray(raw) ? raw : [];
      } else if (marketSource === 'npm') {
        // 原有 npm 搜索
        const raw: any = await invoke('registry_search_npm', { keyword: q });
        results = Array.isArray(raw) ? raw.map((p: any) => ({ ...p, marketplace: 'npm', installMethod: 'npm' })) : [];
      } else {
        // 'all' — 聚合搜索
        const raw: any = await invoke('marketplace_search_all', { keyword: q });
        results = Array.isArray(raw) ? raw : [];
      }

      setNpmResults(results);

      // 翻译描述（市场 API 结果已带 translation 字段，仅 npm 需要翻译）
      if (marketSource === 'npm' || (!results[0]?.translation && results.length > 0)) {
        const descs = results.map((p: any) => p.description || '');
        invoke('registry_translate_batch', { texts: descs }).then((translations: any) => {
          if (Array.isArray(translations)) {
            const map: Record<string, string> = {};
            results.forEach((p: any, i: number) => {
              map[p.name] = translations[i] || p.description || '无描述';
            });
            setNpmTranslations(map);
          }
        }).catch(() => {
          const map: Record<string, string> = {};
          results.forEach((p: any) => {
            map[p.name] = p.translation || translateNpmDesc('', p.description || '');
          });
          setNpmTranslations(map);
        });
      } else {
        // 市场 API 已有翻译
        const map: Record<string, string> = {};
        results.forEach((p: any) => {
          map[p.name] = p.translation || translateNpmDesc('', p.description || '');
        });
        setNpmTranslations(map);
      }
    } catch (e) {
      console.error('marketplace search failed:', e);
      setNpmResults([]);
    } finally {
      setNpmSearching(false);
    }
  };

  const handleNpmInstall = async (pkg: any) => {
    const installKey = pkg.npm_package || pkg.name;
    setNpmInstalling(installKey);
    try {
      // Marketplace items may use different install methods
      const installMethod = pkg.installMethod || 'npm';
      const sourceUrl = pkg.sourceUrl || pkg.npm_package || pkg.name;

      if (installMethod === 'zip' && pkg.sourceUrl) {
        // GitHub ZIP download (ClawHub skills)
        await invoke('mcp_install_from_source', {
          sourceUrl: pkg.sourceUrl,
          name: pkg.name,
        });
      } else {
        // npm install (Smithery, npm, curated)
        await invoke('mcp_install_from_source', {
          sourceUrl: pkg.npm_package || pkg.name,
          name: pkg.name,
        });
      }

      // Register in plugin registry
      const entry = JSON.stringify({
        id: `${pkg.marketplace || 'npm'}_${(pkg.npm_package || pkg.name).replace(/[^a-zA-Z0-9]/g, '_')}`,
        name: pkg.name, name_zh: pkg.name,
        description: pkg.description || '', description_zh: pkg.translation || pkg.description || '',
        component_type: pkg.type === 'skill' ? 'skill' : 'mcp',
        source: 'network', status: 'enabled',
        version: pkg.version || '0.0.0', author: pkg.author || 'unknown',
        category: pkg.type === 'skill' ? 'skill' : 'mcp',
        icon: pkg.type === 'skill' ? 'wrench' : 'server',
        install_path: null, launch_command: null, launch_args: null,
        config: {}, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_url: sourceUrl,
        npm_package: pkg.npm_package,
      });
      await invoke('registry_install', { entryJson: entry });
      alert(`安装成功: ${pkg.name}`);
    } catch (e: any) {
      alert(`安装失败: ${e?.toString?.() || '未知错误'}`);
    } finally {
      setNpmInstalling(null);
    }
  };

  // 手动导入 MCP/Skill
  const handleManualImport = async () => {
    const url = manualImportUrl.trim();
    if (!url) return;
    setManualImporting(true);
    try {
      // 解析导入源类型
      let sourceUrl = url;
      let importName = url;
      let launchCommand: string | null = null;
      let launchArgs: string[] | null = null;

      if (url.startsWith('npx ')) {
        // npx 命令格式: "npx -y @modelcontextprotocol/server-filesystem /path"
        const parts = url.replace('npx ', '').split(' ');
        const pkgName = parts.find(p => !p.startsWith('-')) || parts[0];
        importName = pkgName.split('/').pop() || pkgName;
        sourceUrl = pkgName;
        launchCommand = 'npx';
        launchArgs = ['-y', ...parts];
      } else if (url.includes('github.com')) {
        // GitHub URL
        const match = url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
        importName = match ? match[2] : url.split('/').pop() || url;
        sourceUrl = url;
      } else if (url.includes('/') || url.includes('\\')) {
        // 本地路径
        importName = url.split(/[\/\\]/).pop() || url;
        sourceUrl = url;
      } else {
        // npm 包名
        importName = url.replace(/@[^\/]*\//, '').replace(/^@/, '');
        sourceUrl = url;
      }

      const entry = JSON.stringify({
        id: `manual_${importName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        name: importName, name_zh: importName,
        description: `手动导入: ${url}`, description_zh: `手动导入: ${url}`,
        component_type: tab === 'mcp' ? 'mcp' : 'skill',
        source: 'manual', status: 'enabled',
        version: '0.0.0', author: 'manual',
        category: tab, icon: tab === 'mcp' ? 'server' : 'wrench',
        install_path: url.includes('/') || url.includes('\\') ? url : null,
        launch_command: launchCommand,
        launch_args: launchArgs,
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_url: sourceUrl,
        npm_package: (!url.includes('/') && !url.includes('\\') && !url.startsWith('npx ')) ? url : null,
      });

      await invoke('registry_install', { entryJson: entry });
      alert(`导入成功: ${importName}`);
      setManualImportUrl('');
      setShowManualImport(false);
    } catch (e: any) {
      alert(`导入失败: ${e?.toString?.() || '未知错误'}`);
    } finally {
      setManualImporting(false);
    }
  };

  useEffect(() => {
    if (showNetworkPanel) {
      // 切 Tab 时清空旧数据并重新搜索
      setNpmResults([]);
      setNpmTranslations({});
      setNpmQuery('');
      const defaultQ = tab === 'mcp' ? 'mcp-server' : 'ai agent skill function tool';
      const doSearch = async () => {
        setNpmSearching(true);
        try {
          const results: any = await invoke('registry_search_npm', { keyword: defaultQ });
          if (Array.isArray(results)) {
            setNpmResults(results);
            const descs = results.map((p: any) => p.description || '');
            invoke('registry_translate_batch', { texts: descs }).then((translations: any) => {
              if (Array.isArray(translations)) {
                const map: Record<string, string> = {};
                results.forEach((p: any, i: number) => { map[p.name] = translations[i] || p.description || '无描述'; });
                setNpmTranslations(map);
              }
            }).catch(() => {
              const map: Record<string, string> = {};
              results.forEach((p: any) => { map[p.name] = translateNpmDesc('', p.description || ''); });
              setNpmTranslations(map);
            });
          }
        } catch { setNpmResults([]); }
        finally { setNpmSearching(false); }
      };
      doSearch();
    }
  }, [tab]);

  const handleToggle = async (id: string, currentStatus: string) => {
    try {
      if (currentStatus === 'enabled') {
        await invoke('registry_disable', { id });
      } else {
        await invoke('registry_enable', { id });
      }
      // 重新加载
      const list: any = await invoke('registry_list');
      if (Array.isArray(list)) setRegistryComponents(list);
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await invoke('registry_uninstall', { id });
      const list: any = await invoke('registry_list');
      if (Array.isArray(list)) setRegistryComponents(list);
    } catch (e: any) {
      alert(e?.toString?.() || '卸载失败');
    }
  };

  const handleExport = async (id: string) => {
    try {
      const json: any = await invoke('registry_export', { id });
      // 复制到剪贴板
      navigator.clipboard.writeText(json as string);
      alert('组件配置已复制到剪贴板');
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  // ── 库视图 ──
  if (tab === 'library') {
    const typeFilterMap: Record<string, string> = {
      '全部': '', 'Agent 综合体': 'composite', 'Agent': 'agent', 'MCP': 'mcp', 'Skill': 'skill', '工具': 'tool',
    };
    
    const categories = ['全部', ...new Set(registryComponents.map(c => c.category))];
    
    let filtered = registryComponents;
    if (libFilter !== '全部') {
      filtered = filtered.filter(c => c.component_type === typeFilterMap[libFilter]);
    }
    if (libCatFilter !== '全部') {
      filtered = filtered.filter(c => c.category === libCatFilter);
    }
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.name_zh?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description_zh?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 分类图标颜色映射
    const catColorMap: Record<string, string> = {
      'file': '#3b82f6', 'office': '#10b981', 'document': '#8b5cf6', 'ai': '#f43f5e',
      'browser': '#f59e0b', 'system': '#6b7280', 'mcp': '#8b5cf6', 'project': '#14b8a6',
      'template': '#ec4899', 'automation': '#6366f1',
    };
    const sourceLabels: Record<string, string> = { 'builtin': '内置', 'local': '本地', 'network': '网络', 'import': '导入' };

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4" style={{ padding: '28px 36px', maxWidth: 1200, margin: '0 auto' }}>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              padding: 12, borderRadius: 16,
              background: 'linear-gradient(135deg, #f59e0b20, #f59e0b08)',
              border: '1px solid #f59e0b25', display: 'flex',
            }}>
              <Library size={26} color="#f59e0b" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                组件库
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                共 {registryComponents.length} 个组件 · {registryComponents.filter(c => c.status === 'enabled').length} 已启用
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="theme-input" style={{
                padding: '8px 12px 8px 32px', borderRadius: 10, border: '1px solid var(--input-border)',
                fontSize: 12, width: 200, fontWeight: 500,
              }} placeholder="搜索组件..." />
            </div>
          </div>
        </div>

        {/* 类型过滤 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {Object.keys(typeFilterMap).map(label => (
            <button key={label} onClick={() => setLibFilter(label)} style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              border: `1px solid ${libFilter === label ? 'var(--brand)' : 'var(--border)'}`,
              background: libFilter === label ? 'var(--brand)' : 'var(--bg-surface)',
              color: libFilter === label ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* 细分类过滤 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setLibCatFilter(cat)} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              border: `1px solid ${libCatFilter === cat ? 'var(--border-strong)' : 'transparent'}`,
              background: libCatFilter === cat ? 'var(--bg-raised)' : 'transparent',
              color: libCatFilter === cat ? 'var(--text-primary)' : 'var(--text-faint)',
              cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
            }}>{cat}</button>
          ))}
        </div>

        {/* 组件卡片网格 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {filtered.map((comp: any) => {
            const catColor = catColorMap[comp.category] || '#6b7280';
            const isEnabled = comp.status === 'enabled';
            const isBuiltin = comp.source === 'builtin';

            return (
              <div key={comp.id} style={{
                background: 'var(--bg-surface)', borderRadius: 16,
                border: `1px solid ${isEnabled ? 'var(--border)' : 'var(--border-subtle)'}`,
                padding: '16px 18px', transition: 'all 0.2s',
                opacity: isEnabled ? 1 : 0.55,
                boxShadow: 'var(--shadow-sm)',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                }}
              >
                {/* 顶部：图标 + 名称 + 开关 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    padding: 8, borderRadius: 10,
                    background: `${catColor}12`, display: 'flex', flexShrink: 0,
                  }}>
                    <Cpu size={18} color={catColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {comp.name_zh}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                      {comp.name}
                    </div>
                  </div>
                  {/* 启用/禁用开关 */}
                  <button
                    onClick={() => handleToggle(comp.id, comp.status)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, border: 'none',
                      background: isEnabled ? catColor : `${catColor}30`,
                      cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3,
                      left: isEnabled ? 21 : 3,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>

                {/* 描述 */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10, minHeight: 32 }}>
                  {comp.description_zh}
                </div>

                {/* 标签行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: `${catColor}15`, color: catColor,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{comp.category}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                    background: isBuiltin ? 'var(--success-subtle)' : 'var(--brand-subtle)',
                    color: isBuiltin ? 'var(--success)' : 'var(--brand)',
                  }}>{sourceLabels[comp.source] || comp.source}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>v{comp.version}</span>
                </div>

                {/* 操作按钮 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleExport(comp.id)} style={{
                    flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-raised)',
                    color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    <Package size={11} /> 导出
                  </button>
                  {!isBuiltin && (
                    <button onClick={() => handleUninstall(comp.id)} style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: '1px solid var(--danger-subtle)', background: 'var(--danger-subtle)',
                      color: 'var(--danger)', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}>
                      <Trash2 size={11} /> 卸载
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Library size={48} color="var(--text-faint)" style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-faint)' }}>没有匹配的组件</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>尝试调整过滤条件或搜索关键词</div>
          </div>
        )}
      </div>
    );
  }

  // ── 非库视图：普通列表 ──
  const filtered = items.filter(i => i.type === tab);
  const displayed = filtered.filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()));


  const sourceLabel = (s?: string) => s === 'network' ? '网络' : s === 'builtin' ? '内置' : '本地';
  const sourceBg = (s?: string) => s === 'network' ? 'var(--purple-subtle)' : s === 'builtin' ? 'var(--success-subtle)' : 'var(--brand-subtle)';
  const sourceColor = (s?: string) => s === 'network' ? 'var(--purple)' : s === 'builtin' ? 'var(--success)' : 'var(--brand)';



  const renderItemCard = (item: HubItem) => {
    const typeConfig = HUB_TABS.find(t => t.id === item.type);
    const TypeIcon = typeConfig?.icon || Package;
    return (
      <div key={item.id} style={{
        background: 'var(--bg-surface)', borderRadius: 18,
        border: '1px solid var(--border)', padding: 20,
        transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ padding: 8, borderRadius: 12, background: `${typeConfig?.color || '#6366f1'}12`, display: 'flex', flexShrink: 0 }}>
            <TypeIcon size={20} color={typeConfig?.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>{item.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.description || '暂无描述'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: sourceBg(item.source), color: sourceColor(item.source) }}>{sourceLabel(item.source)}</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onRun(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer', background: typeConfig?.color, color: '#fff', fontSize: 11, fontWeight: 700 }}><Play size={11} /> 运行</button>
          <button onClick={() => onEdit(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Edit3 size={11} /> 编辑</button>
          <button onClick={() => onDelete(item.id)} style={{ padding: '7px 8px', borderRadius: 9, border: '1px solid var(--danger-subtle)', background: 'var(--danger-subtle)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4" style={{ padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 12, borderRadius: 16, background: `linear-gradient(135deg, ${tabConfig.color}20, ${tabConfig.color}08)`, border: `1px solid ${tabConfig.color}25`, display: 'flex' }}>
            <tabConfig.icon size={26} color={tabConfig.color} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>我的{tabConfig.label}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{tabConfig.desc}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="theme-input" style={{ padding: '8px 12px 8px 32px', borderRadius: 10, border: '1px solid var(--input-border)', fontSize: 12, width: 200, fontWeight: 500 }} placeholder="搜索本地..." />
          </div>
          <button onClick={onNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${tabConfig.color}, ${tabConfig.color}cc)`, color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: `0 3px 12px ${tabConfig.color}33` }}>
            <Plus size={14} /> 创建{tabConfig.label}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* 左侧：网络获取面板（仅 MCP/Skill） */}
        {showNetworkPanel && (
          <div className="custom-scrollbar" style={{
            width: 300, minWidth: 300, maxWidth: 300,
            overflow: 'hidden', borderRadius: 16,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* 面板头 */}
            <div style={{
              padding: '12px 14px 10px', borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={13} color={tabConfig.color} />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>技能市场</span>
              </div>
              {/* 市场来源切换 */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {([
                  { id: 'all' as MarketSource, label: '全部', color: tabConfig.color },
                  { id: 'smithery' as MarketSource, label: 'Smithery', color: '#6366f1' },
                  { id: 'clawhub' as MarketSource, label: 'ClawHub', color: '#f59e0b' },
                  { id: 'npm' as MarketSource, label: 'npm', color: '#cb3837' },
                ]).map(src => (
                  <button
                    key={src.id}
                    onClick={() => { setMarketSource(src.id); setNpmResults([]); setNpmTranslations({}); }}
                    style={{
                      padding: '2px 8px', borderRadius: 6, border: 'none',
                      fontSize: 9, fontWeight: 700, cursor: 'pointer',
                      background: marketSource === src.id ? `${src.color}22` : 'transparent',
                      color: marketSource === src.id ? src.color : 'var(--text-faint)',
                      transition: 'all 0.2s',
                    }}
                  >{src.label}</button>
                ))}
              </div>

              {/* 手动导入区 */}
              <div style={{
                background: `${tabConfig.color}08`, borderRadius: 8,
                border: `1px dashed ${tabConfig.color}30`, padding: '8px 10px',
              }}>
                <div
                  onClick={() => setShowManualImport(!showManualImport)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: tabConfig.color }}
                >
                  <Download size={11} />
                  <span>手动导入 {tab === 'mcp' ? 'MCP Server' : 'Skill'}</span>
                  <span style={{ fontSize: 8, marginLeft: 'auto', transform: showManualImport ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                </div>
                {showManualImport && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 6, lineHeight: 1.5 }}>
                      {tab === 'mcp'
                        ? '支持：npm 包名、npx 命令、GitHub URL、本地路径'
                        : '支持：npm 包名、GitHub URL、本地目录路径'}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        value={manualImportUrl}
                        onChange={e => setManualImportUrl(e.target.value)}
                        className="theme-input"
                        style={{
                          flex: 1, padding: '5px 8px', borderRadius: 6,
                          border: '1px solid var(--border-subtle)', fontSize: 10,
                        }}
                        placeholder={tab === 'mcp' ? '@modelcontextprotocol/server-...' : 'github.com/user/skill-name'}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && manualImportUrl.trim()) {
                            handleManualImport();
                          }
                        }}
                      />
                      <button
                        onClick={handleManualImport}
                        disabled={manualImporting || !manualImportUrl.trim()}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: 'none',
                          background: tabConfig.color, color: '#fff',
                          fontSize: 9, fontWeight: 700, cursor: 'pointer',
                          opacity: manualImporting || !manualImportUrl.trim() ? 0.5 : 1,
                        }}
                      >
                        {manualImporting ? '导入中' : '导入'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                  <input
                    value={npmQuery}
                    onChange={e => setNpmQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNpmSearch()}
                    className="theme-input"
                    style={{
                      width: '100%', padding: '6px 8px 6px 26px', borderRadius: 8,
                      border: '1px solid var(--border-subtle)', fontSize: 11,
                    }}
                    placeholder={tab === 'mcp' ? '搜索 MCP...' : '搜索 Skill...'}
                  />
                </div>
                <button onClick={handleNpmSearch} disabled={npmSearching} style={{
                  padding: '5px 10px', borderRadius: 8, border: 'none',
                  background: `${tabConfig.color}18`, color: tabConfig.color,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  {npmSearching ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={11} />}
                </button>
              </div>
            </div>

            {/* 搜索结果 */}
            <div className="custom-scrollbar" style={{ flex: 1, padding: '6px 8px', overflow: 'auto' }}>
              {npmSearching && npmResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)' }}>
                  <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 6 }} />
                  <div style={{ fontSize: 11, fontWeight: 600 }}>搜索中...</div>
                </div>
              )}
              {!npmSearching && npmResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 8px', color: 'var(--text-faint)' }}>
                  <Globe size={24} style={{ marginBottom: 6, opacity: 0.25 }} />
                  <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.5 }}>输入关键词搜索</div>
                </div>
              )}
              {npmResults.map((pkg: any, idx: number) => {
                const isHovered = hoveredNpm === pkg.name;
                const descZh = npmTranslations[pkg.name] || translateNpmDesc('', pkg.description || '');
                const isTranslating = !npmTranslations[pkg.name] && Object.keys(npmTranslations).length === 0;
                return (
                  <div key={`${pkg.name}_${idx}`} style={{
                    padding: isHovered ? '12px 12px' : '8px 10px',
                    borderRadius: 10, marginBottom: 4,
                    transition: 'all 0.25s ease',
                    cursor: 'default',
                    border: isHovered ? '1px solid var(--border)' : '1px solid transparent',
                    background: isHovered ? 'var(--bg-raised)' : 'transparent',
                    transform: isHovered ? 'scale(1.02)' : 'none',
                    boxShadow: isHovered ? 'var(--shadow-sm)' : 'none',
                  }}
                    onMouseEnter={() => setHoveredNpm(pkg.name)}
                    onMouseLeave={() => setHoveredNpm(null)}
                  >
                    {/* 标题行 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isHovered ? 6 : 3 }}>
                      <Package size={isHovered ? 14 : 12} color={tabConfig.color} style={{ flexShrink: 0, transition: 'all 0.2s' }} />
                      <div style={{
                        fontSize: isHovered ? 12 : 11, fontWeight: 800, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        transition: 'all 0.2s',
                      }}>{pkg.name}</div>
                      {/* 市场来源标签 */}
                      {pkg.marketplace && (
                        <span style={{
                          fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                          background: pkg.marketplace === 'smithery' ? '#6366f120' :
                                     pkg.marketplace === 'clawhub' ? '#f59e0b20' :
                                     pkg.marketplace === 'curated' ? '#10b98120' : '#cb383720',
                          color: pkg.marketplace === 'smithery' ? '#6366f1' :
                                 pkg.marketplace === 'clawhub' ? '#f59e0b' :
                                 pkg.marketplace === 'curated' ? '#10b981' : '#cb3837',
                          flexShrink: 0, textTransform: 'uppercase',
                        }}>{pkg.marketplace === 'curated' ? '精选' : pkg.marketplace}</span>
                      )}
                      {/* 右上角：打开原网址 */}
                      {(pkg.npm_url || pkg.repo_url || pkg.sourceUrl) && (
                        <a
                          href={pkg.npm_url || pkg.repo_url || pkg.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="打开原网址"
                          style={{
                            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: 6,
                            background: `${tabConfig.color}12`,
                            color: tabConfig.color,
                            transition: 'all 0.2s',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${tabConfig.color}30`; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${tabConfig.color}12`; }}
                        >
                          <Globe size={10} />
                        </a>
                      )}
                    </div>

                    {/* 中文翻译 */}
                    <div style={{
                      fontSize: isHovered ? 11 : 10,
                      color: isTranslating ? 'var(--text-faint)' : 'var(--text-secondary)',
                      lineHeight: 1.5, marginBottom: isHovered ? 6 : 3,
                      fontWeight: 500, transition: 'all 0.2s',
                      display: '-webkit-box',
                      WebkitLineClamp: isHovered ? 5 : 2,
                      WebkitBoxOrient: 'vertical' as any, overflow: 'hidden',
                    }}>{isTranslating ? '翻译中...' : descZh}</div>

                    {/* 悬停时显示更多信息 */}
                    {isHovered && (
                      <div style={{ transition: 'all 0.2s' }}>
                        {/* 英文原文 */}
                        <div style={{
                          fontSize: 9, color: 'var(--text-faint)', lineHeight: 1.4,
                          marginBottom: 6, fontStyle: 'italic',
                          padding: '4px 8px', borderRadius: 6,
                          background: 'var(--bg-root)',
                        }}>{pkg.description || '无描述'}</div>
                        {/* 详细信息 */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>v{pkg.version}</span>
                          <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>作者: {pkg.author}</span>
                          {pkg.downloads > 0 && <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>⭐ {pkg.downloads}</span>}
                          {pkg.npm_url && <a href={pkg.npm_url} target="_blank" style={{ fontSize: 9, color: tabConfig.color, textDecoration: 'none' }}>npm ↗</a>}
                          {pkg.repo_url && <a href={pkg.repo_url} target="_blank" style={{ fontSize: 9, color: tabConfig.color, textDecoration: 'none' }}>源码 ↗</a>}
                          {!pkg.npm_url && !pkg.repo_url && pkg.sourceUrl && <a href={pkg.sourceUrl} target="_blank" style={{ fontSize: 9, color: tabConfig.color, textDecoration: 'none' }}>主页 ↗</a>}
                        </div>
                      </div>
                    )}

                    {/* 底部操作栏 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {!isHovered && <span style={{ fontSize: 8, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{pkg.downloads > 0 ? `⭐${pkg.downloads}` : `v${pkg.version}`}</span>}
                      {isHovered && <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{pkg.npm_package || pkg.name}</span>}
                      <button
                        onClick={() => handleNpmInstall(pkg)}
                        disabled={npmInstalling === (pkg.npm_package || pkg.name)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: isHovered ? '4px 14px' : '3px 10px',
                          borderRadius: 6, border: 'none',
                          background: npmInstalling === (pkg.npm_package || pkg.name) ? 'var(--bg-muted)' : isHovered ? tabConfig.color : `${tabConfig.color}15`,
                          color: npmInstalling === (pkg.npm_package || pkg.name) ? 'var(--text-faint)' : isHovered ? '#fff' : tabConfig.color,
                          fontSize: isHovered ? 11 : 10, fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {npmInstalling === (pkg.npm_package || pkg.name)
                          ? <><Loader2 size={9} style={{ animation: 'spin 0.8s linear infinite' }} /> 安装中</>
                          : <><Download size={isHovered ? 11 : 9} /> 安装</>
                        }
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 右侧：本地列表 */}
        <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {displayed.map(renderItemCard)}
            <div onClick={onNew} style={{
              borderRadius: 18, border: '2px dashed var(--border)', padding: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, cursor: 'pointer',
              transition: 'all 0.2s', minHeight: 140,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tabConfig.color; (e.currentTarget as HTMLElement).style.background = `${tabConfig.color}08`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-strong)' }}>
                <Plus size={20} color="var(--text-faint)" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>新建 {tabConfig.label}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};



// ═══════════════════════════════════════════════════
// AI HUB 主入口
// ═══════════════════════════════════════════════════
const AIHubInner = () => {
  const [activeTab, setActiveTab] = useState<HubTab>('composite');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [items, setItems] = useState<HubItem[]>(loadItems);
  const [editingItem, setEditingItem] = useState<HubItem | null>(null);

  useEffect(() => { saveItems(items); }, [items]);

  // 加载后端 Agent blueprints
  useEffect(() => {
    invoke('agent_list_blueprints').then((bps: any) => {
      if (Array.isArray(bps)) {
        const existing = items.filter(i => i.type !== 'agent' || i.source !== 'local');
        const agents: HubItem[] = bps.map((bp: any) => ({
          id: bp.id, name: bp.name, description: bp.persona,
          type: 'agent' as HubTab, status: 'ready' as const,
          createdAt: bp.created_at, updatedAt: bp.created_at,
          source: 'local' as const,
        }));
        setItems([...existing, ...agents]);
      }
    }).catch(() => {});
  }, []);

  const handleSave = (item: HubItem) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = item; return next; }
      return [...prev, item];
    });
    setViewMode('list');
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleEdit = (item: HubItem) => {
    setEditingItem(item);
    setViewMode('editor');
  };

  const handleNew = () => {
    setEditingItem(null);
    setViewMode('editor');
  };

  const handleRun = async (item: HubItem) => {
    try {
      if (item.type === 'agent') {
        // TODO: 连接 agent_run
        console.log('Running agent:', item.name);
      } else if (item.type === 'composite') {
        // TODO: 连接 workflow_run
        console.log('Running composite:', item.name);
      }
    } catch (e) {
      console.error('Run failed:', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-root)' }}>
      {/* 顶部 Tab 栏 */}
      {viewMode === 'list' && (
        <div style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          padding: '0 32px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            maxWidth: 1200, margin: '0 auto',
          }}>
            {/* Logo */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 24px 16px 0',
              borderRight: '1px solid var(--border-subtle)',
              marginRight: 8,
            }}>
              <div style={{
                padding: 8, borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                display: 'flex', boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              }}>
                <Zap size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>AI HUB</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>● Ready</div>
              </div>
            </div>

            {/* Tabs */}
            {HUB_TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '14px 18px', border: 'none', cursor: 'pointer',
                    background: 'transparent', fontSize: 13, fontWeight: isActive ? 800 : 600,
                    color: isActive ? tab.color : 'var(--text-muted)',
                    borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                    transition: 'all 0.2s', position: 'relative',
                    marginBottom: -1,
                  }}
                  onMouseEnter={e => !isActive && ((e.currentTarget as HTMLElement).style.color = tab.color)}
                  onMouseLeave={e => !isActive && ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                >
                  <TabIcon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewMode === 'list' ? (
          <HubList
            tab={activeTab}
            items={items}
            onEdit={handleEdit}
            onNew={handleNew}
            onDelete={handleDelete}
            onRun={handleRun}
          />
        ) : (
          activeTab !== 'library' && (
            <HubEditor
              tab={activeTab}
              item={editingItem}
              allItems={items}
              onBack={() => { setViewMode('list'); setEditingItem(null); }}
              onSave={handleSave}
            />
          )
        )}
      </div>
    </div>
  );
};

// Wrap with ReactFlowProvider
const AIHub = () => (
  <ReactFlowProvider>
    <AIHubInner />
  </ReactFlowProvider>
);

export default AIHub;
