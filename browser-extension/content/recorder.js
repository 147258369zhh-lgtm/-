// ═══════════════════════════════════════════════════════════════
// 录制引擎 — 事件监听 → 统一动作模型
// 关键原则：录制时绝对不阻断用户操作，只静默记录
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const Recorder = {
    active: false, inputTimer: null, lastInputEl: null, lastInputValue: '',

    start() {
      if (this.active) {
        console.log('[Recorder] Already active, skip');
        return;
      }
      this.active = true;
      this.bindEvents();
      console.log('[Recorder] ✅ Started, active =', this.active);
    },

    stop() {
      this.active = false;
      this.unbindEvents();
      this.flushInput();
      console.log('[Recorder] ⏹ Stopped');
    },

    isRecording() { return this.active; },

    bindEvents() {
      // 先解绑防止重复
      this.unbindEvents();
      document.addEventListener('click', this._onClick, true);
      document.addEventListener('dblclick', this._onDblClick, true);
      document.addEventListener('input', this._onInput, true);
      document.addEventListener('change', this._onChange, true);
      document.addEventListener('keydown', this._onKeyDown, true);
      console.log('[Recorder] 事件已绑定');
    },

    unbindEvents() {
      document.removeEventListener('click', this._onClick, true);
      document.removeEventListener('dblclick', this._onDblClick, true);
      document.removeEventListener('input', this._onInput, true);
      document.removeEventListener('change', this._onChange, true);
      document.removeEventListener('keydown', this._onKeyDown, true);
    },

    // ─── Click ────────────────────────────────────────
    _onClick(e) {
      const R = window.__AutoFlow?.Recorder;
      if (!R || !R.active) return;
      if (R._isPluginUI(e.target)) return;
      R.flushInput();

      const el = window.__AutoFlow.Locator?.liftToInteractive(e.target) || e.target;
      const target = window.__AutoFlow.Locator.buildTarget(el);
      const step = window.__AutoFlow.createStep('click', `点击 ${target.text || target.tagName}`, target);

      if (window.__AutoFlow.ScrollHandler) {
        window.__AutoFlow.ScrollHandler.checkScrollUpgrade(e.target);
      }

      console.log('[Recorder] 📍 Click captured:', el.tagName, (el.id || el.className?.toString?.()?.slice(0, 30)));
      R.addStep(step);
    },

    _onDblClick(e) {
      const R = window.__AutoFlow?.Recorder;
      if (!R || !R.active) return;
      if (R._isPluginUI(e.target)) return;
      const target = window.__AutoFlow.Locator.buildTarget(e.target);
      R.addStep(window.__AutoFlow.createStep('dblclick', `双击 ${target.text || target.tagName}`, target));
    },

    _onInput(e) {
      const R = window.__AutoFlow?.Recorder;
      if (!R || !R.active) return;
      if (R._isPluginUI(e.target)) return;
      const el = e.target;
      // 支持 INPUT/TEXTAREA + contentEditable 富文本编辑器
      if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
        R.lastInputEl = el;
        R.lastInputValue = el.value;
      } else if (el.isContentEditable) {
        R.lastInputEl = el;
        R.lastInputValue = el.textContent || el.innerText || '';
      } else {
        return;
      }
      clearTimeout(R.inputTimer);
      R.inputTimer = setTimeout(() => R.flushInput(), 500);
    },

    flushInput() {
      if (!this.lastInputEl || !this.lastInputValue) return;
      const target = window.__AutoFlow.Locator.buildTarget(this.lastInputEl);
      this.addStep(window.__AutoFlow.createStep('input', `输入 "${this.lastInputValue.slice(0, 20)}"`, target, { value: this.lastInputValue }));
      this.lastInputEl = null; this.lastInputValue = '';
      clearTimeout(this.inputTimer);
    },

    _onChange(e) {
      const R = window.__AutoFlow?.Recorder;
      if (!R || !R.active) return;
      if (R._isPluginUI(e.target)) return;
      const el = e.target;
      if (el.tagName === 'SELECT') {
        const target = window.__AutoFlow.Locator.buildTarget(el);
        const text = el.options[el.selectedIndex]?.text || el.value;
        R.addStep(window.__AutoFlow.createStep('select', `选择 "${text}"`, target, { value: el.value, text }));
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        const target = window.__AutoFlow.Locator.buildTarget(el);
        R.addStep(window.__AutoFlow.createStep('check', `${el.checked ? '勾选' : '取消'} ${target.text || el.name}`, target, { checked: el.checked }));
      }
    },

    _onKeyDown(e) {
      const R = window.__AutoFlow?.Recorder;
      if (!R || !R.active) return;
      if (R._isPluginUI(e.target)) return;
      if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
        if (e.key === 'Enter' || e.key === 'Tab') R.flushInput();
        const target = window.__AutoFlow.Locator.buildTarget(e.target);
        R.addStep(window.__AutoFlow.createStep('keypress', `按下 ${e.key}`, target, { key: e.key }));
      }
    },

    addStep(step) {
      // ★ 用 Promise 式 sendMessage + 错误处理 ★
      chrome.runtime.sendMessage({ type: 'ADD_STEP', step }).then(resp => {
        if (resp?.ok) {
          console.log(`[Recorder] ✅ Step #${resp.stepCount}:`, step.type, step.name);
          if (window.__AutoFlow.Highlight) {
            window.__AutoFlow.Highlight.showStepToast(step, resp.stepCount);
            window.__AutoFlow.Highlight.updateStepCount(resp.stepCount);
          }
        } else {
          console.warn('[Recorder] ⚠️ Step not accepted:', resp);
        }
      }).catch(err => {
        console.error('[Recorder] ❌ sendMessage failed:', err.message);
        // ★ 不因通信错误停止录制 ★
      });
    },

    _isPluginUI(el) {
      if (!el) return false;
      const id = el.id || '';
      if (id.startsWith('__autoflow') || id.startsWith('__af-')) return true;
      try { return !!el.closest('[id^="__autoflow"]') || !!el.closest('[id^="__af-"]'); } catch (e) { return false; }
    },
  };

  // ★ 不用 bind — 事件回调中用 window.__AutoFlow.Recorder 直接引用 ★
  // bind 可能导致引用断裂问题

  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.Recorder = Recorder;

  // ★ URL 导航录制：监听 History API + beforeunload ★
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    if (Recorder.active) {
      const target = { selectors: [], text: '', tagName: '' };
      const step = window.__AutoFlow.createStep('navigate', `导航到 ${location.href.slice(0, 50)}`, target, { url: location.href });
      Recorder.addStep(step);
    }
  };
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    if (Recorder.active) {
      const target = { selectors: [], text: '', tagName: '' };
      const step = window.__AutoFlow.createStep('navigate', `重定向到 ${location.href.slice(0, 50)}`, target, { url: location.href });
      Recorder.addStep(step);
    }
  };
})();
