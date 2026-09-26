import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../dist/engine.mjs';
import {freshSupport,settleSupport,deriveProgress,BOT_PROFILES,LEVEL_COUNT,RULES_VERSION,decideSupport,validateProfiles} from '../dist/difficulty.mjs';
import {normalizeProgress} from '../dist/progress.mjs';
import {replayRecord,closeRecord,publicRecord} from '../dist/records.mjs';
import {createRecordClient} from '../dist/record-client.mjs';
import {fixture} from './record-fixture.mjs';
import {readFileSync} from 'node:fs';

test('two losses offer support; only explicit acceptance lowers it; refusal clears this offer',()=>{
 let state=freshSupport(LEVEL_COUNT-1);
 for(let i=0;i<LEVEL_COUNT-1;i++){
  state=settleSupport(settleSupport(state,'loss','a'+i),'loss','b'+i);assert.equal(state.effective,LEVEL_COUNT-1-i);assert.equal(state.pending.to,LEVEL_COUNT-2-i);
  state=decideSupport(state,{offerId:'b'+i,accept:true});
 }
 assert.equal(state.effective,0);state=settleSupport(settleSupport(state,'win','w1'),'win','w2');assert.equal(state.effective,1);
 state=settleSupport(settleSupport(state,'loss','l1'),'loss','l2');state=decideSupport(state,{offerId:'l2',accept:false});assert.equal(state.effective,1);assert.equal(state.pending,null);
});
test('derived progress replays completed games and consent chronologically, deduplicates, and ignores old support epochs',()=>{
 const settings={supportEnabled:true,supportEpochs:Array(LEVEL_COUNT).fill(0)},a={id:'a',status:'complete',rulesVersion:RULES_VERSION,selectedLevel:14,actualLevel:14,epoch:0,supportEnabled:true,outcome:'loss',completedAt:10},b={...a,id:'b',completedAt:20};
 let p=deriveProgress(normalizeProgress(null),settings,[a,a,b]);assert.equal(p.matches,2);assert.equal(p.support[14].effective,14);assert.equal(p.support[14].pending.id,'b');
 const d={id:'decision',offerId:'b',selectedLevel:14,epoch:0,accept:true,at:21};p=deriveProgress(normalizeProgress(null),settings,[a,b],[d]);assert.equal(p.support[14].effective,13);
 p=deriveProgress(normalizeProgress(null),settings,[{...a,outcome:'win',actualLevel:3}]);assert.equal(p.unlocked,4);
 settings.supportEpochs[14]=1;assert.equal(deriveProgress(normalizeProgress(null),settings,[a,b],[d]).support[14].effective,14);
});
test('record replays opening, dice, hands, combat and outcome; active seed stays private',()=>{
  const {record,g,active}=fixture();const replayed=replayRecord(record);
  for(const key of ['board','hp','shields','hands','market','history','challengeIds','challengeProgress','modules','moduleProgress','winner'])assert.deepEqual(replayed[key],g[key]);
  const sequence=record.sequence;closeRecord(record,g);assert.equal(record.sequence,sequence);
  assert.equal(publicRecord(active).options.seed,undefined);assert.equal(publicRecord(record).options.seed,48);
  const bad=structuredClone(record);bad.events.find(e=>e.after).after.hp[0]++;assert.throws(()=>replayRecord(bad),/结算/);
  const badDice=structuredClone(record);badDice.events.find(e=>e.type==='dice').pair=[9,9];assert.throws(()=>replayRecord(badDice),/骰子/);
});
test('actual nine-level release records retain their original shield and full replay',()=>{
 const records=JSON.parse(readFileSync(new URL('./fixtures/nine-legacy-flights.json',import.meta.url),'utf8'));
 for(const record of records){const game=replayRecord(record);assert.equal(game.shieldAllowance,3);assert.deepEqual(game.hp,record.result.hp);assert.equal(game.phase,'over');}
});
test('profile validation caps future tuning and engine copies the selected parameters',()=>{
  const profiles=validateProfiles(BOT_PROFILES),g=createGame({seed:10,botProfile:profiles[8]});profiles[8].temperature=2;
  assert.equal(g.aiProfile.temperature,BOT_PROFILES[8].temperature);
  const invalid=structuredClone(BOT_PROFILES);invalid[LEVEL_COUNT-1].beam=4;assert.throws(()=>validateProfiles(invalid),/预判/);
  invalid[LEVEL_COUNT-1]={...BOT_PROFILES[LEVEL_COUNT-1],defence:.9};assert.throws(()=>validateProfiles(invalid),/范围/);
});

const memory=()=>{const data=new Map();return {data,all:async()=>[...data.values()].map(r=>structuredClone(r)),put:async r=>data.set(r.id,structuredClone(r)),remove:async id=>data.delete(id)};};
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
test('offline writes survive retry and reload; completed flight is not reclassified as abandoned',async()=>{
  const store=memory(),{record,active}=fixture(),writes=[];let online=false;
  const fetcher=async(path,opts)=>{if(!online)throw Error('offline');if(opts.method==='PUT')writes.push(JSON.parse(opts.body));return response({revision:0,progress:{},settings:{}});};
  const client=createRecordClient({store,fetcher});await client.init({});await client.enqueue(record);await drain();assert.equal(store.data.size,1);assert.equal(client.status().pending,1);
  online=true;const resumed=createRecordClient({store,fetcher});await resumed.init({});await drain();assert.equal(writes.at(-1).status,'complete');assert.equal(store.data.size,0);
  await store.put(active);const restarted=createRecordClient({store,fetcher});await restarted.init({});await drain();assert.equal(writes.at(-1).status,'abandoned');assert.equal(writes.at(-1).endReason,'page-reload');
});
test('upload acknowledgment cannot remove a newer pending snapshot',async()=>{
  const store=memory(),{record,active}=fixture();let online=false,releasePut,releaseRemove,enteredPut=false,enteredRemove=false;
  const originalRemove=store.remove;store.remove=async id=>{enteredRemove=true;await new Promise(r=>releaseRemove=r);return originalRemove(id);};
  const client=createRecordClient({store,fetcher:async(path,opts)=>{if(!online)throw Error('offline');if(opts.method==='PUT'){enteredPut=true;await new Promise(r=>releasePut=r);}return response({revision:0,progress:{},settings:{}});}});
  await client.init({});await client.enqueue(active);await drain();online=true;const flushing=client.flush();await drain();assert.equal(enteredPut,true);releasePut();await drain();assert.equal(enteredRemove,true);
  await client.enqueue(record);releaseRemove();await drain();assert.equal(store.data.get(record.id).sequence,record.sequence);
  releasePut();await drain();releaseRemove();await flushing;assert.equal(store.data.size,0);assert.equal(client.status().pending,0);
});
test('offline consent survives reload and uploads between the loss that offered it and the supported game',async()=>{
 const store=memory(),{record}=fixture(),writes=[];
 const loss={...record,id:'loss-before-choice',startedAt:100,completedAt:200};
 const choice={kind:'support-choice',id:'accepted-choice',sequence:1,offerId:loss.id,selectedLevel:LEVEL_COUNT-1,epoch:0,accept:true,at:201};
 const next={...record,id:'game-after-choice',startedAt:202,completedAt:300};
 // IndexedDB returns keys, not chronology. Deliberately supply the reverse order.
 await store.put(next);await store.put(choice);await store.put(loss);
 const client=createRecordClient({store,fetcher:async(path,opts)=>{
  if(opts.method==='PUT')writes.push({path,body:JSON.parse(opts.body)});
  return response({revision:0,progress:{},settings:{},supportDecisions:[choice]});
 }});
 await client.init({});
 assert.deepEqual(writes.map(x=>x.body.id),[loss.id,choice.id,next.id]);
 assert.equal(writes[1].path,`/api/support-decisions/${choice.id}`);
 assert.equal(writes[1].body.accept,true);assert.equal(writes[1].body.status,undefined);
 assert.equal(store.data.size,0);assert.equal(client.status().pending,0);
});
