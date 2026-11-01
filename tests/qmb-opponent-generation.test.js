const assert = require('node:assert/strict');
const loadGameSource = require('./helpers/game-source');
const { makeGameContext } = require('./helpers/game-context');
const { opponentCases, readExpected, readInput } = require('./helpers/golden-cases');

// Opponent generation and lineup management contract: the seven functions eventProfile, makeOpponents, perfIndex,
// pickRaceSlots, visibleClues, shuffleIndexes and buildNpcPairIndexes must keep producing exactly the same opponents,
// night sizes, call-ups and pairings, with the same number and order of random draws, wherever their code lives.
// Values are compared to 1e-9 (relative); integers, strings, IDs and draw counts must match exactly.
function close(a, b, where) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b)) return assert.equal(a, b, where);
    return assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${where}: ${a} vs ${b}`);
  }
  if (Array.isArray(b)) { assert.ok(Array.isArray(a), `${where}: array expected`); assert.equal(a.length, b.length, `${where}: length`); return b.forEach((v, i) => close(a[i], v, `${where}[${i}]`)); }
  if (b && typeof b === 'object') { assert.deepEqual(Object.keys(a), Object.keys(b), `${where}: fields and their order`); for (const k of Object.keys(b)) close(a[k], b[k], `${where}.${k}`); return; }
  assert.equal(a, b, where);
}

const FUNCTIONS = ['eventProfile', 'makeOpponents', 'perfIndex', 'pickRaceSlots', 'visibleClues', 'shuffleIndexes', 'buildNpcPairIndexes'];
const NAMES = ['Mick', 'Sarah', 'Davo', 'Jess', 'Rob', 'Tayla', 'Chris', 'Ari', 'Ben', 'Mia', 'Noah', 'Eli', 'Zoe', 'Jay', 'Sam', 'Alex', 'Riley', 'Casey'];

// ---------- Golden: names, night sizes, full fields, call-ups, pairing, travel/arrival/save/reload ----------
const actual = opponentCases(), expected = readExpected('opponents');
close(actual.nameSelection, expected.nameSelection, 'driver name for a draw of k/18');
assert.deepEqual(actual.nameSelection, NAMES, 'the 18 driver names, in order, each chosen by its share of the draw');
for (const [id, e] of Object.entries(expected.nightSizes)) close(actual.nightSizes[id], e, `${id} night sizes and event difficulty fields`);
for (const [id, e] of Object.entries(expected.events)) {
  assert.deepEqual(actual.events[id].draws, e.draws, `${id}: random draws per stage`);
  assert.deepEqual(actual.events[id].field.map(o => o.id), e.field.map(o => o.id), `${id}: opponent vehicle IDs and order`);
  assert.deepEqual(actual.events[id].field.map(o => o.driver), e.field.map(o => o.driver), `${id}: driver names and order`);
  close(actual.events[id], e, id);
}
close(actual.slotBoundaries, expected.slotBoundaries, 'call-up selection at the 0.88 slower-car boundary');
assert.deepEqual(actual.slotBoundaries.one, [0, 3, 4, 5], 'one closest match plus every opponent below 0.88 of the player');
close(actual.arrival, expected.arrival, 'travel, arrival, queue, save and reload');
assert.equal(actual.arrival.pendingEqualsArrived, true, 'arrival keeps the opponents generated during travel');
assert.equal(actual.arrival.reloadEqualsSaved, true, 'saving and reloading keeps the event opponents, call-ups and lineup');
assert.equal(actual.arrival.networkRequests, 0, 'no network requests without a recovery code');

// ---------- Draw structure: 7 to 10 draws per opponent, one for the night size, none for call-ups ----------
for (const [id, e] of Object.entries(actual.events)) {
  const n = e.field.length;
  assert.ok(e.draws.makeOpponents >= 7 * n && e.draws.makeOpponents <= 10 * n, `${id}: ${e.draws.makeOpponents} draws for ${n} opponents`);
  assert.equal(e.draws.eventProfile, 1, `${id}: eventProfile draws once`);
  assert.equal(e.draws.pickRaceSlotsNoCar + e.draws.pickRaceSlotsWithCar, 0, `${id}: call-up selection draws nothing`);
  assert.equal(e.draws.shuffle10, 9, `${id}: shuffling n indexes draws n-1 times`);
  assert.equal(e.draws.spectatorPairs, n - 1, `${id}: spectator pairing shuffles every opponent`);
  assert.equal(e.draws.racerPairs, n - 2, `${id}: racer pairing leaves out the player's opponent`);
  assert.ok(e.field.every((o, i) => o.eventIndex === i && o.entryId.startsWith(o.id + '_' + i + '_') && o.uid.startsWith(o.id + '_')), `${id}: eventIndex, entryId and uid formats`);
  assert.equal(new Set(e.field.map(o => o.entryId)).size, n, `${id}: entry IDs are unique`);
}

// ---------- The name list itself appears exactly once in the game code ----------
const src = loadGameSource();
const literal = `let names=${JSON.stringify(NAMES).replace(/"/g, "'")};`;
assert.equal(src.script.split(literal).length - 1, 1, 'the driver-name list is defined once, unchanged');

// ---------- Existing saved Race Night opponents load unchanged and still work ----------
{
  const stored = JSON.parse(readInput('race-night')).lastEvent;
  const ctx = makeGameContext({ seed: 31, storage: { qmb_mvp_save: readInput('race-night') } });
  ctx.evaluate('refreshListings();loadGame(false);render()');
  const loaded = JSON.parse(ctx.evaluate('JSON.stringify(state.lastEvent)'));
  assert.deepEqual(loaded.opponents, stored.opponents, 'stored Race Night opponents are not regenerated or altered on load');
  assert.deepEqual(loaded.raceSlots, stored.raceSlots, 'stored call-ups are kept');
  const before = ctx.math.calls;
  ctx.evaluate("state.lastEvent.kind='race';state.lastEvent.runsLeft=Math.max(1,state.lastEvent.runsLeft||0);chooseRoundOpponent(state.lastEvent.raceSlots[0])");
  const after = JSON.parse(ctx.evaluate('JSON.stringify(state.lastEvent)'));
  assert.deepEqual(after.opponents, stored.opponents, 'queueing a race leaves the stored opponents untouched');
  assert.equal(after.lineup.filter(x => x.type === 'player').length, 1, 'the player race is queued');
  assert.equal(ctx.math.calls - before, stored.opponents.length - 1, 'queueing draws n-2 times to shuffle the other opponents, plus once for the queue position');
}

// ---------- Global access the rest of the game relies on ----------
{
  const ctx = makeGameContext({ seed: 1 });
  for (const name of FUNCTIONS) {
    assert.equal(ctx.evaluate(`typeof ${name}`), 'function', `${name} is a global function`);
    assert.equal(ctx.evaluate(`typeof Object.getOwnPropertyDescriptor(globalThis,'${name}').value`), 'function', `${name} is a property of the global object, as a top-level function declaration`);
  }
  for (const caller of ['travelToEvent', 'raceSlotCard', 'prepareSpectatorRound', 'chooseRoundOpponent']) assert.equal(ctx.evaluate(`typeof ${caller}`), 'function', `${caller} (a caller) is still global`);
}
console.log('Quarter Mile Builder opponent generation checks passed.');
