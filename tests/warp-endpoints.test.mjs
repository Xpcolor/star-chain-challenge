import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,GOALS,warpLandings,inspectMove,evaluateMove,observation,legalMoves,playAndClaim,takeCard,audit} from '../dist/engine.mjs';

test('endpoint warp forms a sum of 20 for both players, any chain and both level modes',()=>{
  let cases=0;
  for(const level of [0,7])for(const actor of [0,1])for(const from of [0,20])for(const chain of [0,1,2]){
    const s=createGame({level,first:actor,seed:41,modules:[null,null],sectorId:null,initiativeShield:0});
    s.board=[7,7,7];s.board[chain]=from;s.board[(chain+1)%3]=from;
    const piles=[s.deck,s.market,...s.hands];
    const pile=piles.find(p=>p.some(c=>c.type==='J')),index=pile.findIndex(c=>c.type==='J');
    const j=pile[index];[pile[index],s.hands[actor][0]]=[s.hands[actor][0],j];
    s.goals=level>=7?['E3','P3','L6','E4']:['E3','P3','L6'];
    for(const kind of ['E','P','L'])s.goalDecks[kind]=GOALS.filter(g=>g.kind===kind&&!s.goals.includes(g.id)).map(g=>g.id);
    audit(s);
    const move={chain,ids:[j.id],ops:[],warpTo:20-from},obs=observation(s,actor);
    const preview=evaluateMove(obs,move);
    assert.ok(warpLandings(from).includes(20-from));
    assert.deepEqual(preview.chosen,['L6']);assert.equal(preview.baseDamage,3);
    assert.ok(legalMoves(obs).some(m=>m.move.ids[0]===j.id&&m.move.chain===chain&&m.move.warpTo===20-from&&m.baseDamage===3));
    const hp=s.hp[1-actor],result=playAndClaim(s,move);
    assert.equal(s.board[chain],20-from);assert.equal(s.board[(chain+1)%3],from);
    assert.deepEqual(result.claimed,['L6']);assert.equal(s.hp[1-actor],hp-3);
    assert.ok(!s.hands[actor].some(c=>c.id===j.id));assert.ok(s.discard.some(c=>c.id===j.id));
    while(s.phase==='refill')takeCard(s,'deck');
    assert.equal(s.hp[1-actor],hp-3);audit(s);cases++;
  }
  assert.equal(cases,24);
});

test('warp sum uses only final landing and another chain, with no double claim for two partners',()=>{
  const hand=[{id:'j',type:'J'}];
  for(const from of [0,20]){
    const move={chain:0,ids:['j'],ops:[],warpTo:20-from};
    const info=inspectMove([from,from,from],hand,['L6'],move);
    assert.deepEqual(info.matches,['L6']);
    // The adjacent alternative is legal, but 19+0 or 1+20 is not 20.
    const adjacent={...move,warpTo:from===0?19:1};
    assert.deepEqual(inspectMove([from,from,7],hand,['L6'],adjacent).matches,[]);
    assert.deepEqual(inspectMove([from,7,9],hand,['L6'],move).matches,[]);
    assert.throws(()=>inspectMove([from,from,7],hand,['L6'],{...move,warpTo:from}));
  }
});
