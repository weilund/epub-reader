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

/**
 * 根据 crawl 配置延迟（防止被源站封 IP）
 */
function delay(rule) {
  const crawl = rule.crawl || {};
  const min = crawl.minInterval || 0;
  const max = crawl.maxInterval || 0;
  if (max <= 0) return Promise.resolve();
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== 规则加载 =====

export async function loadRules() {
  if (_rulesCache) return _rulesCache;

  // 加载 so-novel 全部规则文件（含 no-search.json）
  const files = [
    'main.json',
    'proxy-required.json',
    'rate-limit.json',
    'cloudflare.json',
    'no-search.json',
  ];
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
      console.warn(`[engine] 规则加载失败: ${file}`, e.message || e);
    }
  }

  _rulesCache = rules;
  return rules;
}

// ===== 分页工具 =====

/**
 * 翻页收集：从起始 URL 开始，反复提取下一页链接直到无更多页
 */
async function fetchAllPages(startUrl, rule, nextPageSelector, fetchOpts = {}) {
  const results = [];
  const maxPages = 20; // 安全上限
  let url = startUrl;

  for (let page = 0; page < maxPages; page++) {
    await delay(rule);

    const html = fetchOpts.method === 'post'
      ? await fetchWithPost(url, fetchOpts.data, fetchOpts.keyword, fetchOpts.cookies)
      : await fetchHtml(url, fetchOpts.cookies);
    const doc = parseHtml(html);

    results.push({ doc, url });

    if (!nextPageSelector) break;

    // 尝试提取下一页 URL
    const nextEls = doc.querySelectorAll(nextPageSelector);
    if (!nextEls.length) break;

    // 取最后一个匹配的下一页元素
    const nextEl = nextEls[nextEls.length - 1];
    let nextUrl = nextEl.getAttribute('href') || nextEl.value || '';
    if (!nextUrl || nextUrl === '#') break;

    // 同一页？防止死循环
    nextUrl = resolveUrl(url, nextUrl);
    if (nextUrl === url) break;

    url = nextUrl;
  }

  return results;
}

// ===== 搜索 =====

async function search(keyword, soRule) {
  const s = soRule.search;
  if (!s || !s.url) return [];

  // 支持 {{key}} 和 %s 两种占位符
  let searchUrl = s.url.replace(/{{\s*key\s*}}/g, encodeURIComponent(keyword));
  searchUrl = searchUrl.replace(/%s/g, encodeURIComponent(keyword));
  const method = (s.method || 'get').toLowerCase();
  const isPost = method === 'post' && s.data;

  // 处理分页搜索
  let pages;
  if (s.pagination && s.nextPage) {
    pages = await fetchAllPages(searchUrl, soRule, s.nextPage, {
      method: isPost ? 'post' : 'get',
      data: isPost ? s.data : null,
      keyword,
      cookies: s.cookies,
    });
  } else {
    const html = isPost
      ? await fetchWithPost(searchUrl, s.data, keyword, s.cookies)
      : await fetchHtml(searchUrl, s.cookies);
    pages = [{ doc: parseHtml(html), url: searchUrl }];
  }

  // 从每一页提取结果
  const allResults = [];
  for (const { doc } of pages) {
    const pageResults = extractList(doc, s.result, {
      name: s.bookName,
      author: s.author,
      bookUrl: s.bookUrl || s.detailUrl || s.bookName,
      coverUrl: s.coverUrl || s.cover,
      intro: s.intro,
      lastChapter: s.latestChapter,
      kind: s.category || s.kind,
      status: s.status,
      wordCount: s.wordCount,
    });

    for (const r of pageResults) {
      r.bookUrl = resolveUrl(soRule.url, r.bookUrl);
      r.coverUrl = r.coverUrl ? resolveUrl(soRule.url, r.coverUrl) : '';
      r.sourceName = soRule.name || '';
    }

    allResults.push(...pageResults);
  }

  return allResults;
}

export async function searchAll(keyword) {
  // 保持原有接口不变（全量返回）
  const result = { results: [], errors: [] };
  await searchAllStreaming(keyword, {
    onSuccess(sourceName, sourceId, results) {
      if (results.length > 0) {
        result.results.push({ sourceId, sourceName, results });
      }
    },
    onError(sourceName, error) {
      result.errors.push({ sourceName, error });
    },
  });
  return result;
}

/**
 * 流式搜索：每个书源完成后立即回调
 */
export async function searchAllStreaming(keyword, { onSuccess, onError, onStart }) {
  const rules = await loadRules();
  const enabled = rules.filter(r =>
    r.search && !r.search.disabled && r.search.url
  );
  console.log(`[搜索] 关键词: "${keyword}", 可用书源: ${enabled.length}个`);

  // 逐个源执行，而不是等全部完成
  const promises = enabled.map(async (r) => {
    const sourceName = r.name;
    const sourceId = r._id;
    try {
      onStart?.(sourceName, sourceId);
      const results = await search(keyword, r);
      console.log(`[搜索] ${sourceName}: ${results.length}条`);
      onSuccess(sourceName, sourceId, results);
    } catch (e) {
      const errMsg = e.message || String(e);
      console.warn(`[搜索] ${sourceName}: 失败 - ${errMsg}`);
      onError(sourceName, errMsg);
    }
  });

  // 不 await，让调用方决定要不要等全部完成
  await Promise.allSettled(promises);
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
  } catch {
    return null;
  }
}

async function getChapters(rule, bookUrl) {
  let tocUrl = bookUrl;
  const toc = rule.toc || {};

  if (toc.url) {
    const bookId = extractBookId(bookUrl, rule.book?.url);
    const id = bookId || '';
    tocUrl = toc.url.replace('%s', id);
    // 如果有 baseUri，用它组装
    if (toc.baseUri) {
      tocUrl = toc.baseUri.replace('%s', id);
    }
    if (!tocUrl.startsWith('http')) tocUrl = resolveUrl(rule.url, tocUrl);

    // 容错：如果书源 ID 提取失败导致 URL 异常，回退到直接用 bookUrl
    if (!bookId && tocUrl.includes('//')) {
      console.warn(`[目录] 书源 ID 提取失败，回退到 bookUrl: ${bookUrl}`);
      tocUrl = bookUrl;
    }
  }

  // 处理分页目录
  if (toc.pagination && toc.nextPage) {
    const pages = await fetchAllPages(tocUrl, rule, toc.nextPage);
    const allChapters = [];
    for (const { doc } of pages) {
      allChapters.push(...extractChapterList(doc, rule, tocUrl));
    }
    return allChapters;
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
    const name = tagName === 'a'
      ? (el.textContent?.trim() || '')
      : (el.querySelector('a')?.textContent?.trim() || el.textContent?.trim() || '');
    const url = tagName === 'a'
      ? (el.getAttribute('href') || '')
      : (el.querySelector('a')?.getAttribute('href') || '');

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
  const chapterRule = rule.chapter || {};

  // 处理分页正文（有些网站一章分多页）
  let content;
  if (chapterRule.pagination && chapterRule.nextPage) {
    content = await getChapterContentPaginated(rule, chapterUrl);
  } else {
    const html = await fetchHtml(chapterUrl);
    const doc = parseHtml(html);
    content = extract(doc, chapterRule.content || 'body', 'html');
  }

  // filterTag — 移除指定的 HTML 标签
  if (chapterRule.filterTag) {
    const tags = chapterRule.filterTag.split(/\s+/).filter(Boolean);
    if (tags.length > 0) {
      // 用临时 DOM 过滤
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(`<div id="_tmp">${content}</div>`, 'text/html');
      const container = tempDoc.getElementById('_tmp');
      if (container) {
        for (const tag of tags) {
          try {
            container.querySelectorAll(tag).forEach(el => el.remove());
          } catch {
            // 忽略非法选择器
          }
        }
        content = container.innerHTML;
      }
    }
  }

  // filterTxt — 正则移除广告文字
  if (chapterRule.filterTxt) {
    const patterns = chapterRule.filterTxt.split('|');
    for (const pat of patterns) {
      if (!pat) continue;
      try {
        content = content.replace(new RegExp(pat, 'gm'), '');
      } catch {
        // 忽略非法正则
      }
    }
  }

  return content;
}

/**
 * 处理分页正文：获取所有页面内容并拼接
 */
async function getChapterContentPaginated(rule, chapterUrl) {
  const chapterRule = rule.chapter || {};
  let combined = '';
  let url = chapterUrl;
  const visited = new Set();

  for (let page = 0; page < 20; page++) {
    if (visited.has(url)) break;
    visited.add(url);

    await delay(rule);
    const html = await fetchHtml(url);
    const doc = parseHtml(html);

    const pageContent = extract(doc, chapterRule.content || 'body', 'html');
    combined += pageContent;

    // 找下一页
    if (!chapterRule.nextPage) break;
    const nextEls = doc.querySelectorAll(chapterRule.nextPage);
    if (!nextEls.length) break;
    const nextEl = nextEls[nextEls.length - 1];
    let nextUrl = nextEl.getAttribute('href') || '';
    if (!nextUrl || nextUrl === '#') break;
    nextUrl = resolveUrl(url, nextUrl);
    if (nextUrl === url) break;
    url = nextUrl;
  }

  return combined;
}

/**
 * 处理正文段落：根据 paragraphTagClosed 修正段落标签
 * so-novel 规则中 paragraphTagClosed=false 表示源站用 <br> 分行，
 * 需要转换为 <p> 段落
 */
function processParagraphs(content, chapterRule) {
  if (!content) return content;

  const tagClosed = chapterRule.paragraphTagClosed;
  const tag = chapterRule.paragraphTag || '<br>';

  if (tagClosed === false) {
    // 非闭合标签（如 <br>）→ 转为 <p> 段落
    const brRegex = new RegExp(tag.replace('+', '+'), 'gi');
    const paragraphs = content.split(brRegex).filter(s => s.trim());
    if (paragraphs.length > 1) {
      return paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    }
  }

  return content;
}

// ===== 下载整本书 =====

export async function downloadBook(ruleId, bookUrl, bookName, author, onProgress) {
  const rules = await loadRules();
  const rule = rules.find(r => r._id === ruleId || r.name === ruleId);
  if (!rule) throw new Error(`书源 ${ruleId} 不存在`);

  const chapters = await getChapters(rule, bookUrl);
  if (!chapters.length) throw new Error('未找到章节列表');

  // 使用规则配置的并发数，默认 5
  const crawl = rule.crawl || {};
  const concurrency = crawl.concurrency || 5;

  const contents = [];
  let completedChapters = 0;
  const totalChapters = chapters.length;

  for (let i = 0; i < chapters.length; i += concurrency) {
    const batch = chapters.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ch) => {
        await delay(rule);
        const content = await getChapterContent(rule, ch.url);

        // 处理段落
        const processed = processParagraphs(content, rule.chapter || {});

        return { ...ch, content: processed };
      })
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        contents.push(r.value);
      } else {
        console.warn(`[下载] 章节获取失败: ${r.reason?.message || r.reason}`);
      }
    }
    completedChapters += batch.length;
    if (onProgress) {
      onProgress(completedChapters, totalChapters);
    }
  }

  return { bookName: bookName || rule.name || '', author: author || '', chapters: contents };
}

// ===== 增量更新 =====

/**
 * 获取最新章节列表（不下载内容）
 */
export async function fetchLatestChapters(ruleId, bookUrl) {
  const rules = await loadRules();
  const rule = rules.find(r => r._id === ruleId || r.name === ruleId);
  if (!rule) throw new Error(`书源 ${ruleId} 不存在`);
  return await getChapters(rule, bookUrl);
}

/**
 * 比对已存章节与最新章节，返回新增章节
 * @param {string} ruleId  书源 ID
 * @param {string} bookUrl 书籍 URL
 * @param {Array} savedChapters 已存储的章节列表 [{url}]
 * @returns {Array} 新增章节 [{name, url}]
 */
export async function checkForUpdates(ruleId, bookUrl, savedChapters) {
  if (!savedChapters || savedChapters.length === 0) {
    // 没有已存章节 → 全部都是新的
    return await fetchLatestChapters(ruleId, bookUrl);
  }

  const latest = await fetchLatestChapters(ruleId, bookUrl);
  const savedUrls = new Set(savedChapters.map(c => c.url));

  // 找出 URL 不在已存列表中的章节
  return latest.filter(ch => !savedUrls.has(ch.url));
}

/**
 * 下载指定章节的内容
 * @param {string} ruleId      书源 ID
 * @param {Array}  chapters    要下载的章节 [{name, url}]
 * @param {Function} onProgress (done, total) 回调
 * @returns {Array} [{name, url, content}]
 */
export async function downloadChapters(ruleId, chapters, onProgress) {
  const rules = await loadRules();
  const rule = rules.find(r => r._id === ruleId || r.name === ruleId);
  if (!rule) throw new Error(`书源 ${ruleId} 不存在`);

  const crawl = rule.crawl || {};
  const concurrency = crawl.concurrency || 5;
  const results = [];

  for (let i = 0; i < chapters.length; i += concurrency) {
    const batch = chapters.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ch) => {
        await delay(rule);
        const content = await getChapterContent(rule, ch.url);
        const processed = processParagraphs(content, rule.chapter || {});
        return { ...ch, content: processed };
      })
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        console.warn(`[增量] 章节获取失败: ${r.reason?.message || r.reason}`);
      }
    }
    if (onProgress) onProgress(results.length, chapters.length);
  }

  return results;
}
