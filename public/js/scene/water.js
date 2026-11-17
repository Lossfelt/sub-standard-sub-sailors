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
const MODE = { value: 1 };
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

  // Slår opp i nettet på hele piksler, så linjene flytter seg ett pikselsteg om gangen.
  float web(vec2 pixel) {
    return texture2D(uWeb, (floor(pixel) + 0.5) / ${WEB.toFixed(1)}).r;
  }

  float voronoiCaustic() {
    // Utzoomet tegnes nettet med grovere piksler, men mønsteret beholder samme størrelse.
    float step = ${WEB_DENSITY.toFixed(1)} / (uTexels * 2.0);
    vec2 pixel = floor(vCell * uTexels * 2.0) * step;
    vec2 a = pixel + floor(vec2(uTime * 2.1, uTime * 0.9));
    // Det andre laget er speilet og snudd, og glir en annen vei, så de ikke følger hverandre.
    vec2 b = vec2(pixel.y, -pixel.x) + floor(vec2(-uTime * 1.3, uTime * 1.7)) + 57.0;
    float light = web(a) * web(b);
    return light > 0.42 ? 1.0 : light > 0.16 ? 0.5 : 0.0;
  }

  void main() {
    float light;
    if (uMode > 0.5) {
      light = voronoiCaustic() * 0.85;
    } else {
      vec2 cell = floor(vCell * uTexels) / uTexels;
      light = caustic(cell * 1.9 - 250.0, uTime * 0.35 + 23.0);
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
      const edge = Math.max(0, 1 - (d2 - d1) / 9);
      const value = Math.round(edge * edge * 255);
      data.set([value, value, value, 255], (y * WEB + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, WEB, WEB);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
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
