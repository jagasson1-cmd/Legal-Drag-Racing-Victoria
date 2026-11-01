// Audio preferences and the audio manager. Classic script: loads after js/systems/opponent-generation.js and before the
// inline game script. See docs/MODULARISATION.md.
// Preferences live only in localStorage under qmb_audio_prefs_v1: never in the gameplay save (qmb_mvp_save) or the cloud
// payload. On first run they are migrated once from the old qmb_sound_enabled / qmb_music_enabled keys, which are then kept
// only as write-only compatibility mirrors (for rollback to an older build); the preference object is authoritative.
// The manager never calls Math.random (soundscapes use a private generator), so audio cannot shift gameplay draws.
const QMB_AUDIO_PREFS_KEY='qmb_audio_prefs_v1';
const QMB_AUDIO_DEFAULTS=Object.freeze({master:.8,music:.6,ambience:.5,engine:.8,effects:1,muted:false});
const QmbAudio=(()=>{
  // ---------- Preferences ----------
  const CHANNELS=['master','music','ambience','engine','effects'];
  const store=()=>{try{return typeof localStorage!=='undefined'?localStorage:null}catch(e){return null}};
  const read=k=>{try{const s=store();return s?s.getItem(k):null}catch(e){return null}};
  const write=(k,v)=>{try{const s=store();if(s)s.setItem(k,v)}catch(e){}};
  const level=(v,fallback)=>{if(v===null||v===undefined||v==='')return fallback;v=Number(v);return Number.isFinite(v)?Math.min(1,Math.max(0,Math.round(v*100)/100)):fallback};
  function normalise(p){const d=QMB_AUDIO_DEFAULTS,o={version:1};for(const c of CHANNELS)o[c]=level(p&&p[c],d[c]);o.muted=!!(p&&p.muted===true);return o}
  // First run (or an unreadable preference object): derive levels from the old on/off keys.
  // Music Off -> music 0. Effects Off -> ambience, engine and effects 0. Anything else -> the default levels.
  function migrate(){const d=QMB_AUDIO_DEFAULTS,effectsOff=read('qmb_sound_enabled')==='false',musicOff=read('qmb_music_enabled')==='false';
    return normalise({master:d.master,music:musicOff?0:d.music,ambience:effectsOff?0:d.ambience,engine:effectsOff?0:d.engine,effects:effectsOff?0:d.effects,muted:false})}
  let prefs=null;const listeners=[];
  const soundOn=()=>!prefs.muted&&prefs.master>0&&(prefs.engine>0||prefs.effects>0);
  const musicOn=()=>!prefs.muted&&prefs.master>0&&prefs.music>0;
  const copy=()=>({...prefs});
  function persist(){write(QMB_AUDIO_PREFS_KEY,JSON.stringify(prefs));write('qmb_sound_enabled',String(soundOn()));write('qmb_music_enabled',String(musicOn()))}
  function load(){let raw=read(QMB_AUDIO_PREFS_KEY),parsed=null;if(raw){try{parsed=JSON.parse(raw)}catch(e){parsed=null}}
    prefs=parsed&&typeof parsed==='object'&&parsed.version===1?normalise(parsed):migrate();persist()}
  function set(changes){const next=normalise({...prefs,...changes});if(JSON.stringify(next)===JSON.stringify(prefs))return copy();prefs=next;persist();applyLevels();reconcile();for(const fn of listeners){try{fn(copy())}catch(e){}}return copy()}
  load();

  // ---------- Private random generator (never Math.random) ----------
  let seed=(Date.now()^0x9E3779B9)>>>0;
  const rnd=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const between=(a,b)=>a+(b-a)*rnd();

  // ---------- Audio graph: buses -> master -> compressor -> speakers ----------
  let ctx=null,graph=null,noise=null,hidden=false,suspendTimer=null;
  const Ctor=()=>{try{return typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext)||null}catch(e){return null}};
  // Only create the context after the player has interacted (where the browser reports it), so nothing is blocked or warned.
  const activated=()=>{try{const ua=typeof navigator!=='undefined'&&navigator.userActivation;return !ua||!!ua.hasBeenActive}catch(e){return true}};
  const canSynth=()=>!!ctx&&typeof ctx.createBuffer==='function'&&typeof ctx.createBufferSource==='function';
  const quiet=()=>hidden||prefs.muted||prefs.master<=0;
  function build(){try{const g={master:ctx.createGain(),buses:{}};let out=ctx.destination;
      if(typeof ctx.createDynamicsCompressor==='function'){g.comp=ctx.createDynamicsCompressor();try{g.comp.threshold.value=-16;g.comp.ratio.value=3;g.comp.attack.value=.01;g.comp.release.value=.25}catch(e){}g.comp.connect(out);out=g.comp}
      g.master.connect(out);for(const name of ['music','ambience','engine','effects']){const b=ctx.createGain();b.connect(g.master);g.buses[name]=b}
      g.duck=ctx.createGain();g.duck.connect(g.buses.ambience);graph=g;applyLevels(true)}catch(e){graph=null}}
  function param(p,v,tc,now){try{if(tc===0||!p.setTargetAtTime)p.value=v;else p.setTargetAtTime(v,now,tc)}catch(e){}}
  function applyLevels(immediate){if(!graph)return;const now=ctx.currentTime||0,tc=immediate?0:.06;
    param(graph.master.gain,quiet()?0:prefs.master,hidden?.05:tc,now);for(const name of Object.keys(graph.buses))param(graph.buses[name].gain,prefs[name],tc,now)}
  async function context(){const C=Ctor();if(!C)return null;
    if(!ctx){if(!activated())return null;try{ctx=new C()}catch(e){ctx=null;return null}build()}
    if(quiet())return ctx.state==='running'?ctx:null;
    try{if(ctx.state!=='running'&&typeof ctx.resume==='function')await ctx.resume()}catch(e){}
    if(ctx.state==='running')reconcile();
    return ctx.state==='running'?ctx:null}
  // Fade out and suspend while the page is hidden, muted or at zero master; resume (and restart the soundscape) afterwards.
  function reconcile(){if(!ctx)return;clearTimeout(suspendTimer);suspendTimer=null;
    if(quiet()){stopScheduler();if(ctx.state==='running'&&typeof ctx.suspend==='function')suspendTimer=setTimeout(()=>{suspendTimer=null;if(quiet()&&ctx.state==='running'){try{ctx.suspend()}catch(e){}}},350);return}
    if(ctx.state!=='running'){if(activated()&&typeof ctx.resume==='function'){try{ctx.resume().then(()=>reconcile(),()=>{})}catch(e){}}return}
    applyLevels();startWanted()}
  function onVisibility(){hidden=typeof document!=='undefined'&&!!document.hidden;applyLevels();if(!hidden&&scape)for(const ev of scape.events)ev.nextAt=Math.max(ev.nextAt,(ctx?ctx.currentTime:0)+between(.5,3));reconcile()}
  function unlock(){if(!Ctor())return;context()}

  // ---------- Soundscapes ----------
  let wanted=null,scape=null,ticker=null,duckProbe=null,ducked=false;const voices=[];
  const data=()=>typeof SOUNDSCAPES!=='undefined'?SOUNDSCAPES:{};
  function noiseBuffer(){if(noise)return noise;const len=Math.floor((ctx.sampleRate||44100)*2.5),b=ctx.createBuffer(1,len,ctx.sampleRate||44100),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=rnd()*2-1;return noise=b}
  function setSoundscape(id,info={},opts={}){const def=data()[id];if(!def){wanted=null;stopScape(opts.fade);return}
    const key=id+'|'+JSON.stringify(info);if(wanted&&wanted.key===key&&scape&&scape.key===key)return;wanted={id,key,def,info,fade:opts.fade};startWanted()}
  function startWanted(){if(!wanted||!ctx||ctx.state!=='running'||!graph||!canSynth()||quiet()||prefs.ambience<=0){if(prefs.ambience<=0||!wanted)stopScape();return}
    if(scape&&scape.key===wanted.key){ensureScheduler();return}
    const fade=wanted.fade!=null?wanted.fade:(wanted.def.fade||1.5),old=scape;scape=createScape(wanted,fade);if(old)retire(old,fade);ensureScheduler()}
  function stopScape(fade=1){if(scape){retire(scape,fade);scape=null}stopScheduler()}
  const ctxValue=(info,name)=>name==='crowd'?(Number(info.crowd)>=0?Number(info.crowd):.6):name==='wind'?(Number(info.wind)>0?Number(info.wind):1):1;
  function allowed(when,info){if(!when)return true;const t=Number(info.temp);
    if(when.minTemp!=null&&!(t>=when.minTemp))return false;if(when.maxTemp!=null&&!(t<=when.maxTemp))return false;
    if(when.minCrowd!=null&&!(ctxValue(info,'crowd')>=when.minCrowd))return false;return true}
  function createScape(w,fade){const now=ctx.currentTime,out=ctx.createGain(),s={key:w.key,id:w.id,info:w.info,out,beds:[],events:[],stops:[]};
    out.gain.value=.0001;out.connect(graph.duck);out.gain.setTargetAtTime(1,now,Math.max(.05,fade/3));
    if(w.def.settle)out.gain.setTargetAtTime(w.def.settle.to,now+w.def.settle.after,1.5);
    for(const b of w.def.beds||[]){const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=noiseBuffer();src.loop=true;
      try{src.playbackRate.value=between(.88,1.12)}catch(e){}f.type=b.filter||'lowpass';f.frequency.value=b.freq;f.Q.value=b.q||.7;
      const base=b.gain*(b.scale?ctxValue(w.info,b.scale):1);g.gain.value=base;src.connect(f);f.connect(g);g.connect(out);src.start(now,between(0,2));
      s.stops.push(src);s.beds.push({def:b,g,f,base,nextDrift:now+between(...(b.driftEvery||[3,6]))})}
    for(const e of w.def.events||[])if(allowed(e.when,w.info))s.events.push({def:e,nextAt:now+between(e.every[0]*.3,e.every[1]*.6)});
    return s}
  function retire(s,fade){const now=ctx.currentTime;s.retired=true;try{s.out.gain.cancelScheduledValues(now);s.out.gain.setTargetAtTime(.0001,now,Math.max(.03,fade/4))}catch(e){}
    setTimeout(()=>{for(const n of s.stops){try{n.stop()}catch(e){}}try{s.out.disconnect()}catch(e){}},Math.round(fade*1000)+400)}
  function ensureScheduler(){if(!ticker&&scape)ticker=setInterval(tick,250)}
  function stopScheduler(){if(ticker){clearInterval(ticker);ticker=null}}
  function tick(){if(!scape||!ctx||ctx.state!=='running'||quiet()){stopScheduler();return}const now=ctx.currentTime;
    // Duck the ambience while an engine (race, dyno, spectator) is running; the probe is supplied by the game.
    let d=false;try{d=!!(duckProbe&&duckProbe())}catch(e){}if(d!==ducked){ducked=d;graph.duck.gain.setTargetAtTime(d?.32:1,now,d?.12:.6)}
    for(const b of scape.beds)if(now>=b.nextDrift){const dr=b.def.drift||0;b.g.gain.setTargetAtTime(b.base*(1-dr+2*dr*rnd()),now,1.2);b.f.frequency.setTargetAtTime(b.def.freq*between(.92,1.08),now,1.5);b.nextDrift=now+between(...(b.def.driftEvery||[3,6]))}
    for(let i=voices.length-1;i>=0;i--)if(voices[i].end<now)voices.splice(i,1);
    for(const e of scape.events){if(e.nextAt>now+.4)continue;if(e.nextAt<now-1)e.nextAt=now+between(0,.3);
      const def=e.def,same=voices.filter(v=>v.voice===def.voice).length;
      if(voices.length<6&&same<2){const end=spawn(def,e.nextAt,scape.info,scape.out);if(end)voices.push({voice:def.voice,end})}
      const rate=def.rate==='crowd'?.55+ctxValue(scape.info,'crowd'):1;e.nextAt+=between(def.every[0],def.every[1])/rate}}

  // ---------- Voices: synthesised one-shots. Every call varies pitch, length, distance and pan. ----------
  const env=(p,t,peak,attack,hold,release)=>{p.setValueAtTime(.0001,t);p.exponentialRampToValueAtTime(Math.max(.0002,peak),t+attack);p.setValueAtTime(Math.max(.0002,peak),t+attack+hold);p.exponentialRampToValueAtTime(.0001,t+attack+hold+release);return t+attack+hold+release};
  function panner(out,pan){if(typeof ctx.createStereoPanner!=='function')return out;const p=ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));p.connect(out);return p}
  function noiseSrc(t,dur){const s=ctx.createBufferSource();s.buffer=noiseBuffer();s.loop=true;s.start(t,between(0,2));s.stop(t+dur+.05);return s}
  function chain(...nodes){for(let i=0;i<nodes.length-1;i++)nodes[i].connect(nodes[i+1]);return nodes[nodes.length-1]}
  function filt(type,freq,q){const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q||.7;return f}
  function spawn(def,t,info,out){const g=def.gain*(def.scale?ctxValue(info,def.scale):1),far=def.far||1;if(g<=0)return 0;
    try{switch(def.voice){
      case 'clink':return clink(t,g,out);
      case 'carPass':return carPass(t,g,far,out);
      case 'engineDistant':return engineDistant(t,g,far,out);
      case 'pa':return pa(t,g,out);
      case 'crickets':return crickets(t,g,out);
      case 'cicada':return cicada(t,g,out);
      case 'cheer':return cheer(t,g,out);
      case 'gust':return gust(t,g,out);
      case 'radio':return radio(t,g,out);
      default:return 0}}catch(e){return 0}}
  // Tool or spanner on concrete: three inharmonic partials, sometimes a second bounce.
  function clink(t,g,out){const dest=panner(out,between(-.7,.7)),hits=rnd()<.35?2:1;let end=t;
    for(let h=0;h<hits;h++){const at=t+h*between(.08,.22),f0=between(1000,2300)*(h?between(.95,1.05):1),amp=g*(h?.45:1);
      [[1,1],[2.76,.5],[5.4,.22]].forEach(([r,a])=>{const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.value=f0*r;o.connect(og);og.connect(dest);end=Math.max(end,env(og.gain,at,amp*a,.002,0,between(.15,.6)/r**.3));o.start(at);o.stop(end+.05)})}
    return end}
  // A car on a road somewhere: tyre-and-wind noise sweep plus a low engine hum with a slight Doppler fall.
  function carPass(t,g,far,out){const dur=between(4,8)*Math.min(1.4,far),p=panner(out,0),side=rnd()<.5?-1:1;if(p.pan){p.pan.setValueAtTime(-.8*side,t);p.pan.linearRampToValueAtTime(.8*side,t+dur)}
    const n=noiseSrc(t,dur),bp=filt('bandpass',between(260,380),.9),lp=filt('lowpass',1400/far),ng=ctx.createGain();
    bp.frequency.setValueAtTime(between(260,380),t);bp.frequency.linearRampToValueAtTime(between(560,880)/far,t+dur*.5);bp.frequency.linearRampToValueAtTime(between(240,340),t+dur);
    chain(n,bp,lp,ng,p);const end=env(ng.gain,t,g,dur*.5,0,dur*.5);
    const o=ctx.createOscillator(),og=ctx.createGain(),ol=filt('lowpass',180),f=between(70,110);o.type='sawtooth';o.frequency.setValueAtTime(f*1.04,t);o.frequency.linearRampToValueAtTime(f*.95,t+dur);chain(o,ol,og,p);env(og.gain,t,g*.35,dur*.5,0,dur*.5);o.start(t);o.stop(end+.05);return end}
  // Distant engine: either a blip of revs in the pits or a car running down a far-off strip.
  function engineDistant(t,g,far,out){const p=panner(out,between(-.8,.8)),a=ctx.createOscillator(),b=ctx.createOscillator(),lp=filt('lowpass',between(380,720)/far),eg=ctx.createGain(),idle=between(34,48);
    a.type='sawtooth';b.type='square';a.connect(lp);b.connect(lp);chain(lp,eg,p);let end;
    if(rnd()<.7){const up=between(.35,1),hold=between(.15,.7),down=between(1,2),top=between(90,160);
      [[a,1],[b,1.01]].forEach(([o,k])=>{o.frequency.setValueAtTime(idle*k,t);o.frequency.exponentialRampToValueAtTime(top*k,t+up);o.frequency.setValueAtTime(top*k,t+up+hold);o.frequency.exponentialRampToValueAtTime(idle*k,t+up+hold+down)});
      end=env(eg.gain,t,g,up,hold,down)}
    else{const run=between(5,8),top=between(140,190);[[a,1],[b,1.008]].forEach(([o,k])=>{o.frequency.setValueAtTime(45*k,t);o.frequency.exponentialRampToValueAtTime(top*k,t+run)});
      end=env(eg.gain,t,g,run*.7,0,run*.3)}
    a.start(t);b.start(t);a.stop(end+.05);b.stop(end+.05);return end}
  // Far-off PA: band-limited noise shaped into speech-like rhythm. Deliberately unintelligible.
  function pa(t,g,out){const n=noiseSrc(t,6),hp=filt('highpass',450),bp=filt('bandpass',between(1100,1700),2.2),lp=filt('lowpass',2600),pg=ctx.createGain(),p=panner(out,between(-.4,.4));
    chain(n,hp,bp,lp,pg,p);pg.gain.setValueAtTime(.0001,t);let at=t+.05;const words=Math.floor(between(3,8));
    for(let w=0;w<words;w++){const syl=Math.floor(between(1,4));for(let s=0;s<syl;s++){const len=between(.08,.2),amp=g*between(.5,1);pg.gain.setTargetAtTime(amp,at,.02);pg.gain.setTargetAtTime(.0001,at+len,.03);at+=len+between(.03,.08)}at+=between(.12,.45)}
    n.stop(at+.3);return at+.3}
  // Crickets: one to three insects, each chirping in short pulse trains at its own pitch and rate.
  function crickets(t,g,out){let end=t;const count=Math.floor(between(1,3.99));
    for(let c=0;c<count;c++){const o=ctx.createOscillator(),og=ctx.createGain(),p=panner(out,between(-.9,.9)),f=between(4200,5400),gap=between(.5,1.1),pulses=rnd()<.5?3:4,spacing=between(.028,.034),dur=between(3,8);
      o.frequency.value=f;o.connect(og);og.connect(p);og.gain.setValueAtTime(.0001,t);let at=t+between(0,.6);
      while(at<t+dur){for(let k=0;k<pulses;k++){const s=at+k*spacing;og.gain.setValueAtTime(.0001,s);og.gain.linearRampToValueAtTime(g,s+.004);og.gain.linearRampToValueAtTime(.0001,s+.014)}at+=gap*between(.9,1.1)}
      o.start(t);o.stop(at+.1);end=Math.max(end,at+.1)}
    return end}
  // Cicadas on a hot inland night: a high buzzing swell with a fast tremolo.
  function cicada(t,g,out){const n=noiseSrc(t,10),bp=filt('bandpass',between(5200,6800),6),cg=ctx.createGain(),am=ctx.createGain(),lfo=ctx.createOscillator(),depth=ctx.createGain(),p=panner(out,between(-.8,.8));
    lfo.frequency.value=between(45,70);depth.gain.value=.5;am.gain.value=.5;lfo.connect(depth);depth.connect(am.gain);chain(n,bp,am,cg,p);
    const end=env(cg.gain,t,g,between(1.5,3),between(2,5),between(2,3));lfo.start(t);lfo.stop(end+.05);n.stop(end+.05);return end}
  // A crowd reacting to a run: a short broadband swell, louder for bigger turnouts.
  function cheer(t,g,out){const n=noiseSrc(t,5),bp=filt('bandpass',between(800,1000),.6),hg=ctx.createGain(),p=panner(out,between(-.3,.3));chain(n,bp,hg,p);
    const end=env(hg.gain,t,g,between(.2,.35),between(.1,.5),between(2,3.5));n.stop(end+.05);return end}
  // Wind gust: a slow low-passed swell that opens up and closes again.
  function gust(t,g,out){const dur=between(3,7),n=noiseSrc(t,dur),lp=filt('lowpass',300),gg=ctx.createGain(),p=panner(out,between(-.6,.6));
    lp.frequency.setValueAtTime(between(250,350),t);lp.frequency.linearRampToValueAtTime(between(800,1300),t+dur*.45);lp.frequency.linearRampToValueAtTime(between(250,350),t+dur);
    chain(n,lp,gg,p);return env(gg.gain,t,g,dur*.45,0,dur*.55)}
  // Two-way radio at the proving ground: a squelch click, a little static, another click.
  function radio(t,g,out){const p=panner(out,between(-.5,.5)),len=between(.3,.8),n=noiseSrc(t,len+.2),bp=filt('bandpass',1800,1.5),rg=ctx.createGain();chain(n,bp,rg,p);
    rg.gain.setValueAtTime(.0001,t);rg.gain.linearRampToValueAtTime(g,t+.005);rg.gain.setValueAtTime(g*.35,t+.03);rg.gain.setValueAtTime(g*.35,t+len);rg.gain.linearRampToValueAtTime(g,t+len+.01);rg.gain.linearRampToValueAtTime(.0001,t+len+.04);return t+len+.1}

  // ---------- Music bus: short original stingers only (no continuous music in this phase) ----------
  function stinger(name){if(!ctx||ctx.state!=='running'||!graph||quiet()||prefs.music<=0)return false;const t=ctx.currentTime+.05;
    if(name==='arrival'){const lp=filt('lowpass',900),sg=ctx.createGain();chain(lp,sg,graph.buses.music);const end=env(sg.gain,t,.06,.9,.6,2.4);
      [110,164.81,220].forEach((f,i)=>{const o=ctx.createOscillator();o.type=i?'sine':'triangle';o.frequency.value=f*between(.998,1.002);o.connect(lp);o.start(t);o.stop(end+.05)});return true}
    return false}

  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',onVisibility);
  // Unlock on the first genuine interaction. Browsers grant activation on different events (touch: touchend), so listen to all four.
  if(typeof window!=='undefined'&&window.addEventListener)for(const type of ['pointerdown','keydown','touchend','click'])window.addEventListener(type,unlock,true);
  return {
    prefs:copy,
    set,
    setLevel:(channel,value)=>CHANNELS.includes(channel)?set({[channel]:value}):copy(),
    setMuted:flag=>set({muted:!!flag}),
    toggleMute:()=>set({muted:!prefs.muted}),
    onChange:fn=>{if(typeof fn==='function')listeners.push(fn)},
    soundOn:()=>soundOn(),
    musicOn:()=>musicOn(),
    channels:()=>CHANNELS.slice(),
    available:()=>!!Ctor(),
    unlock,
    context,
    bus:name=>graph&&graph.buses[name]||null,
    setSoundscape,
    soundscape:()=>wanted?wanted.id:null,
    setDuckProbe:fn=>{duckProbe=typeof fn==='function'?fn:null},
    stinger,
    // Read-only snapshot for tests and diagnostics.
    debug:()=>({context:ctx?ctx.state:null,graph:!!graph,master:graph?graph.master.gain.value:null,hidden,wanted:wanted?wanted.id:null,playing:scape?scape.id:null,events:scape?scape.events.map(e=>e.def.voice):[],scheduler:!!ticker,ducked,voices:voices.length})
  };
})();
