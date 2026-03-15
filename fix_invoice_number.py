import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

content = content.replace('\r\n', '\n')

# ===== 1. Add invoice_number to trip scan prompt JSON structure =====
old1 = '''"remarks": "\u7b80\u77ed\u7684\u6d88\u8d39\u5185\u5bb9\u63cf\u8ff0\uff08\u884c\u7a0b\u5355\u8bf7\u6ce8\u660e\u884c\u7a0b\u6570\u3001\u8d77\u6b62\u5730\u70b9\u7b49\uff09"
                }
                \u8bf7\u53ea\u8fd4\u56de JSON\uff0c\u4e0d\u8981\u5305\u542b\u5176\u4ed6\u6587\u5b57\u3002`;'''
new1 = '''"remarks": "\u7b80\u77ed\u7684\u6d88\u8d39\u5185\u5bb9\u63cf\u8ff0\uff08\u884c\u7a0b\u5355\u8bf7\u6ce8\u660e\u884c\u7a0b\u6570\u3001\u8d77\u6b62\u5730\u70b9\u7b49\uff09",
                   "invoice_number": "\u53d1\u7968\u53f7\u7801/\u7535\u5b50\u5ba2\u7968\u53f7/\u8ba2\u5355\u53f7\uff08\u5982\u679c\u80fd\u8bc6\u522b\u5230\uff09"
                }
                \u8bf7\u53ea\u8fd4\u56de JSON\uff0c\u4e0d\u8981\u5305\u542b\u5176\u4ed6\u6587\u5b57\u3002`;'''

idx = content.find(old1)
if idx >= 0:
    content = content[:idx] + new1 + content[idx + len(old1):]
    print('1. Added invoice_number to trip scan prompt')
else:
    print('1. FAILED')

# ===== 2. Add invoice_number to analyze prompt JSON structure =====
old2 = '''"remarks": "\u7b80\u77ed\u7684\u6d88\u8d39\u5185\u5bb9\u63cf\u8ff0\uff08\u884c\u7a0b\u5355\u8bf7\u6ce8\u660e\u884c\u7a0b\u6570\u3001\u8d77\u6b62\u5730\u70b9\u7b49\uff09"
            }

            \u6ce8\u610f\uff1a\u53ea\u9700\u8fd4\u56de JSON'''
new2 = '''"remarks": "\u7b80\u77ed\u7684\u6d88\u8d39\u5185\u5bb9\u63cf\u8ff0\uff08\u884c\u7a0b\u5355\u8bf7\u6ce8\u660e\u884c\u7a0b\u6570\u3001\u8d77\u6b62\u5730\u70b9\u7b49\uff09",
               "invoice_number": "\u53d1\u7968\u53f7\u7801/\u7535\u5b50\u5ba2\u7968\u53f7/\u8ba2\u5355\u53f7\uff08\u5982\u679c\u80fd\u8bc6\u522b\u5230\uff09"
            }

            \u6ce8\u610f\uff1a\u53ea\u9700\u8fd4\u56de JSON'''

idx = content.find(old2)
if idx >= 0:
    content = content[:idx] + new2 + content[idx + len(old2):]
    print('2. Added invoice_number to analyze prompt')
else:
    print('2. FAILED')

# ===== 3. Add invoice_number to trip scan updateInvoice call =====
old3 = '''                const correctedCategory = fixCategory(data.category || '', data.vendor || '', filePath);
                updateInvoice({
                    ...newInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || newInvoice.date,
                    location: data.location || '',
                    category: correctedCategory,
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success',
                });'''
new3 = '''                const correctedCategory = fixCategory(data.category || '', data.vendor || '', filePath);
                updateInvoice({
                    ...newInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || newInvoice.date,
                    location: data.location || '',
                    category: correctedCategory,
                    invoice_number: data.invoice_number || '',
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success',
                });'''

idx = content.find(old3)
if idx >= 0:
    content = content[:idx] + new3 + content[idx + len(old3):]
    print('3. Added invoice_number to trip scan result')
else:
    print('3. FAILED')

# ===== 4. Add invoice_number to handleAnalyze result =====
old4 = '''                const correctedCat = fixCategory(data.category || '', data.vendor || '', activeInvoice.file_path);
                const finalInvoice: Invoice = {
                    ...activeInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || activeInvoice.date,
                    location: data.location || '',
                    category: correctedCat,
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success' as const
                };'''
new4 = '''                const correctedCat = fixCategory(data.category || '', data.vendor || '', activeInvoice.file_path);
                const finalInvoice: Invoice = {
                    ...activeInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || activeInvoice.date,
                    location: data.location || '',
                    category: correctedCat,
                    invoice_number: data.invoice_number || '',
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success' as const
                };'''

idx = content.find(old4)
if idx >= 0:
    content = content[:idx] + new4 + content[idx + len(old4):]
    print('4. Added invoice_number to analyze result')
else:
    print('4. FAILED')

# ===== 5. Add invoice_number to localForm & setLocalForm in handleAnalyze =====
# Find the localForm state and add invoice_number
old5 = "vendor: '', amount: '0', date: '', location: '', category: '', remarks: '', trip_id: ''"
new5 = "vendor: '', amount: '0', date: '', location: '', category: '', remarks: '', trip_id: '', invoice_number: ''"

count = 0
while old5 in content:
    content = content.replace(old5, new5, 1)
    count += 1
print(f'5. Replaced localForm defaults: {count} occurrences')

# Find the setLocalForm call in handleAnalyze success
old6 = '''                setLocalForm({
                    vendor: finalInvoice.vendor || '',
                    amount: (finalInvoice.amount ?? 0).toString(),
                    date: finalInvoice.date || '',
                    location: finalInvoice.location || '',
                    category: finalInvoice.category || '',
                    remarks: finalInvoice.raw_extracted_text || '',
                    trip_id: activeInvoice.trip_id || ''
                });'''
new6 = '''                setLocalForm({
                    vendor: finalInvoice.vendor || '',
                    amount: (finalInvoice.amount ?? 0).toString(),
                    date: finalInvoice.date || '',
                    location: finalInvoice.location || '',
                    category: finalInvoice.category || '',
                    remarks: finalInvoice.raw_extracted_text || '',
                    trip_id: activeInvoice.trip_id || '',
                    invoice_number: finalInvoice.invoice_number || ''
                });'''

idx = content.find(old6)
if idx >= 0:
    content = content[:idx] + new6 + content[idx + len(old6):]
    print('6. Added invoice_number to setLocalForm in handleAnalyze')
else:
    print('6. FAILED')

with open(f, 'w', encoding='utf-8') as fh:
    fh.write(content)
print('DONE')
