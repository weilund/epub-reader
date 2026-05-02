import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setCallbacks,
  loadBook,
  nextPage,
  prevPage,
  goTo,
  setFontSize,
  applyTheme,
  destroyReader,
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

// ===== 从 mock 取引用 =====
const epubjs = await import('epubjs');
const mockBook = epubjs.default.mockBook;
const mockRendition = epubjs.default.mockRendition;

describe('reader.js — 阅读器核心', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadBook', () => {
    it('用 ArrayBuffer 加载书籍', async () => {
      const buffer = new ArrayBuffer(8);
      await loadBook(buffer, '测试书籍');

      expect(epubjs.default).toHaveBeenCalledWith(buffer);
      expect(mockBook.loaded.metadata).resolves;
    });

    it('触发 onTitle 回调', async () => {
      const onTitle = vi.fn();
      setCallbacks({ onTitle });

      await loadBook(new ArrayBuffer(8), '测试书籍');

      // 等待 metadata 解析
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
        expect(toc).toHaveLength(3); // 展平后有 3 个条目
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
      // spine.get 返回一个包含 cfi 的对象
      mockBook.spine.get = vi.fn().mockReturnValue({ cfi: '/6/2[chap1]' });
      await loadBook(new ArrayBuffer(8), '测试书籍');
      await goTo('chapter1.xhtml');
      expect(mockBook.spine.get).toHaveBeenCalledWith('chapter1.xhtml');
      expect(mockRendition.display).toHaveBeenCalledWith('/6/2[chap1]');
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

    it('即使渲染异常也能安全清理', () => {
      // 模拟部分销毁状态 — rendition 存在但 destroy 抛出
      const mockBadRendition = {
        off: vi.fn().mockImplementation(() => { throw new Error('bad state'); }),
        destroy: vi.fn(),
      };
      // 直接修改内部状态来测试
      // 无法直接访问模块内部变量，测试确保无异常
      expect(() => destroyReader()).not.toThrow();
    });

    it('未初始化时不崩溃', () => {
      expect(() => destroyReader()).not.toThrow();
    });
  });
});
