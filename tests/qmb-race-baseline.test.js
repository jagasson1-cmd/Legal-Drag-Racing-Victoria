const assert = require('node:assert/strict');
const { raceCases, readExpected } = require('./helpers/golden-cases');

// Race maths and opponent generation baseline: simulate() for slow, middle and quick cars (player launch and NPC
// paths, auto and manual), and eventProfile/makeOpponents/pickRaceSlots for three events, all under a seeded RNG.
// RNG call counts must match exactly; numbers must match to 1e-9 (relative) so only a real change fails.
function close(a, b, where) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b)) return assert.equal(a, b, where);
    return assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${where}: ${a} vs ${b}`);
  }
  if (Array.isArray(b)) { assert.ok(Array.isArray(a), `${where}: array expected`); assert.equal(a.length, b.length, `${where}: length`); return b.forEach((v, i) => close(a[i], v, `${where}[${i}]`)); }
  if (b && typeof b === 'object') { assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${where}: fields`); for (const k of Object.keys(b)) close(a[k], b[k], `${where}.${k}`); return; }
  assert.equal(a, b, where);
}

const actual = raceCases(), expected = readExpected('race');
for (const [id, row] of Object.entries(expected.cars)) for (const [trans, x] of Object.entries(row)) {
  assert.equal(actual.cars[id][trans].rngCalls, x.rngCalls, `${id} ${trans}: number of random draws`);
  close(actual.cars[id][trans], x, `${id} ${trans}`);
}
for (const [id, e] of Object.entries(expected.events)) {
  assert.equal(actual.events[id].rngCalls, e.rngCalls, `${id}: number of random draws for the event field`);
  close(actual.events[id], e, `${id}`);
}
// Sanity: the baseline covers a real spread of performance.
const ets = Object.values(expected.cars).map(r => r.auto.npc.et);
assert.ok(Math.max(...ets) - Math.min(...ets) > 5, 'slow to quick cars span more than 5 s');
console.log('Quarter Mile Builder race baseline checks passed.');
