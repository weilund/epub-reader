export function runJs(code, context = {}) {
  try {
    const fn = new Function('r', code);
    const ret = fn(context.result);
    return ret !== undefined ? String(ret) : String(context.result || '');
  } catch {
    return String(context.result || '');
  }
}
