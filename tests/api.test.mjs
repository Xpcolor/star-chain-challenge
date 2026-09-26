import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const {api}=await import(process.env.STAR_CHAIN_TEST_BUILD?'../dist/server/index.js':'../server/worker.mjs');
import {BOT_PROFILES,LEVEL_COUNT} from '../dist/difficulty.mjs';
import {fixture} from './record-fixture.mjs';

function setup(){
  const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const env={DB:{prepare(sql){return {bind(...args){const s=db.prepare(sql);return {run:async()=>({meta:{changes:Number(s.run(...args).changes)}}),first:async()=>s.get(...args)||null,all:async()=>({results:s.all(...args)})};}};}}};
  const call=async(path,{method='GET',body,owner='alice',headers={}}={})=>{
    const response=await api(new Request(`https://game.example${path}`,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:response.status,data:await response.json()};
  };
  return {db,env,call};
}
test('authenticated records are owner scoped, seed hidden during play, duplicates/out-of-order writes are idempotent',async()=>{
  const {db,call}=setup(),{record,active}=fixture();
  assert.equal((await call('/api/profile',{owner:null})).status,401);
  assert.equal((await call('/api/profile/import',{method:'POST',body:{progress:null},headers:{origin:'https://other.example'}})).status,403);
  assert.equal((await call(`/api/records/${record.id}`,{method:'PUT',body:active})).data.accepted,true);
  assert.equal((await call(`/api/records/${record.id}`)).data.options.seed,undefined);
  assert.equal((await call(`/api/records/${record.id}`,{owner:'bob'})).status,404);
  assert.deepEqual((await call('/api/records',{owner:'bob'})).data.items,[]);
  assert.equal((await call(`/api/records/${record.id}`,{method:'PUT',body:record})).data.accepted,true);
  for(const r of [record,active])assert.equal((await call(`/api/records/${record.id}`,{method:'PUT',body:r})).data.accepted,false);
  assert.equal((await call(`/api/records/${record.id}`)).data.options.seed,48);
  assert.equal((await call('/api/profile')).data.progress.matches,1);
  const bad=structuredClone(record);bad.id=crypto.randomUUID();bad.events.find(e=>e.after).after.hp[0]++;
  assert.equal((await call(`/api/records/${bad.id}`,{method:'PUT',body:bad})).status,400);
  db.close();
});
test('real replays lower cumulative assistance past two levels, settings reset future support without mutating history',async()=>{
  const {db,call}=setup();let profile=(await call('/api/profile/import',{method:'POST',body:{progress:{version:4,unlocked:5,matches:6}}})).data;
  assert.equal(profile.progress.unlocked,LEVEL_COUNT-1);assert.equal(profile.progress.matches,6);
  let now=Date.now()-10000;
  for(let i=0;i<8;i++){
    const actual=LEVEL_COUNT-1-Math.floor(i/2),{record}=fixture({actual,now:now+i*100});
    assert.equal((await call(`/api/records/${record.id}`,{method:'PUT',body:record})).status,200);
    profile=(await call('/api/profile')).data;assert.equal(profile.progress.support[LEVEL_COUNT-1].effective,LEVEL_COUNT-1-Math.floor(i/2));
    if(i%2===1){const pending=profile.progress.support[LEVEL_COUNT-1].pending;assert.ok(pending);const choice={kind:'support-choice',id:crypto.randomUUID(),selectedLevel:LEVEL_COUNT-1,epoch:0,offerId:pending.id,accept:true,at:now+i*100+99};assert.equal((await call('/api/support-decisions/'+choice.id,{method:'PUT',body:choice})).data.accepted,true);}
  }
  assert.equal(profile.progress.matches,14);
  const reset=await call('/api/settings',{method:'PATCH',body:{expectedRevision:profile.revision,resetSupportForLevel:LEVEL_COUNT-1}});assert.equal(reset.status,200);assert.equal(reset.data.progress.support[LEVEL_COUNT-1].effective,LEVEL_COUNT-1);
  assert.equal((await call('/api/settings',{method:'PATCH',body:{expectedRevision:profile.revision,supportEnabled:false}})).status,409);
  const profiles=structuredClone(BOT_PROFILES);profiles[4].temperature=1.1;
  const edited=await call('/api/settings',{method:'PATCH',body:{expectedRevision:reset.data.revision,profiles,reason:'bounded experiment'}});assert.equal(edited.status,200);assert.notEqual(edited.data.settings.config.id,reset.data.settings.config.id);
  assert.equal((await call('/api/records')).data.items.length,8);
  assert.equal((await call('/api/profile/import',{method:'POST',body:{progress:{version:5,unlocked:0,matches:999}}})).data.progress.matches,14);
  db.close();
});
test('pagination keeps equal-timestamp games, validation bounds settings and database failures are retryable',async()=>{
  const {db,call,env}=setup(),now=Date.now()-10000;
  for(let i=0;i<3;i++){const {record}=fixture({now});assert.equal((await call(`/api/records/${record.id}`,{method:'PUT',body:record})).status,200);}
  const a=(await call('/api/records?limit=2.9')).data;assert.equal(a.items.length,2);const b=(await call(`/api/records?limit=2&before=${a.next.before}&beforeId=${a.next.beforeId}`)).data;
  assert.equal(b.items.length,1);assert.equal(b.next,null);assert.equal(new Set([...a.items,...b.items].map(x=>x.id)).size,3);
  const p=(await call('/api/profile')).data,invalid=structuredClone(BOT_PROFILES);invalid[8].samples=10;
  assert.equal((await call('/api/settings',{method:'PATCH',body:{expectedRevision:p.revision,profiles:invalid}})).status,400);
  db.close();assert.equal((await call('/api/profile')).status,503);
  assert.equal((await api(new Request('https://game.example/api/profile',{headers:{'oai-authenticated-user-id':'alice'}}),{})).status,503);
});

test('decline is durable, never downgrades, accepts only a fresh offer and duplicate choices are idempotent',async()=>{
 const {db,call}=setup(),selected=LEVEL_COUNT-1,now=Date.now()-30000;
 for(let i=0;i<2;i++){const {record}=fixture({now:now+i*1000});await call('/api/records/'+record.id,{method:'PUT',body:record});}
 let p=(await call('/api/profile')).data;assert.equal(p.progress.support[selected].effective,selected);assert.ok(p.progress.support[selected].pending);
 const choice={kind:'support-choice',id:crypto.randomUUID(),offerId:p.progress.support[selected].pending.id,selectedLevel:selected,epoch:0,accept:false,at:now+3000};
 assert.equal((await call('/api/support-decisions/'+choice.id,{method:'PUT',body:choice})).data.accepted,true);
 p=(await call('/api/profile')).data;assert.equal(p.progress.support[selected].effective,selected);assert.equal(p.progress.support[selected].pending,null);assert.equal(p.supportDecisions.length,1);
 const changed={...choice,id:crypto.randomUUID(),accept:true};assert.equal((await call('/api/support-decisions/'+changed.id,{method:'PUT',body:changed})).data.accepted,false);
 for(let i=2;i<4;i++){const {record}=fixture({now:now+(i+2)*1000});await call('/api/records/'+record.id,{method:'PUT',body:record});}
 p=(await call('/api/profile')).data;assert.ok(p.progress.support[selected].pending);
 const yes={...choice,id:crypto.randomUUID(),offerId:p.progress.support[selected].pending.id,accept:true,at:now+8000};
 assert.equal((await call('/api/support-decisions/'+yes.id,{method:'PUT',body:yes,owner:'bob'})).data.accepted,false);
 const race=await Promise.all([yes,{...yes,id:crypto.randomUUID()}].map(body=>call('/api/support-decisions/'+body.id,{method:'PUT',body})));
 assert.equal(race.filter(r=>r.data.accepted).length,1);p=(await call('/api/profile')).data;assert.equal(p.progress.support[selected].effective,selected-1);assert.equal(p.supportDecisions.length,2);db.close();
});
test('nine-grade accounts and records retain unlocks and history without silently retaining automatic support',async()=>{
 const {db,call}=setup();
 const old={base:{version:5,unlocked:8,matches:9,lastChallenges:[]},imported:true,supportEnabled:true,supportEpochs:Array(9).fill(0),config:{id:'old',profiles:BOT_PROFILES.slice(0,9)}};
 db.prepare('INSERT INTO players(owner,revision,state,updated_at) VALUES(?,?,?,?)').run('alice',4,JSON.stringify(old),Date.now());
 const p=(await call('/api/profile')).data;assert.equal(p.settings.supportVersion,2);assert.equal(p.progress.unlocked,LEVEL_COUNT-1);assert.equal(p.progress.matches,9);assert.equal(p.settings.config.profiles.length,LEVEL_COUNT);assert.equal(p.progress.support.at(-1).effective,LEVEL_COUNT-1);assert.equal(p.revision,5);
 const record=JSON.parse(readFileSync(new URL('./fixtures/nine-legacy-flights.json',import.meta.url),'utf8'))[1];
 assert.equal((await call('/api/records/'+record.id,{method:'PUT',body:record})).status,200);
 assert.equal((await call('/api/records/'+record.id)).data.rulesVersion,'flight-records-1');assert.equal((await call('/api/profile')).data.progress.matches,10);db.close();
});
