/** Pure mapping from a settled action to presentation cues. Does not evaluate game rules. */
export function combatCue(action={}){
  const bounded=(n,max)=>Math.max(0,Math.min(max,Number(n)||0));
  const rawDamage=bounded(action.rawDamage??action.damage,99),damage=bounded(action.damage,99),healing=bounded(action.healing,99),blocked=bounded(action.blockedDamage,99);
  const hits=Array.isArray(action.claimed)?action.claimed.length:Array.isArray(action.claims)?action.claims.length:1;
  return Object.freeze({actor:action.actor===1?1:0,rawDamage,damage,healing,blocked,
    shots:rawDamage?Math.max(1,Math.min(3,hits)):0,
    power:Math.min(3,1+rawDamage*.18),heavy:rawDamage>=4,
    healPulses:healing?Math.min(4,Math.ceil(healing)):0,
    healPower:Math.min(2.2,1+healing*.22),
    // Up to three pulses fit the existing 1100 ms settling window.
    shotSpacing:160,healingSpacing:140,duration:1050});
}
