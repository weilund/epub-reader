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

async function search(keyword, rule) {
  const url = fillUrl(rule.searchUrl, { key: keyword });
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const results = extractList($, rule.ruleSearch.bookList, {
    name: rule.ruleSearch.name,
    author: rule.ruleSearch.author,
    bookUrl: rule.ruleSearch.bookUrl || rule.ruleSearch.detailUrl,
    coverUrl: rule.ruleSearch.coverUrl || rule.ruleSearch.cover,
    intro: rule.ruleSearch.intro,
    lastChapter: rule.ruleSearch.lastChapter,
    kind: rule.ruleSearch.kind,
    status: rule.ruleSearch.status,
    wordCount: rule.ruleSearch.wordCount,
  });

  // 补齐相对URL
  for (const r of results) {
    r.bookUrl = resolveUrl(rule.bookSourceUrl, r.bookUrl);
    r.coverUrl = r.coverUrl ? resolveUrl(rule.bookSourceUrl, r.coverUrl) : '';
    r.sourceName = rule.bookSourceName || rule.name || '';
  }

  return results;
}

async function searchAll(keyword) {
  const rules = loadRules();
  const sources = rules.map((r, i) => ({ ...r, _id: String(i) }));
  const enabled = sources.filter(s => !s.disabled && s.searchUrl && s.ruleSearch);

  const settled = await Promise.allSettled(
    enabled.map(s => search(keyword, s).then(results => ({ sourceId: s._id, sourceName: s.bookSourceName, results })))
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

async function getChapters(rule, bookUrl) {
  const html = await fetchHtml(bookUrl);
  const $ = cheerio.load(html);

  // 尝试找到目录页链接
  let tocUrl = bookUrl;
  if (rule.ruleBookInfo?.tocUrl) {
    const tocPath = extract($, rule.ruleBookInfo.tocUrl, 'href');
    if (tocPath) tocUrl = resolveUrl(bookUrl, tocPath);
  }

  if (tocUrl !== bookUrl) {
    const tocHtml = await fetchHtml(tocUrl);
    const $$ = cheerio.load(tocHtml);
    return extractChapterList($$, rule, tocUrl);
  }

  return extractChapterList($, rule, bookUrl);
}

function extractChapterList($, rule, baseUrl) {
  const tocRule = rule.ruleToc || {};
  const items = $(tocRule.chapterList || 'a');
  const chapters = [];
  items.each((i, el) => {
    const $el = $(el);
    const name = tocRule.chapterName
      ? extractFromRule($, el, tocRule.chapterName, 'text')
      : $el.text().trim();
    const url = tocRule.chapterUrl
      ? extractFromRule($, el, tocRule.chapterUrl, 'href')
      : $el.attr('href') || '';

    if (name && url) {
      chapters.push({
        index: i,
        name: name.replace(/^\d+[\.\、\s]+/, '').trim(),
        url: resolveUrl(baseUrl, url),
      });
    }
  });
  return chapters;
}

function extractFromRule($, el, ruleStr, defaultType) {
  const { parseSelector } = require('./selector');
  const $el = $(el);
  const parsed = parseSelector(ruleStr);
  const type = parsed.extractType !== 'text' ? parsed.extractType : defaultType;
  return extractSingle($el, parsed, type);
}

function extractSingle($el, parsed, type) {
  let result;
  switch (type) {
    case 'html': result = $el.html() || ''; break;
    case 'href': result = $el.attr('href') || ''; break;
    case 'src': result = $el.attr('src') || ''; break;
    default: result = $el.text().trim();
  }
  if (parsed.jsCode && result) {
    const { runJs } = require('./js-processor');
    result = runJs(parsed.jsCode, { result });
  }
  return typeof result === 'string' ? result.trim() : '';
}

async function getChapterContent(rule, chapterUrl) {
  const html = await fetchHtml(chapterUrl);
  const $ = cheerio.load(html);
  const contentRule = rule.ruleContent || {};
  return extract($, contentRule.content || 'body', 'html');
}

async function downloadBook(ruleId, bookUrl, bookName, author) {
  const rules = loadRules();
  const rule = rules[parseInt(ruleId, 10)] || rules.find(r => r.bookSourceName === ruleId);

  if (!rule) throw new Error(`书源 ${ruleId} 不存在`);

  const chapters = await getChapters(rule, bookUrl);
  if (!chapters.length) throw new Error('未找到章节列表');

  // 并发获取章节内容
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

  return { bookName, author, chapters: contents };
}

module.exports = { search, searchAll, getChapters, getChapterContent, downloadBook, loadRules };
