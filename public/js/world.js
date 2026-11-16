// Alt som finnes i 3D-scenen for ett spill: brett, ubåter, torpedoer, vrak og markører.
import * as THREE from 'three';
import { buildTerrain } from './scene/terrain.js';
import { Markers } from './scene/markers.js';
import { Effects } from './scene/effects.js';
import { Life } from './scene/life.js';
import { makeSub, makeTorpedo, setHeading, addHeadlight, disposeObject } from './scene/models.js';
import { COMPASS, cellName } from './texts.js';

const SUB_HEIGHT = 0.45;
const TORPEDO_HEIGHT = 0.3;
const RING = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

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
    this.life = new Life(stage, this.terrain.vents, this.terrain.smokers, this.terrain.rng);
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
    const spots = [['N', mid, -2.2], ['S', mid, edge + 2.2], ['E', edge + 2.2, mid], ['W', -2.2, mid]];
    const labels = spots.map(([dir, x, y]) => {
      const label = this.stage.addLabel('compass', COMPASS[dir]);
      label.pos.copy(this.stage.cellToWorld(x, y, 0));
      return label;
    });
    // Rutenavn langs alle fire kanter: bokstaver for kolonner, tall for rader (som "F7").
    for (let i = 0; i <= edge; i++) {
      const column = cellName(i, 0).slice(0, 1);
      for (const [text, x, y] of [[column, i, -1], [column, i, edge + 1], [i + 1, -1, i], [i + 1, edge + 1, i]]) {
        const label = this.stage.addLabel('coord', String(text));
        label.pos.copy(this.stage.cellToWorld(x, y, 0));
        labels.push(label);
      }
    }
    return labels;
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

  // Hver torpedo har en rød, pulserende ring på bunnen, slik at den er lett å se.
  ensureTorpedo(id, x, y, own) {
    let entry = this.torpedoes.get(id);
    if (!entry) {
      const model = makeTorpedo();
      model.position.copy(this.at(x, y, TORPEDO_HEIGHT));
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#ff3b2f', map: this.markers.textures[2], transparent: true, depthWrite: false,
      });
      const ring = new THREE.Mesh(RING, ringMat);
      this.stage.scene.add(model, ring);
      entry = {
        model, ring, ringMat, centre: this.at(x, y, TORPEDO_HEIGHT), loitering: false, busy: false,
        phase: id * 1.7, label: own ? this.stage.addLabel('me') : null,
      };
      this.torpedoes.set(id, entry);
    }
    return entry;
  }

  removeTorpedo(id) {
    const entry = this.torpedoes.get(id);
    if (!entry) return;
    disposeObject(entry.model);
    entry.ringMat.dispose();
    entry.ring.removeFromParent();
    entry.label?.remove();
    this.torpedoes.delete(id);
  }

  async moveTorpedo(track) {
    const entry = this.ensureTorpedo(track.id, track.from[0], track.from[1], true);
    entry.busy = true;
    entry.model.position.copy(this.at(track.from[0], track.from[1], TORPEDO_HEIGHT));
    await this.glide(entry.model, track.from, track.path, TORPEDO_HEIGHT, 0.13);
    entry.busy = false;
    if (track.end) this.removeTorpedo(track.id);
  }

  // Stiller torpedomodellene etter serverens fasit etter at runden er spilt av.
  syncTorpedoes(list) {
    const ids = new Set(list.map((t) => t.id));
    for (const id of [...this.torpedoes.keys()]) if (!ids.has(id)) this.removeTorpedo(id);
    for (const t of list) {
      const entry = this.ensureTorpedo(t.id, t.x, t.y, t.mine);
      entry.centre = this.at(t.x, t.y, TORPEDO_HEIGHT);
      entry.loitering = t.loitering;
      const { model, centre } = entry;
      if (!t.loitering) setHeading(model, t.hx, t.hy);
      if (!t.loitering && model.position.distanceTo(centre) > 0.01) {
        entry.busy = true;
        this.effects.moveAlong(model, [centre], 0.4).then(() => { entry.busy = false; });
      }
      if (entry.label) entry.label.el.textContent = String(t.roundsLeft);
    }
  }

  // Ringen pulserer, og en torpedo som ligger ved målet og leter, sirkler rundt ruten.
  animateTorpedoes(time) {
    for (const entry of this.torpedoes.values()) {
      const { model, ring, ringMat, centre } = entry;
      if (entry.loitering && !entry.busy) {
        const angle = time * 2.4 + entry.phase;
        model.position.set(centre.x + Math.cos(angle) * 0.3, TORPEDO_HEIGHT, centre.z + Math.sin(angle) * 0.3);
        model.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle));
      }
      const anchor = entry.loitering ? centre : model.position;
      const pulse = 0.5 + 0.5 * Math.sin(time * 7 + entry.phase);
      ring.position.set(anchor.x, 0.045, anchor.z);
      ring.scale.setScalar(0.75 + pulse * 0.45);
      ringMat.opacity = 0.45 + pulse * 0.55;
      if (entry.label) entry.label.pos.copy(model.position).setY(0.8);
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
    this.animateTorpedoes(time);
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
