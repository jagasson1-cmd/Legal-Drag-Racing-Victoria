'use strict';
// Reads the game the way the browser does: index.html plus every <link rel="stylesheet"> and classic <script src>
// it references, in document order. Tests use this instead of regex-matching inline blocks, so they keep working as
// code moves out of index.html (see docs/MODULARISATION.md).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const BOOT_MARKER = 'refreshListings();loadGame(false);render();';

// Strip the cache-busting query (?v=...) from a local asset reference.
const localPath = ref => ref.split(/[?#]/)[0];

// Git stores LF; a Windows checkout with core.autocrlf=true presents CRLF. Browsers treat both the same, so read
// with LF line endings and tests behave identically on every checkout.
const readText = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function loadGameSource() {
  const html = readText(path.join(ROOT, 'index.html'));
  const read = ref => readText(path.join(ROOT, localPath(ref)));
  const stylesheets = [];
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>|<link rel="stylesheet" href="([^"]+)"\s*\/?>/g)) {
    stylesheets.push(m[1] !== undefined ? { name: 'inline', ref: null, source: m[1] } : { name: localPath(m[2]), ref: m[2], source: read(m[2]) });
  }
  const scripts = [];
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>|<script src="([^"]+)"><\/script>/g)) {
    scripts.push(m[1] !== undefined ? { name: 'inline', ref: null, source: m[1] } : { name: localPath(m[2]), ref: m[2], source: read(m[2]) });
  }
  // Classic scripts share one global scope, so evaluating them in order is the same as concatenating them
  // (no file declares a name another file declares; tests/qmb-modular-loading.test.js also loads them one by one).
  const script = scripts.map(s => s.source).join('\n');
  const boot = script.indexOf(BOOT_MARKER);
  if (boot < 0) throw new Error('Startup line not found in the game scripts');
  return {
    root: ROOT,
    html,
    stylesheets,
    css: stylesheets.map(s => s.source).join('\n'),
    scripts,
    script,
    // Everything before the startup line: all definitions, no boot side effects.
    definitions: script.slice(0, boot),
    bootMarker: BOOT_MARKER
  };
}

module.exports = loadGameSource;
module.exports.localPath = localPath;
