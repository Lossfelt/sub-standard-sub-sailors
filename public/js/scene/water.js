// Kaustikk: det bølgende lysmønsteret sollys lager på havbunnen. To Voronoi-nett glir forbi
// hverandre og lyser bare der de krysser. Lyset avrundes til fire trinn på faste lyspiksler, så
// det holder seg som pikselgrafikk. Et gjennomsiktig lag rett over flisene som legger lys til.
import * as THREE from 'three';

const WEB = 128; // Voronoi-bildet er WEB x WEB piksler
const WEB_DENSITY = 16; // nettpiksler per rute på nært hold

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
  uniform float uTexels; // lyspiksler per rute er det dobbelte av denne
  uniform float uStrength;
  uniform sampler2D uWeb;
  uniform float uSize;
  uniform sampler2D uPits; // 1 i ruter med grop, slik at lyset ikke legger seg flatt over dem
  varying vec2 vCell;

  // Nettet slås opp med myk utjevning, så det glir jevnt i stedet for å hoppe ett piksel om gangen.
  float web(vec2 pixel) {
    return texture2D(uWeb, pixel / ${WEB.toFixed(1)}).r;
  }

  void main() {
    // Ruten deles i faste lyspiksler. Utzoomet blir de grovere, men mønsteret beholder størrelsen.
    float step = ${WEB_DENSITY.toFixed(1)} / (uTexels * 2.0);
    vec2 pixel = (floor(vCell * uTexels * 2.0) + 0.5) * step;
    // Svak bølging i tillegg til glidningen, så nettet ikke flytter seg som en stiv plate.
    vec2 sway = vec2(sin(uTime * 0.9 + pixel.y * 0.09), cos(uTime * 0.7 + pixel.x * 0.08)) * 2.5;
    vec2 a = pixel + sway + vec2(uTime * 5.0, uTime * 2.2);
    // Det andre laget er snudd og glir en annen vei, så de ikke følger hverandre.
    vec2 b = vec2(pixel.y, -pixel.x) - sway + vec2(-uTime * 3.4, uTime * 4.1) + 57.0;
    // Fire lystrinn gir duse overganger, men holder flatene rene.
    float light = floor(web(a) * web(b) * 4.0 + 0.3) / 4.0;
    // Lyset når ikke ned i gropene, og dette laget ligger flatt over dem.
    light *= 1.0 - 0.9 * texture2D(uPits, vCell / uSize).r;
    gl_FragColor = vec4(vec3(0.55, 0.95, 1.0) * light * 0.3 * uStrength, 1.0);
  }
`;

// Sømløst Voronoi-nett: lyst langs grensene mellom cellene, mørkt inni dem.
function webTexture() {
  const points = Array.from({ length: 18 }, () => [Math.random() * WEB, Math.random() * WEB]);
  const data = new Uint8Array(WEB * WEB * 4);
  const wrap = (d) => Math.min(Math.abs(d), WEB - Math.abs(d));
  for (let y = 0; y < WEB; y++) {
    for (let x = 0; x < WEB; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of points) {
        const d = Math.hypot(wrap(x + 0.5 - px), wrap(y + 0.5 - py));
        if (d < d1) [d1, d2] = [d, d1];
        else if (d < d2) d2 = d;
      }
      // Bred, myk kant: lysest midt på grensen og gradvis mørkere inn i cellen.
      const edge = Math.max(0, 1 - (d2 - d1) / 16);
      const value = Math.round(edge ** 1.6 * 255);
      data.set([value, value, value, 255], (y * WEB + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, WEB, WEB);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Maske med én piksel per rute. Lagets v går motsatt vei av radene på brettet.
function pitMask(size, pitList) {
  const data = new Uint8Array(size * size * 4);
  for (const [x, y] of pitList) data.set([255, 255, 255, 255], ((size - 1 - y) * size + x) * 4);
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function makeCaustics(size, pitList = []) {
  const pits = pitMask(size, pitList);
  const web = webTexture();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: size }, uTexels: { value: 8 }, uStrength: { value: 0.42 }, uWeb: { value: web }, uPits: { value: pits },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.map = web; // ryddes bort sammen med brettet
  material.alphaMap = pits;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), material);
  mesh.position.y = 0.005;
  mesh.renderOrder = -1; // under alle markører
  // Er rutene små på skjermen, blir lysmønsteret grovere og svakere, ellers ser det ut som støy.
  const update = (time, cellPixels = 32) => {
    const { uTime, uTexels, uStrength } = material.uniforms;
    uTime.value = time;
    uTexels.value = cellPixels >= 24 ? 8 : cellPixels >= 14 ? 4 : 2;
    uStrength.value = cellPixels >= 14 ? 0.42 : 0.24;
  };
  return { mesh, update };
}
