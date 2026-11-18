// Lange groper i bunnen: en renne som følger midtlinjen gjennom gropas ruter, med en krans av
// stein langs kanten. Rennen er mørkest i bunnen, så den leses som en fordypning både skrått
// og rett ovenfra.
import * as THREE from 'three';

const RADIUS = 0.44;
const DEPTH = 0.42;
const SEGMENTS = 12; // oppdeling per rute
const dummy = new THREE.Object3D();
const color = new THREE.Color();
const shade = new THREE.Color();

function segmentDistance(px, pz, [ax, az, bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Midtlinjen i verdenskoordinater, og hvor dypt bunnen ligger i et punkt.
export function trenchShape(stage, trenches) {
  const segments = [];
  for (const cells of trenches) {
    cells.forEach(([x, y], i) => {
      const a = stage.cellToWorld(x, y);
      const b = i ? stage.cellToWorld(...cells[i - 1]) : a;
      segments.push([a.x, a.z, b.x, b.z]);
    });
  }
  const distance = (x, z) => segments.reduce((best, s) => Math.min(best, segmentDistance(x, z, s)), Infinity);
  const dipAt = (x, z) => {
    const r = distance(x, z);
    return r >= RADIUS ? 0 : DEPTH * (0.5 + 0.5 * Math.cos((Math.PI * r) / RADIUS));
  };
  return { segments, distance, dipAt };
}

// Ett flatt nett per rute som bøyes ned der midtlinjen går. Lyset i scenen er sterkt fordi
// flisene har mørke teksturer, så rennen uten tekstur må starte mørkt.
function cellGeometry(stage, x, y, shape, rng, tint) {
  const centre = stage.cellToWorld(x, y);
  const geometry = new THREE.PlaneGeometry(1, 1, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const dip = shape.dipAt(centre.x + pos.getX(i), centre.z + pos.getZ(i));
    pos.setY(i, -dip);
    const depth = Math.round((dip / DEPTH) ** 0.6 * 5) / 5; // trinnvis mørkere mot bunnen
    color.set(tint).multiplyScalar(0.36).lerp(shade.set('#04101a'), depth * 0.92 + (rng.next() - 0.5) * 0.05);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Normalene peker rett opp, ellers får lyset rennen til å se ut som en kul.
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) normals[i * 3 + 1] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.translate(centre.x, -0.02, centre.z);
  return geometry;
}

// Stein langs kanten: tilfeldige punkter i rutene som ligger like ved kanten av rennen.
function placeStones(stones, stage, cells, shape, rng, theme) {
  for (const [x, y] of cells) {
    const centre = stage.cellToWorld(x, y);
    let placed = 0;
    for (let i = 0; i < 40 && placed < 5; i++) {
      const px = centre.x + rng.next() - 0.5;
      const pz = centre.z + rng.next() - 0.5;
      const r = shape.distance(px, pz);
      if (r < RADIUS - 0.02 || r > RADIUS + 0.06) continue;
      const s = 0.7 + rng.next() * 0.8;
      dummy.position.set(px, 0.02, pz);
      dummy.scale.set(s, s * 0.7, s);
      dummy.rotation.set(0, rng.next() * 6, 0);
      dummy.updateMatrix();
      stones.setMatrixAt(stones.count, dummy.matrix);
      stones.setColorAt(stones.count, color.set(rng.pick(theme.rocks)).multiplyScalar(0.8));
      stones.count += 1;
      placed += 1;
    }
  }
}

export function buildPits(stage, board, rng, theme) {
  const meshes = [];
  if (!board.pitList.length) return { meshes };
  const shape = trenchShape(stage, board.trenches);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tint = rng.pick(theme.sand);
  for (const [x, y] of board.pitList) {
    const mesh = new THREE.Mesh(cellGeometry(stage, x, y, shape, rng, tint), material);
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  const stones = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.07, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    board.pitList.length * 5,
  );
  stones.count = 0;
  stones.frustumCulled = false;
  stones.castShadow = true;
  placeStones(stones, stage, board.pitList, shape, rng, theme);
  meshes.push(stones);
  return { meshes };
}
