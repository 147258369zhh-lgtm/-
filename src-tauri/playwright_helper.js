/**
 * Playwright Helper Script — Browser Automation Bridge
 * Called by Rust backend via Node.js subprocess
 * 
 * Usage: node playwright_helper.js '{"command":"navigate","params":{"url":"..."}}'
 */

const { chromium } = require('playwright');

let browser = null;
let page = null;

async function ensureBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: false, // 可见模式，方便用户观察和人工介入
            args: ['--start-maximized']
        });
        const context = await browser.newContext({
            viewport: null,
            locale: 'zh-CN',
        });
        page = await context.newPage();
    }
    return { browser, page };
}

async function handleCommand(command, params) {
    const { page } = await ensureBrowser();
    
    switch (command) {
        case 'navigate': {
            await page.goto(params.url, { waitUntil: params.waitUntil || 'domcontentloaded', timeout: params.timeout || 30000 });
            return { success: true, url: page.url(), title: await page.title() };
        }
        
        case 'click': {
            const selector = params.selector;
            if (params.text) {
                // 通过文字定位（Playwright 的文字选择器）
                await page.getByText(params.text, { exact: params.exact || false }).click({ timeout: params.timeout || 10000 });
            } else {
                await page.click(selector, { timeout: params.timeout || 10000 });
            }
            return { success: true, action: 'clicked', selector };
        }
        
        case 'fill': {
            const selector = params.selector;
            const text = params.text;
            if (params.clear !== false) {
                await page.fill(selector, '', { timeout: params.timeout || 10000 });
            }
            await page.fill(selector, text, { timeout: params.timeout || 10000 });
            return { success: true, action: 'filled', selector, text };
        }
        
        case 'wait': {
            if (params.selector) {
                await page.waitForSelector(params.selector, { timeout: params.timeout || 30000 });
            } else if (params.ms) {
                await page.waitForTimeout(params.ms);
            } else if (params.url) {
                await page.waitForURL(params.url, { timeout: params.timeout || 30000 });
            }
            return { success: true, action: 'waited' };
        }
        
        case 'screenshot': {
            const path = params.path || `screenshot_${Date.now()}.png`;
            const options = { path, fullPage: params.fullPage || false };
            if (params.selector) {
                const element = await page.$(params.selector);
                if (element) {
                    await element.screenshot(options);
                } else {
                    await page.screenshot(options);
                }
            } else {
                await page.screenshot(options);
            }
            return { success: true, path };
        }
        
        case 'extract_text': {
            let text;
            if (params.selector) {
                text = await page.textContent(params.selector) || '';
            } else {
                text = await page.evaluate(() => document.body.innerText);
            }
            return { success: true, text };
        }
        
        case 'extract_table': {
            const selector = params.selector || 'table';
            const tableData = await page.evaluate((sel) => {
                const table = document.querySelector(sel);
                if (!table) return null;
                const rows = [];
                const headerRow = table.querySelector('thead tr, tr:first-child');
                const headers = headerRow ? Array.from(headerRow.querySelectorAll('th, td')).map(c => c.innerText.trim()) : [];
                const bodyRows = table.querySelectorAll('tbody tr, tr');
                for (const row of bodyRows) {
                    if (row === headerRow) continue;
                    const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
                    rows.push(cells);
                }
                return { headers, rows };
            }, selector);
            return { success: true, data: tableData };
        }
        
        case 'upload': {
            const input = await page.$(params.selector);
            if (input) {
                await input.setInputFiles(params.file_path);
            }
            return { success: true, action: 'uploaded', file: params.file_path };
        }
        
        case 'download': {
            const [download] = await Promise.all([
                page.waitForEvent('download'),
                params.click_selector ? page.click(params.click_selector) : Promise.resolve(),
            ]);
            const path = params.save_path || await download.suggestedFilename();
            await download.saveAs(path);
            return { success: true, path };
        }
        
        case 'select': {
            await page.selectOption(params.selector, params.value || params.label);
            return { success: true, action: 'selected' };
        }
        
        case 'scroll': {
            if (params.selector) {
                await page.$eval(params.selector, (el, dir) => {
                    el.scrollBy(0, dir === 'up' ? -500 : 500);
                }, params.direction || 'down');
            } else {
                await page.evaluate((dir) => {
                    window.scrollBy(0, dir === 'up' ? -500 : 500);
                }, params.direction || 'down');
            }
            return { success: true, action: 'scrolled' };
        }
        
        case 'eval': {
            const result = await page.evaluate(params.script);
            return { success: true, result };
        }
        
        case 'page_info': {
            return {
                success: true,
                url: page.url(),
                title: await page.title(),
            };
        }
        
        case 'close': {
            if (browser) {
                await browser.close();
                browser = null;
                page = null;
            }
            return { success: true, action: 'closed' };
        }
        
        default:
            return { success: false, error: `Unknown command: ${command}` };
    }
}

// Main entry
(async () => {
    try {
        const input = JSON.parse(process.argv[2] || '{}');
        const result = await handleCommand(input.command, input.params || {});
        console.log(JSON.stringify(result));
        
        // Auto-close after one-shot command
        if (input.command !== 'close' && browser) {
            // Keep browser open for session reuse in future implementation
            // For now, close to free resources
            // await browser.close();
        }
        process.exit(0);
    } catch (err) {
        console.log(JSON.stringify({ success: false, error: err.message }));
        process.exit(1);
    }
})();
