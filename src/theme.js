const THEMES = ['day', 'night', 'sepia'];

let currentTheme = 'day';
let listeners = [];

export function getCurrentTheme() {
  return currentTheme;
}

export function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.remove('night', 'sepia');
  if (theme !== 'day') {
    document.body.classList.add(theme);
  }
  listeners.forEach((fn) => fn(theme));
}

export function setTheme(theme) {
  applyTheme(theme);
}

export function onThemeChange(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

// epub.js 主题映射（传递给 reader.js）
export function getEpubTheme(theme) {
  switch (theme) {
    case 'night':
      return {
        body: { background: '#1a1a2e', color: '#d0d0d0' },
        'a': { color: '#64b5f6' },
      };
    case 'sepia':
      return {
        body: { background: '#f5f0e8', color: '#5b4636' },
        'a': { color: '#8b7355' },
      };
    default:
      return {
        body: { background: '#ffffff', color: '#1a1a2e' },
        'a': { color: '#1a73e8' },
      };
  }
}
