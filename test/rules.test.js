import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBoard, generateBoard, pickSpawns } from '../shared/board.js';
import { accelerate, moveSub, hasLineOfSight, canTarget } from '../shared/grid.js';
import { createState, resolveRound } from '../shared/resolve.js';
import { makeRng } from '../shared/rng.js';

// Styrbar "terning": returnerer verdiene i rekkefølge, deretter 0.99 (alt bommer).
function fixedRng(values = []) {
  const queue = [...values];
  const next = () => (queue.length ? queue.shift() : 0.99);
  return { next, chance: (p) => next() < p, int: () => 0, pick: (a) => a[0] };
}

function twoSubs(a, b, rocks = []) {
  const state = createState(makeBoard(12, rocks), [a, b], ['a', 'b']);
  return state;
}

test('akselerasjon er begrenset til 2 per akse', () => {
  let v = { vx: 0, vy: 0 };
  for (let i = 0; i < 4; i++) v = accelerate(v.vx, v.vy, 'E');
  assert.deepEqual(v, { vx: 2, vy: 0 });
  assert.deepEqual(accelerate(2, 0, 'N'), { vx: 2, vy: -1 });
});

test('diagonal akselerasjon endrer begge akser, og avvises hvis én akse er på maks', () => {
  assert.deepEqual(accelerate(0, 0, 'NE'), { vx: 1, vy: -1 });
  assert.deepEqual(accelerate(1, -1, 'SW'), { vx: 0, vy: 0 });
  assert.deepEqual(accelerate(2, 0, 'SE'), { vx: 2, vy: 0 });
});

test('brettkant og fjell stopper ubåten helt', () => {
  const board = makeBoard(10, [[5, 5]]);
  const edge = moveSub(board, 9, 3, 2, 1);
  assert.deepEqual([edge.x, edge.y, edge.vx, edge.vy, edge.bumped], [9, 3, 0, 0, true]);
  const rock = moveSub(board, 3, 5, 2, 0);
  assert.deepEqual([rock.x, rock.y, rock.vx, rock.bumped], [4, 5, 0, true]);
});

test('fjell gir sonarskygge', () => {
  const board = makeBoard(10, [[5, 5]]);
  assert.equal(hasLineOfSight(board, 2, 5, 8, 5), false);
  assert.equal(hasLineOfSight(board, 2, 4, 8, 4), true);
});

test('torpedo kan ikke siktes nærmere enn tre ruter eller på fjell', () => {
  const board = makeBoard(10, [[5, 5]]);
  assert.equal(canTarget(board, 2, 2, 4, 2), false);
  assert.equal(canTarget(board, 2, 2, 5, 2), true);
  assert.equal(canTarget(board, 2, 2, 5, 5), false);
});

test('torpedo er uarmert første runde og treffer ubåt i ruten etterpå', () => {
  const state = twoSubs({ x: 0, y: 0 }, { x: 3, y: 0 });
  const fire = { a: { action: { type: 'fire', x: 3, y: 0 } } };
  let ev = resolveRound(state, fire, fixedRng());
  assert.equal(ev.explosions.length, 0, 'uarmert i utskytingsrunden');
  ev = resolveRound(state, {}, fixedRng([0.9])); // 0.9 >= 0.3 gir indirekte treff
  assert.equal(ev.hits.b, 'indirect');
  assert.deepEqual(state.subs[1].damage, { repairs: 0, left: 3 });
  assert.equal(state.torpedoes.length, 0);
});

test('direkte treff senker umiddelbart og avgjør spillet', () => {
  const state = twoSubs({ x: 0, y: 0 }, { x: 3, y: 0 });
  resolveRound(state, { a: { action: { type: 'fire', x: 3, y: 0 } } }, fixedRng());
  const ev = resolveRound(state, {}, fixedRng([0.1]));
  assert.equal(ev.hits.b, 'direct');
  assert.equal(ev.over, true);
  assert.equal(ev.winner, 'a');
});

test('torpedo går tom for drivstoff etter fem armerte runder', () => {
  const state = twoSubs({ x: 0, y: 0 }, { x: 11, y: 11 });
  resolveRound(state, { a: { action: { type: 'fire', x: 6, y: 0 } } }, fixedRng());
  for (let i = 0; i < 4; i++) resolveRound(state, {}, fixedRng());
  assert.equal(state.torpedoes.length, 1);
  const ev = resolveRound(state, {}, fixedRng());
  assert.equal(ev.torpedoTracks[0].end, 'spent');
  assert.equal(state.torpedoes.length, 0);
});

test('torpedo eksploderer mot fjell', () => {
  const state = twoSubs({ x: 0, y: 0 }, { x: 11, y: 11 }, [[2, 0]]);
  const ev = resolveRound(state, { a: { action: { type: 'fire', x: 5, y: 0 } } }, fixedRng());
  assert.deepEqual(ev.explosions, [{ x: 1, y: 0, kind: 'rock', owner: 'a' }]);
});

test('to reparasjoner innen tre runder redder ubåten, ellers synker den', () => {
  const repaired = twoSubs({ x: 0, y: 0 }, { x: 11, y: 11 });
  repaired.subs[0].damage = { repairs: 0, left: 3 };
  const repair = { a: { action: { type: 'repair' } } };
  resolveRound(repaired, {}, fixedRng());
  resolveRound(repaired, repair, fixedRng());
  resolveRound(repaired, repair, fixedRng());
  assert.equal(repaired.subs[0].damage, null);

  const lost = twoSubs({ x: 0, y: 0 }, { x: 11, y: 11 });
  lost.subs[0].damage = { repairs: 0, left: 3 };
  resolveRound(lost, repair, fixedRng());
  resolveRound(lost, {}, fixedRng());
  const ev = resolveRound(lost, {}, fixedRng());
  assert.equal(ev.sunk[0].cause, 'flooding');
});

test('fokusert sonar: nøyaktig rute stillestående, bare ja/nei i fart', () => {
  const still = twoSubs({ x: 0, y: 0 }, { x: 6, y: 6 });
  let ev = resolveRound(still, { a: { action: { type: 'focus', x: 5, y: 5 } } }, fixedRng());
  assert.deepEqual(ev.focus.a.positions, [[6, 6]]);
  assert.equal(ev.contacts.a, undefined, 'ingen passiv sonar under fokusering');

  const moving = twoSubs({ x: 0, y: 0 }, { x: 6, y: 6 });
  ev = resolveRound(moving, { a: { accel: 'E', action: { type: 'focus', x: 5, y: 5 } } }, fixedRng());
  assert.equal(ev.focus.a.found, true);
  assert.deepEqual(ev.focus.a.positions, []);
});

test('passiv sonar: støy minus avstand, og skygge bak fjell', () => {
  const state = twoSubs({ x: 0, y: 0 }, { x: 5, y: 0 });
  // b skyter: 50 - 5 = 45 %. Terningkast 0.44 gir kontakt, 0.46 gir ingen.
  const fire = { b: { action: { type: 'fire', x: 5, y: 8 } } };
  assert.deepEqual(resolveRound(state, fire, fixedRng([0.44])).contacts.a, [{ x: 5, y: 0 }]);
  assert.deepEqual(resolveRound(state, fire, fixedRng([0.46])).contacts.a, []);

  const shadow = twoSubs({ x: 0, y: 0 }, { x: 5, y: 0 }, [[2, 0]]);
  assert.deepEqual(resolveRound(shadow, fire, fixedRng([0])).contacts.a, []);
});

test('genererte brett er sammenhengende og har plass til alle', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = makeRng(seed);
    const board = generateBoard(4, rng);
    assert.equal(board.size, 14);
    const spawns = pickSpawns(board, 4, rng);
    assert.equal(spawns.length, 4);
    for (const s of spawns) assert.equal(board.rocks.has(`${s.x},${s.y}`), false);
  }
});
