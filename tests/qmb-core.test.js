const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const definitions = script.slice(0, script.indexOf('refreshListings();loadGame(false);render();'));
const storage = new Map();
const context = vm.createContext({
  console,
  Math,
  Date,
  JSON,
  URL,
  URLSearchParams,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  performance: {now: () => 0},
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  document: {addEventListener: () => {}, getElementById: () => null},
  window: {addEventListener: () => {}},
  location: {search: '', origin: 'http://localhost', pathname: '/'},
  history: {replaceState: () => {}}
});
vm.runInContext(definitions, context);

const evaluate = source => vm.runInContext(source, context);

assert.equal(evaluate(`classifyRecordedShift({diff:-651,rpm:5000}).type`), 'early');
assert.equal(evaluate(`classifyRecordedShift({diff:501,rpm:7000}).type`), 'late');
assert.equal(evaluate(`classifyRecordedShift({diff:219,rpm:6200}).type`), 'sharp');
assert.equal(evaluate(`classifyRecordedShift({diff:300,rpm:6500}).type`), 'good');

const manualReport = evaluate(`shiftingReportForRun({
  playerCar:{trans:'manual',shiftMode:'manual',red:7000,peak:5800,shiftBuffer:250,manualMax:[55,95,140]},
  shiftEvents:[{fromGear:1,gear:2,rpm:5000,diff:-900},{fromGear:2,gear:3,rpm:6900,diff:750},{type:'doubleTap',gear:3}],
  limiterTime:.4,
  gear:3
}, 6200)`);
assert.match(manualReport.lines.join(' '), /Early by 900 rpm/);
assert.match(manualReport.lines.join(' '), /Late by 750 rpm/);
assert.match(manualReport.lines.join(' '), /Double-tap error/);
assert.match(manualReport.lines.join(' '), /Limiter: 0.40 seconds/);

const noShiftReport = evaluate(`shiftingReportForRun({
  playerCar:{trans:'manual',shiftMode:'manual',red:7000,peak:5800,shiftBuffer:250,manualMax:[90,150]},
  shiftEvents:[],limiterTime:0,gear:1
}, 5200)`);
assert.match(noShiftReport.lines[0], /No upshift was required/);
assert.doesNotMatch(noShiftReport.lines.join(' '), /missed/i);

const missedShiftReport = evaluate(`shiftingReportForRun({
  playerCar:{trans:'manual',shiftMode:'manual',red:7000,peak:5800,shiftBuffer:250,manualMax:[55,95]},
  shiftEvents:[],limiterTime:0,gear:1
}, 6800)`);
assert.match(missedShiftReport.lines.join(' '), /Necessary upshift was missed/);

const autoReport = evaluate(`shiftingReportForRun({
  playerCar:{trans:'auto',shiftMode:'D',red:6500,peak:5200,shiftBuffer:250,autoMax:[60,110],reliability:60,issueNames:['Old auto fluid']},
  shiftEvents:[{fromGear:1,gear:2,rpm:5580,diff:30,automatic:true}],limiterTime:0,gear:2
}, 5000)`);
assert.equal(autoReport.title, 'Automatic D shifting');
assert.match(autoReport.lines.join(' '), /shifted consistently near the useful power band/);
assert.match(autoReport.lines.join(' '), /Transmission condition/);

assert.match(evaluate(`personalBestText(null,14.2)`), /First recorded pass/);
assert.match(evaluate(`personalBestText(14.2,13.95)`), /New personal best/);
assert.match(evaluate(`personalBestText(14.2,14.45)`), /0.25s slower/);

evaluate(`state=freshState();normaliseState()`);
assert.equal(evaluate(`state.notifications.length`), 1);
assert.equal(evaluate(`state.notifications[0].id`), 'guidance_welcome');
evaluate(`normaliseState()`);
assert.equal(evaluate(`state.notifications.length`), 1);

evaluate(`state={...freshState(),day:4,log:[{msg:'legacy progress'}]};delete state.guidance;delete state.notifications;normaliseState()`);
assert.equal(evaluate(`state.notifications.length`), 0);
assert.equal(evaluate(`state.guidance.created.firstRace`), true);

const spectatorQueue = evaluate(`(() => {
  state={...freshState(),money:1000,respect:0,car:{name:'Test car'}};
  state.lastEvent={kind:'spectate',queueIndex:0,watchesLeft:2,lineup:[{type:'npc',aIdx:0,bIdx:1,done:false}],opponents:[{name:'Car A',type:'Street',drive:'RWD',visible:'street tyres'},{name:'Car B',type:'Street',drive:'FWD',visible:'street tyres'}]};
  return nextLineupPanel(state.lastEvent);
})()`);
assert.doesNotMatch(spectatorQueue, /Go to My Race/);
assert.match(spectatorQueue, /Skip simulation/);

const playerQueue = evaluate(`(() => {
  state={...freshState(),money:1000,respect:0,car:{name:'Test car'}};
  state.lastEvent={kind:'race',queueIndex:0,watchesLeft:2,lineup:[{type:'npc',aIdx:0,bIdx:1,done:false},{type:'player',opponentIndex:0,done:false}],opponents:[{name:'Car A',type:'Street',drive:'RWD',visible:'street tyres'},{name:'Car B',type:'Street',drive:'FWD',visible:'street tyres'}]};
  return nextLineupPanel(state.lastEvent);
})()`);
assert.match(playerQueue, /Go to My Race/);
assert.match(playerQueue, /Watch All Before Mine/);

console.log('Quarter Mile Builder core regression checks passed.');
