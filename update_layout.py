import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()
content = content.replace('\r\n', '\n')

old_layout = """                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 24, padding: 24 }}>
                    {/* Left: Trip info + invoices */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Trip edit form */}
                        <div style={{ padding: 20, borderRadius: 16, backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>行程名称</label><input style={inp} value={tripEditForm.name} onChange={e => setTripEditForm({ ...tripEditForm, name: e.target.value })} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>目的地</label><input style={inp} value={tripEditForm.destination} onChange={e => setTripEditForm({ ...tripEditForm, destination: e.target.value })} placeholder="由 AI 自动补全或手动输入" /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>出发日期</label><input type="date" style={inp} value={tripEditForm.start_date} onChange={e => setTripEditForm({ ...tripEditForm, start_date: e.target.value })} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>返回日期</label><input type="date" style={inp} value={tripEditForm.end_date} onChange={e => setTripEditForm({ ...tripEditForm, end_date: e.target.value })} /></div>
                            </div>
                            <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>出差事由</label><input style={inp} value={tripEditForm.description} onChange={e => setTripEditForm({ ...tripEditForm, description: e.target.value })} placeholder="由 AI 自动补全或手动输入" /></div>
                            <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>出差报销人</label><input style={inp} value={tripEditForm.reporter_name} onChange={e => setTripEditForm({ ...tripEditForm, reporter_name: e.target.value })} placeholder="填写一次后默认记住" /></div>
                        </div>

                        {/* Drag/drop zone */}
                        {tripIsDragging && (
                            <div style={{ padding: 32, borderRadius: 16, border: '3px dashed var(--brand)', backgroundColor: 'var(--brand-subtle)', textAlign: 'center', color: 'var(--brand)', fontWeight: 700, fontSize: 14, animation: 'pulse 1s ease-in-out infinite' }}>拖放票据文件到此处（支持多选）</div>
                        )}

                        {tripScanning && (
                            <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'var(--brand-subtle)', border: '1px solid var(--brand)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 20, height: 20, border: '3px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>正在扫描 {tripScanFile}...</span>
                            </div>
                        )}

                        {/* Grouped invoices */}
                        {Object.entries(grouped).map(([catLabel, catInvs]) => {
                            const catMeta = getCategoryMeta(catInvs[0].category);
                            const catTotal = catInvs.reduce((s, i) => s + (i.amount || 0), 0);
                            return (
                                <div key={catLabel} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ padding: 4, borderRadius: 6, backgroundColor: catMeta.bg, color: catMeta.color }}><catMeta.icon size={12} /></div>
                                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{catLabel} ({catInvs.length})</span>
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 900, color: catMeta.color }}>¥{catTotal.toFixed(2)}</span>
                                    </div>
                                    {catInvs.map(inv => renderInvoiceMiniCard(inv, true))}
                                </div>
                            );
                        })}
                        {tripInvs.length === 0 && !tripScanning && (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
                                <UploadCloud size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                                <p style={{ margin: 0, fontSize: 13 }}>拖入票据或点击「导入票据」开始</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Unassigned invoices */}
                    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>未分类票据 — 点击「导入」添加到此行程</div>
                        {unassigned.map(inv => (
                            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)', fontSize: 12 }}>
                                <Receipt size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{inv.vendor || inv.title} - ¥{inv.amount?.toFixed(2)} - {inv.date}</span>
                                <button onClick={() => assignInvoiceToTrip(inv.id, activeTrip.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>+ 导入</button>
                            </div>
                        ))}
                    </div>
                </div>"""

new_layout = """                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 24, padding: 24 }}>
                    {/* Left Column: Trip info */}
                    <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Trip edit form */}
                        <div style={{ padding: 20, borderRadius: 16, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>行程名称</label>
                                <input style={{...inp, backgroundColor: 'var(--bg-raised)'}} value={tripEditForm.name} onChange={e => setTripEditForm({ ...tripEditForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>目的地</label>
                                <input style={{...inp, backgroundColor: 'var(--bg-raised)'}} value={tripEditForm.destination} onChange={e => setTripEditForm({ ...tripEditForm, destination: e.target.value })} placeholder="由 AI 自动补全或手动输入" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>出发日期</label>
                                    <input type="date" style={{...inp, backgroundColor: 'var(--bg-raised)'}} value={tripEditForm.start_date} onChange={e => setTripEditForm({ ...tripEditForm, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>返回日期</label>
                                    <input type="date" style={{...inp, backgroundColor: 'var(--bg-raised)'}} value={tripEditForm.end_date} onChange={e => setTripEditForm({ ...tripEditForm, end_date: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>出差事由</label>
                                <textarea rows={2} style={{...inp, backgroundColor: 'var(--bg-raised)', resize: 'none'}} value={tripEditForm.description} onChange={e => setTripEditForm({ ...tripEditForm, description: e.target.value })} placeholder="由 AI 自动补全或手动输入" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>出差报销人</label>
                                <input style={{...inp, backgroundColor: 'var(--bg-raised)'}} value={tripEditForm.reporter_name} onChange={e => setTripEditForm({ ...tripEditForm, reporter_name: e.target.value })} placeholder="填写一次后默认记住" />
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Drag/Drop area & Invoices */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Persistent Drag/drop zone that is always visible at the top */}
                        <div 
                            onClick={handleTripFileSelect}
                            style={{ 
                                padding: '24px 32px', 
                                borderRadius: 16, 
                                border: tripIsDragging ? '3px dashed var(--brand)' : '2px dashed var(--border-strong)', 
                                backgroundColor: tripIsDragging ? 'var(--brand-subtle)' : 'var(--bg-surface)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                animation: tripIsDragging ? 'pulse 1.5s ease-in-out infinite' : 'none'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.backgroundColor = 'var(--brand-subtle)'; }}
                            onMouseLeave={e => {
                                if (!tripIsDragging) {
                                    e.currentTarget.style.borderColor = '2px dashed var(--border-strong)';
                                    e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                                }
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ padding: 12, borderRadius: 12, backgroundColor: 'var(--brand)', color: '#fff' }}>
                                    <UploadCloud size={24} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>一键导入票据</span>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>点击此处选择文件，或将多张票据/行程单直接拖拽到此区域</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {unassigned.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 16, borderRight: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{unassigned.length} 张未分类</div>
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            unassigned.forEach(inv => assignInvoiceToTrip(inv.id, activeTrip.id));
                                        }} style={{ padding: '4px 10px', marginTop: 4, borderRadius: 6, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>全部导入</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {tripScanning && (
                            <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'var(--brand-subtle)', border: '1px solid var(--brand)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 20, height: 20, border: '3px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>正在扫描 {tripScanFile}...</span>
                            </div>
                        )}

                        {/* Grouped invoices */}
                        {Object.entries(grouped).map(([catLabel, catInvs]) => {
                            const catMeta = getCategoryMeta(catInvs[0].category);
                            const catTotal = catInvs.reduce((s, i) => s + (i.amount || 0), 0);
                            return (
                                <div key={catLabel} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ padding: 6, borderRadius: 8, backgroundColor: catMeta.bg, color: catMeta.color }}><catMeta.icon size={16} /></div>
                                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{catLabel} ({catInvs.length})</span>
                                        </div>
                                        <span style={{ fontSize: 16, fontWeight: 900, color: catMeta.color }}>¥{catTotal.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {catInvs.map(inv => renderInvoiceMiniCard(inv, true))}
                                    </div>
                                </div>
                            );
                        })}
                        {tripInvs.length === 0 && !tripScanning && (
                            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>暂无关联票据</p>
                                <p style={{ margin: '8px 0 0', fontSize: 13 }}>通过上方的导入区域添加票据，AI将自动为您整理</p>
                            </div>
                        )}
                    </div>
                </div>"""

if old_layout in content:
    content = content.replace(old_layout, new_layout)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print('Layout updated successfully.')
else:
    print('Failed to find old layout')
