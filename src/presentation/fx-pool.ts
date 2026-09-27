import * as THREE from "three/webgpu";

type Kind = "ring" | "burst" | "beam" | "shield";
type Item = { kind: Kind; mesh: THREE.Mesh; busy: boolean };

// Retain GPU objects and materials between hits. No shader/material construction on fire.
export class CombatFXPool {
  private items: Item[] = [];
  constructor(scene: THREE.Scene, maxParticles: number) {
    const shapes = {
      ring: new THREE.TorusGeometry(1, 0.016, 8, 64),
      burst: new THREE.IcosahedronGeometry(0.023, 0),
      beam: new THREE.CylinderGeometry(1, 1, 1, 10),
      shield: new THREE.SphereGeometry(1, 24, 12),
    };
    for (const [kind, count] of Object.entries({
      ring: 12,
      burst: 10,
      beam: 4,
      shield: 2,
    }) as [Kind, number][]) {
      for (let i = 0; i < count; i++) {
        const material = new THREE.MeshStandardNodeMaterial({
          color: 0x000000,
          emissive: 0xffffff,
          emissiveIntensity: 1.4,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          wireframe: kind === "shield",
        });
        const mesh =
          kind === "burst"
            ? new THREE.InstancedMesh(shapes[kind], material, maxParticles)
            : new THREE.Mesh(shapes[kind], material);
        if (mesh instanceof THREE.InstancedMesh) {
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          const matrix = new THREE.Matrix4();
          for (let j = 0; j < maxParticles; j++) mesh.setMatrixAt(j, matrix);
        }
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.userData.combatFX = true;
        scene.add(mesh);
        this.items.push({ kind, mesh, busy: false });
      }
    }
  }
  warmup(render: () => void) {
    const saved = this.items.map(({ mesh }) => ({ mesh, visible: mesh.visible, opacity: (mesh.material as THREE.Material).opacity }));
    try {
      for (const { mesh } of saved) {
        mesh.visible = true;
        (mesh.material as THREE.Material).opacity = 0;
      }
      render();
    } finally {
      for (const { mesh, visible, opacity } of saved) {
        mesh.visible = visible;
        (mesh.material as THREE.Material).opacity = opacity;
      }
    }
  }
  take(kind: Kind, color: number, opacity = 1) {
    const item = this.items.find((x) => x.kind === kind && !x.busy);
    if (!item) return null; // Bound presentation load; never delay rule settlement.
    item.busy = true;
    const mesh = item.mesh,
      material = mesh.material as THREE.MeshStandardNodeMaterial;
    mesh.visible = true;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
    material.opacity = opacity;
    material.emissive.setHex(color);
    return mesh;
  }
  release(mesh: THREE.Object3D) {
    const item = this.items.find((x) => x.mesh === mesh);
    if (!item) return false;
    item.busy = false;
    item.mesh.visible = false;
    return true;
  }
}
