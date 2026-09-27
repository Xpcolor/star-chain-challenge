// Shared repair contracts. Each player has progress for each live contract only.
export const CHALLENGES = [
  {id:'both-ops',name:'进退自如',text:'分别用过加法和减法',metric:'ops',target:2,healing:1},
  {id:'minus-two',name:'逆向航行',text:'2 次出牌使用减法',metric:'minus',target:2,healing:1},
  {id:'small-two',name:'微光穿梭',text:'2 次净移动 1–3 格',metric:'small',target:2,healing:1},
  {id:'even-two',name:'双数航线',text:'2 次落在偶数位置',metric:'even',target:2,healing:1},
  {id:'long-jump',name:'远距跃迁',text:'一次净移动至少 7 格',metric:'long',target:1,healing:1},
  {id:'edge',name:'边界探险',text:'落在 0–3 或 17–20',metric:'edge',target:1,healing:1},
  {id:'meet',name:'双星相会',text:'落点与另一条星链相同',metric:'meet',target:1,healing:1},
  {id:'all-chains',name:'双线巡航',text:'在 2 条不同星链上出牌',metric:'chains',target:2,healing:2},
  {id:'goal-kinds',name:'多面能手',text:'触发 2 类不同攻击目标',metric:'goalKinds',target:2,healing:2},
  {id:'double-goal',name:'一举两得',text:'一次触发至少 2 项攻击目标',metric:'double',target:1,healing:2},
  {id:'streak',name:'连续出击',text:'自己连续 2 回合触发攻击',metric:'streak',target:2,healing:2},
  {id:'goal-chains',name:'双线呼应',text:'在 2 条不同星链上触发攻击',metric:'goalChains',target:2,healing:2}
];
export const challengeById=id=>CHALLENGES.find(c=>c.id===id);
const fresh=()=>({chains:[],ops:[],goalKinds:[],goalChains:[],minus:0,small:0,even:0,long:0,edge:0,meet:0,double:0,streak:0,done:false});
const copy=p=>({...p,chains:[...p.chains],ops:[...p.ops],goalKinds:[...p.goalKinds],goalChains:[...p.goalChains]});
export const freshChallengeProgress=(ids=[])=>Object.fromEntries(ids.map(id=>[id,fresh()]));
export const copyChallengeProgress=(p={})=>Object.fromEntries(Object.entries(p).map(([id,value])=>[id,copy(value)]));
export function drawChallenges(random,previous=[],slots=null){
  const sample=healing=>{
    const pool=CHALLENGES.filter(c=>c.healing===healing).map(c=>c.id);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    return pool;
  };
  if(!slots){
    const easy=sample(1),hard=sample(2),ids=[...easy.slice(0,2),hard[0]];
    if(ids.every(id=>previous.includes(id)))ids[2]=hard.find(id=>!previous.includes(id));
    return ids;
  }
  const ids=[];
  for(const healing of slots){
    const pool=CHALLENGES.filter(c=>c.healing===healing&&!ids.includes(c.id));
    const fresh=pool.filter(c=>!previous.includes(c.id)),choices=fresh.length?fresh:pool;
    const bag=[...choices];
    for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
    ids.push(bag[0].id);
  }
  return ids;
}
const value=(c,p)=>Array.isArray(p[c.metric])?p[c.metric].length:p[c.metric];
export function challengeViews(ids,p={}){return ids.map(id=>{const c=challengeById(id),progress=p[id]||fresh();return{...c,done:progress.done,progress:Math.min(c.target,value(c,progress))};});}
export function previewChallenges(ids,progress={},event){
  const next=copyChallengeProgress(progress),awarded=[];
  for(const id of ids){
    const p=next[id]||=fresh();
    if(event.rest){p.streak=0;continue;}
    if(p.done)continue;
    const add=(key,values)=>{p[key]=[...new Set([...p[key],...values])];};
    const distance=Math.abs(event.after-event.before),claimed=event.claimed||[];
    add('chains',[event.chain]);add('ops',event.ops);
    p.minus+=Number(event.ops.includes(-1));p.small+=Number(distance>=1&&distance<=3);
    p.even+=Number(event.after%2===0);p.long+=Number(distance>=7);p.edge+=Number(event.after<=3||event.after>=17);
    p.meet+=Number(event.board.some((n,i)=>i!==event.chain&&n===event.after));
    if(claimed.length){add('goalKinds',claimed.map(id=>id[0]));add('goalChains',[event.chain]);}
    p.double+=Number(claimed.length>=2);p.streak=claimed.length?p.streak+1:0;
    if(value(challengeById(id),p)>=challengeById(id).target){p.done=true;awarded.push(id);}
  }
  return{next,awarded,healing:awarded.reduce((n,id)=>n+challengeById(id).healing,0)};
}
// Replace only claimed slots. Every new contract starts at zero for BOTH players.
export function replaceChallenges(ids,progress,awarded,random,recent=[]){
  const nextIds=[...ids],nextProgress=progress.map(copyChallengeProgress);
  for(const old of awarded){
    const index=nextIds.indexOf(old);if(index<0)throw new Error('补给任务已失效');
    const pool=CHALLENGES.filter(c=>c.healing===challengeById(old).healing&&!ids.includes(c.id)&&!nextIds.includes(c.id));
    const freshPool=pool.filter(c=>!recent.includes(c.id)),choices=freshPool.length?freshPool:pool;
    const chosen=choices[Math.floor(random()*choices.length)].id;nextIds[index]=chosen;
    for(const p of nextProgress){delete p[old];p[chosen]=fresh();}
  }
  return{ids:nextIds,progress:nextProgress};
}
