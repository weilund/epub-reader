import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrentTheme,
  setTheme,
  applyTheme,
  onThemeChange,
  getEpubTheme,
} from '../theme.js';

describe('theme.js — 主题管理', () => {

  beforeEach(() => {
    // 清理 body class
    document.body.className = '';
  });

  it('默认主题是 day', () => {
    expect(getCurrentTheme()).toBe('day');
  });

  it('切换到夜间模式', () => {
    setTheme('night');
    expect(getCurrentTheme()).toBe('night');
    expect(document.body.classList.contains('night')).toBe(true);
    expect(document.body.classList.contains('sepia')).toBe(false);
  });

  it('切换到羊皮纸模式', () => {
    setTheme('sepia');
    expect(getCurrentTheme()).toBe('sepia');
    expect(document.body.classList.contains('sepia')).toBe(true);
    expect(document.body.classList.contains('night')).toBe(false);
  });

  it('切回日间模式清除所有主题 class', () => {
    setTheme('night');
    setTheme('day');
    expect(document.body.classList.contains('night')).toBe(false);
    expect(document.body.classList.contains('sepia')).toBe(false);
    expect(document.body.className).toBe('');
  });

  it('切换时通知监听器', () => {
    const listener = vi.fn();
    const unsubscribe = onThemeChange(listener);

    setTheme('night');
    expect(listener).toHaveBeenCalledWith('night');

    setTheme('sepia');
    expect(listener).toHaveBeenCalledWith('sepia');

    unsubscribe();
    setTheme('day');
    // 取消订阅后不应该再被调用
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('多次取消订阅不影响其他监听器', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onThemeChange(a);
    onThemeChange(b);

    unsubA();
    setTheme('night');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('night');
  });

  describe('getEpubTheme — 生成 epub.js 主题样式', () => {
    it('日间主题返回浅色背景', () => {
      const styles = getEpubTheme('day');
      expect(styles.body.background).toBe('#ffffff');
      expect(styles.body.color).toBe('#1a1a2e');
    });

    it('夜间主题返回深色背景', () => {
      const styles = getEpubTheme('night');
      expect(styles.body.background).toBe('#1a1a2e');
      expect(styles.body.color).toBe('#d0d0d0');
      expect(styles['a'].color).toBe('#64b5f6');
    });

    it('羊皮纸主题返回暖色', () => {
      const styles = getEpubTheme('sepia');
      expect(styles.body.background).toBe('#f5f0e8');
      expect(styles.body.color).toBe('#5b4636');
    });

    it('未知主题回退到日间', () => {
      const styles = getEpubTheme('unknown');
      expect(styles.body.background).toBe('#ffffff');
    });
  });
});
