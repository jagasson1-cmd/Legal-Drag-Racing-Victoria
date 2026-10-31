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
  class Param { constructor(v) { this.value = v; this.targets = []; } setTargetAtTime(v) { this.targets.push(v); this.value = v; } setValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v, t) { this.ramp = { v, t }; } linearRampToValueAtTime(v, t) { this.ramp = { v, t }; } cancelScheduledValues() {} }
  class Node { constructor() { this.gain = new Param(1); this.frequency = new Param(0); this.Q = new Param(1); this.stopAt = null; } connect() {} disconnect() {} start() { this.started = true; } stop(t) { this.stopAt = t; } }
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
  let frame = null;
  class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED_NOW); } static now() { return FIXED_NOW; } }
  const context = vm.createContext({
    console, Math: seededMath(seed), Date: FixedDate, JSON, URL, URLSearchParams,
    alert: () => {}, confirm: () => true, prompt: () => null,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
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
  return { evaluate, element, elements, clock, timers, drainFrames, stepFrame };
}

function setup(ctx, eventId, respect = 24) {
  ctx.evaluate(`(()=>{state=freshState();state.money=60000;state.respect=${respect};let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;state.garageCapacity=2;
    let ev=eventById('${eventId}');for(let d=1;d<80;d++){state.day=d;if(daysUntil(ev)===0)break}})()`);
}
const stateJson = ctx => ctx.evaluate('JSON.stringify(state)');

// ---------- Travel: duration, controls and state are unchanged ----------
for (const eventId of ['heathcote_legal', 'calder_test', 'mildura_regional', 'bend_open']) {
  const out = {};
  for (const search of ['', '?racenight=0']) {
    const ctx = makeContext(5, search); setup(ctx, eventId, 60);
    ctx.evaluate(`travelToEvent('${eventId}')`);
    const ev = ctx.evaluate(`eventById('${eventId}')`);
    const delay = ctx.timers.at(-1).ms;
    assert.equal(delay, 2200 + Math.min(1200, Math.round((ev.travelCost || 0) * 0.8)), 'travel duration unchanged');
    const markup = ctx.evaluate('travel()');
    assert.match(markup, /onclick="finishTravel\(\)">Arrive now</);
    assert.match(markup, /onclick="cancelArrival\(\)">Turn back</);
    if (!search) {
      assert.equal(ctx.evaluate('travelClock.ms'), delay, 'route progress uses the same duration as the timer');
      assert.match(markup, /class="card tvTrip"/);
      assert.ok(markup.includes(ev.venue) && markup.includes(ev.tier), 'venue and tier shown');
      assert.ok(markup.includes(ctx.evaluate(`fmt(${ev.travelCost || 0})`)), 'travel cost shown');
      assert.ok(markup.includes(ctx.evaluate(`fmt(${ev.winPayout})`)), 'payout shown');
      assert.match(markup, /Respect to race/);
      assert.match(markup, /Lexus IS200/, 'current car shown');
    } else {
      assert.match(markup, /<h2>On the road<\/h2>/, '?racenight=0 keeps the classic travel screen');
    }
    out[search] = stateJson(ctx);
    ctx.timers.at(-1).fn();
    assert.equal(ctx.evaluate('state.screen'), 'arrival', 'timer still arrives');
  }
  assert.equal(out[''], out['?racenight=0'], 'travel leaves identical state in both presentations');
}
{
  // Arrive now and Turn back.
  const ctx = makeContext(5); setup(ctx, 'mildura_regional');
  ctx.evaluate(`travelToEvent('mildura_regional')`); ctx.evaluate('finishTravel()');
  assert.equal(ctx.evaluate('state.screen'), 'arrival');
  assert.equal(ctx.evaluate('travelTimer'), null);
  const back = makeContext(5); setup(back, 'mildura_regional');
  back.evaluate(`travelToEvent('mildura_regional')`); back.evaluate('cancelArrival()');
  assert.equal(back.evaluate('state.pendingArrival'), null);
  assert.equal(back.evaluate('state.screen'), 'event');
  // Re-render mid-trip continues the same progress rather than restarting it.
  const mid = makeContext(5); setup(mid, 'mildura_regional');
  mid.evaluate(`travelToEvent('mildura_regional')`); mid.clock.t += 1000;
  assert.match(mid.evaluate('travel()'), /--tv-delay:-1000ms/);
  // A trip restored without its timer (e.g. after a reload) shows a held route, not a fake countdown.
  mid.evaluate('travelClock=null');
  assert.match(mid.evaluate('travel()'), /tvRouteHeld[\s\S]*Trip paused/);
  // Long and unusual names are escaped; no active car is handled.
  const odd = makeContext(5); setup(odd, 'heathcote_legal');
  odd.evaluate(`state.car.name='Holden <VN> "Berlina" & Co';travelToEvent('heathcote_legal')`);
  assert.match(odd.evaluate('travel()'), /Holden &lt;VN&gt; &quot;Berlina&quot; &amp; Co/);
  odd.evaluate('state.car=null');
  assert.match(odd.evaluate('travel()'), /No active car/);
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
  console.log('Quarter Mile Builder event presentation checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
