// ═══════════════════════════════════════════════════════════════
// 执行引擎 — 回放步骤流程 + 步骤高亮 + 执行 Toast
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const Executor = {
    running: false,
    currentStep: null,
    flow: null,
    results: [],

    async run(flow) {
      if (this.running) return;
      this.running = true;
      this.flow = flow;
      this.results = [];
      this._ensureExecHighlight();
      console.log('[Executor] Starting flow:', flow.name, `(${flow.steps.length} steps)`);

      await this._runSteps(flow.steps, {});

      this.running = false;
      this.currentStep = null;
      this._hideExecHighlight();
      const ok = this.results.filter(r => r.success).length;
      this._showExecToast(`✅ 完成: ${ok}/${this.results.length} 步成功`);
      setTimeout(() => this._hideExecToast(), 3000);
      chrome.runtime.sendMessage({ type: 'FLOW_DONE', success: ok, total: this.results.length }).catch(() => {});
    },

    /**
     * 执行步骤列表（支持 loop/loopEnd + 变量替换）
     * @param {Array} steps - 步骤列表
     * @param {Object} vars - 当前变量上下文 {loop_index, page_index, ...}
     */
    async _runSteps(steps, vars) {
      let i = 0;
      while (i < steps.length && this.running) {
        const step = steps[i];
        if (!step.enabled) { this.results.push({ stepId: step.id, success: true, skipped: true }); i++; continue; }

        // ─── 处理循环 ───
        if (step.type === 'loop') {
          const loopCount = step.params?.count || step.params?.loopCount || 10;
          // 找到匹配的 loopEnd
          let depth = 1, endIdx = i + 1;
          while (endIdx < steps.length && depth > 0) {
            if (steps[endIdx].type === 'loop') depth++;
            if (steps[endIdx].type === 'loopEnd') depth--;
            if (depth > 0) endIdx++;
          }
          const innerSteps = steps.slice(i + 1, endIdx);
          console.log(`[Executor] Loop: ${loopCount} iterations, ${innerSteps.length} inner steps`);

          for (let iter = 1; iter <= loopCount && this.running; iter++) {
            this._showExecToast(`🔁 循环 ${iter}/${loopCount}`);
            // 合并变量：内层循环可覆盖外层
            const loopVars = { ...vars, loop_index: iter, '循环次数': iter };
            await this._runSteps(innerSteps, loopVars);
          }
          i = endIdx + 1; // 跳到 loopEnd 之后
          continue;
        }

        if (step.type === 'loopEnd') { i++; continue; }

        // ─── 普通步骤：替换变量后执行 ───
        this.currentStep = step;
        const resolvedStep = this._resolveVars(step, vars);
        this._showExecToast(`▶ ${step.name} ${vars.loop_index ? `(迭代 ${vars.loop_index})` : ''}`);

        // ★ 通知 panel 当前执行到哪步 ★
        chrome.runtime.sendMessage({
          type: 'STEP_EXECUTING',
          stepId: step.id,
          stepName: step.name,
          stepType: step.type,
          loopIndex: vars.loop_index || null,
        }).catch(() => {});

        let lastResult = null;
        const maxRetry = step.retry || 1;
        for (let attempt = 0; attempt < maxRetry; attempt++) {
          lastResult = await this.executeStep(resolvedStep, i);
          if (lastResult.success) break;
          if (attempt < maxRetry - 1) await this.sleep(500);
        }

        this.results.push(lastResult);
        chrome.runtime.sendMessage({ type: 'STEP_RESULT', ...lastResult }).catch(() => {});

        if (!lastResult.success) {
          this._showExecToast(`❌ 失败: ${lastResult.error}`);
          break;
        }
        await this.sleep(200);
        i++;
      }
    },

    /**
     * 替换步骤中的变量：{{loop_index}}, {{循环次数}} 等
     */
    _resolveVars(step, vars) {
      if (!vars || Object.keys(vars).length === 0) return step;
      const resolved = JSON.parse(JSON.stringify(step)); // 深拷贝
      // 替换选择器
      if (resolved.target?.selectors) {
        resolved.target.selectors = resolved.target.selectors.map(sel => {
          for (const [k, v] of Object.entries(vars)) {
            sel = sel.replaceAll(`{{${k}}}`, String(v));
          }
          return sel;
        });
      }
      // 替换 params 中的字符串值
      if (resolved.params) {
        for (const [pk, pv] of Object.entries(resolved.params)) {
          if (typeof pv === 'string') {
            let val = pv;
            for (const [k, v] of Object.entries(vars)) {
              val = val.replaceAll(`{{${k}}}`, String(v));
            }
            resolved.params[pk] = val;
          }
        }
      }
      return resolved;
    },

    stop() { this.running = false; },

    async executeStep(step, index) {
      const startTime = Date.now();
      try {
        if (step.waitBefore) await this.handleWait(step.waitBefore, step.target, step.timeout);

        const noTarget = ['navigate','newTab','closeTab','switchTab','refresh','goBack','goForward','delay','waitPageLoad','screenshot','comment','breakLoop','jsAlert','confirmDialog','loop','loopEnd'];
        let el = null;
        if (!noTarget.includes(step.type) && step.target?.selectors?.length > 0) {
          // ★ 调试日志：元素查找 ★
          console.log(`[AutoFlow] 步骤 ${step.id} 查找元素...`);
          console.log(`[AutoFlow]   选择器:`, step.target.selectors);
          el = await this.findElement(step.target, step.timeout || 10000);
          if (!el) {
            console.error(`[AutoFlow] ❌ 找不到元素! 选择器: ${step.target.selectors.join(' | ')}`);
            return { stepId: step.id, success: false, error: `找不到元素: ${step.target.selectors[0]}`, duration: Date.now() - startTime };
          }
          // ★ 调试日志：元素信息 ★
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          console.log(`[AutoFlow] ✅ 找到元素:`, {
            tag: el.tagName,
            id: el.id,
            class: el.className?.toString?.()?.slice(0, 80),
            text: (el.textContent || '').trim().slice(0, 30),
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            display: cs.display,
            visibility: cs.visibility,
            pointerEvents: cs.pointerEvents,
            disabled: el.disabled,
            inIframe: window !== window.top,
          });
          this._highlightExecEl(el);
          await this.sleep(300);
        }

        await this.performAction(step, el);
        if (step.waitAfter) await this.handleWaitAfter(step.waitAfter, step.timeout);
        console.log(`[AutoFlow] ✅ 步骤 ${step.id} 完成 (${Date.now() - startTime}ms)`);
        return { stepId: step.id, success: true, duration: Date.now() - startTime };
      } catch (err) {
        console.error(`[AutoFlow] ❌ 步骤 ${step.id} 异常:`, err);
        return { stepId: step.id, success: false, error: err.message || String(err), duration: Date.now() - startTime };
      }
    },

    // ═══ 查找元素（智能等待 + MutationObserver + 指数退避）═══
    async findElement(target, timeout = 10000) {
      const deadline = Date.now() + timeout;
      let interval = 100; // 起始 100ms，指数退避到 500ms

      // 先用 MutationObserver 等待 DOM 变化
      const waitForMutation = () => new Promise(resolve => {
        const observer = new MutationObserver(() => { observer.disconnect(); resolve(); });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(() => { observer.disconnect(); resolve(); }, interval);
      });

      while (Date.now() < deadline) {
        for (const selector of target.selectors) {
          try {
            const el = this._queryBySelector(selector);
            if (el && this.isVisible(el)) return el;
          } catch (e) { /* skip invalid selector */ }
        }
        await waitForMutation();
        interval = Math.min(interval * 1.5, 500); // 指数退避
      }
      return null;
    },

    /** 统一选择器查询（CSS / XPath / :has-text） */
    _queryBySelector(selector) {
      if (selector.startsWith('//') || selector.startsWith('//*')) {
        const r = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return r.singleNodeValue;
      }
      if (selector.includes(':has-text(')) {
        const m = selector.match(/^(.+?):has-text\("(.+?)"\)$/);
        if (m) {
          for (const c of document.querySelectorAll(m[1])) {
            if (c.textContent?.includes(m[2])) return c;
          }
        }
        return null;
      }
      return document.querySelector(selector);
    },

    isVisible(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },

    /** 检查元素是否被遮挡（modal/弹层/cookie banner 等）*/
    _isOccluded(el) {
      try {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl) return false;
        return topEl !== el && !el.contains(topEl) && !topEl.closest('[id^="__autoflow"]');
      } catch { return false; }
    },

    /** 尝试关闭遮挡元素（常见弹窗/cookie banner）*/
    async _tryDismissOverlay(el) {
      const rect = el.getBoundingClientRect();
      const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!topEl || topEl === el || el.contains(topEl)) return;
      // 查找遮挡层中的关闭按钮
      const overlay = topEl.closest('[class*="modal"], [class*="overlay"], [class*="dialog"], [class*="popup"], [class*="banner"]') || topEl;
      const closeBtn = overlay.querySelector('[class*="close"], [aria-label*="close"], [aria-label*="关闭"], button[class*="dismiss"]');
      if (closeBtn) {
        console.log('[AutoFlow] 🚫 检测到遮挡层，尝试关闭');
        closeBtn.click();
        await this.sleep(500);
      }
    },

    // ═══ 执行动作 ═══
    async performAction(step, el) {
      const p = step.params || {};
      switch (step.type) {
        case 'click': {
          this.scrollToElement(el); await this.sleep(100);

          // ★ 遮挡检测：点击前检查元素是否被弹层覆盖 ★
          if (this._isOccluded(el)) {
            console.warn('[AutoFlow] ⚠️ 元素被遮挡，尝试关闭覆盖层...');
            await this._tryDismissOverlay(el);
            await this.sleep(300);
            // 二次检查
            if (this._isOccluded(el)) {
              console.warn('[AutoFlow] ⚠️ 元素仍被遮挡，尝试滚动后直接点击');
              el.scrollIntoView({ behavior: 'auto', block: 'center' });
              await this.sleep(200);
            }
          }

          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          console.log(`[AutoFlow] 📍 点击: (${Math.round(cx)}, ${Math.round(cy)})`, el.tagName, el.id || el.className?.toString?.()?.slice(0, 40));

          try { el.focus(); } catch(e) {}
          await this.sleep(50);

          // 完整鼠标 + Pointer 事件序列
          const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
          el.dispatchEvent(new PointerEvent('pointerover', { ...mouseOpts, pointerId: 1 }));
          el.dispatchEvent(new MouseEvent('mouseover', mouseOpts));
          el.dispatchEvent(new PointerEvent('pointerenter', { ...mouseOpts, pointerId: 1 }));
          el.dispatchEvent(new MouseEvent('mouseenter', mouseOpts));
          el.dispatchEvent(new PointerEvent('pointerdown', { ...mouseOpts, pointerId: 1 }));
          el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
          el.dispatchEvent(new PointerEvent('pointerup', { ...mouseOpts, pointerId: 1 }));
          el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
          el.dispatchEvent(new MouseEvent('click', mouseOpts));

          // 原生 el.click() 兜底
          await this.sleep(50);
          el.click();
          break;
        }
        case 'dblclick': {
          this.scrollToElement(el);
          const r2 = el.getBoundingClientRect();
          const opts2 = { bubbles: true, cancelable: true, view: window, clientX: r2.left + r2.width/2, clientY: r2.top + r2.height/2, detail: 2 };
          el.dispatchEvent(new MouseEvent('mousedown', opts2));
          el.dispatchEvent(new MouseEvent('mouseup', opts2));
          el.dispatchEvent(new MouseEvent('click', opts2));
          el.dispatchEvent(new MouseEvent('dblclick', opts2));
          break;
        }
        case 'rightClick': {
          this.scrollToElement(el);
          const r3 = el.getBoundingClientRect();
          const opts3 = { bubbles: true, cancelable: true, view: window, clientX: r3.left + r3.width/2, clientY: r3.top + r3.height/2, button: 2 };
          el.dispatchEvent(new MouseEvent('mousedown', opts3));
          el.dispatchEvent(new MouseEvent('contextmenu', opts3));
          el.dispatchEvent(new MouseEvent('mouseup', opts3));
          break;
        }
        case 'hover':
          this.scrollToElement(el);
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); break;
        case 'input':
          this.scrollToElement(el); el.focus();
          if (p.clearFirst !== false) this._setNativeValue(el, '');
          this._setNativeValue(el, p.value || '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true })); break;
        case 'pasteText': {
          this.scrollToElement(el); el.focus();
          const txt = p.text || '';
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.value = txt;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.isContentEditable) { document.execCommand('insertText', false, txt); }
          else { el.textContent = txt; }
          break;
        }
        case 'clearInput':
          el.focus(); this._setNativeValue(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true })); break;
        case 'typeText': {
          this.scrollToElement(el); el.focus();
          if (p.clearFirst !== false) this._setNativeValue(el, '');
          let accumulated = '';
          for (const ch of (p.value || '').split('')) {
            accumulated += ch;
            this._setNativeValue(el, accumulated);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await this.sleep(50 + Math.random() * 50);
          }
          el.dispatchEvent(new Event('change', { bubbles: true })); break;
        }
        case 'select':
          el.value = p.value || ''; el.dispatchEvent(new Event('change', { bubbles: true })); break;
        case 'check':
          el.checked = p.checked !== false; el.dispatchEvent(new Event('change', { bubbles: true })); break;
        case 'focus': el.focus(); break;
        case 'keypress':
          el.dispatchEvent(new KeyboardEvent('keydown', { key: p.key, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: p.key, bubbles: true }));
          if (p.key === 'Enter') el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
          break;
        case 'hotkey': {
          const parts = (p.hotkey || '').split('+').map(s => s.trim());
          const key = parts.pop();
          const opts = { key, bubbles: true, ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt'), metaKey: parts.includes('Meta') };
          (el || document.body).dispatchEvent(new KeyboardEvent('keydown', opts));
          (el || document.body).dispatchEvent(new KeyboardEvent('keyup', opts));
          break;
        }
        case 'scroll':
          if (p.isPage) window.scrollTo({ top: p.endPosition || 0, behavior: 'smooth' });
          else if (el) el.scrollTop = p.endPosition || 0;
          await this.sleep(500); break;
        case 'scrollBy': {
          const dist = (p.distance || 300) * (p.direction === 'up' ? -1 : 1);
          if (el) el.scrollBy({ top: dist, behavior: 'smooth' }); else window.scrollBy({ top: dist, behavior: 'smooth' });
          await this.sleep(500); break;
        }
        case 'scrollIntoView':
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); await this.sleep(500); } break;
        case 'navigate':
          if (p.url) { window.location.href = p.url; await this.sleep(2000); } break;
        case 'newTab':
          chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: p.url || 'about:blank' }); await this.sleep(1000); break;
        case 'refresh': location.reload(); await this.sleep(2000); break;
        case 'goBack': history.back(); await this.sleep(1000); break;
        case 'goForward': history.forward(); await this.sleep(1000); break;
        case 'delay': await this.sleep(p.ms || 1000); break;
        case 'waitPageLoad':
          await new Promise(r => { if (document.readyState === 'complete') r(); else window.addEventListener('load', r, { once: true }); }); break;
        case 'waitForElement':
          if (step.target?.selectors?.length > 0) { const f = await this.findElement(step.target, step.timeout || 10000); if (!f) throw new Error('等待元素超时'); } break;
        case 'waitDisappear':
          if (step.target?.selectors?.length > 0) {
            const dl = Date.now() + (step.timeout || 10000);
            while (Date.now() < dl) { const f = document.querySelector(step.target.selectors[0]); if (!f || !this.isVisible(f)) break; await this.sleep(200); }
          } break;
        case 'extract': case 'getText':
          if (el) console.log('[Executor] Extracted:', (el.textContent || '').slice(0, 100)); break;
        case 'getValue':
          if (el) console.log('[Executor] Value:', (el.value || '').slice(0, 100)); break;
        case 'extractAttribute':
          if (el && p.attrName) console.log(`[Executor] [${p.attrName}]:`, el.getAttribute(p.attrName)); break;
        case 'screenshot':
          console.log('[Executor] Screenshot requested'); break;
        case 'comment':
          console.log('[Executor] Comment:', p.comment || step.remark); break;
        case 'jsAlert': alert(p.message || step.name); break;
        case 'upload': if (el) el.click(); break;
        case 'loop': case 'loopEnd': /* handled by flow control */ break;
        default: console.warn(`[Executor] Unknown: ${step.type}`);
      }
    },

    async handleWait(cfg, target, timeout = 10000) {
      if (cfg.visible && target?.selectors?.length > 0) { const el = await this.findElement(target, cfg.timeout || timeout); if (!el) throw new Error('等待可见超时'); }
      if (cfg.delay) await this.sleep(cfg.delay);
    },

    async handleWaitAfter(cfg, timeout = 10000) {
      if (cfg.appear) { const dl = Date.now() + (cfg.timeout || timeout); while (Date.now() < dl) { if (document.querySelector(cfg.appear)) return; await this.sleep(200); } }
      if (cfg.disappear) { const dl = Date.now() + (cfg.timeout || timeout); while (Date.now() < dl) { if (!document.querySelector(cfg.disappear)) return; await this.sleep(200); } }
      if (cfg.delay) await this.sleep(cfg.delay);
    },

    // ═══ 执行高亮辅助 ═══
    _execHighlightEl: null,
    _execToastEl: null,

    _ensureExecHighlight() {
      let el = document.getElementById('__autoflow-exec-highlight');
      if (!el) {
        el = document.createElement('div');
        el.id = '__autoflow-exec-highlight';
        el.style.cssText = 'display:none;position:fixed;pointer-events:none;border:3px solid #50c878;background:rgba(80,200,120,0.1);border-radius:4px;z-index:2147483645;box-shadow:0 0 12px rgba(80,200,120,0.4);transition:all 0.15s ease-out;';
        document.documentElement.appendChild(el);
      }
      this._execHighlightEl = el;
      let toast = document.getElementById('__autoflow-exec-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = '__autoflow-exec-toast';
        toast.style.cssText = 'display:none;position:fixed;bottom:60px;left:50%;transform:translateX(-50%);padding:8px 20px;background:rgba(20,20,30,0.95);border:1px solid rgba(80,200,120,0.3);border-radius:8px;font-family:-apple-system,sans-serif;font-size:13px;color:#e0e0e8;white-space:nowrap;z-index:2147483647;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
        document.documentElement.appendChild(toast);
      }
      this._execToastEl = toast;
    },

    _highlightExecEl(el) {
      if (!el || !this._execHighlightEl) return;
      try { const r = el.getBoundingClientRect(); const h = this._execHighlightEl; h.style.left=(r.left-2)+'px'; h.style.top=(r.top-2)+'px'; h.style.width=(r.width+4)+'px'; h.style.height=(r.height+4)+'px'; h.style.display='block'; } catch(e){}
    },

    _hideExecHighlight() { if (this._execHighlightEl) this._execHighlightEl.style.display = 'none'; },

    _showExecToast(text) {
      this._ensureExecHighlight();
      if (this._execToastEl) { this._execToastEl.textContent = text; this._execToastEl.style.display = 'block'; }
    },

    _hideExecToast() { if (this._execToastEl) this._execToastEl.style.display = 'none'; },

    scrollToElement(el) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'auto', block: 'center' });
    },

    /**
     * ★ React/Vue 受控组件兼容：通过原生属性描述符设置 value ★
     * 直接 el.value = 'x' 对 React 受控输入无效，因为 React 内部
     * 通过 Object.defineProperty 拦截了 value setter。
     * 必须先调用原型链上的原生 setter，再手动触发 input 事件。
     */
    _setNativeValue(el, value) {
      // 尝试获取原生 setter
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  };

  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.Executor = Executor;
})();
