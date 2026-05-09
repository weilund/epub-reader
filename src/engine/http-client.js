// 检测是否在 Capacitor WebView 中
const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor?.isNativePlatform?.());

export async function fetchHtml(url, cookies) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (cookies) headers['Cookie'] = cookies;

  // 在 Capacitor 环境中，fetch 不受 CORS/Mixed Content 限制
  const resp = await fetch(url, {
    headers,
    redirect: 'follow',
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${url}`);
  }

  const buffer = await resp.arrayBuffer();
  return decodeHtml(buffer);
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

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (cookies) headers['Cookie'] = cookies;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: body.toString(),
    redirect: 'follow',
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${url}`);
  }

  const buffer = await resp.arrayBuffer();
  return decodeHtml(buffer);
}

function decodeHtml(buffer) {
  // 尝试 UTF-8
  try {
    const text = new TextDecoder('utf-8').decode(buffer);
    // 检测是否仍是乱码 (包含常见 GBK 乱码特征)
    if (text.includes('�') || containsGarbled(text)) {
      return tryGbk(buffer);
    }
    return text;
  } catch {
    return tryGbk(buffer);
  }
}

function containsGarbled(text) {
  // 简单启发式：大量不可打印字符
  let garbled = 0;
  for (let i = 0; i < Math.min(text.length, 500); i++) {
    const c = text.charCodeAt(i);
    if (c > 0 && c < 32 && c !== 10 && c !== 13 && c !== 9) garbled++;
  }
  return garbled > 5;
}

function tryGbk(buffer) {
  try {
    // Chrome/Android WebView 支持 GBK
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buffer);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }
  }
}
