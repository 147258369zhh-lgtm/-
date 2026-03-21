import React, { useState, useEffect, useCallback } from 'react';
import {
    Puzzle, Search, Download, Globe, FolderOpen,
    RefreshCcw, ChevronDown, ChevronRight, X, Copy,
    Package, HardDrive, Clock, Tag, Info,
    FileArchive
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// ── 插件元数据 ──
interface PluginMeta {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    type: 'browser-extension' | 'script' | 'standalone' | 'other';
    icon?: string;
    folder: string;        // 插件所在目录
    entry?: string;        // 入口文件
    installed_at: string;
    updated_at: string;
    enabled: boolean;
    tags: string[];
    readme?: string;       // README 内容摘要
    size_bytes?: number;
}

// ── 类型图标 & 标签 ──
const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    'browser-extension': { label: '浏览器扩展', color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: <Globe size={16} /> },
    'script':            { label: '脚本工具',   color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', icon: <FileArchive size={16} /> },
    'standalone':        { label: '独立应用',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  icon: <Package size={16} /> },
    'other':             { label: '其他',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: <Puzzle size={16} /> },
};

// ── 扫描已知插件 ──
async function scanPlugins(): Promise<PluginMeta[]> {
    const plugins: PluginMeta[] = [];

    // 1. 浏览器自动化插件（内置，始终显示）
    try {
        // 尝试读取 manifest.json 获取最新信息
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const bytes = await readFile('browser-extension/manifest.json');
        const manifestStr = new TextDecoder().decode(bytes);
        const manifest = JSON.parse(manifestStr);
        
        plugins.push({
            id: 'browser-automation',
            name: manifest.name || '浏览器自动化插件',
            version: manifest.version || '2.0.0',
            description: manifest.description || '录制网页操作，生成可编辑、可回放的自动化流程。',
            author: 'OpenClaw',
            type: 'browser-extension',
            folder: 'browser-extension',
            entry: 'manifest.json',
            installed_at: '2026-03-18',
            updated_at: '2026-03-22',
            enabled: true,
            tags: ['浏览器', '自动化', '录制', '回放'],
            readme: 'Chrome/Edge 浏览器扩展，支持录制网页操作、元素选择、流程回放。需在浏览器 chrome://extensions 中以「加载已解压的扩展程序」方式安装。',
        });
    } catch {
        // readFile 可能失败（路径问题），使用硬编码信息兜底
        plugins.push({
            id: 'browser-automation',
            name: '浏览器自动化插件',
            version: '2.0.0',
            description: '录制网页操作，生成可编辑、可回放的自动化流程。支持 React/Vue 等现代框架。',
            author: 'OpenClaw',
            type: 'browser-extension',
            folder: 'browser-extension',
            entry: 'manifest.json',
            installed_at: '2026-03-18',
            updated_at: '2026-03-22',
            enabled: true,
            tags: ['浏览器', '自动化', '录制', '回放'],
            readme: 'Chrome/Edge 浏览器扩展，支持录制网页操作、元素选择、流程回放。需在浏览器 chrome://extensions 中以「加载已解压的扩展程序」方式安装。',
        });
    }

    // 2. 扫描 plugins/ 目录下的自定义插件
    try {
        const { readFile, readDir } = await import('@tauri-apps/plugin-fs');
        const entries = await readDir('plugins');
        for (const entry of entries) {
            if (entry.isDirectory && entry.name) {
                try {
                    const bytes = await readFile(`plugins/${entry.name}/plugin.json`);
                    const meta = JSON.parse(new TextDecoder().decode(bytes));
                    plugins.push({
                        id: meta.id || entry.name,
                        name: meta.name || entry.name,
                        version: meta.version || '0.0.1',
                        description: meta.description || '',
                        author: meta.author || '未知',
                        type: meta.type || 'other',
                        folder: `plugins/${entry.name}`,
                        entry: meta.entry,
                        installed_at: meta.installed_at || '',
                        updated_at: meta.updated_at || '',
                        enabled: meta.enabled !== false,
                        tags: meta.tags || [],
                    });
                } catch { /* skip dirs without plugin.json */ }
            }
        }
    } catch { /* plugins/ dir might not exist */ }

    return plugins;
}

export const PluginManager: React.FC = () => {
    const [plugins, setPlugins] = useState<PluginMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);

    const loadPlugins = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await scanPlugins();
            setPlugins(data);
        } catch (e) {
            console.error('扫描插件失败:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadPlugins(); }, [loadPlugins]);

    const filtered = plugins.filter(p =>
        !searchQuery ||
        p.name.includes(searchQuery) ||
        p.description.includes(searchQuery) ||
        p.tags.some(t => t.includes(searchQuery))
    );

    const handleOpenFolder = async (folder: string) => {
        try {
            await invoke('open_folder', { path: folder });
        } catch (e) {
            // 兜底：复制路径
            try {
                await navigator.clipboard.writeText(folder);
                alert(`📋 路径已复制：${folder}`);
            } catch {
                alert(`插件目录：${folder}`);
            }
        }
    };

    const handleExport = async (plugin: PluginMeta) => {
        const json = JSON.stringify(plugin, null, 2);
        try {
            await navigator.clipboard.writeText(json);
            alert('✅ 插件信息已复制到剪贴板');
        } catch {
            alert(json);
        }
    };

    // ── 一键安装到浏览器 ──
    const [installGuide, setInstallGuide] = useState<{ plugin: PluginMeta; step: number } | null>(null);

    const handleInstallToBrowser = async (plugin: PluginMeta) => {
        try {
            // 1. 获取扩展的绝对路径
            let absPath = plugin.folder;
            
            // 尝试获取项目根目录的绝对路径
            try {
                const cwd: string = await invoke('mcp_call_internal_tool', {
                    toolName: 'get_system_info',
                    args: {}
                });
                const info = JSON.parse(cwd);
                if (info.current_dir) {
                    absPath = `${info.current_dir}\\${plugin.folder}`;
                }
            } catch {
                // 使用 current_dir 的方式获取
                try {
                    // 读取一个已知文件来确定路径
                    const result: string = await invoke('mcp_call_internal_tool', {
                        toolName: 'file_read',
                        args: { path: `${plugin.folder}/manifest.json` }
                    });
                    if (result) {
                        // 如果能读到说明路径是对的，用相对路径构造
                        absPath = plugin.folder;
                    }
                } catch { /* keep relative path */ }
            }
            
            // 2. 复制路径到剪贴板
            await navigator.clipboard.writeText(absPath);
            
            // 3. 显示安装引导弹窗
            setInstallGuide({ plugin, step: 1 });
            
        } catch (e) {
            alert(`操作失败: ${e}`);
        }
    };

    if (isLoading) return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-surface)', flexDirection: 'column', gap: 16 }}>
            <RefreshCcw size={28} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>扫描插件...</p>
        </div>
    );

    return (
        <div className="custom-scrollbar animate-in fade-in duration-500" style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-surface)', padding: '28px clamp(16px, 3vw, 40px)' }}>

            {/* ── Header ── */}
            <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, letterSpacing: '-0.02em' }}>
                        <Puzzle style={{ color: 'var(--brand)' }} size={26} />
                        我的插件
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                        管理自主开发的独立工具、浏览器扩展和脚本 · {plugins.length} 个插件
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={loadPlugins}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '9px 16px', borderRadius: 12,
                            border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-muted)',
                            color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12,
                            cursor: 'pointer', transition: 'var(--transition)',
                        }}
                    >
                        <RefreshCcw size={14} /> 刷新
                    </button>
                    <button
                        onClick={() => setShowImportModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 20px', borderRadius: 12, border: 'none',
                            backgroundColor: 'var(--brand)', color: '#fff',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(37,99,235,0.25)',
                            transition: 'var(--transition)',
                        }}
                    >
                        <Download size={14} /> 导入插件
                    </button>
                </div>
            </div>

            {/* ── Search ── */}
            <div style={{ position: 'relative', marginBottom: 24 }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                <input
                    type="text"
                    placeholder="搜索插件名称、描述或标签..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: 40 }}
                />
            </div>

            {/* ── Plugin Cards ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filtered.map(plugin => {
                    const typeInfo = TYPE_CONFIG[plugin.type] || TYPE_CONFIG.other;
                    const isExpanded = expandedId === plugin.id;
                    return (
                        <div key={plugin.id} className="settings-section" style={{ padding: 0, overflow: 'hidden', transition: 'all 0.3s ease' }}>
                            {/* Card header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', cursor: 'pointer' }}
                                 onClick={() => setExpandedId(isExpanded ? null : plugin.id)}>
                                {/* Type icon */}
                                <div style={{
                                    width: 48, height: 48, borderRadius: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: typeInfo.bg, color: typeInfo.color,
                                    flexShrink: 0, fontSize: 20,
                                }}>
                                    {typeInfo.icon}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {plugin.name}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                                            v{plugin.version}
                                        </span>
                                        <span style={{
                                            fontSize: 10, padding: '2px 8px', borderRadius: 6,
                                            backgroundColor: typeInfo.bg, color: typeInfo.color,
                                            fontWeight: 700,
                                        }}>
                                            {typeInfo.label}
                                        </span>
                                        {plugin.enabled && (
                                            <span style={{
                                                fontSize: 9, padding: '2px 8px', borderRadius: 6,
                                                backgroundColor: 'var(--success-subtle)', color: 'var(--success)',
                                                fontWeight: 800,
                                            }}>已启用</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {plugin.description}
                                    </div>
                                </div>

                                {/* Expand arrow */}
                                <div style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                                <div className="animate-in fade-in duration-200" style={{
                                    padding: '0 24px 24px',
                                    borderTop: '1px solid var(--border-subtle)',
                                }}>
                                    {/* Tags */}
                                    {plugin.tags.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16, marginBottom: 16 }}>
                                            {plugin.tags.map(tag => (
                                                <span key={tag} style={{
                                                    fontSize: 10, padding: '3px 10px', borderRadius: 8,
                                                    backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)',
                                                    fontWeight: 600,
                                                }}>
                                                    <Tag size={10} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Info grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                            <HardDrive size={13} /> 目录: <code style={{ fontSize: 11, color: 'var(--text-primary)' }}>{plugin.folder}</code>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                            <Clock size={13} /> 更新: {plugin.updated_at || '未知'}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                            <Info size={13} /> 作者: {plugin.author}
                                        </div>
                                        {plugin.entry && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                                <FileArchive size={13} /> 入口: <code style={{ fontSize: 11 }}>{plugin.entry}</code>
                                            </div>
                                        )}
                                    </div>

                                    {/* README */}
                                    {plugin.readme && (
                                        <div style={{
                                            padding: 16, borderRadius: 12,
                                            backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
                                            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7,
                                            marginBottom: 16,
                                        }}>
                                            {plugin.readme}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button onClick={() => handleOpenFolder(plugin.folder)} className="btn-sm btn-outline">
                                            <FolderOpen size={13} /> 打开目录
                                        </button>
                                        <button onClick={() => handleExport(plugin)} className="btn-sm btn-outline">
                                            <Copy size={13} /> 导出信息
                                        </button>
                                        {plugin.type === 'browser-extension' && (
                                            <button
                                                onClick={() => handleInstallToBrowser(plugin)}
                                                className="btn-sm btn-primary"
                                            >
                                                <Globe size={13} /> 安装到浏览器
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Empty state */}
                {filtered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-faint)' }}>
                        <Puzzle size={56} style={{ opacity: 0.1, marginBottom: 16 }} />
                        <p style={{ fontSize: 16, margin: '0 0 8px', fontWeight: 700, opacity: 0.4 }}>
                            {searchQuery ? '未找到匹配的插件' : '还没有插件'}
                        </p>
                        <p style={{ fontSize: 12, margin: 0, opacity: 0.3 }}>
                            {searchQuery ? '尝试其他关键词' : '点击「导入插件」添加你开发的工具'}
                        </p>
                    </div>
                )}
            </div>

            {/* ── Import Modal ── */}
            {showImportModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'var(--modal-bg)',
                }} onClick={() => setShowImportModal(false)}>
                    <div
                        className="animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 480, backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 20, padding: 28,
                            boxShadow: 'var(--shadow-lg)',
                            display: 'flex', flexDirection: 'column', gap: 20,
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Download size={20} style={{ color: 'var(--brand)' }} />
                                导入插件
                            </h3>
                            <button onClick={() => setShowImportModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                            将插件文件夹放入项目根目录的 <code>plugins/</code> 目录下，
                            每个插件需包含 <code>plugin.json</code> 配置文件。
                        </p>

                        {/* plugin.json 模板 */}
                        <div style={{
                            padding: 16, borderRadius: 12,
                            backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)',
                            fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)',
                            lineHeight: 1.8, whiteSpace: 'pre',
                        }}>
{`{
  "id": "my-tool",
  "name": "我的工具",
  "version": "1.0.0",
  "description": "工具描述",
  "author": "你的名字",
  "type": "script",
  "entry": "main.py",
  "tags": ["标签1", "标签2"]
}`}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setShowImportModal(false)} className="btn-sm btn-outline" style={{ padding: '8px 16px' }}>
                                关闭
                            </button>
                            <button onClick={() => { setShowImportModal(false); loadPlugins(); }} className="btn-sm btn-primary" style={{ padding: '8px 20px' }}>
                                <RefreshCcw size={13} /> 刷新列表
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Install Guide Modal — 安装引导弹窗 ── */}
            {installGuide && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'var(--modal-bg)',
                }} onClick={() => setInstallGuide(null)}>
                    <div
                        className="animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 520, backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 20, padding: 28,
                            boxShadow: 'var(--shadow-lg)',
                            display: 'flex', flexDirection: 'column', gap: 20,
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Globe size={22} style={{ color: 'var(--brand)' }} />
                                安装「{installGuide.plugin.name}」
                            </h3>
                            <button onClick={() => setInstallGuide(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{
                            padding: 14, borderRadius: 12,
                            background: 'rgba(80,200,120,.08)', border: '1px solid rgba(80,200,120,.15)',
                            fontSize: 13, color: 'var(--success)', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            ✅ 扩展路径已复制到剪贴板
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {[
                                { n: 1, text: '打开 Chrome/Edge 浏览器', desc: '在地址栏输入：', code: 'chrome://extensions' },
                                { n: 2, text: '开启「开发者模式」', desc: '页面右上角的开关', code: null },
                                { n: 3, text: '点击「加载已解压的扩展程序」', desc: '在弹出的文件夹选择中粘贴路径（Ctrl+V）', code: null },
                            ].map(s => (
                                <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 10,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'var(--brand-dim, rgba(108,123,255,.12))',
                                        color: 'var(--brand)', fontWeight: 900, fontSize: 14,
                                        flexShrink: 0,
                                    }}>{s.n}</div>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {s.text}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                                            {s.desc}
                                        </div>
                                        {s.code && (
                                            <code
                                                onClick={async () => {
                                                    await navigator.clipboard.writeText(s.code!);
                                                }}
                                                style={{
                                                    display: 'inline-block', marginTop: 6,
                                                    padding: '4px 12px', borderRadius: 8,
                                                    backgroundColor: 'var(--bg-raised, #181822)',
                                                    border: '1px solid var(--border)',
                                                    fontSize: 12, color: 'var(--brand)',
                                                    cursor: 'pointer', fontFamily: 'monospace',
                                                }}
                                                title="点击复制"
                                            >
                                                {s.code} 📋
                                            </code>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button
                                onClick={() => handleOpenFolder(installGuide.plugin.folder)}
                                className="btn-sm btn-outline"
                                style={{ padding: '8px 16px' }}
                            >
                                <FolderOpen size={13} /> 打开插件目录
                            </button>
                            <button
                                onClick={() => setInstallGuide(null)}
                                className="btn-sm btn-primary"
                                style={{ padding: '8px 20px' }}
                            >
                                知道了 ✓
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
