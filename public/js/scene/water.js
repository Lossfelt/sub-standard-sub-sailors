// Kaustikk: det bølgende lysmønsteret sollys lager på havbunnen. Et gjennomsiktig lag rett over
// flisene som legger lys til, regnet ut i grove ruter slik at mønsteret også blir pikselert.
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec2 vCell;
  uniform float uSize;
  void main() {
    vCell = uv * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vCell;
  const float TEXELS = 8.0; // lyspiksler per rute

  // Kjent, billig kaustikkmønster: noen runder med sammenflettede sinusbølger.
  float caustic(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    const float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - 3.5 / float(n + 1));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c = 1.17 - pow(c / 4.0, 1.4);
    return pow(abs(c), 8.0);
  }

  void main() {
    vec2 cell = floor(vCell * TEXELS) / TEXELS;
    float light = caustic(cell * 1.9 - 250.0, uTime * 0.35 + 23.0);
    gl_FragColor = vec4(vec3(0.55, 0.95, 1.0) * light * 0.42, 1.0);
  }
`;

export function makeCaustics(size) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: size } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), material);
  mesh.position.y = 0.005;
  mesh.renderOrder = -1; // under alle markører
  return { mesh, update: (time) => { material.uniforms.uTime.value = time; } };
}
