const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');
const { readInput } = require('./helpers/golden-cases');

// Driver and display names are rendered as text, never as markup. Every render path that shows an opponent's driver
// name or a player's display name is rendered twice in identical seeded sandboxes: once with a hostile name and once
// with a plain placeholder. Replacing the escaped hostile text with the placeholder must give byte-identical HTML,
// which proves the hostile string adds no elements, attributes or event handlers and appears only as escaped text.
const PLACEHOLDER = 'Placeholdername';
const HOSTILE = [
  '<img src=x onerror="window.__xss=1">',
  '"><script>window.__xss=2</script>',
  "' onmouseover='window.__xss=3' data-x='",
  'Tom & Jerry\'s "Garage" <b>bold</b>',
  '</p><svg onload=window.__xss=4><p>',
  'javascript:window.__xss=5',
  '&lt;b&gt;already escaped&lt;/b&gt; &amp;',
  '<a href="javascript:window.__xss=6">click</a>`${1+1}`'
];

// Render every audited path with one name as both the opponents' driver and the player's display name.
function renderAll(name) {
  const ctx = makeGameContext({ seed: 5, storage: { qmb_mvp_save: readInput('v2-garage') } });
  ctx.evaluate('refreshListings();loadGame(false);render()');
  ctx.evaluate(`(()=>{let e=eventById('heathcote_legal');for(let i=0;i<30&&daysUntil(e)!==0;i++)state.day++;travelToEvent('heathcote_legal');finishTravel();confirmArrival('race')})()`);
  ctx.evaluate(`state.lastEvent.opponents.forEach(o=>o.driver=${JSON.stringify(name)})`);
  const out = {};
  const get = id => ctx.element(id).innerHTML;
  // Race-slot (call-up) card: opponentBrief.
  out.raceSlotCard = ctx.evaluate('raceSlotCard(state.lastEvent.raceSlots[0])');
  // Pairing card for the next NPC race in the queue: opponentBrief for both cars.
  ctx.evaluate('chooseRoundOpponent(state.lastEvent.raceSlots[0])');
  ctx.evaluate("(()=>{const e=state.lastEvent;e.queueIndex=e.lineup.findIndex(x=>x.type==='npc')})()");
  out.pairingCard = ctx.evaluate('nextLineupPanel(state.lastEvent)');
  // Betting card: opponentBrief for both cars, written into #screen.
  ctx.evaluate('state.respect=Math.max(state.respect,10);state.money=Math.max(state.money,500);state.lastEvent.watchesLeft=Math.max(1,state.lastEvent.watchesLeft);betNextLineupRace()');
  out.bettingCard = get('screen');
  // Spectator lanes and timing board: svLaneMeta (already escaped).
  out.spectatorLanes = ctx.evaluate("(()=>{const e=state.lastEvent;return svLane('A',e.opponents[0],null)+svLane('B',e.opponents[1],null)})()");
  out.spectatorBoard = ctx.evaluate("(()=>{const e=state.lastEvent,a=e.opponents[0],b=e.opponents[1];return svBoardMarkup(a,b,{et:13.2,trap:160},{et:13.6,trap:155},a,'Left lane takes it',null)})()");
  // Race Night live race (opponent meta, already escaped) and the timing slip (driver cell, already escaped).
  ctx.evaluate("(()=>{const e=state.lastEvent;e.queueIndex=e.lineup.findIndex(x=>x.type==='player');goToMyRace();startLiveRace(currentLineupEntry().opponentIndex)})()");
  out.raceNight = get('screen');
  out.timingSlip = ctx.evaluate("raceNightSlip({et:13.1,trap:150,rt:.5},{et:13.4,trap:148,rt:.6},true,{result:'WIN',opponent:liveRun.rivalCar.name},'Summary')");
  // Leaderboards, rival cards, the Social Garage screen and the side panel: player display names (already escaped).
  const row = { display_name: name, money: 1000, best_et: 13.2, car_name: 'Holden Commodore', power: 200, respect: 10, wins: 2, mods_count: 1, mods_summary: ['Intake'], day: 3, updated_at: '2026-01-01T00:00:00Z' };
  ctx.evaluate(`socialData={profile:{displayName:${JSON.stringify(name)},friendCode:'ABC123'},friends:[${JSON.stringify(row)}],leaderboards:{friends:[${JSON.stringify(row)}],global:[${JSON.stringify(row)}]},invite:{code:'INV1'},save:null}`);
  out.leaderboard = ctx.evaluate("leaderboardRows(socialData.leaderboards.global,'global')");
  out.rivalCards = ctx.evaluate('rivalCards(socialData.friends)');
  out.socialScreen = ctx.evaluate('social()');
  ctx.evaluate('renderSocialPanel()');
  out.socialPanel = get('socialPanel');
  return { out, esc: s => ctx.evaluate(`esc(${JSON.stringify(s)})`), ctx };
}

const plain = renderAll(PLACEHOLDER);
for (const [path, html] of Object.entries(plain.out)) assert.ok(html.includes(PLACEHOLDER), `${path}: the name is rendered on this path`);

for (const hostile of HOSTILE) {
  const { out, esc } = renderAll(hostile);
  const escaped = esc(hostile);
  for (const [path, html] of Object.entries(out)) {
    assert.ok(html.includes(escaped), `${path}: ${JSON.stringify(hostile)} appears as escaped text`);
    if (escaped !== hostile) assert.ok(!html.includes(hostile), `${path}: ${JSON.stringify(hostile)} never appears unescaped`);
    assert.equal(html.split(escaped).join(PLACEHOLDER), plain.out[path], `${path}: ${JSON.stringify(hostile)} changes no markup; only escaped text differs`);
  }
}

// esc() is applied exactly once on every path: an ampersand is escaped once, never twice.
{
  const { out } = renderAll('Tom & Jerry');
  for (const [path, html] of Object.entries(out)) {
    assert.ok(html.includes('Tom &amp; Jerry'), `${path}: escaped once`);
    assert.ok(!html.includes('&amp;amp;'), `${path}: not double-escaped`);
  }
}

// Curated NPC names contain nothing esc() changes, so they render exactly as before.
{
  const ctx = makeGameContext({ seed: 1 });
  const unchanged = ctx.evaluate('[...NPC_GIVEN_NAMES,...NPC_NICKNAMES].every(n=>esc(n)===n)');
  assert.equal(unchanged, true, 'every curated NPC name is unchanged by escaping');
  assert.equal(ctx.evaluate("opponentBrief({driver:'Kosta',name:'Holden Commodore',type:'Family Sedan',drive:'RWD'})"), 'Kosta - Holden Commodore / Family Sedan / RWD', 'opponentBrief output for a curated name is unchanged');
}
console.log('Quarter Mile Builder name escaping checks passed.');
