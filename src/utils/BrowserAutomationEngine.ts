import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';

export interface WebAction {
    action: 'goto' | 'fill' | 'click' | 'upload' | 'wait';
    selector?: string;      // CSS 选择器
    label?: string;         // 语义标签 (AI 优先使用)
    value?: any;            // 填充值
    timeout?: number;
}

export class BrowserAutomationEngine {
    /**
     * 执行一系列网页动作
     * 该引擎支持“模糊语义定位”，会尝试根据 label 寻找最匹配的输入框
     */
    static async runActions(actions: WebAction[]) {
        console.log('启动浏览器自动化流水线...', actions);
        
        // 1. 寻找目标 URL 并初始化窗口
        const gotoAction = actions.find(a => a.action === 'goto');
        if (!gotoAction) return;

        const webviewId = 'automation-window-' + Date.now();
        const webview = new WebviewWindow(webviewId, {
            url: gotoAction.value,
            title: 'AI 自动填报中 - 请勿关闭',
            width: 1200,
            height: 800,
            decorations: true,
        });

        webview.once('tauri://created', () => {
            console.log('自动化窗口已创建');
        });

        // 给页面加载留出一点时间
        await new Promise(r => setTimeout(r, 3000));

        for (const action of actions) {
            if (action.action === 'goto') continue;

            try {
                switch (action.action) {
                    case 'fill':
                        console.log(`语义填充 [${action.label}]: ${action.value}`);
                        await invoke('run_browser_script', {
                            windowLabel: webviewId,
                            script: this.getSmartFillScript(action.label || action.selector || "", action.value)
                        });
                        break;
                    case 'click':
                        console.log(`点击元素: ${action.label || action.selector}`);
                        await invoke('run_browser_script', {
                            windowLabel: webviewId,
                            script: this.getSmartClickScript(action.label || action.selector || "")
                        });
                        break;
                    case 'wait':
                        await new Promise(r => setTimeout(r, action.timeout || 1000));
                        break;
                }
            } catch (err) {
                console.error(`动作执行失败: ${action.action}`, err);
            }
        }
    }

    /**
     * 生成智能填充脚本
     */
    private static getSmartFillScript(label: string, value: string) {
        return `
            (function() {
                const searchLabel = '${label}';
                const searchVal = '${value}';
                
                function findInput() {
                    // 1. 遍历 Label 文本
                    const allLabels = Array.from(document.querySelectorAll('label, .label, span, div'));
                    for (const el of allLabels) {
                        const text = el.textContent.trim();
                        if (text === searchLabel || text.startsWith(searchLabel)) {
                            // 查找关联 input
                            let input = null;
                            if (el.tagName === 'LABEL' && el.getAttribute('for')) {
                                input = document.getElementById(el.getAttribute('for'));
                            }
                            if (!input) input = el.querySelector('input, textarea, select');
                            if (!input) {
                                // 查找后置兄弟或父级的后置兄弟
                                let next = el.nextElementSibling;
                                if (next) input = next.querySelector('input, textarea, select') || (['INPUT','TEXTAREA','SELECT'].includes(next.tagName) ? next : null);
                            }
                            if (input) return input;
                        }
                    }
                    // 2. 兜底方案：Placeholder 或 Name
                    return document.querySelector('input[placeholder*="'+searchLabel+'"], input[name*="'+searchLabel+'"], textarea[placeholder*="'+searchLabel+'"]');
                }

                const target = findInput();
                if (target) {
                    target.focus();
                    target.value = searchVal;
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                    target.style.border = '2px solid #2563eb';
                    target.style.backgroundColor = '#eff6ff';
                    console.log('AI 填充成功: ' + searchLabel);
                }
            })()
        `;
    }

    private static getSmartClickScript(label: string) {
        return `
            (function() {
                const searchLabel = '${label}';
                const buttons = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
                const btn = buttons.find(b => b.textContent.trim().includes(searchLabel) || (b.value && b.value.includes(searchLabel)));
                if (btn) {
                    btn.click();
                    console.log('AI 点击成功: ' + searchLabel);
                }
            })()
        `;
    }
}
