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
const curveRail = document.getElementById('curve-rail');
const lampRail = document.getElementById('lamp-rail');
const modeFlat = document.getElementById('mode-flat');
const modeConcave = document.getElementById('mode-concave');
const modeConvex = document.getElementById('mode-convex');

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
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x07060c, 0.038);

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
camera.position.set(-1.15, 1.22, 2.05);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(-0.08, 0.92, 0);
controls.minDistance = 1.45;
controls.maxDistance = 6.4;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = 1.42;
controls.autoRotateSpeed = 0.22;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'sheet' : 'glint';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';

const AXIS_Y = 0.98;
const BENCH_TOP = 0.16;
const TIP = 0.32;
const HALF_H = 0.64;
const HALF_W = 0.5;
const ZRAY = 0.03;
const DO_NEAR = 0.46;
const DO_FAR = 2.28;
const NY = 36;
const NZ = 10;

const curve = { value: 0.5, vel: 0, target: 0.5 };
const lamp = { value: 0.4, vel: 0, target: 0.4 };

const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let glintPass = null;
let outputPass = null;
let renderPass = null;
let envReady = false;
let framed = false;

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.34, metalness: 0.82 });
const stone = new THREE.MeshStandardMaterial({ color: 0x16141c, roughness: 0.9, metalness: 0.04 });
const ink = new THREE.MeshStandardMaterial({ color: 0x121018, roughness: 0.92, metalness: 0.02 });

const room = new THREE.Mesh(
  new THREE.BoxGeometry(8.4, 4.4, 7.2),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 })
);
room.position.set(0.05, 1.65, 0.1);
scene.add(room);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(8.2, 7.2),
  new THREE.MeshStandardMaterial({ color: 0x100e14, roughness: 0.88, metalness: 0.04 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const backFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(3.15, 7.2),
  new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.94, metalness: 0.02 })
);
backFloor.rotation.x = -Math.PI / 2;
backFloor.position.set(1.62, 0.004, 0.1);
backFloor.receiveShadow = true;
scene.add(backFloor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 2.5),
  new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 1, metalness: 0 })
);
backWall.position.set(2.35, 1.25, 0.05);
backWall.rotation.y = -Math.PI / 2;
scene.add(backWall);

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(2.85, 0.08, 0.92),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.74, metalness: 0.08 })
);
bench.position.set(-1.28, BENCH_TOP - 0.04, 0);
bench.receiveShadow = true;
bench.castShadow = true;
scene.add(bench);

const threshold = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 1.08), brass);
threshold.position.set(0, BENCH_TOP + 0.012, 0);
scene.add(threshold);

for (let x = -2.2; x <= -0.2; x += 0.5) {
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.08), brass);
  tick.position.set(x, BENCH_TOP + 0.02, 0.32);
  scene.add(tick);
}

const mirrorUniforms = { uPulse: { value: 1 } };
const mirrorMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
  uniforms: mirrorUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform float uPulse;
    void main() {
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float frame = 1.0 - smoothstep(0.018, 0.055, edge);
      vec3 n = normalize(vNormal);
      if (n.x > 0.0) n = -n;
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 1.45);
      float band = exp(-pow((vUv.x - 0.62) * 7.5, 2.0));
      float along = smoothstep(0.05, 0.22, vUv.y) * smoothstep(0.97, 0.58, vUv.y);
      vec3 silver = vec3(0.66, 0.72, 0.78);
      vec3 deep = vec3(0.1, 0.12, 0.16);
      vec3 brassCol = vec3(0.72, 0.52, 0.28);
      vec3 glint = vec3(1.15, 0.86, 0.58);
      vec3 col = mix(deep, silver, 0.42 + fres * 0.7);
      col += glint * band * along * (0.42 + 0.58 * uPulse);
      col = mix(col, brassCol, frame);
      float alpha = mix(0.28 + fres * 0.34, 0.94, frame);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

function makeSheet() {
  const geo = new THREE.BufferGeometry();
  const vcount = (NY + 1) * (NZ + 1);
  const pos = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  const idx = [];
  for (let y = 0; y <= NY; y++) {
    for (let z = 0; z <= NZ; z++) {
      const i = y * (NZ + 1) + z;
      uv[i * 2] = z / NZ;
      uv[i * 2 + 1] = y / NY;
    }
  }
  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      const a = y * (NZ + 1) + z;
      idx.push(a, a + 1, a + NZ + 1, a + 1, a + NZ + 2, a + NZ + 1);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

const mirror = new THREE.Mesh(makeSheet(), mirrorMat);
mirror.renderOrder = 2;
mirror.frustumCulled = false;
scene.add(mirror);

function writeSheet(geo, focal) {
  const pos = geo.attributes.position;
  for (let y = 0; y <= NY; y++) {
    const u = THREE.MathUtils.lerp(-HALF_H, HALF_H, y / NY);
    const x = surfaceX(u, focal);
    for (let z = 0; z <= NZ; z++) {
      const w = THREE.MathUtils.lerp(-HALF_W, HALF_W, z / NZ);
      pos.setXYZ(y * (NZ + 1) + z, x, AXIS_Y + u, w);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function buildLamp(ghost) {
  const group = new THREE.Group();
  const metal = ghost
    ? new THREE.MeshBasicMaterial({
      color: 0xd9cbb8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
    : brass;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.035, 18), metal);
  foot.position.y = 0.02;
  foot.castShadow = !ghost;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.16, 12), metal);
  stem.position.y = 0.11;
  stem.castShadow = !ghost;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.055, 0.07, 16), metal);
  cup.position.y = 0.21;
  cup.castShadow = !ghost;
  const flameMat = new THREE.MeshBasicMaterial({
    color: ghost ? 0xffd7a8 : 0xfff3d4,
    transparent: true,
    opacity: ghost ? 0.55 : 1,
    depthWrite: false,
    blending: ghost ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  if (!ghost) flameMat.color.multiplyScalar(3.2);
  else flameMat.color.multiplyScalar(1.8);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), flameMat);
  flame.position.y = TIP;
  flame.scale.set(0.85, 1.45, 0.85);
  group.add(foot, stem, cup, flame);
  if (ghost) {
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xfff1df,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    for (const part of [foot, stem, cup]) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry, 18), edgeMat);
      edges.position.copy(part.position);
      edges.rotation.copy(part.rotation);
      edges.scale.copy(part.scale);
      group.add(edges);
    }
    group.userData.edgeMat = edgeMat;
    group.userData.fillMat = metal;
  }
  group.userData.flameMat = flameMat;
  return group;
}

const lampRig = buildLamp(false);
scene.add(lampRig);

const ghostRig = buildLamp(true);
ghostRig.renderOrder = 3;
ghostRig.traverse((child) => {
  child.renderOrder = 3;
  child.frustumCulled = false;
});
scene.add(ghostRig);

const sled = new THREE.Group();
const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.2), stone);
shoe.position.y = 0.018;
shoe.castShadow = true;
const postH = AXIS_Y - BENCH_TOP;
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, postH, 12), brass);
post.position.y = postH / 2;
post.castShadow = true;
sled.add(shoe, post);
sled.position.y = BENCH_TOP;
scene.add(sled);

const windowSlitMat = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
windowSlitMat.color.multiplyScalar(2.4);
const windowSlit = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 1.15), windowSlitMat);
windowSlit.position.set(-2.42, AXIS_Y, 0);
windowSlit.rotation.y = Math.PI / 2;
scene.add(windowSlit);
const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.28, 0.08), brass);
windowFrame.position.set(-2.46, AXIS_Y, 0);
scene.add(windowFrame);

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

const lampRayMat = filament(0xffc56a, 1.7, 0.9);
const beamRayMat = filament(0xfff1d4, 1.15, 0.55);
const rayGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
rayGeo.translate(0, 0.5, 0);

const dashMat = new THREE.LineDashedMaterial({
  color: 0xf0e2cc,
  dashSize: 0.045,
  gapSize: 0.03,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  fog: false,
});

const LAMP_RAYS = 5;
const BEAM_RAYS = 4;

function makeRay(mat) {
  const mesh = new THREE.Mesh(rayGeo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
function makeDash() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, dashMat);
  line.frustumCulled = false;
  line.renderOrder = 4;
  line.visible = false;
  scene.add(line);
  return line;
}

const lampIn = [];
const lampOut = [];
const lampDash = [];
for (let i = 0; i < LAMP_RAYS; i++) {
  lampIn.push(makeRay(lampRayMat));
  lampOut.push(makeRay(lampRayMat));
  lampDash.push(makeDash());
}
const beamIn = [];
const beamOut = [];
const beamDash = [];
for (let i = 0; i < BEAM_RAYS; i++) {
  beamIn.push(makeRay(beamRayMat));
  beamOut.push(makeRay(beamRayMat));
  beamDash.push(makeDash());
}

const normalGeo = new THREE.BufferGeometry();
normalGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const normalLine = new THREE.Line(
  normalGeo,
  new THREE.LineBasicMaterial({ color: 0xf7f1e6, transparent: true, opacity: 0.8, depthWrite: false, fog: false })
);
normalLine.frustumCulled = false;
normalLine.renderOrder = 4;
scene.add(normalLine);

function makeArc() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0.95, depthWrite: false, fog: false })
  );
  line.frustumCulled = false;
  line.renderOrder = 4;
  scene.add(line);
  return line;
}
const arcIn = makeArc();
const arcOut = makeArc();

const focusKnot = new THREE.Mesh(
  new THREE.SphereGeometry(0.032, 16, 12),
  filament(0xffe2b0, 2.2, 0.95)
);
focusKnot.frustumCulled = false;
scene.add(focusKnot);
const focusRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.064, 0.005, 8, 28),
  new THREE.MeshBasicMaterial({ color: 0xffb15a })
);
focusRing.rotation.y = Math.PI / 2;
scene.add(focusRing);

const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 64;
const glowCtx = glowCanvas.getContext('2d');
const glowGrad = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
glowGrad.addColorStop(0, 'rgba(255,220,170,0.95)');
glowGrad.addColorStop(0.4, 'rgba(255,120,40,0.28)');
glowGrad.addColorStop(1, 'rgba(255,80,20,0)');
glowCtx.fillStyle = glowGrad;
glowCtx.fillRect(0, 0, 64, 64);
const focusGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: new THREE.CanvasTexture(glowCanvas),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.8,
}));
focusGlow.scale.set(0.38, 0.38, 1);
scene.add(focusGlow);

scene.add(new THREE.HemisphereLight(0x4a4038, 0x07060c, 0.38));
const key = new THREE.SpotLight(0xffe2c4, 8, 10, 0.55, 0.45, 1.2);
key.position.set(-1.4, 2.4, 1.6);
key.target.position.set(0, AXIS_Y, 0);
key.castShadow = true;
key.shadow.bias = -0.0006;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
scene.add(key.target);
const cool = new THREE.PointLight(0x8ea6c4, 2.4, 6.5, 2);
cool.position.set(1.7, 1.5, 0.4);
scene.add(cool);
const flameLight = new THREE.PointLight(0xffb15a, 3.2, 3.2, 2);
scene.add(flameLight);
const focusLight = new THREE.PointLight(0xffc58a, 1.4, 1.6, 2);
scene.add(focusLight);

const DUST_N = 48;
const dustGeo = new THREE.BufferGeometry();
const dustBase = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) {
  dustBase[i * 3] = THREE.MathUtils.lerp(-2.1, -0.15, Math.random());
  dustBase[i * 3 + 1] = AXIS_Y + (Math.random() - 0.45) * 0.7;
  dustBase[i * 3 + 2] = (Math.random() - 0.5) * 0.28;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
const dustCanvas = document.createElement('canvas');
dustCanvas.width = dustCanvas.height = 64;
const dustCtx = dustCanvas.getContext('2d');
const dustGrad = dustCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
dustGrad.addColorStop(0, 'rgba(255,244,220,1)');
dustGrad.addColorStop(0.45, 'rgba(255,190,120,0.35)');
dustGrad.addColorStop(1, 'rgba(255,190,120,0)');
dustCtx.fillStyle = dustGrad;
dustCtx.fillRect(0, 0, 64, 64);
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dustCanvas),
    color: 0xffe6c0,
    size: 0.03,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  })
);
dust.frustumCulled = false;
scene.add(dust);

const UP = new THREE.Vector3(0, 1, 0);
const aimDir = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpHit = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpImg = new THREE.Vector3();

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

function setDash(line, from, to) {
  const attr = line.geometry.attributes.position;
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  line.computeLineDistances();
  line.visible = true;
}

function setArc(line, origin, fromDir, toDir, radius) {
  const a0 = Math.atan2(fromDir.y, fromDir.x);
  const a1 = Math.atan2(toDir.y, toDir.x);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  const attr = line.geometry.attributes.position;
  const steps = 13;
  for (let i = 0; i <= steps; i++) {
    const ang = a0 + sweep * (i / steps);
    attr.setXYZ(
      i,
      origin.x + Math.cos(ang) * radius,
      origin.y + Math.sin(ang) * radius,
      origin.z
    );
  }
  attr.needsUpdate = true;
  line.visible = true;
}

function surfaceX(u, focal) {
  if (!Number.isFinite(focal)) return 0;
  const sag = (u * u) / (4 * Math.abs(focal));
  return focal > 0 ? -sag : sag;
}

function surfaceNormal(u, focal, out) {
  if (!Number.isFinite(focal)) return out.set(-1, 0, 0);
  const slope = (focal > 0 ? -u : u) / (2 * Math.abs(focal));
  return out.set(-1, slope, 0).normalize();
}

function reflectInto(incident, normal, out) {
  tmpA.copy(incident).normalize();
  tmpB.copy(normal).normalize();
  if (tmpA.dot(tmpB) > 0) tmpB.negate();
  const dot = tmpA.dot(tmpB);
  return out.copy(tmpA).addScaledVector(tmpB, -2 * dot);
}

function kindOf(t) {
  const signed = (t - 0.5) * 2;
  if (Math.abs(signed) < 0.055) return 'flat';
  return signed > 0 ? 'concave' : 'convex';
}

function focalOf(t) {
  const signed = (t - 0.5) * 2;
  if (Math.abs(signed) < 0.055) return Infinity;
  return Math.sign(signed) * (0.48 / Math.abs(signed));
}

function objectDistance(t) {
  return THREE.MathUtils.lerp(DO_NEAR, DO_FAR, THREE.MathUtils.clamp(t, 0, 1));
}

function locateImage(dist, tip, focal) {
  if (!Number.isFinite(focal)) {
    return { x: dist, y: tip, real: false, m: 1 };
  }
  const vdX = -dist;
  const vdY = -tip;
  const vdL = Math.hypot(vdX, vdY);
  const vx = vdX / vdL;
  const vy = vdY / vdL;
  const hx = surfaceX(tip, focal);
  surfaceNormal(tip, focal, tmpN);
  reflectInto(tmpA.set(1, 0, 0), tmpN, tmpR);
  const det = vx * tmpR.y - vy * tmpR.x;
  if (Math.abs(det) < 1e-5) return null;
  const t = (hx * tmpR.y - tip * tmpR.x) / det;
  const x = t * vx;
  const y = t * vy;
  if (!Number.isFinite(x) || Math.abs(x) > 3.15 || Math.abs(y) > 1.2) return null;
  return { x, y, real: x < -0.04, m: y / tip };
}

function hideRay(i, poolIn, poolOut, poolDash) {
  poolIn[i].visible = false;
  poolOut[i].visible = false;
  poolDash[i].visible = false;
}

function drawBounce(from, hit, refl, image, meshIn, meshOut, dash, radius) {
  aim(meshIn, from, hit, radius * 0.85);
  tmpImg.set(image ? image.x : 0, image ? AXIS_Y + image.y : 0, ZRAY);
  let s = image ? tmpImg.clone().sub(hit).dot(refl) : 1;
  if (image && s > 0.08) {
    const end = tmpA.copy(hit).addScaledVector(refl, Math.min(s * 1.22, 3.4));
    aim(meshOut, hit, end, radius);
    dash.visible = false;
  } else if (image && s < -0.05) {
    const end = tmpB.copy(hit).addScaledVector(refl, 0.78);
    aim(meshOut, hit, end, radius * 0.9);
    setDash(dash, hit, tmpImg);
  } else {
    const end = tmpA.copy(hit).addScaledVector(refl, 0.9);
    aim(meshOut, hit, end, radius);
    dash.visible = false;
  }
}

function describe(kind, dist, image, angleDeg) {
  const law = `The middle ray meets the normal at ${angleDeg}°, and it leaves at ${angleDeg}°.`;
  if (kind === 'flat') {
    return `Flat mirror. ${law} The image is virtual and upright, as far behind the glass as the lamp is in front.`;
  }
  if (kind === 'convex') {
    return `Convex mirror. ${law} The curve spreads the rays. The image is virtual, upright, and smaller, so you see a wider view.`;
  }
  if (!image) {
    return `Concave mirror. ${law} The lamp is at the focal point. The reflected rays run nearly parallel, and the image is too far to place.`;
  }
  if (image.real) {
    const mag = Math.abs(image.m);
    const size = mag > 1.12 ? ', and larger than the lamp' : mag < 0.88 ? ', and smaller than the lamp' : '';
    return `Concave mirror. ${law} Parallel rays meet at the focus. The lamp is outside that point, so the image is real and upside down${size}.`;
  }
  return `Concave mirror. ${law} The lamp is inside the focal point. The image is virtual, upright, and larger, behind the glass.`;
}

function paintRail(rail, t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  rail.style.setProperty('--t', clamped.toFixed(4));
  rail.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
}

function syncScene() {
  const focal = focalOf(curve.value);
  const kind = kindOf(curve.value);
  const dist = objectDistance(lamp.value);
  const image = locateImage(dist, TIP, focal);
  const angleDeg = Math.max(1, Math.round(Math.atan2(TIP, dist) * (180 / Math.PI)));

  writeSheet(mirror.geometry, focal);
  lampRig.position.set(-dist, AXIS_Y, 0);
  sled.position.x = -dist;
  flameLight.position.set(-dist, AXIS_Y + TIP, 0.08);

  const showGhost = !!image;
  ghostRig.visible = showGhost;
  if (showGhost) {
    const mag = image.m;
    ghostRig.position.set(image.x, AXIS_Y, 0);
    ghostRig.scale.set(Math.abs(mag), mag, Math.abs(mag));
    const fade = image.real ? 0.9 : 0.72;
    ghostRig.userData.fillMat.opacity = image.real ? 0.42 : 0.22;
    ghostRig.userData.edgeMat.opacity = fade;
    ghostRig.userData.flameMat.opacity = image.real ? 0.8 : 0.5;
  }

  const focusX = Number.isFinite(focal) ? -focal : 0;
  const showFocus = Number.isFinite(focal) && Math.abs(focal) < 2.8;
  focusKnot.visible = showFocus;
  focusRing.visible = showFocus;
  focusGlow.visible = showFocus;
  focusLight.visible = showFocus && kind === 'concave';
  if (showFocus) {
    focusKnot.position.set(focusX, AXIS_Y, 0);
    focusRing.position.set(focusX, AXIS_Y, 0);
    focusGlow.position.set(focusX, AXIS_Y, 0);
    focusLight.position.set(focusX, AXIS_Y, 0.04);
    focusGlow.material.opacity = kind === 'concave' ? 0.85 : 0.35;
  }

  const lampHits = [0, TIP, TIP * 0.45, -TIP * 0.55, 0.48];
  const beamHits = [-0.46, -0.16, 0.22, 0.52];
  const lampCount = pathState.safe ? 3 : LAMP_RAYS;
  const beamCount = pathState.safe ? 3 : BEAM_RAYS;

  let vertexRefl = null;
  for (let i = 0; i < LAMP_RAYS; i++) {
    if (i >= lampCount) {
      hideRay(i, lampIn, lampOut, lampDash);
      continue;
    }
    const u = lampHits[i];
    tmpHit.set(surfaceX(u, focal), AXIS_Y + u, ZRAY);
    tmpFrom.set(-dist, AXIS_Y + TIP, ZRAY);
    surfaceNormal(u, focal, tmpN);
    reflectInto(tmpA.copy(tmpHit).sub(tmpFrom), tmpN, tmpR);
    if (i === 0) vertexRefl = tmpR.clone();
    drawBounce(tmpFrom, tmpHit, tmpR, image, lampIn[i], lampOut[i], lampDash[i], 0.007);
  }

  for (let i = 0; i < BEAM_RAYS; i++) {
    if (i >= beamCount) {
      hideRay(i, beamIn, beamOut, beamDash);
      continue;
    }
    const u = beamHits[i];
    tmpHit.set(surfaceX(u, focal), AXIS_Y + u, ZRAY);
    tmpFrom.set(-2.42, AXIS_Y + u, ZRAY);
    surfaceNormal(u, focal, tmpN);
    reflectInto(tmpA.set(1, 0, 0), tmpN, tmpR);
    const beamImage = showFocus ? { x: focusX, y: 0 } : null;
    if (kind === 'flat') {
      aim(beamIn[i], tmpFrom, tmpHit, 0.0045);
      aim(beamOut[i], tmpHit, tmpB.set(-2.15, tmpHit.y, ZRAY), 0.0045);
      beamDash[i].visible = false;
    } else if (kind === 'concave') {
      drawBounce(tmpFrom, tmpHit, tmpR, beamImage, beamIn[i], beamOut[i], beamDash[i], 0.0048);
    } else {
      drawBounce(tmpFrom, tmpHit, tmpR, beamImage, beamIn[i], beamOut[i], beamDash[i], 0.0048);
    }
  }

  const nStart = tmpA.set(0.12, AXIS_Y, ZRAY + 0.01);
  const nEnd = tmpB.set(-0.42, AXIS_Y, ZRAY + 0.01);
  const nAttr = normalGeo.attributes.position;
  nAttr.setXYZ(0, nStart.x, nStart.y, nStart.z);
  nAttr.setXYZ(1, nEnd.x, nEnd.y, nEnd.z);
  nAttr.needsUpdate = true;

  const arcOrigin = tmpHit.set(0, AXIS_Y, ZRAY + 0.012);
  const towardLamp = tmpFrom.set(-dist, TIP, 0).normalize();
  const normalDir = tmpN.set(-1, 0, 0);
  const radius = Math.min(0.2, dist * 0.34);
  setArc(arcIn, arcOrigin, normalDir, towardLamp, radius);
  if (vertexRefl) setArc(arcOut, arcOrigin, normalDir, vertexRefl, radius);

  const sentence = describe(kind, dist, image, angleDeg);
  readout.textContent = sentence;
  paintRail(curveRail, curve.target);
  paintRail(lampRail, lamp.target);
  curveRail.setAttribute('aria-valuetext', sentence);
  lampRail.setAttribute('aria-valuetext', sentence);
  modeFlat.setAttribute('aria-pressed', kind === 'flat' ? 'true' : 'false');
  modeConcave.setAttribute('aria-pressed', kind === 'concave' ? 'true' : 'false');
  modeConvex.setAttribute('aria-pressed', kind === 'convex' ? 'true' : 'false');
  document.documentElement.dataset.mirror = kind;
  document.documentElement.dataset.focal = Number.isFinite(focal) ? focal.toFixed(3) : 'flat';
  document.documentElement.dataset.image = !image ? 'far' : image.real ? 'real' : 'virtual';
  document.documentElement.dataset.stance = !image ? 'far' : image.m >= 0 ? 'upright' : 'inverted';
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

const GlintLiftShader = {
  name: 'LightLabMirrorGlint',
  uniforms: {
    tDiffuse: { value: null },
    uGain: { value: 0.42 },
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
        glow += tapColor * smoothstep(0.42, 1.25, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.065 * uGain), base.a);
    }
  `,
};

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'sheet' : 'glint';
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
  glintPass = new ShaderPass(GlintLiftShader);
  outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(glintPass);
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
  glintPass = null;
  outputPass = null;
  renderPass = null;
}

function frameCamera(force) {
  if (framed && !force) return;
  const narrow = innerWidth <= 900;
  if (narrow) {
    camera.fov = 40;
    camera.position.set(-0.95, 1.08, 1.62);
    controls.target.set(-0.12, 0.9, 0);
  } else {
    camera.fov = 32;
    camera.position.set(-1.15, 1.22, 2.15);
    controls.target.set(-0.08, 0.92, 0);
  }
  camera.updateProjectionMatrix();
  framed = true;
}

function applyBudget() {
  const safe = pathState.safe;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, safe ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  key.shadow.mapSize.set(safe ? 512 : 1024);
  dustGeo.setDrawRange(0, safe ? 16 : DUST_N);
  if (safe) destroyComposer();
  else ensureComposer();
  if (!safe) ensureEnv();
  frameCamera(false);
  syncScene();
  if (!safe && composer) sizeComposer();
  publishPath();
  for (const rail of [curveRail, lampRail]) {
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
    curve.value = curve.target;
    lamp.value = lamp.target;
    curve.vel = lamp.vel = 0;
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

bindRail(curveRail, curve);
bindRail(lampRail, lamp);

function setCurveTarget(t) {
  curve.target = t;
  if (pathState.still) {
    curve.value = t;
    curve.vel = 0;
    syncScene();
  }
}

modeFlat.addEventListener('click', () => setCurveTarget(0.5));
modeConcave.addEventListener('click', () => setCurveTarget(0.82));
modeConvex.addEventListener('click', () => setCurveTarget(0.18));

addEventListener('keydown', (event) => {
  if (event.target === curveRail || event.target === lampRail) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'f' || event.key === 'F') setCurveTarget(0.5);
  else if (event.key === 'c' || event.key === 'C') setCurveTarget(0.82);
  else if (event.key === 'v' || event.key === 'V') setCurveTarget(0.18);
  else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    curve.target = Math.min(1, curve.target + 0.05);
    if (pathState.still) setCurveTarget(curve.target);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    curve.target = Math.max(0, curve.target - 0.05);
    if (pathState.still) setCurveTarget(curve.target);
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
  springTo(curve, dt, 14, 5.4);
  springTo(lamp, dt, 16, 6.2);
  syncScene();
  const pulse = pathState.still ? 1 : 0.78 + Math.sin(elapsed * 1.5) * 0.22;
  mirrorUniforms.uPulse.value = pulse;
  lampRayMat.opacity = pathState.still ? 0.9 : 0.78 + Math.sin(elapsed * 1.7) * 0.1;
  const knotPulse = pathState.still ? 1 : 1 + Math.sin(elapsed * 2.1) * 0.06;
  focusKnot.scale.setScalar(knotPulse);
  if (!pathState.still) {
    const draw = pathState.safe ? 16 : DUST_N;
    for (let i = 0; i < draw; i++) {
      let x = dustBase[i * 3] + ((elapsed * 0.08 + i * 0.013) % 2.3);
      if (x > -0.05) x -= 2.2;
      dustPos.setX(i, x);
    }
    dustPos.needsUpdate = true;
  }
  controls.update();
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
