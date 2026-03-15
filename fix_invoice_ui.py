import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()
content = content.replace('\r\n', '\n')

# 1. localForm initial state - add invoice_number
old1 = """        category: '',
        remarks: '',
        trip_id: ''
    });"""
new1 = """        category: '',
        remarks: '',
        trip_id: '',
        invoice_number: ''
    });"""
idx = content.find(old1)
if idx >= 0:
    content = content[:idx] + new1 + content[idx+len(old1):]
    print('1. localForm init: OK')
else:
    print('1. FAILED')

# 2. useEffect sync localForm from activeInvoice - add invoice_number
old2 = """            setLocalForm({
                vendor: activeInvoice.vendor || '',
                amount: activeInvoice.amount?.toString() || '',
                date: activeInvoice.date || '',
                location: activeInvoice.location || '',
                category: activeInvoice.category || '',
                remarks: activeInvoice.raw_extracted_text || '',
                trip_id: activeInvoice.trip_id || ''
            });"""
new2 = """            setLocalForm({
                vendor: activeInvoice.vendor || '',
                amount: activeInvoice.amount?.toString() || '',
                date: activeInvoice.date || '',
                location: activeInvoice.location || '',
                category: activeInvoice.category || '',
                remarks: activeInvoice.raw_extracted_text || '',
                trip_id: activeInvoice.trip_id || '',
                invoice_number: activeInvoice.invoice_number || ''
            });"""
idx = content.find(old2)
if idx >= 0:
    content = content[:idx] + new2 + content[idx+len(old2):]
    print('2. useEffect sync: OK')
else:
    print('2. FAILED')

# 3. handleSaveLocal - add invoice_number
old3 = """            vendor: localForm.vendor,
            amount: parseFloat(localForm.amount) || 0,
            date: localForm.date,
            location: localForm.location,
            category: localForm.category,
            raw_extracted_text: localForm.remarks,
            trip_id: localForm.trip_id"""
new3 = """            vendor: localForm.vendor,
            amount: parseFloat(localForm.amount) || 0,
            date: localForm.date,
            location: localForm.location,
            category: localForm.category,
            invoice_number: localForm.invoice_number,
            raw_extracted_text: localForm.remarks,
            trip_id: localForm.trip_id"""
idx = content.find(old3)
if idx >= 0:
    content = content[:idx] + new3 + content[idx+len(old3):]
    print('3. handleSaveLocal: OK')
else:
    print('3. FAILED')

# 4. Add invoice_number input to detail panel - after location & category row, before trip selector
old4 = """                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>\u5f52\u5c5e\u884c\u7a0b / \u9879\u76ee\u884c\u7a0b</label>"""
new4 = """                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>\u53d1\u7968\u53f7\u7801 (Invoice No.)</label>
                                    <div style={{ position: 'relative' }}>
                                        <Receipt size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                                        <input 
                                            style={{ ...inp, paddingLeft: 32, fontFamily: 'monospace', letterSpacing: '0.05em' }} 
                                            value={localForm.invoice_number}
                                            onChange={e => setLocalForm({ ...localForm, invoice_number: e.target.value })}
                                            placeholder="\u53d1\u7968\u53f7\u7801/\u7535\u5b50\u5ba2\u7968\u53f7/\u8ba2\u5355\u53f7" />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>\u5f52\u5c5e\u884c\u7a0b / \u9879\u76ee\u884c\u7a0b</label>"""
idx = content.find(old4)
if idx >= 0:
    content = content[:idx] + new4 + content[idx+len(old4):]
    print('4. UI invoice_number field: OK')
else:
    print('4. FAILED')

with open(f, 'w', encoding='utf-8') as fh:
    fh.write(content)
print('DONE')
