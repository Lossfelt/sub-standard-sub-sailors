// Enkle lavpoly-modeller bygget av grunnformer. Pikseleringen i rendereren gjør resten.
import * as THREE from 'three';

function part(geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = !material.transparent;
  return mesh;
}

// Ubåten peker mot +X. variant: 'normal', 'ghost' (gjennomsiktig forhåndsvisning) eller 'wreck'.
export function makeSub(colorHex, variant = 'normal') {
  const ghost = variant === 'ghost';
  const wreck = variant === 'wreck';
  const base = new THREE.Color(colorHex);
  if (wreck) base.lerp(new THREE.Color('#1c2f33'), 0.6);
  const extra = ghost ? { transparent: true, opacity: 0.42, depthWrite: false } : {};
  const hullMat = new THREE.MeshLambertMaterial({ color: base, flatShading: true, ...extra });
  const darkMat = new THREE.MeshLambertMaterial({
    color: base.clone().multiplyScalar(0.55), flatShading: true, ...extra,
  });
  const glassMat = new THREE.MeshBasicMaterial({ color: wreck ? '#20353a' : '#9ff1ff', ...extra });

  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // kurs først, så krenging (x) og stamping (z) i ubåtens egne akser
  const propeller = part(new THREE.BoxGeometry(0.03, 0.22, 0.05), darkMat, -0.43, 0, 0);
  // Akterenden er en egen del, slik at vrak kan ligge knekt i to.
  const stern = new THREE.Group();
  stern.add(
    part(new THREE.BoxGeometry(0.1, 0.3, 0.03), darkMat, -0.34, 0, 0),
    part(new THREE.BoxGeometry(0.1, 0.03, 0.3), darkMat, -0.34, 0, 0),
    propeller,
  );
  if (wreck) {
    const bow = part(new THREE.CapsuleGeometry(0.16, 0.12, 2, 8), hullMat, 0.13, 0, 0);
    const aft = part(new THREE.CapsuleGeometry(0.16, 0.1, 2, 8), hullMat, -0.17, 0, 0);
    bow.rotation.z = Math.PI / 2;
    aft.rotation.z = Math.PI / 2;
    stern.add(aft, part(new THREE.BoxGeometry(0.03, 0.26, 0.26), glassMat, -0.045, 0, 0)); // mørkt bruddsted
    stern.rotation.set(0.25, 0.5, -0.2);
    stern.position.set(-0.05, -0.04, 0.09);
    group.add(bow);
  } else {
    const hull = part(new THREE.CapsuleGeometry(0.16, 0.34, 2, 8), hullMat);
    hull.rotation.z = Math.PI / 2;
    group.add(hull);
  }
  group.add(
    stern,
    part(new THREE.BoxGeometry(0.17, 0.13, 0.13), hullMat, 0.03, 0.19, 0),
    part(new THREE.BoxGeometry(0.035, 0.14, 0.035), darkMat, 0.07, 0.31, 0),
    part(new THREE.SphereGeometry(0.08, 6, 4), glassMat, 0.29, 0.03, 0),
    part(new THREE.SphereGeometry(0.035, 5, 3), glassMat, 0.08, 0.04, 0.155), // koøyer
    part(new THREE.SphereGeometry(0.035, 5, 3), glassMat, 0.08, 0.04, -0.155),
    part(new THREE.BoxGeometry(wreck ? 0.2 : 0.42, 0.03, 0.2), darkMat, wreck ? 0.1 : -0.02, -0.15, 0), // kjøl
  );
  group.scale.setScalar(1.7);
  group.userData.propeller = propeller;
  if (wreck) {
    group.rotation.set(0.5, Math.random() * 6, 0.2);
    group.userData.propeller = null;
  }
  return group;
}

export function makeTorpedo() {
  const group = new THREE.Group();
  const body = part(
    new THREE.CapsuleGeometry(0.05, 0.22, 2, 6),
    new THREE.MeshLambertMaterial({ color: '#d5dde2', flatShading: true }),
  );
  body.rotation.z = Math.PI / 2;
  // Rund rød nese foran og korsformede finner bak, slik at man ser hvilken vei den går.
  const nose = part(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff5340' }), 0.15, 0, 0);
  const finMat = new THREE.MeshLambertMaterial({ color: '#5a6870' });
  group.add(
    body,
    nose,
    part(new THREE.BoxGeometry(0.06, 0.2, 0.02), finMat, -0.17, 0, 0),
    part(new THREE.BoxGeometry(0.06, 0.02, 0.2), finMat, -0.17, 0, 0),
  );
  group.scale.setScalar(1.9);
  return group;
}

// Lyskaster foran baugen: varmt lys som treffer bunnen under ubåten.
export function addHeadlight(sub) {
  const lamp = new THREE.PointLight('#ffe2a0', 2.4, 3.4, 1.4);
  lamp.position.set(0.3, -0.12, 0);
  sub.add(lamp);
  return lamp;
}

// Snur en modell slik at den peker i rutenettretningen (dx, dy).
export function setHeading(object, dx, dy) {
  if (dx === 0 && dy === 0) return;
  object.rotation.y = Math.atan2(-dy, dx);
}

export function disposeObject(object) {
  object.traverse((obj) => {
    obj.geometry?.dispose();
    for (const m of [].concat(obj.material ?? [])) m.dispose();
  });
  object.removeFromParent();
}
