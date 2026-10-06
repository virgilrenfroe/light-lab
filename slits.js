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
const spaceRail = document.getElementById('space-rail');
const widthRail = document.getElementById('width-rail');
const colorRail = document.getElementById('color-rail');
const bothBtn = document.getElementById('mode-both');
const oneBtn = document.getElementById('mode-one');

// One WebGLRenderer for the page. The fringe lift reuses it.
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
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x07060c, 0.028);

const BENCH_TOP = 0.34;
const AXIS_Y = 1.16;
const LAMP_X = -1.28;
const SLIT_X = -0.42;
const SCREEN_X = 1.16;
const SCREEN_L = SCREEN_X - SLIT_X;
const L_METERS = 1.2;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
camera.position.set(0.42, 1.72, 2.85);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.28, 1.04, 0);
controls.minDistance = 1.85;
controls.maxDistance = 5.6;
controls.minPolarAngle = 0.62;
controls.maxPolarAngle = 1.38;
controls.minAzimuthAngle = -0.9;
controls.maxAzimuthAngle = 1.05;
controls.autoRotateSpeed = 0.16;

let framedNarrow = null;
function frameCamera() {
  const narrow = innerWidth <= 900;
  if (framedNarrow === narrow) return;
  framedNarrow = narrow;
  if (narrow) {
    camera.position.set(0.55, 1.28, 2.48);
    controls.target.set(0.34, 0.46, 0);
    screen.rotation.y = -0.46;
  } else {
    camera.position.set(0.42, 1.72, 2.85);
    controls.target.set(0.28, 1.04, 0);
    screen.rotation.y = -0.82;
  }
  screenFrame.rotation.copy(screen.rotation);
}

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'slits';

const space = { value: 0.4, vel: 0, target: 0.4 };
const width = { value: 0.4, vel: 0, target: 0.4 };
const color = { value: 0.42, vel: 0, target: 0.42 };
const cover = { value: 0, vel: 0, target: 0 };

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
const plateMat = new THREE.MeshStandardMaterial({
  color: 0x121016,
  roughness: 0.9,
  metalness: 0.02,
  side: THREE.DoubleSide,
});

const room = new THREE.Mesh(
  new THREE.BoxGeometry(9.4, 5.2, 9.4),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 }),
);
room.position.set(0.15, 1.7, -0.15);
scene.add(room);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), stone);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(3.45, 0.12, 1.9),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.72, metalness: 0.08 }),
);
bench.position.set(0.05, BENCH_TOP - 0.06, 0.02);
bench.receiveShadow = true;
bench.castShadow = true;
scene.add(bench);

const railBar = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.028, 0.07), brassDark);
railBar.position.set(0.12, BENCH_TOP + 0.02, 0);
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

function lerpT(t, a, b) {
  return THREE.MathUtils.lerp(a, b, THREE.MathUtils.clamp(t, -0.08, 1.08));
}
function spacingWorld(t) { return lerpT(t, 0.12, 0.30); }
function widthWorld(t) { return lerpT(t, 0.034, 0.086); }
function lambdaWorld(t) { return lerpT(t, 0.022, 0.033); }
function spacingMm(t) { return spacingWorld(t) * (0.20 / 0.12); }
function widthMm(t) { return widthWorld(t) * (0.04 / 0.034); }
function wavelengthNm(t) { return lambdaWorld(t) * (450 / 0.022); }
function fringeMm(nm, dMm) {
  return (nm * 1e-9) * L_METERS / (dMm * 1e-3) * 1e3;
}

const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false });
const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 14), lampMat);
lamp.position.set(LAMP_X, AXIS_Y + 0.04, 0.16);
scene.add(lamp);
const lampCup = new THREE.Mesh(new THREE.SphereGeometry(0.074, 18, 12, 0, Math.PI), brass);
lampCup.position.copy(lamp.position);
lampCup.rotation.y = Math.PI * 0.5;
lampCup.rotation.z = 0.15;
scene.add(lampCup);
const lampPostH = lamp.position.y - BENCH_TOP;
const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, lampPostH, 10), brass);
lampPost.position.set(lamp.position.x, BENCH_TOP + lampPostH / 2, lamp.position.z);
lampPost.castShadow = true;
scene.add(lampPost);

const CARD_W = 0.92;
const CARD_H = 1.08;
const card = new THREE.Group();
card.position.set(SLIT_X, AXIS_Y, 0);
card.rotation.y = -1.02;
scene.add(card);
card.add(rectFrame(CARD_W, CARD_H, 0.02));
const plate = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W - 0.06, CARD_H - 0.06), plateMat);
plate.position.z = -0.004;
card.add(plate);
makePost(SLIT_X, AXIS_Y - CARD_H / 2 + 0.02, 0);

function slitMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xffe6b0,
    toneMapped: false,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
const slitMatA = slitMaterial();
const slitMatB = slitMaterial();
const haloMatA = slitMaterial();
const haloMatB = slitMaterial();
const SLIT_H = 0.62;
const slitA = new THREE.Mesh(new THREE.PlaneGeometry(1, SLIT_H), slitMatA);
const slitB = new THREE.Mesh(new THREE.PlaneGeometry(1, SLIT_H), slitMatB);
const haloA = new THREE.Mesh(new THREE.PlaneGeometry(1, SLIT_H + 0.08), haloMatA);
const haloB = new THREE.Mesh(new THREE.PlaneGeometry(1, SLIT_H + 0.08), haloMatB);
slitA.position.z = 0.012;
slitB.position.z = 0.012;
haloA.position.z = 0.008;
haloB.position.z = 0.008;
slitA.renderOrder = 3;
slitB.renderOrder = 3;
haloA.renderOrder = 2;
haloB.renderOrder = 2;
card.add(haloA, haloB, slitA, slitB);

const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.02), brassDark);
shutter.position.z = 0.028;
shutter.castShadow = true;
card.add(shutter);

const SCREEN_W = 1.18;
const SCREEN_H = 1.28;
const shared = {
  uSlitA: { value: new THREE.Vector3() },
  uSlitB: { value: new THREE.Vector3() },
  uLambda: { value: 0.026 },
  uWidth: { value: 0.05 },
  uCover: { value: 0 },
  uColor: { value: new THREE.Color(1, 0.9, 0.55) },
};

const screenVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const screenFragment = /* glsl */ `
  uniform vec3 uSlitA;
  uniform vec3 uSlitB;
  uniform float uLambda;
  uniform float uWidth;
  uniform float uCover;
  uniform vec3 uColor;
  varying vec3 vWorld;

  float sinc(float x) {
    float ax = abs(x);
    float s = sin(x) / max(ax, 0.0001);
    return mix(s, 1.0, step(ax, 0.001));
  }

  void main() {
    float coverT = smoothstep(0.12, 0.82, uCover);
    vec3 origin = mix(0.5 * (uSlitA + uSlitB), uSlitA, coverT);
    vec3 axis = vec3(1.0, 0.0, 0.0);
    vec3 rel = vWorld - origin;
    float along = dot(rel, axis);
    float lateral = length(rel - axis * along);
    float sinT = lateral / max(length(rel), 0.0001);
    float beta = 3.14159265 * uWidth * sinT / uLambda;
    float env = sinc(beta);
    env *= env;
    float delta = distance(vWorld, uSlitB) - distance(vWorld, uSlitA);
    float fr = cos(3.14159265 * delta / uLambda);
    fr *= fr;
    float I = mix(env * fr, env, coverT);
    vec3 paper = vec3(0.07, 0.055, 0.046);
    vec3 glow = uColor * pow(clamp(I, 0.0, 1.0), 0.72) * 1.7;
    gl_FragColor = vec4(paper + glow, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const screenMat = new THREE.ShaderMaterial({
  uniforms: shared,
  vertexShader: screenVertex,
  fragmentShader: screenFragment,
  side: THREE.DoubleSide,
  toneMapped: true,
});
const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
screen.position.set(SCREEN_X, AXIS_Y, 0.02);
screen.rotation.y = -0.82;
scene.add(screen);
const screenFrame = rectFrame(SCREEN_W + 0.04, SCREEN_H + 0.04, 0.018);
screenFrame.position.copy(screen.position);
screenFrame.rotation.copy(screen.rotation);
scene.add(screenFrame);
makePost(SCREEN_X, AXIS_Y - SCREEN_H / 2 + 0.02, 0.04);

const rippleUniforms = {
  uSlitA: shared.uSlitA,
  uSlitB: shared.uSlitB,
  uLambda: shared.uLambda,
  uCover: shared.uCover,
  uColor: shared.uColor,
  uPhase: { value: 0.65 },
  uCarrier: { value: 0.18 },
};

const rippleVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const rippleFragment = /* glsl */ `
  uniform vec3 uSlitA;
  uniform vec3 uSlitB;
  uniform float uLambda;
  uniform float uCover;
  uniform vec3 uColor;
  uniform float uPhase;
  uniform float uCarrier;
  varying vec3 vWorld;
  varying vec2 vUv;

  void main() {
    vec2 p = vWorld.xz;
    float r1 = length(p - uSlitA.xz);
    float r2 = length(p - uSlitB.xz);
    float c1 = cos(6.2831853 * r1 / uCarrier - uPhase);
    float c2 = cos(6.2831853 * r2 / uCarrier - uPhase);
    float crest1 = smoothstep(0.62, 0.98, c1);
    float crest2 = smoothstep(0.62, 0.98, c2) * (1.0 - smoothstep(0.08, 0.78, uCover));
    float lines = max(crest1, crest2);
    float delta = r2 - r1;
    float agree = cos(3.14159265 * delta / uLambda);
    float lanes = mix(0.18 + 0.82 * agree * agree, 1.0, smoothstep(0.15, 0.8, uCover));
    float meet = crest1 * crest2;
    float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
    edge *= smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    float reach = exp(-0.42 * r1);
    float alpha = lines * lanes * edge * reach;
    vec3 col = uColor * (0.45 + 0.85 * lanes + meet);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

const rippleMat = new THREE.ShaderMaterial({
  uniforms: rippleUniforms,
  vertexShader: rippleVertex,
  fragmentShader: rippleFragment,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const ripple = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 1.72, 1, 1), rippleMat);
ripple.rotation.x = -Math.PI / 2;
ripple.position.set((SLIT_X + SCREEN_X) * 0.5 + 0.06, AXIS_Y, 0.0);
ripple.renderOrder = 2;
scene.add(ripple);

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const beamMat = new THREE.MeshBasicMaterial({
  color: 0xffe2bc,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});
const beam = new THREE.Mesh(beamGeo, beamMat);
scene.add(beam);
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

const hemi = new THREE.HemisphereLight(0x6a5c4e, 0x100e14, 0.22);
scene.add(hemi);
const fill = new THREE.AmbientLight(0x2a241e, 0.05);
scene.add(fill);
const key = new THREE.SpotLight(0xfff3e4, 14, 9, 0.62, 0.42, 1.05);
key.position.copy(lamp.position);
key.target.position.set(SCREEN_X, AXIS_Y, 0);
key.castShadow = true;
key.shadow.bias = -0.0008;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
scene.add(key.target);
const rim = new THREE.PointLight(0xffe6c4, 0.85, 7, 2);
rim.position.set(1.55, 1.9, 1.35);
scene.add(rim);

const slitAWorld = new THREE.Vector3();
const slitBWorld = new THREE.Vector3();

const LiftShader = {
  name: 'LightLabSlitLift',
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
        vec2 offset = vec2(cos(a), sin(a)) * 0.0022;
        vec3 tapColor = texture2D(tDiffuse, vUv + offset).rgb;
        float lum = dot(tapColor, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(tapColor.r, max(tapColor.g, tapColor.b)) - min(tapColor.r, min(tapColor.g, tapColor.b));
        glow += tapColor * (smoothstep(0.18, 0.85, lum) + smoothstep(0.12, 0.45, sat));
      }
      gl_FragColor = vec4(base.rgb + glow * (0.045 * uGain), base.a);
    }
  `,
};

function colorWord(nm) {
  if (nm < 490) return 'Blue';
  if (nm < 560) return 'Green';
  if (nm < 600) return 'Yellow';
  return 'Red';
}

function describe() {
  const dMm = spacingMm(space.value);
  const aMm = widthMm(width.value);
  const nm = wavelengthNm(color.value);
  const yMm = fringeMm(nm, dMm);
  const hue = colorWord(nm);
  if (cover.value > 0.72) {
    return [
      'One slit is covered.',
      'The bars are gone.',
      'A single broad glow remains.',
      'Both paths are needed for the bars.',
    ].join(' ');
  }
  const parts = [
    `Slit spacing is ${dMm.toFixed(2)} mm.`,
    `Fringe spacing is about ${yMm.toFixed(1)} mm.`,
  ];
  if (space.value < 0.32) parts.push('Closer slits make the fringes wider.');
  else if (space.value > 0.7) parts.push('Wider spacing pulls the fringes closer together.');
  parts.push(`${hue} light, ${Math.round(nm)} nm.`);
  if (nm >= 620) parts.push('Red fringes are wider than blue.');
  else if (nm <= 480) parts.push('Blue fringes sit closer together than red.');
  if (width.value > 0.78) parts.push(`Slit width is ${aMm.toFixed(2)} mm. A wider slit narrows the glow around the bars.`);
  else if (width.value < 0.18) parts.push(`Slit width is ${aMm.toFixed(2)} mm. A narrow slit lets the bars fill a wide glow.`);
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

function paintRail(rail, target) {
  const t = THREE.MathUtils.clamp(target, 0, 1);
  rail.style.setProperty('--t', t.toFixed(4));
  rail.setAttribute('aria-valuenow', String(Math.round(t * 100)));
  const horizontal = rail.getBoundingClientRect().width > rail.getBoundingClientRect().height;
  rail.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
}

function applyBudget() {
  const safe = pathState.safe;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, safe ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  key.shadow.mapSize.set(safe ? 512 : 1024, safe ? 512 : 1024);
  hemi.intensity = safe ? 0.5 : 0.2;
  fill.intensity = safe ? 0.36 : 0.05;
  if (safe) destroyComposer();
  else ensureComposer();
  if (!safe) ensureEnv();
  if (!safe && composer) sizeComposer();
  publishPath();
  paintRail(spaceRail, space.target);
  paintRail(widthRail, width.target);
  paintRail(colorRail, color.target);
}

function springTo(state, dt, k, damp) {
  if (pathState.still) {
    state.value = state.target;
    state.vel = 0;
    return;
  }
  const acc = (state.target - state.value) * k - state.vel * damp;
  state.vel += acc * dt;
  state.value += state.vel * dt;
  state.value = THREE.MathUtils.clamp(state.value, -0.12, 1.12);
}

function syncSlits(forceReadout) {
  const d = spacingWorld(space.value);
  const a = widthWorld(width.value);
  const lambda = lambdaWorld(color.value);
  const half = d * 0.5;
  slitA.position.x = -half;
  slitB.position.x = half;
  haloA.position.x = -half;
  haloB.position.x = half;
  const slitW = Math.max(0.012, a);
  slitA.scale.x = slitW;
  slitB.scale.x = slitW;
  haloA.scale.x = slitW * 2.4;
  haloB.scale.x = slitW * 2.4;
  const open = 1 - THREE.MathUtils.smoothstep(cover.value, 0.05, 0.75);
  slitMatB.opacity = open;
  haloMatB.opacity = open * 0.45;
  haloMatA.opacity = 0.42;
  const slide = THREE.MathUtils.smoothstep(cover.value, 0.02, 0.9);
  shutter.position.x = half;
  shutter.position.y = THREE.MathUtils.lerp(0.86, 0, slide);
  shutter.visible = cover.value > 0.03;

  card.updateWorldMatrix(true, true);
  slitA.getWorldPosition(slitAWorld);
  slitB.getWorldPosition(slitBWorld);
  shared.uSlitA.value.copy(slitAWorld);
  shared.uSlitB.value.copy(slitBWorld);
  shared.uLambda.value = lambda;
  shared.uWidth.value = a;
  shared.uCover.value = cover.value;
  rippleUniforms.uCarrier.value = lambda * 6.4;

  const nm = wavelengthNm(color.value);
  const rgb = wavelengthRGB(nm);
  shared.uColor.value.setRGB(rgb.r, rgb.g, rgb.b);
  lampMat.color.setRGB(rgb.r, rgb.g, rgb.b).multiplyScalar(2.35);
  beamMat.color.setRGB(rgb.r, rgb.g, rgb.b);
  slitMatA.color.copy(lampMat.color);
  slitMatB.color.copy(lampMat.color);
  haloMatA.color.copy(lampMat.color);
  haloMatB.color.copy(lampMat.color);
  key.color.setRGB(rgb.r, rgb.g, rgb.b);

  beamFrom.copy(lamp.position);
  beamTo.copy(slitAWorld).add(slitBWorld).multiplyScalar(0.5);
  aimBeam(beam, beamFrom, beamTo, 0.028);
  if (liftPass) liftPass.uniforms.uGain.value = 0.55 + (1 - cover.value) * 0.35;

  const sentence = describe();
  if (forceReadout || sentence !== lastSentence) {
    lastSentence = sentence;
    readout.textContent = sentence;
  }
  const dMm = spacingMm(space.value);
  const yMm = fringeMm(nm, dMm);
  spaceRail.setAttribute('aria-valuetext', `${dMm.toFixed(2)} millimeters`);
  widthRail.setAttribute('aria-valuetext', `${widthMm(width.value).toFixed(2)} millimeters`);
  colorRail.setAttribute('aria-valuetext', `${Math.round(nm)} nanometers`);
  paintRail(spaceRail, space.target);
  paintRail(widthRail, width.target);
  paintRail(colorRail, color.target);
  document.documentElement.dataset.spacingMm = dMm.toFixed(3);
  document.documentElement.dataset.fringeMm = yMm.toFixed(2);
  document.documentElement.dataset.wavelengthNm = String(Math.round(nm));
  document.documentElement.dataset.slitWidthMm = widthMm(width.value).toFixed(3);
  document.documentElement.dataset.cover = cover.value > 0.72 ? '1' : '0';
  document.documentElement.dataset.screenM = String(L_METERS);
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
  if (pathState.still) {
    rippleUniforms.uPhase.value = 0.65;
    space.value = space.target;
    width.value = width.target;
    color.value = color.target;
    cover.value = cover.target;
    space.vel = width.vel = color.vel = cover.vel = 0;
  }
  syncSlits(true);
}

function resize() {
  pathState.safe = wantsSafe();
  frameCamera();
  applyBudget();
  syncMotion();
}

function bindRail(rail, state, step) {
  function setFromEvent(event) {
    const rect = rail.getBoundingClientRect();
    const horizontal = rect.width > rect.height;
    const t = horizontal
      ? (event.clientX - rect.left) / rect.width
      : 1 - (event.clientY - rect.top) / rect.height;
    state.target = THREE.MathUtils.clamp(t, 0, 1);
    if (pathState.still) {
      state.value = state.target;
      state.vel = 0;
    }
    syncSlits(true);
  }
  rail.addEventListener('pointerdown', (event) => {
    rail.setPointerCapture(event.pointerId);
    setFromEvent(event);
  });
  rail.addEventListener('pointermove', (event) => {
    if (!rail.hasPointerCapture(event.pointerId)) return;
    setFromEvent(event);
  });
  rail.addEventListener('keydown', (event) => {
    const amount = event.shiftKey ? step * 2 : step;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      state.target = THREE.MathUtils.clamp(state.target + amount, 0, 1);
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      state.target = THREE.MathUtils.clamp(state.target - amount, 0, 1);
      event.preventDefault();
      event.stopPropagation();
    } else {
      return;
    }
    if (pathState.still) {
      state.value = state.target;
      state.vel = 0;
    }
    syncSlits(true);
  });
}

function setCover(next) {
  cover.target = next ? 1 : 0;
  bothBtn.setAttribute('aria-pressed', next ? 'false' : 'true');
  oneBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
  if (pathState.still) {
    cover.value = cover.target;
    cover.vel = 0;
  }
  syncSlits(true);
}

bindRail(spaceRail, space, 0.04);
bindRail(widthRail, width, 0.04);
bindRail(colorRail, color, 0.04);
bothBtn.addEventListener('click', () => setCover(false));
oneBtn.addEventListener('click', () => setCover(true));

addEventListener('keydown', (event) => {
  if (event.target === spaceRail || event.target === widthRail || event.target === colorRail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'b' || event.key === 'B') {
    setCover(false);
    return;
  }
  if (event.key === 'o' || event.key === 'O') {
    setCover(true);
    return;
  }
  const amount = 0.04;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    space.target = THREE.MathUtils.clamp(space.target + amount, 0, 1);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    space.target = THREE.MathUtils.clamp(space.target - amount, 0, 1);
  } else {
    return;
  }
  if (pathState.still) {
    space.value = space.target;
    space.vel = 0;
  }
  syncSlits(true);
});

frameCamera();
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
  if (!pathState.still) {
    elapsed += dt;
    rippleUniforms.uPhase.value = 0.65 + elapsed * 1.35;
  }
  springTo(space, dt, 13, 6.2);
  springTo(width, dt, 18, 8);
  springTo(color, dt, 16, 7.4);
  springTo(cover, dt, 26, 8.5);
  controls.update();
  syncSlits(false);
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
