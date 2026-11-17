// Felles hjelper for pikselteksturer tegnet i kode, og maskene til markørene på brettet.
import * as THREE from 'three';

// Forenklede utgaver av en tekstur til bruk når den krympes. Vanlig nedskalering blander alle
// småpikslene til grums. Her får hver piksel i stedet den vanligste fargen i området den dekker,
// slik at prikker og tynne streker forsvinner og store flater står igjen rene.
function cleanLevels(canvas) {
  const { width, height } = canvas;
  const source = new Uint32Array(canvas.getContext('2d').getImageData(0, 0, width, height).data.buffer);
  const levels = [canvas];
  for (let k = 1; width >> (k - 1) > 1 || height >> (k - 1) > 1; k++) {
    const w = Math.max(1, width >> k);
    const h = Math.max(1, height >> k);
    const level = document.createElement('canvas');
    level.width = w;
    level.height = h;
    const ctx = level.getContext('2d');
    const image = ctx.createImageData(w, h);
    const out = new Uint32Array(image.data.buffer);
    const reach = 2 ** (k + 1); // halve vindusbredden, målt i piksler i originalen
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = ((x + 0.5) * width) / w;
        const cy = ((y + 0.5) * height) / h;
        const counts = new Map();
        let best = 0;
        let bestCount = 0;
        for (let sy = Math.max(0, Math.floor(cy - reach)); sy < Math.min(height, cy + reach); sy++) {
          for (let sx = Math.max(0, Math.floor(cx - reach)); sx < Math.min(width, cx + reach); sx++) {
            const value = source[sy * width + sx];
            const count = (counts.get(value) ?? 0) + 1;
            counts.set(value, count);
            if (count > bestCount) {
              best = value;
              bestCount = count;
            }
          }
        }
        out[y * w + x] = best;
      }
    }
    ctx.putImageData(image, 0, 0);
    levels.push(level);
  }
  return levels;
}

// smooth: bruk forenklede nivåer når teksturen krympes (zoomet ut), men behold alle piksler på
// nært hold.
export function pixelTexture(width, height, draw, smooth = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d', { willReadFrequently: smooth }), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = smooth ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (smooth) texture.mipmaps = cleanLevels(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
