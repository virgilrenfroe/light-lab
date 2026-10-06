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
const modeLight = document.getElementById('mode-light');
const modePigment = document.getElementById('mode-pigment');
const rails = [
  document.getElementById('rail-a'),
  document.getElementById('rail-b'),
  document.getElementById('rail-c'),
];
const railNames = [
  document.getElementById('name-a'),
  document.getElementById('name-b'),
  document.getElementById('name-c'),
];

const LIGHT_NAMES = ['Red', 'Green', 'Blue'];
const PIGMENT_NAMES = ['Cyan', 'Yellow', 'Magenta'];

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
scene.fog = new THREE.Fog(0x07060c, 6.5, 14);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
camera.position.set(0.42, 0.16, 2.72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0.06, 0.06, 0);
controls.minDistance = 1.7;
controls.maxDistance = 4.6;
controls.minPolarAngle = 1.05;
controls.maxPolarAngle = 1.62;
controls.minAzimuthAngle = -0.55;
controls.maxAzimuthAngle = 0.55;
controls.autoRotateSpeed = 0.14;

const pathState = { safe: wantsSafe(), still: wantsStill() };
document.documentElement.dataset.lightPath = pathState.safe ? 'flat' : 'lift';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';
document.documentElement.dataset.lesson = 'color';

const PAPER_W = 1.56;
const PAPER_H = 1.12;
const CARD_Y = 0.04;
const FLOOR_Y = -0.82;
const ASPECT = PAPER_W / PAPER_H;
const POOL_R = 0.25;
const POOL_UV = [
  [0.39, 0.38],
  [0.61, 0.38],
  [0.5, 0.644],
];
const GEL = [
  new THREE.Color(1.0, 0.015, 0.0),
  new THREE.Color(0.0, 0.86, 0.02),
  new THREE.Color(0.03, 0.05, 1.0),
];

const channels = [
  { value: 0.92, vel: 0, target: 0.92 },
  { value: 0.92, vel: 0, target: 0.92 },
  { value: 0.92, vel: 0, target: 0.92 },
];
const modeState = { value: 0, vel: 0, target: 0 };

const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let liftPass = null;
let renderPass = null;
let framed = false;

const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.34, metalness: 0.82 });
const iron = new THREE.MeshStandardMaterial({ color: 0x221e1a, roughness: 0.42, metalness: 0.74 });
const stageMat = new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 0.9, metalness: 0.04 });
const mountMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.78, metalness: 0.08 });
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd5c6b0, roughness: 0.72, metalness: 0.02 });

function uvToWorld(uv, z = 0.05) {
  return new THREE.Vector3(
    (uv[0] - 0.5) * PAPER_W,
    CARD_Y + (uv[1] - 0.5) * PAPER_H,
    z,
  );
}

const aims = POOL_UV.map((uv) => uvToWorld(uv, 0.06));
const heads = [
  new THREE.Vector3(-1.05, -0.2, 0.98),
  new THREE.Vector3(1.05, -0.2, 0.98),
  new THREE.Vector3(0.0, 0.94, 1.02),
];

scene.add(new THREE.HemisphereLight(0x3a342e, 0x0a0908, 0.42));
const fill = new THREE.DirectionalLight(0xfff0dc, 0.18);
fill.position.set(-1.4, 2.2, 2.4);
scene.add(fill);

const practical = new THREE.PointLight(0xfff6ea, 0, 4.2, 1.4);
practical.position.set(0.0, 1.26, 1.22);
scene.add(practical);

const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), stageMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
scene.add(floor);

const brassBack = new THREE.Mesh(new THREE.PlaneGeometry(PAPER_W + 0.22, PAPER_H + 0.22), brass);
brassBack.position.set(0, CARD_Y, -0.028);
scene.add(brassBack);

const mount = new THREE.Mesh(new THREE.PlaneGeometry(PAPER_W + 0.12, PAPER_H + 0.12), mountMat);
mount.position.set(0, CARD_Y, -0.012);
scene.add(mount);

const edge = new THREE.Mesh(new THREE.BoxGeometry(PAPER_W, PAPER_H, 0.018), edgeMat);
edge.position.set(0, CARD_Y, 0.006);
scene.add(edge);

for (const x of [-0.18, 0.18]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.34, 8), iron);
  leg.position.set(x, FLOOR_Y + 0.17, -0.08);
  leg.rotation.x = 0.08;
  scene.add(leg);
}

const clipGeo = new THREE.BoxGeometry(0.11, 0.045, 0.02);
for (const x of [-0.42, 0.42]) {
  const clip = new THREE.Mesh(clipGeo, brass);
  clip.position.set(x, CARD_Y + PAPER_H * 0.5 - 0.01, 0.03);
  scene.add(clip);
}

const paperUniforms = {
  uA: { value: 0.92 },
  uB: { value: 0.92 },
  uC: { value: 0.92 },
  uMode: { value: 0 },
  uC0: { value: new THREE.Vector2(POOL_UV[0][0], POOL_UV[0][1]) },
  uC1: { value: new THREE.Vector2(POOL_UV[1][0], POOL_UV[1][1]) },
  uC2: { value: new THREE.Vector2(POOL_UV[2][0], POOL_UV[2][1]) },
  uRad: { value: POOL_R },
  uAspect: { value: ASPECT },
  uG0: { value: GEL[0] },
  uG1: { value: GEL[1] },
  uG2: { value: GEL[2] },
};

const paperMat = new THREE.ShaderMaterial({
  uniforms: paperUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uA;
    uniform float uB;
    uniform float uC;
    uniform float uMode;
    uniform vec2 uC0;
    uniform vec2 uC1;
    uniform vec2 uC2;
    uniform float uRad;
    uniform float uAspect;
    uniform vec3 uG0;
    uniform vec3 uG1;
    uniform vec3 uG2;
    varying vec2 vUv;

    float disk(vec2 uv, vec2 c, float soft) {
      float d = length((uv - c) * vec2(uAspect, 1.0));
      return smoothstep(uRad, uRad - soft, d);
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      float beams = 1.0 - smoothstep(0.0, 0.42, uMode);
      float wash = smoothstep(0.08, 0.62, uMode);
      float inkIn = smoothstep(0.28, 0.92, uMode);
      float softBeam = 0.055;
      float softInk = 0.022;
      float aL = disk(vUv, uC0, softBeam) * uA;
      float bL = disk(vUv, uC1, softBeam) * uB;
      float cL = disk(vUv, uC2, softBeam) * uC;
      float aI = disk(vUv, uC0, softInk) * uA * inkIn;
      float bI = disk(vUv, uC1, softInk) * uB * inkIn;
      float cI = disk(vUv, uC2, softInk) * uC * inkIn;

      vec3 paperDim = vec3(0.055, 0.048, 0.042);
      vec3 sum = uG0 * aL + uG1 * bL + uG2 * cL;
      vec3 col = paperDim + sum * beams;

      vec3 paper = vec3(0.95, 0.91, 0.84);
      float n = hash(vUv * vec2(380.0, 340.0));
      float tooth = 0.975 + 0.04 * n;
      paper *= tooth;
      col = mix(col, paper, wash);

      // Cyan removes red, yellow removes blue, magenta removes green.
      // Transmission follows optical density, so full ink leaves a few percent.
      vec3 transmit = vec3(exp(-3.6 * aI), exp(-3.6 * cI), exp(-3.6 * bI));
      float load = max(max(aI, bI), cI);
      transmit *= mix(1.0, 0.9, load);
      col *= mix(vec3(1.0), transmit, inkIn);

      vec2 q = vUv - 0.5;
      float edge = smoothstep(0.58, 0.32, length(q * vec2(1.2, 1.0)));
      col *= mix(0.9, 1.0, edge);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const paper = new THREE.Mesh(new THREE.PlaneGeometry(PAPER_W, PAPER_H), paperMat);
paper.position.set(0, CARD_Y, 0.018);
paper.renderOrder = 1;
scene.add(paper);

const beamGeo = new THREE.CylinderGeometry(0.3, 0.012, 1, 28, 1, true);
beamGeo.translate(0, 0.5, 0);

const beamUniforms = [];
const beams = [];

function makeBeam(color) {
  const uniforms = {
    uColor: { value: color.clone() },
    uGain: { value: 0.92 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms,
    vertexShader: `
      varying float vT;
      varying float vFall;
      void main() {
        float rad = mix(0.012, 0.3, clamp(position.y, 0.0, 1.0));
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
        float edge = smoothstep(1.0, 0.12, vFall);
        float along = smoothstep(0.0, 0.05, vT) * smoothstep(0.9, 0.5, vT);
        float streak = 0.86 + 0.14 * sin(vFall * 18.0 + vT * 10.0 - uTime * 1.1);
        float alpha = edge * along * streak * uGain;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(beamGeo, mat);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  scene.add(mesh);
  beamUniforms.push(uniforms);
  beams.push(mesh);
  return mesh;
}

const up = new THREE.Vector3(0, 1, 0);
const lamps = [];

function placeBeam(mesh, head, aim) {
  const dir = aim.clone().sub(head);
  const len = dir.length();
  dir.multiplyScalar(1 / len);
  mesh.position.copy(head);
  mesh.quaternion.setFromUnitVectors(up, dir);
  mesh.scale.set(1, len, 1);
}

for (let i = 0; i < 3; i += 1) {
  const head = heads[i];
  const aim = aims[i];
  // The top lamp stands behind the card so its pole does not cut the overlap.
  const behind = i === 2;
  const foot = behind ? new THREE.Vector3(0, FLOOR_Y, -0.46) : new THREE.Vector3(head.x, FLOOR_Y, head.z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.028, 16), iron);
  base.position.set(foot.x, foot.y + 0.014, foot.z);
  scene.add(base);
  const poleH = Math.max(0.2, head.y - FLOOR_Y - 0.05);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, poleH, 10), iron);
  pole.position.set(foot.x, FLOOR_Y + 0.03 + poleH / 2, foot.z);
  scene.add(pole);
  if (behind) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8), iron);
    const from = new THREE.Vector3(foot.x, head.y, foot.z);
    const span = head.clone().sub(from);
    const len = span.length();
    arm.position.copy(from).addScaledVector(span, 0.5);
    arm.quaternion.setFromUnitVectors(up, span.multiplyScalar(1 / len));
    arm.scale.set(1, len, 1);
    scene.add(arm);
  }

  const housing = new THREE.Group();
  housing.position.copy(head);
  housing.lookAt(aim);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.13, 18), iron);
  barrel.rotation.x = Math.PI / 2;
  housing.add(barrel);
  const gel = new THREE.Mesh(
    new THREE.CircleGeometry(0.046, 20),
    new THREE.MeshBasicMaterial({ color: GEL[i].clone() }),
  );
  gel.position.set(0, 0, -0.068);
  housing.add(gel);
  const doorGeo = new THREE.BoxGeometry(0.12, 0.022, 0.012);
  const doorA = new THREE.Mesh(doorGeo, iron);
  doorA.position.set(0, 0.062, -0.07);
  const doorB = new THREE.Mesh(doorGeo, iron);
  doorB.position.set(0, -0.062, -0.07);
  housing.add(doorA, doorB);
  scene.add(housing);

  const spot = new THREE.SpotLight(GEL[i], 0, 5.5, 0.48, 0.72, 1.3);
  spot.position.copy(head);
  spot.target.position.copy(aim);
  scene.add(spot);
  scene.add(spot.target);

  const beam = makeBeam(GEL[i]);
  placeBeam(beam, head.clone().add(aim.clone().sub(head).normalize().multiplyScalar(0.08)), aim);

  lamps.push({ gel, spot, beam, color: GEL[i] });
}

const shade = new THREE.Group();
shade.position.set(0, 1.26, 1.22);
shade.lookAt(0, CARD_Y, 0);
const shadeBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.08, 18, 1, true), brass);
shadeBowl.rotation.x = Math.PI / 2;
shade.add(shadeBowl);
const whiteGel = new THREE.Mesh(
  new THREE.CircleGeometry(0.06, 20),
  new THREE.MeshBasicMaterial({ color: 0x000000 }),
);
whiteGel.position.set(0, 0, -0.04);
shade.add(whiteGel);
scene.add(shade);

const MOTE_N = 42;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(MOTE_N * 3);
const moteCol = new Float32Array(MOTE_N * 3);
const moteSeed = [];
for (let i = 0; i < MOTE_N; i += 1) {
  const lane = i % 3;
  moteSeed.push({
    lane,
    t: Math.random(),
    ox: (Math.random() - 0.5) * 0.16,
    oy: (Math.random() - 0.5) * 0.16,
    speed: 0.08 + Math.random() * 0.1,
  });
  moteCol[i * 3] = GEL[lane].r;
  moteCol[i * 3 + 1] = GEL[lane].g;
  moteCol[i * 3 + 2] = GEL[lane].b;
  motePos[i * 3 + 1] = FLOOR_Y;
}
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
const moteMat = new THREE.PointsMaterial({
  size: 0.018,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.85,
});
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
scene.add(motes);

function springTo(state, dt, k, damp) {
  if (pathState.still) {
    state.value = state.target;
    state.vel = 0;
    return;
  }
  const acc = (state.target - state.value) * k - state.vel * damp;
  state.vel += acc * dt;
  state.value += state.vel * dt;
  state.value = THREE.MathUtils.clamp(state.value, -0.02, 1.02);
}

function level(v) {
  if (v < 0.12) return 0;
  if (v < 0.58) return 1;
  return 2;
}

function joinNames(list) {
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]}, ${list[1]}, and ${list[2]}`;
}

function describe(mode, a, b, c) {
  const A = level(a);
  const B = level(b);
  const C = level(c);
  if (mode < 0.5) {
    if (A === 2 && B === 2 && C === 2) {
      return 'Light. Red, green, and blue are up. Where all three beams meet, the card is white. Two beams make yellow, cyan, or magenta.';
    }
    if (A === 2 && B === 2 && C === 0) {
      return 'Light. Red and green overlap as yellow. Blue is down, so that overlap does not turn white.';
    }
    if (B === 2 && C === 2 && A === 0) {
      return 'Light. Green and blue overlap as cyan. Red is down, so that overlap does not turn white.';
    }
    if (A === 2 && C === 2 && B === 0) {
      return 'Light. Red and blue overlap as magenta. Green is down, so that overlap does not turn white.';
    }
    if (A === 0 && B === 0 && C === 0) {
      return 'Light. The lamps are down. The white card is waiting in the dark.';
    }
    const on = [];
    if (A) on.push('red');
    if (B) on.push('green');
    if (C) on.push('blue');
    if (on.length === 1 && level([a, b, c][on[0] === 'red' ? 0 : on[0] === 'green' ? 1 : 2]) === 2) {
      return `Light. Only the ${on[0]} lamp is on the card. There is no second color to add.`;
    }
    const mix = joinNames(on);
    const lead = mix.charAt(0).toUpperCase() + mix.slice(1);
    return `Light. ${lead} ${on.length === 1 ? 'is' : 'are'} in the mix. Raise a lamp and the overlap moves toward white.`;
  }
  if (A === 2 && B === 2 && C === 2) {
    return 'Pigment. Cyan, magenta, and yellow are on the page. Where all three overlap, the page is near black.';
  }
  if (A === 2 && B === 2 && C === 0) {
    return 'Pigment. Cyan removes red and yellow removes blue. Where they overlap, green remains.';
  }
  if (B === 2 && C === 2 && A === 0) {
    return 'Pigment. Yellow removes blue and magenta removes green. Where they overlap, red remains.';
  }
  if (A === 2 && C === 2 && B === 0) {
    return 'Pigment. Cyan removes red and magenta removes green. Where they overlap, blue remains.';
  }
  if (A === 0 && B === 0 && C === 0) {
    return 'Pigment. The white lamp is on, and the page is bare. No ink has been laid down.';
  }
  const on = [];
  if (A) on.push('cyan');
  if (B) on.push('yellow');
  if (C) on.push('magenta');
  if (on.length === 1 && (A === 2 || B === 2 || C === 2)) {
    const which = on[0];
    if (which === 'cyan') return 'Pigment. Cyan ink removes red light. The page looks cyan where that ink sits.';
    if (which === 'yellow') return 'Pigment. Yellow ink removes blue light. The page looks yellow where that ink sits.';
    return 'Pigment. Magenta ink removes green light. The page looks magenta where that ink sits.';
  }
  const mix = joinNames(on);
  const lead = mix.charAt(0).toUpperCase() + mix.slice(1);
  return `Pigment. ${lead} ${on.length === 1 ? 'is' : 'are'} on the page. More ink takes more light away.`;
}

function syncScene() {
  const mode = THREE.MathUtils.clamp(modeState.value, 0, 1);
  const vals = channels.map((ch) => THREE.MathUtils.clamp(ch.value, 0, 1));
  paperUniforms.uA.value = vals[0];
  paperUniforms.uB.value = vals[1];
  paperUniforms.uC.value = vals[2];
  paperUniforms.uMode.value = mode;

  const names = mode > 0.55 ? PIGMENT_NAMES : LIGHT_NAMES;
  rails.forEach((rail, i) => {
    const t = vals[i];
    rail.style.setProperty('--t', t.toFixed(3));
    rail.setAttribute('aria-valuenow', String(Math.round(t * 100)));
    rail.setAttribute('aria-label', names[i]);
    railNames[i].textContent = names[i];
  });
  const pigment = mode > 0.55;
  modeLight.setAttribute('aria-pressed', pigment ? 'false' : 'true');
  modePigment.setAttribute('aria-pressed', pigment ? 'true' : 'false');

  lamps.forEach((lamp, i) => {
    const amt = vals[i] * (1 - mode);
    lamp.gel.material.color.copy(lamp.color).multiplyScalar(Math.max(amt, 0.02));
    lamp.spot.color.copy(lamp.color);
    lamp.spot.intensity = amt * 6.5;
    beamUniforms[i].uGain.value = amt * 0.95;
    beamUniforms[i].uTime.value = elapsed;
  });

  practical.intensity = mode * 2.4;
  whiteGel.material.color.setScalar(mode * 1.15);
  moteMat.opacity = (1 - mode) * 0.8;
  readout.textContent = describe(mode, vals[0], vals[1], vals[2]);
}

const ColorLiftShader = {
  name: 'LightLabColorLift',
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
        glow += tapColor * smoothstep(0.42, 1.05, lum);
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
  liftPass = new ShaderPass(ColorLiftShader);
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
    camera.fov = short ? 50 : 46;
    camera.position.set(0.0, 0.62, short ? 3.05 : 3.4);
    controls.target.set(0.0, -0.55, 0);
  } else {
    camera.fov = 32;
    camera.position.set(0.46, 0.14, 2.68);
    controls.target.set(0.08, 0.08, 0);
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
  moteGeo.setDrawRange(0, safe ? 16 : MOTE_N);
  if (safe) destroyComposer();
  else ensureComposer();
  frameCamera(false);
  syncScene();
  if (!safe && composer) sizeComposer();
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
    for (const ch of channels) {
      ch.value = ch.target;
      ch.vel = 0;
    }
    modeState.value = modeState.target;
    modeState.vel = 0;
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

rails.forEach((rail, i) => bindRail(rail, channels[i]));

function setMode(pigment) {
  modeState.target = pigment ? 1 : 0;
  if (pathState.still) {
    modeState.value = modeState.target;
    modeState.vel = 0;
    syncScene();
  }
}

modeLight.addEventListener('click', () => setMode(false));
modePigment.addEventListener('click', () => setMode(true));

addEventListener('keydown', (event) => {
  if (rails.includes(event.target)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'l') setMode(false);
  else if (key === 'p') setMode(true);
  else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    channels[0].target = Math.min(1, channels[0].target + 0.05);
    if (pathState.still) {
      channels[0].value = channels[0].target;
      channels[0].vel = 0;
      syncScene();
    }
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    channels[0].target = Math.max(0, channels[0].target - 0.05);
    if (pathState.still) {
      channels[0].value = channels[0].target;
      channels[0].vel = 0;
      syncScene();
    }
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
  for (const ch of channels) springTo(ch, dt, 12, 5.4);
  springTo(modeState, dt, 10, 6.2);
  syncScene();
  if (!pathState.still) {
    const draw = pathState.safe ? 16 : MOTE_N;
    for (let i = 0; i < draw; i += 1) {
      const seed = moteSeed[i];
      const t = (seed.t + elapsed * seed.speed) % 1;
      const head = heads[seed.lane];
      const aim = aims[seed.lane];
      const wobble = 1 - t;
      moteAttr.setXYZ(
        i,
        THREE.MathUtils.lerp(head.x, aim.x, t) + seed.ox * wobble,
        THREE.MathUtils.lerp(head.y, aim.y, t) + seed.oy * wobble,
        THREE.MathUtils.lerp(head.z, aim.z, t),
      );
    }
    moteAttr.needsUpdate = true;
  }
  controls.update();
  if (!pathState.safe && composer) composer.render();
  else renderer.render(scene, camera);
}
tick();
