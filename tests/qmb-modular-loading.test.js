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

// ---------- Vehicle data runs first and is complete on its own ----------
// js/data/vehicles.js must precede the inline script, and the CARS enrichment (TECH_DATA and stallRpm merged into
// each car) must already have happened when it finishes, before any game code can read a car.
const order = src.scripts.map(s => s.name);
assert.deepEqual(order, ['js/data/vehicles.js', 'js/data/events.js', 'js/data/names.js', 'js/systems/opponent-generation.js', 'inline'], 'script order: vehicles.js, events.js, names.js, opponent-generation.js, then the inline game script');
const dataOnly = createSandbox({ seed: 3 });
vm.runInContext(src.scripts.find(s => s.name === 'js/data/vehicles.js').source, dataOnly.context, { filename: 'js/data/vehicles.js' });
assert.equal(dataOnly.evaluate("CARS.every(c=>typeof c.stallRpm==='number'&&c.stallRpm===(STALL_RPM[c.id]||2200))"), true, 'every car enriched with stallRpm when vehicles.js finishes');
assert.equal(dataOnly.evaluate("CARS.every(c=>Object.keys(TECH_DATA[c.id]||{}).every(k=>c[k]===TECH_DATA[c.id][k]))"), true, 'every car enriched with TECH_DATA when vehicles.js finishes');
assert.equal(dataOnly.evaluate('typeof platformBrand'), 'undefined', 'vehicles.js holds data only; helper functions stay in the inline script');
assert.equal(dataOnly.evaluate('Math.calls'), 0, 'vehicle data draws no random numbers');

// ---------- Event data is static and unchanged in identity and order ----------
// js/data/events.js holds only EVENT_CALENDAR and EVENT_STORIES as plain literals: no functions anywhere inside,
// no random draws, and the same event IDs in the same order as 55b5307.
const eventsOnly = createSandbox({ seed: 3 });
vm.runInContext(src.scripts.find(s => s.name === 'js/data/events.js').source, eventsOnly.context, { filename: 'js/data/events.js' });
assert.equal(eventsOnly.evaluate("(function walk(v){return typeof v!=='function'&&(v===null||typeof v!=='object'||Object.values(v).every(walk))})([EVENT_CALENDAR,EVENT_STORIES])"), true, 'event data contains no functions');
assert.equal(eventsOnly.evaluate("typeof hashSeed+typeof seededPick+typeof eventSeed+typeof freshState"), 'undefined'.repeat(4), 'events.js holds data only; event helpers stay in the inline script');
assert.equal(eventsOnly.evaluate('Math.calls'), 0, 'event data draws no random numbers');
const BASELINE_EVENT_IDS = ['heathcote_legal', 'calder_test', 'mildura_regional', 'state_grudge', 'bend_open', 'sydney_challenge'];
assert.deepEqual(JSON.parse(eventsOnly.evaluate('JSON.stringify(EVENT_CALENDAR.map(e=>e.id))')), BASELINE_EVENT_IDS, 'EVENT_CALENDAR IDs and order match the baseline');
assert.deepEqual(JSON.parse(eventsOnly.evaluate('JSON.stringify(Object.keys(EVENT_STORIES))')), BASELINE_EVENT_IDS, 'EVENT_STORIES keys and order match the baseline');

// ---------- Name data is plain, static and global ----------
// js/data/names.js holds only NPC_GIVEN_NAMES, NPC_NICKNAMES and NPC_NICKNAME_SHARE: string arrays and a number, no
// functions, no random draws, and nothing else declared.
const namesSource = src.scripts.find(s => s.name === 'js/data/names.js').source;
assert.deepEqual([...namesSource.matchAll(/^(?:const|let|var|function) (\w+)/gm)].map(m => m[1]), ['NPC_GIVEN_NAMES', 'NPC_NICKNAMES', 'NPC_NICKNAME_SHARE'], 'names.js declares exactly the three name constants');
const namesOnly = createSandbox({ seed: 3 });
vm.runInContext(namesSource, namesOnly.context, { filename: 'js/data/names.js' });
assert.equal(namesOnly.evaluate("NPC_GIVEN_NAMES.every(n=>typeof n==='string')&&NPC_NICKNAMES.every(n=>typeof n==='string')&&typeof NPC_NICKNAME_SHARE==='number'"), true, 'name data is plain strings and a number');
assert.equal(namesOnly.evaluate('Math.calls'), 0, 'name data draws no random numbers');
assert.equal(namesOnly.evaluate('typeof pickDriverName'), 'undefined', 'names.js holds data only; selection lives in opponent-generation.js');

// ---------- Opponent generation defines exactly its eight functions and does nothing at load ----------
// js/systems/opponent-generation.js holds only top-level function declarations. Loaded on its own it runs no code
// (no random draws, no reads of CARS, EVENT_CALENDAR or state), and its functions are global, as they were inline.
const OPPONENT_FUNCTIONS = ['eventProfile', 'pickDriverName', 'makeOpponents', 'perfIndex', 'pickRaceSlots', 'visibleClues', 'shuffleIndexes', 'buildNpcPairIndexes'];
const opponentSource = src.scripts.find(s => s.name === 'js/systems/opponent-generation.js').source;
assert.deepEqual([...opponentSource.matchAll(/^function (\w+)\(/gm)].map(m => m[1]), OPPONENT_FUNCTIONS, 'opponent-generation.js declares exactly its eight functions, in source order');
assert.ok(opponentSource.split('\n').every(l => l === '' || l.startsWith('//') || l.startsWith('function ') || l.startsWith('  ') || l === '}'), 'opponent-generation.js has no top-level statements besides function declarations');
const opponentsOnly = createSandbox({ seed: 3 });
vm.runInContext(opponentSource, opponentsOnly.context, { filename: 'js/systems/opponent-generation.js' });
assert.equal(opponentsOnly.evaluate('Math.calls'), 0, 'opponent-generation.js draws no random numbers when it loads');
for (const name of OPPONENT_FUNCTIONS) assert.equal(opponentsOnly.evaluate(`typeof Object.getOwnPropertyDescriptor(globalThis,'${name}').value`), 'function', `${name} is a global function`);
assert.equal(opponentsOnly.evaluate("typeof CARS+typeof EVENT_CALENDAR+typeof NPC_GIVEN_NAMES+typeof rand+typeof choice+typeof makeOwned"), 'undefined'.repeat(6), 'opponent-generation.js defines no data or shared helpers of its own');
for (const name of OPPONENT_FUNCTIONS) assert.ok(!src.scripts.find(s => s.name === 'inline').source.includes(`function ${name}(`), `${name} is no longer defined inline`);

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
