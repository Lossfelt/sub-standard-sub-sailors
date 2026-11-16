// Pikselteksturer for havbunnen: fliser, bergvegg, fjell og vulkaner. Alt tegnes piksel for
// piksel med små, faste paletter, slik at det ser tegnet ut og ikke som støy.
import * as THREE from 'three';
import { pixelTexture } from './textures.js';

// Flisene er gråtoner som farges av instansfargen. Mørk kant, tre mellomtoner, lys kant.
const STONE = ['#7d848a', '#b4babf', '#cdd2d5', '#e0e4e6', '#f7f8f9'];
const GAP = '#454b52';
const MOSS = ['#3c8a57', '#57b06c', '#93d680'];

const px = (ctx, x, y, fill) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, 1, 1);
};

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
  ctx.fillStyle = STONE[2];
  ctx.fillRect(x0, y0, w, h);
  for (let i = 0; i < Math.round(w / 4); i++) {
    blob(ctx, rng, x0 + rng.int(w), y0 + rng.int(h), 1 + rng.int(w / 5), STONE[rng.int(2) ? 1 : 3], clip);
  }
  // Skrå kant: lys opp og til venstre, mørk ned og til høyre, og avrundede hjørner.
  ctx.fillStyle = STONE[4];
  ctx.fillRect(x0, y0, w - 1, 1);
  ctx.fillRect(x0, y0, 1, h - 1);
  ctx.fillStyle = STONE[0];
  ctx.fillRect(x0 + 1, y0 + h - 1, w - 1, 1);
  ctx.fillRect(x0 + w - 1, y0 + 1, 1, h - 1);
  for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px(ctx, x0 + cx, y0 + cy, GAP);
  // Små groper: mørk piksel med lys kant under.
  for (let i = 0; i < Math.round(w / 8); i++) {
    const x = x0 + 2 + rng.int(w - 4);
    const y = y0 + 2 + rng.int(h - 5);
    px(ctx, x, y, STONE[0]);
    px(ctx, x, y + 1, STONE[4]);
  }
}

function drawCracks(ctx, rng) {
  for (let i = 0; i < 2; i++) {
    let x = 3 + rng.int(10);
    for (let y = i ? 15 - 8 : 1; y < (i ? 15 : 9); y++) {
      px(ctx, x, y, GAP);
      if (rng.int(3) === 0) px(ctx, x + 1, y, STONE[4]);
      x = Math.min(13, Math.max(2, x + rng.int(3) - 1));
    }
  }
}

// Mose som kryper inn fra kantene, lysest i midten av hver dott.
function drawMoss(ctx, rng) {
  const clip = { x0: 0, y0: 0, x1: 16, y1: 16 };
  for (let i = 0; i < 4; i++) {
    const side = rng.int(4);
    const along = rng.int(16);
    const [cx, cy] = [[along, 0], [15, along], [along, 15], [0, along]][side];
    const r = 3 + rng.int(3);
    blob(ctx, rng, cx, cy, r, MOSS[0], clip);
    blob(ctx, rng, cx, cy, r - 2, MOSS[1], clip);
    px(ctx, Math.min(15, Math.max(0, cx + rng.int(3) - 1)), Math.min(15, Math.max(0, cy + rng.int(3) - 1)), MOSS[2]);
  }
}

// Sand med bølgemønster og et par småstein.
function drawSand(ctx, rng) {
  ctx.fillStyle = STONE[3];
  ctx.fillRect(0, 0, 16, 16);
  const phase = rng.next() * 6;
  for (let row = 2; row < 16; row += 4) {
    for (let x = 0; x < 16; x++) {
      const y = row + Math.round(Math.sin(x * 0.8 + phase + row) * 1.1);
      px(ctx, x, y, STONE[1]);
      px(ctx, x, y + 1, STONE[4]);
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = 1 + rng.int(13);
    const y = 1 + rng.int(13);
    ctx.fillStyle = STONE[0];
    ctx.fillRect(x, y, 2, 1);
    px(ctx, x, y - 1, STONE[4]);
  }
}

// Gamle tegn hugget inn i enkelte heller: trefork, spiral og øye.
const GLYPHS = [
  ['#..#..#', '#..#..#', '#..#..#', '.#####.', '...#...', '...#...', '..###..'],
  ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.#####', '#......'],
  ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
];

function drawGlyph(ctx, rng) {
  rng.pick(GLYPHS).forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== '#') return;
      px(ctx, 5 + x, 5 + y, STONE[4]);
      px(ctx, 4 + x, 4 + y, GAP);
    });
  });
}

// Navngitte varianter, slik at brettbyggeren kan velge etter hva som passer i ruten.
export function tileTextures(rng) {
  const slab = (extra) => (ctx) => {
    drawSlab(ctx, rng, 0, 0, 16, 16);
    extra?.(ctx, rng);
  };
  const cobbles = (ctx) => {
    for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) drawSlab(ctx, rng, x, y, 8, 8);
  };
  const make = (draw) => pixelTexture(16, 16, draw);
  return {
    plain: [make(slab()), make(slab())],
    cracked: [make(slab(drawCracks)), make(slab(drawCracks))],
    moss: [make(slab(drawMoss)), make(slab(drawMoss))],
    cobbles: [make(cobbles)],
    sand: [make((ctx) => drawSand(ctx, rng))],
    glyph: [make(slab(drawGlyph))],
  };
}

// Lagdelt bergvegg til sidene av brettet, med ujevne lag og innfelte steinblokker.
export function cliffTexture(rng) {
  const bands = ['#4a7a68', '#35605a', '#2c4a4e', '#3a4149', '#2a303a', '#1f242d', '#171a22', '#101219'];
  const texture = pixelTexture(32, 16, (ctx, w, h) => {
    let lift = 0;
    for (let x = 0; x < w; x++) {
      if (rng.int(3) === 0) lift = Math.max(-1, Math.min(1, lift + rng.int(3) - 1));
      for (let y = 0; y < h; y++) px(ctx, x, y, bands[Math.min(7, Math.max(0, Math.floor((y + lift) / 2)))]);
    }
    for (let i = 0; i < 9; i++) {
      const x = rng.int(w - 4);
      const y = 3 + rng.int(h - 5);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(x, y, 3 + rng.int(2), 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + 1, 4, 1);
    }
    px(ctx, 0, 0, bands[0]);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Fjell: lyse topper og mørk fot, med skrå rygger og sprekker. Går sømløst rundt kjeglen.
export function rockTexture(rng) {
  const tones = ['#33495f', '#4a6378', '#688296', '#8ea6b3', '#b9cad2', '#e6eef0'];
  const phase = rng.next() * 6;
  const texture = pixelTexture(32, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const height = 1 - y / (h - 1);
        const wobble = Math.sin((x / w) * Math.PI * 4 + phase) * 0.4 + Math.sin((x / w) * Math.PI * 10) * 0.2;
        let tone = Math.floor(height * 4.4 + wobble + 0.5);
        const ridge = (x + (y >> 1)) % 8;
        if (ridge < 2) tone += 1;
        else if (ridge === 4 || ridge === 5) tone -= 1;
        px(ctx, x, y, tones[Math.min(5, Math.max(0, tone))]);
      }
    }
    for (let i = 0; i < 26; i++) px(ctx, rng.int(w), 20 + rng.int(12), rng.int(2) ? MOSS[0] : MOSS[1]);
    for (let i = 0; i < 10; i++) px(ctx, rng.int(w), rng.int(10), '#eef5f6');
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
  for (let i = 0; i < 5; i++) {
    let x = rng.int(16);
    const length = 6 + rng.int(9);
    for (let y = 0; y < length; y++) {
      glowing.push([x, y, lava[Math.min(2, Math.floor((y / length) * 3))]]);
      if (rng.int(2)) x = (x + rng.int(3) + 15) % 16;
    }
  }
  const joints = Array.from({ length: 4 }, () => [2 + rng.int(28), 2 + rng.int(28)]);
  const map = pixelTexture(16, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const column = x >> 2;
        const edge = x % 4;
        let tone = edge === 0 ? 0 : edge === 1 ? 3 : 2;
        if (joints[column].includes(y)) tone = 1;
        if (y > 25) tone = Math.max(0, tone - 1);
        px(ctx, x, y, basalt[tone]);
      }
    }
    ctx.fillStyle = lava[1];
    ctx.fillRect(0, 0, w, 1);
    for (const [x, y, fill] of glowing) px(ctx, x, y, fill);
  });
  const emissive = pixelTexture(16, 32, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = lava[1];
    ctx.fillRect(0, 0, w, 1);
    for (const [x, y, fill] of glowing) px(ctx, x, y, fill);
  });
  for (const t of [map, emissive]) t.wrapS = THREE.RepeatWrapping;
  return { map, emissive };
}
