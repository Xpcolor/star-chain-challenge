import test from 'node:test';
import assert from 'node:assert/strict';
import {combatHoldMs,terminalDelaySeconds,COMBAT_TIMING as t} from '../dist/combat-timing.mjs';
test('combat lock covers the last hit, multi-repair and terminal sequence, with fast reduced motion',()=>{
 for(let healing=0;healing<=6;healing++)for(let hits=0;hits<=4;hits++){
  const event={healing,rawDamage:hits*2,claimed:Array(hits).fill('goal')},hold=combatHoldMs(event)/1000;
  if(hits)assert.ok(hold>=t.prepare+(hits-1)*t.attackSpacing+t.travel+t.particles-1e-9);
  if(healing)assert.ok(hold>=t.prepare+(healing-1)*t.repairSpacing+t.particles-1e-9);
  assert.ok(combatHoldMs(event,true)>=1000*(t.terminal+t.collapse));
  if(hits)assert.ok(terminalDelaySeconds(event)>t.prepare+(hits-1)*t.attackSpacing+t.travel);
  assert.ok(combatHoldMs(event,true)>=Math.ceil(1000*(terminalDelaySeconds(event)+t.collapse)));
  assert.equal(combatHoldMs(event,true,true),100);
 }
});
test('draw without a final attack retains the terminal presentation',()=>{
 assert.equal(terminalDelaySeconds(null),t.terminal);
});
