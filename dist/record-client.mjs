import {replayRecord,closeRecord,publicRecord} from './records.mjs?v=flight-records-2';

// IndexedDB is only an outbox for unacknowledged writes. The authenticated API
// remains the record source of truth; successful uploads leave the outbox.
function pendingStore(){
  let dbPromise;
  async function db(){
    if(!globalThis.indexedDB)throw Error('暂存不可用');
    return dbPromise??=new Promise((resolve,reject)=>{const q=indexedDB.open('star-chain-pending',1);q.onupgradeneeded=()=>q.result.createObjectStore('flights',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  }
  async function run(mode,fn){const d=await db();if(!d)return null;return new Promise((resolve,reject)=>{const t=d.transaction('flights',mode),q=fn(t.objectStore('flights'));t.oncomplete=()=>resolve(q.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
  return {all:async()=>await run('readonly',s=>s.getAll())||[],put:r=>run('readwrite',s=>s.put(r)),remove:id=>run('readwrite',s=>s.delete(id))};
}
export function createRecordClient({fetcher=(...args)=>fetch(...args),store=pendingStore(),onStatus=()=>{},onProfile=()=>{}}={}){
  const pending=new Map(),bindings=new Map();let running=false,profile=null,error='',localError=false,owner=null;
  const status=()=>({pending:pending.size,saving:running,error,localError,connected:!!profile,owner,quarantined:[...pending.values()].filter(r=>!r._owner||r._owner!==owner).length});
  const notify=()=>onStatus(status());
  async function request(path,method='GET',value){
    const response=await fetcher(path,{method,credentials:'same-origin',redirect:'error',...(globalThis.AbortSignal?.timeout?{signal:AbortSignal.timeout(10000)}:{}),headers:value===undefined?{}:{'content-type':'application/json','x-star-chain-owner':owner||''},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'记录暂时无法同步');return data;
  }
  async function session(){const next=await request('/api/session');if(typeof next.owner!=='string'||!next.owner)throw Error('请先登录后同步记录');if(owner&&owner!==next.owner){profile=null;throw Error('登录账号已变化，请刷新页面；原账号队列不会传给新账号');}owner=next.owner;return owner;}
  async function refresh(){await session();profile=await request('/api/profile');onProfile(profile);return profile;}
  async function flush(){
    if(running)return;running=true;notify();let failed=false;
    try{
      await session();
      while([...pending.values()].some(r=>r._owner===owner)){
        const [id,r]=[...pending.entries()].find(([,r])=>r._owner===owner),sequence=r.sequence;
        await session();const clean=structuredClone(r);delete clean._owner;
        await request(`/api/${r.kind==='support-choice'?'support-decisions':'records'}/${id}`,'PUT',clean);
        if(pending.get(id)?.sequence===sequence){await store.remove(id);if(pending.get(id)?.sequence===sequence)pending.delete(id);else if(pending.has(id))await store.put(pending.get(id));}
      }
      await refresh();error=pending.size?'有其他账号或未登录时的记录留在本机，可导出备份':'';
    }catch(e){error=e.message;failed=true;}
    finally{running=false;notify();if([...pending.values()].some(r=>r._owner===owner)&&!failed)queueMicrotask(flush);}
  }
  async function enqueue(record){
    const copy=structuredClone(record);if(!bindings.has(copy.id))bindings.set(copy.id,owner);copy._owner=bindings.get(copy.id);pending.set(copy.id,copy);
    try{await store.put(copy);}catch{localError=true;}
    notify();void flush();
  }
  async function init(legacy){
    try{
      for(const r of (await store.all()).sort((a,b)=>(a.kind==='support-choice'?a.at:a.startedAt)-(b.kind==='support-choice'?b.at:b.startedAt))){
        if(r.status==='active')try{closeRecord(r,replayRecord(r),'page-reload');await store.put(r);}catch{}
        pending.set(r.id,r);bindings.set(r.id,r._owner||null);
      }
    }catch{localError=true;}
    try{
      await session();profile=await request('/api/profile/import','POST',{progress:null});onProfile(profile);error='';
      if(pending.size)await flush();
    }catch(e){error=e.message;}
    notify();return profile;
  }
  async function list(options={}){const q=new URLSearchParams();for(const key of ['limit','before','beforeId'])if(options[key]!==undefined)q.set(key,String(options[key]));return request(`/api/records?${q}`);}
  async function get(id){if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw Error('记录编号无效');return request(`/api/records/${id}`);}
  async function settings(patch){await session();if(!profile)await refresh();profile=await request('/api/settings','PATCH',{expectedRevision:profile.revision,...patch});onProfile(profile);return profile;}
  async function importBackup(data){
    if(data?.schemaVersion!==1||!Array.isArray(data.records)||data.records.length>10000)throw Error('请选择本游戏导出的记录文件（最多一万局）');
    await session();let imported=0,skipped=0;const errors=[];
    for(const record of data.records){
      try{if(record.status==='active'){skipped++;continue;}replayRecord(record);await session();const result=await request('/api/import','POST',{record});result.accepted?imported++:skipped++;}
      catch(e){errors.push({id:record.id,error:e.message});}
    }
    for(const d of data.supportDecisions||[]){try{await session();await request('/api/import','POST',{...d,kind:'support-choice',accept:!!d.accept});}catch(e){errors.push({id:d.id,error:e.message});}}
    await refresh();return {imported,skipped,errors};
  }
  async function exportAll(){
    const records=[];let next={limit:100},cloudError=null;
    try{while(next){const page=await list(next);for(const row of page.items)records.push(await get(row.id));next=page.next?{...page.next,limit:100}:null;}}catch(e){cloudError=e.message;}
    const decisions=new Map((profile?.supportDecisions||[]).map(d=>[d.id,d]));
    const byId=new Map(records.map(r=>[r.id,r]));for(const [id,r] of pending){if(r._owner!==owner)continue;if(r.kind==='support-choice'){decisions.set(id,structuredClone(r));continue;}if(!byId.has(id)||byId.get(id).sequence<r.sequence)byId.set(id,publicRecord(r));}
    const quarantined=[...pending.values()].filter(r=>r._owner!==owner||!r._owner).map(r=>structuredClone(r));
    return {schemaVersion:1,exportedAt:new Date().toISOString(),cloudComplete:cloudError===null,cloudError,profile,supportDecisions:[...decisions.values()],records:[...byId.values()],quarantined};
  }
  return {init,enqueue,flush,refresh,list,get,settings,exportAll,importBackup,status,pendingRecords:()=>[...pending.values()].filter(r=>r.kind!=='support-choice').map(publicRecord),schema:()=>request('/api/schema')};
}
