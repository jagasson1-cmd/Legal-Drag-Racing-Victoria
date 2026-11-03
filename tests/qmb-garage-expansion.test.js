const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');
const { readInput, SAVE_FIXTURES } = require('./helpers/golden-cases');
const { audioSandbox } = require('./helpers/fake-audio');

// Garage expansion scene (js/systems/garage-scene.js and its glue in index.html). The thresholds, the capacity writer
// (normaliseGarageState) and money are untouched; a bay counts as new only when capacity rises during a session, each new
// bay gets one garage_bay_N notification, saved at once, and the scene plays it at the next quiet moment.

// Boot like the browser, with the scene's show() replaced by a recorder (the sandbox has no document body).
function boot(saveJson, { seed = 5 } = {}) {
  const ctx = makeGameContext({ seed, storage: saveJson === null ? {} : { qmb_mvp_save: saveJson } });
  ctx.element('splashScreen').classList.add('hidden'); // as in the real markup; the splash is not due in the sandbox
  ctx.evaluate(`globalThis.__shown=[];globalThis.__open=null;
    QmbGarageScene.show=o=>{__shown.push({bays:o.bays,previous:o.previous,capacity:o.capacity,parked:o.parked,nextRespect:o.nextRespect});__open=o;return true};
    QmbGarageScene.active=()=>!!__open;
    globalThis.__finish=()=>{const o=__open;__open=null;o.onDone()};`);
  ctx.evaluate('refreshListings();loadGame(false);render()');
  return ctx;
}
const shown = ctx => JSON.parse(ctx.evaluate('JSON.stringify(__shown)'));
const garageNotes = (ctx, from = 'state') => JSON.parse(ctx.evaluate(`JSON.stringify((${from}.notifications||[]).filter(n=>n.type==='garage'))`));
const savedNotes = ctx => (JSON.parse(ctx.storage.get('qmb_mvp_save')).notifications || []).filter(n => n.type === 'garage');
// Leave the event in the v2-garage fixture and go to the Shed, so the game is at a quiet moment.
const goQuiet = ctx => ctx.evaluate("state.lastEvent.dayAdvanced=true;state.screen='garage';render()");

// ---------- Thresholds are unchanged ----------
{
  const ctx = makeGameContext();
  const caps = [0, 19, 19.9, 20, 74, 75, 149, 150, 299, 300, 1000, -20].map(r => ctx.evaluate(`garageCapacityForRespect(${r})`));
  assert.deepEqual(caps, [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1], 'capacity thresholds 20, 75, 150 and 300 are unchanged');
  assert.deepEqual([1, 2, 3, 4, 5].map(c => ctx.evaluate(`garageBayNextRespect(${c})`)), [20, 75, 150, 300, null], 'next-bay Respect read from the same rule');
}

// ---------- Loading never plays a scene or creates a record ----------
for (const name of [null, ...SAVE_FIXTURES]) {
  const ctx = boot(name === null ? null : readInput(name));
  ctx.evaluate('render();render()');
  assert.equal(garageNotes(ctx).length, 0, `${name || 'new game'}: no garage record on load`);
  assert.equal(shown(ctx).length, 0, `${name || 'new game'}: no scene on load`);
}
{
  // An old save that qualifies for more bays than it stores gets them silently, as before.
  const save = JSON.parse(readInput('v2-garage')); save.respect = 160; save.garageCapacity = 2;
  const ctx = boot(JSON.stringify(save)); goQuiet(ctx);
  assert.equal(ctx.evaluate('state.garageCapacity'), 4, 'capacity raised on load by the existing rule');
  assert.equal(garageNotes(ctx).length, 0, 'bays already earned before loading get no scene');
}

// ---------- Earning a bay mid-session ----------
{
  const ctx = boot(readInput('v2-garage'));
  const money = ctx.evaluate('state.money');
  ctx.evaluate('state.respect=80;render()');
  assert.equal(ctx.evaluate('state.garageCapacity'), 3, 'bay 3 unlocked at 80 Respect');
  assert.deepEqual(garageNotes(ctx).map(n => [n.id, n.bay, n.dismissed]), [['garage_bay_3', 3, false]], 'one record for the new bay');
  assert.deepEqual(savedNotes(ctx).map(n => n.id), ['garage_bay_3'], 'the record is saved straight away');
  assert.equal(shown(ctx).length, 0, 'still at Race Night: the scene waits');
  ctx.evaluate('render();render()');
  assert.equal(garageNotes(ctx).length, 1, 'no duplicate record on later renders');
  // Quiet moment: the event is over and the player is in the Shed.
  goQuiet(ctx);
  assert.deepEqual(shown(ctx), [{ bays: [3], previous: 2, capacity: 3, parked: 2, nextRespect: 150 }], 'scene shows bay 3, capacity 2 to 3 and the next threshold');
  ctx.evaluate('render()');
  assert.equal(shown(ctx).length, 1, 'no second scene while one is open');
  ctx.evaluate('__finish()');
  assert.equal(garageNotes(ctx)[0].dismissed, true, 'finishing or skipping marks the bay as seen');
  assert.equal(savedNotes(ctx)[0].dismissed, true, 'and saves it');
  ctx.evaluate('render();show("home")');
  assert.equal(shown(ctx).length, 1, 'a seen bay never plays again');
  assert.equal(ctx.evaluate('state.money'), money, 'no money awarded');
  assert.equal(ctx.evaluate('state.respect'), 80, 'Respect untouched by the scene');
  // A Respect penalty after the bay is earned keeps the bay and plays nothing.
  ctx.evaluate('state.respect=10;render()');
  assert.equal(ctx.evaluate('state.garageCapacity'), 3, 'bay kept after a Respect penalty');
  assert.equal(garageNotes(ctx).length, 1, 'no new record after a penalty');
  // Reload the saved game: nothing replays.
  const reloaded = boot(ctx.storage.get('qmb_mvp_save')); goQuiet(reloaded);
  assert.equal(shown(reloaded).length, 0, 'reload after seeing the scene: no replay');
  assert.equal(reloaded.evaluate('state.garageCapacity'), 3, 'capacity survives the reload');
}
{
  // Closing the game mid-scene: the undismissed record plays once on return, then never again.
  const ctx = boot(readInput('v2-garage'));
  ctx.evaluate('state.respect=80;render()'); goQuiet(ctx);
  assert.equal(shown(ctx).length, 1);
  const reloaded = boot(ctx.storage.get('qmb_mvp_save'));
  assert.equal(shown(reloaded).length, 0, 'the restored Race Night screen is not a quiet moment');
  goQuiet(reloaded);
  assert.deepEqual(shown(reloaded).map(s => s.bays), [[3]], 'the interrupted scene plays once after reloading');
  reloaded.evaluate('__finish()');
  const again = boot(reloaded.storage.get('qmb_mvp_save')); goQuiet(again);
  assert.equal(shown(again).length, 0, 'and not a third time');
}
{
  // Two bays at once become one scene; the top bay reports the full Shed.
  const ctx = boot(readInput('v2-garage'));
  ctx.evaluate('state.respect=160;render()'); goQuiet(ctx);
  assert.deepEqual(shown(ctx), [{ bays: [3, 4], previous: 2, capacity: 4, parked: 2, nextRespect: 300 }], 'bays 3 and 4 in one scene');
  ctx.evaluate('__finish();state.respect=320;render()');
  assert.deepEqual(shown(ctx)[1], { bays: [5], previous: 4, capacity: 5, parked: 2, nextRespect: null }, 'bay 5: no next threshold');
}

// ---------- Never over a race, dyno pull, You Yangs run, journey, arrival or event ----------
{
  const ctx = boot(readInput('v2-garage'));
  ctx.evaluate("state.respect=80;state.lastEvent.dayAdvanced=true;state.screen='garage'");
  for (const busy of ['liveRun={}', 'yyRun={}', 'dynoSession={}', 'watchRaceActive=true', "state.pendingArrival={}", "state.screen='travel'", "state.screen='currentEvent'", "state.screen='youYangs'", "state.lastEvent.dayAdvanced=false"]) {
    ctx.evaluate(busy);
    assert.equal(ctx.evaluate('garageSceneQuiet()'), false, `not quiet when ${busy}`);
    ctx.evaluate("liveRun=null;yyRun=null;dynoSession=null;watchRaceActive=false;state.pendingArrival=null;state.screen='garage';state.lastEvent.dayAdvanced=true");
  }
  assert.equal(ctx.evaluate('garageSceneQuiet()'), true, 'quiet in the Shed after the event');
  ctx.element('splashScreen').classList.remove('hidden');
  assert.equal(ctx.evaluate('garageSceneQuiet()'), false, 'not over the splash screen');
}

// ---------- The Shed shows the next threshold ----------
{
  const ctx = boot(readInput('v2-garage')); goQuiet(ctx);
  assert.match(ctx.evaluate('garage()'), /Capacity <b>2\/2<\/b> · Next bay at <b>75<\/b> Respect/, 'Shed pill names the next bay');
  ctx.evaluate('state.respect=320;render()');
  assert.doesNotMatch(ctx.evaluate('garage()'), /Next bay/, 'no next bay once the Shed is full');
}

// ---------- The garage cue respects settings and browser rules ----------
(async () => {
  const tick = () => new Promise(r => setImmediate(r));
  {
    const box = audioSandbox({ activated: false });
    assert.equal(box.evaluate("QmbAudio.cue('garageExpanded')"), null, 'locked audio: dropped, not queued');
    box.activation.hasBeenActive = true; box.fire('pointerdown'); await tick();
    assert.equal(box.evaluate('QmbAudio.debug().lastCue'), null, 'nothing bursts out on the first tap');
    const before = box.evaluate('Math.calls'), sources = box.audio.made.sources.length;
    const handle = box.evaluate("QmbAudio.cue('garageExpanded',{delay:.45})");
    assert.ok(handle && typeof handle.stop === 'function', 'running audio: the cue plays');
    assert.ok(box.audio.made.sources.length - sources >= 6, 'door rattle, rumble, clunk, tube tinks and hum');
    assert.equal(box.evaluate('QmbAudio.debug().lastCue'), 'garageExpanded');
    assert.equal(box.evaluate('Math.calls'), before, 'the cue draws no gameplay random numbers');
    const effects = box.evaluate("QmbAudio.bus('effects')");
    // Audible voices reach the effects bus; the rattle's LFO modulates a gain parameter instead, so it is not counted.
    const reaches = (node, target, seen = new Set()) => node === target || (!seen.has(node) && (seen.add(node), (node.outputs || []).some(n => reaches(n, target, seen))));
    const cueSources = box.audio.made.sources.slice(sources);
    assert.equal(cueSources.filter(s => reaches(s, effects)).length, cueSources.length - 1, 'every audible cue voice goes through the effects bus');
    const destination = box.ctx().destination, master = effects.outputs[0];
    assert.ok(cueSources.every(s => !s.outputs.includes(destination)), 'no cue voice bypasses the buses');
    assert.ok(master && master.outputs.length, 'the effects bus feeds the master');
    assert.equal(box.evaluate("QmbAudio.cue('noSuchCue')"), null, 'unknown cue: nothing');
    box.evaluate("QmbAudio.setLevel('effects',0)");
    assert.equal(box.evaluate("QmbAudio.cue('garageExpanded')"), null, 'effects at 0: silent');
    box.evaluate("QmbAudio.setLevel('effects',1);QmbAudio.setMuted(true)");
    assert.equal(box.evaluate("QmbAudio.cue('garageExpanded')"), null, 'muted: silent');
    box.evaluate("QmbAudio.setMuted(false);QmbAudio.setLevel('master',0)");
    assert.equal(box.evaluate("QmbAudio.cue('garageExpanded')"), null, 'master at 0: silent');
  }
  {
    const box = audioSandbox({ noAudio: true });
    assert.equal(box.evaluate("QmbAudio.cue('garageExpanded')"), null, 'no Web Audio: silent, no error');
  }
  console.log('Quarter Mile Builder garage expansion checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
