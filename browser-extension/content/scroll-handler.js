// ═══════════════════════════════════════════════════════════════
// 滚动语义化处理 — 合并连续滚动 + 容器识别 + 意图推断
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const ScrollHandler = {
    scrollTimer: null,
    scrollSession: null,
    lastScrollTarget: null,
    isActive: false,

    /**
     * 启动滚动监听
     */
    start() {
      if (this.isActive) return;
      this.isActive = true;
      window.addEventListener('scroll', this._onScroll, true);
      window.addEventListener('wheel', this._onWheel, { passive: true, capture: true });
      console.log('[ScrollHandler] Started');
    },

    /**
     * 停止滚动监听
     */
    stop() {
      this.isActive = false;
      this.flushScroll();
      window.removeEventListener('scroll', this._onScroll, true);
      window.removeEventListener('wheel', this._onWheel, true);
    },

    /**
     * scroll 事件处理
     */
    _onScroll(e) {
      const SH = window.__AutoFlow.ScrollHandler;
      if (!SH.isActive) return;
      if (!window.__AutoFlow.Recorder?.isRecording()) return;

      const target = e.target === document ? document.documentElement : e.target;
      const isPage = target === document.documentElement || target === document.body;

      // 初始化或续接滚动会话
      if (!SH.scrollSession) {
        SH.scrollSession = {
          container: isPage ? 'page' : null,
          containerEl: isPage ? null : target,
          startScrollTop: target.scrollTop,
          endScrollTop: target.scrollTop,
          startTime: Date.now(),
          isPage: isPage,
        };

        // 记录容器选择器
        if (!isPage) {
          SH.scrollSession.container = window.__AutoFlow.Locator.buildTarget(target);
        }
      }

      SH.scrollSession.endScrollTop = target.scrollTop;

      // Debounce 300ms — 连续滚动合并为一次
      clearTimeout(SH.scrollTimer);
      SH.scrollTimer = setTimeout(() => SH.flushScroll(), 300);
    },

    /**
     * wheel 事件处理（仅标记用户主动滚动）
     */
    _onWheel(e) {
      // wheel 仅作为"用户确实在滚动"的辅助判据，不直接生成步骤
      const SH = window.__AutoFlow.ScrollHandler;
      SH.lastScrollTarget = e.target;
    },

    /**
     * 提交滚动会话为步骤
     */
    flushScroll() {
      const session = this.scrollSession;
      if (!session) return;

      this.scrollSession = null;
      clearTimeout(this.scrollTimer);

      const delta = session.endScrollTop - session.startScrollTop;
      if (Math.abs(delta) < 30) return; // 忽略微小滚动

      // 检测滚动容器
      let containerInfo = null;
      if (!session.isPage && session.containerEl) {
        containerInfo = window.__AutoFlow.Locator.buildTarget(session.containerEl);
      }

      // 检测可能的惰性加载
      const hasLazyLoad = this._detectLazyLoad(session);

      const step = window.__AutoFlow.createStep(
        'scroll',
        session.isPage ? '页面滚动' : `容器内滚动`,
        containerInfo || { selectors: ['html'], text: '', tagName: 'HTML' },
        {
          direction: delta > 0 ? 'down' : 'up',
          distance: Math.abs(Math.round(delta)),
          startPosition: Math.round(session.startScrollTop),
          endPosition: Math.round(session.endScrollTop),
          isPage: session.isPage,
          hasLazyLoad: hasLazyLoad,
        }
      );

      step.meta.scrollContext = {
        duration: Date.now() - session.startTime,
        delta: Math.round(delta),
      };

      // 暂存（可能被 checkScrollUpgrade 升级）
      this._pendingScrollStep = step;
      this._pendingScrollTime = Date.now();

      // 600ms 后如果没被升级，则正式提交
      setTimeout(() => {
        if (this._pendingScrollStep === step) {
          this._pendingScrollStep = null;
          if (window.__AutoFlow.Recorder) {
            window.__AutoFlow.Recorder.addStep(step);
          }
        }
      }, 600);
    },

    /**
     * 检查是否应将滚动升级为 scrollIntoView
     * 由 recorder.js 的 click 处理调用
     */
    checkScrollUpgrade(clickedEl) {
      if (!this._pendingScrollStep) return;
      if (Date.now() - this._pendingScrollTime > 800) return;

      // 用户滚动后马上点击 → 滚动是为了让目标可见
      const target = window.__AutoFlow.Locator.buildTarget(clickedEl);
      const scrollStep = this._pendingScrollStep;

      // 升级为 scrollIntoView
      scrollStep.type = 'scrollIntoView';
      scrollStep.name = `滚动到 ${target.text || target.tagName}`;
      scrollStep.target = target;
      scrollStep.params = {
        behavior: 'smooth',
        block: 'center',
        originalScroll: scrollStep.params,
      };

      this._pendingScrollStep = null;

      // 提交升级后的步骤
      if (window.__AutoFlow.Recorder) {
        window.__AutoFlow.Recorder.addStep(scrollStep);
      }
    },

    /**
     * 检测惰性加载（DOM 变化）
     */
    _detectLazyLoad(session) {
      // 简单检测：如果滚动到接近底部，页面可能有 lazy load
      if (session.isPage) {
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;
        const remaining = scrollHeight - session.endScrollTop - clientHeight;
        return remaining < 200;
      }
      return false;
    },

    _pendingScrollStep: null,
    _pendingScrollTime: 0,
  };

  ScrollHandler._onScroll = ScrollHandler._onScroll.bind(ScrollHandler);
  ScrollHandler._onWheel = ScrollHandler._onWheel.bind(ScrollHandler);

  window.__AutoFlow = window.__AutoFlow || {};
  window.__AutoFlow.ScrollHandler = ScrollHandler;
})();
