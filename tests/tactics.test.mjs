import test from 'node:test';
import {LEVEL_COUNT} from '../dist/difficulty.mjs';
import assert from 'node:assert/strict';
import {MODULES,SECTORS,moduleById,freshModuleProgress,previewTactics} from '../dist/tactics.mjs';
import {INITIATIVE_SHIELD,createGame,selectModule,rollInitiative,observation,legalMoves,playAndClaim,rest,takeCard,chooseBotMove,chooseBotSupply,audit} from '../dist/engine.mjs';
const event=patch=>({chain:0,before:4,after:12,ops:[1],claimed:['E7'],healing:0,...patch});
test('second-player compensation is fixed by actual grade, disclosed before rolling and symmetric for either player',()=>{
 for(let level=0;level<LEVEL_COUNT;level++)for(const first of [0,1]){
  const expected=level<6?1:level<12?2:3,s=createGame({seed:900+level,level,first,modules:[null,null],sectorId:null});
  assert.equal(s.shieldAllowance,expected);assert.deepEqual(s.hp,level>=7?[24,24]:[18,18]);assert.equal(s.shields[first],0);assert.equal(s.shields[1-first],expected);
  const opening=createGame({seed:900+level,level});assert.equal(opening.shieldAllowance,expected);assert.deepEqual(opening.shields,[0,0]);
 }
});

test('draft offers three distinct shared choices; robot precommits; choice changes neither dice nor decks',()=>{
  const modules=new Set(),sectors=new Set();
  for(let seed=1;seed<=360;seed++){
    const a=createGame({seed}),b=createGame({seed});assert.equal(a.phase,'loadout');assert.deepEqual(a.hp,[18,18]);assert.equal(new Set(a.moduleOptions).size,3);assert.ok(a.moduleOptions.includes(a.modules[1]));
    a.moduleOptions.forEach(id=>modules.add(id));sectors.add(a.sectorId);
    assert.equal(observation(a,0).opponentModuleId,null);const before=JSON.stringify(a);assert.throws(()=>selectModule(a,'invalid'));assert.throws(()=>rollInitiative(a));assert.equal(JSON.stringify(a),before);
    const locked=a.modules[1];selectModule(a,a.moduleOptions[0]);selectModule(b,b.moduleOptions[2]);assert.equal(a.modules[1],locked);assert.equal(observation(a,0).opponentModuleId,locked);
    assert.deepEqual(a.hands,b.hands);assert.deepEqual(a.deck,b.deck);assert.deepEqual(a.goals,b.goals);assert.equal(a.rng,b.rng);
    while(a.phase==='opening')assert.deepEqual(rollInitiative(a),rollInitiative(b));
    assert.equal(a.shields[a.first],0);assert.equal(a.shields[1-a.first],a.shieldAllowance);
    assert.throws(()=>selectModule(a,a.moduleOptions[1]));audit(a);
    assert.notEqual(createGame({seed,previousSector:a.sectorId}).sectorId,a.sectorId);
  }
  assert.equal(modules.size,6);assert.equal(sectors.size,6);
});

test('initiative shield absorbs across hits once, never heals or regenerates, and breaking it has AI value',()=>{
  let start,firstMove,secondMove;
  for(let seed=1;seed<100;seed++){
    const s=createGame({seed,first:0,modules:[null,null],sectorId:null,initiativeShield:2});
    const one=legalMoves(observation(s,0)).find(m=>m.rawDamage===1);if(!one)continue;
    const copy=structuredClone(s);playAndClaim(copy,one.move);while(copy.phase==='refill')takeCard(copy,'deck');rest(copy);
    const two=legalMoves(observation(copy,0)).find(m=>m.rawDamage>1);if(!two)continue;
    start=s;firstMove=one;secondMove=two;break;
  }
  assert.ok(start);assert.deepEqual(start.hp,[18,18]);assert.deepEqual(start.shields,[0,2]);
  assert.equal(firstMove.damage,0);assert.equal(firstMove.blockedDamage,1);assert.equal(firstMove.points,1+firstMove.healing);
  const notLethal=observation(start,0);notLethal.hp[1]=1;assert.ok(!legalMoves(notLethal).find(m=>JSON.stringify(m.move)===JSON.stringify(firstMove.move)).lethal);
  playAndClaim(start,firstMove.move);assert.equal(start.hp[1],18);assert.equal(start.shields[1],1);assert.equal(start.moduleProgress[0].lastAttackChain,firstMove.move.chain);
  while(start.phase==='refill')takeCard(start,'deck');rest(start);assert.equal(start.shields[1],1);
  playAndClaim(start,secondMove.move);assert.equal(start.hp[1],18-(secondMove.rawDamage-1));assert.deepEqual(start.shields,[0,0]);
  while(start.phase==='refill')takeCard(start,'deck');rest(start);assert.deepEqual(start.shields,[0,0]);audit(start);
  const obs={level:5,actor:0,board:[4,10,16],hand:[{id:'single',type:'N',value:1}],opponentHand:[],goals:['E3'],hp:[18,18],opponentShield:2};
  for(const noise of [0,.3,.8,.999]){const move=chooseBotMove(obs,noise);assert.equal(move.rawDamage,1);assert.equal(move.damage,0);assert.equal(move.points,1);}
});

test('all modules award exactly once per action, obey their limits, and do not mutate previews',()=>{
  for(const m of MODULES){
    let p=freshModuleProgress(),totalDamage=0,totalHealing=0;
    for(let i=0;i<24;i++){
      const e=event({chain:m.id==='circuit'?i%3:0,after:18,ops:[1,-1],claimed:['P9'],healing:4});
      const before=structuredClone(p),r=previewTactics(m.id,null,p,e);assert.deepEqual(p,before);assert.ok(r.next.uses-p.uses<=1);assert.ok(r.next.uses<=m.limit);
      totalDamage+=r.moduleDamage;totalHealing+=r.moduleHealing;p=r.next;
    }
    assert.equal(p.uses,m.limit,m.id);assert.equal(totalDamage+totalHealing,m.limit*(m.id==='circuit'?2:1),m.id);
    const capped=previewTactics(m.id,'repair',p,event({healing:1}));assert.equal(capped.moduleDamage+capped.moduleHealing,0);assert.equal(capped.sectorDamage,1);
  }
});

test('focus and roving require consecutive attacks; rests preserve only circuit collection',()=>{
  let p=previewTactics('focus','roving',freshModuleProgress(),event()).next;
  assert.equal(previewTactics('focus','roving',p,event()).moduleDamage,1);
  assert.equal(previewTactics('focus','roving',p,event({chain:1})).sectorDamage,1);
  for(const e of [{rest:true},event({claimed:[],healing:2})]){
    const reset=previewTactics('focus','roving',p,e).next;assert.equal(reset.lastAttackChain,null);
    const r=previewTactics('focus','roving',reset,event());assert.equal(r.moduleDamage+r.sectorDamage,0);
  }
  const a=previewTactics('circuit',null,freshModuleProgress(),event()).next;
  const b=previewTactics('circuit',null,a,{rest:true}).next;assert.deepEqual(b.circuit,[0]);
  const c=previewTactics('circuit',null,b,event({chain:1})).next;
  const d=previewTactics('circuit',null,c,event({chain:2}));assert.equal(d.moduleDamage,2);assert.deepEqual(d.next.circuit,[]);
});

test('sectors only add one damage to an existing attack; repairs/bonuses never recursively create attacks',()=>{
  for(const s of SECTORS){
    const e=event({chain:s.chain??1,healing:2});const p={...freshModuleProgress(),lastAttackChain:0};
    const r=previewTactics('engineer',s.id,p,e);assert.equal(r.sectorDamage,1,s.id);assert.equal(r.moduleHealing,1);
    const none=previewTactics('engineer',s.id,p,{...e,claimed:[]});assert.equal(none.sectorDamage+none.moduleDamage,0);assert.equal(none.moduleHealing,1);
    const resting=previewTactics('engineer',s.id,p,{rest:true});assert.equal(resting.sectorDamage+resting.moduleDamage+resting.moduleHealing,0);
  }
  assert.equal(previewTactics('precision',null,freshModuleProgress(),event({claimed:['E7','L2']})).moduleDamage,0);
  assert.equal(previewTactics('reverse',null,freshModuleProgress(),event({ops:[1]})).moduleDamage,0);
  assert.equal(previewTactics('edge',null,freshModuleProgress(),event({after:10})).moduleDamage,0);
});

test('combined module/sector/repair previews settle atomically, including bonus-driven lethal damage',()=>{
  let state,move;
  for(let seed=1;seed<300;seed++){
    const s=createGame({seed,first:0,modules:['reverse','engineer'],sectorId:'repair'});
    const m=legalMoves(observation(s,0)).find(m=>m.moduleDamage&&m.sectorDamage&&m.healing);
    if(m){state=s;move=m;break;}
  }
  assert.ok(state&&move);const before=JSON.stringify(state),preview=legalMoves(observation(state,0)).find(m=>JSON.stringify(m.move)===JSON.stringify(move.move));assert.equal(JSON.stringify(state),before);
  const result=playAndClaim(state,move.move);assert.equal(result.damage,preview.baseDamage+preview.moduleDamage+preview.sectorDamage-preview.blockedDamage);assert.equal(state.hp[0],18+preview.healing);assert.equal(state.hp[1],18-preview.damage);assert.equal(state.moduleProgress[0].uses,1);
  const saved=JSON.stringify(state);assert.throws(()=>playAndClaim(state,move.move));assert.equal(JSON.stringify(state),saved);audit(state);
  const lethal=JSON.parse(before);lethal.hp[1]=preview.damage;playAndClaim(lethal,move.move);assert.equal(lethal.phase,'over');assert.equal(lethal.winner,0);assert.equal(lethal.hands[0].length,lethal.handSize-move.move.ids.length);assert.throws(()=>takeCard(lethal,'deck'));audit(lethal);
});

test('36 mirrored full games preserve exact player symmetry across all modules, sectors and all AI policies',()=>{
  let games=0;
  for(let field=0;field<6;field++)for(let m=0;m<6;m++){
    const a=createGame({seed:field*7919+m*977+91,first:m%2,modules:[MODULES[m].id,MODULES[(m+3)%6].id],sectorId:SECTORS[field].id,level:(field*6+m)%LEVEL_COUNT});
    const b=structuredClone(a);
    for(const key of ['hands','hp','shields','turns','damageTotal','healingTotal','challengeProgress','modules','moduleProgress'])b[key].reverse();b.first=1-b.first;b.current=1-b.current;
    let turn=0;
    while(a.phase!=='over'){
      const actor=a.current,noise=((field*157+m*47+turn*73)%997)/997;
      const one=chooseBotMove(observation(a,actor),noise),two=chooseBotMove(observation(b,1-actor),noise);assert.deepEqual(one?.move,two?.move);assert.equal(one?.damage,two?.damage);assert.equal(one?.healing,two?.healing);
      if(one){playAndClaim(a,one.move);playAndClaim(b,two.move);}else{rest(a,a.hands[actor].slice(0,2).map(c=>c.id),a.goals[0]);rest(b,b.hands[1-actor].slice(0,2).map(c=>c.id),b.goals[0]);}
      while(a.phase==='refill'){
        const x=chooseBotSupply(observation(a,actor),noise),y=chooseBotSupply(observation(b,1-actor),noise);assert.equal(x,y);takeCard(a,x);takeCard(b,y);
      }
      assert.deepEqual(a.hp,[...b.hp].reverse());assert.deepEqual(a.board,b.board);assert.deepEqual(a.goals,b.goals);assert.deepEqual(a.moduleProgress,[...b.moduleProgress].reverse());assert.equal(a.phase,b.phase);audit(a);audit(b);assert.ok(++turn<=24);
    }
    assert.equal(b.winner,a.winner==='draw'?'draw':1-a.winner);games++;
  }
  assert.equal(games,36);
});
