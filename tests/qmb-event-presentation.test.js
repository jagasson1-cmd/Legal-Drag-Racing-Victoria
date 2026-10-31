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

function makeContext(seed, search = '') {
  const storage = new Map([['qmb_sound_enabled', 'false'], ['qmb_music_enabled', 'false']]);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const el = {
        id, innerHTML: '', textContent: '', value: '', disabled: false, hidden: true, title: '', style: {}, className: '', dataset: {}, focused: false,
        setAttribute: () => {}, focus() { this.focused = true; }, querySelector: () => null, querySelectorAll: () => [],
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }
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
    window: { addEventListener: () => {} },
    location: { search, origin: 'http://localhost', pathname: '/' },
    history: { replaceState: () => {} }
  });
  vm.runInContext(definitions, context);
  const evaluate = source => vm.runInContext(source, context);
  // Run animation frames until the current spectator run has finished.
  const drainFrames = () => { let n = 0; while (frame && n < 5000) { const f = frame; frame = null; clock.t += 16; f(clock.t); n++; } return n; };
  return { evaluate, element, elements, clock, timers, drainFrames };
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

console.log('Quarter Mile Builder event presentation checks passed.');
