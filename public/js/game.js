// Spillkontrolleren på klienten: holder styr på hva spilleren vet, bygger ordren
// for runden og sender den til serveren.
import { CONFIG, DIRS } from '/shared/config.js';
import { makeBoard } from '/shared/board.js';
import {
  accelerate, moveSub, speedOf, canTarget, areaCells, dist, linePath, inBounds, key,
} from '/shared/grid.js';
import { attachInput } from './scene/input.js';
import { World } from './world.js';
import { play } from './audio.js';
import { cellName, COMPASS, describeSpeed } from './texts.js';
import { playRound, showGameOver } from './playback.js';

const HINTS = {
  listen: 'Lytter passivt etter alle ubåter.',
  repair: 'Reparerer skroget. Det bråker litt.',
};

export class Game {
  constructor(stage, hud, net) {
    this.stage = stage;
    this.hud = hud;
    this.net = net;
    this.world = null;
    attachInput(stage, { onCell: (c) => this.onCell(c), onHover: (c) => this.onHover(c) });
    stage.onFrame((dt, time) => this.world?.frame(dt, time));
  }

  start(msg) {
    this.stop();
    this.you = msg.you;
    this.players = msg.players;
    this.board = makeBoard(msg.board.size, msg.board.rocks);
    this.world = new World(this.stage, this.board, msg.seed, msg.players, msg.you);
    this.view = msg.view;
    this.submitted = msg.submitted;
    this.contacts = []; // { x, y, round }
    this.booms = []; // { x, y, round }
    this.over = false;
    this.queue = Promise.resolve();
    this.backlog = 0;
    this.cursor = null;
    this.hud.clearLog();
    this.hud.hideBanner();
    this.hud.log(`Brettet er ${this.board.size} × ${this.board.size} ruter. God jakt, kaptein.`);
    this.applyView();
    this.beginRound();
    if (msg.over) showGameOver(this, msg.over);
  }

  stop() {
    this.world?.dispose();
    this.world = null;
  }

  playerName(id) {
    return this.players.find((p) => p.id === id)?.name ?? 'Ukjent';
  }

  // Oppdaterer scenen og HUD-en til å stemme med siste visning fra serveren.
  applyView() {
    const { view, world, hud } = this;
    const { me } = view;
    world.placeSub(me);
    world.syncTorpedoes(view.reveal?.torpedoes ?? view.torpedoes);
    world.syncOthers(view.reveal);
    world.markers.set('own', me.alive ? [[me.x, me.y]] : []);
    const memory = CONFIG.contactMemory;
    this.contacts = this.contacts.filter((c) => view.round - c.round <= memory);
    world.markers.setContacts(this.contacts.map((c) => {
      const age = view.round - c.round;
      return { x: c.x, y: c.y, age, fade: age / (memory + 1) };
    }));
    this.booms = this.booms.filter((b) => view.round - b.round < 2);
    world.markers.set('boom', this.booms.map((b) => [b.x, b.y]));
    hud.setRound(view.round + 1);
    hud.setHull(me);
    hud.setClock(view.timeLeft);
    this.refreshPlayers();
  }

  refreshPlayers() {
    this.hud.setPlayers(this.players, this.view.alive, this.submitted, this.you);
  }

  beginRound() {
    const { me } = this.view;
    this.order = { accel: null, action: { type: me.damage ? 'repair' : 'listen' } };
    this.sent = this.submitted.includes(this.you);
    this.hud.showOrders(me.alive && !this.over);
    this.stage.bottomInset = this.hud.bottomInset();
    this.refreshOrders();
  }

  slotFor(dir) {
    return this.stage.screenSlot(DIRS[dir].dx, DIRS[dir].dy);
  }

  needsCell() {
    const { type, x } = this.order.action;
    return (type === 'focus' || type === 'fire') && x == null;
  }

  // Tegner alt som avhenger av ordren under arbeid: knapper, forhåndsvisning og markeringer.
  refreshOrders() {
    const { me } = this.view;
    if (!this.world) return;
    const { order, hud, world } = this;
    if (!me.alive || this.over) {
      world.showGhost(me, null);
      world.markers.clearSelection();
      return;
    }
    const v = accelerate(me.vx, me.vy, order.accel);
    const moved = moveSub(this.board, me.x, me.y, v.vx, v.vy);
    const slots = {};
    for (const dir of Object.keys(DIRS)) {
      const a = accelerate(me.vx, me.vy, dir);
      slots[this.slotFor(dir)] = { dir, letter: COMPASS[dir], disabled: a.vx === me.vx && a.vy === me.vy };
    }
    this.slots = slots;
    hud.setPads(slots, order.accel ? this.slotFor(order.accel) : 'hold');
    hud.setAction(order.action.type, !!me.damage);
    const noise = Math.max(
      CONFIG.noise.idle,
      CONFIG.noise.perSpeed * speedOf(v.vx, v.vy),
      order.action.type === 'fire' ? CONFIG.noise.torpedo : 0,
      order.action.type === 'repair' ? CONFIG.noise.repair : 0,
    );
    hud.setReadout(describeSpeed(v.vx, v.vy) + (moved.bumped ? ' (krasj!)' : ''), noise);
    world.showGhost(me, this.sent ? null : moved);
    this.refreshSelection(moved.path.length > 0);
    hud.setLocked(this.sent);
    hud.setSend(!this.sent && !this.needsCell(), this.sent ? 'Venter på de andre ...' : 'Send ordre');
  }

  refreshSelection(moving) {
    const { me, torpedoes } = this.view;
    const { markers } = this.world;
    const { type, x, y } = this.order.action;
    const placed = x != null;
    markers.clearSelection();
    const targets = torpedoes.map((t) => [t.tx, t.ty]);
    let hint = HINTS[type];
    if (type === 'focus') {
      if (placed) markers.set('area', areaCells(this.board.size, x, y));
      hint = placed
        ? `Søker rundt ${cellName(x, y)}. ${moving ? 'I fart: bare ja eller nei.' : 'Stille: nøyaktig rute.'}`
        : 'Trykk på midtruten i området du vil søke.';
    }
    if (type === 'fire') {
      markers.set('blocked', this.tooClose(me));
      if (placed) {
        targets.push([x, y]);
        const path = linePath(me.x, me.y, x, y);
        const rock = path.findIndex(([px, py]) => this.board.rocks.has(key(px, py)));
        markers.set('path', rock < 0 ? path : path.slice(0, rock));
        hint = rock < 0 ? `Torpedo mot ${cellName(x, y)}.` : 'Advarsel: et fjell står i veien for torpedoen.';
      } else {
        hint = `Trykk på målruten, minst ${CONFIG.torpedo.minRange} ruter unna.`;
      }
    }
    markers.set('target', targets);
    this.hud.setHint(hint);
  }

  tooClose(me) {
    const cells = [];
    const reach = CONFIG.torpedo.minRange - 1;
    for (let y = me.y - reach; y <= me.y + reach; y++) {
      for (let x = me.x - reach; x <= me.x + reach; x++) {
        if (inBounds(this.board.size, x, y) && dist(me.x, me.y, x, y) > 0) cells.push([x, y]);
      }
    }
    return cells;
  }

  canEdit() {
    return this.world && !this.sent && !this.over && this.view.me.alive;
  }

  onPad(slot) {
    if (!this.canEdit()) return;
    const dir = slot === 'hold' ? null : this.slots[slot].dir;
    this.order.accel = this.order.accel === dir ? null : dir;
    play('click', 0.4);
    this.refreshOrders();
  }

  onAction(type) {
    if (!this.canEdit() || (type === 'repair' && !this.view.me.damage)) return;
    this.order.action = { type };
    play('click', 0.4);
    this.refreshOrders();
  }

  onCell({ x, y }) {
    if (!this.canEdit()) return;
    const { me } = this.view;
    const { type } = this.order.action;
    if (type === 'focus') this.order.action = { type, x, y };
    else if (type === 'fire') {
      if (!canTarget(this.board, me.x, me.y, x, y)) {
        this.hud.setHint('Dit kan du ikke skyte: for nært, eller et fjell.');
        return;
      }
      this.order.action = { type, x, y };
    } else return;
    play('click', 0.4);
    this.refreshOrders();
  }

  onHover(cell) {
    if (cell) this.cursor = cell;
    this.world?.setHover(cell, cell ? cellName(cell.x, cell.y) : '');
  }

  // Tastaturstyring: flytter rutemarkøren ett steg i en skjermdiagonal (NE, SE, SW, NW).
  moveCursor(slot) {
    if (!this.world) return;
    const dir = Object.keys(DIRS).find((d) => this.slotFor(d) === slot);
    const from = this.cursor ?? this.view.me;
    const clamp = (v) => Math.min(this.board.size - 1, Math.max(0, v));
    this.onHover({ x: clamp(from.x + DIRS[dir].dx), y: clamp(from.y + DIRS[dir].dy) });
  }

  selectCursor() {
    if (this.cursor) this.onCell(this.cursor);
  }

  rotate(step) {
    this.stage.rotate(step);
    if (this.world) this.refreshOrders();
  }

  send() {
    if (!this.canEdit() || this.needsCell()) return;
    this.net.send({ t: 'orders', accel: this.order.accel, action: this.order.action });
    this.sent = true;
    play('order', 0.5);
    this.refreshOrders();
  }

  onSubmitted(ids) {
    if (!this.world) return;
    this.submitted = ids;
    this.refreshPlayers();
  }

  // Rundene spilles av én om gangen, også når serveren sender dem tett (tilskuermodus).
  onRound(msg) {
    if (!this.world) return;
    const { world } = this;
    this.backlog += 1;
    this.queue = this.queue
      .then(() => {
        if (this.world !== world) return null;
        world.effects.speed = this.backlog > 1 ? 6 : 1;
        return playRound(this, msg);
      })
      .finally(() => { this.backlog -= 1; })
      .catch((err) => console.error('Feil under avspilling av runden:', err));
  }
}
