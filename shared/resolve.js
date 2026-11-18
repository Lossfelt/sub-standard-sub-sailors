// Avgjør én runde der alle ubåter handler samtidig. Ren spillogikk uten nettverk,
// slik at den kan enhetstestes og gjenbrukes av server og bots.
import { CONFIG } from './config.js';
import {
  key, inBounds, dist, linePath, hasLineOfSight, accelerate, moveSub,
  canTarget, areaCells, inBaffles, noiseOf, pitDamping,
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

// by: hvem som står bak senkningen (den som skjøt, eller den man kolliderte med), hvis noen.
function sink(sub, cause, ev, by = null) {
  sub.alive = false;
  ev.sunk.push({ id: sub.id, x: sub.x, y: sub.y, cause, by });
}

// Skaden husker hvem som påførte den, slik at en ubåt som ikke rakk å reparere vet hvem det var.
function damage(by) {
  return { repairs: 0, left: CONFIG.damage.roundsToRepair, by };
}

function applyHit(sub, torpedo, rng, ev) {
  const direct = rng.chance(T.directHitShare);
  ev.explosions.push({ x: sub.x, y: sub.y, kind: 'hit', victim: sub.id, owner: torpedo.owner });
  ev.hits[sub.id] = direct ? 'direct' : 'indirect';
  if (direct) sink(sub, 'direct', ev, torpedo.owner);
  else if (sub.damage) sink(sub, 'second', ev, torpedo.owner);
  else sub.damage = damage(torpedo.owner);
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
    // Sikkerhetsavstand: torpedoen armeres først når den når den tredje ruten på banen sin.
    // Før det kan den verken treffe den som skjøt eller noen andre.
    const armed = t.step >= T.minRange;
    if (armed && seek(state, t, rolled, rng, ev)) track.end = 'hit';
  }
  if (!track.end) {
    t.age += 1;
    if (t.age >= T.armedRounds) track.end = 'spent';
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
    ev.noise[sub.id] = noiseOf(v.vx, v.vy, action.type, sub.idle);
    const still = v.vx === 0 && v.vy === 0;
    Object.assign(sub, { x: moved.x, y: moved.y, vx: moved.vx, vy: moved.vy, idle: still ? (sub.idle ?? 0) + 1 : 0 });
  }
}

// Ender flere ubåter i samme rute, og minst én av dem kjørte dit denne runden, kan de kollidere.
// En kollisjon stopper begge og skader dem som et indirekte treff.
function runCollisions(state, rng, ev) {
  const alive = state.subs.filter((s) => s.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const [a, b] = [alive[i], alive[j]];
      if (!a.alive || !b.alive || a.x !== b.x || a.y !== b.y) continue;
      const moved = ev.moves[a.id].path.length > 0 || ev.moves[b.id].path.length > 0;
      if (!moved || !rng.chance(CONFIG.collisionChance)) continue;
      ev.collisions.push({ x: a.x, y: a.y, ids: [a.id, b.id] });
      for (const [sub, other] of [[a, b], [b, a]]) {
        Object.assign(sub, { vx: 0, vy: 0 });
        ev.hits[sub.id] = 'collision';
        if (sub.damage) sink(sub, 'collision', ev, other.id);
        else sub.damage = damage(other.id);
      }
    }
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
      sink(sub, 'flooding', ev, sub.damage.by);
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
    // Fjell og egen propell (baffles) gir sonarskygge også for fokusert sonar.
    const open = !board.rocks.has(key(x, y)) && hasLineOfSight(board, listener.x, listener.y, x, y)
      && !inBaffles(listener.vx, listener.vy, x - listener.x, y - listener.y);
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
    if (inBaffles(listener.vx, listener.vy, target.x - listener.x, target.y - listener.y)) continue;
    const chance = ev.noise[target.id] - dist(listener.x, listener.y, target.x, target.y)
      - pitDamping(state.board, target.x, target.y, listener.x, listener.y);
    if (rng.chance(chance / 100)) contacts.push({ x: target.x, y: target.y });
  }
  ev.contacts[listener.id] = contacts;
}

export function resolveRound(state, orders, rng) {
  state.round += 1;
  const ev = {
    round: state.round, moves: {}, actions: {}, noise: {}, launches: [], torpedoTracks: [],
    explosions: [], collisions: [], hits: {}, sunk: [], repairs: {}, contacts: {}, focus: {},
    over: false, winner: null,
  };
  moveSubs(state, orders, ev);
  runCollisions(state, rng, ev);
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
      id, x: spawns[i].x, y: spawns[i].y, vx: 0, vy: 0, alive: true, damage: null, idle: 0,
    })),
  };
}
