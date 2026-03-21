// ═══════════════════════════════════════════════════════════════
// 元素定位器 — 多候选选择器生成 + 可交互祖先提升
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const Locator = {
    /**
     * 为目标元素生成完整 target 对象（含多候选选择器）
     */
    buildTarget(el) {
      if (!el || !el.tagName) return { selectors: [], text: '', tagName: '', frameIndex: null };

      // 可交互祖先提升
      const target = this.liftToInteractive(el);

      return {
        selectors: this.generateSelectors(target),
        text: this.getVisibleText(target),
        tagName: target.tagName.toUpperCase(),
        frameIndex: null,
        rect: this.getRect(target),
        attributes: this.getKeyAttributes(target),
      };
    },

    /**
     * 将点击从子元素（icon/svg/span）提升到可交互祖先
     */
    liftToInteractive(el) {
      // 如果已经是交互元素，直接返回
      if (this.isInteractive(el)) return el;

      // 向上查找 5 层
      let parent = el.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        if (this.isInteractive(parent)) return parent;
        parent = parent.parentElement;
      }

      return el; // 兜底返回原始元素
    },

    /**
     * 判断元素是否为可交互元素
     */
    isInteractive(el) {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
      if (interactiveTags.includes(tag)) return true;

      const role = el.getAttribute('role');
      const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'textbox', 'option'];
      if (role && interactiveRoles.includes(role)) return true;

      // 有事件监听或样式暗示可点击
      if (el.onclick || el.getAttribute('onclick')) return true;
      const cursor = getComputedStyle(el).cursor;
      if (cursor === 'pointer') return true;

      return false;
    },

    /**
     * 生成多种候选选择器（按优先级排序）
     */
    generateSelectors(el) {
      const selectors = [];

      // 1. data-testid
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
      if (testId) selectors.push(`[data-testid="${testId}"]`);

      // 2. data-id
      const dataId = el.getAttribute('data-id');
      if (dataId) selectors.push(`[data-id="${dataId}"]`);

      // 3. id（排除动态 id）
      if (el.id && !this.isDynamicId(el.id)) {
        selectors.push(`#${CSS.escape(el.id)}`);
      }

      // 4. name
      const name = el.getAttribute('name');
      if (name) selectors.push(`${el.tagName.toLowerCase()}[name="${name}"]`);

      // 5. aria-label
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) selectors.push(`[aria-label="${ariaLabel}"]`);

      // 6. placeholder（输入框特有）
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) selectors.push(`${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`);

      // 7. title
      const title = el.getAttribute('title');
      if (title) selectors.push(`[title="${title}"]`);

      // 7. role + text 组合
      const role = el.getAttribute('role');
      const text = this.getVisibleText(el);
      if (role && text) {
        selectors.push(`[role="${role}"]:has-text("${text.slice(0, 30)}")`);
      }

      // 8. CSS 路径（语义化）
      const cssPath = this.buildCssPath(el);
      if (cssPath) selectors.push(cssPath);

      // 9. XPath
      const xpath = this.buildXPath(el);
      if (xpath) selectors.push(xpath);

      // 10. 文本锚点
      if (text && text.length > 0 && text.length < 50) {
        const tag = el.tagName.toLowerCase();
        selectors.push(`//${tag}[contains(text(),"${text.slice(0, 30)}")]`);
      }

      return selectors.slice(0, 6); // 最多 6 个
    },

    /**
     * 判断 id 是否为动态生成
     */
    isDynamicId(id) {
      if (/^[0-9a-f]{8,}$/i.test(id)) return true;
      if (/^\d{8,}$/.test(id)) return true;
      if (/^(react|ember|ng|vue|el)-/.test(id)) return true;
      if (/^:r[0-9a-z]+:$/.test(id)) return true;
      return false;
    },

    /**
     * 构建语义化 CSS 路径
     */
    buildCssPath(el, maxDepth = 4) {
      const parts = [];
      let current = el;
      let depth = 0;

      while (current && current !== document.body && depth < maxDepth) {
        let segment = current.tagName.toLowerCase();

        if (current.id && !this.isDynamicId(current.id)) {
          segment = `#${CSS.escape(current.id)}`;
          parts.unshift(segment);
          break;
        }

        // Add class names (filter out dynamic ones)
        const classes = [...current.classList]
          .filter(c => !this.isDynamicClass(c))
          .slice(0, 2);
        if (classes.length > 0) {
          segment += classes.map(c => `.${CSS.escape(c)}`).join('');
        }

        // nth-child for disambiguation
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(s => s.tagName === current.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            segment += `:nth-child(${idx})`;
          }
        }

        parts.unshift(segment);
        current = current.parentElement;
        depth++;
      }

      return parts.join(' > ');
    },

    /**
     * 判断 class 是否为动态生成
     */
    isDynamicClass(cls) {
      if (/[0-9a-f]{6,}/i.test(cls)) return true;
      if (/^css-/.test(cls)) return true;
      if (/^\w+__\w+--\w+$/.test(cls)) return false; // BEM is OK
      return false;
    },

    /**
     * 构建简洁 XPath
     */
    buildXPath(el) {
      const parts = [];
      let current = el;
      let depth = 0;

      while (current && current !== document.body && depth < 4) {
        let tag = current.tagName.toLowerCase();

        if (current.id && !this.isDynamicId(current.id)) {
          parts.unshift(`//*[@id="${current.id}"]`);
          return parts.join('');
        }

        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(s => s.tagName === current.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            tag += `[${idx}]`;
          }
        }

        parts.unshift(`/${tag}`);
        current = parent;
        depth++;
      }

      return '//' + parts.join('').replace(/^\/+/, '');
    },

    /**
     * 获取元素可见文本（截断）
     */
    getVisibleText(el) {
      if (!el) return '';
      // For inputs, get value or placeholder
      if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
        return el.value || el.placeholder || '';
      }
      // For select
      if (el.tagName === 'SELECT') {
        const opt = el.options[el.selectedIndex];
        return opt ? opt.textContent.trim() : '';
      }
      const text = el.innerText || el.textContent || '';
      return text.trim().slice(0, 60);
    },

    /**
     * 获取元素矩形（用于辅助诊断）
     */
    getRect(el) {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    },

    /**
     * 获取关键属性
     */
    getKeyAttributes(el) {
      const attrs = {};
      ['type', 'name', 'placeholder', 'href', 'src', 'value', 'role', 'aria-label'].forEach(a => {
        const v = el.getAttribute(a);
        if (v) attrs[a] = v.slice(0, 100);
      });
      return attrs;
    },

    /**
     * 生成元素摘要（展示用）
     */
    summarize(el) {
      if (!el) return '';
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(/\s+/).filter(c => c && !this.isDynamicClass(c)).slice(0, 2).join('.')
        : '';
      const text = this.getVisibleText(el);
      const textPart = text ? ` "${text.slice(0, 20)}"` : '';
      return `<${tag}${id}${cls}>${textPart}`;
    },
  };

  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.Locator = Locator;
})();
