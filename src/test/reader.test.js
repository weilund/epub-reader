import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadProgress } from '../store.js';
import {
  setCallbacks,
  loadBook,
  nextPage,
  prevPage,
  goTo,
  setFontSize,
  applyTheme,
  destroyReader,
  getCurrentCfi,
} from '../reader.js';

// ===== Mock epub.js =====
vi.mock('epubjs', () => {
  const mockRendition = {
    renderTo: vi.fn(),
    display: vi.fn().mockResolvedValue(undefined),
    next: vi.fn(),
    prev: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    themes: {
      register: vi.fn(),
      select: vi.fn(),
      fontSize: vi.fn(),
    },
  };

  const mockBook = {
    renderTo: vi.fn(() => mockRendition),
    loaded: {
      metadata: Promise.resolve({ title: '测试书籍', creator: '作者' }),
      navigation: Promise.resolve({ toc: [
        { label: '第一章', href: '/6/2[chap1]', subitems: [
          { label: '1.1 开端', href: '/6/2[chap1]!1' }
        ]},
        { label: '第二章', href: '/6/3[chap2]' }
      ]}),
    },
    destroy: vi.fn(),
    locations: { generate: vi.fn() },
    spine: {
      get: vi.fn(),
    },
  };

  const ePub = vi.fn(() => mockBook);
  ePub.mockBook = mockBook;
  ePub.mockRendition = mockRendition;
  return { default: ePub };
});

const epubjs = await import('epubjs');
const mockBook = epubjs.default.mockBook;
const mockRendition = epubjs.default.mockRendition;

describe('reader.js — 阅读器核心', () => {

  beforeEach(async () => {
    destroyReader();
    vi.clearAllMocks();
    // Clear IndexedDB for saveProgress verification tests
    const { keys, del } = await import('idb-keyval');
    for (const k of await keys()) await del(k);
  });

  describe('loadBook', () => {
    it('用 ArrayBuffer 加载书籍', async () => {
      const buffer = new ArrayBuffer(8);
      await loadBook(buffer, '测试书籍');
      expect(epubjs.default).toHaveBeenCalledWith(buffer);
    });

    it('触发 onTitle 回调', async () => {
      const onTitle = vi.fn();
      setCallbacks({ onTitle });
      await loadBook(new ArrayBuffer(8), '测试书籍');
      await vi.waitFor(() => {
        expect(onTitle).toHaveBeenCalledWith('测试书籍');
      });
    });

    it('触发 onTocReady 回调', async () => {
      const onTocReady = vi.fn();
      setCallbacks({ onTocReady });
      await loadBook(new ArrayBuffer(8), '测试书籍');
      await vi.waitFor(() => {
        expect(onTocReady).toHaveBeenCalled();
        const toc = onTocReady.mock.calls[0][0];
        expect(toc).toHaveLength(3);
        expect(toc[0].label).toBe('第一章');
        expect(toc[0].depth).toBe(0);
        expect(toc[1].label).toBe('1.1 开端');
        expect(toc[1].depth).toBe(1);
      });
    });

    it('注册 relocated 事件', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      expect(mockRendition.on).toHaveBeenCalledWith('relocated', expect.any(Function));
    });

    it('调用 rendition.display 显示内容', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      expect(mockRendition.display).toHaveBeenCalled();
    });

    it('传入 startCfi 时传到 rendition.display（断点续读核心路径）', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍', '/6/2[chap1]!4');
      expect(mockRendition.display).toHaveBeenCalledWith('/6/2[chap1]!4');
    });

    it('不传 startCfi 时 rendition.display 传 undefined', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      expect(mockRendition.display).toHaveBeenCalledWith(undefined);
    });

    it('loadBook 调用 destroyReader 清理旧实例（防止残留）', async () => {
      await loadBook(new ArrayBuffer(8), 'test-1');
      // 再次调用 loadBook 应该先销毁旧的
      mockBook.destroy.mockClear();
      await loadBook(new ArrayBuffer(8), 'test-2');
      expect(mockBook.destroy).toHaveBeenCalled();
    });

    it('loadBook → destroyReader → loadBook 循环不崩溃（对应返回→重开的场景）', async () => {
      await loadBook(new ArrayBuffer(8), '书籍A');
      destroyReader();
      await loadBook(new ArrayBuffer(8), '书籍B');
      destroyReader();
      await loadBook(new ArrayBuffer(8), '书籍C');
      // 验证最后一次的 rendition 能正常使用
      expect(mockRendition.display).toHaveBeenCalled();
    });
  });

  describe('销毁后引用已清空', () => {
    it('destroyReader 后 rendition 和 book 引用为 null', async () => {
      // 无法直接访问模块内部变量，但可以验证清理后操作不崩溃
      await loadBook(new ArrayBuffer(8), '测试书籍');
      destroyReader();
      expect(() => nextPage()).not.toThrow();
      expect(() => prevPage()).not.toThrow();
      expect(() => setFontSize(120)).not.toThrow();
      expect(() => applyTheme('night')).not.toThrow();
    });

    it('退出后 relocated 不再触发（防止 goBack 后回调残留）', async () => {
      const relocatedHandler = vi.fn();
      // 模拟 rendition.on 捕获 relocated 处理器
      let capturedHandler;
      mockRendition.on.mockImplementation((event, handler) => {
        if (event === 'relocated') capturedHandler = handler;
      });

      await loadBook(new ArrayBuffer(8), '测试书籍');
      destroyReader();

      // 手动触发 relocated（模拟 epub.js 残留回调）
      if (capturedHandler) capturedHandler({ start: { cfi: '/6/99', displayed: { page: 5, total: 10 }, href: 'chap5.xhtml' } });

      // off 应该被调用来移除 relocated
      expect(mockRendition.off).toHaveBeenCalledWith('relocated');
    });
  });

  describe('翻页操作', () => {
    it('nextPage 调用 rendition.next', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      nextPage();
      expect(mockRendition.next).toHaveBeenCalledTimes(1);
    });

    it('prevPage 调用 rendition.prev', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      prevPage();
      expect(mockRendition.prev).toHaveBeenCalledTimes(1);
    });

    it('未加载书籍时不崩溃', () => {
      expect(() => nextPage()).not.toThrow();
      expect(() => prevPage()).not.toThrow();
    });
  });

  describe('goTo', () => {
    it('CFI 格式直接跳转', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      await goTo('/6/2[chap1]!4');
      expect(mockRendition.display).toHaveBeenCalledWith('/6/2[chap1]!4');
    });

    it('非 CFI 用 spine 解析后跳转', async () => {
      mockRendition.display.mockClear();
      mockBook.spine.get = vi.fn().mockReturnValue({ cfi: '/6/2[chap1]' });
      await loadBook(new ArrayBuffer(8), '测试书籍');
      await goTo('chapter1.xhtml');
      expect(mockBook.spine.get).toHaveBeenCalledWith('chapter1.xhtml');
      expect(mockRendition.display).toHaveBeenCalledWith('/6/2[chap1]');
    });

    it('无效 target 不崩溃', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      await expect(goTo('')).resolves.not.toThrow();
      await expect(goTo(null)).resolves.not.toThrow();
      await expect(goTo(undefined)).resolves.not.toThrow();
    });

    it('未加载书籍时不崩溃', async () => {
      await expect(goTo('/6/1')).resolves.not.toThrow();
    });
  });

  describe('setFontSize', () => {
    it('设置字号百分比', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      setFontSize(150);
      expect(mockRendition.themes.fontSize).toHaveBeenCalledWith('150%');
    });

    it('快速切换字号不崩溃', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      expect(() => {
        setFontSize(80);
        setFontSize(200);
        setFontSize(100);
      }).not.toThrow();
    });

    it('未加载书籍时不崩溃', () => {
      expect(() => setFontSize(100)).not.toThrow();
    });
  });

  describe('applyTheme', () => {
    it('注册并选择主题', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      applyTheme('night');
      expect(mockRendition.themes.register).toHaveBeenCalledWith('night', expect.any(Object));
      expect(mockRendition.themes.select).toHaveBeenCalledWith('night');
    });

    it('快速切换多个主题不崩溃', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      expect(() => {
        applyTheme('day');
        applyTheme('night');
        applyTheme('sepia');
        applyTheme('night');
      }).not.toThrow();
    });

    it('未加载书籍时不崩溃', () => {
      expect(() => applyTheme('night')).not.toThrow();
    });
  });

  describe('destroyReader', () => {
    it('清理 rendition 和 book', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      destroyReader();
      expect(mockRendition.off).toHaveBeenCalledWith('relocated');
      expect(mockRendition.destroy).toHaveBeenCalled();
      expect(mockBook.destroy).toHaveBeenCalled();
    });

    it('即使销毁异常也能安全清理（对应 goBack 时 epub.js 状态异常的 bug）', () => {
      // 这次测试检验：即使没有加载过书籍，destroy 也不抛异常
      // 实际场景中 rendition.destroy 可能因状态异常而抛出
      expect(() => destroyReader()).not.toThrow();
    });

    it('多次调用 destroyReader 不崩溃', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      destroyReader();
      destroyReader();
      destroyReader();
      // 多次销毁后引用已清空，所有操作应该安全
      expect(() => nextPage()).not.toThrow();
      expect(() => destroyReader()).not.toThrow();
    });

    it('未初始化时不崩溃', () => {
      expect(() => destroyReader()).not.toThrow();
    });
  });

  describe('onChapter 回调', () => {
    it('翻页时通过 href 传出章节信息', async () => {
      const onChapter = vi.fn();
      setCallbacks({ onChapter });
      await loadBook(new ArrayBuffer(8), '测试书籍');

      // 手动触发 relocated 事件
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];
      relocatedHandler({
        start: { cfi: '/6/3[chap2]', displayed: { page: 1, total: 10 }, href: 'chapter2.xhtml' },
        end: {},
      });

      expect(onChapter).toHaveBeenCalledWith('chapter2.xhtml');
    });

    it('没有 href 时不触发 onChapter', async () => {
      const onChapter = vi.fn();
      setCallbacks({ onChapter });
      await loadBook(new ArrayBuffer(8), '测试书籍');

      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];
      relocatedHandler({
        start: { cfi: '/6/1', displayed: { page: 1, total: 10 } },
        end: {},
      });

      expect(onChapter).not.toHaveBeenCalled();
    });
  });

  // ===== setFontSize 位置恢复 (Bug 2 修复验证) =====
  describe('setFontSize — 位置恢复 (Bug 2)', () => {
    it('字号切换时用切换前的 lastLocationCfi 恢复位置', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');

      // 先触发 relocated 设置 lastLocationCfi
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];
      relocatedHandler({
        start: { cfi: '/6/3', displayed: { page: 1, total: 10 }, href: 'ch1.xhtml' },
        end: {},
      });

      mockRendition.display.mockClear(); // 清掉 loadBook 的调用记录
      setFontSize(150);

      expect(mockRendition.display).toHaveBeenCalledWith('/6/3');
    });

    it('最后位置为 null 时不调用 display 恢复', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      // 不触发 relocated → lastLocationCfi 为 null

      mockRendition.display.mockClear();
      setFontSize(150);

      // display 不应被 setFontSize 调用（仅 loadBook 一次）
      expect(mockRendition.display).not.toHaveBeenCalled();
    });

    it('字号切换期间 suppressAutoSave 阻止进度保存', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];

      // 先保存一个基准进度
      relocatedHandler({
        start: { cfi: '/6/3', displayed: { page: 1, total: 10 }, href: 'ch1.xhtml' },
        end: {},
      });
      const baseline = await loadProgress('测试书籍');
      expect(baseline.cfi).toBe('/6/3');

      // 让 display 返回可控 promise，模拟字号切换中的 pending 状态
      let displayResolve;
      mockRendition.display.mockImplementation(() => new Promise(r => { displayResolve = r; }));

      setFontSize(150);
      // suppressAutoSave 此时为 true

      // 字号切换期间触发 relocated → 应跳过保存
      relocatedHandler({
        start: { cfi: '/6/999', displayed: { page: 5, total: 10 }, href: 'ch5.xhtml' },
        end: {},
      });

      // 进度应仍为基准值，未被覆盖
      const after = await loadProgress('测试书籍');
      expect(after.cfi).toBe('/6/3');

      displayResolve?.();
      mockRendition.display.mockResolvedValue(undefined);
    });

    it('字号切换完成后恢复正常保存进度', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];

      let displayResolve;
      mockRendition.display.mockImplementation(() => new Promise(r => { displayResolve = r; }));

      relocatedHandler({
        start: { cfi: '/6/3', displayed: { page: 1, total: 10 }, href: 'ch1.xhtml' },
        end: {},
      });

      setFontSize(150);
      // 此时 suppressAutoSave = true

      // 完成字号切换（display promise resolved）
      await displayResolve();
      // 这时 suppressAutoSave 应恢复为 false
      mockRendition.display.mockResolvedValue(undefined);

      // 再次触发 relocated → 应正常保存
      relocatedHandler({
        start: { cfi: '/6/5', displayed: { page: 3, total: 10 }, href: 'ch3.xhtml' },
        end: {},
      });

      const saved = await loadProgress('测试书籍');
      expect(saved.cfi).toBe('/6/5');
    });
  });

  // ===== getCurrentCfi =====
  describe('getCurrentCfi', () => {
    it('未加载书籍时返回 null', () => {
      expect(getCurrentCfi()).toBeNull();
    });

    it('返回 lastLocationCfi 的当前值', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];
      relocatedHandler({
        start: { cfi: '/6/5', displayed: { page: 1, total: 10 }, href: 'ch1.xhtml' },
        end: {},
      });
      expect(getCurrentCfi()).toBe('/6/5');
    });

    it('多次 relocated 后返回最新 CFI', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];
      relocatedHandler({ start: { cfi: '/6/1', displayed: { page: 1, total: 5 } }, end: {} });
      relocatedHandler({ start: { cfi: '/6/2', displayed: { page: 2, total: 5 } }, end: {} });
      relocatedHandler({ start: { cfi: '/6/3', displayed: { page: 3, total: 5 } }, end: {} });
      expect(getCurrentCfi()).toBe('/6/3');
    });
  });

  // ===== relocated 事件 — suppressAutoSave 与进度保存 =====
  describe('relocated 事件 — suppressAutoSave 与进度保存', () => {
    it('正常翻页时自动保存进度到 IndexedDB', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];

      relocatedHandler({
        start: { cfi: '/6/3', displayed: { page: 1, total: 10 }, href: 'ch1.xhtml' },
        end: {},
      });

      const saved = await loadProgress('测试书籍');
      expect(saved.cfi).toBe('/6/3');
      expect(saved.percentage).toBe(0.1);
    });

    it('进度百分比从 displayed 计算', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];

      relocatedHandler({
        start: { cfi: '/6/3', displayed: { page: 2, total: 10 }, href: 'ch2.xhtml' },
        end: {},
      });

      const saved = await loadProgress('测试书籍');
      expect(saved.percentage).toBe(0.2);
    });

    it('suppressAutoSave 时跳过保存', async () => {
      await loadBook(new ArrayBuffer(8), '测试书籍');
      const relocatedHandler = mockRendition.on.mock.calls.find(c => c[0] === 'relocated')[1];

      // 设置基准进度
      relocatedHandler({
        start: { cfi: '/6/3', displayed: { page: 1, total: 10 }, href: 'ch1.xhtml' },
        end: {},
      });

      // 模拟字号切换中的 suppressAutoSave 状态
      let displayResolve;
      mockRendition.display.mockImplementation(() => new Promise(r => { displayResolve = r; }));

      // 手动设置 lastLocationCfi 并触发 setFontSize
      relocatedHandler({
        start: { cfi: '/6/4', displayed: { page: 2, total: 10 }, href: 'ch2.xhtml' },
        end: {},
      });
      setFontSize(150);

      // 此时 suppressAutoSave = true，再次触发 relocated
      relocatedHandler({
        start: { cfi: '/6/999', displayed: { page: 9, total: 10 }, href: 'ch9.xhtml' },
        end: {},
      });

      // suppressAutoSave 阻止了 /6/999，进度保持为 setFontSize 前的 /6/4
      const saved = await loadProgress('测试书籍');
      expect(saved.cfi).toBe('/6/4');

      displayResolve?.();
      mockRendition.display.mockResolvedValue(undefined);
    });
  });
});
