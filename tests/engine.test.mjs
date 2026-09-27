import test from 'node:test';
import {LEVEL_COUNT} from '../dist/difficulty.mjs';
import assert from 'node:assert/strict';
import {createGame as createCoreGame,selectModule,rollInitiative,selectSector,chooseSector,selectBoon,chooseBoon,inspectMove,goalMatches,play,playAndClaim,claim,rest,takeCard,audit,observation,legalMoves,chooseBotMove,chooseBotSupply,evaluateMove,calibrateOffer} from '../dist/engine.mjs';
import {freshChallengeProgress,challengeViews} from '../dist/challenges.mjs';
const createGame=opts=>createCoreGame({modules:[null,null],sectorId:null,initiativeShield:0,...opts});
const n=(value,id=`n${value}`)=>({type:'N',value,id});
const W={type:'W',id:'W'},A={type:'A',id:'A'};
const piles=s=>[s.deck,s.discard,s.market,...s.hands,...s.trails];
function give(s,actor,wanted){s.deck.push(...s.hands[actor].splice(0));for(const spec of wanted){let found;for(const pile of piles(s)){const i=pile.findIndex(c=>typeof spec==='number'?c.type==='N'&&c.value===spec:c.type===spec);if(i>=0){found=pile.splice(i,1)[0];break;}}assert.ok(found);s.hands[actor].push(found);}while(s.hands[actor].length<s.handSize)s.hands[actor].push(s.deck.pop());}
function goals(s,ids){ids.forEach((id,i)=>{if(s.goals[i]===id)return;const pile=s.goalDecks[id[0]],j=pile.indexOf(id);assert.ok(j>=0);pile[j]=s.goals[i];s.goals[i]=id;});}
function repairs(s,ids){s.challengeIds=ids;s.challengeProgress=[freshChallengeProgress(ids),freshChallengeProgress(ids)];}
function setup(opts={}){const s=createGame({first:0,seed:9,...opts});repairs(s,['minus-two','even-two','streak']);return s;}
function refill(s){while(s.phase==='refill')takeCard(s,'deck');}

test('opening dice alone decides initiative, ties reroll, both begin with 18 HP',()=>{
  let wins=0,ties=0;
  for(let seed=1;seed<=600;seed++){
    const s=createGame({seed});assert.equal(s.phase,'opening');assert.deepEqual(s.hp,[18,18]);assert.equal(s.current,null);assert.throws(()=>rest(s));
    while(s.phase==='opening'){const r=rollInitiative(s);assert.ok(r.pair.every(n=>n>=1&&n<=6));if(r.tie){ties++;assert.equal(s.current,null);}else assert.equal(s.first,r.pair[0]>r.pair[1]?0:1);assert.ok(s.dice.length<12);}
    wins+=Number(s.first===0);const before=JSON.stringify(s);assert.throws(()=>rollInitiative(s));assert.equal(JSON.stringify(s),before);audit(s);
  }
  assert.ok(wins>240&&wins<360);assert.ok(ties>0);
});
test('public observations copy both hands and repairs without private draws',()=>{
  const s=setup(),obs=observation(s,1);for(const key of ['rng','deck','goalDecks','discard'])assert.equal(key in obs,false);
  obs.hand[0].value=100;obs.opponentHand[0].value=100;obs.challengeProgress['minus-two'].minus=12;
  assert.notEqual(s.hands[1][0].value,100);assert.notEqual(s.hands[0][0].value,100);assert.equal(s.challengeProgress[1]['minus-two'].minus,0);audit(s);
});
test('wild, acceleration intermediate steps and card identities follow arithmetic rules',()=>{
  assert.equal(inspectMove([4,10,16],[W],[],{chain:0,ids:['W'],ops:[1],wild:9}).after,13);
  for(const wild of [0,10,2.5])assert.throws(()=>inspectMove([4,10,16],[W],[],{chain:0,ids:['W'],ops:[1],wild}));
  assert.throws(()=>inspectMove([4,10,16],[A,n(9),n(3)],[],{chain:2,ids:['A','n9','n3'],ops:[1,-1]}),/0–20/);
  const through=inspectMove([4,10,18],[A,n(3),n(4)],[],{chain:2,ids:['A','n3','n4'],ops:[1,-1]});
  assert.equal(through.after,17);assert.deepEqual(through.steps.map(step=>step.to),[21,17]);assert.equal(through.expression,'18 + 3 − 4');assert.equal(through.trace,'18 + 3 = 21 − 4 = 17');
  assert.throws(()=>inspectMove([4,10,2],[A,n(3),n(4)],[],{chain:2,ids:['A','n3','n4'],ops:[-1,1]}),/小于 0/);
  assert.throws(()=>inspectMove([4,10,16],[A,n(3,'x'),n(3,'y')],[],{chain:1,ids:['A','x','y'],ops:[1,-1]}),/改变/);
  assert.throws(()=>inspectMove([4,10,16],[A,n(3)],[],{chain:1,ids:['A','n3','n3'],ops:[1,1]}),/两次/);
  assert.throws(()=>inspectMove([4,10,16],[A,W,n(3)],[],{chain:1,ids:['A','W','n3'],ops:[1,1],wild:2}),/功能牌/);
  assert.equal(inspectMove([4,10,16],[A,n(3,'x'),n(3,'y')],[],{chain:1,ids:['A','x','y'],ops:[1,1]}).after,16);
  assert.equal(goalMatches('L7',[10,10,10],1),false);assert.equal(goalMatches('L8',[10,10,10],1),false);assert.equal(goalMatches('L7',[4,10,16],1),true);assert.equal(goalMatches('L7',[4,10,16],0),false);
});
test('one confirmation auto-selects every matched goal, previews are pure and failures atomic',()=>{
  for(const c of [
    {card:1,chain:0,op:1,goals:['E10','P1','L1'],damage:0},
    {card:1,chain:0,op:1,goals:['E3','P1','L1'],damage:1},
    {card:2,chain:1,op:1,goals:['E7','P7','L1'],damage:3},
    {card:4,chain:2,op:-1,goals:['E7','P7','L2'],damage:6}
  ]){
    const s=setup();give(s,0,[c.card]);goals(s,c.goals);const move={chain:c.chain,ids:[s.hands[0][0].id],ops:[c.op]};
    const before=JSON.stringify(s),preview=evaluateMove(observation(s,0),move);assert.equal(JSON.stringify(s),before);assert.equal(preview.damage,c.damage);
    assert.throws(()=>playAndClaim(s,{...move,ops:[1,1]}));assert.equal(JSON.stringify(s),before);
    const result=playAndClaim(s,move);assert.equal(result.damage,c.damage);assert.deepEqual(s.hp,[18,18-c.damage]);assert.equal(result.claimed.length,preview.info.matches.length);
    const after=JSON.stringify(s);assert.throws(()=>playAndClaim(s,move));assert.throws(()=>claim(s,[]));assert.equal(JSON.stringify(s),after);refill(s);audit(s);
  }
});
test('damage and healing apply once together, HP exceeds 18 and fresh repairs get no retroactive credit',()=>{
  const s=setup();give(s,0,[8]);goals(s,['E7','P7','L2']);repairs(s,['long-jump','edge','double-goal']);
  s.challengeProgress[1].edge.minus=1;const oldOther=structuredClone(s.challengeProgress[1].edge);
  const before=[...s.challengeIds],result=playAndClaim(s,{chain:0,ids:[s.hands[0][0].id],ops:[1]});
  assert.equal(result.damage,6);assert.equal(result.healing,3);assert.deepEqual(s.hp,[21,12]);assert.deepEqual(result.challengeAwards,['long-jump','double-goal']);
  assert.equal(s.challengeIds.filter(id=>!before.includes(id)).length,2);assert.equal(s.challengeIds[1],'edge');assert.deepEqual(s.challengeProgress[1].edge,oldOther);
  for(const actor of [0,1])for(const c of challengeViews(s.challengeIds,s.challengeProgress[actor]))if(!before.includes(c.id))assert.equal(c.progress,0);
  refill(s);assert.deepEqual(s.hp,[21,12]);audit(s);
});
test('zero HP ends immediately for either actor and turn order, with no reply or refill',()=>{
  for(const first of [0,1])for(const turn of [0,1])for(const enemyHP of [1,2,3]){
    const s=setup({first});if(turn)rest(s);const actor=s.current;give(s,actor,[2]);goals(s,['E7','P7','L1']);s.hp[1-actor]=enemyHP;
    playAndClaim(s,{chain:1,ids:[s.hands[actor][0].id],ops:[1]});assert.equal(s.phase,'over');assert.equal(s.winner,actor);assert.equal(s.hp[1-actor],0);assert.equal(s.hands[actor].length,5);assert.equal(s.turns[actor],1);assert.equal(s.turns[1-actor],turn);
    const saved=JSON.stringify(s);for(const f of [()=>takeCard(s,'deck'),()=>rest(s),()=>rollInitiative(s)]){assert.throws(f);assert.equal(JSON.stringify(s),saved);}audit(s);
  }
});
test('round12 skips refills and compares remaining HP only after both actions',()=>{
  for(const first of [0,1])for(const hp of [[12,10],[11,11],[9,13]]){
    const s=setup({first});s.round=12;s.turns=[11,11];s.hp=[...hp];give(s,first,[1]);goals(s,['E10','P1','L1']);
    playAndClaim(s,{chain:0,ids:[s.hands[first][0].id],ops:[1]});assert.equal(s.phase,'action');assert.equal(s.current,1-first);assert.equal(s.hands[first].length,5);rest(s);
    assert.equal(s.phase,'over');assert.equal(s.winner,hp[0]===hp[1]?'draw':hp[0]>hp[1]?0:1);assert.deepEqual(s.turns,[12,12]);audit(s);
  }
  const s=setup();s.round=12;s.turns=[11,11];s.hp[1]=1;give(s,0,[2]);goals(s,['E7','P7','L1']);playAndClaim(s,{chain:1,ids:[s.hands[0][0].id],ops:[1]});assert.equal(s.phase,'over');assert.equal(s.turns[1],11);
});
test('rest and both supply sources preserve cards; acceleration recycles trail midway',()=>{
  const s=setup();const ids=s.hands[0].slice(0,2).map(c=>c.id),old=s.goals[0];s.discard.push(...s.deck.splice(0));rest(s,ids,old);assert.equal(s.hands[0].length,4);const wanted=s.market[1].id;assert.equal(takeCard(s,1).id,wanted);takeCard(s,'deck');assert.ok(s.deck.length>0);assert.deepEqual(s.hp,[18,18]);audit(s);
  const a=setup();give(a,0,['A',2,3]);a.trails[1].push(...a.deck.splice(0,3));const cards=a.hands[0].slice(0,3).map(c=>c.id);playAndClaim(a,{chain:1,ids:cards,ops:[1,1]});assert.equal(a.trails[1].length,1);assert.equal(a.trails[1][0].id,cards[2]);audit(a);
});
test('80 full matches across all bot levels: legal actions, exact previews, bounded length and conserved HP/cards',()=>{
  const lengths=[];let healed=0,knockouts=0;
  for(let seed=1;seed<=80;seed++){
    const s=createCoreGame({seed:seed*977,level:seed%LEVEL_COUNT});selectModule(s,s.moduleOptions[seed%3]);while(s.phase==='opening')rollInitiative(s);let turns=0;
    while(s.phase!=='over'){
      const actor=s.current,before=[...s.hp],choice=chooseBotMove(observation(s,actor),((seed*47+turns*73)%997)/997);
      if(choice){const result=playAndClaim(s,choice.move);assert.equal(result.damage,choice.damage);assert.equal(result.healing,choice.healing);assert.equal(s.hp[actor],before[actor]+choice.healing);assert.equal(s.hp[1-actor],Math.max(0,before[1-actor]-choice.damage));healed+=choice.healing;}
      else rest(s,s.hands[actor].slice(0,2).map(c=>c.id),s.goals[0]);
      while(s.phase==='refill')takeCard(s,chooseBotSupply(observation(s,actor)));
      audit(s);for(let p=0;p<2;p++)assert.equal(s.hp[p],(s.level>=7?24:18)+s.healingTotal[p]-s.damageTotal[1-p]);assert.ok(++turns<=24);
    }
    lengths.push(s.round);knockouts+=Number(s.hp.includes(0));
  }
  assert.ok(healed>0);console.log(JSON.stringify({matches:lengths.length,minRounds:Math.min(...lengths),maxRounds:Math.max(...lengths),meanRounds:lengths.reduce((a,b)=>a+b)/lengths.length,knockouts,healing:healed}));
});

test('calibrate shifts one cell onto a better goal, once per player, and leaves ordinary moves unchanged',()=>{
  const aimed=setup();aimed.board=[3,8,16];give(aimed,0,[2]);goals(aimed,['E5','P6','L1']);
  const id=aimed.hands[0][0].id,move={chain:1,ids:[id],ops:[1]};
  const plain=evaluateMove(observation(aimed,0),move),offer=calibrateOffer(aimed.goals,plain.info,observation(aimed,0));
  assert.equal(plain.info.after,10);assert.equal(plain.damage,0);assert.equal(offer.delta,1);assert.equal(offer.after,11);assert.equal(offer.scoring.damage,2);
  const before=JSON.stringify(aimed);assert.equal(JSON.stringify(evaluateMove(observation(aimed,0),{...move,calibrate:true})).includes('"calibrate":true'),true);assert.equal(JSON.stringify(aimed),before);
  const nudged=playAndClaim(aimed,{...move,calibrate:true});
  assert.equal(nudged.damage,2);assert.equal(aimed.board[1],11);assert.deepEqual(aimed.calibrates,[0,1]);assert.equal(aimed.lastAction.calibrate,1);assert.match(aimed.lastAction.expression,/校准至 11/);audit(aimed);
  const blocked=setup();blocked.board=[10,11,16];give(blocked,0,[1]);goals(blocked,['E5','P1','L1']);
  const back={chain:1,ids:[blocked.hands[0][0].id],ops:[-1]},seen=evaluateMove(observation(blocked,0),back);
  assert.equal(seen.info.after,10);assert.equal(seen.damage,3);assert.equal(calibrateOffer(blocked.goals,seen.info,observation(blocked,0)),null);
  assert.throws(()=>playAndClaim(blocked,{...back,calibrate:true}),/这次不能校准/);assert.equal(blocked.board[1],11);assert.deepEqual(blocked.calibrates,[1,1]);
  const origin=setup();origin.board=[10,10,16];give(origin,0,[1]);goals(origin,['E6','P1','L1']);
  const retreat={chain:0,ids:[origin.hands[0][0].id],ops:[-1]},near=evaluateMove(observation(origin,0),retreat);
  assert.equal(near.info.after,9);assert.equal(calibrateOffer(origin.goals,near.info,observation(origin,0)),null);
  const ordinary=setup();give(ordinary,0,[1]);const kept=playAndClaim(ordinary,{chain:0,ids:[ordinary.hands[0][0].id],ops:[1]});
  assert.equal(kept.calibrate,undefined);assert.equal('calibrate' in ordinary.lastAction,false);assert.deepEqual(ordinary.calibrates,[1,1]);
  const bot=setup({level:6});bot.board=[3,8,16];bot.hp[1]=2;give(bot,0,[2]);bot.deck.push(...bot.hands[0].slice(1));bot.hands[0]=bot.hands[0].slice(0,1);goals(bot,['E5','P6','L1']);
  const choice=chooseBotMove(observation(bot,0),0.5);assert.equal(choice.move.calibrate,true);assert.equal(choice.info.after,11);assert.equal(choice.lethal,true);
  playAndClaim(bot,choice.move);assert.equal(bot.hp[1],0);assert.deepEqual(bot.calibrates,[0,1]);assert.equal(bot.winner,0);audit(bot);
});
test('new matches offer three sectors and a visible second-half choice without changing the legacy opening',()=>{
  const legacy=createCoreGame({seed:42,level:0});
  assert.equal(legacy.choices,undefined);assert.ok(legacy.sectorId);
  const again=createCoreGame({seed:42,level:0});assert.equal(again.sectorId,legacy.sectorId);assert.deepEqual(again.moduleOptions,legacy.moduleOptions);
  const s=createCoreGame({seed:42,level:0,choices:true,pinnedModule:'engineer'});
  assert.equal(s.sectorId,null);assert.equal(s.sectorOptions.length,3);assert.ok(s.moduleOptions.includes('engineer'));
  selectModule(s,s.moduleOptions[0]);while(s.phase==='opening')rollInitiative(s);assert.equal(s.phase,'sector');
  const picked=chooseSector(s);selectSector(s,picked);assert.equal(s.sectorId,picked);audit(s);
  let guard=0;while(s.phase!=='boon'&&s.phase!=='over'){const moves=legalMoves(observation(s,s.current));if(moves.length)playAndClaim(s,moves[0].move);else rest(s,[],s.goals[0]);while(s.phase==='refill')takeCard(s,'deck');audit(s);assert.ok(++guard<40);}
  if(s.phase==='boon'){const kind=chooseBoon(s);selectBoon(s,kind);audit(s);assert.ok(['calibrate','chain','strike'].includes(s.boon.type));if(kind==='calibrate')assert.ok(s.calibrates.every(n=>n>=1&&n<=2));}
});
test('robot modules stay inside the shared three and rotate through the least used ones',()=>{
  const counts={},seen=new Set();
  for(let i=0;i<18;i++){
    const s=createCoreGame({seed:1000+i,choices:true,robotModuleCounts:{...counts},pinnedModule:'engineer'});
    const robot=s.modules[1];
    assert.ok(s.moduleOptions.includes(robot));assert.ok(s.moduleOptions.includes('engineer'));assert.equal(new Set(s.moduleOptions).size,3);
    counts[robot]=(counts[robot]||0)+1;seen.add(robot);
    const again=createCoreGame({seed:1000+i,choices:true,robotModuleCounts:Object.fromEntries(Object.entries(counts).filter(([id])=>id!==robot).concat([[robot,(counts[robot]||1)-1]])),pinnedModule:'engineer'});
    assert.equal(again.modules[1],robot);assert.deepEqual(again.moduleOptions,s.moduleOptions);
  }
  assert.equal(seen.size,6);assert.ok(Math.max(...Object.values(counts))-Math.min(...Object.values(counts))<=1);
});
test('six-card trial deck has W3 A3 J2; warp uses reflection without arithmetic credit',()=>{
  const s=setup(),all=piles(s).flat();assert.deepEqual(s.hands.map(h=>h.length),[6,6]);
  assert.deepEqual(Object.fromEntries(['N','W','A','J'].map(t=>[t,all.filter(c=>c.type===t).length])),{N:36,W:3,A:3,J:2});
  const J={type:'J',id:'j'};
  for(let x=0;x<=20;x++){
    if(x===10){assert.throws(()=>inspectMove([x,10,16],[J],[],{chain:0,ids:['j'],ops:[]}),/9 或 11/);assert.equal(inspectMove([x,10,16],[J],[],{chain:0,ids:['j'],ops:[],warpTo:9}).after,9);assert.equal(inspectMove([x,10,16],[J],[],{chain:0,ids:['j'],ops:[],warpTo:11}).after,11);continue;}
    const m=inspectMove([x,10,16],[J],[],{chain:0,ids:['j'],ops:[]});assert.equal(m.after,20-x);assert.deepEqual(m.steps,[]);assert.equal(m.warp,true);
  }
  assert.throws(()=>inspectMove([4,10,16],[J,n(1)],[],{chain:0,ids:['j','n1'],ops:[1]}));
  give(s,0,['J']);repairs(s,['both-ops','minus-two','all-chains']);
  const preview=evaluateMove(observation(s,0),{chain:0,ids:[s.hands[0][0].id],ops:[]});playAndClaim(s,{chain:0,ids:[s.hands[0][0].id],ops:[]});
  assert.deepEqual(s.lastAction.ops,[]);assert.equal(s.board[0],16);assert.equal(s.challengeProgress['0']['minus-two'].minus,0);audit(s);
});
