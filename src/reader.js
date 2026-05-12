import ePub from 'epubjs';
import { saveProgress, loadProgress } from './store.js';
import { getEpubTheme } from './theme.js';
import { flattenToc } from './toc.js';

let book = null;
let rendition = null;

// 最后一次 relocat 的 CFI，用于字号变更后恢复位置
let lastLocationCfi = null;
// 字号切换时暂时屏蔽自动保存，避免错误覆盖断点
let suppressAutoSave = false;

// 回调
const callbacks = {};

export function setCallbacks(cbs) {
  Object.assign(callbacks, cbs);
}

function emit(name, ...args) {
  callbacks[name]?.(...args);
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
    emit('onTitle', meta.title || fileName);
  } catch {
    emit('onTitle', fileName);
  }

  // 目录
  try {
    const nav = await book.loaded.navigation;
    emit('onTocReady', flattenToc(nav.toc));
  } catch (e) {
    console.warn('[reader] 获取目录失败:', e.message);
  }

  // 位置变化监听
  rendition.on('relocated', (location) => {
    const cfi = location.start.cfi;
    lastLocationCfi = cfi;
    const displayed = location.start.displayed;
    const percentage = displayed.total > 0 ? displayed.page / displayed.total : 0;
    emit('onProgress', { cfi, percentage });

    // 传出当前章节 href（用于主界面更新章节名）
    if (location.start.href) {
      emit('onChapter', location.start.href);
    }

    // 字号切换中，不保存进度（布局变化导致的错位）
    if (suppressAutoSave) return;

    // 自动保存进度
    saveProgress(fileName, { cfi, percentage }).catch(() => {});
  });

  // 显示指定位置或章首
  await rendition.display(startCfi || undefined);

  // 标记活跃的目录项
  if (callbacks.onTocReady) {
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
  } catch (e) {
    console.warn('[reader] 跳转失败:', e.message);
  }
}

// 字号
let currentFontSize = 100;
export function setFontSize(percent) {
  currentFontSize = percent;
  if (!rendition) return;

  const prevCfi = lastLocationCfi;
  suppressAutoSave = true;
  rendition.themes.fontSize(`${percent}%`);

  if (prevCfi) {
    rendition.display(prevCfi).finally(() => {
      suppressAutoSave = false;
    });
  } else {
    suppressAutoSave = false;
  }
}

export function getCurrentCfi() {
  return lastLocationCfi;
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
  try { r = rendition; rendition = null; if (r) { r.off?.('relocated'); r.destroy?.(); } } catch (e) {
    console.warn('[reader] 销毁 Rendition 失败:', e.message);
  }
  try { b = book; book = null; if (b) { b.destroy?.(); } } catch (e) {
    console.warn('[reader] 销毁 Book 失败:', e.message);
  }
  lastLocationCfi = null;
  suppressAutoSave = false;
}

// 目录高亮
function highlightActiveToc(location) {
  const cfi = location.start.cfi;
  document.querySelectorAll('.toc-list li').forEach((li) => {
    const itemCfi = li.dataset.cfi;
    li.classList.toggle('active', itemCfi && cfi?.startsWith(itemCfi));
  });
}

