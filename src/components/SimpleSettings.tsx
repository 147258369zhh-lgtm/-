import React from 'react';
import { Settings } from 'lucide-react';
import { useStore } from '../store/useStore';

export const SimpleSettings: React.FC = () => {
    const { theme, toggleTheme } = useStore();

    return (
        <div className="flex-1 p-10 bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
            <h2 className="text-2xl font-bold flex items-center gap-3 mb-10">
                <Settings /> 系统设置
            </h2>
            
            <section className="p-8 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">外观主题</h3>
                        <p className="text-sm text-slate-500 mt-1">切换深色或浅色模式</p>
                    </div>
                    <button 
                        onClick={toggleTheme}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95"
                    >
                        {theme === 'light' ? '切换到暗色' : '切换到浅色'}
                    </button>
                </div>
            </section>
        </div>
    );
};
