import {createWriteStream,readFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.mjs';
import {LEVEL_COUNT} from '../dist/difficulty.mjs';
import {MODULES,SECTORS} from '../dist/tactics.mjs';
import {referenceMove,referenceSupply,randomFor,mix} from './ladder-reference.mjs';
import {previewCard,recap} from './ladder-checks.mjs';
export const CONFIG={handSize:6,wildCount:3,accelCount:3,warpCount:2};

export function match({seed,first,modules,sectorId,attention=24,level=LEVEL_COUNT-1,style='neutral',baseline=false,mirror=false}){
  const engine=E;
  const s=engine.createGame({...CONFIG,seed,first,modules,sectorId,level});
  const random=[randomFor(mix(seed^0x12345678)),randomFor(mix(seed^0x87654321))];
  const ledger=[],plays={N:0,W:0,A:0,J:0};let previewChecks=0,botMs=0,botDecisions=0;
  while(s.phase!=='over'){
    const actor=s.current,obs=engine.observation(s,actor),before=[...s.hp];
    let move;
    if(actor===1||mirror){const t=performance.now();move=engine.chooseBotMove(obs,random[actor](),style);botMs+=performance.now()-t;botDecisions++;}
    else move=referenceMove(obs,random[actor],attention);
    if(move){
      const snapshot=JSON.stringify(s),preview=previewCard(obs,move.move);
      assert.equal(JSON.stringify(s),snapshot,'Preview mutated state');
      const type=obs.hand.find(c=>move.move.ids.includes(c.id)&&c.type!=='N')?.type||'N';plays[type]++;
      engine.playAndClaim(s,move.move);
      const actual=s.lastAction;
      assert.deepEqual([actual.before,actual.after,actual.rawDamage,actual.blockedDamage,actual.actualDamage,actual.healing,actual.claimed,actual.challengeAwards],
        [preview.from,preview.to,preview.attack,preview.blocked,preview.hpLoss,preview.healing,preview.goalIds,preview.repairIds]);
      assert.equal(s.hp[actor]-before[actor],preview.healing);assert.equal(before[1-actor]-s.hp[1-actor],preview.hpLoss);
      if(type==='J'){assert.deepEqual(actual.ops,[]);assert.equal(actual.after,20-actual.before);assert.equal(preview.warp,true);}
      previewChecks++;
    }else engine.rest(s,s.hands[actor].slice(0,2).map(x=>x.id),s.goals[0]);
    const a=s.lastAction;
    ledger.push({actor,round:s.round,damage:before[1-actor]-s.hp[1-actor],healing:s.hp[actor]-before[actor],raw:a.rawDamage||0,blocked:a.blockedDamage||0,repairs:a.challengeAwards.length,moduleBonus:(a.moduleDamage||0)+(a.moduleHealing||0),claimed:a.claimed.length,hp:[...s.hp]});
    while(s.phase==='refill')engine.takeCard(s,(actor===1||mirror)?engine.chooseBotSupply(engine.observation(s,actor),random[actor]()):referenceSupply(engine.observation(s,actor),random[actor]));
    engine.audit(s);
    for(let p=0;p<2;p++)assert.equal(s.hp[p],18+s.healingTotal[p]-s.damageTotal[1-p]);
    assert.ok(ledger.length<=24);
  }
  let recapChecks=0;const summaries=[];
  for(let actor=0;actor<2;actor++){
    const report=recap(s,actor),own=ledger.filter(x=>x.actor===actor),enemy=ledger.filter(x=>x.actor!==actor);
    assert.deepEqual(report.summary,{maxHit:Math.max(0,...own.map(x=>x.damage)),healing:own.reduce((a,x)=>a+x.healing,0),repairs:own.reduce((a,x)=>a+x.repairs,0),enemyRepairs:enemy.reduce((a,x)=>a+x.repairs,0),moduleUses:own.filter(x=>x.moduleBonus>0).length});
    assert.equal(report.summary.healing,s.healingTotal[actor]);summaries.push(report);recapChecks++;
  }
  // Only completed rounds (or terminal state) are sampled, avoiding first-action sawtooth leads.
  const roundPoints=ledger.filter((x,i)=>i%2===1||i===ledger.length-1);
  const leads=roundPoints.map(x=>Math.sign(x.hp[0]-x.hp[1])).filter(Boolean);
  const winnerSign=s.winner==='draw'?0:s.winner===0?1:-1;
  const trailing=s.winner==='draw'?false:roundPoints.some(x=>(x.hp[0]-x.hp[1])*winnerSign<=-5);
  return {seed,first,modules,sectorId,attention,level,style,baseline,mirror,winner:s.winner,
    score:s.winner==='draw'?.5:Number(s.winner===0),firstScore:s.winner==='draw'?.5:Number(s.winner===first),
    initiativeShield:s.shieldAllowance,hp:s.hp,rounds:s.round,margin:Math.abs(s.hp[0]-s.hp[1]),largeMargin:Math.abs(s.hp[0]-s.hp[1])>=10,
    leadExchange:leads.includes(1)&&leads.includes(-1),comeback5:trailing,
    previewChecks,recapChecks,plays,botMs,botDecisions,ledger,recaps:summaries};
}

export function scenarioAt(base,i){return {seed:mix(base+i),modules:[MODULES[i%6].id,MODULES[Math.floor(i/6)%6].id],sectorId:SECTORS[(i+Math.floor(i/6))%6].id};}

async function main(){
  const [mode,nText,seedText,file,fromText='1',toText=String(LEVEL_COUNT)]=process.argv.slice(2),n=Number(nText),base=Number(seedText);
  if(!['ladder','mirror'].includes(mode)||!Number.isInteger(n)||n<1||!file)throw Error('mode n seed output.jsonl');
  const out=createWriteStream(file);let rows=0,uniqueGames=0;
  async function write(x){if(!out.write(JSON.stringify({mode,base,...x})+'\n'))await once(out,'drain');rows++;}
  {
    const attentions=mode==='mirror'?[24]:[8,24];
    const levels=Array.from({length:LEVEL_COUNT},(_,i)=>i).filter(x=>x>=Number(fromText)-1&&x<=Number(toText)-1);
    for(const attention of attentions)for(const level of levels){
      for(let i=0;i<n;i++)for(const first of [0,1])for(const style of ['neutral']){
        const result=match({...scenarioAt(base,i),first,attention,level,style,mirror:mode==='mirror'});uniqueGames++;
        await write({scenario:i,...result});
      }
      process.stderr.write(`${mode} ref${attention} level${level+1}: ${rows}\n`);
    }
  }
  out.end();await once(out,'finish');console.log(JSON.stringify({mode,rows,uniqueGames,file}));
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await main();
