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

    // 修复内容中的 HTML 命名实体（如 &nbsp; → &#160;），确保 XHTML 解析不报错
    const fixedContent = fixHtmlEntities(content);

    zip.file(`OEBPS/${filename}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${chTitle}</title>
  <meta charset="utf-8"/>
</head>
<body>
  <h3>${chTitle}</h3>
  <div>${fixedContent}</div>
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

/**
 * 将 HTML 命名实体转为 XHTML 兼容的数值引用
 * 如 &nbsp; → &#160;，因为 XHTML/XML 不识别 HTML 命名实体
 */
function fixHtmlEntities(html) {
  if (!html) return '';
  const entities = {
    'nbsp': '160',
    'lt': '60',
    'gt': '62',
    'amp': '38',
    'quot': '34',
    'apos': '39',
    'mdash': '8212',
    'ndash': '8211',
    'lsquo': '8216',
    'rsquo': '8217',
    'ldquo': '8220',
    'rdquo': '8221',
    'hellip': '8230',
    'bull': '8226',
    'middot': '183',
    'laquo': '171',
    'raquo': '187',
    'copy': '169',
    'reg': '174',
    'trade': '8482',
    'times': '215',
    'divide': '247',
    'sect': '167',
    'deg': '176',
    'plusmn': '177',
    'sup2': '178',
    'sup3': '179',
    'frac14': '188',
    'frac12': '189',
    'frac34': '190',
    'iquest': '191',
    'iexcl': '161',
    'pound': '163',
    'yen': '165',
    'euro': '8364',
    'brvbar': '166',
    'uml': '168',
    'acute': '180',
    'cedil': '184',
    'macr': '175',
    'ordf': '170',
    'ordm': '186',
    'shy': '173',
    'not': '172',
    'loz': '9674',
    'spades': '9824',
    'clubs': '9827',
    'hearts': '9829',
    'diams': '9830',
    'sbquo': '8218',
    'bdquo': '8222',
    'dagger': '8224',
    'Dagger': '8225',
    'permil': '8240',
    'prime': '8242',
    'Prime': '8243',
    'oline': '8254',
    'frasl': '8260',
    'image': '8465',
    'weierp': '8472',
    'real': '8476',
    'alefsym': '8501',
    'larr': '8592',
    'uarr': '8593',
    'rarr': '8594',
    'darr': '8595',
    'harr': '8596',
    'crarr': '8629',
    'lArr': '8656',
    'uArr': '8657',
    'rArr': '8658',
    'dArr': '8659',
    'hArr': '8660',
  };
  return html.replace(/&(\w+);/g, (match, name) => {
    if (entities[name]) {
      return `&#${entities[name]};`;
    }
    // 未知实体保留原样（可能是自定义实体）
    return match;
  });
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
