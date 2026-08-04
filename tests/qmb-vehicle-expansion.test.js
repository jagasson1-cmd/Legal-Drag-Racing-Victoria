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

const rolloutIds = [
  'aufalconxr6','effalconxr6','bafairmontv8','vncommodorev6','vscommodoresho','vtcommodoresho','vesv6',
  'vlturbo','toranaslr5000','chargere49','xyfalcongt','starletgt','mr2sw20t','chaserjzx100','r33gtst',
  'r34gtt','nissan350z','evo8','rx8','bmw335i','bmw130i','audis3_8p','meganers250','volvos60t5',
  'golfrmk6','audirs4b7','territoryturbo','adventrav8'
];
const manualOnly = ['chargere49','meganers250','audirs4b7'];
const automaticOnly = ['bafairmontv8','territoryturbo','adventrav8'];
const autoRolloutIds = rolloutIds.filter(id => !manualOnly.includes(id));
const requiredFields = ['id','name','cat','type','price','weight','power','torque','drive','aero','manual','auto','gears','red','peak','band','asp','baseGrip','upgradeMult','reliability','engine','disp'];

assert.equal(evaluate('CARS.length'), 54);
assert.equal(evaluate('new Set(CARS.map(c=>c.id)).size'), 54);
assert.deepEqual(Array.from(evaluate(`CARS.filter(c=>${JSON.stringify(rolloutIds)}.includes(c.id)).map(c=>c.id)`)), rolloutIds);

for (const id of rolloutIds) {
  const car = evaluate(`CARS.find(c=>c.id==='${id}')`);
  assert.ok(car, `missing CARS entry for ${id}`);
  for (const field of requiredFields) assert.ok(Object.hasOwn(car, field), `${id} missing ${field}`);
  for (const field of ['price','weight','power','torque','disp']) assert.ok(car[field] > 0, `${id} has invalid ${field}`);
  assert.equal(typeof car.manual, 'boolean');
  assert.equal(typeof car.auto, 'boolean');
  assert.ok(car.manual || car.auto);
  assert.equal(car.band.length, 2);
  assert.ok(car.band[0] < car.band[1] && car.band[1] <= car.red);
  assert.ok(car.peak <= car.red);
  assert.ok(['NA','turbo'].includes(car.asp));
}

assert.equal(evaluate(`CARS.find(c=>c.id==='toranaslr5000').price`), 90000);
assert.equal(evaluate(`CARS.find(c=>c.id==='xyfalcongt').price`), 105000);
assert.equal(evaluate(`CARS.find(c=>c.id==='chargere49').price`), 115000);
assert.equal(evaluate(`CARS.find(c=>c.id==='r34gtt').price`), 32000);
assert.equal(evaluate(`CARS.filter(c=>${JSON.stringify(rolloutIds)}.includes(c.id)&&c.price<34000).length`), 23);
assert.deepEqual(
  Array.from(evaluate(`CARS.filter(c=>${JSON.stringify(rolloutIds)}.includes(c.id)&&c.price>=34000).map(c=>c.id)`)),
  ['vlturbo','toranaslr5000','chargere49','xyfalcongt','audirs4b7']
);
assert.ok(evaluate(`new Set(CARS.map(c=>c.cat)).has('Australian Classics')`));

const manualGearCounts = {
  aufalconxr6:5,effalconxr6:5,vncommodorev6:5,vscommodoresho:5,vtcommodoresho:6,vesv6:6,
  vlturbo:5,toranaslr5000:4,chargere49:4,xyfalcongt:4,starletgt:5,mr2sw20t:5,
  chaserjzx100:5,r33gtst:5,r34gtt:5,nissan350z:6,evo8:6,rx8:6,bmw335i:6,bmw130i:6,
  audis3_8p:6,meganers250:6,volvos60t5:5,golfrmk6:6,audirs4b7:6
};
const autoGearCounts = {
  aufalconxr6:4,effalconxr6:4,bafairmontv8:4,vncommodorev6:4,vscommodoresho:4,vtcommodoresho:4,
  vesv6:6,vlturbo:4,toranaslr5000:3,xyfalcongt:3,starletgt:4,mr2sw20t:4,chaserjzx100:4,
  r33gtst:4,r34gtt:4,nissan350z:5,evo8:5,rx8:6,bmw335i:6,bmw130i:6,audis3_8p:6,
  volvos60t5:5,golfrmk6:6,territoryturbo:6,adventrav8:4
};

for (const id of rolloutIds) {
  const car = evaluate(`CARS.find(c=>c.id==='${id}')`);
  const tech = evaluate(`TECH_DATA['${id}']`);
  assert.ok(tech, `missing TECH_DATA entry for ${id}`);
  assert.ok(tech.tyreDia > 0 && tech.shiftBuffer > 0);
  assert.equal(Object.hasOwn(tech, 'manualMax'), car.manual);
  assert.equal(Object.hasOwn(tech, 'autoMax'), car.auto);
  if (car.manual) {
    assert.equal(tech.manualMax.length, manualGearCounts[id]);
    assert.ok(tech.manualMax.every((v, i, a) => i === 0 || v > a[i - 1]));
  }
  if (car.auto) {
    assert.equal(tech.autoMax.length, autoGearCounts[id]);
    assert.ok(tech.autoMax.every((v, i, a) => i === 0 || v > a[i - 1]));
  }
}

assert.equal(evaluate(`Object.keys(STALL_RPM).filter(id=>${JSON.stringify(rolloutIds)}.includes(id)).length`), 25);
for (const id of autoRolloutIds) assert.ok(evaluate(`Number.isFinite(STALL_RPM['${id}'])&&STALL_RPM['${id}']>=1700&&STALL_RPM['${id}']<=3000`));
for (const id of manualOnly) assert.equal(evaluate(`Object.hasOwn(STALL_RPM,'${id}')`), false);
for (const id of manualOnly) assert.equal(evaluate(`rollListingTrans(CARS.find(c=>c.id==='${id}'))`), 'manual');
for (const id of automaticOnly) assert.equal(evaluate(`rollListingTrans(CARS.find(c=>c.id==='${id}'))`), 'auto');
assert.ok(['manual','auto'].includes(evaluate(`rollListingTrans(CARS.find(c=>c.id==='aufalconxr6'))`)));

assert.equal(evaluate(`diffInfo(CARS.find(c=>c.id==='evo8')).type`), 'awd');
assert.equal(evaluate(`diffInfo(CARS.find(c=>c.id==='territoryturbo')).type`), 'awd');
assert.equal(evaluate(`diffInfo(CARS.find(c=>c.id==='adventrav8')).type`), 'awd');
assert.equal(evaluate(`diffInfo(CARS.find(c=>c.id==='chargere49')).type`), 'open');

evaluate(`render=()=>{};state=freshState();state.money=200000;state.listings=[{id:'buy_auto',carId:'bafairmontv8',trans:'manual',issues:[],price:11500,inspected:false}];buyCar('buy_auto')`);
assert.equal(evaluate('state.car.trans'), 'auto');
assert.equal(evaluate('state.car.autoMax.length'), 4);
evaluate(`state=freshState();state.money=200000;state.listings=[{id:'buy_manual',carId:'chargere49',trans:'auto',issues:[],price:115000,inspected:false}];buyCar('buy_manual')`);
assert.equal(evaluate('state.car.trans'), 'manual');
assert.equal(evaluate('state.car.manualMax.length'), 4);

evaluate(`state={...freshState(),car:{id:'corolla',name:'Toyota Corolla',trans:'auto',shiftMode:'D',power:125,weight:1120,grip:.82,reliability:88,mods:[],installed:[],issueNames:[]},owned:[]};state.owned=[state.car];normaliseState()`);
assert.equal(evaluate('state.car.id'), 'corolla');

const sourceSections = {
  cars: script.slice(script.indexOf('const CARS=['), script.indexOf('const TECH_DATA=')),
  tech: script.slice(script.indexOf('const TECH_DATA='), script.indexOf('const STALL_RPM=')),
  stall: script.slice(script.indexOf('const STALL_RPM='), script.indexOf('CARS.forEach'))
};
const duplicateKeys = (text, pattern) => {
  const keys = Array.from(text.matchAll(pattern), match => match[1] || match[2] || match[3]);
  return keys.filter((key, index) => keys.indexOf(key) !== index);
};
assert.deepEqual(duplicateKeys(sourceSections.cars, /"id"\s*:\s*"([^"]+)"/g), []);
assert.deepEqual(duplicateKeys(sourceSections.tech, /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_]+))\s*:/gm), []);
assert.deepEqual(duplicateKeys(sourceSections.stall, /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_]+))\s*:/gm), []);

const sanityCars = [
  ['aufalconxr6','manual','manual'],['toranaslr5000','manual','manual'],['chargere49','manual','manual'],
  ['xyfalcongt','manual','manual'],['evo8','manual','manual'],['rx8','manual','manual'],
  ['audirs4b7','manual','manual'],['territoryturbo','auto','D']
];
const sanityResults = {};
for (const [id, trans, mode] of sanityCars) {
  const runs = evaluate(`(() => {const c=makeOwned(CARS.find(x=>x.id==='${id}'),'${trans}','${mode}');return Array.from({length:80},()=>simulate(c,null,true).et)})()`);
  const average = runs.reduce((sum, et) => sum + et, 0) / runs.length;
  sanityResults[id] = Number(average.toFixed(2));
  assert.ok(runs.every(et => Number.isFinite(et) && et > 9 && et < 20), `${id} produced an implausible ET`);
}
assert.ok(sanityResults.territoryturbo > sanityResults.evo8, 'heavy Territory should remain slower than Evo VIII');
assert.ok(sanityResults.toranaslr5000 > sanityResults.audirs4b7, 'collector price must not make the Torana faster than the RS4');

console.log('Quarter Mile Builder 28-car expansion checks passed.');
console.log('Stock ET averages:', JSON.stringify(sanityResults));
