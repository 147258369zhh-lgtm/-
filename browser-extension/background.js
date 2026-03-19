// ═══════════════════════════════════════════════════════════════
// Background Service Worker — 状态管理 + 消息路由 + 侧边栏控制
// ═══════════════════════════════════════════════════════════════

// ─── 录制状态 ──────────────────────────────────────────────────
let state = {
  status: 'idle', // 'idle' | 'recording' | 'paused'
  steps: [],
  currentTabId: null,
  startTime: null,
  flowName: '',
};

// ─── 点击图标 → 打开 Side Panel ──────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.log('[BG] sidePanel.open failed:', e);
    await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
  }
});

// ─── 需要转发给 panel 的消息类型 ─────────────────────────────
const FORWARD_TO_PANEL = [
  'ELEMENT_PICKED', 'ELEMENT_PICK_CANCELLED',
  'STEP_EXECUTING', 'STEP_RESULT', 'FLOW_DONE',
];

// ─── 消息路由 ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ★ 从 content script 来的进度消息 → 转发给 panel ★
  if (FORWARD_TO_PANEL.includes(msg.type)) {
    chrome.runtime.sendMessage(msg).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  const handler = messageHandlers[msg.type];
  if (handler) {
    const result = handler(msg, sender);
    if (result instanceof Promise) {
      result.then(r => sendResponse(r)).catch(e => sendResponse({ ok: false, error: e.message }));
      return true; // async
    }
    sendResponse(result);
  } else {
    console.warn('[BG] Unknown message:', msg.type);
    sendResponse({ ok: false, error: `Unknown: ${msg.type}` });
  }
  return false;
});

const messageHandlers = {
  // ── 录制控制 ──
  'START_RECORDING': (msg, sender) => {
    state.status = 'recording';
    state.steps = [];
    state.startTime = Date.now();
    state.currentTabId = sender.tab?.id || msg.tabId;
    state.flowName = msg.flowName || `录制_${new Date().toLocaleString('zh-CN')}`;
    console.log('[BG] Recording started:', state.flowName);
    if (state.currentTabId) {
      chrome.tabs.sendMessage(state.currentTabId, { type: 'RECORDING_STARTED' }).catch(e => {
        console.warn('[BG] RECORDING_STARTED failed:', e.message);
      });
    }
    return { ok: true, status: state.status };
  },

  'PAUSE_RECORDING': () => {
    state.status = 'paused';
    return { ok: true, status: state.status };
  },

  'RESUME_RECORDING': () => {
    state.status = 'recording';
    return { ok: true, status: state.status };
  },

  'STOP_RECORDING': () => {
    state.status = 'idle';
    const flow = {
      id: `flow_${Date.now()}`,
      name: state.flowName,
      steps: [...state.steps],
      createdAt: new Date(state.startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      version: '1.0',
    };
    console.log('[BG] Recording stopped:', flow.steps.length, 'steps');
    if (state.currentTabId) {
      chrome.tabs.sendMessage(state.currentTabId, { type: 'RECORDING_STOPPED' }).catch(() => {});
    }
    saveFlow(flow);
    state.steps = [];
    return { ok: true, flow };
  },

  // ── 步骤添加 ──
  'ADD_STEP': (msg, sender) => {
    if (state.status !== 'recording') return { ok: false, reason: 'Not recording' };
    const step = msg.step;
    step.id = `step_${String(state.steps.length + 1).padStart(3, '0')}`;
    if (sender.frameId && sender.frameId !== 0) {
      step.meta = step.meta || {};
      step.meta.frameId = sender.frameId;
      step.meta.frameUrl = sender.url || '';
    }
    state.steps.push(step);
    console.log('[BG] Step added:', step.type, step.name);
    return { ok: true, stepCount: state.steps.length };
  },

  // ── 状态查询 ──
  'GET_STATE': () => ({
    status: state.status,
    stepCount: state.steps.length,
    flowName: state.flowName,
  }),

  'GET_STEPS': () => ({ steps: [...state.steps] }),

  // ── 流程管理 ──
  'LIST_FLOWS': async () => {
    const data = await chrome.storage.local.get('flows');
    return { flows: data.flows || [] };
  },

  'GET_FLOW': async (msg) => {
    const data = await chrome.storage.local.get('flows');
    const flow = (data.flows || []).find(f => f.id === msg.flowId);
    return { flow: flow || null };
  },

  'DELETE_FLOW': async (msg) => {
    const data = await chrome.storage.local.get('flows');
    const flows = (data.flows || []).filter(f => f.id !== msg.flowId);
    await chrome.storage.local.set({ flows });
    return { ok: true };
  },

  'IMPORT_FLOW': async (msg) => {
    const flow = msg.flow;
    if (!flow || !flow.steps) return { ok: false, reason: 'Invalid flow' };
    flow.id = flow.id || `flow_${Date.now()}`;
    flow.updatedAt = new Date().toISOString();
    await saveFlow(flow);
    return { ok: true, flow };
  },

  // ── 执行控制 ──
  'RUN_FLOW': async (msg) => {
    const tabId = msg.tabId;
    const flow = msg.flow;
    if (!tabId || !flow) return { ok: false, reason: 'Missing tabId or flow' };
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_FLOW', flow });
    } catch (e) {
      return { ok: false, reason: e.message };
    }
    return { ok: true };
  },

  // ── 标签页操作 ──
  'OPEN_TAB': async (msg) => {
    const tab = await chrome.tabs.create({ url: msg.url || 'about:blank' });
    return { ok: true, tabId: tab.id };
  },

  // ── 元素选取 ──
  'START_PICK_IN_TAB': (msg) => {
    if (msg.tabId) {
      chrome.tabs.sendMessage(msg.tabId, { type: 'START_PICK' }).catch(e => {
        console.warn('[BG] START_PICK failed:', e.message);
      });
    }
    return { ok: true };
  },

  'CANCEL_PICK_IN_TAB': (msg) => {
    if (msg.tabId) {
      chrome.tabs.sendMessage(msg.tabId, { type: 'CANCEL_PICK' }).catch(() => {});
    }
    return { ok: true };
  },
};

// ─── 存储辅助 ──────────────────────────────────────────────────
async function saveFlow(flow) {
  const data = await chrome.storage.local.get('flows');
  const flows = data.flows || [];
  const idx = flows.findIndex(f => f.id === flow.id);
  if (idx >= 0) {
    flows[idx] = flow;
  } else {
    flows.unshift(flow);
  }
  if (flows.length > 50) flows.length = 50;
  await chrome.storage.local.set({ flows });
}

// ─── Side Panel 注册 ──────────────────────────────────────────
chrome.sidePanel?.setOptions?.({ enabled: true });
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

console.log('[BG] Service worker initialized');
