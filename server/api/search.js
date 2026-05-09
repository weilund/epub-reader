const { searchAll } = require('../engine/rule-engine');

function register(app) {
  app.get('/api/search/all', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: '缺少搜索关键词' });

    try {
      const data = await searchAll(q);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { register };
