const fs = require('fs');
const path = require('path');

function loadRules() {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.js');
  const rules = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const r of items) {
        // 跳过禁用的书源
        if (r.disabled) continue;
        // 标记来源文件
        r._file = file;
        r._id = `${file.replace('.json', '')}-${rules.length}`;
        rules.push(r);
      }
    } catch (e) {
      console.error(`[rules] 加载失败: ${file}`, e.message);
    }
  }

  return rules;
}

function getSearchableSources() {
  return loadRules()
    .filter(r => r.search && !r.search.disabled && r.search.url)
    .map(r => ({
      id: r._id,
      name: r.name || '未知',
      group: r._file || '',
    }));
}

module.exports = { loadRules, getSearchableSources };
