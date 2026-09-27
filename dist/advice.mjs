import {createGame,selectModule,rollInitiative,selectSector,selectBoon,playAndClaim,transfer,rest,takeCard,observation,legalMoves,evaluateMove,chainName} from './engine.mjs?v=flight-records-2';
import {moduleById} from './tactics.mjs?v=flight-records-2';

// Advice uses only the public position at the recorded decision. It does not
// inspect future deck order or claim that a non-lethal alternative would win.
export function buildAdvice(record){
 const s=createGame({...record.options,rulesVersion:record.rulesVersion,...(record.rulesVersion==='flight-records-1'?{initiativeShield:3}:{})});let candidate=null;
 for(let index=0;index<record.events.length;index++){
  const e=record.events[index];
  if(e.type==='play'&&s.current===0){
   const obs=observation(s,0),chosen=evaluateMove(obs,e.move),value=m=>Math.min(obs.hp[1],m.damage)+m.healing;
   const alternatives=legalMoves(obs).filter(m=>JSON.stringify(m.move)!==JSON.stringify(e.move));
   alternatives.sort((a,b)=>Number(b.lethal)-Number(a.lethal)||value(b)-value(a)||a.move.ids.length-b.move.ids.length);
   const best=alternatives[0],gain=best?value(best)-value(chosen):0;
   if(best&&!chosen.lethal&&((best.lethal&&!chosen.lethal)||gain>=2)){
    const priority=Number(best.lethal&&!chosen.lethal)*100+gain-.1*best.move.ids.length;
    if(!candidate||priority>candidate.priority)candidate={priority,index,round:s.round,move:structuredClone(best.move),board:[...s.board],expression:best.info.expression,damage:Math.min(obs.hp[1],best.damage),healing:best.healing,blocked:best.blockedDamage,lethal:best.lethal&&!chosen.lethal,goals:[...best.chosen],repairs:[...best.awarded],chosenDamage:Math.min(obs.hp[1],chosen.damage),chosenHealing:chosen.healing};
   }
  }
  switch(e.type){
   case'module':selectModule(s,e.id);break;
   case'dice':rollInitiative(s);break;
   case'sector':selectSector(s,e.id);break;
   case'boon':selectBoon(s,e.kind);break;
   case'transfer':transfer(s,e.giveId,e.marketIndex);break;
      case'play':playAndClaim(s,e.move);break;
   case'rest':rest(s,e.ids,e.goal);break;
   case'take':takeCard(s,e.source);break;
  }
 }
 const own=s.history.filter(h=>h.actor===0&&!h.rest),enemy=s.history.filter(h=>h.actor===1&&!h.rest);
 const repairs=own.reduce((n,h)=>n+h.challengeAwards.length,0),enemyRepairs=enemy.reduce((n,h)=>n+h.challengeAwards.length,0),module=moduleById(s.modules[0]);
 if(candidate){
  const {priority,...proof}=candidate;
  return {kind:candidate.lethal?'finish':'alternative',evidence:`第${candidate.round}轮，${chainName(candidate.move.chain)[0]}链 ${candidate.expression} 这手可扣除对手${candidate.damage}点生命，并回复${candidate.healing}点。`,suggestion:candidate.lethal?'下局先看确认按钮是否提示“击败对手”，有机会时可以直接结束战斗。':'下局确认前，试着比较另一个落点的攻击和回血；这是一种当时合法的选择，不代表整局一定会赢。',proof};
 }
 if(enemyRepairs>repairs)return {kind:'repair',evidence:`本局你完成${repairs}次维修，对手完成${enemyRepairs}次。`,suggestion:'下局先看看双方的维修进度，优先寻找能同时攻击并完成维修的一手。',proof:{repairs,enemyRepairs}};
 if(module&&s.moduleProgress[0].uses<module.limit)return {kind:'module',evidence:`本局${module.name}触发${s.moduleProgress[0].uses}/${module.limit}次。`,suggestion:`下局若再次选择${module.name}，可以围绕它的条件出牌：${module.text}`,proof:{moduleId:module.id,uses:s.moduleProgress[0].uses,limit:module.limit}};
 const maxHit=Math.max(0,...own.map(h=>h.actualDamage));
 return {kind:'supply',evidence:`本局你最高一击扣除对手${maxHit}点生命，完成${repairs}次维修。`,suggestion:'下局补牌时，先看看哪张明牌能帮助你触发当前目标，再看看对手是否也急需它。',proof:{maxHit,repairs}};
}
