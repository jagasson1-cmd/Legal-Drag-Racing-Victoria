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

  // ---------- Effects bus: one-shot game cues ----------
  // A cue plays only when the context is already running and effects are audible. Otherwise it is dropped, never queued,
  // so nothing builds up while audio is locked or the tab is hidden and bursts out on the first tap.
  // Returns a handle whose stop() fades the cue out (for a skipped scene), or null when nothing played.
  // No piling up: one moment in the game (a race payout with a badge and a new bay, say) produces one cue, not a stack.
  // - Cues that arrive within WINDOW seconds of each other collapse to the most important: a weaker cue arriving after a
  //   stronger or equal one is dropped; a stronger one fades out the weaker one already playing.
  // - Each cue has its own cooldown, so a run of payouts doesn't chatter.
  // - reserve(level,seconds) holds the bus for another sound (the race result chord): cues at or below that level are
  //   dropped meanwhile; stronger cues wait until it ends.
  const CUES={
    cashIn:{priority:1,cooldown:.4,voice:(t,out,o)=>cashIn(t,out,o)},
    cashOut:{priority:1,cooldown:.4,voice:(t,out)=>cashOut(t,out)},
    upgradeInstalled:{priority:2,cooldown:.6,voice:(t,out)=>ratchet(t,out)},
    achievement:{priority:3,cooldown:1,voice:(t,out)=>achievement(t,out)},
    garageExpanded:{priority:4,cooldown:3,voice:(t,out)=>garageDoor(t,out)}};
  const WINDOW=.6;
  let lastCue=null,recent=[],reserved={level:0,until:0};const played=[];
  function cue(name,opts={}){const def=CUES[name];if(!def||!ctx||ctx.state!=='running'||!graph||!canSynth()||quiet()||prefs.effects<=0)return null;
    const now=ctx.currentTime;recent=recent.filter(r=>now-r.at<3);
    if(recent.some(r=>r.name===name&&now-r.at<def.cooldown))return null;
    if(recent.some(r=>now-r.at<WINDOW&&r.priority>=def.priority))return null;
    let delay=Math.max(0,Number(opts.delay)||0);
    if(now<reserved.until){if(def.priority<=reserved.level)return null;delay=Math.max(delay,reserved.until-now)}
    const out=ctx.createGain(),t=now+.04+delay;out.connect(graph.buses.effects);let end=0;
    try{end=def.voice(t,out,opts)}catch(e){end=0}
    const drop=()=>{try{out.disconnect()}catch(e){}};
    if(!end){drop();return null}
    const handle={name,stop(fade=.25){const n=ctx.currentTime;try{out.gain.cancelScheduledValues(n);out.gain.setTargetAtTime(.0001,n,Math.max(.02,fade/3))}catch(e){}setTimeout(drop,Math.round(fade*1000)+200)}};
    for(const r of recent)if(now-r.at<WINDOW&&r.priority<def.priority){try{r.handle.stop(.08)}catch(e){}}
    recent.push({name,priority:def.priority,at:now,handle});
    lastCue={name,at:t,end};played.push(name);if(played.length>20)played.shift();
    setTimeout(drop,Math.round((end-ctx.currentTime)*1000)+500);
    return handle}
  function reserve(level,seconds){if(ctx&&ctx.state==='running')reserved={level:Number(level)||0,until:ctx.currentTime+Math.max(0,Number(seconds)||0)}}
  // Money in: two soft rounded notes a fourth apart with a paper tick; $5,000 or more adds a third note and a little body.
  // Deliberately small: no coin showers or jackpot sounds.
  function cashIn(t,out,o){const large=Number(o&&o.amount)>=5000,notes=large?[659.25,880,1174.66]:[659.25,880];let end=t;
    const lp=filt('lowpass',3200);lp.connect(out);
    notes.forEach((f,i)=>{const at=t+i*.075,o1=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();o1.type='sine';o2.type='triangle';o1.frequency.value=f;o2.frequency.value=f*2.001;
      const g2=ctx.createGain();g2.gain.value=.18;o1.connect(g);o2.connect(g2);g2.connect(g);g.connect(lp);end=Math.max(end,env(g.gain,at,large?.06:.05,.006,.02,large&&i===notes.length-1?.55:.3));o1.start(at);o2.start(at);o1.stop(end+.05);o2.stop(end+.05)});
    const n=noiseSrc(t,.08),hp=filt('highpass',3500),ng=ctx.createGain();chain(n,hp,ng,out);env(ng.gain,t,.018,.002,0,.05);
    if(large){const b=ctx.createOscillator(),bg=ctx.createGain();b.frequency.value=220;b.connect(bg);bg.connect(lp);env(bg.gain,t,.03,.02,.05,.4);b.start(t);b.stop(t+.55)}
    return end}
  // Money out: one low, muted thunk, like a till drawer closing.
  function cashOut(t,out){const o=ctx.createOscillator(),g=ctx.createGain(),lp=filt('lowpass',600);o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(85,t+.14);chain(o,lp,g,out);
    const end=env(g.gain,t,.07,.004,0,.2);o.start(t);o.stop(end+.05);
    const n=noiseSrc(t,.06),bp=filt('bandpass',between(1400,1800),1.2),ng=ctx.createGain();chain(n,bp,ng,out);env(ng.gain,t,.022,.002,0,.035);return end}
  // Upgrade fitted: a ratchet run (bandpassed noise ticks), then the click of a torque wrench reaching its setting.
  function ratchet(t,out){const n=noiseSrc(t,.6),bp=filt('bandpass',between(2600,3200),3),rg=ctx.createGain(),p=panner(out,between(-.25,.25));chain(n,bp,rg,p);rg.gain.setValueAtTime(.0001,t);
    const clicks=5,gap=between(.042,.052);for(let i=0;i<clicks;i++){const at=t+i*gap;rg.gain.setValueAtTime(.0001,at);rg.gain.linearRampToValueAtTime(.05,at+.003);rg.gain.exponentialRampToValueAtTime(.0001,at+.03)}
    const at=t+clicks*gap+.12,f0=between(1700,2100);let end=at;
    [[1,1],[2.76,.45],[5.4,.2]].forEach(([r,a])=>{const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.value=f0*r;o.connect(og);og.connect(p);end=Math.max(end,env(og.gain,at,.07*a,.002,0,.18/r**.3));o.start(at);o.stop(end+.05)});
    const k=noiseSrc(at,.04),kh=filt('highpass',2500),kg=ctx.createGain();chain(k,kh,kg,p);env(kg.gain,at,.04,.001,0,.025);return end}
  // Badge earned: a timing-slip printer's short chatter, then one clear bell with inharmonic partials.
  function achievement(t,out){const len=.32,n=noiseSrc(t,len+.05),bp=filt('bandpass',2200,1.6),am=ctx.createGain(),pg=ctx.createGain(),lfo=ctx.createOscillator(),depth=ctx.createGain();
    lfo.type='square';lfo.frequency.value=between(34,40);depth.gain.value=.5;am.gain.value=.5;lfo.connect(depth);depth.connect(am.gain);chain(n,bp,am,pg,out);env(pg.gain,t,.03,.01,len-.06,.05);lfo.start(t);lfo.stop(t+len+.05);
    const at=t+len+.08,f0=1318.5;let end=at;
    [[1,1],[2.01,.32],[2.76,.18],[4.07,.08]].forEach(([r,a])=>{const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.value=f0*r;o.connect(og);og.connect(out);end=Math.max(end,env(og.gain,at,.065*a,.003,0,1.3/r**.4));o.start(at);o.stop(end+.05)});
    return end}
  // A roller door going up (slats rattling over the drum, a low motor rumble, a clunk at the top), then fluorescent tubes
  // tinking on and settling to a quiet 100 Hz mains hum. About 4.5 s.
  function garageDoor(t,out){const up=1.5;
    const n=noiseSrc(t,up+.3),bp=filt('bandpass',between(650,800),1.4),lp=filt('lowpass',2600),am=ctx.createGain(),rg=ctx.createGain(),lfo=ctx.createOscillator(),depth=ctx.createGain();
    lfo.type='square';lfo.frequency.setValueAtTime(between(15,18),t);lfo.frequency.linearRampToValueAtTime(between(10,12),t+up);depth.gain.value=.45;am.gain.value=.55;lfo.connect(depth);depth.connect(am.gain);
    bp.frequency.setValueAtTime(between(650,800),t);bp.frequency.linearRampToValueAtTime(between(900,1100),t+up);
    chain(n,bp,lp,am,rg,out);env(rg.gain,t,.11,.12,up-.4,.3);lfo.start(t);lfo.stop(t+up+.3);
    const rn=noiseSrc(t,up+.3),rl=filt('lowpass',140),rgn=ctx.createGain();chain(rn,rl,rgn,out);env(rgn.gain,t,.09,.2,up-.5,.4);
    const top=t+up,k=ctx.createOscillator(),kg=ctx.createGain();k.type='triangle';k.frequency.setValueAtTime(110,top);k.frequency.exponentialRampToValueAtTime(55,top+.15);k.connect(kg);kg.connect(out);env(kg.gain,top,.12,.004,0,.22);k.start(top);k.stop(top+.3);
    let at=top+.15;for(let i=0;i<3;i++){const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.value=between(2800,3600);o.connect(og);og.connect(out);env(og.gain,at,.025,.002,0,.08);o.start(at);o.stop(at+.12);at+=between(.12,.28)}
    const h=ctx.createOscillator(),h2=ctx.createOscillator(),hg=ctx.createGain(),h2g=ctx.createGain();h.frequency.value=100;h2.frequency.value=200;h2g.gain.value=.4;h.connect(hg);h2.connect(h2g);h2g.connect(hg);hg.connect(out);
    const end=env(hg.gain,at,.018,.3,1.2,1.2);h.start(at);h2.start(at);h.stop(end+.05);h2.stop(end+.05);return end}

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
    cue,
    reserve,
    // Read-only snapshot for tests and diagnostics.
    debug:()=>({context:ctx?ctx.state:null,graph:!!graph,master:graph?graph.master.gain.value:null,hidden,wanted:wanted?wanted.id:null,playing:scape?scape.id:null,events:scape?scape.events.map(e=>e.def.voice):[],scheduler:!!ticker,ducked,voices:voices.length,lastCue:lastCue?lastCue.name:null,cues:played.slice()})
  };
})();
