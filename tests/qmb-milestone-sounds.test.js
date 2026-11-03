const assert = require('node:assert/strict');
const { readInput } = require('./helpers/golden-cases');
const { audioSandbox } = require('./helpers/fake-audio');

// Cash, upgrade and achievement cues (Development Assignment 01, Stage C), using the fake Web Audio. The cues live in
// js/systems/audio.js (QmbAudio.cue / reserve); the game calls them from playFinanceSound, the workshop, the dyno tune
// and badge announcements. Sound never changes money, Respect, saves or gameplay random draws.

const tick = () => new Promise(r => setImmediate(r));
const SOUND_ON = { qmb_sound_enabled: 'true', qmb_music_enabled: 'true' };

// A booted game (v2-garage fixture, event left so the workshop is open), audio unlocked by a genuine interaction.
async function game({ unlock = true, noAudio = false, storage = {} } = {}) {
  const box = audioSandbox({ noAudio, storage: { ...SOUND_ON, qmb_mvp_save: readInput('v2-garage'), ...storage } });
  box.evaluate("refreshListings();loadGame(false);state.lastEvent.dayAdvanced=true;state.screen='garage';state.workshopDayUsed=null;state.workshopJob=null;state.money=60000;render()");
  if (unlock) { box.fire('pointerdown'); await tick(); }
  return box;
}
const cues = box => JSON.parse(box.evaluate('JSON.stringify(QmbAudio.debug().cues)')); // copied out of the sandbox realm
const later = (box, s = 1) => box.advance(s); // past every collapse window and cooldown
const newSquares = (box, from) => box.audio.made.sources.slice(from).filter(s => s.kind === 'oscillator' && s.type === 'square').length;

(async () => {
  // ---------- Each cue plays, on the effects bus, and only when audible ----------
  {
    const box = await game();
    const effects = box.evaluate("QmbAudio.bus('effects')");
    for (const name of ['cashIn', 'cashOut', 'upgradeInstalled', 'achievement', 'garageExpanded']) {
      const from = box.audio.made.sources.length, nodes = box.audio.made.nodes.length;
      assert.ok(box.evaluate(`QmbAudio.cue('${name}')`), `${name} plays`);
      assert.ok(box.audio.made.sources.length > from, `${name} makes sound`);
      const outs = box.audio.made.nodes.slice(nodes).filter(n => n.outputs.includes(effects));
      assert.equal(outs.length, 1, `${name} has one output, on the effects bus`);
      assert.ok(box.audio.made.sources.slice(from).every(s => !s.outputs.includes(box.ctx().destination)), `${name} never bypasses the buses`);
      later(box, 4);
    }
    assert.equal(box.evaluate("QmbAudio.cue('jackpot')"), null, 'unknown cue: nothing');
    box.evaluate("QmbAudio.setLevel('effects',0)");
    assert.equal(box.evaluate("QmbAudio.cue('cashIn')"), null, 'effects at 0: silent');
    box.evaluate("QmbAudio.setLevel('effects',1);QmbAudio.setMuted(true)");
    assert.equal(box.evaluate("QmbAudio.cue('cashIn')"), null, 'muted: silent');
    box.evaluate('QmbAudio.setMuted(false)'); await tick();
    box.context.document.hidden = true; box.fire('visibilitychange');
    assert.equal(box.evaluate("QmbAudio.cue('achievement')"), null, 'hidden tab: silent');
    box.context.document.hidden = false; box.fire('visibilitychange'); await tick(); await tick();
    later(box);
    assert.ok(box.evaluate("QmbAudio.cue('achievement')"), 'visible again: plays');
  }
  {
    // Locked audio: cues are dropped, and nothing bursts out on the first tap.
    const box = await game({ unlock: false });
    box.activation.hasBeenActive = false;
    box.evaluate('playFinanceSound(500);playFinanceSound(-300);announceBadgeUnlocks([Object.keys(BADGE_DEFINITIONS)[0]])');
    box.activation.hasBeenActive = true; box.fire('pointerdown'); await tick();
    assert.deepEqual(cues(box), [], 'no queued cues play after unlocking');
  }

  // ---------- No piling up ----------
  {
    const box = await game();
    // Cooldown: the same cue twice in quick succession plays once.
    assert.ok(box.evaluate("QmbAudio.cue('cashIn')"));
    assert.equal(box.evaluate("QmbAudio.cue('cashIn')"), null, 'cash cue cooldown');
    later(box);
    assert.ok(box.evaluate("QmbAudio.cue('cashIn')"), 'after the cooldown it plays again');
    later(box);
    // A stronger cue fades out a weaker one already playing; a weaker one after a stronger one is dropped.
    const effects = box.evaluate("QmbAudio.bus('effects')"), nodes = box.audio.made.nodes.length;
    box.evaluate("QmbAudio.cue('cashOut')");
    const cashOut = box.audio.made.nodes.slice(nodes).find(n => n.outputs.includes(effects));
    assert.ok(box.evaluate("QmbAudio.cue('upgradeInstalled')"), 'the upgrade cue takes over');
    assert.ok(cashOut.gain.events.some(e => e[0] === 'cancel'), 'the cash cue it replaced fades out');
    assert.equal(box.evaluate("QmbAudio.cue('cashOut')"), null, 'cash straight after an upgrade: dropped');
    assert.equal(box.evaluate("QmbAudio.cue('upgradeInstalled')"), null, 'equal priority straight after: dropped');
    assert.ok(box.evaluate("QmbAudio.cue('achievement')"), 'a badge outranks an upgrade');
    later(box);
    // The race result chord holds the bus: no cash cue on top of it, and a badge waits until the chord ends.
    box.evaluate("playSfx('win')");
    const now = box.ctx().currentTime, from = box.audio.made.sources.length;
    box.evaluate('playFinanceSound(800)');
    assert.equal(cues(box).at(-1), 'achievement', 'no cash cue over the result chord');
    assert.ok(box.evaluate("QmbAudio.cue('achievement')"), 'a badge still plays after a win');
    const starts = box.audio.made.sources.slice(from).map(s => s.startAt);
    assert.ok(starts.length && starts.every(t => t >= now + 0.8), 'and waits for the chord to finish');
    later(box);
    box.evaluate('playFinanceSound(800)');
    assert.equal(cues(box).at(-1), 'cashIn', 'cash plays normally once the chord is over');
  }

  // ---------- The old square-wave money bleeps are gone ----------
  {
    const box = await game();
    for (const amount of [150, 6000, 25000, -150, -6000, -25000]) {
      const from = box.audio.made.sources.length;
      box.evaluate(`playFinanceSound(${amount})`);
      assert.equal(newSquares(box, from), 0, `no square wave for ${amount}`);
      assert.equal(cues(box).at(-1), amount > 0 ? 'cashIn' : 'cashOut', `${amount}: the ${amount > 0 ? 'cash-in' : 'cash-out'} cue`);
      later(box);
    }
    const from = box.audio.made.sources.length;
    box.evaluate("QmbAudio.cue('cashIn',{amount:250})"); const small = box.audio.made.sources.length - from;
    later(box);
    const from2 = box.audio.made.sources.length;
    box.evaluate("QmbAudio.cue('cashIn',{amount:5000})"); const large = box.audio.made.sources.length - from2;
    assert.ok(large > small, 'a payout of $5,000 or more sounds fuller');
  }

  // ---------- Game moments ----------
  {
    // Same-day upgrade: the installed cue, not the cash-out cue. Money moves exactly as before.
    const box = await game();
    const u = JSON.parse(box.evaluate("JSON.stringify(currentUpgradeOptions(state.car).find(u=>u.day===0&&!u.tuneService))"));
    assert.ok(u, 'a same-day upgrade is available');
    const money = box.evaluate('state.money');
    box.evaluate(`buyUpgrade('${u.id}')`);
    assert.equal(box.evaluate('state.money'), money - u.cost, 'the upgrade costs what it always did');
    assert.ok(cues(box).includes('upgradeInstalled') || cues(box).includes('achievement'), 'fitting an upgrade plays the installed cue (or a badge it earned)');
    assert.ok(!cues(box).includes('cashOut'), 'no cash-out cue for a fitted upgrade');
  }
  {
    // Workshop job: booking it spends money (cash out); collecting it on a later day plays the installed cue.
    const box = await game();
    const u = JSON.parse(box.evaluate("JSON.stringify(currentUpgradeOptions(state.car).find(u=>u.day>0&&!u.tuneService))"));
    assert.ok(u, 'a workshop job is available');
    box.evaluate(`buyUpgrade('${u.id}')`);
    assert.equal(cues(box).at(-1), 'cashOut', 'booking a job: cash out');
    later(box);
    box.evaluate('state.day=state.workshopJob.completeDay;render()');
    assert.equal(box.evaluate('state.workshopJob'), null, 'job collected');
    assert.ok(['upgradeInstalled', 'achievement'].includes(cues(box).at(-1)), 'collecting it: the installed cue (or a badge it earned)');
  }
  {
    // Badges: one cue however many unlock together.
    const box = await game();
    box.evaluate('announceBadgeUnlocks(Object.keys(BADGE_DEFINITIONS).slice(0,3))');
    assert.deepEqual(cues(box), ['achievement'], 'three badges, one cue');
  }
  {
    // A loaded workshop job that completes during startup stays silent (audio is still locked).
    const save = JSON.parse(readInput('v2-garage'));
    const box = audioSandbox({ storage: { ...SOUND_ON, qmb_mvp_save: JSON.stringify(save) }, activated: false });
    box.evaluate('refreshListings();loadGame(false);render()');
    box.activation.hasBeenActive = true; box.fire('pointerdown'); await tick();
    assert.deepEqual(cues(box), [], 'nothing from startup plays on the first tap');
  }

  // ---------- Restoring a save is not a new event: no milestone cue, even with audio already unlocked ----------
  // A save whose workshop job is due completes it inside normaliseState() while loading. That must stay silent for a
  // manual local load and a cloud load, while the same completion through normal calendar progression plays one cue.
  // Book a workshop job, then return a save in which the job is due and has not been collected.
  async function dueJobSave(noAudio = false) {
    const box = await game({ noAudio });
    const id = box.evaluate("currentUpgradeOptions(state.car).find(u=>u.day>0&&!u.tuneService).id");
    box.evaluate(`buyUpgrade('${id}')`);
    return box.evaluate('JSON.stringify({...state,day:state.workshopJob.completeDay})');
  }
  const countOf = (list, name) => list.filter(n => n === name).length;
  const loadedResult = box => JSON.parse(box.evaluate("JSON.stringify({job:state.workshopJob,day:state.day,money:state.money,respect:state.respect,car:state.car,owned:state.owned,badges:state.badges,saved:JSON.parse(localStorage.getItem('qmb_mvp_save'))})"));
  const dueSave = await dueJobSave();
  {
    // Manual local load (the Load button) after audio is unlocked.
    const box = await game(); later(box, 2);
    box.context.localStorage.setItem('qmb_mvp_save', dueSave);
    const before = cues(box);
    box.evaluate('loadGame(true)');
    assert.equal(box.evaluate('state.workshopJob'), null, 'local load: the due job completes as before');
    assert.deepEqual(cues(box), before, 'local load: no cue while restoring');
    assert.equal(box.evaluate('restoringState'), false, 'local load: the restore guard is released');
    // Ordinary play afterwards still sounds.
    later(box, 2);
    box.evaluate("state.workshopDayUsed=null;buyUpgrade(currentUpgradeOptions(state.car).find(u=>u.day===0&&!u.tuneService).id)");
    assert.ok(['upgradeInstalled', 'achievement'].includes(cues(box).at(-1)), 'after loading, fitting an upgrade still plays its cue');
  }
  {
    // Cloud load after audio is unlocked (fetch is stubbed; the cloud save is supplied directly, nothing is sent).
    const box = await game(); later(box, 2);
    box.evaluate(`socialData={profile:{displayName:'Test',friendCode:'TEST0000'},save:{state:${dueSave}}}`);
    const before = cues(box);
    box.evaluate('cloudLoad()');
    assert.equal(box.evaluate('state.workshopJob'), null, 'cloud load: the due job completes as before');
    assert.deepEqual(cues(box), before, 'cloud load: no cue while restoring');
    assert.equal(box.evaluate('restoringState'), false, 'cloud load: the restore guard is released');
    assert.equal(box.requests.length, 0, 'cloud load test sends no network request');
  }
  {
    // A guard left set by a failing load would silence the game; it is released even when loading throws.
    const box = await game(); later(box, 2);
    box.context.localStorage.setItem('qmb_mvp_save', '{not json');
    assert.throws(() => box.evaluate('loadGame(true)'));
    assert.equal(box.evaluate('restoringState'), false, 'the restore guard is released after a failed load');
  }
  {
    // Normal calendar progression completing the job: exactly one installation cue.
    const box = await game();
    const id = box.evaluate("currentUpgradeOptions(state.car).find(u=>u.day>0&&!u.tuneService).id");
    box.evaluate(`buyUpgrade('${id}')`); later(box, 2);
    const before = countOf(cues(box), 'upgradeInstalled');
    // Skip Day on the calendar until the job is due, exactly as a player would.
    box.evaluate("state.screen='event';for(let i=0;i<20&&state.workshopJob;i++)skipCalendarDay();render();render()");
    assert.equal(box.evaluate('state.workshopJob'), null, 'progression: the job completes');
    assert.equal(countOf(cues(box), 'upgradeInstalled') - before, 1, 'progression: exactly one installation cue');
  }
  {
    // Same resulting state and saves with and without audio, for both restore paths, and no extra random draws.
    const restore = async (noAudio, how) => {
      const box = await game({ noAudio });
      const save = await dueJobSave(noAudio);
      const calls = box.evaluate('Math.calls');
      if (how === 'local') { box.context.localStorage.setItem('qmb_mvp_save', save); box.evaluate('loadGame(true)'); }
      else { box.evaluate(`socialData={profile:{displayName:'Test',friendCode:'TEST0000'},save:{state:${save}}}`); box.evaluate('cloudLoad()'); }
      const r = loadedResult(box); r.draws = box.evaluate('Math.calls') - calls;
      for (const x of [r, r.saved]) if (x && x.log) x.log = x.log.map(l => l.msg);
      return r;
    };
    for (const how of ['local', 'cloud']) {
      const a = await restore(false, how), b = await restore(true, how);
      assert.deepEqual(a, b, `${how} load: identical state, save and random draws with and without audio`);
    }
  }

  // ---------- Sound never changes the game ----------
  {
    const run = async noAudio => {
      const box = await game({ noAudio });
      box.evaluate(`(()=>{const c=state.car;const a=currentUpgradeOptions(c).find(u=>u.day===0&&!u.tuneService);buyUpgrade(a.id);
        const b=currentUpgradeOptions(c).find(u=>u.day>0&&!u.tuneService);if(b)buyUpgrade(b.id);state.day+=10;render();
        announceBadgeUnlocks([Object.keys(BADGE_DEFINITIONS)[1]]);playSfx('win');playFinanceSound(900)})()`);
      return { calls: box.evaluate('Math.calls'), save: box.evaluate('JSON.stringify({...state,log:state.log.map(l=>l.msg)})') };
    };
    const withAudio = await run(false), without = await run(true);
    assert.equal(withAudio.calls, without.calls, 'same gameplay random draws with and without audio');
    assert.equal(withAudio.save, without.save, 'same game state with and without audio');
  }
  console.log('Quarter Mile Builder milestone sound checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
