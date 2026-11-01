'use strict';
// A small Web Audio stand-in for tests. It records what the game schedules (parameter targets, connections, start and
// stop times) and lets a test drive the audio clock, timers, intervals and page visibility by hand.
// It never makes sound and never touches the network.
const vm = require('node:vm');
const { createSandbox } = require('./game-context');

function fakeWebAudio() {
  const made = { contexts: [], nodes: [], sources: [] };
  class Param {
    constructor(v) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
    setTargetAtTime(v, t, c) { this.events.push(['target', v, t, c]); this.value = v; this.target = v; return this; }
    linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); this.value = v; return this; }
    exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw new RangeError('exponential ramp to a non-positive value'); this.events.push(['exp', v, t]); this.value = v; return this; }
    cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
  }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outputs = []; this.gain = new Param(1); this.frequency = new Param(0); this.Q = new Param(1); this.pan = new Param(0); this.playbackRate = new Param(1); made.nodes.push(this); }
    connect(n) { this.outputs.push(n); return n; }
    disconnect() { this.outputs = []; this.disconnected = true; }
  }
  class Source extends Node {
    constructor(ctx, kind) { super(ctx, kind); this.startAt = null; this.stopAt = null; made.sources.push(this); }
    start(t = 0) { if (this.startAt !== null) throw new Error('start called twice'); this.startAt = t; }
    stop(t = this.ctx.currentTime) { if (this.startAt === null) throw new Error('stop before start'); this.stopAt = this.stopAt === null ? t : Math.min(this.stopAt, t); }
  }
  class Ctx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = new Node(this, 'destination'); this.resumes = 0; this.suspends = 0; made.contexts.push(this); }
    createGain() { return new Node(this, 'gain'); }
    createBiquadFilter() { return new Node(this, 'filter'); }
    createStereoPanner() { return new Node(this, 'panner'); }
    createDynamicsCompressor() { const n = new Node(this, 'compressor'); n.threshold = new Param(0); n.ratio = new Param(1); n.attack = new Param(0); n.release = new Param(0); return n; }
    createOscillator() { return new Source(this, 'oscillator'); }
    createBufferSource() { return new Source(this, 'buffer'); }
    createBuffer(ch, len, rate) { const data = new Float32Array(len); return { length: len, sampleRate: rate, getChannelData: () => data }; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  }
  return { Ctx, made };
}

// Game sandbox with the fake audio installed before any game script runs.
// opts.activated: whether the browser reports a user activation yet (navigator.userActivation.hasBeenActive).
function audioSandbox(opts = {}) {
  const audio = fakeWebAudio();
  const box = createSandbox({ seed: opts.seed || 1, storage: opts.storage || { qmb_sound_enabled: 'true', qmb_music_enabled: 'true' } });
  const listeners = {};
  const on = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  const timeouts = []; const intervals = new Map(); let nextId = 1;
  const activation = { hasBeenActive: opts.activated !== false };
  Object.assign(box.context, {
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.push({ id, fn, ms }); return id; },
    clearTimeout: id => { const i = timeouts.findIndex(t => t.id === id); if (i >= 0) timeouts.splice(i, 1); },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => { intervals.delete(id); },
    navigator: { userActivation: activation }
  });
  box.context.window = { addEventListener: on, AudioContext: opts.noAudio ? undefined : audio.Ctx };
  box.context.document.addEventListener = on;
  vm.runInContext(box.src.definitions, box.context, { filename: 'game-definitions.js' });
  const ctx = () => audio.made.contexts[0] || null;
  return {
    ...box, audio, listeners, timeouts, intervals, activation,
    // Run every pending timeout once (in order), as if their delays had passed.
    flushTimeouts() { const due = timeouts.splice(0); for (const t of due) t.fn(); return due.length; },
    // Advance the audio clock by `seconds`, firing every interval once per 0.25 s step.
    advance(seconds) { const c = ctx(); const steps = Math.round(seconds / 0.25); for (let i = 0; i < steps; i++) { if (c) c.currentTime += 0.25; for (const { fn } of [...intervals.values()]) fn(); } },
    fire(type) { for (const fn of listeners[type] || []) fn({ type, target: { closest: () => null }, key: '', code: '' }); },
    ctx
  };
}

module.exports = { fakeWebAudio, audioSandbox };
