import { CONFIG, boardSizeFor } from './config.js';
import { key, inBounds, dist } from './grid.js';

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// trenches: lange groper, hver en liste med ruter i rekkefølge der nabo følger nabo.
// pits slår opp hvilken grop en rute hører til.
export function makeBoard(size, rockList, trenches = []) {
  const pits = new Map();
  trenches.forEach((cells, i) => cells.forEach(([x, y]) => pits.set(key(x, y), i)));
  return {
    size, rocks: new Set(rockList.map(([x, y]) => key(x, y))), rockList,
    trenches, pits, pitList: trenches.flat(),
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

function growRocks(size, rng, avoid) {
  const target = Math.round(size * size * CONFIG.mountainShare);
  const rocks = new Set();
  while (rocks.size < target) {
    // Hvert fjell er en liten klynge som vokser ut fra et tilfeldig punkt.
    let x = rng.int(size);
    let y = rng.int(size);
    const clusterSize = 1 + rng.int(4);
    for (let i = 0; i < clusterSize && rocks.size < target; i++) {
      if (!avoid.has(key(x, y))) rocks.add(key(x, y));
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

const CARDINAL = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Startpunkt og retning: enten fra en kant og innover (og da helt til en kant igjen), eller et
// sted inne på brettet med en lengde på 6 til 11 ruter.
function trenchStart(size, rng) {
  if (rng.chance(CONFIG.pits.crossChance)) {
    const side = rng.int(4);
    const along = 1 + rng.int(size - 2);
    const [x, y] = [[0, along], [along, 0], [size - 1, along], [along, size - 1]][side];
    return { x, y, dir: side, length: Infinity };
  }
  return { x: 2 + rng.int(size - 4), y: 2 + rng.int(size - 4), dir: rng.int(4), length: 6 + rng.int(6) };
}

// En grop som går i hovedsak én vei, men skyver seg av og til en rute til siden og kan svinge.
// Rutene henger sammen side mot side, og gropa berører verken seg selv eller andre groper.
function growTrench(size, rng, taken) {
  const start = trenchStart(size, rng);
  let { dir } = start;
  const cells = [[start.x, start.y]];
  const own = new Set([key(start.x, start.y)]);
  let sidestepped = false;
  for (let step = 0; step < size * 3 && cells.length < start.length; step++) {
    const [cx, cy] = cells[cells.length - 1];
    if (cells.length > 2 && rng.chance(CONFIG.pits.turnChance)) dir = (dir + (rng.int(2) ? 1 : 3)) % 4;
    let [dx, dy] = CARDINAL[dir];
    sidestepped = !sidestepped && cells.length > 1 && rng.chance(CONFIG.pits.bendChance);
    if (sidestepped) [dx, dy] = CARDINAL[(dir + (rng.int(2) ? 1 : 3)) % 4];
    const [nx, ny] = [cx + dx, cy + dy];
    if (!inBounds(size, nx, ny)) break;
    const touches = NEIGHBOURS.some(([ox, oy]) => {
      const k = key(nx + ox, ny + oy);
      return taken.has(k) || (own.has(k) && !(nx + ox === cx && ny + oy === cy));
    });
    if (own.has(key(nx, ny)) || taken.has(key(nx, ny)) || touches) break;
    cells.push([nx, ny]);
    own.add(key(nx, ny));
  }
  return cells.length >= CONFIG.pits.minLength ? cells : null;
}

function placeTrenches(size, rng) {
  const count = pitCount(rng);
  const trenches = [];
  const taken = new Set();
  for (let tries = 0; tries < 60 && trenches.length < count; tries++) {
    const cells = growTrench(size, rng, taken);
    if (!cells) continue;
    trenches.push(cells);
    cells.forEach(([x, y]) => taken.add(key(x, y)));
  }
  return trenches;
}

export function generateBoard(playerCount, rng) {
  const size = boardSizeFor(playerCount);
  for (let attempt = 0; attempt < 50; attempt++) {
    const trenches = placeTrenches(size, rng);
    const rocks = growRocks(size, rng, new Set(trenches.flat().map(([x, y]) => key(x, y))));
    if (isConnected(size, rocks)) {
      const rockList = [...rocks].map((k) => k.split(',').map(Number));
      return makeBoard(size, rockList, trenches);
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
