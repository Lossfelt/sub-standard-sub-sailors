// Etterbehandling: scenen tegnes først til en lavoppløst flate, og legges så på skjermen med
// havdyp-bakgrunn, lysstråler ovenfra, vignett og ordnet dithering for pikselkunst-preg.
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uTime;
  varying vec2 vUv;

  // Kompakt 4x4 Bayer-matrise uten oppslagstabell.
  float bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2.0 + a.y * a.y * 0.75);
  }
  float bayer4(vec2 a) {
    return bayer2(0.5 * a) * 0.25 + bayer2(a);
  }

  void main() {
    vec4 scene = texture2D(tScene, vUv);

    // Bakgrunn: lysere blått oppe der lyset kommer fra, nesten svart nederst.
    float depth = distance(vUv, vec2(0.5, 1.1));
    vec3 background = mix(vec3(0.030, 0.110, 0.175), vec3(0.004, 0.012, 0.030), smoothstep(0.15, 1.15, depth));
    // Lag som legger lys til (kaustikk) kan gi dekning over 1, derfor klemmes den.
    vec3 color = scene.rgb + background * (1.0 - clamp(scene.a, 0.0, 1.0));

    // Skrå lysstråler som sakte vandrer, sterkest øverst.
    float x = vUv.x + (1.0 - vUv.y) * 0.35;
    float rays = (0.5 + 0.5 * sin(x * 21.0 + uTime * 0.22)) * (0.5 + 0.5 * sin(x * 8.0 - uTime * 0.15 + 1.3));
    rays = pow(rays, 3.0) * smoothstep(0.1, 1.0, vUv.y);
    color += vec3(0.07, 0.17, 0.22) * rays * 0.5;

    float vignette = smoothstep(0.95, 0.3, distance(vUv, vec2(0.5)));
    color *= mix(0.5, 1.0, vignette);

    // Fra lineært lys til skjermfarger, litt ekstra metning, og så få fargetrinn med dithering.
    color = pow(max(color, 0.0), vec3(1.0 / 2.2));
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.08);
    const float LEVELS = 26.0;
    color = floor(color * LEVELS + bayer4(gl_FragCoord.xy)) / LEVELS;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class PostProcess {
  constructor(renderer) {
    this.renderer = renderer;
    // Halvflyt gir jevne overganger i de mørke fargene. Eldre enheter uten støtte får vanlige 8 bit.
    const gl = renderer.getContext();
    const floatOk = gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float');
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: floatOk ? THREE.HalfFloatType : THREE.UnsignedByteType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.target.texture }, uTime: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.Camera();
  }

  setSize(width, height) {
    this.target.setSize(width, height);
  }

  render(scene, camera, time) {
    const { renderer } = this;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this.material.uniforms.uTime.value = time;
    renderer.render(this.scene, this.camera);
  }
}
