// Pikselteksturer for havbunnen: fliser, bergvegg, fjell, vulkaner og ruiner. Alt tegnes piksel
// for piksel med små, faste paletter, slik at det ser tegnet ut og ikke som støy.
import * as THREE from 'three';
import { pixelTexture } from './textures.js';

const S = 32; // piksler per flis
// Flisene er gråtoner som farges av instansfargen. Mørk kant, tre mellomtoner, lys kant.
const STONE = ['#7d848a', '#b4babf', '#cdd2d5', '#e0e4e6', '#f7f8f9'];
const GAP = '#454b52';
const MOSS = ['#2f7049', '#3f8f5a', '#5cb56e', '#9bdc86'];

const px = (ctx, x, y, fill) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, 1, 1);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Detaljerte teksturer trenger utjevning når brettet er zoomet ut, ellers flimrer de.
const detailed = (w, h, draw) => pixelTexture(w, h, draw, true);

// Ujevn flekk: en sirkel med frynsete kant.
function blob(ctx, rng, cx, cy, r, fill, clip) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d > r * r + rng.next() * r * 1.5 - r * 0.5) continue;
      if (x < clip.x0 || y < clip.y0 || x >= clip.x1 || y >= clip.y1) continue;
      px(ctx, x, y, fill);
    }
  }
}

function drawSlab(ctx, rng, x0, y0, w, h) {
  const clip = { x0, y0, x1: x0 + w, y1: y0 + h };
  const big = Math.min(w, h) >= 16;
  ctx.fillStyle = STONE[2];
  ctx.fillRect(x0, y0, w, h);
  for (let i = 0; i < Math.round((w * h) / 90); i++) {
    blob(ctx, rng, x0 + rng.int(w), y0 + rng.int(h), 2 + rng.int(Math.max(1, w / 6)), STONE[rng.int(2) ? 1 : 3], clip);
  }
  for (let i = 0; i < (w * h) / 16; i++) px(ctx, x0 + rng.int(w), y0 + rng.int(h), STONE[rng.int(2) ? 1 : 3]);
  // Skrå kant: lys opp og til venstre, mørk ned og til høyre.
  ctx.fillStyle = STONE[4];
  ctx.fillRect(x0, y0, w - 1, 1);
  ctx.fillRect(x0, y0, 1, h - 1);
  ctx.fillStyle = STONE[0];
  ctx.fillRect(x0 + 1, y0 + h - 1, w - 1, 1);
  ctx.fillRect(x0 + w - 1, y0 + 1, 1, h - 1);
  if (big) {
    ctx.fillStyle = STONE[3];
    ctx.fillRect(x0 + 1, y0 + 1, w - 3, 1);
    ctx.fillRect(x0 + 1, y0 + 1, 1, h - 3);
    ctx.fillStyle = STONE[1];
    ctx.fillRect(x0 + 2, y0 + h - 2, w - 3, 1);
    ctx.fillRect(x0 + w - 2, y0 + 2, 1, h - 3);
  }
  // Avrundede hjørner.
  const cut = big ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]];
  for (const [cx, cy] of cut) {
    px(ctx, x0 + cx, y0 + cy, GAP);
    px(ctx, x0 + w - 1 - cx, y0 + cy, GAP);
    px(ctx, x0 + cx, y0 + h - 1 - cy, GAP);
    px(ctx, x0 + w - 1 - cx, y0 + h - 1 - cy, GAP);
  }
  // Små groper: mørk piksel med lys kant under.
  for (let i = 0; i < Math.round(w / 7); i++) {
    const x = x0 + 3 + rng.int(Math.max(1, w - 7));
    const y = y0 + 3 + rng.int(Math.max(1, h - 8));
    px(ctx, x, y, STONE[0]);
    if (rng.int(2)) px(ctx, x + 1, y, STONE[0]);
    px(ctx, x, y + 1, STONE[4]);
  }
}

// En sprekk som slynger seg nedover, med en sidegren.
function crackLine(ctx, rng, x, y, length, branch) {
  for (let i = 0; i < length && y < S - 2; i++) {
    px(ctx, x, y, GAP);
    if (rng.int(3) === 0) px(ctx, x + 1, y, STONE[4]);
    if (branch && i === Math.floor(length / 2)) crackLine(ctx, rng, x, y, length / 2, false);
    x = clamp(x + rng.int(3) - 1 + (branch ? 0 : 1), 3, S - 4);
    y += 1;
  }
}

function drawCracks(ctx, rng) {
  crackLine(ctx, rng, 6 + rng.int(20), 2, 18 + rng.int(10), true);
  if (rng.int(2)) crackLine(ctx, rng, 4 + rng.int(24), 12 + rng.int(8), 10, false);
}

// Mose som kryper inn fra kantene, lysest i midten av hver dott.
function drawMoss(ctx, rng) {
  const clip = { x0: 0, y0: 0, x1: S, y1: S };
  for (let i = 0; i < 5; i++) {
    const along = rng.int(S);
    const [cx, cy] = [[along, 0], [S - 1, along], [along, S - 1], [0, along]][rng.int(4)];
    const r = 5 + rng.int(5);
    blob(ctx, rng, cx, cy, r, MOSS[0], clip);
    blob(ctx, rng, cx, cy, r - 2, MOSS[1], clip);
    blob(ctx, rng, cx, cy, r - 5, MOSS[2], clip);
    for (let j = 0; j < 3; j++) px(ctx, clamp(cx + rng.int(7) - 3, 0, S - 1), clamp(cy + rng.int(7) - 3, 0, S - 1), MOSS[3]);
  }
}

// Sand med bølgemønster, småstein og et skjell.
function drawSand(ctx, rng) {
  ctx.fillStyle = STONE[3];
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) px(ctx, rng.int(S), rng.int(S), STONE[rng.int(2) ? 2 : 4]);
  const phase = rng.next() * 6;
  for (let row = 3; row < S; row += 6) {
    for (let x = 0; x < S; x++) {
      const y = row + Math.round(Math.sin(x * 0.45 + phase + row) * 1.6);
      px(ctx, x, y, STONE[1]);
      px(ctx, x, y + 1, STONE[4]);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 2 + rng.int(S - 6);
    const y = 2 + rng.int(S - 5);
    ctx.fillStyle = STONE[0];
    ctx.fillRect(x, y, 3, 2);
    ctx.fillStyle = STONE[4];
    ctx.fillRect(x, y - 1, 2, 1);
  }
  const sx = 4 + rng.int(S - 10);
  const sy = 4 + rng.int(S - 10);
  ['.##.', '#..#', '#.##', '.##.'].forEach((row, y) => [...row].forEach((c, x) => {
    px(ctx, sx + x, sy + y, c === '#' ? STONE[0] : '#fff6ee');
  }));
}

// Gamle tegn hugget inn i enkelte heller: trefork, spiral og øye.
const GLYPHS = [
  ['#..#..#', '#..#..#', '#..#..#', '.#####.', '...#...', '...#...', '..###..'],
  ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.#####', '#......'],
  ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
];

function drawGlyph(ctx, rng) {
  const glyph = rng.pick(GLYPHS);
  const each = (fill, shift) => glyph.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '#') return;
    ctx.fillStyle = fill;
    ctx.fillRect(6 + x * 3 + shift, 6 + y * 3 + shift, 2, 2);
  }));
  each(STONE[4], 1); // lys kant ned til høyre, som om tegnet er hugget ned i steinen
  each('#565d64', 0);
}

// Murstein lagt i forband.
function drawBricks(ctx, rng) {
  for (let row = 0; row < 4; row++) {
    const edges = row % 2 ? [0, 8, 24, 32] : [0, 16, 32];
    for (let i = 0; i < edges.length - 1; i++) drawSlab(ctx, rng, edges[i], row * 8, edges[i + 1] - edges[i], 8);
  }
}

// Navngitte varianter, slik at brettbyggeren kan velge etter hva som passer i ruten.
export function tileTextures(rng) {
  const slab = (extra) => (ctx) => {
    drawSlab(ctx, rng, 0, 0, S, S);
    extra?.(ctx, rng);
  };
  const cobbles = (ctx) => {
    for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) drawSlab(ctx, rng, x, y, 16, 16);
  };
  const make = (draw) => detailed(S, S, draw);
  return {
    plain: [make(slab()), make(slab())],
    cracked: [make(slab(drawCracks)), make(slab(drawCracks))],
    moss: [make(slab(drawMoss)), make(slab(drawMoss))],
    cobbles: [make(cobbles)],
    bricks: [make((ctx) => drawBricks(ctx, rng))],
    sand: [make((ctx) => drawSand(ctx, rng)), make((ctx) => drawSand(ctx, rng))],
    glyph: [make(slab(drawGlyph))],
  };
}

// Lagdelt bergvegg til sidene av brettet, med ujevne lag og innfelte steinblokker.
export function cliffTexture(rng) {
  const bands = ['#4a7a68', '#35605a', '#2c4a4e', '#3a4149', '#2a303a', '#1f242d', '#171a22', '#101219'];
  const texture = detailed(64, 32, (ctx, w, h) => {
    let lift = 0;
    for (let x = 0; x < w; x++) {
      if (rng.int(3) === 0) lift = clamp(lift + rng.int(3) - 1, -2, 2);
      for (let y = 0; y < h; y++) px(ctx, x, y, bands[clamp(Math.floor((y + lift) / 4), 0, 7)]);
    }
    for (let i = 0; i < 22; i++) {
      const x = rng.int(w - 6);
      const y = 5 + rng.int(h - 9);
      const len = 3 + rng.int(4);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(x, y, len, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + 2, len + 1, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 90; i++) ctx.fillRect(rng.int(w), rng.int(h), 1, 1);
    ctx.fillStyle = bands[0];
    ctx.fillRect(0, 0, 4, 1);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Fjell: lyse topper og mørk fot, med skrå rygger, lag og sprekker. Går sømløst rundt kjeglen.
export function rockTexture(rng) {
  const tones = ['#33495f', '#4a6378', '#688296', '#8ea6b3', '#b9cad2', '#e6eef0'];
  const phase = rng.next() * 6;
  const texture = detailed(64, 64, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const height = 1 - y / (h - 1);
        const wobble = Math.sin((x / w) * Math.PI * 4 + phase) * 0.4 + Math.sin((x / w) * Math.PI * 10) * 0.2;
        let tone = Math.floor(height * 4.4 + wobble + 0.5);
        const ridge = (x + (y >> 1)) % 16;
        if (ridge < 3) tone += 1;
        else if (ridge >= 8 && ridge <= 10) tone -= 1;
        if ((x * 3 + y) % 16 === 0) tone -= 1; // tynne sprekker på skrå
        if ((y + Math.round(wobble * 3)) % 9 === 0) tone -= 1; // lagdeling
        px(ctx, x, y, tones[clamp(tone, 0, 5)]);
      }
    }
    for (let i = 0; i < 110; i++) px(ctx, rng.int(w), 40 + rng.int(24), MOSS[rng.int(3)]);
    for (let i = 0; i < 36; i++) px(ctx, rng.int(w), rng.int(18), '#f4f9fa');
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Vulkanskorstein: mørke basaltsøyler med glødende sprekker øverst. Returnerer også et kart
// over hva som lyser av seg selv.
export function chimneyTextures(rng) {
  const basalt = ['#14161b', '#22252d', '#313541', '#474c5a'];
  const lava = ['#ffd766', '#ff8a33', '#c2401c'];
  const glowing = [];
  for (let i = 0; i < 7; i++) {
    let x = rng.int(32);
    const length = 12 + rng.int(18);
    for (let y = 0; y < length; y++) {
      const heat = Math.min(2, Math.floor((y / length) * 3));
      glowing.push([x, y, lava[heat]]);
      if (heat < 2 && y < length / 2) glowing.push([(x + 1) % 32, y, lava[heat + 1]]);
      if (rng.int(2)) x = (x + rng.int(3) + 31) % 32;
    }
  }
  const joints = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 3 + rng.int(58)));
  const paintGlow = (ctx, w) => {
    ctx.fillStyle = lava[1];
    ctx.fillRect(0, 0, w, 2);
    for (const [x, y, fill] of glowing) px(ctx, x, y, fill);
  };
  const map = detailed(32, 64, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = x % 8;
        let tone = edge === 0 ? 0 : edge === 1 ? 3 : edge === 7 ? 1 : 2;
        if (joints[x >> 3].includes(y)) tone = 1;
        if (y > 52) tone = Math.max(0, tone - 1);
        px(ctx, x, y, basalt[tone]);
      }
    }
    for (let i = 0; i < 60; i++) px(ctx, rng.int(w), rng.int(h), basalt[rng.int(2)]);
    paintGlow(ctx, w);
  });
  const emissive = detailed(32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    paintGlow(ctx, w);
  });
  for (const t of [map, emissive]) t.wrapS = THREE.RepeatWrapping;
  return { map, emissive };
}

// Ruinsøyle: lys stein med riller, skjøter mellom trommene, sprekker og mose ved foten.
export function columnTexture(rng) {
  const marble = ['#7f8a8e', '#aab4b7', '#cdd4d4', '#eef1f0'];
  const texture = detailed(16, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let tone = [0, 3, 2, 2][x % 4];
        if (y % 10 === 9) tone = 0;
        else if (y % 10 === 0) tone = 3;
        px(ctx, x, y, marble[tone]);
      }
    }
    for (let i = 0; i < 3; i++) {
      let x = rng.int(w);
      for (let y = rng.int(20); y < h && rng.int(9); y++) {
        px(ctx, x, y, '#4d565b');
        x = (x + rng.int(3) + 15) % 16;
      }
    }
    for (let i = 0; i < 46; i++) px(ctx, rng.int(w), 22 + rng.int(10), MOSS[rng.int(3)]);
    for (let i = 0; i < 12; i++) px(ctx, rng.int(w), rng.int(h), marble[1]);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
