const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 生成简单的 EPUB 文件（不依赖外部库）
 * EPUB 本质上是一个 ZIP 文件，包含特定的 XML 结构
 */
async function generateEpub({ title, author, chapters, coverUrl }) {
  // 使用 JSZip 替代方案：手动构建 EPUB
  // EPUB 结构:
  // mimetype (无压缩)
  // META-INF/container.xml
  // OEBPS/content.opf
  // OEBPS/toc.ncx
  // OEBPS/chapter-*.xhtml

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epub-'));

  try {
    // mimetype
    fs.writeFileSync(path.join(tmpDir, 'mimetype'), 'application/epub+zip');

    // META-INF
    const metaDir = path.join(tmpDir, 'META-INF');
    fs.mkdirSync(metaDir);
    fs.writeFileSync(path.join(metaDir, 'container.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    // OEBPS
    const oebpsDir = path.join(tmpDir, 'OEBPS');
    fs.mkdirSync(oebpsDir);

    // 写入各章节
    const chapterFiles = [];
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const id = `chapter-${i + 1}`;
      const filename = `${id}.xhtml`;
      const content = ch.content || ch.data || '';

      fs.writeFileSync(path.join(oebpsDir, filename), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(ch.name || ch.title || `第${i + 1}章`)}</title>
  <meta charset="utf-8"/>
</head>
<body>
  <h3>${escapeXml(ch.name || ch.title || `第${i + 1}章`)}</h3>
  <div>${content}</div>
</body>
</html>`);

      chapterFiles.push({ id, filename, title: ch.name || ch.title || `第${i + 1}章` });
    }

    // content.opf
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const safeId = sanitizeId(title);

    const itemRefs = chapterFiles.map(cf =>
      `    <itemref idref="${cf.id}"/>`
    ).join('\n');

    const itemDefs = chapterFiles.map(cf =>
      `    <item id="${cf.id}" href="${cf.filename}" media-type="application/xhtml+xml"/>`
    ).join('\n');

    fs.writeFileSync(path.join(oebpsDir, 'content.opf'), `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${generateUuid()}</dc:identifier>
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

    fs.writeFileSync(path.join(oebpsDir, 'toc.ncx'), `<?xml version="1.0" encoding="UTF-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${generateUuid()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`);

    // 打包 ZIP
    const zip = await createZip(tmpDir);
    return zip;
  } finally {
    // 清理临时目录
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function createZip(dir) {
  // 使用 Node.js 内置的 child_process 调用系统命令（或手动构建ZIP）
  const { execSync } = require('child_process');
  const tmpZip = path.join(os.tmpdir(), `epub-${Date.now()}.epub`);

  try {
    // 确保 mimetype 先写入且不压缩
    execSync(`cd "${dir}" && zip -0 -X "${tmpZip}" mimetype && zip -r -X "${tmpZip}" META-INF OEBPS`, {
      stdio: 'pipe',
      timeout: 30000,
    });
    const buffer = fs.readFileSync(tmpZip);
    return buffer;
  } finally {
    try { fs.unlinkSync(tmpZip); } catch {}
  }
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

module.exports = { generateEpub };
