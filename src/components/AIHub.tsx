// ═══════════════════════════════════════════════════
// AI HUB — 统一 AI 能力中心 (重构后的主入口)
// 子组件拆分到 ./aihub/ 目录
// ═══════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';

import { HUB_TABS, loadItems, saveItems } from './aihub/constants';
import type { HubTab, HubItem, ViewMode } from './aihub/constants';
import HubEditor from './aihub/HubEditor';
import HubList from './aihub/HubList';

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

  const handleDelete = async (id: string) => {
    const itemToDelete = items.find(i => i.id === id);
    if (itemToDelete?.type === 'agent' && itemToDelete.source === 'local') {
      try {
        await invoke('agent_delete_blueprint', { id });
      } catch (e) {
        console.error('Failed to delete agent blueprint', e);
      }
    }
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
