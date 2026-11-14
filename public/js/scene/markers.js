// Markeringer oppå brettet: valgte ruter, sonarområder, kontakter og torpedomål.
import * as THREE from 'three';
import { outlineTexture, ringTexture } from './textures.js';

const dummy = new THREE.Object3D();
const FLAT = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
const BLIP = new THREE.OctahedronGeometry(0.14, 0);

// Et lag med like markører som kan legges på vilkårlig mange ruter.
class CellLayer {
  constructor(stage, { color, opacity = 1, map = null, height = 0.012 }) {
    this.stage = stage;
    this.height = height;
    const material = new THREE.MeshBasicMaterial({
      color, map, opacity, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(FLAT, material, stage.boardSize ** 2);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    stage.scene.add(this.mesh);
  }

  set(cells) {
    this.mesh.count = cells.length;
    cells.forEach(([x, y], i) => {
      dummy.position.copy(this.stage.cellToWorld(x, y, this.height));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

export class Markers {
  constructor(stage) {
    this.stage = stage;
    const outline = outlineTexture();
    const cross = outlineTexture(true);
    this.textures = [outline, cross, ringTexture()];
    const layer = (opts) => new CellLayer(stage, opts);
    this.layers = {
      shadow: layer({ color: '#000000', opacity: 0.45, height: 0.010 }), // sonarskygge
      area: layer({ color: '#58d6ff', opacity: 0.3, height: 0.012 }), // fokusområde under valg
      blocked: layer({ color: '#ff5340', opacity: 0.22, height: 0.012 }), // for nært til torpedo
      path: layer({ color: '#ffffff', opacity: 0.16, height: 0.014 }), // torpedobane
      focusHit: layer({ color: '#ffb347', opacity: 0.45, height: 0.016 }),
      focusMiss: layer({ color: '#7fa8c0', opacity: 0.22, height: 0.016 }),
      boom: layer({ color: '#ff5340', map: cross, height: 0.018 }), // hørte eksplosjoner
      target: layer({ color: '#ff5340', map: cross, height: 0.020 }),
      own: layer({ color: '#58d6ff', map: outline, height: 0.022 }),
      predict: layer({ color: '#f2c230', map: outline, height: 0.024 }),
      hover: layer({ color: '#ffffff', map: outline, opacity: 0.8, height: 0.026 }),
    };
    this.contacts = [];
  }

  set(name, cells) {
    this.layers[name].set(cells);
  }

  clearSelection() {
    for (const name of ['area', 'blocked', 'path', 'target']) this.set(name, []);
  }

  // Kontakter: ring på bunnen og en svevende "blipp". Eldre kontakter blekner.
  setContacts(list) {
    for (const c of this.contacts) {
      c.group.removeFromParent();
      c.materials.forEach((m) => m.dispose());
      c.label.remove();
    }
    this.contacts = list.map(({ x, y, age, fade }) => {
      const opacity = Math.max(0.15, 1 - fade);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#ffb347', map: this.textures[2], transparent: true, opacity, depthWrite: false,
      });
      const blipMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity });
      const group = new THREE.Group();
      const ring = new THREE.Mesh(FLAT, ringMat);
      ring.position.y = 0.03;
      const blip = new THREE.Mesh(BLIP, blipMat);
      blip.position.y = 0.5;
      group.add(ring, blip);
      group.position.copy(this.stage.cellToWorld(x, y));
      this.stage.scene.add(group);
      const label = this.stage.addLabel('contact', age === 0 ? '' : `-${age}`);
      label.pos.copy(this.stage.cellToWorld(x, y, 0.95));
      label.el.style.opacity = opacity;
      return { group, ring, blip, materials: [ringMat, blipMat], label, fresh: age === 0 };
    });
  }

  update(time) {
    for (const c of this.contacts) {
      c.blip.rotation.y = time * 2;
      c.blip.position.y = 0.5 + Math.sin(time * 3) * 0.05;
      if (c.fresh) c.ring.scale.setScalar(1 + Math.sin(time * 5) * 0.12);
    }
    this.layers.own.mesh.material.opacity = 0.65 + Math.sin(time * 3) * 0.3;
  }

  dispose() {
    this.setContacts([]);
    Object.values(this.layers).forEach((l) => l.dispose());
    this.textures.forEach((t) => t.dispose());
  }
}
