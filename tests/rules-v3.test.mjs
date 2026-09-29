import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,selectModule,rollInitiative,warpLandings,inspectMove,evaluateMove,observation,legalMoves,playAndClaim,transfer,takeCard,audit,pinOptionsForMatch} from '../dist/engine.mjs';
import {makeRecord,appendEvent,publicSnapshot,replayRecord} from '../dist/records.mjs';

test('levels 1–7 use 18HP/three slots; 8–16 use 24HP/four slots and D2/B2',()=>{
 for(let level=0;level<16;level++){
  const s=createGame({level,seed:37}),advanced=level>=7,all=[...s.deck,...s.hands.flat(),...s.market];
  assert.deepEqual(s.hp,advanced?[24,24]:[18,18]);
  assert.equal(s.goals.length,advanced?4:3);assert.equal(s.challengeIds.length,advanced?4:3);
  for(const type of ['D','B'])assert.equal(all.filter(c=>c.type===type).length,advanced?2:0);
  const old=createGame({level,seed:37,rulesVersion:'flight-records-2'});assert.deepEqual(old.hp,[18,18]);assert.equal(old.goals.length,3);
  audit(s);audit(old);
 }
});
test('warp every starting value exposes neighboring landings within 0-20 and allows 10 to 10',()=>{
 const j={id:'j',type:'J'};
 assert.deepEqual(warpLandings(4),[15,16,17]);assert.deepEqual(warpLandings(10),[9,10,11]);
 assert.deepEqual(warpLandings(0),[19,20]);assert.deepEqual(warpLandings(20),[0,1]);
 for(let before=0;before<=20;before++)for(let after=-1;after<=21;after++){
  const move={chain:0,ids:['j'],ops:[],warpTo:after},valid=after>=0&&after<=20&&Math.abs(after-(20-before))<=1;
  if(valid){const info=inspectMove([before,10,16],[j],[],move);assert.equal(info.after,after);assert.deepEqual(info.steps,[]);}
  else assert.throws(()=>inspectMove([before,10,16],[j],[],move));
 }
});
test('three matching objectives all score once; legacy v2 keeps its two-objective result',()=>{
 for(const rulesVersion of ['flight-records-2','flight-records-3']){
  const obs={rulesVersion,actor:0,hand:[{id:'n',type:'N',value:4}],goals:['E7','P7','L2'],board:[4,10,16],hp:[18,18],moduleId:null,sectorId:null};
  const p=evaluateMove(obs,{chain:2,ids:['n'],ops:[-1]});
  assert.equal(p.chosen.length,rulesVersion.endsWith('3')?3:2);assert.equal(p.damage,rulesVersion.endsWith('3')?6:5);
 }
});
test('B keeps current action and streak, received card is playable immediately, and replay matches exactly',()=>{
 let s,options;
 for(let seed=1;seed<300;seed++){
  options={level:7,seed};s=createGame(options);selectModule(s,s.moduleOptions[0]);while(s.phase==='opening')rollInitiative(s);
  if(s.hands[s.current].some(c=>c.type==='B')&&s.market.some(c=>c.type==='N'))break;
 }
 const initial=createGame(options),record=makeRecord(options,{});
 record.initial=publicSnapshot(initial);selectModule(initial,initial.moduleOptions[0]);appendEvent(record,'module',{id:initial.modules[0]});
 while(initial.phase==='opening'){const {pair}=rollInitiative(initial);appendEvent(record,'dice',{pair});}
 const actor=s.current,giveId=s.hands[actor].find(c=>c.type!=='B').id,marketIndex=s.market.findIndex(c=>c.type==='N'),received=s.market[marketIndex].id;
 const unchanged=structuredClone({hp:s.hp,board:s.board,turns:s.turns,challenge:s.challengeProgress,module:s.moduleProgress});
 transfer(s,giveId,marketIndex);appendEvent(record,'transfer',{actor,giveId,marketIndex,after:publicSnapshot(s)});
 assert.equal(s.current,actor);assert.equal(s.phase,'action');assert.equal(s.hands[actor].length,5);
 assert.deepEqual({hp:s.hp,board:s.board,turns:s.turns,challenge:s.challengeProgress,module:s.moduleProgress},unchanged);
 assert.throws(()=>takeCard(s,'deck'));
 const move=legalMoves(observation(s,actor)).find(m=>m.move.ids.includes(received)).move;
 playAndClaim(s,move);appendEvent(record,'play',{actor,move,after:publicSnapshot(s),settlement:s.lastAction});
 assert.deepEqual(publicSnapshot(replayRecord(record)),publicSnapshot(s));audit(s);
});
test('pin offers stay at three, cannot reroll by reopening, and vary across matches',()=>{
 const seen=new Set();for(let seed=0;seed<100;seed++){
  const list=pinOptionsForMatch(seed);assert.equal(list.length,3);assert.equal(new Set(list).size,3);
  assert.deepEqual(pinOptionsForMatch(seed),list);list.forEach(x=>seen.add(x));
 }assert.equal(seen.size,6);
});
