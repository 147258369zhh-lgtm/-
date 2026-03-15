import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

# Normalize line endings  
content = content.replace('\r\n', '\n')

# Replace the invoice card icon section in the list tab
# Old: static PlaneTakeoff icon with brand colors
old_card = """                            {filtered.map(invoice => (
                                <div key={invoice.id} onClick={() => setActiveInvoice(invoice)}
                                    style={{
                                        backgroundColor: 'var(--bg-surface)',
                                        border: '1.5px solid var(--border)',
                                        borderRadius: 22, padding: 22, cursor: 'pointer',
                                        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                                >
                                    <div style={{ position: 'absolute', top: 0, right: 0, padding: 16, opacity: 0.04 }}><FileText size={80} /></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                                        <div style={{ padding: 12, backgroundColor: 'var(--brand-subtle)', borderRadius: 14, color: 'var(--brand)' }}>
                                            <PlaneTakeoff size={22} />
                                        </div>
                                        <span style={{ padding: '3px 8px', borderRadius: 6, backgroundColor: 'var(--bg-muted)', color: 'var(--text-faint)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>{invoice.ai_status}</span>
                                    </div>
                                    <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.vendor || invoice.title}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} />{invoice.date}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} />{invoice.location || '\u672a\u77e5\u5730\u70b9'}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'var(--bg-muted)', color: 'var(--text-faint)' }}>{invoice.category || '\u672a\u5206\u7c7b'}</span>
                                            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--brand)' }}>\u00a5{invoice.amount?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}"""

new_card = """                            {filtered.map(invoice => {
                                const catMeta = getCategoryMeta(invoice.category);
                                const CatIcon = catMeta.icon;
                                return (
                                <div key={invoice.id} onClick={() => setActiveInvoice(invoice)}
                                    style={{
                                        backgroundColor: 'var(--bg-surface)',
                                        border: `1.5px solid var(--border)`,
                                        borderRadius: 22, padding: 22, cursor: 'pointer',
                                        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = catMeta.color; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                                >
                                    <div style={{ position: 'absolute', top: 0, right: 0, padding: 16, opacity: 0.04 }}><CatIcon size={80} /></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                                        <div style={{ padding: 12, backgroundColor: catMeta.bg, borderRadius: 14, color: catMeta.color }}>
                                            <CatIcon size={22} />
                                        </div>
                                        <span style={{ padding: '3px 8px', borderRadius: 6, backgroundColor: invoice.ai_status === 'processing' ? 'rgba(245,158,11,0.1)' : 'var(--bg-muted)', color: invoice.ai_status === 'processing' ? '#f59e0b' : 'var(--text-faint)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>{invoice.ai_status === 'processing' ? 'AI\u8bc6\u522b\u4e2d...' : invoice.ai_status}</span>
                                    </div>
                                    <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.vendor || invoice.title}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} />{invoice.date}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} />{invoice.location || '\u672a\u77e5\u5730\u70b9'}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: catMeta.bg, color: catMeta.color, fontWeight: 700 }}>{catMeta.label}</span>
                                            <span style={{ fontSize: 16, fontWeight: 900, color: catMeta.color }}>\u00a5{invoice.amount?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                                );
                            })}"""

idx = content.find(old_card)
if idx == -1:
    print('NOT FOUND')
else:
    content = content[:idx] + new_card + content[idx + len(old_card):]
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print('SUCCESS')
