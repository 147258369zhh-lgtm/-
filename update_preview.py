import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

# Fix 1: The preview layout HTML is garbled/missing elements from the rebuild
old_preview = """                                {!previewDataUrl ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>正在加载预览...</span>
                                    </div>
                                ) : activeInvoice.file_path.toLowerCase().endsWith('.pdf') ? (
                                    <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: '2px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-surface)' }}>
                                        <iframe src={previewDataUrl} style={{ width: '100%', flex: 1, border: 'none', backgroundColor: '#fff' }} title="PDF 预览" />
                                        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-raised)' }}>
                                            <FileText size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeInvoice.file_path.split(/[\\/]/).pop()}</span>
                                            <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>PDF</span>
                                        </div>
                                    </div>
                                ) : (
                                    <img src={previewDataUrl} alt="票据预览" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }} />
                                )}"""

new_preview = """                                {!previewDataUrl ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>正在加载预览...</span>
                                    </div>
                                ) : activeInvoice.file_path.toLowerCase().endsWith('.pdf') ? (
                                    <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: '2px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-surface)' }}>
                                        <object data={previewDataUrl} type="application/pdf" style={{ width: '100%', flex: 1, border: 'none', backgroundColor: '#fff' }}>
                                            <iframe src={previewDataUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF 预览" />
                                        </object>
                                        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-raised)' }}>
                                            <FileText size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeInvoice.file_path.split(/[\\\\/]/).pop()}</span>
                                            <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>PDF</span>
                                        </div>
                                    </div>
                                ) : (
                                    <img src={previewDataUrl} alt="票据预览" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }} />
                                )}"""

if old_preview in content:
    content = content.replace(old_preview, new_preview)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print("Preview code updated.")
else:
    print("Failed to find old preview code to replace.")

# Fix 2: PDF asset loading for Tauri v2 uses `convertFileSrc` but for Chromium CORS it usually requires `#` or specific format.
# But actually the image also fails to load. Why? Because the CSP might block `asset://localhost`.
