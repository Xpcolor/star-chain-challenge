import {RELEASE} from './version.mjs';
import {BOT_PROFILES,CONFIG_ID,LEVEL_COUNT,validateProfiles,freshSupport,settleSupport,decideSupport} from './difficulty.mjs?v=flight-records-2';
import {makeRecord,appendEvent,closeRecord,recap,publicSnapshot} from './records.mjs?v=flight-records-2';
import {createRecordClient} from './record-client.mjs?v=flight-records-2';
import {MODULES,SECTORS,moduleById,sectorById,copyModuleProgress} from './tactics.mjs?v=flight-records-2';
import {ROBOTS,goalById,cardLabel,chainName,isFinalRound,createGame,selectModule,rollInitiative,selectSector,chooseSector,selectBoon,chooseBoon,evaluateMove,calibrateOffer,playAndClaim,rest,takeCard,observation,chooseBotMove,chooseBotSupply,audit,warpLandings,rulesForLevel,pinOptionsForMatch,transfer,chooseTransfer} from './engine.mjs?v=flight-records-2';
import {normalizeProgress} from './progress.mjs?v=flight-records-2';
import {challengeById,challengeViews,copyChallengeProgress} from './challenges.mjs?v=flight-records-2';
import {PLAYER_SHIP,FLEET} from './fleet.mjs';
import {createAudioBus} from './audio-bank.mjs';
import {createBattleView} from './battle-view.mjs';
import {emitVisual} from './visual-theme.mjs';
import {COMBAT_TIMING,combatHoldMs} from './combat-timing.mjs';

const $=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='star-chain-demo-v1',timers=new Set();
let cachedSettings=null,legacyImportBase=null,account=null,flight=null,decisionStarted=Date.now(),recordStatus={pending:0,saving:false,error:''},settingsBusy=false;
const settings=()=>account?.settings||cachedSettings||{supportEnabled:true,supportEpochs:Array(LEVEL_COUNT).fill(0),config:{id:CONFIG_ID,profiles:BOT_PROFILES}};
const chosenLevel=()=>game?.selectedLevel??game?.level??0;
const opponent=()=>ROBOTS[chosenLevel()];
const opponentName=()=>opponent().name+(game.level<chosenLevel()?'（支援模式）':'');
const supportFor=level=>progress.support?.[level]||freshSupport(level);
const records=createRecordClient({onStatus:s=>{recordStatus=s;if(game)render();},onProfile:p=>{account=p;if(records.status().pending===0){progress={...p.progress,pinnedModule:progress?.pinnedModule||null,lastChallenges:progress?.lastChallenges||[]};persist();}if(game)render();}});
let storageAvailable=true;
function readProgress(){try{const raw=JSON.parse(localStorage.getItem(STORE)||'null'),cache=raw?.settingsCache;legacyImportBase=normalizeProgress(raw?.legacyImportBase||raw);if(cache&&typeof cache.supportEnabled==='boolean'&&Array.isArray(cache.supportEpochs)&&cache.supportEpochs.length===LEVEL_COUNT&&cache.supportEpochs.every(x=>Number.isSafeInteger(x)&&x>=0)){try{cachedSettings={supportEnabled:cache.supportEnabled,supportEpochs:cache.supportEpochs,config:{id:String(cache.config.id),profiles:validateProfiles(cache.config.profiles)}};}catch{}}return normalizeProgress(raw);}catch{storageAvailable=false;return normalizeProgress(null);}}
let progress=readProgress(),game,selection,restMode=false,restCards=[],restGoal=null,run=0,recorded=false,effect=null,effectSeq=0,diceStage='idle',diceResult=null,botScheduled=false,botMessage='',lastModalTrigger=null,arrivalPending=false,terminalReady=false,resultRequested=false,pinOptions=[],offeredPin=null;
const audio=window.starChainBridge?.audio||createAudioBus(),battleView=window.starChainBridge?.battleView||createBattleView({audio});
const blankSelection=()=>({chain:null,ids:[],ops:[1,1],wild:1,calibrate:false,warpTo:null,port:null,market:null});
const reduced=()=>window.starChainBridge?.motionReduced?.()??matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  openModal(`<div class="modal-content"><div class="modal-head"><h2 id="modal-title">记录与难度</h2><button class="btn quiet" data-action="close-modal">关闭</button></div><p>${recordStatus.owner?'已登录 · 记录按账号保存':'未登录 · 当前记录仅保存在本机'} <a class="btn" href="/login">登录记录服务</a> <a class="btn" href="/cdn-cgi/access/logout">退出登录</a></p><p>已完成 ${progress.matches} 局。详细记录用于复盘和后续优化。</p><div class="record-controls"><button class="btn ${settings().supportEnabled?'primary':''}" data-action="toggle-support" aria-pressed="${settings().supportEnabled}" ${settingsBusy?'disabled':''}>支援邀请：${settings().supportEnabled?'开启':'关闭'}</button><p>每两连败，会询问是否下调一级；只有接受才降低，最低1级。拒绝后保持当前难度，再两连败才重新询问。两连胜恢复一级，最高回到所选等级。退出不计，平局清空连胜连败。</p><p>所选 ${chosenLevel()+1}级 · 当前实际 ${actual+1}级。支援需你确认，调整只影响新局。</p><button class="btn" data-action="reset-support" ${settingsBusy?'disabled':''}>恢复所选难度</button></div><p class="section-note">${recordStatus.error?esc(recordStatus.error):recordStatus.pending?'正在同步游玩记录…':'游玩记录已保存。'}${recordStatus.localError?'此浏览器无法暂存待同步记录，请及时导出。':''}</p><div class="result-actions"><button class="btn primary" data-action="export-records">导出游玩记录</button><button class="btn" data-action="sync-records">重试同步</button><button class="btn" data-action="import-records">导入旧站备份</button></div><p class="section-note">版本 ${esc(RELEASE.version)} · ${esc(RELEASE.environment)} · ${esc(RELEASE.commit.slice(0,12))}</p></div>`);
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
async function importRecords(){
  const input=document.createElement('input');input.type='file';input.accept='application/json,.json';
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    try{
      if(file.size>50*1024*1024)throw Error('备份文件超过50MB，请拆分后导入');
      const data=JSON.parse(await file.text());
      if(!window.confirm(`将备份中的 ${data.records?.length||0} 条记录导入当前登录账号。请保留原文件；重复记录不会覆盖。继续？`))return;
      const result=await records.importBackup(data);
      openModal(`<div class="modal-content"><h2 id="modal-title">导入结果</h2><p>新增 ${result.imported} 条，重复或未结束跳过 ${result.skipped} 条，失败 ${result.errors.length} 条。</p><p>只统计通过重放校验的完整对局，不累加旧档案汇总局数。原始备份请继续保留。</p><pre>${esc(JSON.stringify(result.errors,null,2))}</pre><button class="btn" data-action="close-modal">关闭</button></div>`);
    }catch(e){toast(e.message);}
  });input.click();
}
function later(fn,delay){const ticket=run;const id=setTimeout(()=>{timers.delete(id);if(ticket===run)fn();},delay);timers.add(id);return id;}
function cancelTimers(){for(const id of timers)clearTimeout(id);timers.clear();botScheduled=false;}
const blocked=()=>!!effect||game.phase==='loadout'||diceStage!=='none';
const humanAction=()=>!blocked()&&game.current===0&&game.phase==='action';
const humanPhase=phase=>!blocked()&&game.current===0&&game.phase===phase;
function currentMove(){
 const types=selection.ids.map(id=>game.hands[0].find(c=>c.id===id)?.type),special=types.includes('J')||types.includes('D');
 const move={chain:selection.chain,ids:[...selection.ids],ops:special?[]:selection.ops.slice(0,types.includes('A')?2:1),wild:selection.wild};
 if(types.includes('J')&&selection.warpTo!==null)move.warpTo=selection.warpTo;
 if(types.includes('D'))move.port=selection.port;
 if(selection.calibrate)move.calibrate=true;return move;
}
function preview(){if(!humanAction()||restMode)return{info:null,scoring:null,error:null,calibrate:null};try{const requested=currentMove(),plain={...requested};delete plain.calibrate;const obs=observation(game,0),base=evaluateMove(obs,plain),offer=calibrateOffer(game.goals,base.info,obs);if(selection.calibrate&&!offer)selection.calibrate=false;const scoring=selection.calibrate?evaluateMove(obs,{...plain,calibrate:true}):base;return{info:scoring.info,scoring,error:null,calibrate:offer};}catch(e){return{info:null,scoring:null,error:e.message,calibrate:null};}}
function announce(message){$('announcer').textContent=message;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;announce(message);later(()=>{$('toast').hidden=true;},3000);}
function openModal(content){lastModalTrigger=document.activeElement;if(window.starChainBridge)window.starChainBridge.modal(content);else $('modal').innerHTML=content;if(!$('modal').open)$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();if(lastModalTrigger?.isConnected)lastModalTrigger.focus({preventScroll:true});}
function focusRegion(id){requestAnimationFrame(()=>{const el=$(id);if(el){const r=el.getBoundingClientRect();if(r.top<0||r.bottom>window.innerHeight)el.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'center'});}});}
document.addEventListener('starchain:arrival-ready',event=>{if(event.detail?.match!==run)return;arrivalPending=false;render();});
document.addEventListener('starchain:terminal-ready',event=>{if(event.detail?.match!==run)return;terminalReady=true;if(resultRequested)showResult();});
function newMatch(level=chosenLevel()){
  if(!Number.isInteger(level)||level<0||level>=ROBOTS.length||level>progress.unlocked)throw new Error('请先赢下前一位对手');
  if(settings().supportEnabled&&supportFor(level).pending){showSupport(level);return;}
  if(flight&&flight.status==='active'&&game){closeRecord(flight,game);void records.enqueue(flight);}
  cancelTimers();run++;arrivalPending=!reduced();terminalReady=false;resultRequested=false;pinOptions=[];effectSeq=0;battleView.reset(run);closeModal();selection=blankSelection();restMode=false;restCards=[];restGoal=null;recorded=false;effect=null;botMessage='';diceStage='idle';diceResult=null;$('toast').hidden=true;
  const prefs=settings(),actual=prefs.supportEnabled?supportFor(level).effective:level;
  const robotModuleCounts={...(progress.robotModuleCounts||{})};
  offeredPin=progress.pinnedModule||null;
  const options={...rulesForLevel(level),level:actual,seed:(Date.now()+Math.floor(Math.random()*1000000))>>>0,previousChallenges:progress.lastChallenges,previousSector:game?.sectorId||null,botProfile:prefs.config.profiles[actual],choices:true,pinnedModule:progress.pinnedModule||null,robotModuleCounts};
  game=createGame(options);game.selectedLevel=level;game.configId=prefs.config.id;
  flight=makeRecord(options,{selectedLevel:level,actualLevel:actual,supportEnabled:prefs.supportEnabled,supportEpoch:prefs.supportEpochs[level]||0,configId:prefs.config.id,initiativeShield:game.shieldAllowance});flight.initial=publicSnapshot(game);decisionStarted=Date.now();void records.enqueue(flight);
  progress.robotModuleCounts={...robotModuleCounts,[game.modules[1]]:(robotModuleCounts[game.modules[1]]||0)+1};
  progress.pinnedModule=null;progress.lastChallenges=[...game.challengeIds];pinOptions=pinOptionsForMatch(options.seed);persist();render();if(arrivalPending&&!window.starChainBridge)later(()=>{arrivalPending=false;render();},2000);announce(`双方各有 ${game.hp[0]} 点生命。飞船进场后选择模块。`);
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
  const type=c.type==='N'?'':c.type==='W'?'wild':c.type==='J'?'warp':c.type==='D'?'dock':c.type==='B'?'barter':'accel',label=cardLabel(c),wildValue=c.type==='W'&&action==='card'&&selected&&!restMode?selection.wild:null;
  return `<button class="card ${type} ${selected?'selected':''}" data-action="${action}" data-id="${c.id}" ${index===null?'':`data-index="${index}"`} data-focus="${action}-${c.id}" ${disabled?'disabled':''} aria-pressed="${selected}" aria-label="${esc(label)}${wildValue===null?'':`，代替 ${wildValue}`}${selected?'，已选牌':''}"><span class="corner" aria-hidden="true">${c.type==='N'?c.value:c.type}</span><span class="card-value" aria-hidden="true">${c.type==='N'?c.value:c.type==='W'?wildValue??'W':c.type}</span><span class="card-caption" aria-hidden="true">${c.type==='N'?'':c.type==='W'?'星云':c.type==='J'?'跃迁':c.type==='D'?'定轨':c.type==='B'?'调拨':'加速'}</span>${order?`<span class="card-order">${order}</span>`:''}</button>`;
}
function wildPickerHTML(){return `<div class="wild-picker" id="wild-picker" role="group" aria-label="星云代替的数字"><div class="wild-picker-heading">星云代替的数字 <strong>已选 ${selection.wild}</strong></div><div class="wild-values">${Array.from({length:9},(_,i)=>`<button class="wild-number ${selection.wild===i+1?'active':''}" data-action="wild" data-value="${i+1}" data-focus="wild-${i+1}" aria-label="星云当作 ${i+1}" aria-pressed="${selection.wild===i+1}">${i+1}</button>`).join('')}</div></div>`;}
function statusText(){
  if(arrivalPending)return '舰船正在进场…';
  if(game.phase==='loadout')return '选择本局模块。星域由骰子胜方在开局后选择。';
  if(game.phase==='sector')return game.current===0?'你赢了骰子。选择一条双方共用的星域。':'对手正在选择星域。';
  if(game.phase==='boon')return game.current===0?'前段结束。选择一项后段增益，双方一起生效。':'对手正在选择后段增益。';
  if(diceStage!=='none')return diceStage==='idle'?'投骰子决定本局先手':diceResult?.tie&&diceStage==='result'?'同点，自动重掷…':'正在决定先手…';
  if(effect?.preparing)return `${effect.actor===0?'指令已确认':'对手已确认'} · ${effect.rawDamage?'武器蓄能':effect.healing?'维修启动':'星链定位'}…`;
  if(effect)return `${effect.actor===0?'你':opponentName()}：造成 ${effect.damage} 伤害${effect.blockedDamage?` · 破盾 ${effect.blockedDamage}`:''} · 回复 ${effect.healing} 生命`;
  if(game.phase==='over')return game.winner==='draw'?'双方生命相同，本局平局':game.winner===0?'你赢下了这场星舰对决！':`${opponentName()}赢下本局`;
  if(restMode)return '休整：可弃 0–2 张手牌，并替换 1 张攻击目标。';
  if(game.phase==='refill')return `请补 ${game.handSize-game.hands[0].length} 张牌。`;
  if(selection.calibrate)return '已选校准，确认后落点挪 1 格。';
  if(selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J')&&selection.chain!=null&&game.board[selection.chain]===10)return '折跃：选择落到 9 或 11。';
  if(selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='W')&&selection.ids.length)return '星云：点选 1–9。';
  return boonNote();
}
function initiativeHTML(){
  if(diceStage==='none'||game.phase==='loadout')return '';
  const pair=diceStage==='result'?diceResult.pair:['?','?'];
  return `<div class="initiative" aria-label="开局投骰子"><h2>谁先启航？</h2><p>双方各掷一颗六面骰，点大先手，同点重掷。</p><div class="dice-pair ${diceStage==='rolling'?'rolling':''}"><div><span>你</span><strong class="die">${pair[0]}</strong></div><span class="versus">:</span><div><span>${opponentName()}</span><strong class="die enemy-die">${pair[1]}</strong></div></div>${diceStage==='idle'?'<button class="btn primary" data-action="roll" data-focus="roll">投骰子开局</button>':`<strong class="dice-result">${diceStage==='rolling'?'掷骰中…':diceResult.tie?'同点，自动重掷…':`${game.first===0?'你':'对手'}先手`}</strong>`}<small>仅开局投骰 · 后手获 ${game.shieldAllowance} 点一次性护盾</small></div>`;
}
function loadoutHTML(){
  return `<div class="loadout" id="loadout-region"><div class="loadout-heading"><h2>选择本局模块</h2><span>三选一 · 仅本局生效</span></div><p>对手已从这三项里锁定一个。它会优先选最近用得少的模块，六种会轮流出现。选择后双方公开。</p><div class="module-options">${game.moduleOptions.map(id=>{const m=moduleById(id);return `<button class="module-option ${offeredPin===id?'pinned':''}" data-action="module" data-id="${id}" data-focus="module-${id}"><strong>${m.name}</strong><span>${m.text}</span><small>每局最多 ${m.limit} 次</small><em>${offeredPin===id?'✓ 已钉住 · 本局保留':'选择此模块'}</em></button>`;}).join('')}</div></div>`;
}
function tacticsHTML(p){
  const sector=sectorById(game.sectorId);
  if(game.phase==='loadout'||!sector)return '';
  const scoring=effect||p.scoring,actor=effect?.actor??0;
  return `<section class="tactics" aria-label="双方模块"><div class="module-status">${game.modules.map((id,who)=>{const m=moduleById(id),pr=game.moduleProgress[who],triggered=actor===who&&(scoring?.moduleDamage||scoring?.moduleHealing);return `<details class="module-equipped ${triggered?'triggered':''}"><summary><span>${who===0?'你':'对手'} · <strong>${m.name}</strong></span><small>剩余 ${m.limit-pr.uses}/${m.limit}</small>${m.id==='circuit'&&pr.circuit.length?`<span class="module-track">已集 ${[0,1,2].filter(c=>pr.circuit.includes(c)).map(c=>`<span class="repair-hint-${c}">${['蓝','紫','橙'][c]}</span>`).join(' ')}</span>`:''}${(m.id==='focus'||sector.id==='roving')&&pr.lastAttackChain!==null?`<span class="module-track">上次 <span class="repair-hint-${pr.lastAttackChain}">${['蓝','紫','橙'][pr.lastAttackChain]}</span></span>`:''}</summary><p>${m.text} 每局最多 ${m.limit} 次。</p></details>`;}).join('')}</div></section>`;
}
function rovingColorsHTML(){
  if(game.sectorId!=='roving')return '';
  const names=['蓝','紫','橙'];
  const side=(who,title)=>{const chain=game.moduleProgress[who]?.lastAttackChain;return `<span class="sector-color">${title} <strong class="${chain===null?'sector-color-none':`repair-hint-${chain}`}">${chain===null?'暂无':names[chain]}</strong></span>`;};
  return `<span class="sector-colors" aria-label="巡航星域双方上次攻击颜色">${side(0,'我方')}${side(1,'敌方')}</span>`;
}
function alignmentNote(){
  const id=game.modules?.[0],sector=game.sectorId;
  if(id==='focus'&&sector?.startsWith('tide'))return '和你的连击炮一致：停在同色攻击';
  if(id==='circuit'&&sector==='roving')return '和你的巡航引擎一致：换颜色攻击';
  if(id==='engineer'&&sector==='repair')return '和你的工程舱一致：打中并完成维修';
  if(id==='edge'&&sector==='long')return '和你的边界炮一致：大跳更容易落到两端';
  return '';
}
function boonNote(){
  if(!game.boon)return '';
  if(game.boon.type==='calibrate')return '后段：双方校准各多 1 次';
  if(game.boon.type==='chain')return `后段：${chainName(game.boon.chain)}打中再 +1`;
  return `后段：${game.boon.left[0]?'你的下一次打中 +1':'你的追击已用'} · ${game.boon.left[1]?'对手的下一次打中 +1':'对手的追击已用'}`;
}
function sectorBannerHTML(p){
  const scoring=effect||p.scoring,align=alignmentNote();
  if(!game.sectorId&&game.sectorOptions)return `<div class="sector-banner" id="sector-banner"><strong>候选星域</strong><span>${game.sectorOptions.map(id=>sectorById(id).name).join(' · ')}</span><small>骰子胜方开局后选择 · 双方共用</small></div>`;
  const sector=sectorById(game.sectorId);
  return `<div class="sector-banner ${scoring?.sectorDamage?'triggered':''}" id="sector-banner"><strong>${sector.name}</strong><span>${sector.text}</span>${align?`<em class="alignment-note">${align}</em>`:''}${rovingColorsHTML()}<small>双方共享 · 整局固定</small></div>`;
}
function sectorChoiceHTML(){
  const mine=game.current===0;
  return `<div class="loadout" id="sector-region"><div class="loadout-heading"><h2>选择本局星域</h2><span>三选一 · 双方共用</span></div><p>${mine?'你赢了骰子，选一条整局规则。':'对手赢了骰子，正在从这三项里选择。'}</p><div class="module-options">${game.sectorOptions.map(id=>{const s=sectorById(id);return `<button class="module-option" data-action="sector" data-id="${id}" data-focus="sector-${id}" ${mine?'':'disabled'}><strong>${s.name}</strong><span>${s.text}</span><em>${mine?'选择此星域':'等待对手'}</em></button>`;}).join('')}</div></div>`;
}
function boonHTML(){
  const mine=game.current===0,name=chainName(game.boonOffer.chain);
  return `<section class="boon-panel" id="boon-region" aria-label="后段三选一"><div class="loadout-heading"><h2>前段结束</h2><span>先手三选一 · 双方共用</span></div><p>${mine?'选择一项。三项都能在下一手看出效果。':'对手正在选择后段增益。'}</p><div class="module-options"><button class="module-option" data-action="boon" data-kind="calibrate" ${mine?'':'disabled'}><strong>校准各多 1 次</strong><span>双方立刻各增加 1 次校准。</span></button><button class="module-option" data-action="boon" data-kind="chain" ${mine?'':'disabled'}><strong>${name}打中 +1</strong><span>此后在${name}打中攻击目标，伤害再 +1。</span></button><button class="module-option" data-action="boon" data-kind="strike" ${mine?'':'disabled'}><strong>下一次打中 +1</strong><span>你和对手各自的下一次打中，伤害 +1。</span></button></div></section>`;
}
function moveFormula(info){
  if(!info)return '';
  if(info.trace)return info.calibrate?`${info.trace} · 校准至 ${info.after}`:info.trace;
  if(info.steps?.some((step,index)=>index<info.steps.length-1&&step.to>20))return info.steps.reduce((text,step)=>`${text} ${step.op===1?'+':'−'} ${step.value} = ${step.to}`,String(info.before));
  if(info.warp)return `20 − ${info.before} = ${20-info.before} · 落到 ${info.after}${info.calibrate?'（含校准）':''}`;
  if(info.dock)return `定轨 ${info.before} → ${info.after}${info.calibrate?'（含校准）':''}`;
  if(String(info.expression||'').includes('='))return info.expression;
  return `${info.expression} = ${info.after}`;
}
function bonusBreakdown(scoring){
  if(!scoring||!(scoring.moduleDamage||scoring.moduleHealing||scoring.sectorDamage||scoring.blockedDamage||scoring.chainDamage||scoring.strikeDamage))return '';
  const parts=[];
  if(scoring.moduleDamage||scoring.sectorDamage||scoring.chainDamage||scoring.strikeDamage)parts.push(`<span class="pop-base">基础 ${scoring.baseDamage}</span>`);
  if(scoring.moduleDamage)parts.push(`<span class="pop-module">模块 +${scoring.moduleDamage}</span>`);
  if(scoring.moduleHealing)parts.push(`<span class="heal-text">模块回血 +${scoring.moduleHealing}</span>`);
  if(scoring.sectorDamage)parts.push(`<span class="pop-sector">星域 +${scoring.sectorDamage}</span>`);
  if(scoring.chainDamage)parts.push(`<span class="pop-chain">${chainName(game.boon.chain)} +${scoring.chainDamage}</span>`);
  if(scoring.strikeDamage)parts.push(`<span class="pop-strike">追击 +${scoring.strikeDamage}</span>`);
  if(scoring.blockedDamage)parts.push(`<span class="shield-text">护盾抵消 ${scoring.blockedDamage}</span>`);
  return `<div class="bonus-breakdown">${parts.join('')}</div>`;
}
function shipHTML(actor){
  const own=actor===0,attacking=effect?.actor===actor&&effect.rawDamage>0,hit=effect&&effect.actor!==actor&&effect.rawDamage>0,repair=effect?.actor===actor&&effect.healing>0;
  const changed=effect&&effect.hpBefore[actor]!==game.hp[actor],dead=game.phase==='over'&&game.hp[actor]===0,won=game.phase==='over'&&game.winner===actor;
  return `<div class="ship ${own?'player-ship':'enemy-ship'} ${attacking?'firing':''} ${hit?'hit':''} ${repair?'repairing':''} ${dead?'defeated':''} ${won?'victorious':''}"><div class="ship-art"><img class="ship-forward${own?'':' enemy-facing'}" src="${own?PLAYER_SHIP.fallback:(FLEET[game.level]||FLEET[0]).fallback}" alt="${own?'你的飞船':`${opponentName()}的飞船`}" width="960" height="640" draggable="false">${repair?'<span class="repair-ring" aria-hidden="true"></span>':''}${hit?'<span class="impact-ring" aria-hidden="true"></span>':''}${repair?`<strong class="floating-number healing" aria-hidden="true">+${effect.healing}</strong>`:''}${hit?`<strong class="floating-number ${effect.damage?'damage':'shield-number'}" aria-hidden="true">${effect.damage?`−${effect.damage}`:`护盾 −${effect.blockedDamage}`}</strong>`:''}${attacking&&effect.moduleDamage?`<strong class="floating-number module-float" aria-hidden="true">模块 +${effect.moduleDamage}</strong>`:''}${attacking&&effect.sectorDamage?`<strong class="floating-number sector-float" aria-hidden="true">星域 +${effect.sectorDamage}</strong>`:''}${attacking&&effect.chainDamage?`<strong class="floating-number chain-float" aria-hidden="true">${chainName(game.boon.chain)} +1</strong>`:''}${attacking&&effect.strikeDamage?`<strong class="floating-number strike-float" aria-hidden="true">追击 +1</strong>`:''}</div><div class="ship-status"><span>${own?'你':opponentName()}${game.first===actor?' <small>· 先手</small>':''}${game.shields[actor]?` <small class="shield-badge" aria-label="剩余 ${game.shields[actor]} 点护盾">盾 ${game.shields[actor]}</small>`:''}${game.phase==='loadout'?'':` <small class="calibrate-badge ${game.calibrates[actor]?'ready':'spent'}" aria-label="${own?'你':'对手'}${game.calibrates[actor]?`还有 ${game.calibrates[actor]} 次校准`:'本局校准已用'}">${game.calibrates[actor]?`校准 ${game.calibrates[actor]}`:'校准已用'}</small>`}</span><div class="hp" aria-label="${own?'你':'对手'}当前 ${game.hp[actor]} 点生命">${changed?`<strong class="hp-before" aria-hidden="true">${effect.hpBefore[actor]}</strong>`:''}<strong class="${changed?'hp-after':''}">${game.hp[actor]}</strong><span>生命</span></div></div></div>`;
}
function goalsHTML(p){
  const ids=effect?.goals||game.goals,chosen=effect?.claimed||p.scoring?.chosen||[];
  return `<aside class="goal-panel panel" id="goal-region" aria-label="共享攻击目标"><div class="section-heading"><h2>攻击目标</h2><span>双方共享</span></div>${restMode?'<p class="section-note">可点选 1 张，在休整时替换</p>':''}<div class="goals">${ids.map(id=>{const g=goalById(id),selected=restMode?restGoal===id:chosen.includes(id);return `<button class="goal ${selected?'selected':''}" data-action="goal" data-id="${id}" data-focus="goal-${id}" ${humanAction()&&restMode?'':'disabled'} aria-pressed="${selected}"><span class="goal-kind kind-${g.kind}">${{E:'区域',P:'精准',L:'联动'}[g.kind]}</span><strong>${g.name}</strong><span class="goal-text">${g.text}</span><span class="goal-bottom"><span>伤害 <b>${g.damage}</b></span>${selected?`<small>${restMode?'将替换':effect?'已触发':'本次达成'}</small>`:''}</span></button>`;}).join('')}</div><div class="goal-total">${effect?'本次攻击':'预计攻击'} <strong>${effect?.damage??p.scoring?.damage??0}</strong></div><p class="section-note">确认后自动触发，所有达成项 · 区域和精准目标标在星链上</p></aside>`;
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
function markedValues(){const marks=new Set();for(const id of (effect?.goals||game.goals)){const g=goalById(id);if(g?.values)for(const value of g.values)marks.add(value);}return marks;}
function tracksHTML(p){
  const marks=markedValues(),hint=humanAction()&&!restMode&&!selection.calibrate?p.calibrate?.after??null:null,listed=[...marks].sort((a,b)=>a-b).join('、');
  return `<section class="tracks" id="track-region" aria-label="三条星链">${game.board.map((value,i)=>{const selected=humanAction()&&!restMode&&selection.chain===i,animated=effect?.chain===i;return `<button class="track track-${i} ${selected?'selected':''} ${animated?'moving':''}" data-action="chain" data-index="${i}" data-focus="chain-${i}" ${humanAction()&&!restMode?'':'disabled'} aria-pressed="${selected}" aria-label="${chainName(i)}，当前 ${value}${listed?`，区域或精准目标 ${listed}`:''}"><span class="track-heading"><strong>${chainName(i)}</strong><span>${selected&&p.info?moveFormula(p.info):animated?moveFormula(effect):`当前 ${value}`}</span></span><span class="rail" aria-hidden="true"><span class="rail-line"></span>${Array.from({length:21},(_,n)=>`<span class="tick ${value===n?'current':''} ${marks.has(n)?'goal-mark':''} ${selected&&p.info?.after===n?'destination':''} ${selected&&hint===n?'calibrate-hint':''}" style="left:${n*5}%"><i></i><span class="rail-label">${n}</span></span>`).join('')}<span class="orb position-star ${marks.has(value)?'on-goal':''} ${animated?'travelling':''}" style="left:${value*5}%;--start:${animated?effect.before*5:value*5}%;--end:${value*5}%"></span>${selected&&p.info?`<span class="orb preview" style="left:${p.info.after*5}%"></span>`:''}</span></button>`;}).join('')}</section>`;
}
function operationHTML(p,hasA,hasW){
  const special=selection.ids.map(id=>game.hands[0].find(c=>c.id===id)?.type);
  if(special.includes('B'))return '<div class="operation-panel"><p class="section-note">调拨：选另一张手牌，再选一张补牌区明牌；交换后继续本回合出牌。</p></div>';
  if(special.includes('J')||special.includes('D')){
    const warp=special.includes('J'),before=selection.chain==null?null:game.board[selection.chain],points=before==null?[]:warp?warpLandings(before):[0,10,20].filter(n=>n!==before),value=warp?selection.warpTo:selection.port;
    const active=value??(warp&&before!==10?20-before:null);
    return '<div class="operation-panel" id="operation-region"><div class="expression">'+(p.info?chainName(selection.chain)+' <strong>'+moveFormula(p.info)+'</strong>':'先选星链，再选落点')+'</div><div class="op-group warp-picker" role="group" aria-label="'+(warp?'跃迁':'定轨')+'落点">'+points.map(n=>'<button class="op-btn '+(active===n?'active':'')+'" data-action="'+(warp?'warp-to':'dock-to')+'" data-value="'+n+'" aria-pressed="'+(active===n)+'">落到 '+n+'</button>').join('')+'</div><p class="section-note">'+(warp?'可选 20 − 当前值，以及前后各一格；越界和原位除外':'定轨单独出牌，可选 0、10、20；原位除外')+'，不计加法或减法。</p></div>';
  }
  return `<div class="operation-panel" id="operation-region">${hasW&&humanAction()&&!restMode?wildPickerHTML():''}<div class="operation-row">${Array.from({length:hasA?2:1},(_,i)=>`<div class="op-step">${hasA?`<span>第 ${i+1} 步</span>`:''}<span class="op-group" role="group" aria-label="第 ${i+1} 步运算">${[1,-1].map(op=>`<button class="op-btn ${selection.ops[i]===op?'active':''}" data-action="op" data-step="${i}" data-value="${op}" data-focus="op-${i}-${op}" ${humanAction()&&!restMode?'':'disabled'} aria-label="第 ${i+1} 步${op===1?'加':'减'}法" aria-pressed="${selection.ops[i]===op}">${op===1?'+':'−'}</button>`).join('')}</span></div>`).join('')}<div class="expression">${p.info?`<strong>${moveFormula(p.info)}</strong>`:effect?`<strong>${moveFormula(effect)}</strong>`:'<span>每一步都在 0–20 之间</span>'}</div></div>${humanAction()&&!restMode&&selection.ids.length&&p.error?`<p class="move-error">${esc(p.error)}</p>`:''}</div>`;
}
function calibrateControl(p){
  const left=game.calibrates?.[0]??0;
  if(!left)return `<button class="btn quiet wide" data-action="calibrate" disabled>校准已使用</button>`;
  const offer=p.calibrate,on=!!selection.calibrate&&!!offer,ready=humanAction()&&!restMode&&!!offer;
  return `<button class="btn ${ready?'primary':'quiet'}" data-action="calibrate" data-focus="calibrate" ${ready?'':'disabled'} aria-pressed="${on}" aria-label="${offer?`校准到 ${offer.after}，本局剩余 ${left} 次`:'当前落点不能校准'}">${on?`已校准至 ${p.info.after}`:offer?`校准至 ${offer.after}`:'校准'}</button>`;
}
function calibrateRow(p){
  if(game.phase==='loadout'||diceStage!=='none')return '';
  const left=game.calibrates?.[0]??0;
  const note=left?(p.calibrate?'主动按钮。按下后，这一步会挪到更好的相邻格。':`剩余 ${left} 次。先选牌和星链，落点离攻击目标差 1 格时才会亮。`):'本局校准已经用过。';
  return `<div class="calibrate-row">${calibrateControl(p)}<span class="section-note">${note}</span></div>`;
}
function sideLabel(actor){return `<p class="turn-side ${actor===0?'mine':'enemy'}">${actor===0?'我方出牌':'敌方出牌'}</p>`;}
function actionHTML(p){
  if(arrivalPending)return '<p class="dock-wait">舰船进场中…</p>';
  if(humanAction()&&!restMode&&selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='B'))return '<p class="section-note">交换后继续本回合，不消耗出牌机会。</p><button class="btn primary wide" data-action="transfer" '+(selection.ids.length===2&&selection.market!==null?'':'disabled')+'>确认调拨 · 继续出牌</button>';
  if(game.phase==='loadout')return '<p class="dock-wait">先在上方选择一个模块<br>再投骰子启航</p>';
  if(game.phase==='sector')return '<p class="dock-wait">先选择本局星域</p>';
  if(game.phase==='boon')return '<p class="dock-wait">先选择后段增益</p>';
  if(diceStage!=='none')return '<p class="dock-wait">先投骰子，决定本局先手</p>';
  if(effect)return `${sideLabel(effect.actor)}<div class="combat-summary"><span>攻击 <b>${effect.damage}</b></span><span class="heal-text">回血 <b>${effect.healing}</b></span></div>${bonusBreakdown(effect)}<button class="btn primary wide" disabled>${effect.preparing?'已确认 · 蓄能中…':'结算中…'}</button>`;
  if(game.phase==='over')return `<strong class="end-label">${game.winner===0?'你赢了':game.winner==='draw'?'本局平局':'本局结束'}</strong><button class="btn primary wide" data-action="result">查看对局结果</button><button class="btn quiet wide" data-action="retry">再来一局</button>`;
  if(game.current===1)return `${sideLabel(1)}<button class="btn primary wide" disabled>等待对手</button>`;
  if(restMode)return `${sideLabel(0)}<p>已选 ${restCards.length}/2 张弃牌${restGoal?' · 替换 1 项目标':''}</p><button class="btn primary wide" data-action="confirm-rest">确认休整</button><button class="btn quiet wide" data-action="cancel-rest">返回出牌</button>`;
  if(game.phase==='refill')return `${sideLabel(0)}<div class="combat-summary"><span>攻击 <b>${game.pending.damage}</b></span><span class="heal-text">回血 <b>${game.pending.healing}</b></span></div>${bonusBreakdown(game.pending)}<strong class="refill-label">请补 ${game.handSize-game.hands[0].length} 张牌</strong>`;
  return `${sideLabel(0)}<div class="combat-summary"><span>攻击 <b>${p.scoring?.damage||0}</b></span><span class="heal-text">回血 <b>${p.scoring?.healing||0}</b></span></div>${bonusBreakdown(p.scoring)}<button class="btn primary wide" data-action="play" data-focus="play" ${p.info?'':'disabled'}>${p.scoring?.lethal?'确认出牌 · 击败对手':'确认出牌'}</button><button class="btn quiet wide" data-action="rest" data-focus="rest">休整</button>`;
}
function render(){
  const previousFocus=document.activeElement?.dataset?.focus,p=preview(),robot=opponent(),isAction=humanAction(),isRefill=humanPhase('refill');
  const hasA=selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='A'),hasW=selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='W'),nums=selection.ids.filter(id=>game.hands[0].find(c=>c.id===id)?.type==='N');
  const selected=restMode?restCards:selection.ids;
  if(window.starChainBridge){
    const battle=battleState();
    window.starChainBridge.render({game:publicGame(),battle,ui:{humanAction:isAction,humanRefill:isRefill,selected:[...selected],restGoal,restCount:restCards.length,deckCount:game.deck.length,formula:moveFormula(p.info||effect),error:p.error,opening:arrivalPending?'':game.phase==='loadout'?loadoutHTML():game.phase==='sector'?sectorChoiceHTML():game.phase==='boon'?boonHTML():initiativeHTML(),operations:operationHTML(p,hasA,hasW),orders:actionHTML(p),tactics:tacticsHTML(p),sector:sectorBannerHTML(p),calibrate:calibrateRow(p),history:game.history.slice(0,8).map(h=>`第 ${h.round} 轮 · ${h.actor===0?'你':robot.name} · ${h.rest?'休整':moveFormula(h)+' · 攻击 '+h.damage+' · 回血 '+h.healing}`).join('\n'),recordStatus:recordStatus.error?'记录待同步，可重试或导出':recordStatus.pending?'正在保存记录':'记录已同步',sound:audio.enabled}});
    syncBattle();emitVisual('state',{match:run,phase:game.phase,board:[...game.board],charge:p.scoring?.damage||0,event:battle.event});return;
  }
  $('app').innerHTML=`<div class="shell"><div class="flight-screen"><header class="header"><div class="brand"><h1>星链算式</h1><span>星舰对战</span></div><section class="opponent-hand" id="opponent-hand" aria-label="对手公开手牌，${opponentName()}，${game.hands[1].length}张"><span class="opponent-label">对手手牌</span><div class="opponent-cards">${game.hands[1].map(c=>cardHTML(c,{action:'opponent-card',disabled:true})).join('')}</div></section><div class="header-actions"><button class="btn quiet sound-toggle" data-action="sound" data-focus="sound" aria-pressed="${audio.enabled}" aria-label="${audio.enabled?'关闭音效':'打开音效'}">${audio.enabled?'音效':'静音'}</button><button class="btn quiet" data-action="records">记录与难度</button><button class="btn quiet" data-action="help" data-focus="help">玩法</button><button class="btn quiet" data-action="restart" data-focus="restart">重新开局</button></div></header>
  <div class="game-grid">${goalsHTML(p)}<main class="play-area">${sectorBannerHTML(p)}${tacticsHTML(p)}${game.phase==='boon'?boonHTML():''}<section class="battle ${effect?'settling':''} ${diceStage!=='none'?'opening':''} ${game.phase==='loadout'?'choosing-module':''} ${game.phase==='sector'?'choosing-sector':''} ${game.phase==='boon'?'choosing-boon':''}" aria-label="飞船对战"><div class="stage" id="battle-stage">${game.phase==='loadout'?loadoutHTML():game.phase==='sector'?sectorChoiceHTML():`<div class="battle-caption" id="turn-status" role="status">${esc(statusText())}</div><div class="round">第 <strong>${game.round}</strong> / 12 轮 · ${game.round<=4?'前段':'后段'}</div><div class="model-lane" id="model-lane" aria-hidden="true"><div class="ship-anchor" id="ship-anchor-0"></div><div class="ship-anchor" id="ship-anchor-1"></div></div><div class="ships">${shipHTML(0)}<div class="duel-mid" aria-hidden="true"><div class="fx-art"><div class="ring"></div><div class="beam ${effect?.rawDamage?'striking':''}"></div><div class="burst"></div><span class="spark a"></span><span class="spark b"></span></div><div class="fx-pad"></div></div>${shipHTML(1)}</div>${initiativeHTML()}`}</div>${tracksHTML(p)}<div class="operation-dock">${calibrateRow(p)}${operationHTML(p,hasA,hasW)}</div></section>
  ${isFinalRound(game)&&game.phase!=='over'?'<p class="final-notice">最后一轮 · 无需补牌。生命归零立即结束，否则双方行动后比较剩余生命。</p>':''}
  </main>${repairsHTML(p)}
  <section class="dock panel" aria-label="手牌、补牌与确认"><div class="hand-zone" id="hand-region"><div class="section-heading"><h2>${restMode?'选择要弃的牌':'你的手牌'}</h2><span>${game.hands[0].length}/6 张</span></div><div class="hand">${game.hands[0].map(c=>cardHTML(c,{selected:selected.includes(c.id),disabled:!isAction,order:hasA&&nums.includes(c.id)?nums.indexOf(c.id)+1:null})).join('')}</div><div class="selected-cards"><span>${restMode?'已选弃牌':'已选牌'}</span><strong>${selected.length?selected.map(id=>{const c=game.hands[0].find(c=>c.id===id);return c.type==='W'?`W = ${selection.wild}`:c.type==='A'?'A':c.type==='J'?'J':c.value;}).join(' · '):'—'}</strong><small>${hasA?'数字牌按选择顺序运算':'W 星云 · A 加速 · J 跃迁'}</small></div></div>
  <div class="supply-zone ${isRefill?'active':''}" id="supply-region"><div class="section-heading"><h2>补牌区</h2><span>${isRefill?`还需 ${game.handSize-game.hands[0].length} 张`:isFinalRound(game)?'末轮无需补牌':'出牌后补满 6 张'}</span></div><div class="supply-cards">${game.market.map((c,i)=>cardHTML(c,{action:'supply',index:i,disabled:!isRefill})).join('')}</div><button class="deck-button" data-action="draw" data-focus="draw" ${isRefill?'':'disabled'}>随机抽 1 张 <small>牌堆 ${game.deck.length}</small></button></div><div class="action-zone">${actionHTML(p)}</div></section></div></div>
  <section class="fleet" aria-label="${LEVEL_COUNT}级对手"><div class="fleet-heading"><h2>选择对手</h2><span>共 ${LEVEL_COUNT} 级 · 按实际难度解锁</span></div><div class="levels">${ROBOTS.map((r,i)=>`<button class="level ${chosenLevel()===i?'active':''}" data-action="level" data-level="${i}" data-focus="level-${i}" ${i>progress.unlocked?'disabled':''} aria-pressed="${chosenLevel()===i}" aria-label="第 ${i+1} 级 ${r.name}，${i>progress.unlocked?'未解锁':r.tag}"><img src="${FLEET[i].fallback}" alt="" width="960" height="640" loading="lazy"><span><b>${i+1} · ${r.name}</b><small>${i>progress.unlocked?'未解锁':r.tag}</small></span></button>`).join('')}</div></section>
  <footer class="footer"><span>初始生命 ${flight?.options.hp||18} · 修复无上限 · 最多 12 轮</span><a class="library-link" href="./asset-library.html">舰船图鉴</a><span>${recordStatus.error?'记录待同步，可在「记录与难度」重试或导出':recordStatus.pending?'正在保存游玩记录':'游玩记录已同步'} · 刷新开启新局</span></footer>
  <details class="history"><summary>航行记录</summary>${game.history.length?game.history.slice(0,8).map(h=>`<p><span>第 ${h.round} 轮 · ${h.actor===0?'你':robot.name}</span> ${h.rest?`休整，替换 ${h.discarded} 张手牌`:`${chainName(h.chain)}：${moveFormula(h)} · 攻击 ${h.damage} · 回血 ${h.healing}`}</p>`).join(''):'<p>还没有航行记录。</p>'}</details></div>`;
  if(previousFocus){const target=[...document.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===previousFocus&&!el.disabled);target?.focus({preventScroll:true});}
  syncBattle();
  emitVisual('state',{match:run,phase:game.phase,board:[...game.board],charge:p.scoring?.damage||0,event:effect&&effect.actor!=null&&!effect.rest?{...effect,epoch:run,seq:effectSeq,blocked:effect.blockedDamage}:null});
}
function battleState(){
  const outcome=game.phase!=='over'?null:game.winner===0?'player':game.winner===1?'enemy':game.winner==='draw'?'draw':null;
  const event=effect&&effect.actor!=null&&!effect.rest?{epoch:run,seq:effectSeq,actor:effect.actor===1?1:0,damage:effect.damage||0,rawDamage:effect.rawDamage||effect.damage||0,healing:effect.healing||0,blocked:effect.blockedDamage||0,claimed:Array.isArray(effect.claimed)?effect.claimed:[],chain:Number.isInteger(effect.chain)?effect.chain:null}:null;
  return {match:run,level:game.level,hp:[...game.hp],phase:game.phase,initiative:game.first===0||game.first===1?game.first:null,shields:[...game.shields],reducedMotion:reduced(),outcome,event};
}
function syncBattle(){try{battleView.sync(battleState());}catch(error){console.warn('Battle view paused',error);}}

function chooseCard(id){
  if(!humanAction())throw new Error('请等待你的出牌回合');const c=game.hands[0].find(c=>c.id===id);if(!c)throw new Error('这张牌不在你的手中');
  if(!restMode)selection.calibrate=false;
  if(restMode){if(restCards.includes(id))restCards=restCards.filter(x=>x!==id);else if(restCards.length<2)restCards.push(id);else throw new Error('休整最多弃两张手牌');}
  else if(selection.ids[0]!==id&&game.hands[0].find(c=>c.id===selection.ids[0])?.type==='B'){selection.ids=[selection.ids[0],...(selection.ids[1]===id?[]:[id])];}
  else if(['A','W','J','D','B'].includes(c.type)){selection.ids=selection.ids.includes(id)?[]:[id];selection.ops=[1,1];}
  else if(selection.ids.some(x=>game.hands[0].find(c=>c.id===x)?.type==='A')){if(selection.ids.includes(id))selection.ids=selection.ids.filter(x=>x!==id);else if(selection.ids.length<3)selection.ids.push(id);else throw new Error('加速星最多搭配两张数字牌');}
  else selection.ids=selection.ids.includes(id)?[]:[id];
  render();if(c.type==='W'&&!restMode&&selection.ids.includes(id))focusRegion('wild-picker');
}
function commitMove(move){
  const visualCards=[...document.querySelectorAll('.hand .card.selected')].map(el=>{const r=el.getBoundingClientRect?.();return r?{left:r.left,top:r.top,width:r.width,height:r.height}:null;}).filter(Boolean);
  const before={goals:[...game.goals],challengeIds:[...game.challengeIds],challengeProgress:game.challengeProgress.map(copyChallengeProgress)};
  const actor=game.current;playAndClaim(game,move);recordEvent('play',{actor,move,after:publicSnapshot(game),settlement:game.lastAction,thinkingMs:Math.max(0,Date.now()-decisionStarted)});if(game.phase==='over')recordCompletion();audit(game);selection=blankSelection();effect={...game.lastAction,...before};effect.challengeProgress[effect.actor]=copyChallengeProgress(game.lastAction.repairProgress);effectSeq+=1;
  emitVisual('commit',{actor,cards:actor===0?visualCards:[]});
  effect.preparing=!reduced();
  render();announce(`${moveFormula(effect)}，造成 ${effect.damage} 伤害，回复 ${effect.healing} 生命。`);
  if(effect.preparing)later(()=>{if(effect){effect.preparing=false;render();}},COMBAT_TIMING.prepare*1000);
  later(()=>{if(game.phase==='over'&&!window.starChainBridge)terminalReady=true;effect=null;afterAction();if(humanPhase('refill'))focusRegion('supply-region');},combatHoldMs(effect,game.phase==='over',reduced()));
}
function doPlay(){if(!humanAction()||restMode)throw new Error('当前不能出牌');commitMove(currentMove());}
function doRest(){if(!humanAction()||!restMode)throw new Error('当前不能休整');const ids=[...restCards],goal=restGoal;rest(game,ids,goal);recordEvent('rest',{actor:0,ids,goal,after:publicSnapshot(game),thinkingMs:Math.max(0,Date.now()-decisionStarted)});restMode=false;restCards=[];restGoal=null;selection=blankSelection();afterAction();if(humanPhase('refill'))focusRegion('supply-region');}
function doTake(source){if(!humanPhase('refill'))throw new Error('结算结束后才能补牌');const c=takeCard(game,source);recordEvent('take',{actor:0,source,card:c,market:structuredClone(game.market)});announce(`补到${cardLabel(c)}。${game.current===0&&game.phase==='refill'?`还需 ${game.handSize-game.hands[0].length} 张。`:'你的回合结束。'}`);afterAction();}
function afterAction(){audit(game);if(game.phase==='action')decisionStarted=Date.now();if(game.phase==='over'){finishMatch();return;}render();scheduleBot();}
function scheduleBot(){
  if(blocked()||game.current!==1||game.phase==='over'||botScheduled)return;
  if(game.phase==='sector'||game.phase==='boon'){
    botScheduled=true;botMessage=game.phase==='sector'?`${opponentName()}正在选择星域…`:`${opponentName()}正在选择后段增益…`;render();
    later(()=>{botScheduled=false;if(game.current!==1||(game.phase!=='sector'&&game.phase!=='boon'))return;try{if(game.phase==='sector'){const id=chooseSector(game);selectSector(game,id);recordEvent('sector',{actor:1,id,after:publicSnapshot(game)});botMessage='';afterAction();}else{const kind=chooseBoon(game);selectBoon(game,kind);recordEvent('boon',{actor:1,kind,after:publicSnapshot(game)});botMessage='';afterAction();}}catch(error){recordError(error,'robot');console.error(error);botMessage='对手的航行遇到问题，请重新开局。';render();toast(botMessage);}},reduced()?0:400);
    return;
  }
  botScheduled=true;const phase=game.phase;botMessage=phase==='action'?`${opponentName()}正在思考…`:`${opponentName()}正在补牌…`;render();
  later(()=>{
    botScheduled=false;if(blocked()||game.current!==1||game.phase!==phase)return;
    try{
      if(phase==='refill'){const source=chooseBotSupply(observation(game,1)),card=takeCard(game,source);recordEvent('take',{actor:1,source,card,market:structuredClone(game.market)});botMessage='';afterAction();return;}
      const swap=chooseTransfer(observation(game,1));if(swap){transfer(game,swap.giveId,swap.marketIndex);recordEvent('transfer',{actor:1,...swap,after:publicSnapshot(game)});botMessage='';afterAction();return;}
      const choice=chooseBotMove(observation(game,1));
      if(choice)commitMove(choice.move);
      else{const ids=game.hands[1].slice(0,2).map(c=>c.id),goal=game.goals[0];rest(game,ids,goal);recordEvent('rest',{actor:1,ids,goal,after:publicSnapshot(game)});afterAction();}
    }catch(error){recordError(error,'robot');console.error(error);botMessage='对手的航行遇到问题，请重新开局。';render();toast(botMessage);}
  },phase==='action'?650:350);
}
function finishMatch(){
  botScheduled=false;botMessage='';
  recordCompletion();
  resultRequested=true;render();if(terminalReady||reduced())showResult();else if(!window.starChainBridge)later(()=>{terminalReady=true;if(resultRequested)showResult();},3200);announce(`对局结束，你 ${game.hp[0]} 生命，对手 ${game.hp[1]} 生命。${game.winner===0?'你赢了':game.winner==='draw'?'平局':'对手获胜'}。`);
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
  if(!terminalReady&&!reduced()){resultRequested=true;return;}
  const won=game.winner===0,draw=game.winner==='draw',next=won&&game.level<ROBOTS.length-1&&game.level===chosenLevel();
  openModal(`<div class="modal-content result"><div class="modal-head"><h2 id="modal-title">${won?'航行胜利！':draw?'势均力敌':'本局结束'}</h2><button class="btn quiet" data-action="close-modal">关闭</button></div><img class="result-ship" src="${won?PLAYER_SHIP.fallback:(FLEET[game.level]||FLEET[0]).fallback}" alt="" width="960" height="640"><p>${game.hp.includes(0)?'一方生命归零，立即结束对局。':'12 轮结束，按双方剩余生命结算。'}</p><div class="result-hp"><span><b>${game.hp[0]}</b>你的生命</span><span><b>${game.hp[1]}</b>对手生命</span></div><div class="result-stats"><p>你：累计造成 ${game.damageTotal[0]} 伤害 · 回复 ${game.healingTotal[0]} 生命</p><p>对手：累计造成 ${game.damageTotal[1]} 伤害 · 回复 ${game.healingTotal[1]} 生命</p></div><p>${game.level<chosenLevel()?`支援模式 · 实际 ${game.level+1}级。下一局预计 ${supportFor(chosenLevel()).effective+1}级。`:next?`${game.unlockAdded?'已解锁':'可以挑战'} ${ROBOTS[game.level+1].name}`:won?'所有对手全部解锁，可继续挑战不同对手。':draw?'本局平局，可以再来一局。':'观察对手的手牌，抢先拿下攻击与补给。'}</p><div class="result-recap"><p>你的最高一击实际扣除 ${recap(game).maxHit} 点生命。</p><p>完成维修 ${recap(game).repairs} 次 · 模块触发 ${recap(game).moduleUses} 次</p></div><div class="pin-modules" aria-label="钉住下一局模块"><h3>下一局想试的模块</h3><p>每局随机提供三项，关闭再打开不会重抽。钉住后仅保证下一局提供一次，用后需重新钉住。</p><div class="module-options">${pinOptions.map(moduleById).map(m=>`<button class="module-option ${progress.pinnedModule===m.id?'pinned':''}" data-action="pin-module" data-id="${m.id}" aria-pressed="${progress.pinnedModule===m.id}"><strong>${m.name}</strong><span>${m.text}</span><em>${progress.pinnedModule===m.id?'✓ 已钉住 · 下局必出':'钉住此模块'}</em></button>`).join('')}</div></div>${reviewHTML()}${settings().supportEnabled&&supportFor(chosenLevel()).pending?supportPromptHTML(chosenLevel()):`<div class="result-actions"><button class="btn ${next?'':'primary'}" data-action="retry">再来一局</button>${next?`<button class="btn primary" data-action="next">挑战${ROBOTS[game.level+1].name}</button>`:''}</div>`}</div>`);
}
function showRules(){
  openModal(`<div class="modal-content wide"><div class="modal-head"><h2 id="modal-title">星链算式 · 玩法</h2><button class="btn quiet" data-action="close-modal">关闭</button></div><ol class="rules-list"><li><strong>开局。</strong>第1–7级双方18血，第8级起双方24血、6 张手牌。先从三个模块中选一个；对手提前选定，双方选择后公开。只在开局各掷一颗六面骰，点大先手，同点重掷。骰子胜方再从亮出的三条星域里选一条，整局双方共用。12 轮分成前段和后段，第 4 轮结束后先手从三项里选一个后段增益，双方一起生效。之后轮流行动，双方手牌始终公开。后手获得 ${game.shieldAllowance} 点一次性护盾，优先抵消伤害，耗尽不恢复。护盾按实际等级固定为1–3点，开局会显示本局数值。</li><li><strong>出牌。</strong>选 1 张数字牌，对一条星链做加法或减法。普通出牌的每一步都在 0–20 之间，最终位置必须改变。加速可以先超过 20，但不能小于 0，最后一步必须回到 0–20。</li><li><strong>攻击。</strong>落点满足左侧公共目标，全部符合条件的目标都会触发，分别造成 1、2、3 点伤害。模块和星域满足条件时叠加，预览会把基础伤害、模块和星域分开显示。点击「确认出牌」自动结算，攻击力只用于本次出牌。区域和精准目标会标在三条星链的刻度上。</li><li><strong>校准。</strong>每局双方各有 1 次，必须自己按按钮，不会自动使用。按钮在橙星链下方、手牌上方。先选好牌、星链和加减。最终落点离当前任一攻击目标正好差 1 格，这一格仍在 0–20、不是出发点，而且结算更好时，按钮才会亮成「校准至某一格」。按下后落点挪到更好的一侧；再按一次，或改选牌、星链、加减，都会取消。确认出牌才消耗这次机会。普通数字牌、星云、加速和折跃都可以校准。</li><li><strong>修复。</strong>右侧是双方争抢的 3 个共享任务（第8级起为4个），进度分别记录。谁先完成谁回复 1 或 2 点生命，可以超过 18，上不封顶。完成几项就刷新几项，被替换任务的双方进度清零，其他任务保留进度。新任务从下一次出牌开始计数。</li><li><strong>补牌。</strong>确认后，伤害和回血一次性结算。随后从 3 张明牌中选择，或点「随机抽 1 张」，补满 6 张后自动轮到对手。第 12 轮和对局结束时无需补牌。</li><li><strong>获胜。</strong>对手生命归零即获胜，没有额外反击回合。若双方完成第 12 轮后都仍存活，剩余生命多者胜，相同则平局。</li></ol><details class="rules-detail" open><summary>功能牌与第8级进阶牌组</summary><p><strong>星云 W：</strong>选中后点选 1–9，作为所选数字使用。</p><p><strong>加速 A：</strong>搭配 2 张普通数字牌，按选择顺序连续运算，每一步分别设置加减。不能搭配星云。中间结果可以超过 20，不能小于 0，最终结果必须在 0–20，也不能回到起点。牌面会写出中间结果，例如 18 + 3 = 21，再 − 4 = 17。只按最终落点判断奖励。</p><p><strong>跃迁 J：</strong>单独使用，可选 20 − 当前值以及前后各一格。只显示0–20内且不等于起点的格子；例如4可以落到15、16、17，10可以落到9或11。不计加减法。</p><p><strong>第8级起 · 定轨 D：</strong>单独使用，在0、10、20中选择不同于起点的落点。</p><p><strong>第8级起 · 调拨 B：</strong>选择另一张手牌与一张明牌交换，消耗B后继续当前回合，换来的牌立即可用，也可搭配其他功能牌。交换不攻击、不回血、不重置连续进度；最终出牌后统一补满6张。</p><p>第1–7级：18血，攻击与维修各3项，44张牌（数字36、星云3、加速3、跃迁2）。第8级起：24血，双方项目各4项，增加定轨2张、调拨2张，共48张。支援只调整机器人强度，不改变所选等级的牌组与项目数。所有对局触发全部达成的攻击目标，仅结算出牌前已出现的项目。</p></details><details class="rules-detail" open><summary>模块与随机星域</summary><p>每人只装备一个模块，触发次数用完后本局不再提供加成。每局从下面六种里抽出三种供双方选择，可选相同模块。对手会优先锁定其中最近用得少的一种，所以六种会轮流出现；它不会在你选择后换装。点开牌桌上的模块名称可查看效果与剩余次数。</p><ul class="sector-rules">${MODULES.map(m=>`<li><strong>${m.name}</strong><span>${m.text} 每局最多 ${m.limit} 次。</span></li>`).join('')}</ul><p>开局亮出下面六种里的三种，骰子胜方选一种，整局固定，没有使用次数，对双方一视同仁。说明显示在蓝星链上方。加成都要求这次出牌已经触发公共攻击目标。和你的模块方向一致时，说明后面会写出来，不另加伤害。</p><ul class="sector-rules">${SECTORS.map(s=>`<li><strong>${s.name}</strong><span>${s.text}</span></li>`).join('')}</ul><p>命中护盾也算触发攻击；血量只扣除护盾抵消后的伤害。工程舱按维修出牌加一次回血，同时完成多项也不重复加成。加成不产生新的领奖事件。</p><p>连击炮要求自己的相邻两次出牌都在同色星链触发攻击；休整或未触发攻击会断开。巡航引擎只收集实际触发攻击的颜色，收齐三色后清空，休整保留已收集颜色。巡航星域同样要求相邻两次出牌都触发攻击，而且两次颜色不同；中间休整或没打中也会断开。</p></details><details class="rules-detail"><summary>休整、任务与自动结算</summary><p>休整可弃 0–2 张手牌，并替换 1 张攻击目标，再补满手牌。本回合不移动、不攻击、不回血；会中断连续攻击任务。</p><p>自动结算全部满足条件的攻击目标，不再限制两项。只结算出牌前已经出现的目标和补给，新刷出的项目不能由同一次出牌再次触发。</p><p>加速星的一次出牌可同时包含加法和减法，但“2 次出牌”仍只计一次。所有维修任务只累计它出现在桌面之后的动作。</p><p>已用牌自动回收，牌堆耗尽时重新洗牌。对手只能读取双方手牌及公开信息，无法预知抽牌和新目标。</p></details><p class="rules-note">按实际对战等级解锁下一位。支援邀请开启时，每连续输2局，弹窗询问是否下调1级。接受才降低，最低1级；拒绝则保持当前难度，再两连败才重新询问。连续赢2局恢复1级，最高回到所选等级。平局清空连胜连败，退出不计。名字后的「支援模式」表示本局实际难度较低。游玩记录持续保存，可在「记录与难度」导出；参数调整只影响新局。刷新开启新对局。</p><button class="btn primary wide" data-action="close-modal">回到牌桌</button></div>`);
}
function confirmRestart(level=chosenLevel()){
  if(!Number.isInteger(level)||level<0||level>progress.unlocked)throw new Error('请先解锁这位对手');
  if(game.phase==='over'||game.phase==='loadout'||(game.phase==='opening'&&diceStage==='idle')){newMatch(level);return;}
  openModal(`<div class="modal-content"><div class="modal-head"><h2 id="modal-title">${level===chosenLevel()?'重新开局？':`挑战${ROBOTS[level].name}？`}</h2><button class="btn quiet" data-action="close-modal">取消</button></div><p>本局生命、手牌与任务进度将重置，并随机生成星域、重新选择模块与投骰子。已解锁的对手会保留。</p><div class="result-actions"><button class="btn" data-action="close-modal">继续本局</button><button class="btn primary" data-action="confirm-new" data-level="${level}">重新开局</button></div></div>`);
}
function action(name,data={}){
  switch(name){
    case'module':if(arrivalPending)throw Error('请等待舰船进场');selectModule(game,data.id);recordEvent('module',{id:data.id,modules:[...game.modules]});audit(game);render();announce(`你选择了${moduleById(game.modules[0]).name}，对手选择了${moduleById(game.modules[1]).name}。现在投骰子，胜方再选星域。`);break;
    case'sector':if(game.phase!=='sector'||game.current!==0)throw new Error('现在不能选择星域');selectSector(game,data.id);recordEvent('sector',{actor:0,id:data.id,after:publicSnapshot(game)});audit(game);render();announce(`本局星域是${sectorById(game.sectorId).name}。`);scheduleBot();break;
    case'boon':if(game.phase!=='boon'||game.current!==0)throw new Error('现在不能选择后段增益');selectBoon(game,data.kind);recordEvent('boon',{actor:0,kind:data.kind,after:publicSnapshot(game)});audit(game);render();announce(boonNote()||'后段增益已生效。');scheduleBot();break;
    case'pin-module':if(game.phase!=='over')throw new Error('对局结束后才能钉住模块');if(!pinOptions.includes(data.id))throw new Error('只能钉住本局提供的三项模块');progress.pinnedModule=progress.pinnedModule===data.id?null:data.id;persist();showResult();break;
    case'roll':rollDice();break;
    case'card':chooseCard(data.id);break;
    case'chain':if(!humanAction()||restMode)throw new Error('请在出牌时选择星链');if(![0,1,2].includes(Number(data.index)))throw new Error('星链不存在');selection.chain=Number(data.index);selection.calibrate=false;selection.warpTo=null;selection.port=null;render();break;
    case'dock-to':if(!humanAction()||selection.chain==null||!selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='D')||![0,10,20].includes(Number(data.value))||Number(data.value)===game.board[selection.chain])throw Error('请选择有效定轨落点');selection.port=Number(data.value);selection.calibrate=false;render();break;
    case'barter-market':if(!humanAction()||!selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='B')||![0,1,2].includes(Number(data.index)))throw Error('请先选择调拨');selection.market=Number(data.index);render();break;
    case'transfer':if(!humanAction()||restMode||selection.ids.length!==2||selection.market===null)throw Error('先选择调拨、交换手牌和明牌');{const actor=game.current,giveId=selection.ids[1],marketIndex=selection.market;transfer(game,giveId,marketIndex);recordEvent('transfer',{actor,giveId,marketIndex,after:publicSnapshot(game)});selection=blankSelection();audit(game);render();announce('交换完成，现在可以立即出牌。');}break;
    case'warp-to':if(!humanAction()||restMode||!selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J')||selection.chain==null)throw new Error('当前不能选择折跃落点');if(!warpLandings(game.board[selection.chain]).includes(Number(data.value)))throw new Error('请选择合法跃迁落点');selection.warpTo=Number(data.value);selection.calibrate=false;render();break;
    case'op':if(!humanAction()||restMode||selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='J'))throw new Error('当前不能修改运算');if(![0,1].includes(Number(data.step))||![1,-1].includes(Number(data.value)))throw new Error('运算无效');selection.ops[Number(data.step)]=Number(data.value);selection.calibrate=false;render();break;
    case'wild':if(!humanAction()||restMode||!selection.ids.some(id=>game.hands[0].find(c=>c.id===id)?.type==='W'))throw new Error('请先选择星云牌');if(!Number.isInteger(Number(data.value))||Number(data.value)<1||Number(data.value)>9)throw new Error('星云数值须为 1–9');selection.wild=Number(data.value);selection.calibrate=false;render();break;
    case'calibrate':if(!humanAction()||restMode)throw new Error('当前不能校准');selection.calibrate=!selection.calibrate;render();break;
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
    case'import-records':void importRecords();break;
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
    case'sound':audio.setEnabled(!audio.enabled);if(audio.enabled)void audio.unlock();render();break;
    default:throw new Error('未知操作');
  }
  if(name==='play'||name==='confirm-rest'||name==='roll')void audio.play('confirm');
  else if(['card','chain','op','wild','warp-to','dock-to','barter-market','transfer','goal','module','sector','boon','calibrate','rest','cancel-rest'].includes(name))void audio.play('select');
}
if(!window.starChainBridge)document.addEventListener('click',event=>{void audio.unlock();const button=event.target.closest('[data-action]');if(!button||button.disabled)return;try{action(button.dataset.action,button.dataset);}catch(error){recordError(error,button.dataset.action);toast(error.message);}});
$('modal').addEventListener('click',event=>{if(event.target===$('modal')){const r=$('modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
function publicGame(){const p=preview();return{rules_version:game.rulesVersion,arrival_pending:arrivalPending,initial_hp:flight?.options.hp||18,phase:game.phase,current_player:game.current===null?null:game.current===0?'human':'robot',sector:game.sectorId?sectorById(game.sectorId):null,sector_options:(game.sectorOptions||[]).map(sectorById),boon:game.boon?structuredClone(game.boon):null,pinned_module:progress.pinnedModule||null,module_options:game.moduleOptions.map(moduleById),modules:game.phase==='loadout'?[null,null]:[...game.modules],module_progress:game.moduleProgress.map(copyModuleProgress),round:game.round,turn_in_round:game.turnInRound,turns:[...game.turns],first:game.first,final_round:isFinalRound(game),board:[...game.board],hp:[...game.hp],shields:[...game.shields],damage_total:[...game.damageTotal],healing_total:[...game.healingTotal],hand:game.hands[0],robot_hand:game.hands[1],market:game.market,goals:game.goals.map(goalById),selection,rest_mode:restMode,challenge_ids:[...game.challengeIds],challenge_progress:game.challengeProgress,repairs:game.challengeProgress.map(pr=>challengeViews(game.challengeIds,pr)),automatic_goal_claims:p.scoring?.chosen||[],automatic_repair_rewards:p.scoring?.awarded||[],automatic_damage:p.scoring?.damage||0,automatic_healing:p.scoring?.healing||0,automatic_bonuses:p.scoring?{module_damage:p.scoring.moduleDamage,module_healing:p.scoring.moduleHealing,sector_damage:p.scoring.sectorDamage,base_damage:p.scoring.baseDamage}:null,calibrates:[...game.calibrates],calibrate_offer:p.calibrate?{after:p.calibrate.after,delta:p.calibrate.delta}:null,animation:!!effect,initiative:{stage:diceStage,rolls:game.dice,shieldAllowance:game.shieldAllowance},opponent:opponentName(),bot_profile:{...game.aiProfile},opponent_level:game.level+1,selected_opponent_level:chosenLevel()+1,support_mode:game.level<chosenLevel(),record_id:flight?.id,support_offer:settings().supportEnabled?supportFor(chosenLevel()).pending:null,post_match_review:game.phase==='over'?flight?.result?.review:null,opponent_count:ROBOTS.length,unlocked_opponents:progress.unlocked+1,status:statusText(),winner:game.winner};}
window.starChainRecords=Object.freeze({schema:records.schema,list:records.list,get:records.get,export:records.exportAll,getConfiguration:()=>records.refresh(),setConfiguration:patch=>records.settings(patch)});
window.addEventListener('online',()=>void records.flush());
function registerAgentTools(){
  if(!document.modelContext?.registerTool)return;const lifecycle=new AbortController(),output=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
  const actions=['accept-support','decline-support','module','roll','sector','boon','card','chain','op','wild','warp-to','dock-to','barter-market','transfer','calibrate','play','goal','rest','cancel-rest','confirm-rest','supply','draw','pin-module','retry'];
  const tools=[{name:'get_star_chain_game',title:'查看星链算式牌桌',description:'Read both public hands, HP and the three shared repair contracts. Future draw order stays private.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>output(publicGame())},{name:'play_star_chain_action',title:'操作星链算式',description:'module with id selects one of the three offered modules before initiative; the opponent has precommitted and cannot counterpick. One random sector applies equally to both players for the whole match. roll decides first player only at match opening. Select card, chain (0–2), op (step0–1,value1/-1), wild (value1–9). calibrate toggles the one match charge when calibrate_offer is present; it shifts the chosen landing by one cell onto a better attack goal. play confirms once, deals damage and heals atomically. Wait for animation before supply (market index0–2) or draw (random card), refilling to6. J chooses 20-x or either neighbor within0..20, excluding the starting cell. D selects dock-to value0/10/20. B selects another hand card and barter-market index, then transfer continues the same turn. All matched targets score. Levels8+ have24HP and four objectives on each side. Shared repair contracts refresh only when claimed. HP0 ends immediately; otherwise after12 rounds compare HP. rest/goal/confirm-rest prepare a rest action. retry resets the match and initiative. When support_offer is present, accept-support or decline-support with the selected level (0-based) records an explicit choice and starts the next match. No decline changes difficulty.',inputSchema:{type:'object',properties:{action:{type:'string',enum:actions},id:{type:'string'},level:{type:'integer',minimum:0,maximum:LEVEL_COUNT-1},index:{type:'integer',minimum:0,maximum:2},step:{type:'integer',minimum:0,maximum:1},value:{type:'integer',minimum:-1,maximum:20}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{try{if(!input||!actions.includes(input.action))throw new Error('操作不支持');action(input.action,input);return output({ok:true,state:publicGame()});}catch(error){recordError(error,input?.action||'agent');return output({ok:false,error:error.message});}}}];
  tools.push({name:'get_star_chain_records',title:'读取星链游玩记录',description:'Read authenticated saved match records or the versioned difficulty configuration. Active records hide the seed; completed records support deterministic replay.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['list','get','configuration','schema']},id:{type:'string'},limit:{type:'integer',minimum:1,maximum:100},before:{type:'integer'},beforeId:{type:'string'}},required:['operation'],additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{try{return output(await (input.operation==='get'?records.get(input.id):input.operation==='configuration'?records.refresh():input.operation==='schema'?records.schema():records.list({limit:input.limit||20,before:input.before,beforeId:input.beforeId})));}catch(e){return output({error:e.message});}}});
  tools.push({name:'configure_star_chain',title:'调整星链后续对局',description:'Save versioned all-level parameters or support settings for future matches only. Read configuration first, then provide its expectedRevision. Game rules, card counts, HP, and an active match cannot be changed through this tool.',inputSchema:{type:'object',properties:{expectedRevision:{type:'integer'},supportEnabled:{type:'boolean'},resetSupportForLevel:{type:'integer',minimum:0,maximum:LEVEL_COUNT-1},restoreDefaults:{type:'boolean'},profiles:{type:'array',minItems:LEVEL_COUNT,maxItems:LEVEL_COUNT,items:{type:'object'}},reason:{type:'string'}},required:['expectedRevision'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{try{return output(await records.settings(input));}catch(e){return output({error:e.message});}}});
  try{for(const t of tools)void Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(error=>console.warn('Optional browser controls unavailable',error));window.addEventListener('pagehide',()=>{cancelTimers();battleView.destroy();audio.dispose();lifecycle.abort();},{once:true});}catch(error){console.warn('Optional browser controls unavailable',error);}
}
window.addEventListener('pagehide',()=>{battleView.destroy();audio.dispose();});
window.starChainBridge?.ready(action,()=>{cancelTimers();battleView.destroy();audio.dispose();});
await records.init(legacyImportBase||progress);newMatch(0);registerAgentTools();
if(globalThis.location?.search?.includes("records=1"))showRecords();
else if(new URLSearchParams(globalThis.location?.search||'').get('help')==='1')showRules();
