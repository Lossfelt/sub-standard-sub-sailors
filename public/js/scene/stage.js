// Renderer, isometrisk kamera og koordinatomregning. Scenen tegnes i lav oppløsning og
// skaleres opp uten utjevning, som gir det pikselerte uttrykket.
import * as THREE from 'three';

const PITCH = Math.PI / 6; // 30 grader gir klassisk 2:1 "isometrisk" pikselgrafikk
const CAMERA_DISTANCE = 60;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class Stage {
  constructor(canvas, labelRoot) {
    this.canvas = canvas;
    this.labelRoot = labelRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.raycaster = new THREE.Raycaster();
    this.boardSize = 10;
    this.quarter = 0;
    this.yaw = Math.PI / 4;
    this.zoom = 1;
    this.pan = new THREE.Vector2();
    this.bottomInset = 0; // CSS-piksler nederst som dekkes av ordrepanelet
    this.shake = 0;
    this.labels = new Set();
    this.frameCallbacks = [];
    this.lastTime = 0;
    this.addLights();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x0b2233, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(4, 10, 3);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x3fb6d8, 0.5);
    fill.position.set(-5, 3, -6);
    this.scene.add(fill);
  }

  get targetYaw() {
    return Math.PI / 4 + this.quarter * (Math.PI / 2);
  }

  rotate(step) {
    this.quarter += step;
  }

  setBoardSize(size) {
    this.boardSize = size;
    this.zoom = 1;
    this.pan.set(0, 0);
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const pixel = w < 760 ? 2 : 3;
    this.renderer.setSize(Math.ceil(w / pixel), Math.ceil(h / pixel), false);
    this.updateCamera();
  }

  updateCamera() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    const n = this.boardSize;
    const usable = Math.max(0.45, 1 - this.bottomInset / h);
    // Halv bredde/høyde brettet trenger: diagonalen vannrett, og den sammentrykte diagonalen loddrett.
    const halfH = Math.max((n * 0.3536 + 1.7) / usable, (n * 0.7071 + 0.9) / aspect);
    const cam = this.camera;
    cam.left = -halfH * aspect;
    cam.right = halfH * aspect;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.zoom = this.zoom;
    cam.updateProjectionMatrix();
    const c = Math.cos(PITCH);
    cam.position.set(c * Math.sin(this.yaw), Math.sin(PITCH), c * Math.cos(this.yaw))
      .multiplyScalar(CAMERA_DISTANCE);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const lift = (halfH * (1 - usable)) / this.zoom; // løfter brettet opp over ordrepanelet
    const jitter = this.shake > 0.01 ? (Math.random() - 0.5) * this.shake : 0;
    cam.position.addScaledVector(right, this.pan.x + jitter);
    cam.position.addScaledVector(up, this.pan.y - lift + jitter);
    cam.updateMatrixWorld();
  }

  // Flytter utsnittet. dx/dy er CSS-piksler slik de kommer fra pekeren.
  panBy(dx, dy) {
    const unitsPerPixel = (this.camera.top - this.camera.bottom) / this.zoom / this.canvas.clientHeight;
    const limit = this.boardSize * 0.6;
    this.pan.x = THREE.MathUtils.clamp(this.pan.x - dx * unitsPerPixel, -limit, limit);
    this.pan.y = THREE.MathUtils.clamp(this.pan.y + dy * unitsPerPixel, -limit, limit);
  }

  zoomBy(factor) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 1, 3.5);
    if (this.zoom === 1) this.pan.set(0, 0);
  }

  cellToWorld(x, y, height = 0) {
    const offset = (this.boardSize - 1) / 2;
    return new THREE.Vector3(x - offset, height, y - offset);
  }

  // Hvilken rute pekeren treffer, eller null utenfor brettet.
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
    if (!hit) return null;
    const offset = (this.boardSize - 1) / 2;
    const x = Math.round(hit.x + offset);
    const y = Math.round(hit.z + offset);
    const inside = x >= 0 && y >= 0 && x < this.boardSize && y < this.boardSize;
    return inside ? { x, y } : null;
  }

  // Hvilken skjermdiagonal (NE/SE/SW/NW) en rutenettretning peker i med gjeldende brettvinkel.
  screenSlot(dx, dy) {
    const yaw = this.targetYaw;
    const sx = dx * Math.cos(yaw) - dy * Math.sin(yaw);
    const sy = -(dx * Math.sin(yaw) + dy * Math.cos(yaw));
    return (sy > 0 ? 'N' : 'S') + (sx > 0 ? 'E' : 'W');
  }

  addLabel(className, text = '') {
    const el = document.createElement('div');
    el.className = `label ${className}`;
    el.textContent = text;
    this.labelRoot.append(el);
    const label = { el, pos: new THREE.Vector3(), remove: () => { el.remove(); this.labels.delete(label); } };
    this.labels.add(label);
    return label;
  }

  updateLabels() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const label of this.labels) {
      v.copy(label.pos).project(this.camera);
      label.el.style.left = `${((v.x + 1) / 2) * w}px`;
      label.el.style.top = `${((1 - v.y) / 2) * h}px`;
    }
  }

  onFrame(callback) {
    this.frameCallbacks.push(callback);
  }

  frame(time) {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    const diff = this.targetYaw - this.yaw;
    this.yaw += Math.abs(diff) < 0.002 ? diff : diff * Math.min(1, dt * 9);
    this.shake *= 0.9;
    this.updateCamera();
    for (const callback of this.frameCallbacks) callback(dt, time / 1000);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }
}
