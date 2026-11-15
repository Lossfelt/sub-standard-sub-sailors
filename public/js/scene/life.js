// Liv i vannet: små fiskestimer som sirkler over brettet, bobler som stiger fra bunnen og
// røyk fra de undersjøiske vulkanene.
// Ren stemning, uten betydning for spillet.
import * as THREE from 'three';

const FISH_TINTS = ['#ffb347', '#ff8a7a', '#d5ecf5', '#8fe3c8'];
const BUBBLES = { count: 4, top: 3.2, speed: 0.5, color: '#bfe9f7', size: 1, opacity: 0.7, spread: 0.09 };
const SMOKE = { count: 9, top: 2.4, speed: 0.35, color: '#565c68', size: 3, opacity: 0.8, spread: 0.16 };

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export class Life {
  constructor(stage, vents, smokers, rng) {
    this.stage = stage;
    this.fish = this.makeFish(rng);
    this.plumes = [this.makePlume(vents, BUBBLES, rng), this.makePlume(smokers, SMOKE, rng)];
    stage.scene.add(this.fish.mesh, ...this.plumes.map((plume) => plume.points));
  }

  makeFish(rng) {
    const size = this.stage.boardSize;
    const schools = 2 + Math.floor(size / 7);
    const swimmers = [];
    for (let s = 0; s < schools; s++) {
      const school = {
        x: (rng.next() - 0.5) * size * 0.8,
        z: (rng.next() - 0.5) * size * 0.8,
        radius: 1.2 + rng.next() * 1.6,
        height: 1.1 + rng.next() * 1.1,
        speed: (0.25 + rng.next() * 0.3) * (rng.int(2) ? 1 : -1),
        tint: rng.pick(FISH_TINTS),
      };
      const count = 4 + rng.int(4);
      for (let i = 0; i < count; i++) {
        swimmers.push({ school, phase: i * 0.42 + rng.next() * 0.2, lane: (rng.next() - 0.5) * 0.5 });
      }
    }
    // Fisken er en liten kjegle med spissen bakover, altså peker "hodet" mot +X.
    const geometry = new THREE.ConeGeometry(0.045, 0.2, 4).rotateZ(Math.PI / 2).scale(1, 1.6, 0.5);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ flatShading: true }), swimmers.length);
    mesh.frustumCulled = false;
    swimmers.forEach((f, i) => mesh.setColorAt(i, color.set(f.school.tint)));
    return { mesh, swimmers };
  }

  // En sky av punkter som stiger fra hvert utgangspunkt og begynner på nytt når de når toppen.
  makePlume(sources, style, rng) {
    const count = sources.length * style.count;
    const positions = new Float32Array(Math.max(1, count) * 3);
    const info = [];
    for (const source of sources) {
      for (let i = 0; i < style.count; i++) {
        info.push({ source, offset: rng.next() * style.top, speed: style.speed * (1 + rng.next()), phase: rng.next() * 6 });
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, count);
    const material = new THREE.PointsMaterial({
      color: style.color, size: style.size, sizeAttenuation: false, transparent: true, opacity: style.opacity, depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, info, style };
  }

  update(time) {
    this.fish.swimmers.forEach((f, i) => {
      const { school } = f;
      const angle = time * school.speed + f.phase;
      const radius = school.radius + f.lane;
      dummy.position.set(
        school.x + Math.cos(angle) * radius,
        school.height + Math.sin(time * 2 + f.phase * 3) * 0.08,
        school.z + Math.sin(angle) * radius,
      );
      // Peker langs sirkelens tangent, med eller mot klokka etter fartsretningen.
      const dir = Math.sign(school.speed);
      dummy.rotation.set(0, Math.atan2(-Math.cos(angle) * dir, -Math.sin(angle) * dir), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.fish.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.fish.mesh.instanceMatrix.needsUpdate = true;

    for (const { points, info, style } of this.plumes) {
      const pos = points.geometry.attributes.position;
      info.forEach((b, i) => {
        const rise = (b.offset + time * b.speed) % style.top;
        pos.setXYZ(
          i,
          b.source.x + Math.sin(time * 2 + b.phase) * style.spread * (1 + rise),
          b.source.y + rise,
          b.source.z + Math.cos(time * 1.7 + b.phase) * style.spread * (1 + rise),
        );
      });
      pos.needsUpdate = true;
    }
  }

  dispose() {
    for (const obj of [this.fish.mesh, ...this.plumes.map((plume) => plume.points)]) {
      obj.geometry.dispose();
      obj.material.dispose();
      obj.removeFromParent();
    }
  }
}
