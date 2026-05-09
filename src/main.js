import './style.css';
import { App } from '@capacitor/app';
import { openFileViaInput, openFromCache, getRecentFiles } from './file-manager.js';
import {
  loadBook, nextPage as epubNext, prevPage as epubPrev,
  goTo as epubGoTo, setFontSize as epubSetFontSize,
  applyTheme as epubApplyTheme, destroyReader as epubDestroy,
  setCallbacks as epubSetCallbacks,
} from './reader.js';
import * as txt from './txt-reader.js';
import { loadSettings, saveSettings, loadProgress, loadBookData } from './store.js';
import { getCurrentTheme, setTheme, onThemeChange } from './theme.js';
import { renderToc, toggleSort, clearToc } from './toc.js';
import { showLoading, hideLoading, showBars, hideBars, toggleBars, updateChapterTitle, updateThemeButtons } from './ui.js';
import { mountSearchUI, setOnOpenBook } from './search.js';

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

const splashSubtitle = $('splashSubtitle');
const loadingText = $('loadingText');

const progressText = $('progressText');
const progressFill = $('progressFill');

const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');
const closeSettings = $('closeSettings');
const fontSizeDown = $('fontSizeDown');
const fontSizeUp = $('fontSizeUp');
const fontSizeDisplay = $('fontSizeDisplay');
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

// ===== 阅读器派发 =====
// 根据当前文件类型（epub/txt）自动路由到正确的模块
const activeReader = {
  nextPage: () => epubNext(),
  prevPage: () => epubPrev(),
  goTo: (t) => epubGoTo(t),
  setFontSize: (v) => epubSetFontSize(v),
  applyTheme: (t) => epubApplyTheme(t),
  destroyReader: () => epubDestroy(),
};

function setReaderTxt() {
  activeReader.nextPage = () => txt.nextPage();
  activeReader.prevPage = () => txt.prevPage();
  activeReader.goTo = (t) => txt.goTo(t);
  activeReader.setFontSize = (v) => txt.setFontSize(v);
  activeReader.applyTheme = (t) => txt.applyTheme(t);
  activeReader.destroyReader = () => txt.destroyReader();
}

function setReaderEpub() {
  activeReader.nextPage = () => epubNext();
  activeReader.prevPage = () => epubPrev();
  activeReader.goTo = (t) => epubGoTo(t);
  activeReader.setFontSize = (v) => epubSetFontSize(v);
  activeReader.applyTheme = (t) => epubApplyTheme(t);
  activeReader.destroyReader = () => epubDestroy();
}

// ===== 标签切换 =====
const splashLocal = document.getElementById('splashLocal');
const tabOpen = document.getElementById('tabOpen');
const tabSearch = document.getElementById('tabSearch');
const searchPanel = document.getElementById('searchPanel');

tabOpen?.addEventListener('click', () => {
  tabOpen.classList.add('active');
  tabSearch?.classList.remove('active');
  splashLocal?.classList.remove('hidden');
  searchPanel?.classList.add('hidden');
  openBtn?.classList.remove('hidden');
});

if (tabSearch) {
  tabSearch.addEventListener('click', () => {
    tabSearch.classList.add('active');
    tabOpen?.classList.remove('active');
    splashLocal?.classList.add('hidden');
    searchPanel?.classList.remove('hidden');
    openBtn?.classList.add('hidden');
  });
}

// ===== 搜索回调：下载完成后直接打开书 =====
setOnOpenBook(async (name, arrayBuffer, type) => {
  const fileInfo = await openFromCache(name, arrayBuffer);
  await enterReader(fileInfo.name, arrayBuffer, type);
});

// ===== 打开文件 =====
openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await startReading(file);
});

async function startReading(file) {
  showLoading();
  const isTxt = file.name.toLowerCase().endsWith('.txt');
  const fileInfo = await openFileViaInput(file);
  if (!fileInfo) { hideLoading(); return; }

  if (isTxt) {
    const text = await file.text();
    await enterReader(fileInfo.name, text, 'txt');
  } else {
    await enterReader(fileInfo.name, fileInfo.arrayBuffer, 'epub');
  }
}

// ===== 进入阅读器 =====
async function enterReader(fileName, data, type) {
  // 清除 goBack 留下的 inline style
  reader.style.display = '';
  reader.classList.remove('hidden');
  splash.style.display = 'none';
  splash.classList.add('hidden');
  hideLoading();

  const settings = await loadSettings();
  setTheme(settings.theme);

  const saved = await loadProgress(fileName);

  const onTitle = (title) => { bookTitle.textContent = title; };
  const onProgress = (p) => {
    const pct = Math.round(p.percentage * 100);
    progressText.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
  };

  if (type === 'txt') {
    setReaderTxt();
    txt.setCallbacks({ onTitle, onProgress, onTocReady: () => {}, onChapter: () => {} });
    const startPage = saved ? parseInt(saved.cfi, 10) || 0 : 0;
    await txt.loadTxtBook(data, fileName, startPage);
  } else {
    setReaderEpub();
    const startCfi = saved?.cfi || null;
    epubSetCallbacks({
      onTitle,
      onProgress,
      onTocReady: (items) => renderToc(items, tocList, activeReader.goTo, tocPanel),
      onChapter: (href) => updateChapterTitle(href),
    });
    await loadBook(data, fileName, startCfi);
  }

  activeReader.setFontSize(settings.fontSize);
  if (fontSizeDisplay) fontSizeDisplay.textContent = `${settings.fontSize}%`;
  activeReader.applyTheme(getCurrentTheme());
  showBars();
}

// ===== 翻页 =====
prevZone.addEventListener('click', () => activeReader.prevPage());
nextZone.addEventListener('click', () => activeReader.nextPage());
prevBtn.addEventListener('click', () => activeReader.prevPage());
nextBtn.addEventListener('click', () => activeReader.nextPage());
centerZone.addEventListener('click', toggleBars);

// 音量键
window.addEventListener('volumeup', () => {
  if (!reader.classList.contains('hidden')) activeReader.prevPage();
});
window.addEventListener('volumedown', () => {
  if (!reader.classList.contains('hidden')) activeReader.nextPage();
});

// ===== 返回 =====
function goBack() {
  const fontSizeVal = parseInt(fontSizeDisplay?.textContent || '100', 10);
  saveSettings({ fontSize: fontSizeVal, theme: getCurrentTheme() }).catch(() => {});
  activeReader.destroyReader();
  reader.style.display = 'none';
  reader.classList.add('hidden');
  splash.style.display = '';
  splash.classList.remove('hidden');
  hideLoading();
  fileInput.value = '';
  clearToc();
  refreshRecentList();
}

backBtn.addEventListener('click', goBack);

try {
  App.addListener('backButton', () => {
    if (!reader.classList.contains('hidden')) goBack();
  });
} catch {
  // 非 Capacitor 环境
}

// ===== 目录面板 =====
tocBtn.addEventListener('click', () => tocPanel?.classList.remove('hidden'));
closeToc.addEventListener('click', () => tocPanel?.classList.add('hidden'));
tocOverlay.addEventListener('click', () => tocPanel?.classList.add('hidden'));
tocBtnSort.addEventListener('click', () => toggleSort(tocList, activeReader.goTo, tocPanel));

// ===== 设置面板 =====
settingsBtn.addEventListener('click', () => settingsPanel?.classList.remove('hidden'));
closeSettings.addEventListener('click', () => settingsPanel?.classList.add('hidden'));
settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) settingsPanel.classList.add('hidden');
});

// ===== 字号按键 =====
fontSizeDown?.addEventListener('click', () => {
  const val = Math.max(80, parseInt(fontSizeDisplay?.textContent || '100', 10) - 10);
  if (fontSizeDisplay) fontSizeDisplay.textContent = `${val}%`;
  activeReader.setFontSize(val);
  saveSettings({ fontSize: val, theme: getCurrentTheme() }).catch(() => {});
});

fontSizeUp?.addEventListener('click', () => {
  const val = Math.min(200, parseInt(fontSizeDisplay?.textContent || '100', 10) + 10);
  if (fontSizeDisplay) fontSizeDisplay.textContent = `${val}%`;
  activeReader.setFontSize(val);
  saveSettings({ fontSize: val, theme: getCurrentTheme() }).catch(() => {});
});

// ===== 主题 =====
function switchTheme(theme) {
  setTheme(theme);
  const fontSizeVal = parseInt(fontSizeDisplay?.textContent || '100', 10);
  saveSettings({ fontSize: fontSizeVal, theme }).catch(() => {});
}

themeDay?.addEventListener('click', () => switchTheme('day'));
themeNight?.addEventListener('click', () => switchTheme('night'));
themeSepia?.addEventListener('click', () => switchTheme('sepia'));

onThemeChange((theme) => {
  activeReader.applyTheme(theme);
  updateThemeButtons(theme);
});

// ===== 最近文件列表 =====
async function refreshRecentList() {
  try {
    const recent = await getRecentFiles();
    if (recent.length > 0) {
      recentFiles?.classList.remove('hidden');
      recentList.innerHTML = '';
      for (const f of recent) {
        const li = document.createElement('li');
        li.textContent = f.name;
        li.addEventListener('click', () => handleRecentClick(f.name));
        recentList.appendChild(li);
      }
    } else {
      recentFiles?.classList.add('hidden');
    }
  } catch {}
}

async function handleRecentClick(name) {
  showLoading();
  const buffer = await loadBookData(name);
  if (buffer) {
    const recent = await getRecentFiles();
    const entry = recent.find((f) => f.name === name);
    const isTxt = entry?.type === 'txt';
    await openFromCache(name, buffer);
    const data = isTxt ? new TextDecoder().decode(buffer) : buffer;
    await enterReader(name, data, isTxt ? 'txt' : 'epub');
  } else {
    hideLoading();
    fileInput.click();
  }
}

// ===== 初始化 =====
async function init() {
  // 挂载搜索面板（探测后端），默认显示本地文件标签
  mountSearchUI();

  try {
    const recent = await getRecentFiles();
    if (recent.length > 0) {
      const last = recent[0];
      showLoading();
      const buffer = await loadBookData(last.name);
      if (buffer) {
        await openFromCache(last.name, buffer);
        const isTxt = last.type === 'txt';
        const data = isTxt ? new TextDecoder().decode(buffer) : buffer;
        await enterReader(last.name, data, isTxt ? 'txt' : 'epub');
        return;
      }
      hideLoading();
      recentFiles?.classList.remove('hidden');
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

init();
