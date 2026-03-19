// ═══════════════════════════════════════════════════════════════
// Popup 交互逻辑 — 录制控制 + 流程管理
// ═══════════════════════════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);

const btnRecord = $('#btnRecord');
const btnPause = $('#btnPause');
const btnStop = $('#btnStop');
const statusBadge = $('#statusBadge');
const stepCounter = $('#stepCounter');
const stepCount = $('#stepCount');
const flowList = $('#flowList');
const btnImport = $('#btnImport');
const btnOpenPanel = $('#btnOpenPanel');
const fileImport = $('#fileImport');

// ─── 初始化 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
  await refreshFlowList();
});

// ─── 刷新状态 ────────────────────────────────────────────────
async function refreshState() {
  const resp = await sendBg({ type: 'GET_STATE' });
  updateUI(resp.status, resp.stepCount);
}

function updateUI(status, count = 0) {
  if (status === 'recording') {
    statusBadge.textContent = '● 录制中';
    statusBadge.className = 'status-badge recording';
    btnRecord.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    stepCounter.style.display = 'flex';
    stepCount.textContent = count;
  } else if (status === 'paused') {
    statusBadge.textContent = '⏸ 暂停';
    statusBadge.className = 'status-badge paused';
    btnRecord.disabled = true;
    btnPause.textContent = '⏸ 继续';
    btnPause.disabled = false;
    btnStop.disabled = false;
    stepCounter.style.display = 'flex';
    stepCount.textContent = count;
  } else {
    statusBadge.textContent = '就绪';
    statusBadge.className = 'status-badge';
    btnRecord.disabled = false;
    btnPause.disabled = true;
    btnPause.textContent = '⏸ 暂停';
    btnStop.disabled = true;
    stepCounter.style.display = 'none';
  }
}

// ─── 录制控制 ────────────────────────────────────────────────
btnRecord.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await sendBg({ type: 'START_RECORDING', tabId: tab.id });
  updateUI('recording', 0);
  // 在当前标签页注入录制启动消息
  chrome.tabs.sendMessage(tab.id, { type: 'RECORDING_STARTED' });
});

btnPause.addEventListener('click', async () => {
  const resp = await sendBg({ type: 'GET_STATE' });
  if (resp.status === 'paused') {
    await sendBg({ type: 'RESUME_RECORDING' });
    updateUI('recording', resp.stepCount);
  } else {
    await sendBg({ type: 'PAUSE_RECORDING' });
    updateUI('paused', resp.stepCount);
  }
});

btnStop.addEventListener('click', async () => {
  const resp = await sendBg({ type: 'STOP_RECORDING' });
  updateUI('idle');
  await refreshFlowList();
});

// ─── 步骤计数实时更新 ──────────────────────────────────────
setInterval(async () => {
  const resp = await sendBg({ type: 'GET_STATE' });
  if (resp.status === 'recording' || resp.status === 'paused') {
    stepCount.textContent = resp.stepCount;
  }
}, 1000);

// ─── 流程列表 ────────────────────────────────────────────────
async function refreshFlowList() {
  const resp = await sendBg({ type: 'LIST_FLOWS' });
  const flows = resp.flows || [];

  if (flows.length === 0) {
    flowList.innerHTML = '<div class="empty-state">暂无保存的流程</div>';
    return;
  }

  flowList.innerHTML = flows.map(flow => `
    <div class="flow-item" data-id="${flow.id}">
      <div class="flow-info">
        <div class="flow-name">${escHtml(flow.name)}</div>
        <div class="flow-meta">${flow.steps.length} 步骤 · ${formatTime(flow.createdAt)}</div>
      </div>
      <div class="flow-actions">
        <button class="btn-icon-small" data-action="run" title="执行">▶</button>
        <button class="btn-icon-small" data-action="export" title="导出">📤</button>
        <button class="btn-icon-small" data-action="delete" title="删除">🗑</button>
      </div>
    </div>
  `).join('');

  // 事件委托
  flowList.querySelectorAll('.btn-icon-small').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const flowId = btn.closest('.flow-item').dataset.id;
      const action = btn.dataset.action;
      if (action === 'run') runFlow(flowId);
      else if (action === 'export') exportFlow(flowId);
      else if (action === 'delete') deleteFlow(flowId);
    });
  });
}

async function runFlow(flowId) {
  const resp = await sendBg({ type: 'GET_FLOW', flowId });
  if (!resp.flow) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await sendBg({ type: 'RUN_FLOW', tabId: tab.id, flow: resp.flow });
  window.close();
}

async function exportFlow(flowId) {
  const resp = await sendBg({ type: 'GET_FLOW', flowId });
  if (!resp.flow) return;
  const blob = new Blob([JSON.stringify(resp.flow, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${resp.flow.name || 'flow'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function deleteFlow(flowId) {
  if (!confirm('确定删除此流程？')) return;
  await sendBg({ type: 'DELETE_FLOW', flowId });
  await refreshFlowList();
}

// ─── 导入流程 ────────────────────────────────────────────────
btnImport.addEventListener('click', () => fileImport.click());
fileImport.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const flow = JSON.parse(text);
    await sendBg({ type: 'IMPORT_FLOW', flow });
    await refreshFlowList();
  } catch (err) {
    alert('导入失败：文件格式无效');
  }
  fileImport.value = '';
});

// ─── 打开 Side Panel ─────────────────────────────────────────
btnOpenPanel.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ─── 工具函数 ────────────────────────────────────────────────
function sendBg(msg) {
  return chrome.runtime.sendMessage(msg);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}
