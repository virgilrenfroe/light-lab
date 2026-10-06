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
const rail = document.getElementById('angle-rail');

// One WebGLRenderer for the page. The lift pass reuses it.
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
renderer.toneMappingExposure = 0.96;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x07060c, 0.034);

const BENCH_TOP = 0.36;
const AXIS_Y = 1.2;
const POL_X = -0.5;
const PLASTIC_X = 0.0;
const ANA_X = 0.46;
const CARD_X = 1.05;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
camera.position.set(0.04, 1.22, 3.15);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.02, 1.02, 0);
controls.minDistance = 1.7;
controls.maxDistance = 5.2;
controls.minPolarAngle = 0.72;
controls.maxPolarAngle = 1.38;
controls.minAzimuthAngle = -0.85;
controls.maxAzimuthAngle = 0.95;
controls.autoRotateSpeed = 0.18;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'polar';

// Rail 0 → filters aligned (0°). Rail 1 → 180°. Crossed is the middle.
let angleTarget = 28 / 180;
const angle = { value: 28 / 180, vel: 0 };
const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let liftPass = null;
let outputPass = null;
let renderPass = null;
let envReady = false;
let lastSentence = '';

const brass = new THREE.MeshStandardMaterial({
  color: 0x8a6a3a,
  roughness: 0.32,
  metalness: 0.82,
});
const brassDark = new THREE.MeshStandardMaterial({
  color: 0x5c4528,
  roughness: 0.4,
  metalness: 0.74,
});
const stone = new THREE.MeshStandardMaterial({
  color: 0x100e14,
  roughness: 0.86,
  metalness: 0.05,
});
const sheetMat = new THREE.MeshStandardMaterial({
  color: 0x141816,
  roughness: 0.45,
  metalness: 0.02,
  transparent: true,
  opacity: 0.42,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const axisMat = new THREE.MeshBasicMaterial({
  color: 0xfff1dc,
  toneMapped: false,
});
const cardMat = new THREE.MeshBasicMaterial({
  color: 0xffe6c4,
  toneMapped: true,
});

const room = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 5.2, 9.2),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 }),
);
room.position.set(0.15, 1.7, -0.15);
scene.add(room);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), stone);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(3.15, 0.12, 1.85),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.72, metalness: 0.08 }),
);
bench.position.set(0.12, BENCH_TOP - 0.06, 0.02);
bench.receiveShadow = true;
bench.castShadow = true;
scene.add(bench);

const railBar = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.028, 0.07), brassDark);
railBar.position.set(0.18, BENCH_TOP + 0.02, 0);
railBar.castShadow = true;
railBar.receiveShadow = true;
scene.add(railBar);

function makePost(x, topY, z = 0) {
  const h = Math.max(0.08, topY - BENCH_TOP);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, h, 12), brass);
  post.position.set(x, BENCH_TOP + h / 2, z);
  post.castShadow = true;
  scene.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.02, 16), brass);
  foot.position.set(x, BENCH_TOP + 0.02, z);
  foot.castShadow = true;
  scene.add(foot);
  return post;
}

function rectFrame(w, h, thick) {
  const g = new THREE.Group();
  const bar = (bw, bh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, thick), brass);
    m.position.set(x, y, 0);
    m.castShadow = true;
    g.add(m);
  };
  const t = 0.028;
  bar(w + t, t, 0, h / 2);
  bar(w + t, t, 0, -h / 2);
  bar(t, h + t, -w / 2, 0);
  bar(t, h + t, w / 2, 0);
  return g;
}

const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false });
lampMat.color.multiplyScalar(2.2);
const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), lampMat);
lamp.position.set(-1.12, AXIS_Y + 0.22, 0.22);
scene.add(lamp);
const lampCup = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12, 0, Math.PI), brass);
lampCup.position.copy(lamp.position);
lampCup.rotation.y = 0.7;
lampCup.rotation.z = 0.35;
scene.add(lampCup);
const lampPostH = lamp.position.y - BENCH_TOP;
const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, lampPostH, 10), brass);
lampPost.position.set(lamp.position.x, BENCH_TOP + lampPostH / 2, lamp.position.z);
lampPost.castShadow = true;
scene.add(lampPost);

const polW = 0.58;
const polH = 0.82;
const polarizer = new THREE.Group();
polarizer.position.set(POL_X, AXIS_Y, 0);
polarizer.rotation.y = 0.14;
scene.add(polarizer);
polarizer.add(rectFrame(polW, polH, 0.02));
const polSheet = new THREE.Mesh(new THREE.PlaneGeometry(polW - 0.04, polH - 0.04), sheetMat);
polSheet.renderOrder = 2;
polarizer.add(polSheet);
const polAxis = new THREE.Mesh(new THREE.BoxGeometry(0.016, polH - 0.12, 0.012), axisMat);
polAxis.position.z = 0.02;
polarizer.add(polAxis);
makePost(POL_X, AXIS_Y - polH / 2 + 0.02, 0);

const PLASTIC_W = 0.42;
const PLASTIC_H = 0.58;
const HOLE_R = 0.072;

function plasticShape() {
  const w = PLASTIC_W;
  const h = PLASTIC_H;
  const r = 0.045;
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r);
  shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h);
  shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, HOLE_R, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

const plasticUniforms = {
  uTheta: { value: 0.5 },
  uCoarse: { value: pathState.safe ? 1 : 0 },
  uHole: { value: HOLE_R },
};

const plasticVertex = /* glsl */ `
  varying vec2 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vLocal = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const plasticFragment = /* glsl */ `
  uniform float uTheta;
  uniform float uCoarse;
  uniform float uHole;
  varying vec2 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;

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

  float transmitted(float lambda, float deltaNm, float beta) {
    float s = sin(3.14159265 * deltaNm / lambda);
    float couple = sin(2.0 * beta) * sin(2.0 * (beta - uTheta));
    float I = cos(uTheta) * cos(uTheta) - couple * s * s;
    return clamp(I, 0.0, 1.0);
  }

  vec3 spectrum(float deltaNm, float beta) {
    vec3 sum = vec3(0.0);
    float w = 0.0;
    if (uCoarse > 0.5) {
      sum += waveRGB(450.0) * transmitted(450.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(520.0) * transmitted(520.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(590.0) * transmitted(590.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(650.0) * transmitted(650.0, deltaNm, beta); w += 1.0;
    } else {
      sum += waveRGB(440.0) * transmitted(440.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(470.0) * transmitted(470.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(500.0) * transmitted(500.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(530.0) * transmitted(530.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(560.0) * transmitted(560.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(600.0) * transmitted(600.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(630.0) * transmitted(630.0, deltaNm, beta); w += 1.0;
      sum += waveRGB(660.0) * transmitted(660.0, deltaNm, beta); w += 1.0;
    }
    return sum * (1.45 / w);
  }

  void main() {
    vec2 p = vLocal;
    float r = length(p);
    float phi = atan(p.y, p.x);
    float nearHole = smoothstep(uHole * 2.8, uHole * 1.05, r);
    float edge = smoothstep(0.16, 0.02, min(0.21 - abs(p.x), 0.29 - abs(p.y)));
    float beta = mix(0.04, phi, nearHole);
    beta = mix(beta, 0.62, edge * (1.0 - nearHole));
    float fall = pow(uHole / max(r, uHole), 1.85);
    float deltaNm = 90.0 + 2100.0 * fall * (0.2 + 0.8 * abs(sin(2.0 * phi)));
    deltaNm += 820.0 * edge;
    vec3 col = spectrum(deltaNm, beta);
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float crossed = smoothstep(0.2, 0.92, 1.0 - cos(uTheta) * cos(uTheta));
    float chromaAmp = mix(0.25, 1.65, crossed);
    col = vec3(luma) * mix(0.62, 1.05, crossed) + (col - vec3(luma)) * chromaAmp;
    col *= vec3(1.02, 0.97, 0.9);
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(N, V)), 2.4);
    col += vec3(0.72, 0.78, 0.76) * fres * 0.42;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const plasticMat = new THREE.ShaderMaterial({
  uniforms: plasticUniforms,
  vertexShader: plasticVertex,
  fragmentShader: plasticFragment,
  side: THREE.DoubleSide,
  toneMapped: true,
});

const plasticGeo = new THREE.ExtrudeGeometry(plasticShape(), {
  depth: 0.028,
  bevelEnabled: true,
  bevelThickness: 0.006,
  bevelSize: 0.006,
  bevelSegments: 1,
  curveSegments: 10,
});
plasticGeo.translate(0, 0, -0.014);
const plastic = new THREE.Mesh(plasticGeo, plasticMat);
plastic.position.set(PLASTIC_X, AXIS_Y, 0.02);
plastic.rotation.y = 0.14;
plastic.renderOrder = 3;
scene.add(plastic);
makePost(PLASTIC_X, AXIS_Y - PLASTIC_H / 2 + 0.02, 0.02);

const clipMat = brass;
const clipL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.04), clipMat);
clipL.position.set(PLASTIC_X - PLASTIC_W / 2 - 0.01, AXIS_Y, 0.02);
scene.add(clipL);
const clipR = clipL.clone();
clipR.position.x = PLASTIC_X + PLASTIC_W / 2 + 0.01;
scene.add(clipR);

const ANA_R = 0.34;
const analyzer = new THREE.Group();
analyzer.position.set(ANA_X, AXIS_Y, 0.05);
analyzer.rotation.y = 0.14;
scene.add(analyzer);
const anaSpin = new THREE.Group();
analyzer.add(anaSpin);
const anaRing = new THREE.Mesh(new THREE.TorusGeometry(ANA_R, 0.02, 12, 48), brass);
anaRing.castShadow = true;
anaSpin.add(anaRing);
const anaSheet = new THREE.Mesh(new THREE.CircleGeometry(ANA_R - 0.02, 48), sheetMat.clone());
anaSheet.renderOrder = 4;
anaSpin.add(anaSheet);
const anaAxis = new THREE.Mesh(new THREE.BoxGeometry(0.016, ANA_R * 1.7, 0.014), axisMat);
anaAxis.position.z = 0.02;
anaSpin.add(anaAxis);
const anaTab = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.02), brass);
anaTab.position.y = ANA_R + 0.01;
anaSpin.add(anaTab);
makePost(ANA_X, AXIS_Y - ANA_R + 0.02, 0.05);

const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.72), cardMat);
card.position.set(CARD_X, AXIS_Y, 0.0);
card.rotation.y = 0.14;
card.receiveShadow = true;
scene.add(card);
const cardFrame = rectFrame(0.78, 1.02, 0.016);
cardFrame.scale.set(0.5 / 0.78, 0.72 / 1.02, 1);
cardFrame.position.copy(card.position);
cardFrame.rotation.copy(card.rotation);
scene.add(cardFrame);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255, 246, 230, 1)');
  grd.addColorStop(0.28, 'rgba(255, 214, 170, 0.72)');
  grd.addColorStop(1, 'rgba(255, 214, 170, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const spotMat = new THREE.MeshBasicMaterial({
  map: glowTexture(),
  color: 0xfff4e4,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), spotMat);
spot.position.set(0, 0.04, 0.012);
spot.renderOrder = 2;
card.add(spot);

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const beamInMat = new THREE.MeshBasicMaterial({
  color: 0xffe2bc,
  transparent: true,
  opacity: 0.13,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});
const beamOutMat = beamInMat.clone();
const beamIn = new THREE.Mesh(beamGeo, beamInMat);
const beamOut = new THREE.Mesh(beamGeo, beamOutMat);
scene.add(beamIn);
scene.add(beamOut);

const up = new THREE.Vector3(0, 1, 0);
const aimDir = new THREE.Vector3();
const beamFrom = new THREE.Vector3();
const beamTo = new THREE.Vector3();
function aimBeam(mesh, from, to, radius) {
  aimDir.subVectors(to, from);
  const len = Math.max(0.04, aimDir.length());
  mesh.position.copy(from).addScaledVector(aimDir, 0.5);
  aimDir.multiplyScalar(1 / len);
  mesh.quaternion.setFromUnitVectors(up, aimDir);
  mesh.scale.set(radius, len, radius);
}

const glassMat = new THREE.MeshStandardMaterial({
  color: 0xd7e0e4,
  roughness: 0.42,
  metalness: 0.04,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const glass = new THREE.Group();
glass.position.set(-0.86, AXIS_Y, 0.16);
glass.rotation.y = 0.22;
scene.add(glass);
const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), glassMat);
pane.renderOrder = 5;
glass.add(pane);
glass.add(rectFrame(0.5, 0.4, 0.012));
const glareMat = new THREE.MeshBasicMaterial({
  color: 0xfff7ec,
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const glare = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), glareMat);
glare.position.z = 0.012;
glare.renderOrder = 6;
glass.add(glare);
const glareHaloMat = glareMat.clone();
const glareHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.18), glareHaloMat);
glareHalo.position.z = 0.01;
glareHalo.renderOrder = 5;
glass.add(glareHalo);
const easelL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 8), brass);
easelL.position.set(-0.22, -0.22, -0.02);
easelL.rotation.z = 0.12;
easelL.castShadow = true;
glass.add(easelL);
const easelR = easelL.clone();
easelR.position.x = 0.22;
easelR.rotation.z = -0.12;
glass.add(easelR);

const hemi = new THREE.HemisphereLight(0x6a5c4e, 0x100e14, 0.2);
scene.add(hemi);
const fill = new THREE.AmbientLight(0x2a241e, 0.04);
scene.add(fill);
const key = new THREE.SpotLight(0xfff3e4, 12, 8, 0.55, 0.45, 1.1);
key.position.copy(lamp.position);
key.target.position.set(PLASTIC_X, AXIS_Y, 0);
key.castShadow = true;
key.shadow.bias = -0.0008;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
scene.add(key.target);
const rim = new THREE.PointLight(0xffe6c4, 1.15, 7, 2);
rim.position.set(1.35, 1.85, 1.15);
scene.add(rim);

const wigGeo = new THREE.CylinderGeometry(0.007, 0.007, 1, 6);
const wigMats = {
  raw: new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false }),
  pol: new THREE.MeshBasicMaterial({ color: 0xfff6e8, toneMapped: false }),
  out: new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false }),
};
let fields = [];

function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clearFields() {
  for (const field of fields) scene.remove(field.mesh);
  fields = [];
}

function buildFields() {
  clearFields();
  const safe = pathState.safe;
    const specs = [
    { mode: 'raw', n: safe ? 8 : 12, x0: -0.7, x1: -0.6, z: 0.24 },
    { mode: 'pol', n: safe ? 6 : 8, x0: -0.3, x1: -0.16, z: 0.22 },
    { mode: 'pol', n: safe ? 6 : 8, x0: 0.16, x1: 0.3, z: 0.24 },
    { mode: 'out', n: safe ? 6 : 8, x0: 0.68, x1: 0.86, z: 0.2 },
  ];
  let seed = 1;
  for (const spec of specs) {
    const mesh = new THREE.InstancedMesh(wigGeo, wigMats[spec.mode], spec.n);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const samples = [];
    for (let i = 0; i < spec.n; i += 1) {
      seed += 1;
      const u = spec.n === 1 ? 0.5 : i / (spec.n - 1);
      samples.push({
        x: THREE.MathUtils.lerp(spec.x0, spec.x1, u),
        y: AXIS_Y + (hash(seed) - 0.5) * 0.28,
        z: spec.z + (hash(seed + 4) - 0.5) * 0.04,
        spin: hash(seed + 9) * Math.PI,
        len: 0.09 + hash(seed + 2) * 0.04,
      });
    }
    scene.add(mesh);
    fields.push({ mesh, samples, mode: spec.mode });
  }
}

const dummy = new THREE.Object3D();
function updateFields(theta, malus) {
  const wobble = pathState.still ? 0 : elapsed;
  for (const field of fields) {
    const { mesh, samples, mode } = field;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      let rot = 0;
      let len = s.len;
      if (mode === 'raw') {
        rot = s.spin + Math.sin(wobble * 1.3 + i) * 0.18;
        len *= 0.82 + 0.18 * Math.sin(wobble * 2.1 + s.spin);
      } else if (mode === 'pol') {
        rot = Math.sin(wobble * 1.6 + i) * 0.04;
      } else {
        rot = -theta;
        len *= Math.abs(Math.cos(theta));
      }
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, 0, rot);
      dummy.scale.set(1, Math.max(0.0008, len), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  wigMats.out.color.setScalar(0.2 + 0.8 * Math.sqrt(Math.max(0, malus)));
}

const LiftShader = {
  name: 'LightLabPolarLift',
  uniforms: {
    tDiffuse: { value: null },
    uGain: { value: 0.65 },
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
        vec2 offset = vec2(cos(a), sin(a)) * 0.0024;
        vec3 tapColor = texture2D(tDiffuse, vUv + offset).rgb;
        float lum = dot(tapColor, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(tapColor.r, max(tapColor.g, tapColor.b)) - min(tapColor.r, min(tapColor.g, tapColor.b));
        glow += tapColor * (smoothstep(0.22, 0.9, lum) + smoothstep(0.14, 0.48, sat));
      }
      gl_FragColor = vec4(base.rgb + glow * (0.04 * uGain), base.a);
    }
  `,
};

function describe(deg, malus, glare) {
  const shown = Math.round(deg);
  const factor = malus.toFixed(2);
  const parts = [
    `Analyzer at ${shown} degrees.`,
    `cos^2 of the angle is ${factor}.`,
  ];
  if (malus < 0.06) {
    parts.push('The filters are crossed.');
    parts.push('The beam is dark.');
    parts.push('Stress colors show in the plastic.');
  } else if (malus > 0.9) {
    parts.push('The filters are nearly aligned.');
    parts.push('The beam is bright.');
  } else if (malus > 0.45) {
    parts.push('Most of the beam still passes.');
  } else {
    parts.push('Only a little of the beam gets through.');
  }
  if (glare < 0.18) parts.push('The glare on the glass is blocked.');
  else if (glare > 0.72) parts.push('The glare on the glass is strong. That reflection wiggles sideways.');
  else parts.push('Some glare still shows on the glass.');
  return parts.join(' ');
}

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
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
  liftPass = new ShaderPass(LiftShader);
  outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(liftPass);
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
  liftPass = null;
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
  hemi.intensity = safe ? 0.48 : 0.18;
  fill.intensity = safe ? 0.34 : 0.04;
  plasticUniforms.uCoarse.value = safe ? 1 : 0;
  if (safe) destroyComposer();
  else ensureComposer();
  if (!safe) ensureEnv();
  buildFields();
  if (!safe && composer) sizeComposer();
  publishPath();
  const horizontal = rail.getBoundingClientRect().width > rail.getBoundingClientRect().height;
  rail.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
}

function syncPolar(forceReadout) {
  const theta = angle.value * Math.PI;
  const malus = Math.cos(theta) * Math.cos(theta);
  const glareAmt = Math.sin(theta) * Math.sin(theta);
  const deg = angle.value * 180;
  plasticUniforms.uTheta.value = theta;
  anaSpin.rotation.z = -theta;
  const glow = 0.012 + malus * 0.9;
  cardMat.color.setRGB(glow, glow * 0.84, glow * 0.58);
  spotMat.opacity = malus * 0.95;
  beamOutMat.opacity = 0.015 + malus * 0.28;
  const glareOn = glareAmt * glareAmt;
  glareMat.opacity = glareOn;
  glareHaloMat.opacity = THREE.MathUtils.smoothstep(glareAmt, 0.45, 0.92) * 0.5;
  if (liftPass) liftPass.uniforms.uGain.value = 0.22 + malus * 0.12 + glareAmt * 0.4;
  beamFrom.copy(lamp.position);
  beamTo.set(POL_X, AXIS_Y, 0.04);
  aimBeam(beamIn, beamFrom, beamTo, 0.035);
  beamFrom.set(POL_X + 0.08, AXIS_Y, 0.03);
  beamTo.set(CARD_X - 0.08, AXIS_Y, 0);
  aimBeam(beamOut, beamFrom, beamTo, 0.028 + malus * 0.02);
  updateFields(theta, malus);
  const sentence = describe(deg, malus, glareAmt);
  if (forceReadout || sentence !== lastSentence) {
    lastSentence = sentence;
    readout.textContent = sentence;
    rail.setAttribute('aria-valuetext', sentence);
  }
  rail.style.setProperty('--t', angleTarget.toFixed(4));
  rail.setAttribute('aria-valuenow', String(Math.round(angleTarget * 180)));
  document.documentElement.dataset.angle = deg.toFixed(1);
  document.documentElement.dataset.malus = malus.toFixed(3);
  document.documentElement.dataset.glare = glareAmt.toFixed(3);
  document.documentElement.dataset.crossed = malus < 0.06 ? '1' : '0';
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
  if (pathState.still) {
    angle.value = angleTarget;
    angle.vel = 0;
  }
  syncPolar(true);
}

function resize() {
  pathState.safe = wantsSafe();
  applyBudget();
  syncMotion();
}

function setAngleFromEvent(event) {
  const rect = rail.getBoundingClientRect();
  const horizontal = rect.width > rect.height;
  const t = horizontal
    ? (event.clientX - rect.left) / rect.width
    : 1 - (event.clientY - rect.top) / rect.height;
  angleTarget = THREE.MathUtils.clamp(t, 0, 1);
  if (pathState.still) {
    angle.value = angleTarget;
    angle.vel = 0;
  }
  syncPolar(true);
}

function nudge(dir, step) {
  angleTarget = THREE.MathUtils.clamp(angleTarget + dir * step, 0, 1);
  if (pathState.still) {
    angle.value = angleTarget;
    angle.vel = 0;
  }
  syncPolar(true);
}

rail.addEventListener('pointerdown', (event) => {
  rail.setPointerCapture(event.pointerId);
  setAngleFromEvent(event);
});
rail.addEventListener('pointermove', (event) => {
  if (!rail.hasPointerCapture(event.pointerId)) return;
  setAngleFromEvent(event);
});
rail.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 8 / 180 : 4 / 180;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    nudge(1, step);
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    nudge(-1, step);
    event.preventDefault();
    event.stopPropagation();
  }
});

addEventListener('keydown', (event) => {
  if (event.target === rail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const step = 4 / 180;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nudge(1, step);
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nudge(-1, step);
});

function stepAngle(dt) {
  if (pathState.still) {
    angle.value = angleTarget;
    angle.vel = 0;
    return;
  }
  const acc = (angleTarget - angle.value) * 22 - angle.vel * 6.8;
  angle.vel += acc * dt;
  angle.value += angle.vel * dt;
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
  stepAngle(dt);
  controls.update();
  syncPolar(false);
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
