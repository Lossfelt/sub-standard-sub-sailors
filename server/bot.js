// Enkel datastyrt kaptein. Boten ser bare det samme som en menneskelig spiller:
// sin egen visning og rapporten etter hver runde.
import { CONFIG } from '../shared/config.js';
import {
  key, dist, accelerate, moveSub, isBlocked, speedOf, canTarget,
} from '../shared/grid.js';

const ACCELS = [null, 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const CONTACT_MAX_AGE = 3;

export class Bot {
  constructor(id, board, rng) {
    this.id = id;
    this.board = board;
    this.rng = rng;
    this.contacts = []; // { x, y, round, vx, vy }
    this.waypoint = null;
    this.waypointAge = 0;
    this.danger = null; // { x, y, until } - sted boten vil bort fra
  }

  observe(report, view) {
    const { round } = view;
    // To kontakter på rad nær hverandre tolkes som samme ubåt, og gir et anslag på farten.
    const add = (x, y) => {
      const prev = this.contacts.find((c) => c.round === round - 1 && dist(c.x, c.y, x, y) <= CONFIG.maxSpeed);
      this.contacts.push({ x, y, round, vx: prev ? x - prev.x : 0, vy: prev ? y - prev.y : 0 });
    };
    report.contacts.forEach((c) => add(c.x, c.y));
    if (report.focus?.found) {
      if (report.focus.exact) report.focus.positions.forEach(([x, y]) => add(x, y));
      else add(report.focus.cx, report.focus.cy);
    }
    for (const e of report.explosions) {
      if (e.kind === 'hit' && !e.onMe) add(e.x, e.y); // en skadet ubåt ligger der
      if (dist(e.x, e.y, view.me.x, view.me.y) <= 2) {
        this.danger = { x: e.x, y: e.y, until: round + 3 };
      }
    }
    for (const s of report.sunk) {
      this.contacts = this.contacts.filter((c) => dist(c.x, c.y, s.x, s.y) > 1);
    }
    this.contacts = this.contacts.filter((c) => round - c.round <= CONTACT_MAX_AGE);
  }

  freshestContact(view) {
    const { me } = view;
    return this.contacts
      .filter((c) => c.x !== me.x || c.y !== me.y)
      .sort((a, b) => b.round - a.round)[0] ?? null;
  }

  chooseAction(view) {
    const { me, round } = view;
    if (me.damage) return { type: 'repair' };
    const contact = this.freshestContact(view);
    if (!contact) return this.checkPit(me);
    const age = round - contact.round;
    const fireChance = [0.8, 0.5, 0.3, 0.15][age] ?? 0;
    const busy = view.torpedoes.filter((t) => t.mine).length >= 2;
    const aim = this.aimPoint(me, contact, age);
    if (!busy && aim && this.rng.chance(fireChance)) return { type: 'fire', ...aim };
    if (age >= 1 && this.rng.chance(0.5)) return { type: 'focus', x: contact.x, y: contact.y };
    return { type: 'listen' };
  }

  // Uten spor sjekker boten av og til om noen gjemmer seg i en grop.
  checkPit(me) {
    const pits = this.board.pitList.filter(([x, y]) => dist(me.x, me.y, x, y) > 1);
    if (!pits.length || !this.rng.chance(0.15)) return { type: 'listen' };
    const [x, y] = this.rng.pick(pits);
    return { type: 'focus', x, y };
  }

  // Sikter foran målet ut fra anslått fart og hvor lang tid torpedoen bruker.
  aimPoint(me, contact, age) {
    const travel = Math.ceil(dist(me.x, me.y, contact.x, contact.y) / CONFIG.torpedo.speed) + age;
    const clamp = (v) => Math.min(this.board.size - 1, Math.max(0, v));
    const lead = { x: clamp(contact.x + contact.vx * travel), y: clamp(contact.y + contact.vy * travel) };
    for (const p of [lead, contact]) {
      if (canTarget(this.board, me.x, me.y, p.x, p.y)) return { x: p.x, y: p.y };
    }
    return null;
  }

  updateWaypoint(view) {
    const { me } = view;
    const contact = this.freshestContact(view);
    this.waypointAge += 1;
    if (contact && dist(me.x, me.y, contact.x, contact.y) > 6) {
      this.waypoint = { x: contact.x, y: contact.y };
      return;
    }
    const reached = this.waypoint && dist(me.x, me.y, this.waypoint.x, this.waypoint.y) <= 1;
    if (!this.waypoint || reached || this.waypointAge > 10) {
      for (let i = 0; i < 20; i++) {
        const x = this.rng.int(this.board.size);
        const y = this.rng.int(this.board.size);
        if (!this.board.rocks.has(key(x, y))) {
          this.waypoint = { x, y };
          this.waypointAge = 0;
          break;
        }
      }
    }
  }

  // Poengsetter hver mulig akselerasjon og velger den beste.
  scoreAccel(view, dir) {
    const { me, round } = view;
    const fleeing = this.danger && this.danger.until >= round;
    const v = accelerate(me.vx, me.vy, dir);
    const moved = moveSub(this.board, me.x, me.y, v.vx, v.vy);
    let score = this.rng.next() * 1.5;
    if (moved.bumped) score -= 50;
    if (isBlocked(this.board, moved.x + moved.vx, moved.y + moved.vy)) score -= 15;
    const speed = speedOf(v.vx, v.vy);
    // Stille er trygt, men da finner man ingen. Jo lenger spillet varer, jo mer utålmodig
    // blir boten og jo mer fart (og støy) tar den sjansen på.
    const impatience = Math.min(1, round / 60);
    const speedCost = [3 + 5 * impatience, 1 + 3 * impatience, 7 - 6 * impatience];
    score -= fleeing ? 0 : speedCost[speed];
    for (const t of view.torpedoes) {
      const nearTarget = t.mine && dist(moved.x, moved.y, t.tx, t.ty) <= 1;
      if (dist(moved.x, moved.y, t.x, t.y) <= 1 || nearTarget) score -= 40;
    }
    // En grop er et godt sted å puste ut en runde eller to, men ikke å bli liggende.
    const idle = view.me.idle ?? 0;
    if (!fleeing && speed === 0 && idle < 2 && this.board.pits.has(key(moved.x, moved.y))) score += 3;
    if (fleeing) score += 3 * dist(moved.x, moved.y, this.danger.x, this.danger.y);
    else if (this.waypoint) score -= dist(moved.x, moved.y, this.waypoint.x, this.waypoint.y);
    return score;
  }

  decide(view) {
    this.updateWaypoint(view);
    let best = null;
    let bestScore = -Infinity;
    for (const dir of ACCELS) {
      const score = this.scoreAccel(view, dir);
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return { accel: best, action: this.chooseAction(view) };
  }
}

export const BOT_NAMES = [
  'Kaptein Lekk', 'Styrmann Rust', 'Admiral Blubb', 'Løytnant Ping',
  'Kaptein Sjøsyk', 'Matros Skvulp', 'Kommandør Boble', 'Kaptein Rør',
];
