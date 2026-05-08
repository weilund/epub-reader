import { saveRecentFile, loadRecentFiles, saveBookData, deleteBookData } from './store.js';

let currentFile = null; // { name, handle, arrayBuffer }

// 通过 <input type="file"> 打开
export async function openFileViaInput(file) {
  const isTxt = file.name.toLowerCase().endsWith('.txt');
  const buffer = await file.arrayBuffer();
  currentFile = {
    name: file.name.replace(/\.(epub|txt)$/i, ''),
    handle: null,
    arrayBuffer: buffer,
  };
  // 缓存文件数据到 IndexedDB（下次启动自动恢复用）
  await saveBookData(currentFile.name, buffer);
  await saveRecentFile({ name: currentFile.name, handle: null, type: isTxt ? 'txt' : 'epub' });
  return currentFile;
}

// 通过 File System Access API 打开
export async function openFileViaHandle(handle) {
  const file = await handle.getFile();
  const isTxt = file.name.toLowerCase().endsWith('.txt');
  const buffer = await file.arrayBuffer();
  currentFile = {
    name: file.name.replace(/\.(epub|txt)$/i, ''),
    handle,
    arrayBuffer: buffer,
  };
  await saveBookData(currentFile.name, buffer);
  await saveRecentFile({ name: currentFile.name, handle, type: isTxt ? 'txt' : 'epub' });
  return currentFile;
}

// 从 IndexedDB 缓存恢复数据
export async function openFromCache(name, arrayBuffer) {
  currentFile = {
    name,
    handle: null,
    arrayBuffer,
  };
  return currentFile;
}

// 获取当前文件
export function getCurrentFile() {
  return currentFile;
}

// 获取最近文件列表
export async function getRecentFiles() {
  return await loadRecentFiles();
}

// 尝试从 FileSystemDirectoryHandle 恢复权限并打开文件
export async function openRecentFile(recentEntry) {
  if (recentEntry.handle) {
    try {
      const handle = recentEntry.handle;
      const opts = { mode: 'read' };
      if (handle.queryPermission) {
        const perm = await handle.queryPermission(opts);
        if (perm === 'granted') return await openFileViaHandle(handle);
      }
      if (handle.requestPermission) {
        const perm = await handle.requestPermission(opts);
        if (perm === 'granted') return await openFileViaHandle(handle);
      }
    } catch {
      // fallback
    }
  }
  return null;
}

export function getFileInputElement() {
  return document.getElementById('fileInput');
}
