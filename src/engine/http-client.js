import { CapacitorHttp } from '@capacitor/core';

const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor?.isNativePlatform?.());

// ===== CORS 代理列表（浏览器模式绕过 CORS 限制） =====
// 按优先级排列，逐个尝试直到成功
// 注意：部分代理只支持 GET，POST 请求会走 corsproxy.io（它支持透传 POST body）
const CORS_PROXIES_ALL = [
  {
    name: 'corsproxy.io',
    wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'api.allorigins.win',
    wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'corsproxy.org',
    wrap: (url) => `https://corsproxy.org/?url=${encodeURIComponent(url)}`,
  },
];

// 支持 POST body 透传的代理（用于搜索等 POST 请求）
const CORS_PROXIES_POST = [
  {
    name: 'corsproxy.io',
    wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  },
];

// 请求超时（毫秒）
const REQUEST_TIMEOUT_MS = 15000;

// ===== 核心请求函数 =====

async function doFetch(url, options = {}) {
  if (isCapacitor) {
    return doFetchCapacitor(url, options);
  }
  return doFetchBrowser(url, options);
}

/**
 * Capacitor 原生模式：直接请求，无 CORS 限制
 * 使用 responseType: 'arraybuffer' 获取原始字节，避免编码问题
 */
async function doFetchCapacitor(url, options) {
  const userAgents = [
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = { ...(options.headers || {}) };
    if (attempt > 0) {
      headers['User-Agent'] = userAgents[attempt % userAgents.length];
      headers['Referer'] = new URL(url).origin + '/';
    }

    const resp = await CapacitorHttp.request({
      method: options.method || 'GET',
      url,
      headers,
      data: options.body || undefined,
      responseType: 'arraybuffer',
    });

    if (resp.status >= 200 && resp.status < 400) {
      // 成功，继续处理响应
      const base64 = resp.data;
      if (typeof base64 !== 'string') {
        return typeof base64 === 'string' ? base64 : JSON.stringify(base64);
      }

      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const contentType = (resp.headers && resp.headers['content-type']) ||
                          (resp.headers && resp.headers['Content-Type']) || '';

      return decodeResponse(bytes.buffer, contentType);
    }

    // 403 等错误 — 换 User-Agent 重试一次
    if (resp.status === 403 && attempt === 0) {
      console.warn(`[HTTP] 403 ${url.substring(0, 60)}，换 UA 重试…`);
      continue;
    }

    throw new Error(`HTTP ${resp.status}: ${url.substring(0, 80)}`);
  }

  throw new Error(`HTTP 403: ${url.substring(0, 80)}（重试后仍然失败）`);
}

/**
 * 浏览器/PWA 模式：直连 → CORS 代理降级
 */
async function doFetchBrowser(url, options) {
  const errors = [];

  // 1) 尝试直连（同源请求可以成功，跨域会失败）
  try {
    const text = await rawFetch(url, options);
    return text;
  } catch (e) {
    errors.push(`直连: ${e.message}`);
  }

  // 2) 逐个尝试 CORS 代理
  // GET 请求用全部代理，POST 请求只走支持 POST 透传的代理
  const proxies = (options.method || 'GET').toUpperCase() === 'POST'
    ? CORS_PROXIES_POST
    : CORS_PROXIES_ALL;

  for (const proxy of proxies) {
    try {
      const proxyUrl = proxy.wrap(url);
      const text = await rawFetch(proxyUrl, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || undefined,
      });
      return text;
    } catch (e) {
      errors.push(`${proxy.name}: ${e.message}`);
    }
  }

  // 3) 全部失败
  throw new Error(
    `[HTTP] 无法访问 ${url.substring(0, 60)}\n` +
    errors.map((e) => `  → ${e}`).join('\n')
  );
}

/**
 * 原始 fetch + 超时 + 编码检测
 */
async function rawFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}${resp.statusText ? ' ' + resp.statusText : ''}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    const arrayBuffer = await resp.arrayBuffer();
    return decodeResponse(arrayBuffer, contentType);
  } finally {
    clearTimeout(timer);
  }
}

// ===== 编码处理 =====

/**
 * 从 Content-Type 或 HTML 中检测字符编码
 */
function detectEncoding(text, contentType) {
  // 1) Content-Type 头
  const ctMatch = contentType?.match(/charset\s*=\s*([^\s;]+)/i);
  if (ctMatch) return ctMatch[1].toLowerCase();

  // 2) HTML <meta charset>
  const meta1 = text.match(/<meta[^>]+charset\s*=\s*["']([a-zA-Z0-9_-]+)["']/i);
  if (meta1) return meta1[1].toLowerCase();

  // 3) HTML <meta http-equiv="Content-Type">
  const meta2 = text.match(/<meta[^>]+content-type[^>]+charset=([a-zA-Z0-9_-]+)/i);
  if (meta2) return meta2[1].toLowerCase();

  // 4) XML 声明
  const xml = text.match(/<\?xml[^>]+encoding\s*=\s*["']([a-zA-Z0-9_-]+)["']/i);
  if (xml) return xml[1].toLowerCase();

  return null;
}

/**
 * 智能解码响应
 */
function decodeResponse(arrayBuffer, contentType) {
  // 先按 UTF-8 解码（绝大多数现代网站）
  let text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);

  const detected = detectEncoding(text, contentType);

  // 如果检测到非 UTF-8 编码，用对应编码重解码
  if (detected && !['utf-8', 'utf8', 'unicode-1-1-utf-8'].includes(detected)) {
    try {
      const decoder = new TextDecoder(detected, { fatal: false });
      const decoded = decoder.decode(arrayBuffer);
      // 如果没有取替字符，用这个结果
      if (!decoded.includes('�')) {
        return decoded;
      }
    } catch {
      // 浏览器不支持该编码，保持 UTF-8 结果
    }
  }

  // 如果 UTF-8 解码后出现取替字符，尝试中文编码
  if (text.includes('�')) {
    for (const enc of ['gbk', 'gb2312', 'gb18030', 'shift-jis']) {
      try {
        const decoder = new TextDecoder(enc, { fatal: false });
        const decoded = decoder.decode(arrayBuffer);
        if (!decoded.includes('�')) {
          return decoded;
        }
      } catch {
        // 编码不被支持，跳过
      }
    }
  }

  return text;
}

// ===== 构建请求头 =====

function buildHeaders(cookies) {
  const h = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (cookies) h['Cookie'] = cookies;
  return h;
}

// ===== 导出接口（签名不变，兼容现有调用方） =====

export async function fetchHtml(url, cookies) {
  console.log(`[HTTP] GET ${url.substring(0, 100)}`);
  return await doFetch(url, { headers: buildHeaders(cookies) });
}

export async function fetchWithPost(url, dataTemplate, keyword, cookies) {
  // 解析 dataTemplate："{searchkey: %s, type: all}" → URLSearchParams
  const cleaned = dataTemplate.replace(/[{}]/g, '').trim();
  const pairs = cleaned.split(',').map((s) => s.trim());
  const body = new URLSearchParams();
  for (const pair of pairs) {
    const [k, ...vParts] = pair.split(':');
    let v = vParts.join(':').trim();
    if (v === '%s' || v === '{{key}}') v = keyword;
    body.append(k.trim(), v);
  }

  const bodyStr = body.toString();
  console.log(`[HTTP] POST ${url.substring(0, 100)}`);

  const headers = buildHeaders(cookies);
  headers['Content-Type'] = 'application/x-www-form-urlencoded';

  return await doFetch(url, {
    method: 'POST',
    headers,
    body: bodyStr,
  });
}
