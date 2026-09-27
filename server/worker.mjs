import {rulesForLevel} from '../dist/engine.mjs';
import {buildAdvice} from '../dist/advice.mjs';
import {BOT_PROFILES,CONFIG_ID,RULES_VERSION,LEVEL_COUNT,compatibleRules,validateProfiles,deriveProgress} from '../dist/difficulty.mjs';
import {normalizeProgress} from '../dist/progress.mjs';
import {replayRecord,outcome,publicRecord} from '../dist/records.mjs';
import {authenticatedOwner} from './auth.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const defaults=()=>({base:normalizeProgress(null),imported:false,supportVersion:2,supportEnabled:true,supportEpochs:Array(LEVEL_COUNT).fill(0),config:{id:CONFIG_ID,profiles:structuredClone(BOT_PROFILES)}});
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
const level=n=>Number.isInteger(n)&&n>=0&&n<LEVEL_COUNT;
const stmt=(env,sql,args=[])=>env.DB.prepare(sql).bind(...args);
async function player(env,owner){
  await stmt(env,'INSERT INTO players(owner,revision,state,updated_at) VALUES(?,0,?,?) ON CONFLICT(owner) DO NOTHING',[owner,JSON.stringify(defaults()),Date.now()]).run();
  const row=await stmt(env,'SELECT revision,state FROM players WHERE owner=?',[owner]).first();let settings=JSON.parse(row.state);
  if(settings.supportVersion!==2){
    const migrated={...defaults(),base:normalizeProgress(settings.base),imported:settings.imported,supportEnabled:settings.supportEnabled!==false,previousConfig:settings.config,supportEpochs:Array(LEVEL_COUNT).fill(row.revision+1)};
    await stmt(env,'UPDATE players SET state=?,revision=revision+1,updated_at=? WHERE owner=? AND revision=?',[JSON.stringify(migrated),Date.now(),owner,row.revision]).run();return player(env,owner);
  }
  return {revision:row.revision,settings};
}
async function profile(env,owner,p=null){
  p??=await player(env,owner);
  const {results}=await stmt(env,"SELECT id,status,actual_level AS actualLevel,selected_level AS selectedLevel,outcome,json_extract(record,'$.meta.supportEpoch') AS epoch,json_extract(record,'$.meta.supportEnabled') AS supportEnabled,json_extract(record,'$.rulesVersion') AS rulesVersion,completed_at AS completedAt FROM flights WHERE owner=? AND status='complete' ORDER BY completed_at,id",[owner]).all();
  const {results:decisions}=await stmt(env,'SELECT id,offer_id AS offerId,selected_level AS selectedLevel,epoch,accept,at FROM support_choices WHERE owner=? ORDER BY at,id',[owner]).all();
  return {...p,supportDecisions:decisions,progress:deriveProgress(p.settings.base,p.settings,results,decisions)};
}
async function updatePlayer(env,owner,p,next){
  const r=await stmt(env,'UPDATE players SET state=?,revision=revision+1,updated_at=? WHERE owner=? AND revision=?',[JSON.stringify(next),Date.now(),owner,p.revision]).run();
  if(r.meta.changes!==1)fail('设置已在另一个窗口更新，请重新读取后再试',409);
  return profile(env,owner);
}
function validateRecord(r){
  if(!r||r.schemaVersion!==1||!compatibleRules(r.rulesVersion)||typeof r.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(r.id))fail('记录格式不正确');
  if(!['active','complete','abandoned'].includes(r.status)||!Array.isArray(r.events)||r.events.length>256||r.sequence!==r.events.length+Number(r.status!=='active'))fail('行动序号不正确');
  if(!r.meta||!level(r.meta.selectedLevel)||!level(r.meta.actualLevel)||r.meta.actualLevel>r.meta.selectedLevel||r.options?.level!==r.meta.actualLevel)fail('难度记录不正确');
  if(r.rulesVersion==='flight-records-1'&&(r.meta.selectedLevel>8||r.meta.actualLevel>8))fail('旧版等级不正确');
  if(typeof r.meta.supportEnabled!=='boolean'||!Number.isSafeInteger(r.meta.supportEpoch)||r.meta.supportEpoch<0)fail('支援状态不正确');
  if(!Number.isSafeInteger(r.startedAt)||!Number.isSafeInteger(r.updatedAt)||r.startedAt<0||r.updatedAt<r.startedAt||r.updatedAt>Date.now()+86400000)fail('时间记录不正确');
  if(r.status!=='active'&&r.completedAt!==r.updatedAt)fail('结束时间不正确');
  if(!Number.isInteger(r.options.seed)||r.options.seed<0||r.options.seed>4294967295||r.options.first!==undefined||r.options.modules!==undefined)fail('开局记录不正确');
  if(r.options.handSize!==undefined||r.options.wildCount!==undefined||r.options.accelCount!==undefined||r.options.warpCount!==undefined||r.options.initiativeShield!==undefined)fail('本版使用固定牌库和护盾规则');
  if(r.rulesVersion==='flight-records-3'){const expected=rulesForLevel(r.meta.selectedLevel),defaults=rulesForLevel(r.options.level);for(const [key,value] of Object.entries(expected))if((r.options[key]??defaults[key])!==value)fail('等级与血量、项目或牌组规则不匹配');}
  let last=r.startedAt;
  for(let i=0;i<r.events.length;i++){const e=r.events[i];if(e.n!==i+1||!Number.isSafeInteger(e.at)||e.at<last||e.at>r.updatedAt)fail('行动时间或序号不正确');last=e.at;}
  let g;try{g=replayRecord(r);}catch(e){fail(e.message);}
  if(r.status==='complete')r.result={...outcome(g),review:buildAdvice(r)};
  else r.result=null;
  return r;
}
async function body(request){
  if(Number(request.headers.get('content-length')||0)>524288)fail('记录过大',413);
  const reader=request.body?.getReader();let size=0;const chunks=[];
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();fail('记录过大',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(bytes);
  try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))fail('JSON格式不正确');return value;}catch{fail('JSON格式不正确');}
}
export async function api(request,env,owner=null){
  const url=new URL(request.url);
  if(!owner)return json({error:'请先登录后读取或保存游玩记录'},401);
  if(url.pathname==='/api/session'&&request.method==='GET')return json({owner});
  if(env.ENVIRONMENT&& !['GET','HEAD'].includes(request.method)&&request.headers.get('x-star-chain-owner')!==owner)return json({error:'登录账号已变化，请刷新页面；原账号记录保留在本机'},409);
  if(!env.DB)return json({error:'记录暂时无法保存，请稍后重试'},503);
  if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)))return json({error:'请求来源不匹配'},403);
  try{
    if(url.pathname==='/api/import'&&request.method==='POST'){
      const input=await body(request);
      if(input.kind==='support-choice'){
        const d=input;
        if(!/^[a-zA-Z0-9-]{8,80}$/.test(d.id||'')||!/^[a-zA-Z0-9-]{8,80}$/.test(d.offerId||'')||!level(d.selectedLevel)||!Number.isSafeInteger(d.epoch)||d.epoch<0||typeof d.accept!=='boolean'||!Number.isSafeInteger(d.at)||d.at>Date.now()+86400000)fail('历史支援选择格式无效');
        const offer=await stmt(env,"SELECT record,completed_at FROM flights WHERE owner=? AND id=? AND status='complete' AND outcome='loss'",[owner,d.offerId]).first();
        if(!offer)fail('请先导入支援选择对应的已结束对局');
        const r=JSON.parse(offer.record);if(r.meta.selectedLevel!==d.selectedLevel||r.meta.supportEpoch!==d.epoch||d.at<offer.completed_at)fail('支援选择与原对局不一致');
        const result=await stmt(env,'INSERT INTO support_choices(owner,id,offer_id,selected_level,epoch,accept,at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',[owner,d.id,d.offerId,d.selectedLevel,d.epoch,Number(d.accept),d.at]).run();
        return json({ok:true,accepted:result.meta.changes===1});
      }
      const r=validateRecord(input.record);if(r.status==='active')fail('未结束且缺少完整种子的记录不能迁移');
      delete r._owner;
      const result=await stmt(env,'INSERT INTO flights(owner,id,status,started_at,updated_at,completed_at,sequence,selected_level,actual_level,outcome,record) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING',[owner,r.id,r.status,r.startedAt,r.updatedAt,r.completedAt,r.sequence,r.meta.selectedLevel,r.meta.actualLevel,r.result?.outcome||null,JSON.stringify(r)]).run();
      return json({ok:true,accepted:result.meta.changes===1});
    }
    if(url.pathname==='/api/profile'&&request.method==='GET')return json(await profile(env,owner));
    if(url.pathname==='/api/profile/import'&&request.method==='POST'){
      const p=await player(env,owner),input=await body(request);
      if(p.settings.imported)return json(await profile(env,owner,p));
      return json(await updatePlayer(env,owner,p,{...p.settings,base:normalizeProgress(input.progress),imported:true}));
    }
    if(url.pathname==='/api/settings'&&request.method==='PATCH'){
      const input=await body(request),p=await player(env,owner);
      if(input.expectedRevision!==p.revision)fail('设置版本已变化，请重新读取',409);
      const next=structuredClone(p.settings);
      if(input.supportEnabled!==undefined){if(typeof input.supportEnabled!=='boolean')fail('支援开关无效');next.supportEnabled=input.supportEnabled;if(next.supportEnabled!==p.settings.supportEnabled)next.supportEpochs.fill(p.revision+1);}
      if(input.resetSupportForLevel!==undefined){if(!level(input.resetSupportForLevel))fail('等级无效');next.supportEpochs[input.resetSupportForLevel]=p.revision+1;}
      if(input.profiles!==undefined){next.config={id:crypto.randomUUID(),profiles:(()=>{try{return validateProfiles(input.profiles);}catch(e){fail(e.message);}})(),reason:String(input.reason||'参数试调').slice(0,200)};}
      if(input.restoreDefaults===true)next.config={id:CONFIG_ID,profiles:structuredClone(BOT_PROFILES)};
      if(input.profiles!==undefined||input.restoreDefaults===true)next.supportEpochs.fill(p.revision+1);
      return json(await updatePlayer(env,owner,p,next));
    }
    const choiceMatch=url.pathname.match(/^\/api\/support-decisions\/([a-zA-Z0-9-]{8,80})$/);
    if(choiceMatch&&request.method==='PUT'){
      const d=await body(request);
      if(d.kind!=='support-choice'||d.id!==choiceMatch[1]||!level(d.selectedLevel)||(!Number.isSafeInteger(d.epoch)||d.epoch<0)||typeof d.accept!=='boolean'||typeof d.offerId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(d.offerId)||!Number.isSafeInteger(d.at)||d.at<0||d.at>Date.now()+86400000)fail('支援选择无效');
      const existing=await stmt(env,'SELECT id FROM support_choices WHERE owner=? AND (id=? OR offer_id=?)',[owner,d.id,d.offerId]).first();
      if(existing)return json({ok:true,accepted:false,reason:'already-decided'});
      const p=await profile(env,owner),pending=p.progress.support[d.selectedLevel].pending;
      if(!p.settings.supportEnabled||d.epoch!==p.settings.supportEpochs[d.selectedLevel]||pending?.id!==d.offerId)return json({ok:true,accepted:false,reason:'offer-expired'});
      const ended=await stmt(env,'SELECT completed_at FROM flights WHERE owner=? AND id=?',[owner,d.offerId]).first();
      const at=Math.max(d.at,ended.completed_at);
      const saved=await stmt(env,`INSERT INTO support_choices(owner,id,offer_id,selected_level,epoch,accept,at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM support_choices WHERE owner=? AND (id=? OR offer_id=?))`,[owner,d.id,d.offerId,d.selectedLevel,d.epoch,Number(d.accept),at,owner,d.id,d.offerId]).run();
      return json({ok:true,accepted:saved.meta.changes===1});
    }
    if(url.pathname==='/api/records'&&request.method==='GET'){
      const limit=Math.min(100,Math.max(1,Math.trunc(Number(url.searchParams.get('limit')))||30));
      const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER,beforeId=url.searchParams.get('beforeId')||'~';
      const {results}=await stmt(env,'SELECT id,status,started_at AS startedAt,completed_at AS completedAt,selected_level AS selectedLevel,actual_level AS actualLevel,outcome FROM flights WHERE owner=? AND (started_at<? OR (started_at=? AND id<?)) ORDER BY started_at DESC,id DESC LIMIT ?',[owner,before,before,beforeId,limit+1]).all();
      const items=results.slice(0,limit),last=items.at(-1);
      return json({schemaVersion:1,items,next:results.length>limit?{before:last.startedAt,beforeId:last.id}:null});
    }
    const match=url.pathname.match(/^\/api\/records\/([a-zA-Z0-9-]{8,80})$/);
    if(match&&request.method==='GET'){
      const row=await stmt(env,'SELECT record FROM flights WHERE owner=? AND id=?',[owner,match[1]]).first();
      if(!row)fail('记录不存在',404);return json(publicRecord(JSON.parse(row.record)));
    }
    if(match&&request.method==='PUT'){
      const r=validateRecord(await body(request));if(r.id!==match[1])fail('记录编号不匹配');
      delete r._owner;
      r.receivedRelease={version:env.RELEASE_VERSION||'local',commit:env.GIT_COMMIT||'local',environment:env.ENVIRONMENT||'development',pr:env.PR_NUMBER||null};
      const result=await stmt(env,`INSERT INTO flights(owner,id,status,started_at,updated_at,completed_at,sequence,selected_level,actual_level,outcome,record) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,completed_at=excluded.completed_at,sequence=excluded.sequence,outcome=excluded.outcome,record=excluded.record WHERE excluded.sequence>flights.sequence AND flights.status='active' AND excluded.started_at=flights.started_at AND excluded.selected_level=flights.selected_level AND excluded.actual_level=flights.actual_level`,[owner,r.id,r.status,r.startedAt,r.updatedAt,r.completedAt,r.sequence,r.meta.selectedLevel,r.meta.actualLevel,r.result?.outcome||null,JSON.stringify(r)]).run();
      return json({ok:true,accepted:result.meta.changes===1});
    }
    if(url.pathname==='/api/schema'&&request.method==='GET')return json({schemaVersion:1,rulesVersion:RULES_VERSION,records:'/api/records',profile:'/api/profile',settings:'/api/settings',supportDecisions:'/api/support-decisions/:id',notes:['Only the authenticated user can access these records.','Closed records include seed/actions for replay; active records hide seeds.','Settings require expectedRevision and only apply to new matches.']});
    return json({error:'接口不存在'},404);
  }catch(error){if(!error.status&&!(error instanceof SyntaxError))console.error('records-api',url.pathname,error.message);return json({error:error.status?error.message:'记录校验或保存失败，请稍后重试'},error.status||503);}
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/version')return json({version:env.RELEASE_VERSION||'1.0.0',commit:env.GIT_COMMIT||'unknown',environment:env.ENVIRONMENT||'unconfigured',pr:env.PR_NUMBER||null});
  if(url.pathname==='/login')return env.ACCESS_ISSUER&&env.ACCESS_AUD?Response.redirect(`${url.origin}/?records=1`,302):new Response('记录登录服务尚待站点维护者完成配置。游戏可以继续游玩，未同步记录请从「记录与难度」导出备份。',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
  if(url.pathname.startsWith('/api/'))return api(request,env,await authenticatedOwner(request,env));
  return env.ASSETS.fetch(request);
}};
