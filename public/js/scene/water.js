// Kaustikk: det bølgende lysmønsteret sollys lager på havbunnen. Et gjennomsiktig lag rett over
// flisene som legger lys til, regnet ut i grove ruter slik at mønsteret også blir pikselert.
//
// To utgaver mens vi sammenligner (midlertidig):
//  0: matematisk mønster av sammenflettede sinusbølger, med myke overganger.
//  1: to Voronoi-nett som glir forbi hverandre og bare lyser der de krysser, avrundet til to
//     lystrinn slik at det blir rene pikselflekker.
import * as THREE from 'three';

const WEB = 128; // Voronoi-bildet er WEB x WEB piksler
const WEB_DENSITY = 16; // nettpiksler per rute på nært hold

// Felles bryter for alle brett, slik at knappen virker også etter nytt spill.
const MODE = { value: 0 };
export function toggleCausticsStyle() {
  MODE.value = 1 - MODE.value;
  return MODE.value;
}

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
  uniform float uTexels; // lyspiksler per rute
  uniform float uStrength;
  uniform float uMode;
  uniform sampler2D uWeb;
  varying vec2 vCell;

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

  // Nettet slås opp med myk utjevning, så det glir jevnt i stedet for å hoppe ett piksel om gangen.
  float web(vec2 pixel) {
    return texture2D(uWeb, pixel / ${WEB.toFixed(1)}).r;
  }

  float voronoiCaustic() {
    // Ruten deles i faste lyspiksler. Utzoomet blir de grovere, men mønsteret beholder størrelsen.
    float step = ${WEB_DENSITY.toFixed(1)} / (uTexels * 2.0);
    vec2 pixel = (floor(vCell * uTexels * 2.0) + 0.5) * step;
    // Svak bølging i tillegg til glidningen, så nettet ikke flytter seg som en stiv plate.
    vec2 sway = vec2(sin(uTime * 0.9 + pixel.y * 0.09), cos(uTime * 0.7 + pixel.x * 0.08)) * 2.5;
    vec2 a = pixel + sway + vec2(uTime * 5.0, uTime * 2.2);
    // Det andre laget er snudd og glir en annen vei, så de ikke følger hverandre.
    vec2 b = vec2(pixel.y, -pixel.x) - sway + vec2(-uTime * 3.4, uTime * 4.1) + 57.0;
    // Fire lystrinn gir duse overganger, men holder flatene rene.
    return floor(web(a) * web(b) * 4.0 + 0.3) / 4.0;
  }

  void main() {
    float light;
    if (uMode > 0.5) {
      light = voronoiCaustic() * 0.45;
    } else {
      vec2 cell = floor(vCell * uTexels) / uTexels;
      // Ett mønster alene gjentar seg med få ruters mellomrom. To mønstre i ulik skala, det ene
      // dreid en skjev vinkel, gjentar seg nesten aldri likt. En langsom, stor bølge gjør i
      // tillegg at noen deler av brettet er lysere enn andre.
      vec2 turned = mat2(0.80, -0.60, 0.60, 0.80) * cell;
      float first = caustic(cell * 1.9 - 250.0, uTime * 0.35 + 23.0);
      float second = caustic(turned * 1.37 + 91.0, uTime * 0.29 + 7.0);
      float swell = 0.65 + 0.35 * sin(cell.x * 0.31 + uTime * 0.11) * sin(cell.y * 0.23 - uTime * 0.08 + 1.7);
      light = max(first, second) * swell;
    }
    gl_FragColor = vec4(vec3(0.55, 0.95, 1.0) * light * uStrength, 1.0);
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

export function makeCaustics(size) {
  const web = webTexture();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: size }, uTexels: { value: 8 }, uStrength: { value: 0.42 },
      uMode: MODE, uWeb: { value: web },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.map = web; // ryddes bort sammen med brettet
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
