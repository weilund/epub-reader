import { saveBookData, saveRecentFile } from './store.js';

export async function saveDownloadedBook(blob, name) {
  const arrayBuffer = await blob.arrayBuffer();
  await saveBookData(name, arrayBuffer);
  await saveRecentFile({ name, handle: null, type: 'epub' });
  return arrayBuffer;
}
