// ═══════════════════════════════════════════════════
// HubNode — 统一画布节点渲染组件
// ═══════════════════════════════════════════════════

import { Handle, Position } from '@xyflow/react';
import { NODE_TYPES_CONFIG } from './constants';

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
      {testStatus === 'error' && data._errorMsg && (
        <div style={{ fontSize: 9, color: '#ef4444', marginTop: 4, lineHeight: 1.3, background: '#ef444410', padding: '3px 6px', borderRadius: 6 }}>
          ⚠ {data._errorMsg}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{
        width: 10, height: 10, background: config.color,
        border: '2px solid var(--bg-surface)', borderRadius: '50%',
      }} />
    </div>
  );
};

// 注册所有节点类型
export const hubNodeTypes: Record<string, any> = {};
Object.keys(NODE_TYPES_CONFIG).forEach(key => {
  hubNodeTypes[key] = (props: any) => <HubNode {...props} type={key} />;
});

export default HubNode;
