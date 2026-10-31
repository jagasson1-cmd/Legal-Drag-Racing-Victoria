const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Event presentation: travel trip card and spectator timing tower.
// The new screens are presentation only, so the same seeded flows must leave identical game state, logs and timers
// with the new presentation and with the classic screens (?racenight=0).
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const definitions = script.slice(0, script.indexOf('refreshListings();loadGame(false);render();'));
const FIXED_NOW = 1767225600000;

function seededMath(seed) {
  let s = seed >>> 0;
  const m = Object.create(Math);
  m.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return m;
}

// Minimal Web Audio stand-in: records the values the game schedules and when oscillators are told to stop.
function fakeAudio() {
  const made = { contexts: 0, oscillators: [] };
  class Param { constructor(v) { this.value = v; this.targets = []; } setTargetAtTime(v, t, c) { this.targets.push(v); this.tc = c; this.value = v; } setValueAtTime(v) { this.value = v; this.setTo = v; } exponentialRampToValueAtTime(v, t) { this.ramp = { v, t }; } linearRampToValueAtTime(v, t) { this.ramp = { v, t }; } cancelScheduledValues() {} }
  class Node { constructor() { this.gain = new Param(1); this.frequency = new Param(0); this.Q = new Param(1); this.stopAt = null; this.started = false; } connect() {} disconnect() {} start() { this.started = true; } stop(t) { if (this.stopAt === null || t < this.stopAt) this.stopAt = t; } }
  class Ctx { constructor() { made.contexts++; this.state = 'running'; this.currentTime = 0; this.destination = {}; } createGain() { return new Node(); } createBiquadFilter() { return new Node(); } createOscillator() { const o = new Node(); made.oscillators.push(o); return o; } createBufferSource() { return new Node(); } createBuffer() { return { getChannelData: () => new Float32Array(1) }; } resume() {} }
  return { Ctx, made };
}

function makeContext(seed, search = '', opts = {}) {
  const storage = new Map([['qmb_sound_enabled', opts.sound ? 'true' : 'false'], ['qmb_music_enabled', 'false']]);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const el = {
        id, innerHTML: '', textContent: '', value: '', disabled: false, hidden: true, title: '', style: {}, className: '', dataset: {}, focused: false,
        setAttribute: () => {}, focus() { this.focused = true; }, querySelector: () => null, querySelectorAll: () => [],
        classList: (() => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; v ? s.add(c) : s.delete(c); return v; } }; })()
      };
      elements.set(id, el);
    }
    return elements.get(id);
  };
  const clock = { t: 1000 };
  const timers = [];
  const intervals = new Map(); let intervalId = 0;
  let frame = null;
  class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED_NOW); } static now() { return FIXED_NOW; } }
  const context = vm.createContext({
    console, Math: seededMath(seed), Date: FixedDate, JSON, URL, URLSearchParams,
    alert: () => {}, confirm: () => true, prompt: () => null,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {}, setInterval: fn => { intervals.set(++intervalId, fn); return intervalId; }, clearInterval: id => { intervals.delete(id); },
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = null; },
    performance: { now: () => clock.t }, innerHeight: 900,
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    document: { hidden: false, addEventListener: () => {}, getElementById: id => id === 'driverProfileOverlay' ? null : element(id), querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {}, AudioContext: opts.audio ? opts.audio.Ctx : undefined },
    location: { search, origin: 'http://localhost', pathname: '/' },
    history: { replaceState: () => {} }
  });
  vm.runInContext(definitions, context);
  const evaluate = source => vm.runInContext(source, context);
  // Run animation frames until the current spectator run has finished.
  const drainFrames = () => { let n = 0; while (frame && n < 5000) { const f = frame; frame = null; clock.t += 16; f(clock.t); n++; } return n; };
  const stepFrame = () => { if (!frame) return false; const f = frame; frame = null; clock.t += 16; f(clock.t); return true; };
  return { evaluate, element, elements, clock, timers, intervals, storage, drainFrames, stepFrame };
}

function setup(ctx, eventId, respect = 24) {
  ctx.evaluate(`(()=>{state=freshState();state.money=60000;state.respect=${respect};let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;state.garageCapacity=2;
    let ev=eventById('${eventId}');for(let d=1;d<80;d++){state.day=d;if(daysUntil(ev)===0)break}})()`);
}
const stateJson = ctx => ctx.evaluate('JSON.stringify(state)');

// ---------- Travel: venue pacing, controls and state ----------
const EXPECTED_MS = { calder_test: 4000, heathcote_legal: 7000, mildura_regional: 11000, state_grudge: 6000, bend_open: 8000, sydney_challenge: 8000 };
{
  const ctx = makeContext(5);
  const ids = JSON.parse(ctx.evaluate('JSON.stringify(EVENT_CALENDAR.map(e=>e.id))'));
  assert.deepEqual(ids.slice().sort(), Object.keys(EXPECTED_MS).sort(), 'every calendar event has an expected travel pacing');
  assert.equal(ctx.evaluate('travelProfile(SPECIAL_EVENTS.youYangs.id).ms'), 7000, 'first You Yangs journey about 7 s');
  // Destinations without a profile fall back to 5-8 s from travel cost.
  assert.equal(ctx.evaluate(`travelProfile('nowhere',{travelCost:0,region:'VIC',tier:'Local'}).ms`), 5000);
  assert.equal(ctx.evaluate(`travelProfile('nowhere',{travelCost:5000,region:'SA',tier:'Interstate'}).ms`), 8000);
  // Profiles never show distances or times.
  const profiles = ctx.evaluate('JSON.stringify(TRAVEL_PROFILES)');
  assert.doesNotMatch(profiles, /\bkm\b|kilomet|\bhours?\b|\bminutes?\b/i, 'no invented distances or journey times');
}
for (const eventId of Object.keys(EXPECTED_MS)) {
  const out = {};
  for (const search of ['', '?racenight=0']) {
    const ctx = makeContext(5, search); setup(ctx, eventId, 60);
    const moneyBefore = ctx.evaluate('state.money');
    ctx.evaluate(`travelToEvent('${eventId}')`);
    const ev = ctx.evaluate(`eventById('${eventId}')`);
    const delay = ctx.timers.at(-1).ms;
    assert.equal(delay, EXPECTED_MS[eventId], `${eventId}: travel pacing from the profile`);
    assert.equal(ctx.evaluate('travelClock.ms'), delay, 'route progress uses the same duration as the timer');
    assert.equal(ctx.evaluate('state.money'), moneyBefore, 'travelling charges nothing');
    const markup = ctx.evaluate('travel()');
    assert.match(markup, /onclick="finishTravel\(\)">Arrive now</);
    assert.match(markup, /onclick="cancelArrival\(\)">Turn back</);
    if (!search) {
      const scene = ctx.evaluate(`travelProfile('${eventId}').scene`), legs = ctx.evaluate(`travelProfile('${eventId}').legs.length`);
      assert.match(markup, new RegExp(`class="tvScene tvScene-${scene}"`), 'destination scene');
      assert.equal((markup.match(/class="tvTick"/g) || []).length, legs - 1, 'one route tick per leg boundary');
      assert.match(markup, /Leg 1 of \d+ · Out of the shed/);
      assert.doesNotMatch(markup, /\d+(\.\d+)?\s?s\b[^a-z]|takes about|\bkm\b/, 'no journey time or distance shown');
      assert.ok(markup.includes(ev.venue) && markup.includes(ev.tier), 'venue and tier shown');
      assert.ok(markup.includes(ctx.evaluate(`fmt(${ev.winPayout})`)), 'payout shown');
      assert.match(markup, /Lexus IS200/, 'current car shown');
      // Leg text advances with the ticker and ends on the last leg.
      const tick = [...ctx.intervals.values()][0];
      assert.ok(tick, 'travel ticker running');
      ctx.clock.t += delay - 1; tick();
      assert.match(ctx.element('tvStatus').textContent, new RegExp(`Leg ${legs} of ${legs}`));
    } else {
      assert.match(markup, /<h2>On the road<\/h2>/, '?racenight=0 keeps the classic travel screen');
    }
    out[search] = stateJson(ctx);
    ctx.timers.at(-1).fn();
    assert.equal(ctx.evaluate('state.screen'), 'arrival', 'timer still arrives');
    assert.equal(ctx.intervals.size, 0, 'ticker stopped on natural arrival');
    assert.equal(ctx.evaluate('travelClock'), null);
  }
  assert.equal(out[''], out['?racenight=0'], 'travel leaves identical state in both presentations');
}
for (const eventId of Object.keys(EXPECTED_MS)) {
  // Arrive now and Turn back at every destination.
  const ctx = makeContext(5); setup(ctx, eventId, 60);
  ctx.evaluate(`travelToEvent('${eventId}')`); ctx.evaluate('finishTravel()');
  assert.equal(ctx.evaluate('state.screen'), 'arrival', `${eventId}: Arrive now`);
  assert.equal(ctx.evaluate('travelTimer'), null); assert.equal(ctx.intervals.size, 0);
  assert.equal(ctx.evaluate('state.pendingArrival.eventId'), eventId, 'arrival keeps the trip');
  const back = makeContext(5); setup(back, eventId, 60);
  back.evaluate(`state.screen='event';render()`);
  const before = stateJson(back);
  back.evaluate(`travelToEvent('${eventId}')`); back.evaluate('cancelArrival()');
  assert.equal(stateJson(back), before, `${eventId}: Turn back leaves state exactly as before the trip`);
  assert.equal(back.evaluate('travelTimer'), null); assert.equal(back.intervals.size, 0);
}
{
  // Re-render mid-trip continues the same progress rather than restarting it.
  const mid = makeContext(5); setup(mid, 'mildura_regional');
  mid.evaluate(`travelToEvent('mildura_regional')`); mid.clock.t += 1000;
  assert.match(mid.evaluate('travel()'), /--tv-delay:-1000ms/);
  // Navigating away pauses the trip: timer, ticker and clock cleared, nothing charged; returning shows a held route.
  const money = mid.evaluate('state.money');
  mid.evaluate(`show('garage')`);
  assert.equal(mid.evaluate('travelTimer'), null); assert.equal(mid.intervals.size, 0); assert.equal(mid.evaluate('travelClock'), null);
  assert.equal(mid.evaluate('state.money'), money);
  assert.match(mid.evaluate('travel()'), /tvRouteHeld[\s\S]*Trip paused[\s\S]*Arrive now/);
  // Reload mid-trip: the saved trip restores as paused, with no timer, no charge; Arrive now still works.
  const saved = mid.evaluate('JSON.stringify(state)');
  const re = makeContext(9); re.evaluate(`state=migrateGameState(mergeBadgeCareer(JSON.parse(${JSON.stringify(saved)}),state));state.screen='travel';render()`);
  const timersBefore = re.timers.length;
  assert.match(re.element('screen').innerHTML, /Trip paused/);
  assert.equal(re.timers.length, timersBefore); assert.equal(re.intervals.size, 0);
  assert.equal(re.evaluate('state.money'), money);
  re.evaluate('finishTravel()'); assert.equal(re.evaluate('state.screen'), 'arrival');
  // Long and unusual names are escaped; no active car is handled.
  const odd = makeContext(5); setup(odd, 'heathcote_legal');
  odd.evaluate(`state.car.name='Holden <VN> "Berlina" & Co';travelToEvent('heathcote_legal')`);
  assert.match(odd.evaluate('travel()'), /Holden &lt;VN&gt; &quot;Berlina&quot; &amp; Co/);
  odd.evaluate('state.car=null');
  assert.match(odd.evaluate('travel()'), /No active car/);
}
{
  // Mobile and reduced motion: both controls stay full width on phones; scene motion stops with reduced motion.
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const phone = css.slice(css.indexOf('@media(max-width:640px){\n      .tvTrip'));
  assert.match(phone.slice(0, 1500), /\.tvActions \.btn\{flex:1 1 0;min-width:0\}/);
  assert.match(phone.slice(0, 1500), /\.tvScene\{height:62px/);
  const reduced = css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /\.tvScene::after\{animation:none\}/);
  assert.match(reduced, /\.tvFill,\.tvMark\{animation-timing-function:steps\(4,end\)\}/);
  assert.match(css, /\.tvSceneHeld::after\{animation:none\}/, 'paused trips do not animate');
}

// ---------- Spectator: same simulation, betting, queue and rewards in both presentations ----------
function spectatorFlow(search) {
  const ctx = makeContext(21, search); setup(ctx, 'heathcote_legal');
  ctx.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('spectate')`);
  const screens = [];
  // A side bet on the first race, then a plain watched race.
  ctx.evaluate(`betNextLineupRace();selectBetPick('b');placeLineupBet()`);
  const betStage = ctx.element('screen').innerHTML;
  ctx.drainFrames(); screens.push(ctx.element('screen').innerHTML);
  ctx.evaluate(`watchNextLineupRace(false)`);
  const stage = ctx.element('screen').innerHTML;
  ctx.drainFrames(); screens.push(ctx.element('screen').innerHTML);
  return { ctx, state: stateJson(ctx), log: ctx.evaluate('JSON.stringify(state.log)'), betStage, stage, screens };
}
{
  const fresh = spectatorFlow(''), classic = spectatorFlow('?racenight=0');
  assert.equal(fresh.state, classic.state, 'spectating and betting leave identical state');
  assert.equal(fresh.log, classic.log, 'identical log entries');
  assert.match(fresh.stage, /class="card svStage"/);
  assert.match(classic.stage, /Watching a pass/, '?racenight=0 keeps the classic spectator screen');
  for (const id of ['watchALane', 'watchADot', 'watchAText', 'watchBLane', 'watchBDot', 'watchBText', 'watchTime', 'watchCountdown', 'watchLeader'])
    assert.ok(fresh.stage.includes(`id="${id}"`), `spectator view keeps #${id} for the existing tick`);
  for (const s of [fresh.stage, fresh.betStage, ...fresh.screens]) {
    assert.doesNotMatch(s, /R\/T|reaction/i, 'no reaction-time data is implied for NPC races');
    assert.doesNotMatch(s, /raceLaunchBtn|touchShiftBtn|rnSpeedBig|rnTachBox|shiftLight/, 'no player instruments');
  }
  assert.match(fresh.betStage, /Your pick/, 'the picked car is marked during the race');
  const board = fresh.screens[1];
  assert.match(board, /Timing Board/);
  assert.match(board, /class="svWin">WIN</);
  assert.match(board, /Scouting notes/);
  assert.match(board, /Passes you have watched tonight|First pass you have watched/);
  // Board numbers are the simulated results for the race just watched.
  const res = JSON.parse(fresh.ctx.evaluate(`JSON.stringify(state.lastEvent.lineup.filter(r=>r.result).slice(-1)[0]?.result||null)`) || 'null');
  if (res) { assert.ok(board.includes(res.aEt.toFixed(3)) && board.includes(res.bEt.toFixed(3)), 'board shows the simulated ETs'); }
}
{
  // Tree phases follow the existing countdown; green comes on when the cars move (no extra wait added).
  const ctx = makeContext(21); setup(ctx, 'heathcote_legal');
  ctx.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('spectate');watchNextLineupRace(false)`);
  const t0 = ctx.clock.t, phase = () => ctx.element('svPhase').textContent;
  const step = ms => { ctx.clock.t = t0 + ms; ctx.evaluate(`(()=>{let r=watchRun;if(r&&r.sv)svPaint(r,${ctx.clock.t})})()`); };
  step(100); assert.equal(phase(), 'PRE-STAGE');
  step(900); assert.equal(phase(), 'STAGED');
  step(1800); assert.equal(phase(), 'AMBERS');
  assert.equal(ctx.evaluate('watchRun.start'), null);
  ctx.drainFrames();
  assert.equal(ctx.evaluate('watchRun'), null, 'run completes through the existing tick');
}
{
  // Watch All before my race: same auto-continue timer, same state, Stop still works.
  const run = search => {
    const ctx = makeContext(33, search); setup(ctx, 'heathcote_legal', 30);
    ctx.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0])`);
    const before = ctx.evaluate('racesBeforePlayer(state.lastEvent)');
    ctx.evaluate('watchAllBeforeMine()');
    const shown = [];
    let guard = 0;
    while (ctx.evaluate('watchAllMode') && guard++ < 20) {
      ctx.drainFrames(); shown.push(ctx.element('screen').innerHTML);
      const t = ctx.timers.at(-1);
      if (!ctx.evaluate('watchAllMode')) break;
      assert.equal(t.ms, 1400, 'Watch All auto-continue delay unchanged');
      t.fn();
    }
    return { ctx, before, shown, state: stateJson(ctx) };
  };
  const fresh = run(''), classic = run('?racenight=0');
  assert.equal(fresh.state, classic.state, 'Watch All leaves identical state');
  if (fresh.before > 1) assert.match(fresh.shown[0], /onclick="stopWatchAllBeforeMine\(\)"/, 'stop control on the board');
  // Stop mid-race: finishes the current race, then goes to my race.
  const stop = makeContext(33); setup(stop, 'heathcote_legal', 30);
  stop.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0])`);
  if (stop.evaluate('racesBeforePlayer(state.lastEvent)') >= 1) {
    stop.evaluate('watchAllBeforeMine()');
    assert.match(stop.element('screen').innerHTML, /onclick="stopWatchAllBeforeMine\(\)"/, 'stop control during the race');
    stop.evaluate('stopWatchAllBeforeMine()');
    assert.equal(stop.evaluate('watchStopAfterCurrent'), true);
    stop.drainFrames();
    assert.equal(stop.evaluate('currentLineupEntry().type'), 'player', 'stopping still lands on the player race');
  }
}

// ---------- Spectator post-finish coasting (audio and lane state only) ----------
{
  // Engine model: unchanged before the stripe, then falls from the finish rpm toward idle and never holds.
  const ctx = makeContext(3);
  const cars = JSON.parse(ctx.evaluate(`JSON.stringify([...CARS].sort((a,b)=>a.red-b.red).filter((c,i,a)=>i===0||i===a.length-1||i===Math.floor(a.length/2)).map(c=>c.id))`));
  for (const id of cars) {
    const car = `makeOwned(CARS.find(x=>x.id==='${id}'),'auto','D')`;
    const rpm = t => ctx.evaluate(`spectatorEngineRpm(${car},${t},12)`);
    const top = ctx.evaluate(`CARS.find(x=>x.id==='${id}').red*.82`), idle = ctx.evaluate(`idleRpm(${car})`);
    for (const t of [0, 3, 6, 11.99]) assert.ok(Math.abs(rpm(t) - (1200 + Math.min(1, t / 12) * (top - 1200))) < 1e-9, `${id}: racing rpm unchanged before the stripe`);
    assert.ok(Math.abs(rpm(12) - top) < 1e-9, `${id}: coasting starts from the finish rpm`);
    let prev = rpm(12);
    for (let t = 12.1; t < 15; t += 0.1) { const r = rpm(t); assert.ok(r < prev && r >= idle, `${id}: rpm falls after the stripe (t=${t.toFixed(1)})`); prev = r; }
    assert.ok(Math.abs(rpm(13.4 - 1e-7) - rpm(13.4 + 1e-7)) < 1, `${id}: no step when braking starts`);
    assert.equal(rpm(30), idle, `${id}: settles at idle`);
    const f = t => ctx.evaluate(`spectatorVoice(${car},${t},12).freq`);
    assert.ok(f(12.2) < f(12) && f(12.6) < f(12.2), `${id}: pitch falls straight away, even at the 260 Hz cap`);
  }
}
(async () => {
  const settle = () => new Promise(r => setImmediate(r));
  const voices = ctx => JSON.parse(ctx.evaluate('JSON.stringify({a:spectatorAudio.a.frequency.value,b:spectatorAudio.b.frequency.value,ga:spectatorAudio.ga.gain.value,gb:spectatorAudio.gb.gain.value})'));
  {
    // Both engines coast independently: whichever car crosses first lifts while the other is still on the throttle.
    for (const [etA, etB] of [[10, 11], [11, 10]]) {
      const audio = fakeAudio(), ctx = makeContext(3, '', { sound: true, audio });
      ctx.evaluate(`globalThis.__a=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');globalThis.__b=makeOwned(CARS.filter(x=>x.price<34000).slice(-1)[0],'auto','D')`);
      await ctx.evaluate('startSpectatorAudio(__a,__b)');
      const read = t => { ctx.evaluate(`updateSpectatorAudio(${t},${etA},${etB})`); return voices(ctx); };
      const first = Math.min(etA, etB), aFirst = etA < etB;
      const atCross = read(first), soon = read(first + 0.5), both = read(Math.max(etA, etB) + 0.5), later = read(Math.max(etA, etB) + 1);
      const [lead, trail, gLead, gTrail] = aFirst ? ['a', 'b', 'ga', 'gb'] : ['b', 'a', 'gb', 'ga'];
      assert.ok(soon[lead] < atCross[lead], 'the first car to cross falls in pitch');
      assert.ok(soon[gLead] < 1, 'the first car lifts off the throttle');
      assert.ok(soon[trail] >= atCross[trail] && soon[gTrail] === 1, 'the other car is still on the throttle (pitch not falling; it may sit at the 260 Hz cap)');
      assert.ok(later[trail] < both[trail] && later[lead] < both[lead], 'both cars coast once both have crossed');
    }
  }
  {
    // Through the real watched race: lane state and audio follow each car's own crossing; results and timing match sound-off.
    const flow = async sound => {
      const audio = fakeAudio(), ctx = makeContext(21, '', { sound, audio }); setup(ctx, 'heathcote_legal');
      ctx.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('spectate');watchNextLineupRace(false)`);
      await settle();
      const et = JSON.parse(ctx.evaluate('JSON.stringify([watchRun.sv.r1.et,watchRun.sv.r2.et])'));
      const rows = []; let frames = 0;
      while (ctx.stepFrame()) {
        frames++;
        if (!ctx.evaluate('!!(watchRun&&watchRun.start)')) continue;
        const t = ctx.evaluate('(performance.now()-watchRun.start)/1000');
        rows.push({ t, la: ctx.element('svLaneA').classList.contains('coasting'), lb: ctx.element('svLaneB').classList.contains('coasting'), sa: ctx.element('svStateA').textContent, sb: ctx.element('svStateB').textContent, audio: sound ? voices(ctx) : null });
      }
      return { ctx, audio, et, rows, frames, state: stateJson(ctx), log: ctx.evaluate('JSON.stringify(state.log)') };
    };
    const on = await flow(true), off = await flow(false);
    assert.equal(on.state, off.state, 'race results, bet state and rewards unchanged by spectator audio');
    assert.equal(on.log, off.log, 'identical log');
    assert.equal(on.frames, off.frames, 'race takes the same number of frames');
    assert.deepEqual(on.et, off.et, 'identical ETs');
    assert.ok(on.rows.some(r => r.la !== r.lb), 'one car coasts while the other is still racing');
    for (const r of on.rows) {
      assert.equal(r.la, r.t >= on.et[0], 'left lane coasts only after its own ET');
      assert.equal(r.lb, r.t >= on.et[1], 'right lane coasts only after its own ET');
      assert.equal(r.sa, r.t >= on.et[0] ? (r.t - on.et[0] >= 1.4 ? 'Braking' : 'Coasting') : '');
      assert.equal(r.sb, r.t >= on.et[1] ? (r.t - on.et[1] >= 1.4 ? 'Braking' : 'Coasting') : '');
      assert.equal(r.audio.ga < 1, r.t >= on.et[0], 'left engine lifts only after its ET');
      assert.equal(r.audio.gb < 1, r.t >= on.et[1], 'right engine lifts only after its ET');
    }
    const first = on.et[0] < on.et[1] ? 'a' : 'b', firstEt = Math.min(...on.et), after = on.rows.filter(r => r.t > firstEt);
    for (let i = 1; i < after.length; i++) assert.ok(after[i].audio[first] < after[i - 1].audio[first], "the winner's pitch keeps falling until the other car finishes");
    // Finish: the engines get a short self-stopping coast tail; leaving the board cuts it at once.
    assert.equal(on.ctx.evaluate('spectatorAudio'), null);
    assert.ok(on.ctx.evaluate('spectatorTail!==null'), 'finish keeps a short coast tail');
    const spec = on.audio.made.oscillators.filter(o => o.frequency.targets.length > 3);
    assert.equal(spec.length, 2, 'one oscillator per car');
    assert.ok(spec.every(o => Math.abs(o.stopAt - 0.62) < 1e-9), 'tail stops itself after 0.6 s');
    on.ctx.evaluate(`show('event')`);
    assert.equal(on.ctx.evaluate('spectatorTail'), null);
    assert.ok(spec.every(o => o.stopAt <= 0.06 + 1e-9), 'leaving the screen stops the tail immediately');
    assert.equal(off.audio.made.contexts, 0, 'sound off creates no audio');
  }
  {
    // Exiting mid-race stops spectator audio and the animation frame.
    const audio = fakeAudio(), ctx = makeContext(21, '', { sound: true, audio }); setup(ctx, 'heathcote_legal');
    ctx.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('spectate');watchNextLineupRace(false)`);
    await settle();
    for (let i = 0; i < 300; i++) ctx.stepFrame();
    assert.ok(ctx.evaluate('!!(watchRun&&watchRun.start)') && ctx.evaluate('spectatorAudio!==null'), 'mid-race with audio running');
    ctx.evaluate(`show('event')`);
    assert.equal(ctx.evaluate('spectatorAudio'), null);
    assert.equal(ctx.evaluate('spectatorTail'), null);
    assert.ok(audio.made.oscillators.filter(o => o.frequency.targets.length > 3).every(o => o.stopAt !== null && o.stopAt <= 0.2 + 1e-9), 'engines stopped on exit');
    assert.equal(ctx.stepFrame(), false, 'no animation frame left running');
    // Turning sound off mid-race stops the engines on the next frame.
    ctx.evaluate(`show('currentEvent');watchNextLineupRace(false)`); await settle();
    for (let i = 0; i < 250; i++) ctx.stepFrame();
    assert.ok(ctx.evaluate('spectatorAudio!==null'));
    ctx.evaluate('soundEnabled=false'); ctx.stepFrame();
    assert.equal(ctx.evaluate('spectatorAudio'), null, 'sound-off mid-race stops spectator audio');
  }
  {
    // Watch All with sound: same timing and state as sound-off; Stop lands on my race with no audio left.
    const run = async sound => {
      const audio = fakeAudio(), ctx = makeContext(33, '', { sound, audio }); setup(ctx, 'heathcote_legal', 30);
      ctx.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0])`);
      ctx.evaluate('watchAllBeforeMine()'); await settle();
      const delays = []; let guard = 0;
      while (ctx.evaluate('watchAllMode') && guard++ < 20) {
        ctx.drainFrames();
        if (!ctx.evaluate('watchAllMode')) break;
        const t = ctx.timers.filter(x => x.fn.name === 'continueWatchAllBeforeMine').at(-1); delays.push(t.ms); t.fn(); await settle();
      }
      return { ctx, audio, delays, state: stateJson(ctx) };
    };
    const on = await run(true), off = await run(false);
    assert.equal(on.state, off.state, 'Watch All results and queue unchanged with sound on');
    assert.deepEqual(on.delays, off.delays, 'Watch All auto-continue timing unchanged');
    assert.ok(on.delays.every(d => d === 1400));
    on.ctx.evaluate(`show('currentEvent')`);
    assert.equal(on.ctx.evaluate('spectatorAudio'), null); assert.equal(on.ctx.evaluate('spectatorTail'), null);
    assert.ok(on.audio.made.oscillators.filter(o => o.frequency.targets.length > 3).every(o => o.stopAt !== null), 'no spectator engine left running after Watch All');
    const audio = fakeAudio(), stop = makeContext(33, '', { sound: true, audio }); setup(stop, 'heathcote_legal', 30);
    stop.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0])`);
    if (stop.evaluate('racesBeforePlayer(state.lastEvent)') >= 1) {
      stop.evaluate('watchAllBeforeMine()'); await settle();
      for (let i = 0; i < 300; i++) stop.stepFrame();
      stop.evaluate('stopWatchAllBeforeMine()'); stop.drainFrames();
      assert.equal(stop.evaluate('currentLineupEntry().type'), 'player', 'Stop still lands on the player race');
      assert.equal(stop.evaluate('spectatorAudio'), null); assert.equal(stop.evaluate('spectatorTail'), null, 'going to my race cuts the coast tail');
      assert.ok(audio.made.oscillators.filter(o => o.frequency.targets.length > 3).every(o => o.stopAt !== null), 'no spectator audio left after Stop');
    }
  }
  // ---------- Travel cruising audio ----------
  const engineVoices = audio => audio.made.oscillators.filter(o => o.type === 'sawtooth' || o.type === 'square');
  const running = audio => engineVoices(audio).filter(o => o.started && o.stopAt === null).length;
  {
    // Cruise rpm is a believable cruising range for slow, middle and high-revving cars, and it varies.
    const ctx = makeContext(3);
    for (const id of JSON.parse(ctx.evaluate(`JSON.stringify([...CARS].sort((a,b)=>a.red-b.red).filter((c,i,a)=>i===0||i===a.length-1||i===Math.floor(a.length/2)).map(c=>c.id))`))) {
      const car = `makeOwned(CARS.find(x=>x.id==='${id}'),'auto','D')`;
      const rpms = [0, 1.3, 2.7, 4.1, 6.6, 9.2].map(t => ctx.evaluate(`cruiseRpm(${car},${t})`));
      assert.ok(rpms.every(r => r >= 1500 && r <= 2700), `${id}: cruise rpm ${rpms} in a cruising range`);
      assert.ok(new Set(rpms).size > 3, `${id}: cruise rpm varies`);
      assert.ok(Math.max(...rpms) / Math.min(...rpms) < 1.12, `${id}: variation stays subtle`);
    }
    const g0 = ctx.evaluate('cruiseVoice(0).gain'), g10 = ctx.evaluate('cruiseVoice(10).gain');
    assert.ok(g0 <= 0.03 && g10 < g0, 'restrained, and settles quieter on long trips');
  }
  for (const [label, exit, expectScreen] of [['Arrive now', 'finishTravel()', 'arrival'], ['Turn back', 'cancelArrival()', 'event'], ['navigation away', `show('garage')`, 'garage'], ['natural arrival', null, 'arrival']]) {
    const audio = fakeAudio(), ctx = makeContext(5, '', { sound: true, audio }); setup(ctx, 'mildura_regional');
    ctx.evaluate('render()'); const carBefore = ctx.evaluate('JSON.stringify(state.car)');
    ctx.evaluate(`travelToEvent('mildura_regional')`); await settle();
    assert.equal(ctx.evaluate('!!(engineAudio&&engineAudio.cruise)'), true, `${label}: cruise voice running`);
    assert.equal(running(audio), 2, 'one engine voice (two oscillators)');
    const body = ctx.evaluate('engineAudio.body'), gain = ctx.evaluate('engineAudio.master.gain');
    assert.ok(gain.setTo <= 0.0001 && gain.tc >= 0.5, 'fades in slowly from silence');
    const tick = [...ctx.intervals.values()][0], freqs = [];
    for (let i = 0; i < 30; i++) { ctx.clock.t += 200; tick(); freqs.push(body.frequency.value); }
    assert.ok(new Set(freqs.map(f => f.toFixed(2))).size > 10, 'pitch drifts naturally');
    assert.ok(gain.value > 0 && gain.value <= 0.03, 'quiet cruising level');
    if (exit) ctx.evaluate(exit); else ctx.timers.filter(t => t.fn.name === 'finishTravel').at(-1).fn();
    assert.equal(ctx.evaluate('state.screen'), expectScreen);
    assert.equal(ctx.evaluate('engineAudio'), null, `${label}: engine voice released`);
    assert.equal(ctx.evaluate('cruiseAudio'), null);
    assert.equal(running(audio), 0, `${label}: oscillators stopped`);
    assert.ok(gain.ramp && gain.ramp.v <= 0.0001 && gain.ramp.t <= 0.16 + 1e-9, `${label}: quick fade out`);
    assert.equal(ctx.intervals.size, 0, `${label}: ticker stopped`);
    assert.equal(ctx.evaluate('JSON.stringify(state.car)'), carBefore, 'cruising never changes the car');
  }
  {
    // No overlap: travelling again replaces the voice; turning sound off mid-trip stops it; another engine is left alone.
    const audio = fakeAudio(), ctx = makeContext(5, '', { sound: true, audio }); setup(ctx, 'heathcote_legal');
    ctx.evaluate(`travelToEvent('heathcote_legal')`); await settle();
    ctx.evaluate(`cancelArrival();travelToEvent('heathcote_legal')`); await settle();
    assert.equal(running(audio), 2, 'only one engine voice after re-travelling');
    assert.equal(ctx.intervals.size, 1, 'only one ticker');
    ctx.evaluate('soundEnabled=false'); ctx.clock.t += 200; [...ctx.intervals.values()][0]();
    assert.equal(running(audio), 0, 'sound off mid-trip stops the cruise');
    assert.equal(ctx.intervals.size, 1, 'the leg ticker keeps running without sound');
    ctx.evaluate('soundEnabled=true;finishTravel()');
    // Another engine taking over (e.g. a race) is not touched by the cruise or by stopping travel.
    const a2 = fakeAudio(), c2 = makeContext(5, '', { sound: true, audio: a2 }); setup(c2, 'heathcote_legal');
    c2.evaluate(`travelToEvent('heathcote_legal')`); await settle();
    await c2.evaluate('startEngineAudio(state.car,3000)');
    const other = c2.evaluate('engineAudio'), otherGain = other.master.gain.targets.slice();
    c2.clock.t += 200; [...c2.intervals.values()][0]();
    assert.deepEqual(other.master.gain.targets, otherGain, 'cruise ticker does not drive another engine');
    c2.evaluate('stopTravelFx()');
    assert.equal(c2.evaluate('engineAudio'), other, 'stopping travel leaves another engine running');
    assert.equal(running(a2), 2, 'old cruise voice was replaced, not left running');
  }
  {
    // Arriving before the engine voice has started leaves nothing behind.
    const a3 = fakeAudio(), c3 = makeContext(5, '', { sound: true, audio: a3 }); setup(c3, 'calder_test');
    c3.evaluate("travelToEvent('calder_test');finishTravel()"); await settle();
    assert.equal(c3.evaluate('engineAudio'), null); assert.equal(running(a3), 0, 'no late-starting cruise');
  }
  {
    // Sound disabled: no audio is created during the whole trip.
    const audio = fakeAudio(), ctx = makeContext(5, '', { sound: false, audio }); setup(ctx, 'mildura_regional');
    ctx.evaluate(`travelToEvent('mildura_regional')`); await settle();
    for (let i = 0; i < 10; i++) { ctx.clock.t += 200; [...ctx.intervals.values()][0](); }
    ctx.timers.filter(t => t.fn.name === 'finishTravel').at(-1).fn();
    assert.equal(audio.made.contexts, 0, 'sound off creates no audio context');
  }

  // ---------- First You Yangs invitation journey ----------
  const yyInvite = (ctx, money = 9000) => ctx.evaluate(`(()=>{state=freshState();state.money=${money};state.respect=130;let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;checkYouYangsInvitation();render()})()`);
  const yy = ctx => JSON.parse(ctx.evaluate('JSON.stringify(youYangsState())'));
  {
    // Accepting the invitation opens the journey, not the hub; nothing is charged.
    const audio = fakeAudio(), ctx = makeContext(7, '', { sound: true, audio }); yyInvite(ctx);
    assert.equal(yy(ctx).invited, true);
    ctx.evaluate('openPendingNotification()'); await settle();
    assert.equal(ctx.evaluate('state.screen'), 'yyTravel');
    assert.equal(ctx.timers.filter(t => t.fn.name === 'yyArriveJourney').at(-1).ms, 7000);
    const m = ctx.element('screen').innerHTML;
    assert.match(m, /tvScene-proving/); assert.match(m, /Invitation only/);
    assert.match(m, /onclick="yyArriveJourney\(\)">Arrive now</); assert.match(m, /onclick="yyTurnBack\(\)">Turn back</);
    assert.match(m, /\$3,000/); assert.match(m, /\$2,000/);
    assert.equal(ctx.evaluate('state.money'), 9000, 'no travel fee');
    assert.equal(yy(ctx).introJourneyDone, false, 'not complete until arrival');
    assert.equal(ctx.evaluate('!!(engineAudio&&engineAudio.cruise)'), true, 'cruise plays on the journey');
    // Natural arrival opens the existing hub; entry payment and car selection are unchanged.
    ctx.timers.filter(t => t.fn.name === 'yyArriveJourney').at(-1).fn();
    assert.equal(ctx.evaluate('state.screen'), 'youYangs');
    assert.equal(yy(ctx).introJourneyDone, true);
    assert.equal(running(audio), 0, 'journey audio stopped on arrival');
    assert.match(ctx.element('screen').innerHTML, /Pay entry and begin session/);
    assert.equal(JSON.parse(ctx.storage.get('qmb_mvp_save')).specialEventPrestige.youYangs.introJourneyDone, true, 'arrival is saved');
    ctx.evaluate('yyPayEntry()');
    assert.equal(ctx.evaluate('state.money'), 6000, 'standard entry fee only');
    assert.equal(yy(ctx).entered, true);
    // Later visits go straight to the hub.
    ctx.evaluate(`show('garage');show('youYangs')`);
    assert.equal(ctx.evaluate('state.screen'), 'youYangs');
  }
  {
    // Arrive now skips the journey; the nav entry point starts the journey the same way.
    const ctx = makeContext(7); yyInvite(ctx);
    ctx.evaluate(`show('youYangs')`);
    assert.equal(ctx.evaluate('state.screen'), 'yyTravel');
    ctx.evaluate('yyArriveJourney()');
    assert.equal(ctx.evaluate('state.screen'), 'youYangs'); assert.equal(yy(ctx).introJourneyDone, true);
    assert.equal(ctx.evaluate('travelTimer'), null); assert.equal(ctx.intervals.size, 0);
  }
  {
    // Turning back keeps the invitation and charges nothing; the next acceptance starts the journey again.
    const ctx = makeContext(7); yyInvite(ctx);
    ctx.evaluate('openPendingNotification()');
    const before = yy(ctx);
    ctx.evaluate('yyTurnBack()');
    assert.equal(ctx.evaluate('state.screen'), 'home');
    assert.deepEqual(yy(ctx), before, 'You Yangs state untouched');
    assert.equal(ctx.evaluate('state.money'), 9000);
    assert.equal(ctx.evaluate('travelTimer'), null); assert.equal(ctx.intervals.size, 0);
    assert.match(ctx.element('nav').innerHTML, /show\('youYangs'\)">Private Invitation</, 'invitation still available');
    ctx.evaluate(`show('youYangs')`);
    assert.equal(ctx.evaluate('state.screen'), 'yyTravel');
    // Navigating away mid-journey stops it without completing it.
    ctx.evaluate(`show('garage')`);
    assert.equal(yy(ctx).introJourneyDone, false); assert.equal(ctx.intervals.size, 0); assert.equal(ctx.evaluate('travelTimer'), null);
  }
  {
    // Reload mid-journey: restores as a paused journey; nothing consumed; Arrive now completes it.
    const ctx = makeContext(7); yyInvite(ctx);
    ctx.evaluate("show('youYangs')");
    const saved = ctx.storage.get('qmb_mvp_save');
    assert.equal(JSON.parse(saved).screen, 'yyTravel');
    const re = makeContext(8); re.evaluate(`state=migrateGameState(mergeBadgeCareer(JSON.parse(${JSON.stringify(saved)}),state));render()`);
    assert.match(re.element('screen').innerHTML, /Trip paused[\s\S]*yyArriveJourney/);
    assert.equal(re.intervals.size, 0); assert.equal(re.evaluate('state.money'), 9000);
    assert.equal(yy(re).invited, true); assert.equal(yy(re).introJourneyDone, false);
    re.evaluate('yyArriveJourney()');
    assert.equal(re.evaluate('state.screen'), 'youYangs'); assert.equal(yy(re).introJourneyDone, true);
  }
  {
    // Existing saves: players who have entered before, or are mid-session, are never sent on the journey.
    for (const patch of ['y.visits=2;y.nextEligibleDay=state.day+5', 'y.visits=1;y.entered=true;y.entryCarId=state.car.uid;y.attempts.highSpeed=1', 'y.visits=3']) {
      const ctx = makeContext(7); yyInvite(ctx);
      ctx.evaluate(`(()=>{let y=youYangsState();${patch};y.best.highSpeed={peakSpeed:211};y.tiers.highSpeed='bronze';delete y.introJourneyDone})()`);
      const legacy = ctx.evaluate('JSON.stringify(state)');
      const re = makeContext(8); re.evaluate(`state=migrateGameState(mergeBadgeCareer(JSON.parse(${JSON.stringify(legacy)}),state));show('youYangs')`);
      assert.equal(re.evaluate('state.screen'), 'youYangs', `${patch}: straight to the hub`);
      const a = JSON.parse(legacy).specialEventPrestige.youYangs, b = yy(re);
      for (const k of ['visits', 'entered', 'nextEligibleDay', 'attempts', 'best', 'tiers', 'carRecords', 'entryCarId', 'overallTitle']) { if (k === 'entryCarId' && a[k] === null) continue; assert.deepEqual(b[k], a[k], `${k} preserved`); } // the hub pre-selects a car when none is chosen (existing behaviour)
    }
    // An old save with an accepted-but-unused invitation (no new field) gets the journey once, with safe defaults.
    const ctx = makeContext(7); yyInvite(ctx);
    ctx.evaluate('(()=>{let y=youYangsState();y.invitationShown=true;delete y.introJourneyDone})()');
    const old = ctx.evaluate('JSON.stringify(state)');
    const re = makeContext(8); re.evaluate(`state=migrateGameState(mergeBadgeCareer(JSON.parse(${JSON.stringify(old)}),state));show('youYangs')`);
    assert.equal(re.evaluate('state.screen'), 'yyTravel');
    assert.equal(yy(re).introJourneyDone, false);
  }
  {
    // Local and cloud round trips keep the new optional field (both load paths use migrateGameState(mergeBadgeCareer(...))).
    const ctx = makeContext(7); yyInvite(ctx);
    ctx.evaluate(`show('youYangs');yyArriveJourney()`);
    const local = ctx.storage.get('qmb_mvp_save');
    const re = makeContext(8); re.evaluate(`state=migrateGameState(mergeBadgeCareer(JSON.parse(${JSON.stringify(local)}),state))`);
    assert.equal(yy(re).introJourneyDone, true, 'local load keeps the field');
    // Cloud load (cloud copy replaces local) and cloud save (local merged with the cloud copy).
    const cloud = makeContext(9); cloud.evaluate(`state=migrateGameState(mergeBadgeCareer(JSON.parse(${JSON.stringify(local)}),freshState()))`);
    assert.equal(yy(cloud).introJourneyDone, true, 'cloud load keeps the field');
    cloud.evaluate(`state=migrateGameState(mergeBadgeCareer(state,JSON.parse(${JSON.stringify(local)})))`);
    assert.equal(yy(cloud).introJourneyDone, true, 'cloud save merge keeps the field');
    assert.equal(JSON.parse(cloud.evaluate('JSON.stringify(state)')).specialEventPrestige.youYangs.introJourneyDone, true, 'serialised payload carries it');
  }
  console.log('Quarter Mile Builder event presentation checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
