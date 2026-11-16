// Felles hjelper for pikselteksturer tegnet i kode, og maskene til markørene på brettet.
import * as THREE from 'three';

export function pixelTexture(width, height, draw) {
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
