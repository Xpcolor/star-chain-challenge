// Repeatable tuning sample, not a claim about human-player win rates.
import {ROBOTS,createGame,selectModule,observation,legalMoves,chooseBotMove,chooseBotSupply,playAndClaim,rest,takeCard,audit} from '../dist/engine.mjs';

function rng(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
const count=Number(process.argv[2]||24);
if(!Number.isInteger(count)||count<2)throw new Error('Use at least two matches per level');
const rows=[];
for(let level=0;level<ROBOTS.length;level++){
  let wins=0,draws=0,points=0,opponentPoints=0,turns=0,maxMs=0,totalMs=0,decisions=0;
  for(let seed=1;seed<=count;seed++){
    const s=createGame({level,seed:seed*9181,first:seed%2}),random=rng(seed*711);selectModule(s,s.moduleOptions[seed%3]);
    let actions=0;
    while(s.phase!=='over'){
      const actor=s.current,obs=observation(s,actor);let selected;
      if(actor===0){
        // A fixed, moderately attentive reference: sample eight ordinary/wild
        // possibilities, then choose the best immediate damage plus healing among them.
        const options=legalMoves(obs,{allowAccel:false});
        const pool=options.length?options:legalMoves(obs);const sample=[];
        if(pool.length)for(let k=0;k<8;k++)sample.push(pool[Math.floor(random()*pool.length)]);
        selected=sample.sort((a,b)=>b.points-a.points||a.move.ids.length-b.move.ids.length)[0];
      }else{
        const start=performance.now();selected=chooseBotMove(obs,random());const ms=performance.now()-start;
        maxMs=Math.max(maxMs,ms);totalMs+=ms;decisions++;
      }
      if(selected)playAndClaim(s,selected.move);else rest(s,s.hands[actor].slice(0,2).map(c=>c.id),s.goals[0]);
      while(s.phase==='refill')takeCard(s,actor===0?'deck':chooseBotSupply(observation(s,actor),random()));
      audit(s);
      if(++actions>24)throw new Error('Match exceeded 12 rounds');
    }
    wins+=s.winner===1;draws+=s.winner==='draw';points+=s.hp[1];opponentPoints+=s.hp[0];turns+=s.turns[1];
  }
  const row={level:level+1,name:ROBOTS[level].name,matches:count,robotWins:wins,draws,robotWinRate:+(wins/count).toFixed(3),averageMargin:+((points-opponentPoints)/count).toFixed(2),averageDecisionMs:+(totalMs/decisions).toFixed(1),maxDecisionMs:+maxMs.toFixed(1)};
  rows.push(row);console.log(JSON.stringify(row));
}
console.log(JSON.stringify({note:'Same reference policy across all levels; sampled results are not human win-rate estimates.',rows}));
