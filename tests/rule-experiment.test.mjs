import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,inspectMove,legalMoves,observation,playAndClaim,transfer,takeCard,audit} from '../dist/engine.mjs';
import {freshChallengeProgress} from '../dist/challenges.mjs';
const experimental={hp:24,extraZone:true,repairSlots:4,dockCount:2,barterCount:2};
const game=(options={})=>createGame({first:0,seed:37,modules:[null,null],sectorId:null,initiativeShield:0,...experimental,...options});
const piles=s=>[s.deck,s.discard,s.market,...s.hands,...s.trails];
function obtain(s,type){
 const own=s.hands[0].find(c=>c.type===type);if(own)return own;
 for(const pile of piles(s)){const i=pile.findIndex(c=>c.type===type);if(i>=0){const card=pile[i];pile[i]=s.hands[0].pop();s.hands[0].push(card);return card;}}
 throw Error(`Missing ${type}`);
}
test('experimental options are opt-in; 44-card default and 48-card candidate conserve identities',()=>{
 const current=createGame({first:0,seed:1});assert.deepEqual(current.hp,[18,18]);assert.equal(current.goals.length,3);assert.equal(current.challengeIds.length,3);assert.equal(current.deckSize,44);
 assert.ok(!piles(current).flat().some(c=>['D','B'].includes(c.type)));
 for(let seed=1;seed<=50;seed++){
  const s=game({seed});assert.deepEqual(s.hp,[24,24]);assert.equal(s.deckSize,48);assert.deepEqual(s.goals.map(x=>x[0]),['E','P','L','E']);assert.equal(new Set(s.challengeIds).size,4);
  assert.equal(piles(s).flat().filter(c=>c.type==='D').length,2);assert.equal(piles(s).flat().filter(c=>c.type==='B').length,2);audit(s);
 }
});
test('D lands on 0/10/20 alone, rejects no-op and arithmetic; enters discard and scores every matching target',()=>{
 const s=game(),d=obtain(s,'D'),obs=observation(s,0);
 const options=legalMoves(obs).filter(m=>m.move.ids.includes(d.id));assert.equal(options.length,8);
 for(const m of options){assert.ok([0,10,20].includes(m.info.after));assert.notEqual(m.info.after,m.info.before);assert.equal(m.info.steps.length,0);assert.ok(m.chosen.length===m.info.matches.length);}
 const move={chain:0,ids:[d.id],ops:[],port:20};
 for(const invalid of [{...move,port:5},{...move,chain:1,port:10},{...move,ops:[1]},{...move,ids:[d.id,s.hands[0].find(c=>c.type==='N').id]}])assert.throws(()=>inspectMove(s.board,s.hands[0],s.goals,invalid));
 playAndClaim(s,move);assert.equal(s.board[0],20);assert.ok(s.discard.some(c=>c.id===d.id));assert.ok(!s.trails.flat().some(c=>c.id===d.id));assert.ok(s.lastAction.claimed.length===s.lastAction.matches.length);audit(s);
});
test('B exchange costs a turn, draws back to six, resets own streak without damage or changing shared board',()=>{
 const s=game({rulesVersion:'flight-records-2'}),b=obtain(s,'B'),give=s.hands[0].find(c=>c.type==='N');
 s.challengeIds=['both-ops','even-two','meet','streak'];s.challengeProgress=[freshChallengeProgress(s.challengeIds),freshChallengeProgress(s.challengeIds)];
 s.challengeProgress[0].streak.streak=1;s.challengeProgress[1].streak.streak=1;s.challengeProgress[0]['both-ops'].ops=[1];
 const board=[...s.board],goals=[...s.goals],hp=[...s.hp],taken=s.market[1];
 for(const [id,index] of [[b.id,1],['missing',1],[give.id,3]]){const before=JSON.stringify(s);assert.throws(()=>transfer(s,id,index));assert.equal(JSON.stringify(s),before);}
 transfer(s,give.id,1);assert.deepEqual(s.hp,hp);assert.deepEqual(s.board,board);assert.deepEqual(s.goals,goals);assert.equal(s.hands[0].length,5);assert.equal(s.phase,'refill');assert.equal(s.market[1].id,give.id);assert.ok(s.hands[0].some(c=>c.id===taken.id));assert.ok(s.discard.some(c=>c.id===b.id));
 assert.equal(s.challengeProgress[0].streak.streak,0);assert.equal(s.challengeProgress[1].streak.streak,1);assert.deepEqual(s.challengeProgress[0]['both-ops'].ops,[1]);
 takeCard(s,'deck');assert.equal(s.hands[0].length,6);assert.equal(s.current,1);audit(s);
});
