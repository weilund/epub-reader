const fs = require('fs');
const path = require('path');

function loadRules() {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.js');
  const rules = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      if (Array.isArray(raw)) {
        rules.push(...raw);
      } else {
        rules.push(raw);
      }
    } catch (e) {
      console.error(`[rules] 加载失败: ${file}`, e.message);
    }
  }
  return rules.filter(r => !r.disabled && r.searchUrl);
}

function getSearchableSources() {
  return loadRules().map((r, i) => ({
    id: String(i),
    name: r.bookSourceName || r.name || '未知',
    group: r.bookSourceGroup || '',
  }));
}

module.exports = { loadRules, getSearchableSources };
