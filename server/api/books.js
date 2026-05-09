const { downloadBook, loadRules } = require('../engine/rule-engine');
const { generateEpub } = require('../engine/epub-generator');

function register(app) {
  // 获取书籍详情 + 目录
  app.get('/api/books/chapters', async (req, res) => {
    const { source, url } = req.query;
    if (!source || !url) return res.status(400).json({ error: '缺少 source 或 url 参数' });

    try {
      const rules = loadRules();
      const rule = rules.find(r => r._id === source || r.name === source);
      if (!rule) return res.status(404).json({ error: `书源 ${source} 不存在` });

      const { getChapters } = require('../engine/rule-engine');
      const chapters = await getChapters(rule, decodeURIComponent(url));
      res.json({ chapters: chapters.map(c => ({ index: c.index, name: c.name, url: c.url })) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 下载并生成 EPUB
  app.post('/api/books/download', async (req, res) => {
    const { sourceId, bookUrl, name, author } = req.body;
    if (!sourceId || !bookUrl) return res.status(400).json({ error: '缺少 sourceId 或 bookUrl' });

    try {
      const data = await downloadBook(sourceId, bookUrl, name || '未知', author || '佚名');
      const epubBuffer = await generateEpub({
        title: name || '未知书名',
        author: author || '佚名',
        chapters: data.chapters.filter(c => c.content),
      });

      const safeName = (name || 'download').replace(/[\\/:*?"<>|]/g, '_');
      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.epub`);
      res.setHeader('Content-Length', epubBuffer.length);
      res.send(epubBuffer);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { register };
