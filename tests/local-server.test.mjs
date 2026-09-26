import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {fixture} from './record-fixture.mjs';

test('local-only server serves assets, persists replay-validated records across restarts, and rejects cross-origin writes', {timeout: 30000}, async t => {
  const data = await mkdtemp(join(tmpdir(), 'star-chain-dev-'));
  const port = 19000 + Math.floor(Math.random() * 9000), base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/dev.mjs', import.meta.url))], {
      env: {...process.env, STAR_CHAIN_LOCAL_PORT: String(port), STAR_CHAIN_LOCAL_DATA: data}, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Local server did not become ready')), 15000);
      child.once('error', e => {clearTimeout(timer); reject(e);});
      child.once('exit', code => {clearTimeout(timer); reject(Error(`Local server exited: ${code}`));});
      child.stdout.on('data', chunk => {if (String(chunk).includes('http://127.0.0.1:')) {clearTimeout(timer); resolve();}});
    });
  }
  async function stop() {if (child && child.exitCode === null) {const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended;}}
  t.after(async () => {await stop(); await rm(data, {recursive:true, force:true});});
  await start();
  const index = await fetch(base + '/'); assert.equal(index.status, 200); assert.match(await index.text(), /星链算式/);
  assert.equal((await fetch(base + '/assets/player.png')).status, 200);
  const {record} = fixture({now:Date.now()-60000});
  const save = () => fetch(base + '/api/records/' + record.id, {method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify(record)});
  assert.equal((await (await save()).json()).accepted, true);
  assert.equal((await (await save()).json()).accepted, false);
  assert.equal((await (await fetch(base + '/api/profile')).json()).progress.matches, 1);
  assert.equal((await fetch(base + '/api/profile/import', {method:'POST', headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'})).status, 403);
  for (const path of ['/server/index.js','/package.json','/assets/../server/index.js']) assert.equal((await fetch(base+path)).status, 404);
  await stop(); await start();
  const saved = await (await fetch(base + '/api/records/' + record.id)).json();
  assert.equal(saved.status, 'complete'); assert.equal(saved.result.outcome, 'loss');
  assert.equal((await (await fetch(base + '/api/records')).json()).items.length, 1);
  assert.equal((await (await fetch(base + '/api/profile')).json()).progress.matches, 1);
});
