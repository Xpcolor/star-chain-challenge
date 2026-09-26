import test from 'node:test';
import assert from 'node:assert/strict';
import {CHALLENGES,drawChallenges,freshChallengeProgress,previewChallenges,replaceChallenges,challengeViews} from '../dist/challenges.mjs';
const event=(overrides={})=>({chain:0,before:4,after:12,board:[12,10,16],ops:[1],claimed:['P7','L2'],...overrides});
test('opening pool has two 1HP and one 2HP repair, distinct and rotating across games',()=>{
  let previous=[];
  for(let i=0;i<30;i++){const ids=drawChallenges(()=>.4,previous);assert.equal(new Set(ids).size,3);assert.deepEqual(challengeViews(ids,{}).map(c=>c.healing),[1,1,2]);assert.ok(!ids.every(id=>previous.includes(id)));previous=ids;}
  assert.ok(CHALLENGES.every(c=>c.target<=2));
});
test('single and multiple claims replace exactly their slots and reset both players only there',()=>{
  for(const ids of [['long-jump','edge','double-goal'],['small-two','edge','streak']]){
    let p=[freshChallengeProgress(ids),freshChallengeProgress(ids)];p[0][ids[1]].minus=1;p[1][ids[1]].even=1;
    for(const awarded of [[ids[0]],[ids[0],ids[2]],ids]){
      const before=JSON.stringify(p),next=replaceChallenges(ids,p,awarded,()=>.2);assert.equal(JSON.stringify(p),before);assert.equal(next.ids.filter(id=>!ids.includes(id)).length,awarded.length);assert.equal(new Set(next.ids).size,3);
      ids.forEach((id,i)=>{if(!awarded.includes(id)){assert.equal(next.ids[i],id);for(const actor of [0,1])assert.deepEqual(next.progress[actor][id],p[actor][id]);}});
      for(const actor of [0,1])for(const c of challengeViews(next.ids,next.progress[actor]))if(!ids.includes(c.id))assert.equal(c.progress,0);
    }
  }
});
test('preview is pure and awards once; incoming replacements do not inherit old actions',()=>{
  const ids=['long-jump','edge','double-goal'],p=freshChallengeProgress(ids),before=JSON.stringify(p),preview=previewChallenges(ids,p,event());
  assert.equal(JSON.stringify(p),before);assert.equal(preview.healing,3);assert.deepEqual(preview.awarded,['long-jump','double-goal']);assert.equal(previewChallenges(ids,preview.next,event()).healing,0);
  const next=replaceChallenges(ids,[preview.next,freshChallengeProgress(ids)],preview.awarded,()=>0);
  for(const actor of [0,1])for(const c of challengeViews(next.ids,next.progress[actor]))if(!ids.includes(c.id))assert.equal(c.progress,0);
});
test('progress is separate, rest breaks own streak only, healing-only does not extend attacks',()=>{
  const ids=['minus-two','even-two','streak'],p=freshChallengeProgress(ids);
  const once=previewChallenges(ids,p,event());assert.equal(once.next.streak.streak,1);assert.equal(p.streak.streak,0);
  const rested=previewChallenges(ids,once.next,{rest:true});assert.equal(rested.next.streak.streak,0);assert.equal(rested.next['even-two'].even,1);
  const quiet=previewChallenges(ids,once.next,event({claimed:[]}));assert.equal(quiet.next.streak.streak,0);assert.equal(quiet.healing,1);
  assert.equal(previewChallenges(ids,once.next,event()).healing,3);
});
test('each of the12 repair definitions is achievable in at most two suitable plays',()=>{
  for(const c of CHALLENGES){
    let p=freshChallengeProgress([c.id]),paid=0;
    const events=[event({chain:0,before:c.id==='long-jump'?9:4,after:2,board:[2,2,16],ops:[-1],claimed:['E2','P2']}),event({chain:1,before:4,after:2,board:[2,2,16],ops:[1,-1],claimed:['P2','L1']})];
    for(const e of events){const r=previewChallenges([c.id],p,e);p=r.next;paid+=r.healing;}
    assert.equal(paid,c.healing,c.id);
  }
});
