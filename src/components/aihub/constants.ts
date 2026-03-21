// ═══════════════════════════════════════════════════
// AIHub Constants & Types — Extracted from AIHub.tsx
// ═══════════════════════════════════════════════════

import {
  Bot, Wrench, Library, Cpu, Play, Server, Compass, MessageSquare,
  FileText, Layers,
} from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';

// ── Types ──

export type HubTab = 'composite' | 'agent' | 'mcp' | 'skill' | 'library';
export type ViewMode = 'list' | 'editor';

export interface HubItem {
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

export interface PanelComponent {
  id: string;
  nodeType: string;
  name: string;
  detail: string;
  category: string;
}

// ── npm 包描述翻译 ──
export const TRANSLATE_MAP: Record<string, string> = {
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

export const translateNpmDesc = (_name: string, desc: string): string => {
  if (!desc) return '无描述';
  let result = desc;
  const entries = Object.entries(TRANSLATE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [en, zh] of entries) {
    const regex = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    result = result.replace(regex, zh);
  }
  return result !== desc ? result : desc;
};

// ── Tab 定义 ──
export const HUB_TABS: { id: HubTab; label: string; icon: any; color: string; desc: string }[] = [
  { id: 'composite', label: '智能体',        icon: Layers,   color: '#6366f1', desc: '编排 Agent + MCP + Skill 的完整流程' },
  { id: 'agent',     label: 'Agent',        icon: Bot,      color: '#3b82f6', desc: '创建 AI 智能代理' },
  { id: 'mcp',       label: 'MCP',          icon: Server,   color: '#8b5cf6', desc: '管理 MCP Server 连接' },
  { id: 'skill',     label: 'Skill',        icon: Wrench,   color: '#10b981', desc: '封装可复用的操作技能' },
  { id: 'library',   label: '库',            icon: Library,  color: '#f59e0b', desc: '全部资产总览' },
];

// ── 画布节点类型定义 ──
export const NODE_TYPES_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
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
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
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

// ── STORAGE ──
const STORAGE_KEY = 'aihub_items';
export const loadItems = (): HubItem[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
export const saveItems = (items: HubItem[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

// ── 组件面板数据 ──
export const getComponentsForTab = (tab: HubTab, items: HubItem[]): PanelComponent[] => {
  const base: PanelComponent[] = [];
  if (tab === 'composite') {
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
