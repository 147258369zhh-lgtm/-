// 
// HubList  列表视图 + 市场面板
// Extracted from AIHub.tsx
// 

import { useState, useEffect } from 'react';
import {
  Library, Cpu, Plus, Search, Play, Edit3,
  Trash2, Package, Globe, Download, Loader2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import {
  HUB_TABS, translateNpmDesc,
} from './constants';
import type { HubTab, HubItem } from './constants';
// ═══════════════════════════════════════════════════
// 列表视图组件
// ═══════════════════════════════════════════════════
const HubList = ({ tab, items, onEdit, onNew, onDelete, onRun }: {
  tab: HubTab; items: HubItem[]; onEdit: (item: HubItem) => void;
  onNew: () => void; onDelete: (id: string) => void; onRun: (item: HubItem) => void;
}) => {
  const tabConfig = HUB_TABS.find(t => t.id === tab)!;
  const [searchQuery, setSearchQuery] = useState('');

  // ── 库模式：从 registry 加载 ──
  const [registryComponents, setRegistryComponents] = useState<any[]>([]);
  const [libFilter, setLibFilter] = useState('全部');
  const [libCatFilter, setLibCatFilter] = useState('全部');

  // ── 网络搜索状态（MCP/Skill/Library 用） ──
  const [npmResults, setNpmResults] = useState<any[]>([]);
  const [npmSearching, setNpmSearching] = useState(false);
  const [npmQuery, setNpmQuery] = useState('');
  const [npmInstalling, setNpmInstalling] = useState<string | null>(null);
  const [npmTranslations, setNpmTranslations] = useState<Record<string, string>>({});
  const [hoveredNpm, setHoveredNpm] = useState<string | null>(null);
  const [showManualImport, setShowManualImport] = useState(false);
  const [manualImportUrl, setManualImportUrl] = useState('');
  const [manualImporting, setManualImporting] = useState(false);
  // ── 市场来源选择 ──
  type MarketSource = 'all' | 'smithery' | 'clawhub' | 'npm';
  const [marketSource, setMarketSource] = useState<MarketSource>('all');

  useEffect(() => {
    if (tab === 'library') {
      invoke('registry_list').then((list: any) => {
        if (Array.isArray(list)) setRegistryComponents(list);
      }).catch(() => {});
    }
  }, [tab]);

  // ── 网络面板相关（MCP/Skill/Library 都显示） ──
  const showNetworkPanel = tab === 'mcp' || tab === 'skill' || tab === 'library';

  const handleNpmSearch = async () => {
    const q = npmQuery.trim() || (tab === 'mcp' ? 'mcp-server' : tab === 'library' ? 'server' : 'ai agent skill function tool');
    setNpmSearching(true);
    setNpmTranslations({});
    try {
      let results: any[] = [];

      // 根据市场来源决定调用哪个 API
      if (marketSource === 'smithery') {
        const raw: any = await invoke('marketplace_search_smithery', { keyword: q });
        results = Array.isArray(raw) ? raw : [];
      } else if (marketSource === 'clawhub') {
        const raw: any = await invoke('marketplace_search_clawhub', { keyword: q });
        results = Array.isArray(raw) ? raw : [];
      } else if (marketSource === 'npm') {
        // 原有 npm 搜索
        const raw: any = await invoke('registry_search_npm', { keyword: q });
        results = Array.isArray(raw) ? raw.map((p: any) => ({ ...p, marketplace: 'npm', installMethod: 'npm' })) : [];
      } else {
        // 'all' — 聚合搜索
        const raw: any = await invoke('marketplace_search_all', { keyword: q });
        results = Array.isArray(raw) ? raw : [];
      }

      setNpmResults(results);

      // 翻译描述（市场 API 结果已带 translation 字段，仅 npm 需要翻译）
      if (marketSource === 'npm' || (!results[0]?.translation && results.length > 0)) {
        const descs = results.map((p: any) => p.description || '');
        invoke('registry_translate_batch', { texts: descs }).then((translations: any) => {
          if (Array.isArray(translations)) {
            const map: Record<string, string> = {};
            results.forEach((p: any, i: number) => {
              map[p.name] = translations[i] || p.description || '无描述';
            });
            setNpmTranslations(map);
          }
        }).catch(() => {
          const map: Record<string, string> = {};
          results.forEach((p: any) => {
            map[p.name] = p.translation || translateNpmDesc('', p.description || '');
          });
          setNpmTranslations(map);
        });
      } else {
        // 市场 API 已有翻译
        const map: Record<string, string> = {};
        results.forEach((p: any) => {
          map[p.name] = p.translation || translateNpmDesc('', p.description || '');
        });
        setNpmTranslations(map);
      }
    } catch (e) {
      console.error('marketplace search failed:', e);
      setNpmResults([]);
    } finally {
      setNpmSearching(false);
    }
  };

  const handleNpmInstall = async (pkg: any) => {
    const installKey = pkg.npm_package || pkg.name;
    setNpmInstalling(installKey);
    try {
      // Marketplace items may use different install methods
      const installMethod = pkg.installMethod || 'npm';
      const sourceUrl = pkg.sourceUrl || pkg.npm_package || pkg.name;

      if (installMethod === 'zip' && pkg.sourceUrl) {
        // GitHub ZIP download (ClawHub skills)
        await invoke('mcp_install_from_source', {
          sourceUrl: pkg.sourceUrl,
          name: pkg.name,
        });
      } else {
        // npm install (Smithery, npm, curated)
        await invoke('mcp_install_from_source', {
          sourceUrl: pkg.npm_package || pkg.name,
          name: pkg.name,
        });
      }

      // Register in plugin registry
      const entry = JSON.stringify({
        id: `${pkg.marketplace || 'npm'}_${(pkg.npm_package || pkg.name).replace(/[^a-zA-Z0-9]/g, '_')}`,
        name: pkg.name, name_zh: pkg.name,
        description: pkg.description || '', description_zh: pkg.translation || pkg.description || '',
        component_type: pkg.type === 'skill' ? 'skill' : 'mcp',
        source: 'network', status: 'enabled',
        version: pkg.version || '0.0.0', author: pkg.author || 'unknown',
        category: pkg.type === 'skill' ? 'skill' : 'mcp',
        icon: pkg.type === 'skill' ? 'wrench' : 'server',
        install_path: null, launch_command: null, launch_args: null,
        config: {}, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_url: sourceUrl,
        npm_package: pkg.npm_package,
      });
      await invoke('registry_install', { entryJson: entry });
      alert(`安装成功: ${pkg.name}`);
    } catch (e: any) {
      alert(`安装失败: ${e?.toString?.() || '未知错误'}`);
    } finally {
      setNpmInstalling(null);
    }
  };

  // 手动导入 MCP/Skill
  const handleManualImport = async () => {
    const url = manualImportUrl.trim();
    if (!url) return;
    setManualImporting(true);
    try {
      // 解析导入源类型
      let sourceUrl = url;
      let importName = url;
      let launchCommand: string | null = null;
      let launchArgs: string[] | null = null;

      if (url.startsWith('npx ')) {
        // npx 命令格式: "npx -y @modelcontextprotocol/server-filesystem /path"
        const parts = url.replace('npx ', '').split(' ');
        const pkgName = parts.find(p => !p.startsWith('-')) || parts[0];
        importName = pkgName.split('/').pop() || pkgName;
        sourceUrl = pkgName;
        launchCommand = 'npx';
        launchArgs = ['-y', ...parts];
      } else if (url.includes('github.com')) {
        // GitHub URL
        const match = url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
        importName = match ? match[2] : url.split('/').pop() || url;
        sourceUrl = url;
      } else if (url.includes('/') || url.includes('\\')) {
        // 本地路径
        importName = url.split(/[\/\\]/).pop() || url;
        sourceUrl = url;
      } else {
        // npm 包名
        importName = url.replace(/@[^\/]*\//, '').replace(/^@/, '');
        sourceUrl = url;
      }

      const entry = JSON.stringify({
        id: `manual_${importName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        name: importName, name_zh: importName,
        description: `手动导入: ${url}`, description_zh: `手动导入: ${url}`,
        component_type: tab === 'mcp' ? 'mcp' : 'skill',
        source: 'manual', status: 'enabled',
        version: '0.0.0', author: 'manual',
        category: tab, icon: tab === 'mcp' ? 'server' : 'wrench',
        install_path: url.includes('/') || url.includes('\\') ? url : null,
        launch_command: launchCommand,
        launch_args: launchArgs,
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_url: sourceUrl,
        npm_package: (!url.includes('/') && !url.includes('\\') && !url.startsWith('npx ')) ? url : null,
      });

      await invoke('registry_install', { entryJson: entry });
      alert(`导入成功: ${importName}`);
      setManualImportUrl('');
      setShowManualImport(false);
    } catch (e: any) {
      alert(`导入失败: ${e?.toString?.() || '未知错误'}`);
    } finally {
      setManualImporting(false);
    }
  };

  useEffect(() => {
    if (showNetworkPanel) {
      // 切 Tab 时清空旧数据并重新搜索
      setNpmResults([]);
      setNpmTranslations({});
      setNpmQuery('');
      const defaultQ = tab === 'mcp' ? 'mcp-server' : 'ai agent skill function tool';
      const doSearch = async () => {
        setNpmSearching(true);
        try {
          const results: any = await invoke('registry_search_npm', { keyword: defaultQ });
          if (Array.isArray(results)) {
            setNpmResults(results);
            const descs = results.map((p: any) => p.description || '');
            invoke('registry_translate_batch', { texts: descs }).then((translations: any) => {
              if (Array.isArray(translations)) {
                const map: Record<string, string> = {};
                results.forEach((p: any, i: number) => { map[p.name] = translations[i] || p.description || '无描述'; });
                setNpmTranslations(map);
              }
            }).catch(() => {
              const map: Record<string, string> = {};
              results.forEach((p: any) => { map[p.name] = translateNpmDesc('', p.description || ''); });
              setNpmTranslations(map);
            });
          }
        } catch { setNpmResults([]); }
        finally { setNpmSearching(false); }
      };
      doSearch();
    }
  }, [tab]);

  const handleToggle = async (id: string, currentStatus: string) => {
    try {
      if (currentStatus === 'enabled') {
        await invoke('registry_disable', { id });
      } else {
        await invoke('registry_enable', { id });
      }
      // 重新加载
      const list: any = await invoke('registry_list');
      if (Array.isArray(list)) setRegistryComponents(list);
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await invoke('registry_uninstall', { id });
      const list: any = await invoke('registry_list');
      if (Array.isArray(list)) setRegistryComponents(list);
    } catch (e: any) {
      alert(e?.toString?.() || '卸载失败');
    }
  };

  const handleExport = async (id: string) => {
    try {
      const json: any = await invoke('registry_export', { id });
      // 复制到剪贴板
      navigator.clipboard.writeText(json as string);
      alert('组件配置已复制到剪贴板');
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  // ── 库视图 ──
  if (tab === 'library') {
    const typeFilterMap: Record<string, string> = {
      '全部': '', 'Agent 综合体': 'composite', 'Agent': 'agent', 'MCP': 'mcp', 'Skill': 'skill', '工具': 'tool',
    };
    
    const categories = ['全部', ...new Set(registryComponents.map(c => c.category))];
    
    let filtered = registryComponents;
    if (libFilter !== '全部') {
      filtered = filtered.filter(c => c.component_type === typeFilterMap[libFilter]);
    }
    if (libCatFilter !== '全部') {
      filtered = filtered.filter(c => c.category === libCatFilter);
    }
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.name_zh?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description_zh?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 分类图标颜色映射
    const catColorMap: Record<string, string> = {
      'file': '#3b82f6', 'office': '#10b981', 'document': '#8b5cf6', 'ai': '#f43f5e',
      'browser': '#f59e0b', 'system': '#6b7280', 'mcp': '#8b5cf6', 'project': '#14b8a6',
      'template': '#ec4899', 'automation': '#6366f1',
    };
    const sourceLabels: Record<string, string> = { 'builtin': '内置', 'local': '本地', 'network': '网络', 'import': '导入' };

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4" style={{ padding: '28px 36px', maxWidth: 1200, margin: '0 auto' }}>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              padding: 12, borderRadius: 16,
              background: 'linear-gradient(135deg, #f59e0b20, #f59e0b08)',
              border: '1px solid #f59e0b25', display: 'flex',
            }}>
              <Library size={26} color="#f59e0b" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                组件库
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                共 {registryComponents.length} 个组件 · {registryComponents.filter(c => c.status === 'enabled').length} 已启用
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="theme-input" style={{
                padding: '8px 12px 8px 32px', borderRadius: 10, border: '1px solid var(--input-border)',
                fontSize: 12, width: 200, fontWeight: 500,
              }} placeholder="搜索组件..." />
            </div>
          </div>
        </div>

        {/* 类型过滤 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {Object.keys(typeFilterMap).map(label => (
            <button key={label} onClick={() => setLibFilter(label)} style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              border: `1px solid ${libFilter === label ? 'var(--brand)' : 'var(--border)'}`,
              background: libFilter === label ? 'var(--brand)' : 'var(--bg-surface)',
              color: libFilter === label ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* 细分类过滤 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setLibCatFilter(cat)} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              border: `1px solid ${libCatFilter === cat ? 'var(--border-strong)' : 'transparent'}`,
              background: libCatFilter === cat ? 'var(--bg-raised)' : 'transparent',
              color: libCatFilter === cat ? 'var(--text-primary)' : 'var(--text-faint)',
              cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
            }}>{cat}</button>
          ))}
        </div>

        {/* 组件卡片网格 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {filtered.map((comp: any) => {
            const catColor = catColorMap[comp.category] || '#6b7280';
            const isEnabled = comp.status === 'enabled';
            const isBuiltin = comp.source === 'builtin';

            return (
              <div key={comp.id} style={{
                background: 'var(--bg-surface)', borderRadius: 16,
                border: `1px solid ${isEnabled ? 'var(--border)' : 'var(--border-subtle)'}`,
                padding: '16px 18px', transition: 'all 0.2s',
                opacity: isEnabled ? 1 : 0.55,
                boxShadow: 'var(--shadow-sm)',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                }}
              >
                {/* 顶部：图标 + 名称 + 开关 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    padding: 8, borderRadius: 10,
                    background: `${catColor}12`, display: 'flex', flexShrink: 0,
                  }}>
                    <Cpu size={18} color={catColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {comp.name_zh}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                      {comp.name}
                    </div>
                  </div>
                  {/* 启用/禁用开关 */}
                  <button
                    onClick={() => handleToggle(comp.id, comp.status)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, border: 'none',
                      background: isEnabled ? catColor : `${catColor}30`,
                      cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3,
                      left: isEnabled ? 21 : 3,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>

                {/* 描述 */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10, minHeight: 32 }}>
                  {comp.description_zh}
                </div>

                {/* 标签行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: `${catColor}15`, color: catColor,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{comp.category}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                    background: isBuiltin ? 'var(--success-subtle)' : 'var(--brand-subtle)',
                    color: isBuiltin ? 'var(--success)' : 'var(--brand)',
                  }}>{sourceLabels[comp.source] || comp.source}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>v{comp.version}</span>
                </div>

                {/* 操作按钮 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleExport(comp.id)} style={{
                    flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-raised)',
                    color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    <Package size={11} /> 导出
                  </button>
                  {!isBuiltin && (
                    <button onClick={() => handleUninstall(comp.id)} style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: '1px solid var(--danger-subtle)', background: 'var(--danger-subtle)',
                      color: 'var(--danger)', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}>
                      <Trash2 size={11} /> 卸载
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Library size={48} color="var(--text-faint)" style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-faint)' }}>没有匹配的组件</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>尝试调整过滤条件或搜索关键词</div>
          </div>
        )}
      </div>
    );
  }

  // ── 非库视图：普通列表 ──
  const filtered = items.filter(i => i.type === tab);
  const displayed = filtered.filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()));


  const sourceLabel = (s?: string) => s === 'network' ? '网络' : s === 'builtin' ? '内置' : '本地';
  const sourceBg = (s?: string) => s === 'network' ? 'var(--purple-subtle)' : s === 'builtin' ? 'var(--success-subtle)' : 'var(--brand-subtle)';
  const sourceColor = (s?: string) => s === 'network' ? 'var(--purple)' : s === 'builtin' ? 'var(--success)' : 'var(--brand)';



  const renderItemCard = (item: HubItem) => {
    const typeConfig = HUB_TABS.find(t => t.id === item.type);
    const TypeIcon = typeConfig?.icon || Package;
    return (
      <div key={item.id} style={{
        background: 'var(--bg-surface)', borderRadius: 18,
        border: '1px solid var(--border)', padding: 20,
        transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ padding: 8, borderRadius: 12, background: `${typeConfig?.color || '#6366f1'}12`, display: 'flex', flexShrink: 0 }}>
            <TypeIcon size={20} color={typeConfig?.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>{item.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.description || '暂无描述'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: sourceBg(item.source), color: sourceColor(item.source) }}>{sourceLabel(item.source)}</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onRun(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer', background: typeConfig?.color, color: '#fff', fontSize: 11, fontWeight: 700 }}><Play size={11} /> 运行</button>
          <button onClick={() => onEdit(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Edit3 size={11} /> 编辑</button>
          <button onClick={() => onDelete(item.id)} style={{ padding: '7px 8px', borderRadius: 9, border: '1px solid var(--danger-subtle)', background: 'var(--danger-subtle)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4" style={{ padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 12, borderRadius: 16, background: `linear-gradient(135deg, ${tabConfig.color}20, ${tabConfig.color}08)`, border: `1px solid ${tabConfig.color}25`, display: 'flex' }}>
            <tabConfig.icon size={26} color={tabConfig.color} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>我的{tabConfig.label}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{tabConfig.desc}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="theme-input" style={{ padding: '8px 12px 8px 32px', borderRadius: 10, border: '1px solid var(--input-border)', fontSize: 12, width: 200, fontWeight: 500 }} placeholder="搜索本地..." />
          </div>
          <button onClick={onNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${tabConfig.color}, ${tabConfig.color}cc)`, color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: `0 3px 12px ${tabConfig.color}33` }}>
            <Plus size={14} /> 创建{tabConfig.label}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* 左侧：网络获取面板（仅 MCP/Skill） */}
        {showNetworkPanel && (
          <div className="custom-scrollbar" style={{
            width: 300, minWidth: 300, maxWidth: 300,
            overflow: 'hidden', borderRadius: 16,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* 面板头 */}
            <div style={{
              padding: '12px 14px 10px', borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={13} color={tabConfig.color} />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>技能市场</span>
              </div>
              {/* 市场来源切换 */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {([
                  { id: 'all' as MarketSource, label: '全部', color: tabConfig.color },
                  { id: 'smithery' as MarketSource, label: 'Smithery', color: '#6366f1' },
                  { id: 'clawhub' as MarketSource, label: 'ClawHub', color: '#f59e0b' },
                  { id: 'npm' as MarketSource, label: 'npm', color: '#cb3837' },
                ]).map(src => (
                  <button
                    key={src.id}
                    onClick={() => { setMarketSource(src.id); setNpmResults([]); setNpmTranslations({}); }}
                    style={{
                      padding: '2px 8px', borderRadius: 6, border: 'none',
                      fontSize: 9, fontWeight: 700, cursor: 'pointer',
                      background: marketSource === src.id ? `${src.color}22` : 'transparent',
                      color: marketSource === src.id ? src.color : 'var(--text-faint)',
                      transition: 'all 0.2s',
                    }}
                  >{src.label}</button>
                ))}
              </div>

              {/* 手动导入区 */}
              <div style={{
                background: `${tabConfig.color}08`, borderRadius: 8,
                border: `1px dashed ${tabConfig.color}30`, padding: '8px 10px',
              }}>
                <div
                  onClick={() => setShowManualImport(!showManualImport)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: tabConfig.color }}
                >
                  <Download size={11} />
                  <span>手动导入 {tab === 'mcp' ? 'MCP Server' : 'Skill'}</span>
                  <span style={{ fontSize: 8, marginLeft: 'auto', transform: showManualImport ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                </div>
                {showManualImport && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 6, lineHeight: 1.5 }}>
                      {tab === 'mcp'
                        ? '支持：npm 包名、npx 命令、GitHub URL、本地路径'
                        : '支持：npm 包名、GitHub URL、本地目录路径'}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        value={manualImportUrl}
                        onChange={e => setManualImportUrl(e.target.value)}
                        className="theme-input"
                        style={{
                          flex: 1, padding: '5px 8px', borderRadius: 6,
                          border: '1px solid var(--border-subtle)', fontSize: 10,
                        }}
                        placeholder={tab === 'mcp' ? '@modelcontextprotocol/server-...' : 'github.com/user/skill-name'}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && manualImportUrl.trim()) {
                            handleManualImport();
                          }
                        }}
                      />
                      <button
                        onClick={handleManualImport}
                        disabled={manualImporting || !manualImportUrl.trim()}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: 'none',
                          background: tabConfig.color, color: '#fff',
                          fontSize: 9, fontWeight: 700, cursor: 'pointer',
                          opacity: manualImporting || !manualImportUrl.trim() ? 0.5 : 1,
                        }}
                      >
                        {manualImporting ? '导入中' : '导入'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                  <input
                    value={npmQuery}
                    onChange={e => setNpmQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNpmSearch()}
                    className="theme-input"
                    style={{
                      width: '100%', padding: '6px 8px 6px 26px', borderRadius: 8,
                      border: '1px solid var(--border-subtle)', fontSize: 11,
                    }}
                    placeholder={tab === 'mcp' ? '搜索 MCP...' : '搜索 Skill...'}
                  />
                </div>
                <button onClick={handleNpmSearch} disabled={npmSearching} style={{
                  padding: '5px 10px', borderRadius: 8, border: 'none',
                  background: `${tabConfig.color}18`, color: tabConfig.color,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  {npmSearching ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={11} />}
                </button>
              </div>
            </div>

            {/* 搜索结果 */}
            <div className="custom-scrollbar" style={{ flex: 1, padding: '6px 8px', overflow: 'auto' }}>
              {npmSearching && npmResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)' }}>
                  <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 6 }} />
                  <div style={{ fontSize: 11, fontWeight: 600 }}>搜索中...</div>
                </div>
              )}
              {!npmSearching && npmResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 8px', color: 'var(--text-faint)' }}>
                  <Globe size={24} style={{ marginBottom: 6, opacity: 0.25 }} />
                  <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.5 }}>输入关键词搜索</div>
                </div>
              )}
              {npmResults.map((pkg: any, idx: number) => {
                const isHovered = hoveredNpm === pkg.name;
                const descZh = npmTranslations[pkg.name] || translateNpmDesc('', pkg.description || '');
                const isTranslating = !npmTranslations[pkg.name] && Object.keys(npmTranslations).length === 0;
                return (
                  <div key={`${pkg.name}_${idx}`} style={{
                    padding: isHovered ? '12px 12px' : '8px 10px',
                    borderRadius: 10, marginBottom: 4,
                    transition: 'all 0.25s ease',
                    cursor: 'default',
                    border: isHovered ? '1px solid var(--border)' : '1px solid transparent',
                    background: isHovered ? 'var(--bg-raised)' : 'transparent',
                    transform: isHovered ? 'scale(1.02)' : 'none',
                    boxShadow: isHovered ? 'var(--shadow-sm)' : 'none',
                  }}
                    onMouseEnter={() => setHoveredNpm(pkg.name)}
                    onMouseLeave={() => setHoveredNpm(null)}
                  >
                    {/* 标题行 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isHovered ? 6 : 3 }}>
                      <Package size={isHovered ? 14 : 12} color={tabConfig.color} style={{ flexShrink: 0, transition: 'all 0.2s' }} />
                      <div style={{
                        fontSize: isHovered ? 12 : 11, fontWeight: 800, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        transition: 'all 0.2s',
                      }}>{pkg.name}</div>
                      {/* 市场来源标签 */}
                      {pkg.marketplace && (
                        <span style={{
                          fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                          background: pkg.marketplace === 'smithery' ? '#6366f120' :
                                     pkg.marketplace === 'clawhub' ? '#f59e0b20' :
                                     pkg.marketplace === 'curated' ? '#10b98120' : '#cb383720',
                          color: pkg.marketplace === 'smithery' ? '#6366f1' :
                                 pkg.marketplace === 'clawhub' ? '#f59e0b' :
                                 pkg.marketplace === 'curated' ? '#10b981' : '#cb3837',
                          flexShrink: 0, textTransform: 'uppercase',
                        }}>{pkg.marketplace === 'curated' ? '精选' : pkg.marketplace}</span>
                      )}
                      {/* 右上角：打开原网址 */}
                      {(pkg.npm_url || pkg.repo_url || pkg.sourceUrl) && (
                        <a
                          href={pkg.npm_url || pkg.repo_url || pkg.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="打开原网址"
                          style={{
                            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: 6,
                            background: `${tabConfig.color}12`,
                            color: tabConfig.color,
                            transition: 'all 0.2s',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${tabConfig.color}30`; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${tabConfig.color}12`; }}
                        >
                          <Globe size={10} />
                        </a>
                      )}
                    </div>

                    {/* 中文翻译 */}
                    <div style={{
                      fontSize: isHovered ? 11 : 10,
                      color: isTranslating ? 'var(--text-faint)' : 'var(--text-secondary)',
                      lineHeight: 1.5, marginBottom: isHovered ? 6 : 3,
                      fontWeight: 500, transition: 'all 0.2s',
                      display: '-webkit-box',
                      WebkitLineClamp: isHovered ? 5 : 2,
                      WebkitBoxOrient: 'vertical' as any, overflow: 'hidden',
                    }}>{isTranslating ? '翻译中...' : descZh}</div>

                    {/* 悬停时显示更多信息 */}
                    {isHovered && (
                      <div style={{ transition: 'all 0.2s' }}>
                        {/* 英文原文 */}
                        <div style={{
                          fontSize: 9, color: 'var(--text-faint)', lineHeight: 1.4,
                          marginBottom: 6, fontStyle: 'italic',
                          padding: '4px 8px', borderRadius: 6,
                          background: 'var(--bg-root)',
                        }}>{pkg.description || '无描述'}</div>
                        {/* 详细信息 */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>v{pkg.version}</span>
                          <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>作者: {pkg.author}</span>
                          {pkg.downloads > 0 && <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>⭐ {pkg.downloads}</span>}
                          {pkg.npm_url && <a href={pkg.npm_url} target="_blank" style={{ fontSize: 9, color: tabConfig.color, textDecoration: 'none' }}>npm ↗</a>}
                          {pkg.repo_url && <a href={pkg.repo_url} target="_blank" style={{ fontSize: 9, color: tabConfig.color, textDecoration: 'none' }}>源码 ↗</a>}
                          {!pkg.npm_url && !pkg.repo_url && pkg.sourceUrl && <a href={pkg.sourceUrl} target="_blank" style={{ fontSize: 9, color: tabConfig.color, textDecoration: 'none' }}>主页 ↗</a>}
                        </div>
                      </div>
                    )}

                    {/* 底部操作栏 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {!isHovered && <span style={{ fontSize: 8, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{pkg.downloads > 0 ? `⭐${pkg.downloads}` : `v${pkg.version}`}</span>}
                      {isHovered && <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{pkg.npm_package || pkg.name}</span>}
                      <button
                        onClick={() => handleNpmInstall(pkg)}
                        disabled={npmInstalling === (pkg.npm_package || pkg.name)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: isHovered ? '4px 14px' : '3px 10px',
                          borderRadius: 6, border: 'none',
                          background: npmInstalling === (pkg.npm_package || pkg.name) ? 'var(--bg-muted)' : isHovered ? tabConfig.color : `${tabConfig.color}15`,
                          color: npmInstalling === (pkg.npm_package || pkg.name) ? 'var(--text-faint)' : isHovered ? '#fff' : tabConfig.color,
                          fontSize: isHovered ? 11 : 10, fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {npmInstalling === (pkg.npm_package || pkg.name)
                          ? <><Loader2 size={9} style={{ animation: 'spin 0.8s linear infinite' }} /> 安装中</>
                          : <><Download size={isHovered ? 11 : 9} /> 安装</>
                        }
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 右侧：本地列表 */}
        <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {displayed.map(renderItemCard)}
            <div onClick={onNew} style={{
              borderRadius: 18, border: '2px dashed var(--border)', padding: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, cursor: 'pointer',
              transition: 'all 0.2s', minHeight: 140,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tabConfig.color; (e.currentTarget as HTMLElement).style.background = `${tabConfig.color}08`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-strong)' }}>
                <Plus size={20} color="var(--text-faint)" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>新建 {tabConfig.label}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HubList;
