// Renderer, isometrisk kamera og koordinatomregning. Scenen tegnes i lav oppløsning og
// skaleres opp uten utjevning, som gir det pikselerte uttrykket.
import * as THREE from 'three';
import { PostProcess } from './post.js';

const PITCH = Math.PI / 6; // 30 grader gir klassisk 2:1 "isometrisk" pikselgrafikk
// Rett brett ses brattere ovenfra, slik at det fyller mer av en høy mobilskjerm.
const PITCH_STRAIGHT = (50 * Math.PI) / 180;
const CAMERA_DISTANCE = 60;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ANGLE_KEY = 'ssss-view';

function readAngled() {
  try {
    return localStorage.getItem(ANGLE_KEY) !== 'rett';
  } catch {
    return true;
  }
}

export class Stage {
  constructor(canvas, labelRoot) {
    this.canvas = canvas;
    this.labelRoot = labelRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.post = new PostProcess(this.renderer);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.raycaster = new THREE.Raycaster();
    this.boardSize = 10;
    this.quarter = 0;
    // Skrå (isometrisk, ruter på spiss) eller rett (kantene parallelle med skjermen). Rett
    // utnytter en smal mobilskjerm bedre, siden brettet ikke står på høykant.
    this.angled = readAngled();
    this.yaw = this.targetYaw;
    this.zoom = 1;
    this.pan = new THREE.Vector2();
    this.bottomInset = 0; // CSS-piksler nederst som dekkes av ordrepanelet
    this.shake = 0;
    this.follow = null; // punkt i verden som utsnittet følger mykt når man er zoomet inn
    this.labels = new Set();
    this.frameCallbacks = [];
    this.lastTime = 0;
    this.addLights();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xa9dcff, 0x0b2a3a, 1.0));
    // Sollyset ovenfra kaster skygger, slik at fjell og ubåter får tyngde mot bunnen.
    const sun = new THREE.DirectionalLight(0xf2fbff, 2.0);
    sun.position.set(7, 14, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.002;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x3fb6d8, 0.45);
    fill.position.set(-5, 3, -6);
    this.scene.add(fill);
  }

  get targetYaw() {
    return (this.angled ? Math.PI / 4 : 0) + this.quarter * (Math.PI / 2);
  }

  setAngled(angled) {
    this.angled = angled;
    try {
      localStorage.setItem(ANGLE_KEY, angled ? 'skrå' : 'rett');
    } catch { /* valget huskes bare ikke til neste gang */ }
  }

  rotate(step) {
    this.quarter += step;
  }

  setBoardSize(size) {
    this.boardSize = size;
    this.zoom = 1;
    this.pan.set(0, 0);
    const reach = size * 0.8 + 2; // skyggekartet må dekke hele brettet
    const cam = this.sun.shadow.camera;
    Object.assign(cam, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 50 });
    cam.updateProjectionMatrix();
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const pixel = w < 1100 ? 2 : 3; // skjermpiksler per spillpiksel
    const width = Math.ceil(w / pixel);
    const height = Math.ceil(h / pixel);
    this.renderer.setSize(width, height, false);
    this.post.setSize(width, height);
    this.updateCamera();
  }

  updateCamera() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    const n = this.boardSize;
    const usable = Math.max(0.45, 1 - this.bottomInset / h);
    // Halv bredde/høyde brettet trenger: diagonalen vannrett, og den sammentrykte diagonalen loddrett.
    // Skrått: diagonalen vannrett og den sammentrykte diagonalen loddrett. Rett: siden vannrett,
    // og siden sammentrykt av kameravinkelen loddrett.
    const halfH = this.angled
      ? Math.max((n * 0.3536 + 1.7) / usable, (n * 0.7071 + 0.9) / aspect)
      : Math.max((n * 0.5 * Math.sin(PITCH_STRAIGHT) + 1.9) / usable, (n * 0.5 + 1.4) / aspect);
    const cam = this.camera;
    cam.left = -halfH * aspect;
    cam.right = halfH * aspect;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.zoom = this.zoom;
    cam.updateProjectionMatrix();
    // Hvor mange spillpiksler en rute er bred på skjermen. Brukes til å forenkle detaljer.
    this.cellPixels = (this.renderer.domElement.height * this.zoom) / (2 * halfH);
    // 0 helt utzoomet på liten skjerm, 1 når rutene er store nok til å vise alle detaljer.
    this.detail = THREE.MathUtils.clamp((this.cellPixels - 12) / 14, 0, 1);
    const pitch = this.angled ? PITCH : PITCH_STRAIGHT;
    const c = Math.cos(pitch);
    cam.position.set(c * Math.sin(this.yaw), Math.sin(pitch), c * Math.cos(this.yaw))
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
    if (dx || dy) this.follow = null; // spilleren tar over utsnittet selv
    const unitsPerPixel = (this.camera.top - this.camera.bottom) / this.zoom / this.canvas.clientHeight;
    const limit = this.boardSize * 0.6;
    this.pan.x = THREE.MathUtils.clamp(this.pan.x - dx * unitsPerPixel, -limit, limit);
    this.pan.y = THREE.MathUtils.clamp(this.pan.y + dy * unitsPerPixel, -limit, limit);
  }

  // Zoomer rundt et punkt på skjermen (CSS-piksler), slik at det som er under pekeren blir stående.
  // Uten punkt zoomes det rundt midten. Helt utzoomet sentreres brettet igjen.
  zoomBy(factor, clientX = null, clientY = null) {
    const before = this.zoom;
    const after = THREE.MathUtils.clamp(before * factor, 1, 4);
    if (after === before) return;
    if (after < before) {
      this.pan.multiplyScalar(before > 1 ? (after - 1) / (before - 1) : 0);
    } else if (clientX != null) {
      const rect = this.canvas.getBoundingClientRect();
      const halfH = this.camera.top;
      const offX = (((clientX - rect.left) / rect.width) * 2 - 1) * this.camera.right;
      const offY = (1 - ((clientY - rect.top) / rect.height) * 2) * halfH;
      const lift = halfH * (1 - Math.max(0.45, 1 - this.bottomInset / rect.height));
      const shift = 1 / before - 1 / after;
      this.pan.x += offX * shift;
      this.pan.y += (offY - lift) * shift;
    }
    this.zoom = after;
    this.panBy(0, 0); // holder utsnittet innenfor grensene
  }

  // Zoomer inn om nødvendig og lar utsnittet følge punktet til spilleren flytter det selv.
  followPoint(point) {
    this.follow = point;
    if (this.zoom < 1.6) this.zoom = 2;
  }

  updateFollow(dt) {
    if (!this.follow || this.zoom <= 1.01) return;
    const m = this.camera.matrixWorld;
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
    const limit = this.boardSize * 0.6;
    const target = new THREE.Vector2(this.follow.dot(right), this.follow.clone().setY(0).dot(up)).clampScalar(-limit, limit);
    this.pan.lerp(target, Math.min(1, dt * 4));
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

  // Hvilken av åtte skjermretninger (N = opp, NE, E = høyre ...) en rutenettretning peker i
  // med gjeldende brettvinkel. Rutenettets hovedretninger havner på skjermens diagonaler.
  screenSlot(dx, dy) {
    const yaw = this.targetYaw;
    const sx = dx * Math.cos(yaw) - dy * Math.sin(yaw);
    const sy = -(dx * Math.sin(yaw) + dy * Math.cos(yaw));
    const octant = Math.round(Math.atan2(sx, sy) / (Math.PI / 4));
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][(octant + 8) % 8];
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
    this.updateFollow(dt);
    this.updateCamera();
    for (const callback of this.frameCallbacks) callback(dt, time / 1000);
    this.post.render(this.scene, this.camera, time / 1000, this.detail);
    this.updateLabels();
  }
}
