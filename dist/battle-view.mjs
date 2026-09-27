/**
 * DOM-safe battle adapter.
 * Loads `./battle-scene.bundle.mjs` only after a real WebGL2 canvas exists.
 * Settled events play once per epoch+seq. A new match resets that memory.
 * Shot shape comes from combatCue; this module does not change rules.
 * See battle-contract.d.ts.
 */

import {combatCue} from './combat-fx.mjs';

export const RENDERER_STATUS = Object.freeze({loading: 'loading', ready: 'ready', fallback: 'fallback'});

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function clampBattleLevel(level) {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 0;
  return Math.min(15, Math.max(0, n));
}

export function presentationAction(event) {
  if (!event) return null;
  return {
    actor: event.actor === 1 ? 1 : 0,
    damage: Math.max(0, num(event.damage)),
    rawDamage: Math.max(0, num(event.rawDamage ?? event.damage)),
    healing: Math.max(0, num(event.healing)),
    blockedDamage: Math.max(0, num(event.blockedDamage ?? event.blocked)),
    claimed: Array.isArray(event.claimed) ? event.claimed.slice(0, 3) : [],
  };
}

export function normalizeSettledEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const actor = event.actor === 1 ? 1 : event.actor === 0 ? 0 : null;
  const epoch = Number(event.epoch);
  const seq = Number(event.seq);
  if (actor === null || !Number.isFinite(epoch) || !Number.isFinite(seq)) return null;
  const action = presentationAction(event);
  const chain = event.chain === 0 || event.chain === 1 || event.chain === 2 ? event.chain : null;
  return {...action, epoch, seq, actor, chain, blocked: action.blockedDamage};
}

export function normalizeVisualState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const hp = Array.isArray(src.hp) ? src.hp : [];
  const shields = Array.isArray(src.shields) ? src.shields : [];
  const outcome = src.outcome === 'player' || src.outcome === 'enemy' || src.outcome === 'draw' ? src.outcome : null;
  return {
    match: Number.isFinite(Number(src.match)) ? Number(src.match) : 0,
    level: clampBattleLevel(src.level),
    hp: [num(hp[0]), num(hp[1])],
    phase: typeof src.phase === 'string' ? src.phase : '',
    initiative: src.initiative === 0 || src.initiative === 1 ? src.initiative : null,
    shields: [Math.max(0, num(shields[0])), Math.max(0, num(shields[1]))],
    reducedMotion: !!src.reducedMotion,
    outcome,
    event: normalizeSettledEvent(src.event),
  };
}

export function visualEventKey(event) {
  return event ? `${event.epoch}:${event.seq}:${event.actor}` : null;
}

export function shouldPlayEvent(previousKey, event) {
  const key = visualEventKey(event);
  return !!key && key !== previousKey;
}

/** Sound ids for one settlement. Heavy strikes use the cannon; heals follow combatCue pulses. */
export function cuesForEvent(event) {
  const action = presentationAction(event);
  if (!action) return [];
  const cue = combatCue(action);
  const cues = [];
  if (cue.shots) cues.push(cue.heavy ? 'cannon' : 'laser');
  if (cue.blocked > 0) cues.push('shield');
  if (cue.damage > 0) cues.push('impact');
  if (cue.healPulses) cues.push('repair');
  return cues;
}

export function browserCanRender(env = globalThis) {
  try {
    const win = env?.window;
    const doc = env?.document;
    if (!win || !doc || typeof doc.createElement !== 'function') return false;
    if (typeof win.WebGL2RenderingContext !== 'function') return false;
    const Canvas = win.HTMLCanvasElement || env.HTMLCanvasElement;
    if (typeof Canvas !== 'function') return false;
    if (typeof doc.body?.appendChild !== 'function') return false;
    const canvas = doc.createElement('canvas');
    return !!canvas && typeof canvas.getContext === 'function';
  } catch {
    return false;
  }
}

function defaultLoadScene() {
  return import('./battle-scene.bundle.mjs');
}

function boxOf(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  const width = Number.isFinite(rect.width) ? rect.width : rect.right - rect.left;
  const height = Number.isFinite(rect.height) ? rect.height : rect.bottom - rect.top;
  if (!(width > 1) || !(height > 1)) return null;
  return {left: num(rect.left), top: num(rect.top), width, height};
}

function readAnchorRects(env) {
  const doc = env.document;
  if (!doc || typeof doc.getElementById !== 'function') return null;
  const stage = boxOf(doc.getElementById('battle-stage'));
  if (!stage) return null;
  return {stage, player: boxOf(doc.getElementById('ship-anchor-0')), enemy: boxOf(doc.getElementById('ship-anchor-1'))};
}

function writeData(el, name, value) {
  if (!el || value == null) return;
  if (typeof el.setAttribute === 'function') el.setAttribute(name, value);
  if (el.dataset && typeof el.dataset === 'object') {
    const prop = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, s) => s.toUpperCase());
    el.dataset[prop] = value;
  }
}

function cueAudio(audio, id) {
  try {
    const result = audio?.play?.(id);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { /* audio never blocks the table */ }
}

export function createBattleView(options = {}) {
  const env = options.env || globalThis;
  const loadScene = options.loadScene || defaultLoadScene;
  const audio = options.audio || null;
  let scene = null;
  let starting = null;
  let destroyed = false;
  let paused = false;
  let hiddenHold = false;
  let playedKey = null;
  let match = null;
  let lastState = null;
  let arrivalCue = false;
  let status = RENDERER_STATUS.fallback;
  const ships = {player: RENDERER_STATUS.fallback, enemy: RENDERER_STATUS.fallback};
  const flags = {collapsePlayer: false, collapseEnemy: false, victory: false, defeat: false};
  const wantFall = {player: false, enemy: false};
  const wantVictory = {player: false, enemy: false};
  const motion = {arrive: 1, fallPlayer: 0, fallEnemy: 0, victoryPlayer: 0, victoryEnemy: 0};
  let deferredRaf = null;
  let motionFrame = 0;
  let motionStamp = 0;
  let listening = false;
  const soundTimers = new Set();
  function clearSounds() {
    for (const timer of soundTimers) env.clearTimeout?.(timer);
    soundTimers.clear();
    audio?.stop?.();
  }
  function laterSound(id, delay) {
    if (typeof env.setTimeout !== 'function') return;
    const timer = env.setTimeout(() => {
      soundTimers.delete(timer);
      if (!destroyed && !paused && !hiddenHold) cueAudio(audio, id);
    }, delay);
    soundTimers.add(timer);
  }

  function usesDeferredFrame() {
    if (deferredRaf != null) return deferredRaf;
    const raf = env.requestAnimationFrame;
    if (typeof raf !== 'function') { deferredRaf = false; return false; }
    let ran = false;
    raf(() => { ran = true; });
    deferredRaf = !ran;
    return deferredRaf;
  }

  function publishStatus() {
    const doc = env.document;
    if (!doc) return;
    writeData(doc.documentElement, 'data-battle-renderer', status);
    writeData(doc.documentElement, 'data-ship-player', ships.player);
    writeData(doc.documentElement, 'data-ship-enemy', ships.enemy);
    if (typeof doc.getElementById === 'function') writeData(doc.getElementById('battle-host'), 'data-battle-renderer', status);
  }

  function publishMotion() {
    const style = env.document?.documentElement?.style;
    if (!style || typeof style.setProperty !== 'function') return;
    style.setProperty('--ship-arrive', motion.arrive.toFixed(3));
    style.setProperty('--fall-player', motion.fallPlayer.toFixed(3));
    style.setProperty('--fall-enemy', motion.fallEnemy.toFixed(3));
    style.setProperty('--victory-player', motion.victoryPlayer.toFixed(3));
    style.setProperty('--victory-enemy', motion.victoryEnemy.toFixed(3));
  }

  function stepMotion(now) {
    motionFrame = 0;
    const dt = Math.min(0.05, motionStamp ? (now - motionStamp) / 1000 : 0.016);
    motionStamp = now;
    let busy = false;
    if (motion.arrive < 1) { motion.arrive = Math.min(1, motion.arrive + dt / 1.15); busy = true; }
    if (wantFall.player && motion.fallPlayer < 1) { motion.fallPlayer = Math.min(1, motion.fallPlayer + dt / 1.7); busy = true; }
    if (wantFall.enemy && motion.fallEnemy < 1) { motion.fallEnemy = Math.min(1, motion.fallEnemy + dt / 1.7); busy = true; }
    if (wantVictory.player && motion.victoryPlayer < 1) { motion.victoryPlayer = Math.min(1, motion.victoryPlayer + dt / 1.2); busy = true; }
    if (wantVictory.enemy && motion.victoryEnemy < 1) { motion.victoryEnemy = Math.min(1, motion.victoryEnemy + dt / 1.2); busy = true; }
    publishMotion();
    if (busy) scheduleMotion();
  }

  function scheduleMotion() {
    if (motionFrame || destroyed || !usesDeferredFrame()) return;
    motionFrame = env.requestAnimationFrame(stepMotion);
  }

  function snapMotion() {
    if (wantFall.player) motion.fallPlayer = 1;
    if (wantFall.enemy) motion.fallEnemy = 1;
    if (wantVictory.player) motion.victoryPlayer = 1;
    if (wantVictory.enemy) motion.victoryEnemy = 1;
    motion.arrive = 1;
    publishMotion();
  }

  function clearRoundMotion() {
    clearSounds();
    arrivalCue = false;
    flags.collapsePlayer = false;
    flags.collapseEnemy = false;
    flags.victory = false;
    flags.defeat = false;
    wantFall.player = false;
    wantFall.enemy = false;
    wantVictory.player = false;
    wantVictory.enemy = false;
    motion.arrive = 0;
    motion.fallPlayer = 0;
    motion.fallEnemy = 0;
    motion.victoryPlayer = 0;
    motion.victoryEnemy = 0;
    publishMotion();
  }

  function applyRun() {
    if (!scene) return;
    if (destroyed || paused || hiddenHold || env.matchMedia?.('(max-width: 1000px)')?.matches) scene.pause();
    else scene.resume();
  }

  function listen() {
    if (listening) return;
    listening = true;
    env.matchMedia?.('(max-width: 1000px)')?.addEventListener?.('change', applyRun);
    const doc = env.document;
    if (typeof doc?.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', () => {
        if (destroyed) return;
        hiddenHold = !!doc.hidden;
        applyRun();
      });
    }
  }

  function adopt(detail) {
    if (destroyed || !detail) return;
    if (detail.status) status = detail.status;
    if (detail.ships?.player) ships.player = detail.ships.player;
    if (detail.ships?.enemy) ships.enemy = detail.ships.enemy;
    publishStatus();
  }

  function noteOutcome(state) {
    const reduced = !!state.reducedMotion;
    if (state.hp[0] <= 0 && !flags.collapsePlayer) {
      flags.collapsePlayer = true;
      wantFall.player = true;
      if (reduced) motion.fallPlayer = 1;
      cueAudio(audio, 'collapse');
    }
    if (state.hp[1] <= 0 && !flags.collapseEnemy) {
      flags.collapseEnemy = true;
      wantFall.enemy = true;
      if (reduced) motion.fallEnemy = 1;
      cueAudio(audio, 'collapse');
    }
    if (state.outcome === 'player' && !flags.victory) {
      flags.victory = true;
      wantVictory.player = true;
      if (reduced) motion.victoryPlayer = 1;
      cueAudio(audio, 'victory');
    }
    if (state.outcome === 'enemy' && !flags.defeat) {
      flags.defeat = true;
      wantVictory.enemy = true;
      if (reduced) motion.victoryEnemy = 1;
      cueAudio(audio, 'defeat');
    }
    const shipsShown = state.phase !== 'loadout' && state.phase !== 'sector';
    if (shipsShown && !arrivalCue) {
      arrivalCue = true;
      if (reduced) motion.arrive = 1;
      cueAudio(audio, 'arrival');
    }
    if (reduced) snapMotion();
    else scheduleMotion();
    publishMotion();
  }

  function apply(state) {
    lastState = state;
    noteOutcome(state);
    scene?.setReducedMotion(!!state.reducedMotion);
    scene?.sync(state);
    if (!shouldPlayEvent(playedKey, state.event)) return;
    const key = visualEventKey(state.event);
    const cue = combatCue(presentationAction(state.event));
    try { scene?.play(cue); } catch { /* 2D FX still explains the shot */ }
    playedKey = key;
    for (const id of cuesForEvent(state.event)) cueAudio(audio, id);
    for (let i = 1; i < cue.shots; i++) laterSound(cue.heavy ? 'cannon' : 'laser', i * cue.shotSpacing);
    for (let i = 1; i < cue.healPulses; i++) laterSound('repair', i * cue.healingSpacing);
  }

  function ensure() {
    if (destroyed || scene || starting || !browserCanRender(env)) return;
    const ticket = {};
    starting = ticket;
    status = RENDERER_STATUS.loading;
    ships.player = RENDERER_STATUS.loading;
    ships.enemy = RENDERER_STATUS.loading;
    publishStatus();
    listen();
    Promise.resolve().then(() => loadScene()).then(mod => {
      if (starting !== ticket || destroyed) return;
      const factory = mod && mod.createBattleScene;
      if (typeof factory !== 'function') throw new Error('missing battle scene');
      const created = factory({readRects: () => readAnchorRects(env), onStatus: adopt});
      if (starting !== ticket || destroyed) { created?.destroy?.(); return; }
      scene = created;
      scene.attach(env.document.getElementById('battle-host'));
      applyRun();
      if (lastState) apply(lastState);
    }).catch(() => {
      if (destroyed || starting !== ticket) return;
      scene = null;
      status = RENDERER_STATUS.fallback;
      ships.player = RENDERER_STATUS.fallback;
      ships.enemy = RENDERER_STATUS.fallback;
      publishStatus();
    }).finally(() => { if (starting === ticket) starting = null; });
  }

  return {
    sync(input) {
      if (destroyed) return;
      const state = normalizeVisualState(input);
      if (match !== null && state.match !== match) {
        playedKey = null;
        clearRoundMotion();
        scene?.reset?.();
      }
      match = state.match;
      lastState = state;
      ensure();
      apply(state);
    },
    reset(matchId) {
      playedKey = null;
      clearRoundMotion();
      if (Number.isFinite(Number(matchId))) match = Number(matchId);
      if (!destroyed) scene?.reset?.();
    },
    pause() { if (destroyed || paused) return; paused = true; clearSounds(); applyRun(); },
    resume() { if (destroyed || !paused) return; paused = false; applyRun(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearSounds();
      paused = true;
      const current = scene;
      scene = null;
      starting = null;
      if (motionFrame && typeof env.cancelAnimationFrame === 'function') env.cancelAnimationFrame(motionFrame);
      motionFrame = 0;
      status = RENDERER_STATUS.fallback;
      ships.player = RENDERER_STATUS.fallback;
      ships.enemy = RENDERER_STATUS.fallback;
      publishStatus();
      try { current?.destroy?.(); } catch { /* teardown is best-effort */ }
    },
    status: () => status,
    shipStatus: () => ({player: ships.player, enemy: ships.enemy}),
    playedKey: () => playedKey,
  };
}
