// Garage expansion scene: a short, skippable full-screen moment when the Shed gains a bay. Classic script: loads after
// js/systems/audio.js and before the inline game script (see docs/MODULARISATION.md). Styles: css/garage-scene.css.
// Presentation only. It reads nothing from the game state and writes nothing to it: the inline game code decides when a
// bay is new, passes the numbers in, and records the scene as seen when onDone runs. If this file fails to load, the
// game keeps working and the bay is still unlocked; only the scene is missing.
const QmbGarageScene=(()=>{
  const SVG='http://www.w3.org/2000/svg';
  const BAY_W=120,BAY_H=100,TOP=24;
  // Door up 0.5-2.0 s, tubes flicker on at 2.1 s, text and Continue by 2.7 s. Matches the cue timing in audio.js.
  const SCENE_MS=3300,SOUND_DELAY=.45;
  let open=null;
  const reducedMotion=()=>{try{return !!(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){return false}};
  const canRender=()=>typeof document!=='undefined'&&!!document.body&&typeof document.body.appendChild==='function'&&typeof document.createElementNS==='function';
  const listWords=nums=>nums.length<2?String(nums[0]):nums.slice(0,-1).join(', ')+' and '+nums[nums.length-1];

  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
  function svg(tag,attrs){const e=document.createElementNS(SVG,tag);for(const k in attrs)e.setAttribute(k,String(attrs[k]));return e}

  // The Shed as a row of bays: parked cars as plain silhouettes, the new bay(s) behind a roller door that lifts.
  function drawShed(capacity,parked,fresh){
    const w=capacity*BAY_W+20,h=TOP+BAY_H+30,root=svg('svg',{viewBox:`0 0 ${w} ${h}`,class:'gsShed',role:'img','aria-label':`The Shed with ${capacity} bays`});
    const defs=svg('defs',{}),cone=svg('linearGradient',{id:'gsCone',x1:0,y1:0,x2:0,y2:1});
    cone.appendChild(svg('stop',{offset:'0','stop-color':'#ffe7b0','stop-opacity':'.55'}));cone.appendChild(svg('stop',{offset:'1','stop-color':'#ffb02e','stop-opacity':'0'}));
    defs.appendChild(cone);root.appendChild(defs);
    root.appendChild(svg('rect',{x:4,y:TOP-14,width:w-8,height:BAY_H+18,rx:3,class:'gsWall'}));
    root.appendChild(svg('rect',{x:0,y:TOP+BAY_H,width:w,height:4,class:'gsSlab'}));
    for(let i=0;i<capacity;i++){
      const n=i+1,x=10+i*BAY_W,isNew=fresh.includes(n),g=svg('g',{class:'gsBay'+(isNew?' gsNew':'')});
      g.appendChild(svg('rect',{x:x+4,y:TOP,width:BAY_W-8,height:BAY_H,class:'gsOpening'}));
      if(isNew){
        g.appendChild(svg('polygon',{points:`${x+42},${TOP+6} ${x+78},${TOP+6} ${x+BAY_W-8},${TOP+BAY_H} ${x+8},${TOP+BAY_H}`,fill:'url(#gsCone)',class:'gsLight'}));
        g.appendChild(svg('rect',{x:x+34,y:TOP+3,width:52,height:4,rx:2,class:'gsTube'}));
        const clipId='gsClip'+n,clip=svg('clipPath',{id:clipId});clip.appendChild(svg('rect',{x:x+4,y:TOP,width:BAY_W-8,height:BAY_H}));defs.appendChild(clip);
        const holder=svg('g',{'clip-path':`url(#${clipId})`}),door=svg('g',{class:'gsDoor'});
        door.appendChild(svg('rect',{x:x+4,y:TOP,width:BAY_W-8,height:BAY_H,class:'gsDoorFace'}));
        for(let s=1;s<10;s++)door.appendChild(svg('line',{x1:x+4,x2:x+BAY_W-4,y1:TOP+s*10,y2:TOP+s*10,class:'gsSlat'}));
        holder.appendChild(door);g.appendChild(holder);
      }else if(i<parked){
        const car=svg('g',{class:'gsCar',transform:`translate(${x+15} ${TOP+BAY_H-34})`});
        car.appendChild(svg('path',{d:'M2 26 L5 17 Q9 15 19 14 L31 7 Q35 5 49 5 L60 6 L72 14 Q84 15 88 19 L88 26 Z'}));
        car.appendChild(svg('circle',{cx:20,cy:27,r:6}));car.appendChild(svg('circle',{cx:70,cy:27,r:6}));
        g.appendChild(car);
      }
      const label=svg('text',{x:x+BAY_W/2,y:TOP+BAY_H+20,'text-anchor':'middle',class:'gsLabel'});label.textContent='BAY '+n;g.appendChild(label);
      root.appendChild(g);
    }
    return root}

  // opts: {bays:[3], previous:2, capacity:3, parked:2, nextRespect:150|null, sound:()=>handle|null, onDone:fn}
  function show(opts){
    if(open||!canRender()||!opts||!Array.isArray(opts.bays)||!opts.bays.length)return false;
    const bays=opts.bays.slice().sort((a,b)=>a-b),capacity=Math.max(1,Number(opts.capacity)||bays[bays.length-1]),previous=Math.max(0,Number(opts.previous)||0);
    const reduced=reducedMotion(),overlay=el('div','gsOverlay'+(reduced?' gsReduced':''));
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','gsTitle');
    const box=el('div','gsBox'),skip=el('button','gsSkip','Skip');skip.type='button';
    const words=el('div','gsWords'),title=el('h2','gsTitle',bays.length===1?`Bay ${bays[0]} is open`:`Bays ${listWords(bays)} are open`);title.id='gsTitle';
    const cap=el('p','gsCap');cap.append(el('span','gsCapLabel','Shed capacity'),el('b','gsCapValue',`${previous} → ${capacity} cars`));
    const next=el('p','gsNext',Number.isFinite(opts.nextRespect)?`Next bay at ${opts.nextRespect} Respect`:'That’s as big as the Shed gets.');
    const cont=el('button','btn gsContinue','Continue');cont.type='button';
    words.append(el('div','gsEyebrow','The Shed'),title,cap,next,cont);
    box.append(drawShed(capacity,Math.min(Number(opts.parked)||0,previous),bays),words);
    overlay.append(skip,box);
    const before=document.activeElement;let sound=null,timer=null,closed=false;
    try{sound=typeof opts.sound==='function'?opts.sound(reduced?0:SOUND_DELAY):null}catch(e){sound=null}
    const settle=()=>{if(closed||overlay.classList.contains('gsDone'))return;overlay.classList.add('gsDone');try{cont.focus()}catch(e){}};
    function close(){if(closed)return;closed=true;clearTimeout(timer);try{if(sound&&sound.stop)sound.stop(.25)}catch(e){}
      // The fading overlay ignores taps (CSS) and is removed when its fade ends, or after a fallback delay.
      document.removeEventListener('keydown',onKey,true);overlay.classList.add('gsLeaving');
      const remove=()=>{try{overlay.remove()}catch(e){}};overlay.addEventListener('animationend',remove);setTimeout(remove,600);open=null;
      try{if(before&&before.focus&&document.body.contains(before))before.focus()}catch(e){}
      if(typeof opts.onDone==='function')opts.onDone()}
    // Escape skips; Tab stays on the scene's two buttons. Space and Enter work through the focused button as usual.
    function onKey(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return}
      if(e.key==='Tab'){const f=[skip,cont].filter(b=>b.offsetParent!==null&&getComputedStyle(b).visibility!=='hidden');if(!f.length)return;e.preventDefault();const i=f.indexOf(document.activeElement);f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}}
    skip.addEventListener('click',close);cont.addEventListener('click',close);
    // A tap on the scene itself (not a button) jumps straight to the finished frame.
    overlay.addEventListener('click',e=>{if(e.target!==skip&&e.target!==cont)settle()});
    document.addEventListener('keydown',onKey,true);
    document.body.appendChild(overlay);
    open={close};
    if(reduced)settle();else{try{skip.focus()}catch(e){}timer=setTimeout(settle,SCENE_MS)}
    return true}

  return {show,active:()=>!!open,close:()=>{if(open)open.close()}};
})();
