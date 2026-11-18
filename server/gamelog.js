// Spillogg til analyse av balansen: hva hver ubåt gjorde hver runde, og et sammendrag per spiller.
// Ren datainnsamling uten nettverk. Lagringen ligger i db.js.
import { inPit, speedOf } from '../shared/grid.js';

function blankSummary(player) {
  return {
    id: player.id, bot: player.bot, place: null, sunkRound: null, sunkCause: null, sunkBy: null,
    rounds: 0, fired: 0, focus: 0, focusFound: 0, repairs: 0, listens: 0,
    kills: 0, hitsTaken: 0, heardBy: 0, roundsHeard: 0, firstHeard: null, heardOthers: 0,
    roundsInPit: 0, roundsStill: 0, speedSum: 0, noiseSum: 0, thinkMs: [],
  };
}

// Hvem som hørte hvem. Kontaktene er bare posisjoner, så de slås opp mot ubåtene som står der.
function heardMap(state, ev) {
  const heard = {};
  for (const [listener, contacts] of Object.entries(ev.contacts)) {
    heard[listener] = contacts.flatMap(({ x, y }) => state.subs
      .filter((s) => s.id !== listener && s.x === x && s.y === y).map((s) => s.id));
  }
  return heard;
}

// Tomme felt (null, false, tomme lister og objekter) tas ikke med, for å holde loggen liten.
const compact = (obj) => Object.fromEntries(Object.entries(obj)
  .filter(([, v]) => v !== null && v !== false && !(typeof v === 'object' && !Object.keys(v).length)));

export class GameRecorder {
  constructor(match) {
    this.startedAt = new Date();
    this.seed = match.seed;
    this.board = match.board;
    this.timer = match.room.timerSeconds();
    this.players = match.room.players.map((p) => blankSummary(p));
    this.rounds = [];
    this.saved = false;
  }

  summary(id) {
    return this.players.find((p) => p.id === id);
  }

  // thinkMs: hvor lenge hvert menneske brukte på ordren sin denne runden.
  round(state, ev, orders, thinkMs = {}) {
    const heard = heardMap(state, ev);
    const subs = Object.keys(ev.actions).map((id) => {
      const sub = state.subs.find((s) => s.id === id);
      const a = ev.actions[id];
      return compact({
        id, x: sub.x, y: sub.y, vx: sub.vx, vy: sub.vy, accel: orders[id]?.accel ?? null,
        act: a.type, ax: a.type === 'listen' || a.type === 'repair' ? null : a.x,
        ay: a.type === 'listen' || a.type === 'repair' ? null : a.y, noise: ev.noise[id],
        pit: inPit(state.board, sub.x, sub.y), bumped: ev.moves[id].bumped, damaged: Boolean(sub.damage),
        think: thinkMs[id] ?? null,
      });
    });
    this.rounds.push(compact({
      r: ev.round, subs, heard: compact(heard),
      focus: Object.fromEntries(Object.entries(ev.focus).map(([id, f]) => [id, { found: f.found, exact: f.exact }])),
      torpedoes: ev.torpedoTracks.filter((t) => t.end).map((t) => ({ owner: t.owner, end: t.end })),
      hits: ev.hits, sunk: ev.sunk.map(({ id, cause, by }) => ({ id, cause, by })), collisions: ev.collisions.map((c) => c.ids),
    }));
    this.tally(subs, heard, ev);
  }

  tally(subs, heard, ev) {
    for (const s of subs) {
      const p = this.summary(s.id);
      p.rounds += 1;
      if (s.act === 'fire') p.fired += 1;
      else if (s.act === 'focus') p.focus += 1;
      else if (s.act === 'repair') p.repairs += 1;
      else p.listens += 1;
      if (s.pit) p.roundsInPit += 1;
      if (!s.vx && !s.vy) p.roundsStill += 1;
      p.speedSum += speedOf(s.vx, s.vy);
      p.noiseSum += s.noise;
      if (s.think !== undefined) p.thinkMs.push(s.think);
    }
    const heardThisRound = new Set();
    for (const [listener, ids] of Object.entries(heard)) {
      this.summary(listener).heardOthers += ids.length;
      for (const id of ids) {
        this.summary(id).heardBy += 1;
        heardThisRound.add(id);
      }
    }
    for (const id of heardThisRound) {
      const p = this.summary(id);
      p.roundsHeard += 1;
      p.firstHeard ??= ev.round;
    }
    for (const [id, f] of Object.entries(ev.focus)) if (f.found) this.summary(id).focusFound += 1;
    for (const id of Object.keys(ev.hits)) this.summary(id).hitsTaken += 1;
    for (const { id, cause, by } of ev.sunk) {
      Object.assign(this.summary(id), { sunkRound: ev.round, sunkCause: cause, sunkBy: by });
      if (by && by !== id) this.summary(by).kills += 1;
    }
  }

  // Plassering: vinneren er nummer 1, deretter i omvendt rekkefølge av når de sank.
  // De som sank i samme runde deler plass. Avbrutte spill får ingen plassering for de som lever.
  places(winner) {
    const sunk = this.players.filter((p) => p.sunkRound !== null).sort((a, b) => b.sunkRound - a.sunkRound);
    let place = winner ? 2 : 1;
    sunk.forEach((p, i) => {
      if (i > 0 && p.sunkRound !== sunk[i - 1].sunkRound) place = i + (winner ? 2 : 1);
      p.place = place;
    });
    if (winner) this.summary(winner).place = 1;
  }

  // Lager posten som lagres. finished er false når spillet ble avbrutt før noen vant.
  record(finished, winner) {
    this.places(finished ? winner : null);
    const avg = (sum, n) => (n ? Math.round((sum / n) * 10) / 10 : null);
    const players = this.players.map(({ speedSum, noiseSum, thinkMs, ...p }) => ({
      ...p,
      avgSpeed: avg(speedSum, p.rounds),
      avgNoise: avg(noiseSum, p.rounds),
      avgThinkMs: thinkMs.length ? Math.round(thinkMs.reduce((a, b) => a + b, 0) / thinkMs.length) : null,
    }));
    return {
      startedAt: this.startedAt,
      finished,
      winner: finished ? winner : null,
      seed: String(this.seed),
      timer: this.timer,
      rounds: this.rounds.length,
      players,
      data: {
        board: { size: this.board.size, rocks: this.board.rockList.length, trenches: this.board.trenches.map((t) => t.length) },
        rounds: this.rounds,
      },
    };
  }
}
