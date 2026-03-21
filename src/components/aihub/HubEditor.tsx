// 
// HubEditor  编辑器组件（三栏布局）
// Extracted from AIHub.tsx
// 

import { useState, useCallback } from 'react';
import {
  Sparkles, Search, Play, Edit3, ArrowLeft, Save, Layers,
} from 'lucide-react';
import {
  ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState,
  addEdge, type Node, type Edge, type Connection,
  BackgroundVariant, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  HUB_TABS, NODE_TYPES_CONFIG, TOOL_DISPLAY_NAMES, getComponentsForTab,
} from './constants';
import type { HubTab, HubItem, PanelComponent } from './constants';
import { hubNodeTypes } from './HubNode';
import NodePropsModal from './NodePropsModal';
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
  const [optimizedPrompt, setOptimizedPrompt] = useState<string | null>(null);
  const [isPreOptimizing, setIsPreOptimizing] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [isTesting, setIsTesting] = useState(false);
  // testNodeStatus reserved for future per-node status tracking
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
    } catch (e) { console.warn('Drop parse failed:', e); }
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
      const errorMsg = result.success ? '' : (result.final_answer || '执行失败');
      setTestLogs(prev => [...prev, {
        nodeId: 'final', label: result.success ? '✅ 执行成功' : '❌ 执行失败',
        status: finalStatus,
        message: `${result.final_answer?.slice(0, 300) || '无结果'} (共 ${result.total_rounds} 步)`,
        time: new Date().toLocaleTimeString(),
      }]);
      // 精确: 成功的节点保持绿色，未完成的标记最终状态
      setNodes(nds => nds.map(n => {
        if (n.data?._testStatus === 'done') return n; // 已完成的保持绿
        if (n.type === 'hub-start' || n.type === 'hub-end') {
          return { ...n, data: { ...n.data, _testStatus: finalStatus } };
        }
        if (n.type === 'hub-tool') {
          return { ...n, data: { ...n.data, _testStatus: finalStatus, _errorMsg: finalStatus === 'error' ? errorMsg.slice(0, 80) : undefined } };
        }
        return n;
      }));
    } catch (e: any) {
      const errStr = String(e);
      setTestLogs(prev => [...prev, {
        nodeId: 'error', label: '❌ Agent 执行失败', status: 'error',
        message: errStr,
        time: new Date().toLocaleTimeString(),
      }]);
      // 只标记未完成的节点为错误，已完成的保持绿色
      setNodes(nds => nds.map(n => {
        if (n.data?._testStatus === 'done') return n;
        return { ...n, data: { ...n.data, _testStatus: 'error', _errorMsg: errStr.slice(0, 80) } };
      }));
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

            {/* AI 优化描述按钮 */}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={async () => {
                  if (!genPrompt.trim() || isPreOptimizing) return;
                  setIsPreOptimizing(true);
                  try {
                    const result: any = await invoke('chat_with_ai', {
                      req: {
                        prompt: `你是 Agent 需求架构师。请优化以下用户的 Agent 描述，使其更精确、结构化、可执行。\n\n原始描述："${genPrompt}"\n\n要求：\n1. 明确输入输出\n2. 拆解为可执行步骤\n3. 指定关键参数（如文件路径、格式）\n4. 保持简洁，不超过3句话\n5. 只返回优化后的描述文字，不要其他说明`,
                        system_prompt: '你是一个专业的 Agent 需求分析师，擅长将模糊描述转化为精确可执行的技术规格。',
                        module: 'agent_optimize',
                      }
                    });
                    const text = typeof result === 'string' ? result : result?.content || result?.text || JSON.stringify(result);
                    setOptimizedPrompt(text.replace(/^["']|["']$/g, '').trim());
                  } catch (e) {
                    console.error('AI optimize failed:', e);
                  } finally {
                    setIsPreOptimizing(false);
                  }
                }}
                disabled={!genPrompt.trim() || isPreOptimizing}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8,
                  border: '1px solid #8b5cf640', background: 'rgba(139,92,246,0.08)',
                  color: '#8b5cf6', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  opacity: !genPrompt.trim() ? 0.4 : 1,
                }}
              >
                {isPreOptimizing ? (
                  <><div style={{ width: 10, height: 10, border: '2px solid #8b5cf640', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> 优化中...</>
                ) : (
                  <><Sparkles size={12} /> AI 优化描述</>
                )}
              </button>
            </div>

            {/* 优化结果预览 */}
            {optimizedPrompt && (
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 10,
                border: '1px solid #8b5cf640', background: 'rgba(139,92,246,0.04)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>✨ AI 优化结果</div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {optimizedPrompt}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { setGenPrompt(optimizedPrompt); setOptimizedPrompt(null); }} style={{
                    flex: 1, padding: '6px', borderRadius: 8, border: 'none',
                    background: '#8b5cf6', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>✅ 使用优化</button>
                  <button onClick={() => setOptimizedPrompt(null)} style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                  }}>取消</button>
                </div>
              </div>
            )}

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

export default HubEditor;
