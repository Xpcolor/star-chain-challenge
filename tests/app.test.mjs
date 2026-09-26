import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,selectModule,rollInitiative,legalMoves} from '../dist/engine.mjs';
import {BOT_PROFILES,LEVEL_COUNT,freshSupport,CONFIG_ID} from '../dist/difficulty.mjs';
// DOM/clock harness verifies handlers, not browser layout or rendered animation.
const elements=new Map(),listeners=new Map(),registered=new Map(),timers=new Map(),stored=new Map();let timerId=0;
stored.set('star-chain-demo-v1',JSON.stringify({version:1,medals:[7,7,7],unlocked:2,matches:0}));
class Element{
  constructor(id=''){Object.assign(this,{id,innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},style:{},isConnected:true});}
  addEventListener(name,fn){listeners.set(`${this.id}:${name}`,fn);}getBoundingClientRect(){return{left:0,top:0,right:100,bottom:100};}showModal(){this.open=true;}close(){this.open=false;}focus(){}scrollIntoView(){}remove(){}
}
globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);},activeElement:null,querySelectorAll(){return[];},addEventListener(name,fn){listeners.set(name,fn);},modelContext:{registerTool(t){registered.set(t.name,t);}},createElement(){return new Element();},body:{appendChild(){}}};
globalThis.window={innerHeight:900,addEventListener(){}};globalThis.matchMedia=()=>({matches:true});globalThis.requestAnimationFrame=f=>f();
globalThis.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
globalThis.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
globalThis.fetch=async()=>{throw Error('offline test');};
Date.now=()=>1800000000000;Math.random=()=>.573;
await import('../dist/app.mjs');
const decode=r=>JSON.parse(r.content[0].text),state=()=>decode(registered.get('get_star_chain_game').execute({}));
const html=()=>elements.get('app').innerHTML;
function execute(action,args={}){return decode(registered.get('play_star_chain_action').execute({action,...args}));}
function ok(action,args={}){const r=execute(action,args);assert.equal(r.ok,true,r.error);return r.state;}
function click(action,data={}){listeners.get('click')({target:{dataset:{action,...data},disabled:false,closest(){return this;}}});}
function tick(){const found=[...timers].sort((a,b)=>a[1].delay-b[1].delay)[0];assert.ok(found,'continuation scheduled');timers.delete(found[0]);found[1].fn();}
function settle(){let limit=0;while(state().initiative.stage!=='none'||state().animation||(state().current_player==='robot'&&state().phase!=='over')){tick();assert.ok(++limit<100);}}
function start(){if(state().phase==='loadout')ok('module',{id:state().module_options[0].id});assert.equal(state().phase,'opening');ok('roll');settle();}
function moves(){const s=state();return legalMoves({actor:0,shield:s.shields[0],opponentShield:s.shields[1],sectorId:s.sector.id,moduleId:s.modules[0],opponentModuleId:s.modules[1],moduleProgress:s.module_progress[0],opponentModuleProgress:s.module_progress[1],hp:s.hp,level:2,board:s.board,hand:s.hand,opponentHand:s.robot_hand,goals:s.goals.map(g=>g.id),market:s.market,round:s.round,turnInRound:s.turn_in_round,challengeIds:s.challenge_ids,challengeProgress:s.challenge_progress[0],opponentChallengeProgress:s.challenge_progress[1]}).sort((a,b)=>Number(b.lethal)-Number(a.lethal)||b.points-a.points||a.move.ids.length-b.move.ids.length);}
function select(m){for(const id of m.move.ids)ok('card',{id});ok('chain',{index:m.move.chain});m.move.ops.forEach((value,step)=>ok('op',{value,step}));if(m.move.wild)ok('wild',{value:m.move.wild});}
function humanTurn(){
  assert.equal(state().current_player,'human');const before=state(),m=moves()[0];assert.ok(m);select(m);
  assert.equal(state().automatic_damage,m.damage);assert.equal(state().automatic_healing,m.healing);assert.match(html(),/class="selected-cards"><span>已选牌<\/span>/);
  if(m.blockedDamage)assert.match(html(),new RegExp(`护盾抵消 ${m.blockedDamage}`));
  const s=ok('play');assert.equal(s.animation,true);assert.deepEqual(s.board,m.info.board);assert.equal(s.hp[0],before.hp[0]+m.healing);assert.equal(s.hp[1],Math.max(0,before.hp[1]-m.damage));assert.deepEqual(s.selection.ids,[]);
  assert.equal(s.shields[1],before.shields[1]-m.blockedDamage);assert.deepEqual(s.sector,before.sector);assert.deepEqual(s.modules,before.modules);
  const snapshot=state();assert.equal(execute('play').ok,false);assert.equal(execute('draw').ok,false);assert.equal(execute('roll').ok,false);assert.deepEqual(state(),snapshot);
  while(state().animation)tick();let count=0;while(state().current_player==='human'&&state().phase==='refill'){ok(count++%2?'draw':'supply',{index:0});assert.ok(count<=3);}
}
test('initial screen has fleet, both hands,63 numbered ticks,3 shared repairs and random draw',()=>{
  const s=state();assert.equal(s.phase,'loadout');assert.equal(s.first,null);assert.equal(s.module_options.length,3);assert.deepEqual(s.modules,[null,null]);assert.deepEqual(s.hp,[18,18]);assert.equal(s.opponent_count,LEVEL_COUNT);assert.equal(s.unlocked_opponents,LEVEL_COUNT);
  assert.equal((html().match(/data-action="level"/g)||[]).length,LEVEL_COUNT);assert.equal((html().match(/data-action="opponent-card"/g)||[]).length,6);assert.equal((html().match(/class="rail-label"/g)||[]).length,63);assert.equal((html().match(/data-challenge=/g)||[]).length,3);
  assert.match(html(),/随机抽 1 张/);assert.match(html(),/已选牌/);assert.match(html(),/共享 3 项/);assert.match(html(),/选择本局模块/);assert.equal((html().match(/data-action="module"/g)||[]).length,3);assert.ok(!/我的<|对手<\/button>|18 星|NaN|undefined/.test(html()));
  assert.equal(JSON.parse(stored.get('star-chain-demo-v1')).version,6);const before=state();assert.equal(execute('play').ok,false);assert.deepEqual(state(),before);
});
test('opening roll locks interaction then disappears permanently during the match',()=>{
  assert.equal(execute('roll').ok,false);const before=state();assert.equal(execute('module',{id:'invalid'}).ok,false);assert.deepEqual(state(),before);ok('module',{id:state().module_options[0].id});assert.ok(state().modules.every(Boolean));assert.equal(execute('module',{id:state().module_options[1].id}).ok,false);ok('roll');assert.equal(execute('roll').ok,false);assert.equal(execute('card',{id:state().hand[0].id}).ok,false);settle();
  assert.ok([0,1].includes(state().first));assert.ok(state().initiative.rolls.length>=1);assert.ok(!html().includes('data-action="roll"'));assert.ok(!html().includes('先手判定'));
  const snapshot=state();assert.equal(execute('roll').ok,false);assert.deepEqual(state(),snapshot);click('help');assert.ok(elements.get('modal').open);assert.match(elements.get('modal').innerHTML,/只在开局/);assert.match(elements.get('modal').innerHTML,/上不封顶/);click('close-modal');
});
test('human confirm locks animation, updates HP once and supports public and random refill',()=>{humanTurn();settle();assert.equal(state().current_player,'human');assert.equal(state().phase,'action');assert.equal(state().robot_hand.length,6);});
test('rest chooses0–2 cards and a goal, then shares the same refill flow',()=>{
  const s=ok('rest');ok('card',{id:s.hand[0].id});ok('card',{id:s.hand[1].id});assert.equal(execute('card',{id:s.hand[2].id}).ok,false);ok('goal',{id:s.goals[0].id});const oldHp=state().hp;
  ok('confirm-rest');assert.equal(state().hand.length,4);assert.deepEqual(state().hp,oldHp);ok('supply',{index:1});ok('draw');settle();
});
test('restarting during combat cancels all pending callbacks and opens fresh initiative',()=>{
  globalThis.matchMedia=()=>({matches:false});select(moves()[0]);ok('play');assert.equal(state().animation,true);assert.ok([...timers.values()].some(t=>t.delay===1100));const previousSector=state().sector.id;ok('retry');globalThis.matchMedia=()=>({matches:true});assert.equal(state().phase,'loadout');assert.notEqual(state().sector.id,previousSector);assert.deepEqual(state().hp,[18,18]);assert.deepEqual(state().shields,[0,0]);assert.ok(state().module_progress.every(p=>p.uses===0));assert.equal(state().animation,false);assert.equal(timers.size,0);start();
});
test('complete game settles result and saves unlocks without duplicate match records',()=>{
  let turns=0;while(state().phase!=='over'||state().animation){settle();if(state().phase==='over')break;humanTurn();assert.ok(++turns<=12);}settle();
  assert.ok(elements.get('modal').open);assert.match(elements.get('modal').innerHTML,/对局|航行胜利|势均力敌/);assert.equal(JSON.parse(stored.get('star-chain-demo-v1')).matches,1);
  assert.equal(JSON.parse(stored.get('star-chain-demo-v1')).legacyImportBase.matches,0);click('close-modal');click('result');assert.equal(JSON.parse(stored.get('star-chain-demo-v1')).matches,1);ok('retry');assert.deepEqual(state().hp,[18,18]);assert.equal(state().phase,'loadout');assert.equal(elements.get('modal').open,false);
});
test('all robot selections retain public hands and run a full human/bot exchange',()=>{
  for(let level=0;level<LEVEL_COUNT;level++){click('level',{level:String(level)});if(elements.get('modal').open)click('confirm-new',{level:String(level)});assert.equal(state().opponent_level,level+1);start();humanTurn();settle();assert.equal(state().current_player,'human');ok('retry');}
});
test('wild selector accepts every1–9 value; choice and preview survive chain/op changes',async()=>{
  timers.clear();Date.now=()=>4;Math.random=()=>0;await import('../dist/app.mjs?wild-combat');start();const s=state(),wild=s.hand.find(c=>c.type==='W');assert.ok(wild);
  assert.equal(execute('wild',{value:8}).ok,false);ok('card',{id:wild.id});
  for(let value=1;value<=9;value++){ok('wild',{value});assert.equal(state().selection.wild,value);assert.equal((html().match(/data-action="wild"/g)||[]).length,9);}
  ok('chain',{index:1});ok('op',{step:0,value:-1});assert.equal(state().selection.wild,9);const before=state();for(const value of [0,10,2.5]){assert.equal(execute('wild',{value}).ok,false);assert.deepEqual(state(),before);}
  ok('card',{id:wild.id});const choice=moves().find(m=>m.move.ids.includes(wild.id));assert.ok(choice);select(choice);ok('play');assert.equal(state().animation,true);assert.equal(state().hand.some(c=>c.id===wild.id),false);assert.equal(execute('wild',{value:3}).ok,false);ok('retry');assert.equal(timers.size,0);
});

test('cloud support keeps chosen robot identity, displays support name and freezes active difficulty',async()=>{
  timers.clear();Date.now=()=>1800000000000;Math.random=()=>.573;
  const profile={revision:1,progress:{version:6,unlocked:LEVEL_COUNT-1,matches:24,lastChallenges:[],support:Array.from({length:LEVEL_COUNT},(_,i)=>freshSupport(i))},settings:{supportEnabled:true,supportEpochs:Array(LEVEL_COUNT).fill(0),config:{id:CONFIG_ID,profiles:structuredClone(BOT_PROFILES)}}};
  profile.progress.support[LEVEL_COUNT-1].effective=3;
  globalThis.fetch=async(path,opts)=>{if(path==='/api/settings'){profile.settings.config.profiles[3].temperature=1.2;profile.revision++;}return new Response(JSON.stringify(opts.method==='PUT'?{ok:true,accepted:true}:profile));};
  await import('../dist/app.mjs?cloud-support');click('level',{level:String(LEVEL_COUNT-1)});
  assert.equal(state().selected_opponent_level,LEVEL_COUNT);assert.equal(state().opponent_level,4);assert.equal(state().support_mode,true);assert.equal(state().opponent,'星航师（支援模式）');assert.match(html(),/星航师（支援模式）/);
  const old={...state().bot_profile};await window.starChainRecords.setConfiguration({expectedRevision:1,profiles:profile.settings.config.profiles});assert.deepEqual(state().bot_profile,old);
  ok('retry');assert.equal(state().bot_profile.temperature,1.2);assert.equal(state().opponent_level,4);
  click('records');assert.match(elements.get('modal').innerHTML,/每两连败/);assert.match(elements.get('modal').innerHTML,/导出游玩记录/);click('close-modal');
});
test('warp card shows from/to preview, cannot set arithmetic, and plays the previewed reflection',async()=>{
  timers.clear();globalThis.fetch=async()=>{throw Error('offline test');};stored.set('star-chain-demo-v1',JSON.stringify({version:6,unlocked:LEVEL_COUNT-1,matches:0}));Math.random=()=>0;
  let seed=1;for(;seed<1000;seed++){const g=createGame({seed});selectModule(g,g.moduleOptions[0]);while(g.phase==='opening')rollInitiative(g);if(g.first===0&&g.hands[0].some(c=>c.type==='J'))break;}
  Date.now=()=>seed;await import('../dist/app.mjs?warp-preview');start();const j=state().hand.find(c=>c.type==='J');assert.ok(j);ok('card',{id:j.id});ok('chain',{index:0});assert.match(html(),/4 → 16/);assert.match(html(),/不计加法或减法/);assert.equal(execute('op',{step:0,value:1}).ok,false);
  const p=state(),played=ok('play');assert.equal(played.board[0],16);assert.equal(played.hp[1],Math.max(0,p.hp[1]-p.automatic_damage));assert.equal(played.hand.some(c=>c.id===j.id),false);
});

test('two real losses offer a choice; closing/refusing retains strength, accepting starts only the next game lower',async()=>{
 timers.clear();globalThis.fetch=async()=>{throw Error('offline test');};Date.now=()=>1800000000000;Math.random=()=>.573;
 stored.set('star-chain-demo-v1',JSON.stringify({version:6,unlocked:LEVEL_COUNT-1,matches:0,support:Array.from({length:LEVEL_COUNT},(_,i)=>freshSupport(i))}));
 await import('../dist/app.mjs?consent-flow');click('level',{level:String(LEVEL_COUNT-1)});
 function lose(){start();let turns=0;while(state().phase!=='over'){settle();if(state().phase==='over')break;ok('rest');ok('confirm-rest');assert.ok(++turns<=12);}settle();assert.equal(state().winner,1);assert.ok(state().post_match_review?.suggestion);assert.match(elements.get('modal').innerHTML,/下一局可以试试/);}
 lose();assert.equal(state().support_offer,null);ok('retry');lose();
 const offer={...state().support_offer},oldId=state().record_id;assert.equal(offer.from,LEVEL_COUNT-1);assert.equal(state().opponent_level,LEVEL_COUNT);assert.equal(state().support_mode,false);assert.match(elements.get('modal').innerHTML,/接受支援/);assert.match(elements.get('modal').innerHTML,new RegExp(`保持${LEVEL_COUNT}级`));
 click('close-modal');assert.equal(state().opponent_level,LEVEL_COUNT);ok('retry');assert.equal(state().record_id,oldId);assert.equal(state().phase,'over');
 ok('decline-support',{level:LEVEL_COUNT-1});assert.equal(state().opponent_level,LEVEL_COUNT);assert.equal(state().support_offer,null);assert.notEqual(state().record_id,oldId);
 lose();assert.equal(state().support_offer,null);ok('retry');lose();assert.ok(state().support_offer);
 ok('accept-support',{level:LEVEL_COUNT-1});assert.equal(state().opponent_level,LEVEL_COUNT-1);assert.equal(state().selected_opponent_level,LEVEL_COUNT);assert.equal(state().support_mode,true);assert.match(state().opponent,/（支援模式）/);
 const id=state().record_id;assert.equal(execute('accept-support',{level:LEVEL_COUNT-1}).ok,false);assert.equal(state().record_id,id);assert.equal(state().opponent_level,LEVEL_COUNT-1);
 const exported=await window.starChainRecords.export();assert.equal(exported.supportDecisions.length,2);assert.deepEqual(exported.supportDecisions.map(x=>x.accept),[false,true]);
});
