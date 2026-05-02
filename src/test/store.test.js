import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveProgress,
  loadProgress,
  saveSettings,
  loadSettings,
  saveRecentFile,
  loadRecentFiles,
  clearRecent,
  saveBookData,
  loadBookData,
  hasBookData,
  deleteBookData,
} from '../store.js';

describe('store.js — IndexedDB 持久化', () => {

  beforeEach(async () => {
    // 清理 IndexedDB（每次测试独立）
    const keys = await import('idb-keyval').then(m => m.keys());
    const { del } = await import('idb-keyval');
    for (const k of await keys) {
      await del(k);
    }
  });

  describe('阅读进度', () => {
    it('保存并读取进度', async () => {
      await saveProgress('test-book', { cfi: '/6/2[chap1]!4', percentage: 0.5 });
      const loaded = await loadProgress('test-book');
      expect(loaded).not.toBeNull();
      expect(loaded.cfi).toBe('/6/2[chap1]!4');
      expect(loaded.percentage).toBe(0.5);
      expect(loaded.lastRead).toBeTypeOf('number');
    });

    it('不存在的书返回 null', async () => {
      const loaded = await loadProgress('nonexistent');
      expect(loaded).toBeUndefined();
    });

    it('多次保存覆盖旧进度', async () => {
      await saveProgress('test-book', { cfi: '/6/1', percentage: 0.3 });
      await saveProgress('test-book', { cfi: '/6/5', percentage: 0.7 });
      const loaded = await loadProgress('test-book');
      expect(loaded.cfi).toBe('/6/5');
      expect(loaded.percentage).toBe(0.7);
    });
  });

  describe('书籍数据缓存', () => {
    it('保存并读取二进制数据', async () => {
      const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]).buffer;
      await saveBookData('test-book', data);
      const loaded = await loadBookData('test-book');
      // 在不同的 IndexedDB mock 实现中可能返回不同结构，检查内容即可
      expect(loaded).toBeTruthy();
      const view = new Uint8Array(loaded);
      expect(view[0]).toBe(0x50);
      expect(view[1]).toBe(0x4b);
    });

    it('hasBookData 检测是否存在', async () => {
      expect(await hasBookData('no-such-book')).toBe(false);
      await saveBookData('my-book', new ArrayBuffer(8));
      expect(await hasBookData('my-book')).toBe(true);
    });

    it('deleteBookData 删除数据', async () => {
      await saveBookData('temp', new ArrayBuffer(8));
      await deleteBookData('temp');
      expect(await hasBookData('temp')).toBe(false);
    });

    it('不存在的书返回 null', async () => {
      const data = await loadBookData('nonexistent');
      expect(data).toBeNull();
    });
  });

  describe('全局设置', () => {
    it('默认设置结构正确', async () => {
      const settings = await loadSettings();
      expect(settings).toEqual({ fontSize: 100, theme: 'day' });
    });

    it('保存并读取设置', async () => {
      await saveSettings({ fontSize: 150, theme: 'night' });
      const loaded = await loadSettings();
      expect(loaded.fontSize).toBe(150);
      expect(loaded.theme).toBe('night');
    });
  });

  describe('最近文件', () => {
    it('保存最近文件', async () => {
      const list = await saveRecentFile({ name: '测试书籍' });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('测试书籍');
      expect(list[0].lastOpened).toBeTypeOf('number');
    });

    it('重复文件去重，保留最新', async () => {
      await saveRecentFile({ name: 'book-a' });
      await saveRecentFile({ name: 'book-b' });
      await saveRecentFile({ name: 'book-a' });
      const list = await loadRecentFiles();
      expect(list).toHaveLength(2);
      // book-a 应该在第一个（最新）
      expect(list[0].name).toBe('book-a');
    });

    it('最多保留 20 个', async () => {
      for (let i = 0; i < 25; i++) {
        await saveRecentFile({ name: `book-${i}` });
      }
      const list = await loadRecentFiles();
      expect(list).toHaveLength(20);
    });

    it('清空最近文件', async () => {
      await saveRecentFile({ name: 'book-a' });
      await clearRecent();
      const list = await loadRecentFiles();
      expect(list).toHaveLength(0);
    });
  });
});
