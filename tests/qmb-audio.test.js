const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');
const { readInput } = require('./helpers/golden-cases');
const { audioSandbox } = require('./helpers/fake-audio');

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
// ================= Audio manager (fake Web Audio) =================
const tick = () => new Promise(r => setImmediate(r));
const live = (box, kind) => box.audio.made.sources.filter(s => (!kind || s.kind === kind) && s.startAt !== null && s.stopAt === null);

(async () => {
  // ---------- No Web Audio at all: everything is a safe no-op and the game still runs ----------
  {
    const box = audioSandbox({ noAudio: true });
    assert.equal(box.evaluate('QmbAudio.available()'), false);
    assert.equal(await box.evaluate('QmbAudio.context()'), null, 'no context without Web Audio');
    box.evaluate("QmbAudio.setSoundscape('garage');QmbAudio.stinger('arrival');QmbAudio.unlock();refreshListings();loadGame(false);render()");
    assert.equal(box.evaluate('QmbAudio.bus("engine")'), null, 'no buses without Web Audio');
    assert.equal(box.evaluate('state.screen'), 'home', 'the game starts normally without audio');
  }

  // ---------- Nothing is created before a genuine interaction ----------
  {
    const box = audioSandbox({ activated: false });
    assert.equal(await box.evaluate('QmbAudio.context()'), null, 'no context before the player interacts');
    box.evaluate("QmbAudio.setSoundscape('garage')");
    assert.equal(box.audio.made.contexts.length, 0, 'a requested soundscape waits for the first interaction');
    box.activation.hasBeenActive = true; box.fire('pointerdown'); await tick();
    assert.equal(box.audio.made.contexts.length, 1, 'the first interaction creates exactly one context');
    assert.equal(box.evaluate('QmbAudio.debug().playing'), 'garage', 'the waiting soundscape starts after unlocking');
    box.fire('click'); box.fire('keydown'); await tick();
    assert.equal(box.audio.made.contexts.length, 1, 'further interactions reuse the same context');
  }

  // ---------- Graph, levels, crossfades, scheduling, ducking, hiding and muting ----------
  {
    const box = audioSandbox({ seed: 21 });
    const draws0 = box.evaluate('Math.calls');
    box.fire('pointerdown'); await tick();
    const bus = n => box.evaluate(`QmbAudio.bus('${n}').gain.value`);
    assert.deepEqual(['music', 'ambience', 'engine', 'effects'].map(bus), [0.6, 0.5, 0.8, 1], 'bus levels follow the preferences');
    box.evaluate("QmbAudio.setLevel('ambience',0.3)"); assert.equal(bus('ambience'), 0.3, 'changing a level updates its bus');

    box.evaluate("QmbAudio.setSoundscape('garage')");
    assert.equal(box.evaluate('QmbAudio.debug().playing'), 'garage');
    assert.equal(box.intervals.size, 1, 'one scheduler while a soundscape plays');
    const garageBeds = live(box, 'buffer').length;
    assert.ok(garageBeds >= 2, 'garage beds are running');
    box.evaluate("QmbAudio.setSoundscape('garage')");
    assert.equal(live(box, 'buffer').length, garageBeds, 'asking for the same soundscape again starts nothing new');

    // Crossfade to a venue: the old scape fades out and is stopped; nothing is left running from it.
    const before = new Set(live(box));
    box.evaluate("QmbAudio.setSoundscape('venue_heathcote_legal',{crowd:.85,temp:15,wind:1})");
    assert.equal(box.evaluate('QmbAudio.debug().playing'), 'venue_heathcote_legal');
    assert.ok(box.evaluate("QmbAudio.debug().events.includes('crickets')"), 'a 15 C Heathcote night has crickets');
    box.flushTimeouts();
    assert.ok([...before].every(s => s.stopAt !== null), 'every garage source is stopped after the crossfade');
    assert.equal(box.intervals.size, 1, 'still exactly one scheduler');

    // Weather and turnout conditions.
    box.evaluate("QmbAudio.setSoundscape('venue_heathcote_legal',{crowd:.35,temp:24,wind:1})");
    assert.ok(!box.evaluate("QmbAudio.debug().events.includes('crickets')"), 'no crickets on a hot night');
    assert.ok(!box.evaluate("QmbAudio.debug().events.includes('cheer')"), 'no crowd swells on a quiet night');
    box.evaluate("QmbAudio.setSoundscape('venue_mildura_regional',{crowd:.6,temp:28,wind:1})");
    assert.ok(box.evaluate("QmbAudio.debug().events.includes('cicada')"), 'a hot Mildura night has cicadas');
    box.evaluate("QmbAudio.setSoundscape('venue_you_yangs',{})");
    const yy = box.evaluate('QmbAudio.debug().events');
    assert.ok(!yy.includes('pa') && !yy.includes('cheer'), 'the You Yangs has no PA and no crowd');

    // Let a few minutes of a busy venue play: one-shots are capped and every one is scheduled to stop.
    box.evaluate("QmbAudio.setSoundscape('venue_calder_test',{crowd:1,temp:14,wind:1})");
    box.flushTimeouts();
    let peak = 0;
    for (let i = 0; i < 180 * 4; i++) { box.advance(0.25); peak = Math.max(peak, box.evaluate('QmbAudio.debug().voices')); }
    assert.ok(peak > 0 && peak <= 6, `one-shot voices are capped (peak ${peak})`);
    const oneShots = box.audio.made.sources.filter(s => s.kind === 'oscillator');
    assert.ok(oneShots.length > 10, 'Calder produced distant engines, PA and crowd over three minutes');
    assert.ok(oneShots.every(s => s.stopAt !== null), 'every one-shot oscillator is scheduled to stop');

    // Ducking under engines.
    box.evaluate('QmbAudio.setDuckProbe(()=>true)'); box.advance(0.25);
    assert.equal(box.evaluate('QmbAudio.debug().ducked'), true, 'ambience ducks while an engine runs');
    box.evaluate('QmbAudio.setDuckProbe(()=>false)'); box.advance(0.25);
    assert.equal(box.evaluate('QmbAudio.debug().ducked'), false, 'and returns afterwards');

    // Hidden page: fade, stop scheduling, suspend; visible again: resume and carry on.
    box.context.document.hidden = true; box.fire('visibilitychange');
    assert.equal(box.evaluate('QmbAudio.debug().master'), 0, 'the master fades to silence while hidden');
    assert.equal(box.intervals.size, 0, 'no scheduling while hidden');
    box.flushTimeouts();
    assert.equal(box.ctx().state, 'suspended', 'the context is suspended while hidden');
    box.context.document.hidden = false; box.fire('visibilitychange'); await tick(); await tick();
    assert.equal(box.ctx().state, 'running', 'the context resumes when visible');
    assert.equal(box.intervals.size, 1, 'the soundscape carries on');
    assert.equal(box.evaluate('QmbAudio.debug().master'), 0.8, 'and the master level comes back');

    // Mute and zero ambience.
    box.evaluate('QmbAudio.setMuted(true)'); box.flushTimeouts();
    assert.equal(box.ctx().state, 'suspended', 'muting suspends the context');
    box.evaluate('QmbAudio.setMuted(false)'); await tick(); await tick();
    assert.equal(box.ctx().state, 'running', 'unmuting resumes it');
    box.evaluate("QmbAudio.setLevel('ambience',0)"); box.flushTimeouts();
    assert.equal(box.evaluate('QmbAudio.debug().playing'), null, 'ambience at 0 stops the soundscape');
    assert.equal(live(box, 'buffer').length, 0, 'and leaves nothing running');
    box.evaluate("QmbAudio.setLevel('ambience',0.5)");
    assert.equal(box.evaluate('QmbAudio.debug().playing'), 'venue_calder_test', 'raising ambience restarts the wanted soundscape');

    // Stingers only when music is audible.
    assert.equal(box.evaluate("QmbAudio.stinger('arrival')"), true, 'arrival stinger plays on the music bus');
    box.evaluate("QmbAudio.setLevel('music',0)");
    assert.equal(box.evaluate("QmbAudio.stinger('arrival')"), false, 'no stinger with music at 0');

    // Unknown soundscape: a clean stop, not an error.
    box.evaluate("QmbAudio.setSoundscape('no_such_place')"); box.flushTimeouts();
    assert.equal(box.evaluate('QmbAudio.debug().playing'), null);

    assert.equal(box.evaluate('Math.calls') - draws0, 0, 'none of this drew a game random number');
  }
  // ================= Game integration =================
  const SAVE = { qmb_mvp_save: readInput('v2-garage'), qmb_sound_enabled: 'true', qmb_music_enabled: 'true' };
  const toEvent = id => `(()=>{let e=eventById('${id}');for(let i=0;i<40&&daysUntil(e)!==0;i++)state.day++;state.respect=Math.max(state.respect,30);travelToEvent('${id}')})()`;
  const startGame = async (opts = {}) => { const box = audioSandbox({ seed: 13, storage: SAVE, ...opts }); box.evaluate('refreshListings();loadGame(false);render()'); if (!opts.noAudio) { box.fire('pointerdown'); await tick(); } return box; };

  // ---------- Screens map to soundscapes ----------
  {
    const box = await startGame();
    for (const screen of ['home', 'garage', 'classifieds', 'upgrades', 'work', 'badges', 'season', 'log', 'social', 'event']) {
      box.evaluate(`show('${screen}')`);
      assert.equal(box.evaluate('QmbAudio.soundscape()'), 'garage', `${screen} uses the garage soundscape`);
    }
    for (const [id, scape] of [['calder_test', 'travel_metro'], ['heathcote_legal', 'travel_country'], ['mildura_regional', 'travel_long'], ['state_grudge', 'travel_night'], ['bend_open', 'travel_interstate']]) {
      box.evaluate("show('event')"); box.evaluate(toEvent(id)); await tick();
      assert.equal(box.evaluate('state.screen'), 'travel', `${id}: travelling`);
      assert.equal(box.evaluate('QmbAudio.soundscape()'), scape, `${id}: the journey uses ${scape}`);
      box.evaluate('cancelArrival()');
    }
  }

  // ---------- Skipping travel switches the audio at once; arrival plays one stinger; venues get their own character ----------
  for (const [id, venue] of [['heathcote_legal', 'venue_heathcote_legal'], ['calder_test', 'venue_calder_test'], ['mildura_regional', 'venue_mildura_regional'], ['state_grudge', 'venue_default']]) {
    const box = await startGame();
    box.evaluate(toEvent(id)); await tick();
    assert.equal(box.evaluate('!!(engineAudio&&engineAudio.cruise)'), true, `${id}: the cruise engine plays on the journey`);
    const musicBus = box.evaluate("QmbAudio.bus('music')");
    const stingers = () => box.audio.made.nodes.filter(n => n.outputs.includes(musicBus)).length;
    box.evaluate('finishTravel()');
    assert.equal(box.evaluate('state.screen'), 'arrival');
    assert.equal(box.evaluate('engineAudio'), null, `${id}: Arrive now releases the cruise engine immediately`);
    assert.equal(box.evaluate('QmbAudio.soundscape()'), venue, `${id}: Arrive now switches straight to ${venue}`);
    assert.equal(stingers(), 1, `${id}: one arrival stinger`);
    box.evaluate('render();render()');
    assert.equal(stingers(), 1, `${id}: re-rendering the arrival does not repeat the stinger`);
    box.evaluate("confirmArrival('race')");
    assert.equal(box.evaluate('QmbAudio.soundscape()'), venue, `${id}: the venue soundscape continues at the event`);
  }
  {
    const hub = await startGame({ storage: { ...SAVE, qmb_mvp_save: readInput('you-yangs-session') } });
    hub.evaluate("show('youYangs')");
    assert.equal(hub.evaluate('state.screen'), 'youYangs');
    assert.equal(hub.evaluate('QmbAudio.soundscape()'), 'venue_you_yangs', 'the You Yangs hub has its own proving-ground ambience');
    const journey = await startGame({ storage: { ...SAVE, qmb_mvp_save: readInput('you-yangs-journey') } });
    assert.equal(journey.evaluate('state.screen'), 'yyTravel');
    assert.equal(journey.evaluate('QmbAudio.soundscape()'), 'travel_proving', 'the first You Yangs journey uses the proving-ground travel scene');
  }

  // ---------- Routing, ducking under a live race, and engine cleanup ----------
  {
    const box = await startGame();
    box.evaluate(toEvent('heathcote_legal')); await tick();
    const engineBus = box.evaluate("QmbAudio.bus('engine')"), effectsBus = box.evaluate("QmbAudio.bus('effects')");
    assert.ok(box.evaluate('engineAudio.master').outputs.includes(engineBus), 'the engine voice is routed to the engine bus');
    box.evaluate("finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0]);(()=>{const e=state.lastEvent;e.queueIndex=e.lineup.findIndex(x=>x.type==='player')})();goToMyRace();startLiveRace(currentLineupEntry().opponentIndex)");
    await tick();
    assert.ok(box.evaluate('!!engineAudio&&!engineAudio.cruise'), 'a live race runs the engine voice');
    box.advance(0.5);
    assert.equal(box.evaluate('QmbAudio.debug().ducked'), true, 'the venue ambience ducks under the race engine');
    box.evaluate("playSfx('click')");
    assert.ok(box.audio.made.nodes.some(n => n.outputs.includes(effectsBus)), 'effects are routed to the effects bus');
    box.evaluate("show('garage')"); box.advance(0.5);
    assert.equal(box.evaluate('engineAudio'), null, 'leaving the race releases the engine');
    assert.equal(box.evaluate('QmbAudio.debug().ducked'), false, 'and the ambience comes back up');
    assert.equal(box.evaluate('QmbAudio.soundscape()'), 'garage');
  }

  // ---------- Audio never changes gameplay random draws ----------
  {
    const flow = `${toEvent('mildura_regional')};finishTravel();confirmArrival('race');chooseRoundOpponent(state.lastEvent.raceSlots[0])`;
    const withAudio = await startGame(), without = await startGame({ noAudio: true });
    const a0 = withAudio.evaluate('Math.calls'), b0 = without.evaluate('Math.calls');
    withAudio.evaluate(flow); without.evaluate(flow); await tick();
    withAudio.advance(30);
    assert.equal(withAudio.evaluate('Math.calls') - a0, without.evaluate('Math.calls') - b0, 'the same play-through draws the same random numbers with and without audio');
    assert.equal(withAudio.evaluate('JSON.stringify(state.lastEvent.opponents)'), without.evaluate('JSON.stringify(state.lastEvent.opponents)'), 'and generates the same field');
    assert.equal(withAudio.evaluate('JSON.stringify(state)'), without.evaluate('JSON.stringify(state)'), 'and leaves the same game state');
  }
  console.log('Quarter Mile Builder audio checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
