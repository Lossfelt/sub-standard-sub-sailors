// Bygger selve brettet: sokkel, fliser, lysmønster, fjell og pynt. Alt utseende trekkes fra
// spillets frø, slik at alle spillere ser det samme brettet.
import * as THREE from 'three';
import { makeRng } from '/shared/rng.js';
import { key } from '/shared/grid.js';
import { tileTextures, cliffTexture } from './groundtex.js';
import { buildRocks, buildDecor } from './props.js';
import { makeCaustics } from './water.js';

const STONE_TINTS = ['#6f9cae', '#6691a5', '#7ba7b4'];
const MOSS_TINTS = ['#5aa886', '#4f9c7c', '#66b390'];
const SAND_TINTS = ['#b9b48f', '#aeab8c', '#c2ba92'];
const ROCK_FLOOR_TINT = '#4f6c7a';

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const mossColor = new THREE.Color();

// Sokkelen brettet hviler på. Fargen tones mot svart nedover, så den forsvinner i dypet.
function buildBase(size, rng) {
  const cliff = cliffTexture(rng);
  cliff.repeat.set(size / 2, 1);
  const geometry = new THREE.BoxGeometry(size + 0.3, 2.6, size + 0.3);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const shade = pos.getY(i) > 0 ? 1 : 0.06;
    colors.set([shade, shade, shade * 1.4], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const side = new THREE.MeshLambertMaterial({ map: cliff, vertexColors: true });
  const top = new THREE.MeshLambertMaterial({ color: '#0b222c' });
  const base = new THREE.Mesh(geometry, [side, side, top, top, side, side]);
  base.position.y = -1.4;
  return base;
}

// Grov støy som gjør at mose og stein ligger i flekker over brettet i stedet for som konfetti.
function patchNoise(size, rng) {
  const step = 3;
  const cols = Math.ceil(size / step) + 2;
  const grid = Array.from({ length: cols * cols }, () => rng.next());
  return (x, y) => {
    const gx = x / step;
    const gy = y / step;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const at = (cx, cy) => grid[cy * cols + cx];
    const top = THREE.MathUtils.lerp(at(x0, y0), at(x0 + 1, y0), gx - x0);
    const bottom = THREE.MathUtils.lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), gx - x0);
    return THREE.MathUtils.lerp(top, bottom, gy - y0);
  };
}

const TILE_MIX = ['plain', 'plain', 'plain', 'plain', 'cracked', 'cracked', 'cobbles', 'cobbles'];

// Hvilken slags flis som ligger i en rute: mose og sand i hver sine flekker, ellers stein.
function tileKind(rng, rock, mossiness, sandiness) {
  if (rock) return 'plain';
  if (mossiness > 0.5) return 'moss';
  if (sandiness > 0.68) return 'sand';
  if (rng.chance(0.035)) return 'glyph';
  return rng.pick(TILE_MIX);
}

// Flisene deles på ett nett per teksturvariant.
function buildTiles(stage, board, rng) {
  const { size } = board;
  const geometry = new THREE.BoxGeometry(0.94, 0.16, 0.94);
  const kinds = {};
  const meshes = [];
  for (const [kind, maps] of Object.entries(tileTextures(rng))) {
    kinds[kind] = maps.map((map) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ map }), size * size);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      meshes.push(mesh);
      return mesh;
    });
  }
  const moss = patchNoise(size, rng);
  const sand = patchNoise(size, rng);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rock = board.rocks.has(key(x, y));
      const mossiness = THREE.MathUtils.smoothstep(moss(x, y), 0.35, 0.7);
      const kind = tileKind(rng, rock, mossiness, sand(x, y));
      const mesh = rng.pick(kinds[kind]);
      color.set(rng.pick(STONE_TINTS)).lerp(mossColor.set(rng.pick(MOSS_TINTS)), mossiness * 0.6);
      if (kind === 'sand') color.set(rng.pick(SAND_TINTS));
      if (rock) color.set(ROCK_FLOOR_TINT);
      dummy.position.copy(stage.cellToWorld(x, y, -0.08 - rng.next() * 0.05));
      // Stein kan ligge alle veier, men tegn og sandbølger skal peke samme vei over hele brettet.
      dummy.rotation.set(0, kind === 'sand' || kind === 'glyph' ? 0 : rng.int(4) * (Math.PI / 2), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count, dummy.matrix);
      mesh.setColorAt(mesh.count, color);
      mesh.count += 1;
    }
  }
  return meshes;
}

export function buildTerrain(stage, board, seed) {
  const rng = makeRng(seed ^ 0x5eabed);
  const group = new THREE.Group();
  const caustics = makeCaustics(board.size);
  const rocks = buildRocks(stage, board, rng);
  const decor = buildDecor(stage, board, rng);
  group.add(
    buildBase(board.size, rng),
    ...buildTiles(stage, board, rng),
    caustics.mesh,
    ...rocks.meshes,
    ...decor.meshes,
  );

  const update = (time) => {
    caustics.update(time);
    decor.sway(time);
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
  return { group, update, dispose, vents: decor.vents, smokers: rocks.smokers, rng };
}
