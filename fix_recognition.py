import os

f = os.path.join('k:', os.sep, 'GPT', 'GO TONGX - \u526f\u672c', 'src', 'components', 'TravelManager.tsx')
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

# Normalize line endings
content = content.replace('\r\n', '\n')

# ===== 1. Add fixCategory helper function after getCategoryMeta =====
old_after_meta = "return { icon: Receipt, color: 'var(--text-muted)', bg: 'var(--bg-muted)', label: category || '\u672a\u5206\u7c7b' };\n};"

new_after_meta = """return { icon: Receipt, color: 'var(--text-muted)', bg: 'var(--bg-muted)', label: category || '\u672a\u5206\u7c7b' };
};

// Post-processing: auto-correct category based on vendor/filename keywords
const fixCategory = (category: string, vendor: string, filePath?: string) => {
    const v = (vendor || '').toLowerCase();
    const fp = (filePath || '').toLowerCase();
    const combined = v + ' ' + fp;

    // Didi/Gaode trip itinerary -> taxi
    if (combined.includes('\u6ef4\u6ef4') || combined.includes('\u9ad8\u5fb7') || combined.includes('\u884c\u7a0b\u5355'))
        return '\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66';
    // Train/high-speed rail
    if (combined.includes('\u94c1\u8def') || combined.includes('\u706b\u8f66') || combined.includes('\u9ad8\u94c1') || combined.includes('\u52a8\u8f66') || combined.includes('\u5ba2\u7968') || combined.includes('12306'))
        return '\u706b\u8f66/\u9ad8\u94c1';
    // Flight
    if (combined.includes('\u822a\u7a7a') || combined.includes('\u673a\u7968') || combined.includes('\u767b\u673a') || combined.includes('\u98de\u673a'))
        return '\u98de\u673a';
    // Hotel
    if (combined.includes('\u9152\u5e97') || combined.includes('\u5bbe\u9986') || combined.includes('\u6c11\u5bbf') || combined.includes('\u4f4f\u5bbf'))
        return '\u4f4f\u5bbf';
    // Dining
    if (combined.includes('\u9910\u5385') || combined.includes('\u9910\u996e') || combined.includes('\u5916\u5356') || combined.includes('\u7f8e\u56e2') || combined.includes('\u997f\u4e86\u4e48'))
        return '\u9910\u996e';
    // If AI returned generic "\u4ea4\u901a" but we can infer more specific
    if (category === '\u4ea4\u901a' && (combined.includes('\u6ef4\u6ef4') || combined.includes('\u6253\u8f66') || combined.includes('\u51fa\u79df')))
        return '\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66';
    return category;
};"""

idx = content.find(old_after_meta)
if idx >= 0:
    content = content[:idx] + new_after_meta + content[idx + len(old_after_meta):]
    print('1. Added fixCategory helper')
else:
    print('1. FAILED: getCategoryMeta closing not found')

# ===== 2. Update handleTripFileScan prompt to include filename =====
old_trip_prompt = """                const prompt = `\u4f60\u662f\u4e00\u4e2a\u4e13\u4e1a\u7684\u8d22\u52a1\u62a5\u9500\u52a9\u624b\u3002\u8bf7\u5206\u6790\u8fd9\u5f20\u7968\u636e/\u884c\u7a0b\u5355\uff0c\u63d0\u53d6\u5173\u952e\u4fe1\u606f\u5e76\u4e25\u683c\u4ee5 JSON \u683c\u5f0f\u8fd4\u56de\u3002"""

new_trip_prompt = """                const fileName = filePath.split(/[\\\\/]/).pop() || '';
                const prompt = `\u4f60\u662f\u4e00\u4e2a\u4e13\u4e1a\u7684\u8d22\u52a1\u62a5\u9500\u52a9\u624b\u3002\u8bf7\u5206\u6790\u8fd9\u5f20\u7968\u636e/\u884c\u7a0b\u5355\uff0c\u63d0\u53d6\u5173\u952e\u4fe1\u606f\u5e76\u4e25\u683c\u4ee5 JSON \u683c\u5f0f\u8fd4\u56de\u3002

                \u6587\u4ef6\u540d\u63d0\u793a\uff1a${fileName}\uff08\u8bf7\u7ed3\u5408\u6587\u4ef6\u540d\u4e2d\u7684\u5173\u952e\u8bcd\u5982"\u9ad8\u94c1"\u3001"\u884c\u7a0b\u5355"\u3001"\u9152\u5e97"\u7b49\u8f85\u52a9\u5224\u65ad\u7968\u636e\u7c7b\u578b\uff09"""

idx = content.find(old_trip_prompt)
if idx >= 0:
    content = content[:idx] + new_trip_prompt + content[idx + len(old_trip_prompt):]
    print('2. Added filename to trip scan prompt')
else:
    print('2. FAILED: trip scan prompt not found')

# ===== 3. Add fixCategory post-processing to handleTripFileScan result =====
old_trip_result = """                updateInvoice({
                    ...newInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || newInvoice.date,
                    location: data.location || '',
                    category: data.category || '',
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success',
                });"""

new_trip_result = """                const correctedCategory = fixCategory(data.category || '', data.vendor || '', filePath);
                updateInvoice({
                    ...newInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || newInvoice.date,
                    location: data.location || '',
                    category: correctedCategory,
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success',
                });"""

idx = content.find(old_trip_result)
if idx >= 0:
    content = content[:idx] + new_trip_result + content[idx + len(old_trip_result):]
    print('3. Added fixCategory to trip scan result')
else:
    print('3. FAILED: trip scan result not found')

# ===== 4. Update handleAnalyze prompt to include filename =====
old_analyze_prompt = """            // 2. \u6784\u9020\u63d0\u793a\u8bcd\uff08\u589e\u5f3a\u884c\u7a0b\u5355\u8bc6\u522b\uff09
            const prompt = `\u4f60\u662f\u4e00\u4e2a\u4e13\u4e1a\u7684\u8d22\u52a1\u62a5\u9500\u52a9\u624b\u3002\u8bf7\u5206\u6790\u8fd9\u5f20\u7968\u636e/\u884c\u7a0b\u5355\uff08\u56fe\u7247\u6216\u4ecePDF\u63d0\u53d6\u7684\u6587\u672c\uff09\uff0c\u63d0\u53d6\u5173\u952e\u4fe1\u606f\u5e76\u4e25\u683c\u4ee5 JSON \u683c\u5f0f\u8fd4\u56de\u3002"""

new_analyze_prompt = """            // 2. \u6784\u9020\u63d0\u793a\u8bcd\uff08\u589e\u5f3a\u884c\u7a0b\u5355\u8bc6\u522b\uff09
            const analyzeFileName = (activeInvoice.file_path || '').split(/[\\\\/]/).pop() || '';
            const prompt = `\u4f60\u662f\u4e00\u4e2a\u4e13\u4e1a\u7684\u8d22\u52a1\u62a5\u9500\u52a9\u624b\u3002\u8bf7\u5206\u6790\u8fd9\u5f20\u7968\u636e/\u884c\u7a0b\u5355\uff08\u56fe\u7247\u6216\u4ecePDF\u63d0\u53d6\u7684\u6587\u672c\uff09\uff0c\u63d0\u53d6\u5173\u952e\u4fe1\u606f\u5e76\u4e25\u683c\u4ee5 JSON \u683c\u5f0f\u8fd4\u56de\u3002

            \u6587\u4ef6\u540d\u63d0\u793a\uff1a${analyzeFileName}\uff08\u8bf7\u7ed3\u5408\u6587\u4ef6\u540d\u4e2d\u7684\u5173\u952e\u8bcd\u5982"\u9ad8\u94c1"\u3001"\u884c\u7a0b\u5355"\u3001"\u9152\u5e97"\u7b49\u8f85\u52a9\u5224\u65ad\u7968\u636e\u7c7b\u578b\uff09"""

idx = content.find(old_analyze_prompt)
if idx >= 0:
    content = content[:idx] + new_analyze_prompt + content[idx + len(old_analyze_prompt):]
    print('4. Added filename to analyze prompt')
else:
    print('4. FAILED: analyze prompt not found')

# ===== 5. Add fixCategory to handleAnalyze result =====
old_analyze_result = """                const finalInvoice: Invoice = {
                    ...activeInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || activeInvoice.date,
                    location: data.location || '',
                    category: data.category || '',
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success' as const
                };"""

new_analyze_result = """                const correctedCat = fixCategory(data.category || '', data.vendor || '', activeInvoice.file_path);
                const finalInvoice: Invoice = {
                    ...activeInvoice,
                    vendor: data.vendor || '',
                    amount: Number(data.amount) || 0,
                    date: data.date || activeInvoice.date,
                    location: data.location || '',
                    category: correctedCat,
                    raw_extracted_text: data.remarks || '',
                    ai_status: 'success' as const
                };"""

idx = content.find(old_analyze_result)
if idx >= 0:
    content = content[:idx] + new_analyze_result + content[idx + len(old_analyze_result):]
    print('5. Added fixCategory to analyze result')
else:
    print('5. FAILED: analyze result not found')

# Write back
with open(f, 'w', encoding='utf-8') as fh:
    fh.write(content)
print('DONE')
