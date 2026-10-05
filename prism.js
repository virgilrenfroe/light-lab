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
const pathPill = document.getElementById('path-pill');
const motionPill = document.getElementById('motion-pill');
const readout = document.getElementById('readout');
const rail = document.getElementById('turn-rail');
const modeCrown = document.getElementById('mode-crown');
const modeFlint = document.getElementById('mode-flint');

// The page owns exactly one WebGLRenderer. The spectral lift reuses it.
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
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x07060c, 0.04);

const camera = new THREE.PerspectiveCamera(32, 1, 0.06, 40);
camera.position.set(0.82, 1.28, 0.9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.28, 0.74, -0.62);
controls.minDistance = 1.5;
controls.maxDistance = 7.2;
controls.minPolarAngle = 0.42;
controls.maxPolarAngle = 1.38;
controls.autoRotateSpeed = 0.26;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'filaments' : 'spectral';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'prism';

const BENCH_TOP = 0.36;
const PRISM_H = 0.68;
const PLINTH = 0.045;
const BEAM_Y = BENCH_TOP + PLINTH + PRISM_H * 0.58;
const SIDE = 0.9;
const SOURCE = { x: -1.72, z: 0 };
const YAW_MIN = THREE.MathUtils.degToRad(12);
const YAW_MAX = THREE.MathUtils.degToRad(28);
const APEX = Math.PI / 3;
const CARD_W = 1.56;
const CARD_H = 0.7;
const THROW = 1.72;

// Cauchy: n(λ) = A + B/λ². Flint's larger B opens the fan.
const GLASS = {
  crown: { name: 'Crown', A: 1.508, B: 0.0095 },
  flint: { name: 'Flint', A: 1.62, B: 0.02 },
};
const WAVES = [445, 470, 495, 515, 540, 565, 590, 620, 655];

let turnT = 0.5;
let flint = true;
const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let liftPass = null;
let outputPass = null;
let renderPass = null;
let envReady = false;

const hTri = (Math.sqrt(3) / 2) * SIDE;
const localTri = [
  { x: 0, z: (2 / 3) * hTri },
  { x: -SIDE / 2, z: -(1 / 3) * hTri },
  { x: SIDE / 2, z: -(1 / 3) * hTri },
];

function rotYaw(p, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
}
function sub2(a, b) { return { x: a.x - b.x, z: a.z - b.z }; }
function add2(a, b) { return { x: a.x + b.x, z: a.z + b.z }; }
function mul2(a, s) { return { x: a.x * s, z: a.z * s }; }
function dot2(a, b) { return a.x * b.x + a.z * b.z; }
function len2(a) { return Math.hypot(a.x, a.z); }
function norm2(a) {
  const l = len2(a) || 1;
  return { x: a.x / l, z: a.z / l };
}
function facesOf(yaw) {
  const v = localTri.map((p) => rotYaw(p, yaw));
  const faces = [];
  for (let i = 0; i < 3; i += 1) {
    const a = v[i];
    const b = v[(i + 1) % 3];
    const edge = sub2(b, a);
    let n = norm2({ x: edge.z, z: -edge.x });
    if (dot2(n, mul2(add2(a, b), 0.5)) < 0) n = mul2(n, -1);
    faces.push({ a, b, n });
  }
  return faces;
}
function hitEdge(origin, dir, face) {
  const vx = face.b.x - face.a.x;
  const vz = face.b.z - face.a.z;
  const det = dir.x * vz - dir.z * vx;
  if (Math.abs(det) < 1e-8) return null;
  const dx = face.a.x - origin.x;
  const dz = face.a.z - origin.z;
  const t = (dx * vz - dz * vx) / det;
  const u = (dx * dir.z - dz * dir.x) / det;
  if (t > 1e-4 && u >= -1e-3 && u <= 1 + 1e-3) {
    return { t, p: add2(origin, mul2(dir, t)), n: face.n };
  }
  return null;
}
function firstHit(origin, dir, faces) {
  let best = null;
  for (const face of faces) {
    const hit = hitEdge(origin, dir, face);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}
function refract2(dir, normal, eta) {
  let n = normal;
  let cosI = -dot2(dir, n);
  if (cosI < 0) {
    n = mul2(n, -1);
    cosI = -cosI;
  }
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  return norm2(add2(mul2(dir, eta), mul2(n, eta * cosI - Math.sqrt(k))));
}
function reflect2(dir, normal) {
  let n = normal;
  if (dot2(dir, n) > 0) n = mul2(n, -1);
  return norm2(sub2(dir, mul2(n, 2 * dot2(dir, n))));
}
function nOf(glass, nm) {
  const um = nm / 1000;
  return glass.A + glass.B / (um * um);
}
function traceXZ(yaw, n) {
  const faces = facesOf(yaw);
  const origin = { x: SOURCE.x, z: SOURCE.z };
  const dir = { x: 1, z: 0 };
  const enter = firstHit(origin, dir, faces);
  if (!enter) return { miss: true };
  const incidence = Math.acos(THREE.MathUtils.clamp(-dot2(dir, enter.n), -1, 1));
  const inside = refract2(dir, enter.n, 1 / n);
  if (!inside) return { miss: true, incidence };
  const exit = firstHit(add2(enter.p, mul2(inside, 0.008)), inside, faces);
  if (!exit) return { miss: true, incidence, entry: enter.p };
  const out = refract2(inside, exit.n, n);
  if (!out) {
    const bounced = reflect2(inside, exit.n);
    const third = firstHit(add2(exit.p, mul2(bounced, 0.008)), bounced, faces);
    return {
      incidence,
      entry: enter.p,
      exit: exit.p,
      tir: true,
      bounce: third ? third.p : add2(exit.p, mul2(bounced, 0.22)),
      n,
    };
  }
  return {
    incidence,
    entry: enter.p,
    exit: exit.p,
    out,
    deviation: Math.atan2(out.z, out.x),
    n,
  };
}
function deltaMin(n) {
  const i = Math.asin(Math.min(0.999, n * Math.sin(APEX / 2)));
  return 2 * i - APEX;
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

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.32, metalness: 0.82 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xfff8ee,
  roughness: 0.04,
  metalness: 0,
  transmission: 0.9,
  thickness: 0.45,
  ior: 1.62,
  transparent: true,
  opacity: 1,
  envMapIntensity: 1.05,
  clearcoat: 0.28,
  clearcoatRoughness: 0.08,
  side: THREE.DoubleSide,
});

function makePrismGeo() {
  const positions = [];
  const push = (x, y, z) => positions.push(x, y, z);
  const P = (i, top) => [localTri[i].x, top ? PRISM_H : 0, localTri[i].z];
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const a = P(i, false);
    const b = P(j, false);
    const c = P(j, true);
    const d = P(i, true);
    push(...a, ...b, ...c);
    push(...a, ...c, ...d);
  }
  const top0 = P(0, true);
  const top1 = P(1, true);
  const top2 = P(2, true);
  push(...top0, ...top2, ...top1);
  const bot0 = P(0, false);
  const bot1 = P(1, false);
  const bot2 = P(2, false);
  push(...bot0, ...bot1, ...bot2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

const room = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 5.2, 9.2),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 }),
);
room.position.set(0.15, 1.85, -0.45);
scene.add(room);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 9),
  new THREE.MeshStandardMaterial({ color: 0x100e14, roughness: 0.86, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(4.9, 0.12, 3.55),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.72, metalness: 0.08 }),
);
bench.position.set(0.05, BENCH_TOP - 0.06, -0.95);
bench.receiveShadow = true;
bench.castShadow = true;
scene.add(bench);

const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, PLINTH, pathState.safe ? 20 : 32), brass);
plinth.position.set(0, BENCH_TOP + PLINTH / 2, 0);
plinth.castShadow = true;
scene.add(plinth);

const prismGroup = new THREE.Group();
prismGroup.position.y = BENCH_TOP + PLINTH;
scene.add(prismGroup);

const prism = new THREE.Mesh(makePrismGeo(), glassMat);
prism.castShadow = true;
prismGroup.add(prism);

function makeEdgeGeo() {
  const pts = [];
  const push = (x, y, z) => pts.push(x, y, z);
  const y0 = 0.01;
  const y1 = PRISM_H - 0.01;
  for (let i = 0; i < 3; i += 1) {
    const a = localTri[i];
    const b = localTri[(i + 1) % 3];
    push(a.x, y0, a.z); push(b.x, y0, b.z);
    push(a.x, y1, a.z); push(b.x, y1, b.z);
    push(a.x, y0, a.z); push(a.x, y1, a.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}
prismGroup.add(new THREE.LineSegments(
  makeEdgeGeo(),
  new THREE.LineBasicMaterial({ color: 0xffe1b0, fog: false }),
));

function stand(x, z, topY) {
  const height = Math.max(0.06, topY - BENCH_TOP);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.028, height, 12),
    brass,
  );
  mesh.position.set(x, BENCH_TOP + height / 2, z);
  mesh.castShadow = true;
  return mesh;
}

const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.22, 16), brass);
lamp.rotation.z = Math.PI / 2;
lamp.position.set(SOURCE.x - 0.14, BEAM_Y, SOURCE.z);
lamp.castShadow = true;
scene.add(lamp);
scene.add(stand(SOURCE.x - 0.14, SOURCE.z, BEAM_Y - 0.12));

const slitMat = new THREE.MeshBasicMaterial({ color: 0xfff6e8, toneMapped: false });
slitMat.color.multiplyScalar(3.2);
const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), slitMat);
slit.position.set(SOURCE.x + 0.02, BEAM_Y, SOURCE.z);
slit.rotation.y = Math.PI / 2;
scene.add(slit);

const cardCanvas = document.createElement('canvas');
cardCanvas.width = 768;
cardCanvas.height = 384;
const cardCtx = cardCanvas.getContext('2d');
const cardTex = new THREE.CanvasTexture(cardCanvas);
cardTex.colorSpace = THREE.SRGBColorSpace;
cardTex.anisotropy = 4;

const card = new THREE.Mesh(
  new THREE.PlaneGeometry(CARD_W, CARD_H),
  new THREE.MeshBasicMaterial({ map: cardTex, toneMapped: false }),
);
scene.add(card);
const cardFrame = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W + 0.04, CARD_H + 0.04)),
  new THREE.LineBasicMaterial({ color: 0x8a6a3a }),
);
scene.add(cardFrame);
const cardPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 12), brass);
cardPost.castShadow = true;
scene.add(cardPost);

const catcher = {
  center: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  right: new THREE.Vector3(),
};

function layoutCatcher() {
  const probe = traceXZ(THREE.MathUtils.degToRad(20), nOf(GLASS.flint, 550));
  const center2 = add2(probe.exit, mul2(probe.out, THROW));
  const theta = Math.atan2(-probe.out.x, -probe.out.z);
  const right = { x: Math.cos(theta), z: -Math.sin(theta) };
  center2.x += right.x * 0.06;
  center2.z += right.z * 0.06;
  catcher.center.set(center2.x, BEAM_Y, center2.z);
  catcher.normal.set(-probe.out.x, 0, -probe.out.z).normalize();
  catcher.right.set(right.x, 0, right.z).normalize();
  card.position.copy(catcher.center);
  card.rotation.y = theta;
  cardFrame.position.copy(card.position);
  cardFrame.rotation.copy(card.rotation);
  const foot = card.position.y - CARD_H / 2;
  const drop = Math.max(0.08, foot - BENCH_TOP);
  cardPost.geometry.dispose();
  cardPost.geometry = new THREE.CylinderGeometry(0.02, 0.03, drop, 12);
  cardPost.position.set(card.position.x, BENCH_TOP + drop / 2, card.position.z);
}

function filamentMaterial(color, gain) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  material.color.multiplyScalar(gain);
  return material;
}

const whiteMat = filamentMaterial(new THREE.Color().setRGB(1, 0.97, 0.92, THREE.SRGBColorSpace), 1.25);
const rayGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
rayGeo.translate(0, 0.5, 0);
const knotGeo = new THREE.SphereGeometry(0.02, 12, 10);
const UP = new THREE.Vector3(0, 1, 0);
const aimDir = new THREE.Vector3();

function aim(mesh, from, to, radius) {
  aimDir.subVectors(to, from);
  const length = aimDir.length();
  if (length < 0.02) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  aimDir.multiplyScalar(1 / length);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(UP, aimDir);
  mesh.scale.set(radius, length, radius);
}

function liftY(p) {
  return new THREE.Vector3(p.x, BEAM_Y, p.z);
}

const incoming = new THREE.Mesh(rayGeo, whiteMat);
incoming.frustumCulled = false;
incoming.renderOrder = 4;
scene.add(incoming);

const bands = WAVES.map((nm) => {
  const rgb = wavelengthRGB(nm);
  const color = new THREE.Color().setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
  const material = filamentMaterial(color, 1.05);
  const inside = new THREE.Mesh(rayGeo, material);
  const outside = new THREE.Mesh(rayGeo, material);
  const bounce = new THREE.Mesh(rayGeo, material);
  const knot = new THREE.Mesh(knotGeo, material);
  for (const mesh of [inside, outside, bounce, knot]) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.visible = false;
    scene.add(mesh);
  }
  return { nm, rgb, material, inside, outside, bounce, knot };
});

const hemi = new THREE.HemisphereLight(0x5c5044, 0x100e14, 0.34);
const fill = new THREE.AmbientLight(0x2a241e, 0);
scene.add(hemi);
scene.add(fill);
const spot = new THREE.SpotLight(0xfff1dc, 8, 10, 0.42, 0.55, 1.2);
spot.position.set(SOURCE.x, BEAM_Y, SOURCE.z);
spot.target.position.set(0.2, BEAM_Y, -0.2);
spot.castShadow = true;
spot.shadow.bias = -0.0004;
spot.shadow.camera.near = 0.2;
spot.shadow.camera.far = 8;
scene.add(spot);
scene.add(spot.target);
const rim = new THREE.PointLight(0xffe6c4, 0.85, 9, 2);
rim.position.set(1.4, 2.15, 1.6);
scene.add(rim);

const DUST_N = 64;
const dustGeo = new THREE.BufferGeometry();
const dustBase = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i += 1) {
  const t = Math.random();
  dustBase[i * 3] = THREE.MathUtils.lerp(SOURCE.x + 0.12, -0.15, t);
  dustBase[i * 3 + 1] = BEAM_Y + (Math.random() - 0.5) * 0.06;
  dustBase[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
const dustCanvas = document.createElement('canvas');
dustCanvas.width = dustCanvas.height = 64;
const dustCtx = dustCanvas.getContext('2d');
const dustGrad = dustCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
dustGrad.addColorStop(0, 'rgba(255,246,230,1)');
dustGrad.addColorStop(0.45, 'rgba(255,220,180,0.45)');
dustGrad.addColorStop(1, 'rgba(255,220,180,0)');
dustCtx.fillStyle = dustGrad;
dustCtx.fillRect(0, 0, 64, 64);
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dustCanvas),
    color: 0xfff3e2,
    size: 0.03,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  }),
);
dust.frustumCulled = false;
scene.add(dust);

const SpectralLiftShader = {
  name: 'LightLabSpectralLift',
  uniforms: {
    tDiffuse: { value: null },
    uGain: { value: 0.62 },
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
        glow += tapColor * smoothstep(0.35, 1.15, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.065 * uGain), base.a);
    }
  `,
};

function waveOn(index) {
  if (!pathState.safe) return true;
  return index % 2 === 0;
}

function paintCard(stripes) {
  const w = cardCanvas.width;
  const h = cardCanvas.height;
  const ctx = cardCtx;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#16141c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(239, 228, 210, 0.07)';
  ctx.lineWidth = 1;
  for (let y = 28; y < h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(w - 18, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const stripe of stripes) {
    const x = (stripe.u * 0.5 + 0.5) * w;
    const rgb = `rgb(${stripe.r}, ${stripe.g}, ${stripe.b})`;
    const span = pathState.safe ? 22 : 30;
    const grad = ctx.createLinearGradient(x - span, 0, x + span, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, rgb);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - span, 24, span * 2, h - 48);
  }
  cardTex.needsUpdate = true;
}

function describe(glass, incidenceDeg, spreadDeg, nearMin, tirViolet, tirRed, anyOut) {
  const n = nOf(glass, 550).toFixed(2);
  const inc = Math.round(incidenceDeg);
  if (!anyOut) {
    return `${glass.name} · n ${n} · incidence ${inc}°. The beam reflects inside the glass. Turn back toward the face.`;
  }
  if (tirViolet && !tirRed) {
    return `${glass.name} · n ${n} · incidence ${inc}°. Violet reflects inside. Red still leaves — a shorter wavelength reaches the critical angle first.`;
  }
  const more = Math.max(1, Math.round(spreadDeg));
  if (nearMin) {
    return `${glass.name} · n ${n} · incidence ${inc}°. Near the smallest bend. Violet still turns ${more}° more than red.`;
  }
  if (glass === GLASS.crown) {
    return `${glass.name} · n ${n} · incidence ${inc}°. A milder glass. Violet bends ${more}° more than red, and the spectrum stays tight.`;
  }
  return `${glass.name} · n ${n} · incidence ${inc}°. Violet bends ${more}° more than red. The fan is open.`;
}

function commit() {
  const yaw = THREE.MathUtils.lerp(YAW_MIN, YAW_MAX, turnT);
  const glass = flint ? GLASS.flint : GLASS.crown;
  prismGroup.rotation.y = yaw;

  const half = CARD_W / 2;
  const stripes = [];
  let entry = null;
  let incidence = 0;
  let devViolet = null;
  let devRed = null;
  let tirViolet = false;
  let tirRed = false;
  let anyOut = false;

  bands.forEach((band, index) => {
    if (!waveOn(index)) {
      band.inside.visible = false;
      band.outside.visible = false;
      band.bounce.visible = false;
      band.knot.visible = false;
      return;
    }
    const hit = traceXZ(yaw, nOf(glass, band.nm));
    if (hit.miss || !hit.entry) {
      band.inside.visible = false;
      band.outside.visible = false;
      band.bounce.visible = false;
      band.knot.visible = false;
      return;
    }
    entry = hit.entry;
    incidence = hit.incidence;
    const from = liftY(hit.entry);
    const atExit = liftY(hit.exit);
    aim(band.inside, from, atExit, pathState.safe ? 0.0032 : 0.0026);

    if (hit.tir) {
      band.outside.visible = false;
      const bounced = liftY(hit.bounce);
      aim(band.bounce, atExit, bounced, 0.0034);
      band.knot.position.copy(atExit);
      band.knot.visible = true;
      if (index === 0) tirViolet = true;
      if (index === bands.length - 1) tirRed = true;
      return;
    }

    band.bounce.visible = false;
    band.knot.visible = false;
    anyOut = true;
    const devDeg = hit.deviation * 180 / Math.PI;
    if (index === 0) devViolet = devDeg;
    if (index === bands.length - 1) devRed = devDeg;

    const denom = dot2(hit.out, { x: catcher.normal.x, z: catcher.normal.z });
    let end = null;
    let onCard = false;
    if (Math.abs(denom) > 1e-4) {
      const t = dot2(
        sub2({ x: catcher.center.x, z: catcher.center.z }, hit.exit),
        { x: catcher.normal.x, z: catcher.normal.z },
      ) / denom;
      if (t > 0.05) {
        const point = add2(hit.exit, mul2(hit.out, t));
        const local = dot2(sub2(point, { x: catcher.center.x, z: catcher.center.z }), {
          x: catcher.right.x,
          z: catcher.right.z,
        });
        end = liftY(point);
        if (Math.abs(local) <= half - 0.02) {
          onCard = true;
          const u = THREE.MathUtils.clamp(local / half, -1, 1);
          const byte = (channel) => Math.round(THREE.MathUtils.clamp(channel, 0, 1) * 255);
          stripes.push({
            u,
            r: byte(band.rgb.r),
            g: byte(band.rgb.g),
            b: byte(band.rgb.b),
          });
          end.addScaledVector(catcher.normal, 0.03);
        }
      }
    }
    if (!end) end = liftY(add2(hit.exit, mul2(hit.out, 1.15)));
    if (!onCard) {
      const overshoot = liftY(add2(hit.exit, mul2(hit.out, 1.35)));
      end.copy(overshoot);
    }
    aim(band.outside, atExit, end, pathState.safe ? 0.0062 : 0.0046);
  });

  if (entry) aim(incoming, liftY({ x: SOURCE.x + 0.08, z: SOURCE.z }), liftY(entry), 0.012);
  else incoming.visible = false;

  paintCard(stripes);

  const spread = devViolet != null && devRed != null ? Math.abs(devViolet - devRed) : 0;
  const nMid = nOf(glass, 550);
  const nearMin = anyOut && Math.abs(Math.abs(traceXZ(yaw, nMid).deviation || 0) - deltaMin(nMid)) < 0.02;
  const sentence = describe(
    glass,
    incidence * 180 / Math.PI,
    spread,
    nearMin,
    tirViolet,
    tirRed,
    anyOut,
  );
  readout.textContent = sentence;
  rail.style.setProperty('--t', turnT.toFixed(4));
  rail.setAttribute('aria-valuenow', String(Math.round(turnT * 100)));
  rail.setAttribute('aria-valuetext', sentence);
  modeCrown.setAttribute('aria-pressed', flint ? 'false' : 'true');
  modeFlint.setAttribute('aria-pressed', flint ? 'true' : 'false');
  glassMat.ior = nMid;
  document.documentElement.dataset.glass = flint ? 'flint' : 'crown';
  document.documentElement.dataset.incidence = (incidence * 180 / Math.PI).toFixed(1);
  document.documentElement.dataset.spread = spread.toFixed(2);
  document.documentElement.dataset.tir = !anyOut ? 'all' : (tirViolet ? 'violet' : 'none');
  spot.target.position.set(entry ? entry.x : 0, BEAM_Y, entry ? entry.z : 0);
  spot.target.updateMatrixWorld();
}

function applyGlass() {
  const safe = pathState.safe;
  glassMat.transmission = safe ? 0 : 0.9;
  glassMat.opacity = safe ? 0.62 : 1;
  glassMat.transparent = true;
  glassMat.roughness = safe ? 0.1 : 0.04;
  glassMat.emissive = new THREE.Color(safe ? 0x3a2e22 : 0x000000);
  glassMat.emissiveIntensity = safe ? 0.18 : 0;
  glassMat.needsUpdate = true;
}

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'filaments' : 'spectral';
  document.documentElement.dataset.composer = composer ? '1' : '0';
  document.documentElement.dataset.rendererCount = '1';
  pathPill.textContent = pathState.safe ? 'Filaments' : 'Spectral lift';
}

function ensureEnv() {
  if (envReady || pathState.safe) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  envReady = true;
}

function ensureComposer() {
  // Narrow, coarse, and ?safe=1 return before EffectComposer exists.
  if (composer || pathState.safe) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  if (floatEmbed) {
    renderPass.clearColor = new THREE.Color(0x000000);
    renderPass.clearAlpha = 0;
  }
  liftPass = new ShaderPass(SpectralLiftShader);
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
  spot.shadow.mapSize.set(safe ? 512 : 1024);
  dustGeo.setDrawRange(0, safe ? 18 : DUST_N);
  hemi.intensity = safe ? 0.72 : 0.34;
  fill.intensity = safe ? 0.42 : 0;
  if (safe) destroyComposer();
  else ensureComposer();
  if (!safe) ensureEnv();
  applyGlass();
  commit();
  if (!safe && composer) sizeComposer();
  publishPath();
  const horizontal = rail.getBoundingClientRect().width > rail.getBoundingClientRect().height;
  rail.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  motionPill.textContent = pathState.still ? 'Still' : 'Live';
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
}

function resize() {
  pathState.safe = wantsSafe();
  applyBudget();
  syncMotion();
}

function setTurnFromEvent(event) {
  const rect = rail.getBoundingClientRect();
  const horizontal = rect.width > rect.height;
  const t = horizontal
    ? (event.clientX - rect.left) / rect.width
    : 1 - (event.clientY - rect.top) / rect.height;
  turnT = THREE.MathUtils.clamp(t, 0, 1);
  commit();
}

rail.addEventListener('pointerdown', (event) => {
  rail.setPointerCapture(event.pointerId);
  setTurnFromEvent(event);
});
rail.addEventListener('pointermove', (event) => {
  if (!rail.hasPointerCapture(event.pointerId)) return;
  setTurnFromEvent(event);
});
rail.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.12 : 0.05;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    turnT = Math.min(1, turnT + step);
    commit();
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    turnT = Math.max(0, turnT - step);
    commit();
    event.preventDefault();
    event.stopPropagation();
  }
});

modeCrown.addEventListener('click', () => {
  flint = false;
  commit();
});
modeFlint.addEventListener('click', () => {
  flint = true;
  commit();
});

addEventListener('keydown', (event) => {
  if (event.target === rail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'c' || event.key === 'C') {
    flint = false;
    commit();
  } else if (event.key === 'f' || event.key === 'F') {
    flint = true;
    commit();
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    turnT = Math.min(1, turnT + 0.05);
    commit();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    turnT = Math.max(0, turnT - 0.05);
    commit();
  }
});

layoutCatcher();
applyBudget();
syncMotion();

addEventListener('resize', resize);
coarseMql.addEventListener?.('change', resize);
narrowMql.addEventListener?.('change', resize);
reduceMql.addEventListener?.('change', syncMotion);
controls.addEventListener('start', () => { controls.autoRotate = false; });
controls.addEventListener('end', () => { controls.autoRotate = !pathState.still; });

const dustPos = dustGeo.attributes.position;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (!pathState.still) elapsed += dt;
  const t = elapsed;
  whiteMat.opacity = pathState.still ? 0.8 : 0.72 + Math.sin(t * 1.5) * 0.08;
  for (const band of bands) {
    band.material.opacity = pathState.still ? 0.92 : 0.84 + Math.sin(t * 1.8 + band.nm * 0.01) * 0.08;
  }
  if (!pathState.still) {
    const draw = pathState.safe ? 18 : DUST_N;
    for (let i = 0; i < draw; i += 1) {
      let x = dustBase[i * 3] + ((t * 0.1 + i * 0.01) % 1.7);
      if (x > -0.05) x -= 1.7;
      dustPos.setX(i, x);
    }
    dustPos.needsUpdate = true;
  }
  controls.update();
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
