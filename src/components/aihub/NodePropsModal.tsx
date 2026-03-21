// ═══════════════════════════════════════════════════
// NodePropsModal — 属性弹窗组件
// ═══════════════════════════════════════════════════

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Node } from '@xyflow/react';

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

          {/* 工具节点额外信息 */}
          {node.type === 'hub-tool' && (node.data as any).toolName && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>工具详情</div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '6px 10px', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>工具 ID</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--brand)', fontWeight: 600 }}>{(node.data as any).toolName}</span>
                {(node.data as any).stepId != null && <>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>步骤 #</span>
                  <span>{(node.data as any).stepId}</span>
                </>}
                {(node.data as any).expectedOutput && <>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>预期输出</span>
                  <span>{(node.data as any).expectedOutput}</span>
                </>}
              </div>
              {(node.data as any).args && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>参数</div>
                  <pre style={{
                    margin: 0, padding: '8px 10px', borderRadius: 8,
                    background: 'var(--bg-primary)', fontSize: 11, lineHeight: 1.5,
                    fontFamily: 'monospace', color: 'var(--text-primary)',
                    overflow: 'auto', maxHeight: 150, whiteSpace: 'pre-wrap',
                  }}>{typeof (node.data as any).args === 'string' ? (node.data as any).args : JSON.stringify((node.data as any).args, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

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

export default NodePropsModal;
