// TXT 纯文本阅读器
import { saveProgress, loadProgress } from './store.js';
import { getEpubTheme } from './theme.js';

let text = '';
let currentPage = 0;
let totalPages = 1;
let pageSize = 500;
let fontSize = 100;
let fileName = '';

const callbacks = {};

function emit(name, ...args) {
  callbacks[name]?.(...args);
}

export function setCallbacks(cbs) {
  Object.assign(callbacks, cbs);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function recalcPages() {
  const container = document.getElementById('viewerContainer');
  if (!container || !text) return;
  const cw = container.clientWidth || 360;
  const ch = container.clientHeight || 500;
  // 估算字符尺寸
  const charW = fontSize * 0.55;
  const charH = fontSize * 1.35;
  const cols = Math.max(1, Math.floor(cw / charW));
  const rows = Math.max(1, Math.floor(ch / charH));
  pageSize = Math.max(1, cols * rows);
  totalPages = Math.max(1, Math.ceil(text.length / pageSize));
}

function renderPage() {
  const container = document.getElementById('viewerContainer');
  if (!container) return;
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, text.length);
  const pageText = text.slice(start, end);
  container.innerHTML = `<div class="txt-page" style="font-size:${fontSize}%">${escapeHtml(pageText)}</div>`;
  emit('onProgress', {
    cfi: String(currentPage),
    percentage: totalPages > 1 ? currentPage / (totalPages - 1) : 0,
  });
}

export async function loadTxtBook(textContent, name, startPage) {
  text = textContent;
  fileName = name;
  currentPage = typeof startPage === 'number' ? startPage : 0;
  emit('onTitle', name);
  emit('onTocReady', []);
  // 字号由外部 setFontSize 设置后再 render
  recalcPages();
  renderPage();
}

export function nextPage() {
  if (currentPage < totalPages - 1) {
    currentPage++;
    renderPage();
    saveProgress(fileName, { cfi: String(currentPage), percentage: currentPage / totalPages }).catch(() => {});
  }
}

export function prevPage() {
  if (currentPage > 0) {
    currentPage--;
    renderPage();
    saveProgress(fileName, { cfi: String(currentPage), percentage: currentPage / totalPages }).catch(() => {});
  }
}

export function goTo(target) {
  if (target == null) return;
  const n = typeof target === 'number' ? target : parseInt(target, 10);
  if (isNaN(n)) return;
  currentPage = Math.max(0, Math.min(n, totalPages - 1));
  renderPage();
}

export function setFontSize(percent) {
  fontSize = percent;
  const savedPage = currentPage;
  recalcPages();
  currentPage = Math.min(savedPage, totalPages - 1);
  renderPage();
}

export function applyTheme(themeName) {
  const styles = getEpubTheme(themeName);
  const el = document.querySelector('.txt-page');
  if (!el) return;
  el.style.background = styles.body.background;
  el.style.color = styles.body.color;
}

export function destroyReader() {
  text = '';
  currentPage = 0;
  totalPages = 1;
  fileName = '';
  const container = document.getElementById('viewerContainer');
  if (container) container.innerHTML = '';
}
