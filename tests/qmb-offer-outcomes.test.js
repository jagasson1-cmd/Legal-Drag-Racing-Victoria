const assert = require('node:assert/strict');
const { makeGameContext } = require('./helpers/game-context');

// Trading Post offer outcomes: a consequential result stays visible until the player acknowledges it. Rejected counters,
// accepted counters, declines and sales are recorded as type 'market' entries in the existing notifications list; the
// offers, money, ownership, accounting and random draws behave exactly as before.

const json = (box, expr) => JSON.parse(box.evaluate(`JSON.stringify(${expr})`));
// A game with one listed car and one buyer offer for it. force: 'accept' or 'reject' fixes the counter roll.
function withOffer({ seed = 4, recording = true } = {}) {
  const box = makeGameContext({ seed });
  box.evaluate(`refreshListings();loadGame(false);(()=>{state.money=20000;state.respect=12;let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;state.garageCapacity=2;
    listCarForSale('fair');state.marketOffers=[];})()`);
  if (!recording) box.evaluate('recordMarketOutcome=()=>null;settleCounterNote=()=>{}');
  box.evaluate(`(()=>{let o=null;for(let i=0;i<50&&!o;i++)o=makeMarketOffer('classified',100);globalThis.__offer=o})()`);
  assert.ok(box.evaluate('!!__offer'), 'an offer was made');
  return box;
}
// Fix the next counter roll without touching the sandbox's seeded generator for anything else.
const counterWith = (box, roll) => box.evaluate(`(()=>{const r=Math.random;Math.random=()=>${roll};try{counterCarOffer(__offer.id)}finally{Math.random=r}})()`);
const notes = box => json(box, "(state.notifications||[]).filter(n=>n.type==='market')");
const savedNotes = box => (JSON.parse(box.storage.get('qmb_mvp_save')).notifications || []).filter(n => n.type === 'market');
const sellTab = box => box.evaluate("show('market');document.getElementById('screen').innerHTML");
// The market notice on the persistent toast, if any (a new game also has its own welcome and briefing notices).
const toast = box => json(box, "(state.notifications||[]).filter(n=>n.type==='market').includes(pendingGuidanceNotification())?pendingGuidanceNotification():(()=>{let saved=(state.notifications||[]).filter(n=>n.type!=='market'&&!n.dismissed);saved.forEach(n=>n.dismissed=true);let t=pendingGuidanceNotification();saved.forEach(n=>n.dismissed=false);return t&&t.type==='market'?t:null})()");

// ---------- Rejected counter: visible until acknowledged, survives reload, toast elsewhere ----------
{
  const box = withOffer();
  const offer = json(box, '__offer'), target = Math.round(offer.amount * 1.10 / 50) * 50;
  counterWith(box, 0.999);
  assert.equal(json(box, "state.marketOffers.find(o=>o.id===__offer.id).closed"), true, 'the offer is closed as before');
  const n = notes(box);
  assert.equal(n.length, 1);
  assert.equal(n[0].outcome, 'walked');
  assert.equal(n[0].title, 'Buyer walked away');
  assert.ok(n[0].message.includes(offer.buyer) && n[0].message.includes(box.evaluate(`fmt(${target})`)), 'names the buyer and the counter amount');
  assert.deepEqual(savedNotes(box).map(x => x.outcome), ['walked'], 'saved straight away');
  const html = sellTab(box);
  assert.match(html, /Buyer walked away/, 'shown on the Sell tab after the offer disappears');
  assert.match(html, /dismissMarketOutcome\('market_[^']+_walked'\)">Got it/, 'with a Got it control');
  assert.equal(toast(box), null, 'no duplicate toast while on the Sell tab');
  box.evaluate("show('garage')");
  assert.equal(toast(box).outcome, 'walked', 'the persistent toast carries it on other screens');
  // Reload: still there.
  const again = makeGameContext({ seed: 9, storage: { qmb_mvp_save: box.storage.get('qmb_mvp_save') } });
  again.evaluate('refreshListings();loadGame(false);render()');
  assert.match(sellTab(again), /Buyer walked away/, 'survives a reload');
  // Acknowledge.
  again.evaluate(`dismissMarketOutcome(${JSON.stringify(n[0].id)})`);
  assert.doesNotMatch(sellTab(again), /Buyer walked away/, 'gone once acknowledged');
  again.evaluate("show('garage')");
  assert.equal(toast(again), null, 'and gone from the toast');
  assert.equal(savedNotes(again)[0].dismissed, true, 'acknowledgement is saved');
}

// ---------- Accepted counter: shown inline while the offer is open; accepting sells and confirms ----------
{
  const box = withOffer();
  const target = Math.round(json(box, '__offer').amount * 1.10 / 50) * 50;
  counterWith(box, 0);
  assert.equal(json(box, "state.marketOffers.find(o=>o.id===__offer.id).amount"), target, 'the offer rises by the counter, as before');
  assert.match(sellTab(box), /Counter accepted\.<\/b>[^<]*will now pay/, 'the new amount is called out next to the offer');
  box.evaluate("show('garage')");
  assert.equal(toast(box), null, 'an accepted counter is not a toast');
  const money = box.evaluate('state.money');
  box.evaluate('acceptCarOffer(__offer.id)');
  assert.equal(box.evaluate('state.money'), money + target, 'sold for the countered amount');
  assert.equal(box.evaluate('state.owned.length'), 0, 'the car is gone');
  const n = notes(box);
  assert.equal(n.find(x => x.outcome === 'countered').dismissed, true, 'the counter note is settled by the sale');
  const sold = n.find(x => x.outcome === 'sold');
  assert.ok(sold && !sold.dismissed && sold.title === 'Car sold', 'the sale is recorded');
  assert.equal(box.evaluate('state.screen'), 'garage', 'still lands in the Shed');
  assert.equal(toast(box).outcome, 'sold', 'and the Shed shows it until acknowledged');
  // Opening the toast only navigates: the sale is still unacknowledged, and its card is on the Sell tab even though the
  // car is gone and no car is left to select.
  box.evaluate('openPendingNotification()');
  assert.equal(notes(box).find(x => x.outcome === 'sold').dismissed, false, 'opening the toast does not acknowledge it');
  assert.equal(box.evaluate("state.screen==='classifieds'&&tradingPostTab==='sell'"), true, 'it opens the Sell tab');
  const html = box.element('screen').innerHTML;
  assert.match(html, /<h2>Sell a car<\/h2><div class="grid marketOutcomes">.*Car sold\./s, 'the sale card is at the top of the Sell tab');
  assert.match(html, /Buy a car first\./, 'alongside the no-car message');
  const soldId = notes(box).find(x => x.outcome === 'sold').id;
  box.evaluate("show('garage')");
  assert.equal(toast(box).outcome, 'sold', 'navigating away leaves it on the toast');
  box.evaluate(`show('market');dismissMarketOutcome(${JSON.stringify(soldId)})`);
  assert.equal(notes(box).find(x => x.outcome === 'sold').dismissed, true, 'Got it acknowledges it');
  assert.doesNotMatch(box.element('screen').innerHTML, /Car sold\./, 'and the card is gone');
  box.evaluate("show('garage')");
  assert.equal(toast(box), null, 'and so is the toast');
}
{
  // With another car still in the Shed (and selected), a sale card shows at the top of the Sell tab regardless; a
  // walk-away for the car that was later sold moves there too, instead of vanishing with the car.
  const box = withOffer();
  box.evaluate(`(()=>{let other=makeOwned(CARS[0],'auto','D');state.owned.push(other);globalThis.__other=other.uid})()`);
  counterWith(box, 0.999);
  box.evaluate(`(()=>{let o=null;for(let i=0;i<50&&!o;i++)o=makeMarketOffer('classified',100);globalThis.__offer=o})()`);
  box.evaluate('acceptCarOffer(__offer.id)');
  assert.equal(box.evaluate('state.owned.length'), 1, 'one car sold, one left');
  box.evaluate("selectSaleVehicle(__other);show('market')");
  const html = box.element('screen').innerHTML;
  const top = html.slice(0, html.indexOf('saleVehicleSelect'));
  assert.match(top, /Car sold\./, 'the sale card is above the vehicle selector');
  assert.match(top, /Buyer walked away/, 'the earlier walk-away for the sold car is there too');
  box.evaluate('openPendingNotification()');
  assert.ok(notes(box).filter(x => x.outcome === 'sold' || x.outcome === 'walked').every(x => !x.dismissed), 'opening the toast acknowledged nothing');
}

// ---------- Decline: a light inline line, not a toast ----------
{
  const box = withOffer();
  box.evaluate('declineCarOffer(__offer.id)');
  const n = notes(box);
  assert.deepEqual(n.map(x => [x.outcome, x.dismissed]), [['declined', false]]);
  const html = box.element('screen').innerHTML;
  assert.match(html, /marketOutcomeLine[^>]*><span><b>Offer declined\.<\/b>/, 'single-line card on the Sell tab');
  assert.match(html, /Got it/);
  box.evaluate("show('garage')");
  assert.equal(toast(box), null, 'a decline is not pushed as a toast');
}

// ---------- A Race Night sale completed after the event is confirmed ----------
{
  const box = makeGameContext({ seed: 6 });
  box.evaluate(`refreshListings();loadGame(false);(()=>{state.money=40000;state.respect=12;let c=makeOwned(CARS.find(x=>x.id==='is200'),'auto','D');state.owned=[c];state.car=c;state.activeCarId=c.uid;state.garageCapacity=2;
    let ev=eventById('heathcote_legal');for(let d=1;d<80;d++){state.day=d;if(daysUntil(ev)===0)break}})()`);
  box.evaluate(`travelToEvent('heathcote_legal');finishTravel();confirmArrival('race');listCarForSale('fair');(()=>{let o=null;for(let i=0;i<50&&!o;i++)o=makeMarketOffer('pit',100);globalThis.__offer=o})()`);
  box.evaluate('acceptCarOffer(__offer.id)');
  assert.ok(box.evaluate('!!state.pendingSale'), 'pending until the event ends');
  assert.equal(notes(box).filter(x => x.outcome !== 'countered').length, 0, 'nothing recorded yet: the Pending sale card already shows it');
  const amount = box.evaluate('state.pendingSale.amount'), money = box.evaluate('state.money');
  box.evaluate('endEvent()');
  assert.equal(box.evaluate('state.pendingSale'), null);
  assert.equal(box.evaluate('state.money') >= money + amount, true, 'paid on leaving');
  const n = notes(box).find(x => x.outcome === 'soldAfterEvent');
  assert.ok(n && n.title === 'Car collected' && !n.dismissed, 'the off-screen sale is recorded');
  box.evaluate("show('garage')");
  assert.equal(toast(box).outcome, 'soldAfterEvent', 'and shown until acknowledged');
}

// ---------- Recording changes nothing else: same offers, money, ownership, log and random draws ----------
for (const [label, act] of [['rejected counter', b => counterWith(b, 0.999)], ['accepted counter then accept', b => { counterWith(b, 0); b.evaluate('acceptCarOffer(__offer.id)'); }],
  ['decline', b => b.evaluate('declineCarOffer(__offer.id)')], ['plain counter roll', b => b.evaluate('counterCarOffer(__offer.id)')]]) {
  const run = recording => { const b = withOffer({ seed: 11, recording }); act(b); return { calls: b.evaluate('Math.calls'), state: b.evaluate("JSON.stringify({...state,notifications:(state.notifications||[]).filter(n=>n.type!=='market')})") }; };
  const withNotes = run(true), without = run(false);
  assert.equal(withNotes.calls, without.calls, `${label}: same random draws`);
  assert.equal(withNotes.state, without.state, `${label}: identical state apart from the outcome record`);
}
console.log('Quarter Mile Builder offer outcome checks passed.');
