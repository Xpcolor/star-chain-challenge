import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combatCue} from '../dist/combat-fx.mjs';
import {browserCanRender, clampBattleLevel, createBattleView, cuesForEvent, normalizeVisualState, shouldPlayEvent, visualEventKey} from '../dist/battle-view.mjs';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function fakeAudio() {
  const plays = [];
  return {
    plays,
    enabled: true,
    unlock: async () => true,
    play: async id => { plays.push(id); return true; },
    setEnabled(value) { this.enabled = !!value; },
    setVolume() {},
    stop() {},
    dispose() {},
  };
}

function fakeScene(log) {
  return {
    attach() {},
    sync(state) { log.syncs.push(state.level); },
    play(cue) { log.plays.push(cue); },
    reset() { log.resets += 1; },
    setReducedMotion() {},
    pause() { log.pauses += 1; },
    resume() { log.resumes += 1; },
    destroy() { log.destroys += 1; },
    status: () => 'ready',
    shipStatus: () => ({player: 'ready', enemy: 'ready'}),
  };
}

function mockBrowser() {
  const canvas = {getContext: () => ({}), style: {}};
  const root = {attrs: {}, style: {setProperty() {}}, setAttribute(name, value) { this.attrs[name] = value; }, dataset: {}};
  const host = {dataset: {}, setAttribute(name, value) { this.dataset[name] = value; }};
  return {
    HTMLCanvasElement: function HTMLCanvasElement() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    document: {
      documentElement: root,
      hidden: false,
      createElement: () => canvas,
      getElementById: id => id === 'battle-host' ? host : null,
      addEventListener() {},
      body: {appendChild() {}},
    },
    window: {WebGL2RenderingContext: function WebGL2RenderingContext() {}, HTMLCanvasElement: function HTMLCanvasElement() {}, devicePixelRatio: 2},
  };
}

const heavy = {epoch: 1, seq: 4, actor: 1, damage: 3, rawDamage: 4, healing: 2, blocked: 1, claimed: ['goal-a', 'goal-b']};

test('renderer detection stays off without a real WebGL2 canvas', () => {
  assert.equal(browserCanRender({}), false);
  assert.equal(browserCanRender({window: {addEventListener() {}}, document: {createElement() { return {}; }, body: {appendChild() {}}}}), false);
});

test('levels clamp and settled events do not mutate the caller', () => {
  const input = {level: 99, hp: [18, 17], event: {...heavy}};
  const state = normalizeVisualState(input);
  assert.equal(state.level, 15);
  assert.equal(clampBattleLevel(-3), 0);
  assert.equal(input.level, 99);
  assert.equal(state.event.actor, 1);
  assert.notEqual(state.event, input.event);
  assert.equal(normalizeVisualState({level: 1.2}).level, 1);
});

test('combat cues differentiate heavy multi-target fire from a light shot', () => {
  const cue = combatCue({actor: 1, rawDamage: 4, damage: 3, healing: 2, blockedDamage: 1, claimed: ['a', 'b']});
  assert.equal(cue.shots, 2);
  assert.equal(cue.heavy, true);
  assert.equal(cue.healPulses, 2);
  assert.equal(cue.shotSpacing, 160);
  assert.deepEqual(cuesForEvent(heavy), ['cannon', 'shield', 'impact', 'repair']);
  assert.deepEqual(cuesForEvent({epoch: 2, seq: 1, actor: 0, damage: 1, rawDamage: 1, healing: 0, blocked: 0, claimed: ['only']}), ['laser', 'impact']);
  assert.equal(shouldPlayEvent(visualEventKey(heavy), heavy), false);
  assert.equal(shouldPlayEvent(visualEventKey(heavy), {...heavy, seq: 5}), true);
  assert.equal(shouldPlayEvent(visualEventKey(heavy), {...heavy, epoch: 2}), true);
  assert.notEqual(visualEventKey(heavy), visualEventKey({...heavy, actor: 0}));
});

test('one settlement plays once, a new match rearms arrival, and defeat cues fire once', async () => {
  const audio = fakeAudio();
  const log = {plays: [], syncs: [], resets: 0, pauses: 0, resumes: 0, destroys: 0};
  let calls = 0;
  const view = createBattleView({
    env: mockBrowser(),
    audio,
    loadScene: async () => { calls += 1; return {createBattleScene: () => fakeScene(log)}; },
  });
  view.sync({match: 1, level: 0, hp: [18, 18], phase: 'loadout'});
  view.sync({match: 1, level: 0, hp: [18, 18], phase: 'opening'});
  await flush();
  await flush();
  view.sync({match: 1, level: 3, hp: [18, 18], phase: 'action', event: heavy});
  view.sync({match: 1, level: 3, hp: [15, 18], phase: 'action', event: heavy});
  await flush();
  assert.equal(calls, 1);
  assert.equal(log.plays.length, 1);
  assert.equal(log.plays[0].shots, 2);
  assert.equal(log.plays[0].heavy, true);
  assert.equal(log.plays[0].actor, 1);
  assert.deepEqual(audio.plays.filter(id => id !== 'arrival'), ['cannon', 'shield', 'impact', 'repair']);
  assert.equal(audio.plays.filter(id => id === 'arrival').length, 1);
  view.sync({match: 2, level: 4, hp: [18, 0], phase: 'over', outcome: 'player'});
  view.sync({match: 2, level: 4, hp: [18, 0], phase: 'over', outcome: 'player'});
  assert.equal(audio.plays.filter(id => id === 'collapse').length, 1);
  assert.equal(audio.plays.filter(id => id === 'victory').length, 1);
  assert.equal(audio.plays.filter(id => id === 'arrival').length, 2);
  view.pause();
  view.pause();
  assert.equal(log.pauses, 1);
  view.destroy();
  view.destroy();
  assert.equal(log.destroys, 1);
  assert.equal(view.status(), 'fallback');
});

test('adapter source stays free of Three and the scene keeps the model contract', () => {
  const view = readFileSync(new URL('../dist/battle-view.mjs', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../dist/battle-scene.mjs', import.meta.url), 'utf8');
  assert.match(view, /combatCue/);
  assert.match(view, /battle-scene\.bundle\.mjs/);
  assert.doesNotMatch(view, /from ['"]three['"]/);
  assert.match(scene, /GLTFLoader/);
  assert.match(scene, /PLAYER_SHIP/);
  assert.match(scene, /rotation\.y = Math\.PI/);
  assert.match(scene, /studio-light\.hdr/);
  assert.match(scene, /combatCue/);
});

test('2D fallback retains sound, repeated renders do not replay, reset cancels queued volley', () => {
  const audio = fakeAudio(), timers = new Map(); let next = 0;
  const env = {setTimeout(fn) { const id=++next; timers.set(id,()=>{timers.delete(id);fn();}); return id; }, clearTimeout(id) { timers.delete(id); }};
  const view = createBattleView({env,audio});
  const state = {match:1,hp:[18,18],phase:'action',event:heavy};
  view.sync(state); view.sync(state);
  assert.equal(view.status(),'fallback');
  assert.deepEqual(audio.plays,['arrival','cannon','shield','impact','repair']);
  assert.equal(timers.size,2);
  view.reset(2);
  assert.equal(timers.size,0);
  view.sync({...state,match:2,event:{...heavy,epoch:2}});
  for (const fn of [...timers.values()]) fn();
  assert.equal(audio.plays.filter(id=>id==='cannon').length,3);
  assert.equal(audio.plays.filter(id=>id==='repair').length,3);
  assert.equal(timers.size,0);
  view.destroy();
});
