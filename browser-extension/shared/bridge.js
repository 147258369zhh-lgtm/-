// ═══════════════════════════════════════════════════════════════
// 主软件协同接口 — 预留接口定义（第一阶段不实现实际通信）
//
// 本模块定义了插件与主软件(GO TONGX)之间的标准协同接口。
// 当前阶段这些接口只是占位，后续打通后将实现：
//   - 流程双向同步
//   - 变量传递
//   - 结果回传
//   - 页面数据提取请求
// ═══════════════════════════════════════════════════════════════

const Bridge = {
  connected: false,
  mainAppPort: null,

  /**
   * 尝试连接主软件
   * 后续通过 Native Messaging 或 WebSocket 实现
   */
  async connect() {
    console.log('[Bridge] 主软件连接接口（预留）');
    // TODO: 实现 Native Messaging 或 localhost WebSocket
    // chrome.runtime.connectNative('com.gotongx.bridge')
    // 或 new WebSocket('ws://localhost:PORT')
    this.connected = false;
    return false;
  },

  /**
   * 导出流程给主软件
   * @param {object} flow - 标准流程对象
   */
  async exportFlow(flow) {
    if (!this.connected) {
      console.log('[Bridge] exportFlow: 主软件未连接，使用本地存储');
      return { ok: false, reason: 'not_connected' };
    }
    // TODO: 发送 flow 到主软件
    return { ok: true };
  },

  /**
   * 从主软件导入流程
   * @param {string} flowId - 主软件中的流程 ID
   */
  async importFlow(flowId) {
    if (!this.connected) return { ok: false, reason: 'not_connected' };
    // TODO: 从主软件拉取 flow
    return { ok: false, reason: 'not_implemented' };
  },

  /**
   * 执行主软件下发的流程
   * @param {object} flow - 标准流程对象
   * @param {object} variables - 变量键值对
   */
  async runFlow(flow, variables = {}) {
    if (!flow) return { ok: false, reason: 'no_flow' };
    // 注入变量
    flow.variables = { ...(flow.variables || {}), ...variables };
    // 委托给 Executor
    if (window.__AutoFlow?.Executor) {
      window.__AutoFlow.Executor.run(flow);
      return { ok: true };
    }
    return { ok: false, reason: 'executor_not_ready' };
  },

  /**
   * 向主软件报告步骤执行结果
   * @param {object} stepResult
   */
  async reportStepResult(stepResult) {
    if (!this.connected) return;
    // TODO: 发送到主软件
    console.log('[Bridge] reportStepResult:', stepResult);
  },

  /**
   * 从当前网页提取结构化数据（主软件可请求）
   * @param {object} schema - 提取规则
   */
  async extractPageData(schema) {
    if (!schema) return { ok: false, reason: 'no_schema' };
    // TODO: 按 schema 提取页面数据
    const result = {};
    if (schema.fields) {
      for (const field of schema.fields) {
        try {
          const el = document.querySelector(field.selector);
          result[field.name] = el ? (el.textContent || el.value || '') : null;
        } catch (e) {
          result[field.name] = null;
        }
      }
    }
    return { ok: true, data: result };
  },

  /**
   * 获取当前页面上下文
   */
  getPageContext() {
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  },
};

// Export
if (typeof window !== 'undefined') {
  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.Bridge = Bridge;
}
