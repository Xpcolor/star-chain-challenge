// Offline experiment only. Never imported by the app; default game rules stay unchanged.
import {createGame,rollInitiative,selectModule,selectSector,chooseSector,selectBoon,chooseBoon,observation,legalMoves,includeCalibrate,playAndClaim,rest,transfer,takeCard,audit,chooseTransfer,chooseBotMove,chooseBotSupply} from '../dist/engine.mjs';
import {writeFileSync,appendFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const count=Number(process.argv[2]||256),out=process.argv[3]||'.local/qa/rule-experiment',scope=process.argv[4]||'all';
mkdirSync(out,{recursive:true});
const legacy={rulesVersion:'flight-records-2',hp:18,extraZone:false,repairSlots:3,dockCount:0,barterCount:0};
const configs={legacy,legacyFull:{...legacy,hp:24,extraZone:true,repairSlots:4,dockCount:2,barterCount:2},baseline:{hp:18,extraZone:false,repairSlots:3,dockCount:0,barterCount:0},hp24:{hp:24},four24:{hp:24,extraZone:true,repairSlots:4},dock24:{hp:24,extraZone:true,repairSlots:4,dockCount:2},full:{hp:24,extraZone:true,repairSlots:4,dockCount:2,barterCount:2}};
const rng=seed=>{let x=seed>>>0;return()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296)};
const best=(obs,random,mode)=>{
 let moves=includeCalibrate(obs,legalMoves(obs));if(!moves.length)return null;
 if(mode==='sampled'){const pool=[];for(let i=0;i<24;i++)pool.push(moves[Math.floor(random()*moves.length)]);moves=pool;}
 const rank=m=>Number(m.lethal)*1000+m.points-(m.move.ids.length-1)*.06-(m.move.calibrate?.25:0);
 let score=-Infinity,ties=[];for(const m of moves){const v=rank(m);if(v>score+1e-8){score=v;ties=[m]}else if(Math.abs(v-score)<1e-8)ties.push(m)}
 return ties[Math.floor(random()*ties.length)];
};
const supply=(obs,random)=>{
 let value=-Infinity,options=[];
 for(let i=0;i<obs.market.length;i++){
  const c=obs.market[i],moves=legalMoves({...obs,hand:[...obs.hand,c]});
  const v=Math.max(0,...moves.filter(m=>m.move.ids.includes(c.id)).map(m=>m.points))*2+(c.type==='W'?2.5:c.type==='A'?1:c.type==='B'?0:.5);
  if(v>value){value=v;options=[i]}else if(v===value)options.push(i);
 }
 return options[Math.floor(random()*options.length)];
};
// A B card costs the whole turn. Only prepare a swap when no positive immediate play exists.
// Uses public hands/market/current board, never future deck order.
const barter=(obs)=>{
 const bar=obs.hand.find(c=>c.type==='B');if(!bar)return null;let value=0,choice=null;
 for(const give of obs.hand.filter(c=>c.id!==bar.id))for(let index=0;index<obs.market.length;index++){
  const hand=[...obs.hand.filter(c=>c.id!==bar.id&&c.id!==give.id),obs.market[index]];
  const gain=Math.max(0,...legalMoves({...obs,hand}).map(m=>m.points));
  if(gain>value){value=gain;choice={give:give.id,index}}
 }
 return choice;
};
function setup(config,level,seed){const s=createGame({choices:true,level,seed,...configs[config]});selectModule(s,s.moduleOptions[seed%3]);while(s.phase==='opening')rollInitiative(s);return s;}
function mirror(s){const m=structuredClone(s);for(const key of ['hands','hp','shields','calibrates','modules','moduleProgress','challengeProgress','turns','damageTotal','healingTotal'])m[key].reverse();m.first=1-s.first;m.current=1-s.current;m.dice=m.dice.map(d=>d.slice().reverse());return m;}
function run(s,seed,policy='greedy',mirrored=false){
 const randoms=[rng(seed^0x441),rng(seed^0x771)];if(mirrored)randoms.reverse();
 const metrics={actions:0,doubleHits:0,damageAndHealing:0,barterUses:0,dockUses:0,barterHeld:0,barterOpportunities:0,playedTypes:{},trace:[]};
 while(s.phase!=='over'){
  if(s.phase==='sector'){selectSector(s,chooseSector(s));continue}if(s.phase==='boon'){selectBoon(s,chooseBoon(s));continue}
  assert.equal(s.phase,'action');const actor=s.current,random=randoms[actor];let obs=observation(s,actor);
  if(s.rulesVersion==='flight-records-3'){for(let n=0;n<2;n++){const swap=chooseTransfer(obs);if(!swap)break;const before=structuredClone({hp:s.hp,board:s.board,turns:s.turns});transfer(s,swap.giveId,swap.marketIndex);metrics.barterUses++;assert.equal(s.phase,'action');assert.deepEqual({hp:s.hp,board:s.board,turns:s.turns},before);obs=observation(s,actor);}}
  const ai=policy==='pve'&&actor===(mirrored?0:1);
  const chosen=ai?chooseBotMove(obs,random()):best(obs,random,policy==='pve'?'sampled':policy);
  const hasB=obs.hand.some(c=>c.type==='B');if(hasB)metrics.barterHeld++;
  const swap=s.rulesVersion!=='flight-records-3'&&hasB&&(!chosen||chosen.points<=0)?barter(obs):null;if(swap)metrics.barterOpportunities++;
  const before=[...s.hp];
  if(swap){transfer(s,swap.give,swap.index);metrics.barterUses++;assert.deepEqual(s.hp,before)}
  else if(chosen){
   const types=chosen.move.ids.map(id=>obs.hand.find(c=>c.id===id).type);for(const type of types)metrics.playedTypes[type]=(metrics.playedTypes[type]||0)+1;
   metrics.dockUses+=types.includes('D');playAndClaim(s,chosen.move);
   assert.equal(s.hp[actor],before[actor]+chosen.healing);assert.equal(s.hp[1-actor],Math.max(0,before[1-actor]-chosen.damage));
   assert.ok(s.lastAction.claimed.length<=(s.rulesVersion==='flight-records-3'?s.goals.length:2));metrics.doubleHits+=s.lastAction.claimed.length===2;metrics.damageAndHealing+=s.lastAction.rawDamage>0&&s.lastAction.healing>0;
  }else rest(s,obs.hand.slice(0,2).map(c=>c.id),s.goals[0]);
  metrics.trace.push({actor,board:[...s.board],hp:[...s.hp],swap:!!swap,move:chosen&&!swap?chosen.move:null});
  while(s.phase==='refill'){const o=observation(s,actor);takeCard(s,ai?chooseBotSupply(o,random()):supply(o,random));}
  audit(s);if(++metrics.actions>24)throw Error('Exceeded 12 rounds');
 }
 assert.ok(s.hp[0]===0||s.hp[1]===0||s.round===12);
 return {...metrics,round:s.round,winner:s.winner,first:s.first,hp:s.hp,damage:s.damageTotal,healing:s.healingTotal,ko:s.hp.includes(0),module:s.modules,sector:s.sectorId};
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function summary(rows){
 const rounds=rows.map(r=>r.round).sort((a,b)=>a-b),scores=rows.map(r=>r.winner==='draw'?.5:Number(r.winner===r.first)),m=mean(scores),se=Math.sqrt(scores.reduce((s,x)=>s+(x-m)**2,0)/(scores.length-1)/scores.length),actions=rows.reduce((s,r)=>s+r.actions,0);
 return {games:rows.length,roundMean:mean(rounds),roundMedian:rounds[Math.floor(rounds.length/2)],roundP10:rounds[Math.floor(rounds.length*.1)],roundP90:rounds[Math.floor(rounds.length*.9)],firstScore:m,firstScore95:[Math.max(0,m-1.96*se),Math.min(1,m+1.96*se)],koRate:mean(rows.map(r=>+r.ko)),capRate:mean(rows.map(r=>+(!r.ko&&r.round===12))),drawRate:mean(rows.map(r=>+(r.winner==='draw'))),robotScore:mean(rows.map(r=>r.winner==='draw'?.5:Number(r.winner===1))),doubleHitRate:rows.reduce((s,r)=>s+r.doubleHits,0)/actions,damageHealingRate:rows.reduce((s,r)=>s+r.damageAndHealing,0)/actions,dockPerGame:mean(rows.map(r=>r.dockUses)),barterPerGame:mean(rows.map(r=>r.barterUses)),barterHeldTurns:mean(rows.map(r=>r.barterHeld)),winnerHp:mean(rows.filter(r=>r.winner!=='draw').map(r=>r.hp[r.winner])),actionsPerGame:actions/rows.length};
}
const groups=[],all=[],start=Date.now();writeFileSync(out+'/matches.jsonl','');
function batch(config,level,policy,n,offset){
 const rows=[];for(let i=0;i<n;i++){
  const seed=(offset+i*9181)>>>0,result=run(setup(config,level,seed),seed,policy);delete result.trace;
  const row={config,level:level+1,policy,seed,...result};rows.push(row);appendFileSync(out+'/matches.jsonl',JSON.stringify(row)+'\n');
 }
 all.push(...rows);const g={config,level:level+1,policy,...summary(rows)};groups.push(g);console.log(JSON.stringify(g));writeFileSync(out+'/partial.json',JSON.stringify(groups,null,2));
}
if(scope!=='pve'&&scope!=='v3'){
 for(const policy of ['greedy','sampled'])for(const level of [2,6,12])for(const config of ['baseline','full'])batch(config,level,policy,policy==='greedy'?count:Math.max(32,count/2),20260927);
 for(const config of ['hp24','four24','dock24'])batch(config,6,'greedy',Math.max(32,count/2),20260927);
}
if(scope==='v3'){for(const level of [2,7,12])for(const config of ['legacy','baseline','legacyFull','full'])batch(config,level,'greedy',count,20260927);}
for(const level of scope==='pve'||scope==='v3'?Array.from({length:16},(_,i)=>i):[0,2,5,6,9,12,15])for(const config of (scope==='v3'?['legacy',level>=7?'full':'baseline']:['baseline','full']))batch(config,level,'pve',scope==='v3'?32:scope==='pve'?count:16,97260927);
let mirroredPairs=0;
if(scope!=='pve')for(const config of ['baseline','full'])for(let i=0;i<24;i++){
 const seed=49260927+i*7919,s=setup(config,i%16,seed),a=run(structuredClone(s),seed),b=run(mirror(s),seed,'greedy',true);
 assert.equal(a.round,b.round);assert.equal(a.winner==='draw'?'draw':1-a.winner,b.winner);assert.deepEqual(a.hp.slice().reverse(),b.hp);
 assert.deepEqual(a.trace.map(t=>({...t,actor:1-t.actor,hp:t.hp.slice().reverse()})),b.trace);mirroredPairs++;
}
const report={generatedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-start)/1000,sourceHash:createHash('sha256').update(readFileSync('dist/engine.mjs')).digest('hex'),configs,method:{count,seedOffset:20260927,pairedConfigurations:true,confidence:'95% normal intervals across distinct seeds within one group; variants/levels reuse seeds and must not be pooled as independent trials',policies:'greedy: lethal then immediate shield-inclusive attack + healing, small card/calibration conservation tiebreak; sampled: 24 candidate sample; PvE: sampled reference versus actual level bot, V3 B immediate swap only when its visible post-swap best move improves; legacy B only with no positive direct play',limits:'Not human win rates. Automated immediate policies, not human win rates or enjoyment. Baseline/full comparisons force matching HP/slot settings; actual level ladder is baseline1-7/full8-16.'},groups,mirroredPairs,mirroredGames:mirroredPairs*2,totalGames:all.length+mirroredPairs*2};
writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({done:true,totalGames:report.totalGames,mirroredPairs,seconds:report.elapsedSeconds}));
