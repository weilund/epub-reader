import { CapacitorHttp } from '@capacitor/core';

const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor?.isNativePlatform?.());

async function doFetch(url, options = {}) {
  if (isCapacitor) {
    // Capacitor 原生 HTTP：绕过 WebView CORS
    const resp = await CapacitorHttp.request({
      method: options.method || 'GET',
      url,
      headers: options.headers || {},
      data: options.body || undefined,
    });
    if (resp.status < 200 || resp.status >= 400) {
      throw new Error(`HTTP ${resp.status}: ${url}`);
    }
    // resp.data 在真实响应中是 string，在错误时可能是对象
    return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
  }

  // 浏览器 PWA：使用 fetch（有 CORS 限制，仅用于开发）
  const resp = await fetch(url, {
    ...options,
    redirect: 'follow',
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${url}`);
  }
  return resp.text();
}

function decodeHtml(text) {
  // 尝试检测并处理 GBK 编码的文本
  // CapacitorHttp 返回的数据已经按 UTF-8 解码，如果源站是 GBK 可能会乱码
  // 大多数现代网站已经迁移到 UTF-8，先保持原样
  if (text.includes('�')) {
    console.warn('[HTTP] 可能的编码问题，返回原始文本');
  }
  return text;
}

function buildHeaders(cookies) {
  const h = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (cookies) h['Cookie'] = cookies;
  return h;
}

export async function fetchHtml(url, cookies) {
  console.log(`[HTTP] GET ${url.substring(0, 100)}`);
  const text = await doFetch(url, { headers: buildHeaders(cookies) });
  return decodeHtml(text);
}

export async function fetchWithPost(url, dataTemplate, keyword, cookies) {
  const cleaned = dataTemplate.replace(/[{}]/g, '').trim();
  const pairs = cleaned.split(',').map(s => s.trim());
  const body = new URLSearchParams();
  for (const pair of pairs) {
    const [k, ...vParts] = pair.split(':');
    let v = vParts.join(':').trim();
    if (v === '%s' || v === '{{key}}') v = keyword;
    body.append(k.trim(), v);
  }

  console.log(`[HTTP] POST ${url.substring(0, 100)}`);
  const headers = buildHeaders(cookies);
  headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const text = await doFetch(url, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  return decodeHtml(text);
}
