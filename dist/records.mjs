import {buildAdvice} from './advice.mjs?v=flight-records-2';
import {RULES_VERSION,compatibleRules} from './difficulty.mjs?v=flight-records-2';
import {createGame,selectModule,rollInitiative,playAndClaim,takeCard,rest,audit} from './engine.mjs?v=flight-records-2';
import {RELEASE} from './version.mjs';

export const RECORD_SCHEMA=1;
export function publicSnapshot(s){return structuredClone({phase:s.phase,current:s.current,round:s.round,turnInRound:s.turnInRound,board:s.board,hp:s.hp,shields:s.shields,hands:s.hands,market:s.market,goals:s.goals,challengeIds:s.challengeIds,challengeProgress:s.challengeProgress,modules:s.phase==='loadout'?[null,null]:s.modules,moduleProgress:s.moduleProgress,sectorId:s.sectorId,moduleOptions:s.moduleOptions});}
export function recap(s,actor=0){
  const own=s.history.filter(h=>h.actor===actor&&!h.rest),other=s.history.filter(h=>h.actor!==actor&&!h.rest);
  return {maxHit:Math.max(0,...own.map(h=>h.actualDamage)),healing:s.healingTotal[actor],repairs:own.reduce((n,h)=>n+h.challengeAwards.length,0),enemyRepairs:other.reduce((n,h)=>n+h.challengeAwards.length,0),moduleUses:s.moduleProgress[actor].uses};
}
export function outcome(s){return {outcome:s.winner==='draw'?'draw':s.winner===0?'win':'loss',hp:[...s.hp],rounds:s.round,damage:[...s.damageTotal],healing:[...s.healingTotal],recaps:[recap(s,0),recap(s,1)]};}
export function makeRecord(options,meta,now=Date.now(),id=crypto.randomUUID()){
  return {schemaVersion:RECORD_SCHEMA,rulesVersion:RULES_VERSION,release:{...RELEASE},id,sequence:0,status:'active',startedAt:now,updatedAt:now,completedAt:null,options:structuredClone(options),meta:structuredClone(meta),events:[],result:null};
}
export function appendEvent(record,type,data={},now=Date.now()){
  if(record.status!=='active')throw Error('本局记录已经结束');
  record.events.push({n:record.events.length+1,at:Math.max(now,record.updatedAt),type,...structuredClone(data)});
  record.sequence++;record.updatedAt=Math.max(now,record.updatedAt);return record;
}
export function closeRecord(record,state,reason='restart',now=Date.now()){
  if(record.status!=='active')return record;
  record.status=state.phase==='over'?'complete':'abandoned';record.result=state.phase==='over'?{...outcome(state),review:buildAdvice(record)}:null;
  record.endReason=state.phase==='over'?(state.hp.includes(0)?'knockout':'round-limit'):reason;
  record.sequence++;record.updatedAt=Math.max(now,record.updatedAt);record.completedAt=record.updatedAt;return record;
}
// Reconstruct rules from the seed and actual actions. Robot search randomness is
// irrelevant to replay because the selected actions and supply choices are kept.
export function replayRecord(record){
  if(record.schemaVersion!==1||!compatibleRules(record.rulesVersion))throw Error('记录规则版本不匹配');
  const g=createGame({...record.options,...(record.rulesVersion==='flight-records-1'?{initiativeShield:3}:{})});
  if(record.initial&&JSON.stringify(publicSnapshot(g))!==JSON.stringify(record.initial))throw Error('开局快照不一致');
  for(const event of record.events){
    if(event.type==='error')continue;
    if(event.actor!==undefined&&g.current!==event.actor)throw Error('行动方不匹配');
    switch(event.type){
      case'module':selectModule(g,event.id);break;
      case'dice':{const roll=rollInitiative(g);if(JSON.stringify(roll.pair)!==JSON.stringify(event.pair))throw Error('骰子记录不一致');break;}
      case'play':playAndClaim(g,event.move);break;
      case'rest':rest(g,event.ids,event.goal);break;
      case'take':{const c=takeCard(g,event.source);if(c.id!==event.card.id)throw Error('补牌记录不一致');break;}
      default:throw Error('记录中有未知行动');
    }
    audit(g);
    if(event.after&&(JSON.stringify(g.hp)!==JSON.stringify(event.after.hp)||JSON.stringify(g.board)!==JSON.stringify(event.after.board)))throw Error('结算记录不一致');
    if(event.after?.hands&&JSON.stringify(publicSnapshot(g))!==JSON.stringify(event.after))throw Error('牌桌快照不一致');
    if(event.settlement&&JSON.stringify(g.lastAction)!==JSON.stringify(event.settlement))throw Error('详细结算不一致');
    if(event.market&&JSON.stringify(g.market)!==JSON.stringify(event.market))throw Error('补牌区记录不一致');
    if(event.modules&&JSON.stringify(g.modules)!==JSON.stringify(event.modules))throw Error('模块记录不一致');
  }
  if(record.status==='complete'&&g.phase!=='over')throw Error('对局还未结束');
  return g;
}
export function publicRecord(record){
  const copy=structuredClone(record);
  if(copy.status==='active'){delete copy.options.seed;delete copy.options.previousChallenges;copy.replayAvailable=false;}
  else copy.replayAvailable=true;
  return copy;
}
