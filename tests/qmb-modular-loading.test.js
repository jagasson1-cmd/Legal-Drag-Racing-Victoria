const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const loadGameSource = require('./helpers/game-source');
const { createSandbox } = require('./helpers/game-context');
const { MANIFEST, currentAssets } = require('./helpers/asset-manifest');

// Modular loading contract (docs/MODULARISATION.md): extracted files are ordinary classic scripts and stylesheets,
// loaded in document order from paths that exist, all tagged with one modular release version whose manifest matches
// their content; each script loads on its own (as separate <script> elements do) and the game boots without errors.
const src = loadGameSource();

// ---------- Tags ----------
assert.doesNotMatch(src.html, /<script[^>]*type=["']module["']/i, 'no ES module scripts (they break file:// and global handlers)');
for (const tag of src.html.match(/<script\b[^>]*>/g)) {
  assert.doesNotMatch(tag, /\b(defer|async)\b/, `${tag}: no defer/async, so scripts run in document order with the inline game script`);
  assert.ok(tag === '<script>' || /^<script src="[^"]+">$/.test(tag), `${tag}: plain classic script tag`);
}
for (const a of [...src.stylesheets, ...src.scripts].filter(x => x.ref)) {
  assert.ok(!/^(https?:)?\/\//.test(a.ref), `${a.ref}: extracted assets are local files`);
  assert.ok(fs.existsSync(path.join(src.root, a.name)), `${a.name}: file exists`);
  assert.ok(a.source.trim().length > 0, `${a.name}: not empty`);
}
// Stylesheets stay in the head, before the body markup, so nothing renders unstyled.
const headEnd = src.html.indexOf('</head>');
for (const a of src.stylesheets.filter(x => x.ref)) assert.ok(src.html.indexOf(a.ref) < headEnd, `${a.name}: linked in <head>`);

// ---------- Release version and manifest ----------
const { versions, files } = currentAssets();
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
assert.ok(versions.length <= 1 && !versions.includes(null), `one ?v= release version on every extracted asset tag (found: ${versions.join(', ')})`);
assert.equal(versions[0] || null, manifest.version, 'index.html ?v= matches tests/fixtures/asset-version.json');
assert.deepEqual(Object.keys(files).sort(), Object.keys(manifest.files).sort(), 'manifest lists exactly the extracted files');
for (const [name, h] of Object.entries(manifest.files)) assert.equal(files[name], h, `${name} changed: bump the ?v= release version in index.html and run node tests/helpers/asset-manifest.js --write`);

// ---------- Each script on its own, in order, then a full startup ----------
const box = createSandbox({ seed: 3 });
for (const s of src.scripts) {
  // The inline script includes the real startup line, so this also boots the game.
  assert.doesNotThrow(() => vm.runInContext(s.source, box.context, { filename: s.name }), `${s.name} loads on its own`);
}
assert.equal(box.evaluate('state.screen'), 'home', 'startup reached the start screen');
assert.match(box.element('screen').innerHTML, /Start with your first car|Street to Strip|card/, 'start screen rendered');
assert.ok(box.evaluate('CARS.length') > 40 && box.evaluate('EVENT_CALENDAR.length') === 6, 'game data available');

// ---------- Inline handlers resolve to global functions ----------
const handlers = new Set();
for (const m of (src.html + src.script).matchAll(/\bon(?:click|change|input|submit|keydown|keyup)=(\\?["'])([^"'\\]*)/g))
  for (const f of m[2].matchAll(/(?:^|[;\s(!])([A-Za-z_$][\w$]*)\s*\(/g)) handlers.add(f[1]);
for (const skip of ['if', 'event', 'Number', 'String']) handlers.delete(skip);
assert.ok(handlers.size > 60, 'handlers found');
for (const name of handlers) {
  if (name === 'getElementById') continue;
  assert.equal(box.evaluate(`typeof ${name}`), 'function', `inline handler ${name}() is a global function`);
}
console.log('Quarter Mile Builder modular loading checks passed.');
