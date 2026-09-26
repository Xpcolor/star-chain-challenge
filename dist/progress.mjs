import {LEVEL_COUNT,OLD_LEVEL_MAP} from './difficulty.mjs?v=flight-records-2';
import {challengeById} from './challenges.mjs?v=flight-records-2';

const bounded=(value,max)=>Number.isFinite(Number(value))?Math.min(max,Math.max(0,Math.trunc(Number(value)))):0;
export function normalizeProgress(raw){
  const next={version:6,unlocked:0,matches:0,lastChallenges:[]};
  if(!raw)return next;
  const oldToNew=[0,1,2,5,7,8].map(i=>OLD_LEVEL_MAP[i]);
  if([3,4,5,6].includes(raw.version)){
    next.unlocked=raw.version===6?bounded(raw.unlocked,LEVEL_COUNT-1):raw.version===5?OLD_LEVEL_MAP[bounded(raw.unlocked,8)]:oldToNew[bounded(raw.unlocked,5)];
    if(Array.isArray(raw.lastChallenges))next.lastChallenges=[...new Set(raw.lastChallenges.filter(challengeById))].slice(0,3);
  }else if(Array.isArray(raw.medals)&&((raw.version===1&&raw.medals.length===3)||(raw.version===2&&raw.medals.length===6))){
    const positions=raw.version===1?[0,2,4]:[0,1,2,3,4,5];let unlocked=positions[bounded(raw.unlocked,positions.length-1)];
    raw.medals.forEach((m,i)=>{if(Number.isInteger(m)&&(m&1))unlocked=Math.max(unlocked,Math.min(5,positions[i]+1));});
    next.unlocked=oldToNew[unlocked];
  }else return next;
  next.matches=bounded(raw.matches,Number.MAX_SAFE_INTEGER);
  // Offline cache only. Authenticated completed records rebuild this on sync.
  if(raw.version===6&&Array.isArray(raw.support)&&raw.support.length===LEVEL_COUNT){
    next.support=raw.support.map((s,i)=>({selected:i,effective:bounded(s?.effective??i,i),wins:bounded(s?.wins,1),losses:bounded(s?.losses,1),pending:s?.pending&&typeof s.pending.id==='string'&&s.pending.from===s.effective&&s.pending.to===s.effective-1&&s.pending.to>=0?{id:s.pending.id,from:s.pending.from,to:s.pending.to}:null}));
  }
  return next;
}
