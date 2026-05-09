module.exports = {
  PORT: process.env.SERVER_PORT || 3001,
  REQUEST_TIMEOUT: 15000,
  USER_AGENT: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  SEARCH_TIMEOUT: 20000,
  DOWNLOAD_CONCURRENCY: 5,
  CHAPTER_CACHE_TTL: 3600000,
  CACHE_DIR: './cache',
};
