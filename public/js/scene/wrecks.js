// Gamle skipsvrak og buegangsruiner på fjellruter, og småting (kasser, tønner, krukker) på åpne
// ruter. Det som står høyt virker som fjell i reglene. Det som ligger lavt er bare pynt.
import * as THREE from 'three';
import { pixelTexture } from './textures.js';

const parent = new THREE.Object3D();
const child = new THREE.Object3D();
const matrix = new THREE.Matrix4();
const color = new THREE.Color();
const WOOD_TINTS = ['#6b5a46', '#5e5040', '#76634a'];

const px = (ctx, x, y, fill) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, 1, 1);
};

// Råtne planker: lyse og mørke bord med fuger, spikerhull og grønne begroinger.
function woodTexture(rng) {
  const tones = ['#4a3b2c', '#6e5a43', '#8a7356', '#a68d6b'];
  return pixelTexture(16, 32, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const plank = x >> 2;
      for (let y = 0; y < h; y++) {
        let tone = 1 + ((plank + (y > 20 ? 1 : 0)) % 2);
        if (x % 4 === 0) tone = 0;
        else if (x % 4 === 1) tone = Math.min(3, tone + 1);
        if ((y + plank * 7) % 13 === 0) tone = 0; // skjøt
        px(ctx, x, y, tones[tone]);
      }
    }
    for (let i = 0; i < 10; i++) px(ctx, rng.int(w), rng.int(h), '#2a2119');
    for (let i = 0; i < 40; i++) px(ctx, rng.int(w), 20 + rng.int(12), rng.pick(['#4f7a3e', '#6a8c48', '#3f6a3a']));
  }, true);
}

// Skrog med kjøl og spiss baug, lukket dekk. Lengden går langs z.
function hullGeometry() {
  const geometry = new THREE.BoxGeometry(0.44, 0.3, 1.2, 2, 2, 6);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) / 0.6;
    let width = t > 0.25 ? 1 - ((t - 0.25) / 0.75) * 0.92 : t < -0.7 ? 0.85 : 1;
    if (pos.getY(i) < 0) width *= 0.45;
    pos.setX(i, pos.getX(i) * width);
    if (t > 0.6 && pos.getY(i) > 0) pos.setY(i, pos.getY(i) + (t - 0.6) * 0.25); // baugen løfter seg
  }
  geometry.computeVertexNormals();
  return geometry;
}

function amphoraGeometry() {
  const profile = [[0, 0], [0.03, 0.01], [0.06, 0.06], [0.065, 0.12], [0.04, 0.18], [0.025, 0.21], [0.035, 0.23], [0, 0.23]];
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 7);
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  return mesh;
}

// Legger en del inn i forelderens koordinater (satt opp i parent) og legger den til i nettet.
function addPart(mesh, pos, rot, scale, tint) {
  child.position.copy(pos);
  child.rotation.set(rot.x, rot.y, rot.z);
  child.scale.copy(scale);
  child.updateMatrix();
  matrix.multiplyMatrices(parent.matrix, child.matrix);
  mesh.setMatrixAt(mesh.count, matrix);
  mesh.setColorAt(mesh.count, color.set(tint));
  mesh.count += 1;
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const ONE = v(1, 1, 1);

export function makeWreckParts(rng, rockCount, cellCount) {
  const wood = new THREE.MeshLambertMaterial({ map: woodTexture(rng), flatShading: true });
  return {
    hulls: instanced(hullGeometry(), wood, rockCount),
    beams: instanced(new THREE.BoxGeometry(1, 1, 1), wood, rockCount * 4 + cellCount),
    masts: instanced(new THREE.CylinderGeometry(0.03, 0.04, 1, 6), wood, rockCount),
    barrels: instanced(new THREE.CylinderGeometry(0.07, 0.07, 0.17, 8), wood, cellCount),
    amphoras: instanced(amphoraGeometry(), new THREE.MeshLambertMaterial({ flatShading: true }), cellCount),
  };
}

// Et skip som ligger på skrå og halvt nedgravd over diagonalen i ruten, med knekt mast.
export function placeShip(parts, centre, rng) {
  parent.position.set(centre.x, 0.08, centre.z);
  parent.rotation.set(0, Math.PI / 4 + rng.int(4) * (Math.PI / 2) + (rng.next() - 0.5) * 0.5, 0, 'YXZ');
  parent.rotation.z = (rng.int(2) ? 1 : -1) * (0.3 + rng.next() * 0.25);
  parent.rotation.x = (rng.next() - 0.5) * 0.15;
  parent.updateMatrix();
  const tint = rng.pick(WOOD_TINTS);
  addPart(parts.hulls, v(0, 0, 0), v(0, 0, 0), ONE, tint);
  addPart(parts.beams, v(0, 0.2, -0.38), v(0, 0, 0), v(0.3, 0.14, 0.26), tint); // hytte akter
  const mast = 0.45 + rng.next() * 0.5;
  addPart(parts.masts, v(0, 0.15 + mast / 2, 0.08), v(rng.next() * 0.3, 0, 0), v(1, mast, 1), tint);
  if (rng.chance(0.6)) {
    // Mastetoppen har knekt og ligger ved siden av skroget.
    addPart(parts.beams, v(0.32, -0.05, 0.2), v(0, rng.next() * 3, Math.PI / 2), v(0.05, 0.6, 0.05), tint);
  }
}

// Buegang: to søyler med en bjelke over. Halvparten har rast, og bjelken ligger på bakken.
export function placeArch(columns, parts, centre, rng, columnTint) {
  parent.position.set(centre.x, 0, centre.z);
  parent.rotation.set(0, rng.int(4) * (Math.PI / 2) + (rng.next() - 0.5) * 0.2, 0);
  parent.updateMatrix();
  const fallen = rng.chance(0.5);
  const heights = [1.05 + rng.next() * 0.2, fallen ? 0.4 + rng.next() * 0.3 : 1.05 + rng.next() * 0.2];
  heights.forEach((h, i) => addPart(columns, v(i ? 0.3 : -0.3, h / 2 - 0.03, 0), v(0, rng.next() * 6, 0), v(1, h, 1), columnTint));
  if (fallen) addPart(parts.blocks, v(0.05, 0.08, 0.28), v(0, (rng.next() - 0.5) * 0.6, 0.05), v(0.85, 0.16, 0.2), columnTint);
  else addPart(parts.blocks, v(0, Math.min(...heights) + 0.05, 0), v(0, 0, 0), v(0.88, 0.16, 0.22), columnTint);
  addPart(parts.blocks, v(-0.15, 0.06, -0.3), v(0.2, rng.next() * 3, 0), v(0.18, 0.12, 0.16), columnTint);
}

// Småting i et hjørne av en åpen rute: en kasse, en tønne eller noen krukker.
export function placeTrinket(parts, corner, rng) {
  parent.position.copy(corner);
  parent.rotation.set(0, rng.next() * 6, 0);
  parent.updateMatrix();
  const roll = rng.next();
  if (roll < 0.35) {
    addPart(parts.beams, v(0, 0.07, 0), v(0, 0, (rng.next() - 0.5) * 0.3), v(0.17, 0.15, 0.17), rng.pick(WOOD_TINTS));
  } else if (roll < 0.7) {
    const lying = rng.chance(0.6);
    addPart(parts.barrels, v(0, lying ? 0.07 : 0.085, 0), v(lying ? Math.PI / 2 : 0, 0, 0), ONE, rng.pick(WOOD_TINTS));
  } else {
    for (let i = 0; i < 1 + rng.int(3); i++) {
      const lying = rng.chance(0.5);
      addPart(parts.amphoras, v((rng.next() - 0.5) * 0.2, lying ? 0.06 : 0, (rng.next() - 0.5) * 0.2),
        v(lying ? Math.PI / 2 : 0, 0, rng.next() * 6), ONE, rng.pick(['#9a5a3a', '#a8683f', '#8a4e34']));
    }
  }
}
