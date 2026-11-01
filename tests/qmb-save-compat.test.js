const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');
const { SAVE_FIXTURES, readInput, loadAndResave, saveCases, cloudCase, readExpected } = require('./helpers/golden-cases');

// Save compatibility baseline. Inputs in tests/fixtures/saves are frozen saves (v1 pre-garage, v2 garage, Race Night
// mid-event, You Yangs session and first journey). Each is loaded through the real startup path and re-saved; the
// result must match the golden output recorded at the modularisation baseline (55b5307), one save field at a time so a
// failure names the contract that changed. Regenerate goldens only for a reviewed, intentional change.

// ---------- Golden load-and-resave, per top-level save field ----------
const actual = saveCases(), expected = readExpected('saves');
assert.deepEqual(Object.keys(actual), Object.keys(expected), 'same set of save cases');
for (const name of Object.keys(expected)) {
  assert.deepEqual(Object.keys(actual[name]).sort(), Object.keys(expected[name]).sort(), `${name}: same top-level save fields`);
  for (const key of Object.keys(expected[name])) assert.deepEqual(actual[name][key], expected[name][key], `${name}: state.${key} changed`);
}

// ---------- Explicit contracts (independent of the goldens) ----------
for (const name of SAVE_FIXTURES) {
  const input = JSON.parse(readInput(name)), out = actual[name];
  assert.equal(out.saveVersion, 2, `${name}: saved as version 2`);
  for (const k of ['money', 'respect', 'day']) assert.equal(out[k], input[k], `${name}: ${k} preserved`);
  const inputCars = [...(input.owned || []), ...(input.car && !(input.owned || []).some(c => c.uid === input.car.uid) ? [input.car] : [])];
  assert.deepEqual(out.owned.map(c => c.uid).sort(), inputCars.map(c => c.uid).sort(), `${name}: every owned vehicle kept`);
  for (const c of inputCars) {
    const o = out.owned.find(x => x.uid === c.uid);
    assert.equal(o.id, c.id, `${name}: vehicle id unchanged`);
    if (c.upgradeStages) assert.deepEqual(o.upgradeStages, c.upgradeStages, `${name}: upgrades kept`);
  }
  if (input.activeCarId) assert.equal(out.activeCarId, input.activeCarId, `${name}: active car kept`);
  // Re-loading a re-saved game changes nothing further.
  assert.deepEqual(JSON.parse(loadAndResave(JSON.stringify(out)).saved), out, `${name}: load and re-save is stable`);
}
{
  // v1 (pre-garage): the single car moves into the garage and stays active under its old uid; records keep their keys.
  const input = JSON.parse(readInput('v1-pre-garage')), out = actual['v1-pre-garage'];
  assert.equal(input.saveVersion, undefined);
  assert.equal(out.activeCarId, input.car.uid);
  assert.equal(out.car.uid, input.car.uid);
  assert.deepEqual(out.bestETs, input.bestETs);
  assert.deepEqual(out.completedEvents, input.completedEvents);
  // Race Night mid-event: lineup position, runs and the player's reaction data survive.
  const rnIn = JSON.parse(readInput('race-night')).lastEvent, rnOut = actual['race-night'].lastEvent;
  for (const k of ['eventId', 'kind', 'queueIndex', 'runsLeft', 'watchesLeft', 'lineup', 'raceReports', 'opponents']) assert.deepEqual(rnOut[k], rnIn[k], `race-night: lastEvent.${k} kept`);
  assert.ok(Number.isFinite(rnOut.raceReports[0].yourReaction), 'reaction time stored');
  // You Yangs: session, attempts, records and the first-journey flag survive.
  for (const name of ['you-yangs-session', 'you-yangs-journey']) {
    const yIn = JSON.parse(readInput(name)).specialEventPrestige.youYangs, yOut = actual[name].specialEventPrestige.youYangs;
    for (const k of Object.keys(yIn)) assert.deepEqual(yOut[k], yIn[k], `${name}: youYangs.${k} kept`);
  }
  assert.equal(actual['you-yangs-journey'].screen, 'yyTravel', 'mid-journey save restores to the paused journey');
}
{
  // Unknown fields from a newer or modded save are kept, not discarded.
  const input = JSON.parse(readInput('v2-garage'));
  input.futureField = { kept: true }; input.owned[0].futureCarField = 7;
  const out = JSON.parse(loadAndResave(JSON.stringify(input)).saved);
  assert.deepEqual(out.futureField, { kept: true });
  assert.equal(out.owned.find(c => c.uid === input.owned[0].uid).futureCarField, 7);
}

// ---------- Audio preferences (null = never set, which defaults to on) ----------
for (const [sound, music] of [[null, null], ['false', 'true'], ['true', 'false'], ['false', 'false']]) {
  const ctx = makeGameContext({ storage: { qmb_sound_enabled: sound, qmb_music_enabled: music } });
  assert.equal(ctx.evaluate('soundEnabled'), sound !== 'false', `effects preference ${sound}`);
  assert.equal(ctx.evaluate('musicEnabled'), music !== 'false', `music preference ${music}`);
  // The Sound panel's mute is saved (qmb_audio_prefs_v1, mirrored to the old keys) and unmuting restores the old state.
  ctx.evaluate('toggleAudioMute()');
  assert.equal(JSON.parse(ctx.storage.get('qmb_audio_prefs_v1')).muted, true, 'mute saved');
  assert.equal(ctx.storage.get('qmb_sound_enabled'), 'false', 'muted: effects mirror off');
  assert.equal(ctx.storage.get('qmb_music_enabled'), 'false', 'muted: music mirror off');
  ctx.evaluate('toggleAudioMute()');
  assert.equal(ctx.storage.get('qmb_sound_enabled'), String(sound !== 'false'), 'unmuted: effects preference restored');
  assert.equal(ctx.storage.get('qmb_music_enabled'), String(music !== 'false'), 'unmuted: music preference restored');
}

// ---------- Cloud save serialisation (fetch is stubbed; nothing leaves the test) ----------
(async () => {
  assert.deepEqual(await cloudCase(), readExpected('cloud'), 'cloud save requests and payload unchanged');
  // Without a recovery code nothing is sent at all.
  const { ctx } = loadAndResave(readInput('v2-garage'));
  assert.equal(ctx.requests.length, 0, 'no network request without a recovery code');
  console.log('Quarter Mile Builder save compatibility checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
