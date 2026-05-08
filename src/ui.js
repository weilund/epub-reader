// UI 状态管理（加载、工具栏、章节标题、主题按钮）
import { getTocItems } from './toc.js';

let hideBarsTimeout = null;

export function showLoading() {
  document.getElementById('splashSubtitle')?.classList.add('hidden');
  document.getElementById('openBtn')?.classList.add('hidden');
  document.getElementById('loadingText')?.classList.remove('hidden');
}

export function hideLoading() {
  document.getElementById('splashSubtitle')?.classList.remove('hidden');
  document.getElementById('openBtn')?.classList.remove('hidden');
  document.getElementById('loadingText')?.classList.add('hidden');
}

export function showBars() {
  document.getElementById('topBar')?.classList.remove('hidden-bar');
  document.getElementById('bottomBar')?.classList.remove('hidden-bar');
  clearTimeout(hideBarsTimeout);
  hideBarsTimeout = setTimeout(hideBars, 4000);
}

export function hideBars() {
  document.getElementById('topBar')?.classList.add('hidden-bar');
  document.getElementById('bottomBar')?.classList.add('hidden-bar');
}

export function toggleBars() {
  const topBar = document.getElementById('topBar');
  if (topBar?.classList.contains('hidden-bar')) {
    showBars();
  } else {
    hideBars();
  }
}

export function updateChapterTitle(href) {
  const items = getTocItems();
  if (!href || items.length === 0) return;
  const match = items.find((item) => href.startsWith(item.cfi));
  if (match) {
    const el = document.getElementById('bookTitle');
    if (el) el.textContent = match.label;
  }
}

export function updateThemeButtons(theme) {
  ['themeDay', 'themeNight', 'themeSepia'].forEach((id) => {
    document.getElementById(id)?.classList.remove('active');
  });
  if (theme === 'night') document.getElementById('themeNight')?.classList.add('active');
  else if (theme === 'sepia') document.getElementById('themeSepia')?.classList.add('active');
  else document.getElementById('themeDay')?.classList.add('active');
}
