import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProgress} from '../dist/progress.mjs';
import {LEVEL_COUNT,OLD_LEVEL_MAP} from '../dist/difficulty.mjs';
test('legacy three-level, six-level and challenge saves retain unlocks in HP mode',()=>{
  assert.equal(normalizeProgress({version:1,medals:[7,7,7],unlocked:2,matches:8}).unlocked,LEVEL_COUNT-1);
  assert.equal(normalizeProgress({version:1,medals:[0,0,0],unlocked:1,matches:3}).unlocked,4);
  assert.equal(normalizeProgress({version:2,medals:[7,0,0,0,0,0],unlocked:2,matches:5}).unlocked,4);
  const p=normalizeProgress({version:3,unlocked:4,matches:7,lastChallenges:['edge','streak','minus-two']});assert.equal(p.version,6);assert.equal(p.unlocked,OLD_LEVEL_MAP[7]);assert.equal(p.matches,7);assert.equal(p.lastChallenges.length,3);assert.equal('medals' in p,false);
});
test('invalid saved values are bounded and irrelevant fields never become HP',()=>{
  const p=normalizeProgress({version:4,unlocked:99,matches:-3,lastChallenges:['edge','edge','bad'],hp:[900,0]});assert.equal(p.unlocked,LEVEL_COUNT-1);assert.equal(p.matches,0);assert.deepEqual(p.lastChallenges,['edge']);assert.equal('hp' in p,false);assert.equal(normalizeProgress(null).unlocked,0);
});
