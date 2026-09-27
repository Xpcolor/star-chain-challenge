import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PLAYER_SHIP,FLEET} from '../dist/fleet.mjs';
test('all 16 fleet identities have distinct finite GLB meshes, useful bounds and effect mounts',()=>{
  assert.equal(FLEET.length,16);const hashes=new Set();
  for(const ship of [PLAYER_SHIP,...FLEET]){
    const bytes=readFileSync(new URL('../dist/'+ship.model,import.meta.url));
    assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
    assert.ok(bytes.length<3_000_000,ship.id+' load budget');
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.ok(json.nodes.some(n=>n.name==='muzzle'));assert.ok(json.nodes.some(n=>n.name==='engine_1'));
    assert.ok(json.meshes.length<=10,'material batching bounds draw calls');
    for(const a of json.accessors)if(a.min){assert.ok(a.min.every(Number.isFinite));assert.ok(a.max.every(Number.isFinite));}
    assert.ok(!json.images?.length,'no missing texture dependencies');
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size,17);
  for(let i=1;i<FLEET.length;i++)assert.ok(FLEET[i].length>FLEET[i-1].length);
});
test('every rank uses its own transparent cinematic artwork, with valid effect anchors',()=>{
  const hashes=new Set();
  for(const ship of [PLAYER_SHIP,...FLEET]){
    assert.equal(ship.fallback,ship.portrait,'WebGL and fallback must show the same identity');
    const bytes=readFileSync(new URL('../dist/'+ship.portrait,import.meta.url));
    assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.equal(bytes.readUInt32BE(16),1536);assert.equal(bytes.readUInt32BE(20),1024);
    assert.equal(bytes[25],6,'art must retain the RGBA channel');
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    const [x0,y0,x1,y1]=ship.art.bounds;
    assert.ok(x0>=0&&y0>=0&&x1<=1536&&y1<=1024&&x1>x0&&y1>y0);
    for(const [x,y] of [ship.art.muzzle,...ship.art.engines])assert.ok(x>=0&&x<=1536&&y>=0&&y<=1024);
    assert.ok(ship.art.engines.length>0);
  }
  assert.equal(hashes.size,17,'a rank must not alias or copy another rank texture');
});
