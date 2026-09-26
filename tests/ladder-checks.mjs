import {evaluateMove,chainName} from '../dist/engine.mjs';

export function previewCard(obs,move){
  const result=evaluateMove(obs,move);
  const hpLoss=Math.min(obs.hp[1-obs.actor],result.damage);
  return {chain:move.chain,from:result.info.before,to:result.info.after,warp:!!result.info.warp,
    attack:result.rawDamage,blocked:result.blockedDamage,hpLoss,healing:result.healing,
    goalIds:[...result.chosen],repairIds:[...result.awarded],ops:result.info.steps.map(x=>x.op),
    text:`${chainName(move.chain)[0]}链 ${result.info.before} → ${result.info.after} · 攻击 ${result.rawDamage}（抵挡 ${result.blockedDamage}，生命 −${hpLoss}） · 维修 +${result.healing}`};
}

export function recap(s,actor=0){
  if(s.phase!=='over')throw Error('Recap requires completed match');
  const own=s.history.filter(x=>x.actor===actor&&!x.rest),enemy=s.history.filter(x=>x.actor!==actor&&!x.rest);
  const summary={maxHit:Math.max(0,...own.map(x=>x.actualDamage)),healing:own.reduce((a,x)=>a+x.healing,0),repairs:own.reduce((a,x)=>a+x.challengeAwards.length,0),
    enemyRepairs:enemy.reduce((a,x)=>a+x.challengeAwards.length,0),moduleUses:s.moduleProgress[actor].uses};
  const lines=[summary.maxHit?`你的最高一击实际扣除对手 ${summary.maxHit} 点生命。`:`你本局未扣除对手生命。`,
    summary.repairs?`你完成 ${summary.repairs} 次维修，累计恢复 ${summary.healing} 点生命。`:`对手完成 ${summary.enemyRepairs} 次维修。`];
  return {summary,lines};
}
