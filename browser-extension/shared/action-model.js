// ═══════════════════════════════════════════════════════════════
// 统一动作模型 — 录制/编辑/执行共享数据结构
// 参考 Automa 步骤体系，覆盖"网页交互 + 浏览器控制 + 数据处理 + 流程控制"
// ═══════════════════════════════════════════════════════════════

/**
 * 支持的动作类型 — 6 大类 30+ 种
 */
const ACTION_TYPES = {
  // ── 页面交互类 ──
  CLICK: 'click',
  DBLCLICK: 'dblclick',
  RIGHT_CLICK: 'rightClick',
  HOVER: 'hover',
  INPUT: 'input',
  PASTE_TEXT: 'pasteText',
  CLEAR_INPUT: 'clearInput',
  SELECT: 'select',
  CHECK: 'check',
  FOCUS: 'focus',
  UPLOAD: 'upload',
  DRAG_DROP: 'dragDrop',

  // ── 按键类 ──
  KEYPRESS: 'keypress',
  HOTKEY: 'hotkey',
  TYPE_TEXT: 'typeText',

  // ── 滚动类 ──
  SCROLL: 'scroll',
  SCROLL_INTO_VIEW: 'scrollIntoView',
  SCROLL_BY: 'scrollBy',

  // ── 页面/浏览器控制类 ──
  NAVIGATE: 'navigate',
  NEW_TAB: 'newTab',
  CLOSE_TAB: 'closeTab',
  SWITCH_TAB: 'switchTab',
  REFRESH: 'refresh',
  GO_BACK: 'goBack',
  GO_FORWARD: 'goForward',
  SCREENSHOT: 'screenshot',

  // ── 等待类 ──
  WAIT_ELEMENT: 'waitForElement',
  WAIT_DISAPPEAR: 'waitDisappear',
  WAIT_TEXT: 'waitText',
  DELAY: 'delay',
  WAIT_PAGE_LOAD: 'waitPageLoad',

  // ── 数据提取类 ──
  EXTRACT: 'extract',
  EXTRACT_TABLE: 'extractTable',
  EXTRACT_ATTRIBUTE: 'extractAttribute',
  GET_TEXT: 'getText',
  GET_VALUE: 'getValue',

  // ── 流程控制类 ──
  CONDITION: 'condition',
  LOOP: 'loop',
  BREAK_LOOP: 'breakLoop',
  GROUP: 'group',
  COMMENT: 'comment',
  ALERT: 'jsAlert',
  CONFIRM_DIALOG: 'confirmDialog',
};

/**
 * 动作分类（供 UI 分组展示）
 */
const ACTION_CATEGORIES = {
  '🖱️ 页面交互': [
    'click', 'dblclick', 'rightClick', 'hover', 'input',
    'pasteText', 'clearInput', 'select', 'check', 'focus',
    'upload', 'dragDrop',
  ],
  '⌨️ 键盘操作': [
    'keypress', 'hotkey', 'typeText',
  ],
  '📜 滚动操作': [
    'scroll', 'scrollIntoView', 'scrollBy',
  ],
  '🌐 页面控制': [
    'navigate', 'newTab', 'closeTab', 'switchTab',
    'refresh', 'goBack', 'goForward', 'screenshot',
  ],
  '⏳ 等待': [
    'waitForElement', 'waitDisappear', 'waitText',
    'delay', 'waitPageLoad',
  ],
  '📥 数据提取': [
    'extract', 'extractTable', 'extractAttribute',
    'getText', 'getValue',
  ],
  '🔀 流程控制': [
    'condition', 'loop', 'breakLoop', 'group',
    'comment', 'jsAlert', 'confirmDialog',
  ],
};

/**
 * 动作类型的中文名
 */
const ACTION_NAMES = {
  // 页面交互
  click: '点击',
  dblclick: '双击',
  rightClick: '右键点击',
  hover: '悬停',
  input: '输入文本',
  pasteText: '粘贴文本',
  clearInput: '清空输入框',
  select: '下拉选择',
  check: '勾选/取消',
  focus: '聚焦元素',
  upload: '上传文件',
  dragDrop: '拖拽',
  // 键盘
  keypress: '按键',
  hotkey: '组合键',
  typeText: '逐字输入',
  // 滚动
  scroll: '滚动到位置',
  scrollIntoView: '滚动到元素',
  scrollBy: '滚动指定距离',
  // 页面控制
  navigate: '打开网址',
  newTab: '新建标签页',
  closeTab: '关闭标签页',
  switchTab: '切换标签页',
  refresh: '刷新页面',
  goBack: '返回上一页',
  goForward: '前进下一页',
  screenshot: '截图',
  // 等待
  waitForElement: '等待元素出现',
  waitDisappear: '等待元素消失',
  waitText: '等待文本出现',
  delay: '固定等待',
  waitPageLoad: '等待页面加载',
  // 数据提取
  extract: '提取文本',
  extractTable: '提取表格',
  extractAttribute: '提取属性',
  getText: '获取文本',
  getValue: '获取值',
  // 流程控制
  condition: '条件判断',
  loop: '循环',
  breakLoop: '跳出循环',
  group: '步骤分组',
  comment: '注释',
  jsAlert: '弹窗提示',
  confirmDialog: '确认对话框',
};

/**
 * 创建一个标准步骤对象
 */
function createStep(type, name, target, params = {}) {
  return {
    id: '',
    type: type,
    name: name || ACTION_NAMES[type] || `${type} 操作`,
    target: target || { selectors: [], text: '', tagName: '', frameIndex: null },
    params: params,
    waitBefore: { visible: true, timeout: 5000 },
    waitAfter: null,
    timeout: 10000,
    retry: 1,
    enabled: true,
    remark: '',
    meta: {
      recordedAt: new Date().toISOString(),
      pageUrl: typeof location !== 'undefined' ? location.href : '',
      scrollContext: null,
    },
  };
}

/**
 * 创建一个标准流程对象
 */
function createFlow(name, steps = []) {
  return {
    id: `flow_${Date.now()}`,
    name: name || '未命名流程',
    steps: steps,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    pageUrl: typeof location !== 'undefined' ? location.href : '',
    version: '1.0',
    variables: {},
  };
}

// Export for content scripts
if (typeof window !== 'undefined') {
  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.ACTION_TYPES = ACTION_TYPES;
  window.__AutoFlow.ACTION_NAMES = ACTION_NAMES;
  window.__AutoFlow.ACTION_CATEGORIES = ACTION_CATEGORIES;
  window.__AutoFlow.createStep = createStep;
  window.__AutoFlow.createFlow = createFlow;
}
