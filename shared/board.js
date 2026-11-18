import { CONFIG, boardSizeFor } from './config.js';
import { key, inBounds, dist } from './grid.js';

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function makeBoard(size, rockList, pitList = []) {
  return {
    size, rocks: new Set(rockList.map(([x, y]) => key(x, y))), rockList,
    pits: new Set(pitList.map(([x, y]) => key(x, y))), pitList,
  };
}

// Alle åpne ruter må henge sammen, ellers kan en ubåt bli sperret inne.
function isConnected(size, rocks) {
  const total = size * size - rocks.size;
  let start = null;
  for (let i = 0; i < size * size && !start; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (!rocks.has(key(x, y))) start = [x, y];
  }
  if (!start) return false;
  const seen = new Set([key(start[0], start[1])]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (inBounds(size, nx, ny) && !rocks.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size === total;
}

function growRocks(size, rng) {
  const target = Math.round(size * size * CONFIG.mountainShare);
  const rocks = new Set();
  while (rocks.size < target) {
    // Hvert fjell er en liten klynge som vokser ut fra et tilfeldig punkt.
    let x = rng.int(size);
    let y = rng.int(size);
    const clusterSize = 1 + rng.int(4);
    for (let i = 0; i < clusterSize && rocks.size < target; i++) {
      rocks.add(key(x, y));
      const [dx, dy] = rng.pick(NEIGHBOURS);
      x = Math.min(size - 1, Math.max(0, x + dx));
      y = Math.min(size - 1, Math.max(0, y + dy));
    }
  }
  return rocks;
}

// Hvor mange groper brettet får, trukket fra sjansene i CONFIG.
function pitCount(rng) {
  let roll = rng.next();
  const chances = CONFIG.pits.countChances;
  for (let i = 0; i < chances.length; i++) {
    roll -= chances[i];
    if (roll < 0) return i;
  }
  return 0;
}

// Groper ligger ikke ved kanten eller inntil fjell, og ikke nær hverandre.
function placePits(size, rocks, rng) {
  const count = pitCount(rng);
  const pits = [];
  for (let tries = 0; tries < 200 && pits.length < count; tries++) {
    const x = 1 + rng.int(size - 2);
    const y = 1 + rng.int(size - 2);
    let clear = pits.every(([px, py]) => dist(px, py, x, y) >= 4);
    for (let dy = -1; dy <= 1 && clear; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (rocks.has(key(x + dx, y + dy))) clear = false;
    }
    if (clear) pits.push([x, y]);
  }
  return pits;
}

export function generateBoard(playerCount, rng) {
  const size = boardSizeFor(playerCount);
  for (let attempt = 0; attempt < 50; attempt++) {
    const rocks = growRocks(size, rng);
    if (isConnected(size, rocks)) {
      const rockList = [...rocks].map((k) => k.split(',').map(Number));
      return makeBoard(size, rockList, placePits(size, rocks, rng));
    }
  }
  return makeBoard(size, []);
}

// Tilfeldige startposisjoner med litt avstand, slik at ingen starter oppå hverandre.
export function pickSpawns(board, count, rng) {
  let minDistance = CONFIG.minSpawnDistance;
  for (;;) {
    const spawns = [];
    for (let tries = 0; tries < 500 && spawns.length < count; tries++) {
      const x = rng.int(board.size);
      const y = rng.int(board.size);
      if (board.rocks.has(key(x, y)) || board.pits.has(key(x, y))) continue;
      if (spawns.some((s) => dist(s.x, s.y, x, y) < minDistance)) continue;
      spawns.push({ x, y });
    }
    if (spawns.length === count) return spawns;
    minDistance -= 1;
  }
}
