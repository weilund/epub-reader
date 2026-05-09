import { get, set, del, keys } from 'idb-keyval';

// 阅读进度
export async function saveProgress(fileName, data) {
  await set(`book:${fileName}:progress`, {
    cfi: data.cfi,
    percentage: data.percentage,
    lastRead: Date.now(),
  });
}

export async function loadProgress(fileName) {
  return await get(`book:${fileName}:progress`);
}

// ===== 书籍数据缓存（PWA 无法直接访问文件系统，存到 IndexedDB） =====
export async function saveBookData(fileName, arrayBuffer) {
  // 转成普通数组存（IndexedDB 支持 ArrayBuffer 但旧浏览器兼容性考虑转 Uint8Array）
  const data = new Uint8Array(arrayBuffer);
  await set(`book:${fileName}:data`, data);
}

export async function loadBookData(fileName) {
  const data = await get(`book:${fileName}:data`);
  if (!data) return null;
  return data.buffer; // Uint8Array 的 buffer 就是 ArrayBuffer
}

export async function hasBookData(fileName) {
  const key = `book:${fileName}:data`;
  const allKeys = await keys();
  return allKeys.includes(key);
}

export async function deleteBookData(fileName) {
  await del(`book:${fileName}:data`);
  await del(`book:${fileName}:progress`);
}

// 全局设置
export async function saveSettings(settings) {
  await set('global:settings', settings);
}

export async function loadSettings() {
  return (await get('global:settings')) || {
    fontSize: 100,
    theme: 'day',
  };
}

// 最近文件
export async function saveRecentFile(entry) {
  let list = (await get('global:recent')) || [];
  list = list.filter((f) => f.name !== entry.name);
  list.unshift({
    name: entry.name,
    handle: entry.handle || null,
    type: entry.type || 'epub',
    lastOpened: Date.now(),
  });
  if (list.length > 20) list = list.slice(0, 20);
  await set('global:recent', list);
  return list;
}

export async function loadRecentFiles() {
  return (await get('global:recent')) || [];
}

export async function clearRecent() {
  await del('global:recent');
}

// 服务器地址配置
export async function saveServerUrl(url) {
  await set('global:serverUrl', url);
}

export async function loadServerUrl() {
  return (await get('global:serverUrl')) || '';
}
