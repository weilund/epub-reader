import { searchAllStreaming } from './engine/rule-engine.js';
import { downloadBook } from './engine/rule-engine.js';
import { generateEpub } from './engine/epub-generator.js';
import { saveDownloadedBook } from './download.js';
import { saveChapterMeta } from './store.js';

let searchPanel, searchInput, searchResults, searchStatus, searchLoading;
let downloadOverlay, downloadBookName, downloadProgressFill, downloadStatus;
let onOpenBook = null;
let abortSearch = false; // 用于取消搜索

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

  // tabSearch 的聚焦逻辑已在 main.js 标签切换中处理
  // 此处不重复绑定，避免 iOS 上 input focus 触发自动缩放
}

async function doSearch() {
  const q = searchInput?.value.trim();
  if (!q || !searchResults) return;

  // 重置状态
  abortSearch = false;
  searchResults.innerHTML = '';
  searchStatus?.classList.remove('hidden');
  searchStatus.innerHTML = '<span class="search-status-active">🔍 搜索中…</span>';
  searchLoading?.classList.add('hidden');

  let totalResults = 0;
  let totalSources = 0;
  let doneSources = 0;
  let failSources = 0;

  try {
    await searchAllStreaming(q, {
      onStart(sourceName) {
        totalSources++;
        appendSourceStatus(sourceName, '⏳');
      },
      onSuccess(sourceName, sourceId, results) {
        doneSources++;
        totalResults += results.length;
        updateSourceStatus(sourceName, `✅ ${results.length}条`);

        if (results.length > 0) {
          appendSourceResults(sourceName, sourceId, results);
        }

        updateSummary(totalResults, totalSources, doneSources, failSources);
      },
      onError(sourceName, error) {
        failSources++;
        const shortMsg = error.length > 60 ? error.slice(0, 60) + '…' : error;
        updateSourceStatus(sourceName, `❌ ${shortMsg}`);
        updateSummary(totalResults, totalSources, doneSources, failSources);
      },
    });
  } catch (e) {
    searchStatus.innerHTML = `<span class="search-error">搜索异常: ${escapeHtml(e.message)}</span>`;
  }

  if (totalResults === 0) {
    searchResults.innerHTML = '<div class="search-empty">未找到结果，换个关键词试试</div>';
  }

  searchStatus.innerHTML = updateSummary(totalResults, totalSources, doneSources, failSources, true);
}

// ===== 状态栏 =====

function updateSummary(total, totalSrc, done, fail, finished = false) {
  const running = totalSrc - done - fail;
  let html = '';
  if (finished) {
    html = `搜索完成：${total} 个结果（${done} 个书源成功，${fail} 个失败）`;
  } else {
    html = `搜索中… ${done + fail}/${totalSrc} 个书源完成`;
    if (running > 0) html += `（${running} 个进行中）`;
    if (total > 0) html += `，已找到 ${total} 个结果`;
  }
  if (searchStatus) {
    searchStatus.innerHTML = html;
  }
  return html;
}

function appendSourceStatus(name, status) {
  const container = document.getElementById('sourceStatusList') || createStatusContainer();
  const row = document.createElement('div');
  row.className = 'source-status-row';
  row.id = `src-status-${safeId(name)}`;
  row.innerHTML = `<span class="source-status-icon">${status}</span><span class="source-status-name">${escapeHtml(name)}</span>`;
  container.appendChild(row);
}

function updateSourceStatus(name, status) {
  const row = document.getElementById(`src-status-${safeId(name)}`);
  if (row) {
    row.innerHTML = `<span class="source-status-icon"></span><span class="source-status-name">${escapeHtml(name)}</span> <span class="source-status-msg">${status}</span>`;
  }
}

function createStatusContainer() {
  const div = document.createElement('div');
  div.id = 'sourceStatusList';
  div.className = 'source-status-list';
  searchResults?.parentNode?.insertBefore(div, searchResults);
  return div;
}

function safeId(s) {
  return (s || '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
}

// ===== 结果渲染 =====
const MAX_INITIAL_RESULTS = 8;

function appendSourceResults(sourceName, sourceId, results) {
  if (!searchResults) return;
  const total = results.length;
  const showLimit = total > MAX_INITIAL_RESULTS;
  const visible = showLimit ? results.slice(0, MAX_INITIAL_RESULTS) : results;
  const groupId = safeId(sourceId);

  let html = `<div class="search-source-group" data-group-id="${groupId}">
    <div class="search-source-label">${escapeHtml(sourceName)} (${total})</div>`;

  function renderCards(list) {
    let cards = '';
    for (const book of list) {
      cards += `
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
      <button class="search-download-btn" data-name="${escapeAttr(book.name)}" data-url="${escapeAttr(book.bookUrl)}" data-source="${escapeAttr(sourceId)}">下载</button>
    </div>`;
    }
    return cards;
  }

  html += renderCards(visible);

  if (showLimit) {
    html += `<button class="search-toggle-btn" data-group-id="${groupId}" data-expanded="false">显示全部 ${total} 条 ▾</button>`;
  }

  html += '</div>';

  // 插入到结果区末尾
  searchResults.insertAdjacentHTML('beforeend', html);

  // 绑定下载按钮
  bindDownloadBtns();

  // 绑定展开/折叠按钮
  if (showLimit) {
    const toggleBtn = searchResults.querySelector(`.search-toggle-btn[data-group-id="${groupId}"]`);
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.dataset.expanded === 'true';
        const group = document.querySelector(`.search-source-group[data-group-id="${groupId}"]`);
        if (!group) return;

        // 移除旧的卡片（保留 label 和 toggle 自身）
        const cards = group.querySelectorAll('.search-result-card');
        cards.forEach(c => c.remove());

        if (expanded) {
          // 收起：只显示前 MAX_INITIAL_RESULTS 条
          group.insertAdjacentHTML('beforeend', renderCards(results.slice(0, MAX_INITIAL_RESULTS)));
          toggleBtn.textContent = `显示全部 ${total} 条 ▾`;
          toggleBtn.dataset.expanded = 'false';
        } else {
          // 展开：显示全部
          group.insertAdjacentHTML('beforeend', renderCards(results));
          toggleBtn.textContent = `收起 ▴`;
          toggleBtn.dataset.expanded = 'true';
        }
        // 重新绑定新卡片的下载按钮
        bindDownloadBtns();
      });
    }
  }
}

function bindDownloadBtns() {
  searchResults.querySelectorAll('.search-download-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const bookUrl = btn.dataset.url;
      const sourceId = btn.dataset.source;
      await startDownload({ name, bookUrl, author: '' }, sourceId);
    });
  });
}

// ===== 下载 =====

async function startDownload(bookInfo, sourceId) {
  if (!downloadOverlay) return;
  downloadOverlay.classList.remove('hidden');
  if (downloadBookName) downloadBookName.textContent = bookInfo.name;
  if (downloadStatus) downloadStatus.textContent = '获取章节列表…';
  if (downloadProgressFill) downloadProgressFill.style.width = '0%';

  try {
    // 下载章节（带进度回调：0～80%）
    const data = await downloadBook(sourceId, bookInfo.bookUrl, bookInfo.name, bookInfo.author, (done, total) => {
      const pct = Math.min(80, Math.round((done / total) * 80));
      if (downloadProgressFill) downloadProgressFill.style.width = `${pct}%`;
      if (downloadStatus) downloadStatus.textContent = `下载章节 ${done}/${total}…`;
    });

    if (downloadStatus) downloadStatus.textContent = '生成 EPUB…';
    if (downloadProgressFill) downloadProgressFill.style.width = '80%';

    const epubBuffer = await generateEpub({
      title: bookInfo.name || '未知',
      author: bookInfo.author || '佚名',
      chapters: data.chapters.filter(c => c.content),
    });

    if (downloadStatus) downloadStatus.textContent = '保存中…';
    if (downloadProgressFill) downloadProgressFill.style.width = '90%';

    // 保存章节元数据（用于后续增量更新）
    await saveChapterMeta(bookInfo.name, data.chapters.map(ch => ({
      index: ch.index,
      name: ch.name || ch.title,
      url: ch.url,
    }))).catch(() => {});

    const blob = new Blob([epubBuffer], { type: 'application/epub+zip' });
    const arrayBuffer = await saveDownloadedBook(blob, bookInfo.name);

    if (downloadStatus) downloadStatus.textContent = '下载完成！';
    if (downloadProgressFill) downloadProgressFill.style.width = '100%';

    setTimeout(async () => {
      downloadOverlay?.classList.add('hidden');
      if (onOpenBook) {
        onOpenBook(bookInfo.name, arrayBuffer, 'epub', {
          sourceId,
          bookUrl: bookInfo.bookUrl,
          author: bookInfo.author,
        });
      }
    }, 800);
  } catch (e) {
    if (downloadStatus) downloadStatus.textContent = `下载失败: ${e.message}`;
    setTimeout(() => downloadOverlay?.classList.add('hidden'), 2000);
  }
}

// ===== 工具 =====

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
