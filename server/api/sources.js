const { getSearchableSources } = require('../rules');

function register(app) {
  app.get('/api/sources', (_req, res) => {
    try {
      const sources = getSearchableSources();
      res.json({ sources });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { register };
