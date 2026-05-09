import { searchAll } from './engine/rule-engine.js';
import { downloadBook } from './engine/rule-engine.js';
import { generateEpub } from './engine/epub-generator.js';
import { saveDownloadedBook } from './download.js';

let searchPanel, searchInput, searchResults, searchStatus, searchLoading;
let downloadOverlay, downloadBookName, downloadProgressFill, downloadStatus;
let onOpenBook = null;

export function setOnOpenBook(fn) {
  onOpenBook = fn;
}

export function mountSearchUI() {
  searchPanel = document.getElementById('searchPanel');
  searchInput = document.getElementById('searchInput');
  searchResults = document.getElementById('searchResults');
  searchStatus = document.getElementById('searchStatus');
  searchLoading = document.getElementById('searchLoading');

  downloadOverlay = document.getElementById('downloadOverlay');
  downloadBookName = document.getElementById('downloadBookName');
  downloadProgressFill = document.getElementById('downloadProgressFill');
  downloadStatus = document.getElementById('downloadStatus');

  document.getElementById('searchBtn')?.addEventListener('click', () => doSearch());

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  document.getElementById('closeSearch')?.addEventListener('click', () => {
    searchPanel?.classList.add('hidden');
  });

  document.getElementById('tabSearch')?.addEventListener('click', () => {
    setTimeout(() => searchInput?.focus(), 100);
  });
}

async function doSearch() {
  const q = searchInput?.value.trim();
  if (!q || !searchResults) return;

  searchResults.innerHTML = '';
  searchStatus?.classList.add('hidden');
  searchLoading?.classList.remove('hidden');

  try {
    const data = await searchAll(q);
    searchLoading?.classList.add('hidden');

    if (!data.results || data.results.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">未找到结果，换个关键词试试</div>';
      return;
    }

    renderResults(data.results);
  } catch (e) {
    searchLoading?.classList.add('hidden');
    searchResults.innerHTML = `<div class="search-error">搜索出错: ${e.message}</div>`;
  }
}

function renderResults(allResults) {
  if (!searchResults) return;

  let totalCount = 0;
  let html = '';

  for (const source of allResults) {
    const items = source.results || [];
    if (!items.length) continue;
    totalCount += items.length;

    html += `<div class="search-source-group">
      <div class="search-source-label">${escapeHtml(source.sourceName || '未知书源')} (${items.length})</div>`;

    for (const book of items) {
      html += `
      <div class="search-result-card">
        <div class="search-result-cover">
          ${book.coverUrl ? `<img src="${escapeAttr(book.coverUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="cover-placeholder">📖</div>'}
        </div>
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(book.name || '未知书名')}</div>
          <div class="search-result-author">${escapeHtml(book.author || '佚名')}</div>
          ${book.intro ? `<div class="search-result-intro">${escapeHtml(book.intro).slice(0, 120)}</div>` : ''}
          <div class="search-result-meta">
            ${book.lastChapter ? `<span>最新: ${escapeHtml(book.lastChapter)}</span>` : ''}
            ${book.status ? `<span class="badge">${escapeHtml(book.status)}</span>` : ''}
          </div>
        </div>
        <button class="search-download-btn" data-name="${escapeAttr(book.name)}" data-url="${escapeAttr(book.bookUrl)}" data-source="${escapeAttr(source.sourceId)}">下载</button>
      </div>`;
    }

    html += '</div>';
  }

  searchStatus?.classList.remove('hidden');
  searchStatus.textContent = `找到 ${totalCount} 个结果`;
  searchResults.innerHTML = html;

  searchResults.querySelectorAll('.search-download-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const bookUrl = btn.dataset.url;
      const sourceId = btn.dataset.source;
      await startDownload({ name, bookUrl, author: '' }, sourceId);
    });
  });
}

async function startDownload(bookInfo, sourceId) {
  if (!downloadOverlay) return;
  downloadOverlay.classList.remove('hidden');
  if (downloadBookName) downloadBookName.textContent = bookInfo.name;
  if (downloadStatus) downloadStatus.textContent = '获取章节列表...';
  if (downloadProgressFill) downloadProgressFill.style.width = '0%';

  try {
    // 下载章节数据
    const data = await downloadBook(sourceId, bookInfo.bookUrl, bookInfo.name, bookInfo.author);

    if (downloadStatus) downloadStatus.textContent = '生成 EPUB...';
    if (downloadProgressFill) downloadProgressFill.style.width = '50%';

    // 前端生成 EPUB
    const epubBuffer = await generateEpub({
      title: bookInfo.name || '未知',
      author: bookInfo.author || '佚名',
      chapters: data.chapters.filter(c => c.content),
    });

    if (downloadStatus) downloadStatus.textContent = '保存中...';
    if (downloadProgressFill) downloadProgressFill.style.width = '90%';

    const blob = new Blob([epubBuffer], { type: 'application/epub+zip' });
    const arrayBuffer = await saveDownloadedBook(blob, bookInfo.name);

    if (downloadStatus) downloadStatus.textContent = '下载完成！';
    if (downloadProgressFill) downloadProgressFill.style.width = '100%';

    setTimeout(async () => {
      downloadOverlay?.classList.add('hidden');
      if (onOpenBook) onOpenBook(bookInfo.name, arrayBuffer, 'epub');
    }, 800);
  } catch (e) {
    if (downloadStatus) downloadStatus.textContent = `下载失败: ${e.message}`;
    setTimeout(() => downloadOverlay?.classList.add('hidden'), 2000);
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
