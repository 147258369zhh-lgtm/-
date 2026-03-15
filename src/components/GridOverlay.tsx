import { useEffect, useState } from 'react';

const GRID_SIZE = 50;

function rowLabel(i: number): string {
    let text = '';
    let n = i;
    do {
        text = String.fromCharCode(65 + (n % 26)) + text;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return text;
}

interface GridOverlayProps {
    visible: boolean;
}

export function GridOverlay({ visible }: GridOverlayProps) {
    const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

    useEffect(() => {
        const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    if (!visible) return null;

    const cols = Math.ceil(size.w / GRID_SIZE);
    const rows = Math.ceil(size.h / GRID_SIZE);
    const AXIS_W = 22;
    const AXIS_H = 20;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0,
            width: '100vw', height: '100vh',
            zIndex: 2147483647,
            pointerEvents: 'none',
            overflow: 'hidden',
            fontFamily: 'monospace',
        }}>
            {/* 网格线 */}
            <div style={{
                position: 'absolute',
                top: AXIS_H, left: AXIS_W, right: 0, bottom: 0,
                backgroundImage: `
                    linear-gradient(to right, rgba(0,120,255,0.18) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0,120,255,0.18) 1px, transparent 1px)
                `,
                backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            }} />

            {/* X 轴：数字 */}
            <div style={{
                position: 'absolute',
                top: 0, left: AXIS_W, right: 0, height: AXIS_H,
                display: 'flex',
                backgroundColor: 'rgba(240,248,255,0.85)',
                borderBottom: '1px solid rgba(0,120,255,0.45)',
            }}>
                {Array.from({ length: cols }, (_, i) => (
                    <div key={i} style={{
                        width: GRID_SIZE, flexShrink: 0,
                        fontSize: 10, color: '#0060cc',
                        paddingLeft: 3, lineHeight: `${AXIS_H}px`,
                        borderRight: '1px solid rgba(0,120,255,0.12)',
                        overflow: 'hidden', boxSizing: 'border-box',
                    }}>{i + 1}</div>
                ))}
            </div>

            {/* Y 轴：字母 */}
            <div style={{
                position: 'absolute',
                top: AXIS_H, left: 0, bottom: 0, width: AXIS_W,
                display: 'flex', flexDirection: 'column',
                backgroundColor: 'rgba(240,248,255,0.85)',
                borderRight: '1px solid rgba(0,120,255,0.45)',
            }}>
                {Array.from({ length: rows }, (_, i) => (
                    <div key={i} style={{
                        height: GRID_SIZE, flexShrink: 0,
                        fontSize: 10, color: '#0060cc',
                        paddingTop: 3, paddingLeft: 3,
                        borderBottom: '1px solid rgba(0,120,255,0.12)',
                        boxSizing: 'border-box',
                    }}>{rowLabel(i)}</div>
                ))}
            </div>

            {/* 左上角交叉格 */}
            <div style={{
                position: 'absolute', top: 0, left: 0,
                width: AXIS_W, height: AXIS_H,
                backgroundColor: 'rgba(200,220,255,0.9)',
                borderRight: '1px solid rgba(0,120,255,0.45)',
                borderBottom: '1px solid rgba(0,120,255,0.45)',
            }} />

            {/* 提示徽标 */}
            <div style={{
                position: 'absolute', bottom: 12, right: 16,
                backgroundColor: 'rgba(0,100,210,0.75)',
                color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '4px 10px', borderRadius: 6,
                backdropFilter: 'blur(4px)', userSelect: 'none',
                letterSpacing: '0.05em',
            }}>
                GRID ON · 点击标题栏格子图标关闭
            </div>
        </div>
    );
}
