import JSZip from 'jszip';

/**
 * 纯前端生成 EPUB 文件
 */
export async function generateEpub({ title, author, chapters }) {
  const zip = new JSZip();

  // mimetype (不压缩)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const safeId = sanitizeId(title);
  const uuid = generateUuid();
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // 写入各章节
  const chapterFiles = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const id = `chapter-${i + 1}`;
    const filename = `${id}.xhtml`;
    const content = ch.content || ch.data || '';
    const chTitle = escapeXml(ch.name || ch.title || `第${i + 1}章`);

    zip.file(`OEBPS/${filename}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${chTitle}</title>
  <meta charset="utf-8"/>
</head>
<body>
  <h3>${chTitle}</h3>
  <div>${content}</div>
</body>
</html>`);

    chapterFiles.push({ id, filename, title: chTitle });
  }

  // content.opf
  const itemRefs = chapterFiles.map(cf => `    <itemref idref="${cf.id}"/>`).join('\n');
  const itemDefs = chapterFiles.map(cf => `    <item id="${cf.id}" href="${cf.filename}" media-type="application/xhtml+xml"/>`).join('\n');

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author || '')}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${itemDefs}
  </manifest>
  <spine toc="ncx">
${itemRefs}
  </spine>
</package>`);

  // toc.ncx
  const navPoints = chapterFiles.map((cf, i) =>
    `    <navPoint id="nav-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(cf.title)}</text></navLabel>
      <content src="${cf.filename}"/>
    </navPoint>`
  ).join('\n');

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`);

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

function escapeXml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeId(s) {
  return (s || 'book').replace(/[^a-zA-Z0-9一-鿿]/g, '-').replace(/-+/g, '-').slice(0, 64);
}

function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
