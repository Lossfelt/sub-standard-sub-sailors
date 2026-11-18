// Bygger selve brettet: sokkel, fliser, lysmønster, fjell og pynt. Alt utseende trekkes fra
// spillets frø, slik at alle spillere ser det samme brettet.
import * as THREE from 'three';
import { makeRng } from '/shared/rng.js';
import { key } from '/shared/grid.js';
import { tileTextures, cliffTexture } from './groundtex.js';
import { buildRocks, buildDecor } from './props.js';
import { makeCaustics } from './water.js';
import { buildPits } from './pits.js';
import { makeWreckParts } from './wrecks.js';

// Biotoper: samme regler, men ulikt utseende fra spill til spill. Tallene er andeler og terskler.
const THEMES = [
  { // korallrev: grønt og frodig
    stone: ['#6f9cae', '#6691a5', '#7ba7b4'], moss: ['#5aa886', '#4f9c7c', '#66b390'], sand: ['#b9b48f', '#aeab8c', '#c2ba92'],
    rockFloor: '#4f6c7a', rocks: ['#ffffff', '#e4edf2', '#d6e2ea', '#f1eee2'],
    mossFrom: 0.5, sandFrom: 0.68, smokers: 0.3, ruins: 0.15, decor: 1,
  },
  { // dyphavsslette: mørkt, karrig og vulkansk
    stone: ['#5b6a96', '#52608c', '#6674a2'], moss: ['#6f6aa6', '#64609b'], sand: ['#7c8196', '#74798f'],
    rockFloor: '#3d4566', rocks: ['#c9c2e6', '#b5b0d6', '#d6d0ee'],
    mossFrom: 0.8, sandFrom: 0.6, smokers: 0.6, ruins: 0.05, decor: 0.45,
  },
  { // isdekke: lyst og kaldt, med snø i stedet for sand
    stone: ['#a5cbdc', '#98c1d4', '#b4d6e4'], moss: ['#8fcfc6', '#84c4bd'], sand: ['#e3edf2', '#d8e6ee'],
    rockFloor: '#7fa3b6', rocks: ['#ffffff', '#f2fbff', '#e6f4fa'],
    mossFrom: 0.82, sandFrom: 0.5, smokers: 0.08, ruins: 0.12, decor: 0.6,
  },
  { // skipskirkegård: grumsete og brunlig, med vrak på de fleste fjellrutene og rester overalt
    stone: ['#7d8a86', '#74827d', '#869390'], moss: ['#7a8a5a', '#6e7e50'], sand: ['#a49a7c', '#9a9174'],
    rockFloor: '#4e5650', rocks: ['#c9c6b8', '#b9b6a6', '#d6d2c2'],
    mossFrom: 0.6, sandFrom: 0.55, smokers: 0.05, wrecks: 0.6, ruins: 0.1, decor: 0.5, trinkets: 0.12,
    weedTints: ['#5f6b34', '#6f7a3a', '#4f5c2e'], coralTints: ['#b8a58a', '#a8927a'],
  },
  { // tareskog: høy, brun tare som svaier over lys sand
    stone: ['#6a9a9a', '#5f9090', '#76a6a3'], moss: ['#5e8f4a', '#557f42'], sand: ['#b8b08a', '#ada682'],
    rockFloor: '#4a6a66', rocks: ['#ffffff', '#e4edf2', '#d6e2ea'],
    mossFrom: 0.45, sandFrom: 0.7, smokers: 0.05, wrecks: 0.06, ruins: 0.1, decor: 1.2,
    weeds: 0.32, corals: 0.03, weedHeight: [2, 1.8], weedTints: ['#6b7a2e', '#7d8a34', '#5a6b2a', '#8a7a30'],
  },
  { // varme kilder: mørk basalt, gule og oransje bakteriematter, mange skorsteiner og bobler
    stone: ['#5a5a66', '#52525e', '#64646f'], moss: ['#d9b44a', '#e0973c', '#c9c24a'], sand: ['#8a7a6a', '#807060'],
    rockFloor: '#2e2e38', rocks: ['#a8a0b8', '#9890a8', '#b4aec4'],
    mossFrom: 0.55, sandFrom: 0.75, smokers: 0.75, wrecks: 0.03, ruins: 0.03, decor: 0.45, vents: 0.08,
    weeds: 0.04, corals: 0.2, coralTints: ['#efe8dc', '#d94a3d', '#e8d8c8'], // rørormer
  },
];

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
  // Toppen tegnes ikke, slik at gropene kan gå ned i sokkelen. En mørk flate lenger nede
  // gir samme farge i fugene mellom flisene.
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const base = new THREE.Mesh(geometry, [side, side, hidden, hidden, side, side]);
  base.position.y = -1.4;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 0.3, size + 0.3).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#0b222c' }),
  );
  floor.position.y = 1.4 - 0.6; // 0.6 under brettet, i sokkelens koordinater
  base.add(floor);
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

const TILE_MIX = ['plain', 'plain', 'plain', 'plain', 'cracked', 'cracked', 'cobbles', 'cobbles', 'bricks'];

// Hvilken slags flis som ligger i en rute: mose og sand i hver sine flekker, ellers stein.
function tileKind(rng, theme, rock, mossiness, sandiness) {
  if (rock) return 'plain';
  if (mossiness > theme.mossFrom) return 'moss';
  if (sandiness > theme.sandFrom) return 'sand';
  if (rng.chance(0.035)) return 'glyph';
  return rng.pick(TILE_MIX);
}

// Flisene deles på ett nett per teksturvariant.
function buildTiles(stage, board, rng, theme) {
  const { size } = board;
  // Skrått brett har synlige fuger mellom flisene. Rett ovenfra blir fugene til harde striper
  // langs pikselkolonnene, så der ligger flisene kant i kant.
  const geometry = new THREE.BoxGeometry(0.94, 0.16, 0.94);
  const gapless = new THREE.BoxGeometry(1, 0.16, 1);
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
      if (board.pits.has(key(x, y))) continue; // gropa har sin egen skål
      const rock = board.rocks.has(key(x, y));
      const mossiness = THREE.MathUtils.smoothstep(moss(x, y), 0.35, 0.7);
      const kind = tileKind(rng, theme, rock, mossiness, sand(x, y));
      const mesh = rng.pick(kinds[kind]);
      color.set(rng.pick(theme.stone)).lerp(mossColor.set(rng.pick(theme.moss)), mossiness * 0.6);
      if (kind === 'sand') color.set(rng.pick(theme.sand));
      if (rock) color.set(theme.rockFloor);
      dummy.position.copy(stage.cellToWorld(x, y, -0.08 - rng.next() * 0.05));
      // Stein kan ligge alle veier, men tegn og sandbølger skal peke samme vei over hele brettet.
      dummy.rotation.set(0, kind === 'sand' || kind === 'glyph' ? 0 : rng.int(4) * (Math.PI / 2), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count, dummy.matrix);
      mesh.setColorAt(mesh.count, color);
      mesh.count += 1;
    }
  }
  const setGaps = (gaps) => meshes.forEach((m) => { m.geometry = gaps ? geometry : gapless; });
  return { meshes, setGaps, geometries: [geometry, gapless] };
}

export function buildTerrain(stage, board, seed) {
  const rng = makeRng(seed ^ 0x5eabed);
  const group = new THREE.Group();
  const caustics = makeCaustics(board.size, board.pitList);
  const theme = rng.pick(THEMES);
  const parts = makeWreckParts(rng, board.rockList.length, board.size * board.size);
  const rocks = buildRocks(stage, board, rng, theme, parts);
  const decor = buildDecor(stage, board, rng, theme, parts);
  const tiles = buildTiles(stage, board, rng, theme);
  const pits = buildPits(stage, board, rng, theme);
  group.add(
    ...pits.meshes,
    buildBase(board.size, rng),
    ...tiles.meshes,
    caustics.mesh,
    ...rocks.meshes,
    ...decor.meshes,
    parts.hulls, parts.beams, parts.masts, parts.barrels, parts.amphoras,
  );

  let gaps = null;
  const update = (time) => {
    if (gaps !== stage.angled) {
      gaps = stage.angled;
      tiles.setGaps(gaps);
    }
    caustics.update(time, stage.cellPixels);
    decor.sway(time);
  };

  const dispose = () => {
    tiles.geometries.forEach((g) => g.dispose()); // den som ikke er i bruk, nås ikke av gjennomgangen
    group.traverse((obj) => {
      obj.geometry?.dispose();
      for (const m of [].concat(obj.material ?? [])) {
        m.map?.dispose();
        m.alphaMap?.dispose();
        m.dispose();
      }
    });
    group.removeFromParent();
  };
  return { group, update, dispose, vents: decor.vents, smokers: rocks.smokers, rng };
}
