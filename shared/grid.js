import { CONFIG, DIRS } from './config.js';

export const key = (x, y) => `${x},${y}`;

export function inBounds(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

// Avstand "i ruter": diagonaler teller som ett steg.
export function dist(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function isBlocked(board, x, y) {
  return !inBounds(board.size, x, y) || board.rocks.has(key(x, y));
}

// Rutene en rett linje går gjennom fra (ax,ay) til (bx,by), uten startruten.
export function linePath(ax, ay, bx, by) {
  const steps = dist(ax, ay, bx, by);
  const path = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    path.push([Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t)]);
  }
  return path;
}

// Fri siktlinje for lyd: fjell mellom to ruter gir sonarskygge.
export function hasLineOfSight(board, ax, ay, bx, by) {
  const path = linePath(ax, ay, bx, by);
  for (let i = 0; i < path.length - 1; i++) {
    if (board.rocks.has(key(path[i][0], path[i][1]))) return false;
  }
  return true;
}

// Ny fartsvektor etter én akselerasjon. Ugyldig eller for høy fart ignoreres.
export function accelerate(vx, vy, dir) {
  const d = DIRS[dir];
  if (!d) return { vx, vy };
  const nx = vx + d.dx;
  const ny = vy + d.dy;
  if (Math.abs(nx) > CONFIG.maxSpeed || Math.abs(ny) > CONFIG.maxSpeed) return { vx, vy };
  return { vx: nx, vy: ny };
}

// Flytter en ubåt langs fartsvektoren. Brettkant eller fjell stopper ubåten helt.
export function moveSub(board, x, y, vx, vy) {
  const path = [];
  let cx = x;
  let cy = y;
  for (const [nx, ny] of linePath(x, y, x + vx, y + vy)) {
    if (isBlocked(board, nx, ny)) {
      return { x: cx, y: cy, vx: 0, vy: 0, path, bumped: true };
    }
    cx = nx;
    cy = ny;
    path.push([nx, ny]);
  }
  return { x: cx, y: cy, vx, vy, path, bumped: false };
}

export function speedOf(vx, vy) {
  return Math.max(Math.abs(vx), Math.abs(vy));
}

export function canTarget(board, fromX, fromY, tx, ty) {
  return !isBlocked(board, tx, ty) && dist(fromX, fromY, tx, ty) >= CONFIG.torpedo.minRange;
}

export function areaCells(size, cx, cy) {
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inBounds(size, cx + dx, cy + dy)) cells.push([cx + dx, cy + dy]);
    }
  }
  return cells;
}
