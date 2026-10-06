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
const sunRail = document.getElementById('sun-rail');
const hazeRail = document.getElementById('haze-rail');

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
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x16325c);
scene.fog = null;

const camera = new THREE.PerspectiveCamera(34, 1, 0.06, 220);
camera.position.set(-0.15, 1.28, -2.05);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.12, 1.16, 0.35);
controls.minDistance = 1.35;
controls.maxDistance = 5.8;
controls.minPolarAngle = 0.95;
controls.maxPolarAngle = 1.86;
controls.autoRotateSpeed = 0.16;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'sky';

const ELEV_LOW = 2.5;
const ELEV_HIGH = 74;
const LAMBDA = { r: 660, g: 550, b: 440 };
const TAU_550 = 0.18;
const SOLAR = { r: 1.04, g: 1, b: 0.94 };
const NOON_MASS = airMass(ELEV_HIGH);

const sunState = { value: 0.94, vel: 0, target: 0.94 };
const hazeState = { value: 0, vel: 0, target: 0 };

const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let liftPass = null;
let renderPass = null;
let framed = false;

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.36, metalness: 0.78 });
const wood = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.86, metalness: 0.04 });
const slate = new THREE.MeshStandardMaterial({ color: 0x12141a, roughness: 0.92, metalness: 0.02 });

function rayleighFactor(nm) {
  return (550 / nm) ** 4;
}

function airMass(elevDeg) {
  const h = Math.max(0.4, elevDeg);
  const sinH = Math.sin((h * Math.PI) / 180);
  return 1 / (sinH + 0.50572 * (h + 6.07995) ** -1.6364);
}

function elevationDeg(t) {
  const shaped = THREE.MathUtils.clamp(t, 0, 1) ** 1.12;
  return THREE.MathUtils.lerp(ELEV_LOW, ELEV_HIGH, shaped);
}

function transmittance(elevDeg, haze) {
  const m = airMass(elevDeg);
  const mie = haze * 0.48 * (0.32 + 0.68 * Math.min(m, 6) / 6);
  const T = {};
  for (const ch of ['r', 'g', 'b']) {
    const tau = TAU_550 * rayleighFactor(LAMBDA[ch]) * m + mie;
    T[ch] = Math.exp(-Math.min(tau, 18));
  }
  return { T, m, mie };
}

function exposeSun(T) {
  const raw = {
    r: SOLAR.r * T.r,
    g: SOLAR.g * T.g,
    b: SOLAR.b * T.b,
  };
  const peak = Math.max(raw.r, raw.g, raw.b, 1e-4);
  const gain = Math.min(3.6, 1.12 / peak);
  return { r: raw.r * gain, g: raw.g * gain, b: raw.b * gain };
}

function lerp3(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function skyStops(elev, haze, sun) {
  const sunset = 1 - THREE.MathUtils.smoothstep(elev, 9, 50);
  const blue = { r: 0.045, g: 0.16, b: 0.62 };
  const pale = { r: 0.42, g: 0.58, b: 0.82 };
  const grey = { r: 0.58, g: 0.6, b: 0.61 };
  const wash = Math.min(1, haze * 0.94);
  let zenith = lerp3(blue, grey, wash);
  zenith = {
    r: zenith.r * (1 - sunset * 0.12),
    g: zenith.g * (1 - sunset * 0.08),
    b: zenith.b * (1 - sunset * 0.02),
  };

  const farDay = { r: 0.48, g: 0.64, b: 0.88 };
  const farSet = { r: 0.62, g: 0.22, b: 0.08 };
  let horizonFar = lerp3(farDay, farSet, sunset);
  horizonFar = lerp3(horizonFar, grey, wash);

  const nearWarm = {
    r: Math.min(1.2, sun.r * 0.9),
    g: Math.min(0.78, sun.g * 0.7),
    b: Math.min(0.32, sun.b * 0.45 + 0.02),
  };
  let horizonNear = lerp3(pale, nearWarm, Math.max(sunset, 0.12));
  horizonNear = lerp3(horizonNear, grey, Math.min(1, wash * 1.05));
  return { zenith, horizonFar, horizonNear, sunset };
}

function glassColors(sun, haze) {
  const blue = { r: 0.22, g: 0.48, b: 1.25 };
  const orange = { r: 1.35, g: 0.32, b: 0.04 };
  const warm = THREE.MathUtils.clamp((sun.r - sun.b) / Math.max(sun.r, 0.25), 0, 1);
  const milk = { r: 0.82, g: 0.84, b: 0.82 };
  const side = lerp3(lerp3(blue, sun, 0.18 + warm * 0.32), milk, haze * 0.22);
  const end = lerp3(lerp3(orange, { r: sun.r, g: sun.g * 0.5, b: sun.b * 0.12 }, warm * 0.7), milk, haze * 0.12);
  return { side, end };
}

const skyUniforms = {
  uZenith: { value: new THREE.Color() },
  uHorizonFar: { value: new THREE.Color() },
  uHorizonNear: { value: new THREE.Color() },
  uSunColor: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uHaze: { value: 0 },
  uSunset: { value: 0 },
};

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: skyUniforms,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uZenith;
    uniform vec3 uHorizonFar;
    uniform vec3 uHorizonNear;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    uniform float uHaze;
    uniform float uSunset;
    varying vec3 vDir;
    void main() {
      vec3 dir = normalize(vDir);
      vec3 sunDir = normalize(uSunDir);
      float h = dir.y;
      float mu = dot(dir, sunDir);
      float sunSide = smoothstep(-0.2, 0.82, mu);
      float up = smoothstep(-0.01, 0.42, h);
      vec3 horizon = mix(uHorizonFar, uHorizonNear, sunSide);
      vec3 col = mix(horizon, uZenith, up);
      float band = exp(-pow((h - 0.05) * 8.0, 2.0));
      col += mix(vec3(0.22, 0.3, 0.42), uSunColor, uSunset) * band * (1.0 - uHaze * 0.8) * 0.22;
      float pool = pow(max(mu, 0.0), 6.0) * smoothstep(0.22, -0.02, h);
      col += uSunColor * pool * (0.15 + uSunset * 0.95) * (1.0 - uHaze * 0.82);
      float mie = pow(max(mu, 0.0), 10.0) * uHaze;
      col = mix(col, vec3(0.88, 0.89, 0.88), clamp(mie * 1.35, 0.0, 0.9));
      float ang = acos(clamp(mu, -1.0, 1.0));
      float rad = 0.042;
      float disk = smoothstep(rad + 0.006, rad - 0.002, ang);
      float corona = exp(-pow(ang / 0.11, 2.0));
      vec3 diskCol = uSunColor * (1.55 + uSunset * 0.15 + (1.0 - uSunset) * 0.85);
      col = mix(col, diskCol, disk);
      col += uSunColor * corona * (0.22 + uHaze * 0.65) * (1.0 - uSunset * 0.35);
      col = mix(col, vec3(0.04, 0.035, 0.032), smoothstep(0.02, -0.09, h));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 48, 32), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -2;
scene.add(sky);

const hillUniforms = {
  uSunColor: skyUniforms.uSunColor,
  uSunset: skyUniforms.uSunset,
};
const hillMat = new THREE.ShaderMaterial({
  fog: false,
  uniforms: hillUniforms,
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    uniform vec3 uSunColor;
    uniform float uSunset;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 1.7);
      float crest = smoothstep(0.35, 0.95, n.y);
      vec3 base = vec3(0.055, 0.048, 0.042);
      vec3 warm = uSunColor * rim * uSunset * (0.35 + crest * 0.9);
      gl_FragColor = vec4(base + warm, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

function makeHills() {
  const geo = new THREE.PlaneGeometry(42, 14, 72, 16);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ridge =
      Math.sin(x * 0.38) * 0.28 +
      Math.sin(x * 0.15 + 0.7) * 0.42 +
      Math.sin(x * 1.05 + 2.1) * 0.08;
    const near = THREE.MathUtils.smoothstep(z, -6.2, 1.4);
    pos.setY(i, Math.max(0, ridge + 0.08) * near);
  }
  geo.computeVertexNormals();
  return geo;
}

const hills = new THREE.Mesh(makeHills(), hillMat);
hills.position.set(0, 0, 12.4);
hills.receiveShadow = true;
scene.add(hills);

const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 2.6), wood);
deck.position.set(0.15, 0.7, -0.85);
deck.receiveShadow = true;
deck.castShadow = true;
scene.add(deck);

const lip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.04, 0.05), brass);
lip.position.set(0.15, 0.76, 0.42);
scene.add(lip);

for (const x of [-1.55, 1.7]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.36, 0.055), brass);
  post.position.set(x, 0.92, 0.38);
  post.castShadow = true;
  scene.add(post);
}
const hand = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.03, 0.03), brass);
hand.position.set(0.08, 1.08, 0.38);
scene.add(hand);

const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.03), slate);
board.position.set(0.46, 1.02, -0.22);
board.receiveShadow = true;
scene.add(board);

const glassUniforms = {
  uSide: { value: new THREE.Color(0.2, 0.45, 1) },
  uEnd: { value: new THREE.Color(1, 0.4, 0.05) },
  uSunColor: skyUniforms.uSunColor,
};

const liquidMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
  uniforms: glassUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vLocal;
    void main() {
      vUv = uv;
      vLocal = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSide;
    uniform vec3 uEnd;
    uniform vec3 uSunColor;
    varying vec2 vUv;
    varying vec3 vLocal;
    void main() {
      float along = clamp(vUv.y, 0.0, 1.0);
      float radial = length(vLocal.xz);
      float core = exp(-pow(radial / 0.034, 2.0));
      float shell = smoothstep(0.072, 0.02, radial);
      vec3 side = uSide * (1.7 - along * 0.55);
      vec3 col = mix(side, uEnd, smoothstep(0.62, 1.0, along));
      col = mix(col, uSunColor, core * (1.0 - along) * 0.45);
      col += uSide * core * 1.8;
      float alpha = shell * (0.38 + core * 0.62);
      if (alpha < 0.02) discard;
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const glassGroup = new THREE.Group();
glassGroup.position.set(0.46, 0.98, -0.62);
scene.add(glassGroup);

const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 40, 1, true), liquidMat);
liquid.rotation.z = Math.PI / 2;
liquid.renderOrder = 3;
glassGroup.add(liquid);

const shellMat = new THREE.MeshStandardMaterial({
  color: 0xd5dee8,
  roughness: 0.08,
  metalness: 0.04,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
});
const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.5, 32), shellMat);
shell.rotation.z = Math.PI / 2;
shell.renderOrder = 2;
glassGroup.add(shell);

const rimGeo = new THREE.TorusGeometry(0.105, 0.009, 8, 28);
const rimIn = new THREE.Mesh(rimGeo, brass);
rimIn.rotation.y = Math.PI / 2;
rimIn.position.x = -0.25;
glassGroup.add(rimIn);
const rimOut = rimIn.clone();
rimOut.position.x = 0.25;
glassGroup.add(rimOut);

const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.028, 24), brass);
coaster.position.set(0.46, 0.77, -0.62);
coaster.castShadow = true;
scene.add(coaster);

const cardUniforms = { uEnd: glassUniforms.uEnd };
const cardMat = new THREE.ShaderMaterial({
  fog: false,
  uniforms: cardUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uEnd;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float spot = exp(-dot(p, p) * 10.0);
      vec3 paper = vec3(0.93, 0.86, 0.74);
      vec3 col = mix(paper * 0.62, uEnd * 1.25, spot);
      float edge = smoothstep(0.5, 0.42, max(abs(p.x), abs(p.y)));
      gl_FragColor = vec4(col * edge, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const card = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.34), cardMat);
card.position.set(0.92, 0.98, -0.62);
card.renderOrder = 2;
scene.add(card);

const beamMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
  uniforms: { uSunColor: skyUniforms.uSunColor },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vLocal;
    void main() {
      vUv = uv;
      vLocal = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSunColor;
    varying vec2 vUv;
    varying vec3 vLocal;
    void main() {
      float core = exp(-pow(length(vLocal.xz) / 0.02, 2.0));
      float along = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
      vec3 col = uSunColor * core * along * 1.35;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 1.25, 16, 1, true), beamMat);
beam.rotation.z = Math.PI / 2;
beam.position.set(-0.42, 0.98, -0.62);
beam.renderOrder = 2;
scene.add(beam);

const cloudMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  fog: false,
  uniforms: {
    uHaze: skyUniforms.uHaze,
    uAlpha: { value: 0.34 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    uniform float uHaze;
    uniform float uAlpha;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float fres = pow(clamp(dot(n, viewDir), 0.0, 1.0), 0.65);
      float puff = smoothstep(0.08, 0.72, fres);
      vec3 white = vec3(0.96, 0.97, 0.98);
      vec3 grey = vec3(0.58, 0.6, 0.62);
      vec3 col = mix(white, grey, smoothstep(0.45, 1.0, uHaze));
      float alpha = puff * uAlpha;
      if (alpha < 0.03) discard;
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const cloudLayout = [
  { p: [-2.4, 2.8, 3.2], s: [1.7, 0.5, 1.05] },
  { p: [-0.6, 3.5, 4.6], s: [1.9, 0.55, 1.2] },
  { p: [2.6, 3.1, 5.2], s: [1.4, 0.42, 0.9] },
  { p: [-4.2, 2.3, 6.4], s: [1.5, 0.42, 1.0] },
];
const clouds = cloudLayout.map((item, i) => {
  const segs = 18;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segs, 12), cloudMat);
  mesh.position.set(item.p[0], item.p[1], item.p[2]);
  mesh.scale.set(item.s[0], item.s[1], item.s[2]);
  mesh.renderOrder = 1;
  mesh.userData.base = mesh.position.clone();
  mesh.userData.phase = i * 1.7;
  cloudGroup.add(mesh);
  return mesh;
});

const MOTE_N = 42;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(MOTE_N * 3);
const moteBase = new Float32Array(MOTE_N * 3);
for (let i = 0; i < MOTE_N; i++) {
  const x = -0.15 + Math.random() * 0.85;
  const y = 0.86 + Math.random() * 0.28;
  const z = -0.72 + Math.random() * 0.2;
  moteBase.set([x, y, z], i * 3);
  motePos.set([x, y, z], i * 3);
}
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const moteMat = new THREE.PointsMaterial({
  color: 0x8eb6ff,
  size: 0.018,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
scene.add(motes);

const hemi = new THREE.HemisphereLight(0x8eb7e8, 0x1a140e, 0.42);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 0.4;
sunLight.shadow.camera.far = 18;
sunLight.shadow.camera.left = -3;
sunLight.shadow.camera.right = 3;
sunLight.shadow.camera.top = 3;
sunLight.shadow.camera.bottom = -3;
sunLight.shadow.bias = -0.0008;
scene.add(sunLight);
scene.add(sunLight.target);
const fill = new THREE.DirectionalLight(0xc5d4e8, 0.18);
fill.position.set(-1.4, 1.6, -1.2);
scene.add(fill);

const sunDir = new THREE.Vector3();

function formatTimes(times) {
  const n = times >= 10 ? Math.round(times) : Math.round(times * 10) / 10;
  return n === 1 ? '1 time' : `${n} times`;
}

function describe(elev, haze, times) {
  const path = times < 1.25
    ? 'The path through the air is about as short as it gets.'
    : `The path is about ${formatTimes(times)} longer than when the sun is high.`;
  let color;
  if (haze > 0.62) {
    color = 'Larger particles scatter every color about the same. The sky goes white or grey, and the clouds look white.';
  } else if (elev < 12) {
    color = haze > 0.28
      ? 'Blue has left the direct beam, so the sun is red. Haze lays a white veil over that red.'
      : 'Blue has left the direct beam. The sun and the sky beside it turn orange and red. Overhead, the sky stays blue.';
  } else if (elev < 32) {
    color = haze > 0.28
      ? 'The sun is turning warm. Haze adds a pale veil, and the clouds look white.'
      : 'The longer path takes more blue out of the beam. The sun turns orange. Overhead stays blue.';
  } else if (haze > 0.28) {
    color = 'Larger particles add a pale veil. The blue of the sky starts to wash out, and the clouds look white.';
  } else {
    color = 'Blue scatters out of the beam. The sky is blue, and the sun stays pale.';
  }
  return `${path} ${color}`;
}

function paintRail(rail, t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  rail.style.setProperty('--t', clamped.toFixed(3));
  rail.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
}

let lastSentence = '';

function syncScene() {
  const elev = elevationDeg(sunState.value);
  const haze = THREE.MathUtils.clamp(hazeState.value, 0, 1);
  const { T, m } = transmittance(elev, haze);
  const sun = exposeSun(T);
  const stops = skyStops(elev, haze, sun);
  const glass = glassColors(sun, haze);
  const az = 0.36;
  const visual = THREE.MathUtils.lerp(0.055, 0.38, sunState.value ** 0.85);
  sunDir.set(Math.sin(az) * Math.cos(visual), Math.sin(visual), Math.cos(az) * Math.cos(visual)).normalize();

  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uSunColor.value.setRGB(sun.r, sun.g, sun.b);
  skyUniforms.uZenith.value.setRGB(stops.zenith.r, stops.zenith.g, stops.zenith.b);
  skyUniforms.uHorizonFar.value.setRGB(stops.horizonFar.r, stops.horizonFar.g, stops.horizonFar.b);
  skyUniforms.uHorizonNear.value.setRGB(stops.horizonNear.r, stops.horizonNear.g, stops.horizonNear.b);
  skyUniforms.uHaze.value = haze;
  skyUniforms.uSunset.value = stops.sunset;
  glassUniforms.uSide.value.setRGB(glass.side.r, glass.side.g, glass.side.b);
  glassUniforms.uEnd.value.setRGB(glass.end.r, glass.end.g, glass.end.b);

  const times = m / NOON_MASS;
  const sentence = describe(elev, haze, times);
  if (sentence !== lastSentence) {
    lastSentence = sentence;
    readout.textContent = sentence;
  }
  paintRail(sunRail, sunState.target);
  paintRail(hazeRail, hazeState.target);
  sunRail.setAttribute('aria-valuetext', sentence);
  hazeRail.setAttribute('aria-valuetext', sentence);

  const e = (elev * Math.PI) / 180;
  sunLight.position.copy(sunDir).multiplyScalar(9);
  sunLight.target.position.set(-0.02, 0.9, 0.2);
  sunLight.color.setRGB(sun.r, sun.g, sun.b);
  sunLight.intensity = THREE.MathUtils.lerp(0.28, 1.25, Math.sin(e)) * (1 - haze * 0.4);
  hemi.color.setRGB(stops.zenith.r, stops.zenith.g, stops.zenith.b);
  hemi.intensity = 0.28 + (1 - haze) * 0.22;
  cloudMat.uniforms.uAlpha.value = 0.42 + haze * 0.5;
  moteMat.color.setRGB(glass.side.r, glass.side.g, glass.side.b);
  moteMat.opacity = pathState.still ? 0.75 : 0.55 + (1 - haze) * 0.3;

  document.documentElement.dataset.elev = elev.toFixed(1);
  document.documentElement.dataset.haze = haze.toFixed(2);
  document.documentElement.dataset.airmass = m.toFixed(2);
  document.documentElement.dataset.sun = `${sun.r.toFixed(2)},${sun.g.toFixed(2)},${sun.b.toFixed(2)}`;
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
  state.value = THREE.MathUtils.clamp(state.value, -0.04, 1.04);
}

const SkyLiftShader = {
  name: 'LightLabSkyLift',
  uniforms: {
    tDiffuse: { value: null },
    uGain: { value: 0.55 },
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
        vec2 offset = vec2(cos(a), sin(a)) * 0.0034;
        vec3 tapColor = texture2D(tDiffuse, vUv + offset).rgb;
        float lum = dot(tapColor, vec3(0.2126, 0.7152, 0.0722));
        glow += tapColor * smoothstep(0.45, 1.15, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.055 * uGain), base.a);
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
  liftPass = new ShaderPass(SkyLiftShader);
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
  if (narrow) {
    camera.fov = 56;
    camera.position.set(0.12, 0.86, -2.15);
    controls.target.set(0.22, 1.28, 0.35);
  } else {
    camera.fov = 48;
    camera.position.set(-0.08, 0.9, -2.35);
    controls.target.set(0.18, 1.28, 0.45);
  }
  camera.updateProjectionMatrix();
  controls.update();
  framed = true;
}

function applyBudget() {
  const safe = pathState.safe;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, safe ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  sunLight.shadow.mapSize.set(safe ? 512 : 1024, safe ? 512 : 1024);
  moteGeo.setDrawRange(0, safe ? 14 : MOTE_N);
  clouds.forEach((mesh, i) => {
    mesh.visible = !safe || i < 3;
  });
  if (safe) destroyComposer();
  else ensureComposer();
  frameCamera(false);
  syncScene();
  if (!safe && composer) sizeComposer();
  publishPath();
  for (const rail of [sunRail, hazeRail]) {
    const horizontal = rail.getBoundingClientRect().width > rail.getBoundingClientRect().height;
    rail.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
  }
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
  if (pathState.still) {
    sunState.value = sunState.target;
    hazeState.value = hazeState.target;
    sunState.vel = hazeState.vel = 0;
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

function setFromEvent(rail, state, event) {
  const rect = rail.getBoundingClientRect();
  const horizontal = rect.width > rect.height;
  const t = horizontal
    ? (event.clientX - rect.left) / rect.width
    : 1 - (event.clientY - rect.top) / rect.height;
  state.target = THREE.MathUtils.clamp(t, 0, 1);
  if (pathState.still) {
    state.value = state.target;
    state.vel = 0;
    syncScene();
  }
}

function bindRail(rail, state) {
  rail.addEventListener('pointerdown', (event) => {
    rail.setPointerCapture(event.pointerId);
    setFromEvent(rail, state, event);
  });
  rail.addEventListener('pointermove', (event) => {
    if (!rail.hasPointerCapture(event.pointerId)) return;
    setFromEvent(rail, state, event);
  });
  rail.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.12 : 0.05;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      state.target = Math.min(1, state.target + step);
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      state.target = Math.max(0, state.target - step);
      event.preventDefault();
      event.stopPropagation();
    } else return;
    if (pathState.still) {
      state.value = state.target;
      state.vel = 0;
      syncScene();
    }
  });
}

bindRail(sunRail, sunState);
bindRail(hazeRail, hazeState);

function setSun(t) {
  sunState.target = t;
  if (pathState.still) {
    sunState.value = t;
    sunState.vel = 0;
    syncScene();
  }
}
function setHaze(t) {
  hazeState.target = t;
  if (pathState.still) {
    hazeState.value = t;
    hazeState.vel = 0;
    syncScene();
  }
}

addEventListener('keydown', (event) => {
  if (event.target === sunRail || event.target === hazeRail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'n' || event.key === 'N') setSun(0.94);
  else if (event.key === 'l' || event.key === 'L') setSun(0);
  else if (event.key === 'c' || event.key === 'C') setHaze(0);
  else if (event.key === 'h' || event.key === 'H') setHaze(0.88);
  else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    sunState.target = Math.min(1, sunState.target + 0.05);
    if (pathState.still) setSun(sunState.target);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    sunState.target = Math.max(0, sunState.target - 0.05);
    if (pathState.still) setSun(sunState.target);
  }
});

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
  springTo(sunState, dt, 12, 5.2);
  springTo(hazeState, dt, 14, 5.6);
  syncScene();
  cloudMat.uniforms.uTime.value = elapsed;
  if (!pathState.still) {
    for (const mesh of clouds) {
      const wobble = Math.sin(elapsed * 0.15 + mesh.userData.phase) * 0.18;
      mesh.position.x = mesh.userData.base.x + wobble;
    }
    const draw = pathState.safe ? 14 : MOTE_N;
    for (let i = 0; i < draw; i++) {
      const rise = (elapsed * 0.06 + i * 0.017) % 0.34;
      moteAttr.setXYZ(
        i,
        moteBase[i * 3] + Math.sin(elapsed * 0.4 + i) * 0.01,
        moteBase[i * 3 + 1] + rise,
        moteBase[i * 3 + 2],
      );
    }
    moteAttr.needsUpdate = true;
  }
  controls.update();
  sky.position.copy(camera.position);
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
