const vm = require('vm');

function runJs(code, context = {}) {
  const sandbox = {
    result: context.result || '',
    String,
    Number,
    Math,
    parseInt,
    parseFloat,
    encodeURI,
    decodeURI,
    JSON,
    Array,
    RegExp,
  };
  try {
    const script = new vm.Script(code);
    const ctx = vm.createContext(sandbox);
    const ret = script.runInContext(ctx, { timeout: 1000 });
    return ret !== undefined ? String(ret) : sandbox.result;
  } catch (e) {
    return context.result || '';
  }
}

module.exports = { runJs };
