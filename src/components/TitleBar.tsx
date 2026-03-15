import React from 'react';
import { Bot, MessageSquareText, Minus, Square, MinusSquare, X, Grid3x3 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

interface TitleBarProps {
    onToggleAiChat: () => void;
    isAiChatOpen: boolean;
    isGridVisible: boolean;
    onToggleGrid: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onToggleAiChat, isAiChatOpen, isGridVisible, onToggleGrid }) => {
    const [isMaximized, setIsMaximized] = React.useState(false);

    React.useEffect(() => {
        const updateMax = async () => setIsMaximized(await appWindow.isMaximized());
        updateMax();
        const unlisten = appWindow.onResized(() => updateMax());
        return () => { unlisten.then(f => f()); };
    }, []);

    const btnBase: React.CSSProperties = {
        height: '100%',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        transition: 'var(--transition)',
    };

    return (
        <div
            data-tauri-drag-region
            style={{
                height: 40,
                backgroundColor: 'var(--titlebar-bg)',
                borderBottom: '1px solid var(--titlebar-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none',
                zIndex: 100,
                flexShrink: 0,
                transition: 'background-color 0.25s ease',
            }}
        >
            {/* Left: App Name */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, pointerEvents: 'none' }}>
                <Bot size={15} style={{ color: '#3b82f6' }} />
                <span style={{
                    fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
                    textTransform: 'uppercase', color: 'var(--text-muted)',
                }}>
                    GO-TONGX <span style={{ color: 'var(--border-strong)' }}>|</span> AI Project Assistant
                </span>
            </div>

            {/* Right: Controls */}
            <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>

                {/* 坐标网格切换按钮 */}
                <button
                    onClick={onToggleGrid}
                    title={isGridVisible ? '隐藏坐标网格' : '显示坐标网格'}
                    style={{
                        ...btnBase,
                        background: isGridVisible ? 'rgba(0,100,210,0.15)' : 'none',
                        color: isGridVisible ? '#3b82f6' : 'var(--text-muted)',
                        borderRadius: 6,
                        margin: '0 4px',
                    }}
                    onMouseEnter={e => { if (!isGridVisible) e.currentTarget.style.backgroundColor = 'var(--bg-muted)'; }}
                    onMouseLeave={e => { if (!isGridVisible) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <Grid3x3 size={15} />
                </button>

                <div style={{ width: 1, height: 16, backgroundColor: 'var(--border)', margin: '0 4px' }} />

                {/* AI Chat 按钮 */}
                <button
                    onClick={onToggleAiChat}
                    title="AI 对话侧边栏"
                    style={{
                        ...btnBase,
                        background: isAiChatOpen ? '#2563eb' : 'none',
                        color: isAiChatOpen ? '#fff' : 'var(--text-muted)',
                    }}
                    onMouseEnter={e => { if (!isAiChatOpen) e.currentTarget.style.backgroundColor = 'var(--bg-muted)'; }}
                    onMouseLeave={e => { if (!isAiChatOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <MessageSquareText size={15} />
                </button>

            </div>
        </div>
    );
};
