const iconv = require('iconv-lite');
const config = require('../config');

class FetchError extends Error {
  constructor(message, status, url) {
    super(message);
    this.status = status;
    this.url = url;
  }
}

function detectCharset(ctHeader) {
  if (!ctHeader) return 'utf-8';
  const m = ctHeader.match(/charset=([\w-]+)/i);
  if (!m) return 'utf-8';
  const c = m[1].toLowerCase();
  if (c === 'gbk' || c === 'gb2312' || c === 'gb18030') return 'gbk';
  return c;
}

function decodeBody(buffer, ctHeader) {
  const charset = detectCharset(ctHeader);
  if (charset === 'gbk') {
    return iconv.decode(buffer, 'gbk');
  }
  return new TextDecoder(charset).decode(buffer);
}

async function fetchHtml(url, cookies) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT);

  try {
    const headers = {
      'User-Agent': config.USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    };
    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const resp = await fetch(url, {
      signal: controller.signal,
      headers,
      redirect: 'follow',
    });

    if (!resp.ok) {
      throw new FetchError(`HTTP ${resp.status}`, resp.status, url);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    return decodeBody(buffer, resp.headers.get('content-type'));
  } finally {
    clearTimeout(t);
  }
}

module.exports = { fetchHtml, FetchError, decodeBody };
