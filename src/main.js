import './style.css';
import { App } from '@capacitor/app';
import {
  openFileViaInput,
  openFromCache,
  getRecentFiles,
  getFileInputElement,
} from './file-manager.js';
import {
  loadBook,
  nextPage,
  prevPage,
  goTo,
  setFontSize,
  applyTheme,
  destroyReader,
  setCallbacks,
} from './reader.js';
import { loadSettings, saveSettings, loadProgress, loadBookData, hasBookData } from './store.js';
import { getCurrentTheme, setTheme, onThemeChange } from './theme.js';

// ===== DOM 引用 =====
const $ = (id) => document.getElementById(id);

const splash = $('splash');
const reader = $('reader');
const fileInput = $('fileInput');
const openBtn = $('openBtn');

const topBar = $('topBar');
const bottomBar = $('bottomBar');
const bookTitle = $('bookTitle');
const backBtn = $('backBtn');

const prevZone = $('prevZone');
const nextZone = $('nextZone');
const centerZone = $('centerZone');
const prevBtn = $('prevBtn');
const nextBtn = $('nextBtn');

const progressText = $('progressText');
const progressFill = $('progressFill');

const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');
const closeSettings = $('closeSettings');
const fontSizeSlider = $('fontSizeSlider');
const themeDay = $('themeDay');
const themeNight = $('themeNight');
const themeSepia = $('themeSepia');

const tocBtn = $('tocBtn');
const tocBtnSort = $('tocBtnSort');
const tocPanel = $('tocPanel');
const tocList = $('tocList');
const closeToc = $('closeToc');
const tocOverlay = $('tocOverlay');

const recentFiles = $('recentFiles');
const recentList = $('recentList');

// ===== 工具栏显示/隐藏 =====
let barsVisible = false;
let hideBarsTimeout = null;

function showBars() {
  barsVisible = true;
  topBar.classList.remove('hidden-bar');
  bottomBar.classList.remove('hidden-bar');
  clearTimeout(hideBarsTimeout);
  hideBarsTimeout = setTimeout(hideBars, 4000);
}

function hideBars() {
  barsVisible = false;
  topBar.classList.add('hidden-bar');
  bottomBar.classList.add('hidden-bar');
}

function toggleBars() {
  if (barsVisible) hideBars();
  else showBars();
}

// ===== 打开文件 =====
openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await startReading(file);
});

// ===== 开始阅读 =====
async function startReading(file) {
  const fileInfo = await openFileViaInput(file);
  if (!fileInfo) return;
  await enterReader(fileInfo.name, fileInfo.arrayBuffer);
}

let savedBookName = '';

async function enterReader(fileName, arrayBuffer) {
  savedBookName = fileName;
  // 清除 goBack 留下的 inline style
  reader.style.display = '';
  reader.classList.remove('hidden');
  splash.style.display = 'none';
  splash.classList.add('hidden');

  const settings = await loadSettings();
  setFontSize(settings.fontSize);
  fontSizeSlider.value = settings.fontSize;
  setTheme(settings.theme);
  updateThemeButtons(settings.theme);

  const saved = await loadProgress(fileName);
  const startCfi = saved?.cfi || null;

  setCallbacks({
    onTitle: (title) => { /* 书名由 onChapter 更新 */ },
    onProgress: (p) => {
      const pct = Math.round(p.percentage * 100);
      progressText.textContent = `${pct}%`;
      progressFill.style.width = `${pct}%`;
    },
    onTocReady: (items) => renderToc(items),
    onChapter: (href) => updateChapterTitle(href),
  });

  await loadBook(arrayBuffer, fileName, startCfi);
  applyTheme(getCurrentTheme());
  showBars();
}

// ===== 顶部栏显示章节名 =====
function updateChapterTitle(href) {
  if (!href || tocItems.length === 0) return;
  // 在目录中查找匹配的章节
  const match = tocItems.find((item) => href.startsWith(item.cfi));
  if (match) {
    bookTitle.textContent = match.label;
  }
}

// ===== 目录渲染（支持排序） =====
let tocItems = [];
let tocAscending = true;

function renderToc(items) {
  tocItems = items;
  renderTocSorted();
}

function renderTocSorted() {
  tocList.innerHTML = '';
  const sorted = tocAscending ? tocItems : [...tocItems].reverse();
  for (const item of sorted) {
    const li = document.createElement('li');
    li.textContent = item.label;
    li.dataset.cfi = item.cfi;
    if (item.depth > 0) li.classList.add('subchapter');
    li.addEventListener('click', () => {
      goTo(item.cfi);
      tocPanel.classList.add('hidden');
    });
    tocList.appendChild(li);
  }
  const sortIcon = document.getElementById('tocSortIcon');
  if (sortIcon) sortIcon.textContent = tocAscending ? '↓' : '↑';
}

tocBtnSort.addEventListener('click', () => {
  tocAscending = !tocAscending;
  renderTocSorted();
});

// ===== 翻页（包括音量键） =====
prevZone.addEventListener('click', prevPage);
nextZone.addEventListener('click', nextPage);
prevBtn.addEventListener('click', prevPage);
nextBtn.addEventListener('click', nextPage);

centerZone.addEventListener('click', toggleBars);

// 音量键翻页
window.addEventListener('volumeup', () => {
  if (!reader.classList.contains('hidden')) prevPage();
});
window.addEventListener('volumedown', () => {
  if (!reader.classList.contains('hidden')) nextPage();
});

// ===== 返回功能（按钮 + 系统返回键） =====
function goBack() {
  destroyReader();
  reader.style.display = 'none';
  reader.classList.add('hidden');
  splash.style.display = '';
  splash.classList.remove('hidden');
  fileInput.value = '';
  tocItems = [];
  // 重新渲染最近文件列表（auto-resume 跳过了）
  refreshRecentList();
}

async function refreshRecentList() {
  try {
    const recent = await getRecentFiles();
    if (recent.length > 0) {
      recentFiles.classList.remove('hidden');
      recentList.innerHTML = '';
      for (const f of recent) {
        const li = document.createElement('li');
        li.textContent = f.name;
        li.addEventListener('click', () => handleRecentClick(f.name));
        recentList.appendChild(li);
      }
    } else {
      recentFiles.classList.add('hidden');
    }
  } catch {}
}

backBtn.addEventListener('click', goBack);

// Capacitor 原生返回键（同步注册，必须在 App 初始化前）
try {
  App.addListener('backButton', () => {
    if (!reader.classList.contains('hidden')) {
      goBack();
    }
  });
} catch {
  // 非 Capacitor 环境，忽略
}

// ===== 目录面板 =====
tocBtn.addEventListener('click', () => {
  tocPanel.classList.remove('hidden');
});

closeToc.addEventListener('click', () => tocPanel.classList.add('hidden'));
tocOverlay.addEventListener('click', () => tocPanel.classList.add('hidden'));

// ===== 设置面板 =====
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
});

closeSettings.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) settingsPanel.classList.add('hidden');
});

fontSizeSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  setFontSize(val);
  saveSettings({ fontSize: val, theme: getCurrentTheme() });
});

// 主题
function updateThemeButtons(theme) {
  [themeDay, themeNight, themeSepia].forEach((btn) => btn.classList.remove('active'));
  if (theme === 'night') themeNight.classList.add('active');
  else if (theme === 'sepia') themeSepia.classList.add('active');
  else themeDay.classList.add('active');
}

function switchTheme(theme) {
  setTheme(theme);
  applyTheme(theme);
  updateThemeButtons(theme);
  saveSettings({ fontSize: parseInt(fontSizeSlider.value), theme });
}

themeDay.addEventListener('click', () => switchTheme('day'));
themeNight.addEventListener('click', () => switchTheme('night'));
themeSepia.addEventListener('click', () => switchTheme('sepia'));

onThemeChange((theme) => {
  applyTheme(theme);
});

// ===== 初始化：自动恢复上次阅读 =====
async function init() {
  try {
    const recent = await getRecentFiles();
    if (recent.length > 0) {
      const last = recent[0];
      const cached = await hasBookData(last.name);
      if (cached) {
        const buffer = await loadBookData(last.name);
        if (buffer) {
          await openFromCache(last.name, buffer);
          await enterReader(last.name, buffer);
          return;
        }
      }
      recentFiles.classList.remove('hidden');
      recentList.innerHTML = '';
      for (const f of recent) {
        const li = document.createElement('li');
        li.textContent = f.name;
        li.addEventListener('click', () => handleRecentClick(f.name));
        recentList.appendChild(li);
      }
    }
  } catch {
    // IndexedDB 可能不可用
  }
}

async function handleRecentClick(name) {
  const buffer = await loadBookData(name);
  if (buffer) {
    await openFromCache(name, buffer);
    await enterReader(name, buffer);
  } else {
    fileInput.click();
  }
}

init();
