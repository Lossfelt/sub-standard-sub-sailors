// Kortvarige effekter (eksplosjoner, sonarring) og en enkel tween-motor for animasjoner.
import * as THREE from 'three';
import { ringTexture } from './textures.js';

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export class Effects {
  constructor(stage) {
    this.stage = stage;
    this.tweens = [];
    this.speed = 1; // økes når flere runder står i kø, slik at avspillingen tar igjen
    this.ring = ringTexture();
    this.snow = this.makeSnow();
    stage.scene.add(this.snow);
  }

  // Kjører update(0..1) over gitt varighet. Løftet oppfylles når animasjonen er ferdig.
  tween(seconds, update, ease = easeInOut) {
    return new Promise((resolve) => {
      this.tweens.push({ t: 0, seconds, update, ease, resolve });
    });
  }

  wait(seconds) {
    return this.tween(seconds, () => {});
  }

  // Flytter et objekt gjennom en liste med punkter i jevn fart.
  async moveAlong(object, points, secondsPerStep) {
    for (const target of points) {
      const from = object.position.clone();
      await this.tween(secondsPerStep, (t) => object.position.lerpVectors(from, target, t), (t) => t);
    }
  }

  makeSnow() {
    const n = this.stage.boardSize;
    const count = 90 + n * 6;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (n + 6);
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * (n + 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#a8d8ee', size: 1, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  ping(x, y, color = '#58d6ff', size = 2.2) {
    const material = new THREE.MeshBasicMaterial({
      color, map: this.ring, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(FLAT, material);
    mesh.position.copy(this.stage.cellToWorld(x, y, 0.05));
    this.stage.scene.add(mesh);
    return this.tween(0.9, (t) => {
      mesh.scale.setScalar(0.4 + t * size);
      material.opacity = 1 - t;
    }, (t) => t).then(() => {
      material.dispose();
      mesh.removeFromParent();
    });
  }

  // Lyden av en torpedo som går forbi: små røde ringer som dukker opp etter tur langs banen.
  soundTrail(cells) {
    return Promise.all(cells.map(([x, y], i) => this.wait(0.01 + i * 0.12).then(() => this.ping(x, y, '#ff6a5a', 1.1))));
  }

  explosion(x, y, height = 0.45) {
    const centre = this.stage.cellToWorld(x, y, height);
    const group = new THREE.Group();
    group.position.copy(centre);
    const ballMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true });
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), ballMat);
    const bitMat = new THREE.MeshBasicMaterial({ color: '#ff7a3d', transparent: true });
    const bitGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const bits = Array.from({ length: 10 }, () => {
      const bit = new THREE.Mesh(bitGeo, bitMat);
      bit.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5)
        .multiplyScalar(2.2);
      return bit;
    });
    group.add(ball, ...bits);
    this.stage.scene.add(group);
    this.ping(x, y, '#ff7a3d', 3);
    return this.tween(0.8, (t) => {
      ball.scale.setScalar(0.4 + t * 2.2);
      ballMat.opacity = 1 - t;
      ballMat.color.set(t < 0.25 ? '#ffffff' : '#ff9e58');
      bitMat.opacity = 1 - t * t;
      for (const bit of bits) {
        bit.position.copy(bit.userData.velocity).multiplyScalar(t * 0.6);
        bit.position.y -= t * t * 0.5;
      }
    }, (t) => t).then(() => {
      ball.geometry.dispose();
      bitGeo.dispose();
      ballMat.dispose();
      bitMat.dispose();
      group.removeFromParent();
    });
  }

  update(dt) {
    for (const tween of this.tweens) {
      tween.t = Math.min(1, tween.t + (dt * this.speed) / tween.seconds);
      tween.update(tween.ease(tween.t));
      if (tween.t >= 1) tween.resolve();
    }
    this.tweens = this.tweens.filter((tween) => tween.t < 1);
    const pos = this.snow.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + dt * 0.12;
      pos.setY(i, y > 5 ? 0 : y);
    }
    pos.needsUpdate = true;
  }

  dispose() {
    this.tweens.forEach((tween) => tween.resolve());
    this.tweens = [];
    this.snow.geometry.dispose();
    this.snow.material.dispose();
    this.snow.removeFromParent();
    this.ring.dispose();
  }
}
