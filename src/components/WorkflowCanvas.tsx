import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// ═══════════════════════════════════════════
// Visual Workflow Canvas Editor (P4)
// Drag-and-drop node editor for workflows
// ═══════════════════════════════════════════

interface CanvasNode {
  id: string;
  type: 'agent' | 'skill' | 'human' | 'start' | 'end';
  label: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

interface CanvasConnection {
  id: string;
  from: string;
  to: string;
}

interface WorkflowCanvasProps {
  onSave?: (nodes: CanvasNode[], connections: CanvasConnection[]) => void;
}

const NODE_COLORS: Record<string, string> = {
  agent: '#6366f1',
  skill: '#10b981',
  human: '#f59e0b',
  start: '#6b7280',
  end: '#ef4444',
};

const NODE_LABELS: Record<string, string> = {
  agent: 'Agent 节点',
  skill: 'Skill 节点', 
  human: 'Human 节点',
  start: '开始',
  end: '结束',
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: 'start', type: 'start', label: '开始', x: 100, y: 250, config: {} },
    { id: 'end', type: 'end', label: '结束', x: 700, y: 250, config: {} },
  ]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showNodeConfig, setShowNodeConfig] = useState(false);
  const [workflowName, setWorkflowName] = useState('新工作流');
  const [workflowDesc, setWorkflowDesc] = useState('');

  // Add a new node to the canvas
  const addNode = useCallback((type: 'agent' | 'skill' | 'human') => {
    const newNode: CanvasNode = {
      id: `node_${Date.now()}`,
      type,
      label: NODE_LABELS[type],
      x: 300 + Math.random() * 200,
      y: 150 + Math.random() * 200,
      config: type === 'agent' ? { prompt: '' } : type === 'skill' ? { skill_id: '' } : { question: '' },
    };
    setNodes(prev => [...prev, newNode]);
  }, []);

  // Delete selected node
  const deleteNode = useCallback(() => {
    if (!selectedNode || selectedNode === 'start' || selectedNode === 'end') return;
    setNodes(prev => prev.filter(n => n.id !== selectedNode));
    setConnections(prev => prev.filter(c => c.from !== selectedNode && c.to !== selectedNode));
    setSelectedNode(null);
    setShowNodeConfig(false);
  }, [selectedNode]);

  // Mouse handlers for drag
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (connecting) {
      // Complete connection
      if (connecting !== nodeId) {
        setConnections(prev => [...prev, {
          id: `conn_${Date.now()}`,
          from: connecting,
          to: nodeId,
        }]);
      }
      setConnecting(null);
      return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    setDragging(nodeId);
    setSelectedNode(nodeId);
    setDragOffset({
      x: e.clientX - node.x,
      y: e.clientY - node.y,
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setNodes(prev => prev.map(n => 
      n.id === dragging 
        ? { ...n, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
        : n
    ));
  }, [dragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Start creating a connection
  const startConnection = (nodeId: string) => {
    setConnecting(nodeId);
  };

  // Save workflow
  const saveWorkflow = async () => {
    const workflowNodes = nodes
      .filter(n => n.type !== 'start' && n.type !== 'end')
      .map(n => ({
        id: n.id,
        name: n.label,
        node_type: n.type,
        config: n.config,
      }));

    try {
      await invoke('workflow_create', {
        req: {
          name: workflowName,
          description: workflowDesc,
          nodes: workflowNodes,
        }
      });
      onSave?.(nodes, connections);
    } catch (error) {
      console.error('Failed to save workflow:', error);
    }
  };

  // Connection line path
  const getConnectionPath = (from: CanvasNode, to: CanvasNode) => {
    const dx = to.x - from.x;
    const cp = Math.abs(dx) / 2;
    return `M ${from.x + 70} ${from.y + 25} C ${from.x + 70 + cp} ${from.y + 25}, ${to.x - cp} ${to.y + 25}, ${to.x} ${to.y + 25}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary, #0a0a0f)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <input
          value={workflowName}
          onChange={e => setWorkflowName(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 14, width: 200,
          }}
          placeholder="工作流名称"
        />

        <div style={{ display: 'flex', gap: 8 }}>
          {(['agent', 'skill', 'human'] as const).map(type => (
            <button key={type} onClick={() => addNode(type)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: NODE_COLORS[type], color: '#fff', fontSize: 13, fontWeight: 500,
              transition: 'transform 0.1s', 
            }}
              onMouseDown={e => (e.target as HTMLElement).style.transform = 'scale(0.95)'}
              onMouseUp={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
            >
              + {NODE_LABELS[type]}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {selectedNode && selectedNode !== 'start' && selectedNode !== 'end' && (
          <>
            <button onClick={() => startConnection(selectedNode)} style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer',
            }}>
              🔗 连线
            </button>
            <button onClick={() => setShowNodeConfig(true)} style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer',
            }}>
              ⚙️ 配置
            </button>
            <button onClick={deleteNode} style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, cursor: 'pointer',
            }}>
              🗑️ 删除
            </button>
          </>
        )}

        <button onClick={saveWorkflow} style={{
          padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
          fontSize: 14, fontWeight: 600,
        }}>
          💾 保存工作流
        </button>
      </div>

      {/* Status bar */}
      {connecting && (
        <div style={{
          padding: '8px 20px', background: 'rgba(99,102,241,0.15)',
          color: '#818cf8', fontSize: 13, textAlign: 'center',
        }}>
          🔗 连线模式 — 点击目标节点完成连接，或按 ESC 取消
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={() => { setConnecting(null); if (!dragging) setSelectedNode(null); }}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', cursor: connecting ? 'crosshair' : 'default',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
        }}
      >
        {/* SVG connections */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {connections.map(conn => {
            const from = nodes.find(n => n.id === conn.from);
            const to = nodes.find(n => n.id === conn.to);
            if (!from || !to) return null;
            return (
              <g key={conn.id}>
                <path
                  d={getConnectionPath(from, to)}
                  fill="none" stroke="rgba(99,102,241,0.5)" strokeWidth={2}
                  strokeDasharray={connecting ? "5,5" : "none"}
                />
                {/* Arrow */}
                <circle cx={to.x} cy={to.y + 25} r={4} fill="#6366f1" />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => (
          <div
            key={node.id}
            onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, node.id); }}
            style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: node.type === 'start' || node.type === 'end' ? 80 : 140,
              padding: '12px 16px',
              borderRadius: node.type === 'start' || node.type === 'end' ? '50%' : 12,
              background: selectedNode === node.id
                ? `linear-gradient(135deg, ${NODE_COLORS[node.type]}dd, ${NODE_COLORS[node.type]}88)`
                : `linear-gradient(135deg, ${NODE_COLORS[node.type]}aa, ${NODE_COLORS[node.type]}55)`,
              border: selectedNode === node.id
                ? `2px solid ${NODE_COLORS[node.type]}`
                : '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: dragging === node.id ? 'grabbing' : 'grab',
              userSelect: 'none',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
              boxShadow: selectedNode === node.id
                ? `0 0 20px ${NODE_COLORS[node.type]}44`
                : '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'box-shadow 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: node.type === 'start' || node.type === 'end' ? 80 : 50,
            }}
          >
            {node.label}
          </div>
        ))}
      </div>

      {/* Node config panel */}
      {showNodeConfig && selectedNode && (() => {
        const node = nodes.find(n => n.id === selectedNode);
        if (!node || node.type === 'start' || node.type === 'end') return null;
        return (
          <div style={{
            position: 'absolute', right: 0, top: 60, bottom: 0, width: 320,
            background: 'rgba(15,15,20,0.95)', borderLeft: '1px solid rgba(255,255,255,0.1)',
            padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>⚙️ 节点配置</h3>
              <button onClick={() => setShowNodeConfig(false)} style={{
                background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18,
              }}>✕</button>
            </div>

            <label style={{ color: '#aaa', fontSize: 13 }}>
              节点名称
              <input
                value={node.label}
                onChange={e => setNodes(prev => prev.map(n => n.id === selectedNode ? { ...n, label: e.target.value } : n))}
                style={{
                  display: 'block', width: '100%', marginTop: 4,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14,
                }}
              />
            </label>

            {node.type === 'agent' && (
              <label style={{ color: '#aaa', fontSize: 13 }}>
                Agent Prompt
                <textarea
                  value={node.config.prompt || ''}
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNode ? { ...n, config: { ...n.config, prompt: e.target.value } } : n))}
                  rows={6}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, resize: 'vertical',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                  placeholder="请输入 Agent 的提示词..."
                />
              </label>
            )}

            {node.type === 'skill' && (
              <label style={{ color: '#aaa', fontSize: 13 }}>
                Skill ID
                <input
                  value={node.config.skill_id || ''}
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNode ? { ...n, config: { ...n.config, skill_id: e.target.value } } : n))}
                  style={{
                    display: 'block', width: '100%', marginTop: 4,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14,
                  }}
                  placeholder="输入 Skill ID"
                />
              </label>
            )}

            {node.type === 'human' && (
              <label style={{ color: '#aaa', fontSize: 13 }}>
                提问内容
                <textarea
                  value={node.config.question || ''}
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNode ? { ...n, config: { ...n.config, question: e.target.value } } : n))}
                  rows={4}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, resize: 'vertical',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13,
                  }}
                  placeholder="输入需要人工确认的问题..."
                />
              </label>
            )}

            <div style={{
              marginTop: 'auto', padding: '12px 0',
              borderTop: '1px solid rgba(255,255,255,0.1)', color: '#666', fontSize: 12,
            }}>
              节点 ID: {node.id}<br />
              类型: {node.type}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default WorkflowCanvas;
