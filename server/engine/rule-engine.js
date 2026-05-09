const cheerio = require('cheerio');
const { fetchHtml } = require('./http-client');
const { extractList, extract } = require('./selector');
const { loadRules } = require('../rules');
const config = require('../config');

function fillUrl(template, vars) {
  return template
    .replace(/\{\{key\}\}/g, encodeURIComponent(vars.key || ''))
    .replace(/\{\{page\}\}/g, String(vars.page || 1));
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

// ===== 搜索 =====

async function search(keyword, soRule) {
  const s = soRule.search;
  const searchUrl = s.url.replace(/{{\s*key\s*}}/g, encodeURIComponent(keyword));
  const method = (s.method || 'get').toLowerCase();

  let html;
  if (method === 'post' && s.data) {
    html = await fetchWithPost(searchUrl, s.data, keyword, s.cookies);
  } else {
    html = await fetchHtml(searchUrl, s.cookies);
  }

  const $ = cheerio.load(html);

  const results = extractList($, s.result, {
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

async function fetchWithPost(url, dataTemplate, keyword, cookies) {
  // dataTemplate 格式: "{searchkey: %s, searchtype: all}" 或 "{submit: Search, searchKey: %s}"
  const body = new URLSearchParams();
  const cleaned = dataTemplate.replace(/[{}]/g, '').trim();
  const pairs = cleaned.split(',').map(s => s.trim());
  for (const pair of pairs) {
    const [k, ...vParts] = pair.split(':');
    let v = vParts.join(':').trim();
    if (v === '%s' || v === '{{key}}') {
      v = keyword;
    }
    body.append(k.trim(), v);
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': config.USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...(cookies ? { 'Cookie': cookies } : {}),
    },
    body: body.toString(),
    signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);

  const { decodeBody } = require('./http-client');
  // inline decode for post responses
  const buffer = Buffer.from(await resp.arrayBuffer());
  const iconv = require('iconv-lite');
  const ct = resp.headers.get('content-type');
  const charset = ct && ct.includes('gb') ? 'gbk' : 'utf-8';
  return charset === 'gbk' ? iconv.decode(buffer, 'gbk') : new TextDecoder(charset).decode(buffer);
}

async function searchAll(keyword) {
  const rules = loadRules();
  const enabled = rules.filter(r =>
    r.search && !r.search.disabled && !r.disabled && r.search.url
  );

  const settled = await Promise.allSettled(
    enabled.map(r =>
      search(keyword, r).then(results => ({
        sourceId: r._id || r.name,
        sourceName: r.name,
        results,
      }))
    )
  );

  const all = [];
  const errors = {};
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      all.push(item.value);
    } else {
      errors[item.reason?.message || 'unknown'] = item.reason?.message;
    }
  }

  return { results: all, errors };
}

// ===== 目录获取 =====

async function getChapters(rule, bookUrl) {
  // 如果有独立的 toc URL 模板
  let tocUrl = bookUrl;
  if (rule.toc?.url) {
    const bookId = extractBookId(bookUrl, rule.book?.url);
    tocUrl = rule.toc.url.replace('%s', bookId || '');
    if (!tocUrl.startsWith('http')) tocUrl = resolveUrl(rule.url, tocUrl);
  }

  const html = await fetchHtml(tocUrl);
  const $ = cheerio.load(html);
  return extractChapterList($, rule, tocUrl);
}

function extractBookId(bookUrl, urlPattern) {
  if (!urlPattern) return null;
  try {
    const re = new RegExp(urlPattern.replace(/([.*+?^=!:${}()|[\]/\\])/g, '\\$1').replace(/\\\(\.\*\?\\\)/g, '(.+?)'));
    const m = bookUrl.match(re);
    return m ? m[1] : null;
  } catch { return null; }
}

function extractChapterList($, rule, baseUrl) {
  const tocRule = rule.toc || {};
  const chapterSelector = tocRule.item || 'a';
  const items = $(chapterSelector);
  const chapters = [];

  items.each((i, el) => {
    const $el = $(el);
    // toc.item 直接选中 <a> 标签
    const tagName = (el.tagName || '').toLowerCase();
    const name = tagName === 'a' ? $el.text().trim() : ($el.find('a').first().text().trim() || $el.text().trim());
    const url = tagName === 'a' ? $el.attr('href') || '' : ($el.find('a').first().attr('href') || '');

    if (name && url) {
      chapters.push({
        index: i,
        name: name.replace(/^\d+[\.\、\s]+/, '').trim(),
        url: resolveUrl(baseUrl, url),
      });
    }
  });

  // 倒序
  if (tocRule.isDesc) chapters.reverse();

  return chapters;
}

// ===== 章节内容获取 =====

async function getChapterContent(rule, chapterUrl) {
  const html = await fetchHtml(chapterUrl);
  const $ = cheerio.load(html);
  const chapterRule = rule.chapter || {};

  let content = extract($, chapterRule.content || 'body', 'html');

  // filterTag: 移除指定标签
  if (chapterRule.filterTag) {
    const tags = chapterRule.filterTag.split(/\s+/).filter(Boolean);
    const $content = cheerio.load(`<div>${content}</div>`);
    for (const tag of tags) {
      $content(tag).remove();
    }
    content = $content('body').html() || $content('div').html() || content;
  }

  // filterTxt: 正则过滤
  if (chapterRule.filterTxt) {
    const patterns = chapterRule.filterTxt.split('|');
    for (const pat of patterns) {
      try {
        content = content.replace(new RegExp(pat, 'gm'), '');
      } catch {}
    }
  }

  // paragraphTag: 段落标签处理
  if (chapterRule.paragraphTag) {
    const tag = chapterRule.paragraphTag.replace(/\+$/, '');
    content = content.replace(new RegExp(`<${tag}\\s*/?>`, 'g'), `<${tag}>`);
  }

  return content;
}

// ===== 下载整本书 =====

async function downloadBook(ruleId, bookUrl, bookName, author) {
  const rules = loadRules();
  const rule = rules.find(r => (r._id === ruleId || r.name === ruleId));

  if (!rule) throw new Error(`书源 ${ruleId} 不存在`);

  const chapters = await getChapters(rule, bookUrl);
  if (!chapters.length) throw new Error('未找到章节列表');

  const concurrency = config.DOWNLOAD_CONCURRENCY;
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

  return { bookName: bookName || rule.name, author, chapters: contents };
}

module.exports = { search, searchAll, getChapters, getChapterContent, downloadBook, loadRules };
