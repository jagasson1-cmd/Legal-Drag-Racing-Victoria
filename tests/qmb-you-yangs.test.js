const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const definitions = script.slice(0, script.indexOf('refreshListings();loadGame(false);render();'));
const storage = new Map();
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    id, innerHTML: '', textContent: '', value: '', disabled: false, title: '', style: {},
    setAttribute: () => {},
    classList: {add: () => {}, remove: () => {}, toggle: () => {}}
  });
  return elements.get(id);
};
const context = vm.createContext({
  console, Math, Date, JSON, URL, URLSearchParams,
  alert: () => {}, confirm: () => true,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  performance: {now: () => 1000},
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  document: {addEventListener: () => {}, getElementById: element},
  window: {addEventListener: () => {}},
  location: {search: '', origin: 'http://localhost', pathname: '/'},
  history: {replaceState: () => {}}
});
vm.runInContext(definitions, context);
const evaluate = source => vm.runInContext(source, context);

assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.respectRequired`), 125);
assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.standardEntryFee`), 3000);
assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.fordEntryFee`), 2000);
assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.challenges.highSpeed.rollingStartKph`), 60);
assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.challenges.highSpeed.distanceMetres`), 3000);
assert.equal(evaluate(`evaluateBadgeCandidates('you_yangs_speed',{peakSpeed:159}).length`), 0);
assert.equal(evaluate(`evaluateBadgeCandidates('you_yangs_speed',{peakSpeed:160}).includes('proving_ground_160')`), true);
assert.equal(evaluate(`evaluateBadgeCandidates('you_yangs_speed',{peakSpeed:200}).includes('proving_ground_200')`), true);
assert.equal(evaluate(`evaluateBadgeCandidates('you_yangs_speed',{peakSpeed:250}).includes('proving_ground_250')`), true);
assert.equal(evaluate(`evaluateBadgeCandidates('you_yangs_speed',{peakSpeed:300}).includes('proving_ground_300')`), true);
assert.equal(evaluate(`evaluateBadgeCandidates('you_yangs_speed',{peakSpeed:350}).includes('proving_ground_350')`), true);

evaluate(`state=freshState();youYangsState().invited=true;nav()`);
assert.match(elements.get('nav').innerHTML, /Private Invitation/);
evaluate(`youYangsState().visits=1;nav()`);
assert.match(elements.get('nav').innerHTML, />You Yangs</);

assert.equal(evaluate(`yyEntryFee(CARS.find(c=>c.id==='aufalconxr6'))`), 2000);
assert.equal(evaluate(`yyEntryFee(CARS.find(c=>c.id==='is200'))`), 3000);

evaluate(`state=freshState();state.respect=124;normaliseState()`);
assert.equal(evaluate(`youYangsState().invited`), false);
evaluate(`state.respect=125;checkYouYangsInvitation()`);
assert.equal(evaluate(`youYangsState().invited`), true);
assert.equal(evaluate(`state.notifications.filter(n=>n.id==='you_yangs_invite').length`), 1);
evaluate(`checkYouYangsInvitation()`);
assert.equal(evaluate(`state.notifications.filter(n=>n.id==='you_yangs_invite').length`), 1);

evaluate(`let y=youYangsState();y.entered=true;y.tiers={standingKilometre:'bronze',highSpeed:'bronze',acceleration:'entrant'};yyUpdateTitle()`);
assert.equal(evaluate(`youYangsState().overallTitle`), 'Proving Ground Contender');
evaluate(`youYangsState().tiers={standingKilometre:'silver',highSpeed:'silver',acceleration:'bronze'};yyUpdateTitle()`);
assert.equal(evaluate(`youYangsState().overallTitle`), 'Proving Ground Specialist');
evaluate(`youYangsState().tiers={standingKilometre:'gold',highSpeed:'gold',acceleration:'silver'};yyUpdateTitle()`);
assert.equal(evaluate(`youYangsState().overallTitle`), 'You Yangs Elite');
evaluate(`youYangsState().tiers={standingKilometre:'gold',highSpeed:'gold',acceleration:'bronze'};yyUpdateTitle()`);
assert.equal(evaluate(`youYangsState().overallTitle`), 'Proving Ground Specialist');

evaluate(`(()=>{state=freshState();let c=makeOwned(CARS.find(x=>x.id==='is200'),'manual','manual');state.owned=[c];state.car=c;state.activeCarId=c.uid;let eventState=youYangsState();eventState.invited=true;eventState.entered=true;eventState.entryCarId=c.uid;yyStartRun('highSpeed')})()`);
assert.equal(evaluate(`yyRun.speed`), 60);
assert.equal(evaluate(`yyRun.distance`), 0);
assert.equal(evaluate(`yyRun.elapsed`), 0);
assert.equal(evaluate(`yyRun.ready`), true);
assert.ok(evaluate(`yyRun.gear >= 1`));
assert.ok(evaluate(`yyRun.rpm > 0`));

evaluate(`handleYouYangsInput()`);
assert.equal(evaluate(`yyRun.ready`), false);
assert.equal(evaluate(`yyRun.started`), true);
assert.equal(evaluate(`yyRun.gear`), evaluate(`yyStartingGear(yyRun.car,60)`));

evaluate(`yyRun.lastTs=0;for(let i=1;i<=20;i++)yyTick(i*50)`);
assert.ok(Math.abs(evaluate(`yyRun.elapsed`) - 1) < 0.0001);
assert.ok(evaluate(`yyRun.distance`) >= 16.6, '60 km/h rolling start should cover at least about 16.7 m in one second');
assert.ok(evaluate(`yyRun.distance`) < 30, 'one simulated second should not produce an implausible distance jump');

assert.match(evaluate(`yyTick.toString()`), /Math\.min\(\.05/);
assert.match(evaluate(`yyTick.toString()`), /r\.distance\+=r\.speed\/3\.6\*dt/);
assert.match(evaluate(`renderYouYangsDashboard.toString()`), /AUTOMATIC D/);

evaluate(`globalThis.runHighSpeedTest=(stepMs,carId='aufalconxr6',trans='auto',mode='D')=>{state=freshState();let c=makeOwned(CARS.find(x=>x.id===carId),trans,mode);state.owned=[c];state.car=c;state.activeCarId=c.uid;let eventState=youYangsState();eventState.invited=true;eventState.entered=true;eventState.entryCarId=c.uid;yyStartRun('highSpeed');handleYouYangsInput();yyRun.lastTs=0;let ts=0,guard=0;while(yyRun&&guard++<10000){ts+=stepMs;yyTick(ts)}return {result:youYangsState().lastResult,best:youYangsState().best.highSpeed,attempts:youYangsState().attempts.highSpeed}}`);

const frameRuns = [16, 33, 50].map(step => evaluate(`runHighSpeedTest(${step})`));
for (const run of frameRuns) {
  assert.ok(run.result, 'high-speed simulation should finish');
  assert.ok(run.result.elapsed > 20 && run.result.elapsed <= 90);
  assert.ok(run.result.distance >= 2990, 'high-speed run should reach approximately 3000 m');
  assert.ok(run.result.finishSpeed >= 60);
  assert.ok(run.result.peakSpeed >= run.result.finishSpeed - 0.01);
  assert.equal(run.attempts, 1);
  assert.ok(run.best && run.best.speed3000 >= 60);
}
const elapsedSpread = Math.max(...frameRuns.map(x => x.result.elapsed)) - Math.min(...frameRuns.map(x => x.result.elapsed));
const speedSpread = Math.max(...frameRuns.map(x => x.result.finishSpeed)) - Math.min(...frameRuns.map(x => x.result.finishSpeed));
assert.ok(elapsedSpread < 0.2, `frame-rate elapsed spread too large: ${elapsedSpread}`);
assert.ok(speedSpread < 1, `frame-rate speed spread too large: ${speedSpread}`);
assert.equal(evaluate(`Object.keys(youYangsState().carRecords).length`), 1);
assert.equal(evaluate(`Object.values(youYangsState().carRecords)[0].runs`), 1);
assert.ok(evaluate(`Object.values(youYangsState().carRecords)[0].best.highSpeed.peakSpeed`) > 60);
assert.match(evaluate(`yyArchiveTable()`), /Ford Falcon AU XR6/);
assert.match(evaluate(`yyArchiveTable()`), /Owned/);
evaluate(`state.owned=[];state.car=null;state.activeCarId=null`);
assert.match(evaluate(`yyArchiveTable()`), /Former car/);
assert.match(evaluate(`yyArchiveTable()`), /Ford Falcon AU XR6/);
evaluate(`(()=>{let y=youYangsState();y.invited=true;y.entered=false;y.visits=1;y.nextEligibleDay=state.day+7})()`);
assert.match(evaluate(`youYangs()`), /Proving Ground Archive/);
assert.match(evaluate(`youYangs()`), /Former car/);

evaluate(`(()=>{state=freshState();let savedEvent=youYangsState();savedEvent.best.highSpeed={peakSpeed:300};normaliseState()})()`);
assert.equal(evaluate(`hasBadge('proving_ground_160')&&hasBadge('proving_ground_200')&&hasBadge('proving_ground_250')&&hasBadge('proving_ground_300')`), true);
assert.equal(evaluate(`hasBadge('proving_ground_350')`), false);

assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.challenges.standingKilometre.attempts`), 2);
assert.equal(evaluate(`SPECIAL_EVENTS.youYangs.cooldownDays`), 7);
evaluate(`(()=>{state=freshState();state.money=10000;state.day=4;let c=makeOwned(CARS.find(x=>x.id==='aufalconxr6'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;let eventState=youYangsState();eventState.invited=true;eventState.entryCarId=c.uid;render=()=>{};yyPayEntry()})()`);
assert.equal(evaluate(`youYangsState().entered`), true);
assert.equal(evaluate(`youYangsState().nextEligibleDay`), 11);
assert.equal(evaluate(`youYangsState().attempts.highSpeed`), 2);
assert.equal(evaluate(`state.money`), 8000);
evaluate(`yyConcludeSession(false)`);
assert.equal(evaluate(`youYangsState().entered`), false);
assert.equal(evaluate(`youYangsState().entryCarId`), null);
assert.equal(evaluate(`yyCanEnter()`), false);
evaluate(`state.day=11`);
assert.equal(evaluate(`yyCanEnter()`), true);

const lowRedlineTach = evaluate(`yyTachSvg(CARS.find(c=>c.id==='territoryturbo'),3000)`);
const highRedlineTach = evaluate(`yyTachSvg(CARS.find(c=>c.id==='rx8'),7000)`);
assert.match(lowRedlineTach, /Redline 6,000 RPM/);
assert.match(highRedlineTach, /Redline 9,000 RPM/);
assert.notEqual(lowRedlineTach, highRedlineTach);
assert.match(evaluate(`yyTachSvg.toString()`), /large=Math\.abs\(a2-a1\)>180\?1:0/);

evaluate(`(()=>{state=freshState();let c=makeOwned(CARS.find(x=>x.id==='aufalconxr6'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;let eventState=youYangsState();eventState.invited=true;eventState.entered=true;eventState.entryCarId=c.uid;yyStartRun('highSpeed');handleYouYangsInput();yyRun.lastTs=0;for(let i=1;i<=600&&yyRun;i++)yyTick(i*50)})()`);
assert.ok(evaluate(`yyRun===null||yyRun.shiftEvents.some(x=>x.automatic)`), 'Automatic D should perform automatic shifts');

evaluate(`state=freshState();let yState=youYangsState();yState.entered=true;yState.best.highSpeed={peakSpeed:250};yState.tiers.highSpeed='silver'`);
evaluate(`yyRun={challenge:'highSpeed',car:{uid:'weaker'},elapsed:50,distance:3000,peakSpeed:220,speed:220,gear:4,peakG:.2,accelG:0,milestones:{},distanceSpeeds:{3000:{time:50,speed:220}},shiftEvents:[],finished:false,raf:null};yyFinishRun()`);
assert.equal(evaluate(`youYangsState().best.highSpeed.peakSpeed`), 250, 'a weaker later run must not overwrite the stronger best result');

console.log('Quarter Mile Builder You Yangs checks passed.');
