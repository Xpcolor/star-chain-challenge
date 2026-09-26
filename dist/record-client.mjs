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
  const pending=new Map();let running=false,profile=null,error='',localError=false;
  const status=()=>({pending:pending.size,saving:running,error,localError,connected:!!profile});
  const notify=()=>onStatus(status());
  async function request(path,method='GET',value){
    const response=await fetcher(path,{method,credentials:'same-origin',...(globalThis.AbortSignal?.timeout?{signal:AbortSignal.timeout(10000)}:{}),headers:value===undefined?{}:{'content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'记录暂时无法同步');return data;
  }
  async function refresh(){profile=await request('/api/profile');onProfile(profile);return profile;}
  async function flush(){
    if(running)return;running=true;notify();let failed=false;
    try{
      while(pending.size){
        const [id,r]=pending.entries().next().value,sequence=r.sequence;
        await request(`/api/${r.kind==='support-choice'?'support-decisions':'records'}/${id}`,'PUT',r);
        if(pending.get(id)?.sequence===sequence){await store.remove(id);if(pending.get(id)?.sequence===sequence)pending.delete(id);else if(pending.has(id))await store.put(pending.get(id));}
      }
      await refresh();error='';
    }catch(e){error=e.message;failed=true;}
    finally{running=false;notify();if(pending.size&&!failed)queueMicrotask(flush);}
  }
  async function enqueue(record){
    const copy=structuredClone(record);pending.set(copy.id,copy);
    try{await store.put(copy);}catch{localError=true;}
    notify();void flush();
  }
  async function init(legacy){
    try{
      for(const r of (await store.all()).sort((a,b)=>(a.kind==='support-choice'?a.at:a.startedAt)-(b.kind==='support-choice'?b.at:b.startedAt))){
        if(r.status==='active')try{closeRecord(r,replayRecord(r),'page-reload');await store.put(r);}catch{}
        pending.set(r.id,r);
      }
    }catch{localError=true;}
    try{
      profile=await request('/api/profile/import','POST',{progress:legacy});onProfile(profile);error='';
      if(pending.size)await flush();
    }catch(e){error=e.message;}
    notify();return profile;
  }
  async function list(options={}){const q=new URLSearchParams();for(const key of ['limit','before','beforeId'])if(options[key]!==undefined)q.set(key,String(options[key]));return request(`/api/records?${q}`);}
  async function get(id){if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw Error('记录编号无效');return request(`/api/records/${id}`);}
  async function settings(patch){if(!profile)await refresh();profile=await request('/api/settings','PATCH',{expectedRevision:profile.revision,...patch});onProfile(profile);return profile;}
  async function exportAll(){
    const records=[];let next={limit:100},cloudError=null;
    try{while(next){const page=await list(next);for(const row of page.items)records.push(await get(row.id));next=page.next?{...page.next,limit:100}:null;}}catch(e){cloudError=e.message;}
    const decisions=new Map((profile?.supportDecisions||[]).map(d=>[d.id,d]));
    const byId=new Map(records.map(r=>[r.id,r]));for(const [id,r] of pending){if(r.kind==='support-choice'){decisions.set(id,structuredClone(r));continue;}if(!byId.has(id)||byId.get(id).sequence<r.sequence)byId.set(id,publicRecord(r));}
    return {schemaVersion:1,exportedAt:new Date().toISOString(),cloudComplete:cloudError===null,cloudError,profile,supportDecisions:[...decisions.values()],records:[...byId.values()]};
  }
  return {init,enqueue,flush,refresh,list,get,settings,exportAll,status,pendingRecords:()=>[...pending.values()].filter(r=>r.kind!=='support-choice').map(publicRecord),schema:()=>request('/api/schema')};
}
