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
assert.equal(evaluate(`state.guidance.onboardingDismissed`), true, 'established careers do not receive the beginner walkthrough');

evaluate(`state=freshState();normaliseState()`);
assert.equal(evaluate(`onboardingStage()`), 1);
assert.match(evaluate(`onboardingHtml()`), /Start with your first car/);
evaluate(`state.car=makeOwned(CARS.find(x=>x.id==='mx5'));state.owned=[state.car];state.activeCarId=state.car.uid`);
assert.equal(evaluate(`onboardingStage()`), 2);
assert.match(evaluate(`onboardingHtml()`), /Take your car to the strip/);
evaluate(`state.lastEvent={dayAdvanced:false,over:false}`);
assert.equal(evaluate(`onboardingStage()`), 3);
assert.match(evaluate(`onboardingHtml()`), /Join the lanes/);
evaluate(`state.lastRace={et:14}`);
assert.equal(evaluate(`onboardingStage()`), 0, 'walkthrough completes after the first pass');
assert.equal(evaluate(`SPLASH_AWAY_MS`), 4*60*60*1000);
assert.match(evaluate(`showSplashIfDue.toString()`), /last&&away<SPLASH_AWAY_MS/, 'splash is suppressed for short return visits');

evaluate(`state=freshState();refreshListings()`);
assert.equal(evaluate(`state.listings.length`), 8);
assert.equal(evaluate(`new Set(state.listings.map(x=>x.carId)).size`), 8);
assert.equal(evaluate(`state.listings.filter(x=>carById(x.carId).price<10000).length`), 3);
assert.equal(evaluate(`state.listings.filter(x=>carById(x.carId).price>=10000&&carById(x.carId).price<25000).length`), 3);
assert.equal(evaluate(`state.listings.filter(x=>carById(x.carId).price>=25000).length`), 2);
const firstClassifiedIds = evaluate(`state.listings.map(x=>x.id).join('|')`);
evaluate(`advanceGameDays(1)`);
assert.equal(evaluate(`state.day===2&&state.listingRotationDay===2`), true);
assert.notEqual(evaluate(`state.listings.map(x=>x.id).join('|')`), firstClassifiedIds);
const secondClassifiedIds = evaluate(`state.listings.map(x=>x.id).join('|')`);
evaluate(`state.day+=3;normaliseState()`);
assert.equal(evaluate(`state.listingRotationDay`), 5);
assert.notEqual(evaluate(`state.listings.map(x=>x.id).join('|')`), secondClassifiedIds);
assert.match(evaluate(`dailyWorkTyreShopWeekBase.toString()`), /advanceGameDays\(7\)/);
assert.match(evaluate(`skipCalendarDay.toString()`), /advanceGameDays\(1\)/);
assert.match(evaluate(`completeEventNight.toString()`), /advanceGameDays\(1\)/);

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

const postPlayerQueue = evaluate(`(() => {
  state={...freshState(),money:1000,respect:0,car:{name:'Test car'}};
  state.lastEvent={kind:'race',queueIndex:1,watchesLeft:2,lineup:[{type:'player',opponentIndex:0,done:true},{type:'npc',aIdx:0,bIdx:1,done:false},{type:'npc',aIdx:1,bIdx:0,done:false}],opponents:[{name:'Car A',type:'Street',drive:'RWD',visible:'street tyres'},{name:'Car B',type:'Street',drive:'FWD',visible:'street tyres'}]};
  return nextLineupPanel(state.lastEvent);
})()`);
assert.match(postPlayerQueue, /Watch All Remaining Races/);
assert.match(postPlayerQueue, /Watch the remaining 2 races automatically/);
assert.doesNotMatch(postPlayerQueue, /Go to My Race/);

const shortOnWatchesQueue = evaluate(`(() => {
  state.lastEvent.watchesLeft=1;
  return nextLineupPanel(state.lastEvent);
})()`);
assert.match(shortOnWatchesQueue, /watchAllRemainingRaces\(\)" disabled>Watch All Remaining Races/);
assert.match(shortOnWatchesQueue, /You need 2 Watch chances/);

assert.equal(evaluate(`Object.keys(BADGE_DEFINITIONS).length`), 29, 'badge catalogue count');
assert.deepEqual(Array.from(evaluate(`BADGE_CATEGORIES`)), ['Victorian Motoring','Engineering','Racing','Garage and Market','Respect','Punter']);
assert.equal(evaluate(`Object.values(BADGE_DEFINITIONS).every(x=>x.name&&x.category&&x.icon&&x.description&&x.hint)`), true);

evaluate(`state=freshState();state.respect=50;normaliseState()`);
assert.equal(evaluate(`hasBadge('known_around_the_pits')`), true);
assert.equal(evaluate(`state.notifications.filter(x=>x.type==='badge').length`), 1);
evaluate(`checkRelevantBadges('respect_changed');checkRelevantBadges('respect_changed')`);
assert.equal(evaluate(`Object.keys(state.badges).filter(x=>x==='known_around_the_pits').length`), 1);
assert.equal(evaluate(`state.notifications.filter(x=>x.type==='badge').length`), 1);
assert.equal(JSON.parse(storage.get('qmb_mvp_save')).badges.known_around_the_pits.gameDay, 1);

evaluate(`state=freshState();delete state.badges;delete state.badgeHistory;normaliseState()`);
assert.equal(evaluate(`typeof state.badges`), 'object');
assert.equal(evaluate(`state.badgeHistory.version`), 1);
assert.equal(evaluate(`hasBadge('notice_of_disposal')`), false);

evaluate(`state=freshState();state.badges={notice_of_disposal:{unlockedAt:'old',gameDay:3,carId:null,context:{}}};state.badgeHistory=freshBadgeHistory();let incoming=freshState();incoming.badges={known_around_the_pits:{unlockedAt:'new',gameDay:8,carId:null,context:{}}};state=mergeBadgeCareer(incoming,state)`);
assert.equal(evaluate(`hasBadge('notice_of_disposal')&&hasBadge('known_around_the_pits')`), true);

evaluate(`state=freshState();state.accounting=[{day:1,label:'Sold Car A immediately to a wholesaler.',cashDelta:1000},{day:100,label:'Sold Car B to Buyer.',cashDelta:1000},{day:200,label:'Sold Car C to Buyer.',cashDelta:1000},{day:365,label:'Sold Car D to Buyer.',cashDelta:1000}];state.day=365;normaliseState()`);
assert.equal(evaluate(`hasBadge('notice_of_disposal')`), true);
assert.equal(evaluate(`hasBadge('lmct_territory')`), true);

evaluate(`state=freshState();ensureBadgeState();for(let i=0;i<10;i++)checkRelevantBadges('listing_inspected',{listingId:'same'})`);
assert.equal(evaluate(`state.badgeHistory.inspectedListingIds.length`), 1);
assert.equal(evaluate(`hasBadge('kick_the_tyres')`), false);
evaluate(`for(let i=1;i<10;i++)checkRelevantBadges('listing_inspected',{listingId:'listing_'+i})`);
assert.equal(evaluate(`hasBadge('kick_the_tyres')`), true);

evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS[0],'manual','manual');state.car.listedForSale=true`);
assert.equal(evaluate(`hasBadge('notice_of_disposal')`), false);

evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS[0],'manual','manual');state.owned=[state.car];state.car.acquisitionPower=100;state.car.power=150;checkRelevantBadges('power_changed',{car:state.car,carId:state.car.uid,carName:state.car.name})`);
assert.equal(evaluate(`hasBadge('ten_percent_solution')&&hasBadge('twenty_five_percent_more_trouble')&&hasBadge('call_the_vass_engineer')`), true);
assert.equal(evaluate(`state.notifications.filter(x=>x.type==='badge').length`), 1);
assert.equal(evaluate(`state.notifications.find(x=>x.type==='badge').badgeIds.length`), 3);

evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS[0],'manual','manual');state.car.firstPassET=14;state.car.firstSixty=2.2;state.car.bestRunSnapshot={et:14,power:100};checkRelevantBadges('race_completed',{car:state.car,carId:state.car.uid,run:{et:13.45,sixty:1.95},previous:{bestRunSnapshot:{et:14,power:100}},raceStartPower:102,opponentStartPower:100,win:false,noShiftRequired:false,allRequiredShiftsInTolerance:false,cleanPass:false,eventId:'heathcote_legal'})`);
assert.equal(evaluate(`hasBadge('found_a_tenth')&&hasBadge('found_half_a_second')&&hasBadge('the_sixty_foot_fix')&&hasBadge('area_under_the_curve')`), true);

const sweetAssessment = evaluate(`assessRaceForBadges({playerCanShift:true,shiftEvents:[{fromGear:1,gear:2,rpm:6000,diff:500}],limiterTime:0},{launch:{issue:null},shifting:{issues:[]}})`);
assert.equal(sweetAssessment.allRequiredShiftsInTolerance, true);
assert.equal(sweetAssessment.cleanPass, true);
const lateAssessment = evaluate(`assessRaceForBadges({playerCanShift:true,shiftEvents:[{fromGear:1,gear:2,rpm:6501,diff:501}],limiterTime:0},{launch:{issue:null},shifting:{issues:[{type:'late'}]}})`);
assert.equal(lateAssessment.allRequiredShiftsInTolerance, false);
assert.equal(lateAssessment.cleanPass, false);
const missedAssessment = evaluate(`assessRaceForBadges({playerCanShift:true,shiftEvents:[],limiterTime:0},{launch:{issue:null},shifting:{issues:[{type:'missed'}]}})`);
assert.equal(missedAssessment.noShiftRequired, false);
const oneGearAssessment = evaluate(`assessRaceForBadges({playerCanShift:true,shiftEvents:[],limiterTime:0},{launch:{issue:null},shifting:{issues:[]}})`);
assert.equal(oneGearAssessment.noShiftRequired, true);
assert.equal(oneGearAssessment.cleanPass, true);
const automaticAssessment = evaluate(`assessRaceForBadges({playerCanShift:false,shiftEvents:[{fromGear:1,gear:2,rpm:5500,diff:0,automatic:true}],limiterTime:0},{launch:{issue:null},shifting:{issues:[]}})`);
assert.equal(automaticAssessment.cleanPass, true);
const autoManualAssessment = evaluate(`assessRaceForBadges({playerCanShift:true,shiftEvents:[{fromGear:1,gear:2,rpm:5500,diff:0}],limiterTime:0},{launch:{issue:null},shifting:{issues:[]}})`);
assert.equal(autoManualAssessment.cleanPass, true);

evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS[0]);state.car.performanceModified=false;checkRelevantBadges('race_completed',{car:state.car,carId:state.car.uid,run:{et:14,sixty:2},previous:{},raceStartPower:100,opponentStartPower:121,win:true,noShiftRequired:false,allRequiredShiftsInTolerance:false,cleanPass:false,eventId:'heathcote_legal'})`);
assert.equal(evaluate(`hasBadge('punching_above_your_weight')&&hasBadge('run_what_you_brung')`), true);
evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS[0]);state.car.performanceModified=true;checkRelevantBadges('race_completed',{car:state.car,run:{et:14,sixty:2},previous:{},raceStartPower:100,opponentStartPower:100,win:true,eventId:'heathcote_legal'})`);
assert.equal(evaluate(`hasBadge('run_what_you_brung')`), false);

assert.equal(evaluate(`eligibleVictorianVenueIds().includes('sydney_challenge')||eligibleVictorianVenueIds().includes('bend_open')`), false);
evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS[0]);state.badgeHistory.racedVenueIds=eligibleVictorianVenueIds().slice();checkRelevantBadges('race_completed',{car:state.car,run:{et:14,sixty:2},previous:{},raceStartPower:100,opponentStartPower:100,win:false,eventId:'sydney_challenge'})`);
assert.equal(evaluate(`hasBadge('victorian_tour')`), true);

evaluate(`state=freshState();ensureBadgeState();state.car=makeOwned(CARS.find(x=>x.id==='mx5'));ensureOwnedCarBadgeHistory(state.car);checkRelevantBadges('race_completed',{car:state.car,run:{et:14,sixty:2},previous:{},raceStartPower:140,opponentStartPower:140,win:false,historicEligible:BADGE_REFERENCE_YEAR-state.car.modelYear>=25,eventId:'heathcote_legal'})`);
assert.equal(evaluate(`hasBadge('red_plate_royalty')`), true);
assert.equal(evaluate(`state.car.modelYear`), 1999);

evaluate(`state=freshState();ensureBadgeState();checkRelevantBadges('race_completed',{run:{et:14,sixty:2},previous:{},majorFailure:false})`);
assert.equal(evaluate(`hasBadge('trailered_home')`), false);
evaluate(`checkRelevantBadges('race_completed',{run:{et:14,sixty:2},previous:{},majorFailure:true})`);
assert.equal(evaluate(`hasBadge('trailered_home')`), true);

evaluate(`state=freshState();state.respect=50;normaliseState()`);
assert.equal(evaluate(`hasBadge('known_around_the_pits')`), true);
evaluate(`state=freshState();ensureBadgeState();checkRelevantBadges('private_offer_generated',{respectGated:false})`);
assert.equal(evaluate(`hasBadge('word_gets_around')`), false);
evaluate(`checkRelevantBadges('private_offer_generated',{respectGated:true})`);
assert.equal(evaluate(`hasBadge('word_gets_around')`), true);

evaluate(`state=freshState();ensureBadgeState();(()=>{let a={id:'a',entryId:'a_1'},b={id:'b',entryId:'b_1'};checkRelevantBadges('watched_run',{cars:[a],results:[{et:12}]});checkRelevantBadges('bet_settled',{won:true,informed:observedBeforeBet(a)&&observedBeforeBet(b)})})()`);
assert.equal(evaluate(`hasBadge('read_the_form')`), false);
evaluate(`(()=>{let b={id:'b',entryId:'b_1'};checkRelevantBadges('watched_run',{cars:[b],results:[{et:13}]});let a={id:'a',entryId:'a_1'};checkRelevantBadges('bet_settled',{won:true,informed:observedBeforeBet(a)&&observedBeforeBet(b)})})()`);
assert.equal(evaluate(`hasBadge('read_the_form')`), true);

evaluate(`state=freshState();ensureBadgeState();checkRelevantBadges('event_completed',{bettingProfit:25,wagerAfterProfit:false,disqualified:false,totalEventIncome:-500})`);
assert.equal(evaluate(`hasBadge('walk_away')`), true);
evaluate(`state=freshState();ensureBadgeState();checkRelevantBadges('event_completed',{bettingProfit:25,wagerAfterProfit:true,disqualified:false})`);
assert.equal(evaluate(`hasBadge('walk_away')`), false);

evaluate(`state=freshState();state.respect=50;normaliseState()`);
const badgeMarkup = evaluate(`badges()`);
assert.match(badgeMarkup, /Career Badges/);
assert.match(badgeMarkup, /badgeCard unlocked/);
assert.match(badgeMarkup, /badgeCard locked/);
assert.match(html, /@media\(max-width:640px\)[\s\S]*\.badgeGrid\{grid-template-columns:1fr\}/);
assert.match(html, /\.raceMain,.screen\{min-width:0\}/);
assert.match(html, /\.raceStage,.touchShiftBtn,.spark\{max-width:100%\}/);
assert.match(html, /@media\(max-width:860px\)[\s\S]*\.raceLayout\{grid-template-columns:minmax\(0,1fr\)\}/);
assert.match(html, /@media\(max-width:860px\)[\s\S]*\.nav\{display:flex;overflow-x:auto/);
assert.match(html, /@media\(max-width:640px\)[\s\S]*\.queueCard\.done\{min-height:0;padding:8px 10px\}/);
assert.match(evaluate(`lineupQueueList.toString()`), /listing queueCard/);
assert.match(evaluate(`onboardingCurrentEventBase.toString()`), /compactMobileActions/);
assert.match(html, /@media\(max-width:640px\)\{[\s\S]*body\{font-size:14px\}/);
assert.match(html, /\.badgeCard\{grid-template-columns:40px minmax\(0,1fr\);gap:8px;min-height:96px/, 'mobile badge density');
assert.match(html, /\.touchShiftBtn\{min-height:52px;font-size:18px\}/, 'mobile shift control');
assert.match(html, /@media\(max-width:640px\)\{[\s\S]*\.raceSide \.treeBox\{zoom:\.75\}/, 'mobile drag tree scaling');
assert.doesNotMatch(evaluate(`nav.toString()`), /items\.push\('watch'/, 'watch screen stays out of navigation');
assert.match(evaluate(`notifyMarketOffer.toString()`), /marketOffer/);
assert.match(evaluate(`cloudSave.toString()`), /action:'save'/);
assert.match(evaluate(`publicStatsSnapshot.toString()`), /respect/);

evaluate(`render=()=>{};state=freshState();ensureDailyBriefing();state.dailyBriefing.challengeId='inspect';state.dailyBriefing.progress=0;state.dailyBriefing.completed=false;state.dailyBriefing.claimed=false`);
assert.equal(evaluate(`dailyProgress('inspect');state.dailyBriefing.completed`), true);
const dailyMoneyBefore = evaluate(`state.money`);
evaluate(`claimDailyReward()`);
assert.equal(evaluate(`state.money`), dailyMoneyBefore + 300);
assert.equal(evaluate(`state.dailyBriefing.claimed`), true);
evaluate(`claimDailyReward()`);
assert.equal(evaluate(`state.money`), dailyMoneyBefore + 300, 'daily reward cannot be claimed twice');
assert.equal(evaluate(`state.dailyBriefing.weeklyDates.length`), 1);

evaluate(`state.dailyBriefing.weeklyDates=['a','b','c','d'];state.dailyBriefing.weeklyBonusClaimed=false`);
const weeklyMoneyBefore = evaluate(`state.money`);
const weeklyRespectBefore = evaluate(`state.respect`);
evaluate(`claimWeeklyBriefingBonus()`);
assert.equal(evaluate(`state.money`), weeklyMoneyBefore + 1000);
assert.equal(evaluate(`state.respect`), weeklyRespectBefore + 2);
evaluate(`claimWeeklyBriefingBonus()`);
assert.equal(evaluate(`state.money`), weeklyMoneyBefore + 1000, 'weekly reward cannot be claimed twice');

evaluate(`state=freshState();state.dailyBriefing.dateKey='2000-01-01';state.dailyBriefing.completed=true;ensureDailyBriefing()`);
assert.equal(evaluate(`state.dailyBriefing.dateKey`), evaluate(`realDateKey()`));
assert.equal(evaluate(`state.dailyBriefing.completed`), false);
assert.match(evaluate(`dailyBriefingHtml()`), /DAILY GARAGE BRIEFING/);
assert.match(evaluate(`dailyBriefingHtml()`), /Garage Regular/);
assert.equal(evaluate(`Object.keys(DAILY_CHALLENGES).length`), 10);
assert.deepEqual(Array.from(evaluate(`Object.keys(DAILY_CHALLENGES)`)), ['inspect','workshop','race','buy','advertise','switch','win','watch','clean','work']);
evaluate(`state=freshState();refreshListings();ensureDailyBriefing();state.dailyBriefing.challengeId='inspect';state.dailyBriefing.progress=0;state.dailyBriefing.completed=false;state.dailyBriefing.claimed=false;state.dailyBriefing.rerollUsed=false`);
assert.match(evaluate(`dailyBriefingHtml()`), /Reroll once/);
evaluate(`rerollDailyBriefing()`);
assert.equal(evaluate(`state.dailyBriefing.rerollUsed`), true);
assert.notEqual(evaluate(`state.dailyBriefing.challengeId`), 'inspect');
assert.doesNotMatch(evaluate(`dailyBriefingHtml()`), /Reroll once/);
assert.match(evaluate(`checkRelevantBadges.toString()`), /dailyProgress\('win'\)/);
assert.match(evaluate(`checkRelevantBadges.toString()`), /dailyProgress\('clean'\)/);
assert.match(evaluate(`checkRelevantBadges.toString()`), /dailyProgress\('watch'\)/);

evaluate(`state=freshState();state.car=makeOwned(CARS.find(x=>x.id==='mx5'));state.owned=[state.car];state.activeCarId=state.car.uid;render=()=>{};let queued=currentUpgradeOptions(state.car).find(x=>x.day>0&&!x.tuneService);buyUpgrade(queued.id)`);
assert.equal(evaluate(`state.day`), 1, 'booking a workshop job does not advance the calendar');
assert.equal(evaluate(`state.workshopJob!==null`), true);
assert.equal(evaluate(`state.car.inWorkshop`), true);
const queuedCompletionDay = evaluate(`state.workshopJob.completeDay`);
evaluate(`advanceGameDays(${queuedCompletionDay}-state.day)`);
assert.equal(evaluate(`state.workshopJob`), null, 'workshop job completes when calendar time passes');
assert.equal(evaluate(`state.car.inWorkshop`), false);

evaluate(`state=freshState();state.car=makeOwned(CARS.find(x=>x.id==='mx5'));state.owned=[state.car];state.activeCarId=state.car.uid;let queuedRegression=currentUpgradeOptions(state.car).find(x=>x.day>0&&!x.tuneService);buyUpgrade(queuedRegression.id);state.day=state.workshopJob.completeDay;globalThis.jobStateWhenLogged='unset';log=()=>{globalThis.jobStateWhenLogged=state.workshopJob};completeWorkshopJob()`);
assert.equal(evaluate(`globalThis.jobStateWhenLogged`), null, 'workshop job is cleared before completion logging can render recursively');
assert.match(evaluate(`showScreenBase.toString()`), /if\(yyRun\)/, 'navigation cancels a You Yangs run even before its RAF starts');
assert.match(evaluate(`showScreenBase.toString()`), /if\(dynoSession\)/, 'navigation cancels an active dyno session');
assert.match(evaluate(`showScreenBase.toString()`), /cancelWatchRun\(\)/, 'navigation cancels spectator animation state');
assert.match(evaluate(`renderWatchRun.toString()`), /watchRun!==run/, 'stale spectator callbacks stop before touching removed DOM');
assert.match(evaluate(`tickLiveRace.toString()`), /playerFinish=\{at:elapsed,pEt,rpm,trap:/, 'live race freezes the official player result at the finish line');
assert.match(evaluate(`tickLiveRace.toString()`), /braking\?'BRAKING':'COASTING'/, 'a winning player coasts and brakes while waiting for the rival');
assert.match(evaluate(`handleLiveShift.toString()`), /liveRun\.playerFinish/, 'post-finish shift input cannot alter the official pass');

evaluate(`state=freshState();state.car=makeOwned(CARS.find(x=>x.id==='mx5'));let second=makeOwned(CARS.find(x=>x.id==='is200'));state.owned=[state.car,second];state.activeCarId=state.car.uid;state.saleVehicleId=second.uid`);
assert.equal(evaluate(`selectedSaleCar().uid`), evaluate(`state.owned[1].uid`));
assert.match(evaluate(`market()`), /Vehicle to sell/);
evaluate(`state.lastEvent={vehicleId:state.car.uid,dayAdvanced:false,over:false}`);
assert.equal(evaluate(`carSaleBlocked(state.car)`), true, 'event vehicle is locked from sale');
assert.equal(evaluate(`carListingBlocked(state.car)`), false, 'event vehicle can still be advertised');
assert.equal(evaluate(`carSaleBlocked(state.owned[1])`), false, 'other garage cars remain sellable at an event');
evaluate(`state.saleVehicleId=state.car.uid;listCarForSale('fair')`);
assert.equal(evaluate(`state.car.listedForSale`), true, 'event vehicle can be listed while still entered');
assert.match(evaluate(`market()`), /receive pit offers while still racing/);
const lockedDay = evaluate(`state.day`);
evaluate(`nextDayListings()`);
assert.equal(evaluate(`state.day`), lockedDay, 'Trading Post cannot advance time during an event');

evaluate(`state=freshState();ensureDailyBriefing();remindDailyBriefing(true)`);
assert.equal(evaluate(`state.notifications.filter(x=>x.type==='briefing'&&!x.dismissed).length`), 1);
assert.equal(evaluate(`pendingGuidanceNotification().type`), 'briefing');
evaluate(`state.notifications[0].dismissed=true;state.dailyBriefing.lastReminderAt=0;remindDailyBriefing(false)`);
assert.equal(evaluate(`state.notifications[0].dismissed`), false, 'dismissed reminder returns after the interval');
evaluate(`openPendingNotification()`);
assert.equal(evaluate(`state.dailyBriefing.briefingRead`), true);
assert.equal(evaluate(`state.notifications[0].dismissed`), true);
assert.equal(evaluate(`remindDailyBriefing(true)`), false, 'read briefing does not remind again');

console.log('Quarter Mile Builder core regression checks passed.');
