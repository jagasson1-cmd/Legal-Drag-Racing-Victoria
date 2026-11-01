const assert = require('node:assert/strict');
const loadGameSource = require('./helpers/game-source');
const { makeGameContext } = require('./helpers/game-context');
const { opponentCases, readExpected, readInput } = require('./helpers/golden-cases');

// Opponent generation and lineup management contract: eventProfile, pickDriverName, makeOpponents, perfIndex,
// pickRaceSlots, visibleClues, shuffleIndexes and buildNpcPairIndexes must keep producing exactly the same opponents,
// night sizes, call-ups and pairings, with the same number and order of random draws, wherever their code lives.
// Driver display names come from js/data/names.js: one roll per opponent, no duplicates within a lineup.
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

const FUNCTIONS = ['eventProfile', 'pickDriverName', 'makeOpponents', 'perfIndex', 'pickRaceSlots', 'visibleClues', 'shuffleIndexes', 'buildNpcPairIndexes'];
// The 18 original display names: the first 17 given names, in order, plus Davo, which is a nickname.
const ORIGINAL_NAMES = ['Mick', 'Sarah', 'Davo', 'Jess', 'Rob', 'Tayla', 'Chris', 'Ari', 'Ben', 'Mia', 'Noah', 'Eli', 'Zoe', 'Jay', 'Sam', 'Alex', 'Riley', 'Casey'];
const GIVEN_NAMES = [
  'Mick', 'Sarah', 'Jess', 'Rob', 'Tayla', 'Chris', 'Ari', 'Ben', 'Mia', 'Noah', 'Eli', 'Zoe',
  'Jay', 'Sam', 'Alex', 'Riley', 'Casey', 'Abdi', 'Abdullahi', 'Achol', 'Ahmed', 'Alessia', 'Amani', 'Amina',
  'Ananya', 'Angelo', 'Anjali', 'Arjun', 'Aroha', 'Ayen', 'Bilal', 'Brooke', 'Burak', 'Callum', 'Camila', 'Carla',
  'Charlie', 'Charlotte', 'Chidi', 'Chloe', 'Ciara', 'Con', 'Daniela', 'Declan', 'Deepa', 'Deng', 'Despina', 'Diego',
  'Dimitri', 'Duc', 'Dylan', 'Eleni', 'Elif', 'Ella', 'Emma', 'Emre', 'Ethan', 'Farah', 'Feng', 'Franco',
  'George', 'Gianni', 'Giulia', 'Hannah', 'Hao', 'Harpreet', 'Harry', 'Hassan', 'Hiba', 'Hui', 'Huy', 'Hyun',
  'Ioane', 'Ishaan', 'Ivan', 'Jack', 'Jamal', 'Jamie', 'Jia', 'Jin', 'Jiwoo', 'Joon', 'Jordan', 'Josh',
  'Joy', 'Jun', 'Karan', 'Karim', 'Kasia', 'Kate', 'Katerina', 'Kenji', 'Khoa', 'Kofi', 'Kosta', 'Kwame',
  'Lagi', 'Lan', 'Lauren', 'Layla', 'Lei', 'Liam', 'Linh', 'Luca', 'Lucia', 'Luke', 'Makur', 'Malia',
  'Manpreet', 'Marco', 'Matteo', 'Mehmet', 'Mele', 'Miguel', 'Mila', 'Ming', 'Minh', 'Morgan', 'Nadia', 'Nathan',
  'Neha', 'Ngoc', 'Nia', 'Nick', 'Nikhil', 'Olivia', 'Omar', 'Oscar', 'Panos', 'Paolo', 'Phuong', 'Priya',
  'Quang', 'Rahul', 'Raj', 'Rami', 'Rania', 'Reza', 'Rhea', 'Rohan', 'Rosa', 'Ruby', 'Ryan', 'Samir',
  'Sefa', 'Selam', 'Selin', 'Shirin', 'Simran', 'Sione', 'Sophia', 'Stavros', 'Stefan', 'Sunita', 'Tao', 'Tegan',
  'Tendai', 'Tevita', 'Thanh', 'Tharindu', 'Tom', 'Tony', 'Trang', 'Tuan', 'Tui', 'Vasili', 'Vikram', 'Viliami',
  'Vince', 'Vy', 'Wei', 'Wiremu', 'Xin', 'Yan', 'Yianni', 'Yohannes', 'Yousef', 'Yue', 'Yuna', 'Zainab'
];
const NICKNAMES = ['Davo', 'Macca', 'Loz', 'Kaz', 'Simmo', 'Tez', 'Robbo', 'Jono', 'Benno', 'Tommo', 'Gazza', 'Hammo'];

// ---------- Golden: names, night sizes, full fields, call-ups, pairing, travel/arrival/save/reload ----------
const actual = opponentCases(), expected = readExpected('opponents');
close(actual.nameSelection, expected.nameSelection, 'driver name for a draw of k/18');
for (const [id, e] of Object.entries(expected.nightSizes)) close(actual.nightSizes[id], e, `${id} night sizes and event difficulty fields`);
for (const [id, e] of Object.entries(expected.events)) {
  assert.deepEqual(actual.events[id].draws, e.draws, `${id}: random draws per stage`);
  assert.deepEqual(actual.events[id].field.map(o => o.id), e.field.map(o => o.id), `${id}: opponent vehicle IDs and order`);
  assert.deepEqual(actual.events[id].field.map(o => o.driver), e.field.map(o => o.driver), `${id}: driver names and order`);
  assert.equal(new Set(actual.events[id].field.map(o => o.driver)).size, actual.events[id].field.length, `${id}: no duplicate driver names in the lineup`);
  close(actual.events[id], e, id);
}
close(actual.slotBoundaries, expected.slotBoundaries, 'call-up selection at the 0.88 slower-car boundary');
assert.deepEqual(actual.slotBoundaries.one, [0, 3, 4, 5], 'one closest match plus every opponent below 0.88 of the player');
close(actual.arrival, expected.arrival, 'travel, arrival, queue, save and reload');
assert.equal(actual.arrival.pendingEqualsArrived, true, 'arrival keeps the opponents generated during travel');
assert.equal(actual.arrival.reloadEqualsSaved, true, 'saving and reloading keeps the event opponents (and their new names), call-ups and lineup');
assert.equal(new Set(actual.arrival.drivers).size, actual.arrival.drivers.length, 'the 74-car arrival lineup has no duplicate driver names');
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

// ---------- Name pools: exact contents, no duplicates, originals kept, defined once ----------
const src = loadGameSource();
{
  const ctx = makeGameContext({ seed: 1 });
  assert.deepEqual(JSON.parse(ctx.evaluate('JSON.stringify(NPC_GIVEN_NAMES)')), GIVEN_NAMES, `the ${GIVEN_NAMES.length} given names, in order`);
  assert.deepEqual(JSON.parse(ctx.evaluate('JSON.stringify(NPC_NICKNAMES)')), NICKNAMES, 'the 12 nicknames, in order');
  assert.equal(ctx.evaluate('NPC_NICKNAME_SHARE'), 0.12, 'nickname share of the name roll');
  assert.equal(GIVEN_NAMES.length, 180, '180 given names');
  const lower = a => a.map(s => s.toLowerCase());
  assert.equal(new Set(lower(GIVEN_NAMES)).size, GIVEN_NAMES.length, 'no duplicate given names (ignoring case)');
  assert.equal(new Set(lower(NICKNAMES)).size, NICKNAMES.length, 'no duplicate nicknames (ignoring case)');
  assert.deepEqual(GIVEN_NAMES.filter(n => lower(NICKNAMES).includes(n.toLowerCase())), [], 'no name is in both pools');
  assert.ok(GIVEN_NAMES.every(n => /^[A-Z][a-z]+$/.test(n)) && NICKNAMES.every(n => /^[A-Z][a-z]+$/.test(n)), 'single given names only: one capitalised word, no surnames or labels');
  assert.deepEqual(GIVEN_NAMES.slice(0, 17), ORIGINAL_NAMES.filter(n => n !== 'Davo'), 'the 17 original given names come first, in their original order');
  assert.ok(ORIGINAL_NAMES.every(n => GIVEN_NAMES.includes(n) || NICKNAMES.includes(n)), 'all 18 original display names are kept');
  const namesFile = src.scripts.find(s => s.name === 'js/data/names.js').source;
  for (const decl of ['const NPC_GIVEN_NAMES=', 'const NPC_NICKNAMES=', 'const NPC_NICKNAME_SHARE=']) {
    assert.equal(src.script.split(decl).length - 1, 1, `${decl} declared once across the game`);
    assert.ok(namesFile.includes(decl), `${decl} lives in js/data/names.js`);
  }
  assert.ok(!src.script.includes("let names=['Mick'"), 'the old inline name list is gone');
}

// ---------- pickDriverName: one roll, proportional mapping, forward probing, no mutation, no draws ----------
{
  const ctx = makeGameContext({ seed: 1 });
  const pick = (roll, used) => ctx.evaluate(`pickDriverName(${roll},new Set(${JSON.stringify(used || [])}))`);
  const before = ctx.math.calls;
  // Mapping: [0, 0.12) spans the nicknames, [0.12, 1) spans the given names, each in proportion.
  assert.equal(pick(0), NICKNAMES[0], 'roll 0 -> first nickname');
  assert.equal(pick(0.06), NICKNAMES[6], 'roll 0.06 -> middle nickname');
  assert.equal(pick(0.1199), NICKNAMES[11], 'roll just below the share -> last nickname');
  assert.equal(pick(0.12), GIVEN_NAMES[0], 'roll at the share -> first given name');
  assert.equal(pick(0.12 + 0.88 * 100.5 / 180), GIVEN_NAMES[100], 'given names map in proportion');
  assert.equal(pick(1 - 2 ** -53), GIVEN_NAMES[179], 'largest possible roll -> last given name');
  assert.equal(pick(0.11999999999999998), NICKNAMES[11], 'largest roll below the share -> last nickname');
  // Probing: forward within the chosen pool, wrapping; then the other pool from the position the roll maps to there.
  assert.equal(pick(0.06, [NICKNAMES[6]]), NICKNAMES[7], 'a used nickname steps forward to the next nickname');
  assert.equal(pick(0.1199, [NICKNAMES[11]]), NICKNAMES[0], 'probing wraps within the pool');
  assert.equal(pick(0.06, NICKNAMES), GIVEN_NAMES[90], 'all nicknames used -> the given name at the same relative position');
  assert.equal(pick(0.5, [GIVEN_NAMES[77]]), GIVEN_NAMES[78], 'a used given name steps forward to the next given name');
  assert.equal(pick(0.5, GIVEN_NAMES), NICKNAMES[5], 'all given names used -> the nickname at the same relative position');
  // Artificially exhausted pools (no current event is large enough to reach this).
  const all = [...GIVEN_NAMES, ...NICKNAMES];
  assert.equal(pick(0.5, all.filter(n => n !== 'Kofi')), 'Kofi', 'with one name left anywhere, that name is returned');
  assert.equal(pick(0.5, all), GIVEN_NAMES[77], 'with every name used, the first choice is returned (the only case that repeats a name)');
  assert.equal(pick(0.06, all), NICKNAMES[6], 'exhausted, a nickname roll repeats its first choice too');
  // The caller's set is not modified; selection draws no random numbers.
  assert.equal(ctx.evaluate(`(()=>{const u=new Set(['Mick']);pickDriverName(0.12,u);pickDriverName(0.5,u);return JSON.stringify([...u])})()`), '["Mick"]', 'pickDriverName does not modify the used-name set');
  assert.equal(ctx.math.calls - before, 0, 'pickDriverName draws no random numbers');
}

// ---------- Exactly one name draw per opponent, at the existing point ----------
{
  const ctx = makeGameContext({ seed: 77 });
  const r = JSON.parse(ctx.evaluate(`(()=>{state.respect=20;const real=pickDriverName;let calls=0,rolls=[];pickDriverName=function(roll,used){calls++;rolls.push(roll);return real(roll,used)};
    const before=Math.calls,field=makeOpponents(34,eventById('heathcote_legal')),draws=Math.calls-before;pickDriverName=real;return JSON.stringify({calls,rolls:rolls.length,inRange:rolls.every(x=>x>=0&&x<1),draws,n:field.length})})()`));
  assert.equal(r.calls, r.n, 'pickDriverName is called once per opponent');
  assert.ok(r.inRange, 'each call receives one fresh roll in [0,1)');
}

// ---------- Nickname frequency and uniqueness under deterministic large samples ----------
{
  const ctx = makeGameContext({ seed: 2026 });
  const sample = JSON.parse(ctx.evaluate(`(()=>{let nick=0,total=0;for(let k=0;k<20000;k++){if(NPC_NICKNAMES.includes(pickDriverName(Math.random(),new Set())))nick++;total++}return JSON.stringify({nick,total})})()`));
  const share = sample.nick / sample.total;
  assert.ok(share > 0.11 && share < 0.13, `nickname share per name roll ${share.toFixed(4)} is about 12%`);
  const lineups = JSON.parse(ctx.evaluate(`(()=>{state.respect=20;let nick=0,total=0,dupLineups=0;const ev=eventById('heathcote_legal');for(let k=0;k<200;k++){const f=makeOpponents(34,ev);total+=f.length;nick+=f.filter(o=>NPC_NICKNAMES.includes(o.driver)).length;if(new Set(f.map(o=>o.driver)).size!==f.length)dupLineups++}return JSON.stringify({nick,total,dupLineups})})()`));
  const lineupShare = lineups.nick / lineups.total;
  assert.ok(lineupShare >= 0.10 && lineupShare <= 0.15, `nickname share across 200 Normal-night lineups ${lineupShare.toFixed(4)} is between 10% and 15%`);
  assert.equal(lineups.dupLineups, 0, 'none of 200 34-car lineups repeats a name');
  // Largest fields the calendar can produce: The Bend packed (100) and Sydney packed (111).
  const big = JSON.parse(ctx.evaluate(`(()=>{const out=[];for(const [id,n] of [['bend_open',100],['sydney_challenge',111]])for(let k=0;k<10;k++){const f=makeOpponents(n,eventById(id));out.push({id,n,distinct:new Set(f.map(o=>o.driver)).size,nick:f.filter(o=>NPC_NICKNAMES.includes(o.driver)).length})}return JSON.stringify(out)})()`));
  for (const b of big) {
    assert.equal(b.distinct, b.n, `${b.id}: a ${b.n}-car lineup has ${b.n} distinct driver names`);
    assert.ok(b.nick <= NICKNAMES.length, `${b.id}: at most ${NICKNAMES.length} nicknames in one lineup`);
  }
  assert.equal(ctx.evaluate('Math.max(...EVENT_CALENDAR.map(e=>Math.round(74*(e.fieldMult||1))))'), 111, 'the largest possible field is 111 cars');
  assert.ok(GIVEN_NAMES.length + NICKNAMES.length >= 111, 'there are enough names for the largest field');
}

// ---------- Existing saved Race Night opponents load unchanged and still work ----------
{
  const stored = JSON.parse(readInput('race-night')).lastEvent;
  const ctx = makeGameContext({ seed: 31, storage: { qmb_mvp_save: readInput('race-night') } });
  ctx.evaluate('refreshListings();loadGame(false);render()');
  const loaded = JSON.parse(ctx.evaluate('JSON.stringify(state.lastEvent)'));
  assert.deepEqual(loaded.opponents, stored.opponents, 'stored Race Night opponents are not regenerated or altered on load');
  const storedDrivers = stored.opponents.map(o => o.driver);
  assert.ok(new Set(storedDrivers).size < storedDrivers.length, 'the stored lineup has historical duplicate names');
  assert.deepEqual(loaded.opponents.map(o => o.driver), storedDrivers, 'stored names, including duplicates and names outside the new pools, are kept exactly');
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
