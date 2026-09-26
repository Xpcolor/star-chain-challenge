import {legalMoves,evaluateMove} from '../dist/engine.mjs';
import {moduleById} from '../dist/tactics.mjs';
export const randomFor=seed=>{let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};};
export function mix(seed){let x=seed>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return(x^(x>>>16))>>>0;}
const cost=(obs,m)=>(m.move.ids.length-1)*.06+m.move.ids.reduce((n,id)=>n+Number(obs.hand.find(c=>c.id===id)?.type==='W')*.1,0);
export function distinct(obs,moves){
  const map=new Map();for(const m of moves){const k=[m.move.chain,m.info.after,m.move.ops.includes(1),m.move.ops.includes(-1)].join(':');const prev=map.get(k);if(!prev||m.points-cost(obs,m)>prev.points-cost(obs,prev))map.set(k,m);}return [...map.values()];
}
export function referenceMove(obs,random,attention,options=distinct(obs,legalMoves(obs))){
  if(!options.length)return null;
  let seen=options;
  if(attention&&seen.length>attention){seen=[...seen];for(let i=0;i<attention;i++){const j=i+Math.floor(random()*(seen.length-i));[seen[i],seen[j]]=[seen[j],seen[i]];}seen=seen.slice(0,attention);}
  let best=-Infinity,choices=[];
  for(const m of seen){
    const prep=obs.moduleId==='circuit'&&obs.moduleProgress.uses<moduleById('circuit').limit?0.18*(m.nextModuleProgress.circuit.length-obs.moduleProgress.circuit.length):0;
    const finalWin=obs.round>=12&&obs.turnInRound===1&&obs.hp[obs.actor]+m.healing>obs.hp[1-obs.actor]-m.damage;
    const rank=Number(m.lethal||finalWin)*100+m.points-cost(obs,m)+prep;
    if(rank>best+1e-8){best=rank;choices=[m];}else if(Math.abs(rank-best)<1e-8)choices.push(m);
  }
  return choices[Math.floor(random()*choices.length)];
}
export function referenceSupply(obs,random){
  function value(c){
    if(c.type==='W')return 5;
    if(c.type==='A')return obs.hand.filter(x=>x.type==='N').length>=2?3:0;
    if(c.type==='J'){
      let gain=0;for(let chain=0;chain<3;chain++)try{gain=Math.max(gain,evaluateMove({...obs,hand:[...obs.hand,c]},{chain,ids:[c.id],ops:[]}).points);}catch{}
      return Math.min(4,1+gain);
    }
    return 2-Number(obs.hand.some(x=>x.type==='N'&&x.value===c.value));
  }
  const scores=obs.market.map(value),best=Math.max(...scores),options=[0,1,2].filter(i=>scores[i]===best);return options[Math.floor(random()*options.length)];
}
