import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openFileViaInput,
  getCurrentFile,
  getRecentFiles,
  getFileInputElement,
} from '../file-manager.js';
import { loadRecentFiles } from '../store.js';

describe('file-manager.js — 文件管理', () => {

  beforeEach(async () => {
    // 清理 IndexedDB
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

    it('打开后记录到最近文件', async () => {
      const file = new File(['x'], 'recent-test.epub');
      await openFileViaInput(file);
      const recent = await getRecentFiles();
      expect(recent.some((f) => f.name === 'recent-test')).toBe(true);
    });
  });

  describe('getRecentFiles', () => {
    it('无最近文件返回空数组', async () => {
      const recent = await getRecentFiles();
      expect(recent).toEqual([]);
    });

    it('返回已保存的最近文件列表', async () => {
      // 通过 store 直接写入
      const { saveRecentFile } = await import('../store.js');
      await saveRecentFile({ name: 'book1' });
      await saveRecentFile({ name: 'book2' });

      const recent = await getRecentFiles();
      expect(recent).toHaveLength(2);
      expect(recent[0].name).toBe('book2'); // 最新的在前
    });
  });

  describe('getFileInputElement', () => {
    it('返回 #fileInput DOM 元素', () => {
      // 先在 DOM 中创建
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

      // 清理
      document.body.removeChild(input);
    });
  });
});
