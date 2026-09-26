import test from 'node:test';import assert from 'node:assert/strict';
import {buildAdvice} from '../dist/advice.mjs';import {fixture} from './record-fixture.mjs';
import {createGame,selectModule,rollInitiative,playAndClaim,rest,takeCard,observation,evaluateMove,legalMoves,ROBOTS} from '../dist/engine.mjs';
import {LEVEL_COUNT} from '../dist/difficulty.mjs';
import {makeRecord,appendEvent,closeRecord} from '../dist/records.mjs';
test('every opponent has a unique name and visible motion/color signature, with existing assets',async()=>{
 const {existsSync}=await import('node:fs');assert.equal(ROBOTS.length,LEVEL_COUNT);assert.equal(new Set(ROBOTS.map(r=>r.name)).size,LEVEL_COUNT);
 assert.equal(new Set(ROBOTS.map(r=>[r.art,r.hue,r.motion,r.duration,r.drift,r.tilt].join(':'))).size,LEVEL_COUNT);
 for(const r of ROBOTS)assert.ok(existsSync(new URL('../dist/assets/enemy-'+r.art+'.png',import.meta.url)));
});
test('48 independent match reviews are pure, replayable, public-information counterfactuals or exact factual summaries',()=>{
 const counts={};
 for(let seed=1;seed<=48;seed++){
  const {record,g}=fixture({seed,actual:seed%LEVEL_COUNT,selected:LEVEL_COUNT-1,winner:seed%2}),before=JSON.stringify(record),advice=buildAdvice(record);assert.equal(JSON.stringify(record),before);assert.ok(advice.evidence&&advice.suggestion);counts[advice.kind]=(counts[advice.kind]||0)+1;
  if(advice.proof.index!==undefined){
   const s=createGame(record.options);
   for(const e of record.events.slice(0,advice.proof.index))switch(e.type){case'module':selectModule(s,e.id);break;case'dice':rollInitiative(s);break;case'play':playAndClaim(s,e.move);break;case'rest':rest(s,e.ids,e.goal);break;case'take':takeCard(s,e.source);break;}
   const p=advice.proof,m=evaluateMove(observation(s,0),p.move);assert.deepEqual(s.board,p.board);assert.equal(s.current,0);assert.equal(s.round,p.round);assert.equal(Math.min(s.hp[1],m.damage),p.damage);assert.equal(m.healing,p.healing);assert.deepEqual(m.chosen,p.goals);assert.deepEqual(m.awarded,p.repairs);assert.equal(m.info.expression,p.expression);if(p.lethal)assert.ok(m.damage>=s.hp[1]);
  }else{
   const own=g.history.filter(h=>h.actor===0&&!h.rest),enemy=g.history.filter(h=>h.actor===1&&!h.rest);
   if(advice.kind==='repair'){assert.equal(advice.proof.repairs,own.reduce((a,h)=>a+h.challengeAwards.length,0));assert.equal(advice.proof.enemyRepairs,enemy.reduce((a,h)=>a+h.challengeAwards.length,0));}
   if(advice.kind==='module')assert.equal(advice.proof.uses,g.moduleProgress[0].uses);
   if(advice.kind==='supply')assert.equal(advice.proof.maxHit,Math.max(0,...own.map(h=>h.actualDamage)));
  }
 }
 console.log(JSON.stringify({reviews:48,kinds:counts}));
});
test('missed finishing move advice proves an immediate win from the actual public position',()=>{
 let verified=false;
 for(let seed=601;seed<633&&!verified;seed++){
  const options={seed,level:LEVEL_COUNT-1},s=createGame(options),record=makeRecord(options,{},1000);let missed=false;
  const event=(type,data)=>appendEvent(record,type,data,1001+record.sequence);
  selectModule(s,s.moduleOptions[0]);event('module',{id:s.modules[0]});
  while(s.phase==='opening')event('dice',{pair:rollInitiative(s).pair});
  while(s.phase!=='over'){
   const actor=s.current,moves=legalMoves(observation(s,actor)).sort((a,b)=>Number(b.lethal)-Number(a.lethal)||b.points-a.points);
   let choice=moves[0];
   if(actor===0&&!missed&&choice?.lethal&&moves.some(m=>!m.lethal)){choice=moves.find(m=>!m.lethal);missed=true;}
   if(choice){playAndClaim(s,choice.move);event('play',{actor,move:choice.move});}else{rest(s,[],null);event('rest',{actor,ids:[],goal:null});}
   while(s.phase==='refill'){takeCard(s,'deck');event('take',{actor,source:'deck'});}
  }
  if(!missed)continue;
  closeRecord(record,s,'finished',1002+record.sequence);const review=buildAdvice(record);assert.equal(review.kind,'finish');
  const before=createGame(options);
  for(const e of record.events.slice(0,review.proof.index))switch(e.type){case'module':selectModule(before,e.id);break;case'dice':rollInitiative(before);break;case'play':playAndClaim(before,e.move);break;case'rest':rest(before,e.ids,e.goal);break;case'take':takeCard(before,e.source);break;}
  assert.equal(before.current,0);playAndClaim(before,review.proof.move);assert.equal(before.phase,'over');assert.equal(before.winner,0);assert.equal(before.hp[1],0);verified=true;
 }
 assert.ok(verified,'A real reachable missed finisher must be verified');
});
