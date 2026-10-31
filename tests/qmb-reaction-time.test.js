const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Player reaction time: launch input, red light, no launch, finish order, report fields and save compatibility.
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const definitions = script.slice(0, script.indexOf('refreshListings();loadGame(false);render();'));
// Seeds where the natural matchup allows a holeshot win (player ET slower, by less than the reaction gap)
// and a quicker-ET loss after a late launch. Found by searching seeds 1..400 with the same harness.
const FOUND = { holeshot: 5, quicker: 38 };

function seededMath(seed) {
  let s = seed >>> 0;
  const m = Object.create(Math);
  m.calls = 0;
  m.random = () => { m.calls++; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return m;
}

function makeContext(seed = 1) {
  const storage = new Map([['qmb_sound_enabled', 'false'], ['qmb_music_enabled', 'false']]);
  const elements = new Map();
  const docListeners = {}, winListeners = {};
  const element = id => {
    if (!elements.has(id)) {
      const el = {
        id, innerHTML: '', textContent: '', value: '', disabled: false, title: '', style: {}, className: '', focused: false,
        setAttribute: () => {}, focus() { this.focused = true; }, querySelector: () => null,
        classList: {
          add: c => { if (c && !el.className.split(/\s+/).includes(c)) el.className = (el.className + ' ' + c).trim(); },
          remove: c => { el.className = el.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
          contains: c => el.className.split(/\s+/).includes(c),
          toggle: (c, on) => { const has = el.className.split(/\s+/).includes(c); const want = on === undefined ? !has : !!on; if (want && !has) el.classList.add(c); if (!want && has) el.classList.remove(c); }
        }
      };
      elements.set(id, el);
    }
    return elements.get(id);
  };
  const clock = { t: 1000 };
  const document = {
    hidden: false,
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
    getElementById: id => id === 'driverProfileOverlay' ? null : element(id),
    querySelectorAll: () => []
  };
  const context = vm.createContext({
    console, Math: seededMath(seed), Date, JSON, URL, URLSearchParams,
    alert: () => {}, confirm: () => true, prompt: () => null,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    performance: { now: () => clock.t },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    document,
    window: { addEventListener: (type, fn) => { (winListeners[type] ||= []).push(fn); } },
    location: { search: '', origin: 'http://localhost', pathname: '/' },
    history: { replaceState: () => {} }
  });
  vm.runInContext(definitions, context);
  // The global key handler is registered after the definitions in index.html; register the same source line here.
  const keyLine = script.slice(script.indexOf("window.addEventListener('keydown'"), script.indexOf('\n', script.indexOf("window.addEventListener('keydown'")));
  vm.runInContext(keyLine, context);
  const evaluate = source => vm.runInContext(source, context);
  return { context, evaluate, elements, element, clock, storage, document, docListeners, winListeners };
}

// Set up a Heathcote race night with an owned car and the player queued against the first raceable opponent.
function setupRace(ctx, { trans = 'auto', mode = 'D', carId = 'is200' } = {}) {
  ctx.evaluate(`(()=>{state=freshState();state.money=60000;let c=makeOwned(CARS.find(x=>x.id==='${carId}'),'${trans}','${mode}');state.owned=[c];state.car=c;state.activeCarId=c.uid;state.garageCapacity=2;
    travelToEvent('heathcote_legal');finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0]);goToMyRace();})()`);
  return ctx.evaluate(`currentLineupEntry().opponentIndex`);
}

// Drive a real race: startLiveRace -> tickLiveRace frames -> finishLiveRace. launchMs is relative to scheduled green; null = never launch.
function runRace(ctx, { launchMs = 200, shiftOnLight = false, hideBeforeGreen = false, maxFrames = 4000, rivalReaction = null } = {}) {
  const idx = ctx.evaluate(`currentLineupEntry().opponentIndex`);
  ctx.evaluate(`startLiveRace(${idx})`);
  // Optional override of the drawn opponent reaction (set before green, so the rival launch is anchored to it).
  if (rivalReaction !== null) ctx.evaluate(`liveRun.rivalReaction=${rivalReaction}`);
  const greenAt0 = ctx.evaluate('liveRun.greenScheduledAt');
  let launched = false, hid = false;
  for (let i = 0; i < maxFrames; i++) {
    if (!ctx.evaluate('!!liveRun&&!liveRun.finished')) break;
    ctx.clock.t += 16;
    if (hideBeforeGreen && !hid && ctx.clock.t > greenAt0 - 400) {
      hid = true; ctx.document.hidden = true; ctx.docListeners.visibilitychange.forEach(fn => fn());
      ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
      ctx.clock.t += 5000; ctx.document.hidden = false;
    }
    // Positive offsets are measured from visible green (the frame that drew it); negative ones from the scheduled green.
    if (!launched && launchMs !== null && (!hideBeforeGreen || hid) && !ctx.evaluate('liveRun.restagePending')) {
      const ref = launchMs < 0 ? ctx.evaluate('liveRun.greenScheduledAt') : ctx.evaluate('liveRun.greenAt');
      if (ref !== null && ctx.clock.t >= ref + launchMs) { ctx.evaluate(`handleRaceInput(${ref + launchMs})`); launched = true; }
    }
    if (shiftOnLight && ctx.evaluate(`!!liveRun.start&&!liveRun.playerFinish&&/\\bon\\b/.test(document.getElementById('shiftLight').className)`)) {
      ctx.evaluate(`handleRaceInput(${ctx.clock.t})`);
    }
    ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
  }
  assert.ok(ctx.evaluate('!!liveRun&&liveRun.finished'), 'race should finish');
  return ctx.evaluate('JSON.parse(JSON.stringify(state.lastEvent.raceReports.slice(-1)[0]))');
}

// Advance to the frame that draws green and return its timestamp (visible green).
function showGreen(ctx, lateMs = 0) {
  ctx.clock.t = ctx.evaluate('liveRun.greenScheduledAt') + lateMs;
  ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
  return ctx.evaluate('liveRun.greenAt');
}

// ---------- Pure outcome rules ----------
{
  const ctx = makeContext(1);
  const o = (a, b, c, d) => ctx.evaluate(`rtRaceOutcome(${a},${b},${c},${d})`);
  let r = o(0.2, 14.0, 0.3, 14.05);
  assert.equal(r.result, 'win'); assert.equal(r.decidedBy, 'et'); assert.equal(r.holeshot, false);
  r = o(0.05, 14.10, 0.30, 14.00);
  assert.equal(r.result, 'win'); assert.equal(r.holeshot, true); assert.equal(r.decidedBy, 'reaction');
  assert.ok(Math.abs(r.margin - 0.15) < 1e-9, 'margin is the difference in totals');
  r = o(0.40, 13.90, 0.15, 14.00);
  assert.equal(r.result, 'loss'); assert.equal(r.holeshot, true);
  r = o(0, 14, 0.1, 14);
  assert.equal(r.result, 'win'); assert.equal(r.foul, null, '0.000 is exactly on green, not a foul');
  r = o(-0.001, 13, 0.3, 15);
  assert.equal(r.result, 'loss'); assert.equal(r.foul, 'you'); assert.equal(r.decidedBy, 'foul');
  r = o(0.5, 15, -0.02, 13);
  assert.equal(r.result, 'win'); assert.equal(r.foul, 'opponent');
  r = o(-0.05, 13, -0.02, 15);
  assert.equal(r.result, 'loss', 'both red: the more negative reaction loses'); assert.equal(r.foul, 'both');
  r = o(-0.02, 15, -0.05, 13);
  assert.equal(r.result, 'win');
  r = o(0.2, 14.1, 0.25, 14.05);
  assert.equal(r.result, 'deadHeat'); assert.equal(r.margin, 0);
  r = o(0.2, 14.1, 0.2504, 14.05);
  assert.equal(r.result, 'deadHeat', 'totals equal to the displayed 0.001 s precision');
  r = o(0.2, 14.1, 0.2516, 14.05);
  assert.equal(r.result, 'win');

  assert.equal(ctx.evaluate('rtRating(0.05)'), 'Excellent');
  assert.equal(ctx.evaluate('rtRating(0.15)'), 'Good');
  assert.equal(ctx.evaluate('rtRating(0.25)'), 'Average');
  assert.equal(ctx.evaluate('rtRating(0.45)'), 'Late');
  assert.equal(ctx.evaluate('rtRating(0.8)'), 'Very late');
  assert.equal(ctx.evaluate('rtRating(-0.01)'), 'Red light');
  assert.equal(ctx.evaluate('rtRating(undefined)'), 'Not recorded');
}

// ---------- Opponent model and tree: deterministic, separate generator ----------
{
  const ctx = makeContext(7);
  const before = ctx.context.Math.calls;
  const a = ctx.evaluate(`rtOpponentReaction({entryId:'x_1',label:'serious local'},{tier:'Local'},2)`);
  const b = ctx.evaluate(`rtOpponentReaction({entryId:'x_1',label:'serious local'},{tier:'Local'},2)`);
  const c = ctx.evaluate(`rtOpponentReaction({entryId:'x_1',label:'serious local'},{tier:'Local'},3)`);
  assert.equal(a, b, 'same opponent and round give the same reaction');
  assert.notEqual(a, c, 'a new round draws a new reaction');
  assert.equal(ctx.context.Math.calls, before, 'opponent reactions must not consume Math.random');
  const other = makeContext(999);
  assert.equal(other.evaluate(`rtOpponentReaction({entryId:'x_1',label:'serious local'},{tier:'Local'},2)`), a, 'independent of the game seed');
  for (let i = 0; i < 200; i++) {
    const t = ctx.evaluate(`rtTreeTiming('k${i}')`);
    assert.ok(t.green >= 3.0 - 1e-9 && t.green <= 3.8 + 1e-9, 'green 3.0 to 3.8 s after staging');
    assert.ok(Math.abs(t.green - t.firstAmber - 1.5) < 1e-9, 'full tree: three ambers 0.5 s apart');
  }
  assert.deepEqual(ctx.evaluate(`rtTreeTiming('same')`), ctx.evaluate(`rtTreeTiming('same')`));
  assert.equal(ctx.context.Math.calls, before, 'tree timing must not consume Math.random');
}

// ---------- Full races (Auto D) ----------
{
  // ET is identical when only reaction time changes; totals and reaction differ.
  const quick = makeContext(42); setupRace(quick); const rq = runRace(quick, { launchMs: 150 });
  const slow = makeContext(42); setupRace(slow); const rs = runRace(slow, { launchMs: 450 });
  assert.equal(rq.yourEt, rs.yourEt, 'player ET unchanged by reaction');
  assert.equal(rq.oppEt, rs.oppEt, 'opponent ET unchanged');
  assert.equal(rq.oppReaction, rs.oppReaction, 'opponent reaction deterministic for the same race');
  assert.ok(Math.abs(rq.yourReaction - 0.15) < 1e-6 && Math.abs(rs.yourReaction - 0.45) < 1e-6);
  assert.ok(Math.abs(rq.yourTotal - (rq.yourReaction + rq.yourEt)) < 1e-9, 'total = reaction + ET');
  assert.equal(rq.reactionModel, 1);
  assert.equal(rq.foul, null);
  assert.match(quick.elements.get('screen').innerHTML, /R\/T/);

  // Baseline ET equals the pre-feature value for this seed: the movement-start clock is unchanged.
  const legacy = makeContext(42); setupRace(legacy);
  const idx = legacy.evaluate(`currentLineupEntry().opponentIndex`);
  legacy.evaluate(`startLiveRace(${idx})`);
  assert.equal(legacy.evaluate('liveRun.playerBase.et+liveRun.penalty'), rq.yourEt, 'Auto D ET equals the simulated base ET');
}

{
  // Red light: input before green.
  const ctx = makeContext(42); setupRace(ctx);
  const r = runRace(ctx, { launchMs: -60 });
  assert.equal(r.foul, 'you'); assert.equal(r.result, 'LOSS'); assert.equal(r.win, false);
  assert.ok(r.yourReaction < 0); assert.equal(r.decidedBy, 'foul');
  assert.ok(Number.isFinite(r.yourEt), 'a red-light pass still records a real ET');
  assert.equal(ctx.evaluate('state.car.bestET'), r.yourEt, 'D8: red-light ET may update vehicle records');
  assert.equal(ctx.evaluate(`!!(state.badges&&state.badges.clean_time_slip)`), false, 'red light cannot earn Clean Time Slip');
  assert.match(ctx.elements.get('screen').innerHTML, /Red light/);
}

// ---------- Both-red win vs clean win: wonRace, cleanWin and cleanPass are separate ----------
// Capture the badge context and the social result for one race; force the daily briefing to a given challenge.
function instrument(ctx, dailyId) {
  ctx.evaluate(`(()=>{let d=ensureDailyBriefing();d.challengeId='${dailyId}';d.progress=0;d.completed=false;d.claimed=false;
    globalThis.__badgeCtx=null;globalThis.__socialWon=undefined;let orig=checkRelevantBadges;
    checkRelevantBadges=function(t,c){if(t==='race_completed')globalThis.__badgeCtx=JSON.parse(JSON.stringify({wonRace:c.wonRace,cleanWin:c.cleanWin,win:c.win,foul:c.foul,cleanPass:c.cleanPass}));return orig(t,c)};
    socialData={profile:{displayName:'Test',friendCode:'T'}};queueSocialRace=function(p,won){globalThis.__socialWon=won}})()`);
}
function raceSnapshot(ctx, before) {
  return ctx.evaluate(`(()=>{let rec=getEventRaceRecord(liveRun.rivalCar);return {money:state.money-${before.money},respect:state.respect-${before.respect},
    recWins:rec.wins,recLosses:rec.losses,carWins:state.car.wins||0,daily:ensureDailyBriefing().progress,badgeCtx:globalThis.__badgeCtx,socialWon:globalThis.__socialWon,
    clean:!!(state.badges&&state.badges.clean_time_slip),brung:!!(state.badges&&state.badges.run_what_you_brung),screen:document.getElementById('screen').innerHTML}})()`);
}
function startState(ctx) { return ctx.evaluate('({money:state.money,respect:state.respect})'); }

{
  // Both lanes red, the player's foul less severe: a legitimate round win, but not a clean one.
  const ctx = makeContext(42); setupRace(ctx); instrument(ctx, 'win');
  const before = startState(ctx);
  const r = runRace(ctx, { launchMs: -20, rivalReaction: -0.09 });
  const s = raceSnapshot(ctx, before);
  assert.equal(r.foul, 'both'); assert.equal(r.result, 'WIN'); assert.equal(r.win, true); assert.equal(r.decidedBy, 'foul');
  assert.deepEqual(s.badgeCtx, { wonRace: true, cleanWin: false, win: true, foul: true, cleanPass: false }, 'badge context separates the concepts');
  assert.ok(s.money > 0, 'normal win cash'); assert.ok(s.respect > 0, 'Respect awarded');
  assert.equal(s.recWins, 1); assert.equal(s.recLosses, 0, 'event record counts the win');
  assert.equal(s.carWins, 1, 'vehicle win counted');
  assert.equal(s.daily, 1, 'generic "win a race" daily objective counts it');
  assert.equal(s.socialWon, true, 'social result reports the win');
  assert.equal(s.clean, false, 'no Clean Time Slip');
  assert.equal(s.brung, true, 'generic win badge (standard car) is not clean-only, so it is awarded');
  assert.doesNotMatch(s.screen, /clean win/i, 'never described as a clean win');
  assert.match(s.screen, /Both lanes red-lit/);

  // Same both-red race, with the "Clean Run" daily objective: not counted.
  const c2 = makeContext(42); setupRace(c2); instrument(c2, 'clean');
  runRace(c2, { launchMs: -20, rivalReaction: -0.09 });
  assert.equal(raceSnapshot(c2, startState(c2)).daily, 0, 'clean-pass objective not credited by a fouled win');

  // Both red, the player's foul more severe: an ordinary loss.
  const c3 = makeContext(42); setupRace(c3); instrument(c3, 'win');
  const b3 = startState(c3);
  const r3 = runRace(c3, { launchMs: -60, rivalReaction: -0.01 });
  const s3 = raceSnapshot(c3, b3);
  assert.equal(r3.result, 'LOSS'); assert.equal(r3.foul, 'both');
  assert.deepEqual(s3.badgeCtx, { wonRace: false, cleanWin: false, win: false, foul: true, cleanPass: false });
  assert.equal(s3.money, 0); assert.equal(s3.recLosses, 1); assert.equal(s3.carWins, 0); assert.equal(s3.daily, 0); assert.equal(s3.socialWon, false);
}

{
  // Clean wins: no player foul (opponent red, or a normal race) give wonRace and cleanWin together.
  const ctx = makeContext(42); setupRace(ctx); instrument(ctx, 'win');
  const r = runRace(ctx, { launchMs: 300, rivalReaction: -0.03 });
  const s = raceSnapshot(ctx, startState(ctx));
  assert.equal(r.foul, 'opponent'); assert.equal(r.result, 'WIN');
  assert.equal(s.badgeCtx.wonRace, true); assert.equal(s.badgeCtx.cleanWin, true); assert.equal(s.badgeCtx.foul, false);
  assert.equal(s.daily, 1); assert.equal(s.socialWon, true); assert.equal(s.brung, true);

  const n = makeContext(42); setupRace(n); instrument(n, 'clean');
  const rn = runRace(n, { launchMs: 150, rivalReaction: 0.4 });
  const sn = raceSnapshot(n, startState(n));
  assert.equal(rn.result, 'WIN'); assert.equal(rn.foul, null);
  assert.equal(sn.badgeCtx.cleanWin, true);
  assert.equal(sn.badgeCtx.cleanPass, sn.clean, 'Clean Time Slip follows cleanPass on an unfouled win');
  assert.equal(sn.daily, sn.badgeCtx.cleanPass ? 1 : 0, 'clean daily follows cleanPass');
}

{
  // Visible green: reaction is measured from the frame that draws green, not the scheduled time.
  // An input after the scheduled time but before that frame is still a red light.
  const ctx = makeContext(42); setupRace(ctx);
  const idx = ctx.evaluate(`currentLineupEntry().opponentIndex`);
  ctx.evaluate(`startLiveRace(${idx})`);
  const sched = ctx.evaluate('liveRun.greenScheduledAt');
  ctx.clock.t = sched - 5; ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
  assert.equal(ctx.evaluate('liveRun.greenAt'), null, 'green not drawn before its scheduled time');
  ctx.evaluate(`handleRaceInput(${sched + 3})`);
  assert.equal(ctx.evaluate('liveRun.foul'), true, 'input before the green frame is a red light');
  assert.equal(ctx.evaluate('liveRun.reaction'), null, 'reaction pending until the green frame is known');
  ctx.clock.t = sched + 11; ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
  assert.equal(ctx.evaluate('liveRun.greenAt'), sched + 11, 'visible green = first frame at or after the scheduled time');
  assert.ok(Math.abs(ctx.evaluate('liveRun.reaction') - (-0.008)) < 1e-9, 'negative reaction resolved against visible green');
  const late = makeContext(42); setupRace(late); late.evaluate(`startLiveRace(${idx})`);
  const shown = showGreen(late, 9);
  late.evaluate(`handleRaceInput(${shown + 150})`);
  assert.ok(Math.abs(late.evaluate('liveRun.reaction') - 0.15) < 1e-9, 'a frame drawn 9 ms late does not add 9 ms to reaction');
  assert.ok(Math.abs(late.evaluate('liveRun.rivalLaunchAt') - (shown + late.evaluate('liveRun.rivalReaction') * 1000)) < 1e-6, 'rival launches from the same visible green');
}

{
  // Input during the first 0.5 s (pre-stage) is ignored, not a foul.
  const ctx = makeContext(42); setupRace(ctx);
  const idx = ctx.evaluate(`currentLineupEntry().opponentIndex`);
  ctx.evaluate(`startLiveRace(${idx})`);
  ctx.evaluate(`handleRaceInput(liveRun.countStart+200)`);
  assert.equal(ctx.evaluate('liveRun.start'), null);
  assert.equal(ctx.evaluate('liveRun.foul'), false);
}

{
  // No launch: "Did not leave" after five seconds; counts as a loss; no ET recorded; event summary still renders.
  const ctx = makeContext(42); setupRace(ctx);
  const respectBefore = ctx.evaluate('state.respect');
  const r = runRace(ctx, { launchMs: null });
  assert.equal(r.decidedBy, 'noLaunch'); assert.equal(r.result, 'LOSS'); assert.equal(r.yourEt, null); assert.equal(r.yourReaction, null);
  assert.ok(ctx.evaluate('state.respect') > respectBefore, 'normal loss Respect, no extra penalty');
  assert.equal(ctx.evaluate('state.car.bestET||null'), null, 'no pass, no vehicle record');
  assert.equal(ctx.evaluate('getEventRaceRecord(liveRun.rivalCar).losses'), 1);
  assert.match(ctx.elements.get('screen').innerHTML, /Did not leave/);
  const summary = ctx.evaluate(`eventSummaryHtml({raceReports:state.lastEvent.raceReports,startMoney:0,endMoney:0,startRespect:0,endRespect:0,cashNet:0,cashIn:0,cashOut:0,respectIn:0,respectOut:0,respectNet:0,raceCount:1,winCount:0,lossCount:1,entries:[]})`);
  assert.match(summary, /Did not leave/);
}

{
  // Hidden before launch: the attempt is cancelled and restaged; no foul or reaction from the interrupted attempt.
  const ctx = makeContext(42); setupRace(ctx);
  const r = runRace(ctx, { launchMs: 220, hideBeforeGreen: true });
  assert.equal(r.foul, null);
  assert.ok(Math.abs(r.yourReaction - 0.22) < 1e-6, 'reaction measured against the restaged green');
  assert.equal(ctx.evaluate('liveRun.rtAttempt'), 1);
}

{
  // Holeshot win (slower ET wins on reaction) and holeshot loss (quicker ET loses on reaction). Seeds found by search.
  const win = makeContext(HOLESHOT_SEED()); setupRace(win);
  const rw = runRace(win, { launchMs: 20 });
  assert.equal(rw.result, 'WIN'); assert.equal(rw.holeshot, true); assert.ok(rw.yourEt > rw.oppEt, 'won with the slower ET');
  assert.match(win.elements.get('screen').innerHTML, /Holeshot win/);
  const loss = makeContext(QUICKER_ET_SEED()); setupRace(loss);
  const rl = runRace(loss, { launchMs: 700 });
  assert.equal(rl.result, 'LOSS'); assert.equal(rl.holeshot, true); assert.ok(rl.yourEt < rl.oppEt, 'lost with the quicker ET');
  assert.match(loss.elements.get('screen').innerHTML, /Holeshot loss/);
}

// ---------- Manual car: launch then SHIFT on the same input, with launch lockout ----------
{
  const ctx = makeContext(42); setupRace(ctx, { trans: 'manual', mode: 'manual', carId: 'is200' });
  const idx = ctx.evaluate(`currentLineupEntry().opponentIndex`);
  ctx.evaluate(`startLiveRace(${idx})`);
  assert.equal(ctx.elements.get('raceLaunchBtn') ? true : true, true);
  ctx.clock.t = showGreen(ctx) + 200;
  ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
  ctx.evaluate(`handleRaceInput(${ctx.clock.t})`);
  assert.ok(Math.abs(ctx.evaluate('liveRun.reaction') - 0.2) < 1e-6);
  ctx.evaluate(`handleRaceInput(${ctx.clock.t + 100})`);
  assert.equal(ctx.evaluate('liveRun.shiftEvents.length'), 0, 'input inside the 250 ms launch lockout is ignored, not a double-tap');
  ctx.clock.t += 2000; ctx.evaluate(`tickLiveRace(${ctx.clock.t})`);
  ctx.evaluate(`handleRaceInput(${ctx.clock.t})`);
  assert.equal(ctx.evaluate('liveRun.shiftEvents.length'), 1, 'after launch the same input shifts');
}

// ---------- Launch control: pointerdown, keyboard Enter click, ignored pointer click ----------
{
  const ctx = makeContext(42); setupRace(ctx);
  const idx = ctx.evaluate(`currentLineupEntry().opponentIndex`);
  ctx.evaluate(`startLiveRace(${idx})`);
  const g = showGreen(ctx);
  ctx.evaluate(`rtLaunchClick({detail:1,timeStamp:${g + 50}})`);
  assert.equal(ctx.evaluate('liveRun.start'), null, 'a pointer-generated click does not launch (pointerdown already handled)');
  ctx.evaluate(`rtLaunchPointer({isPrimary:true,pointerType:'mouse',button:2,timeStamp:${g + 60},preventDefault(){}})`);
  assert.equal(ctx.evaluate('liveRun.start'), null, 'right mouse button ignored');
  ctx.evaluate(`rtLaunchPointer({isPrimary:true,pointerType:'touch',button:0,timeStamp:${g + 180},preventDefault(){}})`);
  assert.ok(Math.abs(ctx.evaluate('liveRun.reaction') - 0.18) < 1e-6, 'touch launches on pointerdown');
  const k = makeContext(42); setupRace(k);
  k.evaluate(`startLiveRace(${idx})`);
  const g2 = showGreen(k);
  k.evaluate(`rtLaunchClick({detail:0,timeStamp:${g2 + 240}})`);
  assert.ok(Math.abs(k.evaluate('liveRun.reaction') - 0.24) < 1e-6, 'Enter on the focused LAUNCH button launches');
  assert.equal(k.elements.get('raceLaunchBtn').focused, true, 'LAUNCH receives focus when staging starts');
}

// ---------- Space key: only intercepted during an active run ----------
{
  const ctx = makeContext(3);
  const key = (extra = {}) => { const e = { code: 'Space', key: ' ', repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, timeStamp: ctx.clock.t, target: { closest: () => null }, prevented: false, preventDefault() { this.prevented = true; }, ...extra }; ctx.winListeners.keydown.forEach(fn => fn(e)); return e; };
  ctx.evaluate('state=freshState();liveRun=null;yyRun=null');
  assert.equal(key().prevented, false, 'outside a race Space keeps its normal behaviour');
  setupRace(ctx);
  const idx = ctx.evaluate(`currentLineupEntry().opponentIndex`);
  ctx.evaluate(`startLiveRace(${idx})`);
  ctx.clock.t = showGreen(ctx) + 300;
  assert.equal(key({ target: { closest: () => ({}) } }).prevented, false, 'text fields keep Space');
  assert.equal(key({ shiftKey: true }).prevented, false, 'modified Space ignored');
  const rep = key({ repeat: true });
  assert.equal(rep.prevented, true); assert.equal(ctx.evaluate('liveRun.start'), null, 'key repeat does not launch');
  const k = key({ timeStamp: ctx.clock.t });
  assert.equal(k.prevented, true); assert.ok(Math.abs(ctx.evaluate('liveRun.reaction') - 0.3) < 1e-6, 'Space launches');
  ctx.evaluate('liveRun.finished=true');
  assert.equal(key().prevented, false, 'after the race Space is released');
}

// ---------- Old reports and save compatibility ----------
{
  const ctx = makeContext(5);
  const oldReport = { day: 3, season: 1, result: 'WIN', win: true, opponent: 'Holden Commodore VN V6', yourEt: 15.21, yourTrap: 146, yourSixty: 2.4, yourEighth: 9.7, oppEt: 15.6, oppTrap: 141, cashDelta: 150, respectDelta: 1.1, notes: [] };
  ctx.context.__old = oldReport;
  assert.match(ctx.evaluate('rtRunCell(__old,true)'), /R\/T not recorded/);
  assert.match(ctx.evaluate('rtMarginText(__old)'), /not recorded/);
  assert.match(ctx.evaluate('eventSummaryHtml({raceReports:[__old],startMoney:0,endMoney:0,startRespect:0,endRespect:0,cashNet:0,cashIn:0,cashOut:0,respectIn:0,respectOut:0,respectNet:0,raceCount:1,winCount:1,lossCount:0,entries:[]})'), /R\/T not recorded/);
  assert.match(ctx.evaluate('raceNightSlip({et:15.21,trap:146,sixty:2.4,eighth:9.7},{et:15.6,trap:141,sixty:2.5,eighth:9.9},true,__old,"s")'), /not recorded/);
  assert.equal(ctx.evaluate('GARAGE_SAVE_VERSION'), 2, 'no schema version change');

  // Legacy version-1 save without any reaction fields loads with ownership and reports intact.
  const legacy = ctx.evaluate(`(()=>{let s=freshState();s.saveVersion=1;let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');s.owned=[c];s.car=c;s.activeCarId=c.uid;s.money=4321;s.respect=7.5;s.lastEvent={eventId:'heathcote_legal',raceReports:[__old]};return JSON.stringify(s)})()`);
  ctx.storage.set('qmb_mvp_save', legacy);
  ctx.evaluate('loadGame(false)');
  assert.equal(ctx.evaluate('state.money'), 4321);
  assert.equal(ctx.evaluate('state.respect'), 7.5);
  assert.equal(ctx.evaluate('state.owned.length'), 1);
  assert.equal(ctx.evaluate('state.lastEvent.raceReports[0].yourEt'), 15.21);
  assert.equal(ctx.evaluate('state.lastEvent.raceReports[0].yourReaction'), undefined);

  // New additive fields survive local save normalisation and the cloud merge path.
  const r = makeContext(42); setupRace(r); const rep = runRace(r, { launchMs: 180 });
  r.evaluate('saveGame()');
  const saved = r.storage.get('qmb_mvp_save');
  const reload = makeContext(42);
  reload.storage.set('qmb_mvp_save', saved);
  reload.evaluate('loadGame(false);normaliseState()');
  const back = reload.evaluate('JSON.parse(JSON.stringify(state.lastEvent.raceReports.slice(-1)[0]))');
  for (const f of ['yourReaction', 'oppReaction', 'yourTotal', 'oppTotal', 'margin', 'decidedBy', 'holeshot', 'reactionModel']) assert.deepEqual(back[f], rep[f], `local save keeps ${f}`);
  reload.context.__cloud = JSON.parse(saved);
  const cloud = reload.evaluate('(()=>{let s=migrateGameState(mergeBadgeCareer(clone(__cloud),freshState()));return JSON.parse(JSON.stringify(s.lastEvent.raceReports.slice(-1)[0]))})()');
  for (const f of ['yourReaction', 'oppReaction', 'yourTotal', 'decidedBy', 'reactionModel']) assert.deepEqual(cloud[f], rep[f], `cloud merge keeps ${f}`);
}

function HOLESHOT_SEED() { return Number(process.env.RT_HOLESHOT_SEED || 0) || FOUND.holeshot; }
function QUICKER_ET_SEED() { return Number(process.env.RT_QUICKER_SEED || 0) || FOUND.quicker; }

console.log('Quarter Mile Builder reaction-time checks passed.');
