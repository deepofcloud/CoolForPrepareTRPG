/* ==========================================================================
 * 共享模块 - 跨 iframe 通信桥 + 通用工具
 * 在 board.html 和 doc-editor.html 中都需要引入
 * ========================================================================== */

const SharedBridge = {
  _listeners: {},
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    window.addEventListener('message', (e) => this._handleMessage(e));
  },

  _handleMessage(e) {
    const data = e.data;
    if (!data || !data.type) return;
    const handlers = this._listeners[data.type];
    if (handlers) {
      handlers.forEach(fn => fn(data, e));
    }
  },

  on(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  },

  send(type, payload) {
    const msg = { type, ...payload };
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  },

  /* 判断是否运行在 iframe 中 */
  isInIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  },

  /* 生成 UUID */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /* HTML 转义 */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

/* 自动初始化 */
if (typeof window !== 'undefined') {
  SharedBridge.init();
}

/* ==========================================================================
 * iframe 中的 electronAPI 代理
 * 分屏模式下 iframe 无法直接访问 preload.js 暴露的 electronAPI，
 * 通过 postMessage 将 IPC 调用转发给父窗口（split-screen.html），
 * 由父窗口代为调用真实的 electronAPI 并返回结果。
 * ========================================================================== */
if (typeof window !== 'undefined' && SharedBridge.isInIframe() && !window.electronAPI) {
  const _ipcPending = {};
  let _ipcIdCounter = 0;

  // 监听父窗口返回的 IPC 响应
  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.type !== 'IPC_PROXY_RESPONSE') return;
    const pending = _ipcPending[data.requestId];
    if (!pending) return;
    delete _ipcPending[data.requestId];
    if (data.error) {
      pending.reject(new Error(data.error));
    } else {
      pending.resolve(data.result);
    }
  });

  // 创建代理对象，每个方法调用都转发给父窗口
  window.electronAPI = new Proxy({}, {
    get(_, method) {
      return function(...args) {
        return new Promise((resolve, reject) => {
          const requestId = 'ipc_' + (++_ipcIdCounter) + '_' + Date.now();
          _ipcPending[requestId] = { resolve, reject };
          // 超时兜底：30 秒未响应则 reject
          setTimeout(() => {
            if (_ipcPending[requestId]) {
              delete _ipcPending[requestId];
              reject(new Error('IPC proxy timeout: ' + method));
            }
          }, 30000);
          window.parent.postMessage({
            type: 'IPC_PROXY_REQUEST',
            requestId: requestId,
            method: method,
            args: args
          }, '*');
        });
      };
    }
  });
}
