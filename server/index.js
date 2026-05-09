const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API 路由
require('./api/sources').register(app);
require('./api/search').register(app);
require('./api/books').register(app);

// 生产环境：提供前端静态文件
const distPath = path.join(__dirname, '..', 'dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(config.PORT, () => {
  console.log(`[server] 书源搜索后端已启动: http://localhost:${config.PORT}`);
  console.log(`[server] API: /api/sources, /api/search/all?q=, /api/books/download`);
});
