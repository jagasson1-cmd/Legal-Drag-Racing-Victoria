// Procedural soundscape profiles, played on the ambience bus by js/systems/audio.js. Plain data only; nothing here plays
// by itself. All sound is synthesised in the browser: there are no recordings and nothing to license.
// beds:   continuous filtered noise. gain is linear before the ambience bus; drift is how far it wanders (0-1);
//         driftEvery is how often, in seconds, it picks a new level.
// events: occasional one-shot voices. every is the [min,max] gap in seconds; each event varies its own pitch, length,
//         distance and pan, so nothing repeats exactly. Optional fields:
//         scale  multiplies gain by a context value ('crowd' 0-1, 'wind' around 1);
//         rate   'crowd' makes a busier venue more frequent;
//         when   {minTemp,maxTemp,minCrowd} conditions taken from the event's weather and turnout.
// fade:   crossfade-in seconds. settle: {after,to} eases the whole scape quieter once a long journey has settled.
// Silence is deliberate: gaps are long, levels are low, and the garage is mostly room tone.
const SOUNDSCAPES={
  garage:{fade:1.8,
    beds:[{filter:'lowpass',freq:150,q:.7,gain:.05,drift:.2,driftEvery:[5,10]},
      {filter:'bandpass',freq:480,q:.5,gain:.008,drift:.6,driftEvery:[3,8]}],
    events:[{voice:'carPass',every:[11,30],gain:.022,far:1.4},
      {voice:'clink',every:[18,55],gain:.04}]},
  // Travel: road and wind under the existing cruise engine. Shaped by the trip's TRAVEL_PROFILES scene.
  travel_metro:{fade:.8,
    beds:[{filter:'lowpass',freq:360,q:.6,gain:.06,drift:.2,driftEvery:[2,5]}],
    events:[{voice:'carPass',every:[2,5],gain:.05,far:.8}]},
  travel_country:{fade:.8,
    beds:[{filter:'lowpass',freq:300,q:.6,gain:.055,drift:.2,driftEvery:[3,6]},
      {filter:'bandpass',freq:700,q:.5,gain:.02,drift:.5,driftEvery:[2,5]}],
    events:[{voice:'gust',every:[4,9],gain:.035},{voice:'carPass',every:[6,14],gain:.035,far:1.1}]},
  travel_long:{fade:.8,settle:{after:4,to:.65},
    beds:[{filter:'lowpass',freq:250,q:.6,gain:.06,drift:.15,driftEvery:[4,8]},
      {filter:'bandpass',freq:600,q:.5,gain:.026,drift:.5,driftEvery:[3,6]}],
    events:[{voice:'gust',every:[5,11],gain:.045},{voice:'carPass',every:[8,18],gain:.04,far:1.3}]},
  travel_night:{fade:.8,
    beds:[{filter:'lowpass',freq:280,q:.6,gain:.05,drift:.2,driftEvery:[3,6]}],
    events:[{voice:'carPass',every:[4,10],gain:.04,far:1}]},
  travel_interstate:{fade:.8,settle:{after:4,to:.7},
    beds:[{filter:'lowpass',freq:240,q:.6,gain:.06,drift:.15,driftEvery:[4,8]},
      {filter:'bandpass',freq:650,q:.5,gain:.02,drift:.5,driftEvery:[3,6]}],
    events:[{voice:'carPass',every:[3,8],gain:.045,far:1},{voice:'gust',every:[7,14],gain:.03}]},
  travel_proving:{fade:.8,
    beds:[{filter:'lowpass',freq:220,q:.6,gain:.05,drift:.2,driftEvery:[3,6]},
      {filter:'bandpass',freq:2400,q:.6,gain:.012,drift:.6,driftEvery:[1,3]}],
    events:[{voice:'gust',every:[4,9],gain:.04}]},
  // Venues. Crowd comes from the night's turnout; insects and wind from its weather.
  venue_heathcote_legal:{fade:1.6,
    beds:[{filter:'bandpass',freq:520,q:.5,gain:.02,drift:.55,driftEvery:[3,7],scale:'wind'},
      {filter:'bandpass',freq:820,q:.8,gain:.03,drift:.4,driftEvery:[1.5,4],scale:'crowd'}],
    events:[{voice:'engineDistant',every:[6,16],gain:.045,rate:'crowd'},
      {voice:'pa',every:[28,70],gain:.016,rate:'crowd'},
      {voice:'crickets',every:[7,16],gain:.018,when:{minTemp:10,maxTemp:21}},
      {voice:'cheer',every:[35,80],gain:.028,scale:'crowd',when:{minCrowd:.55}},
      {voice:'gust',every:[12,28],gain:.03,scale:'wind'}]},
  venue_calder_test:{fade:1.6,
    beds:[{filter:'lowpass',freq:210,q:.6,gain:.04,drift:.2,driftEvery:[4,8]},
      {filter:'bandpass',freq:900,q:.8,gain:.04,drift:.4,driftEvery:[1.5,4],scale:'crowd'}],
    events:[{voice:'engineDistant',every:[3.5,9],gain:.05,rate:'crowd'},
      {voice:'pa',every:[16,36],gain:.022,rate:'crowd'},
      {voice:'cheer',every:[26,60],gain:.032,scale:'crowd',when:{minCrowd:.55}},
      {voice:'carPass',every:[9,20],gain:.018,far:1.6}]},
  venue_mildura_regional:{fade:1.6,
    beds:[{filter:'bandpass',freq:430,q:.5,gain:.03,drift:.6,driftEvery:[3,7],scale:'wind'},
      {filter:'bandpass',freq:760,q:.8,gain:.022,drift:.45,driftEvery:[2,5],scale:'crowd'}],
    events:[{voice:'cicada',every:[9,20],gain:.014,when:{minTemp:22}},
      {voice:'crickets',every:[8,18],gain:.016,when:{maxTemp:21.9}},
      {voice:'engineDistant',every:[8,20],gain:.04,far:1.3,rate:'crowd'},
      {voice:'pa',every:[40,90],gain:.013,rate:'crowd'},
      {voice:'gust',every:[7,16],gain:.042,scale:'wind'}]},
  venue_you_yangs:{fade:1.6,
    beds:[{filter:'bandpass',freq:380,q:.5,gain:.034,drift:.6,driftEvery:[3,8]}],
    events:[{voice:'gust',every:[6,14],gain:.048},
      {voice:'engineDistant',every:[20,50],gain:.032,far:1.6},
      {voice:'radio',every:[30,80],gain:.016}]},
  // Other venues (Victorian Grudge Night, The Bend, Sydney): a generic dragway until they get their own character.
  venue_default:{fade:1.6,
    beds:[{filter:'lowpass',freq:230,q:.6,gain:.03,drift:.2,driftEvery:[4,8]},
      {filter:'bandpass',freq:860,q:.8,gain:.035,drift:.4,driftEvery:[1.5,4],scale:'crowd'}],
    events:[{voice:'engineDistant',every:[4.5,11],gain:.048,rate:'crowd'},
      {voice:'pa',every:[22,50],gain:.02,rate:'crowd'},
      {voice:'cheer',every:[30,70],gain:.03,scale:'crowd',when:{minCrowd:.55}}]}
};
// Turnout to crowd level (0-1), from the night's busy profile.
const SOUNDSCAPE_CROWD={'Quiet night':.35,'Normal night':.6,'Busy night':.85,'Packed night':1};
