// ═══════════════════════════════════════════════════════════════
// 页面高亮 + 浮动录制控制条 + Toast
// ★ 关键：不使用全屏 overlay 容器，高亮元素直接挂在 documentElement ★
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const Highlight = {
    highlightBox: null,
    controlBar: null,
    toastEl: null,
    tooltipEl: null,
    timerInterval: null,
    startTime: 0,
    _inited: false,
    _boundMouseMove: null,

    init() {
      if (this._inited) return;
      this._inited = true;
      this._ensureHighlightBox();
      this._ensureToast();
      this._ensureTooltip();
      console.log('[Highlight] Initialized');
    },

    // ─── DOM 元素：直接挂 documentElement，不用容器 ────────
    _ensureHighlightBox() {
      let el = document.getElementById('__autoflow-highlight-box');
      if (el) { this.highlightBox = el; return; }
      el = document.createElement('div');
      el.id = '__autoflow-highlight-box';
      el.style.cssText = 'display:none;position:fixed;pointer-events:none;border:2px solid #6c7bff;background:rgba(108,123,255,0.08);border-radius:3px;z-index:2147483641;box-shadow:0 0 0 1px rgba(108,123,255,0.3);transition:all 0.08s ease-out;';
      document.documentElement.appendChild(el);
      this.highlightBox = el;
    },

    _ensureToast() {
      let el = document.getElementById('__autoflow-toast');
      if (el) { this.toastEl = el; return; }
      el = document.createElement('div');
      el.id = '__autoflow-toast';
      el.style.cssText = 'display:none;position:fixed;bottom:70px;left:16px;align-items:center;gap:6px;padding:8px 14px;background:rgba(12,12,18,0.95);backdrop-filter:blur(12px);border:1px solid rgba(108,123,255,0.15);border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.3);z-index:2147483645;font-family:-apple-system,sans-serif;font-size:12px;color:#e0e0e8;pointer-events:none;';
      document.documentElement.appendChild(el);
      this.toastEl = el;
    },

    _ensureTooltip() {
      let el = document.getElementById('__autoflow-tooltip');
      if (el) { this.tooltipEl = el; return; }
      el = document.createElement('div');
      el.id = '__autoflow-tooltip';
      el.style.cssText = 'display:none;position:fixed;pointer-events:none;padding:3px 8px;background:rgba(20,20,30,0.95);border:1px solid rgba(108,123,255,0.3);border-radius:4px;font-family:Consolas,monospace;font-size:11px;color:#a8b4ff;white-space:nowrap;z-index:2147483642;max-width:280px;overflow:hidden;text-overflow:ellipsis;';
      document.documentElement.appendChild(el);
      this.tooltipEl = el;
    },

    // ═══ 浮动录制控制条 ═══════════════════════════════════
    _ensureControlBar() {
      let el = document.getElementById('__autoflow-control');
      if (el) { this.controlBar = el; this._bindControlEvents(); return; }
      el = document.createElement('div');
      el.id = '__autoflow-control';
      el.style.cssText = 'display:none;position:fixed;bottom:16px;left:16px;z-index:2147483645;pointer-events:auto;';
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(12,12,18,0.96);backdrop-filter:blur(16px);border:1px solid rgba(108,123,255,0.2);border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.5);font-family:-apple-system,sans-serif;font-size:12px;color:#ccc;">
          <span id="__af-dot" style="width:10px;height:10px;border-radius:50%;background:#ff4444;animation:__af-blink 1s infinite;flex-shrink:0;"></span>
          <span id="__af-label" style="color:#ff6b6b;font-weight:600;">录制中</span>
          <span id="__af-count" style="padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:11px;color:#8b9aff;">0 步</span>
          <span id="__af-timer" style="padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:11px;color:#8b9aff;">00:00</span>
          <button id="__af-pause" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#ddd;font-size:14px;cursor:pointer;pointer-events:auto;" title="暂停 (Alt+P)">⏸</button>
          <button id="__af-stop" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);border:1px solid rgba(255,60,60,0.3);border-radius:6px;color:#ff6b6b;font-size:14px;cursor:pointer;pointer-events:auto;" title="停止录制">⏹</button>
        </div>`;
      // 内联 keyframes
      if (!document.getElementById('__af-style')) {
        const s = document.createElement('style');
        s.id = '__af-style';
        s.textContent = '@keyframes __af-blink{0%,100%{opacity:1}50%{opacity:.3}}';
        document.head.appendChild(s);
      }
      document.documentElement.appendChild(el);
      this.controlBar = el;
      this._bindControlEvents();
    },

    _bindControlEvents() {
      const pause = document.getElementById('__af-pause');
      const stop = document.getElementById('__af-stop');
      if (!pause || !stop) return;
      // 用 cloneNode 防止重复绑定
      const p2 = pause.cloneNode(true); pause.replaceWith(p2);
      const s2 = stop.cloneNode(true); stop.replaceWith(s2);

      p2.addEventListener('click', (e) => {
        e.stopPropagation();
        const R = window.__AutoFlow?.Recorder;
        if (R && R.active) {
          chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
          R.stop();
          p2.textContent = '▶'; p2.title = '继续';
          const label = document.getElementById('__af-label');
          const dot = document.getElementById('__af-dot');
          if (label) label.textContent = '已暂停';
          if (dot) dot.style.background = '#ffb43a';
        } else {
          chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
          if (R) R.start();
          if (window.__AutoFlow?.ScrollHandler) window.__AutoFlow.ScrollHandler.start();
          p2.textContent = '⏸'; p2.title = '暂停';
          const label = document.getElementById('__af-label');
          const dot = document.getElementById('__af-dot');
          if (label) label.textContent = '录制中';
          if (dot) dot.style.background = '#ff4444';
        }
      });

      s2.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
        if (window.__AutoFlow?.Recorder) window.__AutoFlow.Recorder.stop();
        if (window.__AutoFlow?.ScrollHandler) window.__AutoFlow.ScrollHandler.stop();
        this.hideRecording();
      });
    },

    // ─── 录制状态 ──────────────────────────────────────────
    showRecording() {
      this._ensureHighlightBox();
      this._ensureToast();
      this._ensureTooltip();
      this._ensureControlBar();

      if (this.controlBar) this.controlBar.style.display = 'block';
      const label = document.getElementById('__af-label');
      const dot = document.getElementById('__af-dot');
      const pause = document.getElementById('__af-pause');
      if (label) label.textContent = '录制中';
      if (dot) dot.style.background = '#ff4444';
      if (pause) { pause.textContent = '⏸'; pause.title = '暂停 (Alt+P)'; }

      this.updateStepCount(0);

      this.startTime = Date.now();
      clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - this.startTime) / 1000);
        const el = document.getElementById('__af-timer');
        if (el) el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
      }, 1000);

      // ★ 鼠标高亮跟随 ★
      if (this._boundMouseMove) {
        document.removeEventListener('mousemove', this._boundMouseMove, true);
      }
      this._boundMouseMove = this._onMouseMove.bind(this);
      document.addEventListener('mousemove', this._boundMouseMove, true);
    },

    hideRecording() {
      if (this.controlBar) this.controlBar.style.display = 'none';
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      if (this._boundMouseMove) {
        document.removeEventListener('mousemove', this._boundMouseMove, true);
        this._boundMouseMove = null;
      }
      this.hideHighlight();
      if (this.toastEl) this.toastEl.style.display = 'none';
    },

    updateStepCount(count) {
      const el = document.getElementById('__af-count');
      if (el) el.textContent = `${count} 步`;
    },

    // ─── 元素高亮 ──────────────────────────────────────────
    highlightElement(el) {
      if (!el) return;
      this._ensureHighlightBox();
      if (!this.highlightBox) return;
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const box = this.highlightBox;
        box.style.display = 'block';
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';

        this._ensureTooltip();
        if (this.tooltipEl) {
          const summary = window.__AutoFlow?.Locator?.summarize(el) || el.tagName;
          this.tooltipEl.textContent = summary;
          this.tooltipEl.style.display = 'block';
          this.tooltipEl.style.left = rect.left + 'px';
          this.tooltipEl.style.top = Math.max(0, rect.top - 28) + 'px';
        }
      } catch (e) { /* 跨域 iframe 等 */ }
    },

    hideHighlight() {
      if (this.highlightBox) this.highlightBox.style.display = 'none';
      if (this.tooltipEl) this.tooltipEl.style.display = 'none';
    },

    _onMouseMove(e) {
      try {
        if (this._isPluginEl(e.target)) { this.hideHighlight(); return; }
        const target = window.__AutoFlow?.Locator?.liftToInteractive(e.target) || e.target;
        this.highlightElement(target);
      } catch (err) { /* 静默 */ }
    },

    // ─── Toast ────────────────────────────────────────────
    showStepToast(step, count) {
      this._ensureToast();
      if (!this.toastEl) return;
      const icon = {click:'👆',input:'⌨️',scroll:'📜',select:'📋',check:'☑️',keypress:'⌨️',delay:'⏱️'}[step.type] || '📌';
      this.toastEl.innerHTML = `<span>${icon}</span><span>${step.name}</span><span style="padding:1px 6px;background:rgba(108,123,255,0.15);border-radius:6px;font-size:10px;color:#8b9aff;font-weight:600;">#${count}</span>`;
      this.toastEl.style.display = 'flex';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { if (this.toastEl) this.toastEl.style.display = 'none'; }, 2000);
    },
    _toastTimer: null,

    _isPluginEl(el) {
      if (!el) return false;
      const id = el.id || '';
      if (id.startsWith('__autoflow-') || id.startsWith('__af-')) return true;
      try {
        return !!el.closest('[id^="__autoflow"]') || !!el.closest('[id^="__af-"]');
      } catch (e) { return false; }
    },
  };

  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.Highlight = Highlight;
})();
