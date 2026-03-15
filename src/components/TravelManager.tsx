import React, { useState, useEffect, useRef } from 'react';
import { PlaneTakeoff, Plus, FileText, Sparkles, Bot, ArrowLeft, Clock, Search, UploadCloud, X, MapPin, Tag, Trash2, Car, Hotel, UtensilsCrossed, TrainFront, Plane, ShoppingBag, Receipt } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Invoice, TravelTrip } from '../store/useStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { getCurrentWebview } from '@tauri-apps/api/webview';

// Category icon/color mapping
const getCategoryMeta = (category?: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('\u51fa\u79df\u8f66') || cat.includes('\u7f51\u7ea6\u8f66') || cat.includes('\u6ef4\u6ef4') || cat.includes('\u6253\u8f66'))
        return { icon: Car, color: '#f97316', bg: 'rgba(249,115,22,0.1)', label: '\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66' };
    if (cat.includes('\u4f4f\u5bbf') || cat.includes('\u9152\u5e97') || cat.includes('\u5bbe\u9986'))
        return { icon: Hotel, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', label: '\u4f4f\u5bbf' };
    if (cat.includes('\u9910\u996e') || cat.includes('\u9910\u5385') || cat.includes('\u5916\u5356'))
        return { icon: UtensilsCrossed, color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: '\u9910\u996e' };
    if (cat.includes('\u706b\u8f66') || cat.includes('\u9ad8\u94c1') || cat.includes('\u52a8\u8f66') || cat.includes('\u94c1\u8def'))
        return { icon: TrainFront, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: '\u706b\u8f66/\u9ad8\u94c1' };
    if (cat.includes('\u98de\u673a') || cat.includes('\u822a\u7a7a') || cat.includes('\u673a\u7968'))
        return { icon: Plane, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', label: '\u98de\u673a' };
    if (cat.includes('\u4ea4\u901a') || cat.includes('\u884c\u7a0b\u5355'))
        return { icon: Car, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: '\u4ea4\u901a\u51fa\u884c' };
    if (cat.includes('\u529e\u516c') || cat.includes('\u91c7\u8d2d') || cat.includes('\u8d2d\u7269'))
        return { icon: ShoppingBag, color: '#6b7280', bg: 'rgba(107,114,128,0.1)', label: '\u529e\u516c/\u91c7\u8d2d' };
    return { icon: Receipt, color: 'var(--text-muted)', bg: 'var(--bg-muted)', label: category || '\u672a\u5206\u7c7b' };
};

// Post-processing: auto-correct category based on vendor/filename keywords
const fixCategory = (category: string, vendor: string, filePath?: string) => {
    const v = (vendor || '').toLowerCase();
    const fp = (filePath || '').toLowerCase();
    const combined = v + ' ' + fp;
    if (combined.includes('\u6ef4\u6ef4') || combined.includes('\u9ad8\u5fb7') || combined.includes('\u884c\u7a0b\u5355') || combined.includes('\u7f51\u7ea6\u8f66') || combined.includes('\u6253\u8f66'))
        return '\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66';
    if (combined.includes('\u94c1\u8def') || combined.includes('\u706b\u8f66') || combined.includes('\u5ba2\u7968') || combined.includes('12306') || combined.includes('\u9ad8\u94c1') || combined.includes('\u52a8\u8f66'))
        return '\u706b\u8f66/\u9ad8\u94c1';
    if (combined.includes('\u822a\u7a7a') || combined.includes('\u673a\u7968') || combined.includes('\u98de\u673a') || combined.includes('\u767b\u673a'))
        return '\u98de\u673a';
    if (combined.includes('\u9152\u5e97') || combined.includes('\u5bbe\u9986') || combined.includes('\u4f4f\u5bbf') || combined.includes('\u6c11\u5bbf'))
        return '\u4f4f\u5bbf';
    if (combined.includes('\u9910\u5385') || combined.includes('\u5916\u5356') || combined.includes('\u7f8e\u56e2') || combined.includes('\u997f\u4e86\u4e48'))
        return '\u9910\u996e';
    if (category === '\u4ea4\u901a' && (combined.includes('\u6ef4\u6ef4') || combined.includes('\u6253\u8f66') || combined.includes('\u51fa\u79df')))
        return '\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66';
    return category;
};

// Fallback: parse invoice info from filename when AI fails
const parseFromFilename = (filePath: string): Partial<Invoice> | null => {
    const fileName = filePath.split(/[\\/]/).pop() || '';
    if (!fileName) return null;
    const result: Partial<Invoice> = {};
    // Extract amount
    const nums = fileName.match(/(\d+\.\d+)/g);
    if (nums) {
        for (const n of nums) {
            const v = parseFloat(n);
            if (v > 1 && v < 100000 && !n.match(/^20\d{2}/)) { result.amount = v; break; }
        }
    }
    // Detect category
    if (fileName.includes('\u9ad8\u94c1') || fileName.includes('\u706b\u8f66') || fileName.includes('\u94c1\u8def') || fileName.includes('\u5ba2\u7968'))
        result.category = '\u706b\u8f66/\u9ad8\u94c1';
    else if (fileName.includes('\u6ef4\u6ef4') || fileName.includes('\u884c\u7a0b\u5355') || fileName.includes('\u7f51\u7ea6\u8f66'))
        result.category = '\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66';
    else if (fileName.includes('\u9152\u5e97') || fileName.includes('\u5bbe\u9986'))
        result.category = '\u4f4f\u5bbf';
    else if (fileName.includes('\u98de\u673a') || fileName.includes('\u673a\u7968'))
        result.category = '\u98de\u673a';
    // Extract route
    const routeMatch = fileName.match(/([\u4e00-\u9fa5]{2,6})[-\u2014\u2013\u5230]([\u4e00-\u9fa5]{2,6})/);
    if (routeMatch) {
        result.location = routeMatch[1];
        result.raw_extracted_text = `${routeMatch[1]}\u2192${routeMatch[2]}`;
    }
    if (result.amount || result.category || result.location) return result;
    return null;
};

export const TravelManager: React.FC = () => {
    const { invoices, addInvoice, updateInvoice, deleteInvoice, trips, addTrip, updateTrip, deleteTrip } = useStore();
    const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDropping, setIsDropping] = useState(false);
    const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
    const [listTab, setListTab] = useState<'invoices' | 'trips'>('trips');
    const [showTripForm, setShowTripForm] = useState(false);
    const [tripForm, setTripForm] = useState({ name: '' });
    const [activeTrip, setActiveTrip] = useState<TravelTrip | null>(null);
    const [tripEditForm, setTripEditForm] = useState({ name: '', destination: '', start_date: '', end_date: '', description: '', reporter_name: '' });
    const [tripScanFile, setTripScanFile] = useState<string | null>(null);
    const [tripScanPreview, setTripScanPreview] = useState<string | null>(null);
    const [tripScanning, setTripScanning] = useState(false);
    const [tripIsDragging, setTripIsDragging] = useState(false);
    const pendingFileDrops = useRef<string[]>([]);

    // Tauri native file drop listener
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        (async () => {
            try {
                const unlistenFn = await getCurrentWebview().onDragDropEvent((event) => {
                    if (event.payload.type === 'over') {
                        setTripIsDragging(true);
                    } else if (event.payload.type === 'drop') {
                        setTripIsDragging(false);
                        const paths = event.payload.paths;
                        if (paths && paths.length > 0) {
                            const validPaths = paths.filter((p: string) => {
                                const ext = p.toLowerCase().split('.').pop();
                                return ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext || '');
                            });
                            if (validPaths.length > 0) {
                                pendingFileDrops.current = validPaths;
                            }
                        }
                    } else if (event.payload.type === 'leave') {
                        setTripIsDragging(false);
                    }
                });
                unlisten = unlistenFn;
            } catch (e) {
                console.error('Failed to set up drag-drop listener:', e);
            }
        })();
        return () => { if (unlisten) unlisten(); };
    }, []);

    // Process pending file drops
    useEffect(() => {
        if (pendingFileDrops.current.length > 0) {
            const paths = [...pendingFileDrops.current];
            pendingFileDrops.current = [];
            if (activeTrip && !activeInvoice) {
                handleTripMultiDrop(paths);
            } else if (activeInvoice && paths.length > 0) {
                updateFile(paths[0]);
            }
        }
    });

    // AI Form local state
    const [localForm, setLocalForm] = useState({
        vendor: '', amount: '', date: '', location: '', category: '', remarks: '', trip_id: '', invoice_number: ''
    });

    const inp: React.CSSProperties = {
        width: '100%', padding: '10px 14px',
        borderRadius: 12, border: '1.5px solid var(--border)',
        backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
        fontSize: 13, outline: 'none', boxSizing: 'border-box',
        transition: 'border-color 0.2s',
    };

    useEffect(() => {
        if (activeInvoice) {
            setLocalForm({
                vendor: activeInvoice.vendor || '', amount: activeInvoice.amount?.toString() || '',
                date: activeInvoice.date || '', location: activeInvoice.location || '',
                category: activeInvoice.category || '', remarks: activeInvoice.raw_extracted_text || '',
                trip_id: activeInvoice.trip_id || '', invoice_number: activeInvoice.invoice_number || ''
            });
        }
    }, [activeInvoice?.id, activeInvoice?.vendor, activeInvoice?.amount, activeInvoice?.date, activeInvoice?.location]);

    // Sync tripEditForm when activeTrip changes
    useEffect(() => {
        if (activeTrip) {
            const defaultReporter = localStorage.getItem('default_reporter_name') || '';
            setTripEditForm({
                name: activeTrip.name || '', destination: activeTrip.destination || '',
                start_date: activeTrip.start_date || '', end_date: activeTrip.end_date || '',
                description: activeTrip.description || '',
                reporter_name: activeTrip.reporter_name || defaultReporter,
            });
        }
    }, [activeTrip?.id]);

    // Preview loader
    useEffect(() => {
        if (!activeInvoice?.file_path) { setPreviewDataUrl(null); return; }
        const fp = activeInvoice.file_path;
        let isInternalCheck = true;
        (async () => {
            try {
                const data = await readFile(fp);
                if (!isInternalCheck) return;
                const ext = fp.split('.').pop()?.toLowerCase() || '';
                let mimeType = 'application/octet-stream';
                if (ext === 'pdf') mimeType = 'application/pdf';
                else if (ext === 'png') mimeType = 'image/png';
                else if (ext === 'gif') mimeType = 'image/gif';
                else if (ext === 'webp') mimeType = 'image/webp';
                else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                
                const blob = new Blob([data], { type: mimeType });
                const url = URL.createObjectURL(blob);
                setPreviewDataUrl(url);
            } catch (e) {
                console.error("Failed to load preview:", e);
                if (isInternalCheck) setPreviewDataUrl(convertFileSrc(fp)); // fallback
            }
        })();
        return () => { isInternalCheck = false; };
    }, [activeInvoice?.file_path]);

    const handleAddInvoice = (forTripId?: string) => {
        const newInvoice: Invoice = {
            id: Math.random().toString(36).substr(2, 9),
            title: `\u626b\u63cf\u7968\u636e-${new Date().toLocaleDateString()}`,
            date: new Date().toISOString().split('T')[0],
            ai_status: 'manual', raw_extracted_text: '', vendor: '', amount: 0,
            trip_id: forTripId || activeTrip?.id,
        };
        addInvoice(newInvoice);
        setActiveInvoice(newInvoice);
    };

    // Trip inline scan: single file -> create invoice -> background AI
    const handleTripFileScan = (filePath: string) => {
        if (!activeTrip) return;
        const tripId = activeTrip.id;
        const newInvoice: Invoice = {
            id: Math.random().toString(36).substr(2, 9),
            title: `\u626b\u63cf\u7968\u636e-${new Date().toLocaleDateString()}`,
            date: new Date().toISOString().split('T')[0],
            ai_status: 'processing', raw_extracted_text: '', vendor: '', amount: 0,
            trip_id: tripId, file_path: filePath,
        };
        addInvoice(newInvoice);

        // Background AI scan
        (async () => {
            try {
                const fileData = await readFile(filePath);
                const bytes = new Uint8Array(fileData);
                const chunkSize = 8192;
                let binary = '';
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode(...chunk);
                }
                const base64 = btoa(binary);

                const fileName = filePath.split(/[\\/]/).pop() || '';
                const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
                const prompt = `\u4f60\u662f\u4e00\u4e2a\u4e13\u4e1a\u7684\u8d22\u52a1\u62a5\u9500\u52a9\u624b\u3002\u8bf7\u5206\u6790\u8fd9\u5f20\u7968\u636e/\u884c\u7a0b\u5355\uff0c\u63d0\u53d6\u5173\u952e\u4fe1\u606f\u5e76\u4e25\u683c\u4ee5 JSON \u683c\u5f0f\u8fd4\u56de\u3002

                \u6587\u4ef6\u540d\u63d0\u793a\uff1a${fileName}\uff08\u8bf7\u7ed3\u5408\u6587\u4ef6\u540d\u4e2d\u7684\u5173\u952e\u8bcd\u5982"\u9ad8\u94c1"\u3001"\u884c\u7a0b\u5355"\u3001"\u9152\u5e97"\u7b49\u8f85\u52a9\u5224\u65ad\u7968\u636e\u7c7b\u578b\uff09
                \u6587\u4ef6\u683c\u5f0f\uff1a${fileExt.toUpperCase()}

                \u91cd\u8981\uff1a\u5982\u679c\u4e0b\u65b9\u9644\u5e26\u4e86PDF\u63d0\u53d6\u7684\u6587\u672c\uff0c\u8bf7\u4ed4\u7ec6\u5206\u6790\u6587\u672c\u5185\u5bb9\u3002\u94c1\u8def\u7535\u5b50\u5ba2\u7968\u7684\u5178\u578b\u5173\u952e\u8bcd\u5305\u62ec\uff1a"\u7535\u5b50\u53d1\u7968\uff08\u94c1\u8def\u7535\u5b50\u5ba2\u7968\uff09"\u3001\u7ad9\u540d\uff08\u5982"\u5170\u5dde\u897f\u7ad9"\uff09\u3001\u8f66\u6b21\u53f7\uff08\u5982"D2743"\uff09\u3001\u7968\u4ef7\uff08\u5982"\u00a5215.00"\uff09\u3001\u53d1\u7968\u53f7\u7801\u3001\u7535\u5b50\u5ba2\u7968\u53f7\u7b49\u3002\u8bf7\u786e\u4fdd\u63d0\u53d6\u91d1\u989d\u3001\u65e5\u671f\u3001\u51fa\u53d1/\u5230\u8fbe\u5730\u70b9\u3001\u53d1\u7968\u53f7\u7801\u3002

                \u6ce8\u610f\uff1a\u5982\u679c\u662f\u6ef4\u6ef4\u51fa\u884c\u3001\u9ad8\u5fb7\u6253\u8f66\u7b49\u5e73\u53f0\u7684"\u884c\u7a0b\u5355"\uff0c\u8bf7\u8bc6\u522b\u4e3a"\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66"\u7c7b\u522b\u3002
                \u5982\u679c\u662f\u9152\u5e97\u4f4f\u5bbf\u7c7b\u7684\u8d26\u5355\uff0c\u8bf7\u8bc6\u522b\u4e3a"\u4f4f\u5bbf"\u7c7b\u522b\u3002
                \u5982\u679c\u662f\u706b\u8f66\u7968\u3001\u9ad8\u94c1\u7968\uff0c\u8bf7\u8bc6\u522b\u4e3a"\u706b\u8f66/\u9ad8\u94c1"\u7c7b\u522b\u3002

                JSON \u7ed3\u6784\u5982\u4e0b\uff1a
                {
                   "vendor": "\u4f9b\u5e94\u5546\u6216\u5546\u6237/\u5e73\u53f0\u5168\u79f0",
                   "amount": \u6570\u5b57\u91d1\u989d(\u4e0d\u542b\u7b26\u53f7),
                   "date": "\u65e5\u671f\uff0c\u683c\u5f0f YYYY-MM-DD",
                   "location": "\u57ce\u5e02\u6216\u5730\u70b9",
                   "category": "\u5206\u7c7b\uff0c\u5fc5\u987b\u662f\uff1a\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66\u3001\u4f4f\u5bbf\u3001\u9910\u996e\u3001\u706b\u8f66/\u9ad8\u94c1\u3001\u98de\u673a\u3001\u4ea4\u901a\u3001\u529e\u516c\u3001\u5176\u4ed6",
                   "remarks": "\u7b80\u77ed\u63cf\u8ff0",
                   "invoice_number": "\u53d1\u7968\u53f7\u7801/\u7535\u5b50\u5ba2\u7968\u53f7"
                }
                \u8bf7\u53ea\u8fd4\u56de JSON\u3002`;

                const response: string = await invoke('chat_with_ai', {
                    req: { prompt, images: [base64] }
                });
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const data = JSON.parse(jsonMatch ? jsonMatch[0] : response);

                const correctedCategory = fixCategory(data.category || '', data.vendor || '', filePath);
                let finalAmount = Number(data.amount) || 0;
                const finalDate = data.date || newInvoice.date;

                // If AI returned 0 amount, try filename fallback
                if (finalAmount === 0) {
                    const parsed = parseFromFilename(filePath);
                    if (parsed?.amount) finalAmount = parsed.amount;
                }

                // Auto-rename file
                let newFilePath = filePath;
                try {
                    const trip = trips.find(t => t.id === tripId);
                    const reporter = trip?.reporter_name || localStorage.getItem('default_reporter_name') || '';
                    if (reporter && finalDate) {
                        const ext = filePath.split('.').pop() || 'pdf';
                        const catLabel = getCategoryMeta(correctedCategory).label;
                        const safeName = `${reporter}_${finalDate}_${catLabel}_${finalAmount.toFixed(2)}.${ext}`;
                        const dir = filePath.substring(0, filePath.lastIndexOf('\\') + 1) || filePath.substring(0, filePath.lastIndexOf('/') + 1);
                        const targetPath = dir + safeName;
                        try {
                            await invoke('rename_file', { from: filePath, to: targetPath });
                            newFilePath = targetPath;
                        } catch (renameErr) { console.warn('Auto-rename failed:', renameErr); }
                    }
                } catch (e) { console.warn('Rename prep error:', e); }

                updateInvoice({
                    ...newInvoice,
                    vendor: data.vendor || '', amount: finalAmount, date: finalDate,
                    location: data.location || '', category: correctedCategory,
                    invoice_number: data.invoice_number || '',
                    raw_extracted_text: data.remarks || '', ai_status: 'success',
                    file_path: newFilePath,
                });
            } catch (e) {
                console.error('Trip scan AI error:', e);
                const parsed = parseFromFilename(filePath);
                if (parsed && (parsed.amount || parsed.category)) {
                    const fallbackCat = fixCategory(parsed.category || '', '', filePath);
                    updateInvoice({
                        ...newInvoice, vendor: parsed.category === '\u706b\u8f66/\u9ad8\u94c1' ? '\u4e2d\u56fd\u94c1\u8def' : '',
                        amount: parsed.amount || 0, location: parsed.location || '',
                        category: fallbackCat, raw_extracted_text: parsed.raw_extracted_text || '\u6587\u4ef6\u540d\u89e3\u6790',
                        ai_status: 'success',
                    });
                } else {
                    updateInvoice({ ...newInvoice, ai_status: 'failed' });
                }
            }
        })();
    };

    const handleTripMultiDrop = (filePaths: string[]) => {
        if (!activeTrip) return;
        setTripScanning(true);
        setTripScanFile(`${filePaths.length} \u4e2a\u6587\u4ef6`);
        filePaths.forEach(p => handleTripFileScan(p));
        setTimeout(() => { setTripScanning(false); setTripScanFile(null); setTripScanPreview(null); }, 1500);
    };

    const handleTripFileSelect = async () => {
        if (!activeTrip) return;
        try {
            const selected = await open({
                multiple: true,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }, { name: 'PDF', extensions: ['pdf'] }]
            });
            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                if (paths.length > 0) handleTripMultiDrop(paths);
            }
        } catch (e) { console.error('Trip file select error:', e); }
    };

    const handleFileSelect = async () => {
        if (!activeInvoice) return;
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }, { name: 'PDF', extensions: ['pdf'] }]
            });
            if (selected && typeof selected === 'string') updateFile(selected);
        } catch (e) { console.error('File select error:', e); }
    };

    const updateFile = (path: string) => {
        if (!activeInvoice) return;
        const updated = { ...activeInvoice, file_path: path };
        setActiveInvoice(updated);
        updateInvoice(updated);
        setPreviewDataUrl(null);
    };

    const handleAnalyze = async () => {
        if (!activeInvoice || !activeInvoice.file_path) return;
        setActiveInvoice({ ...activeInvoice, ai_status: 'processing' });
        try {
            const fileData = await readFile(activeInvoice.file_path);
            const bytes = new Uint8Array(fileData);
            const chunkSize = 8192;
            let binary = '';
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                binary += String.fromCharCode(...chunk);
            }
            const base64 = btoa(binary);

            const analyzeFileName = activeInvoice.file_path.split(/[\\/]/).pop() || '';
            const categoryGuide = `\u6ce8\u610f\uff1a\u6ef4\u6ef4/\u9ad8\u5fb7\u884c\u7a0b\u5355 = "\u51fa\u79df\u8f66/\u7f51\u7ea6\u8f66", \u9152\u5e97\u8d26\u5355 = "\u4f4f\u5bbf", \u706b\u8f66\u7968 = "\u706b\u8f66/\u9ad8\u94c1", \u98de\u673a = "\u98de\u673a", \u9910\u5385 = "\u9910\u996e"`;
            const prompt = `\u4f60\u662f\u4e13\u4e1a\u8d22\u52a1\u62a5\u9500\u52a9\u624b\u3002\u8bf7\u5206\u6790\u8fd9\u5f20\u7968\u636e\uff0c\u63d0\u53d6\u5173\u952e\u4fe1\u606f\u5e76\u4e25\u683c\u4ee5 JSON \u683c\u5f0f\u8fd4\u56de\u3002

            \u6587\u4ef6\u540d\u63d0\u793a\uff1a${analyzeFileName}
            ${categoryGuide}

            \u91cd\u8981\uff1a\u5982\u679c\u4e0b\u65b9\u9644\u5e26\u4e86PDF\u63d0\u53d6\u7684\u6587\u672c\uff0c\u8bf7\u4ed4\u7ec6\u5206\u6790\u6587\u672c\u5185\u5bb9\u3002\u94c1\u8def\u7535\u5b50\u5ba2\u7968\u7684\u5178\u578b\u5173\u952e\u8bcd\u5305\u62ec\uff1a"\u7535\u5b50\u53d1\u7968\uff08\u94c1\u8def\u7535\u5b50\u5ba2\u7968\uff09"\u3001\u7ad9\u540d\u3001\u8f66\u6b21\u53f7\u3001\u7968\u4ef7\u3001\u53d1\u7968\u53f7\u7801\u7b49\u3002

            JSON:
            {
               "vendor": "\u4f9b\u5e94\u5546", "amount": \u91d1\u989d, "date": "YYYY-MM-DD",
               "location": "\u57ce\u5e02", "category": "\u5206\u7c7b",
               "remarks": "\u63cf\u8ff0", "invoice_number": "\u53d1\u7968\u53f7\u7801"
            }
            \u53ea\u8fd4\u56de JSON\u3002`;

            const response: string = await invoke('chat_with_ai', { req: { prompt, images: [base64] } });
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const data = JSON.parse(jsonMatch ? jsonMatch[0] : response);
                const correctedCat = fixCategory(data.category || '', data.vendor || '', activeInvoice.file_path);
                const finalInvoice: Invoice = {
                    ...activeInvoice, vendor: data.vendor || '',
                    amount: Number(data.amount) || 0, date: data.date || activeInvoice.date,
                    location: data.location || '', category: correctedCat,
                    invoice_number: data.invoice_number || '',
                    raw_extracted_text: data.remarks || '', ai_status: 'success' as const
                };
                setLocalForm({
                    vendor: finalInvoice.vendor || '', amount: (finalInvoice.amount ?? 0).toString(),
                    date: finalInvoice.date || '', location: finalInvoice.location || '',
                    category: finalInvoice.category || '', remarks: finalInvoice.raw_extracted_text || '',
                    trip_id: activeInvoice.trip_id || '', invoice_number: finalInvoice.invoice_number || ''
                });
                setActiveInvoice(finalInvoice);
                updateInvoice(finalInvoice);
            } catch (pErr) {
                console.error('AI parse fail:', response);
                setActiveInvoice({ ...activeInvoice, ai_status: 'failed' });
                alert(`\u8bc6\u522b\u5931\u8d25\uff1a\u6a21\u578b\u8fd4\u56de\u4e86\u975e\u6807\u51c6\u683c\u5f0f\u3002\n\n${response}`);
            }
        } catch (e: any) {
            console.error('AI crash:', e);
            setActiveInvoice({ ...activeInvoice, ai_status: 'failed' });
            alert(`AI \u8bc6\u522b\u51fa\u9519\uff1a${e}`);
        }
    };

    const handleSaveLocal = () => {
        if (!activeInvoice) return;
        const updated: Invoice = {
            ...activeInvoice, vendor: localForm.vendor,
            amount: parseFloat(localForm.amount) || 0, date: localForm.date,
            location: localForm.location, category: localForm.category,
            invoice_number: localForm.invoice_number,
            raw_extracted_text: localForm.remarks, trip_id: localForm.trip_id
        };
        updateInvoice(updated);
        setActiveInvoice(null);
    };

    /* --- Invoice detail page --- */
    if (activeInvoice) {
        return (
            <div className="animate-in fade-in slide-in-from-right duration-300" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ height: 56, flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', backgroundColor: 'var(--bg-raised)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => setActiveInvoice(null)} style={{ padding: 8, borderRadius: 10, border: 'none', backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}><ArrowLeft size={17} /></button>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{activeInvoice.title}</h3>
                        <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: activeInvoice.ai_status === 'processing' ? 'var(--brand-subtle)' : 'var(--bg-muted)', color: activeInvoice.ai_status === 'processing' ? 'var(--brand)' : 'var(--text-faint)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{activeInvoice.ai_status}</span>
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    <div style={{ flex: 1, backgroundColor: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', padding: 32, position: 'relative' }}>
                        {activeInvoice.file_path ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                {!previewDataUrl ? (
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
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeInvoice.file_path.split(/[\\/]/).pop()}</span>
                                            <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>PDF</span>
                                        </div>
                                    </div>
                                ) : (
                                    <img src={previewDataUrl} alt="票据预览" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }} />
                                )}
                                <button onClick={() => updateFile('')} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s' }} title="移除并重新上传"><X size={16} /></button>
                            </div>
                        ) : (
                            <div onClick={handleFileSelect} onDragOver={(e) => { e.preventDefault(); setIsDropping(true); }} onDragLeave={() => setIsDropping(false)} onDrop={async (e) => { e.preventDefault(); setIsDropping(false); const files = e.dataTransfer.files; if (files && files.length > 0) { const file = files[0]; const filePath = (file as any).path || file.name; if (filePath && filePath.length > 0) updateFile(filePath); } }}
                                style={{ width: '100%', maxWidth: 520, aspectRatio: '4/3', backgroundColor: isDropping ? 'var(--brand-subtle)' : 'var(--bg-surface)', border: isDropping ? '2px solid var(--brand)' : '2px dashed var(--border)', borderRadius: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-faint)', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <UploadCloud size={60} style={{ opacity: 0.3, transform: isDropping ? 'translateY(-10px)' : 'none', transition: 'transform 0.3s' }} />
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>点击或拖拽票据至此</p>
                                    <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.6 }}>支持图片及 PDF，AI 将自动识别明细</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: AI Panel */}
                    <div className="custom-scrollbar" style={{ width: 440, flexShrink: 0, overflowY: 'auto', backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-raised)', opacity: 0.95 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Bot size={18} style={{ color: 'var(--purple)' }} />
                                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>智能分析面板</span>
                            </div>
                        </div>
                        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
                            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={12} />大模型识别</label>
                                    <button disabled={!activeInvoice.file_path || activeInvoice.ai_status === 'processing'} onClick={handleAnalyze} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', backgroundColor: (!activeInvoice.file_path || activeInvoice.ai_status === 'processing') ? 'var(--bg-muted)' : 'var(--brand)', color: (!activeInvoice.file_path || activeInvoice.ai_status === 'processing') ? 'var(--text-faint)' : '#fff', fontSize: 11, fontWeight: 700, cursor: (!activeInvoice.file_path || activeInvoice.ai_status === 'processing') ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}>
                                        {activeInvoice.ai_status === 'processing' ? <div style={{ width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1.5s linear infinite' }} /> : <Sparkles size={12} />}
                                        {activeInvoice.ai_status === 'processing' ? '分析中...' : '一键智能识别'}
                                    </button>
                                </div>
                                {activeInvoice.ai_status === 'processing' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, backgroundColor: 'var(--bg-subtle)', borderRadius: 16, border: '1px solid var(--border)' }}>
                                        {[1, 0.7, 0.4].map((op, i) => (<div key={i} style={{ height: 18, width: `${90 - i * 15}%`, backgroundColor: 'var(--bg-muted)', borderRadius: 6, opacity: op, animation: 'pulse 1.5s ease-in-out infinite' }} />))}
                                    </div>
                                )}
                                {activeInvoice.ai_status === 'success' && (
                                    <div style={{ padding: '12px 16px', borderRadius: 12, backgroundColor: 'var(--success-subtle)', border: '1px solid var(--success)', display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <Sparkles size={14} style={{ color: 'var(--success)' }} />
                                        <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>智能识别已成功匹配！</div>
                                    </div>
                                )}
                            </section>

                            <section style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 24, borderTop: '1px dashed var(--border-strong)' }}>
                                <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>票据信息校准</label>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>消费供应商 (Vendor)</label><input style={inp} value={localForm.vendor} onChange={e => setLocalForm({ ...localForm, vendor: e.target.value })} placeholder="如：滴滴出行、希尔顿酒店" /></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>金额 (Amount)</label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontWeight: 700, fontSize: 13 }}>¥</span><input type="number" style={{ ...inp, paddingLeft: 30 }} value={localForm.amount} onChange={e => setLocalForm({ ...localForm, amount: e.target.value })} placeholder="0.00" /></div></div>
                                    <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>发生日期 (Date)</label><input type="date" style={inp} value={localForm.date} onChange={e => setLocalForm({ ...localForm, date: e.target.value })} /></div>
                                </div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>消费地点 & 类别</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div style={{ position: 'relative' }}><MapPin size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} /><input style={{ ...inp, paddingLeft: 32 }} value={localForm.location} onChange={e => setLocalForm({ ...localForm, location: e.target.value })} placeholder="城市/地点" /></div>
                                        <div style={{ position: 'relative' }}><Tag size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} /><input style={{ ...inp, paddingLeft: 32 }} value={localForm.category} onChange={e => setLocalForm({ ...localForm, category: e.target.value })} placeholder="消费分类" /></div>
                                    </div>
                                </div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>发票号码</label><input style={inp} value={localForm.invoice_number} onChange={e => setLocalForm({ ...localForm, invoice_number: e.target.value })} placeholder="发票号码 / 电子客票号" /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>归属行程</label>
                                    <select style={{...inp, cursor: 'pointer'}} value={localForm.trip_id} onChange={e => setLocalForm({ ...localForm, trip_id: e.target.value })}>
                                        <option value="">未分类票据</option>
                                        {trips.map(t => (<option key={t.id} value={t.id}>{t.name} ({t.destination})</option>))}
                                    </select>
                                </div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>发票明细 (Details)</label><textarea rows={2} style={{ ...inp, resize: 'none' }} value={localForm.remarks} onChange={e => setLocalForm({ ...localForm, remarks: e.target.value })} placeholder="扫描原文摘要..." /></div>
                                <button onClick={handleSaveLocal} style={{ width: '100%', padding: '14px', marginTop: 8, borderRadius: 14, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,0.3)', transition: 'all 0.2s' }}>确认无误并存入</button>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* --- Helper functions --- */
    const filtered = invoices.filter(i =>
        i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCreateTrip = () => {
        if (!tripForm.name) return;
        const newTrip: TravelTrip = { id: Math.random().toString(36).substr(2, 9), name: tripForm.name };
        addTrip(newTrip);
        setTripForm({ name: '' });
        setShowTripForm(false);
        setActiveTrip(newTrip);
        setTripEditForm({ name: newTrip.name, destination: '', start_date: '', end_date: '', description: '', reporter_name: localStorage.getItem('default_reporter_name') || '' });
    };

    const handleAutoFillTrip = async () => {
        if (!activeTrip) return;
        const tripInvs = invoices.filter(i => i.trip_id === activeTrip.id);
        const summary = tripInvs.map(i => `${i.category}: ${i.vendor} ¥${i.amount} ${i.location} ${i.date}`).join('\n');
        try {
            const response: string = await invoke('chat_with_ai', {
                req: {
                    prompt: `根据以下差旅票据信息,推断出差目的地、起止日期和出差事由,返回JSON: {"destination":"目的地","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","description":"出差事由"}\n\n${summary}`,
                    images: []
                }
            });
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            const data = JSON.parse(jsonMatch ? jsonMatch[0] : response);
            const updated: TravelTrip = {
                ...activeTrip,
                destination: data.destination || tripEditForm.destination,
                start_date: data.start_date || tripEditForm.start_date,
                end_date: data.end_date || tripEditForm.end_date,
                description: data.description || tripEditForm.description,
            };
            updateTrip(updated);
            setActiveTrip(updated);
            setTripEditForm({ name: updated.name, destination: updated.destination || '', start_date: updated.start_date || '', end_date: updated.end_date || '', description: updated.description || '', reporter_name: updated.reporter_name || tripEditForm.reporter_name || '' });
        } catch (e) { alert(`AI补全失败：${e}`); }
    };

    const handleSaveTrip = () => {
        if (!activeTrip) return;
        if (tripEditForm.reporter_name) localStorage.setItem('default_reporter_name', tripEditForm.reporter_name);
        const updated: TravelTrip = {
            ...activeTrip, name: tripEditForm.name || activeTrip.name,
            destination: tripEditForm.destination || undefined,
            start_date: tripEditForm.start_date || undefined,
            end_date: tripEditForm.end_date || undefined,
            description: tripEditForm.description || undefined,
            reporter_name: tripEditForm.reporter_name || undefined,
        };
        updateTrip(updated);
        setActiveTrip(null);
    };

    const getTripInvoices = (tripId: string) => invoices.filter(i => i.trip_id === tripId);
    const getTripTotal = (tripId: string) => getTripInvoices(tripId).reduce((sum, i) => sum + (i.amount || 0), 0);
    const assignInvoiceToTrip = (invoiceId: string, tripId: string) => { const inv = invoices.find(i => i.id === invoiceId); if (inv) updateInvoice({ ...inv, trip_id: tripId }); };
    const unassignInvoice = (invoiceId: string) => { const inv = invoices.find(i => i.id === invoiceId); if (inv) updateInvoice({ ...inv, trip_id: undefined }); };

    const renderInvoiceMiniCard = (invoice: Invoice, showUnassign?: boolean) => {
        const meta = getCategoryMeta(invoice.category);
        const IconComp = meta.icon;
        return (
        <div key={invoice.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setActiveInvoice(invoice)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.transform = 'translateX(4px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
        >
            <div style={{ padding: 8, borderRadius: 10, backgroundColor: meta.bg, color: meta.color, flexShrink: 0, position: 'relative' }}>
                <IconComp size={14} />
                {invoice.file_path && (
                    <span style={{ position: 'absolute', bottom: -2, right: -2, fontSize: 7, fontWeight: 900, padding: '1px 3px', borderRadius: 3, lineHeight: 1, textTransform: 'uppercase', backgroundColor: invoice.file_path.toLowerCase().endsWith('.pdf') ? '#ef4444' : '#3b82f6', color: '#fff' }}>
                        {invoice.file_path.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}
                    </span>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.vendor || invoice.title}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span>{invoice.date}</span>
                    <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                    {invoice.ai_status === 'processing' && <span style={{ color: '#f59e0b', fontWeight: 700 }}>• AI识别中</span>}
                </div>
                {invoice.file_path && (
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={invoice.file_path.split(/[\\/]/).pop() || ''}>
                        {invoice.file_path.split(/[\\/]/).pop()}
                    </div>
                )}
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, color: meta.color, flexShrink: 0 }}>¥{invoice.amount?.toFixed(2)}</span>
            {showUnassign && (
                <button onClick={(e) => { e.stopPropagation(); unassignInvoice(invoice.id); }} title="移出行程"
                    style={{ padding: 4, borderRadius: 6, border: 'none', backgroundColor: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={14} />
                </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除这张票据？')) deleteInvoice(invoice.id); }} title="删除票据"
                style={{ padding: 4, borderRadius: 6, border: 'none', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer', flexShrink: 0, opacity: 0.4, transition: 'opacity 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}>
                <Trash2 size={13} />
            </button>
        </div>
        );
    };

    /* --- Trip detail page --- */
    if (activeTrip) {
        const tripInvs = invoices.filter(i => i.trip_id === activeTrip.id);
        const unassigned = invoices.filter(i => !i.trip_id);
        const total = tripInvs.reduce((s, i) => s + (i.amount || 0), 0);

        // Group by category
        const grouped: Record<string, Invoice[]> = {};
        tripInvs.forEach(inv => {
            const cat = getCategoryMeta(inv.category).label;
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(inv);
        });

        return (
            <div className="animate-in fade-in slide-in-from-right duration-300" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ height: 56, flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', backgroundColor: 'var(--bg-raised)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => setActiveTrip(null)} style={{ padding: 8, borderRadius: 10, border: 'none', backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ArrowLeft size={17} /></button>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{activeTrip.name}</h3>
                        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--brand)' }}>¥{total.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleTripFileSelect} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', backgroundColor: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} />导入票据</button>
                        <button onClick={handleAutoFillTrip} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', backgroundColor: 'var(--bg-muted)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} />AI 补全</button>
                        <button onClick={handleSaveTrip} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', backgroundColor: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>保存行程</button>
                    </div>
                </div>

                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 24, padding: 24 }}>
                    {/* Left Column: Trip info */}
                    <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Beautiful Total Amount Card */}
                        <div style={{ padding: '24px 20px', borderRadius: 16, background: 'linear-gradient(135deg, var(--brand) 0%, #3b82f6 100%)', color: '#fff', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 8px 24px rgba(37,99,235,0.25)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}><PlaneTakeoff size={14} />行程总花费</span>
                            <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ fontSize: 20, marginTop: 6, opacity: 0.8 }}>¥</span>{total.toFixed(2)}
                            </div>
                        </div>

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
                </div>
            </div>
        );
    }

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
                    <input style={{ ...inp, flex: 1 }} placeholder="行程名称，如 兰州出差2025" value={tripForm.name} onChange={e => setTripForm({ name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleCreateTrip(); }} />
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 32, paddingTop: 4, paddingLeft: 4, paddingRight: 4 }}>
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
