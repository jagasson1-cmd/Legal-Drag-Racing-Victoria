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

const EXPECTED = { saves: path.join(FIXTURES, 'expected', 'saves.json'), cloud: path.join(FIXTURES, 'expected', 'cloud-save.json'), race: path.join(FIXTURES, 'expected', 'race-baseline.json') };
const readExpected = key => JSON.parse(fs.readFileSync(EXPECTED[key], 'utf8'));

module.exports = { SAVE_FIXTURES, RACE_CARS, readInput, loadAndResave, saveCases, cloudCase, raceCases, EXPECTED, readExpected };
