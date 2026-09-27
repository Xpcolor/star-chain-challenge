import test from 'node:test';
import assert from 'node:assert/strict';
import {combatCue} from '../dist/combat-fx.mjs';
import {AUDIO_BANK,createAudioBus} from '../dist/audio-bank.mjs';
import {readFileSync} from 'node:fs';
test('single and multiple triggered targets have distinct shots without re-evaluating damage',()=>{
  const a={actor:1,claimed:['E12'],rawDamage:2,damage:0,blockedDamage:2,healing:1};
  const before=structuredClone(a),single=combatCue(a),multi=combatCue({...a,claimed:['E12','L8'],rawDamage:6,damage:4,healing:3});
  assert.equal(single.shots,1);assert.equal(single.damage,0);assert.equal(single.blocked,2);
  assert.equal(multi.shots,2);assert.ok(multi.power>single.power);assert.ok(multi.heavy);
  assert.equal(single.healPulses,1);assert.equal(multi.healPulses,3);assert.deepEqual(a,before);
  assert.equal(combatCue({}).shots,0);assert.equal(combatCue({healing:0}).healPulses,0);
  assert.equal(combatCue({healing:10000}).healPulses,4);
});
test('audio library ships real bounded PCM files and is silent before gesture/unlock',async()=>{
  assert.equal(AUDIO_BANK.length,11);
  for(const asset of AUDIO_BANK){const b=readFileSync(new URL('../dist/'+asset.src,import.meta.url));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt32LE(24),22050);assert.ok(b.length>2000&&b.length<150000);}
  const bus=createAudioBus();assert.equal(await bus.play('laser'),false);assert.equal(await bus.unlock(),false);bus.setEnabled(false);assert.equal(bus.enabled,false);bus.setVolume(2);assert.equal(bus.volume,1);bus.dispose();bus.dispose();
});
