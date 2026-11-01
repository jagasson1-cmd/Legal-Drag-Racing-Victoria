// Event data: EVENT_CALENDAR, then EVENT_STORIES. Moved verbatim from index.html (lines 1507-1514 and 1808-1881 at 55b5307); see docs/MODULARISATION.md. Classic script: loads after js/data/vehicles.js and before the inline game script.
const EVENT_CALENDAR=[
{id:'heathcote_legal',name:'Heathcote Friday Street Drags',venue:'Heathcote Park Raceway',region:'VIC',tier:'Local',reqRespect:0,interval:2,offset:1,entryFee:75,spectatorFee:25,travelCost:0,winPayout:150,respectMult:1.0,fieldMult:1.0,opponentBoost:0,desc:'Low-risk legal street drags. Good for testing, learning launches and earning early Respect.'},
{id:'calder_test',name:'Calder Test & Tune Night',venue:'Calder Park Raceway',region:'VIC',tier:'Local',reqRespect:3,interval:3,offset:2,entryFee:100,spectatorFee:30,travelCost:20,winPayout:225,respectMult:1.15,fieldMult:1.1,opponentBoost:.03,desc:'A slightly stronger local field with better timing data and more modified street cars.'},
{id:'mildura_regional',name:'Mildura Regional Street Meet',venue:'Mildura Sunset Strip',region:'VIC',tier:'Regional',reqRespect:8,interval:5,offset:4,entryFee:150,spectatorFee:40,travelCost:180,winPayout:350,respectMult:1.35,fieldMult:1.0,opponentBoost:.06,desc:'A bigger trip and a tougher mixed regional field. Better rewards, higher commitment.'},
{id:'state_grudge',name:'Victorian Grudge Night',venue:'Rotating Victorian venue',region:'VIC',tier:'State',reqRespect:15,interval:7,offset:6,entryFee:250,spectatorFee:60,travelCost:120,winPayout:650,respectMult:1.65,fieldMult:1.25,opponentBoost:.1,desc:'Serious local reputations. Stronger cars, riskier matchups and more Respect on offer.'},
{id:'bend_open',name:'The Bend Interstate Open',venue:'Dragway at The Bend',region:'SA',tier:'Interstate',reqRespect:25,interval:10,offset:8,entryFee:450,spectatorFee:90,travelCost:650,winPayout:1100,respectMult:2.0,fieldMult:1.35,opponentBoost:.16,desc:'Interstate travel and a much tougher field. You need money, reliability and a proper setup.'},
{id:'sydney_challenge',name:'Sydney Dragway Challenge',venue:'Sydney Dragway',region:'NSW',tier:'National',reqRespect:40,interval:14,offset:12,entryFee:650,spectatorFee:120,travelCost:950,winPayout:1700,respectMult:2.4,fieldMult:1.5,opponentBoost:.22,desc:'A national-level target for later builds. Fast cars, high costs and serious reputation gains.'}
];
const EVENT_STORIES={
  heathcote_legal:{
    travel:['You roll out past scrub and paddocks, with that distinct country-night feel building as the track gets closer.','The road out feels easy and familiar, and you can almost imagine hearing open headers before you get there.'],
    venue:['The Heathcote crowd has a grassroots feel - trailers, street cars, and people happy to talk setups.','It has that country drag-strip atmosphere: practical cars, folding chairs, and plenty of people comparing timeslips.'],
    turnout:['There is a strong mix of budget street cars and backyard-built combinations tonight.','You spot plenty of learner-level street builds, a few serious regulars, and lots of people just enjoying some passes.'],
    notes:['A few people are talking about tyre pressures and short-shifting to keep the car happy.','There is a relaxed vibe in the pits, with plenty of cars lining up for repeat runs.'],
    weather:[
      {label:'Cool clear country air',temp:12,track:'The air is crisp and the track looks friendly for a clean launch.',sky:'Clear above the paddocks.'},
      {label:'Mild and dry',temp:18,track:'The track surface is dry and settled, with a slightly softer feel in the air.',sky:'A calm mild evening.'},
      {label:'Warm inland night',temp:22,track:'The surface feels warm and stable, which should keep the lanes consistent.',sky:'A warm evening hanging on after sunset.'},
      {label:'Chilly dense-air night',temp:9,track:'The air feels dense and grippy, the kind of night people expect solid numbers from.',sky:'A cold clean sky with barely any cloud.'}
    ]
  },
  calder_test:{
    travel:['You cut through the outer suburbs and industrial roads, heading toward the strip with a more hard-edged city feel.','The run to Calder feels closer to the city scene - shorter, sharper, and full of people making last-minute setup decisions.'],
    venue:['Calder feels more serious, with people studying the lanes and timing boards between passes.','The mood is more technical here, with plenty of modified street cars and people paying attention to the numbers.'],
    turnout:['There is a solid turbo street-car presence, plus a few cars that clearly come here to test properly.','You can see a stronger field than the local beginner nights, and a few tidy builds look ready to lean on them hard.'],
    notes:['People are swapping notes on boost, converter behaviour, and what the track is doing tonight.','You hear plenty of talk about consistency, reaction time, and whether the lane choice matters.'],
    weather:[
      {label:'Cool metro evening',temp:14,track:'The surface is dry and the cool air should help the stronger turbo cars.',sky:'A cool evening under clear city skies.'},
      {label:'Breezy and mild',temp:17,track:'There is a light breeze across the venue, though the track itself stays dry and raceable.',sky:'Some movement in the air, no real threat to racing.'},
      {label:'Still crisp night',temp:11,track:'The air is settled and the strip looks good for tidy, repeatable passes.',sky:'A still night with clean air.'},
      {label:'Warm suburban night',temp:20,track:'The lanes feel warm and predictable, with no drama in the conditions.',sky:'A warmer evening hanging over the western suburbs.'}
    ]
  },
  mildura_regional:{
    travel:['The drive stretches out through regional roads, and the landscape opens up into a more remote, red-dirt feel.','You head further north and the trip starts feeling like a proper outing rather than a quick local run.'],
    venue:['Mildura has that regional-meet feeling - people have travelled, and the crowd is making a night of it.','The venue feels like a big regional gathering, with a mix of locals and people who have driven in from a fair way out.'],
    turnout:['There is a healthy mix of tough street cars, country-built utes, and a few surprisingly serious combinations.','You notice plenty of practical street cars, but also several builds that look sharper than their owners let on.'],
    notes:['Dust hangs lightly around the outer car park, while the racing surface itself stays clean and dry.','There is a proper trip-away vibe in the staging area, with people setting up for a long night.'],
    weather:[
      {label:'Dry warm inland air',temp:24,track:'The air is dry and the track looks consistent, though the warm surface may soften the launch a touch.',sky:'A warm inland evening with dry air.'},
      {label:'Hot lingering heat',temp:28,track:'The surface is carrying heat from the day, which should keep conditions steady but not especially sharp.',sky:'The daytime heat is still hanging around after sunset.'},
      {label:'Cooling desert-style night',temp:17,track:'The temperature is dropping quickly now, and the lanes are starting to come around nicely.',sky:'The sky opens up and the air cools fast once the sun is gone.'},
      {label:'Dry dusty evening',temp:21,track:'The surrounding ground feels dusty, but the prepared racing surface stays clean and race-ready.',sky:'A dry regional night with a faint dusty feel.'}
    ]
  },
  state_grudge:{
    travel:['The trip has a serious feel to it - still local enough to manage, but with the sense that reputations matter more tonight.','You head out knowing this is the kind of night where people care who they line up against and who sees it.'],
    venue:['This one feels more serious and a bit more watchful, with crews and regulars paying close attention to who is quick.','There is a grudge-night edge here: people are friendly enough, but they are absolutely keeping score.'],
    turnout:['There are plenty of serious street builds here, and more than a few cars look like they are not just out for a casual pass.','The pits are full of sharper local builds, with turbo sixes, V8s, and well-sorted street cars all in the mix.'],
    notes:['You can feel the social side of racing a bit more here - who wins, who backs it up, and who gets talked about later.','The fence line is lively, with people clearly watching the pairings as much as the times.'],
    weather:[
      {label:'Cool Victorian evening',temp:13,track:'The strip looks race-ready and the cooler air should help the better-sorted cars.',sky:'A cool evening with clean air.'},
      {label:'Mild with light crosswind',temp:16,track:'A small crosswind moves through the venue, but conditions still look good for racing.',sky:'Some movement in the breeze, nothing enough to stop the night.'},
      {label:'Cold and crisp',temp:8,track:'The air feels sharp and the lanes could reward cars that put the power down cleanly.',sky:'A cold Victorian night settling in.'},
      {label:'Cloud cover holding heat',temp:15,track:'The air is slightly softer under the cloud, though the surface remains dry and consistent.',sky:'Cloud overhead, but the track stays dry.'}
    ]
  },
  bend_open:{
    travel:['The interstate haul makes the whole thing feel bigger - more commitment, more cost, and a stronger sense that the night matters.','You settle in for the longer drive and it starts to feel like a proper campaign, not just a quick local outing.'],
    venue:['The Bend feels polished and open, with a more professional atmosphere and a stronger interstate presence.','There is a big-event feel here - open space, stronger machinery, and plenty of people who have made the trip for a reason.'],
    turnout:['You spot plenty of sharp late-model street cars, some well-sorted turbo builds, and a few combinations that clearly travel often.','The field looks tougher overall, with plenty of interstate cars and a more polished feel to the pit area.'],
    notes:['There is more of a destination-event vibe here, and people look prepared rather than casual.','The staging lanes look busy with capable cars, and even the quieter conversations feel more serious.'],
    weather:[
      {label:'Cool open-plains breeze',temp:13,track:'There is a light breeze across the open venue, but the track surface looks excellent.',sky:'Cool air moving across the plains.'},
      {label:'Crisp SA evening',temp:11,track:'The cool dry air should make the fast cars feel especially sharp tonight.',sky:'A crisp and very clear evening.'},
      {label:'Mild and settled',temp:18,track:'Conditions look steady and professional, with a clean dry surface and calm air.',sky:'A mild settled night.'},
      {label:'Warm with crosswind',temp:20,track:'A bit of wind moves across the venue, though the prepared lanes still look tidy and predictable.',sky:'Warm air and a noticeable breeze.'}
    ]
  },
  sydney_challenge:{
    travel:['The interstate trip up to Sydney feels like a major step, the sort of drive that makes the game world open up a bit.','It takes longer, costs more, and feels far more serious - exactly the kind of trip you make when you want a bigger stage.'],
    venue:['Sydney feels busy and sharp, with a big crowd and a strong mix of polished street builds.','There is a national-level energy here: more people, more noise, and more cars that look like they are built to prove a point.'],
    turnout:['The field looks deep, with strong late-model builds, plenty of turbo cars, and lots of confident crews.','This is one of the tougher scenes so far, and even the ordinary-looking cars seem like they might have something in reserve.'],
    notes:['You get that feeling of being a little further from home, with a crowd that has its own rhythm and its own favourites.','The pits feel bigger and busier, with people moving quickly and plenty of interest around the quick cars.'],
    weather:[
      {label:'Humid coastal night',temp:22,track:'The air is heavier than inland, and the track feels warm and sticky underfoot.',sky:'A humid coastal evening.'},
      {label:'Mild sea breeze',temp:19,track:'A gentle sea breeze moves the air around, while the lanes remain dry and well-prepared.',sky:'Mild coastal conditions with a light breeze.'},
      {label:'Sticky warm air',temp:24,track:'The heavier air takes a little edge off things, but the surface still looks good for a proper pass.',sky:'Warm and a touch sticky after dark.'},
      {label:'Cool clear coastal evening',temp:16,track:'The air is cleaner and cooler tonight, which could help the stronger cars show a bit more.',sky:'A clear coastal night with surprisingly fresh air.'}
    ]
  }
};
