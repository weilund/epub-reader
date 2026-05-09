const { runJs } = require('./js-processor');

/**
 * 解析选择器字符串
 * 支持格式:
 *   "div.result a"              → CSS选择器, 默认提取text
 *   "div.result a@text"         → 提取text
 *   "div.result a@html"         → 提取innerHTML
 *   "div.result a@href"         → 提取href属性
 *   "div.result a@src"          → 提取src属性
 *   "div.result a@attr:data-x"  → 提取自定义属性
 *   "div.author@js:r.replace('作者：','')" → JS后处理
 */
function parseSelector(raw) {
  let jsCode = null;
  let selector = raw;

  const jsIdx = selector.indexOf('@js:');
  if (jsIdx !== -1) {
    jsCode = selector.slice(jsIdx + 4);
    selector = selector.slice(0, jsIdx);
  }

  const attrMap = { text: 'text', html: 'html', href: 'href', src: 'src' };
  let extractType = 'text';
  let attrName = null;

  const lastAt = selector.lastIndexOf('@');
  if (lastAt !== -1) {
    const suffix = selector.slice(lastAt + 1);
    if (suffix.startsWith('attr:')) {
      extractType = 'attr';
      attrName = suffix.slice(5);
      selector = selector.slice(0, lastAt);
    } else if (attrMap[suffix]) {
      extractType = attrMap[suffix];
      selector = selector.slice(0, lastAt);
    }
  }

  return { selector: selector.trim(), extractType, attrName, jsCode };
}

/**
 * 从 cheerio 加载的文档中按选择器规则提取值
 * @param {import('cheerio').CheerioAPI} $ - cheerio实例
 * @param {string} ruleStr - 选择器规则字符串
 * @param {string} defaultType - 默认提取类型 (text/html/href/src)
 * @returns {string}
 */
function extract($, ruleStr, defaultType) {
  if (!ruleStr) return '';

  const parsed = parseSelector(ruleStr);
  const type = (parsed.extractType !== 'text' || defaultType === 'text')
    ? parsed.extractType
    : (defaultType || parsed.extractType);

  const el = $(parsed.selector).first();
  if (!el.length) return '';

  let result;
  switch (type) {
    case 'html':
      result = el.html() || '';
      break;
    case 'href':
      result = el.attr('href') || '';
      break;
    case 'src':
      result = el.attr('src') || el.attr('data-src') || el.attr('data-original') || '';
      break;
    case 'attr':
      result = el.attr(parsed.attrName) || '';
      break;
    default:
      result = el.text().trim();
  }

  if (parsed.jsCode && result) {
    result = runJs(parsed.jsCode, { result });
  }

  return typeof result === 'string' ? result.trim() : String(result || '');
}

/**
 * 按规则选择所有元素并提取
 * @param {import('cheerio').CheerioAPI} $ - cheerio实例
 * @param {string} listRule - 列表选择器
 * @param {object} fieldRules - 字段规则映射 { nameField: 'selector', bookUrl: 'selector', ... }
 * @returns {object[]}
 */
function extractList($, listRule, fieldRules) {
  const items = $(listRule);
  const results = [];
  items.each((_, el) => {
    const item = {};
    const $el = $(el);
    for (const [field, rule] of Object.entries(fieldRules)) {
      if (!rule) continue;
      // 根据字段名推断默认类型
      let defaultType = 'text';
      if (field === 'bookUrl' || field === 'detailUrl') defaultType = 'href';
      else if (field === 'coverUrl' || field === 'cover') defaultType = 'src';

      // 用 cheerio 的 find 在子元素中查找
      const parsed = parseSelector(rule);
      const found = parsed.selector ? $el.find(parsed.selector).first() : $el;
      if (found.length) {
        // 用全局 $ 来执行 extract（因为 extract 使用 $.find）
        // 直接操作 found 元素
        item[field] = extractFromEl(found, parsed, defaultType);
      } else {
        item[field] = '';
      }
    }
    if (item.name || item.bookName) {
      item.name = item.name || item.bookName || '';
      results.push(item);
    }
  });
  return results;
}

function extractFromEl($el, parsed, defaultType) {
  const type = parsed.extractType !== 'text' ? parsed.extractType : defaultType;
  let result;
  switch (type) {
    case 'html':
      result = $el.html() || '';
      break;
    case 'href':
      result = $el.attr('href') || '';
      break;
    case 'src':
      result = $el.attr('src') || $el.attr('data-src') || $el.attr('data-original') || '';
      break;
    case 'attr':
      result = $el.attr(parsed.attrName) || '';
      break;
    default:
      result = $el.text().trim();
  }

  if (parsed.jsCode && result) {
    result = runJs(parsed.jsCode, { result });
  }

  return typeof result === 'string' ? result.trim() : String(result || '');
}

module.exports = { parseSelector, extract, extractList };
