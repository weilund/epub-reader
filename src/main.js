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
import { loadSettings, saveSettings, loadProgress, loadBookData, loadBookSource, saveBookSource, deleteBookData, listAllBooks, saveChapterMeta, loadChapterMeta } from './store.js';
import { getCurrentTheme, setTheme, onThemeChange } from './theme.js';
import { renderToc, toggleSort, clearToc } from './toc.js';
import { showLoading, hideLoading, showBars, hideBars, toggleBars, updateChapterTitle, updateThemeButtons } from './ui.js';
import { mountSearchUI, setOnOpenBook } from './search.js';
import { searchAll, downloadBook, checkForUpdates, downloadChapters } from './engine/rule-engine.js';
import { generateEpub } from './engine/epub-generator.js';
import { saveDownloadedBook } from './download.js';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

// ===== 当前阅读状态 =====
let currentFileName = '';
let currentFileType = '';
let currentSourceId = '';
let currentBookUrl = '';

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
const splashDownloads = document.getElementById('splashDownloads');
const tabOpen = document.getElementById('tabOpen');
const tabSearch = document.getElementById('tabSearch');
const tabDownloads = document.getElementById('tabDownloads');
const searchPanel = document.getElementById('searchPanel');
const downloadsList = document.getElementById('downloadsList');
const downloadsCount = document.getElementById('downloadsCount');

function switchTab(activeTab) {
  [tabOpen, tabSearch, tabDownloads].forEach(t => t?.classList.remove('active'));
  activeTab?.classList.add('active');
  splashLocal?.classList.add('hidden');
  searchPanel?.classList.add('hidden');
  splashDownloads?.classList.add('hidden');
  openBtn?.classList.add('hidden');
}

tabOpen?.addEventListener('click', () => {
  switchTab(tabOpen);
  splashLocal?.classList.remove('hidden');
  openBtn?.classList.remove('hidden');
});

tabSearch?.addEventListener('click', () => {
  switchTab(tabSearch);
  searchPanel?.classList.remove('hidden');
});

tabDownloads?.addEventListener('click', () => {
  switchTab(tabDownloads);
  splashDownloads?.classList.remove('hidden');
  refreshDownloadsList();
});

// ===== 下载管理 =====
async function refreshDownloadsList() {
  if (!downloadsList) return;
  try {
    const names = await listAllBooks();
    if (names.length === 0) {
      downloadsList.innerHTML = '<div class="downloads-empty">还没有下载过书籍</div>';
      if (downloadsCount) downloadsCount.textContent = '';
      return;
    }
    if (downloadsCount) downloadsCount.textContent = `${names.length} 本`;

    let html = '';
    for (const name of names) {
      const sourceInfo = await loadBookSource(name).catch(() => null);
      const hasSource = !!sourceInfo;
      html += `
      <div class="downloads-item" data-name="${escapeHtml(name)}">
        <div class="downloads-item-info">
          <div class="downloads-item-title">${escapeHtml(name)}</div>
          <div class="downloads-item-meta">${hasSource ? '📡 可更新' : '📄 本地文件'}</div>
        </div>
        <div class="downloads-item-actions">
          <button class="downloads-open-btn" data-name="${escapeAttr(name)}">打开</button>
          ${hasSource ? `<button class="downloads-update-btn" data-name="${escapeAttr(name)}" data-source="${escapeAttr(sourceInfo.sourceId)}" data-url="${escapeAttr(sourceInfo.bookUrl)}">更新</button>` : ''}
          <button class="downloads-export-btn" data-name="${escapeAttr(name)}">导出</button>
          <button class="downloads-del-btn" data-name="${escapeAttr(name)}">删除</button>
        </div>
      </div>`;
    }
    downloadsList.innerHTML = html;

    // 绑定打开按钮
    downloadsList.querySelectorAll('.downloads-open-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        showLoading();
        const buffer = await loadBookData(name);
        if (buffer) {
          const recent = await getRecentFiles();
          const entry = recent.find(f => f.name === name);
          const isTxt = entry?.type === 'txt';
          await openFromCache(name, buffer);
          const data = isTxt ? new TextDecoder().decode(buffer) : buffer;
          await enterReader(name, data, isTxt ? 'txt' : 'epub');
        } else {
          hideLoading();
        }
      });
    });

    // 绑定导出按钮（使用 Capacitor 原生文件系统写入 + 分享）
    downloadsList.querySelectorAll('.downloads-export-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        // 过滤文件名中的非法字符
        const safeName = (name || 'book').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim() || 'book';
        const fileName = `${safeName}.epub`;

        // 复用下载进度浮层
        const overlay = document.getElementById('downloadOverlay');
        const overlayName = document.getElementById('downloadBookName');
        const overlayProgress = document.getElementById('downloadProgressFill');
        const overlayStatus = document.getElementById('downloadStatus');
        overlay?.classList.remove('hidden');
        if (overlayName) overlayName.textContent = fileName;
        if (overlayProgress) overlayProgress.style.width = '10%';
        if (overlayStatus) overlayStatus.textContent = '正在导出…';

        try {
          const buffer = await loadBookData(name);
          if (!buffer) { alert('书籍数据不存在'); return; }

          if (overlayProgress) overlayProgress.style.width = '30%';
          if (overlayStatus) overlayStatus.textContent = '正在编码…';

          // 用 FileReader 高效转 base64（比逐字节循环快 100x）
          const blob = new Blob([buffer], { type: 'application/epub+zip' });
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const base64 = dataUrl.split(',')[1];

          if (overlayProgress) overlayProgress.style.width = '60%';
          if (overlayStatus) overlayStatus.textContent = '正在写入存储…';

          // 写入 App 内部缓存目录（不受作用域存储限制）
          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64,
            directory: Directory.Cache,
            recursive: true,
          });

          if (overlayProgress) overlayProgress.style.width = '90%';
          if (overlayStatus) overlayStatus.textContent = '导出完成！';

          setTimeout(() => overlay?.classList.add('hidden'), 500);

          // 用系统分享打开文件（用户可选择保存/发送）
          try {
            await Share.share({
              title: name,
              url: result.uri,
              dialogTitle: `导出「${name}」`,
            });
          } catch {
            alert(`导出成功！`);
          }
        } catch (e) {
          console.warn('[导出] 失败:', e.message);
          // 回退1：尝试写入 Data 目录（Cache 目录可能权限不足）
          try {
            if (overlayStatus) overlayStatus.textContent = '正在重试…';
            const result = await Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: Directory.Data,
              recursive: true,
            });
            if (overlayProgress) overlayProgress.style.width = '90%';
            if (overlayStatus) overlayStatus.textContent = '导出完成！';
            setTimeout(() => overlay?.classList.add('hidden'), 500);
            try {
              await Share.share({
                title: name,
                url: result.uri,
                dialogTitle: `导出「${name}」`,
              });
            } catch {
              alert(`导出成功！`);
            }
          } catch (e2) {
            console.warn('[导出] 重试失败:', e2.message);
            if (overlayStatus) overlayStatus.textContent = `导出失败: ${e.message}`;
            setTimeout(() => overlay?.classList.add('hidden'), 2500);
            // 回退2：浏览器 Blob 下载（PWA 环境可用）
            try {
              const buffer = await loadBookData(name);
              if (buffer) {
                const blob = new Blob([buffer], { type: 'application/epub+zip' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }, 1000);
              }
            } catch { /* 全部失败，静默 */ }
          }
        }
      });
    });

    // 绑定更新按钮
    downloadsList.querySelectorAll('.downloads-update-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const sourceId = btn.dataset.source;
        const bookUrl = btn.dataset.url;
        await doCheckUpdate(name, sourceId, bookUrl);
      });
    });

    // 绑定删除按钮
    downloadsList.querySelectorAll('.downloads-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (!confirm(`确定要删除「${name}」吗？\n删除后无法恢复。`)) return;
        await deleteBookData(name);
        refreshDownloadsList();
      });
    });
  } catch (e) {
    console.warn('[main] 刷新下载列表失败:', e.message);
    downloadsList.innerHTML = '<div class="downloads-empty">加载失败</div>';
  }
}

/**
 * 检查连载书籍更新，下载新章节并替换 EPUB
 */
async function doCheckUpdate(name, sourceId, bookUrl) {
  if (!confirm(`检查「${name}」的更新？`)) return;
  showLoading();
  try {
    const savedMeta = await loadChapterMeta(name);
    const newChapters = await checkForUpdates(sourceId, bookUrl, savedMeta);
    if (newChapters.length === 0) {
      hideLoading();
      alert('已是最新，无需更新');
      return;
    }
    // 下载新章节
    const downloaded = await downloadChapters(sourceId, newChapters, (done, total) => {
      // 进度通过 loading 文字体现
    });
    if (downloaded.length === 0) {
      hideLoading();
      alert('未能下载任何新章节');
      return;
    }
    // 合并新旧章节内容
    const allChapters = [...savedMeta, ...downloaded];
    // 重新生成 EPUB
    const epubBuffer = await generateEpub({
      title: name,
      author: '',
      chapters: allChapters.filter(c => c.content),
    });
    const blob = new Blob([epubBuffer], { type: 'application/epub+zip' });
    const arrayBuffer = await blob.arrayBuffer();
    // 替换存储
    await saveDownloadedBook(blob, name);
    await saveChapterMeta(name, allChapters.map(ch => ({
      index: ch.index,
      name: ch.name || ch.title,
      url: ch.url,
    })));
    hideLoading();
    alert(`更新完成！新增 ${downloaded.length} 章`);
    refreshDownloadsList();
  } catch (e) {
    hideLoading();
    alert(`更新失败: ${e.message}`);
  }
}

// ===== 搜索回调：下载完成后直接打开书 =====
setOnOpenBook(async (name, arrayBuffer, type, sourceInfo) => {
  // 保存书源信息（用于换源）
  if (sourceInfo) {
    await saveBookSource(name, sourceInfo).catch(() => {});
  }
  const fileInfo = await openFromCache(name, arrayBuffer);
  await enterReader(fileInfo.name, arrayBuffer, type, sourceInfo);
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
async function enterReader(fileName, data, type, sourceInfo) {
  currentFileName = fileName;
  currentFileType = type;
  if (sourceInfo) {
    currentSourceId = sourceInfo.sourceId || '';
    currentBookUrl = sourceInfo.bookUrl || '';
  } else {
    // 从缓存加载书源信息
    const cached = await loadBookSource(fileName).catch(() => null);
    currentSourceId = cached?.sourceId || '';
    currentBookUrl = cached?.bookUrl || '';
  }
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

// ===== 换源 =====
const switchSourceBtn = document.getElementById('switchSourceBtn');
const switchSourcePanel = document.getElementById('switchSourcePanel');
const switchSourceList = document.getElementById('switchSourceList');
const closeSwitchSource = document.getElementById('closeSwitchSource');
const switchSourceLoading = document.getElementById('switchSourceLoading');

switchSourceBtn?.addEventListener('click', async () => {
  if (!currentFileName) return;
  switchSourcePanel?.classList.remove('hidden');
  if (switchSourceList) switchSourceList.innerHTML = '';
  if (switchSourceLoading) switchSourceLoading.classList.remove('hidden');

  try {
    const data = await searchAll(currentFileName);
    if (switchSourceLoading) switchSourceLoading.classList.add('hidden');

    const otherSources = (data.results || []).filter(
      (s) => s.sourceId !== currentSourceId
    );

    if (otherSources.length === 0) {
      if (switchSourceList) {
        let msg = '<div class="switch-source-empty">未找到其他书源</div>';
        if (data.errors && data.errors.length > 0) {
          msg += `<div class="search-errors">${data.errors.map(e => escapeHtml(e.sourceName + ': ' + e.error)).join('<br>')}</div>`;
        }
        switchSourceList.innerHTML = msg;
      }
      return;
    }

    for (const source of otherSources) {
      for (const book of source.results) {
        const el = document.createElement('div');
        el.className = 'switch-source-item';
        el.innerHTML = `
          <div class="switch-source-name">${escapeHtml(book.name)}</div>
          <div class="switch-source-meta">${escapeHtml(source.sourceName)} · ${escapeHtml(book.author || '佚名')}</div>
        `;
        el.addEventListener('click', () => doSwitchSource(source.sourceId, book.bookUrl, book.name, book.author));
        switchSourceList?.appendChild(el);
      }
    }
  } catch (e) {
    if (switchSourceLoading) switchSourceLoading.classList.add('hidden');
    if (switchSourceList) {
      switchSourceList.innerHTML = `<div class="switch-source-empty">搜索失败: ${escapeHtml(e.message)}</div>`;
    }
  }
});

// ===== 检查更新（阅读器内） =====
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
checkUpdateBtn?.addEventListener('click', async () => {
  if (!currentFileName) return;
  const sourceInfo = await loadBookSource(currentFileName).catch(() => null);
  if (!sourceInfo || !sourceInfo.sourceId) {
    alert('该书没有书源记录，无法检查更新');
    return;
  }
  await doCheckUpdate(currentFileName, sourceInfo.sourceId, sourceInfo.bookUrl);
});

closeSwitchSource?.addEventListener('click', () => {
  switchSourcePanel?.classList.add('hidden');
});
switchSourcePanel?.addEventListener('click', (e) => {
  if (e.target === switchSourcePanel) switchSourcePanel.classList.add('hidden');
});

async function doSwitchSource(sourceId, bookUrl, bookName, author) {
  switchSourcePanel?.classList.add('hidden');

  if (!currentFileName) return;
  showLoading();

  try {
    const data = await downloadBook(sourceId, bookUrl, bookName, author);
    if (!data.chapters.length) throw new Error('未获取到章节');

    const epubBuffer = await generateEpub({
      title: bookName || currentFileName,
      author: author || '',
      chapters: data.chapters.filter(c => c.content),
    });

    const blob = new Blob([epubBuffer], { type: 'application/epub+zip' });
    const arrayBuffer = await saveDownloadedBook(blob, currentFileName);

    // 更新书源记录
    await saveBookSource(currentFileName, { sourceId, bookUrl, author });
    currentSourceId = sourceId;
    currentBookUrl = bookUrl;
    // 更新章节元数据
    await saveChapterMeta(currentFileName, data.chapters.map(ch => ({
      index: ch.index,
      name: ch.name || ch.title,
      url: ch.url,
    }))).catch(() => {});

    // 重新打开阅读器
    activeReader.destroyReader();
    await openFromCache(currentFileName, arrayBuffer);
    await enterReader(currentFileName, arrayBuffer, 'epub', { sourceId, bookUrl, author });

    hideLoading();
  } catch (e) {
    hideLoading();
    alert(`换源失败: ${e.message}`);
  }
}

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// ===== 返回（重置到本地文件标签页） =====
function goBack() {
  const fontSizeVal = parseInt(fontSizeDisplay?.textContent || '100', 10);
  saveSettings({ fontSize: fontSizeVal, theme: getCurrentTheme() }).catch((e) => {
    console.warn('[main] 保存设置失败:', e.message);
  });
  activeReader.destroyReader();
  reader.style.display = 'none';
  reader.classList.add('hidden');
  splash.style.display = '';
  splash.classList.remove('hidden');
  // 重置到本地文件标签页
  tabOpen?.classList.add('active');
  tabSearch?.classList.remove('active');
  tabDownloads?.classList.remove('active');
  splashLocal?.classList.remove('hidden');
  searchPanel?.classList.add('hidden');
  splashDownloads?.classList.add('hidden');
  openBtn?.classList.remove('hidden');
  hideLoading();
  fileInput.value = '';
  clearToc();
  refreshRecentList();
  currentFileName = '';
  currentFileType = '';
  currentSourceId = '';
  currentBookUrl = '';
}

backBtn.addEventListener('click', goBack);

try {
  App.addListener('backButton', () => {
    if (!reader.classList.contains('hidden')) goBack();
  });
} catch (e) {
  console.warn('[main] 非 Capacitor 环境，系统返回键已禁用:', e.message);
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
  saveSettings({ fontSize: val, theme: getCurrentTheme() }).catch((e) => {
    console.warn('[main] 保存设置失败:', e.message);
  });
});

fontSizeUp?.addEventListener('click', () => {
  const val = Math.min(200, parseInt(fontSizeDisplay?.textContent || '100', 10) + 10);
  if (fontSizeDisplay) fontSizeDisplay.textContent = `${val}%`;
  activeReader.setFontSize(val);
  saveSettings({ fontSize: val, theme: getCurrentTheme() }).catch((e) => {
    console.warn('[main] 保存设置失败:', e.message);
  });
});

// ===== 主题 =====
function switchTheme(theme) {
  setTheme(theme);
  const fontSizeVal = parseInt(fontSizeDisplay?.textContent || '100', 10);
  saveSettings({ fontSize: fontSizeVal, theme }).catch((e) => {
    console.warn('[main] 保存主题设置失败:', e.message);
  });
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
  } catch (e) {
    console.warn('[main] 刷新最近文件列表失败:', e.message);
  }
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
  } catch (e) {
    console.warn('[main] 初始化失败（IndexedDB 可能不可用）:', e.message);
  }
}

init();
