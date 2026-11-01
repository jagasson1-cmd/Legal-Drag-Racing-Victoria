const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');
const { readInput } = require('./helpers/golden-cases');

// Audio preference contract (js/systems/audio.js). Preferences live only in localStorage under qmb_audio_prefs_v1:
// - migrated once from the old qmb_sound_enabled / qmb_music_enabled keys;
// - authoritative afterwards; the old keys are only rewritten as mirrors and can never contradict the preference object;
// - never part of the gameplay save or the cloud payload; changing them draws no game random numbers.
const KEY = 'qmb_audio_prefs_v1';
const D = { master: 0.8, music: 0.6, ambience: 0.5, engine: 0.8, effects: 1 };
const prefsOf = ctx => JSON.parse(ctx.storage.get(KEY));
// The two runtime gates and the two mirrors must always follow from the stored preference object.
function assertConsistent(ctx, where) {
  const p = prefsOf(ctx);
  const sound = !p.muted && p.master > 0 && (p.engine > 0 || p.effects > 0), music = !p.muted && p.master > 0 && p.music > 0;
  assert.equal(ctx.evaluate('soundEnabled'), sound, `${where}: soundEnabled follows the preferences`);
  assert.equal(ctx.evaluate('musicEnabled'), music, `${where}: musicEnabled follows the preferences`);
  assert.equal(ctx.storage.get('qmb_sound_enabled'), String(sound), `${where}: qmb_sound_enabled mirror matches`);
  assert.equal(ctx.storage.get('qmb_music_enabled'), String(music), `${where}: qmb_music_enabled mirror matches`);
  assert.deepEqual(JSON.parse(ctx.evaluate('JSON.stringify(QmbAudio.prefs())')), p, `${where}: runtime preferences equal the stored object`);
}

// ---------- First-run migration from the old on/off keys ----------
const CASES = [
  // [qmb_sound_enabled, qmb_music_enabled, expected levels]
  [null, null, { ...D }],
  ['true', 'true', { ...D }],
  ['false', 'true', { ...D, ambience: 0, engine: 0, effects: 0 }],
  ['true', 'false', { ...D, music: 0 }],
  ['false', 'false', { ...D, ambience: 0, engine: 0, effects: 0, music: 0 }]
];
for (const [sound, music, want] of CASES) {
  const ctx = makeGameContext({ storage: { qmb_sound_enabled: sound, qmb_music_enabled: music } });
  assert.deepEqual(prefsOf(ctx), { version: 1, ...want, muted: false }, `migration from sound=${sound} music=${music}`);
  assertConsistent(ctx, `after migration from sound=${sound} music=${music}`);
}

// ---------- Migration runs once; afterwards the preference object is authoritative ----------
{
  const stored = { version: 1, master: 0.4, music: 0.2, ambience: 0.3, engine: 0.7, effects: 1, muted: false };
  // Old keys that contradict the stored object are overwritten as mirrors, never read back as settings.
  const ctx = makeGameContext({ storage: { [KEY]: JSON.stringify(stored), qmb_sound_enabled: 'false', qmb_music_enabled: 'false' } });
  assert.deepEqual(prefsOf(ctx), stored, 'an existing preference object is kept as is');
  assertConsistent(ctx, 'stale old keys are rewritten to match');
}

// ---------- Unreadable or out-of-range preferences ----------
{
  const ctx = makeGameContext({ storage: { [KEY]: '{not json', qmb_sound_enabled: 'true', qmb_music_enabled: 'false' } });
  assert.deepEqual(prefsOf(ctx), { version: 1, ...D, music: 0, muted: false }, 'corrupt JSON is rebuilt from the mirrors without throwing');
  assertConsistent(ctx, 'after recovering from corrupt JSON');
}
{
  const ctx = makeGameContext({ storage: { [KEY]: JSON.stringify({ version: 1, master: 7, music: -2, ambience: 'loud', engine: 0.333, effects: null, muted: 'yes' }) } });
  assert.deepEqual(prefsOf(ctx), { version: 1, master: 1, music: 0, ambience: 0.5, engine: 0.33, effects: 1, muted: false }, 'values are clamped, rounded or defaulted; only muted === true mutes');
  assertConsistent(ctx, 'after normalising');
}
{
  const ctx = makeGameContext({ storage: { [KEY]: JSON.stringify({ version: 2, master: 0.1 }), qmb_sound_enabled: 'true', qmb_music_enabled: 'true' } });
  assert.deepEqual(prefsOf(ctx), { version: 1, ...D, muted: false }, 'an unknown version is not trusted; it is rebuilt from the mirrors');
}

// ---------- Normal use never lets the values contradict one another ----------
{
  const ctx = makeGameContext({ seed: 9, storage: { qmb_sound_enabled: 'true', qmb_music_enabled: 'true' } });
  const before = ctx.math.calls;
  const steps = [
    "QmbAudio.setLevel('music',0)", "QmbAudio.setLevel('master',0)", "QmbAudio.setLevel('master',0.55)", 'QmbAudio.setMuted(true)',
    "QmbAudio.setLevel('engine',0)", "QmbAudio.setLevel('effects',0)", 'QmbAudio.toggleMute()', "QmbAudio.setLevel('engine',0.9)",
    "QmbAudio.setLevel('ambience',1.4)", "QmbAudio.setLevel('nonsense',0.5)", "QmbAudio.set({music:0.25,muted:false})", 'QmbAudio.toggleMute()', 'QmbAudio.toggleMute()'
  ];
  for (const step of steps) { ctx.evaluate(step); assertConsistent(ctx, step); }
  assert.equal(prefsOf(ctx).ambience, 1, 'levels are clamped on set');
  assert.equal(ctx.math.calls - before, 0, 'changing audio preferences draws no game random numbers');
}

// ---------- The old toggles are wrappers over the preference object ----------
{
  const ctx = makeGameContext({ storage: { qmb_sound_enabled: 'true', qmb_music_enabled: 'true' } });
  ctx.evaluate('toggleMusic()'); assert.equal(prefsOf(ctx).music, 0, 'Music Off sets music to 0'); assertConsistent(ctx, 'toggleMusic off');
  ctx.evaluate('toggleMusic()'); assert.equal(prefsOf(ctx).music, D.music, 'Music On restores the default level'); assertConsistent(ctx, 'toggleMusic on');
  ctx.evaluate('toggleSound()'); assert.deepEqual([prefsOf(ctx).ambience, prefsOf(ctx).engine, prefsOf(ctx).effects], [0, 0, 0], 'Effects Off disables ambience, engine and effects'); assertConsistent(ctx, 'toggleSound off');
  ctx.evaluate('toggleSound()'); assertConsistent(ctx, 'toggleSound on');
}

// ---------- Never part of the gameplay save or the cloud payload ----------
{
  const ctx = makeGameContext({ storage: { qmb_mvp_save: readInput('v2-garage') } });
  ctx.evaluate('refreshListings();loadGame(false);render()');
  const save = ctx.storage.get('qmb_mvp_save');
  ctx.evaluate("QmbAudio.setLevel('master',0.3);QmbAudio.setMuted(true);QmbAudio.setLevel('music',0.9)");
  assert.equal(ctx.storage.get('qmb_mvp_save'), save, 'changing audio preferences leaves the gameplay save untouched');
  ctx.evaluate('saveGame()');
  const resaved = ctx.storage.get('qmb_mvp_save');
  for (const word of ['qmb_audio', 'ambience', '"muted"']) assert.ok(!resaved.includes(word), `the gameplay save contains no audio preference (${word})`);
  assert.equal(ctx.requests.length, 0, 'no network request');
}
console.log('Quarter Mile Builder audio preference checks passed.');
