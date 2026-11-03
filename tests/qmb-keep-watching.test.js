const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');

// Keep Watching: spectating continues race after race and card after card until watch chances run out, the event ends
// or the player stops. Betting pauses it on that pairing and only the player resumes it. It never skips a lane call,
// never simulates or consumes a race when stopped, and draws the same random numbers as the manual sequence.

// Sandbox with animation frames under test control (the shared helper never runs them) and recorded timers.
function box(seed) {
  const b = makeGameContext({ seed });
  let frame = null;
  b.context.requestAnimationFrame = fn => { frame = fn; return 1; };
  b.context.cancelAnimationFrame = () => { frame = null; };
  b.drain = () => { let n = 0; while (frame && n < 5000) { const f = frame; frame = null; b.clock.t += 16; f(b.clock.t); n++; } return n; };
  b.autoTimer = () => b.timers.filter(t => t.ms === b.evaluate('KEEP_WATCH_MS')).at(-1) || null;
  // Record every focus() the game makes, on elements found by id or by selector.
  b.focusCalls = [];
  const byId = b.context.document.getElementById;
  b.context.document.getElementById = id => { const el = byId(id); if (el && !el.__spied) { el.__spied = true; el.focus = () => b.focusCalls.push('#' + id); } return el; };
  b.context.document.querySelector = sel => ({ focus: () => b.focusCalls.push(sel), disabled: false, textContent: '' });
  return b;
}
// Spectating at Heathcote (or entered as a racer when race is true), with enough Respect and money to bet.
function arrive(seed, { race = false, respect = 24 } = {}) {
  const b = box(seed);
  b.evaluate(`(()=>{state=freshState();state.money=60000;state.respect=${respect};let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;state.garageCapacity=2;
    let ev=eventById('heathcote_legal');for(let d=1;d<80;d++){state.day=d;if(daysUntil(ev)===0)break}})()`);
  b.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('${race ? 'race' : 'spectate'}');show('currentEvent')`);
  return b;
}
const ev = (b, expr) => JSON.parse(b.evaluate(`JSON.stringify(${expr})`));
const watches = b => b.evaluate('state.lastEvent.watchesLeft');
const skippedLogs = b => b.evaluate("state.log.filter(l=>/Advanced through|Skipped a non-watched/.test(l.msg)).length");
// Keep Watching until it ends: finish each race, then let the board's auto-continue timer fire.
function runKeepWatching(b, limit = 60) {
  let races = 0;
  for (let i = 0; i < limit; i++) {
    if (b.drain()) races++;
    if (!b.evaluate('keepWatchOn()')) break;
    const t = b.autoTimer(); assert.ok(t, 'the board schedules the next race'); b.timers.length = 0; t.fn();
  }
  return races;
}
// Find a seed whose night has more watch chances than the first card has races, so the run must cross a card boundary.
function crossingSeed() {
  for (let seed = 1; seed < 200; seed++) {
    const b = arrive(seed);
    if (watches(b) > ev(b, 'state.lastEvent.lineup.length') + 1) return seed;
  }
  throw new Error('no seed with more watch chances than one card');
}
const SEED = crossingSeed();

// ---------- Continuous across cards, until watch chances run out ----------
{
  const b = arrive(SEED);
  const total = watches(b), firstRound = ev(b, 'state.lastEvent.roundNo||0');
  assert.match(b.element('screen').innerHTML, /onclick="startKeepWatching\(\)">Keep Watching</, 'offered to a spectator');
  b.focusCalls.length = 0;
  b.evaluate('startKeepWatching()');
  assert.deepEqual(b.focusCalls, ['#svTitle'], "starting it is the player's own action: the first race takes focus as before");
  b.focusCalls.length = 0;
  assert.match(b.element('screen').innerHTML, /onclick="stopWatchAllBeforeMine\(\)">Stop watching</, 'Stop watching is on screen during the race');
  assert.match(b.element('screen').innerHTML, /Keep Watching · \d+ watch chances? left/, 'status line');
  assert.match(b.element('screen').innerHTML, /aria-live="polite">Keep Watching ·/, 'announced politely');
  const races = runKeepWatching(b);
  assert.equal(races, total, 'every watch chance was used on a watched race');
  assert.equal(b.evaluate('KEEP_WATCH_MS'), 4000, 'Keep Watching boards stay up for 4 s');
  assert.equal(b.timers.filter(t => t.ms === b.evaluate('SV_AUTO_MS')).length, 0, 'no 1.4 s auto-start in Keep Watching');
  assert.deepEqual(b.focusCalls, [], 'focus never moves during automatic progression');
  assert.equal(watches(b), 0, 'out of watch chances');
  assert.ok(ev(b, 'state.lastEvent.roundNo') >= firstRound + 1, 'crossed into a later race card');
  assert.equal(b.evaluate('keepWatchOn()'), false, 'the mode ends by itself');
  assert.equal(skippedLogs(b), 0, 'no race was skipped or simulated unwatched');
  assert.match(b.element('screen').innerHTML, /Out of watch chances for tonight\./, 'and says why');
}

// ---------- Same draws and state as the manual sequence ----------
{
  const auto = arrive(SEED);
  auto.evaluate('startKeepWatching()'); runKeepWatching(auto); auto.evaluate("show('currentEvent')");
  const manual = arrive(SEED);
  for (let i = 0; i < 60 && watches(manual) > 0; i++) {
    if (!manual.evaluate('currentLineupEntry()')) manual.evaluate('prepareSpectatorRound(true)');
    manual.evaluate('watchNextLineupRace(false)'); manual.drain(); manual.evaluate("show('currentEvent')");
  }
  assert.equal(auto.evaluate('Math.calls'), manual.evaluate('Math.calls'), 'same number of random draws');
  assert.equal(auto.evaluate('JSON.stringify(state)'), manual.evaluate('JSON.stringify(state)'), 'identical event, money, Respect and log');
}

// ---------- Stop between races and during a race: nothing more is simulated or consumed ----------
{
  const b = arrive(SEED);
  const total = watches(b);
  b.evaluate('startKeepWatching()'); b.drain();
  const t = b.autoTimer();
  b.evaluate('stopWatchAllBeforeMine()');
  assert.equal(b.evaluate('keepWatchOn()'), false, 'stopped between races');
  t.fn(); b.drain();
  assert.equal(watches(b), total - 1, 'the pending auto-start does nothing after Stop');
  assert.equal(skippedLogs(b), 0, 'nothing skipped');
  assert.match(b.element('screen').innerHTML, /Stopped watching\./);

  const c = arrive(SEED);
  c.evaluate('startKeepWatching()');
  c.evaluate('stopWatchAllBeforeMine()');
  assert.equal(c.evaluate('watchRaceActive'), true, 'the race in progress carries on');
  c.drain();
  assert.equal(watches(c), total - 1, 'only the race already running was used');
  assert.equal(c.autoTimer(), null, 'no next race is scheduled');
  assert.match(c.element('screen').innerHTML, /Back to event/, 'its board offers the normal way back');
  assert.match(c.element('screen').innerHTML, /Stopped watching./, 'and says watching has stopped');
  c.evaluate("show('currentEvent')");
  assert.match(c.element('screen').innerHTML, /Stopped watching./, 'the note is still there on the event screen');
  c.evaluate("show('garage');show('currentEvent')");
  assert.doesNotMatch(c.element('screen').innerHTML, /Stopped watching./, 'and clears once the player leaves the event screen');
  assert.equal(skippedLogs(c), 0, 'nothing skipped');
}

// ---------- Betting interrupts on the shown pairing; only the player resumes ----------
{
  let done = false;
  for (let seed = SEED; seed < SEED + 40 && !done; seed++) {
    const b = arrive(seed);
    if (watches(b) < 3) continue;
    b.evaluate('startKeepWatching()'); b.drain();
    assert.match(b.element('screen').innerHTML, /--sv-ms:4000ms/, 'the board countdown shows the 4 s pause');
    const next = ev(b, '(()=>{let e=state.lastEvent,x=currentLineupEntry();return [e.opponents[x.aIdx].name,e.opponents[x.bIdx].name]})()');
    const board = b.element('screen').innerHTML;
    assert.ok(board.includes(`<b>Up next:</b> ${next[0]} vs ${next[1]}`), 'the board names the next pairing');
    assert.match(board, /onclick="pauseKeepWatchingForBet\(\)"\s*>Bet on this race/, 'with a bet button');
    const before = watches(b);
    b.evaluate('pauseKeepWatchingForBet()');
    assert.match(b.element('screen').innerHTML, /Side bet: next queued race/, 'the bet screen opens');
    assert.ok(b.element('screen').innerHTML.includes(next[0]) && b.element('screen').innerHTML.includes(next[1]), 'for that pairing');
    b.timers.forEach(t => t.ms === 1400 && t.fn()); b.drain();
    assert.equal(watches(b), before, 'the countdown no longer starts the race');
    b.evaluate("selectBetPick('a');placeLineupBet()");
    if (b.evaluate('state.lastEvent.over')) { assert.equal(b.evaluate('keepWatchOn()'), false, 'caught betting ends Keep Watching'); continue; }
    assert.ok(b.evaluate("state.log[0].msg").includes(`${next[0]} vs ${next[1]}`), 'the bet is on the shown pairing');
    b.drain();
    assert.equal(watches(b), before - 1, 'the bet race used one watch chance, as before');
    assert.match(b.element('screen').innerHTML, /Keep Watching is paused\./, 'paused after the bet race');
    b.timers.forEach(t => t.ms === 1400 && t.fn()); b.drain();
    assert.equal(watches(b), before - 1, 'no automatic resume');
    b.evaluate("show('currentEvent')");
    assert.match(b.element('screen').innerHTML, /Keep Watching is paused/, 'still paused on the event screen');
    b.evaluate('resumeKeepWatching()');
    assert.equal(b.evaluate('watchRaceActive'), true, 'Keep watching starts the next race');
    b.drain();
    assert.equal(watches(b), before - 2);
    assert.ok(b.autoTimer(), 'and the automatic run continues');
    done = true;
  }
  assert.ok(done, 'a seed placed an uncaught bet');
  // Backing out of the bet keeps it paused.
  const c = arrive(SEED);
  c.evaluate('startKeepWatching()'); c.drain();
  c.evaluate("pauseKeepWatchingForBet();show('currentEvent')");
  assert.equal(c.evaluate('keepWatch&&keepWatch.paused'), true, 'Back to race card leaves it paused');
  assert.match(c.element('screen').innerHTML, /onclick="resumeKeepWatching\(\)">Keep watching/);
  assert.match(c.element('screen').innerHTML, /onclick="stopKeepWatching\(\)">Stop watching/);
}

// ---------- Never offered, and never skipping, while personal runs remain ----------
{
  const b = arrive(SEED, { race: true, respect: 24 });
  assert.ok(b.evaluate('state.lastEvent.runsLeft') > 0);
  assert.equal(b.evaluate('keepWatchAvailable()'), false, 'not available to a racer with runs left');
  b.evaluate('chooseRoundOpponent(state.lastEvent.raceSlots[0])');
  assert.doesNotMatch(b.element('screen').innerHTML, /startKeepWatching/, 'not on a card with a lane call');
  b.evaluate('startKeepWatching()');
  assert.equal(b.evaluate('keepWatchOn()'), false, 'cannot be started');
  // Forced: a lane call appearing mid-mode stops the mode and leaves the player's race untouched.
  const runs = b.evaluate('state.lastEvent.runsLeft');
  b.evaluate("keepWatch={paused:false};state.lastEvent.lineup.forEach(r=>{if(r.type!=='player')r.done=true});keepWatchingStep()");
  assert.equal(b.evaluate('keepWatchOn()'), false, 'stopped at the lane call');
  assert.equal(b.evaluate("currentLineupEntry().type"), 'player', 'the lane call is still next');
  assert.equal(b.evaluate('state.lastEvent.runsLeft'), runs, 'no run used');
  assert.match(b.element('screen').innerHTML, /Your lane call is up\./);
}

// ---------- Leaving ends it ----------
{
  const b = arrive(SEED);
  b.evaluate('startKeepWatching()'); b.drain();
  b.evaluate("show('garage')");
  assert.equal(b.evaluate('keepWatchOn()'), false, 'leaving the event screen ends Keep Watching');
  const t = b.autoTimer(), w = watches(b); t.fn(); b.drain();
  assert.equal(watches(b), w, 'and nothing runs afterwards');
  const c = arrive(SEED);
  c.evaluate('startKeepWatching()'); c.drain(); c.evaluate('endEvent()');
  assert.equal(c.evaluate('keepWatchOn()'), false, 'ending the event ends it');
}
console.log('Quarter Mile Builder keep watching checks passed.');
