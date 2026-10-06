import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
const surfaceButtons = [...document.querySelectorAll('[data-surface]')];
const lampButtons = [...document.querySelectorAll('[data-lamp]')];

const NM = [420, 445, 470, 495, 520, 545, 570, 595, 620, 645, 670, 695];
const BANDS = NM.length;

function wavelengthRGB(nm) {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else {
    r = 1;
  }
  let factor = 1;
  if (nm < 420) factor = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 700) factor = 0.3 + 0.7 * (780 - nm) / 80;
  return [r * factor, g * factor, b * factor];
}

const HUE = NM.map((nm) => wavelengthRGB(nm));

const SURFACES = [
  {
    id: 'leaf',
    refl: [0.08, 0.05, 0.07, 0.18, 0.36, 0.50, 0.30, 0.13, 0.07, 0.05, 0.05, 0.12],
  },
  {
    id: 'white',
    refl: [0.90, 0.91, 0.92, 0.93, 0.93, 0.93, 0.93, 0.92, 0.92, 0.91, 0.90, 0.90],
  },
  {
    id: 'black',
    refl: [0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045],
  },
  {
    id: 'red',
    refl: [0.05, 0.04, 0.04, 0.045, 0.05, 0.07, 0.16, 0.48, 0.80, 0.90, 0.92, 0.90],
  },
  {
    id: 'yellow',
    refl: [0.05, 0.05, 0.06, 0.14, 0.62, 0.86, 0.92, 0.93, 0.91, 0.89, 0.87, 0.85],
  },
  {
    id: 'blue',
    refl: [0.55, 0.72, 0.62, 0.30, 0.10, 0.06, 0.05, 0.045, 0.04, 0.04, 0.04, 0.04],
  },
];

const LAMPS = [
  { id: 'white', illum: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { id: 'red', illum: [0.02, 0.02, 0.02, 0.025, 0.04, 0.07, 0.18, 0.50, 0.84, 0.95, 0.97, 0.96] },
  { id: 'green', illum: [0.03, 0.04, 0.10, 0.42, 0.82, 0.94, 0.50, 0.14, 0.04, 0.025, 0.02, 0.02] },
  { id: 'blue', illum: [0.90, 0.96, 0.70, 0.26, 0.07, 0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02] },
];

const LINES = {
  'leaf|white': 'White light on a leaf. The leaf absorbs most of the red and the blue. Green comes back, so the leaf looks green.',
  'leaf|red': 'Red light on a leaf. The beam is mostly red, and the leaf absorbs red. Little light comes back, so the leaf looks dark.',
  'leaf|green': 'Green light on a leaf. The leaf reflects green, and green is what the lamp is sending. Green comes back, so the leaf looks green.',
  'leaf|blue': 'Blue light on a leaf. The beam is mostly blue, and the leaf absorbs blue. Little light comes back, so the leaf looks dark.',
  'white|white': 'White light on white paper. The paper reflects almost every wavelength. The mix that comes back is white.',
  'white|red': 'Red light on white paper. The paper reflects almost every wavelength that arrives. Mostly red arrives, so the paper looks red.',
  'white|green': 'Green light on white paper. The paper reflects almost every wavelength that arrives. Mostly green arrives, so the paper looks green.',
  'white|blue': 'Blue light on white paper. The paper reflects almost every wavelength that arrives. Mostly blue arrives, so the paper looks blue.',
  'black|white': 'White light on a black surface. The surface absorbs almost every wavelength. Almost nothing comes back, so it looks black.',
  'black|red': 'Red light on a black surface. The surface absorbs almost every wavelength, including this red. Almost nothing comes back.',
  'black|green': 'Green light on a black surface. The surface absorbs almost every wavelength, including this green. Almost nothing comes back.',
  'black|blue': 'Blue light on a black surface. The surface absorbs almost every wavelength, including this blue. Almost nothing comes back.',
  'red|white': 'White light on red paint. The paint absorbs green and blue and reflects red. Red comes back, so the paint looks red.',
  'red|red': 'Red light on red paint. The paint reflects red. Red was in the beam, so red comes back and the paint looks red.',
  'red|green': 'Green light on red paint. The paint absorbs green. Little light comes back, so the paint looks dark.',
  'red|blue': 'Blue light on red paint. The paint absorbs blue. Little light comes back, so the paint looks dark.',
  'yellow|white': 'White light on yellow paint. The paint absorbs blue and reflects red and green. That mix looks yellow.',
  'yellow|red': 'Red light on yellow paint. Yellow paint reflects red. Red comes back, so the paint looks red.',
  'yellow|green': 'Green light on yellow paint. Yellow paint reflects green. Green comes back, so the paint looks green.',
  'yellow|blue': 'Blue light on yellow paint. Yellow paint absorbs blue. Little light comes back, so the paint looks dark.',
  'blue|white': 'White light on blue paint. The paint absorbs red and green and reflects blue. Blue comes back, so the paint looks blue.',
  'blue|red': 'Red light on blue paint. The paint absorbs red. Little light comes back, so the paint looks dark.',
  'blue|green': 'Green light on blue paint. The paint absorbs green. Little light comes back, so the paint looks dark.',
  'blue|blue': 'Blue light on blue paint. The paint reflects blue. Blue was in the beam, so blue comes back and the paint looks blue.',
};

function integrate(illum, refl) {
  const acc = [0, 0, 0];
  for (let i = 0; i < BANDS; i += 1) {
    const weight = illum[i] * refl[i];
    acc[0] += HUE[i][0] * weight;
    acc[1] += HUE[i][1] * weight;
    acc[2] += HUE[i][2] * weight;
  }
  return acc;
}

const ONES = Array(BANDS).fill(1);
const WHITE_POINT = integrate(ONES, ONES);

function returned(illum, refl) {
  const acc = integrate(illum, refl);
  return acc.map((value, i) => value / WHITE_POINT[i]);
}

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
renderer.toneMappingExposure = 1.12;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.Fog(0x07060c, 7.5, 16);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
camera.position.set(0.2, 1.05, 2.85);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.12, 0.62, 0.12);
controls.minDistance = 1.85;
controls.maxDistance = 4.8;
controls.minPolarAngle = 0.85;
controls.maxPolarAngle = 1.42;
controls.minAzimuthAngle = -0.7;
controls.maxAzimuthAngle = 0.55;
controls.autoRotateSpeed = 0.12;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'absorb';

const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let liftPass = null;
let renderPass = null;
let framed = false;

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.34, metalness: 0.82 });
const iron = new THREE.MeshStandardMaterial({ color: 0x221e1a, roughness: 0.42, metalness: 0.74 });
const wood = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.78, metalness: 0.04 });
const woodLight = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.7, metalness: 0.05 });
const stageMat = new THREE.MeshStandardMaterial({ color: 0x100e0c, roughness: 0.94, metalness: 0.02 });

const hueData = new Uint8Array(BANDS * 4);
for (let i = 0; i < BANDS; i += 1) {
  hueData[i * 4] = Math.round(HUE[i][0] * 255);
  hueData[i * 4 + 1] = Math.round(HUE[i][1] * 255);
  hueData[i * 4 + 2] = Math.round(HUE[i][2] * 255);
  hueData[i * 4 + 3] = 255;
}
const hueTex = new THREE.DataTexture(hueData, BANDS, 1);
hueTex.magFilter = THREE.NearestFilter;
hueTex.minFilter = THREE.NearestFilter;
hueTex.wrapS = THREE.ClampToEdgeWrapping;
hueTex.wrapT = THREE.ClampToEdgeWrapping;
hueTex.colorSpace = THREE.NoColorSpace;
hueTex.needsUpdate = true;

const ampData = new Uint8Array(BANDS * 4);
const ampTex = new THREE.DataTexture(ampData, BANDS, 1);
ampTex.magFilter = THREE.NearestFilter;
ampTex.minFilter = THREE.NearestFilter;
ampTex.wrapS = THREE.ClampToEdgeWrapping;
ampTex.wrapT = THREE.ClampToEdgeWrapping;
ampTex.colorSpace = THREE.NoColorSpace;
ampTex.needsUpdate = true;

function spring() {
  return { v: 0, vel: 0, target: 0 };
}

const bandRefl = Array.from({ length: BANDS }, () => spring());
const bandInc = Array.from({ length: BANDS }, () => spring());
const colorState = [spring(), spring(), spring()];
const leafState = spring();
let surfaceIndex = 0;
let lampIndex = 0;

scene.add(new THREE.HemisphereLight(0x3a342e, 0x0a0908, 0.38));
const fill = new THREE.DirectionalLight(0xfff0dc, 0.12);
fill.position.set(-1.6, 2.4, 2.2);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), stageMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.72;
scene.add(floor);

const wallPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 4.2),
  new THREE.MeshStandardMaterial({ color: 0x100e0c, roughness: 0.96 }),
);
wallPlane.position.set(0, 1.35, -1.55);
scene.add(wallPlane);

const table = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.09, 1.85), wood);
table.position.set(0.08, -0.045, 0.18);
scene.add(table);

const BOARD_W = 0.9;
const BOARD_H = 1.16;
const easel = new THREE.Group();
easel.position.set(0.2, 0, -0.06);
easel.rotation.y = -0.2;
scene.add(easel);

const boardUniforms = {
  uColor: { value: new THREE.Color(0.12, 0.28, 0.08) },
  uLeaf: { value: 1 },
};
const boardMat = new THREE.ShaderMaterial({
  uniforms: boardUniforms,
  vertexShader: `
    uniform float uLeaf;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 pos = position;
      pos.z += sin(uv.y * 3.14159) * 0.035 * uLeaf;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uLeaf;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 p = vUv - vec2(0.5, 0.46);
      float y = p.y;
      float width = 0.33 * sin(clamp((y + 0.36) / 0.78, 0.0, 1.0) * 3.14159);
      width *= smoothstep(0.48, 0.30, y);
      float leaf = 1.0 - smoothstep(max(width - 0.01, 0.0), width + 0.012, abs(p.x));
      leaf *= smoothstep(-0.40, -0.33, y);
      float stem = smoothstep(0.014, 0.0, abs(p.x)) * smoothstep(-0.02, -0.1, y) * smoothstep(-0.52, -0.3, y);
      float mask = clamp(max(leaf, stem), 0.0, 1.0);

      float mid = smoothstep(0.02, 0.003, abs(p.x)) * smoothstep(0.34, 0.02, y) * smoothstep(-0.28, -0.08, y);
      float side = 0.0;
      vec2 a = p - vec2(0.0, 0.02);
      side = max(side, smoothstep(0.014, 0.003, abs(a.y - a.x * 0.55)) * smoothstep(0.02, 0.08, abs(a.x)) * smoothstep(0.28, 0.16, abs(a.x)));
      vec2 b = p - vec2(0.0, -0.06);
      side = max(side, smoothstep(0.014, 0.003, abs(b.y - b.x * 0.42)) * smoothstep(0.02, 0.08, abs(b.x)) * smoothstep(0.26, 0.14, abs(b.x)));
      vec2 c = p - vec2(0.0, -0.14);
      side = max(side, smoothstep(0.012, 0.003, abs(c.y - c.x * 0.32)) * smoothstep(0.02, 0.07, abs(c.x)) * smoothstep(0.22, 0.12, abs(c.x)));
      float veins = clamp(max(mid, side), 0.0, 1.0);

      float n = hash(vUv * vec2(420.0, 360.0));
      float tooth = 0.93 + 0.09 * n;
      float brush = 0.94 + 0.07 * sin(vUv.y * 86.0 + vUv.x * 6.0);
      vec3 surface = uColor * tooth * mix(brush, 1.0, uLeaf);
      float rim = smoothstep(0.08, 0.0, width - abs(p.x));
      surface *= mix(1.0, 0.76, rim * leaf);
      surface *= mix(1.0, 0.68, veins);

      vec2 q = vUv - 0.5;
      float inset = smoothstep(0.5, 0.42, max(abs(q.x), abs(q.y) * 0.92));
      surface *= mix(0.78, 1.0, inset);

      vec3 backing = vec3(0.16, 0.09, 0.055);
      vec3 leafFace = mix(backing, surface, mask);
      vec3 col = mix(surface, leafFace, smoothstep(0.12, 0.88, uLeaf));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H, 1, 12), boardMat);
board.position.set(0, 0.9, 0.02);
board.rotation.x = -0.06;
easel.add(board);

const frameT = 0.05;
const frameD = 0.04;
function addBar(w, h, d, x, y, z) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodLight);
  bar.position.set(x, y, z);
  easel.add(bar);
}
addBar(BOARD_W + frameT * 2, frameT, frameD, 0, 0.9 + BOARD_H / 2 + frameT / 2, 0);
addBar(BOARD_W + frameT * 2, frameT, frameD, 0, 0.9 - BOARD_H / 2 - frameT / 2, 0);
addBar(frameT, BOARD_H, frameD, -BOARD_W / 2 - frameT / 2, 0.9, 0);
addBar(frameT, BOARD_H, frameD, BOARD_W / 2 + frameT / 2, 0.9, 0);

for (const x of [-0.28, 0.28]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.86, 0.045), wood);
  leg.position.set(x, 0.4, -0.08);
  leg.rotation.x = -0.08;
  easel.add(leg);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.16), iron);
  foot.position.set(x, 0.02, -0.02);
  easel.add(foot);
}
const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.1), woodLight);
shelf.position.set(0, 0.28, 0.02);
easel.add(shelf);

const clipGeo = new THREE.BoxGeometry(0.12, 0.04, 0.02);
for (const x of [-0.22, 0.22]) {
  const clip = new THREE.Mesh(clipGeo, brass);
  clip.position.set(x, 0.9 + BOARD_H / 2 - 0.02, 0.045);
  easel.add(clip);
}

const aim = new THREE.Vector3();
board.getWorldPosition(aim);
const head = new THREE.Vector3(-0.86, 1.22, 0.58);

const lampFoot = new THREE.Vector3(-1.02, 0, 0.42);
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.03, 18), iron);
base.position.set(lampFoot.x, 0.015, lampFoot.z);
scene.add(base);
const poleH = head.y - 0.05;
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, poleH, 10), iron);
pole.position.set(lampFoot.x, poleH / 2, lampFoot.z);
scene.add(pole);
const armFrom = new THREE.Vector3(lampFoot.x, head.y, lampFoot.z);
const armSpan = head.clone().sub(armFrom);
const armLen = armSpan.length();
const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 8), iron);
arm.position.copy(armFrom).addScaledVector(armSpan, 0.5);
arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armSpan.clone().multiplyScalar(1 / armLen));
arm.scale.set(1, armLen, 1);
scene.add(arm);

const housing = new THREE.Group();
housing.position.copy(head);
housing.lookAt(aim);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 20), iron);
barrel.rotation.x = Math.PI / 2;
housing.add(barrel);
const gelMat = new THREE.MeshBasicMaterial({ color: 0xfff6ea });
const gel = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), gelMat);
gel.position.set(0, 0, -0.082);
housing.add(gel);
const slideMat = new THREE.MeshStandardMaterial({
  color: 0xfff6ea,
  emissive: 0xfff6ea,
  emissiveIntensity: 0.35,
  roughness: 0.18,
  metalness: 0.02,
  transparent: true,
  opacity: 0.92,
});
const slide = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.012), slideMat);
slide.position.set(0, 0, -0.12);
housing.add(slide);
const doorGeo = new THREE.BoxGeometry(0.15, 0.024, 0.012);
const doorA = new THREE.Mesh(doorGeo, iron);
doorA.position.set(0, 0.078, -0.1);
const doorB = new THREE.Mesh(doorGeo, iron);
doorB.position.set(0, -0.078, -0.1);
housing.add(doorA, doorB);
scene.add(housing);

const spot = new THREE.SpotLight(0xfff4e4, 4.5, 6.5, 0.5, 0.65, 1.15);
spot.position.copy(head);
spot.target.position.copy(aim);
scene.add(spot);
scene.add(spot.target);

const practical = new THREE.PointLight(0xfff6ea, 0.6, 3.4, 1.6);
practical.position.copy(head);
scene.add(practical);

const beamGeo = new THREE.CylinderGeometry(0.28, 0.016, 1, 28, 1, true);
beamGeo.translate(0, 0.5, 0);
const beamUniforms = {
  uColor: { value: new THREE.Color(1, 0.96, 0.9) },
  uGain: { value: 0.7 },
  uTime: { value: 0 },
};
const beamMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  fog: false,
  uniforms: beamUniforms,
  vertexShader: `
    varying float vT;
    varying float vFall;
    void main() {
      float rad = mix(0.016, 0.28, clamp(position.y, 0.0, 1.0));
      vFall = length(position.xz) / max(rad, 0.001);
      vT = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uGain;
    uniform float uTime;
    varying float vT;
    varying float vFall;
    void main() {
      float edge = smoothstep(1.0, 0.08, vFall);
      float along = smoothstep(0.0, 0.04, vT) * smoothstep(1.0, 0.62, vT);
      float streak = 0.84 + 0.16 * sin(vFall * 16.0 + vT * 9.0 - uTime * 1.1);
      gl_FragColor = vec4(uColor, edge * along * streak * uGain);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const beam = new THREE.Mesh(beamGeo, beamMat);
beam.renderOrder = 3;
beam.frustumCulled = false;
scene.add(beam);

const up = new THREE.Vector3(0, 1, 0);
function placeBeam() {
  const origin = head.clone().add(aim.clone().sub(head).normalize().multiplyScalar(0.12));
  const dir = aim.clone().sub(origin);
  const len = dir.length();
  dir.multiplyScalar(1 / len);
  beam.position.copy(origin);
  beam.quaternion.setFromUnitVectors(up, dir);
  beam.scale.set(1, len, 1);
}
placeBeam();

const spillUniforms = {
  uColor: { value: new THREE.Color(1, 0.96, 0.88) },
  uGain: { value: 0.35 },
};
const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
  uniforms: spillUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uGain;
    varying vec2 vUv;
    void main() {
      float d = length((vUv - vec2(0.48, 0.42)) * vec2(1.05, 1.0));
      float a = smoothstep(0.52, 0.05, d) * uGain;
      gl_FragColor = vec4(uColor, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}));
spill.rotation.x = -Math.PI / 2;
spill.position.set(0.02, 0.012, 0.22);
spill.renderOrder = 2;
scene.add(spill);

const meterUniforms = {
  uHue: { value: hueTex },
  uAmp: { value: ampTex },
};
const meterMat = new THREE.ShaderMaterial({
  uniforms: meterUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uHue;
    uniform sampler2D uAmp;
    varying vec2 vUv;
    void main() {
      float x = clamp(vUv.x, 0.0, 0.999);
      float u = (floor(x * 12.0) + 0.5) / 12.0;
      float f = fract(x * 12.0);
      float inside = smoothstep(0.07, 0.14, f) * smoothstep(0.93, 0.86, f);
      vec3 hue = texture2D(uHue, vec2(u, 0.5)).rgb;
      vec2 amp = texture2D(uAmp, vec2(u, 0.5)).rg;
      float refl = min(amp.r, amp.g);
      float inc = amp.g;
      float base = 0.1;
      float span = 0.78;
      float incTop = base + span * inc;
      float refTop = base + span * refl;
      vec3 face = vec3(0.045, 0.034, 0.03);
      vec3 col = face;
      if (inc > 0.055) {
        if (vUv.y < incTop && vUv.y > base) {
          col = mix(vec3(0.07, 0.032, 0.026), hue * 0.28, 0.8);
        }
        if (vUv.y < refTop && vUv.y > base) {
          col = hue * (0.42 + 1.05 * refl) + vec3(0.015);
        }
        float tick = smoothstep(0.014, 0.0, abs(vUv.y - incTop));
        col = mix(col, min(hue * (0.55 + inc) + vec3(0.04), vec3(1.2)), tick);
      }
      col = mix(face * 0.75, col, inside);
      float sheen = pow(max(0.0, 1.0 - abs(vUv.y - 0.45) * 1.4), 2.0) * 0.05;
      col += vec3(0.09, 0.07, 0.05) * sheen;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const METER_W = 1.48;
const METER_H = 0.46;
const meter = new THREE.Group();
meter.position.set(0.42, 0.34, 0.78);
meter.rotation.x = -0.72;
meter.rotation.y = 0.08;
scene.add(meter);
const meterBack = new THREE.Mesh(new THREE.BoxGeometry(METER_W + 0.12, METER_H + 0.1, 0.03), brass);
meter.add(meterBack);
const meterWell = new THREE.Mesh(
  new THREE.BoxGeometry(METER_W, METER_H, 0.012),
  new THREE.MeshStandardMaterial({ color: 0x120e0c, roughness: 0.86, metalness: 0.08 }),
);
meterWell.position.z = 0.016;
meter.add(meterWell);
const meterFace = new THREE.Mesh(new THREE.PlaneGeometry(METER_W - 0.04, METER_H - 0.04), meterMat);
meterFace.position.z = 0.024;
meter.add(meterFace);
const prop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.028), brass);
prop.position.set(0, -0.12, -0.06);
prop.rotation.x = 0.55;
meter.add(prop);
const screwGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8);
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    const screw = new THREE.Mesh(screwGeo, brass);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(sx * (METER_W / 2 + 0.012), sy * (METER_H / 2 + 0.008), 0.028);
    meter.add(screw);
  }
}

const MOTE_N = 36;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(MOTE_N * 3);
const moteCol = new Float32Array(MOTE_N * 3);
const moteSeed = [];
for (let i = 0; i < MOTE_N; i += 1) {
  moteSeed.push({
    t: Math.random(),
    ox: (Math.random() - 0.5) * 0.12,
    oy: (Math.random() - 0.5) * 0.1,
    speed: 0.07 + Math.random() * 0.08,
  });
  motePos[i * 3 + 1] = 0;
}
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
const moteMat = new THREE.PointsMaterial({
  size: 0.016,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.8,
});
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
scene.add(motes);

function springTo(state, dt) {
  if (pathState.still) {
    state.v = state.target;
    state.vel = 0;
    return;
  }
  const acc = (state.target - state.v) * 13 - state.vel * 6.1;
  state.vel += acc * dt;
  state.v += state.vel * dt;
}

function applyTargets() {
  const surface = SURFACES[surfaceIndex];
  const lamp = LAMPS[lampIndex];
  for (let i = 0; i < BANDS; i += 1) {
    bandInc[i].target = lamp.illum[i];
    bandRefl[i].target = lamp.illum[i] * surface.refl[i];
  }
  const rgb = returned(lamp.illum, surface.refl);
  for (let i = 0; i < 3; i += 1) colorState[i].target = rgb[i];
  leafState.target = surface.id === 'leaf' ? 1 : 0;
  surfaceButtons.forEach((button, i) => {
    button.setAttribute('aria-pressed', i === surfaceIndex ? 'true' : 'false');
  });
  lampButtons.forEach((button, i) => {
    button.setAttribute('aria-pressed', i === lampIndex ? 'true' : 'false');
  });
  readout.textContent = LINES[`${surface.id}|${lamp.id}`];
  if (pathState.still) {
    for (const state of [...bandRefl, ...bandInc, ...colorState, leafState]) {
      state.v = state.target;
      state.vel = 0;
    }
  }
}

function writeBands() {
  for (let i = 0; i < BANDS; i += 1) {
    const refl = THREE.MathUtils.clamp(bandRefl[i].v, 0, 1);
    const inc = THREE.MathUtils.clamp(bandInc[i].v, 0, 1);
    ampData[i * 4] = Math.round(refl * 255);
    ampData[i * 4 + 1] = Math.round(inc * 255);
    ampData[i * 4 + 2] = 0;
    ampData[i * 4 + 3] = 255;
  }
  ampTex.needsUpdate = true;
}

function syncScene() {
  writeBands();
  const r = Math.max(0, colorState[0].v);
  const g = Math.max(0, colorState[1].v);
  const b = Math.max(0, colorState[2].v);
  boardUniforms.uColor.value.setRGB(r, g, b);
  boardUniforms.uLeaf.value = THREE.MathUtils.clamp(leafState.v, 0, 1);

  const lamp = LAMPS[lampIndex];
  const beamRgb = returned(lamp.illum, ONES);
  const peak = Math.max(0.18, beamRgb[0], beamRgb[1], beamRgb[2]);
  const energy = lamp.illum.reduce((sum, value) => sum + value, 0) / BANDS;
  beamUniforms.uColor.value.setRGB(beamRgb[0] / peak, beamRgb[1] / peak, beamRgb[2] / peak);
  beamUniforms.uGain.value = Math.min(0.78, 0.28 + energy * 0.62);
  beamUniforms.uTime.value = elapsed;
  spillUniforms.uColor.value.copy(beamUniforms.uColor.value);
  spillUniforms.uGain.value = 0.16 + energy * 0.28;
  gelMat.color.copy(beamUniforms.uColor.value);
  slideMat.color.copy(beamUniforms.uColor.value);
  slideMat.emissive.copy(beamUniforms.uColor.value);
  slideMat.emissiveIntensity = 0.2 + energy * 0.35;
  spot.color.copy(beamUniforms.uColor.value);
  spot.intensity = 1.4 + energy * 5.2;
  practical.color.copy(beamUniforms.uColor.value);
  practical.intensity = 0.25 + energy * 0.85;

  const draw = pathState.safe ? 12 : MOTE_N;
  const colorAttr = moteGeo.attributes.color;
  for (let i = 0; i < draw; i += 1) {
    colorAttr.setXYZ(i, beamRgb[0] / peak, beamRgb[1] / peak, beamRgb[2] / peak);
  }
  colorAttr.needsUpdate = true;
}

const AbsorbLiftShader = {
  name: 'LightLabAbsorbLift',
  uniforms: {
    tDiffuse: { value: null },
    uGain: { value: 0.4 },
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
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        vec2 offset = vec2(cos(a), sin(a)) * 0.0032;
        vec3 tapColor = texture2D(tDiffuse, vUv + offset).rgb;
        float lum = dot(tapColor, vec3(0.2126, 0.7152, 0.0722));
        glow += tapColor * smoothstep(0.35, 0.95, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.04 * uGain), base.a);
      #include <colorspace_fragment>
    }
  `,
};

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
  document.documentElement.dataset.composer = composer ? '1' : '0';
  document.documentElement.dataset.rendererCount = '1';
}

function ensureComposer() {
  if (composer || pathState.safe) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  if (floatEmbed) {
    renderPass.clearColor = new THREE.Color(0x000000);
    renderPass.clearAlpha = 0;
  }
  liftPass = new ShaderPass(AbsorbLiftShader);
  composer.addPass(renderPass);
  composer.addPass(liftPass);
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
  liftPass = null;
  renderPass = null;
}

function frameCamera(force) {
  if (framed && !force) return;
  const narrow = innerWidth <= 900;
  const short = innerHeight <= 700;
  if (narrow) {
    camera.fov = short ? 46 : 40;
    camera.position.set(0.05, short ? 1.22 : 1.12, short ? 3.35 : 3.15);
    controls.target.set(0.12, short ? 0.78 : 0.7, 0.05);
  } else {
    camera.fov = 32;
    camera.position.set(0.18, 0.98, 2.72);
    controls.target.set(0.16, 0.62, 0.16);
  }
  camera.updateProjectionMatrix();
  controls.update();
  framed = true;
}

function applyBudget() {
  pathState.safe = wantsSafe();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  moteGeo.setDrawRange(0, pathState.safe ? 12 : MOTE_N);
  if (pathState.safe) destroyComposer();
  else ensureComposer();
  frameCamera(false);
  syncScene();
  if (!pathState.safe && composer) sizeComposer();
  publishPath();
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
  if (pathState.still) {
    for (const state of [...bandRefl, ...bandInc, ...colorState, leafState]) {
      state.v = state.target;
      state.vel = 0;
    }
    syncScene();
  }
}

function resize() {
  const nextSafe = wantsSafe();
  const changed = nextSafe !== pathState.safe;
  pathState.safe = nextSafe;
  if (changed) framed = false;
  applyBudget();
  syncMotion();
}

function setSurface(index) {
  surfaceIndex = index;
  applyTargets();
  if (pathState.still) syncScene();
}

function setLamp(index) {
  lampIndex = index;
  applyTargets();
  if (pathState.still) syncScene();
}

surfaceButtons.forEach((button) => {
  button.addEventListener('click', () => setSurface(Number(button.dataset.surface)));
});
lampButtons.forEach((button) => {
  button.addEventListener('click', () => setLamp(Number(button.dataset.lamp)));
});

const surfaceKeys = { g: 0, w: 1, k: 2, r: 3, y: 4, b: 5 };

addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A' || tag === 'INPUT') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key in surfaceKeys) {
    setSurface(surfaceKeys[key]);
    event.preventDefault();
  } else if (key === 'o') {
    setLamp(0);
    event.preventDefault();
  } else if (event.key === 'ArrowRight') {
    setSurface((surfaceIndex + 1) % SURFACES.length);
    event.preventDefault();
  } else if (event.key === 'ArrowLeft') {
    setSurface((surfaceIndex + SURFACES.length - 1) % SURFACES.length);
    event.preventDefault();
  } else if (event.key === 'ArrowDown') {
    setLamp((lampIndex + 1) % LAMPS.length);
    event.preventDefault();
  } else if (event.key === 'ArrowUp') {
    setLamp((lampIndex + LAMPS.length - 1) % LAMPS.length);
    event.preventDefault();
  }
});

for (const state of [...bandRefl, ...bandInc, ...colorState, leafState]) {
  state.v = 0;
}
applyTargets();
for (const state of [...bandRefl, ...bandInc, ...colorState, leafState]) {
  state.v = state.target;
  state.vel = 0;
}
applyBudget();
syncMotion();

addEventListener('resize', resize);
coarseMql.addEventListener?.('change', resize);
narrowMql.addEventListener?.('change', resize);
reduceMql.addEventListener?.('change', syncMotion);
controls.addEventListener('start', () => { controls.autoRotate = false; });
controls.addEventListener('end', () => { controls.autoRotate = !pathState.still; });

const moteAttr = moteGeo.attributes.position;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (!pathState.still) elapsed += dt;
  for (const state of [...bandRefl, ...bandInc, ...colorState, leafState]) springTo(state, dt);
  syncScene();
  if (!pathState.still) {
    const draw = pathState.safe ? 12 : MOTE_N;
    for (let i = 0; i < draw; i += 1) {
      const seed = moteSeed[i];
      const t = (seed.t + elapsed * seed.speed) % 1;
      const wobble = 1 - t;
      moteAttr.setXYZ(
        i,
        THREE.MathUtils.lerp(head.x, aim.x, t) + seed.ox * wobble,
        THREE.MathUtils.lerp(head.y, aim.y, t) + seed.oy * wobble,
        THREE.MathUtils.lerp(head.z, aim.z, t),
      );
    }
    moteAttr.needsUpdate = true;
  } else if (elapsed === 0) {
    const draw = pathState.safe ? 12 : MOTE_N;
    for (let i = 0; i < draw; i += 1) {
      const seed = moteSeed[i];
      moteAttr.setXYZ(
        i,
        THREE.MathUtils.lerp(head.x, aim.x, seed.t),
        THREE.MathUtils.lerp(head.y, aim.y, seed.t),
        THREE.MathUtils.lerp(head.z, aim.z, seed.t),
      );
    }
    moteAttr.needsUpdate = true;
    elapsed = 0.0001;
  }
  controls.update();
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
