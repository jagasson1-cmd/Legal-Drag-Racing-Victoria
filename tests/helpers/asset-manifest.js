'use strict';
// Modular release version and content hashes of every extracted CSS/JS file referenced by index.html.
// Every extracted asset tag in index.html carries ?v=<version>. If an extracted file changes, bump the version in
// index.html (all tags, one value) and run:  node tests/helpers/asset-manifest.js --write
// so deployed players never combine a new index.html with a stale cached asset (see docs/MODULARISATION.md).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const loadGameSource = require('./game-source');

const MANIFEST = path.join(__dirname, '..', 'fixtures', 'asset-version.json');
// Hash with normalised line endings so Windows (CRLF) and other checkouts agree.
const hash = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const versionOf = ref => { const m = /[?&]v=([^&#]+)/.exec(ref); return m ? m[1] : null; };

function currentAssets() {
  const src = loadGameSource();
  const refs = [...src.stylesheets, ...src.scripts].filter(a => a.ref);
  const versions = [...new Set(refs.map(a => versionOf(a.ref)))];
  const files = {};
  for (const a of refs) files[a.name] = hash(a.source);
  return { versions, files, refs };
}

function writeManifest() {
  const { versions, files } = currentAssets();
  if (versions.length > 1 || versions.includes(null)) throw new Error('Every extracted asset tag needs the same ?v= value: ' + versions.join(', '));
  fs.writeFileSync(MANIFEST, JSON.stringify({ version: versions[0] || null, files }, null, 1) + '\n');
  return MANIFEST;
}

if (require.main === module) {
  if (process.argv.includes('--write')) console.log('wrote', path.relative(process.cwd(), writeManifest()));
  else console.log(JSON.stringify(currentAssets(), (k, v) => k === 'refs' ? undefined : v, 1));
}

module.exports = { MANIFEST, hash, versionOf, currentAssets, writeManifest };
