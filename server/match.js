// Ett spill: samler inn ordre fra alle, avgjør runden samtidig og sender ut hver spillers rapport.
import { DIRS } from '../shared/config.js';
import { generateBoard, pickSpawns } from '../shared/board.js';
import { createState, resolveRound } from '../shared/resolve.js';
import { makeRng, randomSeed } from '../shared/rng.js';
import { Bot } from './bot.js';
import { buildView, buildReport } from './views.js';

const SPECTATE_DELAY = 1000; // ms mellom rundene når bare bots er igjen
const ACTIONS = new Set(['listen', 'focus', 'fire', 'repair']);

function sanitizeOrder(raw) {
  const action = raw?.action ?? {};
  return {
    accel: DIRS[raw?.accel] ? raw.accel : null,
    action: {
      type: ACTIONS.has(action.type) ? action.type : 'listen',
      x: Number.isInteger(action.x) ? action.x : -1,
      y: Number.isInteger(action.y) ? action.y : -1,
    },
  };
}

export class Match {
  constructor(room, seed = randomSeed()) {
    this.room = room;
    this.seed = seed;
    this.rng = makeRng(this.seed);
    const ids = room.players.map((p) => p.id);
    this.board = generateBoard(ids.length, this.rng);
    this.state = createState(this.board, pickSpawns(this.board, ids.length, this.rng), ids);
    this.bots = new Map(room.players.filter((p) => p.bot)
      .map((p) => [p.id, new Bot(p.id, this.board, this.rng)]));
    this.orders = {};
    this.over = false;
    this.winner = null;
    this.timer = null;
    this.deadline = null;
  }

  isAlive(id) {
    return this.state.subs.find((s) => s.id === id)?.alive ?? false;
  }

  // Levende, tilkoblede mennesker som ennå ikke har sendt ordre.
  waiting() {
    return this.room.connectedHumans().filter((p) => this.isAlive(p.id) && !this.orders[p.id]);
  }

  startMessage(id) {
    return {
      t: 'start',
      you: id,
      seed: this.seed,
      board: { size: this.board.size, rocks: this.board.rockList },
      players: this.room.publicPlayers(),
      submitted: Object.keys(this.orders),
      view: buildView(this, id),
      over: this.over ? { winner: this.winner } : null,
    };
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  // Starter klokka for runden hvis den ikke alt går. Uten tilkoblede mennesker står spillet på pause.
  arm() {
    if (this.over || this.timer || !this.room.connectedHumans().length) return;
    if (!this.waiting().length) {
      const humansPlaying = this.room.connectedHumans().some((p) => this.isAlive(p.id));
      this.timer = setTimeout(() => this.resolve(), humansPlaying ? 0 : SPECTATE_DELAY);
      return;
    }
    const seconds = this.room.timerSeconds();
    if (seconds > 0) {
      this.deadline = Date.now() + seconds * 1000;
      this.timer = setTimeout(() => this.resolve(), seconds * 1000);
    }
  }

  presenceChanged() {
    if (this.over) return;
    if (!this.room.connectedHumans().length || !this.waiting().length) this.clearTimer();
    this.arm();
  }

  submit(id, raw) {
    if (this.over || !this.isAlive(id) || this.orders[id]) return;
    this.orders[id] = sanitizeOrder(raw);
    this.room.broadcast({ t: 'submitted', ids: Object.keys(this.orders) });
    if (!this.waiting().length) this.resolve();
  }

  resolve() {
    this.clearTimer();
    this.deadline = null;
    const aliveBefore = new Set(this.state.subs.filter((s) => s.alive).map((s) => s.id));
    for (const [id, bot] of this.bots) {
      if (aliveBefore.has(id)) this.orders[id] = bot.decide(buildView(this, id));
    }
    const ev = resolveRound(this.state, this.orders, this.rng);
    this.orders = {};
    this.over = ev.over;
    this.winner = ev.winner;
    for (const [id, bot] of this.bots) {
      if (aliveBefore.has(id)) bot.observe(buildReport(this, ev, id, true), buildView(this, id));
    }
    this.arm();
    for (const p of this.room.connectedHumans()) {
      this.room.sendTo(p.id, {
        t: 'round',
        view: buildView(this, p.id),
        report: buildReport(this, ev, p.id, aliveBefore.has(p.id)),
        over: this.over ? { winner: this.winner } : null,
      });
    }
    if (this.over) this.room.matchEnded();
  }

  stop() {
    this.clearTimer();
    this.over = true;
  }
}
