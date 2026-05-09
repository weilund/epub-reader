import { runJs } from './js-processor.js';

/**
 * 解析选择器规则字符串
 * 同 server/engine/selector.js 逻辑，API 不变
 */
export function parseSelector(raw) {
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
 * 从 DOM 元素提取值
 */
function extractFromEl(el, parsed, defaultType) {
  const type = parsed.extractType !== 'text' ? parsed.extractType : (defaultType || 'text');
  let result;
  switch (type) {
    case 'html':
      result = el.innerHTML || '';
      break;
    case 'href':
      result = el.getAttribute('href') || '';
      break;
    case 'src':
      result = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original') || '';
      break;
    case 'attr':
      result = el.getAttribute(parsed.attrName) || '';
      break;
    default:
      result = el.textContent?.trim() || '';
  }

  if (parsed.jsCode && result) {
    result = runJs(parsed.jsCode, { result });
  }

  return typeof result === 'string' ? result.trim() : String(result || '');
}

/**
 * 从文档按选择器规则提取值
 */
export function extract(doc, ruleStr, defaultType) {
  if (!ruleStr) return '';
  const parsed = parseSelector(ruleStr);
  const el = doc.querySelector(parsed.selector);
  if (!el) return '';
  return extractFromEl(el, parsed, defaultType || 'text');
}

/**
 * 按列表规则提取所有匹配项
 */
export function extractList(doc, listSelector, fieldRules) {
  const items = doc.querySelectorAll(listSelector);
  const results = [];

  for (const el of items) {
    const item = {};
    for (const [field, rule] of Object.entries(fieldRules)) {
      if (!rule) continue;

      let defaultType = 'text';
      if (field === 'bookUrl' || field === 'detailUrl') defaultType = 'href';
      else if (field === 'coverUrl' || field === 'cover') defaultType = 'src';

      const parsed = parseSelector(rule);
      const found = parsed.selector ? el.querySelector(parsed.selector) : el;
      if (found) {
        item[field] = extractFromEl(found, parsed, defaultType);
      } else {
        item[field] = '';
      }
    }
    if (item.name || item.bookName) {
      item.name = item.name || item.bookName || '';
      results.push(item);
    }
  }
  return results;
}
