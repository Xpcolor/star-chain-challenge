// Seeded diagnostic matches, not human win-rate evidence.
// node tests/fairness.mjs [samples-per-pair=2] [seed=101] [greedy|sampled] [matrix|baseline] [shield=3]
import {INITIATIVE_SHIELD,createGame,observation,legalMoves,playAndClaim,rest,takeCard,audit} from '../dist/engine.mjs';
import {MODULES,SECTORS,moduleById} from '../dist/tactics.mjs';
const samples=Number(process.argv[2]||2),offset=Number(process.argv[3]||101),policy=process.argv[4]||'greedy',shield=Number(process.argv[6]??INITIATIVE_SHIELD);
if(!Number.isInteger(samples)||samples<1||!Number.isFinite(offset)||!['greedy','sampled'].includes(policy)||!Number.isInteger(shield)||shield<0||shield>6||!['matrix','baseline'].includes(process.argv[5]||'matrix'))throw new Error('Invalid simulation arguments');
const rng=seed=>{let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};};
function decide(obs,random){
  let options=legalMoves(obs);if(!options.length)return null;
  if(policy==='sampled'){
    const seen=new Map();for(let i=0;i<24;i++){const m=options[Math.floor(random()*options.length)];seen.set(JSON.stringify(m.move),m);}options=[...seen.values()];
  }
  let best=-Infinity,choices=[];
  for(const m of options){
    const prep=obs.moduleId==='circuit'&&obs.moduleProgress.uses<moduleById('circuit').limit?0.18*(m.nextModuleProgress.circuit.length-obs.moduleProgress.circuit.length):0;
    const score=Number(m.lethal)*100+m.points-0.06*(m.move.ids.length-1)+prep;
    if(score>best+1e-8){best=score;choices=[m];}else if(Math.abs(score-best)<1e-8)choices.push(m);
  }
  return choices[Math.floor(random()*choices.length)];
}
function supply(obs,random){
  const score=c=>c.type==='W'?5:c.type==='A'?(obs.hand.filter(x=>x.type==='N').length>=2?3:0):2-Number(obs.hand.some(x=>x.type==='N'&&x.value===c.value));
  const values=obs.market.map(score),best=Math.max(...values),choices=[0,1,2].filter(i=>values[i]===best);
  return choices[Math.floor(random()*choices.length)];
}
function match(seed,first,modules,sectorId){
  const s=createGame({seed,first,modules,sectorId,initiativeShield:process.argv[5]==='baseline'?0:shield}),streams=[rng(seed^0x12345678),rng(seed^0x87654321)];let decisions=0;
  while(s.phase!=='over'){
    const actor=s.current,obs=observation(s,actor),choice=decide(obs,streams[actor]),before=[...s.hp];
    if(choice){const result=playAndClaim(s,choice.move);if(result.damage!==choice.damage||result.healing!==choice.healing||s.hp[actor]!==before[actor]+choice.healing||s.hp[1-actor]!==Math.max(0,before[1-actor]-choice.damage))throw new Error('Preview/settlement mismatch');}
    else rest(s,s.hands[actor].slice(0,2).map(c=>c.id),s.goals[0]);
    while(s.phase==='refill')takeCard(s,supply(observation(s,actor),streams[actor]));
    audit(s);for(let p=0;p<2;p++)if(s.hp[p]!==18+s.healingTotal[p]-s.damageTotal[1-p])throw new Error('HP conservation failed');
    if(++decisions>24)throw new Error('Run exceeded 12 rounds');
  }
  return s;
}
if(process.argv[5]==='baseline'){
  let count=0,firstWins=0,draws=0,rounds=0,knockouts=0;
  for(let field=0;field<6;field++)for(let sample=0;sample<samples;sample++)for(const first of [0,1]){
    const s=match((offset+sample*104729+field*7919)>>>0,first,[null,null],null);
    count++;firstWins+=Number(s.winner===first);draws+=Number(s.winner==='draw');rounds+=s.round;knockouts+=Number(s.hp.includes(0));
  }
  console.log(JSON.stringify({baseline:true,seed:offset,policy,matches:count,firstScoreRate:(firstWins+draws/2)/count,averageRounds:rounds/count,knockouts},null,2));process.exit(0);
}
const stats=()=>({matches:0,wins:0,draws:0,margin:0,bonus:0,uses:0});
const modules=Object.fromEntries(MODULES.map(m=>[m.id,stats()])),sectors=Object.fromEntries(SECTORS.map(s=>[s.id,{matches:0,firstWins:0,draws:0,knockouts:0,rounds:0}]));
let count=0,player0Wins=0,draws=0;
for(let field=0;field<SECTORS.length;field++){
  for(let sample=0;sample<samples;sample++)for(const a of MODULES)for(const b of MODULES)for(const first of [0,1]){
    const seed=(offset+sample*104729+field*7919)>>>0,s=match(seed,first,[a.id,b.id],SECTORS[field].id),sector=sectors[s.sectorId];
    count++;player0Wins+=Number(s.winner===0);draws+=Number(s.winner==='draw');sector.matches++;sector.firstWins+=Number(s.winner===first);sector.draws+=Number(s.winner==='draw');sector.knockouts+=Number(s.hp.includes(0));sector.rounds+=s.round;
    if(a.id!==b.id)for(const actor of [0,1]){const t=modules[s.modules[actor]];t.matches++;t.wins+=Number(s.winner===actor);t.draws+=Number(s.winner==='draw');t.margin+=s.hp[actor]-s.hp[1-actor];t.uses+=s.moduleProgress[actor].uses;t.bonus+=s.history.filter(h=>h.actor===actor).reduce((n,h)=>n+(h.moduleDamage||0)+(h.moduleHealing||0),0);}
  }
  process.stderr.write(`Checked ${SECTORS[field].name}: ${count} matches\n`);
}
const clean=t=>({...t,scoreRate:+((t.wins+t.draws/2)/t.matches).toFixed(4),averageMargin:+(t.margin/t.matches).toFixed(2),averageBonus:+(t.bonus/t.matches).toFixed(2),averageUses:+(t.uses/t.matches).toFixed(2)});
console.log(JSON.stringify({seed:offset,policy,shield,samples,matches:count,player0ScoreRate:(player0Wins+draws/2)/count,modules:Object.fromEntries(Object.entries(modules).map(([id,t])=>[id,clean(t)])),sectors:Object.fromEntries(Object.entries(sectors).map(([id,t])=>[id,{...t,firstScoreRate:(t.firstWins+t.draws/2)/t.matches,averageRounds:t.rounds/t.matches}])),note:'Same policy on both sides; paired first-player swaps. Module statistics exclude identical-module games. Scenario seeds repeat across module pairs; these are diagnostic comparisons, not independent human trials.'},null,2));
