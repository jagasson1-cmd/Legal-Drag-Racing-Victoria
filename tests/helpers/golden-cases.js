'use strict';
// Golden cases shared by the tests and by tests/helpers/regenerate-goldens.js, so the expected outputs are always
// produced by exactly the code the tests run. Inputs under tests/fixtures/saves are frozen historical saves and must
// never be regenerated; only the expected outputs under tests/fixtures/expected are regenerated, and only after a
// separately reviewed, intentional contract change (see docs/MODULARISATION.md).
const fs = require('node:fs');
const path = require('node:path');
const { makeGameContext } = require('./game-context');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const SAVE_FIXTURES = ['v1-pre-garage', 'v2-garage', 'race-night', 'you-yangs-session', 'you-yangs-journey'];
const readInput = name => fs.readFileSync(path.join(FIXTURES, 'saves', name + '.json'), 'utf8');

// Mirror the real startup order (refreshListings();loadGame(false);render()) and then re-save locally exactly as
// the game does without a recovery code (cloudSave(false) writes qmb_mvp_save and returns before any network call).
function loadAndResave(saveJson, seed = 7) {
  const ctx = makeGameContext({ seed, storage: saveJson === null ? {} : { qmb_mvp_save: saveJson } });
  ctx.evaluate('refreshListings();loadGame(false);render()');
  ctx.evaluate('cloudSave(false)');
  return { ctx, saved: ctx.storage.get('qmb_mvp_save') };
}

function saveCases() {
  const out = { 'new-game': JSON.parse(loadAndResave(null).saved) };
  for (const name of SAVE_FIXTURES) out[name] = JSON.parse(loadAndResave(readInput(name)).saved);
  return out;
}

// Cloud save with a (fake) recovery code: the request is captured by the fetch stub and never sent.
async function cloudCase() {
  const ctx = makeGameContext({ seed: 7, storage: { qmb_mvp_save: readInput('v2-garage'), qmb_recovery_code: 'TEST-RECOVERY-CODE' }, fetchReply: () => ({ ok: true, json: { ok: true, profile: { displayName: 'Test Garage', friendCode: 'TEST01' }, friends: [], save: null } }) });
  ctx.evaluate('refreshListings();loadGame(false);render()');
  const result = await ctx.evaluate('cloudSave(false)');
  const local = JSON.parse(ctx.storage.get('qmb_mvp_save'));
  const apiUrl = ctx.evaluate('QMB_API_URL'), apiKey = ctx.evaluate('QMB_PUBLISHABLE_KEY');
  return {
    result,
    requests: ctx.requests.map(r => ({
      toGameApi: r.url === apiUrl, method: r.method,
      contentType: r.headers && r.headers['Content-Type'], usesPublishableKey: !!r.headers && r.headers.apikey === apiKey,
      bodyKeys: r.body ? Object.keys(r.body) : null,
      action: r.body && r.body.action, recoveryCode: r.body && r.body.recoveryCode,
      stateKeys: r.body && r.body.state ? Object.keys(r.body.state) : null,
      stateMatchesLocalSave: r.body && r.body.state ? JSON.stringify(r.body.state) === JSON.stringify(local) : null
    }))
  };
}

// Race maths and opponent generation under a seeded RNG, with RNG call counts so a change in the number or order
// of random draws is caught even when the values happen to match.
const RACE_CARS = ['gqpatrol', 'is200', 'rx8', 'm5'];
function raceCases() {
  const ctx = makeGameContext({ seed: 2024 });
  const ev = id => `eventById('${id}')`;
  const out = { cars: {}, events: {} };
  for (const id of RACE_CARS) {
    const row = {};
    for (const trans of ['auto', 'manual']) {
      if (!ctx.evaluate(`!!CARS.find(x=>x.id==='${id}').${trans}`)) continue;
      const before = ctx.math.calls;
      row[trans] = JSON.parse(ctx.evaluate(`(()=>{let c=makeOwned(CARS.find(x=>x.id==='${id}'),'${trans}','D');calculateBuildEffects(c);
        let launch=c.trans==='manual'?idealLaunch(c):Math.max(idleRpm(c),Math.min(converterStall(c),autoIdealStall(c))),style=c.trans==='manual'?'slip':'brake stall';
        let player=simulate(c,{launch,style,noShift:true},false),npc=simulate(c,null,true);return JSON.stringify({launch,player,npc})})()`));
      row[trans].rngCalls = ctx.math.calls - before;
    }
    out.cars[id] = row;
  }
  for (const id of ['heathcote_legal', 'mildura_regional', 'bend_open']) {
    const before = ctx.math.calls;
    out.events[id] = JSON.parse(ctx.evaluate(`(()=>{state.respect=20;let e=${ev(id)},busy=eventProfile(e),field=makeOpponents(busy.cars,e),slots=pickRaceSlots(field,busy.raceSlots);
      return JSON.stringify({busy,slots,field:field.map(o=>({id:o.id,trans:o.trans,power:o.power,weight:o.weight,grip:o.grip,label:o.label,driver:o.driver,mods:o.mods,visible:o.visible}))})})()`));
    out.events[id].rngCalls = ctx.math.calls - before;
  }
  return out;
}

// Opponent generation and lineup management (eventProfile, makeOpponents, perfIndex, pickRaceSlots, visibleClues,
// shuffleIndexes, buildNpcPairIndexes) under fixed random sequences: complete opponent records, night sizes,
// call-up selection with and without a player car, NPC pairing, random-draw counts per stage, and the travel ->
// arrival -> save -> reload path. Complements raceCases, which keeps its own event coverage unchanged.
const OPPONENT_EVENTS = ['heathcote_legal', 'mildura_regional', 'bend_open'];
const OPPONENT_FIELDS = ['id', 'uid', 'entryId', 'eventIndex', 'driver', 'label', 'trans', 'power', 'weight', 'grip', 'mods', 'visible'];
const sha = text => require('node:crypto').createHash('sha256').update(text).digest('hex');
function opponentCases() {
  const out = { nameSelection: null, nightSizes: {}, events: {}, arrival: null };
  // Driver names: with every draw returning k/18 (just above), a one-opponent field picks names[k], so the list,
  // its order and the uniform mapping of a draw to a name are all pinned.
  {
    const ctx = makeGameContext({ seed: 1 });
    out.nameSelection = JSON.parse(ctx.evaluate(`(()=>{const r=Math.random,out=[];for(let k=0;k<18;k++){const x=k/18+1e-9;Math.random=()=>x;out.push(makeOpponents(1,null)[0].driver)}Math.random=r;return JSON.stringify(out)})()`));
  }
  // Night sizes: eventProfile's single draw selects Quiet/Normal/Busy/Packed; the event's fieldMult and reqRespect
  // scale the field. Each roll lands inside one band.
  {
    const ctx = makeGameContext({ seed: 1 });
    for (const id of OPPONENT_EVENTS) out.nightSizes[id] = JSON.parse(ctx.evaluate(`(()=>{const r=Math.random,e=eventById('${id}'),out={event:{fieldMult:e.fieldMult,opponentBoost:e.opponentBoost,reqRespect:e.reqRespect},nights:[]};
      for(const x of [.1,.2499,.25,.4,.5999,.6,.7,.8699,.87,.95]){let n=0;Math.random=()=>{n++;return x};out.nights.push({roll:x,busy:eventProfile(e),draws:n})}Math.random=r;return JSON.stringify(out)})()`));
  }
  // Full fields under a seeded RNG, with and without a player car, plus NPC pairing for spectator and racer rounds.
  for (const id of OPPONENT_EVENTS) {
    const ctx = makeGameContext({ seed: 4242 });
    const step = code => { const before = ctx.math.calls; const value = JSON.parse(ctx.evaluate(code)); return { value, draws: ctx.math.calls - before }; };
    ctx.evaluate(`state.respect=20;state.car=null;globalThis.__e=eventById('${id}')`);
    const profile = step('JSON.stringify(globalThis.__busy=eventProfile(__e))');
    const field = step(`(()=>{globalThis.__field=makeOpponents(__busy.cars,__e);return JSON.stringify(__field.map(o=>{let r={};for(const k of ${JSON.stringify(OPPONENT_FIELDS)})r[k]=o[k];return r}))})()`);
    const keys = JSON.parse(ctx.evaluate('JSON.stringify(__field.map(o=>Object.keys(o).join(",")).filter((k,i,a)=>a.indexOf(k)===i))'));
    const slotsNoCar = step('JSON.stringify(pickRaceSlots(__field,__busy.raceSlots))');
    ctx.evaluate(`state.car=makeOwned(CARS.find(x=>x.id==='is200'),'manual','D');calculateBuildEffects(state.car)`);
    const slotsWithCar = step('JSON.stringify(pickRaceSlots(__field,__busy.raceSlots))');
    const perf = JSON.parse(ctx.evaluate('JSON.stringify({player:perfIndex(state.car),field:__field.map(perfIndex)})'));
    const shuffle = step('JSON.stringify(shuffleIndexes([0,1,2,3,4,5,6,7,8,9]))');
    const spectatorPairs = step('JSON.stringify(buildNpcPairIndexes({opponents:__field}))');
    const racerPairs = step('JSON.stringify(buildNpcPairIndexes({opponents:__field},[0]))');
    out.events[id] = {
      busy: profile.value, draws: { eventProfile: profile.draws, makeOpponents: field.draws, pickRaceSlotsNoCar: slotsNoCar.draws, pickRaceSlotsWithCar: slotsWithCar.draws, shuffle10: shuffle.draws, spectatorPairs: spectatorPairs.draws, racerPairs: racerPairs.draws },
      objectKeys: keys, field: field.value, slotsNoCar: slotsNoCar.value, slotsWithCar: slotsWithCar.value, perfIndex: perf,
      shuffle10: shuffle.value, spectatorPairs: spectatorPairs.value, racerPairs: racerPairs.value
    };
  }
  // Call-up selection at its boundaries: opponents at exact performance ratios to the player's car, with one
  // closest-match slot, so the "obviously slower" cut-off (below 0.88 of the player's index) is pinned.
  {
    const ctx = makeGameContext({ seed: 1 });
    out.slotBoundaries = JSON.parse(ctx.evaluate(`(()=>{state.car=makeOwned(CARS.find(x=>x.id==='is200'),'manual','D');calculateBuildEffects(state.car);
      const ratios=[1,.885,.8801,.8799,.875,.5],field=ratios.map(r=>{let o=clone(state.car);o.power=state.car.power*r;return o});
      return JSON.stringify({ratios,perf:field.map(o=>perfIndex(o)/perfIndex(state.car)),one:pickRaceSlots(field,1),three:pickRaceSlots(field,3),all:pickRaceSlots(field,10)})})()`));
  }
  // Travel -> arrival -> queue -> save -> reload in a fresh sandbox, from the v2 garage save.
  {
    const ctx = makeGameContext({ seed: 99, storage: { qmb_mvp_save: readInput('v2-garage') } });
    ctx.evaluate('refreshListings();loadGame(false);render()');
    const before = ctx.math.calls;
    ctx.evaluate(`(()=>{let e=eventById('heathcote_legal');for(let i=0;i<30&&daysUntil(e)!==0;i++)state.day++;travelToEvent('heathcote_legal')})()`);
    const travelDraws = ctx.math.calls - before;
    const pending = ctx.evaluate('JSON.stringify(state.pendingArrival.opponents)');
    ctx.evaluate("finishTravel();confirmArrival('race')");
    const arrived = ctx.evaluate('JSON.stringify(state.lastEvent.opponents)');
    const beforeQueue = ctx.math.calls;
    ctx.evaluate('chooseRoundOpponent(state.lastEvent.raceSlots[0])');
    const queueDraws = ctx.math.calls - beforeQueue;
    const event = ctx.evaluate('JSON.stringify({opponents:state.lastEvent.opponents,raceSlots:state.lastEvent.raceSlots,lineup:state.lastEvent.lineup,totalCars:state.lastEvent.totalCars,busy:state.lastEvent.busy})');
    ctx.evaluate('saveGame()');
    const saved = ctx.storage.get('qmb_mvp_save');
    const reloaded = makeGameContext({ seed: 5, storage: { qmb_mvp_save: saved } });
    reloaded.evaluate('refreshListings();loadGame(false);render()');
    const after = reloaded.evaluate('JSON.stringify({opponents:state.lastEvent.opponents,raceSlots:state.lastEvent.raceSlots,lineup:state.lastEvent.lineup,totalCars:state.lastEvent.totalCars,busy:state.lastEvent.busy})');
    const ev = JSON.parse(event);
    out.arrival = {
      draws: { travel: travelDraws, chooseRoundOpponent: queueDraws },
      pendingEqualsArrived: pending === arrived, reloadEqualsSaved: after === event, networkRequests: ctx.requests.length + reloaded.requests.length,
      totalCars: ev.totalCars, busy: ev.busy, raceSlots: ev.raceSlots, lineup: ev.lineup,
      drivers: ev.opponents.map(o => o.driver), ids: ev.opponents.map(o => o.id), opponentsSha256: sha(JSON.stringify(ev.opponents))
    };
  }
  return out;
}

const EXPECTED = { saves: path.join(FIXTURES, 'expected', 'saves.json'), cloud: path.join(FIXTURES, 'expected', 'cloud-save.json'), race: path.join(FIXTURES, 'expected', 'race-baseline.json'), opponents: path.join(FIXTURES, 'expected', 'opponent-generation.json') };
const readExpected = key => JSON.parse(fs.readFileSync(EXPECTED[key], 'utf8'));

module.exports = { SAVE_FIXTURES, RACE_CARS, OPPONENT_EVENTS, readInput, loadAndResave, saveCases, cloudCase, raceCases, opponentCases, EXPECTED, readExpected };
