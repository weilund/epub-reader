import { fetchHtml, fetchWithPost } from './http-client.js';
import { extractList, extract } from './selector.js';

// 缓存已加载的规则
let _rulesCache = null;

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function resolveUrl(baseUrl, path) {
  if (!path) return baseUrl;
  if (path.startsWith('http')) return path;
  try {
    return new URL(path, baseUrl).href;
  } catch {
    return baseUrl + (path.startsWith('/') ? path : '/' + path);
  }
}

// ===== 规则加载 =====

export async function loadRules() {
  if (_rulesCache) return _rulesCache;

  const files = ['main.json', 'proxy-required.json', 'rate-limit.json', 'cloudflare.json'];
  const rules = [];

  for (const file of files) {
    try {
      const resp = await fetch(`/rules/${file}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = Array.isArray(data) ? data : [data];
      for (const r of items) {
        if (r.disabled) continue;
        r._file = file;
        r._id = `${file.replace('.json', '')}-${rules.length}`;
        rules.push(r);
      }
    } catch (e) {
      console.warn(`[engine] 规则加载失败: ${file}`, e);
    }
  }

  _rulesCache = rules;
  return rules;
}

// ===== 搜索 =====

async function search(keyword, soRule) {
  const s = soRule.search;
  // 支持 {{key}} 和 %s 两种占位符
  let searchUrl = s.url.replace(/{{\s*key\s*}}/g, encodeURIComponent(keyword));
  searchUrl = searchUrl.replace(/%s/g, encodeURIComponent(keyword));
  const method = (s.method || 'get').toLowerCase();

  let html;
  if (method === 'post' && s.data) {
    html = await fetchWithPost(searchUrl, s.data, keyword, s.cookies);
  } else {
    html = await fetchHtml(searchUrl, s.cookies);
  }

  const doc = parseHtml(html);

  const results = extractList(doc, s.result, {
    name: s.bookName,
    author: s.author,
    bookUrl: s.bookUrl || s.detailUrl,
    coverUrl: s.coverUrl || s.cover,
    intro: s.intro,
    lastChapter: s.latestChapter,
    kind: s.category || s.kind,
    status: s.status,
    wordCount: s.wordCount,
  });

  for (const r of results) {
    r.bookUrl = resolveUrl(soRule.url, r.bookUrl);
    r.coverUrl = r.coverUrl ? resolveUrl(soRule.url, r.coverUrl) : '';
    r.sourceName = soRule.name || '';
  }

  return results;
}

export async function searchAll(keyword) {
  const rules = await loadRules();
  const enabled = rules.filter(r =>
    r.search && !r.search.disabled && r.search.url
  );
  console.log(`[搜索] 关键词: "${keyword}", 可用书源: ${enabled.length}个`);

  const settled = await Promise.allSettled(
    enabled.map(r =>
      search(keyword, r).then(results => ({
        sourceId: r._id,
        sourceName: r.name,
        results,
      }))
    )
  );

  const all = [];
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const item = settled[i];
    if (item.status === 'fulfilled') {
      const v = item.value;
      if (v.results.length > 0) {
        console.log(`[搜索] ${v.sourceName}: ${v.results.length}条`);
        all.push(v);
      }
    } else {
      const errMsg = item.reason?.message || String(item.reason);
      console.warn(`[搜索] ${enabled[i].name}: 失败 - ${errMsg}`);
      errors.push({ sourceName: enabled[i].name, error: errMsg });
    }
  }

  return { results: all, errors };
}

// ===== 目录获取 =====

function extractBookId(bookUrl, urlPattern) {
  if (!urlPattern) return null;
  try {
    const escaped = urlPattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\(\.\*\?\\\)/g, '(.+?)');
    const m = bookUrl.match(new RegExp(escaped));
    return m ? m[1] : null;
  } catch { return null; }
}

async function getChapters(rule, bookUrl) {
  let tocUrl = bookUrl;
  if (rule.toc?.url) {
    const bookId = extractBookId(bookUrl, rule.book?.url);
    tocUrl = rule.toc.url.replace('%s', bookId || '');
    if (!tocUrl.startsWith('http')) tocUrl = resolveUrl(rule.url, tocUrl);
  }

  const html = await fetchHtml(tocUrl);
  const doc = parseHtml(html);
  return extractChapterList(doc, rule, tocUrl);
}

function extractChapterList(doc, rule, baseUrl) {
  const tocRule = rule.toc || {};
  const chapterSelector = tocRule.item || 'a';
  const items = doc.querySelectorAll(chapterSelector);
  const chapters = [];

  items.forEach((el, i) => {
    const tagName = (el.tagName || '').toLowerCase();
    const name = tagName === 'a' ? (el.textContent?.trim() || '') : (el.querySelector('a')?.textContent?.trim() || el.textContent?.trim() || '');
    const url = tagName === 'a' ? (el.getAttribute('href') || '') : (el.querySelector('a')?.getAttribute('href') || '');

    if (name && url) {
      chapters.push({
        index: i,
        name: name.replace(/^\d+[\.\、\s]+/, '').trim(),
        url: resolveUrl(baseUrl, url),
      });
    }
  });

  if (tocRule.isDesc) chapters.reverse();
  return chapters;
}

// ===== 章节内容 =====

async function getChapterContent(rule, chapterUrl) {
  const html = await fetchHtml(chapterUrl);
  const doc = parseHtml(html);
  const chapterRule = rule.chapter || {};

  let content = extract(doc, chapterRule.content || 'body', 'html');

  // filterTag
  if (chapterRule.filterTag) {
    const tags = chapterRule.filterTag.split(/\s+/).filter(Boolean);
    const div = doc.createElement('div');
    div.innerHTML = content;
    for (const tag of tags) {
      div.querySelectorAll(tag).forEach(el => el.remove());
    }
    content = div.innerHTML;
  }

  // filterTxt
  if (chapterRule.filterTxt) {
    const patterns = chapterRule.filterTxt.split('|');
    for (const pat of patterns) {
      try {
        content = content.replace(new RegExp(pat, 'gm'), '');
      } catch {}
    }
  }

  return content;
}

// ===== 下载整本书 =====

export async function downloadBook(ruleId, bookUrl, bookName, author) {
  const rules = await loadRules();
  const rule = rules.find(r => r._id === ruleId || r.name === ruleId);
  if (!rule) throw new Error(`书源 ${ruleId} 不存在`);

  const chapters = await getChapters(rule, bookUrl);
  if (!chapters.length) throw new Error('未找到章节列表');

  const concurrency = 5;
  const contents = [];

  for (let i = 0; i < chapters.length; i += concurrency) {
    const batch = chapters.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ch) => {
        const content = await getChapterContent(rule, ch.url);
        return { ...ch, content };
      })
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') contents.push(r.value);
    }
  }

  return { bookName: bookName || rule.name || '', author: author || '', chapters: contents };
}
