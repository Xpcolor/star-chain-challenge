// Public, finite rule catalog. Bonuses never create further reward events.
export const MODULES = [
  {id:'focus',name:'连击炮',text:'连续两次在同色星链触发攻击，后一次伤害 +1。',limit:3,effect:'伤害 +1'},
  {id:'circuit',name:'巡航引擎',text:'蓝、紫、橙各触发一次攻击，完成时伤害 +2，再重新收集。',limit:2,effect:'伤害 +2'},
  {id:'precision',name:'精准镜',text:'触发精准目标时，伤害 +1。',limit:3,effect:'伤害 +1'},
  {id:'edge',name:'边界炮',text:'落在 0–3 或 17–20 并触发攻击时，伤害 +1。',limit:3,effect:'伤害 +1'},
  {id:'engineer',name:'工程舱',text:'完成维修任务时，额外回血 +1。一次出牌只加一次。',limit:3,effect:'回血 +1'},
  {id:'reverse',name:'逆向炮',text:'出牌使用减法并触发攻击时，伤害 +1。',limit:2,effect:'伤害 +1'}
];
export const SECTORS = [
  ...['蓝','紫','橙'].map((name,chain)=>({id:`tide-${chain}`,name:`${name}潮星域`,text:`在${name}链触发攻击时，伤害 +1。`,chain})),
  {id:'roving',name:'巡航星域',text:'连续两次在不同颜色触发攻击，后一次伤害 +1。'},
  {id:'repair',name:'维修星域',text:'同次出牌既触发攻击又完成维修，伤害 +1。'},
  {id:'long',name:'跃迁星域',text:'净移动至少 7 格并触发攻击时，伤害 +1。'}
];
export const moduleById=id=>MODULES.find(m=>m.id===id);
export const sectorById=id=>SECTORS.find(s=>s.id===id);
export const freshModuleProgress=()=>({uses:0,lastAttackChain:null,circuit:[]});
export const copyModuleProgress=p=>({...freshModuleProgress(),...p,circuit:[...(p?.circuit||[])]});
export function previewTactics(moduleId,sectorId,progress,event){
  const next=copyModuleProgress(progress),module=moduleById(moduleId),sector=sectorById(sectorId);
  let moduleDamage=0,moduleHealing=0,sectorDamage=0;
  const attack=!event.rest&&event.claimed?.length>0,previous=next.lastAttackChain;
  if(event.rest){next.lastAttackChain=null;return{next,moduleDamage,moduleHealing,sectorDamage};}
  if(module&&next.uses<module.limit){
    if(module.id==='engineer'&&event.healing>0)moduleHealing=1;
    if(attack){
      if(module.id==='focus'&&previous===event.chain)moduleDamage=1;
      if(module.id==='circuit'){
        next.circuit=[...new Set([...next.circuit,event.chain])];
        if(next.circuit.length===3){moduleDamage=2;next.circuit=[];}
      }
      if(module.id==='precision'&&event.claimed.some(id=>id[0]==='P'))moduleDamage=1;
      if(module.id==='edge'&&(event.after<=3||event.after>=17))moduleDamage=1;
      if(module.id==='reverse'&&event.ops.includes(-1))moduleDamage=1;
    }
    if(moduleDamage||moduleHealing)next.uses++;
  }
  if(attack&&sector){
    if(sector.chain===event.chain)sectorDamage=1;
    if(sector.id==='roving'&&previous!==null&&previous!==event.chain)sectorDamage=1;
    if(sector.id==='repair'&&event.healing>0)sectorDamage=1;
    if(sector.id==='long'&&Math.abs(event.after-event.before)>=7)sectorDamage=1;
  }
  next.lastAttackChain=attack?event.chain:null;
  return{next,moduleDamage,moduleHealing,sectorDamage};
}
