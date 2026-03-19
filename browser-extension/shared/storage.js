// ═══════════════════════════════════════════════════════════════
// 存储管理 — 流程 CRUD + 导入导出
// ═══════════════════════════════════════════════════════════════

const Storage = {
  /**
   * 获取所有流程
   */
  async listFlows() {
    const data = await chrome.storage.local.get('flows');
    return data.flows || [];
  },

  /**
   * 获取指定流程
   */
  async getFlow(flowId) {
    const flows = await this.listFlows();
    return flows.find(f => f.id === flowId) || null;
  },

  /**
   * 保存流程（新增或更新）
   */
  async saveFlow(flow) {
    const flows = await this.listFlows();
    const idx = flows.findIndex(f => f.id === flow.id);
    if (idx >= 0) {
      flows[idx] = flow;
    } else {
      flows.unshift(flow);
    }
    if (flows.length > 50) flows.length = 50;
    await chrome.storage.local.set({ flows });
  },

  /**
   * 删除流程
   */
  async deleteFlow(flowId) {
    let flows = await this.listFlows();
    flows = flows.filter(f => f.id !== flowId);
    await chrome.storage.local.set({ flows });
  },

  /**
   * 导出为 JSON 字符串
   */
  exportToJson(flow) {
    return JSON.stringify(flow, null, 2);
  },

  /**
   * 从 JSON 导入
   */
  parseFromJson(jsonStr) {
    try {
      const flow = JSON.parse(jsonStr);
      if (!flow.steps || !Array.isArray(flow.steps)) {
        throw new Error('Invalid flow: missing steps array');
      }
      flow.id = flow.id || `flow_${Date.now()}`;
      flow.importedAt = new Date().toISOString();
      return flow;
    } catch (e) {
      throw new Error(`JSON 解析失败: ${e.message}`);
    }
  },

  /**
   * 下载流程为文件
   */
  downloadFlow(flow) {
    const blob = new Blob([this.exportToJson(flow)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flow.name || 'flow'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// Export
if (typeof window !== 'undefined') {
  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.Storage = Storage;
}
