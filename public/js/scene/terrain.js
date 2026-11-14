// Bygger selve brettet: fliser, undervannsfjell og pynt. Alt utseende trekkes fra spillets frø,
// slik at alle spillere ser det samme brettet.
import * as THREE from 'three';
import { makeRng } from '/shared/rng.js';
import { key } from '/shared/grid.js';
import { tileTexture, cliffTexture } from './textures.js';

const TILE_TINTS = ['#5f9a8c', '#548a84', '#6aa392', '#4c7d7c', '#5b9480', '#63908f'];
const ROCK_TINTS = ['#66798c', '#54677a', '#74889a', '#5c747c'];
const WEED_TINTS = ['#3fae5a', '#2f9450', '#5cc46a', '#2a8a66'];
const CORAL_TINTS = ['#ff7a8a', '#ff9e58', '#c77dff', '#ffd166', '#58d6ff'];

const dummy = new THREE.Object3D();
const color = new THREE.Color();

function instanced(geometry, count) {
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = 0;
  mesh.frustumCulled = false; // instansene flyttes etter opprettelse
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

function buildBase(size, rng) {
  const cliff = cliffTexture(rng);
  cliff.repeat.set(size, 1);
  const side = new THREE.MeshLambertMaterial({ map: cliff });
  const top = new THREE.MeshLambertMaterial({ color: '#0d2530' });
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.3, 1.3, size + 0.3),
    [side, side, top, top, side, side],
  );
  base.position.y = -0.75;
  return base;
}

function buildTiles(stage, board, rng) {
  const { size } = board;
  const material = new THREE.MeshLambertMaterial({ map: tileTexture(rng) });
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.14, 0.94), material, size * size);
  let i = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rock = board.rocks.has(key(x, y));
      dummy.position.copy(stage.cellToWorld(x, y, -0.07 - rng.next() * 0.035));
      dummy.rotation.set(0, rng.int(4) * (Math.PI / 2), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
      tiles.setColorAt(i, color.set(rock ? '#3c5a66' : rng.pick(TILE_TINTS)));
      i += 1;
    }
  }
  return tiles;
}

// Hvert fjell er en hovedtopp med et par mindre topper rundt.
function buildRocks(stage, board, rng) {
  const rocks = instanced(new THREE.ConeGeometry(0.5, 1, 6), board.rockList.length * 3);
  for (const [x, y] of board.rockList) {
    const centre = stage.cellToWorld(x, y);
    const height = 1.0 + rng.next() * 0.8;
    const jitter = () => (rng.next() - 0.5) * 0.16;
    place(rocks, new THREE.Vector3(centre.x + jitter(), height / 2 - 0.02, centre.z + jitter()),
      new THREE.Vector3(0.9, height, 0.9), rng.next() * 6, rng.pick(ROCK_TINTS), jitter() * 0.6);
    for (let i = 0; i < 2; i++) {
      const h = 0.45 + rng.next() * 0.45;
      const angle = rng.next() * Math.PI * 2;
      place(rocks, new THREE.Vector3(centre.x + Math.cos(angle) * 0.28, h / 2 - 0.02, centre.z + Math.sin(angle) * 0.28),
        new THREE.Vector3(0.5, h, 0.5), rng.next() * 6, rng.pick(ROCK_TINTS), jitter());
    }
  }
  return rocks;
}

// Tang, koraller og småstein i hjørnene av åpne ruter. Ren pynt uten regelbetydning.
function buildDecor(stage, board, rng) {
  const cells = board.size * board.size;
  const weeds = instanced(new THREE.ConeGeometry(0.05, 0.5, 4), cells);
  const corals = instanced(new THREE.IcosahedronGeometry(0.08, 0), cells);
  const pebbles = instanced(new THREE.DodecahedronGeometry(0.07, 0), cells);
  const weedInfo = [];
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const rock = board.rocks.has(key(x, y));
      const roll = rng.next();
      if (roll > (rock ? 0.5 : 0.3)) continue;
      const centre = stage.cellToWorld(x, y);
      const corner = new THREE.Vector3(centre.x + (rng.int(2) ? 0.3 : -0.3), 0, centre.z + (rng.int(2) ? 0.3 : -0.3));
      for (let i = 0; i < 3 && mesh(roll, weeds, corals, pebbles).count < cells; i++) {
        const target = mesh(roll, weeds, corals, pebbles);
        const pos = corner.clone().add(new THREE.Vector3((rng.next() - 0.5) * 0.2, 0, (rng.next() - 0.5) * 0.2));
        if (target === weeds) {
          const h = 0.6 + rng.next() * 0.9;
          pos.y = h * 0.25;
          weedInfo.push({ index: weeds.count, pos, h, phase: rng.next() * 6 });
          place(weeds, pos, new THREE.Vector3(1, h, 1), 0, rng.pick(WEED_TINTS));
        } else if (target === corals) {
          const s = 0.7 + rng.next() * 0.9;
          pos.y = 0.06 * s;
          place(corals, pos, new THREE.Vector3(s, s * 1.3, s), rng.next() * 6, rng.pick(CORAL_TINTS));
        } else {
          pos.y = 0.03;
          place(pebbles, pos, new THREE.Vector3(1.2, 0.7, 1), rng.next() * 6, rng.pick(ROCK_TINTS));
        }
      }
    }
  }
  return { weeds, corals, pebbles, weedInfo };
}

function mesh(roll, weeds, corals, pebbles) {
  if (roll < 0.14) return weeds;
  return roll < 0.22 ? corals : pebbles;
}

export function buildTerrain(stage, board, seed) {
  const rng = makeRng(seed ^ 0x5eabed);
  const group = new THREE.Group();
  const decor = buildDecor(stage, board, rng);
  group.add(buildBase(board.size, rng), buildTiles(stage, board, rng), buildRocks(stage, board, rng),
    decor.weeds, decor.corals, decor.pebbles);

  // Tangen svaier svakt i strømmen.
  const sway = (time) => {
    for (const w of decor.weedInfo) {
      dummy.position.copy(w.pos);
      dummy.scale.set(1, w.h, 1);
      dummy.rotation.set(Math.sin(time * 1.3 + w.phase) * 0.18, 0, Math.cos(time * 1.1 + w.phase) * 0.18);
      dummy.updateMatrix();
      decor.weeds.setMatrixAt(w.index, dummy.matrix);
    }
    decor.weeds.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    group.traverse((obj) => {
      obj.geometry?.dispose();
      for (const m of [].concat(obj.material ?? [])) {
        m.map?.dispose();
        m.dispose();
      }
    });
    group.removeFromParent();
  };
  return { group, sway, dispose };
}
