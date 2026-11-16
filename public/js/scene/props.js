// Ting som står på brettet: undervannsfjell og pynt (tang, koraller, småstein, lysende krystaller).
// Bare fjellene har regelbetydning, resten er dekor.
import * as THREE from 'three';
import { key } from '/shared/grid.js';
import { rockTexture, chimneyTextures } from './groundtex.js';

const ROCK_TINTS = ['#ffffff', '#e4edf2', '#d6e2ea', '#f1eee2'];
const WEED_TINTS = ['#3fae5a', '#2f9450', '#5cc46a', '#2a8a66'];
const CORAL_TINTS = ['#e8788a', '#e89a5c', '#b07fe0', '#e6c36a'];
const STARFISH_TINTS = ['#e8724a', '#d9566e', '#e6a64a'];
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

// Kjegle med hakkete sider. Fargene kommer fra fjellteksturen.
function rockGeometry() {
  const geometry = new THREE.ConeGeometry(0.5, 1, 7, 4);
  const pos = geometry.attributes.position;
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
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Skorstein til en undersjøisk vulkan ("smoker"). Basalt og glød kommer fra teksturen.
function chimneyGeometry() {
  const geometry = new THREE.CylinderGeometry(0.16, 0.42, 1, 7, 3);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = y + 0.5;
    const hash = Math.sin(x * 71.3 + y * 37.9 + z * 53.7) * 43758.5;
    const jitter = hash - Math.floor(hash);
    if (h > 0.01 && h < 0.99) pos.setXYZ(i, x * (0.85 + jitter * 0.35), y, z * (0.85 + jitter * 0.35));
  }
  geometry.computeVertexNormals();
  return geometry;
}

const SMOKER_SHARE = 0.35; // andel av fjellrutene som i stedet er vulkaner. Samme regler, annet utseende.

// Fjellruter er enten et fjell (hovedtopp med småtopper rundt) eller en rykende vulkan.
export function buildRocks(stage, board, rng) {
  const rockMat = new THREE.MeshLambertMaterial({ map: rockTexture(rng), flatShading: true });
  const lava = chimneyTextures(rng);
  const chimneyMat = new THREE.MeshLambertMaterial({
    map: lava.map, emissiveMap: lava.emissive, emissive: '#ffffff', flatShading: true,
  });
  const count = board.rockList.length;
  const rocks = instanced(rockGeometry(), rockMat, count * 4);
  const chimneys = instanced(chimneyGeometry(), chimneyMat, count * 3);
  // Glødende åpning på toppen av skorsteinen. Lyser av seg selv.
  const glow = instanced(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 7), new THREE.MeshBasicMaterial(), count * 3);
  rocks.castShadow = true;
  chimneys.castShadow = true;
  const smokers = [];
  const jitter = () => (rng.next() - 0.5) * 0.16;
  const one = new THREE.Vector3(1, 1, 1);
  for (const [x, y] of board.rockList) {
    const centre = stage.cellToWorld(x, y);
    if (rng.chance(SMOKER_SHARE)) {
      for (let i = 0; i < 1 + rng.int(2); i++) {
        const h = i === 0 ? 0.75 + rng.next() * 0.45 : 0.35 + rng.next() * 0.25;
        const width = i === 0 ? 1 : 0.6;
        const px = centre.x + (i === 0 ? jitter() : (rng.int(2) ? 0.28 : -0.28));
        const pz = centre.z + (i === 0 ? jitter() : (rng.int(2) ? 0.28 : -0.28));
        place(chimneys, new THREE.Vector3(px, h / 2 - 0.03, pz), new THREE.Vector3(width, h, width), rng.next() * 6, '#ffffff');
        place(glow, new THREE.Vector3(px, h - 0.04, pz), one.clone().multiplyScalar(width), 0, rng.pick(['#ff8a3d', '#ffb347', '#ff6a3d']));
        smokers.push(new THREE.Vector3(px, h, pz));
      }
      continue;
    }
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
  return { meshes: [rocks, chimneys, glow], smokers };
}

const lit = () => new THREE.MeshLambertMaterial({ flatShading: true });

// Flat femtakket sjøstjerne som ligger på bunnen.
function starfishGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? 0.05 : 0.13;
    const angle = (i / 10) * Math.PI * 2;
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

// Pynt i hjørnene av rutene. Returnerer også hvor det bobler opp fra bunnen.
export function buildDecor(stage, board, rng) {
  const cells = board.size * board.size;
  const weeds = instanced(new THREE.ConeGeometry(0.06, 0.5, 4), lit(), cells);
  // Rørkoraller: små klynger av stående rør i ulik høyde.
  const corals = instanced(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5), lit(), cells);
  const starfish = instanced(starfishGeometry(), lit(), cells);
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
      let tint = null;
      for (let i = 0; i < 3; i++) {
        const pos = corner.clone().add(new THREE.Vector3((rng.next() - 0.5) * 0.22, 0, (rng.next() - 0.5) * 0.22));
        if (roll < 0.15) {
          const h = 0.8 + rng.next() * 1.2;
          pos.y = h * 0.25;
          weedInfo.push({ index: weeds.count, pos, h, phase: rng.next() * 6 });
          place(weeds, pos, new THREE.Vector3(1, h, 1), 0, rng.pick(WEED_TINTS));
        } else if (roll < 0.23) {
          const h = 0.5 + rng.next() * 0.9;
          pos.y = 0.15 * h;
          if (i === 0) tint = rng.pick(CORAL_TINTS); // hele klyngen har samme farge
          place(corals, pos, new THREE.Vector3(1, h, 1), rng.next() * 6, tint);
        } else if (roll < 0.27 && i < 2) {
          const s = 0.8 + rng.next() * 0.9;
          pos.y = 0.08 * s;
          place(crystals, pos, new THREE.Vector3(s * 0.7, s * 1.6, s * 0.7), rng.next() * 6, rng.pick(CRYSTAL_TINTS));
        } else if (roll >= 0.27 && roll < 0.295) {
          pos.y = 0.012;
          if (i === 0) place(starfish, pos, new THREE.Vector3(1, 1, 1), rng.next() * 6, rng.pick(STARFISH_TINTS));
        } else if (roll >= 0.295) {
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
  return { meshes: [weeds, corals, starfish, pebbles, crystals], sway, vents };
}
