/**
 * Persistent WebGL battle scene.
 * Public API: createBattleScene({readRects, onStatus}) →
 * {attach, sync, play, reset, setReducedMotion, pause, resume, destroy, status, shipStatus}.
 * Only the player ship and the current enemy are loaded. FX read combatCue; they do not deal damage.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {combatCue} from './combat-fx.mjs';
import {PLAYER_SHIP, FLEET} from './fleet.mjs';
import {createPortraitShip} from './portrait-ship.mjs';
export {createSpaceScene} from './space-scene.mjs';

const TARGET_WIDTH = 6.2 / 0.41;
const HDR_URLS = ['./assets/studio-light.hdr', './studio-light.hdr'];
const ROLES = ['player', 'enemy'];

function displayLength(entry) {
  const n = Number(entry?.length);
  if (!Number.isFinite(n)) return 5.4;
  return Math.min(6.2, Math.max(4.6, n));
}

function disposeMaterial(material, seen) {
  const list = Array.isArray(material) ? material : material ? [material] : [];
  for (const item of list) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) item[key]?.dispose?.();
    item.dispose?.();
  }
}

function disposeTemplate(root) {
  if (!root) return;
  const geos = new Set();
  const mats = new Set();
  root.traverse(obj => {
    if (obj.geometry && !geos.has(obj.geometry)) {
      geos.add(obj.geometry);
      obj.geometry.dispose?.();
    }
    disposeMaterial(obj.material, mats);
  });
}

function disposeOwned(root) {
  const owned = [];
  root.traverse(obj => { if (obj.userData?.owned) owned.push(obj); });
  const mats = new Set();
  for (const obj of owned) {
    obj.geometry?.dispose?.();
    disposeMaterial(obj.material, mats);
  }
}

function easeOut(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export function createBattleScene(options = {}) {
  const readRects = options.readRects || (() => null);
  const onStatus = options.onStatus;
  const loader = new GLTFLoader();
  const portraits = new THREE.TextureLoader();
  const cache = new Map();
  const warned = new Set();
  const groups = {player: new THREE.Group(), enemy: new THREE.Group()};
  const bases = {player: new THREE.Vector3(), enemy: new THREE.Vector3()};
  const arrive = {player: 1, enemy: 1};
  const doom = {
    player: {started: false, age: 0, spawned: false},
    enemy: {started: false, age: 0, spawned: false},
  };
  const live = {player: '', enemy: ''};
  const shown = {player: '', enemy: ''};
  const tokens = {player: 0, enemy: 0};
  const shipState = {player: 'loading', enemy: 'loading'};
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  let scene3 = null;
  let camera = null;
  let renderer = null;
  let canvas = null;
  let host = null;
  let envMap = null;
  let beam = null;
  let shieldRing = null;
  let shieldBubble = null;
  let impactRing = null;
  let healRing = null;
  let healRings = [];
  let stars = null;
  let playerLight = null;
  let enemyLight = null;
  let fx = null;
  let shards = [];
  let view = {width: TARGET_WIDTH, height: TARGET_WIDTH / 1.6, fit: 1};
  let showShips = false;
  let arriveStarted = false;
  let reduced = false;
  let dead = false;
  let paused = false;
  let loopOn = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let status = 'fallback';
  let attached = false;
  let lost = false;
  let lastSize = '';
  const look = {x:0,y:0,tx:0,ty:0};
  let charge = 0;
  const onPointer = e => {look.tx=(e.clientX/innerWidth-.5)*2;look.ty=(e.clientY/innerHeight-.5)*2;};
  const onVisual = e => {charge=Math.min(5,Math.max(0,Number(e.detail?.charge)||0));};

  function report(next = status) {
    status = next;
    onStatus?.({status, ships: {player: shipState.player, enemy: shipState.enemy}});
  }

  function combine() {
    if (!renderer || lost) return 'fallback';
    if (shipState.player === 'loading' || shipState.enemy === 'loading') return 'loading';
    if (shipState.player === 'ready' && shipState.enemy === 'ready') return 'ready';
    return 'fallback';
  }

  function pixelRatio() {
    const raw = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return Math.min(reduced ? 1.5 : 2, Math.max(1, raw));
  }

  function stopLoop() {
    loopOn = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function startLoop() {
    if (loopOn || dead || !renderer || paused) return;
    loopOn = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function clearShards() {
    for (const mesh of shards) {
      mesh.removeFromParent();
      disposeOwned(mesh);
    }
    shards = [];
  }

  function clearRole(role) {
    const group = groups[role];
    disposeOwned(group);
    group.clear();
    group.userData.ready = false;
  }

  function trim() {
    for (const [url, entry] of [...cache.entries()]) {
      if (url === live.player || url === live.enemy) continue;
      cache.delete(url);
      if (entry.scene) disposeTemplate(entry.scene);
    }
  }

  function loadTemplate(url) {
    const hit = cache.get(url);
    if (hit) return hit.promise;
    const entry = {promise: null, scene: null};
    entry.promise = loader.loadAsync(url).then(gltf => {
      if (dead || cache.get(url) !== entry) {
        disposeTemplate(gltf.scene);
        return null;
      }
      entry.scene = gltf.scene;
      return gltf.scene;
    }).catch(error => {
      if (cache.get(url) === entry) cache.delete(url);
      throw error;
    });
    cache.set(url, entry);
    return entry.promise;
  }

  function addExhaust(model, role) {
    const mounts = [];
    model.traverse(obj => {
      if (typeof obj.name === 'string' && obj.name.startsWith('engine')) mounts.push(obj);
    });
    if (!mounts.length) {
      const aft = new THREE.Object3D();
      aft.position.set(-3, 0, 0);
      model.add(aft);
      mounts.push(aft);
    }
    model.updateWorldMatrix(true, true);
    const color = role === 'enemy' ? 0xc9a6ff : 0x8eecff;
    for (const mount of mounts.slice(0, 2)) {
      const n = 16;
      const origin = model.worldToLocal(mount.getWorldPosition(new THREE.Vector3()));
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      const life = new Float32Array(n);
      for (let i = 0; i < n; i++) life[i] = i / n;
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color, size: 0.11, transparent: true, opacity: 0.8, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, mat);
      points.userData.owned = true;
      points.userData.exhaust = life;
      points.userData.origin = origin;
      points.frustumCulled = false;
      model.add(points);
      // Soft luminous exhaust, not a solid geometric triangle.
      const material = new THREE.ShaderMaterial({
        uniforms: {tint:{value:new THREE.Color(color)}},
        vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'varying vec2 vUv; uniform vec3 tint; void main(){float w=.035+.35*vUv.x; float a=exp(-pow((vUv.y-.5)/w,2.)*3.)*pow(vUv.x,1.4); gl_FragColor=vec4(mix(tint,vec3(1.),pow(a,3.)*.7),a*.9);}',
        transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
      });
      const plume = new THREE.Mesh(new THREE.PlaneGeometry(.9,.48),material);
      plume.position.copy(origin).add(new THREE.Vector3(-.43,0,-.02));
      plume.userData.owned=true;
      plume.userData.plume=origin.clone();
      model.add(plume);
    }
  }

  function mount(role, template, entry) {
    clearRole(role);
    const model = template.clone(true);
    let meshes = 0;
    model.traverse(obj => { if (obj.isMesh) meshes += 1; });
    if (!meshes) throw new Error('empty model');
    const length = displayLength(entry);
    model.scale.setScalar(length / 6);
    // Show the armored upper surface while keeping each nose aimed across the table.
    model.rotation.x = 0.64;
    if (role === 'enemy') model.rotation.y = Math.PI;
    const group = groups[role];
    group.add(model);
    group.userData.bodyHeight = model.userData.bodyHeight || 3;
    group.userData.ready = true;
    group.userData.length = length;
    group.updateWorldMatrix(true, true);
    addExhaust(model, role);
  }

  // A detailed transparent portrait sits inside the live 3D scene. This is a
  // deliberate 2.5D presentation; GLBs remain available in the asset workshop.
  function mountPortrait(role, texture, entry) {
    clearRole(role);
    const length = entry.length;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const model = createPortraitShip(entry, texture, role === 'enemy');
    const group = groups[role];
    group.add(model);
    group.userData.bodyHeight = model.userData.bodyHeight || 3;
    group.userData.ready = true;
    group.userData.length = length;
    group.updateWorldMatrix(true, true);
    addExhaust(model, role);
  }

  async function showRole(role, entry) {
    if (dead || !entry?.model) return;
    const identity = entry.portrait || entry.model;
    if (shown[role] === identity) return;
    const token = ++tokens[role];
    shown[role] = identity;
    live[role] = entry.model;
    clearRole(role);
    trim();
    shipState[role] = 'loading';
    report(combine());
    try {
      if (entry.portrait) {
        const texture = await portraits.loadAsync(entry.portrait);
        if (dead || token !== tokens[role]) { texture.dispose(); return; }
        mountPortrait(role, texture, entry);
      } else {
        const template = await loadTemplate(entry.model);
        if (dead || token !== tokens[role] || !template) return;
        mount(role, template, entry);
      }
      shipState[role] = 'ready';
    } catch {
      if (dead || token !== tokens[role]) return;
      clearRole(role);
      shipState[role] = 'fallback';
      shown[role] = '';
      if (!warned.has(entry.model)) {
        warned.add(entry.model);
        console.warn('Ship model unavailable', entry.model);
      }
    }
    if (!dead) report(combine());
  }

  function makeRing(color, inner, outer) {
    const material=new THREE.ShaderMaterial({
      uniforms:{tint:{value:new THREE.Color(color)},alpha:{value:0},radius:{value:(inner+outer)/(outer*2.5)},width:{value:(outer-inner)/(outer*2.5)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;uniform vec3 tint;uniform float alpha,radius,width;void main(){float d=abs(length(vUv-.5)*2.-radius);float glow=exp(-pow(d/max(.035,width*1.8),2.)*2.);float core=exp(-pow(d/.016,2.)*2.);gl_FragColor=vec4(mix(tint,vec3(1.),core*.7),(glow*.32+core*.68)*alpha);}',
      side:THREE.DoubleSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(outer*2.5,outer*2.5),material);
    material.opacity=0;mesh.onBeforeRender=()=>{material.uniforms.alpha.value=material.opacity;};
    mesh.rotation.y = 0.35;
    mesh.visible = false;
    mesh.frustumCulled = false;
    return mesh;
  }

  function spawnShards(role) {
    const color = role === 'enemy' ? 0xd2b6ff : 0x9eecff;
    const origin = groups[role].position;
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, 0.22),
        new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.92}),
      );
      mesh.position.copy(origin);
      mesh.userData.owned = true;
      mesh.userData.shard = {
        v: new THREE.Vector3((Math.random() - 0.5) * 5.2, 0.4 + Math.random() * 2.4, (Math.random() - 0.5) * 2.4),
        spin: Math.random() * 8 + 2,
      };
      scene3.add(mesh);
      shards.push(mesh);
    }
  }

  async function useEnvironment() {
    if (!renderer || dead) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    for (const url of HDR_URLS) {
      try {
        const hdr = await new HDRLoader().loadAsync(url);
        if (dead) { hdr.dispose?.(); pmrem.dispose(); return; }
        const tex = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose?.();
        scene3.environment = tex;
        envMap = tex;
        pmrem.dispose();
        return;
      } catch { /* optional CC0 studio-light.hdr; lights still cover the ships */ }
    }
    try {
      const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      if (!dead) { scene3.environment = tex; envMap = tex; }
    } catch { /* hemisphere and key lights remain */ }
    pmrem.dispose();
  }

  function resize(width, height) {
    const ratio = pixelRatio();
    const sizeKey = `${Math.round(width)}:${Math.round(height)}:${ratio}`;
    if (sizeKey === lastSize) return;
    lastSize = sizeKey;
    renderer.setPixelRatio(ratio);
    renderer.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), false);
    const aspect = Math.max(0.3, width / Math.max(1, height));
    const heightWorld = TARGET_WIDTH / aspect;
    camera.left = -TARGET_WIDTH / 2;
    camera.right = TARGET_WIDTH / 2;
    camera.top = heightWorld / 2;
    camera.bottom = -heightWorld / 2;
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    view = {width: TARGET_WIDTH, height: heightWorld, fit: 1, available: heightWorld * Math.max(.4, 1 - 98 / height)};
  }

  function place(role, rect, stage) {
    if (!rect) return;
    const nx = ((rect.left + rect.width / 2) - stage.left) / stage.width - 0.5;
    const ny = 0.5 - ((rect.top + rect.height / 2) - stage.top) / stage.height;
    bases[role].set(nx * view.width, ny * view.height, 0);
  }

  function nose(role, target) {
    const group = groups[role];
    const model = group.children[0];
    const muzzle = model?.getObjectByName?.('muzzle');
    if (muzzle) return muzzle.getWorldPosition(target);
    const dir = role === 'player' ? 1 : -1;
    const length = group.userData.length || 5;
    return target.copy(group.position).addScaledVector(xAxis, dir * length * 0.42);
  }

  function aim(mesh, from, to, thickness) {
    tmp2.copy(to).sub(from);
    const len = tmp2.length();
    if (len < 0.05) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.scale.set(len, thickness, thickness);
    mesh.position.copy(from).addScaledVector(tmp2, 0.5);
    mesh.quaternion.setFromUnitVectors(xAxis, tmp2.multiplyScalar(1 / len));
  }

  function updateMotion(dt) {
    if (showShips && arriveStarted) {
      for (const role of ROLES) if (arrive[role] < 1) arrive[role] = Math.min(1, arrive[role] + dt / 1.15);
    }
    for (const role of ROLES) if (doom[role].started && doom[role].age < 1.8) doom[role].age += dt;
    for (const mesh of shards) {
      const shard = mesh.userData.shard;
      mesh.position.addScaledVector(shard.v, dt);
      shard.v.y -= dt * 1.6;
      mesh.rotation.z += shard.spin * dt;
      mesh.material.opacity = Math.max(0, mesh.material.opacity - dt * 0.55);
    }
    if (!reduced && stars) stars.position.x = Math.sin(clock * 0.05) * 0.2;
    for (const role of ROLES) {
      const group = groups[role];
      const model = group.children.find(child => child.userData?.exhaust || child.children?.length);
      if (!model) continue;
      model.traverse(obj => {
        const firing=fx?.cue.shots&&((fx.cue.actor===1)===(role==='enemy'))&&fx.age<.5;
        const boost=reduced?1:1+(firing?fx.cue.power*.5:role==='player'?charge*.08:0);
        if(obj.userData?.plume){obj.scale.x=boost;obj.scale.y=1+(boost-1)*.25;obj.position.x=obj.userData.plume.x-.43*boost;}
        const life = obj.userData?.exhaust;
        if (!life) return;
        const origin = obj.userData.origin;
        const attr = obj.geometry.getAttribute('position');
        const step = reduced ? 0 : dt * 0.85;
        for (let i = 0; i < life.length; i++) {
          life[i] = step ? (life[i] + step) % 1 : i / life.length;
          const t = life[i];
          attr.setXYZ(i, origin.x - t * 1.5 * boost, origin.y + Math.sin(i + t * 8) * 0.05, origin.z + Math.cos(i * 1.7) * 0.05);
        }
        attr.needsUpdate = true;
      });
    }
  }

  function layoutShips() {
    for (const role of ROLES) {
      const group = groups[role];
      const ready = !!group.userData.ready;
      const falling = doom[role].started;
      const fall = Math.min(1, doom[role].age / 1.7);
      const travel = reduced ? 1 : easeOut(arrive[role]);
      const fromX = (role === 'player' ? -1 : 1) * view.width * 0.62;
      let x = bases[role].x + (1 - travel) * fromX;
      let y = bases[role].y;
      let rotZ = 0;
      let scale = Math.min(1, (view.available || view.height) / (group.userData.bodyHeight || 3.6));
      group.rotation.y = 0;
      if (!showShips || !ready) {
        group.visible = false;
        continue;
      }
      group.visible = fall < 1;
      if (falling) {
        const spin = reduced ? 0 : fall * Math.PI * 4.6;
        rotZ = (role === 'player' ? 1 : -1) * spin;
        group.rotation.y = reduced ? 0 : Math.sin(fall * 6) * .18;
        y -= fall * 1.5;
        scale *= 1 - fall * 0.74;
        if (!doom[role].spawned && fall > 0.08) {
          doom[role].spawned = true;
          spawnShards(role);
        }
      } else if ((role === 'player' && fx?.victoryPlayer) || (role === 'enemy' && fx?.victoryEnemy) || (role === 'player' ? victory.player : victory.enemy)) {
        y += reduced ? 0.08 : Math.sin(clock * 1.7) * 0.07 + 0.12;
        rotZ = reduced ? 0 : Math.sin(clock * 1.3) * 0.05;
      } else if (!reduced && travel >= 1) {
        y += Math.sin(clock * 0.7 + (role === 'enemy' ? 1.2 : 0)) * 0.05;
        group.rotation.y = Math.sin(clock * .5) * .028 + look.x*.055;
        x-=look.x*.12;y+=look.y*.07;
      }
      if (fx && !falling && !reduced && fx.cue.shots) {
        const actor = fx.cue.actor === 1 ? 'enemy' : 'player';
        if (role === actor) {
          const local = shotLocal(fx);
          if (local >= 0 && local < 1) x += (role === 'player' ? -1 : 1) * Math.sin(local * Math.PI) * 0.28 * fx.cue.power;
        }
      }
      group.position.set(x, y, 0);
      group.rotation.z = rotZ;
      group.scale.setScalar(Math.max(0.02, scale));
      (role === 'player' ? playerLight : enemyLight).position.set(x, y + 0.4, 1.2);
    }
  }

  const victory = {player: false, enemy: false};

  function shotLocal(current) {
    const spacing = Math.max(0.05, (current.cue.shotSpacing || 160) / 1000);
    const index = Math.min(current.cue.shots - 1, Math.floor(current.age / spacing));
    return (current.age - index * spacing) / (current.cue.shots > 1 ? 0.11 : 0.24);
  }

  function updateFx() {
    if (!beam) return;
    beam.visible = false;
    shieldRing.visible = false;
    if(shieldBubble)shieldBubble.visible=false;
    impactRing.visible = false;
    healRing.visible = false;
    for (const ring of healRings) ring.visible = false;
    if (!fx || !showShips) return;
    const cue = fx.cue;
    const t = fx.age / fx.life;
    if(shieldBubble&&cue.shots&&fx.age<.58){
      const role=cue.actor===0?'enemy':'player';
      shieldBubble.visible=groups[role].visible;
      shieldBubble.position.copy(groups[role].position);
      shieldBubble.scale.set(1.45,1.05,.8);
      shieldBubble.material.uniforms.age.value=fx.age;
      shieldBubble.material.uniforms.tint.value.setHex(cue.blocked?0xa8e6ff:0xff856f);
    }
    if (cue.shots > 0 && t < 1) {
      const local = shotLocal(fx);
      if (local >= 0 && local < 1) {
        const attacker = cue.actor === 1 ? 'enemy' : 'player';
        const defender = attacker === 'player' ? 'enemy' : 'player';
        if (groups[attacker].userData.ready && groups[defender].userData.ready) {
          nose(attacker, tmp);
          const target = nose(defender, new THREE.Vector3());
          const color = cue.heavy ? 0xffe2b4 : cue.actor === 1 ? 0xe4ccff : 0xd8f7ff;
          beam.material.color.setHex(color);
          aim(beam, tmp, target, (cue.heavy ? 0.1 : 0.04) * (cue.power || 1));
          beam.material.opacity = local < 0.2 ? local / 0.2 : 1 - (local - 0.2) / 0.8;
          if (cue.damage > 0) {
            impactRing.visible = true;
            impactRing.position.copy(target);
            const s = 0.3 + local * 1.5 * (cue.power || 1);
            impactRing.scale.setScalar(s);
            impactRing.material.opacity = 1 - local;
          }
          if (cue.blocked > 0 && fx.age < 0.45) {
            shieldRing.visible = true;
            shieldRing.position.copy(target);
            shieldRing.scale.setScalar(0.8 + fx.age * 2);
            shieldRing.material.opacity = 0.85 * (1 - fx.age / 0.45);
          }
        }
      }
    }
    if (cue.healPulses > 0 && t < 1) {
      const spacing = Math.max(0.05, (cue.healingSpacing || 140) / 1000);
      for (let index = 0; index < cue.healPulses; index++) {
        const ring = healRings[index];
        const local = (fx.age - index * spacing) / 0.55;
        if (!ring || local < 0 || local >= 1) continue;
        const actor = cue.actor === 1 ? 'enemy' : 'player';
        ring.visible = true;
        ring.position.copy(groups[actor].position);
        ring.scale.setScalar((0.5 + local * 1.4) * (cue.healPower || 1));
        ring.material.opacity = (1 - local) * 0.85;
      }
    }
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (typeof document !== 'undefined' && document.hidden) { stopLoop(); return; }
    const motionDt=(!reduced&&fx?.cue.shots&&fx.age>=.08&&fx.age<.145)?0:dt;
    clock += motionDt;
    look.x+=(look.tx-look.x)*Math.min(1,dt*6);look.y+=(look.ty-look.y)*Math.min(1,dt*6);
    let rects = null;
    try { rects = readRects(); } catch { rects = null; }
    if (host && rects?.stage) {
      host.hidden = false;
      host.style.left = `${rects.stage.left}px`;
      host.style.top = `${rects.stage.top}px`;
      host.style.width = `${rects.stage.width}px`;
      host.style.height = `${rects.stage.height}px`;
      resize(rects.stage.width, rects.stage.height);
      place('player', rects.player, rects.stage);
      place('enemy', rects.enemy, rects.stage);
    } else if (host) host.hidden = true;
    if (fx) {
      fx.age += dt;
      if (fx.age >= fx.life) fx = null;
    }
    updateMotion(motionDt);
    layoutShips();
    updateFx();
    const shake=!reduced&&fx?.cue.damage&&fx.age<.26?(1-fx.age/.26)*.025*fx.cue.power:0;
    camera.position.x=Math.sin((fx?.age||0)*92)*shake;
    camera.position.y=Math.cos((fx?.age||0)*80)*shake*.45;
    renderer.render(scene3, camera);
  }

  function tick(now) {
    if (!loopOn || dead) return;
    raf = requestAnimationFrame(tick);
    try { step(now); } catch (error) {
      shipState.player = 'fallback';
      shipState.enemy = 'fallback';
      report('fallback');
      stopLoop();
      if (!warned.has('runtime')) { warned.add('runtime'); console.warn('Battle scene paused', error); }
    }
  }

  function sync(state) {
    if (dead || !state) return;
    reduced = !!state.reducedMotion;
    const level = Math.min(FLEET.length - 1, Math.max(0, Math.round(Number(state.level) || 0)));
    const enemy = FLEET[level] || FLEET[0];
    showShips = state.phase !== 'loadout' && state.phase !== 'sector';
    if (showShips && !arriveStarted) {
      arriveStarted = true;
      arrive.player = reduced ? 1 : 0;
      arrive.enemy = reduced ? 1 : 0;
    }
    victory.player = state.outcome === 'player' && !(state.hp?.[0] <= 0);
    victory.enemy = state.outcome === 'enemy' && !(state.hp?.[1] <= 0);
    ROLES.forEach((role, index) => {
      const hp = state.hp?.[index] ?? 1;
      if (hp <= 0 && !doom[role].started) doom[role] = {started: true, age: reduced ? 1.8 : 0, spawned: reduced};
      if (hp > 0 && doom[role].started) doom[role] = {started: false, age: 0, spawned: false};
    });
    void showRole('player', PLAYER_SHIP);
    void showRole('enemy', enemy);
  }

  function play(action) {
    if (dead || !action) return;
    const cue = Number.isFinite(action.shots) ? action : combatCue(action);
    fx = {
      age: 0,
      life: Math.max(0.35, (cue.duration || 1050) / 1000),
      cue,
      victoryPlayer: victory.player,
      victoryEnemy: victory.enemy,
    };
  }

  function reset() {
    if (dead) return;
    fx = null;
    arriveStarted = false;
    arrive.player = 0;
    arrive.enemy = 0;
    victory.player = false;
    victory.enemy = false;
    doom.player = {started: false, age: 0, spawned: false};
    doom.enemy = {started: false, age: 0, spawned: false};
    clearShards();
    if (beam) beam.visible = false;
  }

  function onLost(event) {
    event.preventDefault();
    lost = true;
    stopLoop();
    shipState.player = 'fallback';
    shipState.enemy = 'fallback';
    report('fallback');
  }

  function onRestored() {
    if (dead) return;
    lost = false;
    for (const [url, entry] of cache) if (entry.scene) disposeTemplate(entry.scene);
    cache.clear();
    shown.player = '';
    shown.enemy = '';
    clearRole('player');
    clearRole('enemy');
    shipState.player = 'loading';
    shipState.enemy = 'loading';
    try {
      renderer.setSize(canvas.clientWidth || 2, canvas.clientHeight || 2, false);
      void useEnvironment();
      report('loading');
      if (!paused) startLoop();
    } catch {
      report('fallback');
    }
  }

  return {
    attach(nextHost) {
      if (dead || attached) return;
      if (!nextHost || typeof nextHost.appendChild !== 'function') { report('fallback'); return; }
      attached = true;
      host = nextHost;
      try {
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
        host.appendChild(canvas);
        renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: false});
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.98;
        if (!renderer.getContext()) throw new Error('no webgl context');
      } catch {
        report('fallback');
        return;
      }
      scene3 = new THREE.Scene();
      scene3.environmentIntensity = 0.65;
      camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
      const hemi = new THREE.HemisphereLight(0xc5ddff, 0x2a2118, 0.45);
      const key = new THREE.DirectionalLight(0xfff6ea, 1.8);
      key.position.set(4, 8, 10);
      const fill = new THREE.DirectionalLight(0x6ec8e6, 0.95);
      fill.position.set(-6, 2, 4);
      const rim = new THREE.DirectionalLight(0xd7c4ff, 1.15);
      rim.position.set(0, 3, -8);
      playerLight = new THREE.PointLight(0x7ee7ff, 3, 18, 2);
      enemyLight = new THREE.PointLight(0xc9a6ff, 3, 18, 2);
      scene3.add(hemi, key, fill, rim, playerLight, enemyLight, groups.player, groups.enemy);
      const count = 140;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 36;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
        positions[i * 3 + 2] = -6 - Math.random() * 14;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xd7e7ff, size: 0.03, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true}));
      scene3.add(stars);
      beam = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({color: 0xd8f7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,toneMapped:false}),
      );
      beam.visible = false;
      beam.frustumCulled = false;
      shieldRing = makeRing(0x9ad7ff, 0.72, 0.86);
      impactRing = makeRing(0xfff4d2, 0.2, 0.34);
      healRing = makeRing(0x9dffd4, 0.55, 0.7);
      healRings = [healRing, ...Array.from({length:3}, () => makeRing(0x9dffd4, 0.55, 0.65))];
      shieldBubble=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),new THREE.ShaderMaterial({
        uniforms:{age:{value:0},tint:{value:new THREE.Color(0xff856f)}},
        vertexShader:'varying vec3 vN; varying vec2 vUv; void main(){vN=normalize(normalMatrix*normal);vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec3 vN;varying vec2 vUv;uniform float age;uniform vec3 tint;
          void main(){vec2 p=vUv*vec2(22.,12.);vec2 s=vec2(1.732,1.);vec2 a=mod(p,s)-s*.5;vec2 b=mod(p-s*.5,s)-s*.5;vec2 q=dot(a,a)<dot(b,b)?a:b;float d=max(dot(abs(q),normalize(vec2(1.,1.732))),abs(q.x));float edge=smoothstep(.40,.47,d);float rim=pow(1.-abs(normalize(vN).z),2.);float sweep=exp(-pow((vUv.x-.5-age*.45)*15.,2.));float fade=max(0.,1.-age/.58);gl_FragColor=vec4(tint,(edge*.15+rim*.48+sweep*edge*.5)*fade);}`,
        transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide,toneMapped:false,
      }));shieldBubble.visible=false;
      scene3.add(beam, shieldRing, shieldBubble, impactRing, ...healRings);
      window.addEventListener('pointermove',onPointer,{passive:true});
      document.addEventListener('starchain:state',onVisual);
      canvas.addEventListener('webglcontextlost', onLost, false);
      canvas.addEventListener('webglcontextrestored', onRestored, false);
      shipState.player = 'loading';
      shipState.enemy = 'loading';
      report('loading');
      void useEnvironment();
      startLoop();
    },
    sync, play, reset,
    setReducedMotion(value) { reduced = !!value; if (reduced) { arrive.player = 1; arrive.enemy = 1; } },
    pause() { if (paused || dead) return; paused = true; stopLoop(); },
    resume() { if (!paused || dead) return; paused = false; startLoop(); },
    destroy() {
      if (dead) return;
      dead = true;
      window.removeEventListener('pointermove',onPointer);
      document.removeEventListener('starchain:state',onVisual);
      shieldBubble?.geometry.dispose();shieldBubble?.material.dispose();
      paused = true;
      tokens.player += 1;
      tokens.enemy += 1;
      stopLoop();
      clearShards();
      clearRole('player');
      clearRole('enemy');
      for (const entry of cache.values()) if (entry.scene) {
        try { disposeTemplate(entry.scene); } catch { /* context may already be gone */ }
      }
      cache.clear();
      try { envMap?.dispose?.(); } catch { /* ignore */ }
      try { stars?.geometry?.dispose(); stars?.material?.dispose(); } catch { /* ignore */ }
      for (const mesh of [beam, shieldRing, impactRing, ...healRings]) { mesh?.geometry.dispose(); mesh?.material.dispose(); }
      try { renderer?.dispose(); } catch { /* ignore */ }
      canvas?.remove();
      renderer = null;
      scene3 = null;
    },
    status: () => status,
    shipStatus: () => ({player: shipState.player, enemy: shipState.enemy}),
  };
}
