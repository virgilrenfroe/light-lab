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

// The page owns exactly one WebGLRenderer. Postprocessing reuses it.
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
scene.fog = new THREE.FogExp2(0x07060c, 0.038);

const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 40);
camera.position.set(0.48, 1.36, 3.62);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0, 1.15, -0.85);
controls.minDistance = 2.3;
controls.maxDistance = 7.2;
controls.minPolarAngle = 0.62;
controls.maxPolarAngle = 1.52;
controls.autoRotateSpeed = 0.32;

const pathState = {
  safe: wantsSafe(),
  still: wantsStill(),
};
document.documentElement.dataset.lightPath = pathState.safe ? 'shafts' : 'composer';
document.documentElement.dataset.rendererCount = '1';
document.documentElement.dataset.composer = '0';

const clock = new THREE.Clock();
let elapsed = 0;
let composer = null;
let godPass = null;
let outputPass = null;
let renderPass = null;
let envReady = false;

const shaftUniforms = {
  uTime: { value: 0 },
  uGain: { value: 0.62 },
};
const causticUniforms = {
  uTime: { value: 0 },
};

const shaftMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  fog: false,
  uniforms: shaftUniforms,
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
    uniform float uGain;
    void main() {
      float along = vUv.y;
      float across = abs(vUv.x - 0.5) * 2.0;
      float edge = smoothstep(1.0, 0.08, across);
      edge *= smoothstep(0.0, 0.05, along) * smoothstep(1.0, 0.78, along);
      float streak = 0.62 + 0.38 * sin(vUv.x * 26.0 + along * 8.0 - uTime * 1.3);
      float motes = 0.78 + 0.22 * sin(along * 42.0 - uTime * 1.8 + vUv.x * 11.0);
      float fade = pow(1.0 - along, 0.55);
      float alpha = edge * streak * motes * fade * uGain;
      vec3 col = mix(vec3(1.0, 0.94, 0.80), vec3(1.0, 0.70, 0.38), along);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const causticMat = new THREE.ShaderMaterial({
  fog: false,
  uniforms: causticUniforms,
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
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      p.x *= 1.2;
      float r = length(p);
      float pool = smoothstep(1.02, 0.12, r);
      float a = sin(p.x * 10.0 + cos(p.y * 8.0 + uTime) * 1.7 + uTime);
      float b = sin(p.y * 9.0 + sin(p.x * 7.0 - uTime * 0.65) * 1.7 - uTime * 0.55);
      float c = sin((p.x * 1.25 + p.y) * 13.0 + uTime * 0.4);
      float ridges = pow(max(a * b, 0.0), 2.5) + pow(max(c, 0.0), 7.0) * 0.7;
      float focus = smoothstep(0.82, 0.0, r);
      float w = ridges * pool * (0.28 + 0.85 * focus);
      vec3 stone = vec3(0.055, 0.048, 0.042);
      vec3 gold = vec3(0.62, 0.40, 0.14);
      vec3 col = min(stone + gold * w, vec3(0.34, 0.22, 0.10));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

function archShape(hw, sill, spring) {
  const shape = new THREE.Shape();
  shape.moveTo(-hw, sill);
  shape.lineTo(hw, sill);
  shape.lineTo(hw, spring);
  shape.absarc(0, spring, hw, 0, Math.PI, false);
  shape.closePath();
  return shape;
}

const SILL = 0.82;
const SPRING = 2.24;
const HALF_W = 0.7;
const stone = new THREE.MeshStandardMaterial({ color: 0x16141c, roughness: 0.9, metalness: 0.04 });
const darkBar = new THREE.MeshStandardMaterial({ color: 0x0c0b10, roughness: 0.62, metalness: 0.18 });
const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.32, metalness: 0.82 });

const room = new THREE.Mesh(
  new THREE.BoxGeometry(7.6, 4.3, 8.6),
  new THREE.MeshStandardMaterial({ color: 0x100e14, side: THREE.BackSide, roughness: 1, metalness: 0 })
);
room.position.set(0, 2.12, 0.05);
scene.add(room);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(7.4, 8.2),
  new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.78, metalness: 0.08 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0.012, 0.05);
floor.receiveShadow = true;
scene.add(floor);

const wallPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.2), stone);
wallPlane.position.set(0, 2.1, -4.02);
wallPlane.receiveShadow = true;
scene.add(wallPlane);

const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc });
lightMat.color.multiplyScalar(4.2);
const aperture = new THREE.Mesh(new THREE.ShapeGeometry(archShape(HALF_W, SILL, SPRING)), lightMat);
aperture.position.set(0, 0, -3.94);
scene.add(aperture);
const apertureCenter = new THREE.Vector3(0, 1.85, -3.94);

const frameZ = -3.8;
const archRing = new THREE.Mesh(
  new THREE.TorusGeometry(HALF_W, 0.07, 10, 40, Math.PI),
  stone
);
archRing.position.set(0, SPRING, frameZ);
scene.add(archRing);

function jamb(x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, SPRING - SILL + 0.02, 0.22), stone);
  mesh.position.set(x, (SILL + SPRING) / 2, frameZ);
  mesh.castShadow = true;
  return mesh;
}
scene.add(jamb(-HALF_W));
scene.add(jamb(HALF_W));

const sill = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.09, 0.36), stone);
sill.position.set(0, SILL - 0.02, -3.7);
sill.castShadow = true;
sill.receiveShadow = true;
scene.add(sill);

const transom = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.055, 0.08), darkBar);
transom.position.set(0, SPRING, -3.86);
scene.add(transom);

function mullion(x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, SPRING - SILL - 0.04, 0.08), darkBar);
  mesh.position.set(x, (SILL + SPRING) / 2 + 0.01, -3.86);
  mesh.castShadow = true;
  return mesh;
}
scene.add(mullion(-0.24));
scene.add(mullion(0.24));

const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.45), causticMat);
pool.rotation.x = -Math.PI / 2;
pool.position.set(0, 0.03, 0.12);
scene.add(pool);

const poolRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.78, 0.008, 8, 64),
  brass
);
poolRing.rotation.x = Math.PI / 2;
poolRing.position.set(0, 0.034, 0.12);
scene.add(poolRing);

const optic = new THREE.Group();
optic.position.set(0, 1.2, -0.42);
scene.add(optic);

const lensPts = [];
const lensR = 0.32;
const bow = 0.11;
for (let i = 0; i <= 28; i++) {
  const y = -lensR + (2 * lensR * i) / 28;
  const x = Math.max(0.012, bow * (1 - (y / lensR) ** 2));
  lensPts.push(new THREE.Vector2(x, y));
}
const lensMat = new THREE.MeshPhysicalMaterial({
  color: 0xfff8ee,
  roughness: 0.05,
  metalness: 0,
  transmission: 0.9,
  thickness: 0.28,
  ior: 1.52,
  transparent: true,
  opacity: 1,
  envMapIntensity: 1.15,
  clearcoat: 0.4,
  clearcoatRoughness: 0.08,
});
const lens = new THREE.Mesh(new THREE.LatheGeometry(lensPts, 40), lensMat);
lens.rotation.x = -Math.PI / 2;
lens.castShadow = true;
optic.add(lens);

const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.016, 10, 40), brass);
lensRing.rotation.x = Math.PI / 2;
optic.add(lensRing);

const post = new THREE.Mesh(
  new THREE.CylinderGeometry(0.022, 0.028, 1.2, 12),
  brass
);
post.position.set(0.48, 0.6, -0.42);
post.castShadow = true;
scene.add(post);
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.018, 0.018), brass);
arm.position.set(0.24, 1.2, -0.42);
arm.castShadow = true;
scene.add(arm);

const column = new THREE.Mesh(
  new THREE.CylinderGeometry(0.14, 0.18, 3.35, 18),
  new THREE.MeshStandardMaterial({ color: 0x1c1822, roughness: 0.84, metalness: 0.06 })
);
column.position.set(-1.72, 1.68, -1.05);
column.castShadow = true;
scene.add(column);
const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.26, 0.28, 0.08, 18),
  column.material
);
base.position.set(-1.72, 0.06, -1.05);
base.castShadow = true;
scene.add(base);

scene.add(new THREE.HemisphereLight(0x4a4036, 0x07060c, 0.36));
const spot = new THREE.SpotLight(0xffe2b4, 8, 14, 0.46, 0.7, 1.5);
spot.position.set(0, 2.45, -3.55);
spot.target.position.set(0, 0.2, 0.2);
spot.castShadow = true;
spot.shadow.bias = -0.00035;
spot.shadow.camera.near = 0.4;
spot.shadow.camera.far = 12;
scene.add(spot);
scene.add(spot.target);
const rim = new THREE.PointLight(0xffe6c4, 1.4, 7, 2);
rim.position.set(1.4, 2.3, 2.1);
scene.add(rim);

function shaftGeometry(halfNear, halfFar, length) {
  const positions = new Float32Array([
    -halfNear, 0, 0,
    halfNear, 0, 0,
    halfFar, length, 0,
    -halfNear, 0, 0,
    halfFar, length, 0,
    -halfFar, length, 0,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

const shaftGroup = new THREE.Group();
shaftGroup.visible = false;
scene.add(shaftGroup);

function addShaft(from, to, halfNear, halfFar) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const length = delta.length();
  const mesh = new THREE.Mesh(shaftGeometry(halfNear, halfFar, length), shaftMat);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  shaftGroup.add(mesh);
}

const slitY = (SILL + SPRING) * 0.5;
const slitZ = -3.72;
addShaft(new THREE.Vector3(-0.46, slitY, slitZ), new THREE.Vector3(-0.28, 0.06, 0.22), 0.09, 0.26);
addShaft(new THREE.Vector3(0, slitY, slitZ), new THREE.Vector3(0, 0.05, 0.42), 0.09, 0.3);
addShaft(new THREE.Vector3(0.46, slitY, slitZ), new THREE.Vector3(0.28, 0.06, 0.22), 0.09, 0.26);
addShaft(new THREE.Vector3(0, SPRING + 0.36, slitZ), new THREE.Vector3(0, 0.08, 0.05), 0.16, 0.42);

const DUST_N = 140;
const dustGeo = new THREE.BufferGeometry();
const dustBase = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) {
  const t = Math.random();
  dustBase[i * 3] = THREE.MathUtils.lerp(-0.15, 0.15, Math.random()) + THREE.MathUtils.lerp(-0.55, 0.55, Math.random()) * (0.25 + t);
  dustBase[i * 3 + 1] = THREE.MathUtils.lerp(2.55, 0.25, t) + (Math.random() - 0.5) * 0.28;
  dustBase[i * 3 + 2] = THREE.MathUtils.lerp(-3.35, 0.55, t);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
const dustCanvas = document.createElement('canvas');
dustCanvas.width = dustCanvas.height = 64;
const dustCtx = dustCanvas.getContext('2d');
const dustGrad = dustCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
dustGrad.addColorStop(0, 'rgba(255,244,220,1)');
dustGrad.addColorStop(0.45, 'rgba(255,214,150,0.45)');
dustGrad.addColorStop(1, 'rgba(255,214,150,0)');
dustCtx.fillStyle = dustGrad;
dustCtx.fillRect(0, 0, 64, 64);
const dustMap = new THREE.CanvasTexture(dustCanvas);
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    map: dustMap,
    color: 0xffe6c0,
    size: 0.045,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
);
dust.frustumCulled = false;
scene.add(dust);

const GodRaysShader = {
  name: 'LightLabGodRays',
  uniforms: {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.58) },
    exposure: { value: 0.2 },
    decay: { value: 0.94 },
    density: { value: 0.7 },
    weight: { value: 0.2 },
    samples: { value: 40 },
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
    uniform vec2 lightPosition;
    uniform float exposure, decay, density, weight;
    uniform int samples;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 texCoord = vUv;
      vec2 delta = (texCoord - lightPosition) * (density / float(samples));
      float illuminationDecay = 1.0;
      vec3 shafts = vec3(0.0);
      for (int i = 0; i < 48; i++) {
        if (i >= samples) break;
        texCoord -= delta;
        vec4 s = texture2D(tDiffuse, texCoord);
        float lum = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
        float hot = smoothstep(2.6, 3.6, lum);
        shafts += s.rgb * hot * illuminationDecay * weight;
        illuminationDecay *= decay;
      }
      gl_FragColor = vec4(base.rgb + shafts * exposure, base.a);
    }
  `,
};

function applyGlass() {
  const safe = pathState.safe;
  lensMat.transmission = safe ? 0 : 0.9;
  lensMat.opacity = safe ? 0.72 : 1;
  lensMat.transparent = true;
  lensMat.depthWrite = true;
  lensMat.roughness = safe ? 0.08 : 0.05;
  lensMat.emissive = new THREE.Color(safe ? 0x3a2a18 : 0x000000);
  lensMat.emissiveIntensity = safe ? 0.22 : 0;
  lensMat.needsUpdate = true;
  lens.geometry.dispose();
  lens.geometry = new THREE.LatheGeometry(lensPts, safe ? 24 : 40);
}

function publishPath() {
  document.documentElement.dataset.lightPath = pathState.safe ? 'shafts' : 'composer';
  document.documentElement.dataset.composer = composer ? '1' : '0';
  document.documentElement.dataset.rendererCount = '1';
}

function applyBudget() {
  const safe = pathState.safe;
  const cap = safe ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  spot.shadow.mapSize.set(safe ? 512 : 1024);
  const count = safe ? 64 : DUST_N;
  dustGeo.setDrawRange(0, count);
  shaftGroup.visible = safe;
  if (safe) destroyComposer();
  else ensureComposer();
  applyGlass();
  if (!safe) ensureEnv();
  publishPath();
}

function ensureEnv() {
  if (envReady || pathState.safe) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  envReady = true;
}

function ensureComposer() {
  // Narrow, coarse, and ?safe=1 return before either object exists.
  if (composer || pathState.safe) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  if (floatEmbed) {
    renderPass.clearColor = new THREE.Color(0x000000);
    renderPass.clearAlpha = 0;
  }
  godPass = new ShaderPass(GodRaysShader);
  outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(godPass);
  composer.addPass(outputPass);
  sizeComposer();
}

function sizeComposer() {
  if (!composer) return;
  // EffectComposer multiplies CSS size by pixel ratio. A fractional
  // product (1.5× an odd width, or a zoomed display) leaves the
  // half-float targets incomplete. Pass integer device pixels.
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
  godPass = null;
  outputPass = null;
  renderPass = null;
}

function syncMotion() {
  pathState.still = wantsStill();
  controls.autoRotate = !pathState.still;
  document.documentElement.classList.toggle('is-still', pathState.still);
  document.documentElement.dataset.motion = pathState.still ? 'still' : 'live';
}

function resize() {
  const nextSafe = wantsSafe();
  const changed = nextSafe !== pathState.safe;
  pathState.safe = nextSafe;
  applyBudget();
  if (!pathState.safe && composer) sizeComposer();
  if (changed) syncMotion();
}

applyBudget();
syncMotion();

addEventListener('resize', resize);
coarseMql.addEventListener?.('change', resize);
narrowMql.addEventListener?.('change', resize);
reduceMql.addEventListener?.('change', syncMotion);
controls.addEventListener('start', () => { controls.autoRotate = false; });
controls.addEventListener('end', () => { controls.autoRotate = !pathState.still; });

const dustPos = dustGeo.attributes.position;
const _ndc = new THREE.Vector3();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (!pathState.still) elapsed += dt;
  const t = elapsed;
  causticUniforms.uTime.value = t * 0.55;
  shaftUniforms.uTime.value = pathState.still ? 0 : t;
  optic.position.y = 1.2 + (pathState.still ? 0 : Math.sin(t * 0.55) * 0.012);
  arm.position.y = optic.position.y;

  if (!pathState.still) {
    const draw = pathState.safe ? 64 : DUST_N;
    for (let i = 0; i < draw; i++) {
      let y = dustBase[i * 3 + 1] + ((t * 0.08 + i * 0.013) % 2.4);
      if (y > 2.7) y -= 2.4;
      dustPos.setY(i, y);
    }
    dustPos.needsUpdate = true;
  }

  controls.update();

  if (!pathState.safe && godPass) {
    _ndc.copy(apertureCenter).project(camera);
    if (_ndc.z < 1) {
      godPass.uniforms.lightPosition.value.set(_ndc.x * 0.5 + 0.5, _ndc.y * 0.5 + 0.5);
      godPass.uniforms.exposure.value = 0.2;
    } else {
      godPass.uniforms.exposure.value = 0;
    }
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
tick();
