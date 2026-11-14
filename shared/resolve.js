// Avgjør én runde der alle ubåter handler samtidig. Ren spillogikk uten nettverk,
// slik at den kan enhetstestes og gjenbrukes av server og bots.
import { CONFIG } from './config.js';
import {
  key, inBounds, dist, linePath, hasLineOfSight, accelerate, moveSub,
  speedOf, canTarget, areaCells,
} from './grid.js';

const T = CONFIG.torpedo;

function effectiveAction(state, sub, order) {
  const a = order?.action;
  if (!a) return { type: 'listen' };
  if (a.type === 'fire' && canTarget(state.board, sub.x, sub.y, a.x, a.y)) return a;
  if (a.type === 'focus' && inBounds(state.board.size, a.x, a.y)) return a;
  if (a.type === 'repair' && sub.damage) return a;
  return { type: 'listen' };
}

function sink(sub, cause, ev) {
  sub.alive = false;
  ev.sunk.push({ id: sub.id, x: sub.x, y: sub.y, cause });
}

function applyHit(sub, torpedo, rng, ev) {
  const direct = rng.chance(T.directHitShare);
  ev.explosions.push({ x: sub.x, y: sub.y, kind: 'hit', victim: sub.id, owner: torpedo.owner });
  ev.hits[sub.id] = direct ? 'direct' : 'indirect';
  if (direct) sink(sub, 'direct', ev);
  else if (sub.damage) sink(sub, 'second', ev);
  else sub.damage = { repairs: 0, left: CONFIG.damage.roundsToRepair };
}

// Torpedoen leter: ubåt i samme rute treffes alltid, ubåt i naborute med 50 % sjanse.
function seek(state, torpedo, rolled, rng, ev) {
  const alive = state.subs.filter((s) => s.alive);
  const here = alive.find((s) => s.x === torpedo.x && s.y === torpedo.y);
  if (here) {
    applyHit(here, torpedo, rng, ev);
    return true;
  }
  for (const sub of alive) {
    if (rolled.has(sub.id) || dist(sub.x, sub.y, torpedo.x, torpedo.y) !== 1) continue;
    rolled.add(sub.id);
    if (rng.chance(T.proximityHitChance)) {
      applyHit(sub, torpedo, rng, ev);
      return true;
    }
  }
  return false;
}

function runTorpedo(state, t, rng, ev) {
  const armed = t.age >= 1; // utskytingsrunden er torpedoen ikke armert
  const rolled = new Set();
  const track = { id: t.id, owner: t.owner, from: [t.x, t.y], path: [], end: null };
  for (let i = 0; i < T.speed && !track.end; i++) {
    const moving = t.step < t.path.length;
    if (!moving && i > 0) break; // ligger i ro ved målet: leter én gang per runde
    if (moving) {
      const [nx, ny] = t.path[t.step];
      if (state.board.rocks.has(key(nx, ny))) {
        ev.explosions.push({ x: t.x, y: t.y, kind: 'rock', owner: t.owner });
        track.end = 'rock';
        break;
      }
      t.x = nx;
      t.y = ny;
      t.step += 1;
      track.path.push([nx, ny]);
    }
    if (armed && seek(state, t, rolled, rng, ev)) track.end = 'hit';
  }
  if (!track.end) {
    t.age += 1;
    if (t.age > T.armedRounds) track.end = 'spent';
  }
  ev.torpedoTracks.push(track);
  return !track.end;
}

function moveSubs(state, orders, ev) {
  for (const sub of state.subs.filter((s) => s.alive)) {
    const order = orders[sub.id];
    const action = effectiveAction(state, sub, order);
    ev.actions[sub.id] = action;
    if (action.type === 'fire') {
      const id = state.nextTorpedoId++;
      const path = linePath(sub.x, sub.y, action.x, action.y);
      state.torpedoes.push({
        id, owner: sub.id, x: sub.x, y: sub.y, tx: action.x, ty: action.y, path, step: 0, age: 0,
      });
      ev.launches.push({ id, owner: sub.id });
    }
    const v = accelerate(sub.vx, sub.vy, order?.accel);
    const moved = moveSub(state.board, sub.x, sub.y, v.vx, v.vy);
    ev.moves[sub.id] = { from: [sub.x, sub.y], path: moved.path, bumped: moved.bumped };
    ev.noise[sub.id] = Math.max(
      CONFIG.noise.idle,
      CONFIG.noise.perSpeed * speedOf(v.vx, v.vy),
      action.type === 'fire' ? CONFIG.noise.torpedo : 0,
      action.type === 'repair' ? CONFIG.noise.repair : 0,
    );
    Object.assign(sub, { x: moved.x, y: moved.y, vx: moved.vx, vy: moved.vy });
  }
}

// Skadde ubåter må reparere to ganger i løpet av tre runder. Runden man blir truffet teller ikke.
function runRepairs(state, ev) {
  for (const sub of state.subs) {
    if (!sub.alive || !sub.damage || ev.hits[sub.id]) continue;
    if (ev.actions[sub.id].type === 'repair') sub.damage.repairs += 1;
    sub.damage.left -= 1;
    if (sub.damage.repairs >= CONFIG.damage.repairsNeeded) {
      sub.damage = null;
      ev.repairs[sub.id] = { done: true };
    } else if (sub.damage.left <= 0) {
      sink(sub, 'flooding', ev);
    } else {
      ev.repairs[sub.id] = { done: false, ...sub.damage };
    }
  }
}

function focusedSonar(state, listener, action, ev) {
  const { board } = state;
  const exact = ev.moves[listener.id].path.length === 0; // stillestående gir nøyaktig rute
  const cells = [];
  const hidden = [];
  for (const [x, y] of areaCells(board.size, action.x, action.y)) {
    const open = !board.rocks.has(key(x, y)) && hasLineOfSight(board, listener.x, listener.y, x, y);
    (open ? cells : hidden).push([x, y]);
  }
  const found = state.subs.filter((s) => s.alive && s.id !== listener.id
    && cells.some(([x, y]) => x === s.x && y === s.y));
  ev.focus[listener.id] = {
    cx: action.x, cy: action.y, exact, cells, hidden,
    found: found.length > 0,
    positions: exact ? found.map((s) => [s.x, s.y]) : [],
  };
}

function passiveSonar(state, listener, rng, ev) {
  const contacts = [];
  for (const target of state.subs) {
    if (!target.alive || target.id === listener.id) continue;
    if (!hasLineOfSight(state.board, listener.x, listener.y, target.x, target.y)) continue;
    const chance = ev.noise[target.id] - dist(listener.x, listener.y, target.x, target.y);
    if (rng.chance(chance / 100)) contacts.push({ x: target.x, y: target.y });
  }
  ev.contacts[listener.id] = contacts;
}

export function resolveRound(state, orders, rng) {
  state.round += 1;
  const ev = {
    round: state.round, moves: {}, actions: {}, noise: {}, launches: [], torpedoTracks: [],
    explosions: [], hits: {}, sunk: [], repairs: {}, contacts: {}, focus: {},
    over: false, winner: null,
  };
  moveSubs(state, orders, ev);
  state.torpedoes = state.torpedoes.filter((t) => runTorpedo(state, t, rng, ev));
  runRepairs(state, ev);
  for (const sub of state.subs.filter((s) => s.alive)) {
    const action = ev.actions[sub.id];
    if (action.type === 'focus') focusedSonar(state, sub, action, ev);
    else passiveSonar(state, sub, rng, ev);
  }
  const alive = state.subs.filter((s) => s.alive);
  if (alive.length <= 1) {
    ev.over = true;
    ev.winner = alive[0]?.id ?? null;
  }
  return ev;
}

export function createState(board, spawns, ids) {
  return {
    board,
    round: 0,
    nextTorpedoId: 1,
    torpedoes: [],
    subs: ids.map((id, i) => ({
      id, x: spawns[i].x, y: spawns[i].y, vx: 0, vy: 0, alive: true, damage: null,
    })),
  };
}
