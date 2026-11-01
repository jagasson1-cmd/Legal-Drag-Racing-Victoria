'use strict';
// Deterministic sandbox for golden tests: seeded Math.random with a call counter, fixed Date, manual clock,
// recorded (never fired) timers, a minimal DOM, in-memory localStorage and a fetch stub that records requests and
// never reaches the network. Production Supabase is never contacted.
const vm = require('node:vm');
const loadGameSource = require('./game-source');

const FIXED_NOW = 1767225600000; // 2026-01-01T00:00:00Z

function seededMath(seed) {
  let s = seed >>> 0;
  const m = Object.create(Math);
  m.calls = 0;
  m.random = () => { m.calls++; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return m;
}

function makeElement(id) {
  const classes = new Set();
  return {
    id, innerHTML: '', textContent: '', value: '', disabled: false, hidden: false, title: '', style: {}, className: '', dataset: {},
    setAttribute() {}, removeAttribute() {}, focus() {}, scrollIntoView() {}, addEventListener() {}, getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, appendChild() {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; v ? classes.add(c) : classes.delete(c); return v; } }
  };
}

// Sandbox only (no game code loaded yet).
function createSandbox({ seed = 1, storage: initial = {}, search = '', fetchReply = null } = {}) {
  const src = loadGameSource();
  const storage = new Map(Object.entries({ qmb_sound_enabled: 'false', qmb_music_enabled: 'false', qmb_last_seen_at: String(FIXED_NOW), ...initial }));
  for (const [k, v] of storage) if (v === null || v === 'null') storage.delete(k); // null = key absent
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); };
  const clock = { t: 1000 };
  const timers = [], requests = [];
  const math = seededMath(seed);
  class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED_NOW); } static now() { return FIXED_NOW; } }
  const context = vm.createContext({
    console, Math: math, Date: FixedDate, JSON, URL, URLSearchParams, Promise,
    alert: () => {}, confirm: () => true, prompt: () => null,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    performance: { now: () => clock.t }, innerHeight: 900, innerWidth: 1366,
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    document: { hidden: false, visibilityState: 'visible', addEventListener() {}, getElementById: id => id === 'driverProfileOverlay' ? null : element(id), querySelector: () => null, querySelectorAll: () => [], createElement: () => makeElement('') },
    window: { addEventListener() {} },
    navigator: {},
    location: { search, origin: 'http://localhost', pathname: '/' },
    history: { replaceState() {} },
    fetch: async (url, init) => {
      requests.push({ url, method: init && init.method, headers: init && init.headers, body: init && init.body ? JSON.parse(init.body) : null });
      const reply = fetchReply ? fetchReply(requests.at(-1)) : { ok: true, json: { ok: true } };
      return { ok: reply.ok, json: async () => reply.json };
    }
  });
  const evaluate = source => vm.runInContext(source, context);
  return { context, evaluate, storage, element, elements, clock, timers, requests, math, src };
}

// Sandbox with every game definition loaded (everything before the startup line).
function makeGameContext(options = {}) {
  const box = createSandbox(options);
  vm.runInContext(box.src.definitions, box.context, { filename: 'game-definitions.js' });
  return box;
}

module.exports = { createSandbox, makeGameContext, seededMath, FIXED_NOW };
