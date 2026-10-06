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
const rail = document.getElementById('shape-rail');
const modeConvex = document.getElementById('mode-convex');
const modeConcave = document.getElementById('mode-concave');

// The page owns exactly one WebGLRenderer. The heat pass reuses it.
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
scene.fog = new THREE.FogExp2(0x07060c, 0.042);

const camera = new THREE.PerspectiveCamera(34, 1, 0.06, 40);
camera.position.set(2.35, 1.38, 1.72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.12, 0.78, 0);
controls.minDistance = 1.8;
controls.maxDistance = 6.8;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = 1.48;
controls.autoRotateSpeed = 0.28;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'filaments' : 'heat';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';

const APERTURE = 0.34;
const BOW_MIN = 0.026;
const BOW_MAX = 0.13;
const N_MINUS = 0.52;
const AXIS_Y = 0.92;
const SOURCE_X = -1.55;
const SCREEN_X = 1.42;
const FAR_X = 2.22;
const RHO_LIMIT = 0.78;
const BENCH_TOP = 0.14;

const RAYS = [
  { y: -0.22, z: 0 },
  { y: -0.15, z: 0 },
  { y: -0.08, z: 0 },
  { y: 0, z: 0 },
  { y: 0.08, z: 0 },
  { y: 0.15, z: 0 },
  { y: 0.22, z: 0 },
  { y: 0, z: -0.16 },
  { y: 0, z: -0.08 },
  { y: 0, z: 0.08 },
  { y: 0, z: 0.16 },
];

let bowT = 0.47;
let convex = true;
const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let heatPass = null;
let outputPass = null;
let renderPass = null;
let envReady = false;

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.32, metalness: 0.82 });
const stone = new THREE.MeshStandardMaterial({ color: 0x16141c, roughness: 0.9, metalness: 0.04 });

const lensMat = new THREE.MeshPhysicalMaterial({
  color: 0xfff8ee,
  roughness: 0.04,
  metalness: 0,
  transmission: 0.92,
  thickness: 0.22,
  ior: 1.52,
  transparent: true,
  opacity: 1,
  envMapIntensity: 1.1,
  clearcoat: 0.35,
  clearcoatRoughness: 0.08,
  side: THREE.DoubleSide,
});

function focalLength(bow) {
  const radius = (APERTURE * APERTURE + bow * bow) / (2 * bow);
  return radius / (2 * N_MINUS);
}

function pointAt(x, y0, z0, f) {
  const k = 1 - x / f;
  return new THREE.Vector3(x, AXIS_Y + y0 * k, z0 * k);
}

function outgoingEnd(y0, z0, f) {
  const rho = Math.hypot(y0, z0);
  if (rho < 1e-4) return FAR_X;
  const x = f > 0 ? f * (1 + RHO_LIMIT / rho) : f * (1 - RHO_LIMIT / rho);
  if (!Number.isFinite(x) || x < 0.18) return FAR_X;
  return Math.min(FAR_X, Math.max(0.18, x));
}

function makeLensGeo(bow, isConvex) {
  const steps = pathState.safe ? 16 : 26;
  const segs = pathState.safe ? 24 : 40;
  const pts = [];
  const yOf = (r) => {
    const t = (r / APERTURE) ** 2;
    return isConvex ? 0.012 + bow * (1 - t) : 0.014 + bow * t;
  };
  for (let i = 0; i <= steps; i++) {
    const r = (APERTURE * i) / steps;
    pts.push(new THREE.Vector2(Math.max(r, 0.0015), yOf(r)));
  }
  for (let i = steps - 1; i >= 0; i--) {
    const r = (APERTURE * i) / steps;
    pts.push(new THREE.Vector2(Math.max(r, 0.0015), -yOf(r)));
  }
  const geo = new THREE.LatheGeometry(pts, segs);
  geo.computeVertexNormals();
  return geo;
}

const room = new THREE.Mesh(
  new THREE.BoxGeometry(8.2, 4.6, 8),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 })
);
room.position.set(0.2, 1.7, 0.15);
scene.add(room);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: 0x100e14, roughness: 0.86, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(4.55, 0.12, 1.05),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.72, metalness: 0.08 })
);
bench.position.set(0.28, BENCH_TOP - 0.06, 0);
bench.receiveShadow = true;
bench.castShadow = true;
scene.add(bench);

const slate = new THREE.Mesh(
  new THREE.PlaneGeometry(4.6, 2.25),
  new THREE.MeshStandardMaterial({ color: 0x121018, roughness: 0.94, metalness: 0.02 })
);
slate.position.set(0.25, 1.02, -1.08);
slate.receiveShadow = true;
scene.add(slate);

const axisGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(SOURCE_X - 0.2, AXIS_Y, 0),
  new THREE.Vector3(FAR_X + 0.08, AXIS_Y, 0),
]);
scene.add(new THREE.Line(
  axisGeo,
  new THREE.LineBasicMaterial({ color: 0x8d8274, transparent: true, opacity: 0.55 })
));

for (let x = -1; x <= 2.001; x += 0.5) {
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.09), brass);
  tick.position.set(x, BENCH_TOP + 0.02, 0.34);
  scene.add(tick);
}

function stand(x, topY, radiusTop = 0.02) {
  const height = Math.max(0.08, topY - BENCH_TOP);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusTop + 0.008, height, 12),
    brass
  );
  mesh.position.set(x, BENCH_TOP + height / 2, 0);
  mesh.castShadow = true;
  return mesh;
}

scene.add(stand(0, AXIS_Y - APERTURE - 0.012, 0.022));
scene.add(stand(SCREEN_X, AXIS_Y - 0.52, 0.02));
scene.add(stand(SOURCE_X - 0.08, AXIS_Y - 0.14, 0.028));

const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.24, 16), brass);
lamp.rotation.z = Math.PI / 2;
lamp.position.set(SOURCE_X - 0.16, AXIS_Y, 0);
lamp.castShadow = true;
scene.add(lamp);

const slitMat = new THREE.MeshBasicMaterial({ color: 0xfff6e4 });
slitMat.color.multiplyScalar(4.2);
const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.52), slitMat);
slit.position.set(SOURCE_X + 0.02, AXIS_Y, 0);
slit.rotation.y = Math.PI / 2;
scene.add(slit);

const lens = new THREE.Mesh(makeLensGeo(0.07, true), lensMat);
lens.position.set(0, AXIS_Y, 0);
lens.rotation.z = -Math.PI / 2;
lens.castShadow = true;
scene.add(lens);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(APERTURE + 0.02, 0.013, 8, 36),
  brass
);
ring.position.set(0, AXIS_Y, 0);
ring.rotation.y = Math.PI / 2;
ring.castShadow = true;
scene.add(ring);

const screenUniforms = {
  uTime: { value: 0 },
  uRadius: { value: 0.22 },
};
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(0.92, 1.04),
  new THREE.ShaderMaterial({
    fog: false,
    uniforms: screenUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uRadius;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float rad = max(uRadius, 0.018);
        float spot = smoothstep(rad, rad * 0.2, r);
        float core = smoothstep(rad * 0.42, 0.0, r);
        float axis = smoothstep(0.012, 0.0, abs(p.x)) + smoothstep(0.012, 0.0, abs(p.y));
        vec3 paper = vec3(0.045, 0.04, 0.036);
        vec3 hot = vec3(1.55, 0.74, 0.28);
        vec3 col = paper + hot * (spot * 0.9 + core * 0.55) + vec3(0.2, 0.15, 0.09) * axis * 0.28;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
);
screen.position.set(SCREEN_X, AXIS_Y, 0);
screen.rotation.y = Math.PI / 2 - 0.5;
scene.add(screen);

const screenFrame = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.98, 1.1)),
  new THREE.LineBasicMaterial({ color: 0x8a6a3a })
);
screenFrame.position.copy(screen.position);
screenFrame.rotation.copy(screen.rotation);
scene.add(screenFrame);

function filament(hex, gain, opacity) {
  const material = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  material.color.multiplyScalar(gain);
  return material;
}

const inMat = filament(0xfff6e8, 1.45, 0.55);
const outMat = filament(0xffc56a, 1.85, 0.92);
const pastMat = filament(0xffc56a, 1.05, 0.32);
const rayGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
rayGeo.translate(0, 0.5, 0);

const dashMat = new THREE.LineDashedMaterial({
  color: 0xd7c4a4,
  dashSize: 0.045,
  gapSize: 0.032,
  transparent: true,
  opacity: 0.7,
});

const incoming = [];
const toFocus = [];
const pastFocus = [];
const virtuals = [];
const UP = new THREE.Vector3(0, 1, 0);
const aimDir = new THREE.Vector3();

function aim(mesh, from, to, radius) {
  aimDir.subVectors(to, from);
  const length = aimDir.length();
  if (length < 0.025) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  aimDir.multiplyScalar(1 / length);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(UP, aimDir);
  mesh.scale.set(radius, length, radius);
}

for (let i = 0; i < RAYS.length; i++) {
  const a = new THREE.Mesh(rayGeo, inMat);
  const b = new THREE.Mesh(rayGeo, outMat);
  const c = new THREE.Mesh(rayGeo, pastMat);
  a.renderOrder = b.renderOrder = c.renderOrder = 2;
  a.frustumCulled = b.frustumCulled = c.frustumCulled = false;
  scene.add(a, b, c);
  incoming.push(a);
  toFocus.push(b);
  pastFocus.push(c);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, dashMat);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  virtuals.push(line);
}

const focusKnot = new THREE.Mesh(
  new THREE.SphereGeometry(0.035, 16, 12),
  filament(0xffe2b0, 2.4, 0.95)
);
focusKnot.frustumCulled = false;
scene.add(focusKnot);

const focusRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.07, 0.006, 8, 28),
  new THREE.MeshBasicMaterial({ color: 0xffb15a })
);
focusRing.rotation.y = Math.PI / 2;
scene.add(focusRing);

const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 64;
const glowCtx = glowCanvas.getContext('2d');
const glowGrad = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
glowGrad.addColorStop(0, 'rgba(255,220,170,0.95)');
glowGrad.addColorStop(0.35, 'rgba(255,120,40,0.35)');
glowGrad.addColorStop(1, 'rgba(255,80,20,0)');
glowCtx.fillStyle = glowGrad;
glowCtx.fillRect(0, 0, 64, 64);
const focusGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: new THREE.CanvasTexture(glowCanvas),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.85,
}));
focusGlow.scale.set(0.42, 0.42, 1);
scene.add(focusGlow);

const focusLight = new THREE.PointLight(0xffc58a, 1.5, 1.8, 2);
scene.add(focusLight);

scene.add(new THREE.HemisphereLight(0x4a4038, 0x07060c, 0.3));
const spot = new THREE.SpotLight(0xffe2b4, 7, 9, 0.38, 0.6, 1.4);
spot.position.set(SOURCE_X - 0.05, AXIS_Y, 0);
spot.target.position.set(SCREEN_X, AXIS_Y, 0);
spot.castShadow = true;
spot.shadow.bias = -0.0004;
spot.shadow.camera.near = 0.2;
spot.shadow.camera.far = 8;
scene.add(spot);
scene.add(spot.target);
const rim = new THREE.PointLight(0xffe6c4, 0.9, 8, 2);
rim.position.set(1.5, 2.2, 2.3);
scene.add(rim);

const DUST_N = 70;
const dustGeo = new THREE.BufferGeometry();
const dustBase = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) {
  const t = Math.random();
  dustBase[i * 3] = THREE.MathUtils.lerp(SOURCE_X + 0.1, SCREEN_X - 0.05, t);
  dustBase[i * 3 + 1] = AXIS_Y + (Math.random() - 0.5) * 0.22 * (0.4 + t);
  dustBase[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
const dustCanvas = document.createElement('canvas');
dustCanvas.width = dustCanvas.height = 64;
const dustCtx = dustCanvas.getContext('2d');
const dustGrad = dustCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
dustGrad.addColorStop(0, 'rgba(255,244,220,1)');
dustGrad.addColorStop(0.45, 'rgba(255,190,120,0.4)');
dustGrad.addColorStop(1, 'rgba(255,190,120,0)');
dustCtx.fillStyle = dustGrad;
dustCtx.fillRect(0, 0, 64, 64);
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dustCanvas),
    color: 0xffe6c0,
    size: 0.035,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  })
);
dust.frustumCulled = false;
scene.add(dust);

const HeatLiftShader = {
  name: 'LightLabHeatLift',
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
        vec2 offset = vec2(cos(a), sin(a)) * 0.0035;
        vec3 tapColor = texture2D(tDiffuse, vUv + offset).rgb;
        float lum = dot(tapColor, vec3(0.2126, 0.7152, 0.0722));
        glow += tapColor * smoothstep(0.45, 1.35, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.07 * uGain), base.a);
    }
  `,
};

function describe(fSigned, bow) {
  const mag = Math.abs(fSigned).toFixed(2);
  const bowText = bow.toFixed(2);
  if (fSigned < 0) {
    return `Concave · bow ${bowText} · virtual f ≈ ${mag}. Rays spread. The focus sits behind the glass.`;
  }
  if (Math.abs(SCREEN_X - fSigned) < 0.12) {
    return `Convex · bow ${bowText} · f ≈ ${mag}. The focus lands on the card. The spot tightens.`;
  }
  if (fSigned < SCREEN_X) {
    return `Convex · bow ${bowText} · f ≈ ${mag}. Outer rays meet in front of the card, then spread.`;
  }
  return `Convex · bow ${bowText} · f ≈ ${mag}. A weaker bow. Those rays would meet past the card.`;
}

function updateRays(bow, isConvex) {
  const magnitude = focalLength(bow);
  const f = isConvex ? magnitude : -magnitude;
  const showDepth = !pathState.safe;

  RAYS.forEach((ray, i) => {
    const use = showDepth || ray.z === 0;
    if (!use) {
      incoming[i].visible = false;
      toFocus[i].visible = false;
      pastFocus[i].visible = false;
      virtuals[i].visible = false;
      return;
    }
    const from = new THREE.Vector3(SOURCE_X + 0.05, AXIS_Y + ray.y, ray.z);
    const atLens = new THREE.Vector3(-0.04, AXIS_Y + ray.y, ray.z);
    aim(incoming[i], from, atLens, 0.0065);

    const endX = outgoingEnd(ray.y, ray.z, f);
    const startOut = pointAt(0.05, ray.y, ray.z, f);
    if (isConvex) {
      virtuals[i].visible = false;
      if (f >= endX - 0.03) {
        aim(toFocus[i], startOut, pointAt(endX, ray.y, ray.z, f), 0.0075);
        pastFocus[i].visible = false;
      } else {
        const atFocus = new THREE.Vector3(f, AXIS_Y, 0);
        aim(toFocus[i], startOut, atFocus, 0.008);
        aim(pastFocus[i], atFocus, pointAt(endX, ray.y, ray.z, f), 0.0055);
      }
    } else {
      pastFocus[i].visible = false;
      aim(toFocus[i], startOut, pointAt(endX, ray.y, ray.z, f), 0.0065);
      const positions = virtuals[i].geometry.attributes.position;
      const virtualX = Math.max(SOURCE_X - 0.15, f);
      positions.setXYZ(0, -0.02, AXIS_Y + ray.y, ray.z);
      positions.setXYZ(1, virtualX, AXIS_Y, 0);
      positions.needsUpdate = true;
      virtuals[i].computeLineDistances();
      virtuals[i].visible = true;
    }
  });

  const pinX = THREE.MathUtils.clamp(f, SOURCE_X - 0.05, FAR_X);
  focusKnot.position.set(isConvex ? pinX : pinX, AXIS_Y, 0);
  focusKnot.visible = isConvex;
  focusRing.position.set(pinX, AXIS_Y, 0);
  focusGlow.position.set(pinX, AXIS_Y, 0);
  focusGlow.material.opacity = isConvex ? 0.85 : 0.28;
  focusLight.position.set(pinX, AXIS_Y, 0.02);
  focusLight.visible = isConvex && f > 0.2 && f < FAR_X + 0.05;

  const marginal = 0.22 * (1 - SCREEN_X / f);
  screenUniforms.uRadius.value = THREE.MathUtils.clamp(Math.abs(marginal) / 1.04, 0.02, 0.58);

  const sentence = describe(f, bow);
  readout.textContent = sentence;
  rail.style.setProperty('--t', bowT.toFixed(4));
  rail.setAttribute('aria-valuenow', String(Math.round(bowT * 100)));
  rail.setAttribute('aria-valuetext', sentence);
  document.documentElement.dataset.focal = f.toFixed(3);
  document.documentElement.dataset.lens = isConvex ? 'convex' : 'concave';
}

function applyGlass() {
  const safe = pathState.safe;
  lensMat.transmission = safe ? 0 : 0.92;
  lensMat.opacity = safe ? 0.78 : 1;
  lensMat.transparent = true;
  lensMat.roughness = safe ? 0.08 : 0.04;
  lensMat.emissive = new THREE.Color(safe ? 0x3a2a18 : 0x000000);
  lensMat.emissiveIntensity = safe ? 0.2 : 0;
  lensMat.needsUpdate = true;
}

function commitShape() {
  const bow = THREE.MathUtils.lerp(BOW_MIN, BOW_MAX, bowT);
  const next = makeLensGeo(bow, convex);
  lens.geometry.dispose();
  lens.geometry = next;
  applyGlass();
  updateRays(bow, convex);
  modeConvex.setAttribute('aria-pressed', convex ? 'true' : 'false');
  modeConcave.setAttribute('aria-pressed', convex ? 'false' : 'true');
}

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'filaments' : 'heat';
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
  // Narrow, coarse, and ?safe=1 return before EffectComposer exists.
  if (composer || pathState.safe) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  if (floatEmbed) {
    renderPass.clearColor = new THREE.Color(0x000000);
    renderPass.clearAlpha = 0;
  }
  heatPass = new ShaderPass(HeatLiftShader);
  outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(heatPass);
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
  heatPass = null;
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
  dustGeo.setDrawRange(0, safe ? 24 : DUST_N);
  if (safe) destroyComposer();
  else ensureComposer();
  if (!safe) ensureEnv();
  commitShape();
  if (!safe && composer) sizeComposer();
  publishPath();
  const horizontal = rail.getBoundingClientRect().width > rail.getBoundingClientRect().height;
  rail.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
}

function resize() {
  const nextSafe = wantsSafe();
  pathState.safe = nextSafe;
  applyBudget();
  syncMotion();
}

function setBowFromEvent(event) {
  const rect = rail.getBoundingClientRect();
  const horizontal = rect.width > rect.height;
  const t = horizontal
    ? (event.clientX - rect.left) / rect.width
    : 1 - (event.clientY - rect.top) / rect.height;
  bowT = THREE.MathUtils.clamp(t, 0, 1);
  commitShape();
}

rail.addEventListener('pointerdown', (event) => {
  rail.setPointerCapture(event.pointerId);
  setBowFromEvent(event);
});
rail.addEventListener('pointermove', (event) => {
  if (!rail.hasPointerCapture(event.pointerId)) return;
  setBowFromEvent(event);
});
rail.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.12 : 0.05;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    bowT = Math.min(1, bowT + step);
    commitShape();
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    bowT = Math.max(0, bowT - step);
    commitShape();
    event.preventDefault();
    event.stopPropagation();
  }
});

modeConvex.addEventListener('click', () => {
  convex = true;
  commitShape();
});
modeConcave.addEventListener('click', () => {
  convex = false;
  commitShape();
});

addEventListener('keydown', (event) => {
  if (event.target === rail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'c' || event.key === 'C') {
    convex = true;
    commitShape();
  } else if (event.key === 'd' || event.key === 'D') {
    convex = false;
    commitShape();
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    bowT = Math.min(1, bowT + 0.05);
    commitShape();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    bowT = Math.max(0, bowT - 0.05);
    commitShape();
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

const dustPos = dustGeo.attributes.position;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (!pathState.still) elapsed += dt;
  const t = elapsed;
  screenUniforms.uTime.value = pathState.still ? 0 : t;
  outMat.opacity = pathState.still ? 0.92 : 0.84 + Math.sin(t * 1.6) * 0.08;
  const pulse = pathState.still ? 1 : 1 + Math.sin(t * 2.1) * 0.05;
  focusKnot.scale.setScalar(pulse);

  if (!pathState.still) {
    const draw = pathState.safe ? 24 : DUST_N;
    for (let i = 0; i < draw; i++) {
      let x = dustBase[i * 3] + ((t * 0.12 + i * 0.01) % 3.3);
      if (x > SCREEN_X) x -= (SCREEN_X - SOURCE_X);
      dustPos.setX(i, x);
    }
    dustPos.needsUpdate = true;
  }

  controls.update();
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
