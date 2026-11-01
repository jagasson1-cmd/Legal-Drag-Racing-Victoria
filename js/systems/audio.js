// Audio preferences and the audio manager. Classic script: loads after js/systems/opponent-generation.js and before the
// inline game script. See docs/MODULARISATION.md.
// Preferences live only in localStorage under qmb_audio_prefs_v1: never in the gameplay save (qmb_mvp_save) or the cloud
// payload. On first run they are migrated once from the old qmb_sound_enabled / qmb_music_enabled keys, which are then kept
// only as write-only compatibility mirrors (for rollback to an older build); the preference object is authoritative.
const QMB_AUDIO_PREFS_KEY='qmb_audio_prefs_v1';
const QMB_AUDIO_DEFAULTS=Object.freeze({master:.8,music:.6,ambience:.5,engine:.8,effects:1,muted:false});
const QmbAudio=(()=>{
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
  function persist(){write(QMB_AUDIO_PREFS_KEY,JSON.stringify(prefs));write('qmb_sound_enabled',String(soundOn()));write('qmb_music_enabled',String(musicOn()))}
  function load(){let raw=read(QMB_AUDIO_PREFS_KEY),parsed=null;if(raw){try{parsed=JSON.parse(raw)}catch(e){parsed=null}}
    prefs=parsed&&typeof parsed==='object'&&parsed.version===1?normalise(parsed):migrate();persist()}
  function set(changes){const next=normalise({...prefs,...changes});if(JSON.stringify(next)===JSON.stringify(prefs))return copy();prefs=next;persist();applyLevels();for(const fn of listeners){try{fn(copy())}catch(e){}}return copy()}
  const copy=()=>({...prefs});
  function applyLevels(){} // replaced once the audio graph exists (see the manager below)
  load();
  return {
    prefs:copy,
    set,
    setLevel:(channel,value)=>CHANNELS.includes(channel)?set({[channel]:value}):copy(),
    setMuted:flag=>set({muted:!!flag}),
    toggleMute:()=>set({muted:!prefs.muted}),
    onChange:fn=>{if(typeof fn==='function')listeners.push(fn)},
    soundOn:()=>soundOn(),
    musicOn:()=>musicOn(),
    channels:()=>CHANNELS.slice()
  };
})();
