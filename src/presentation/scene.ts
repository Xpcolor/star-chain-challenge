import * as THREE from "three/webgpu";
import {
  pass,
  mrt,
  output,
  emissive,
  uniform,
  uv,
  vec2,
  vec4,
  float,
  sin,
  exp,
  length,
  normalize,
  texture,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { gsap } from "gsap";
import type {
  Actor,
  AudioBus,
  BattleState,
  ScenePort,
  Settlement,
} from "../contracts";
import { FX } from "./fx-config";
import { ElectricHUD } from "./hud";
import { CombatFXPool } from "./fx-pool";
import { usePreferences } from "../ui/Cockpit";
import { PLAYER_SHIP, FLEET } from "../../dist/fleet.mjs";
import { terminalDelaySeconds } from "../../dist/combat-timing.mjs";
type Effect = {
  object: THREE.Object3D;
  life: number;
  start: number;
  update: (t: number) => void;
};
type Ship = {
  root: THREE.Group;
  model: THREE.Group | null;
  base: THREE.Vector3;
  width: number;
  freeze: number;
  kick: number;
  fall: number | null;
  fragments: THREE.Mesh[];
  hull: THREE.Object3D[];
  flames: THREE.Mesh[];
};
type ModelEntry = {
  id: string;
  version: number;
  model: string;
  sha256: string;
  fractureParts: number;
};
function disposeObject(o: THREE.Object3D) {
  const textures = new Set<THREE.Texture>(),
    materials = new Set<THREE.Material>(),
    geometries = new Set<THREE.BufferGeometry>();
  o.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    for (const m of Array.isArray(child.material)
      ? child.material
      : [child.material]) {
      materials.add(m);
      Object.values(m).forEach((v) => {
        if (v instanceof THREE.Texture) textures.add(v);
      });
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
export class BattleScene implements ScenePort {
  private renderer!: THREE.WebGPURenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  private pipeline!: THREE.RenderPipeline;
  private ships: Ship[] = [0, 1].map(() => ({
    root: new THREE.Group(),
    model: null,
    base: new THREE.Vector3(),
    width: 3,
    freeze: 0,
    kick: -10,
    fall: null,
    fragments: [],
    hull: [],
    flames: [],
  }));
  private effects: Effect[] = [];
  private fxPool!: CombatFXPool;
  private timelines: { timeline: gsap.core.Timeline; start: number }[] = [];
  private hud = new ElectricHUD();
  private scenePass!: ReturnType<typeof pass>;
  private terminal = false;
  private age = 0;
  private last = 0;
  private arrival = 0;
  private arrivalToken = 0;
  private ready = false;
  private disposed = false;
  private loadTicket = 0;
  private level = -1;
  private epoch = -1;
  private seen = new Set<string>();
  private state: BattleState | null = null;
  private manifest: ModelEntry[] = [];
  private background!: THREE.Mesh;
  private rocks: THREE.Mesh[] = [];
  private flash = new THREE.PointLight(0xa5dbff, 0, 30, 1.5);
  private inspectionLight = new THREE.DirectionalLight(0xb6ddff, 0);
  private sideLight = new THREE.DirectionalLight(0xaacfff, 1.6);
  private shockCenter = uniform(new THREE.Vector2(0.65, 0.5));
  private shockAge = uniform(2);
  private shockPower = uniform(0);
  private aspect = uniform(1);
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private observer: ResizeObserver | null = null;
  private onResize = () => this.layout();
  private onPointer = (e: PointerEvent) => {
    this.look.tx = e.clientX / innerWidth - 0.5;
    this.look.ty = e.clientY / innerHeight - 0.5;
  };
  private onCommit = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d.actor === 0 && !usePreferences.getState().reduced)
      this.hud.transfer(d.cards || []);
  };
  constructor(private audio: AudioBus) {}
  async init() {
    try {
      this.renderer = new THREE.WebGPURenderer({
        antialias: true,
        forceWebGL:
          new URLSearchParams(location.search).get("backend") === "webgl",
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, FX.dpr));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = FX.exposure;
      document.getElementById("universe")!.append(this.renderer.domElement);
      await this.renderer.init();
      this.renderer.onDeviceLost = (info) => this.fallback(info);
      this.camera.layers.enable(1);
      this.inspectionLight.layers.set(1);
      this.inspectionLight.position.set(-7, 0, 4);
      this.scene.add(this.inspectionLight);
      this.camera.position.z = 12.071;
      this.scene.add(new THREE.HemisphereLight(0xa4d6ff, 0x101a2e, 0.85));
      this.sideLight.position.set(-4, 7, 6);
      const rim = new THREE.DirectionalLight(0xb58bff, 1.1);
      rim.position.set(4, 2, -4);
      this.scene.add(this.sideLight, rim, this.flash);
      const bg = await new THREE.TextureLoader().loadAsync(
        "/assets/cosmos-v2.png",
      );
      bg.colorSpace = THREE.SRGBColorSpace;
      bg.generateMipmaps = true;
      bg.minFilter = THREE.LinearMipmapLinearFilter;
      bg.magFilter = THREE.LinearFilter;
      const bgMat = new THREE.MeshBasicNodeMaterial({
        map: bg,
        color: 0xffffff,
      });
      bgMat.toneMapped = false;
      this.background = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
      this.background.position.z = -20;
      this.scene.add(this.background);
      const env = await new HDRLoader().loadAsync("/assets/studio-light.hdr");
      env.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.55;
      const response = await fetch("/assets/fleet-models.json");
      if (!response.ok) throw Error("舰船清单加载失败");
      this.manifest = await response.json();
      this.ships.forEach((s) => this.scene.add(s.root));
      for (let i = 0; i < 22; i++) {
        const rock = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 1),
          new THREE.MeshStandardNodeMaterial({
            color: 0x3b475f,
            roughness: 0.85,
            flatShading: true,
          }),
        );
        rock.position.set(
          (i % 2 ? -1 : 1) * (6 + (i % 7)),
          ((i % 9) - 4) * 1.6,
          -3 - (i % 8),
        );
        rock.scale.set(0.13 + (i % 4) * 0.04, 0.1 + (i % 3) * 0.07, 0.2);
        this.scene.add(rock);
        this.rocks.push(rock);
      }
      const stars = new THREE.InstancedMesh(
          new THREE.IcosahedronGeometry(0.012, 0),
          this.light(0xa2d5ff, 0.6),
          250,
        ),
        dummy = new THREE.Object3D();
      let seed = 17;
      const random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < 250; i++) {
        dummy.position.set(
          (random() - 0.5) * 44,
          (random() - 0.5) * 28,
          -3 - random() * 12,
        );
        dummy.updateMatrix();
        stars.setMatrixAt(i, dummy.matrix);
      }
      this.scene.add(stars);
      const scenePass = this.scenePass = pass(this.scene, this.camera);
      scenePass.setMRT(mrt({ output, emissive: vec4(emissive, output.a) }));
      const color = scenePass.getTextureNode("output"),
        emission = scenePass.getTextureNode("emissive"),
        coord = uv(),
        delta = coord.sub(this.shockCenter).mul(vec2(this.aspect, 1)),
        distance = length(delta),
        radius = this.shockAge.mul(0.35);
      const power = float(1).sub(this.shockAge).max(0).mul(this.shockPower),
        wave = sin(distance.mul(80).sub(this.shockAge.mul(35)))
          .mul(exp(distance.sub(radius).pow(2).mul(-220)))
          .mul(power)
          .mul(0.012),
        offset = normalize(delta.add(vec2(0.00001)))
          .mul(wave)
          .div(vec2(this.aspect, 1));
      const shifted = coord.add(offset),
        split = power.mul(0.0013),
        bent = vec4(
          color.sample(shifted.add(vec2(split, 0))).r,
          color.sample(shifted).g,
          color.sample(shifted.sub(vec2(split, 0))).b,
          1,
        );
      this.pipeline = new THREE.RenderPipeline(this.renderer);
      this.pipeline.outputNode = bent.add(
        bloom(emission.sample(shifted), 0.5, 0.35, 0.25),
      );
      this.fxPool = new CombatFXPool(this.scene, FX.maxParticles);
      this.ready = true;
      this.layout();
      await this.loadFleet(this.state?.level || 0);
      if (this.disposed || !this.ready) return;
      document.documentElement.dataset.backend =
        "isWebGPUBackend" in this.renderer.backend &&
        this.renderer.backend.isWebGPUBackend
          ? "webgpu"
          : "webgl2";
      document.documentElement.dataset.battle = "ready";
      this.status(
        `${"isWebGPUBackend" in this.renderer.backend && this.renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL 2"} · 真实 3D 星舰`,
      );
      window.addEventListener("resize", this.onResize);
      window.addEventListener("scroll", this.onResize, { passive: true });
      window.addEventListener("pointermove", this.onPointer);
      document.addEventListener("starchain:commit", this.onCommit);
      this.observer = new ResizeObserver(this.onResize);
      this.observer.observe(document.getElementById("app")!);
      this.renderer.setAnimationLoop((now) => this.frame(now));
    } catch (error) {
      this.fallback(error);
    }
  }
  private status(text: string) {
    const el = document.getElementById("renderer-status");
    if (el) el.textContent = text;
  }
  private fallback(error: unknown) {
    console.warn("3D presentation fallback", error);
    this.ready = false;
    this.renderer?.setAnimationLoop(null);
    if (this.renderer) this.renderer.domElement.style.display = "none";
    document.documentElement.dataset.battle = "fallback";
    this.presentationReady("arrival");
    if(this.state?.outcome)this.presentationReady("terminal");
    this.status("已切换舰图模式，游戏可以继续");
    for (const [i, id] of ["hero-anchor", "enemy-anchor"].entries()) {
      const e = document.getElementById(id);
      if (e)
        e.style.background = `url(${i ? FLEET[Math.max(0, this.state?.level || 0)].portrait : PLAYER_SHIP.portrait}) center/contain no-repeat`;
    }
  }
  private light(color: number, opacity = 1) {
    const m = new THREE.MeshStandardNodeMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return m;
  }
  private effect(
    object: THREE.Object3D,
    life: number,
    update: (t: number) => void,
  ) {
    this.scene.add(object);
    this.effects.push({ object, life, start: this.age, update });
  }
  private ring(position: THREE.Vector3, color: number, size = 1) {
    const object = this.fxPool.take("ring", color, 0.9);
    if (!object) return;
    const mat = object.material as THREE.Material;
    object.position.copy(position);
    object.position.z += 0.5;
    this.effect(object, 0.65, (t) => {
      object.scale.setScalar(0.05 + t * size);
      mat.opacity = (1 - t) ** 2;
    });
  }
  private burst(position: THREE.Vector3, color: number, count = 22, power = 1) {
    const cloud = this.fxPool.take(
      "burst",
      color,
    ) as THREE.InstancedMesh | null;
    if (!cloud) return;
    cloud.position.copy(position);
    cloud.count = Math.min(count, FX.maxParticles);
    const velocities: THREE.Vector3[] = [],
      dummy = new THREE.Object3D();
    for (let i = 0; i < cloud.count; i++) {
      const a = i * 2.399,
        velocity = new THREE.Vector3(
          Math.cos(a) * (1 + (i % 3) * 0.3),
          Math.sin(a) * (1 + (i % 4) * 0.2),
          ((i % 5) - 2) * 0.3,
        ).multiplyScalar(power);
      velocities.push(velocity);
    }
    this.effect(cloud, 1.1, (t) => {
      velocities.forEach((velocity, i) => {
        dummy.position.copy(velocity).multiplyScalar(t);
        dummy.scale.setScalar(1 - t);
        dummy.updateMatrix();
        cloud.setMatrixAt(i, dummy.matrix);
      });
      cloud.instanceMatrix.needsUpdate = true;
      (cloud.material as THREE.Material).opacity = (1 - t) ** 1.5;
    });
  }
  private shock(position: THREE.Vector3, power: number) {
    const p = position.clone().project(this.camera);
    this.shockCenter.value.set(p.x * 0.5 + 0.5, 1 - (p.y * 0.5 + 0.5));
    this.shockAge.value = 0;
    this.shockPower.value = usePreferences.getState().reduced ? 0 : power;
    this.flash.position.copy(position).add(new THREE.Vector3(0, 0, 2));
    this.flash.intensity = 10 * power;
  }
  private shield(position: THREE.Vector3, actor: Actor) {
    const object = this.fxPool.take(
      "shield",
      actor ? 0xc4a1ff : 0x95efff,
      0.25,
    );
    if (!object) return;
    const mat = object.material as THREE.Material;
    object.position.copy(position);
    object.scale.set(1.2, 0.8, 0.65);
    this.effect(object, 0.42, (t) => {
      mat.opacity = (1 - t) * 0.3;
    });
  }
  private timeline() {
    const t = gsap.timeline({ paused: true });
    // Events arrive between animation frames; exclude the time before this event.
    const betweenFrames = this.last
      ? Math.min(0.05, Math.max(0, (performance.now() - this.last) / 1000))
      : 0;
    this.timelines.push({ timeline: t, start: this.age + betweenFrames });
    return t;
  }
  private shoot(event: Settlement, index: number, count: number) {
    const actor = event.actor,
      target = (1 - actor) as Actor,
      from = this.ships[actor],
      to = this.ships[target],
      direction = actor ? -1 : 1,
      heavy = count === 1 && event.rawDamage >= 3,
      power = Math.min(2.8, 1 + event.rawDamage * 0.13);
    const a = from.root.position
        .clone()
        .add(
          new THREE.Vector3(
            direction * from.width * 0.42,
            index % 2 ? 0.12 : -0.12,
            0.3,
          ),
        ),
      b = to.root.position
        .clone()
        .add(new THREE.Vector3(-direction * to.width * 0.39, 0, 0.3)),
      beam = this.fxPool.take("beam", actor ? 0xd5a2ff : 0x83eaff);
    if (!beam) return;
    beam.rotation.z = Math.PI / 2;
    beam.scale.set(
      heavy ? 0.045 : 0.015,
      heavy ? 1.1 : 0.65,
      heavy ? 0.045 : 0.015,
    );
    from.kick = this.age;
    this.ring(a, actor ? 0xdba8ff : 0x86eaff, 0.4);
    void this.audio.play(
      heavy ? "cannon" : "laser",
      actor ? 0.65 : -0.65,
      heavy ? 1.25 : 0.8,
    );
    this.effect(beam, FX.attack.travel, (t) =>
      beam.position.lerpVectors(a, b, t),
    );
    this.timeline().call(
      () => {
        to.kick = this.age;
        to.freeze = this.age + FX.attack.hitStop;
        if (event.blocked) {
          this.shield(b, target);
          void this.audio.play("shield", target ? 0.65 : -0.65);
        }
        this.burst(
          b,
          event.blocked ? 0xc4b7ff : 0xffd298,
          heavy ? 40 : 20,
          power,
        );
        this.ring(b, 0xbcadff, heavy ? 2 : 1);
        this.shock(b, heavy ? 1 : 0.5);
        void this.audio.play("impact", target ? 0.65 : -0.65, power * 0.6);
        if (!usePreferences.getState().reduced) {
          document.body.classList.add("impact-scan");
          this.timeline().call(
            () => document.body.classList.remove("impact-scan"),
            [],
            0.24,
          );
        }
      },
      [],
      FX.attack.travel,
    );
  }
  private repair(actor: Actor, amount: number) {
    const ring = this.fxPool.take("ring", 0x96ffdd, 0.7),
      ship = this.ships[actor];
    if (!ring) return;
    ring.position.copy(ship.root.position);
    const mat = ring.material as THREE.Material;
    this.effect(ring, FX.repair.duration, (t) => {
      const r = 0.5 + t * 1.1;
      ring.scale.set(r * 1.5, r * 0.55, r);
      ring.rotation.x = 0.45;
      mat.opacity = Math.sin(t * Math.PI) * 0.65;
    });
    this.burst(
      ship.root.position.clone(),
      0xafffea,
      amount > 1 ? 28 : 12,
      0.65,
    );
    void this.audio.play("repair", actor ? 0.6 : -0.6, amount > 1 ? 1 : 0.65);
  }
  private settle(event: Settlement) {
    if (!this.ready || !this.fxPool) return;
    const key = `${event.epoch}:${event.seq}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    // Reduced motion settles quickly with no queued projectiles crossing the next turn.
    if (usePreferences.getState().reduced) return;
    const count = event.rawDamage ? Math.max(1, event.claimed.length) : 0,
      timeline = this.timeline();
    for (let i = 0; i < count; i++)
      timeline.call(
        () => this.shoot(event, i, count),
        [],
        FX.attack.warmup + i * FX.attack.spacing,
      );
    for (let i = 0; i < Math.min(6, event.healing); i++)
      timeline.call(
        () => this.repair(event.actor, event.healing),
        [],
        FX.attack.warmup + i * FX.repair.spacing,
      );
  }
  private terminalCue(state: BattleState) {
    if (this.terminal) return;
    this.terminal = true;
    usePreferences.setState({ inspect: false });
    if (usePreferences.getState().reduced) {
      this.presentationReady("terminal", state.match);
      return;
    }
    this.timeline().call(
      () => {
        for (let i = 0; i < 2; i++)
          if (state.hp[i] === 0) this.collapse(i as Actor);
        if (state.outcome === "player") {
          this.ring(this.ships[0].root.position.clone(), 0xffdd96, 2.4);
          void this.audio.play("victory");
        } else if (state.outcome === "enemy") void this.audio.play("defeat");
        else this.ring(this.ships[0].root.position.clone(), 0x97dfff, 1);
        // Start this clock at the actual collapse, including slow/hidden-tab frames.
        this.timeline().call(() => this.presentationReady("terminal", state.match), [], FX.collapse);
      },
      [],
      terminalDelaySeconds(state.event),
    );
  }
  private presentationReady(kind: "arrival" | "terminal", match = this.epoch) {
    if (match === this.epoch && !this.disposed)
      document.dispatchEvent(new CustomEvent(`starchain:${kind}-ready`, {detail:{match}}));
  }
  private beginArrival() {
    this.arrival = this.age;
    const token = ++this.arrivalToken, match = this.epoch;
    this.timeline().call(() => {
      if (token === this.arrivalToken) this.presentationReady("arrival", match);
    }, [], usePreferences.getState().reduced ? 0.01 : 2);
  }
  private collapse(actor: Actor) {
    const s = this.ships[actor];
    s.fall = this.age;
    s.hull.forEach((o) => (o.visible = false));
    s.fragments.forEach((o) => (o.visible = true));
    this.burst(s.root.position.clone(), 0xffb567, 60, 2);
    this.shock(s.root.position.clone(), 1.5);
    void this.audio.play("collapse", actor ? 0.5 : -0.5);
  }
  async loadFleet(level: number) {
    if (!this.ready || this.disposed) return;
    const ticket = ++this.loadTicket;
    ++this.arrivalToken;
    this.level = level;
    const ids = ["aurora", `fleet-${String(level + 1).padStart(2, "0")}`];
    for (let actor = 0; actor < 2; actor++) {
      const entry = this.manifest.find((e) => e.id === ids[actor]);
      if (!entry) throw Error("等级模型缺失");
      if (actor === 0 && this.ships[0].model) continue;
      const gltf = await new GLTFLoader().loadAsync(
        entry.model + "?v=" + entry.sha256.slice(0, 12),
      );
      if (this.disposed || ticket !== this.loadTicket) {
        disposeObject(gltf.scene);
        return;
      }
      const s = this.ships[actor];
      if (s.model) {
        s.root.remove(s.model);
        disposeObject(s.model);
      }
      s.fragments = [];
      s.hull = [];
      s.flames = [];
      s.model = gltf.scene;
      s.root.add(gltf.scene);
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (actor === 0) o.layers.enable(1);
        const part = o.name.startsWith("debris_");
        if (part) {
          s.fragments.push(o);
          o.visible = false;
          o.geometry.computeBoundingBox();
          o.userData.original = o.position.clone();
          o.userData.direction = o.geometry
            .boundingBox!.getCenter(new THREE.Vector3())
            .normalize();
        } else s.hull.push(o);
        const old = Array.isArray(o.material) ? o.material : [o.material];
        o.material = old.map((m) => {
          const source = m as THREE.MeshStandardMaterial;
          if (source.map) {
            source.map.anisotropy = Math.min(
              8,
              this.renderer.getMaxAnisotropy(),
            );
            source.map.colorSpace = THREE.SRGBColorSpace;
          }
          const mat = new THREE.MeshStandardNodeMaterial({
            map: source.map,
            normalMap: source.normalMap,
            roughnessMap: source.roughnessMap,
            metalnessMap: source.metalnessMap,
            roughness: part ? 0.65 : 0.5,
            metalness: part ? 0.45 : 0.23,
            color: source.color,
          });
          if (source.map) {
            const tex = texture(source.map),
              mask = actor
                ? tex.b.sub(tex.g).sub(0.18).max(0)
                : tex.b.sub(tex.r).sub(0.18).max(0);
            mat.emissiveNode = tex.rgb.mul(mask).mul(1.1);
          }
          source.dispose();
          return mat;
        });
        if (o.material.length === 1) o.material = o.material[0];
      });
      for (const y of [-0.095, 0.095]) {
        const material = this.light(actor ? 0xbe8cff : 0x65daff, 0.7),
          flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.045, 0.23, 10),
            material,
          );
        flame.rotation.z = actor ? -Math.PI / 2 : Math.PI / 2;
        flame.position.set(actor ? 0.5 : -0.5, y, 0);
        s.model.add(flame);
        s.flames.push(flame);
      }
      s.fall = null;
    }
    this.layout();
    this.prepareFleetArrival();
    if (!this.ready) return;
    document.documentElement.dataset.models = "ready";
    document.documentElement.dataset.modelLevel = String(level + 1);
    void this.audio.play("arrival");
  }
  private prepareFleetArrival() {
    const canvas = this.renderer.domElement, visibility = canvas.style.visibility;
    const updateType = this.scenePass.updateBeforeType;
    const parts = this.ships.flatMap((s) => [...s.hull, ...s.fragments]);
    const flags = parts.map((part) => ({ part, visible: part.visible, culled: part.frustumCulled }));
    canvas.style.visibility = "hidden";
    try {
      // A fleet loaded between animation callbacks shares the previous FRAME id.
      // Force this scene pass to render each warmup call instead of reusing that
      // frame's old scene texture (which never visited the new hidden debris).
      this.scenePass.updateBeforeType = "render";
      // Fractures are normally hidden. Upload their geometry and compile their actual
      // MRT/bloom materials now, rather than pausing on the first fatal impact.
      try {
        for (const { part } of flags) { part.visible = true; part.frustumCulled = false; }
        this.fxPool.warmup(() => this.pipeline.render());
      } finally {
        for (const { part, visible, culled } of flags) { part.visible = visible; part.frustumCulled = culled; }
      }
      this.beginArrival();
      // Replace the offscreen warmup frame before revealing the canvas.
      this.frame(performance.now());
    } finally {
      this.scenePass.updateBeforeType = updateType;
      canvas.style.visibility = visibility;
    }
  }
  sync(state: BattleState) {
    this.state = state;
    if (state.match !== this.epoch) this.reset(state.match);
    if (this.ready && state.level !== this.level)
      void this.loadFleet(state.level).catch((e) => this.fallback(e));
    if (!this.ready && document.documentElement.dataset.battle === "fallback") {
      const anchor = document.getElementById("enemy-anchor");
      if (anchor)
        anchor.style.background = `url(${FLEET[Math.min(15, Math.max(0, state.level))].portrait}) center/contain no-repeat`;
    }
    if (state.event) this.settle(state.event);
    if (this.ready && state.outcome) this.terminalCue(state);
    else if (state.outcome && document.documentElement.dataset.battle === "fallback") this.presentationReady("terminal");
  }
  reset(match: number) {
    usePreferences.setState({ inspect: false });
    this.terminal = false;
    this.epoch = match;
    this.seen.clear();
    this.timelines.forEach((t) => t.timeline.kill());
    this.timelines = [];
    this.effects.forEach((e) => {
      this.releaseEffect(e.object);
    });
    this.effects = [];
    this.ships.forEach((s) => {
      s.fall = null;
      s.freeze = 0;
      s.root.visible = true;
      s.fragments.forEach((p) => {
        p.visible = false;
        p.position.copy(p.userData.original);
        p.rotation.set(0, 0, 0);
      });
      s.hull.forEach((o) => (o.visible = true));
    });
    this.arrival = this.age;
    ++this.arrivalToken;
    if (this.ready && this.ships[1].model) this.beginArrival();
    if (document.documentElement.dataset.battle === "fallback") this.presentationReady("arrival");
    this.hud.reset();
    this.audio.stop();
    this.shockPower.value = 0;
    document.body.classList.remove("impact-scan");
  }
  private layout() {
    this.hud.layout();
    if (!this.ready) return;
    const w = document.documentElement.clientWidth,
      h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aspect.value = w / h;
    for (let i = 0; i < 2; i++) {
      const r = document
        .getElementById(i ? "enemy-anchor" : "hero-anchor")
        ?.getBoundingClientRect();
      if (!r) continue;
      const s = this.ships[i];
      s.base.set(
        ((r.x + r.width / 2 - w / 2) / h) * 10,
        ((h / 2 - r.y - r.height / 2) / h) * 10,
        0,
      );
      s.width =
        Math.min((r.width / h) * 10 * 0.91, (r.height / h) * 10 * 1.55) *
        (i === 0 ? 1 : 0.55 + (Math.max(0, this.level) / 15) * 0.35);
    }
    const dist = 32.071 / 12.071,
      aspect = 1376 / 768,
      scale = 1.02 * Math.max(w / h / aspect, 1);
    this.background.scale.set(
      10 * aspect * scale * dist,
      10 * scale * dist,
      1,
    );
  }
  private releaseEffect(object: THREE.Object3D) {
    if (this.fxPool?.release(object)) return;
    object.removeFromParent();
    disposeObject(object);
  }
  private frame(now: number) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    if (document.hidden) return;
    this.age += dt;
    const { reduced, inspect, sideLight } = usePreferences.getState();
    this.inspectionLight.intensity = sideLight ? 2.2 : 0;
    document.body.classList.toggle("reduced", reduced);
    this.look.x += (this.look.tx - this.look.x) * dt * 3;
    this.look.y += (this.look.ty - this.look.y) * dt * 3;
    this.camera.position.x = reduced ? 0 : this.look.x * 0.06;
    this.camera.position.y = reduced ? 0 : -this.look.y * 0.04;
    this.camera.lookAt(0, 0, 0);
    this.rocks.forEach((r) => {
      r.rotation.y += reduced ? 0 : dt * 0.02;
    });
    for (let i = 0; i < 2; i++) {
      const s = this.ships[i];
      if (this.age >= s.freeze) {
        s.root.position.copy(s.base);
        s.root.scale.setScalar(s.width);
        s.root.rotation.set(0, 0, 0);
        s.root.position.y += reduced
          ? 0
          : Math.sin(this.age * 0.65 + i) * 0.025;
        s.root.position.x +=
          (i ? 1 : -1) * Math.max(0, 1 - (this.age - s.kick) / 0.2) * 0.04;
        if (s.model)
          s.model.rotation.set(0.25, i ? -0.12 : 0.13, i ? 0.025 : -0.025);
        const entrance = reduced
          ? 0
          : Math.max(0, 1 - (this.age - this.arrival) / FX.arrival) ** 3;
        s.root.position.x += (i ? 1 : -1) * entrance * 10;
      }
      s.flames.forEach(
        (f, j) =>
          (f.scale.y =
            1 +
            (reduced ? 0 : Math.sin(this.age * 24 + j) * 0.09) +
            Math.max(0, 1 - (this.age - s.kick) / 0.4)),
      );
      if (s.fall !== null) {
        const t = this.age - s.fall;
        s.root.position.y -= t * t * 0.32;
        s.root.position.z -= t * 0.5;
        s.root.rotation.z = (i ? -1 : 1) * t * 0.23;
        s.fragments.forEach((part, j) => {
          part.position
            .copy(part.userData.original)
            .addScaledVector(part.userData.direction, t * 0.16);
          part.rotation.set(
            t * 0.11 * ((j % 3) - 1),
            t * 0.15 * (j % 2 ? -1 : 1),
            t * 0.08,
          );
        });
        s.root.visible = t < FX.collapse + 2;
      }
    }
    // Inspection is player-only; enemy geometry and lighting keep their battle settings.
    if (inspect && !this.terminal && this.ships[0].fall === null &&
        this.age - this.arrival >= FX.arrival && this.ships[0].model) {
      const s = this.ships[0];
      s.root.position.copy(s.base).lerp(this.ships[1].base, 0.43);
      s.root.position.z = 1.5;
      s.root.scale.setScalar(Math.min((innerWidth / innerHeight) * 5, 6.8));
      s.model!.rotation.set(0.25, reduced ? 0.6 : this.age * 0.2, 0.04);
    }
    for (const t of [...this.timelines])
      t.timeline.totalTime(this.age - t.start);
    this.timelines = this.timelines.filter(
      (t) => t.timeline.totalTime() < t.timeline.totalDuration(),
    );
    this.effects = this.effects.filter((e) => {
      const t = (this.age - e.start) / e.life;
      if (t >= 1) {
        this.releaseEffect(e.object);
        return false;
      }
      e.update(t);
      return true;
    });
    this.shockAge.value += dt;
    this.flash.intensity *= Math.exp(-dt * 12);
    this.hud.draw(this.age, dt, reduced);
    try {
      this.pipeline.render();
    } catch (e) {
      this.fallback(e);
    }
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.loadTicket++;
    this.observer?.disconnect();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onResize);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("starchain:commit", this.onCommit);
    this.timelines.forEach((t) => t.timeline.kill());
    this.hud.dispose();
    this.renderer?.setAnimationLoop(null);
    disposeObject(this.scene);
    this.scene.environment?.dispose();
    this.pipeline?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
