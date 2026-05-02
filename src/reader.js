import ePub from 'epubjs';
import { saveProgress, loadProgress } from './store.js';
import { getEpubTheme } from './theme.js';

let book = null;
let rendition = null;

// 回调
let onProgress = null;     // fn({ cfi, percentage })
let onTitle = null;        // fn(title)
let onTocReady = null;     // fn(tocItems)
let onChapter = null;      // fn(href)

export function setCallbacks(cbs) {
  if (cbs.onProgress) onProgress = cbs.onProgress;
  if (cbs.onTitle) onTitle = cbs.onTitle;
  if (cbs.onTocReady) onTocReady = cbs.onTocReady;
  if (cbs.onChapter) onChapter = cbs.onChapter;
}

// 加载并渲染
export async function loadBook(arrayBuffer, fileName, startCfi) {
  // 清理旧实例（确保不会抛出异常）
  destroyReader();

  book = ePub(arrayBuffer);
  rendition = book.renderTo('viewerContainer', {
    width: '100%',
    height: '100%',
    method: 'continuous',
    flow: 'paginated',
    spread: 'none',       // 手机永远单页
    manager: 'continuous',
  });

  // 获取书名
  try {
    const meta = await book.loaded.metadata;
    if (onTitle) onTitle(meta.title || fileName);
  } catch {
    if (onTitle) onTitle(fileName);
  }

  // 目录
  try {
    const nav = await book.loaded.navigation;
    if (onTocReady) onTocReady(flattenToc(nav.toc));
  } catch {
    // 没有目录也不崩溃
  }

  // 位置变化监听
  rendition.on('relocated', (location) => {
    const cfi = location.start.cfi;
    const displayed = location.start.displayed;
    const percentage = displayed.total > 0 ? displayed.page / displayed.total : 0;
    if (onProgress) onProgress({ cfi, percentage });

    // 传出当前章节 href（用于主界面更新章节名）
    if (onChapter && location.start.href) {
      onChapter(location.start.href);
    }

    // 自动保存进度
    saveProgress(fileName, { cfi, percentage }).catch(() => {});
  });

  // 显示指定位置或章首
  await rendition.display(startCfi || undefined);

  // 标记活跃的目录项
  if (startCfi && onTocReady) {
    rendition.on('relocated', highlightActiveToc);
  }
}

// 翻页
export function nextPage() {
  if (rendition) rendition.next();
}

export function prevPage() {
  if (rendition) rendition.prev();
}

// 跳到指定位置（支持 href 路径和 CFI）
export async function goTo(target) {
  if (!rendition || !target) return;
  try {
    // 如果是 CFI 格式（以 /6/ 开头），直接跳转
    if (target.startsWith('/6/')) {
      await rendition.display(target);
    } else {
      // 尝试用 spine 解析路径（支持 text/chapter1.xhtml 格式）
      const spineItem = book?.spine?.get(target);
      if (spineItem?.cfi) {
        await rendition.display(spineItem.cfi);
      } else {
        // 直接传 href，epub.js 内部会尝试解析
        await rendition.display(target);
      }
    }
  } catch {
    // 静默失败，至少不崩溃
  }
}

// 字号
let currentFontSize = 100;
export function setFontSize(percent) {
  currentFontSize = percent;
  if (rendition) {
    rendition.themes.fontSize(`${percent}%`);
  }
}

// 主题
export function applyTheme(themeName) {
  if (!rendition) return;
  const styles = getEpubTheme(themeName);
  rendition.themes.register(themeName, styles);
  rendition.themes.select(themeName);
}

// 清理
export function destroyReader() {
  let r, b;
  try { r = rendition; rendition = null; if (r) { r.off?.('relocated'); r.destroy?.(); } } catch {}
  try { b = book; book = null; if (b) { b.destroy?.(); } } catch {}
}

// 目录高亮
function highlightActiveToc(location) {
  const cfi = location.start.cfi;
  document.querySelectorAll('.toc-list li').forEach((li) => {
    const itemCfi = li.dataset.cfi;
    li.classList.toggle('active', itemCfi && cfi?.startsWith(itemCfi));
  });
}

// 展平嵌套目录
function flattenToc(toc, depth = 0) {
  let items = [];
  for (const item of toc) {
    items.push({ label: item.label, cfi: item.href, depth });
    if (item.subitems && item.subitems.length > 0) {
      items = items.concat(flattenToc(item.subitems, depth + 1));
    }
  }
  return items;
}
