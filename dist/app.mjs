import {BOT_PROFILES,CONFIG_ID,LEVEL_COUNT,validateProfiles,freshSupport,settleSupport,decideSupport} from './difficulty.mjs?v=flight-records-2';
import {makeRecord,appendEvent,closeRecord,recap,publicSnapshot} from './records.mjs?v=flight-records-2';
import {createRecordClient} from './record-client.mjs?v=flight-records-2';
import {moduleById,sectorById,copyModuleProgress} from './tactics.mjs?v=flight-records-2';
import {ROBOTS,goalById,cardLabel,chainName,isFinalRound,createGame,selectModule,rollInitiative,evaluateMove,playAndClaim,rest,takeCard,observation,chooseBotMove,chooseBotSupply,audit} from './engine.mjs?v=flight-records-2';
import {normalizeProgress} from './progress.mjs?v=flight-records-2';
import {challengeById,challengeViews,copyChallengeProgress} from './challenges.mjs?v=flight-records-2';

const $=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='star-chain-demo-v1',timers=new Set();
let cachedSettings=null,legacyImportBase=null,account=null,flight=null,decisionStarted=Date.now(),recordStatus={pending:0,saving:false,error:''},settingsBusy=false;
const settings=()=>account?.settings||cachedSettings||{supportEnabled:true,supportEpochs:Array(LEVEL_COUNT).fill(0),config:{id:CONFIG_ID,profiles:BOT_PROFILES}};
const chosenLevel=()=>game?.selectedLevel??game?.level??0;
const opponent=()=>ROBOTS[chosenLevel()];
const opponentName=()=>opponent().name+(game.level<chosenLevel()?'（支援模式）':'');
const supportFor=level=>progress.support?.[level]||freshSupport(level);
const records=createRecordClient({onStatus:s=>{recordStatus=s;if(game)render();},onProfile:p=>{account=p;if(records.status().pending===0){progress={...p.progress,lastChallenges:progress?.lastChallenges||[]};persist();}if(game)render();}});
let storageAvailable=true;
function readProgress(){try{const raw=JSON.parse(localStorage.getItem(STORE)||'null'),cache=raw?.settingsCache;legacyImportBase=normalizeProgress(raw?.legacyImportBase||raw);if(cache&&typeof cache.supportEnabled==='boolean'&&Array.isArray(cache.supportEpochs)&&cache.supportEpochs.length===LEVEL_COUNT&&cache.supportEpochs.every(x=>Number.isSafeInteger(x)&&x>=0)){try{cachedSettings={supportEnabled:cache.supportEnabled,supportEpochs:cache.supportEpochs,config:{id:String(cache.config.id),profiles:validateProfiles(cache.config.profiles)}};}catch{}}return normalizeProgress(raw);}catch{storageAvailable=false;return normalizeProgress(null);}}
let progress=readProgress(),game,selection,restMode=false,restCards=[],restGoal=null,run=0,recorded=false,effect=null,diceStage='idle',diceResult=null,botScheduled=false,botMessage='',lastModalTrigger=null;
const blankSelection=()=>({chain:null,ids:[],ops:[1,1],wild:1});
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function persist(){try{localStorage.setItem(STORE,JSON.stringify({...progress,settingsCache:settings(),legacyImportBase}));}catch{storageAvailable=false;}}
function recordEvent(type,data){if(!flight||flight.status!=='active')return;appendEvent(flight,type,data);void records.enqueue(flight);}
function recordError(error,action){if(flight?.events.filter(e=>e.type==='error').length<30)recordEvent('error',{message:String(error.message).slice(0,300),action,phase:game.phase});}
function recordCompletion(){
  if(recorded||game.phase!=='over')return;recorded=true;
  const before=progress.unlocked,selected=chosenLevel(),result=game.winner==='draw'?'draw':game.winner===0?'win':'loss';
  if(game.winner===0)progress.unlocked=Math.max(before,Math.min(LEVEL_COUNT-1,game.level+1));
  game.unlockAdded=progress.unlocked>before;progress.matches++;
  progress.support??=Array.from({length:LEVEL_COUNT},(_,i)=>freshSupport(i));
  if(flight.meta.supportEnabled&&flight.meta.supportEpoch===(settings().supportEpochs[selected]||0)&&progress.support[selected].effective===game.level)progress.support[selected]=settleSupport(progress.support[selected],result,flight.id);
  closeRecord(flight,game);persist();void records.enqueue(flight);
}
function showRecords(){
  const actual=settings().supportEnabled?supportFor(chosenLevel()).effective:chosenLevel();
  openModal(`<div class="modal-content"><div class="modal-head"><h2 id="modal-title">记录与难度</h2><button class="btn quiet" data-action="close-modal">关闭</button></div><p>已完成 ${progress.matches} 局。详细记录用于复盘和后续优化。</p><div class="record-controls"><button class="btn ${settings().supportEnabled?'primary':''}" data-action="toggle-support" aria-pressed="${settings().supportEnabled}" ${settingsBusy?'disabled':''}>支援邀请：${settings().supportEnabled?'开启':'关闭'}</button><p>每两连败，会询问是否下调一级；只有接受才降低，最低1级。拒绝后保持当前难度，再两连败才重新询问。两连胜恢复一级，最高回到所选等级。退出不计，平局清空连胜连败。</p><p>所选 ${chosenLevel()+1}级 · 当前实际 ${actual+1}级。支援需你确认，调整只影响新局。</p><button class="btn" data-action="reset-support" ${settingsBusy?'disabled':''}>恢复所选难度</button></div><p class="section-note">${recordStatus.error?'有记录尚未同步，请重试或先导出保留。':recordStatus.pending?'正在同步游玩记录…':'游玩记录已保存。'}${recordStatus.localError?'此浏览器无法暂存待同步记录，请及时导出。':''}</p><div class="result-actions"><button class="btn primary" data-action="export-records">导出游玩记录</button><button class="btn" data-action="sync-records">重试同步</button></div></div>`);
}
async function changeSettings(patch){
  if(settingsBusy)return;settingsBusy=true;showRecords();
  try{await records.settings(patch);toast('已保存，从下一局生效。');}catch(e){toast(e.message);}finally{settingsBusy=false;showRecords();}
}
async function exportRecords(){
  try{
    const data=await records.exportAll(),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`星链算式_游玩记录_${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(data.cloudComplete?'游玩记录已导出。':'已导出可读取的记录，仍有云端记录暂时无法读取。');
  }catch(e){toast(e.message);}
}
function later(fn,delay){const ticket=run;const id=setTimeout(()=>{timers.delete(id);if(ticket===run)fn();},delay);timers.add(id);return id;}
function cancelTimers(){for(const id of timers)clearTimeout(id);timers.clear();botScheduled=false;}
const blocked=()=>!!effect||game.phase==='loadout'||diceStage!=='none';
const humanAction=()=>!blocked()&&game.current===0&&game.phase==='action';
const humanPhase=phase=>!blocked()&&game.current===0&&game.phase===phase;
function currentMove(){const hasA=selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='A'),hasJ=selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J');return{chain:selection.chain,ids:[...selection.ids],ops:hasJ?[]:selection.ops.slice(0,hasA?2:1),wild:selection.wild};}
function preview(){if(!humanAction()||restMode)return{info:null,scoring:null,error:null};try{const scoring=evaluateMove(observation(game,0),currentMove());return{info:scoring.info,scoring,error:null};}catch(e){return{info:null,scoring:null,error:e.message};}}
function announce(message){$('announcer').textContent=message;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;announce(message);later(()=>{$('toast').hidden=true;},3000);}
function openModal(content){lastModalTrigger=document.activeElement;$('modal').innerHTML=content;if(!$('modal').open)$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();if(lastModalTrigger?.isConnected)lastModalTrigger.focus({preventScroll:true});}
function focusRegion(id){requestAnimationFrame(()=>{const el=$(id);if(el){const r=el.getBoundingClientRect();if(r.top<0||r.bottom>window.innerHeight)el.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'center'});}});}
function newMatch(level=chosenLevel()){
  if(!Number.isInteger(level)||level<0||level>=ROBOTS.length||level>progress.unlocked)throw new Error('请先赢下前一位对手');
  if(settings().supportEnabled&&supportFor(level).pending){showSupport(level);return;}
  if(flight&&flight.status==='active'&&game){closeRecord(flight,game);void records.enqueue(flight);}
  cancelTimers();run++;closeModal();selection=blankSelection();restMode=false;restCards=[];restGoal=null;recorded=false;effect=null;botMessage='';diceStage='idle';diceResult=null;$('toast').hidden=true;
  const prefs=settings(),actual=prefs.supportEnabled?supportFor(level).effective:level;
  const options={level:actual,seed:(Date.now()+Math.floor(Math.random()*1000000))>>>0,previousChallenges:progress.lastChallenges,previousSector:game?.sectorId,botProfile:prefs.config.profiles[actual]};
  game=createGame(options);game.selectedLevel=level;game.configId=prefs.config.id;
  flight=makeRecord(options,{selectedLevel:level,actualLevel:actual,supportEnabled:prefs.supportEnabled,supportEpoch:prefs.supportEpochs[level]||0,configId:prefs.config.id,initiativeShield:game.shieldAllowance});flight.initial=publicSnapshot(game);decisionStarted=Date.now();void records.enqueue(flight);
  progress.lastChallenges=[...game.challengeIds];persist();render();announce('双方各有 18 点生命。先三选一模块，再投骰子决定先手。');
}
function rollDice(){
  if(game.phase!=='opening'||diceStage!=='idle')throw new Error('每局只在开局投骰子决定先手');
  const roll=()=>{
    diceStage='rolling';render();
    later(()=>{
      diceResult=rollInitiative(game);recordEvent('dice',{pair:diceResult.pair});diceStage='result';render();
      announce(diceResult.tie?`双方都是 ${diceResult.pair[0]}，自动重掷。`:`你 ${diceResult.pair[0]}，对手 ${diceResult.pair[1]}，${game.first===0?'你':'对手'}先手。`);
      later(()=>{if(diceResult.tie)roll();else{diceStage='none';render();scheduleBot();}},reduced()?150:850);
    },reduced()?100:650);
  };roll();
}
function cardHTML(c,{action='card',index=null,selected=false,disabled=false,order=null}={}){
  const type=c.type==='N'?'':c.type==='W'?'wild':c.type==='J'?'warp':'accel',label=cardLabel(c),wildValue=c.type==='W'&&action==='card'&&selected&&!restMode?selection.wild:null;
  return `<button class="card ${type} ${selected?'selected':''}" data-action="${action}" data-id="${c.id}" ${index===null?'':`data-index="${index}"`} data-focus="${action}-${c.id}" ${disabled?'disabled':''} aria-pressed="${selected}" aria-label="${esc(label)}${wildValue===null?'':`，代替 ${wildValue}`}${selected?'，已选牌':''}"><span class="corner" aria-hidden="true">${c.type==='N'?c.value:c.type}</span><span class="card-value" aria-hidden="true">${c.type==='N'?c.value:c.type==='W'?wildValue??'W':c.type==='J'?'J':'A'}</span><span class="card-caption" aria-hidden="true">${c.type==='N'?'':c.type==='W'?'星云':c.type==='J'?'折跃':'加速'}</span>${order?`<span class="card-order">${order}</span>`:''}</button>`;
}
function wildPickerHTML(){return `<div class="wild-picker" id="wild-picker" role="group" aria-label="星云代替的数字"><div class="wild-picker-heading">星云代替的数字 <strong>已选 ${selection.wild}</strong></div><div class="wild-values">${Array.from({length:9},(_,i)=>`<button class="wild-number ${selection.wild===i+1?'active':''}" data-action="wild" data-value="${i+1}" data-focus="wild-${i+1}" aria-label="星云当作 ${i+1}" aria-pressed="${selection.wild===i+1}">${i+1}</button>`).join('')}</div></div>`;}
function statusText(){
  if(game.phase==='loadout')return '选择本局模块，再投骰子启航';
  if(diceStage!=='none')return diceStage==='idle'?'投骰子决定本局先手':diceResult?.tie&&diceStage==='result'?'同点，自动重掷…':'正在决定先手…';
  if(effect)return `${effect.actor===0?'你':opponentName()}：造成 ${effect.damage} 伤害${effect.blockedDamage?` · 破盾 ${effect.blockedDamage}`:''} · 回复 ${effect.healing} 生命`;
  if(game.phase==='over')return game.winner==='draw'?'双方生命相同，本局平局':game.winner===0?'你赢下了这场星舰对决！':`${opponentName()}赢下本局`;
  if(game.current===1)return botMessage||`${opponentName()}正在思考…`;
  if(restMode)return '休整：可弃 0–2 张手牌，并替换 1 张攻击目标。';
  if(game.phase==='refill')return `请选明牌或随机抽牌，还需补 ${game.handSize-game.hands[0].length} 张。`;
  if(selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J'))return '折跃：选择星链，直接跳到另一端对应的位置；10不能折跃。';
  if(selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='W'))return '星云：点选 1–9，再选择星链与加减。';
  return selection.ids.length?'选择星链与加减，再确认出牌。':'轮到你出牌：选一张手牌，再点选星链。';
}
function initiativeHTML(){
  if(diceStage==='none'||game.phase==='loadout')return '';
  const pair=diceStage==='result'?diceResult.pair:['?','?'];
  return `<div class="initiative" aria-label="开局投骰子"><h2>谁先启航？</h2><p>双方各掷一颗六面骰，点大先手，同点重掷。</p><div class="dice-pair ${diceStage==='rolling'?'rolling':''}"><div><span>你</span><strong class="die">${pair[0]}</strong></div><span class="versus">:</span><div><span>${opponentName()}</span><strong class="die enemy-die">${pair[1]}</strong></div></div>${diceStage==='idle'?'<button class="btn primary" data-action="roll" data-focus="roll">投骰子开局</button>':`<strong class="dice-result">${diceStage==='rolling'?'掷骰中…':diceResult.tie?'同点，自动重掷…':`${game.first===0?'你':'对手'}先手`}</strong>`}<small>仅开局投骰 · 后手获 ${game.shieldAllowance} 点一次性护盾</small></div>`;
}
function loadoutHTML(){
  return `<div class="loadout" id="loadout-region"><div class="loadout-heading"><h2>选择本局模块</h2><span>三选一 · 仅本局生效</span></div><p>对手已从相同三项中提前选定，选择后双方公开。</p><div class="module-options">${game.moduleOptions.map(id=>{const m=moduleById(id);return `<button class="module-option" data-action="module" data-id="${id}" data-focus="module-${id}"><strong>${m.name}</strong><span>${m.text}</span><small>每局最多 ${m.limit} 次</small><em>选择此模块</em></button>`;}).join('')}</div></div>`;
}
function tacticsHTML(p){
  const sector=sectorById(game.sectorId),scoring=effect||p.scoring,actor=effect?.actor??0;
  return `<section class="tactics" aria-label="本局星域与双方模块"><div class="sector-banner ${scoring?.sectorDamage?'triggered':''}"><strong>${sector.name}</strong><span>${sector.text}</span><small>双方共享 · 整局固定</small></div>${game.phase==='loadout'?'':`<div class="module-status">${game.modules.map((id,who)=>{const m=moduleById(id),pr=game.moduleProgress[who],triggered=actor===who&&(scoring?.moduleDamage||scoring?.moduleHealing);return `<details class="module-equipped ${triggered?'triggered':''}"><summary><span>${who===0?'你':'对手'} · <strong>${m.name}</strong></span><small>剩余 ${m.limit-pr.uses}/${m.limit}</small>${m.id==='circuit'&&pr.circuit.length?`<span class="module-track">已集 ${[0,1,2].filter(c=>pr.circuit.includes(c)).map(c=>`<span class="repair-hint-${c}">${['蓝','紫','橙'][c]}</span>`).join(' ')}</span>`:''}${(m.id==='focus'||sector.id==='roving')&&pr.lastAttackChain!==null?`<span class="module-track">上次 <span class="repair-hint-${pr.lastAttackChain}">${['蓝','紫','橙'][pr.lastAttackChain]}</span></span>`:''}</summary><p>${m.text} 每局最多 ${m.limit} 次。</p></details>`;}).join('')}</div>`}</section>`;
}
function bonusBreakdown(scoring){
  if(!scoring||!(scoring.moduleDamage||scoring.moduleHealing||scoring.sectorDamage||scoring.blockedDamage))return '';
  return `<div class="bonus-breakdown">${scoring.moduleDamage?`<span>模块攻击 +${scoring.moduleDamage}</span>`:''}${scoring.moduleHealing?`<span class="heal-text">模块回血 +${scoring.moduleHealing}</span>`:''}${scoring.sectorDamage?`<span>星域攻击 +${scoring.sectorDamage}</span>`:''}${scoring.blockedDamage?`<span class="shield-text">护盾抵消 ${scoring.blockedDamage}</span>`:''}<small>已计入上方总数</small></div>`;
}
function shipHTML(actor){
  const own=actor===0,attacking=effect?.actor===actor&&effect.rawDamage>0,hit=effect&&effect.actor!==actor&&effect.rawDamage>0,repair=effect?.actor===actor&&effect.healing>0;
  const changed=effect&&effect.hpBefore[actor]!==game.hp[actor],dead=game.phase==='over'&&game.hp[actor]===0,won=game.phase==='over'&&game.winner===actor;
  return `<div class="ship ${own?'player-ship':'enemy-ship'} ${attacking?'firing':''} ${hit?'hit':''} ${repair?'repairing':''} ${dead?'defeated':''} ${won?'victorious':''}"><div class="ship-art"><img ${own?'':`class="ship-motion motion-${opponent().motion}" style="--ship-hue:${opponent().hue}deg;--ship-time:${opponent().duration}s;--ship-drift:${opponent().drift}px;--ship-tilt:${opponent().tilt}deg"`} src="./assets/${own?'player':`enemy-${opponent().art}`}.png" alt="${own?'你的飞船':`${opponentName()}的飞船`}" width="960" height="640" draggable="false">${repair?'<span class="repair-ring" aria-hidden="true"></span>':''}${hit?'<span class="impact-ring" aria-hidden="true"></span>':''}${repair?`<strong class="floating-number healing" aria-hidden="true">+${effect.healing}</strong>`:''}${hit?`<strong class="floating-number ${effect.damage?'damage':'shield-number'}" aria-hidden="true">${effect.damage?`−${effect.damage}`:`护盾 −${effect.blockedDamage}`}</strong>`:''}</div><div class="ship-status"><span>${own?'你':opponentName()}${game.first===actor?' <small>· 先手</small>':''}${game.shields[actor]?` <small class="shield-badge" aria-label="剩余 ${game.shields[actor]} 点护盾">盾 ${game.shields[actor]}</small>`:''}</span><div class="hp" aria-label="${own?'你':'对手'}当前 ${game.hp[actor]} 点生命">${changed?`<strong class="hp-before" aria-hidden="true">${effect.hpBefore[actor]}</strong>`:''}<strong class="${changed?'hp-after':''}">${game.hp[actor]}</strong><span>生命</span></div></div></div>`;
}
function goalsHTML(p){
  const ids=effect?.goals||game.goals,chosen=effect?.claimed||p.scoring?.chosen||[];
  return `<aside class="goal-panel panel" id="goal-region" aria-label="共享攻击目标"><div class="section-heading"><h2>攻击目标</h2><span>双方共享</span></div>${restMode?'<p class="section-note">可点选 1 张，在休整时替换</p>':''}<div class="goals">${ids.map(id=>{const g=goalById(id),selected=restMode?restGoal===id:chosen.includes(id);return `<button class="goal ${selected?'selected':''}" data-action="goal" data-id="${id}" data-focus="goal-${id}" ${humanAction()&&restMode?'':'disabled'} aria-pressed="${selected}"><span class="goal-kind kind-${g.kind}">${{E:'区域',P:'精准',L:'联动'}[g.kind]}</span><strong>${g.name}</strong><span class="goal-text">${g.text}</span><span class="goal-bottom"><span>伤害 <b>${g.damage}</b></span>${selected?`<small>${restMode?'将替换':effect?'已触发':'本次达成'}</small>`:''}</span></button>`;}).join('')}</div><div class="goal-total">${effect?'本次攻击':'预计攻击'} <strong>${effect?.damage??p.scoring?.damage??0}</strong></div><p class="section-note">确认后自动触发，最多 2 项</p></aside>`;
}
function repairHintsHTML(c,progress,actor){
  if(c.metric==='goalKinds'){
    const used=progress[c.id]?.goalKinds||[],names={E:['区','区域'],P:['精','精准'],L:['联','联动']};
    const kinds=['E','P','L'].filter(kind=>used.includes(kind));
    return `<span class="repair-hints" role="group" aria-label="${actor===0?'你':'对手'}本任务已触发的攻击类型">${kinds.length?kinds.map(kind=>`<span class="repair-hint repair-hint-kind-${kind}" title="${names[kind][1]}目标" aria-label="${names[kind][1]}目标">${names[kind][0]}</span>`).join(''):'<span class="sr-only">暂无</span>'}</span>`;
  }
  const isOp=c.metric==='ops';
  if(!isOp&&c.metric!=='chains'&&c.metric!=='goalChains')return '';
  const used=progress[c.id]?.[c.metric]||[],values=(isOp?[1,-1]:[0,1,2]).filter(value=>used.includes(value));
  const label=isOp?'已使用的运算':c.metric==='goalChains'?'已触发攻击的星链':'已出牌的星链';
  return `<span class="repair-hints" role="group" aria-label="${actor===0?'你':'对手'}本任务${label}">${values.length?values.map(value=>`<span class="repair-hint ${isOp?'repair-hint-op':`repair-hint-${value}`}" aria-label="${isOp?(value===1?'加法':'减法'):chainName(value)}">${isOp?(value===1?'+':'−'):['蓝','紫','橙'][value]}</span>`).join(''):'<span class="sr-only">暂无</span>'}</span>`;
}
function repairsHTML(p){
  const ids=effect?.challengeIds||game.challengeIds,progresses=effect?.challengeProgress||game.challengeProgress,views=progresses.map(pr=>challengeViews(ids,pr));
  const awards=effect?.challengeAwards||p.scoring?.awarded||[];
  return `<aside class="repair-panel panel" id="challenge-region" aria-label="双方共享维修补给"><div class="section-heading"><h2>维修补给</h2><span>共享 3 项</span></div><p class="section-note">谁先完成，谁获得回血</p><div class="repairs">${views[0].map((c,i)=>{const awarded=awards.includes(c.id);return `<div class="repair ${awarded?'rewarding':''}" data-challenge="${c.id}"><div class="repair-title"><strong>${c.name}</strong><span>+${c.healing} <small>生命</small></span></div><p>${c.text}</p><div class="repair-progress"><span>你 <b>${c.progress}/${c.target}</b><i style="--progress:${c.progress/c.target*100}%"></i>${repairHintsHTML(c,progresses[0],0)}</span><span>对手 <b>${views[1][i].progress}/${c.target}</b><i style="--progress:${views[1][i].progress/c.target*100}%"></i>${repairHintsHTML(c,progresses[1],1)}</span></div>${awarded?`<div class="repair-preview">${effect?`${effect.actor===0?'你':'对手'}获得 +${c.healing} 生命`:'本次完成'}</div>`:''}</div>`;}).join('')}</div><p class="repair-foot">完成几项，补充几项<br>新任务从下一次出牌开始计数</p></aside>`;
}
function tracksHTML(p){
  return `<section class="tracks" id="track-region" aria-label="三条星链">${game.board.map((value,i)=>{const selected=humanAction()&&!restMode&&selection.chain===i,animated=effect?.chain===i;return `<button class="track track-${i} ${selected?'selected':''} ${animated?'moving':''}" data-action="chain" data-index="${i}" data-focus="chain-${i}" ${humanAction()&&!restMode?'':'disabled'} aria-pressed="${selected}" aria-label="${chainName(i)}，当前 ${value}"><span class="track-heading"><strong>${chainName(i)}</strong><span>${selected&&p.info?`${p.info.expression} = ${p.info.after}`:animated?`${effect.expression} = ${effect.after}`:`当前 ${value}`}</span></span><span class="rail" aria-hidden="true"><span class="rail-line"></span>${Array.from({length:21},(_,n)=>`<span class="tick ${value===n?'current':''} ${selected&&p.info?.after===n?'destination':''}" style="left:${n*5}%"><i></i><span class="rail-label">${n}</span></span>`).join('')}<span class="orb ${animated?'travelling':''}" style="left:${value*5}%;--start:${animated?effect.before*5:value*5}%;--end:${value*5}%"></span>${selected&&p.info?`<span class="orb preview" style="left:${p.info.after*5}%"></span>`:''}</span></button>`;}).join('')}</section>`;
}
function operationHTML(p,hasA,hasW){
  if(selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J'))return `<div class="operation-panel" id="operation-region"><div class="expression">${p.info?`${chainName(selection.chain)[0]}链 <strong>${p.info.before} → ${p.info.after}</strong>`:'选择星链进行折跃'}</div><p class="section-note">折跃单独使用，不计加法或减法${p.error?` · ${esc(p.error)}`:''}</p></div>`;
  return `<div class="operation-panel" id="operation-region">${hasW&&humanAction()&&!restMode?wildPickerHTML():''}<div class="operation-row">${Array.from({length:hasA?2:1},(_,i)=>`<div class="op-step">${hasA?`<span>第 ${i+1} 步</span>`:''}<span class="op-group" role="group" aria-label="第 ${i+1} 步运算">${[1,-1].map(op=>`<button class="op-btn ${selection.ops[i]===op?'active':''}" data-action="op" data-step="${i}" data-value="${op}" data-focus="op-${i}-${op}" ${humanAction()&&!restMode?'':'disabled'} aria-label="第 ${i+1} 步${op===1?'加':'减'}法" aria-pressed="${selection.ops[i]===op}">${op===1?'+':'−'}</button>`).join('')}</span></div>`).join('')}<div class="expression">${p.info?`${p.info.expression} = <strong>${p.info.after}</strong>`:effect?`${effect.expression} = <strong>${effect.after}</strong>`:'<span>每一步都在 0–20 之间</span>'}</div></div>${humanAction()&&!restMode&&selection.ids.length&&p.error?`<p class="move-error">${esc(p.error)}</p>`:''}</div>`;
}
function actionHTML(p){
  if(game.phase==='loadout')return '<p class="dock-wait">先在上方选择一个模块<br>再投骰子启航</p>';
  if(diceStage!=='none')return '<p class="dock-wait">先投骰子，决定本局先手</p>';
  if(effect)return `<div class="combat-summary"><span>攻击 <b>${effect.damage}</b></span><span class="heal-text">回血 <b>${effect.healing}</b></span></div>${bonusBreakdown(effect)}<button class="btn primary wide" disabled>结算中…</button><small>伤害与回血同时结算</small>`;
  if(game.phase==='over')return `<strong class="end-label">${game.winner===0?'你赢了':game.winner==='draw'?'本局平局':'本局结束'}</strong><button class="btn primary wide" data-action="result">查看对局结果</button><button class="btn quiet wide" data-action="retry">再来一局</button>`;
  if(game.current===1)return `<p class="dock-wait">${esc(botMessage||`${opponentName()}正在思考…`)}</p><button class="btn primary wide" disabled>等待对手</button>`;
  if(restMode)return `<p>已选 ${restCards.length}/2 张弃牌${restGoal?' · 替换 1 项目标':''}</p><button class="btn primary wide" data-action="confirm-rest">确认休整</button><button class="btn quiet wide" data-action="cancel-rest">返回出牌</button>`;
  if(game.phase==='refill')return `<div class="combat-summary"><span>攻击 <b>${game.pending.damage}</b></span><span class="heal-text">回血 <b>${game.pending.healing}</b></span></div>${bonusBreakdown(game.pending)}<strong class="refill-label">请补 ${game.handSize-game.hands[0].length} 张牌</strong><small>选择明牌或随机抽牌<br>补到 6 张后自动结束回合</small>`;
  return `<div class="combat-summary"><span>攻击 <b>${p.scoring?.damage||0}</b></span><span class="heal-text">回血 <b>${p.scoring?.healing||0}</b></span></div>${bonusBreakdown(p.scoring)}<button class="btn primary wide" data-action="play" data-focus="play" ${p.info?'':'disabled'}>${p.scoring?.lethal?'确认出牌 · 击败对手':'确认出牌'}</button><button class="btn quiet wide" data-action="rest" data-focus="rest">休整</button><small>${p.info?'伤害与回血同时结算':'选择手牌、星链与加减'}</small>`;
}
function render(){
  const previousFocus=document.activeElement?.dataset?.focus,p=preview(),robot=opponent(),isAction=humanAction(),isRefill=humanPhase('refill');
  const hasA=selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='A'),hasW=selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='W'),nums=selection.ids.filter(id=>game.hands[0].find(c=>c.id===id)?.type==='N');
  const selected=restMode?restCards:selection.ids;
  $('app').innerHTML=`<div class="shell"><header class="header"><div class="brand"><h1>星链算式</h1><span>星舰对战</span></div><div class="header-actions"><button class="btn quiet" data-action="records">记录与难度</button><button class="btn quiet" data-action="help" data-focus="help">玩法</button><button class="btn quiet" data-action="restart" data-focus="restart">重新开局</button></div></header>
  <div class="game-grid">${goalsHTML(p)}<main class="play-area"><section class="opponent-hand" id="opponent-hand" aria-label="对手公开手牌"><div><h2>对手手牌 <small>公开</small></h2><span>${opponentName()} · ${game.hands[1].length}/6 张 · 实际 ${game.level+1}级</span></div><div class="opponent-cards">${game.hands[1].map(c=>cardHTML(c,{action:'opponent-card',disabled:true})).join('')}</div></section>
  ${tacticsHTML(p)}<section class="battle ${effect?'settling':''} ${diceStage!=='none'?'opening':''} ${game.phase==='loadout'?'choosing-module':''}" aria-label="飞船对战">${game.phase==='loadout'?loadoutHTML():`<div class="battle-caption" id="turn-status" role="status">${esc(statusText())}</div><div class="ships">${shipHTML(0)}<div class="round">第 <strong>${game.round}</strong> / 12 轮</div>${shipHTML(1)}</div>${effect?.rawDamage?`<span class="laser ${effect.actor===1?'reverse':''}" aria-hidden="true"></span>`:''}${initiativeHTML()}`}</section>
  ${isFinalRound(game)&&game.phase!=='over'?'<p class="final-notice">最后一轮 · 无需补牌。生命归零立即结束，否则双方行动后比较剩余生命。</p>':''}
  ${tracksHTML(p)}${operationHTML(p,hasA,hasW)}</main>${repairsHTML(p)}
  <section class="dock panel" aria-label="手牌、补牌与确认"><div class="hand-zone" id="hand-region"><div class="section-heading"><h2>${restMode?'选择要弃的牌':'你的手牌'}</h2><span>${game.hands[0].length}/6 张</span></div><div class="hand">${game.hands[0].map(c=>cardHTML(c,{selected:selected.includes(c.id),disabled:!isAction,order:hasA&&nums.includes(c.id)?nums.indexOf(c.id)+1:null})).join('')}</div><div class="selected-cards"><span>${restMode?'已选弃牌':'已选牌'}</span><strong>${selected.length?selected.map(id=>{const c=game.hands[0].find(c=>c.id===id);return c.type==='W'?`W = ${selection.wild}`:c.type==='A'?'A':c.type==='J'?'J':c.value;}).join(' · '):'—'}</strong><small>${hasA?'数字牌按选择顺序运算':'W 星云 · A 加速 · J 折跃'}</small></div></div>
  <div class="supply-zone ${isRefill?'active':''}" id="supply-region"><div class="section-heading"><h2>补牌区</h2><span>${isRefill?`还需 ${game.handSize-game.hands[0].length} 张`:isFinalRound(game)?'末轮无需补牌':'出牌后补满 6 张'}</span></div><div class="supply-cards">${game.market.map((c,i)=>cardHTML(c,{action:'supply',index:i,disabled:!isRefill})).join('')}</div><button class="deck-button" data-action="draw" data-focus="draw" ${isRefill?'':'disabled'}>随机抽 1 张 <small>牌堆 ${game.deck.length}</small></button></div><div class="action-zone">${actionHTML(p)}</div></section></div>
  <section class="fleet" aria-label="${LEVEL_COUNT}级对手"><div class="fleet-heading"><h2>选择对手</h2><span>共 ${LEVEL_COUNT} 级 · 按实际难度解锁</span></div><div class="levels">${ROBOTS.map((r,i)=>`<button class="level ${chosenLevel()===i?'active':''}" data-action="level" data-level="${i}" data-focus="level-${i}" ${i>progress.unlocked?'disabled':''} aria-pressed="${chosenLevel()===i}" aria-label="第 ${i+1} 级 ${r.name}，${i>progress.unlocked?'未解锁':r.tag}"><img style="filter:hue-rotate(${r.hue}deg)" src="./assets/enemy-${r.art}.png" alt="" width="960" height="640" loading="lazy"><span><b>${i+1} · ${r.name}</b><small>${i>progress.unlocked?'未解锁':r.tag}</small></span></button>`).join('')}</div></section>
  <footer class="footer"><span>初始生命 18 · 修复无上限 · 最多 12 轮</span><span>${recordStatus.error?'记录待同步，可在「记录与难度」重试或导出':recordStatus.pending?'正在保存游玩记录':'游玩记录已同步'} · 刷新开启新局</span></footer>
  <details class="history"><summary>航行记录</summary>${game.history.length?game.history.slice(0,8).map(h=>`<p><span>第 ${h.round} 轮 · ${h.actor===0?'你':robot.name}</span> ${h.rest?`休整，替换 ${h.discarded} 张手牌`:`${chainName(h.chain)}：${h.expression} = ${h.after} · 攻击 ${h.damage} · 回血 ${h.healing}`}</p>`).join(''):'<p>还没有航行记录。</p>'}</details></div>`;
  if(previousFocus){const target=[...document.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===previousFocus&&!el.disabled);target?.focus({preventScroll:true});}
}
function chooseCard(id){
  if(!humanAction())throw new Error('请等待你的出牌回合');const c=game.hands[0].find(c=>c.id===id);if(!c)throw new Error('这张牌不在你的手中');
  if(restMode){if(restCards.includes(id))restCards=restCards.filter(x=>x!==id);else if(restCards.length<2)restCards.push(id);else throw new Error('休整最多弃两张手牌');}
  else if(c.type==='A'||c.type==='W'||c.type==='J'){selection.ids=selection.ids.includes(id)?[]:[id];selection.ops=[1,1];}
  else if(selection.ids.some(x=>game.hands[0].find(c=>c.id===x)?.type==='A')){if(selection.ids.includes(id))selection.ids=selection.ids.filter(x=>x!==id);else if(selection.ids.length<3)selection.ids.push(id);else throw new Error('加速星最多搭配两张数字牌');}
  else selection.ids=selection.ids.includes(id)?[]:[id];
  render();if(c.type==='W'&&!restMode&&selection.ids.includes(id))focusRegion('wild-picker');
}
function commitMove(move){
  const before={goals:[...game.goals],challengeIds:[...game.challengeIds],challengeProgress:game.challengeProgress.map(copyChallengeProgress)};
  const actor=game.current;playAndClaim(game,move);recordEvent('play',{actor,move,after:publicSnapshot(game),settlement:game.lastAction,thinkingMs:Math.max(0,Date.now()-decisionStarted)});if(game.phase==='over')recordCompletion();audit(game);selection=blankSelection();effect={...game.lastAction,...before};effect.challengeProgress[effect.actor]=copyChallengeProgress(game.lastAction.repairProgress);
  render();announce(`${effect.expression} 等于 ${effect.after}，造成 ${effect.damage} 伤害，回复 ${effect.healing} 生命。`);
  later(()=>{effect=null;afterAction();if(humanPhase('refill'))focusRegion('supply-region');},reduced()?100:1100);
}
function doPlay(){if(!humanAction()||restMode)throw new Error('当前不能出牌');commitMove(currentMove());}
function doRest(){if(!humanAction()||!restMode)throw new Error('当前不能休整');const ids=[...restCards],goal=restGoal;rest(game,ids,goal);recordEvent('rest',{actor:0,ids,goal,after:publicSnapshot(game),thinkingMs:Math.max(0,Date.now()-decisionStarted)});restMode=false;restCards=[];restGoal=null;selection=blankSelection();afterAction();if(humanPhase('refill'))focusRegion('supply-region');}
function doTake(source){if(!humanPhase('refill'))throw new Error('结算结束后才能补牌');const c=takeCard(game,source);recordEvent('take',{actor:0,source,card:c,market:structuredClone(game.market)});announce(`补到${cardLabel(c)}。${game.current===0&&game.phase==='refill'?`还需 ${game.handSize-game.hands[0].length} 张。`:'你的回合结束。'}`);afterAction();}
function afterAction(){audit(game);if(game.phase==='action')decisionStarted=Date.now();if(game.phase==='over'){finishMatch();return;}render();scheduleBot();}
function scheduleBot(){
  if(blocked()||game.current!==1||game.phase==='over'||botScheduled)return;
  botScheduled=true;const phase=game.phase;botMessage=phase==='action'?`${opponentName()}正在思考…`:`${opponentName()}正在补牌…`;render();
  later(()=>{
    botScheduled=false;if(blocked()||game.current!==1||game.phase!==phase)return;
    try{
      if(phase==='refill'){const source=chooseBotSupply(observation(game,1)),card=takeCard(game,source);recordEvent('take',{actor:1,source,card,market:structuredClone(game.market)});botMessage='';afterAction();return;}
      const choice=chooseBotMove(observation(game,1));
      if(choice)commitMove(choice.move);
      else{const ids=game.hands[1].slice(0,2).map(c=>c.id),goal=game.goals[0];rest(game,ids,goal);recordEvent('rest',{actor:1,ids,goal,after:publicSnapshot(game)});afterAction();}
    }catch(error){recordError(error,'robot');console.error(error);botMessage='对手的航行遇到问题，请重新开局。';render();toast(botMessage);}
  },phase==='action'?650:350);
}
function finishMatch(){
  botScheduled=false;botMessage='';
  recordCompletion();
  render();showResult();announce(`对局结束，你 ${game.hp[0]} 生命，对手 ${game.hp[1]} 生命。${game.winner===0?'你赢了':game.winner==='draw'?'平局':'对手获胜'}。`);
}
function reviewHTML(){const r=flight?.result?.review;if(!r)return '';return `<div class="next-try"><h3>下一局可以试试</h3><p>${esc(r.evidence)}</p><p>${esc(r.suggestion)}</p></div>`;}
function supportPromptHTML(level){const pending=supportFor(level).pending;if(!pending)return '';return `<section class="support-offer" aria-label="是否接受支援"><h3>需要一点支援吗？</h3><p>你在当前难度已连续挑战失利2局。接受后，下局从${pending.from+1}级调到${pending.to+1}级，对手名称增加“（支援模式）”。你也可以保持当前难度继续尝试。</p><div class="result-actions"><button class="btn primary" data-action="accept-support" data-level="${level}">接受支援 · ${pending.to+1}级再战</button><button class="btn" data-action="decline-support" data-level="${level}">保持${pending.from+1}级 · 再试一次</button></div><small>拒绝不会降低难度；再两连败才会重新询问。</small></section>`;}
function showSupport(level){openModal(`<div class="modal-content"><div class="modal-head"><h2 id="modal-title">下一次启航</h2><button class="btn quiet" data-action="close-modal">稍后再选</button></div>${supportPromptHTML(level)}</div>`);}
function chooseSupport(level,accept){
 if(!Number.isInteger(level)||level<0||level>=LEVEL_COUNT||!settings().supportEnabled)throw Error('当前没有可用的支援邀请');
 const current=supportFor(level),pending=current.pending;if(!pending)throw Error('这次支援邀请已经处理');
 const choice={kind:'support-choice',id:crypto.randomUUID(),sequence:1,offerId:pending.id,selectedLevel:level,epoch:settings().supportEpochs[level]||0,accept,at:Math.max(Date.now(),flight?.completedAt||0)};
 progress.support[level]=decideSupport(current,choice);persist();void records.enqueue(choice);newMatch(level);
}
function showResult(){
  const won=game.winner===0,draw=game.winner==='draw',next=won&&game.level<ROBOTS.length-1&&game.level===chosenLevel();
  openModal(`<div class="modal-content result"><div class="modal-head"><h2 id="modal-title">${won?'航行胜利！':draw?'势均力敌':'本局结束'}</h2><button class="btn quiet" data-action="close-modal">关闭</button></div><img class="result-ship" src="./assets/${won?'player':`enemy-${opponent().art}`}.png" alt="" width="960" height="640"><p>${game.hp.includes(0)?'一方生命归零，立即结束对局。':'12 轮结束，按双方剩余生命结算。'}</p><div class="result-hp"><span><b>${game.hp[0]}</b>你的生命</span><span><b>${game.hp[1]}</b>对手生命</span></div><div class="result-stats"><p>你：累计造成 ${game.damageTotal[0]} 伤害 · 回复 ${game.healingTotal[0]} 生命</p><p>对手：累计造成 ${game.damageTotal[1]} 伤害 · 回复 ${game.healingTotal[1]} 生命</p></div><p>${game.level<chosenLevel()?`支援模式 · 实际 ${game.level+1}级。下一局预计 ${supportFor(chosenLevel()).effective+1}级。`:next?`${game.unlockAdded?'已解锁':'可以挑战'} ${ROBOTS[game.level+1].name}`:won?'所有对手全部解锁，可继续挑战不同对手。':draw?'本局平局，可以再来一局。':'观察对手的手牌，抢先拿下攻击与补给。'}</p><div class="result-recap"><p>你的最高一击实际扣除 ${recap(game).maxHit} 点生命。</p><p>完成维修 ${recap(game).repairs} 次 · 模块触发 ${recap(game).moduleUses} 次</p></div>${reviewHTML()}${settings().supportEnabled&&supportFor(chosenLevel()).pending?supportPromptHTML(chosenLevel()):`<div class="result-actions"><button class="btn ${next?'':'primary'}" data-action="retry">再来一局</button>${next?`<button class="btn primary" data-action="next">挑战${ROBOTS[game.level+1].name}</button>`:''}</div>`}</div>`);
}
function showRules(){
  openModal(`<div class="modal-content"><div class="modal-head"><h2 id="modal-title">星链算式 · 玩法</h2><button class="btn quiet" data-action="close-modal">关闭</button></div><ol class="rules-list"><li><strong>开局。</strong>双方各有 18 点生命、6 张手牌。每局随机一条双方共享的星域规则，再从三个模块中选一个；对手提前选定，双方选择后公开。只在开局各掷一颗六面骰，点大先手，同点重掷。之后轮流行动，双方手牌始终公开。后手获得 ${game.shieldAllowance} 点一次性护盾，优先抵消伤害，耗尽不恢复。护盾按实际等级固定为1–3点，开局会显示本局数值。</li><li><strong>出牌。</strong>选 1 张数字牌，对一条星链做加法或减法，每一步保持在 0–20 之间，最终位置必须改变。</li><li><strong>攻击。</strong>落点满足左侧公共目标，可触发最多 2 张，分别造成 1、2、3 点伤害。模块和星域满足条件时叠加，预览会显示总数与加成。点击「确认出牌」自动结算，攻击力只用于本次出牌。</li><li><strong>修复。</strong>右侧是双方争抢的 3 个共享任务，进度分别记录。谁先完成谁回复 1 或 2 点生命，可以超过 18，上不封顶。完成几项就刷新几项，被替换任务的双方进度清零，其他任务保留进度。新任务从下一次出牌开始计数。</li><li><strong>补牌。</strong>确认后，伤害和回血一次性结算。随后从 3 张明牌中选择，或点「随机抽 1 张」，补满 6 张后自动轮到对手。第 12 轮和对局结束时无需补牌。</li><li><strong>获胜。</strong>对手生命归零即获胜，没有额外反击回合。若双方完成第 12 轮后都仍存活，剩余生命多者胜，相同则平局。</li></ol><details class="rules-detail" open><summary>三种功能牌</summary><p><strong>星云 W：</strong>选中后点选 1–9，作为所选数字使用。</p><p><strong>加速 A：</strong>搭配 2 张普通数字牌，按选择顺序连续运算，每一步分别设置加减。不能搭配星云，中途不能越界，最后不能回到起点。只按最终落点判断奖励。</p><p><strong>折跃 J：</strong>单独使用，把星链从 x 跳到 20−x（例如4→16）。数值为10时不能使用，不计加法或减法。</p><p>牌库共44张：数字牌36张，星云3张，加速3张，折跃2张。</p></details><details class="rules-detail"><summary>模块与随机星域</summary><p>每人只装备一个模块，触发次数用完后本局不再提供加成。每局随机抽出六种模块中的三种供双方选择，可选相同模块；对手不会在你选择后换装。点开牌桌上的模块名称可查看效果与次数。</p><p>星域每局随机一次，整局固定，对双方一视同仁。所有攻击加成都要求本次先触发公共攻击目标。命中护盾也算触发攻击；血量只扣除护盾抵消后的伤害。工程舱按维修出牌加一次回血，同时完成多项也不重复加成。加成不产生新的领奖事件。</p><p>连击炮要求自己的相邻两次出牌都在同色星链触发攻击；休整或未触发攻击会断开。巡航引擎只收集实际触发攻击的颜色，收齐三色后清空，休整保留已收集颜色。巡航星域也要求相邻两次出牌均触发攻击。</p></details><details class="rules-detail"><summary>休整、任务与自动结算</summary><p>休整可弃 0–2 张手牌，并替换 1 张攻击目标，再补满手牌。本回合不移动、不攻击、不回血；会中断连续攻击任务。</p><p>自动选择攻击（含破盾）与回血合计最高的目标组合；能击败对手的组合优先。只结算出牌前已经出现的目标和补给，新刷出的项目不能由同一次出牌再次触发。</p><p>加速星的一次出牌可同时包含加法和减法，但“2 次出牌”仍只计一次。所有维修任务只累计它出现在桌面之后的动作。</p><p>已用牌自动回收，牌堆耗尽时重新洗牌。对手只能读取双方手牌及公开信息，无法预知抽牌和新目标。</p></details><p class="rules-note">按实际对战等级解锁下一位。支援邀请开启时，每连续输2局，弹窗询问是否下调1级。接受才降低，最低1级；拒绝则保持当前难度，再两连败才重新询问。连续赢2局恢复1级，最高回到所选等级。平局清空连胜连败，退出不计。名字后的「支援模式」表示本局实际难度较低。游玩记录持续保存，可在「记录与难度」导出；参数调整只影响新局。刷新开启新对局。</p><button class="btn primary wide" data-action="close-modal">回到牌桌</button></div>`);
}
function confirmRestart(level=chosenLevel()){
  if(!Number.isInteger(level)||level<0||level>progress.unlocked)throw new Error('请先解锁这位对手');
  if(game.phase==='over'||game.phase==='loadout'||(game.phase==='opening'&&diceStage==='idle')){newMatch(level);return;}
  openModal(`<div class="modal-content"><div class="modal-head"><h2 id="modal-title">${level===chosenLevel()?'重新开局？':`挑战${ROBOTS[level].name}？`}</h2><button class="btn quiet" data-action="close-modal">取消</button></div><p>本局生命、手牌与任务进度将重置，并随机生成星域、重新选择模块与投骰子。已解锁的对手会保留。</p><div class="result-actions"><button class="btn" data-action="close-modal">继续本局</button><button class="btn primary" data-action="confirm-new" data-level="${level}">重新开局</button></div></div>`);
}
function action(name,data={}){
  switch(name){
    case'module':selectModule(game,data.id);recordEvent('module',{id:data.id,modules:[...game.modules]});audit(game);render();announce(`你选择了${moduleById(game.modules[0]).name}，对手选择了${moduleById(game.modules[1]).name}。现在投骰子决定先手。`);break;
    case'roll':rollDice();break;
    case'card':chooseCard(data.id);break;
    case'chain':if(!humanAction()||restMode)throw new Error('请在出牌时选择星链');if(![0,1,2].includes(Number(data.index)))throw new Error('星链不存在');selection.chain=Number(data.index);render();break;
    case'op':if(!humanAction()||restMode||selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J'))throw new Error('当前不能修改运算');if(![0,1].includes(Number(data.step))||![1,-1].includes(Number(data.value)))throw new Error('运算无效');selection.ops[Number(data.step)]=Number(data.value);render();break;
    case'wild':if(!humanAction()||restMode||!selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='W'))throw new Error('请先选择星云牌');if(!Number.isInteger(Number(data.value))||Number(data.value)<1||Number(data.value)>9)throw new Error('星云数值须为 1–9');selection.wild=Number(data.value);render();break;
    case'play':doPlay();break;
    case'goal':if(!humanAction()||!restMode)throw new Error('攻击目标自动结算，休整时可以替换');if(!game.goals.includes(data.id))throw new Error('这张目标已不在桌面');restGoal=restGoal===data.id?null:data.id;render();break;
    case'rest':if(!humanAction())throw new Error('请等待你的回合');restMode=true;restCards=[];restGoal=null;selection=blankSelection();render();break;
    case'cancel-rest':if(!humanAction()||!restMode)throw new Error('当前没有休整');restMode=false;restCards=[];restGoal=null;render();break;
    case'confirm-rest':doRest();break;
    case'supply':doTake(Number(data.index));break;
    case'draw':doTake('deck');break;
    case'help':showRules();break;
    case'records':showRecords();break;
    case'accept-support':chooseSupport(Number(data.level),true);break;
    case'decline-support':chooseSupport(Number(data.level),false);break;
    case'export-records':void exportRecords();break;
    case'sync-records':void records.flush();break;
    case'toggle-support':void changeSettings({supportEnabled:!settings().supportEnabled});break;
    case'reset-support':void changeSettings({resetSupportForLevel:chosenLevel()});break;
    case'close-modal':closeModal();break;
    case'restart':confirmRestart();break;
    case'level':if(Number(data.level)!==chosenLevel())confirmRestart(Number(data.level));break;
    case'confirm-new':newMatch(Number(data.level));break;
    case'retry':newMatch(chosenLevel());break;
    case'next':if(game.phase!=='over'||game.winner!==0)throw new Error('请先赢下本局');newMatch(game.level+1);break;
    case'result':if(game.phase!=='over'||effect)throw new Error('对局尚未结算');showResult();break;
    default:throw new Error('未知操作');
  }
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button||button.disabled)return;try{action(button.dataset.action,button.dataset);}catch(error){recordError(error,button.dataset.action);toast(error.message);}});
$('modal').addEventListener('click',event=>{if(event.target===$('modal')){const r=$('modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
function publicGame(){const p=preview();return{phase:game.phase,current_player:game.current===null?null:game.current===0?'human':'robot',sector:sectorById(game.sectorId),module_options:game.moduleOptions.map(moduleById),modules:game.phase==='loadout'?[null,null]:[...game.modules],module_progress:game.moduleProgress.map(copyModuleProgress),round:game.round,turn_in_round:game.turnInRound,turns:[...game.turns],first:game.first,final_round:isFinalRound(game),board:[...game.board],hp:[...game.hp],shields:[...game.shields],damage_total:[...game.damageTotal],healing_total:[...game.healingTotal],hand:game.hands[0],robot_hand:game.hands[1],market:game.market,goals:game.goals.map(goalById),selection,rest_mode:restMode,challenge_ids:[...game.challengeIds],challenge_progress:game.challengeProgress,repairs:game.challengeProgress.map(pr=>challengeViews(game.challengeIds,pr)),automatic_goal_claims:p.scoring?.chosen||[],automatic_repair_rewards:p.scoring?.awarded||[],automatic_damage:p.scoring?.damage||0,automatic_healing:p.scoring?.healing||0,automatic_bonuses:p.scoring?{module_damage:p.scoring.moduleDamage,module_healing:p.scoring.moduleHealing,sector_damage:p.scoring.sectorDamage}:null,animation:!!effect,initiative:{stage:diceStage,rolls:game.dice,shieldAllowance:game.shieldAllowance},opponent:opponentName(),bot_profile:{...game.aiProfile},opponent_level:game.level+1,selected_opponent_level:chosenLevel()+1,support_mode:game.level<chosenLevel(),record_id:flight?.id,support_offer:settings().supportEnabled?supportFor(chosenLevel()).pending:null,post_match_review:game.phase==='over'?flight?.result?.review:null,opponent_count:ROBOTS.length,unlocked_opponents:progress.unlocked+1,status:statusText(),winner:game.winner};}
window.starChainRecords=Object.freeze({schema:records.schema,list:records.list,get:records.get,export:records.exportAll,getConfiguration:()=>records.refresh(),setConfiguration:patch=>records.settings(patch)});
window.addEventListener('online',()=>void records.flush());
function registerAgentTools(){
  if(!document.modelContext?.registerTool)return;const lifecycle=new AbortController(),output=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
  const actions=['accept-support','decline-support','module','roll','card','chain','op','wild','play','goal','rest','cancel-rest','confirm-rest','supply','draw','retry'];
  const tools=[{name:'get_star_chain_game',title:'查看星链算式牌桌',description:'Read both public hands, HP and the three shared repair contracts. Future draw order stays private.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>output(publicGame())},{name:'play_star_chain_action',title:'操作星链算式',description:'module with id selects one of the three offered modules before initiative; the opponent has precommitted and cannot counterpick. One random sector applies equally to both players for the whole match. roll decides first player only at match opening. Select card, chain (0–2), op (step0–1,value1/-1), wild (value1–9); play confirms once, deals damage and heals atomically. Wait for animation before supply (market index0–2) or draw (random card), refilling to6. J folds one track x to20-x, not an arithmetic operation and unusable at10. Shared repair contracts refresh only when claimed. HP0 ends immediately; otherwise after12 rounds compare HP. rest/goal/confirm-rest prepare a rest action. retry resets the match and initiative. When support_offer is present, accept-support or decline-support with the selected level (0-based) records an explicit choice and starts the next match. No decline changes difficulty.',inputSchema:{type:'object',properties:{action:{type:'string',enum:actions},id:{type:'string'},level:{type:'integer',minimum:0,maximum:LEVEL_COUNT-1},index:{type:'integer',minimum:0,maximum:2},step:{type:'integer',minimum:0,maximum:1},value:{type:'integer',minimum:-1,maximum:9}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{try{if(!input||!actions.includes(input.action))throw new Error('操作不支持');action(input.action,input);return output({ok:true,state:publicGame()});}catch(error){recordError(error,input?.action||'agent');return output({ok:false,error:error.message});}}}];
  tools.push({name:'get_star_chain_records',title:'读取星链游玩记录',description:'Read authenticated saved match records or the versioned difficulty configuration. Active records hide the seed; completed records support deterministic replay.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['list','get','configuration','schema']},id:{type:'string'},limit:{type:'integer',minimum:1,maximum:100},before:{type:'integer'},beforeId:{type:'string'}},required:['operation'],additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{try{return output(await (input.operation==='get'?records.get(input.id):input.operation==='configuration'?records.refresh():input.operation==='schema'?records.schema():records.list({limit:input.limit||20,before:input.before,beforeId:input.beforeId})));}catch(e){return output({error:e.message});}}});
  tools.push({name:'configure_star_chain',title:'调整星链后续对局',description:'Save versioned all-level parameters or support settings for future matches only. Read configuration first, then provide its expectedRevision. Game rules, card counts, HP, and an active match cannot be changed through this tool.',inputSchema:{type:'object',properties:{expectedRevision:{type:'integer'},supportEnabled:{type:'boolean'},resetSupportForLevel:{type:'integer',minimum:0,maximum:LEVEL_COUNT-1},restoreDefaults:{type:'boolean'},profiles:{type:'array',minItems:LEVEL_COUNT,maxItems:LEVEL_COUNT,items:{type:'object'}},reason:{type:'string'}},required:['expectedRevision'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{try{return output(await records.settings(input));}catch(e){return output({error:e.message});}}});
  try{for(const t of tools)void Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(error=>console.warn('Optional browser controls unavailable',error));window.addEventListener('pagehide',()=>{cancelTimers();lifecycle.abort();},{once:true});}catch(error){console.warn('Optional browser controls unavailable',error);}
}
await records.init(legacyImportBase||progress);newMatch(0);registerAgentTools();
