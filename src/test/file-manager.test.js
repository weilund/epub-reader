import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openFileViaInput,
  getCurrentFile,
  getRecentFiles,
  getFileInputElement,
  openFromCache,
} from '../file-manager.js';
import { hasBookData } from '../store.js';

describe('file-manager.js — 文件管理', () => {

  beforeEach(async () => {
    const { keys, del } = await import('idb-keyval');
    for (const k of await keys()) {
      await del(k);
    }
  });

  describe('openFileViaInput', () => {
    it('通过 File 对象打开 EPUB', async () => {
      const file = new File(['fake content'], '三体.epub', { type: 'application/epub+zip' });
      const result = await openFileViaInput(file);
      expect(result.name).toBe('三体');
      expect(result.handle).toBeNull();
      expect(result.arrayBuffer).toBeInstanceOf(ArrayBuffer);
    });

    it('打开后更新 currentFile', async () => {
      const file = new File(['x'], 'test.epub');
      await openFileViaInput(file);
      const current = getCurrentFile();
      expect(current).not.toBeNull();
      expect(current.name).toBe('test');
    });

    it('打开后自动缓存到 IndexedDB', async () => {
      const file = new File(['content'], 'cached-book.epub');
      await openFileViaInput(file);
      const hasCache = await hasBookData('cached-book');
      expect(hasCache).toBe(true);
    });

    it('打开后记录到最近文件', async () => {
      const file = new File(['x'], 'recent-test.epub');
      await openFileViaInput(file);
      const recent = await getRecentFiles();
      expect(recent.some((f) => f.name === 'recent-test')).toBe(true);
    });

    it('文件名含 .epub 时去掉扩展名', async () => {
      const file = new File(['x'], '我的书籍.epub');
      await openFileViaInput(file);
      expect(getCurrentFile().name).toBe('我的书籍');
    });

    it('文件名不含 .epub 时保持原名', async () => {
      // epub.js 也可以加载其他格式，保留原名
      const file = new File(['x'], 'not-an-epub', { type: 'application/epub+zip' });
      await openFileViaInput(file);
      expect(getCurrentFile().name).toBe('not-an-epub');
    });
  });

  describe('openFromCache', () => {
    it('从缓存恢复书籍数据', async () => {
      const buffer = new ArrayBuffer(16);
      const result = await openFromCache('cached-book', buffer);
      expect(result.name).toBe('cached-book');
      expect(result.arrayBuffer).toBe(buffer);
    });

    it('恢复后更新 currentFile', async () => {
      const buffer = new ArrayBuffer(16);
      await openFromCache('another-book', buffer);
      expect(getCurrentFile().name).toBe('another-book');
    });
  });

  describe('getRecentFiles', () => {
    it('无最近文件返回空数组', async () => {
      const recent = await getRecentFiles();
      expect(recent).toEqual([]);
    });

    it('返回已保存的最近文件列表', async () => {
      const { saveRecentFile } = await import('../store.js');
      await saveRecentFile({ name: 'book1' });
      await saveRecentFile({ name: 'book2' });
      const recent = await getRecentFiles();
      expect(recent).toHaveLength(2);
      expect(recent[0].name).toBe('book2');
    });
  });

  describe('getFileInputElement', () => {
    it('返回 #fileInput DOM 元素', () => {
      const input = document.createElement('input');
      input.id = 'fileInput';
      input.type = 'file';
      input.accept = '.epub';
      input.hidden = true;
      document.body.appendChild(input);
      const el = getFileInputElement();
      expect(el).not.toBeNull();
      expect(el.id).toBe('fileInput');
      expect(el.accept).toBe('.epub');
      document.body.removeChild(input);
    });
  });
});
