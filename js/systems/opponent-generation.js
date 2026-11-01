// Opponent generation and lineup management: eventProfile, makeOpponents, perfIndex, pickRaceSlots, visibleClues, shuffleIndexes, buildNpcPairIndexes. Moved verbatim, in source order, from index.html (four runs of lines at 9344cc2); see docs/MODULARISATION.md. Classic script: loads after js/data/events.js and before the inline game script.
function eventProfile(ev=EVENT_CALENDAR[0]){let roll=Math.random();let base=roll<.25?{name:'Quiet night',runs:10,raceSlots:4,cars:18,watch:18}:roll<.6?{name:'Normal night',runs:6,raceSlots:6,cars:34,watch:30}:roll<.87?{name:'Busy night',runs:4,raceSlots:8,cars:56,watch:44}:{name:'Packed night',runs:2,raceSlots:8,cars:74,watch:58};base.cars=Math.round(base.cars*(ev.fieldMult||1));base.watch=Math.round(base.watch*(ev.fieldMult||1));base.raceSlots=Math.min(base.raceSlots+Math.floor((ev.reqRespect||0)/10),14);return base;}
function makeOpponents(n,ev=null){let pool=CARS.filter(c=>c.price<34000);let names=['Mick','Sarah','Davo','Jess','Rob','Tayla','Chris','Ari','Ben','Mia','Noah','Eli','Zoe','Jay','Sam','Alex','Riley','Casey'];return Array.from({length:n},(_,i)=>{let base=choice(pool);let trans=base.manual&&(!base.auto||Math.random()<.55)?'manual':'auto';let o=makeOwned(base,trans);let tier=i/n;let level=rand(.9,1.14)+(state.respect/260)+(tier>.75?rand(.02,.12):0)+(ev?ev.opponentBoost||0:0);o.power*=level;o.grip+=rand(-.035,.09)+(tier>.75?.025:0);if(Math.random()<.18){o.weight-=rand(25,90);o.mods.push('Light interior strip');}o.visible=visibleClues(o);o.label=tier>.88?'quick regular':tier>.7?'serious local':'local car';o.driver=choice(names);o.eventIndex=i;o.entryId=o.id+'_'+i+'_'+Math.random().toString(16).slice(2);return o;});}
function perfIndex(c){let driveBonus=(c.drive==='AWD'||c.drive==='4WD')?1.035:1;let aeroPenalty=1-Math.max(0,(c.aero||.32)-.32)*.12;return (c.power/Math.max(700,c.weight))*(c.grip||.84)*driveBonus*aeroPenalty;}
function pickRaceSlots(field,n){
  if(!state.car){return field.slice(0,Math.min(n,field.length)).map((_,i)=>i)}
  let playerScore=perfIndex(state.car);
  let scored=field.map((o,i)=>({i,score:perfIndex(o),gap:Math.abs(perfIndex(o)-playerScore)}));
  let matched=scored.slice().sort((a,b)=>a.gap-b.gap).slice(0,Math.min(n,field.length));
  let obviouslySlower=scored.filter(x=>x.score<playerScore*.88);
  let combined=[];
  for(const item of [...matched,...obviouslySlower]){if(!combined.includes(item.i))combined.push(item.i)}
  return combined.sort((a,b)=>a-b);
}
function visibleClues(o){let clues=[];if(o.grip>.93)clues.push('serious tyres');else if(o.grip>.87)clues.push('good street tyres');else clues.push('street tyres');if(o.power>carById(o.id)?.power*1.08)clues.push('non-factory exhaust');if(o.asp==='turbo'&&o.power>230)clues.push('possible intercooler');if(o.weight<carById(o.id)?.weight-25)clues.push('looks stripped');return clues.join(', ')}
function shuffleIndexes(arr){let out=arr.slice();for(let i=out.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function buildNpcPairIndexes(e,exclude=[]){let banned=new Set(exclude);let indexes=shuffleIndexes(e.opponents.map((_,i)=>i).filter(i=>!banned.has(i)));let pairs=[];for(let i=0;i<indexes.length-1;i+=2){pairs.push([indexes[i],indexes[i+1]]);}return pairs;}
