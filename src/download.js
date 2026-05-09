import { saveBookData, saveRecentFile, loadServerUrl } from './store.js';

export async function saveDownloadedBook(blob, name) {
  const arrayBuffer = await blob.arrayBuffer();
  await saveBookData(name, arrayBuffer);
  await saveRecentFile({ name, handle: null, type: 'epub' });
  return arrayBuffer;
}

export async function downloadEpub(bookInfo, sourceId, onProgress) {
  const serverUrl = (await loadServerUrl()) || window.__SERVER_URL__ || 'http://localhost:3001';

  const resp = await fetch(`${serverUrl}/api/books/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId,
      bookUrl: bookInfo.bookUrl,
      name: bookInfo.name,
      author: bookInfo.author,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || `下载失败: ${resp.status}`);
  }

  const contentLength = resp.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress && total > 0) {
      onProgress(Math.round((received / total) * 100));
    }
  }

  const blob = new Blob(chunks, { type: 'application/epub+zip' });
  await saveDownloadedBook(blob, bookInfo.name);
  return blob;
}
