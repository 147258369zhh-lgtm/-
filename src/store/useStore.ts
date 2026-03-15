import { create } from 'zustand';

export interface Project {
    id: string;
    name: string;
    number?: string;
    city?: string;
    project_type?: string;
    created_at: string;
    path: string;
    remarks?: string;
    last_opened_at?: string;
    stage: string;
    summary?: string;
    ai_profile?: string;
}

export interface Invoice {
    id: string;
    title: string;
    amount?: number;
    date?: string;
    type?: string;
    file_path?: string;
    ai_status: 'offline' | 'processing' | 'success' | 'failed' | 'manual';
    raw_extracted_text: string;
    vendor?: string;
    location?: string; // 消费地点
    category?: string; // 消费类别 (如：交通、住宿、餐饮)
    invoice_number?: string; // 发票号码
    trip_id?: string;  // 归属的行程 ID
}

export interface TravelTrip {
    id: string;
    name: string;      // 行程名称 (例如：上海客户拜访)
    destination?: string; // 目的地 (例如：酒泉) - 可由AI自动补全
    start_date?: string;
    end_date?: string;
    description?: string;
    reporter_name?: string; // 出差报销人姓名
}

interface AppState {
    projects: Project[];
    activeProject: Project | null;
    invoices: Invoice[];
    trips: TravelTrip[];
    theme: 'light' | 'dark' | 'glass';
    activeAiModel: string; // 当前选中的模型，如 "deepseek-ai/DeepSeek-V3"
    chatAttachments: string[]; // 待发送的多模态附件 (Base64)
    setProjects: (projects: Project[]) => void;
    setActiveProject: (project: Project | null) => void;
    updateProjectInList: (project: Project) => void;
    toggleTheme: () => void;
    setTheme: (theme: 'light' | 'dark' | 'glass') => void;
    setInvoices: (invoices: Invoice[]) => void;
    addInvoice: (invoice: Invoice) => void;
    updateInvoice: (invoice: Invoice) => void;
    deleteInvoice: (id: string) => void;
    setTrips: (trips: TravelTrip[]) => void;
    addTrip: (trip: TravelTrip) => void;
    updateTrip: (trip: TravelTrip) => void;
    deleteTrip: (id: string) => void;
    setActiveAiModel: (model: string) => void;
    setChatAttachments: (attachments: string[]) => void;
    addChatAttachment: (attachment: string) => void;
    clearChatAttachments: () => void;
}

export const useStore = create<AppState>((set) => ({
    projects: [],
    activeProject: null,
    invoices: [],
    trips: [],
    theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'glass') || 'dark',
    activeAiModel: localStorage.getItem('activeAiModel') || '',
    chatAttachments: [],
    setProjects: (projects) => set({ projects }),
    setActiveProject: (project) => set({ activeProject: project }),
    updateProjectInList: (updatedProject) => set((state) => ({
        projects: state.projects.map((p) => p.id === updatedProject.id ? updatedProject : p)
    })),
    toggleTheme: () => set((state) => {
        const order: Array<'light' | 'dark' | 'glass'> = ['light', 'dark', 'glass'];
        const idx = order.indexOf(state.theme);
        const newTheme = order[(idx + 1) % order.length];
        localStorage.setItem('theme', newTheme);
        return { theme: newTheme };
    }),
    setTheme: (theme) => {
        localStorage.setItem('theme', theme);
        set({ theme });
    },
    setInvoices: (invoices) => set({ invoices }),
    addInvoice: (invoice) => set((state) => ({ invoices: [...state.invoices, invoice] })),
    updateInvoice: (updated) => set((state) => ({
        invoices: state.invoices.map((i) => i.id === updated.id ? updated : i)
    })),
    deleteInvoice: (id) => set((state) => ({
        invoices: state.invoices.filter((i) => i.id !== id)
    })),
    setTrips: (trips) => set({ trips }),
    addTrip: (trip) => set((state) => ({ trips: [...state.trips, trip] })),
    updateTrip: (updated) => set((state) => ({
        trips: state.trips.map((t) => t.id === updated.id ? updated : t)
    })),
    deleteTrip: (id) => set((state) => ({
        trips: state.trips.filter((t) => t.id !== id),
        // 清理被删除行程下的票据关联
        invoices: state.invoices.map(i => i.trip_id === id ? { ...i, trip_id: undefined } : i)
    })),
    setActiveAiModel: (model: string) => set(() => {
        localStorage.setItem('activeAiModel', model);
        return { activeAiModel: model };
    }),
    setChatAttachments: (attachments: string[]) => set({ chatAttachments: attachments }),
    addChatAttachment: (attachment: string) => set((state) => ({ 
        chatAttachments: [...state.chatAttachments, attachment] 
    })),
    clearChatAttachments: () => set({ chatAttachments: [] }),
}));
