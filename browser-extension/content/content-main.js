// ═══════════════════════════════════════════════════════════════
// Content Script 入口 — 初始化所有模块 + 消息监听
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const AF = window.__AutoFlow = window.__AutoFlow || {};

  // 初始化高亮模块
  if (AF.Highlight) AF.Highlight.init();

  // 防止重复绑定消息监听器
  if (AF._listenersReady) return;
  AF._listenersReady = true;

  // ─── 元素选取模式 ──────────────────────────────────
  let pickMode = false;
  let pickHighlightEl = null;
  let pickTooltipEl = null;

  function startPick() {
    pickMode = true;
    document.addEventListener('mousemove', onPickMove, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onPickKey, true);
    showPickTooltip('🎯 点击选取元素 | 按住 Ctrl 精确选取 | Esc 取消');
    console.log('[Content] Pick mode ON');
  }

  function stopPick() {
    pickMode = false;
    document.removeEventListener('mousemove', onPickMove, true);
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('keydown', onPickKey, true);
    if (pickHighlightEl) { pickHighlightEl.remove(); pickHighlightEl = null; }
    if (pickTooltipEl) { pickTooltipEl.remove(); pickTooltipEl = null; }
    console.log('[Content] Pick mode OFF');
  }

  function isPluginEl(el) {
    if (!el) return false;
    const id = el.id || '';
    if (id.startsWith('__autoflow') || id.startsWith('__af-')) return true;
    try { return !!el.closest('[id^="__autoflow"]') || !!el.closest('[id^="__af-"]'); }
    catch(e) { return false; }
  }

  function onPickMove(e) {
    if (!pickMode) return;
    if (isPluginEl(e.target)) return;

    // ★ Ctrl 精确模式：不提升，直接选原始元素 ★
    const el = e.ctrlKey
      ? e.target
      : (AF.Locator?.liftToInteractive(e.target) || e.target);

    ensurePickHighlight();
    const rect = el.getBoundingClientRect();
    const h = pickHighlightEl;
    h.style.left = rect.left + 'px';
    h.style.top = rect.top + 'px';
    h.style.width = rect.width + 'px';
    h.style.height = rect.height + 'px';
    h.style.display = 'block';
    // 修改边框颜色表示模式
    h.style.borderColor = e.ctrlKey ? '#50c878' : '#ff6b6b';
    h.style.boxShadow = e.ctrlKey
      ? '0 0 0 2px rgba(80,200,120,0.4), 0 0 12px rgba(80,200,120,0.2)'
      : '0 0 0 2px rgba(255,107,107,0.4), 0 0 12px rgba(255,107,107,0.2)';

    // 更新提示
    const summary = AF.Locator?.summarize(el) || el.tagName;
    showPickTooltip(`${e.ctrlKey ? '🎯精确' : '🔍智能'} ${summary}`);
  }

  function onPickClick(e) {
    if (!pickMode) return;
    if (isPluginEl(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // ★ Ctrl 精确模式 ★
    const el = e.ctrlKey
      ? e.target
      : (AF.Locator?.liftToInteractive(e.target) || e.target);

    const target = AF.Locator.buildTarget(el);
    chrome.runtime.sendMessage({ type: 'ELEMENT_PICKED', target });
    stopPick();
  }

  function onPickKey(e) {
    if (!pickMode) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stopPick();
      chrome.runtime.sendMessage({ type: 'ELEMENT_PICK_CANCELLED' });
    }
  }

  function ensurePickHighlight() {
    if (pickHighlightEl) return;
    pickHighlightEl = document.createElement('div');
    pickHighlightEl.id = '__autoflow-pick-highlight';
    pickHighlightEl.style.cssText = 'position:fixed;pointer-events:none;border:3px solid #ff6b6b;background:rgba(255,107,107,0.08);border-radius:4px;z-index:2147483646;transition:all 0.06s ease-out;display:none;';
    document.documentElement.appendChild(pickHighlightEl);
  }

  function showPickTooltip(text) {
    if (!pickTooltipEl) {
      pickTooltipEl = document.createElement('div');
      pickTooltipEl.id = '__autoflow-pick-tooltip';
      pickTooltipEl.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);padding:6px 16px;background:rgba(12,12,18,0.95);border:1px solid rgba(255,107,107,0.3);border-radius:8px;font-family:-apple-system,sans-serif;font-size:12px;color:#e0e0e8;z-index:2147483647;pointer-events:none;white-space:nowrap;backdrop-filter:blur(8px);';
      document.documentElement.appendChild(pickTooltipEl);
    }
    pickTooltipEl.textContent = text;
    pickTooltipEl.style.display = 'block';
  }

  // ─── Alt+P 快捷键 ──────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault(); e.stopPropagation();
      const R = AF.Recorder;
      if (!R) return;
      if (R.active) {
        R.stop();
        chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
        const label = document.getElementById('__af-label');
        const dot = document.getElementById('__af-dot');
        if (label) label.textContent = '已暂停';
        if (dot) dot.style.background = '#ffb43a';
      } else {
        chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
        R.start();
        if (AF.ScrollHandler) AF.ScrollHandler.start();
        const label = document.getElementById('__af-label');
        const dot = document.getElementById('__af-dot');
        if (label) label.textContent = '录制中';
        if (dot) dot.style.background = '#ff4444';
      }
    }
  }, true);

  // ─── 监听 Background / Panel 消息 ─────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'RECORDING_STARTED':
        if (AF.Recorder) AF.Recorder.start();
        if (AF.ScrollHandler) AF.ScrollHandler.start();
        if (AF.Highlight) AF.Highlight.showRecording();
        sendResponse({ ok: true });
        break;

      case 'RECORDING_STOPPED':
        if (AF.Recorder) AF.Recorder.stop();
        if (AF.ScrollHandler) AF.ScrollHandler.stop();
        if (AF.Highlight) AF.Highlight.hideRecording();
        sendResponse({ ok: true });
        break;

      case 'EXECUTE_FLOW':
        if (AF.Executor && msg.flow) {
          AF.Executor.run(msg.flow);
        }
        sendResponse({ ok: true });
        break;

      case 'START_PICK':
        startPick();
        sendResponse({ ok: true });
        break;

      case 'CANCEL_PICK':
        stopPick();
        sendResponse({ ok: true });
        break;

      case 'GET_PAGE_CONTEXT':
        sendResponse({ url: location.href, title: document.title, readyState: document.readyState });
        break;

      default:
        sendResponse({ ok: false });
    }
    return false;
  });

  console.log('[Content] AutoFlow loaded:', location.href.slice(0, 60));
})();
