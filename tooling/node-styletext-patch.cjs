'use strict';

const util = require('node:util');

const original = util.styleText;

function supportsMultiStyle() {
  try {
    original(['bold', 'underline'], 'x');
    return true;
  } catch {
    return false;
  }
}

if (typeof original === 'function' && !supportsMultiStyle()) {
  util.styleText = (format, ...texts) => {
    const text = texts.join('');
    if (Array.isArray(format)) {
      return format.reduce((acc, style) => original(style, acc), text);
    }
    return original(format, text);
  };
}

if (typeof process.getBuiltinModule !== 'function') {
  process.getBuiltinModule = (name) => {
    if (typeof name !== 'string') return;
    const resolved = name.startsWith('node:') ? name : `node:${name}`;
    return require(resolved);
  };
}
