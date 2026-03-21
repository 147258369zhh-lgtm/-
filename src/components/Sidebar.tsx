import React from 'react';
import { FolderKanban, FileText, Settings, Database, ChevronLeft, ChevronRight, PlaneTakeoff, Zap, Puzzle } from 'lucide-react';

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    openCreateModal: () => void;
}

const navItems = [
    { id: 'projects', label: '项目管理', icon: FolderKanban },
    { id: 'aihub', label: 'AI HUB', icon: Zap },
    { id: 'templates', label: '全局模板', icon: FileText },
    { id: 'travel', label: '差旅管理', icon: PlaneTakeoff },
    { id: 'common', label: '通用信息', icon: Database },
    { id: 'plugins', label: '插件管理', icon: Puzzle },
    { id: 'settings', label: '系统设置', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    return (
        <div style={{
            width: isCollapsed ? 56 : 240,
            flexShrink: 0,
            height: '100%',
            backgroundColor: 'var(--sidebar-bg)',
            borderRight: '1px solid var(--sidebar-border)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.25s ease, background-color 0.25s ease',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                minHeight: 52,
            }}>
                {!isCollapsed && (
                    <span style={{
                        fontWeight: 800,
                        fontSize: 16,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                    }}>项目管家</span>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    style={{
                        width: 28, height: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 8,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        marginLeft: isCollapsed ? 'auto' : 0,
                        transition: 'var(--transition)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-muted)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Nav Items */}
            <div style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
                {navItems.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            title={isCollapsed ? item.label : undefined}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: isCollapsed ? '10px 0' : '10px 12px',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                borderRadius: 10,
                                border: 'none',
                                background: isActive ? 'var(--brand)' : 'none',
                                color: isActive ? '#fff' : 'var(--text-secondary)',
                                fontWeight: isActive ? 700 : 500,
                                fontSize: 14,
                                cursor: 'pointer',
                                transition: 'var(--transition)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                            }}
                            onMouseEnter={e => {
                                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-muted)';
                            }}
                            onMouseLeave={e => {
                                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            <item.icon size={18} style={{ flexShrink: 0 }} />
                            {!isCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                        </button>
                    );
                })}
            </div>

            {/* Create Button */}
            <div style={{ padding: '8px 8px 12px', borderTop: '1px solid var(--border)' }} />
        </div>
    );
};
