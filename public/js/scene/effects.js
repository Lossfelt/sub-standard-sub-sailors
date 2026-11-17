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
    this.bubbles = this.makeBubbles();
    stage.scene.add(this.snow, this.bubbles.points);
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

  // Et lager av bobler som kan slippes hvor som helst: de stiger, driver litt og forsvinner.
  makeBubbles() {
    const count = 500;
    const positions = new Float32Array(count * 3).fill(-50);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#d6f2fb', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, life: new Float32Array(count), rise: new Float32Array(count), next: 0 };
  }

  bubble(pos, spread = 0.08) {
    const { points, life, rise } = this.bubbles;
    const i = this.bubbles.next;
    this.bubbles.next = (i + 1) % life.length;
    const r = () => (Math.random() - 0.5) * 2 * spread;
    points.geometry.attributes.position.setXYZ(i, pos.x + r(), pos.y + r(), pos.z + r());
    life[i] = 0.7 + Math.random() * 0.9;
    rise[i] = 0.4 + Math.random() * 0.6;
  }

  updateBubbles(dt) {
    const { points, life, rise } = this.bubbles;
    const pos = points.geometry.attributes.position;
    for (let i = 0; i < life.length; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      pos.setY(i, life[i] <= 0 ? -50 : pos.getY(i) + rise[i] * dt);
    }
    pos.needsUpdate = true;
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
    const bits = Array.from({ length: 22 }, () => {
      const bit = new THREE.Mesh(bitGeo, bitMat);
      bit.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5)
        .multiplyScalar(2.2);
      return bit;
    });
    group.add(ball, ...bits);
    this.stage.scene.add(group);
    // Trykkbølge: en rask hvit ring, en oransje, og en stor som brer seg over flisene rundt.
    this.ping(x, y, '#ffffff', 2.2);
    this.ping(x, y, '#ff7a3d', 4);
    this.wait(0.18).then(() => this.ping(x, y, '#ffd9a8', 7.5));
    for (let i = 0; i < 40; i++) this.bubble(centre, 0.45);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.stage.shake = Math.max(this.stage.shake, 0.4);
    return this.tween(0.9, (t) => {
      ball.scale.setScalar(0.5 + t * 3.4);
      ballMat.opacity = 1 - t;
      ballMat.color.set(t < 0.25 ? '#ffffff' : '#ff9e58');
      bitMat.opacity = 1 - t * t;
      for (const bit of bits) {
        bit.position.copy(bit.userData.velocity).multiplyScalar(t * 0.8);
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
    this.updateBubbles(dt);
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
    this.bubbles.points.geometry.dispose();
    this.bubbles.points.material.dispose();
    this.bubbles.points.removeFromParent();
    this.ring.dispose();
  }
}
