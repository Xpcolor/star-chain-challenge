/**
 * 星链资产库。页面加载打包产物 ./asset-studio.bundle.mjs。
 * 静态导入 three 与 addons、./fleet.mjs、./audio-bank.mjs。
 * 可选环境贴图 ./assets/studio-light.hdr；缺失时用 RoomEnvironment。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { PLAYER_SHIP, FLEET } from './fleet.mjs';
import { createPortraitShip } from './portrait-ship.mjs';
import { AUDIO_BANK, createAudioBus } from './audio-bank.mjs';

const ROSTER = [PLAYER_SHIP, ...FLEET];
const BRIEFS = {
  aurora: '玩家座舰。双层后掠翼、背鳍稳定面和轴向离子炮，喷口是青色。',
  'fleet-01': '轻型探测器。球形光学核心、三片短鳍与单推进器。',
  'fleet-02': '轻型穿梭。一对短后掠翼，单尾喷。',
  'fleet-03': '截击机。短后掠翼加翼尖炮。',
  'fleet-04': '轻型飞碟。扁圆压力壳、径向装甲和一圈离子环。',
  'fleet-05': '双体。中轴两侧各有装甲吊舱和喷口，横梁相连。',
  'fleet-06': '开口环翼。驱动环和径向扇面，没有实心碟壳。',
  'fleet-07': '弦月。两侧弯月翼板、等离子缝和成对喷口。',
  'fleet-08': '双擎突击舰。尖锐舰首与两组重型圆柱推进器。',
  'fleet-09': '三体。中轴加两侧吊舱，并带后掠翼。',
  'fleet-10': '双环。驱动环外再浮着一圈离子颈环。',
  'fleet-11': '远航碟。扁圆壳、副浮环和背部反应堆光环。',
  'fleet-12': '多翼。双层后掠翼、背鳍和翼尖炮，喷口是紫色。',
  'fleet-13': '弦月旗舰。弯月翼面加上第二组喷口。',
  'fleet-14': '星环旗舰。开口双环，环外再加多层翼面。',
  'fleet-15': '重型飞碟。实心碟壳、副环，并向外伸展多层机翼。',
  'fleet-16': '核心旗舰。六条放射翼臂围绕悬浮的紫色星核展开。',
};
const HOLD = new Set(['heal1', 'heal3', 'victory', 'defeat']);
const FX_MS = { arrival: 1150, laser: 700, cannon: 1100, single: 760, burst: 1400, shield: 1400, repair: 1500, heal1: 900, heal3: 1700, victory: 1600, defeat: 2400 };
const PLAY_CLASSES = Object.keys(FX_MS).map((id) => `play-${id}`);

const sharedTextures = new Set();
const home = { position: new THREE.Vector3(6.2, 2.6, 7.4), target: new THREE.Vector3() };
const audioPrefs = { volume: 0.7, enabled: true, unlocked: false };

let bus = null;
try { bus = createAudioBus({ enabled: true, volume: audioPrefs.volume }); } catch { bus = null; }

const loader = new GLTFLoader();
const portraitLoader = new THREE.TextureLoader();
let presentation = 'model';
let selectedEntry = PLAYER_SHIP;
let selectedIndex = 0;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let rig = null;
let fxRoot = null;
let debrisRoot = null;
let shadow = null;
let model = null;
let matSnap = [];
let fxJob = null;
let fxTimer = 0;
let raf = 0;
let loading = false;
let loadToken = 0;
let fxTicket = 0;
let laterTimers = [];
let envTexture = null;
const debrisBox = new THREE.BoxGeometry(0.12, 0.05, 0.08);
const debrisChip = new THREE.OctahedronGeometry(0.06, 0);
debrisBox.userData.shared = true;
debrisChip.userData.shared = true;

function must(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`页面缺少 #${id}`);
  return el;
}

function reduced() {
  return document.documentElement.classList.contains('reduce');
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function seedDir(i) {
  const a = hash(i + 1) * Math.PI * 2;
  const z = hash(i + 2) * 2 - 1;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(Math.cos(a) * r, z, Math.sin(a) * r);
}

function easeOutCubic(t) { return 1 - (1 - t) ** 3; }
function easeInCubic(t) { return t ** 3; }

function candidates(entry) {
  const list = [];
  const add = (src) => { if (src && !list.includes(src)) list.push(src); };
  add(entry.fallback);
  if (entry.model) add(String(entry.model).replace(/\.glb(\?.*)?$/i, '.png'));
  return list;
}

function gradeOf(index) {
  return index === 0 ? '座舰' : `${index} 级`;
}

function lengthText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '时长未知';
  if (seconds < 1) return `${Math.round(seconds * 1000)} 毫秒`;
  return `${seconds.toFixed(2)} 秒`;
}

function disposeTree(root) {
  if (!root) return;
  const materials = new Set();
  const geometries = new Set();
  const textures = new Set();
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData.shared) geometries.add(obj.geometry);
    for (const material of [].concat(obj.material || [])) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value && value.isTexture && !sharedTextures.has(value)) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

function tuneMaterial(material) {
  if (!material || !material.color) return;
  const emissiveLum = material.emissive ? (material.emissive.r + material.emissive.g + material.emissive.b) / 3 : 0;
  if (emissiveLum > 0.2) {
    material.envMapIntensity = 0.35;
    return;
  }
  const name = material.name || '';
  if (/canopy|glass|polarized/i.test(name)) {
    material.metalness = Math.min(material.metalness ?? 0.2, 0.2);
    material.roughness = Math.min(Math.max(material.roughness ?? 0.12, 0.08), 0.32);
    material.envMapIntensity = 1.05;
    material.needsUpdate = true;
    return;
  }
  if (material.metalness === undefined) return;
  const lum = material.color.r * 0.2126 + material.color.g * 0.7152 + material.color.b * 0.0722;
  if (lum < 0.09 && material.metalness > 0.25) {
    material.color.lerp(new THREE.Color('#2a4254'), 0.62);
    material.metalness = 0.3;
    material.roughness = Math.max(material.roughness ?? 0.4, 0.52);
  } else if (lum > 0.62) {
    material.color.multiplyScalar(0.8);
    material.metalness = Math.min(material.metalness, 0.46);
    material.roughness = Math.max(material.roughness ?? 0.3, 0.42);
  }
  material.envMapIntensity = lum > 0.5 ? 0.5 : 0.8;
  material.needsUpdate = true;
}

function snapshotMaterials(root) {
  const list = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const material of [].concat(obj.material)) {
      const emissiveLum = material.emissive ? (material.emissive.r + material.emissive.g + material.emissive.b) / 3 : 0;
      list.push({
        m: material,
        opacity: material.opacity ?? 1,
        transparent: !!material.transparent,
        depthWrite: material.depthWrite !== false,
        emissive: material.emissive ? material.emissive.clone() : null,
        emissiveIntensity: material.emissiveIntensity ?? 0,
        glow: emissiveLum > 0.2,
      });
    }
  });
  return list;
}

function restoreShip() {
  if (!rig) return;
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  rig.scale.set(1, 1, 1);
  if (model) model.visible = true;
  for (const item of matSnap) {
    item.m.opacity = item.opacity;
    item.m.transparent = item.transparent;
    item.m.depthWrite = item.depthWrite;
    if (item.emissive) {
      item.m.emissive.copy(item.emissive);
      item.m.emissiveIntensity = item.emissiveIntensity;
    }
  }
  if (shadow?.material) shadow.material.opacity = 0.42;
}

function clearGroups() {
  for (const group of [fxRoot, debrisRoot]) {
    if (!group) continue;
    for (const child of [...group.children]) {
      group.remove(child);
      disposeTree(child);
    }
  }
}

function stopVisual() {
  fxJob = null;
  if (fxTimer) clearTimeout(fxTimer);
  fxTimer = 0;
  restoreShip();
  clearGroups();
  const stage = document.getElementById('stage');
  if (stage) {
    stage.classList.remove('is-still', ...PLAY_CLASSES);
  }
}

function clearModel() {
  stopVisual();
  if (!model || !rig) {
    model = null;
    matSnap = [];
    return;
  }
  rig.remove(model);
  disposeTree(model);
  model = null;
  matSnap = [];
  if (shadow) shadow.visible = false;
}

function clearLater() {
  for (const id of laterTimers) clearTimeout(id);
  laterTimers = [];
}

function anchors(pattern) {
  const found = [];
  if (!model || !rig) return found;
  model.updateWorldMatrix(true, true);
  model.traverse((obj) => {
    if (!pattern.test(obj.name || '')) return;
    const point = new THREE.Vector3();
    obj.getWorldPosition(point);
    rig.worldToLocal(point);
    found.push(point);
  });
  return found;
}

function anchorText(root) {
  const names = [];
  root.traverse((obj) => {
    if (/^(muzzle|shield_anchor|engine_\d+)$/.test(obj.name || '')) names.push(obj.name);
  });
  names.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  let meshes = 0;
  root.traverse((obj) => { if (obj.isMesh) meshes += 1; });
  const mounts = names.length ? names.join('、') : '未读到炮口 / 护盾 / 引擎挂点';
  return `网格 ${meshes} · 挂点 ${names.length}：${mounts}`;
}

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sharedTextures.add(texture);
  return texture;
}

let flashTexture = null;

function fireDirection() {
  return model?.userData.portrait && selectedIndex > 0 ? -1 : 1;
}

function makeBolt(color, length, radius, tip = 0.45) {
  const geometry = new THREE.CylinderGeometry(radius * tip, radius, length, 12, 1, true);
  geometry.rotateZ(-Math.PI / 2);
  geometry.translate(length / 2, 0, 0);
  if (fireDirection() < 0) geometry.rotateZ(Math.PI);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function makeSprite(scale, color) {
  const material = new THREE.SpriteMaterial({
    map: flashTexture,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  return sprite;
}

function makeRing(color, radius, facing) {
  const geometry = new THREE.TorusGeometry(radius, Math.max(0.015, radius * 0.07), 8, 40);
  if (facing === 'nose') geometry.rotateY(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function addSparks(origin, count, color, distance) {
  const positions = new Float32Array(count * 3);
  const dirs = [];
  for (let i = 0; i < count; i += 1) {
    dirs.push(seedDir(i + 3 + Math.round((origin.x + 4) * 5)));
    positions[i * 3] = origin.x;
    positions[i * 3 + 1] = origin.y;
    positions[i * 3 + 2] = origin.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 0.11,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  fxRoot.add(points);
  return (p) => {
    const attr = geometry.getAttribute('position');
    for (let i = 0; i < count; i += 1) {
      const dir = dirs[i];
      attr.setXYZ(i, origin.x + dir.x * distance * p, origin.y + dir.y * distance * p, origin.z + dir.z * distance * p);
    }
    attr.needsUpdate = true;
    material.opacity = 1 - p;
  };
}

function shieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color('#8ee7ff') },
      uOpacity: { value: 0.9 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.1);
        float ripple = 0.62 + 0.38 * sin(vWorld.y * 10.0 - uTime * 7.0);
        gl_FragColor = vec4(uColor, fresnel * ripple * uOpacity);
      }
    `,
  });
}

function startJob(duration, update, { hold = false, reducedAt = 1 } = {}) {
  if (reduced()) {
    update(reducedAt);
    if (hold) fxJob = { hold: true, elapsed: duration, tick() {} };
    else fxTimer = setTimeout(() => { stopVisual(); setPressed(''); }, 700);
    return;
  }
  const job = {
    t0: performance.now(),
    elapsed: 0,
    hold,
    tick(now) {
      job.elapsed = now - job.t0;
      const u = Math.min(1, job.elapsed / duration);
      update(u);
      if (u >= 1 && !hold) {
        stopVisual();
        setPressed('');
      }
    },
  };
  fxJob = job;
}

function boostGlow(scale) {
  for (const item of matSnap) {
    if (!item.glow) continue;
    item.m.emissiveIntensity = item.emissiveIntensity * scale;
  }
}

function fxArrival() {
  startJob(1150, (u) => {
    const e = easeOutCubic(u);
    rig.position.set(-7 * fireDirection() * (1 - e), 0.28 * (1 - e), 0);
    boostGlow(1 + 1.5 * (1 - e));
    if (shadow?.material) shadow.material.opacity = 0.42 * e;
  }, { reducedAt: 1 });
}

function fxLaser() {
  const muzzle = anchors(/^muzzle$/)[0] || new THREE.Vector3(2.5, 0, 0);
  const beam = makeBolt(0xe9fbff, 4.4, 0.03, 1);
  const halo = makeBolt(0x77d8ed, 4.4, 0.08, 1);
  const flash = makeSprite(0.7, 0xd8f6ff);
  beam.position.copy(muzzle);
  halo.position.copy(muzzle);
  flash.position.copy(muzzle);
  const light = new THREE.PointLight(0xb7f3ff, 0, 5);
  light.position.copy(muzzle);
  fxRoot.add(beam, halo, flash, light);
  startJob(700, (u) => {
    const show = u > 0.04 && u < 0.8;
    const grow = Math.min(1, Math.max(0, (u - 0.04) / 0.14));
    beam.visible = halo.visible = show;
    beam.scale.x = halo.scale.x = Math.max(grow, 0.02);
    beam.material.opacity = show ? 0.95 : 0;
    halo.material.opacity = show ? 0.28 : 0;
    const kick = u < 0.16 ? u / 0.16 : Math.max(0, 1 - (u - 0.16) / 0.24);
    rig.position.x = -0.14 * fireDirection() * (u < 0.42 ? kick : 0);
    flash.material.opacity = u < 0.2 ? u / 0.2 : Math.max(0, 1 - (u - 0.2) / 0.2);
    light.intensity = flash.material.opacity * 7;
  }, { reducedAt: 0.35 });
}

function fxCannon() {
  const muzzle = anchors(/^muzzle$/)[0] || new THREE.Vector3(2.5, 0, 0);
  const bolt = makeBolt(0xffb27a, 1.35, 0.11, 0.3);
  const flash = makeSprite(1.5, 0xffd0aa);
  const hitAt = muzzle.clone().add(new THREE.Vector3(3.1 * fireDirection(), 0, 0));
  const ring = makeRing(0xffbf86, 0.42, 'nose');
  ring.position.copy(hitAt);
  flash.position.copy(muzzle);
  bolt.position.copy(muzzle);
  const light = new THREE.PointLight(0xffb080, 0, 6);
  light.position.copy(muzzle);
  fxRoot.add(bolt, flash, ring, light);
  const sparks = addSparks(hitAt, 28, 0xffc49a, 1.15);
  startJob(1100, (u) => {
    const travel = Math.min(1, u / 0.62);
    bolt.position.x = muzzle.x + easeOutCubic(travel) * 3.1 * fireDirection();
    bolt.position.y = muzzle.y;
    bolt.position.z = muzzle.z;
    bolt.visible = u < 0.68;
    bolt.material.opacity = u < 0.62 ? 1 : Math.max(0, 1 - (u - 0.62) / 0.08);
    const kick = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 0.34);
    rig.position.x = -0.32 * fireDirection() * kick;
    flash.material.opacity = u < 0.18 ? 1 : Math.max(0, 1 - (u - 0.18) / 0.22);
    light.intensity = flash.material.opacity * 12;
    const hu = (u - 0.58) / 0.36;
    ring.visible = hu > 0 && hu < 1;
    if (ring.visible) {
      ring.scale.setScalar(0.35 + hu * 1.8);
      ring.material.opacity = 1 - hu;
      sparks(hu);
    }
  }, { reducedAt: 0.62 });
}

function fxSingle() {
  const muzzle = anchors(/^muzzle$/)[0] || new THREE.Vector3(2.5, 0, 0);
  const bolt = makeBolt(0xfff6d4, 0.72, 0.045, 0.25);
  const hitAt = muzzle.clone().add(new THREE.Vector3(2.7 * fireDirection(), 0, 0));
  const ring = makeRing(0xffe3a4, 0.28, 'nose');
  const flash = makeSprite(0.55, 0xfff1c9);
  ring.position.copy(hitAt);
  flash.position.copy(muzzle);
  bolt.position.copy(muzzle);
  fxRoot.add(bolt, ring, flash);
  const sparks = addSparks(hitAt, 14, 0xffe7b8, 0.7);
  startJob(760, (u) => {
    const travel = Math.min(1, u / 0.58);
    bolt.position.set(muzzle.x + easeOutCubic(travel) * 2.7 * fireDirection(), muzzle.y, muzzle.z);
    bolt.visible = u < 0.64;
    const kick = u < 0.14 ? u / 0.14 : Math.max(0, 1 - (u - 0.14) / 0.2);
    rig.position.x = -0.12 * fireDirection() * (u < 0.36 ? kick : 0);
    flash.material.opacity = u < 0.16 ? 1 : Math.max(0, 1 - (u - 0.16) / 0.16);
    const hu = (u - 0.55) / 0.38;
    ring.visible = hu > 0 && hu < 1;
    if (ring.visible) {
      ring.scale.setScalar(0.3 + hu * 1.5);
      ring.material.opacity = 1 - hu;
      sparks(Math.min(1, hu));
    }
  }, { reducedAt: 0.7 });
}

function fxBurst() {
  const muzzle = anchors(/^muzzle$/)[0] || new THREE.Vector3(2.5, 0, 0);
  const lanes = [-0.36, -0.12, 0.12, 0.36];
  const shots = lanes.map((y, i) => {
    const bolt = makeBolt(0xd7f4ff, 0.85, 0.03, 0.3);
    const ring = makeRing(0xc8f1ff, 0.16, 'nose');
    const flash = makeSprite(0.36, 0xe7f8ff);
    bolt.position.set(muzzle.x, muzzle.y + y, muzzle.z);
    ring.position.set(muzzle.x + 2.35 * fireDirection(), muzzle.y + y, muzzle.z);
    flash.position.set(muzzle.x, muzzle.y + y, muzzle.z);
    bolt.visible = false;
    ring.visible = false;
    flash.visible = false;
    fxRoot.add(bolt, ring, flash);
    return { bolt, ring, flash, y, i };
  });
  startJob(1400, (u) => {
    let kick = 0;
    for (const shot of shots) {
      const start = shot.i * 0.16;
      const local = (u - start) / 0.24;
      shot.bolt.visible = local > 0 && local < 1;
      shot.flash.visible = local > 0 && local < 0.28;
      shot.ring.visible = local > 0.68 && local < 1.15;
      if (local >= 0 && local <= 1) {
        shot.bolt.position.x = muzzle.x + local * 2.35 * fireDirection();
        if (local < 0.18) kick = Math.max(kick, 1 - local / 0.18);
      }
      if (shot.flash.visible) shot.flash.material.opacity = 1 - local / 0.28;
      if (shot.ring.visible) {
        const k = Math.min(1, (local - 0.68) / 0.4);
        shot.ring.scale.setScalar(0.4 + k);
        shot.ring.material.opacity = 1 - k;
      }
    }
    rig.position.x = -0.06 * fireDirection() * kick;
  }, { reducedAt: 0.62 });
}

function fxShield() {
  const center = anchors(/^shield_anchor$/)[0] || new THREE.Vector3();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.15, 42, 28), shieldMaterial());
  shell.position.copy(center);
  const ringA = makeRing(0x9aefff, 1.05);
  const ringB = makeRing(0xc8b0ff, 0.72);
  ringA.position.copy(center);
  ringB.position.copy(center);
  ringB.rotation.x = 1.05;
  fxRoot.add(shell, ringA, ringB);
  startJob(1400, (u) => {
    const fade = Math.sin(Math.min(1, u) * Math.PI);
    shell.material.uniforms.uTime.value = u * 4;
    shell.material.uniforms.uOpacity.value = 0.35 + fade * 0.7;
    shell.scale.setScalar(0.86 + Math.sin(u * Math.PI * 3) * 0.04 + u * 0.08);
    ringA.scale.setScalar(0.7 + u * 0.85);
    ringB.scale.setScalar(0.55 + u * 0.7);
    ringA.material.opacity = fade * 0.85;
    ringB.material.opacity = fade * 0.55;
  }, { reducedAt: 0.45 });
}

function fxRepair() {
  const ringA = makeRing(0x8de2bd, 1.2);
  const ringB = makeRing(0xd8ffe9, 0.78);
  ringB.rotation.x = 1.15;
  fxRoot.add(ringA, ringB);
  const count = 40;
  const positions = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i += 1) {
    seeds.push(seedDir(i + 80));
    positions[i * 3 + 1] = -0.6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xb9ffe2,
    size: 0.09,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  fxRoot.add(new THREE.Points(geometry, material));
  const light = new THREE.PointLight(0x8de2bd, 0, 5);
  fxRoot.add(light);
  startJob(1500, (u) => {
    const fade = Math.sin(u * Math.PI);
    ringA.scale.setScalar(0.8 + u * 0.45);
    ringB.scale.setScalar(0.62 + u * 0.3);
    ringA.material.opacity = fade * 0.75;
    ringB.material.opacity = fade * 0.5;
    light.intensity = fade * 4;
    const attr = geometry.getAttribute('position');
    for (let i = 0; i < count; i += 1) {
      const dir = seeds[i];
      const rise = (u * 1.4 + hash(i + 5)) % 1;
      attr.setXYZ(i, dir.x * (0.35 + rise * 0.9), -0.7 + rise * 1.8, dir.z * (0.35 + rise * 0.9));
    }
    attr.needsUpdate = true;
    material.opacity = 0.35 + fade * 0.65;
  }, { reducedAt: 0.5 });
}

function healOrb(x) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xc8ffe4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), material);
  mesh.position.set(x, 0.92, 0);
  return mesh;
}

function fxHeal1() {
  const orb = healOrb(0);
  orb.scale.setScalar(1.35);
  const ring = makeRing(0xb9ffe2, 0.34);
  ring.position.copy(orb.position);
  const light = new THREE.PointLight(0x9dffcf, 0, 3.2);
  light.position.copy(orb.position);
  fxRoot.add(orb, ring, light);
  const sparks = addSparks(orb.position.clone(), 10, 0xc8ffe4, 0.45);
  startJob(900, (u) => {
    const on = Math.min(1, u / 0.28);
    orb.material.opacity = on;
    light.intensity = on * 3.5;
    const ru = Math.min(1, Math.max(0, (u - 0.12) / 0.55));
    ring.scale.setScalar(0.4 + ru * 1.3);
    ring.material.opacity = on * (1 - ru);
    if (u > 0.12) sparks(Math.min(1, (u - 0.12) / 0.7));
  }, { hold: true, reducedAt: 1 });
}

function fxHeal3() {
  const spots = [-0.62, 0, 0.62];
  const orbs = spots.map((x) => healOrb(x));
  const rings = orbs.map((orb) => {
    const ring = makeRing(0x9ddec4, 0.22);
    ring.position.copy(orb.position);
    return ring;
  });
  const bursts = orbs.map((orb, i) => addSparks(orb.position.clone(), 8, 0xd8ffe8, 0.36 + i * 0.02));
  fxRoot.add(...orbs, ...rings);
  startJob(1700, (u) => {
    orbs.forEach((orb, i) => {
      const start = i * 0.28;
      const on = u > start ? Math.min(1, (u - start) / 0.12) : 0;
      orb.material.opacity = on;
      const ru = (u - start - 0.05) / 0.34;
      rings[i].visible = ru > 0 && ru < 1;
      if (rings[i].visible) {
        rings[i].scale.setScalar(0.35 + ru * 1.4);
        rings[i].material.opacity = 1 - ru;
      }
      if (u > start) bursts[i](Math.min(1, (u - start) / 0.45));
    });
  }, { hold: true, reducedAt: 1 });
}

function fxVictory() {
  const engines = anchors(/^engine_\d+$/);
  if (!engines.length) engines.push(new THREE.Vector3(-2.2, 0, 0));
  const flares = engines.map((point) => {
    const geometry = new THREE.ConeGeometry(0.1, 0.95, 10, 1, true);
    geometry.translate(0, 0.48, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffe1a2,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(point);
    mesh.rotation.z = Math.PI / 2 * fireDirection();
    return mesh;
  });
  const light = new THREE.PointLight(0xffcf6f, 0, 6);
  light.position.set(0, 1.2, 0);
  fxRoot.add(light, ...flares);
  startJob(1600, (u) => {
    const e = easeOutCubic(u);
    rig.position.y = e * 0.9;
    rig.rotation.z = -e * 0.08;
    boostGlow(1 + e * 1.8);
    light.intensity = e * 6;
    for (const flare of flares) {
      flare.scale.y = 0.3 + e * 1.4;
      flare.material.opacity = 0.25 + e * 0.7;
    }
  }, { hold: true, reducedAt: 1 });
}

function fxDefeat() {
  let born = false;
  const debris = [];
  startJob(2400, (u) => {
    const e = easeInCubic(u);
    rig.position.set(-e * 1.15, -e * 1.85, e * 0.42);
    rig.rotation.set(e * 0.12, e * (model?.userData.portrait ? 0.18 : 1.7), e * 2.35);
    const fade = u < 0.22 ? 1 : Math.max(0, 1 - (u - 0.22) / 0.5);
    for (const item of matSnap) {
      item.m.transparent = true;
      item.m.opacity = fade;
      item.m.depthWrite = fade > 0.8;
    }
    if (shadow?.material) shadow.material.opacity = 0.42 * fade;
    if (model && u > 0.7) model.visible = false;
    if (!born && u > 0.38) {
      born = true;
      for (let i = 0; i < 22; i += 1) {
        const geometry = i < 8 ? debrisBox : debrisChip;
        const material = new THREE.MeshStandardMaterial({
          color: [0x8aa4b8, 0x77d8ed, 0xbda5ff, 0xc4784a, 0x31495c][i % 5],
          metalness: 0.35,
          roughness: 0.48,
          emissive: i % 4 === 0 ? new THREE.Color('#143848') : new THREE.Color('#000000'),
          emissiveIntensity: 0.5,
        });
        const mesh = new THREE.Mesh(geometry, material);
        const local = seedDir(i + 15).multiplyScalar(0.15 + hash(i + 4) * 1.15);
        rig.localToWorld(mesh.position.copy(local));
        mesh.userData.origin = mesh.position.clone();
        mesh.userData.velocity = seedDir(i + 30).multiplyScalar(0.45 + hash(i + 8) * 1.3);
        mesh.userData.velocity.y -= 0.35;
        mesh.userData.spin = seedDir(i + 50);
        debrisRoot.add(mesh);
        debris.push(mesh);
      }
    }
    const k = Math.max(0, (u - 0.38) / 0.62);
    for (const mesh of debris) {
      mesh.position.copy(mesh.userData.origin).addScaledVector(mesh.userData.velocity, k);
      mesh.rotation.set(mesh.userData.spin.x * k * 5, mesh.userData.spin.y * k * 5, mesh.userData.spin.z * k * 4);
    }
  }, { hold: true, reducedAt: 1 });
}

const BUILD = {
  arrival: fxArrival,
  laser: fxLaser,
  cannon: fxCannon,
  single: fxSingle,
  burst: fxBurst,
  shield: fxShield,
  repair: fxRepair,
  heal1: fxHeal1,
  heal3: fxHeal3,
  victory: fxVictory,
  defeat: fxDefeat,
};

function useFlat() {
  return !renderer || !model || document.getElementById('stage')?.classList.contains('is-flat');
}

function setPressed(id) {
  for (const button of document.querySelectorAll('#effects [data-fx]')) {
    button.setAttribute('aria-pressed', button.dataset.fx === id ? 'true' : 'false');
  }
}

function runVisual(id) {
  const stage = must('stage');
  const caption = must('fx-caption');
  const button = document.querySelector(`#effects [data-fx="${id}"]`);
  stopVisual();
  setPressed(id);
  caption.textContent = button?.dataset.blurb || '正在预览。';
  if (useFlat()) {
    stage.classList.add(`play-${id}`);
    if (reduced()) stage.classList.add('is-still');
    if (!HOLD.has(id)) {
      const ms = reduced() ? 700 : (FX_MS[id] || 800);
      fxTimer = setTimeout(() => {
        stage.classList.remove(`play-${id}`, 'is-still');
        setPressed('');
      }, ms);
    }
    return;
  }
  BUILD[id]?.();
}

async function loadEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const note = document.getElementById('env-note');
  try {
    try {
      const hdr = await new HDRLoader().loadAsync(new URL('./assets/studio-light.hdr', import.meta.url).href);
      const texture = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      if (note) note.textContent = '环境光：studio-light.hdr';
      return { texture, intensity: 0.58 };
    } catch {
      const room = new RoomEnvironment();
      const texture = pmrem.fromScene(room, 0.04).texture;
      disposeTree(room);
      if (note) note.textContent = '环境光：室内采样。未使用 studio-light.hdr。';
      return { texture, intensity: 0.42 };
    }
  } catch {
    if (note) note.textContent = '环境光没有生成，仅使用直接光。';
    return { texture: null, intensity: 1 };
  } finally {
    pmrem.dispose();
  }
}

function applyHome() {
  if (!camera || !controls) return;
  camera.position.copy(home.position);
  controls.target.copy(home.target);
  controls.update();
}

function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  object.updateWorldMatrix(true, true);
  const fitted = new THREE.Box3().setFromObject(object);
  const sphere = fitted.getBoundingSphere(new THREE.Sphere());
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.72;
  home.position.set(dist * 0.42, dist * 0.55, dist * 0.86);
  if (object.userData.portrait) home.position.set(0, 0, dist * 1.1);
  controls.enableRotate = !object.userData.portrait;
  home.target.set(0, 0, 0);
  controls.minDistance = Math.max(sphere.radius * 0.65, 0.35);
  controls.maxDistance = sphere.radius * 7.5;
  applyHome();
  if (shadow) {
    shadow.visible = !object.userData.portrait;
    shadow.position.set(0, fitted.min.y - 0.03, 0);
    const span = Math.max(fitted.getSize(new THREE.Vector3()).x, 1);
    shadow.scale.set(span * 0.72, 1, span * 0.4);
    shadow.material.opacity = 0.42;
  }
}

function mountModel(root) {
  clearModel();
  model = root;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const material of [].concat(obj.material || [])) tuneMaterial(material);
  });
  rig.add(model);
  frameModel(model);
  matSnap = snapshotMaterials(model);
  const stage = must('stage');
  stage.classList.remove('is-flat');
  must('fallback').hidden = true;
  if (controls) controls.enabled = true;
}

function resize() {
  if (!renderer || !camera) return;
  const stage = must('stage');
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
}

function loop(now) {
  if (!renderer || document.hidden) return;
  raf = requestAnimationFrame(loop);
  if (fxJob) fxJob.tick(now);
  if (!fxJob && matSnap.length && !reduced()) {
    const wave = 0.78 + 0.22 * Math.sin(now * 0.003);
    for (const item of matSnap) {
      if (item.glow) item.m.emissiveIntensity = item.emissiveIntensity * wave;
    }
  }
  controls?.update();
  renderer.render(scene, camera);
}

function createRenderer() {
  try {
    const instance = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    if (!instance.getContext()) {
      instance.dispose();
      return null;
    }
    return instance;
  } catch {
    return null;
  }
}

function enterFlat(message, allowRetry = false) {
  cancelAnimationFrame(raf);
  const stage = must('stage');
  stage.classList.add('is-flat');
  must('fallback').hidden = false;
  if (controls) controls.enabled = false;
  must('retry-gl').hidden = !allowRetry;
  setLoading(false);
  say(message, true);
}

function initScene() {
  renderer = createRenderer();
  if (!renderer) {
    must('retry-gl').hidden = false;
    say('无法创建 WebGL，已改用平面舰图。音效不依赖三维。', true);
    return false;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    model = null;
    matSnap = [];
    renderer = null;
    enterFlat('图形上下文已丢失，已改用平面舰图。音效仍可使用。', true);
  });
  const stage = must('stage');
  stage.insertBefore(renderer.domElement, stage.firstChild);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.08, 200);
  camera.position.copy(home.position);
  rig = new THREE.Group();
  fxRoot = new THREE.Group();
  debrisRoot = new THREE.Group();
  rig.add(fxRoot);
  scene.add(rig, debrisRoot);
  scene.add(new THREE.HemisphereLight(0xb7d7ea, 0x241433, 0.32));
  const key = new THREE.DirectionalLight(0xfff1df, 1.02);
  key.position.set(5.5, 7.2, 6);
  const rim = new THREE.DirectionalLight(0x67d4f0, 0.72);
  rim.position.set(-7, 2.4, -3);
  const fill = new THREE.DirectionalLight(0xb59cff, 0.34);
  fill.position.set(-1.5, 1.2, 7);
  scene.add(key, rim, fill);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const g = shadowCanvas.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const shadowMap = new THREE.CanvasTexture(shadowCanvas);
  sharedTextures.add(shadowMap);
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  shadowGeo.userData.shared = true;
  shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: shadowMap,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  }));
  shadow.visible = false;
  scene.add(shadow);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.85;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.minPolarAngle = 0.12;
  controls.target.copy(home.target);
  flashTexture = radialTexture();
  resize();
  new ResizeObserver(() => resize()).observe(stage);
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(loop);
  loadEnvironment().then((env) => {
    if (!renderer || !scene || !env.texture) {
      env.texture?.dispose();
      return;
    }
    envTexture = env.texture;
    scene.environment = env.texture;
    scene.environmentIntensity = env.intensity;
  }).catch(() => {});
  return true;
}

function say(text, overlay = false) {
  const status = document.getElementById('status');
  const stageMsg = document.getElementById('stage-msg');
  if (status) status.textContent = text;
  if (!stageMsg) return;
  if (overlay) {
    stageMsg.hidden = false;
    stageMsg.textContent = text;
  } else if (!loading) stageMsg.hidden = true;
}

function setLoading(on) {
  loading = on;
  must('stage').setAttribute('aria-busy', on ? 'true' : 'false');
  for (const button of document.querySelectorAll('#effects [data-fx]')) {
    if (button.dataset.fx !== 'reset') button.disabled = on && !!renderer;
  }
}

function showPortrait(entry, token) {
  const img = must('fallback-img');
  const figure = must('fallback');
  const urls = candidates(entry);
  let index = 0;
  const step = () => {
    if (token !== loadToken) return;
    if (index >= urls.length) {
      if (!model) {
        figure.hidden = false;
        must('stage').classList.add('is-flat');
        say(`${entry.name} 的平面舰图也没有载入。`, true);
      }
      return;
    }
    const src = urls[index];
    index += 1;
    img.alt = '';
    img.src = src;
  };
  img.onload = () => {
    if (token !== loadToken || model) return;
    figure.hidden = false;
    must('stage').classList.add('is-flat');
  };
  img.onerror = () => step();
  step();
  if (img.complete && img.naturalWidth > 0 && token === loadToken && !model) {
    figure.hidden = false;
    must('stage').classList.add('is-flat');
  }
}

function fillMeta(entry, index) {
  const grade = gradeOf(index);
  must('grade').textContent = grade;
  must('ship-name').textContent = entry.name;
  must('ship-brief').textContent = BRIEFS[entry.id] || entry.name;
  must('ship-spec').textContent = `设计长度 ${lengthText(entry.length)} · 标准模型长度 6 · 机首 +X · 上方 +Y`;
  must('library-current').textContent = `${grade} · ${entry.name}`;
}

function markSelected(index) {
  const buttons = [...document.querySelectorAll('#fleet .thumb')];
  buttons.forEach((button, i) => {
    button.setAttribute('aria-pressed', i === index ? 'true' : 'false');
  });
  buttons[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function selectShip(entry, index, user) {
  selectedEntry = entry;
  selectedIndex = index;
  const token = ++loadToken;
  clearLater();
  markSelected(index);
  fillMeta(entry, index);
  clearModel();
  showPortrait(entry, token);
  if (user) void cueSelect();
  if (!renderer) {
    setLoading(false);
    must('stage').classList.add('is-flat');
    must('fallback').hidden = false;
    if (controls) controls.enabled = false;
    say(`${entry.name} 使用平面舰图。当前没有可用的 WebGL。`);
    return;
  }
  setLoading(true);
  say(`正在加载${entry.name}…`, true);
  try {
    let root;
    if (presentation === 'art') {
      const texture = await portraitLoader.loadAsync(entry.portrait);
      if (token !== loadToken) { texture.dispose(); return; }
      root = createPortraitShip(entry, texture, index > 0);
    } else {root = (await loader.loadAsync(entry.detailedModel||entry.model)).scene;root.traverse(o=>{if(o.name.startsWith('debris_'))o.visible=false;});}
    if (token !== loadToken) {
      disposeTree(root);
      return;
    }
    mountModel(root);
    must('ship-spec').textContent = presentation === 'art' ? '独立等级外观 · 精细舰图 + Three.js 空间动效' : `精细三维舰船 · 标准模型长度 6 · ${anchorText(model)}`;
    must('stage-note').textContent = presentation === 'art' ? '滚轮缩放 · 下方试听与动效预览' : '拖拽旋转 · 滚轮缩放 · 用户生成纹理模型';
    setLoading(false);
    say(`已显示${entry.name}。`);
  } catch (error) {
    if (token !== loadToken) return;
    clearModel();
    must('stage').classList.add('is-flat');
    must('fallback').hidden = false;
    if (controls) controls.enabled = false;
    setLoading(false);
    say(`${entry.name} 的模型没有载入（${error?.message || '加载失败'}）。已改用平面舰图。`, true);
  }
}

async function arm() {
  if (!bus || !audioPrefs.enabled) return false;
  if (audioPrefs.unlocked) return true;
  let ok = false;
  try { ok = await bus.unlock(); } catch { ok = false; }
  audioPrefs.unlocked = !!ok;
  if (!ok) {
    say('浏览器没有开放音效。请再点一次按钮。', true);
    return false;
  }
  try {
    bus.setVolume(audioPrefs.volume);
    bus.setEnabled(true);
  } catch { /* 音量在下次播放时再生效 */ }
  return true;
}

async function cueSelect() {
  const canHear = await arm();
  if (!canHear) return;
  try {
    bus.stop();
    await bus.play('select');
  } catch { /* 选舰音效失败时仍可继续浏览 */ }
}

function scheduleSounds(id) {
  const at = (ms, name) => {
    laterTimers.push(setTimeout(() => { bus?.play(name); }, ms));
  };
  if (id === 'arrival') at(0, 'arrival');
  else if (id === 'laser') at(0, 'laser');
  else if (id === 'cannon') { at(0, 'cannon'); at(520, 'impact'); }
  else if (id === 'single') { at(0, 'laser'); at(280, 'impact'); }
  else if (id === 'burst') {
    [0, 150, 300, 450].forEach((ms) => at(ms, 'laser'));
    at(560, 'impact');
  }
  else if (id === 'shield') at(0, 'shield');
  else if (id === 'repair' || id === 'heal1') at(0, 'repair');
  else if (id === 'heal3') [0, 380, 760].forEach((ms) => at(ms, 'repair'));
  else if (id === 'victory') at(0, 'victory');
  else if (id === 'defeat') { at(0, 'defeat'); at(780, 'collapse'); }
}

async function onFxClick(id) {
  const ticket = ++fxTicket;
  if (loading && id !== 'reset') {
    say('模型还在加载，请稍候。');
    return;
  }
  const canHear = await arm();
  if (ticket !== fxTicket) return;
  clearLater();
  if (canHear) {
    try { bus.stop(); } catch { /* 停止失败不阻断画面 */ }
  }
  if (id === 'reset') {
    stopVisual();
    applyHome();
    setPressed('');
    must('fx-caption').textContent = '预览已清空，视角回到初始机位。';
    if (canHear) {
      try { await bus.play('confirm'); } catch { /* 确认音缺失时只保留画面重置 */ }
    }
    say(renderer ? '预览和视角已重置。' : '预览已重置。当前是平面舰图，没有三维视角。');
    return;
  }
  runVisual(id);
  if (ticket !== fxTicket) return;
  if (canHear) scheduleSounds(id);
  const button = document.querySelector(`#effects [data-fx="${id}"]`);
  say(`正在预览${button?.textContent?.trim() || '特效'}。`);
}

function bindThumb(img, button, entry) {
  const urls = candidates(entry);
  let index = 0;
  const next = () => {
    if (index >= urls.length) {
      img.hidden = true;
      button.classList.add('is-blank');
      return;
    }
    const src = urls[index];
    index += 1;
    img.hidden = false;
    img.src = src;
  };
  img.addEventListener('load', () => {
    img.hidden = false;
    button.classList.remove('is-blank');
  });
  img.addEventListener('error', next);
  next();
}

function buildFleet() {
  const fleet = must('fleet');
  ROSTER.forEach((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `thumb${index === 0 ? ' is-player' : ''}`;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${gradeOf(index)}，${entry.name}`);
    const figure = document.createElement('span');
    figure.className = 'thumb-figure';
    const img = document.createElement('img');
    img.alt = '';
    img.width = 720;
    img.height = 460;
    img.decoding = 'async';
    const mono = document.createElement('span');
    mono.className = 'mono';
    mono.setAttribute('aria-hidden', 'true');
    mono.textContent = (entry.name || '舰').slice(0, 1);
    figure.append(img, mono);
    const meta = document.createElement('span');
    const level = document.createElement('b');
    level.className = 'lvl';
    level.textContent = gradeOf(index);
    const name = document.createElement('span');
    name.className = 'nm';
    name.textContent = entry.name;
    meta.append(level, name);
    button.append(figure, meta);
    button.addEventListener('click', () => { selectShip(entry, index, true); });
    fleet.append(button);
    bindThumb(img, button, entry);
  });
  fleet.addEventListener('keydown', (event) => {
    const buttons = [...fleet.querySelectorAll('.thumb')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    const cols = fleet.classList.contains('is-strip') || getComputedStyle(fleet).display === 'flex' ? 1 : 2;
    let next = index;
    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowDown') next = index + cols;
    else if (event.key === 'ArrowUp') next = index - cols;
    else return;
    event.preventDefault();
    const target = buttons[(next + buttons.length) % buttons.length];
    target.focus();
    target.click();
  });
}

function syncMute() {
  const button = must('mute');
  const enabled = bus ? bus.enabled : audioPrefs.enabled;
  button.setAttribute('aria-pressed', enabled ? 'false' : 'true');
  button.textContent = enabled ? '静音' : '取消静音';
}

function buildAudio() {
  const list = must('audio-list');
  const note = must('audio-note');
  const entries = Array.isArray(AUDIO_BANK) ? AUDIO_BANK : [];
  if (!entries.length || !bus) {
    note.textContent = '音效总线不可用。画面预览仍可使用。';
  }
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = !bus;
    const title = document.createElement('span');
    title.textContent = entry.name || entry.id;
    const time = document.createElement('small');
    time.textContent = formatDuration(Number(entry.duration));
    button.append(title, time);
    button.addEventListener('click', () => playClip(entry));
    list.append(button);
  }
  const volume = must('volume');
  const read = must('volume-read');
  volume.addEventListener('input', () => {
    audioPrefs.volume = Number(volume.value);
    read.textContent = `${Math.round(audioPrefs.volume * 100)}%`;
    if (bus) {
      try { bus.setVolume(audioPrefs.volume); } catch { say('音量没有设置成功。', true); }
    }
  });
  must('mute').addEventListener('click', () => {
    audioPrefs.enabled = !(bus ? bus.enabled : audioPrefs.enabled);
    if (bus) {
      try { bus.setEnabled(audioPrefs.enabled); } catch { say('静音开关没有生效。', true); }
    }
    syncMute();
    say(audioPrefs.enabled ? '音效已打开。' : '音效已静音。');
  });
  syncMute();
}

async function playClip(entry) {
  if (!bus) {
    say('音效总线不可用。');
    return;
  }
  if (!audioPrefs.enabled) {
    say('音效已静音。');
    return;
  }
  const canHear = await arm();
  if (!canHear) return;
  clearLater();
  try { bus.stop(); } catch { /* 继续尝试播放所选片段 */ }
  let played = false;
  try { played = await bus.play(entry.id); } catch { played = false; }
  say(played ? `正在播放${entry.name}。` : `没有播出${entry.name}。`, !played);
}

const TAB_COPY = { fleet: '舰队', visual: '画面', audio: '音效' };

function selectTab(view) {
  const layout = must('layout');
  layout.dataset.view = view;
  const panels = { fleet: must('panel-fleet'), visual: must('panel-visual'), audio: must('panel-audio') };
  for (const [id, panel] of Object.entries(panels)) {
    const on = id === view;
    panel.hidden = !on;
    const tab = must(`tab-${id}`);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  }
  const fleet = must('fleet');
  const slot = must('strip-slot');
  if (view === 'fleet') {
    panels.fleet.append(fleet);
    fleet.classList.remove('is-strip');
    slot.hidden = true;
  } else {
    slot.hidden = false;
    slot.append(fleet);
    fleet.classList.add('is-strip');
  }
  must('side-title').textContent = TAB_COPY[view] || '目录';
}

function bindChrome() {
  for (const [id,mode] of [['view-art','art'],['view-model','model']]) {
    must(id).addEventListener('click', () => {
      if (presentation === mode) return;
      presentation=mode;
      must('view-art').setAttribute('aria-pressed',mode==='art'?'true':'false');
      must('view-model').setAttribute('aria-pressed',mode==='model'?'true':'false');
      void selectShip(selectedEntry,selectedIndex,false);
    });
  }
  const tabs = must('layout').querySelector('.tabs');
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[role="tab"]');
    if (button?.dataset.view) selectTab(button.dataset.view);
  });
  tabs.addEventListener('keydown', (event) => {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
    selectTab(buttons[next].dataset.view);
  });
  must('effects').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-fx]');
    if (!button || button.disabled) return;
    onFxClick(button.dataset.fx);
  });
  must('reset-view').addEventListener('click', () => {
    if (!renderer || !controls) {
      say('当前是平面舰图，没有可重置的三维视角。');
      return;
    }
    applyHome();
    say('视角已回到初始机位。');
  });
  const motion = must('motion');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let touched = false;
  const applyMotion = (on) => {
    document.documentElement.classList.toggle('reduce', on);
    motion.setAttribute('aria-pressed', on ? 'true' : 'false');
    motion.textContent = on ? '恢复动效' : '减少动效';
    if (on) stopVisual();
  };
  applyMotion(document.documentElement.classList.contains('reduce') || motionQuery.matches);
  motion.addEventListener('click', () => {
    touched = true;
    applyMotion(!document.documentElement.classList.contains('reduce'));
  });
  motionQuery.addEventListener?.('change', (event) => {
    if (!touched) applyMotion(event.matches);
  });
  must('retry-gl').addEventListener('click', () => { window.location.reload(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      return;
    }
    if (fxJob) fxJob.t0 = performance.now() - (fxJob.elapsed || 0);
    if (audioPrefs.unlocked) bus?.unlock()?.catch?.(() => {});
    if (renderer) raf = requestAnimationFrame(loop);
  });
  window.addEventListener('pagehide', () => {
    try { bus?.dispose(); } catch { /* 页面离开时上下文可能已经关闭 */ }
    envTexture?.dispose();
  });
}

async function boot() {
  bindChrome();
  buildFleet();
  buildAudio();
  initScene();
  if (ROSTER.length !== 17) say(`舰队条目是 ${ROSTER.length} 个，预期座舰加 16 级。`, true);
  const first = ROSTER[0];
  if (!first) {
    say('舰队数据是空的。', true);
    return;
  }
  await selectShip(first, 0, false);
}

if (typeof document !== 'undefined') {
  const start = () => { boot().catch((error) => say(`资产库没有启动（${error?.message || '未知错误'}）。`, true)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
