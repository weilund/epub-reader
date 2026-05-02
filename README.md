# EPUB Reader

一个轻量级的 EPUB 电子书阅读器 PWA，支持 Android APK 安装。

![version](https://img.shields.io/badge/version-2.3-blue)
![platform](https://img.shields.io/badge/platform-Android%20PWA-green)
![tests](https://img.shields.io/badge/tests-46%20passed-brightgreen)

## 功能

- 📖 EPUB 2/3 格式阅读（epub.js 渲染）
- 👆 点击左右区域翻页，无滑动动画
- 🌗 日间 / 夜间 / 羊皮纸三种主题
- 🔍 字号调节
- 📑 目录导航（支持正序/倒序、点击跳转章节）
- 💾 阅读进度自动保存（断点续读，IndexedDB 持久化）
- 🚀 启动自动恢复上次阅读（文件数据缓存到 IndexedDB）
- 📱 PWA 支持（添加到主屏幕，离线阅读）
- 🤖 Android APK 打包（Capacitor）
- ↩️ 系统返回键拦截（Android 返回手势返回首页）

## 截图

```
┌──────────────────────────────┐
│  ← 第一章·开端    ☰ 目录     │  ← 顶部栏（显示当前章节名）
├──────────────────────────────┤
│                              │
│                              │
│         正文内容               │  ← 左1/3上页 · 右1/3下页
│                              │
│                              │
│                              │
├──────────────────────────────┤
│  ‹  ████████░░ 42%  ⚙  ›   │  ← 底部栏（进度条+设置）
└──────────────────────────────┘
```

## 快速开始

### Android 安装

从 [Releases](https://github.com/weilund/epub-reader/releases) 下载最新 APK → 传输到手机 → 点击安装（首次需开启「允许安装未知来源应用」）。


### PWA 部署

`dist/` 目录部署到任意 HTTPS 服务器。iPhone/iPad 用 Safari 打开 → 「添加到主屏幕」即可使用。

## 技术栈

| 层 | 技术 |
|---|------|
| 渲染引擎 | epub.js |
| 构建工具 | Vite + vite-plugin-pwa |
| 离线缓存 | Workbox (Service Worker) |
| 持久化 | IndexedDB (idb-keyval) |
| 打包 | Capacitor (Android) |
| 测试 | Vitest + jsdom |

## 项目结构

```
epub-reader/
├── index.html              # 入口
├── vite.config.js          # Vite 配置
├── src/
│   ├── main.js             # 主入口 + UI 逻辑
│   ├── style.css           # 全局样式
│   ├── reader.js           # epub.js 封装
│   ├── store.js            # IndexedDB 持久化
│   ├── theme.js            # 主题管理
│   ├── file-manager.js     # 文件打开
│   └── test/               # 测试用例
├── public/icons/           # PWA 图标
└── android/                # Capacitor Android 项目
```

## License

MIT
