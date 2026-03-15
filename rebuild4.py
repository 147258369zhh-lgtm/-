import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')

part4 = r"""
    /* --- Main list view --- */
    return (
        <div className="animate-in fade-in duration-500" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 32px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, letterSpacing: '-0.02em' }}>
                        <PlaneTakeoff style={{ color: 'var(--brand)' }} />差旅费控中心
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Travel Expense AI Recognition</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowTripForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 14, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,0.35)', transition: 'all 0.2s' }}>
                        <Plus size={18} />新建行程
                    </button>
                </div>
            </div>

            {/* New trip form modal */}
            {showTripForm && (
                <div style={{ marginBottom: 20, padding: 20, borderRadius: 16, backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                    <input style={{ ...inp, flex: 1 }} placeholder="行程名称，如"兰州出差2025"" value={tripForm.name} onChange={e => setTripForm({ name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleCreateTrip(); }} />
                    <button onClick={handleCreateTrip} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>创建</button>
                    <button onClick={() => setShowTripForm(false)} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>取消</button>
                </div>
            )}

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexShrink: 0, backgroundColor: 'var(--bg-muted)', borderRadius: 12, padding: 4 }}>
                {[{ key: 'trips' as const, label: '差旅行程' }, { key: 'invoices' as const, label: '所有票据' }].map(tab => (
                    <button key={tab.key} onClick={() => setListTab(tab.key)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', backgroundColor: listTab === tab.key ? 'var(--bg-surface)' : 'transparent', color: listTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', boxShadow: listTab === tab.key ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}>{tab.label}</button>
                ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 20, flexShrink: 0 }}>
                <Search size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                <input type="text" placeholder="搜索行程或票据..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inp, paddingLeft: 40 }} />
            </div>

            {/* Content */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
                {listTab === 'trips' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 32 }}>
                        {trips.length === 0 ? (
                            <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', gap: 16 }}>
                                <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlaneTakeoff size={36} style={{ opacity: 0.2 }} /></div>
                                <p style={{ margin: 0, fontSize: 14, opacity: 0.3, fontStyle: 'italic' }}>点击「新建行程」开始您的差旅管理</p>
                            </div>
                        ) : trips.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || (t.destination || '').toLowerCase().includes(searchQuery.toLowerCase())).map(trip => {
                            const tripTotal = getTripTotal(trip.id);
                            const tripCount = getTripInvoices(trip.id).length;
                            return (
                                <div key={trip.id} onClick={() => { setActiveTrip(trip); }} style={{ padding: 20, borderRadius: 16, backgroundColor: 'var(--bg-raised)', border: '1.5px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                        <div style={{ padding: 14, borderRadius: 14, backgroundColor: 'var(--brand-subtle)', color: 'var(--brand)' }}><PlaneTakeoff size={22} /></div>
                                        <div>
                                            <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{trip.name}</h4>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                                                {trip.destination && <span><MapPin size={11} style={{ verticalAlign: 'middle' }} /> {trip.destination}</span>}
                                                {trip.start_date && <span><Clock size={11} style={{ verticalAlign: 'middle' }} /> {trip.start_date}</span>}
                                                <span>{tripCount} 张票据</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                        <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--brand)' }}>¥{tripTotal.toFixed(2)}</span>
                                        <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除此行程？')) deleteTrip(trip.id); }} title="删除行程"
                                            style={{ padding: 6, borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer', opacity: 0.4, transition: 'opacity 0.2s' }}
                                            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 32 }}>
                        {filtered.length === 0 ? (
                            <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', gap: 16 }}>
                                <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={36} style={{ opacity: 0.2 }} /></div>
                                <p style={{ margin: 0, fontSize: 14, opacity: 0.3 }}>暂无票据</p>
                            </div>
                        ) : filtered.map(inv => renderInvoiceMiniCard(inv))}
                    </div>
                )}
            </div>
        </div>
    );
};
"""

with open(f, 'a', encoding='utf-8') as fh:
    fh.write(part4)

# Verify total file size
tot = os.path.getsize(f)
print(f'Part 4 written: {len(part4)} chars. Total file: {tot} bytes')

# Cleanup temp scripts
for script in ['rebuild.py', 'rebuild2.py', 'rebuild3.py', 'fix_all.py', 'fix_train.py', 'fix_delete.py']:
    sp = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', script)
    if os.path.exists(sp):
        os.remove(sp)
        print(f'Cleaned: {script}')
