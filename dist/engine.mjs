import {BOT_PROFILES,validateProfile,RULES_VERSION,compatibleRules} from './difficulty.mjs?v=flight-records-2';
import {MODULES,SECTORS,moduleById,sectorById,freshModuleProgress,copyModuleProgress,previewTactics} from './tactics.mjs?v=flight-records-2';
import {challengeById,drawChallenges,freshChallengeProgress,copyChallengeProgress,previewChallenges,replaceChallenges} from './challenges.mjs?v=flight-records-2';

export const INITIATIVE_SHIELD=3;
export const initiativeShieldForLevel=level=>level<6?1:level<12?2:3;
export const ROBOTS = [{"name":"小启","tag":"启航","description":"第1级星舰对手","level":0,"art":0,"hue":0,"motion":"float","duration":3.1,"drift":3,"tilt":0.6},{"name":"微光","tag":"启航","description":"第2级星舰对手","level":1,"art":0,"hue":45,"motion":"glide","duration":3.29,"drift":4,"tilt":0.72},{"name":"星芽","tag":"启航","description":"第3级星舰对手","level":2,"art":1,"hue":0,"motion":"bank","duration":3.48,"drift":5,"tilt":0.84},{"name":"云雀","tag":"探索","description":"第4级星舰对手","level":3,"art":1,"hue":-35,"motion":"orbit","duration":3.67,"drift":6,"tilt":0.96},{"name":"巡航者","tag":"探索","description":"第5级星舰对手","level":4,"art":2,"hue":0,"motion":"pulse","duration":3.86,"drift":3,"tilt":1.08},{"name":"寻路者","tag":"探索","description":"第6级星舰对手","level":5,"art":1,"hue":90,"motion":"float","duration":4.05,"drift":4,"tilt":1.2},{"name":"探路者","tag":"进阶","description":"第7级星舰对手","level":6,"art":2,"hue":30,"motion":"glide","duration":4.24,"drift":5,"tilt":1.32},{"name":"流光","tag":"进阶","description":"第8级星舰对手","level":7,"art":2,"hue":-35,"motion":"bank","duration":4.43,"drift":6,"tilt":1.44},{"name":"引航者","tag":"进阶","description":"第9级星舰对手","level":8,"art":3,"hue":15,"motion":"orbit","duration":4.62,"drift":3,"tilt":1.56},{"name":"逐光者","tag":"进阶","description":"第10级星舰对手","level":9,"art":3,"hue":-75,"motion":"orbit","duration":5.15,"drift":5,"tilt":1.9},{"name":"远航者","tag":"远航","description":"第11级星舰对手","level":10,"art":3,"hue":80,"motion":"pulse","duration":4.81,"drift":4,"tilt":1.68},{"name":"守望者","tag":"远航","description":"第12级星舰对手","level":11,"art":3,"hue":0,"motion":"float","duration":5,"drift":5,"tilt":1.8},{"name":"追光者","tag":"远航","description":"第13级星舰对手","level":12,"art":4,"hue":20,"motion":"glide","duration":5.19,"drift":6,"tilt":1.92},{"name":"破晓者","tag":"策略","description":"第14级星舰对手","level":13,"art":4,"hue":-55,"motion":"bank","duration":5.38,"drift":3,"tilt":2.04},{"name":"织星者","tag":"策略","description":"第15级星舰对手","level":14,"art":4,"hue":0,"motion":"orbit","duration":5.57,"drift":4,"tilt":2.16},{"name":"星航师","tag":"策略","description":"第16级星舰对手","level":15,"art":5,"hue":0,"motion":"pulse","duration":5.76,"drift":5,"tilt":2.28}];
const easyNames=['低空泊位','二号港口','四号港口','六号港口','八号港口','十号港口','十二号港','十四号港','十六号港','远端泊位'];
const preciseValues=[0,2,5,7,9,11,12,15,18,20];
const preciseNames=['零点归航','二号信标','五号信标','七号信标','九号信标','十一信标','十二信标','十五信标','十八信标','二十信标'];
const linkNames=['双星会合','近距编队','四格编队','六格编队','远距编队','二十星门','正中穿行','等距三星','一步领先','一步殿后'];
const linkTexts=['落点与另一条星链相同','落点与另一条星链相差 2','落点与另一条星链相差 4','落点与另一条星链相差 6','落点与另一条星链相差 8','落点与另一条星链之和为 20','落点在另两条星链的正中间，三值不同','三条星链的数值各不相同，且等距排列','落点比另两条星链中的较大值多 1','落点比另两条星链中的较小值少 1'];
export const GOALS = [
  ...easyNames.map((name,i)=>({id:`E${i+1}`,kind:'E',name,damage:1,values:i===9?[18,19,20]:[i*2,i*2+1],text:`落点为 ${i===9?'18、19 或 20':`${i*2} 或 ${i*2+1}`}`})),
  ...preciseValues.map((value,i)=>({id:`P${i+1}`,kind:'P',name:preciseNames[i],damage:2,values:[value],text:`落点恰好为 ${value}`})),
  ...linkNames.map((name,i)=>({id:`L${i+1}`,kind:'L',name,damage:3,text:linkTexts[i]}))
];
export const goalById = id => GOALS.find(g=>g.id===id);
export const bestGoalClaims = ids => [...ids].sort((a,b)=>goalById(b).damage-goalById(a).damage);
const legacyRules = version => version === 'flight-records-1' || version === 'flight-records-2';
export function warpLandings(before, rulesVersion=RULES_VERSION) {
  if(legacyRules(rulesVersion))return before===10?[9,11]:[20-before];
  const center=20-before;
  return [center-1,center,center+1].filter(n=>n>=0&&n<=20&&n!==before);
}
export const rulesForLevel = level => level>=7
  ? {hp:24,extraZone:true,repairSlots:4,dockCount:2,barterCount:2}
  : {hp:18,extraZone:false,repairSlots:3,dockCount:0,barterCount:0};
// Presentation-only random stream: reopening results cannot reroll the offer or decks.
export const pinOptionsForMatch = seed => shuffle({rng:(Number(seed)^0x72BC1345)>>>0},MODULES.map(m=>m.id)).slice(0,3);
export const cardLabel = c => c.type==='N'?String(c.value):c.type==='W'?'星云':c.type==='J'?'折跃':c.type==='D'?'定轨':c.type==='B'?'调拨':'加速星';
export const chainName = i => ['蓝星链','紫星链','橙星链'][i];
export const isFinalRound = s => s.round>=12;
const skipsRefill = s => s.hp[1-s.current]<=0||isFinalRound(s);
function insist(condition,message){if(!condition)throw new Error(message);}
function random(s){let t=s.rng+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
function shuffle(s,list){for(let i=list.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
function draw(s){if(!s.deck.length)s.deck=shuffle(s,s.discard.splice(0));insist(s.deck.length,'暂时没有可抽取的牌');return s.deck.pop();}
function drawGoal(s,kind){if(!s.goalDecks[kind].length)s.goalDecks[kind]=shuffle(s,s.goalDiscards[kind].splice(0));return s.goalDecks[kind].pop();}
function replaceGoal(s,id){const i=s.goals.indexOf(id);insist(i>=0,'这张目标已经不在桌面上');const kind=goalById(id).kind;s.goalDiscards[kind].push(id);s.goals[i]=drawGoal(s,kind);}
export function createGame({level=0,first=null,seed=Date.now(),previousChallenges=[],modules,sectorId,previousSector=null,initiativeShield=initiativeShieldForLevel(level),handSize=6,wildCount=3,accelCount=3,warpCount=2,botProfile=null,choices=false,pinnedModule=null,robotModuleCounts=null,hp,dockCount,barterCount,extraZone,repairSlots,rulesVersion=RULES_VERSION}={}){
  insist(compatibleRules(rulesVersion),'规则版本无效');
  const defaults=rulesForLevel(legacyRules(rulesVersion)?0:level);hp??=defaults.hp;dockCount??=defaults.dockCount;barterCount??=defaults.barterCount;extraZone??=defaults.extraZone;repairSlots??=defaults.repairSlots;
  insist(Number.isInteger(level)&&level>=0&&level<ROBOTS.length,'请选择有效的对手');insist(first===null||[0,1].includes(first),'先手无效');
  insist(modules===undefined||(Array.isArray(modules)&&modules.length===2&&modules.every(id=>id===null||moduleById(id))),'模块无效');
  insist(sectorId===undefined||sectorId===null||sectorById(sectorId),'星域无效');
  insist(Number.isInteger(initiativeShield)&&initiativeShield>=0&&initiativeShield<=6,'先手补偿无效');
  insist([5,6].includes(handSize)&&[2,3].includes(wildCount)&&[2,3].includes(accelCount)&&[0,2].includes(warpCount),'实验参数无效');
  insist(Number.isInteger(hp)&&hp>=18&&hp<=36&&(extraZone===true||extraZone===false)&&(repairSlots===3||repairSlots===4)&&[0,2].includes(dockCount)&&[0,2].includes(barterCount),'实验参数无效');
  const deck=[];for(let n=1;n<=9;n++)for(let c=0;c<4;c++)deck.push({id:`n${n}-${c}`,type:'N',value:n});
  for(let i=0;i<Math.max(wildCount,accelCount);i++){if(i<wildCount)deck.push({id:`w${i}`,type:'W'});if(i<accelCount)deck.push({id:`a${i}`,type:'A'});}
  for(let i=0;i<warpCount;i++)deck.push({id:`j${i}`,type:'J'});
  for(let i=0;i<dockCount;i++)deck.push({id:`d${i}`,type:'D'});
  for(let i=0;i<barterCount;i++)deck.push({id:`b${i}`,type:'B'});
  const s={aiProfile:validateProfile(botProfile||BOT_PROFILES[level]),handSize,deckSize:deck.length,rng:Number(seed)>>>0,level,board:[4,10,16],trails:[[],[],[]],deck,discard:[],hands:[[],[]],market:[],goals:[],goalDecks:{},goalDiscards:{E:[],P:[],L:[]},hp:[hp,hp],shields:[0,0],shieldAllowance:initiativeShield,calibrates:[1,1],damageTotal:[0,0],healingTotal:[0,0],dice:[],round:1,turnInRound:0,first,current:first,phase:first===null?'opening':'action',pending:null,lastAction:null,turns:[0,0],challengeIds:[],challengeProgress:[{},{}],challengeRecent:[],history:[],winner:null,repairSlots};
  s.rulesVersion=rulesVersion;
  shuffle(s,deck);for(let k=0;k<handSize;k++)for(let p=0;p<2;p++)s.hands[p].push(draw(s));
  for(let i=0;i<3;i++)s.market.push(draw(s));
  for(const kind of ['E','P','L']){s.goalDecks[kind]=shuffle(s,GOALS.filter(g=>g.kind===kind).map(g=>g.id));s.goals.push(drawGoal(s,kind));}
  if(extraZone)s.goals.push(drawGoal(s,'E'));
  s.challengeIds=repairSlots===4?drawChallenges(()=>random(s),previousChallenges,[1,1,1,2]):drawChallenges(()=>random(s),previousChallenges);
  s.challengeProgress=[freshChallengeProgress(s.challengeIds),freshChallengeProgress(s.challengeIds)];
  // Setup randomness is separate: selecting a module cannot reroll the dice or decks.
  const setup={rng:(Number(seed)^0x6A09E667)>>>0};
  if(!choices){
    s.sectorId=sectorId===undefined?shuffle(setup,SECTORS.filter(x=>x.id!==previousSector).map(x=>x.id))[0]:sectorId;
    s.moduleOptions=modules===undefined?shuffle(setup,MODULES.map(m=>m.id)).slice(0,3):[];
    s.modules=modules?[...modules]:[null,s.moduleOptions[Math.floor(random(setup)*3)]];
  }else{
    insist(sectorId===undefined&&modules===undefined,'新规则开局不再预先指定星域或模块');
    const pool=shuffle(setup,SECTORS.filter(x=>x.id!==previousSector).map(x=>x.id));
    s.choices=true;s.sectorOptions=pool.slice(0,3);s.sectorId=null;s.boon=null;
    const catalog=MODULES.map(m=>m.id),counts=robotModuleCounts||{};
    const low=Math.min(...catalog.map(id=>counts[id]||0));
    const tied=catalog.filter(id=>(counts[id]||0)===low);
    const robotModule=tied[Math.floor(random(setup)*tied.length)];
    const companions=shuffle(setup,catalog.filter(id=>id!==robotModule)).slice(0,2);
    const picked=shuffle(setup,[robotModule,...companions]);
    if(pinnedModule&&moduleById(pinnedModule)&&!picked.includes(pinnedModule)){
      const slots=picked.map((id,index)=>id===robotModule?-1:index).filter(index=>index>=0);
      picked[slots[Math.floor(random(setup)*slots.length)]]=pinnedModule;
    }
    s.moduleOptions=picked;s.modules=[null,robotModule];
  }
  s.moduleProgress=[freshModuleProgress(),freshModuleProgress()];
  if(first!==null)s.shields[1-first]=initiativeShield;
  if(modules===undefined)s.phase='loadout';
  return s;
}
export function selectModule(s,id){
  active(s,'loadout');insist(s.moduleOptions.includes(id),'请选择本局提供的模块');
  s.modules[0]=id;s.phase=s.first===null?'opening':'action';
  return [...s.modules];
}
export function rollInitiative(s){
  active(s,'opening');
  const pair=[1+Math.floor(random(s)*6),1+Math.floor(random(s)*6)];s.dice.push(pair);
  if(pair[0]!==pair[1]){s.first=pair[0]>pair[1]?0:1;s.current=s.first;s.shields[1-s.first]=s.shieldAllowance;s.phase=s.choices?'sector':'action';}
  return{pair,tie:pair[0]===pair[1],first:s.first};
}
export function goalMatches(id,board,chain){
  const g=goalById(id);if(!g)return false;const x=board[chain],other=board.filter((_,i)=>i!==chain);
  if(g.values)return g.values.includes(x);
  switch(id){
    case'L1':return other.includes(x);
    case'L2':return other.some(y=>Math.abs(x-y)===2);
    case'L3':return other.some(y=>Math.abs(x-y)===4);
    case'L4':return other.some(y=>Math.abs(x-y)===6);
    case'L5':return other.some(y=>Math.abs(x-y)===8);
    case'L6':return other.some(y=>x+y===20);
    case'L7':return new Set(board).size===3&&2*x===other[0]+other[1];
    case'L8':{const a=[...board].sort((a,b)=>a-b);return a[0]!==a[1]&&a[1]-a[0]===a[2]-a[1];}
    case'L9':return x===Math.max(...other)+1;
    case'L10':return x===Math.min(...other)-1;
  }
  return false;
}
export function inspectMove(board,hand,goals,move,rulesVersion=RULES_VERSION){
  insist(move&&Number.isInteger(move.chain)&&move.chain>=0&&move.chain<3,'先选择一条星链');
  insist(Array.isArray(move.ids)&&move.ids.length>0,'请选择要打出的牌');
  insist(new Set(move.ids).size===move.ids.length,'同一张牌不能使用两次');
  const cards=move.ids.map(id=>{const c=hand.find(c=>c.id===id);insist(c,'这张牌不在你的手中');return c;});
  const funcs=cards.filter(c=>c.type!=='N');insist(funcs.length<=1,'每回合只能使用一张功能牌');
  const warp=cards.find(c=>c.type==='J'),dock=cards.find(c=>c.type==='D');
  if(dock){
    insist(cards.length===1,'定轨单独使用');insist(Array.isArray(move.ops)&&move.ops.length===0,'定轨不属于加减法');
    insist(move.port===0||move.port===10||move.port===20,'定轨只能落到 0、10 或 20');
    const before=board[move.chain],after=move.port;
    insist(after!==before,'这一回合必须改变星链的最终数值');
    const result=[...board];result[move.chain]=after;
    return{before,after,board:result,steps:[],cards,matches:goals.filter(id=>goalMatches(id,result,move.chain)),expression:`${before} → ${after}`,dock:true};
  }
  if(warp){
    insist(cards.length===1,'折跃单独使用');insist(Array.isArray(move.ops)&&move.ops.length===0,'折跃不属于加减法');
    const before=board[move.chain],options=warpLandings(before,rulesVersion);
    const after=move.warpTo??(before===10?null:20-before);
    insist(options.includes(after),`请选择折跃落点：${options.join(' 或 ')}（不能停在原位）`);
    const result=[...board];result[move.chain]=after;
    return{before,after,board:result,steps:[],cards,matches:goals.filter(id=>goalMatches(id,result,move.chain)),expression:`${before} → ${after}`,warp:true};
  }
  const accel=cards.find(c=>c.type==='A');const wild=cards.find(c=>c.type==='W');
  if(accel)insist(cards.length===3&&cards.filter(c=>c.type==='N').length===2,'加速星需要搭配两张数字牌');
  else insist(cards.length===1,'普通出牌每次使用一张牌');
  if(wild)insist(Number.isInteger(move.wild)&&move.wild>=1&&move.wild<=9,'星云可作为 1–9 中的一个整数');
  const numeric=cards.filter(c=>c.type!=='A');
  insist(Array.isArray(move.ops)&&move.ops.length===numeric.length&&move.ops.every(o=>o===1||o===-1),'请选择加法或减法');
  let value=board[move.chain];const before=value;const steps=[];
  numeric.forEach((c,i)=>{const n=c.type==='W'?move.wild:c.value;const start=value;value+=move.ops[i]*n;const last=i===numeric.length-1;if(last)insist(value>=0&&value<=20,'最终结果必须在 0–20 之间');else insist(value>=0,'加速的中间结果不能小于 0');steps.push({card:c,from:start,value:n,op:move.ops[i],to:value});});
  // V4 acceleration may return to origin; historical replays keep their original rule.
  insist(value!==before||(accel&&rulesVersion==='flight-records-4'),'这一回合必须改变星链的最终数值');
  const result=[...board];result[move.chain]=value;
  const expression=[String(before),...steps.flatMap(x=>[x.op===1?'+':'−',String(x.value)])].join(' ');
  const trace=steps.some((step,index)=>index<steps.length-1&&step.to>20)?steps.reduce((text,step)=>`${text} ${step.op===1?'+':'−'} ${step.value} = ${step.to}`,String(before)):undefined;
  return{before,after:value,board:result,steps,cards,matches:goals.filter(id=>goalMatches(id,result,move.chain)),expression,...(trace?{trace}:{})};
}
function active(s,phase){insist(s.phase===phase,'当前不能执行这个操作');}
function challengeEvent(info,claimed){return{chain:info.chain,before:info.before,after:info.after,board:info.board,ops:info.ops,claimed};}
function scoreClaims(obs,info,claimed){
  const baseDamage=claimed.reduce((n,id)=>n+goalById(id).damage,0);
  const reward=previewChallenges(obs.challengeIds||[],obs.challengeProgress||{},challengeEvent(info,claimed));
  const tactics=previewTactics(obs.moduleId,obs.sectorId,obs.moduleProgress,{...challengeEvent(info,claimed),healing:reward.healing});
  const attack=claimed.length>0,chainDamage=attack&&obs.boon?.type==='chain'&&obs.boon.chain===info.chain?1:0,strikeDamage=attack&&obs.boon?.type==='strike'&&obs.boon.left?.[obs.actor]?1:0;
  const rawDamage=baseDamage+tactics.moduleDamage+tactics.sectorDamage+chainDamage+strikeDamage,blockedDamage=Math.min(obs.opponentShield||0,rawDamage),damage=rawDamage-blockedDamage,healing=reward.healing+tactics.moduleHealing;
  const lethal=damage>0&&Number.isInteger(obs.actor)&&damage>=obs.hp?.[1-obs.actor];
  // Removing a finite shield has value too; otherwise AI can discard useful attacks.
  return{chosen:claimed,damage,rawDamage,blockedDamage,healing,baseDamage,baseHealing:reward.healing,moduleDamage:tactics.moduleDamage,moduleHealing:tactics.moduleHealing,sectorDamage:tactics.sectorDamage,chainDamage,strikeDamage,points:rawDamage+healing,lethal,awarded:reward.awarded,nextChallengeProgress:reward.next,nextModuleProgress:tactics.next};
}
function bestScoringClaims(obs,info){
  if(!legacyRules(obs.rulesVersion))return scoreClaims(obs,info,bestGoalClaims(info.matches));
  const ids=info.matches.slice().sort((a,b)=>goalById(b).damage-goalById(a).damage),options=[];
  if(ids.length<=2)options.push(ids);
  else for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)options.push([ids[i],ids[j]]);
  return options.map(ids=>scoreClaims(obs,info,ids)).sort((a,b)=>Number(b.lethal)-Number(a.lethal)||b.points-a.points||b.damage-a.damage)[0];
}
function scoreDelta(a,b){return Number(!!a.lethal)-Number(!!b.lethal)||a.points-b.points||a.damage-b.damage;}
// One nudge toward a goal the landing does not already meet. Staying put wins ties.
export function calibrateOffer(goals,info,obs){
  if(!((obs?.calibrates?.[obs.actor]||0)>0)||!info||!Number.isInteger(info.after)||!Number.isInteger(info.chain)||!Array.isArray(info.board))return null;
  const list=goals||[],ops=info.ops||info.steps?.map(step=>step.op)||[];
  const original=list.filter(id=>goalMatches(id,info.board,info.chain));
  const base=bestScoringClaims(obs,{chain:info.chain,before:info.before,after:info.after,board:info.board,ops,matches:original});
  let best=null;
  for(const delta of [-1,1]){
    const after=info.after+delta;
    if(after<0||after>20||after===info.before)continue;
    const board=info.board.slice();board[info.chain]=after;
    const matches=list.filter(id=>goalMatches(id,board,info.chain));
    if(!matches.some(id=>!original.includes(id)))continue;
    const scoring=bestScoringClaims(obs,{chain:info.chain,before:info.before,after,board,ops,matches});
    if(scoreDelta(scoring,base)<=0)continue;
    if(!best||scoreDelta(scoring,best.scoring)>0)best={delta,after,board,matches,scoring};
  }
  return best;
}
function moveWithCalibrate(m,offer){
  return{...m,...offer.scoring,move:{...m.move,calibrate:true},info:{...m.info,after:offer.after,board:offer.board,matches:offer.matches,expression:`${m.info.expression} · 校准至 ${offer.after}`,calibrate:offer.delta}};
}
export function includeCalibrate(obs,moves){
  if(!((obs?.calibrates?.[obs.actor]||0)>0)||!moves?.length)return moves;
  const extra=[];
  for(const m of moves){const offer=calibrateOffer(obs.goals,m.info,obs);if(offer)extra.push(moveWithCalibrate(m,offer));}
  return extra.length?[...moves,...extra]:moves;
}
export function evaluateMove(obs,move){
  const inspected=inspectMove(obs.board,obs.hand,obs.goals,move,obs.rulesVersion);
  const info={...inspected,chain:move.chain,ops:inspected.steps.map(step=>step.op)};
  const scored={move,info,...bestScoringClaims(obs,info)};
  if(!move.calibrate)return scored;
  const offer=calibrateOffer(obs.goals,info,obs);
  if(!offer)throw new Error('这次不能校准');
  return moveWithCalibrate(scored,offer);
}
function completeScoring(s,claimed){
  const actor=s.current,p=s.pending;
  const reward=scoreClaims(observation(s,actor),{...p,board:s.board},claimed);
  for(const key of ['damage','rawDamage','blockedDamage','healing','baseDamage','baseHealing','moduleDamage','moduleHealing','sectorDamage'])p[key]=reward[key];
  p.challengeAwards=reward.awarded;p.claimed=[...claimed];
  s.moduleProgress[actor]=reward.nextModuleProgress;p.moduleProgress=copyModuleProgress(reward.nextModuleProgress);
  p.hpBefore=[...s.hp];p.actualDamage=Math.min(s.hp[1-actor],p.damage);
  // One atomic combat transaction, before any new contract is considered.
  s.shields[1-actor]-=p.blockedDamage;s.hp[1-actor]-=p.actualDamage;s.hp[actor]+=p.healing;
  s.damageTotal[actor]+=p.actualDamage;s.healingTotal[actor]+=p.healing;p.hpAfter=[...s.hp];
  s.challengeProgress[actor]=reward.nextChallengeProgress;p.repairProgress=copyChallengeProgress(reward.nextChallengeProgress);
  if(s.hp[1-actor]>0){
    const refreshed=replaceChallenges(s.challengeIds,s.challengeProgress,reward.awarded,()=>random(s),s.challengeRecent);
    s.challengeIds=refreshed.ids;s.challengeProgress=refreshed.progress;
    s.challengeRecent=[...s.challengeRecent,...reward.awarded].slice(-9);
  }
  s.lastAction={...p};s.phase='refill';if(skipsRefill(s))finishTurn(s);
}
export function play(s,move){
  active(s,'action');
  const inspected=inspectMove(s.board,s.hands[s.current],s.goals,move,s.rulesVersion);
  let info={...inspected,chain:move.chain,ops:inspected.steps.map(step=>step.op)};
  if(move.calibrate){
    const offer=calibrateOffer(s.goals,info,observation(s,s.current));
    insist(offer,'这次不能校准');
    info={...info,after:offer.after,board:offer.board,matches:offer.matches,expression:`${info.expression} · 校准至 ${offer.after}`,calibrate:offer.delta};
    s.calibrates[s.current]--;
  }
  s.hands[s.current]=s.hands[s.current].filter(c=>!move.ids.includes(c.id));
  for(const c of info.cards.filter(c=>c.type==='A'||c.type==='J'||c.type==='D'))s.discard.push(c);
  for(const step of info.steps){s.trails[move.chain].push(step.card);if(s.trails[move.chain].length===4)s.discard.push(...s.trails[move.chain].splice(0));}
  s.board=info.board;s.pending={actor:s.current,warp:!!info.warp,chain:move.chain,expression:info.expression,before:info.before,after:info.after,ops:info.ops,matches:info.matches,damage:0,healing:0,challengeAwards:[],claimed:[],rest:false};if(info.trace)s.pending.trace=info.trace;
  if(info.calibrate)s.pending.calibrate=info.calibrate;
  s.lastAction={...s.pending};s.phase=info.matches.length?'claim':'refill';
  if(s.phase==='refill')completeScoring(s,[]);
  return info;
}
export function claim(s,ids){
  active(s,'claim');insist(Array.isArray(ids)&&(!legacyRules(s.rulesVersion)||ids.length<=2)&&new Set(ids).size===ids.length,'目标必须各不相同，且符合本局规则');
  insist(ids.every(id=>s.pending.matches.includes(id)&&s.goals.includes(id)),'只能领取本次出牌满足的目标');
  for(const id of [...ids].sort((a,b)=>['E','P','L'].indexOf(a[0])-['E','P','L'].indexOf(b[0])))replaceGoal(s,id);
  completeScoring(s,ids);
}
export function playAndClaim(s,move){
  active(s,'action');const actor=s.current,scored=evaluateMove(observation(s,actor),move);
  const info=play(s,move);
  const claimed=scored.chosen;
  if(s.phase==='claim')claim(s,claimed);
  if(s.boon?.type==='strike'&&claimed.length)s.boon.left[actor]=0;
  return {...info,claimed,damage:s.lastAction.damage,healing:s.lastAction.healing,challengeAwards:s.lastAction.challengeAwards};
}
export function transfer(s,giveId,marketIndex){
  active(s,'action');
  const actor=s.current,hand=s.hands[actor],bar=hand.find(c=>c.type==='B');
  insist(bar,'没有调拨');insist(giveId!==bar.id,'调拨要用另一张手牌交换');
  const give=hand.find(c=>c.id===giveId);insist(give,'只能换自己的手牌');
  insist(Number.isInteger(marketIndex)&&marketIndex>=0&&marketIndex<s.market.length,'请选择补给区中的一张牌');
  const taken=s.market[marketIndex];s.market[marketIndex]=give;s.discard.push(bar);
  s.hands[actor]=hand.filter(c=>c.id!==bar.id&&c.id!==giveId);s.hands[actor].push(taken);
  // V3 is preparation within this action: no refill, scoring, streak reset or turn advance.
  // Consuming B bounds repeated swaps by actual cards held; the received card is usable now.
  if(!legacyRules(s.rulesVersion))return {actor,giveId,takenId:taken.id,marketIndex};
  s.challengeProgress[actor]=previewChallenges(s.challengeIds,s.challengeProgress[actor],{rest:true}).next;
  s.moduleProgress[actor]=previewTactics(s.modules[actor],s.sectorId,s.moduleProgress[actor],{rest:true}).next;
  s.pending={actor,transfer:true,rest:false,damage:0,healing:0,challengeAwards:[],claimed:[],discarded:1};
  s.lastAction={...s.pending};s.phase='refill';
  if(s.hands[actor].length>=s.handSize||skipsRefill(s))finishTurn(s);
}
export function rest(s,ids=[],goal=null){
  active(s,'action');insist(Array.isArray(ids)&&ids.length<=2&&new Set(ids).size===ids.length,'整备最多弃两张不同的牌');
  insist(ids.every(id=>s.hands[s.current].some(c=>c.id===id)),'只能弃掉自己的手牌');
  insist(goal===null||s.goals.includes(goal),'请选择桌面上的目标');
  s.discard.push(...s.hands[s.current].filter(c=>ids.includes(c.id)));s.hands[s.current]=s.hands[s.current].filter(c=>!ids.includes(c.id));
  if(goal)replaceGoal(s,goal);
  s.challengeProgress[s.current]=previewChallenges(s.challengeIds,s.challengeProgress[s.current],{rest:true}).next;
  s.moduleProgress[s.current]=previewTactics(s.modules[s.current],s.sectorId,s.moduleProgress[s.current],{rest:true}).next;
  s.pending={actor:s.current,rest:true,damage:0,healing:0,challengeAwards:[],claimed:[],discarded:ids.length,replaced:goal};s.lastAction={...s.pending};s.phase='refill';
  if(s.hands[s.current].length===s.handSize||skipsRefill(s))finishTurn(s);
}
export function takeCard(s,source){
  active(s,'refill');insist(s.hands[s.current].length<s.handSize,'手牌已经补满');
  insist(source==='deck'||(Number.isInteger(source)&&source>=0&&source<3),'请选择补给区中的一张牌');
  let card;if(source==='deck')card=draw(s);else{card=s.market[source];s.market[source]=draw(s);}
  s.hands[s.current].push(card);
  if(s.hands[s.current].length===s.handSize)finishTurn(s);
  return card;
}
function finishTurn(s){
  const actor=s.current;s.turns[actor]++;
  s.history.unshift({...s.pending,round:s.round});s.history=s.history.slice(0,24);s.pending=null;
  if(s.hp[1-actor]<=0){s.phase='over';s.winner=actor;return;}
  if(s.turnInRound===1){
    if(isFinalRound(s)){s.phase='over';s.winner=s.hp[0]===s.hp[1]?'draw':s.hp[0]>s.hp[1]?0:1;return;}
    s.round++;s.turnInRound=0;s.current=s.first;
    if(s.choices&&s.round===5&&!s.boon){s.boonOffer={chain:offerChain(s)};s.phase='boon';return;}
  }else{s.turnInRound=1;s.current=1-s.first;}
  s.phase='action';
}
function worthMove(m){return m?Number(m.lethal)*100+m.points:0;}
function bestImmediate(obs){const moves=includeCalibrate(obs,legalMoves(obs));return moves.length?moves.reduce((p,m)=>scoreDelta(m,p)>0?m:p):null;}
export function chooseTransfer(obs){
  if(legacyRules(obs.rulesVersion))return null;
  const bar=obs.hand.find(c=>c.type==='B');if(!bar)return null;
  const base=bestImmediate(obs);let best=base,choice=null;
  for(const give of obs.hand.filter(c=>c.id!==bar.id))for(let index=0;index<obs.market.length;index++){
    const hand=[...obs.hand.filter(c=>c.id!==bar.id&&c.id!==give.id),obs.market[index]];
    const next=bestImmediate({...obs,hand});
    if(next&&(!best||scoreDelta(next,best)>0)){best=next;choice={giveId:give.id,marketIndex:index};}
  }
  return choice;
}
function offerChain(s){
  let best=0,bestValue=-Infinity;
  try{for(const chain of [0,1,2]){s.boon={type:'chain',chain};const value=worthMove(bestImmediate(observation(s,s.first)));if(value>bestValue){bestValue=value;best=chain;}}}
  finally{s.boon=null;}
  return best;
}
export function selectSector(s,id){
  active(s,'sector');insist(s.sectorOptions.includes(id),'请选择本局提供的星域');
  s.sectorId=id;s.phase='action';return id;
}
export function chooseSector(s){
  active(s,'sector');let best=s.sectorOptions[0],bestValue=-Infinity;const saved=s.sectorId;
  try{for(const id of s.sectorOptions){s.sectorId=id;const value=worthMove(bestImmediate(observation(s,s.first)))-worthMove(bestImmediate(observation(s,1-s.first)));if(value>bestValue){bestValue=value;best=id;}}}
  finally{s.sectorId=saved;}
  return best;
}
export function selectBoon(s,kind){
  active(s,'boon');
  if(kind==='calibrate'){s.calibrates=s.calibrates.map(n=>Math.min(2,n+1));s.boon={type:'calibrate'};}
  else if(kind==='chain'){insist(s.boonOffer&&[0,1,2].includes(s.boonOffer.chain),'链加成无效');s.boon={type:'chain',chain:s.boonOffer.chain};}
  else if(kind==='strike')s.boon={type:'strike',left:[1,1]};
  else insist(false,'请选择后段增益');
  s.phase='action';return structuredClone(s.boon);
}
export function chooseBoon(s){
  active(s,'boon');let best='calibrate',bestOwn=-Infinity;
  for(const kind of ['calibrate','chain','strike']){
    const trial=structuredClone(s);
    if(kind==='calibrate')trial.calibrates=trial.calibrates.map(n=>Math.min(2,n+1));
    if(kind==='chain')trial.boon={type:'chain',chain:s.boonOffer.chain};
    if(kind==='strike')trial.boon={type:'strike',left:[1,1]};
    trial.phase='action';
    const value=worthMove(bestImmediate(observation(trial,trial.first)));
    if(value>bestOwn){bestOwn=value;best=kind;}
  }
  return best;
}
export function observation(s,actor){
  return{rulesVersion:s.rulesVersion,level:s.level,botProfile:{...s.aiProfile},actor,shield:s.shields[actor],opponentShield:s.shields[1-actor],sectorId:s.sectorId,moduleId:s.modules[actor],opponentModuleId:s.phase==='loadout'?null:s.modules[1-actor],moduleProgress:copyModuleProgress(s.moduleProgress[actor]),opponentModuleProgress:copyModuleProgress(s.moduleProgress[1-actor]),board:[...s.board],hand:s.hands[actor].map(c=>({...c})),opponentHand:s.hands[1-actor].map(c=>({...c})),goals:[...s.goals],market:s.market.map(c=>({...c})),hp:[...s.hp],round:s.round,turnInRound:s.turnInRound,challengeIds:[...s.challengeIds],challengeProgress:copyChallengeProgress(s.challengeProgress[actor]),opponentChallengeProgress:copyChallengeProgress(s.challengeProgress[1-actor]),calibrates:[...s.calibrates],boon:s.boon?structuredClone(s.boon):null};
}
export function legalMoves(obs,{simple=false,allowWild=!simple,allowAccel=!simple,allowWarp=allowWild}={}){
  const result=[];const consider=move=>{try{result.push(evaluateMove(obs,move));}catch{}};
  for(let chain=0;chain<3;chain++){
    for(const c of obs.hand){
      if(c.type==='J'&&allowWarp)for(const warpTo of warpLandings(obs.board[chain],obs.rulesVersion))consider({chain,ids:[c.id],ops:[],warpTo});
      if(c.type==='D')for(const port of [0,10,20])consider({chain,ids:[c.id],ops:[],port});
      if(c.type==='N')for(const op of [1,-1])consider({chain,ids:[c.id],ops:[op]});
      if(c.type==='W'&&allowWild)for(let wild=1;wild<=9;wild++)for(const op of [1,-1])consider({chain,ids:[c.id],ops:[op],wild});
    }
    if(allowAccel){const a=obs.hand.find(c=>c.type==='A'),nums=obs.hand.filter(c=>c.type==='N');if(a)for(let i=0;i<nums.length;i++)for(let j=0;j<nums.length;j++)if(i!==j)for(const one of [1,-1])for(const two of [1,-1])consider({chain,ids:[a.id,nums[i].id,nums[j].id],ops:[one,two]});}
  }
  return result;
}
function efficiency(obs,m){
  return (m.move.ids.length-1)*0.06+m.move.ids.reduce((n,id)=>n+(obs.hand.find(c=>c.id===id)?.type==='W'?0.10:0),0)+(m.move.calibrate?0.25:0);
}
function distinctMoves(obs,moves){
  const byPosition=new Map();
  for(const m of moves){const key=`${m.move.chain}:${m.info.after}:${m.move.ops.includes(1)}:${m.move.ops.includes(-1)}`;const prev=byPosition.get(key);if(!prev||m.points>prev.points||(m.points===prev.points&&efficiency(obs,m)<efficiency(obs,prev)))byPosition.set(key,m);}
  return [...byPosition.values()];
}
function weightedChoice(items,temperature,noise){
  const max=Math.max(...items.map(x=>x.rank));const weights=items.map(x=>Math.exp((x.rank-max)/temperature));
  let pick=Math.min(0.999999999,Math.max(0,noise))*weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<items.length;i++){pick-=weights[i];if(pick<0)return items[i];}
  return items.at(-1);
}
function noticedMoves(moves,limit,noise){
  if(!limit||moves.length<=limit)return moves;
  const options=[...moves];let seed=(Math.floor(noise*4294967295)^0x9e3779b9)>>>0;
  for(let i=options.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor(seed/4294967296*(i+1));[options[i],options[j]]=[options[j],options[i]];}
  return options.slice(0,limit);
}
function possibleReplacements(goals,claimed,sample){
  // Hypothetical goals come from the published rule catalog, never deck order.
  return goals.map(id=>{
    if(!claimed.includes(id))return id;
    const candidates=GOALS.filter(g=>g.kind===id[0]&&!goals.includes(g.id));
    return candidates[(sample*3+['E','P','L'].indexOf(id[0])*2)%candidates.length].id;
  });
}
function bestPosition(options,goals,obs){
  let best=null;
  const consider=scored=>{if(!best||scoreDelta(scored,best)>0)best=scored;};
  for(const option of options){
    const info={...option.info,chain:option.move.chain,ops:option.info.ops||option.info.steps.map(step=>step.op),matches:(goals||[]).filter(id=>goalMatches(id,option.info.board,option.move.chain))};
    const scored={...option,info,...bestScoringClaims(obs,info)};
    consider(scored);
    const offer=calibrateOffer(goals,info,obs);
    if(offer)consider(moveWithCalibrate(scored,offer));
  }
  return best;
}
function afterMoveObservation(obs,m,sample){
  const progress=[copyChallengeProgress(obs.challengeProgress),copyChallengeProgress(obs.opponentChallengeProgress)];progress[0]=copyChallengeProgress(m.nextChallengeProgress);
  // Future repairs are sampled from the public catalog, never the real shuffle.
  const next=replaceChallenges(obs.challengeIds||[],progress,m.awarded,()=>((sample*0.271+0.13)%1));
  const hp=[...obs.hp];hp[obs.actor]+=m.healing;hp[1-obs.actor]=Math.max(0,hp[1-obs.actor]-m.damage);
  const calibrates=[...(obs.calibrates||[0,0])];if(m.move.calibrate)calibrates[obs.actor]=0;
  const boon=obs.boon?structuredClone(obs.boon):null;if(boon?.type==='strike'&&m.chosen?.length)boon.left[obs.actor]=0;
  return{...obs,boon,calibrates,moduleProgress:copyModuleProgress(m.nextModuleProgress),opponentShield:Math.max(0,(obs.opponentShield||0)-m.blockedDamage),board:m.info.board,hand:obs.hand.filter(c=>!m.move.ids.includes(c.id)),goals:possibleReplacements(obs.goals,m.chosen,sample),hp,challengeIds:next.ids,challengeProgress:next.progress[0],opponentChallengeProgress:next.progress[1]};
}
function opponentObservation(obs){
  return{...obs,calibrates:[...(obs.calibrates||[0,0])],actor:1-obs.actor,shield:obs.opponentShield,opponentShield:obs.shield,hand:obs.opponentHand,opponentHand:obs.hand,moduleId:obs.opponentModuleId,opponentModuleId:obs.moduleId,moduleProgress:copyModuleProgress(obs.opponentModuleProgress),opponentModuleProgress:copyModuleProgress(obs.moduleProgress),challengeProgress:obs.opponentChallengeProgress,opponentChallengeProgress:obs.challengeProgress};
}
function tacticalValue(obs,m,profile,cache){
  if(!obs.opponentHand?.length||m.lethal||(obs.round>=12&&obs.turnInRound===1))return 0;
  const key=m.info.board.join(',');
  if(!cache.has(key))cache.set(key,distinctMoves({...obs,hand:obs.opponentHand},legalMoves({...obs,board:m.info.board,hand:obs.opponentHand,goals:[],challengeIds:[],challengeProgress:{}})));
  const replies=cache.get(key);if(!replies.length)return 0;
  let total=0;
  for(let sample=0;sample<profile.samples;sample++){
    const next=afterMoveObservation(obs,m,sample);
    const enemyObs=opponentObservation(next);
    const response=bestPosition(replies,next.goals,enemyObs);
    let value=-profile.defence*response.points-(response.lethal?5*Math.min(1,profile.defence/.05):0);
    if(profile.follow&&next.hand.length){
      const after=afterMoveObservation(enemyObs,response,sample+1);
      const followObs=opponentObservation(after);
      value+=profile.follow*Math.max(0,...includeCalibrate(followObs,legalMoves(followObs,{simple:true})).map(x=>x.points));
    }
    total+=value;
  }
  return total/profile.samples;
}
export function chooseBotMove(obs,noise=Math.random()){
  // Both hands are public. The observation contains no decks, shuffle seed or future draws.
  const level=Math.max(0,Math.min(BOT_PROFILES.length-1,obs.level)),profile=obs.botProfile||BOT_PROFILES[level];
  const roll=salt=>{let x=(Math.floor(noise*4294967296)^salt)>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return((x^(x>>>16))>>>0)/4294967296;};
  let moves=legalMoves(obs,{...profile,allowWild:profile.allowWild&&roll(19837)<profile.wildRate,allowAccel:profile.allowAccel&&roll(8791)<profile.accelRate});if(!moves.length)moves=legalMoves(obs);if(!moves.length)return null;
  moves=distinctMoves(obs,includeCalibrate(obs,noticedMoves(distinctMoves(obs,moves),profile.attention,noise)));
  const scoring=moves.filter(m=>m.points>0);if(scoring.length)moves=scoring;
  for(const m of moves)m.rank=m.points-efficiency(obs,m)+(obs.moduleId==='circuit'&&obs.moduleProgress?.uses<moduleById('circuit').limit?0.18*(m.nextModuleProgress.circuit.length-(obs.moduleProgress?.circuit.length||0)):0);
  if(profile.defence){
    const cache=new Map();moves.sort((a,b)=>b.rank-a.rank);moves=moves.slice(0,profile.beam);
    for(const m of moves)m.rank+=tacticalValue(obs,m,profile,cache);
  }
  if(Number.isInteger(obs.actor)&&level>=6){
    const wins=moves.filter(m=>m.lethal||(obs.round>=12&&obs.turnInRound===1&&obs.hp[obs.actor]+m.healing>obs.hp[1-obs.actor]-m.damage));
    if(wins.length)moves=wins;
  }
  return weightedChoice(moves,profile.temperature,noise);
}
function supplyValue(obs,c){
  const hand=[...obs.hand,c];
  const moves=legalMoves({...obs,hand});
  const gain=Math.max(0,...moves.filter(m=>m.move.ids.includes(c.id)).map(m=>m.points));
  return gain*2+(c.type==='W'?2.5:c.type==='A'?hand.filter(x=>x.type==='N').length>=2?1:0:0.5)-(obs.hand.some(x=>x.type==='N'&&x.value===c.value)?0.5:0);
}
export function chooseBotSupply(obs,noise=Math.random()){
  const level=Math.max(0,Math.min(BOT_PROFILES.length-1,obs.level)),profile=obs.botProfile||BOT_PROFILES[level];
  const choices=obs.market.map((c,index)=>{
    let rank=supplyValue(obs,c);
    if(profile.denial&&obs.opponentHand?.length)rank+=profile.denial*supplyValue(opponentObservation(obs),c);
    return{index,rank};
  });
  return weightedChoice(choices,profile.supplyTemperature,noise).index;
}
export function audit(s){
  const cards=[...s.deck,...s.discard,...s.market,...s.hands.flat(),...s.trails.flat()];
  insist(cards.length===s.deckSize&&new Set(cards.map(c=>c.id)).size===s.deckSize,'行动牌数量不守恒');
  const goals=[...s.goals,...Object.values(s.goalDecks).flat(),...Object.values(s.goalDiscards).flat()];
  insist(goals.length===30&&new Set(goals).size===30,'目标牌数量不守恒');
  insist(s.board.every(x=>Number.isInteger(x)&&x>=0&&x<=20),'星链越界');
  insist(s.hands.every(h=>h.length<=s.handSize)&&s.trails.every(h=>h.length<4),'手牌或短链数量异常');
  insist(s.challengeIds.every(challengeById)&&new Set(s.challengeIds).size===s.challengeIds.length,'挑战条件异常');
  insist(s.hp.every(x=>Number.isInteger(x)&&x>=0),'生命值异常');
  const slots=s.repairSlots||3;
  insist(s.challengeIds.length===slots,slots===3?'应保留三个共享补给槽':'补给槽数量异常');
  for(const p of s.challengeProgress){
    insist(Object.keys(p).length===slots&&s.challengeIds.every(id=>p[id]),'共享补给进度异常');
    for(const id of s.challengeIds)insist(!p[id].done||s.phase==='over','已领取的补给必须刷新');
  }
  insist(s.sectorId===null||sectorById(s.sectorId),'星域异常');
  insist(s.shields.length===2&&s.shields.every(n=>Number.isInteger(n)&&n>=0&&n<=s.shieldAllowance),'护盾异常');
  insist(s.calibrates.length===2&&s.calibrates.every(n=>n===0||n===1||n===2),'校准次数异常');
  if(s.first!==null)insist(s.shields[s.first]===0,'先手不能获得后手护盾');
  insist(s.modules.length===2&&s.moduleProgress.length===2,'模块数量异常');
  for(let actor=0;actor<2;actor++){
    const m=moduleById(s.modules[actor]),p=s.moduleProgress[actor];
    insist(s.modules[actor]===null||m,'模块不存在');
    insist(Number.isInteger(p.uses)&&p.uses>=0&&p.uses<=(m?.limit||0),'模块次数异常');
    insist(p.lastAttackChain===null||[0,1,2].includes(p.lastAttackChain),'攻击记录异常');
    insist(p.circuit.length<3&&new Set(p.circuit).size===p.circuit.length&&p.circuit.every(c=>[0,1,2].includes(c)),'巡航记录异常');
  }
  if(s.phase==='loadout')insist(s.moduleOptions.length===3&&new Set(s.moduleOptions).size===3&&s.modules[0]===null&&s.moduleOptions.includes(s.modules[1])&&s.turns.every(x=>x===0),'尚未选择模块');
  if(s.phase==='opening')insist(s.first===null&&s.current===null&&s.turns.every(x=>x===0),'尚未决定先手');
  if(s.phase==='sector')insist(s.choices&&s.sectorId===null&&s.sectorOptions.length===3&&s.first!==null,'星域选择状态异常');
  if(s.phase==='boon')insist(s.choices&&s.round===5&&s.boon===null&&[0,1,2].includes(s.boonOffer?.chain),'后段选择状态异常');
  if(s.choices&&!['loadout','opening','sector'].includes(s.phase))insist(sectorById(s.sectorId),'开局后必须选定星域');
  if(s.phase==='over'){
    if(Math.min(...s.hp)<=0){
      insist([0,1].includes(s.winner)&&s.hp[s.winner]>0&&s.hp[1-s.winner]===0,'生命归零即结束');
      insist(s.turns[s.winner]===s.turns[1-s.winner]+Number(s.winner===s.first),'击败后对手不能继续行动');
    }else insist(s.round>=12&&s.turns[0]===s.turns[1],'12 轮结算时双方行动次数相同');
  }
  return true;
}
