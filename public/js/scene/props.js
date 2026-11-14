// Ting som står på brettet: undervannsfjell og pynt (tang, koraller, småstein, lysende krystaller).
// Bare fjellene har regelbetydning, resten er dekor.
import * as THREE from 'three';
import { key } from '/shared/grid.js';

const ROCK_TINTS = ['#ffffff', '#e4edf2', '#d6e2ea', '#f1eee2'];
const WEED_TINTS = ['#3fae5a', '#2f9450', '#5cc46a', '#2a8a66'];
const CORAL_TINTS = ['#ff7a8a', '#ff9e58', '#c77dff', '#ffd166'];
const PEBBLE_TINTS = ['#8fa3b0', '#7b8f9c', '#a3b3ba'];
const CRYSTAL_TINTS = ['#7df9ff', '#b388ff', '#8dffb0'];

const dummy = new THREE.Object3D();
const color = new THREE.Color();

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = 0;
  mesh.frustumCulled = false; // instansene plasseres etter opprettelse
  return mesh;
}

function place(mesh, pos, scale, rotY, tint, tilt = 0) {
  dummy.position.copy(pos);
  dummy.scale.copy(scale);
  dummy.rotation.set(tilt, rotY, tilt * 0.6);
  dummy.updateMatrix();
  mesh.setMatrixAt(mesh.count, dummy.matrix);
  mesh.setColorAt(mesh.count, color.set(tint));
  mesh.count += 1;
}

// Kjegle med hakkete sider og farge etter høyde: mørk og kald nederst, lys på toppen.
function rockGeometry() {
  const geometry = new THREE.ConeGeometry(0.5, 1, 7, 4);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color('#2f4354');
  const mid = new THREE.Color('#62798c');
  const top = new THREE.Color('#b4c5cd');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = y + 0.5;
    // Forskyvningen regnes fra posisjonen, slik at doble punkter i sømmen flytter seg likt.
    const hash = Math.sin(x * 91.7 + y * 47.3 + z * 63.1) * 43758.5;
    const jitter = hash - Math.floor(hash);
    if (h > 0.01 && h < 0.99) {
      const spread = 0.78 + jitter * 0.5;
      pos.setXYZ(i, x * spread, y + (jitter - 0.5) * 0.1, z * spread);
    }
    color.copy(h < 0.5 ? low : mid).lerp(h < 0.5 ? mid : top, h < 0.5 ? h * 2 : (h - 0.5) * 2);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Hvert fjell er en hovedtopp med et par mindre topper rundt.
export function buildRocks(stage, board, rng) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const rocks = instanced(rockGeometry(), material, board.rockList.length * 4);
  rocks.castShadow = true;
  const jitter = () => (rng.next() - 0.5) * 0.16;
  for (const [x, y] of board.rockList) {
    const centre = stage.cellToWorld(x, y);
    const height = 1.1 + rng.next() * 0.9;
    place(rocks, new THREE.Vector3(centre.x + jitter(), height / 2 - 0.03, centre.z + jitter()),
      new THREE.Vector3(0.95, height, 0.95), rng.next() * 6, rng.pick(ROCK_TINTS), jitter() * 0.5);
    for (let i = 0; i < 2 + rng.int(2); i++) {
      const h = 0.4 + rng.next() * 0.55;
      const angle = rng.next() * Math.PI * 2;
      const pos = new THREE.Vector3(centre.x + Math.cos(angle) * 0.3, h / 2 - 0.03, centre.z + Math.sin(angle) * 0.3);
      place(rocks, pos, new THREE.Vector3(0.5, h, 0.5), rng.next() * 6, rng.pick(ROCK_TINTS), jitter());
    }
  }
  return rocks;
}

const lit = () => new THREE.MeshLambertMaterial({ flatShading: true });

// Pynt i hjørnene av rutene. Returnerer også hvor det bobler opp fra bunnen.
export function buildDecor(stage, board, rng) {
  const cells = board.size * board.size;
  const weeds = instanced(new THREE.ConeGeometry(0.06, 0.5, 4), lit(), cells);
  const corals = instanced(new THREE.IcosahedronGeometry(0.09, 0), lit(), cells);
  const pebbles = instanced(new THREE.DodecahedronGeometry(0.08, 0), lit(), cells);
  // Krystallene lyser av seg selv og påvirkes ikke av lyset i scenen.
  const crystals = instanced(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial(), cells);
  corals.castShadow = true;
  pebbles.castShadow = true;
  const weedInfo = [];
  const vents = [];
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const rock = board.rocks.has(key(x, y));
      const roll = rng.next();
      const centre = stage.cellToWorld(x, y);
      if (!rock && roll > 0.975) vents.push(centre.clone());
      if (roll > (rock ? 0.55 : 0.34)) continue;
      const corner = new THREE.Vector3(centre.x + (rng.int(2) ? 0.3 : -0.3), 0, centre.z + (rng.int(2) ? 0.3 : -0.3));
      for (let i = 0; i < 3; i++) {
        const pos = corner.clone().add(new THREE.Vector3((rng.next() - 0.5) * 0.22, 0, (rng.next() - 0.5) * 0.22));
        if (roll < 0.15) {
          const h = 0.8 + rng.next() * 1.2;
          pos.y = h * 0.25;
          weedInfo.push({ index: weeds.count, pos, h, phase: rng.next() * 6 });
          place(weeds, pos, new THREE.Vector3(1, h, 1), 0, rng.pick(WEED_TINTS));
        } else if (roll < 0.23) {
          const s = 0.8 + rng.next() * 1.0;
          pos.y = 0.07 * s;
          place(corals, pos, new THREE.Vector3(s, s * 1.4, s), rng.next() * 6, rng.pick(CORAL_TINTS));
        } else if (roll < 0.27 && i < 2) {
          const s = 0.8 + rng.next() * 0.9;
          pos.y = 0.08 * s;
          place(crystals, pos, new THREE.Vector3(s * 0.7, s * 1.6, s * 0.7), rng.next() * 6, rng.pick(CRYSTAL_TINTS));
        } else if (roll >= 0.27) {
          pos.y = 0.03;
          place(pebbles, pos, new THREE.Vector3(1.2, 0.7, 1), rng.next() * 6, rng.pick(PEBBLE_TINTS));
        }
      }
    }
  }

  // Tangen svaier svakt i strømmen.
  const sway = (time) => {
    for (const w of weedInfo) {
      dummy.position.copy(w.pos);
      dummy.scale.set(1, w.h, 1);
      dummy.rotation.set(Math.sin(time * 1.3 + w.phase) * 0.18, 0, Math.cos(time * 1.1 + w.phase) * 0.18);
      dummy.updateMatrix();
      weeds.setMatrixAt(w.index, dummy.matrix);
    }
    weeds.instanceMatrix.needsUpdate = true;
  };
  return { meshes: [weeds, corals, pebbles, crystals], sway, vents };
}
