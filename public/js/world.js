// Alt som finnes i 3D-scenen for ett spill: brett, ubåter, torpedoer, vrak og markører.
import { buildTerrain } from './scene/terrain.js';
import { Markers } from './scene/markers.js';
import { Effects } from './scene/effects.js';
import { Life } from './scene/life.js';
import { makeSub, makeTorpedo, setHeading, addHeadlight, disposeObject } from './scene/models.js';
import { COMPASS } from './texts.js';

const SUB_HEIGHT = 0.45;
const TORPEDO_HEIGHT = 0.3;

export class World {
  constructor(stage, board, seed, players, you) {
    this.stage = stage;
    this.board = board;
    this.players = new Map(players.map((p) => [p.id, p]));
    this.you = you;
    stage.setBoardSize(board.size);
    this.terrain = buildTerrain(stage, board, seed);
    stage.scene.add(this.terrain.group);
    this.markers = new Markers(stage);
    this.effects = new Effects(stage);
    this.life = new Life(stage, this.terrain.vents, this.terrain.rng);
    const colour = this.players.get(you).color;
    this.sub = makeSub(colour);
    addHeadlight(this.sub);
    this.ghost = makeSub(colour, 'ghost');
    this.ghost.visible = false;
    stage.scene.add(this.sub, this.ghost);
    this.torpedoes = new Map(); // id -> { model, label }
    this.others = new Map(); // id -> modell, bare synlig for tilskuere
    this.wrecks = [];
    this.labels = this.makeCompass();
    this.hoverLabel = stage.addLabel('hover');
  }

  makeCompass() {
    const edge = this.board.size - 1;
    const mid = edge / 2;
    const spots = [['N', mid, -1.3], ['S', mid, edge + 1.3], ['E', edge + 1.3, mid], ['W', -1.3, mid]];
    return spots.map(([dir, x, y]) => {
      const label = this.stage.addLabel('compass', COMPASS[dir]);
      label.pos.copy(this.stage.cellToWorld(x, y, 0));
      return label;
    });
  }

  at(x, y, height) {
    return this.stage.cellToWorld(x, y, height);
  }

  placeSub(me) {
    this.sub.visible = me.alive;
    this.sub.position.copy(this.at(me.x, me.y, SUB_HEIGHT));
    if (me.vx || me.vy) setHeading(this.sub, me.vx, me.vy);
  }

  // Gjennomsiktig ubåt der vi havner neste runde med valgt manøver.
  showGhost(from, to) {
    const moves = to && (to.x !== from.x || to.y !== from.y);
    this.ghost.visible = !!moves;
    this.markers.set('predict', moves ? [[to.x, to.y]] : []);
    if (!moves) return;
    this.ghost.position.copy(this.at(to.x, to.y, SUB_HEIGHT));
    setHeading(this.ghost, to.x - from.x, to.y - from.y);
  }

  async glide(model, from, path, height, secondsPerStep) {
    let [px, py] = from;
    for (const [x, y] of path) {
      setHeading(model, x - px, y - py);
      await this.effects.moveAlong(model, [this.at(x, y, height)], secondsPerStep);
      px = x;
      py = y;
    }
  }

  moveSub(move) {
    return this.glide(this.sub, move.from, move.path, SUB_HEIGHT, 0.3);
  }

  ensureTorpedo(id, x, y, own) {
    let entry = this.torpedoes.get(id);
    if (!entry) {
      const model = makeTorpedo();
      model.position.copy(this.at(x, y, TORPEDO_HEIGHT));
      this.stage.scene.add(model);
      entry = { model, label: own ? this.stage.addLabel('me') : null };
      this.torpedoes.set(id, entry);
    }
    return entry;
  }

  removeTorpedo(id) {
    const entry = this.torpedoes.get(id);
    if (!entry) return;
    disposeObject(entry.model);
    entry.label?.remove();
    this.torpedoes.delete(id);
  }

  async moveTorpedo(track) {
    const { model } = this.ensureTorpedo(track.id, track.from[0], track.from[1], true);
    await this.glide(model, track.from, track.path, TORPEDO_HEIGHT, 0.13);
    if (track.end) this.removeTorpedo(track.id);
  }

  // Stiller torpedomodellene etter serverens fasit etter at runden er spilt av.
  syncTorpedoes(list) {
    const ids = new Set(list.map((t) => t.id));
    for (const id of [...this.torpedoes.keys()]) if (!ids.has(id)) this.removeTorpedo(id);
    for (const t of list) {
      const own = t.owner === this.you;
      const entry = this.ensureTorpedo(t.id, t.x, t.y, own);
      const target = this.at(t.x, t.y, TORPEDO_HEIGHT);
      if (entry.model.position.distanceTo(target) > 0.01) {
        setHeading(entry.model, target.x - entry.model.position.x, target.z - entry.model.position.z);
        this.effects.moveAlong(entry.model, [target], 0.4);
      }
      if (entry.label) entry.label.el.textContent = t.armed ? `${t.roundsLeft}` : 'uarmert';
    }
  }

  // Tilskuere og sluttskjermen ser alle ubåter.
  syncOthers(reveal) {
    for (const s of reveal?.subs ?? []) {
      if (s.id === this.you) continue;
      let model = this.others.get(s.id);
      if (!s.alive) {
        if (model) disposeObject(model);
        this.others.delete(s.id);
        continue;
      }
      const target = this.at(s.x, s.y, SUB_HEIGHT);
      if (!model) {
        model = makeSub(this.players.get(s.id).color);
        model.position.copy(target);
        this.stage.scene.add(model);
        this.others.set(s.id, model);
      } else if (model.position.distanceTo(target) > 0.01) {
        setHeading(model, target.x - model.position.x, target.z - model.position.z);
        this.effects.moveAlong(model, [target], 0.5);
      }
    }
  }

  addWreck(id, x, y) {
    const wreck = makeSub(this.players.get(id).color, 'wreck');
    wreck.position.copy(this.at(x, y, 0.16));
    this.stage.scene.add(wreck);
    this.wrecks.push(wreck);
    if (id === this.you) this.sub.visible = false;
    const other = this.others.get(id);
    if (other) {
      disposeObject(other);
      this.others.delete(id);
    }
  }

  setHover(cell, text) {
    this.markers.set('hover', cell ? [[cell.x, cell.y]] : []);
    this.hoverLabel.el.textContent = cell ? text : '';
    if (cell) this.hoverLabel.pos.copy(this.at(cell.x, cell.y, 0.9));
  }

  frame(dt, time) {
    this.effects.update(dt);
    this.markers.update(time);
    this.terrain.update(time);
    this.life.update(time);
    const bob = Math.sin(time * 2) * 0.03;
    for (const model of [this.sub, this.ghost, ...this.others.values()]) {
      model.position.y = SUB_HEIGHT + bob;
      const { propeller } = model.userData;
      if (propeller) propeller.rotation.x += dt * 9;
    }
    for (const { model, label } of this.torpedoes.values()) {
      if (label) label.pos.copy(model.position).setY(0.75);
    }
  }

  dispose() {
    this.terrain.dispose();
    this.markers.dispose();
    this.effects.dispose();
    this.life.dispose();
    for (const id of [...this.torpedoes.keys()]) this.removeTorpedo(id);
    [this.sub, this.ghost, ...this.others.values(), ...this.wrecks].forEach(disposeObject);
    [...this.labels, this.hoverLabel].forEach((l) => l.remove());
  }
}
