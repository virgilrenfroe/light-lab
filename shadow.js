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
const lampRail = document.getElementById('lamp-rail');
const objectRail = document.getElementById('object-rail');
const screenRail = document.getElementById('screen-rail');
const rails = [lampRail, objectRail, screenRail];
const modeOne = document.getElementById('mode-one');
const modeTwo = document.getElementById('mode-two');

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
renderer.setClearColor(0x07060c, floatEmbed ? 0 : 1);

const scene = new THREE.Scene();
scene.background = floatEmbed ? null : new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x07060c, 0.045);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
camera.position.set(0.42, 1.42, 2.72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.12, 0.98, 0.02);
controls.minDistance = 1.7;
controls.maxDistance = 5.6;
controls.minPolarAngle = 0.72;
controls.maxPolarAngle = 1.38;
controls.minAzimuthAngle = -0.85;
controls.maxAzimuthAngle = 0.72;
controls.autoRotateSpeed = 0.12;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'shadow';

const OBJECT_R = 0.2;
const LAMP_X = -1.28;
const CY = 1.32;
const SCREEN_SIZE = 1.9;
const SCREEN_HALF = SCREEN_SIZE / 2;
const LAMP_SEP = 0.38;
const PI = Math.PI;

const lampState = { value: 0.42, vel: 0, target: 0.42 };
const objectState = { value: 0.48, vel: 0, target: 0.48 };
const screenState = { value: 0.45, vel: 0, target: 0.45 };
const pairState = { value: 0, vel: 0, target: 0 };

const view = {
  S: 0.2,
  d: 1.4,
  L: 2.5,
  pair: 0,
  lampX: LAMP_X,
  screenX: 1.1,
  objX: 0,
  ru: 0.2,
  rp: 0.5,
  shift: 0,
};

const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let liftPass = null;
let renderPass = null;
let framed = false;

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.34, metalness: 0.82 });
const iron = new THREE.MeshStandardMaterial({ color: 0x221e1a, roughness: 0.46, metalness: 0.72 });
const board = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.78, metalness: 0.04 });
const occluderMat = new THREE.MeshStandardMaterial({ color: 0x100e0c, roughness: 0.92, metalness: 0.02 });

scene.add(new THREE.AmbientLight(0x2a241c, 0.42));

const room = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 4.8, 7.4),
  new THREE.MeshStandardMaterial({ color: 0x0c0b10, side: THREE.BackSide, roughness: 1, metalness: 0 }),
);
room.position.set(0.1, 1.7, 0);
scene.add(room);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 7.2),
  new THREE.MeshStandardMaterial({ color: 0x100e14, roughness: 0.9, metalness: 0.04 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const stageDeck = new THREE.Mesh(
  new THREE.BoxGeometry(4.4, 0.06, 1.7),
  new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.76, metalness: 0.06 }),
);
stageDeck.position.set(0.05, 0.03, 0);
scene.add(stageDeck);

function sourceRadius(t) {
  return THREE.MathUtils.lerp(0.018, 0.5, THREE.MathUtils.clamp(t, 0, 1));
}
function throwLength(t) {
  return THREE.MathUtils.lerp(2.22, 2.78, THREE.MathUtils.clamp(t, 0, 1));
}
function objectDistance(t, length) {
  const near = 0.96;
  const far = Math.max(near + 0.24, length - 0.48);
  return THREE.MathUtils.lerp(near, far, THREE.MathUtils.clamp(t, 0, 1));
}
function umbraRadius(S, d, L) {
  return (OBJECT_R * L - S * (L - d)) / d;
}
function penumbraRadius(S, d, L) {
  return (S * (L - d) + OBJECT_R * L) / d;
}

function coverArea(r1, r2, dist) {
  if (dist >= r1 + r2) return 0;
  if (dist <= Math.abs(r1 - r2)) return PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1;
  const b = r2 * r2;
  const ang1 = Math.acos(THREE.MathUtils.clamp((dist * dist + a - b) / (2 * dist * r1), -1, 1));
  const ang2 = Math.acos(THREE.MathUtils.clamp((dist * dist + b - a) / (2 * dist * r2), -1, 1));
  const height = Math.sqrt(Math.max(0, (-dist + r1 + r2) * (dist + r1 - r2) * (dist - r1 + r2) * (dist + r1 + r2)));
  return a * ang1 + b * ang2 - 0.5 * height;
}

function visibility(rho, S, d, L) {
  const denom = Math.max(L - d, 0.04);
  const rOcc = OBJECT_R * L / denom;
  const dist = Math.max(0, rho) * d / denom;
  const s = Math.max(S, 0.004);
  return THREE.MathUtils.clamp(1 - coverArea(s, rOcc, dist) / (PI * s * s), 0, 1);
}

function lightAt(y, z) {
  const v1 = visibility(Math.hypot(y, z + view.shift), view.S, view.d, view.L);
  const v2 = visibility(Math.hypot(y, z - view.shift), view.S, view.d, view.L);
  if (view.pair < 0.04) return v1;
  return (1 - view.pair) * v1 + view.pair * 0.5 * (v1 + v2);
}

const screenUniforms = {
  uS: { value: 0.2 },
  uR: { value: OBJECT_R },
  uD: { value: 1.4 },
  uL: { value: 2.5 },
  uPair: { value: 0 },
  uShift: { value: 0 },
  uSize: { value: SCREEN_SIZE },
};

const screenMat = new THREE.ShaderMaterial({
  uniforms: screenUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uS;
    uniform float uR;
    uniform float uD;
    uniform float uL;
    uniform float uPair;
    uniform float uShift;
    uniform float uSize;
    varying vec2 vUv;
    const float PI = 3.141592653589793;

    float coverArea(float r1, float r2, float dist) {
      if (dist >= r1 + r2) return 0.0;
      if (dist <= abs(r1 - r2)) return PI * min(r1, r2) * min(r1, r2);
      float a = r1 * r1;
      float b = r2 * r2;
      float ang1 = acos(clamp((dist * dist + a - b) / (2.0 * dist * r1), -1.0, 1.0));
      float ang2 = acos(clamp((dist * dist + b - a) / (2.0 * dist * r2), -1.0, 1.0));
      float h = sqrt(max(0.0, (-dist + r1 + r2) * (dist + r1 - r2) * (dist - r1 + r2) * (dist + r1 + r2)));
      return a * ang1 + b * ang2 - 0.5 * h;
    }

    float visibility(vec2 p, vec2 center) {
      float rho = length(p - center);
      float denom = max(uL - uD, 0.04);
      float rOcc = uR * uL / denom;
      float dist = rho * uD / denom;
      float s = max(uS, 0.004);
      float blocked = coverArea(s, rOcc, dist);
      return clamp(1.0 - blocked / (PI * s * s), 0.0, 1.0);
    }

    void main() {
      vec2 p = vec2((vUv.x - 0.5) * uSize, (vUv.y - 0.5) * uSize);
      float v1 = visibility(p, vec2(-uShift, 0.0));
      float v2 = visibility(p, vec2(uShift, 0.0));
      float light = mix(v1, 0.5 * (v1 + v2), uPair);
      vec3 lit = vec3(1.28, 0.96, 0.68);
      vec3 dark = vec3(0.015, 0.012, 0.011);
      vec3 col = mix(dark, lit, clamp(light, 0.0, 1.0));
      float tooth = fract(sin(dot(gl_FragCoord.xy, vec2(127.1, 311.7))) * 43758.5453);
      col *= 0.95 + 0.05 * tooth;
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      col *= mix(0.55, 1.0, smoothstep(0.0, 0.035, edge));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

function makePlate(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = '700 64px "Space Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(8, 6, 5, 0.9)';
    g.strokeText(text, 256, 66);
    g.fillStyle = '#efe4d2';
    g.fillText(text, 256, 66);
    tex.needsUpdate = true;
  };
  draw();
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.56, 0.14, 1);
  sprite.renderOrder = 4;
  sprite.visible = false;
  return { sprite, draw };
}

const umbraLabel = makePlate('UMBRA');
const penumbraLabel = makePlate('PENUMBRA');
penumbraLabel.sprite.scale.set(0.78, 0.16, 1);
scene.add(umbraLabel.sprite, penumbraLabel.sprite);
document.fonts?.ready?.then(() => {
  umbraLabel.draw();
  penumbraLabel.draw();
});

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255, 246, 226, 1)');
  grd.addColorStop(0.28, 'rgba(255, 186, 96, 0.7)');
  grd.addColorStop(1, 'rgba(255, 70, 16, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowMap = radialTexture();

function makeLamp() {
  const group = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 0.16, 32), iron);
  can.rotation.z = Math.PI / 2;
  can.position.x = -0.08;
  group.add(can);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 10, 36), brass);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.6, 1.85, 1.15) }),
  );
  face.rotation.y = Math.PI / 2;
  face.position.x = 0.012;
  group.add(face);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowMap,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  }));
  glow.position.x = 0.05;
  group.add(glow);
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.02, 6, 28, Math.PI), brass);
  yoke.rotation.y = Math.PI / 2;
  group.add(yoke);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, CY - 0.08, 8), iron);
  pole.position.y = -(CY - 0.08) / 2;
  group.add(pole);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.16), brass);
  foot.position.y = -(CY - 0.06);
  group.add(foot);
  const light = new THREE.PointLight(0xffc9a0, 5.5, 8.5, 2);
  light.position.set(0.12, 0, 0);
  group.add(light);
  scene.add(group);
  return { group, can, ring, face, glow, yoke, light };
}

const lampA = makeLamp();
const lampB = makeLamp();

function fitLamp(lamp, radius) {
  const faceR = Math.max(radius, 0.02);
  const shell = Math.max(radius, 0.07);
  lamp.can.scale.set(shell, 1, shell);
  lamp.ring.scale.set(shell, shell, shell);
  lamp.yoke.scale.set(shell, shell, shell);
  lamp.face.scale.set(faceR, faceR, faceR);
  lamp.glow.scale.set(Math.max(faceR * 3.1, 0.16), Math.max(faceR * 3.1, 0.16), 1);
}

const objectGroup = new THREE.Group();
const disc = new THREE.Mesh(new THREE.CylinderGeometry(OBJECT_R, OBJECT_R, 0.14, 48), occluderMat);
disc.rotation.z = Math.PI / 2;
objectGroup.add(disc);
const rim = new THREE.Mesh(new THREE.TorusGeometry(OBJECT_R, 0.012, 8, 40), brass);
rim.rotation.y = Math.PI / 2;
objectGroup.add(rim);
const objectPoleHeight = CY - OBJECT_R - 0.08;
const objectPole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, objectPoleHeight, 8), iron);
objectPole.position.y = -(OBJECT_R + 0.02 + objectPoleHeight / 2);
objectGroup.add(objectPole);
const objectFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 16), brass);
objectFoot.position.y = -(CY - 0.045);
objectGroup.add(objectFoot);
scene.add(objectGroup);

const screenGroup = new THREE.Group();
const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_SIZE, SCREEN_SIZE), screenMat);
screenFace.rotation.y = -Math.PI / 2;
screenGroup.add(screenFace);
function addBar(width, height, depth, x, y, z) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), brass);
  bar.position.set(x, y, z);
  screenGroup.add(bar);
}
const frameT = 0.05;
const frameD = 0.055;
addBar(frameD, frameT, SCREEN_SIZE + frameT * 2, 0.02, SCREEN_HALF + frameT / 2, 0);
addBar(frameD, frameT, SCREEN_SIZE + frameT * 2, 0.02, -(SCREEN_HALF + frameT / 2), 0);
addBar(frameD, SCREEN_SIZE, frameT, 0.02, 0, SCREEN_HALF + frameT / 2);
addBar(frameD, SCREEN_SIZE, frameT, 0.02, 0, -(SCREEN_HALF + frameT / 2));
const screenBack = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_SIZE + 0.12, SCREEN_SIZE + 0.12),
  board,
);
screenBack.rotation.y = -Math.PI / 2;
screenBack.position.x = 0.045;
screenGroup.add(screenBack);
const screenPoleHeight = Math.max(0.16, CY - SCREEN_HALF - frameT - 0.06);
const screenPole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, screenPoleHeight, 8), iron);
screenPole.position.set(0.02, -(SCREEN_HALF + frameT + screenPoleHeight / 2), 0);
screenGroup.add(screenPole);
const screenFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.7), brass);
screenFoot.position.set(0.02, -(CY - 0.05), 0);
screenGroup.add(screenFoot);
scene.add(screenGroup);

const X_AXIS = new THREE.Vector3(1, 0, 0);
const rodDir = new THREE.Vector3();
function makeRod(color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.012, 0.012),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  mesh.geometry.translate(0.5, 0, 0);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
const rods = {
  umbraTop: makeRod(0xc8beb4),
  umbraBot: makeRod(0xc8beb4),
  penTop: makeRod(0xffb15a),
  penBot: makeRod(0xffb15a),
};

function placeRod(mesh, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.04) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.set(ax, ay, az);
  mesh.scale.set(len, 1, 1);
  rodDir.set(dx / len, dy / len, dz / len);
  mesh.quaternion.setFromUnitVectors(X_AXIS, rodDir);
}

const MOTE_N = 56;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(MOTE_N * 3);
const moteSeed = [];
for (let i = 0; i < MOTE_N; i += 1) {
  moteSeed.push({
    ang: Math.random() * Math.PI * 2,
    rad: 0.15 + Math.random() * 0.85,
    t: Math.random(),
    speed: 0.045 + Math.random() * 0.06,
  });
  motePos[i * 3 + 1] = -4;
}
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(
  moteGeo,
  new THREE.PointsMaterial({
    color: 0xffd7a4,
    size: 0.02,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
  }),
);
motes.frustumCulled = false;
scene.add(motes);

function describe() {
  const { S, d, L, pair, ru, rp } = view;
  const fringe = rp - Math.max(ru, 0);
  if (pair > 0.55) {
    return 'Two lamps light the screen. The darkest patch is where both lamps are blocked. A grey fringe is where only part of a lamp is covered.';
  }
  if (ru <= 0.03) {
    return 'The lamp is large compared with the object. From the screen, the object never covers the whole lamp, so there is no umbra. The shadow is a soft penumbra.';
  }
  if (fringe < 0.055 || S < 0.045) {
    return 'The lamp is nearly a point. The screen is either in full light or in full shadow. The penumbra is only a thin edge, so the shadow looks sharp.';
  }
  const gap = L - d;
  let line = 'The dark core is the umbra. No light from the lamp reaches it. The grey fringe is the penumbra. Part of the lamp is blocked there, and part is not.';
  if (gap < 0.7) line += ' The object is close to the screen, so the fringe stays narrow.';
  else if (gap > 1.32) line += ' The object is far from the screen, so the fringe has room to spread.';
  return line;
}

function placeLabels() {
  const { screenX, ru, rp, pair } = view;
  const front = screenX - 0.06;
  umbraLabel.sprite.visible = false;
  penumbraLabel.sprite.visible = false;
  if (pair > 0.55) {
    const mid = lightAt(0, 0);
    if (mid < 0.18) {
      umbraLabel.sprite.visible = true;
      umbraLabel.sprite.position.set(front, CY, 0);
    }
    penumbraLabel.sprite.visible = true;
    penumbraLabel.sprite.position.set(front, CY + Math.min(SCREEN_HALF * 0.72, Math.max(rp, 0.28) * 0.55), 0);
    return;
  }
  if (ru > 0.12) {
    umbraLabel.sprite.visible = true;
    umbraLabel.sprite.position.set(front, CY, 0);
    const fit = THREE.MathUtils.clamp(ru * 2.1, 0.28, 0.56);
    umbraLabel.sprite.scale.set(fit, fit * 0.25, 1);
  }
  const fringe = rp - Math.max(ru, 0);
  if (fringe > 0.1 && rp < SCREEN_HALF * 1.15) {
    const y = CY + (Math.max(ru, 0) + Math.min(rp, SCREEN_HALF * 0.92)) * 0.5;
    if (Math.abs(y - CY) > 0.12) {
      penumbraLabel.sprite.visible = true;
      penumbraLabel.sprite.position.set(front, y, 0);
    }
  } else if (ru <= 0.03 && rp > 0.16) {
    penumbraLabel.sprite.visible = true;
    penumbraLabel.sprite.position.set(front, CY + Math.min(rp * 0.28, SCREEN_HALF * 0.45), 0);
  }
}

function syncScene() {
  const S = sourceRadius(lampState.value);
  const L = throwLength(screenState.value);
  const d = objectDistance(objectState.value, L);
  const pair = THREE.MathUtils.clamp(pairState.value, 0, 1);
  const ru = umbraRadius(S, d, L);
  const rp = penumbraRadius(S, d, L);
  const shift = LAMP_SEP * pair * (L - d) / d;
  view.S = S;
  view.d = d;
  view.L = L;
  view.pair = pair;
  view.lampX = LAMP_X;
  view.screenX = LAMP_X + L;
  view.objX = LAMP_X + d;
  view.ru = ru;
  view.rp = rp;
  view.shift = shift;

  screenUniforms.uS.value = S;
  screenUniforms.uD.value = d;
  screenUniforms.uL.value = L;
  screenUniforms.uPair.value = pair;
  screenUniforms.uShift.value = shift;

  const zA = -LAMP_SEP * pair;
  const zB = LAMP_SEP * pair;
  lampA.group.position.set(LAMP_X, CY, zA);
  lampB.group.position.set(LAMP_X, CY, zB);
  lampB.group.visible = pair > 0.06;
  fitLamp(lampA, S);
  fitLamp(lampB, S);
  lampA.light.intensity = 4.2 + S * 3.5;
  lampB.light.intensity = pair * (4.2 + S * 3.5);

  objectGroup.position.set(view.objX, CY, 0);
  screenGroup.position.set(view.screenX, CY, 0);

  const showRays = pair < 0.45;
  const yPen = Math.min(Math.max(rp, 0), SCREEN_HALF * 1.02);
  const yUmb = Math.min(Math.max(ru, 0), SCREEN_HALF);
  const lampTop = CY + S;
  const lampBot = CY - S;
  if (showRays) {
    placeRod(rods.penTop, LAMP_X, lampBot, 0, view.screenX, CY + yPen, 0);
    placeRod(rods.penBot, LAMP_X, lampTop, 0, view.screenX, CY - yPen, 0);
    if (ru > 0.025) {
      placeRod(rods.umbraTop, LAMP_X, lampTop, 0, view.screenX, CY + yUmb, 0);
      placeRod(rods.umbraBot, LAMP_X, lampBot, 0, view.screenX, CY - yUmb, 0);
    } else if (S > OBJECT_R) {
      const t = S / (S - OBJECT_R);
      const xClose = LAMP_X + d * t;
      if (xClose > view.objX + 0.05 && xClose < view.screenX) {
        placeRod(rods.umbraTop, LAMP_X, lampTop, 0, xClose, CY, 0);
        placeRod(rods.umbraBot, LAMP_X, lampBot, 0, xClose, CY, 0);
      } else {
        rods.umbraTop.visible = false;
        rods.umbraBot.visible = false;
      }
    } else {
      rods.umbraTop.visible = false;
      rods.umbraBot.visible = false;
    }
  } else {
    rods.penTop.visible = false;
    rods.penBot.visible = false;
    rods.umbraTop.visible = false;
    rods.umbraBot.visible = false;
  }

  placeLabels();
  const sentence = describe();
  readout.textContent = sentence;
  modeOne.setAttribute('aria-pressed', pair > 0.55 ? 'false' : 'true');
  modeTwo.setAttribute('aria-pressed', pair > 0.55 ? 'true' : 'false');
  const paint = [
    [lampRail, lampState.value],
    [objectRail, objectState.value],
    [screenRail, screenState.value],
  ];
  for (const [rail, value] of paint) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    rail.style.setProperty('--t', t.toFixed(4));
    rail.setAttribute('aria-valuenow', String(Math.round(t * 100)));
    rail.setAttribute('aria-valuetext', sentence);
  }
  document.documentElement.dataset.umbra = ru.toFixed(3);
  document.documentElement.dataset.penumbra = Math.max(rp, 0).toFixed(3);
}

const ShadowLiftShader = {
  name: 'LightLabShadowLift',
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
        glow += tapColor * smoothstep(0.72, 1.2, lum);
      }
      gl_FragColor = vec4(base.rgb + glow * (0.045 * uGain), base.a);
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
  liftPass = new ShaderPass(ShadowLiftShader);
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
    camera.fov = short ? 48 : 42;
    camera.position.set(0.15, short ? 1.55 : 1.38, short ? 3.55 : 3.25);
    controls.target.set(0.2, short ? 1.18 : 1.08, 0);
  } else {
    camera.fov = 32;
    camera.position.set(-0.15, 1.48, 2.35);
    controls.target.set(0.22, 1.12, 0.02);
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
  moteGeo.setDrawRange(0, pathState.safe ? 14 : MOTE_N);
  if (pathState.safe) destroyComposer();
  else ensureComposer();
  frameCamera(false);
  syncScene();
  if (!pathState.safe && composer) sizeComposer();
  publishPath();
  for (const rail of rails) {
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
    for (const state of [lampState, objectState, screenState, pairState]) {
      state.value = state.target;
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

function springTo(state, dt) {
  if (pathState.still) {
    state.value = state.target;
    state.vel = 0;
    return;
  }
  const acc = (state.target - state.value) * 12 - state.vel * 5.6;
  state.vel += acc * dt;
  state.value += state.vel * dt;
  state.value = THREE.MathUtils.clamp(state.value, -0.02, 1.02);
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

bindRail(lampRail, lampState);
bindRail(objectRail, objectState);
bindRail(screenRail, screenState);

function setPair(on) {
  pairState.target = on ? 1 : 0;
  if (pathState.still) {
    pairState.value = pairState.target;
    pairState.vel = 0;
    syncScene();
  }
}

modeOne.addEventListener('click', () => setPair(false));
modeTwo.addEventListener('click', () => setPair(true));

function nudgeLamp(delta) {
  lampState.target = THREE.MathUtils.clamp(lampState.target + delta, 0, 1);
  if (pathState.still) {
    lampState.value = lampState.target;
    lampState.vel = 0;
    syncScene();
  }
}

addEventListener('keydown', (event) => {
  if (rails.includes(event.target)) return;
  const tag = event.target && event.target.tagName;
  if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A' || tag === 'INPUT') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'p') {
    lampState.target = 0;
    event.preventDefault();
  } else if (key === 'w') {
    lampState.target = 1;
    event.preventDefault();
  } else if (key === 'o') {
    setPair(false);
    event.preventDefault();
  } else if (key === 't') {
    setPair(true);
    event.preventDefault();
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    nudgeLamp(0.05);
    event.preventDefault();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    nudgeLamp(-0.05);
    event.preventDefault();
  } else return;
  if (pathState.still && (key === 'p' || key === 'w')) {
    lampState.value = lampState.target;
    lampState.vel = 0;
    syncScene();
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
  springTo(lampState, dt);
  springTo(objectState, dt);
  springTo(screenState, dt);
  springTo(pairState, dt);
  syncScene();
  const draw = pathState.safe ? 14 : MOTE_N;
  for (let i = 0; i < draw; i += 1) {
    const seed = moteSeed[i];
    const travel = pathState.still ? seed.t : (seed.t + elapsed * seed.speed) % 1;
    const ang = seed.ang;
    const dest = seed.rad * SCREEN_HALF * 0.92;
    const lit = visibility(dest, view.S, view.d, view.L);
    if (lit < 0.35 || (travel > view.d / view.L && lit < 0.55 && dest < Math.max(view.ru, 0))) {
      moteAttr.setXYZ(i, 0, -5, 0);
      continue;
    }
    const sx = Math.cos(ang) * view.S * 0.85;
    const sz = Math.sin(ang) * view.S * 0.85;
    const ex = Math.cos(ang) * dest;
    const ez = Math.sin(ang) * dest;
    moteAttr.setXYZ(
      i,
      THREE.MathUtils.lerp(view.lampX, view.screenX, travel),
      CY + THREE.MathUtils.lerp(sx, ex, travel),
      THREE.MathUtils.lerp(sz, ez, travel),
    );
  }
  moteAttr.needsUpdate = true;
  controls.update();
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
