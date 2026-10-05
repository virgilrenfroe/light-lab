import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const errEl = document.getElementById('err');
window.addEventListener('error', (e) => {
  errEl.style.display = 'block';
  errEl.textContent = e.message || String(e.error || e);
});
window.addEventListener('unhandledrejection', (e) => {
  errEl.style.display = 'block';
  errEl.textContent = String(e.reason);
});

const params = new URLSearchParams(location.search);
const coarseMql = matchMedia('(pointer: coarse)');
const narrowMql = matchMedia('(max-width: 900px)');
const reduceMql = matchMedia('(prefers-reduced-motion: reduce)');

function wantsSafe() {
  const flag = params.get('safe');
  if (flag === '1' || flag === 'true' || flag === '') return true;
  return coarseMql.matches || narrowMql.matches || innerWidth <= 900;
}
function wantsStill() {
  return reduceMql.matches || params.has('still');
}

const wall = document.documentElement.classList.contains('wall');
const floatEmbed = document.documentElement.classList.contains('embed') && !wall;
const stage = document.getElementById('stage');
const readout = document.getElementById('readout');
const rail = document.getElementById('thick-rail');
const modeSoap = document.getElementById('mode-soap');
const modeOil = document.getElementById('mode-oil');

// One WebGLRenderer for the page. The wet sheen reuses it.
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: floatEmbed,
  premultipliedAlpha: !floatEmbed,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
stage.appendChild(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x07060c, 0.045);

const HOOP_R = 0.7;
const FILM_R = 0.668;
const BENCH_TOP = 0.36;
const HOOP_Y = 1.18;
const T_MIN = 8;
const T_MAX = 980;

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
camera.position.set(0.92, 1.26, 2.48);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.02, HOOP_Y - 0.16, 0);
controls.minDistance = 1.45;
controls.maxDistance = 5.4;
controls.minPolarAngle = 0.62;
controls.maxPolarAngle = 1.42;
controls.minAzimuthAngle = -1.05;
controls.maxAzimuthAngle = 1.15;
controls.autoRotateSpeed = 0.22;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'sheen';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'film';

const FILMS = {
  soap: { name: 'Soap', n: 1.33 },
  oil: { name: 'Oil', n: 1.5 },
};
const WAVES = [445, 470, 495, 520, 545, 570, 600, 630, 660];

let thickTarget = 0.62;
const thick = { value: 0.62, vel: 0 };
let oil = false;
const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let sheenPass = null;
let outputPass = null;
let renderPass = null;
let envReady = false;
let lastSentence = '';

const faceNormal = new THREE.Vector3(0, 0, 1);
const viewDir = new THREE.Vector3();

function smoothstep(e0, e1, x) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function wavelengthRGB(nm) {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = (510 - nm) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = (645 - nm) / 65;
  } else {
    r = 1;
  }
  return {
    r: THREE.MathUtils.clamp(r, 0, 1),
    g: THREE.MathUtils.clamp(g, 0, 1),
    b: THREE.MathUtils.clamp(b, 0, 1),
  };
}
function cosTransmitted(cosI, n) {
  const sinI2 = Math.max(0, 1 - cosI * cosI);
  const sinT2 = sinI2 / (n * n);
  return Math.sqrt(Math.max(0, 1 - sinT2));
}
function opticalPath(tNm, n, cosI) {
  return 2 * n * tNm * cosTransmitted(cosI, n);
}
function bandIntensity(deltaNm, lambda) {
  const s = Math.sin(Math.PI * deltaNm / lambda);
  return s * s;
}
function reflectRGB(tNm, n, cosI) {
  const waves = pathState.safe ? [460, 530, 590, 650] : WAVES;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const lambda of waves) {
    const gain = bandIntensity(opticalPath(tNm, n, cosI), lambda);
    const rgb = wavelengthRGB(lambda);
    r += rgb.r * gain;
    g += rgb.g * gain;
    b += rgb.b * gain;
  }
  const scale = 1.7 / waves.length;
  return { r: r * scale, g: g * scale, b: b * scale };
}
function thicknessAt(yLocal, tBottom) {
  const g = THREE.MathUtils.clamp((FILM_R - yLocal) / (2 * FILM_R), 0, 1);
  let shaped = smoothstep(0.08, 1, g);
  shaped *= shaped;
  return tBottom * shaped;
}
function colorName(rgb) {
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 0.16) return '';
  if (min > 0.34 && max - min < 0.18) return 'pale';
  if (b >= r && b >= g) return 'blue';
  if (g >= r && g >= b) return r > 0.55 ? 'yellow' : 'green';
  return g > 0.42 ? 'yellow' : 'red';
}

const filmUniforms = {
  uBulge: { value: 0.105 },
  uRadius: { value: FILM_R },
  uTime: { value: 0 },
  uStill: { value: pathState.still ? 1 : 0 },
  uN: { value: FILMS.soap.n },
  uTBottom: { value: 400 },
  uCoarse: { value: pathState.safe ? 1 : 0 },
};

const filmVertex = /* glsl */ `
  uniform float uBulge;
  uniform float uRadius;
  uniform float uTime;
  uniform float uStill;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vLocal;

  void main() {
    vec2 xy = position.xy;
    float r2 = dot(xy, xy);
    float R2 = uRadius * uRadius;
    float edge = clamp(1.0 - r2 / R2, 0.0, 1.0);
    float breathe = (1.0 - uStill) * sin(uTime * 0.85 + xy.x * 3.1 + xy.y * 2.4) * 0.011 * edge;
    float z = uBulge * edge + breathe;
    vec4 world = modelMatrix * vec4(xy, z, 1.0);
    float slope = (2.0 * uBulge) / max(R2, 0.0001);
    vec3 nLocal = normalize(vec3(xy * slope, 1.0));
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * nLocal);
    vLocal = xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const filmFragment = /* glsl */ `
  uniform float uN;
  uniform float uTBottom;
  uniform float uTime;
  uniform float uStill;
  uniform float uRadius;
  uniform float uCoarse;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vLocal;

  vec3 waveRGB(float nm) {
    float r = 0.0;
    float g = 0.0;
    float b = 0.0;
    if (nm < 490.0) {
      g = (nm - 440.0) / 50.0;
      b = 1.0;
    } else if (nm < 510.0) {
      g = 1.0;
      b = (510.0 - nm) / 20.0;
    } else if (nm < 580.0) {
      r = (nm - 510.0) / 70.0;
      g = 1.0;
    } else if (nm < 645.0) {
      r = 1.0;
      g = (645.0 - nm) / 65.0;
    } else {
      r = 1.0;
    }
    return clamp(vec3(r, g, b), 0.0, 1.0);
  }

  float band(float deltaNm, float lambda) {
    float s = sin(3.14159265 * deltaNm / lambda);
    return s * s;
  }

    vec3 spectrum(float deltaNm) {
      vec3 sum = vec3(0.0);
      float w = 0.0;
      if (uCoarse > 0.5) {
        sum += waveRGB(460.0) * band(deltaNm, 460.0); w += 1.0;
        sum += waveRGB(530.0) * band(deltaNm, 530.0); w += 1.0;
        sum += waveRGB(590.0) * band(deltaNm, 590.0); w += 1.0;
        sum += waveRGB(650.0) * band(deltaNm, 650.0); w += 1.0;
      } else {
        sum += waveRGB(445.0) * band(deltaNm, 445.0); w += 1.0;
        sum += waveRGB(470.0) * band(deltaNm, 470.0); w += 1.0;
        sum += waveRGB(495.0) * band(deltaNm, 495.0); w += 1.0;
        sum += waveRGB(520.0) * band(deltaNm, 520.0); w += 1.0;
        sum += waveRGB(545.0) * band(deltaNm, 545.0); w += 1.0;
        sum += waveRGB(570.0) * band(deltaNm, 570.0); w += 1.0;
        sum += waveRGB(600.0) * band(deltaNm, 600.0); w += 1.0;
        sum += waveRGB(630.0) * band(deltaNm, 630.0); w += 1.0;
        sum += waveRGB(660.0) * band(deltaNm, 660.0); w += 1.0;
      }
      return sum * (1.7 / w);
    }

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    float cosI = clamp(dot(N, V), 0.035, 1.0);
    float sinT2 = (1.0 - cosI * cosI) / (uN * uN);
    float cosT = sqrt(max(0.0, 1.0 - sinT2));

    float g = clamp((uRadius - vLocal.y) / (2.0 * uRadius), 0.0, 1.0);
    float shaped = smoothstep(0.08, 1.0, g);
    shaped = shaped * shaped;
    float flow = uTime * (1.0 - uStill);
    float ripple = sin(vLocal.y * 15.0 - flow * 0.55) * 0.022;
    ripple += sin(vLocal.x * 7.5 + vLocal.y * 3.0 - flow * 0.2) * 0.012;
    ripple *= smoothstep(0.14, 0.48, g);
    float tNm = max(0.0, uTBottom * (shaped + ripple));
    float deltaNm = 2.0 * uN * tNm * cosT;
    vec3 irid = spectrum(deltaNm);
    float luma = dot(irid, vec3(0.2126, 0.7152, 0.0722));
    irid = mix(vec3(luma), irid, 1.28);

    vec3 L = normalize(vec3(-0.62, 0.48, 0.78));
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 110.0);
    float rim = pow(1.0 - cosI, 5.0);
    vec3 col = irid;
    col += vec3(1.0, 0.96, 0.9) * spec * 0.2;
    col += vec3(0.72, 0.64, 0.5) * rim * 0.12;
    col += vec3(0.01, 0.009, 0.012);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const filmMat = new THREE.ShaderMaterial({
  uniforms: filmUniforms,
  vertexShader: filmVertex,
  fragmentShader: filmFragment,
  side: THREE.DoubleSide,
  toneMapped: true,
});

const brass = new THREE.MeshStandardMaterial({
  color: 0x8a6a3a,
  roughness: 0.32,
  metalness: 0.82,
});
const stone = new THREE.MeshStandardMaterial({
  color: 0x100e14,
  roughness: 0.86,
  metalness: 0.05,
});

const room = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 5.2, 9.2),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 }),
);
room.position.set(0.1, 1.7, -0.2);
scene.add(room);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), stone);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(3.4, 0.12, 2.4),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.72, metalness: 0.08 }),
);
bench.position.set(0, BENCH_TOP - 0.06, 0);
bench.receiveShadow = true;
bench.castShadow = true;
scene.add(bench);

const rig = new THREE.Group();
rig.position.set(0, HOOP_Y, 0);
scene.add(rig);

const hoop = new THREE.Mesh(new THREE.TorusGeometry(HOOP_R, 0.034, 18, 72), brass);
hoop.castShadow = true;
rig.add(hoop);

const film = new THREE.Mesh(new THREE.CircleGeometry(FILM_R, 96), filmMat);
film.frustumCulled = false;
rig.add(film);

const contactY = HOOP_Y - HOOP_R;
const postH = Math.max(0.08, contactY - BENCH_TOP + 0.02);
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, postH, 14), brass);
post.position.set(0, BENCH_TOP + postH / 2 - 0.01, 0);
post.castShadow = true;
scene.add(post);

const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.028, 24), brass);
foot.position.set(0, BENCH_TOP + 0.014, 0);
foot.castShadow = true;
foot.receiveShadow = true;
scene.add(foot);

const collar = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), brass);
collar.position.set(0, contactY + 0.01, 0);
collar.scale.y = 0.72;
scene.add(collar);

const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false });
lampMat.color.multiplyScalar(2.4);
const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), lampMat);
lamp.position.set(-1.22, HOOP_Y + 0.22, 0.72);
scene.add(lamp);
const lampCup = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI), brass);
lampCup.position.copy(lamp.position);
lampCup.rotation.y = 0.9;
lampCup.rotation.z = 0.4;
scene.add(lampCup);
const lampPostH = lamp.position.y - BENCH_TOP;
const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, lampPostH, 10), brass);
lampPost.position.set(lamp.position.x, BENCH_TOP + lampPostH / 2, lamp.position.z);
scene.add(lampPost);

const hemi = new THREE.HemisphereLight(0x6a5c4e, 0x100e14, 0.28);
scene.add(hemi);
const fill = new THREE.AmbientLight(0x2a241e, 0.02);
scene.add(fill);
const key = new THREE.SpotLight(0xfff3e4, 18, 8, 0.55, 0.45, 1.1);
key.position.copy(lamp.position);
key.target.position.set(0, HOOP_Y, 0);
key.castShadow = true;
key.shadow.bias = -0.0006;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
scene.add(key.target);
const rim = new THREE.PointLight(0xffe6c4, 1.1, 8, 2);
rim.position.set(1.2, 2.05, 1.35);
scene.add(rim);
const spill = new THREE.PointLight(0xfff1dc, 0.2, 2.8, 2);
spill.position.set(0, HOOP_Y, 0.28);
scene.add(spill);

const SheenShader = {
  name: 'LightLabFilmSheen',
  uniforms: {
    tDiffuse: { value: null },
    uGain: { value: 0.7 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uGain;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 glow = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0472;
        vec2 offset = vec2(cos(a), sin(a)) * 0.0028;
        vec3 tapColor = texture2D(tDiffuse, vUv + offset).rgb;
        float lum = dot(tapColor, vec3(0.2126, 0.7152, 0.0722));
        glow += tapColor * smoothstep(0.28, 0.95, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.055 * uGain), base.a);
    }
  `,
};

function tBottomOf(value) {
  return THREE.MathUtils.lerp(T_MIN, T_MAX, THREE.MathUtils.clamp(value, 0, 1));
}

function viewSample() {
  viewDir.copy(camera.position).sub(controls.target);
  const distance = viewDir.length() || 1;
  viewDir.multiplyScalar(1 / distance);
  const cosI = THREE.MathUtils.clamp(Math.abs(viewDir.dot(faceNormal)), 0.035, 1);
  const angleDeg = Math.acos(cosI) * 180 / Math.PI;
  return { cosI, angleDeg };
}

function describe(filmKind, tBottom, angleDeg, cosI) {
  const head = `${filmKind.name}. Index ${filmKind.n.toFixed(2)}. Thickest point ${Math.round(tBottom)} nm. View ${Math.round(angleDeg)}° from straight on.`;
  if (tBottom < 48) {
    return `${head} The film is almost no thickness. The two reflections cancel for every color. The film looks dark.`;
  }
  const bottom = reflectRGB(thicknessAt(-FILM_R * 0.9, tBottom), filmKind.n, cosI);
  const top = reflectRGB(thicknessAt(FILM_R * 0.72, tBottom), filmKind.n, cosI);
  const bottomName = colorName(bottom);
  const topName = colorName(top);
  let sentence = head;
  if (!topName) sentence += ' The thin top cancels every color and looks dark.';
  if (bottomName) sentence += ` At the thick bottom, ${bottomName} lines up.`;
  else sentence += ' Even the bottom is too thin for a strong color.';
  if (filmKind === FILMS.oil) sentence += ' Oil has a higher index, so the bands sit closer together.';
  if (angleDeg > 42) sentence += ' This steep view acts like a thinner film.';
  return sentence;
}

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'sheen';
  document.documentElement.dataset.composer = composer ? '1' : '0';
  document.documentElement.dataset.rendererCount = '1';
}

function ensureEnv() {
  if (envReady || pathState.safe) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  envReady = true;
}

function ensureComposer() {
  if (composer || pathState.safe) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  if (floatEmbed) {
    renderPass.clearColor = new THREE.Color(0x000000);
    renderPass.clearAlpha = 0;
  }
  sheenPass = new ShaderPass(SheenShader);
  outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(sheenPass);
  composer.addPass(outputPass);
  sizeComposer();
}

function sizeComposer() {
  if (!composer) return;
  const pr = renderer.getPixelRatio();
  const w = Math.max(1, Math.floor(innerWidth * pr));
  const h = Math.max(1, Math.floor(innerHeight * pr));
  composer.setPixelRatio(1);
  composer.setSize(w, h);
}

function destroyComposer() {
  if (!composer) return;
  for (const pass of [...composer.passes]) {
    if (pass.dispose) pass.dispose();
  }
  composer.dispose();
  composer = null;
  sheenPass = null;
  outputPass = null;
  renderPass = null;
}

function applyBudget() {
  const safe = pathState.safe;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, safe ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  key.shadow.mapSize.set(safe ? 512 : 1024, safe ? 512 : 1024);
  hemi.intensity = safe ? 0.62 : 0.28;
  fill.intensity = safe ? 0.38 : 0.02;
  if (hoop.geometry) hoop.geometry.dispose();
  hoop.geometry = new THREE.TorusGeometry(HOOP_R, 0.034, safe ? 10 : 18, safe ? 36 : 72);
  if (film.geometry) film.geometry.dispose();
  film.geometry = new THREE.CircleGeometry(FILM_R, safe ? 40 : 96);
  filmUniforms.uCoarse.value = safe ? 1 : 0;
  if (safe) destroyComposer();
  else ensureComposer();
  if (!safe) ensureEnv();
  syncFilm(true);
  if (!safe && composer) sizeComposer();
  publishPath();
  const horizontal = rail.getBoundingClientRect().width > rail.getBoundingClientRect().height;
  rail.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
}

function filmKind() {
  return oil ? FILMS.oil : FILMS.soap;
}

function syncFilm(forceReadout) {
  const kind = filmKind();
  const bottom = tBottomOf(thick.value);
  const { cosI, angleDeg } = viewSample();
  const pull = pathState.still ? 0 : Math.min(1, Math.abs(thick.vel) * 2.2);
  filmUniforms.uN.value = kind.n;
  filmUniforms.uTBottom.value = bottom;
  filmUniforms.uBulge.value = 0.1 + pull * 0.07;
  filmUniforms.uStill.value = pathState.still ? 1 : 0;
  filmUniforms.uTime.value = elapsed;
  const bottomRgb = reflectRGB(thicknessAt(-FILM_R * 0.86, bottom), kind.n, cosI);
  const peak = Math.max(bottomRgb.r, bottomRgb.g, bottomRgb.b, 0.001);
  spill.color.setRGB(bottomRgb.r / peak, bottomRgb.g / peak, bottomRgb.b / peak);
  spill.intensity = Math.min(1.5, peak * (pathState.safe ? 0.35 : 0.85));
  const sentence = describe(kind, bottom, angleDeg, cosI);
  if (forceReadout || sentence !== lastSentence) {
    lastSentence = sentence;
    readout.textContent = sentence;
    rail.setAttribute('aria-valuetext', sentence);
  }
  rail.style.setProperty('--t', thickTarget.toFixed(4));
  rail.setAttribute('aria-valuenow', String(Math.round(thickTarget * 100)));
  modeSoap.setAttribute('aria-pressed', oil ? 'false' : 'true');
  modeOil.setAttribute('aria-pressed', oil ? 'true' : 'false');
  document.documentElement.dataset.film = oil ? 'oil' : 'soap';
  document.documentElement.dataset.thickness = bottom.toFixed(1);
  document.documentElement.dataset.angle = angleDeg.toFixed(1);
  document.documentElement.dataset.index = kind.n.toFixed(2);
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
  if (pathState.still) {
    thick.value = thickTarget;
    thick.vel = 0;
  }
  syncFilm(true);
}

function resize() {
  pathState.safe = wantsSafe();
  applyBudget();
  syncMotion();
}

function setThickFromEvent(event) {
  const rect = rail.getBoundingClientRect();
  const horizontal = rect.width > rect.height;
  const t = horizontal
    ? (event.clientX - rect.left) / rect.width
    : 1 - (event.clientY - rect.top) / rect.height;
  thickTarget = THREE.MathUtils.clamp(t, 0, 1);
  if (pathState.still) {
    thick.value = thickTarget;
    thick.vel = 0;
  }
  syncFilm(true);
}

rail.addEventListener('pointerdown', (event) => {
  rail.setPointerCapture(event.pointerId);
  setThickFromEvent(event);
});
rail.addEventListener('pointermove', (event) => {
  if (!rail.hasPointerCapture(event.pointerId)) return;
  setThickFromEvent(event);
});
rail.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.08 : 0.04;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    thickTarget = Math.min(1, thickTarget + step);
    if (pathState.still) thick.value = thickTarget;
    syncFilm(true);
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    thickTarget = Math.max(0, thickTarget - step);
    if (pathState.still) thick.value = thickTarget;
    syncFilm(true);
    event.preventDefault();
    event.stopPropagation();
  }
});

modeSoap.addEventListener('click', () => {
  oil = false;
  syncFilm(true);
});
modeOil.addEventListener('click', () => {
  oil = true;
  syncFilm(true);
});

addEventListener('keydown', (event) => {
  if (event.target === rail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 's' || event.key === 'S') {
    oil = false;
    syncFilm(true);
  } else if (event.key === 'o' || event.key === 'O') {
    oil = true;
    syncFilm(true);
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    thickTarget = Math.min(1, thickTarget + 0.04);
    if (pathState.still) thick.value = thickTarget;
    syncFilm(true);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    thickTarget = Math.max(0, thickTarget - 0.04);
    if (pathState.still) thick.value = thickTarget;
    syncFilm(true);
  }
});

function stepThick(dt) {
  if (pathState.still) {
    thick.value = thickTarget;
    thick.vel = 0;
    return;
  }
  const acc = (thickTarget - thick.value) * 36 - thick.vel * 10.5;
  thick.vel += acc * dt;
  thick.value += thick.vel * dt;
}

applyBudget();
syncMotion();

addEventListener('resize', resize);
coarseMql.addEventListener?.('change', resize);
narrowMql.addEventListener?.('change', resize);
reduceMql.addEventListener?.('change', syncMotion);
controls.addEventListener('start', () => { controls.autoRotate = false; });
controls.addEventListener('end', () => { controls.autoRotate = !pathState.still; });

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (!pathState.still) elapsed += dt;
  stepThick(dt);
  controls.update();
  syncFilm(false);
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
