import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,inspectMove,evaluateMove,observation,legalMoves,playAndClaim,takeCard,rest,audit} from '../dist/engine.mjs';
import {makeRecord,appendEvent,publicSnapshot,replayRecord} from '../dist/records.mjs';
import {deriveProgress,LEVEL_COUNT,RULES_VERSION} from '../dist/difficulty.mjs';

const hand=[{id:'a',type:'A'},{id:'x',type:'N',value:8},{id:'y',type:'N',value:8}];
const move={chain:1,ids:['a','x','y'],ops:[1,-1]};
test('A +8 -8 returns purple to 10 and scores equidistance from the final board only',()=>{
  const info=inspectMove([4,10,16],hand,['L8','P9'],move);
  assert.deepEqual(info.steps.map(s=>s.to),[18,10]);
  assert.deepEqual(info.board,[4,10,16]);assert.deepEqual(info.matches,['L8']);
  for(const actor of [0,1]){
    const obs={rulesVersion:RULES_VERSION,actor,hand,goals:['L8','P9'],board:[4,10,16],hp:[24,24],moduleId:null,sectorId:null};
    assert.equal(evaluateMove(obs,move).baseDamage,3);
    assert.ok(legalMoves(obs).some(m=>JSON.stringify(m.move)===JSON.stringify(move)&&m.baseDamage===3));
  }
});

test('returning A keeps numeric boundaries and distinct physical card requirements',()=>{
  assert.equal(inspectMove([4,10,16],hand,[],{...move,chain:2}).after,16);
  assert.equal(inspectMove([4,10,16],hand,[],{...move,ops:[-1,1]}).after,10);
  assert.throws(()=>inspectMove([4,10,16],hand,[],{...move,chain:0,ops:[-1,1]}),/小于 0/);
  assert.throws(()=>inspectMove([4,10,16],hand,[],{...move,ops:[1,1]}),/0–20/);
  assert.throws(()=>inspectMove([4,10,16],hand,[],{...move,ids:['a','x','x']}),/两次/);
  for(const version of ['flight-records-1','flight-records-2','flight-records-3'])
    assert.throws(()=>inspectMove([4,10,16],hand,['L8'],move,version),/改变/);
});

// Arrange real cards and goals without cloning any physical card or breaking deck accounting.
function giveReturn(s,actor){
  s.deck.push(...s.hands[actor].splice(0));
  for(const type of ['A',8,8]){
    const pile=[s.deck,s.discard,s.market,...s.hands,...s.trails].find(p=>p.some(c=>type===8?c.value===8:c.type===type));
    const i=pile.findIndex(c=>type===8?c.value===8:c.type===type);s.hands[actor].push(pile.splice(i,1)[0]);
  }
  while(s.hands[actor].length<6)s.hands[actor].push(s.deck.pop());
  for(const [i,id] of ['E1','P1','L8'].entries()){
    if(s.goals[i]===id)continue;
    const pile=[s.goalDecks[id[0]],s.goalDiscards[id[0]]].find(p=>p.includes(id));
    pile[pile.indexOf(id)]=s.goals[i];s.goals[i]=id;
  }
  return {...move,ids:s.hands[actor].slice(0,3).map(c=>c.id)};
}
test('returning acceleration has no match quota for either actor, consumes cards and settles once each play',()=>{
  for(const actor of [0,1]){
    const s=createGame({seed:9,first:actor,modules:[null,null],sectorId:null,initiativeShield:0});
    for(let attempt=0;attempt<5;attempt++){
      const m=giveReturn(s,actor),hp=s.hp[1-actor];
      assert.equal(evaluateMove(observation(s,actor),m).baseDamage,3);
      const result=playAndClaim(s,m);
      assert.equal(result.damage,3);assert.deepEqual(result.claimed,['L8']);
      assert.equal(s.hp[1-actor],hp-3);assert.deepEqual(s.board,[4,10,16]);
      assert.ok(m.ids.every(id=>!s.hands[actor].some(c=>c.id===id)));
      while(s.phase==='refill')takeCard(s,'deck');
      assert.equal(s.hp[1-actor],hp-3);rest(s);
      while(s.phase==='refill')takeCard(s,'deck');
      assert.equal(s.current,actor);audit(s);
    }
  }
});

test('new return move round-trips through the record replay; V3 rejects it without rewriting history',()=>{
  const options={seed:569,level:7,first:0,modules:[null,null],sectorId:null,initiativeShield:0};
  const s=createGame(options),record=makeRecord(options,{});
  const cards=[s.hands[0].find(c=>c.type==='A'),...s.hands[0].filter(c=>c.value===8)];
  assert.equal(cards.length,3);assert.ok(s.goals.includes('L8'));
  const m={...move,ids:cards.map(c=>c.id)};
  playAndClaim(s,m);appendEvent(record,'play',{actor:0,move:m,after:publicSnapshot(s),settlement:s.lastAction});
  assert.deepEqual(publicSnapshot(replayRecord(record)),publicSnapshot(s));audit(s);
  const old=structuredClone(record);old.rulesVersion='flight-records-3';
  assert.throws(()=>replayRecord(old),/改变/);
  const legacyOptions={...options,rulesVersion:'flight-records-3'},legacy=createGame(legacyOptions),legacyRecord=makeRecord(legacyOptions,{});
  legacyRecord.rulesVersion='flight-records-3';rest(legacy);
  appendEvent(legacyRecord,'rest',{actor:0,ids:[],goal:null,after:publicSnapshot(legacy)});
  assert.deepEqual(publicSnapshot(replayRecord(legacyRecord)),publicSnapshot(legacy));
});

test('rules upgrade retains version 3 support history and consent',()=>{
  const settings={supportEnabled:true,supportEpochs:Array(LEVEL_COUNT).fill(0)};
  const first={id:'first',status:'complete',rulesVersion:'flight-records-3',selectedLevel:7,actualLevel:7,epoch:0,supportEnabled:true,outcome:'loss',completedAt:10};
  const second={...first,id:'second',rulesVersion:RULES_VERSION,completedAt:20};
  const p=deriveProgress({unlocked:7,matches:0},settings,[first,second],[{id:'choice',offerId:'second',selectedLevel:7,epoch:0,accept:true,at:21}]);
  assert.equal(p.matches,2);assert.equal(p.support[7].effective,6);
});
