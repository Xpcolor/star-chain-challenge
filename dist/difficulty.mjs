export const RULES_VERSION="flight-records-2";
export const CONFIG_ID="gradient-16-20260926";
export const BOT_PROFILES=[{"temperature":1.9,"attention":5,"allowWild":false,"allowAccel":false,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":3.8,"denial":0,"wildRate":0,"accelRate":0},{"temperature":1.6749999999999998,"attention":6,"allowWild":true,"allowAccel":false,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":3.3,"denial":0,"wildRate":0.5,"accelRate":0},{"temperature":1.45,"attention":7,"allowWild":true,"allowAccel":false,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":2.8,"denial":0,"wildRate":1,"accelRate":0},{"temperature":1.315,"attention":8,"allowWild":true,"allowAccel":true,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":2.3,"denial":0,"wildRate":1,"accelRate":0.5},{"temperature":1.18,"attention":8,"allowWild":true,"allowAccel":true,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":1.8,"denial":0,"wildRate":1,"accelRate":1},{"temperature":1.1400000000000001,"attention":9,"allowWild":true,"allowAccel":true,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":1.675,"denial":0,"wildRate":1,"accelRate":1},{"temperature":1.1,"attention":10,"allowWild":true,"allowAccel":true,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":1.55,"denial":0,"wildRate":1,"accelRate":1},{"temperature":1.05,"attention":11,"allowWild":true,"allowAccel":true,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":1.425,"denial":0,"wildRate":1,"accelRate":1},{"temperature":1,"attention":12,"allowWild":true,"allowAccel":true,"defence":0,"beam":0,"samples":0,"follow":0,"supplyTemperature":1.3,"denial":0,"wildRate":1,"accelRate":1},{"temperature":0.975,"attention":13,"allowWild":true,"allowAccel":true,"defence":0.0125,"beam":13,"samples":2,"follow":0,"supplyTemperature":1.2375,"denial":0,"wildRate":1,"accelRate":1},{"temperature":0.95,"attention":14,"allowWild":true,"allowAccel":true,"defence":0.025,"beam":14,"samples":2,"follow":0,"supplyTemperature":1.175,"denial":0,"wildRate":1,"accelRate":1},{"temperature":0.9,"attention":15,"allowWild":true,"allowAccel":true,"defence":0.05,"beam":15,"samples":2,"follow":0,"supplyTemperature":1.05,"denial":0,"wildRate":1,"accelRate":1},{"temperature":0.78,"attention":18,"allowWild":true,"allowAccel":true,"defence":0.1,"beam":18,"samples":2,"follow":0,"supplyTemperature":0.8,"denial":0,"wildRate":1,"accelRate":1},{"temperature":0.74,"attention":20,"allowWild":true,"allowAccel":true,"defence":0.135,"beam":20,"samples":2,"follow":0,"supplyTemperature":0.7,"denial":0.05,"wildRate":1,"accelRate":1},{"temperature":0.7,"attention":22,"allowWild":true,"allowAccel":true,"defence":0.17,"beam":22,"samples":2,"follow":0,"supplyTemperature":0.6,"denial":0.1,"wildRate":1,"accelRate":1},{"temperature":0.54,"attention":28,"allowWild":true,"allowAccel":true,"defence":0.25,"beam":28,"samples":2,"follow":0,"supplyTemperature":0.45,"denial":0.1,"wildRate":1,"accelRate":1}];

export const LEVEL_COUNT=BOT_PROFILES.length;
export const OLD_LEVEL_MAP=[0,2,4,6,8,11,12,14,15];
export const compatibleRules=version=>['flight-records-1',RULES_VERSION].includes(version);
export const mapRecordLevel=(level,version)=>version==='flight-records-1'?(OLD_LEVEL_MAP[level]??0):level;

export function validateProfile(raw){
  if(!raw||typeof raw!=='object')throw Error('机器人参数无效');
  const bounds={temperature:[.1,3],attention:[4,40],defence:[0,.35],beam:[0,40],samples:[0,2],follow:[0,0],supplyTemperature:[.3,4],denial:[0,.12]};
  const out={};
  for(const [key,[min,max]] of Object.entries(bounds)){
    const value=raw[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(['attention','beam','samples'].includes(key)&&!Number.isInteger(value)))throw Error(`机器人参数 ${key} 超出范围`);out[key]=value;
  }
  for(const key of ['allowWild','allowAccel']){if(typeof raw[key]!=='boolean')throw Error(`机器人参数 ${key} 无效`);out[key]=raw[key];}
  if(out.defence>0&&(out.samples<1||out.beam<out.attention))throw Error('预判须覆盖已注意到的走法，避免强度突然跳跃');
  for(const key of ['wildRate','accelRate']){const value=raw[key]??Number(raw[key==='wildRate'?'allowWild':'allowAccel']);if(typeof value!=='number'||value<0||value>1||!Number.isFinite(value))throw Error('功能牌参数错误');out[key]=value;}return out;
}
export function validateProfiles(raw){if(!Array.isArray(raw)||raw.length!==LEVEL_COUNT)throw Error('需要完整的全部等级参数');return raw.map(validateProfile);}
export const freshSupport=selected=>({selected,effective:selected,wins:0,losses:0,pending:null});
export function settleSupport(previous,outcome,matchId){
 const s=structuredClone(previous);
 if(s.pending)return s;
 if(outcome==='draw'){s.wins=s.losses=0;return s;}
 if(outcome==='loss'){s.losses++;s.wins=0;if(s.losses===2){s.losses=0;if(s.effective>0)s.pending={id:matchId,from:s.effective,to:s.effective-1};}}
 if(outcome==='win'){s.wins++;s.losses=0;if(s.wins===2){s.effective=Math.min(s.selected,s.effective+1);s.wins=0;}}
 return s;
}
export function decideSupport(previous,{offerId,accept}){
 const s=structuredClone(previous);
 if(s.pending?.id!==offerId||typeof accept!=='boolean')return s;
 if(accept)s.effective=s.pending.to;
 s.pending=null;s.wins=s.losses=0;return s;
}

export function deriveProgress(base,settings,flights,decisions=[]){
 const support=Array.from({length:LEVEL_COUNT},(_,i)=>freshSupport(i));let unlocked=base.unlocked,matches=base.matches;
 const seen=new Set(),events=[];
 for(const f of flights){
  if(f.status!=='complete'||seen.has(f.id))continue;seen.add(f.id);matches++;
  const actual=mapRecordLevel(f.actualLevel,f.rulesVersion);
  if(f.outcome==='win')unlocked=Math.max(unlocked,Math.min(LEVEL_COUNT-1,actual+1));
  if(f.rulesVersion!==RULES_VERSION||!settings.supportEnabled||!f.supportEnabled||f.epoch!==(settings.supportEpochs[f.selectedLevel]||0))continue;
  events.push({kind:'finish',at:f.completedAt||0,id:f.id,data:f});
 }
 for(const d of decisions)if(settings.supportEnabled&&d.epoch===(settings.supportEpochs[d.selectedLevel]||0))events.push({kind:'choice',at:d.at,id:d.id,data:d});
 events.sort((a,b)=>a.at-b.at||(a.kind==='finish'?-1:1)-(b.kind==='finish'?-1:1)||a.id.localeCompare(b.id));
 for(const event of events){const f=event.data,current=support[f.selectedLevel];if(!current)continue;
  if(event.kind==='choice')support[f.selectedLevel]=decideSupport(current,{offerId:f.offerId,accept:!!f.accept});
  else if(f.actualLevel===current.effective)support[f.selectedLevel]=settleSupport(current,f.outcome,f.id);
 }
 return {...base,unlocked,matches,support};
}
