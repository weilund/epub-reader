import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ===== Mock 所有依赖（确保各测试间隔离） =====
vi.mock('../store.js', () => ({
  loadSettings: vi.fn(() => Promise.resolve({ fontSize: 100, theme: 'day' })),
  saveSettings: vi.fn(() => Promise.resolve()),
  loadProgress: vi.fn(() => Promise.resolve(null)),
  loadBookData: vi.fn(() => Promise.resolve(null)),
  loadServerUrl: vi.fn(() => Promise.resolve('')),
}));

vi.mock('../reader.js', () => ({
  loadBook: vi.fn(() => Promise.resolve()),
  nextPage: vi.fn(),
  prevPage: vi.fn(),
  goTo: vi.fn(),
  setFontSize: vi.fn(),
  applyTheme: vi.fn(),
  destroyReader: vi.fn(),
  setCallbacks: vi.fn(),
  getCurrentCfi: vi.fn(() => null),
}));

vi.mock('../file-manager.js', () => ({
  openFileViaInput: vi.fn(() => Promise.resolve({ name: 'test', arrayBuffer: new ArrayBuffer(8) })),
  openFromCache: vi.fn(() => Promise.resolve({ name: 'cached-book', arrayBuffer: new ArrayBuffer(8) })),
  getRecentFiles: vi.fn(() => Promise.resolve([])),
  getFileInputElement: vi.fn(() => document.getElementById('fileInput')),
}));

vi.mock('../theme.js', () => ({
  getCurrentTheme: vi.fn(() => 'day'),
  setTheme: vi.fn(),
  onThemeChange: vi.fn(() => () => {}),
}));

// ===== 构建完整 DOM（匹配 index.html） =====
function setupDOM() {
  document.body.innerHTML = `
    <div id="splash">
      <h1>EPUB Reader</h1>
      <p id="splashSubtitle">选择一本电子书开始阅读</p>
      <button id="openBtn" class="btn-primary">打开 EPUB 文件</button>
      <p id="loadingText" class="hidden loading-text">正在加载…</p>
      <div id="recentFiles" class="recent-files hidden">
        <h3>最近阅读</h3>
        <ul id="recentList"></ul>
      </div>
      <input type="file" id="fileInput" accept=".epub" hidden />
    </div>

    <div id="reader" class="hidden">
      <div id="topBar" class="top-bar hidden-bar">
        <button id="backBtn" class="bar-btn" aria-label="返回">←</button>
        <span id="bookTitle" class="book-title">书名</span>
        <button id="tocBtn" class="bar-btn" aria-label="目录">☰</button>
      </div>
      <div id="viewer"><div id="viewerContainer"></div></div>
      <div id="tapZones" class="tap-zones">
        <div id="prevZone" class="tap-zone prev-zone">‹</div>
        <div id="centerZone" class="tap-zone center-zone"></div>
        <div id="nextZone" class="tap-zone next-zone">›</div>
      </div>
      <div id="bottomBar" class="bottom-bar">
        <button id="prevBtn" class="nav-btn" aria-label="上一页">‹</button>
        <div class="progress-area">
          <span id="progressText">0%</span>
          <div class="progress-track"><div id="progressFill" class="progress-fill"></div></div>
        </div>
        <button id="settingsBtn" class="nav-btn" aria-label="设置">⚙</button>
        <button id="nextBtn" class="nav-btn" aria-label="下一页">›</button>
      </div>
      <div id="settingsPanel" class="settings-panel hidden">
        <div class="settings-sheet">
          <div class="settings-header">
            <span>设置</span>
            <button id="closeSettings" class="bar-btn">✕</button>
          </div>
          <div class="settings-body">
            <div class="setting-row">
              <label>字号</label>
              <div class="size-buttons">
                <button id="fontSizeDown" class="size-btn" aria-label="减小字号">A−</button>
                <span id="fontSizeDisplay" class="size-display">100%</span>
                <button id="fontSizeUp" class="size-btn" aria-label="增大字号">A+</button>
              </div>
            </div>
            <div class="setting-row">
              <label>主题</label>
              <div class="theme-options">
                <button id="themeDay" class="theme-btn active">☀ 白天</button>
                <button id="themeNight" class="theme-btn">☾ 夜间</button>
                <button id="themeSepia" class="theme-btn">📜 羊皮纸</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="tocPanel" class="toc-panel hidden">
        <div class="toc-sheet">
          <div class="toc-header">
            <span>目录</span>
            <div class="toc-header-actions">
              <button id="tocBtnSort" class="bar-btn" aria-label="排序"><span id="tocSortIcon">↓</span></button>
              <button id="closeToc" class="bar-btn">✕</button>
            </div>
          </div>
          <ul id="tocList" class="toc-list"></ul>
        </div>
        <div class="toc-overlay" id="tocOverlay"></div>
      </div>
    </div>
  `;
}

let storeMock, readerMock, fileManagerMock;

describe('main.js — 主界面交互', () => {
  beforeAll(async () => {
    setupDOM();
    // 导入一次 main.js，注册所有事件监听器
    await import('../main.js');
    storeMock = await import('../store.js');
    readerMock = await import('../reader.js');
    fileManagerMock = await import('../file-manager.js');
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // 恢复 mock 实现到默认值（防止之前测试的覆盖）
    storeMock.loadSettings.mockResolvedValue({ fontSize: 100, theme: 'day' });
    storeMock.saveSettings.mockResolvedValue();
    // 重置 DOM 状态到初始（不替换 innerHTML，保留元素引用）
    const splash = document.getElementById('splash');
    splash.classList.remove('hidden');
    splash.style.display = '';
    const reader = document.getElementById('reader');
    reader.classList.add('hidden');
    reader.style.display = 'none';
    document.getElementById('bookTitle').textContent = '书名';
    document.getElementById('progressText').textContent = '0%';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('fontSizeDisplay').textContent = '100%';
    document.getElementById('settingsPanel').classList.add('hidden');
    document.getElementById('tocPanel').classList.add('hidden');
    document.getElementById('splashSubtitle').classList.remove('hidden');
    document.getElementById('loadingText').classList.add('hidden');
    document.getElementById('openBtn').classList.remove('hidden');
    // 重置主题按钮
    document.getElementById('themeDay').classList.add('active');
    document.getElementById('themeNight').classList.remove('active');
    document.getElementById('themeSepia').classList.remove('active');
    // 工具栏
    document.getElementById('topBar').classList.add('hidden-bar');
    document.getElementById('bottomBar').classList.add('hidden-bar');
  });

  // ===== DOM 元素存在性 =====
  describe('DOM 元素存在性', () => {
    it('所有关键元素已渲染', () => {
      expect(document.getElementById('splash')).not.toBeNull();
      expect(document.getElementById('reader')).not.toBeNull();
      expect(document.getElementById('backBtn')).not.toBeNull();
      expect(document.getElementById('bookTitle')).not.toBeNull();
      expect(document.getElementById('viewerContainer')).not.toBeNull();
      expect(document.getElementById('fileInput')).not.toBeNull();
    });

    it('初始状态 splash 可见，reader 隐藏', () => {
      expect(document.getElementById('splash').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('reader').classList.contains('hidden')).toBe(true);
    });
  });

  // ===== 进入阅读器 =====
  describe('enterReader / 进入阅读器', () => {
    async function triggerFileOpen() {
      const fileInput = document.getElementById('fileInput');
      const file = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
      fileInput.dispatchEvent(new Event('change'));
      // 等待所有异步操作完成
      await vi.waitFor(() => {
        expect(readerMock.loadBook).toHaveBeenCalled();
      });
    }

    it('通过文件输入打开 EPUB 进入阅读器', async () => {
      await triggerFileOpen();
      expect(readerMock.loadBook).toHaveBeenCalled();
      expect(document.getElementById('reader').classList.contains('hidden')).toBe(false);
    });

    it('进入时加载设置和阅读进度', async () => {
      await triggerFileOpen();
      expect(storeMock.loadSettings).toHaveBeenCalled();
      expect(storeMock.loadProgress).toHaveBeenCalledWith('test');
    });

    it('先调 loadBook 再调 setFontSize (Bug 1 修复验证)', async () => {
      await triggerFileOpen();
      // setFontSize 必须在 loadBook 之后被调用
      const loadBookOrder = readerMock.loadBook.mock.invocationCallOrder[0];
      const setFontSizeOrder = readerMock.setFontSize.mock.invocationCallOrder[0];
      expect(loadBookOrder).toBeLessThan(setFontSizeOrder);
    });

    it('进入时设置字号显示', async () => {
      storeMock.loadSettings.mockResolvedValue({ fontSize: 150, theme: 'day' });
      await triggerFileOpen();
      expect(document.getElementById('fontSizeDisplay').textContent).toBe('150%');
    });

    it('进入时显示工具栏', async () => {
      await triggerFileOpen();
      expect(document.getElementById('topBar').classList.contains('hidden-bar')).toBe(false);
      expect(document.getElementById('bottomBar').classList.contains('hidden-bar')).toBe(false);
    });
  });

  // ===== 返回功能 (Bug 1 修复验证) =====
  describe('goBack / 返回功能', () => {
    async function enterAndGoBack() {
      // 先进入阅读器
      const fileInput = document.getElementById('fileInput');
      const file = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(readerMock.loadBook).toHaveBeenCalled());
      // 再返回
      document.getElementById('backBtn').click();
    }

    it('返回时保存当前字号和主题设置', async () => {
      await enterAndGoBack();
      expect(storeMock.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ fontSize: 100, theme: 'day' })
      );
    });

    it('返回时销毁阅读器', async () => {
      await enterAndGoBack();
      expect(readerMock.destroyReader).toHaveBeenCalled();
    });

    it('返回后隐藏阅读器，显示初始页面', async () => {
      await enterAndGoBack();
      expect(document.getElementById('reader').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('splash').classList.contains('hidden')).toBe(false);
    });

    it('返回后清空文件输入', async () => {
      await enterAndGoBack();
      expect(document.getElementById('fileInput').value).toBe('');
    });

    it('返回后刷新最近文件列表', async () => {
      await enterAndGoBack();
      expect(fileManagerMock.getRecentFiles).toHaveBeenCalled();
    });
  });

  // ===== 翻页操作 =====
  describe('翻页操作', () => {
    it('点击左侧区域翻到上一页', () => {
      document.getElementById('prevZone').click();
      expect(readerMock.prevPage).toHaveBeenCalled();
    });

    it('点击右侧区域翻到下一页', () => {
      document.getElementById('nextZone').click();
      expect(readerMock.nextPage).toHaveBeenCalled();
    });

    it('点击底部上一页按钮翻到上一页', () => {
      document.getElementById('prevBtn').click();
      expect(readerMock.prevPage).toHaveBeenCalled();
    });

    it('点击底部下一页按钮翻到下一页', () => {
      document.getElementById('nextBtn').click();
      expect(readerMock.nextPage).toHaveBeenCalled();
    });

    it('点击中间区域切换工具栏', () => {
      const topBar = document.getElementById('topBar');
      // barsVisible 内部状态可能受之前测试污染，用循环确保到「可见」状态
      for (let i = 0; i < 3; i++) {
        document.getElementById('centerZone').click();
        if (!topBar.classList.contains('hidden-bar')) break;
      }
      expect(topBar.classList.contains('hidden-bar')).toBe(false);
      // 点击隐藏
      document.getElementById('centerZone').click();
      expect(topBar.classList.contains('hidden-bar')).toBe(true);
      // 再次点击显示
      document.getElementById('centerZone').click();
      expect(topBar.classList.contains('hidden-bar')).toBe(false);
    });
  });

  // ===== 字体设置 =====
  describe('字体设置', () => {
    it('点击 A+ 增大字号', () => {
      document.getElementById('fontSizeDisplay').textContent = '100%';
      document.getElementById('fontSizeUp').click();
      expect(readerMock.setFontSize).toHaveBeenCalledWith(110);
      expect(document.getElementById('fontSizeDisplay').textContent).toBe('110%');
    });

    it('点击 A− 减小字号', () => {
      document.getElementById('fontSizeDisplay').textContent = '100%';
      document.getElementById('fontSizeDown').click();
      expect(readerMock.setFontSize).toHaveBeenCalledWith(90);
      expect(document.getElementById('fontSizeDisplay').textContent).toBe('90%');
    });

    it('字号按键立即保存设置', () => {
      document.getElementById('fontSizeDisplay').textContent = '100%';
      document.getElementById('fontSizeUp').click();
      expect(storeMock.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ fontSize: 110 })
      );
    });

    it('字号不超过最大 200', () => {
      document.getElementById('fontSizeDisplay').textContent = '200%';
      document.getElementById('fontSizeUp').click();
      expect(readerMock.setFontSize).toHaveBeenCalledWith(200);
    });

    it('字号不低于最小 80', () => {
      document.getElementById('fontSizeDisplay').textContent = '80%';
      document.getElementById('fontSizeDown').click();
      expect(readerMock.setFontSize).toHaveBeenCalledWith(80);
    });
  });

  // ===== 主题切换 =====
  describe('主题切换', () => {
    it('点击日间主题保存设置', () => {
      document.getElementById('themeDay').click();
      expect(storeMock.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'day' })
      );
    });

    it('点击夜间主题保存设置', () => {
      document.getElementById('themeNight').click();
      expect(storeMock.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'night' })
      );
    });

    it('点击羊皮纸主题保存设置', () => {
      document.getElementById('themeSepia').click();
      expect(storeMock.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'sepia' })
      );
    });
  });

  // ===== 目录面板 =====
  describe('目录面板', () => {
    it('点击目录按钮显示面板', () => {
      document.getElementById('tocBtn').click();
      expect(document.getElementById('tocPanel').classList.contains('hidden')).toBe(false);
    });

    it('点击关闭按钮隐藏面板', () => {
      document.getElementById('tocBtn').click();
      document.getElementById('closeToc').click();
      expect(document.getElementById('tocPanel').classList.contains('hidden')).toBe(true);
    });

    it('点击遮罩层隐藏面板', () => {
      document.getElementById('tocBtn').click();
      document.getElementById('tocOverlay').click();
      expect(document.getElementById('tocPanel').classList.contains('hidden')).toBe(true);
    });
  });

  // ===== 设置面板 =====
  describe('设置面板', () => {
    it('点击设置按钮显示面板', () => {
      document.getElementById('settingsBtn').click();
      expect(document.getElementById('settingsPanel').classList.contains('hidden')).toBe(false);
    });

    it('点击关闭按钮隐藏面板', () => {
      document.getElementById('settingsBtn').click();
      document.getElementById('closeSettings').click();
      expect(document.getElementById('settingsPanel').classList.contains('hidden')).toBe(true);
    });

    it('点击背景遮罩隐藏面板', () => {
      document.getElementById('settingsBtn').click();
      document.getElementById('settingsPanel').click();
      expect(document.getElementById('settingsPanel').classList.contains('hidden')).toBe(true);
    });
  });

  // ===== 音量键翻页 =====
  describe('音量键翻页', () => {
    it('音量上键翻到上一页', () => {
      // 让 reader 可见
      document.getElementById('reader').classList.remove('hidden');
      window.dispatchEvent(new Event('volumeup'));
      expect(readerMock.prevPage).toHaveBeenCalled();
    });

    it('音量下键翻到下一页', () => {
      document.getElementById('reader').classList.remove('hidden');
      window.dispatchEvent(new Event('volumedown'));
      expect(readerMock.nextPage).toHaveBeenCalled();
    });

    it('阅读器隐藏时音量键不翻页', () => {
      // reader 默认 hidden
      window.dispatchEvent(new Event('volumeup'));
      window.dispatchEvent(new Event('volumedown'));
      expect(readerMock.prevPage).not.toHaveBeenCalled();
      expect(readerMock.nextPage).not.toHaveBeenCalled();
    });
  });

  // ===== 系统返回键 (Capacitor) 由 @capacitor/app 独立测试 =====

  // ===== 进度更新 =====
  describe('进度更新', () => {
    it('翻页时进度文本和进度条更新', async () => {
      // 先触发进入阅读器以注册 onProgress 回调
      const fileInput = document.getElementById('fileInput');
      const file = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(readerMock.setCallbacks).toHaveBeenCalled());

      // 获取 onProgress 回调并手动触发
      const callbacksArg = readerMock.setCallbacks.mock.calls[0][0];
      callbacksArg.onProgress({ cfi: '/6/5', percentage: 0.5 });

      expect(document.getElementById('progressText').textContent).toBe('50%');
      expect(document.getElementById('progressFill').style.width).toBe('50%');
    });
  });

  // ===== Bug 1 集成验证 =====
  describe('Bug 1 集成验证', () => {
    it('进入阅读器 → 调整字号 → 退出，字号被保存', async () => {
      const fileInput = document.getElementById('fileInput');
      const file = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(readerMock.loadBook).toHaveBeenCalled());

      // 模拟用户点击字号按钮调节
      document.getElementById('fontSizeUp').click(); // 100 → 110
      document.getElementById('fontSizeUp').click(); // 110 → 120
      document.getElementById('fontSizeUp').click(); // 120 → 130

      vi.clearAllMocks();

      // 退出
      document.getElementById('backBtn').click();

      // goBack 中保存设置
      expect(storeMock.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ fontSize: 130 })
      );
    });
  });

  // ===== 初始化 / 自动恢复（需重新导入模块） =====
  describe('初始化 / 自动恢复', () => {
    let initReaderMock;

    beforeEach(async () => {
      // 为 init 测试设置 mocks
      vi.resetModules();
      const fm = await import('../file-manager.js');
      fm.getRecentFiles.mockResolvedValue([{ name: 'last-book', handle: null }]);
      const st = await import('../store.js');
      st.loadBookData.mockResolvedValue(new ArrayBuffer(8));
      st.loadSettings.mockResolvedValue({ fontSize: 100, theme: 'day' });
      st.loadProgress.mockResolvedValue(null);
      initReaderMock = await import('../reader.js');
    });

    it('有缓存时自动恢复阅读', async () => {
      await import('../main.js');

      await vi.waitFor(() => {
        expect(initReaderMock.loadBook).toHaveBeenCalled();
      });

      expect(initReaderMock.loadBook).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'last-book',
        null
      );
    });
  });
});
