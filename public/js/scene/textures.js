// Små pikselteksturer tegnet i kode, slik at spillet ikke trenger bildefiler for brettet.
import * as THREE from 'three';

function pixelTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Lyse steinheller i fire varianter. Fargen kommer fra instansfargen på flisen, teksturen gir
// bare struktur: 0 = glatt helle, 1 = sprukket, 2 = mosegrodd, 3 = fire små brostein.
function drawSlab(ctx, rng, x0, y0, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const shade = 208 + Math.floor(rng.next() * 26);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; // lys kant opp og til venstre
  ctx.fillRect(x0, y0, w, 1);
  ctx.fillRect(x0, y0, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; // mørk kant ned og til høyre
  ctx.fillRect(x0, y0 + h - 1, w, 1);
  ctx.fillRect(x0 + w - 1, y0, 1, h);
}

function drawCracks(ctx, rng, count) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < count; i++) {
    let x = 2 + rng.int(12);
    let y = 1 + rng.int(6);
    for (let j = 0; j < 7; j++) {
      ctx.fillRect(x, y, 1, 1);
      x += rng.int(3) - 1;
      y += 1;
    }
  }
}

function drawMoss(ctx, rng) {
  for (let i = 0; i < 5; i++) {
    const cx = 1 + rng.int(13);
    const cy = 1 + rng.int(13);
    for (let j = 0; j < 7; j++) {
      ctx.fillStyle = rng.int(2) ? 'rgba(120,200,120,0.55)' : 'rgba(70,150,95,0.5)';
      ctx.fillRect(cx + rng.int(3) - 1, cy + rng.int(3) - 1, 1, 1);
    }
  }
}

export function tileTextures(rng) {
  const variants = [
    (ctx) => drawSlab(ctx, rng, 0, 0, 16, 16),
    (ctx) => { drawSlab(ctx, rng, 0, 0, 16, 16); drawCracks(ctx, rng, 2); },
    (ctx) => { drawSlab(ctx, rng, 0, 0, 16, 16); drawMoss(ctx, rng); },
    (ctx) => {
      for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) drawSlab(ctx, rng, x, y, 8, 8);
    },
  ];
  return variants.map((draw) => pixelTexture(16, 16, draw));
}

// Lagdelt bergvegg til sidene av brettet.
export function cliffTexture(rng) {
  const bands = ['#3f6a5e', '#2f5350', '#2b4347', '#3a3f45', '#2a2f38', '#1f232c', '#171a22', '#101219'];
  const texture = pixelTexture(16, 16, (ctx, w, h) => {
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, i * 2, w, 2);
    });
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 40; i++) ctx.fillRect(rng.int(w), rng.int(h), 1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 20; i++) ctx.fillRect(rng.int(w), rng.int(h), 1, 1);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Hvite masker for markører på brettet. Fargen settes i materialet.
export function outlineTexture(cross = false) {
  return pixelTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, h - 2, w, 2);
    ctx.fillRect(0, 0, 2, h);
    ctx.fillRect(w - 2, 0, 2, h);
    if (cross) {
      for (let i = 4; i < 12; i++) {
        ctx.fillRect(i, i, 1, 1);
        ctx.fillRect(15 - i, i, 1, 1);
      }
    }
  });
}

export function ringTexture() {
  return pixelTexture(32, 32, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(16, 16, 13, 0, Math.PI * 2);
    ctx.stroke();
  });
}
