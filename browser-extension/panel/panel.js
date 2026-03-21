// ═══ Side Panel — 录制+编辑+拖拽排序+循环块+保存+执行 ═══
const $ = s => document.querySelector(s);
let currentFlow = null, selectedStepIndex = -1, isPickingElement = false;
let recordingState = 'idle', recordTimer = null, recordStartTime = 0;
let dragSrcIndex = -1;

const TI = {
  click: '👆', dblclick: '👆', rightClick: '👆', hover: '🖱️', input: '⌨️', pasteText: '📋',
  clearInput: '🧹', select: '📋', check: '☑️', focus: '🎯', upload: '📎',
  keypress: '⌨️', hotkey: '⌨️', typeText: '⌨️',
  scroll: '📜', scrollIntoView: '🎯', scrollBy: '📜',
  navigate: '🔗', newTab: '📑', refresh: '🔄', goBack: '⬅️', goForward: '➡️', screenshot: '📷',
  delay: '⏱️', waitForElement: '⏳', waitDisappear: '⏳', waitPageLoad: '⏳',
  extract: '📥', extractTable: '📊', extractAttribute: '📥', getText: '📥', getValue: '📥',
  condition: '🔀', loop: '🔁', loopEnd: '🔚', group: '📁', comment: '💬', jsAlert: '⚠️',
};
const AN = {
  click: '点击', dblclick: '双击', rightClick: '右键', hover: '悬停', input: '输入文本',
  pasteText: '粘贴文本', clearInput: '清空', select: '下拉选择', check: '勾选', focus: '聚焦', upload: '上传',
  keypress: '按键', hotkey: '组合键', typeText: '逐字输入',
  scroll: '滚动到位置', scrollIntoView: '滚动到元素', scrollBy: '滚动距离',
  navigate: '打开网址', newTab: '新标签页', refresh: '刷新', goBack: '返回', goForward: '前进', screenshot: '截图',
  delay: '延时等待', waitForElement: '等待元素', waitDisappear: '等待消失', waitPageLoad: '等待加载',
  extract: '提取文本', extractTable: '提取表格', extractAttribute: '提取属性', getText: '取文本', getValue: '取值',
  condition: '条件判断', loop: '🔁 循环开始', loopEnd: '🔚 循环结束', group: '分组', comment: '注释', jsAlert: '弹窗',
};

document.addEventListener('DOMContentLoaded', () => {
  loadFlowList(); syncState(); setupStepListDelegation();

  // ★ 所有事件用 ?. 安全绑定 ★
  const bind = (id, evt, fn) => $(id)?.addEventListener(evt, fn);
  bind('#btnRecord', 'click', toggleRecord);
  bind('#btnPause', 'click', togglePause);
  bind('#flowSelect', 'change', onFlowSelect);
  bind('#btnRefresh', 'click', loadFlowList);
  bind('#btnRunFlow', 'click', onRunFlow);
  bind('#btnSaveFlow', 'click', onSaveFlow);
  bind('#btnExportFlow', 'click', onExportFlow);
  bind('#btnImportFlow', 'click', () => $('#fileImport')?.click());
  bind('#btnDeleteFlow', 'click', onDeleteFlow);
  bind('#btnNewFlow', 'click', onNewFlow);
  bind('#fileImport', 'change', onImport);
  bind('#btnCloseDetail', 'click', closeDetail);
  bind('#btnSaveStep', 'click', onSaveStep);
  bind('#btnCopyStep', 'click', onCopyStep);
  bind('#btnDeleteStep', 'click', onDeleteStep);
  bind('#btnInsertStep', 'click', () => insertNewStep('click', '新步骤'));
  bind('#btnAddDelay', 'click', () => insertNewStep('delay', '延时 1s', { ms: 1000 }));
  bind('#btnAddLoop', 'click', addLoopBlock);
  bind('#btnPickElement', 'click', onPickElement);
  bind('#detailType', 'change', onTypeChange);

  // ★ 接收来自 background 转发的消息 ★
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'ELEMENT_PICKED' && isPickingElement) {
      isPickingElement = false;
      const btn = $('#btnPickElement');
      if (btn) { btn.textContent = '🎯 从页面选取元素'; btn.classList.remove('picking'); }
      if (selectedStepIndex >= 0 && currentFlow) {
        currentFlow.steps[selectedStepIndex].target = msg.target;
        showDetail(selectedStepIndex);
      }
    }
    // ★ 执行进度高亮 ★
    if (msg.type === 'STEP_EXECUTING') {
      document.querySelectorAll('.step-item').forEach(el => el.classList.remove('step-running'));
      for (const item of document.querySelectorAll('.step-item')) {
        if (item.dataset.stepId === msg.stepId) {
          item.classList.add('step-running');
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          break;
        }
      }
    }
    if (msg.type === 'STEP_RESULT') {
      for (const item of document.querySelectorAll('.step-item')) {
        if (item.dataset.stepId === msg.stepId) {
          item.classList.remove('step-running');
          item.classList.add(msg.success ? 'step-ok' : 'step-fail');
          // 失败时显示错误原因
          if (!msg.success && msg.error) {
            const errEl = document.createElement('div');
            errEl.className = 'step-error';
            errEl.textContent = `❌ ${msg.error}`;
            item.appendChild(errEl);
          }
          break;
        }
      }
    }
    if (msg.type === 'FLOW_DONE') {
      // 显示结果 2 秒后清除
      const meta = $('#flowMeta');
      if (meta) meta.textContent = `✅ ${msg.success}/${msg.total} 步完成`;
      setTimeout(() => {
        document.querySelectorAll('.step-item').forEach(el => {
          el.classList.remove('step-running', 'step-ok', 'step-fail');
          el.querySelectorAll('.step-error').forEach(e => e.remove());
        });
      }, 3000);
    }
  });
  setInterval(pollSteps, 800);
});

// ═══ 录制控制 ═══
async function syncState() {
  try {
    const r = await sendBg({ type: 'GET_STATE' });
    if (r.status === 'recording') { recordingState = 'recording'; updateRecordUI(); }
    else if (r.status === 'paused') { recordingState = 'paused'; updateRecordUI(); }
  } catch (e) { /* 初次加载时可能失败 */ }
}

async function toggleRecord() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (recordingState === 'idle') {
    recordingState = 'recording'; recordStartTime = Date.now();
    await sendBg({ type: 'START_RECORDING', tabId: tab.id }); startTimer();
  } else {
    const r = await sendBg({ type: 'STOP_RECORDING' });
    recordingState = 'idle'; lastStepCount = 0; stopTimer();
    if (r.flow) {
      currentFlow = r.flow;
      loadFlowList();
      $('#flowInfo').style.display = 'block';
      $('#flowNameInput').value = currentFlow.name;
      $('#flowMeta').textContent = `${currentFlow.steps.length} 步骤`;
      renderSteps();
    }
  }
  updateRecordUI();
}

async function togglePause() {
  if (recordingState === 'recording') { recordingState = 'paused'; await sendBg({ type: 'PAUSE_RECORDING' }); }
  else if (recordingState === 'paused') { recordingState = 'recording'; await sendBg({ type: 'RESUME_RECORDING' }); }
  updateRecordUI();
}

function updateRecordUI() {
  const btn = $('#btnRecord'), pause = $('#btnPause'), label = $('#recordLabel');
  if (recordingState === 'recording') {
    btn.classList.add('recording'); label.textContent = '停止录制';
    pause.style.display = ''; pause.textContent = '⏸ 暂停';
  } else if (recordingState === 'paused') {
    btn.classList.add('recording'); label.textContent = '停止录制';
    pause.style.display = ''; pause.textContent = '▶ 继续';
  } else {
    btn.classList.remove('recording'); label.textContent = '开始录制';
    pause.style.display = 'none';
    $('#recordStepCount').textContent = '0 步'; $('#recordTimer').textContent = '00:00';
  }
}

function startTimer() {
  recordStartTime = Date.now();
  recordTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recordStartTime) / 1000);
    $('#recordTimer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}
function stopTimer() { clearInterval(recordTimer); }

let lastStepCount = 0;
async function pollSteps() {
  if (recordingState === 'idle') return;
  try {
    const st = await sendBg({ type: 'GET_STATE' });
    if (st.status === 'idle' && recordingState !== 'idle') {
      recordingState = 'idle'; lastStepCount = 0; stopTimer(); updateRecordUI(); return;
    }
    const c = st.stepCount || 0;
    $('#recordStepCount').textContent = `${c} 步`;
    if (c !== lastStepCount) {
      lastStepCount = c;
      const sr = await sendBg({ type: 'GET_STEPS' });
      const steps = sr.steps || [];
      if (!currentFlow || currentFlow.id !== '__recording__') {
        currentFlow = { id: '__recording__', name: st.flowName || '录制中...', steps, createdAt: new Date().toISOString() };
        $('#flowInfo').style.display = 'block'; $('#flowNameInput').value = currentFlow.name;
      } else { currentFlow.steps = steps; }
      $('#flowMeta').textContent = `${c} 步 · 录制中`;
      renderSteps();
      const list = $('#stepList'); list.scrollTop = list.scrollHeight;
    }
  } catch (e) { /* 轮询失败忽略 */ }
}

// ═══ 流程管理 ═══
async function loadFlowList() {
  try {
    const r = await sendBg({ type: 'LIST_FLOWS' });
    const sel = $('#flowSelect');
    const curId = currentFlow?.id;
    sel.innerHTML = '<option value="">-- 选择流程 --</option>';
    (r.flows || []).forEach(f => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = `${f.name} (${f.steps?.length || 0}步)`;
      sel.appendChild(o);
    });
    if (curId) sel.value = curId;
  } catch (e) { /* 首次加载可能失败，忽略 */ }
}

async function onFlowSelect() {
  const id = $('#flowSelect').value;
  if (!id) { currentFlow = null; renderSteps(); $('#flowInfo').style.display = 'none'; return; }
  const r = await sendBg({ type: 'GET_FLOW', flowId: id });
  currentFlow = r.flow;
  if (currentFlow) {
    $('#flowInfo').style.display = 'block';
    $('#flowNameInput').value = currentFlow.name;
    $('#flowMeta').textContent = `${currentFlow.steps.length} 步骤`;
    selectedStepIndex = -1;
    renderSteps();
  }
}

async function onDeleteFlow() {
  const id = $('#flowSelect').value;
  if (!id || !confirm('确定删除该流程？')) return;
  await sendBg({ type: 'DELETE_FLOW', flowId: id });
  currentFlow = null; $('#flowInfo').style.display = 'none';
  loadFlowList(); renderSteps();
}

async function onNewFlow() {
  const name = prompt('请输入流程名称：', `流程_${new Date().toLocaleTimeString('zh-CN')}`);
  if (!name) return;
  currentFlow = {
    id: `flow_${Date.now()}`,
    name,
    steps: [],
    createdAt: new Date().toISOString(),
    version: '1.0',
  };
  await saveFlow();
  await loadFlowList();
  $('#flowSelect').value = currentFlow.id;
  $('#flowInfo').style.display = 'block';
  $('#flowNameInput').value = currentFlow.name;
  $('#flowMeta').textContent = '0 步骤';
  selectedStepIndex = -1;
  renderSteps();
}

async function onImport(e) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const flow = JSON.parse(await f.text());
    flow.id = flow.id || `flow_${Date.now()}`;
    await sendBg({ type: 'IMPORT_FLOW', flow });
    loadFlowList();
  } catch (err) { alert('解析失败: ' + err.message); }
  e.target.value = '';
}

// ═══ 步骤渲染 — 循环块 + 拖拽排序 ═══
function renderSteps() {
  const list = $('#stepList');
  if (!currentFlow || !currentFlow.steps.length) {
    list.innerHTML = '<div class="empty-hint">暂无步骤，点击录制或手动添加</div>';
    return;
  }
  const depths = computeLoopDepths(currentFlow.steps);
  let html = '';
  for (let i = 0; i < currentFlow.steps.length; i++) {
    const s = currentFlow.steps[i];
    const depth = depths[i];
    const isLoop = s.type === 'loop';
    const isLoopEnd = s.type === 'loopEnd';
    const cls = [
      'step-item',
      !s.enabled ? 'disabled' : '',
      i === selectedStepIndex ? 'active' : '',
      isLoop ? 'loop-start' : '',
      isLoopEnd ? 'loop-end' : '',
      depth > 0 && !isLoop && !isLoopEnd ? 'in-loop' : '',
    ].filter(Boolean).join(' ');
    const indent = depth > 0 && !isLoop && !isLoopEnd ? `margin-left:${depth * 16}px;` : '';
    // ★ 显示选择器摘要 ★
    const selectorHint = s.target?.selectors?.[0] ? `<div class="step-selector">${esc(s.target.selectors[0]).slice(0, 40)}</div>` : '';
    html += `<div class="${cls}" data-i="${i}" data-step-id="${s.id}" draggable="true" style="${indent}">
      <span class="step-number">${i + 1}</span>
      <span class="step-icon">${TI[s.type] || '📌'}</span>
      <div class="step-info">
        <div class="step-name">${esc(s.name)}</div>
        <div class="step-type">${esc(AN[s.type] || s.type)}${s.type === 'delay' ? ' · ' + (s.params?.ms || 1000) + 'ms' : ''}${s.type === 'loop' ? ' · ' + (s.params?.count || 10) + '次' : ''}</div>
        ${selectorHint}
      </div>
      <button class="step-toggle" data-action="toggle">${s.enabled ? '👁' : '🚫'}</button>
    </div>`;
  }
  list.innerHTML = html;
  // ★ 事件通过委托处理（见 setupStepListDelegation），无需逐个绑定 ★
}

// ═══ 步骤列表事件委托 — 只绑定一次，适用于任意数量步骤 ═══
let _stepDelegationSetup = false;
function setupStepListDelegation() {
  if (_stepDelegationSetup) return;
  _stepDelegationSetup = true;
  const list = $('#stepList');
  if (!list) return;

  // click: 选中步骤 / 开关 enabled
  list.addEventListener('click', e => {
    const item = e.target.closest('.step-item');
    if (!item) return;
    if (e.target.closest('[data-action="toggle"]')) {
      const i = +item.dataset.i;
      currentFlow.steps[i].enabled = !currentFlow.steps[i].enabled;
      saveFlow(); renderSteps(); return;
    }
    selectedStepIndex = +item.dataset.i;
    renderSteps();
    showDetail(selectedStepIndex);
  });

  // dragstart
  list.addEventListener('dragstart', e => {
    const item = e.target.closest('.step-item');
    if (!item) return;
    dragSrcIndex = +item.dataset.i;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  // dragend
  list.addEventListener('dragend', e => {
    const item = e.target.closest('.step-item');
    if (item) item.classList.remove('dragging');
    list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  // dragover
  list.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.step-item');
    if (item) item.classList.add('drag-over');
  });

  // dragleave
  list.addEventListener('dragleave', e => {
    const item = e.target.closest('.step-item');
    if (item) item.classList.remove('drag-over');
  });

  // drop
  list.addEventListener('drop', e => {
    e.preventDefault();
    const item = e.target.closest('.step-item');
    if (!item) return;
    item.classList.remove('drag-over');
    const targetIdx = +item.dataset.i;
    if (dragSrcIndex < 0 || dragSrcIndex === targetIdx) return;
    const [moved] = currentFlow.steps.splice(dragSrcIndex, 1);
    currentFlow.steps.splice(targetIdx, 0, moved);
    currentFlow.steps.forEach((s, i) => s.id = `step_${String(i + 1).padStart(3, '0')}`);
    dragSrcIndex = -1;
    saveFlow(); renderSteps();
  });
}

function computeLoopDepths(steps) {
  const depths = new Array(steps.length).fill(0);
  let depth = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].type === 'loop') { depths[i] = depth; depth++; }
    else if (steps[i].type === 'loopEnd') { depth = Math.max(0, depth - 1); depths[i] = depth; }
    else { depths[i] = depth; }
  }
  return depths;
}

// ═══ 智能插入 — 考虑选中位置和循环上下文 ═══
function getInsertPosition() {
  if (!currentFlow) return 0;
  // 如果选中了某步，在其后面插入
  if (selectedStepIndex >= 0 && selectedStepIndex < currentFlow.steps.length) {
    return selectedStepIndex + 1;
  }
  // 如果有循环块，检查最后一个 loopEnd 之前的位置
  const steps = currentFlow.steps;
  if (steps.length > 0 && steps[steps.length - 1].type === 'loopEnd') {
    return steps.length - 1; // 在 loopEnd 之前
  }
  return steps.length; // 末尾
}

function insertNewStep(type, name, params = {}) {
  if (!currentFlow) return;
  const pos = getInsertPosition();
  const step = {
    id: `step_${String(currentFlow.steps.length + 1).padStart(3, '0')}`,
    type, name,
    target: { selectors: [], text: '', tagName: '' },
    params,
    waitBefore: null, waitAfter: null,
    timeout: 10000, retry: 1, enabled: true, remark: '',
    meta: { recordedAt: new Date().toISOString(), pageUrl: '' },
  };
  currentFlow.steps.splice(pos, 0, step);
  // 重编号
  currentFlow.steps.forEach((s, i) => s.id = `step_${String(i + 1).padStart(3, '0')}`);
  selectedStepIndex = pos;
  saveFlow(); renderSteps(); showDetail(pos);
}

function addLoopBlock() {
  if (!currentFlow) return;
  const pos = getInsertPosition();
  const n = currentFlow.steps.length;
  const loopStep = {
    id: `step_${String(n + 1).padStart(3, '0')}`,
    type: 'loop', name: '🔁 循环开始',
    target: { selectors: [] },
    params: { count: 10 }, timeout: 10000, retry: 1, enabled: true, remark: '',
    meta: { recordedAt: new Date().toISOString() },
  };
  const loopEndStep = {
    id: `step_${String(n + 2).padStart(3, '0')}`,
    type: 'loopEnd', name: '🔚 循环结束',
    target: { selectors: [] },
    params: {}, timeout: 10000, retry: 1, enabled: true, remark: '',
    meta: { recordedAt: new Date().toISOString() },
  };
  currentFlow.steps.splice(pos, 0, loopStep, loopEndStep);
  currentFlow.steps.forEach((s, i) => s.id = `step_${String(i + 1).padStart(3, '0')}`);
  selectedStepIndex = pos;
  saveFlow(); renderSteps();
}

// ═══ 步骤详情面板 ═══
function showDetail(i) {
  const s = currentFlow?.steps[i]; if (!s) return;
  $('#stepDetail').style.display = 'block';
  $('#detailTitle').textContent = `步骤 ${i + 1}`;
  $('#detailName').value = s.name;
  $('#detailType').value = s.type;
  $('#detailTimeout').value = s.timeout || 10000;
  $('#detailRetry').value = s.retry || 1;
  $('#detailRemark').value = s.remark || '';
  renderSelectors(s);
  renderDynamicParams(s);
}

function renderSelectors(s) {
  const sl = $('#selectorList'), sels = s.target?.selectors || [];
  if (!sels.length) { sl.innerHTML = '<div style="color:#555;font-size:11px">无选择器 — 点击下方按钮从页面选取</div>'; return; }
  sl.innerHTML = sels.map((sel, i) =>
    `<label class="selector-item"><input type="radio" name="selector" value="${i}" ${i === 0 ? 'checked' : ''}><span>${esc(sel)}</span></label>`
  ).join('');
}

function renderDynamicParams(s) {
  const c = $('#dynamicParams'), p = s.params || {};
  switch (s.type) {
    case 'input': case 'typeText':
      c.innerHTML = `<div class="param-group"><div class="param-title">输入参数</div><div class="param-row"><label>内容</label><textarea id="p_value">${esc(p.value || '')}</textarea></div><div class="param-hint">循环中可用 {{loop_index}}</div></div>`; break;
    case 'pasteText':
      c.innerHTML = `<div class="param-group"><div class="param-title">📋 粘贴文本</div><div class="param-row"><label>内容</label><textarea id="p_text" rows="3">${esc(p.text || '')}</textarea></div></div>`; break;
    case 'delay':
      c.innerHTML = `<div class="param-group"><div class="param-title">⏱ 延时</div><div class="param-row"><label>毫秒</label><input type="number" id="p_ms" min="100" step="100" value="${p.ms || 1000}"></div><div class="param-row"><label>快捷</label><select onchange="document.getElementById('p_ms').value=this.value"><option value="">自定义</option><option value="300">0.3秒</option><option value="500">0.5秒</option><option value="1000">1秒</option><option value="2000">2秒</option><option value="3000">3秒</option><option value="5000">5秒</option></select></div></div>`; break;
    case 'scrollBy':
      c.innerHTML = `<div class="param-group"><div class="param-title">📜 滚动</div><div class="param-row"><label>方向</label><select id="p_direction"><option value="down" ${p.direction !== 'up' ? 'selected' : ''}>下↓</option><option value="up" ${p.direction === 'up' ? 'selected' : ''}>上↑</option></select></div><div class="param-row"><label>距离px</label><input type="number" id="p_distance" value="${p.distance || 300}"></div></div>`; break;
    case 'scroll':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>位置px</label><input type="number" id="p_endPosition" value="${p.endPosition || 0}"></div></div>`; break;
    case 'navigate':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>URL</label><input type="text" id="p_url" value="${esc(p.url || '')}"></div></div>`; break;
    case 'keypress':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>按键</label><select id="p_key">${['Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(k => `<option value="${k}" ${p.key === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>`; break;
    case 'hotkey':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>组合键</label><input type="text" id="p_hotkey" placeholder="Ctrl+C" value="${esc(p.hotkey || '')}"></div></div>`; break;
    case 'select':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>值</label><input type="text" id="p_value" value="${esc(p.value || '')}"></div><div class="param-row"><label>文本</label><input type="text" id="p_text" value="${esc(p.text || '')}"></div></div>`; break;
    case 'loop':
      c.innerHTML = `<div class="param-group"><div class="param-title">🔁 循环参数</div><div class="param-row"><label>次数</label><input type="number" id="p_count" min="1" value="${p.count || 10}"></div><div class="param-hint" style="line-height:1.6">选择器中可用 <b style="color:#8b9aff">{{loop_index}}</b> 表示当前第几次（从1开始）。<br>例：<code style="color:#50c878;font-size:10px">tr:nth-child({{loop_index}})</code></div></div>`; break;
    case 'loopEnd':
      c.innerHTML = `<div class="param-group"><div class="param-title">🔚 循环结束标记</div><div class="param-hint">与上方最近的"循环开始"配对</div></div>`; break;
    case 'comment':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>备注</label><textarea id="p_comment">${esc(p.comment || '')}</textarea></div></div>`; break;
    case 'extract': case 'getText': case 'getValue':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>变量名</label><input type="text" id="p_varName" value="${esc(p.varName || '')}"></div></div>`; break;
    case 'check':
      c.innerHTML = `<div class="param-group"><div class="param-row"><label>状态</label><select id="p_checked"><option value="true" ${p.checked !== false ? 'selected' : ''}>勾选</option><option value="false" ${p.checked === false ? 'selected' : ''}>取消</option></select></div></div>`; break;
    case 'condition':
      c.innerHTML = `<div class="param-group"><div class="param-title">🔀 条件</div><div class="param-row"><label>类型</label><select id="p_condType"><option value="elementExists" ${p.condType === 'elementExists' ? 'selected' : ''}>元素存在</option><option value="textContains" ${p.condType === 'textContains' ? 'selected' : ''}>包含文本</option><option value="urlContains" ${p.condType === 'urlContains' ? 'selected' : ''}>URL包含</option></select></div><div class="param-row"><label>值</label><input type="text" id="p_condValue" value="${esc(p.condValue || '')}"></div></div>`; break;
    default: c.innerHTML = ''; break;
  }
}

function onTypeChange() {
  if (selectedStepIndex < 0 || !currentFlow) return;
  const s = currentFlow.steps[selectedStepIndex];
  s.type = $('#detailType').value;
  s.name = AN[s.type] || s.type;
  renderDynamicParams(s);
}

function collectParams(type) {
  const p = {}, g = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  switch (type) {
    case 'input': case 'typeText': p.value = g('p_value') || ''; break;
    case 'pasteText': p.text = g('p_text') || ''; break;
    case 'select': p.value = g('p_value') || ''; p.text = g('p_text') || ''; break;
    case 'keypress': p.key = g('p_key') || 'Enter'; break;
    case 'hotkey': p.hotkey = g('p_hotkey') || ''; break;
    case 'scroll': p.endPosition = parseInt(g('p_endPosition')) || 0; break;
    case 'scrollBy': p.direction = g('p_direction') || 'down'; p.distance = parseInt(g('p_distance')) || 300; break;
    case 'navigate': p.url = g('p_url') || ''; break;
    case 'delay': p.ms = parseInt(g('p_ms')) || 1000; break;
    case 'check': p.checked = g('p_checked') !== 'false'; break;
    case 'comment': p.comment = g('p_comment') || ''; break;
    case 'loop': p.count = parseInt(g('p_count')) || 10; break;
    case 'extract': case 'getText': case 'getValue': p.varName = g('p_varName') || ''; break;
    case 'condition': p.condType = g('p_condType') || 'elementExists'; p.condValue = g('p_condValue') || ''; break;
  }
  return p;
}

function closeDetail() { $('#stepDetail').style.display = 'none'; selectedStepIndex = -1; renderSteps(); }

function onSaveStep() {
  if (selectedStepIndex < 0 || !currentFlow) return;
  const s = currentFlow.steps[selectedStepIndex];
  s.name = $('#detailName').value;
  s.type = $('#detailType').value;
  s.timeout = parseInt($('#detailTimeout').value) || 10000;
  s.retry = parseInt($('#detailRetry').value) || 1;
  s.remark = $('#detailRemark').value;
  s.params = collectParams(s.type);
  const r = document.querySelector('input[name="selector"]:checked');
  if (r && s.target?.selectors) {
    const i = parseInt(r.value);
    if (i > 0) { const sel = s.target.selectors.splice(i, 1)[0]; s.target.selectors.unshift(sel); }
  }
  saveFlow(); renderSteps(); closeDetail();
}

function onCopyStep() {
  if (selectedStepIndex < 0 || !currentFlow) return;
  const copy = JSON.parse(JSON.stringify(currentFlow.steps[selectedStepIndex]));
  copy.id = `step_${String(currentFlow.steps.length + 1).padStart(3, '0')}`;
  copy.name += ' (副本)';
  currentFlow.steps.splice(selectedStepIndex + 1, 0, copy);
  saveFlow(); renderSteps();
}

function onDeleteStep() {
  if (selectedStepIndex < 0 || !currentFlow || !confirm('删除此步骤?')) return;
  currentFlow.steps.splice(selectedStepIndex, 1);
  currentFlow.steps.forEach((s, i) => s.id = `step_${String(i + 1).padStart(3, '0')}`);
  saveFlow(); closeDetail(); renderSteps();
}

async function onPickElement() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (isPickingElement) {
    isPickingElement = false;
    const btn = $('#btnPickElement');
    if (btn) { btn.textContent = '🎯 从页面选取元素'; btn.classList.remove('picking'); }
    sendBg({ type: 'CANCEL_PICK_IN_TAB', tabId: tab.id });
    return;
  }
  isPickingElement = true;
  const btn = $('#btnPickElement');
  if (btn) { btn.textContent = '🔴 选取中... (Ctrl精确)'; btn.classList.add('picking'); }
  sendBg({ type: 'START_PICK_IN_TAB', tabId: tab.id });
}

async function onRunFlow() {
  if (!currentFlow || !currentFlow.steps.length) return;
  // 清除之前的执行状态
  document.querySelectorAll('.step-item').forEach(el => {
    el.classList.remove('step-running', 'step-ok', 'step-fail');
    el.querySelectorAll('.step-error').forEach(e => e.remove());
  });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    $('#flowMeta').textContent = '⏳ 执行中...';
    await sendBg({ type: 'RUN_FLOW', tabId: tab.id, flow: currentFlow });
  }
}

async function onSaveFlow() {
  if (!currentFlow) return;
  const nameInput = $('#flowNameInput');
  if (nameInput?.value) currentFlow.name = nameInput.value;
  const btn = $('#btnSaveFlow');
  try {
    await saveFlow();
    await loadFlowList();
    if (btn) { btn.textContent = '✅ 已保存'; setTimeout(() => { btn.textContent = '💾 保存'; }, 1500); }
  } catch (e) {
    if (btn) { btn.textContent = '❌ 失败'; setTimeout(() => { btn.textContent = '💾 保存'; }, 1500); }
  }
}

function onExportFlow() {
  if (!currentFlow) return;
  const blob = new Blob([JSON.stringify(currentFlow, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${currentFlow.name || 'flow'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function saveFlow() {
  if (currentFlow) await sendBg({ type: 'IMPORT_FLOW', flow: currentFlow });
}

function sendBg(msg) { return chrome.runtime.sendMessage(msg); }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
