// Groper i bunnen: en rund skål der flisen skulle ligget, med en krans av stein rundt kanten.
// Skålen er mørkest i bunnen, så den leses som en fordypning både skrått og rett ovenfra.
import * as THREE from 'three';

export const PIT_RADIUS = 0.46;
export const PIT_DEPTH = 0.42;
const dummy = new THREE.Object3D();
const color = new THREE.Color();
const shade = new THREE.Color();

// Hvor dypt skålen går på en avstand fra midten (0 utenfor).
export function pitDip(r) {
  if (r >= PIT_RADIUS) return 0;
  return PIT_DEPTH * (0.5 + 0.5 * Math.cos((Math.PI * r) / PIT_RADIUS));
}

function bowlGeometry(rng, tint) {
  const geometry = new THREE.PlaneGeometry(0.97, 0.97, 14, 14).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const dip = pitDip(r);
    pos.setY(i, -dip);
    // Trinnvis mørkere mot bunnen, med litt korn, så det ser tegnet ut. Lyset i scenen er sterkt
    // fordi flisene har mørke teksturer, så skålen uten tekstur må starte mørkt.
    const depth = Math.round((dip / PIT_DEPTH) ** 0.6 * 5) / 5;
    color.set(tint).multiplyScalar(0.36).lerp(shade.set('#04101a'), depth * 0.92 + (rng.next() - 0.5) * 0.05);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Normalene peker rett opp: lyset skal ikke få skålen til å se ut som en kul. Dybden vises
  // bare med fargen.
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) normals[i * 3 + 1] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

export function buildPits(stage, board, rng, theme) {
  const meshes = [];
  if (!board.pitList.length) return { meshes };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const stones = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.07, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    board.pitList.length * 16,
  );
  stones.count = 0;
  stones.frustumCulled = false;
  stones.castShadow = true;
  for (const [x, y] of board.pitList) {
    const centre = stage.cellToWorld(x, y, -0.02);
    const bowl = new THREE.Mesh(bowlGeometry(rng, rng.pick(theme.sand)), material);
    bowl.position.copy(centre);
    bowl.receiveShadow = true;
    meshes.push(bowl);
    for (let i = 0; i < 12 + rng.int(4); i++) {
      const angle = rng.next() * Math.PI * 2;
      const r = PIT_RADIUS + (rng.next() - 0.3) * 0.08;
      dummy.position.set(centre.x + Math.cos(angle) * r, 0.02, centre.z + Math.sin(angle) * r);
      const s = 0.7 + rng.next() * 0.8;
      dummy.scale.set(s, s * 0.7, s);
      dummy.rotation.set(0, rng.next() * 6, 0);
      dummy.updateMatrix();
      stones.setMatrixAt(stones.count, dummy.matrix);
      stones.setColorAt(stones.count, color.set(rng.pick(theme.rocks)).multiplyScalar(0.8));
      stones.count += 1;
    }
  }
  meshes.push(stones);
  return { meshes };
}
