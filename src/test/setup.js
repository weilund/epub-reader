// jsdom test setup
// 模拟 localStorage / IndexedDB / File API

import 'vitest';
import { vi } from 'vitest';

// 模拟 IndexedDB（idb-keyval 内部依赖它）
// 模拟 IndexedDB（idb-keyval 内部依赖它）
import 'fake-indexeddb/auto';

// 模拟 File 和 FileReader
globalThis.File = class MockFile {
  constructor(parts, name, options = {}) {
    this.name = name;
    this.size = parts.reduce((acc, p) => acc + (p instanceof Blob ? p.size : String(p).length), 0);
    this.type = options.type || '';
    this._parts = parts;
  }
  async arrayBuffer() {
    // 返回一个有效的 ArrayBuffer，模拟 zip
    const arr = new Uint8Array(1024);
    arr[0] = 0x50; arr[1] = 0x4b; arr[2] = 0x03; arr[3] = 0x04; // zip header
    return arr.buffer;
  }
  async text() {
    return String(this._parts[0] || '');
  }
  slice() {
    return new Blob(this._parts);
  }
};

// 模拟 ResizeObserver（jsdom 不提供）
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 匹配媒体查询
globalThis.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// 模拟 @capacitor/app（test 环境不存在）
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    exitApp: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));
