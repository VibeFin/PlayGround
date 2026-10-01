import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPON_STATS, segmentCircleHit, rocketDamage, weaponState } from './weapons.js';
import { DestructionEffects } from './destruction.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);

export const CARS = [
  { name: 'THE RUST BUCKET', short: 'RUST BUCKET', color: '#bf6035', accent: '#ded8b8', number: '07', class: 'B', description: 'American muscle. Questionable brakes.', power: 7.8, armor: 8.5, handling: 6.2, maxSpeed: 27, acceleration: 14, health: 125 },
  { name: 'THE ROAD REAPER', short: 'ROAD REAPER', color: '#637d6c', accent: '#d8d6b3', number: '13', class: 'A', description: 'Built for speed. Hungry for trouble.', power: 9.2, armor: 6.4, handling: 7.8, maxSpeed: 33, acceleration: 18, health: 100 },
  { name: 'THE IRON BOAR', short: 'IRON BOAR', color: '#aaa18b', accent: '#343c34', number: '99', class: 'C', description: 'Heavy metal. Heavier consequences.', power: 6.8, armor: 9.8, handling: 5.1, maxSpeed: 23, acceleration: 11, health: 155 },
];
export const ARENAS = [
  { name: 'THE DUSTBOWL', description: 'Dirt. Dust. Destruction.', theme: 'GOLDEN HOUR', ground: '#aaa18a', fog: '#777461', time: 180 },
  { name: 'THE SCRAPYARD', description: 'Where good cars go to die.', theme: 'OVERCAST', ground: '#696653', fog: '#667264', time: 180 },
  { name: 'MIDNIGHT MAYHEM', description: 'Lights out. Gloves off.', theme: 'AFTER DARK', ground: '#61584d', fog: '#303b3c', time: 180 },
];

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paintTexture(color) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = i % 3 ? `rgba(38,29,19,${rand(.03, .25)})` : `rgba(232,220,178,${rand(.04, .16)})`;
      ctx.fillRect(rand(0, s), rand(0, s), rand(1, 7), rand(1, 5));
    }
    for (let i = 0; i < 24; i++) {
      ctx.strokeStyle = '#3f332650'; ctx.lineWidth = rand(.3, 1.2);
      let x = rand(0, s), y = rand(0, s);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(8, 40), y + rand(-4, 4)); ctx.stroke();
    }
  });
}

function labelTexture(text, color = '#eee8cc', background = null, size = 512) {
  return canvasTexture(size, (ctx, s) => {
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, s, s); }
    ctx.fillStyle = color;
    ctx.font = `900 ${text.length > 5 ? s * .48 : s * .65}px 'Barlow Condensed', Impact, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, s / 2, s / 2, s * .94);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 190; i++) ctx.clearRect(rand(0, s), rand(0, s), rand(1, 6), rand(1, 4));
  });
}

const metal = new THREE.MeshStandardMaterial({ color: '#4b4d43', roughness: .82, metalness: .65 });
const darkMetal = new THREE.MeshStandardMaterial({ color: '#262c26', roughness: .82, metalness: .45 });
const rubber = new THREE.MeshStandardMaterial({ color: '#20241e', roughness: 1 });
const chrome = new THREE.MeshStandardMaterial({ color: '#aba994', roughness: .48, metalness: .8 });
const glass = new THREE.MeshStandardMaterial({ color: '#536461', roughness: .28, metalness: .28, emissive: '#253a35', emissiveIntensity: .14, side: THREE.DoubleSide });

// Batch static pieces by material: detailed wheels shouldn't cost hundreds of draw calls.
function batchMeshes(group, excluded = []) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || mesh.isInstancedMesh || excluded.includes(mesh)) continue;
    const signature = Object.keys(mesh.geometry.attributes).sort().join(',');
    const key = `${mesh.material.uuid}/${signature}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, meshes[0].material);
    merged.castShadow = meshes.some(m => m.castShadow); merged.receiveShadow = meshes.some(m => m.receiveShadow);
    meshes.forEach(mesh => { group.remove(mesh); mesh.geometry.dispose(); });
    group.add(merged);
  }
}

function box(parent, size, position, material, rotation) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, length, position, material, rotation = [0, 0, Math.PI / 2], segments = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.position.set(...position); mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

function panel(parent, points, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

function barBetween(parent, a, b, radius, material) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const delta = bv.clone().sub(av);
  const bar = cylinder(parent, radius, delta.length(), av.clone().add(bv).multiplyScalar(.5).toArray(), material, [0, 0, 0], 6);
  bar.quaternion.setFromUnitVectors(UP, delta.normalize());
  return bar;
}

export function makeCar(config, index = 0) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ map: paintTexture(config.color), roughness: .72, metalness: .4 });
  const wornPaint = new THREE.MeshStandardMaterial({ map: paintTexture(config.color), roughness: .85, metalness: .3, side: THREE.DoubleSide });
  const stripe = new THREE.MeshStandardMaterial({ color: config.accent, roughness: .86, metalness: .12 });
  const decal = new THREE.MeshStandardMaterial({ map: labelTexture(config.number), transparent: true, roughness: .8, depthWrite: false, side: THREE.DoubleSide });
  const body = new THREE.Group(); car.add(body);
  box(body, [1.94, .48, 4.4], [0, .79, 0], paint);
  box(body, [1.85, .17, 4.3], [0, .5, 0], darkMetal);
  const hood = box(body, [1.94, .16, 1.6], [0, 1.08, 1.37], wornPaint, [-.035, 0, 0]);
  box(body, [1.96, .14, 1.15], [0, 1.09, -1.6], wornPaint);
  box(body, [.3, .015, 1.63], [-.27, 1.171, 1.38], stripe, [-.035, 0, 0]);
  box(body, [.3, .015, 1.63], [.27, 1.171, 1.38], stripe, [-.035, 0, 0]);
  box(body, [1.7, .13, 1.45], [0, 1.76, -.5], paint);
  box(body, [.3, .012, 1.47], [-.27, 1.832, -.5], stripe);
  box(body, [.3, .012, 1.47], [.27, 1.832, -.5], stripe);
  // Sloped windshield, rear glass, and chunky window pillars.
  panel(body, [[-.83, 1.69, .18], [.83, 1.69, .18], [.95, 1.14, .78], [-.95, 1.14, .78]], glass);
  panel(body, [[.82, 1.69, -1.17], [-.82, 1.69, -1.17], [-.93, 1.14, -1.62], [.93, 1.14, -1.62]], glass);
  for (const side of [-1, 1]) {
    panel(body, [[side * .96, 1.13, .65], [side * .84, 1.69, .15], [side * .84, 1.69, -1.12], [side * .95, 1.13, -1.58]], glass);
    barBetween(body, [side * .98, 1.1, .8], [side * .86, 1.74, .16], .065, wornPaint);
    barBetween(body, [side * .97, 1.12, -1.63], [side * .86, 1.74, -1.16], .08, wornPaint);
    barBetween(body, [side * .96, 1.12, -.55], [side * .85, 1.72, -.55], .05, wornPaint);
    box(body, [.015, .025, 1.18], [side * .982, .68, -.1], chrome);
    box(body, [.034, .038, .18], [side * .99, 1.045, -.55], chrome);
    box(body, [.16, .12, .26], [side * 1.06, 1.21, .61], darkMetal);
    const number = new THREE.Mesh(new THREE.PlaneGeometry(.75, .47), decal);
    number.position.set(side * .986, .88, -.08); number.rotation.y = side * Math.PI / 2;
    body.add(number);
    // Bolted-on reinforcement and scraped wheel arches.
    box(body, [.08, .18, 4.05], [side * 1.005, .56, 0], metal);
    for (const z of [-1.4, 1.35]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(.51, .04, 5, 18, Math.PI), metal);
      arch.rotation.y = Math.PI / 2; arch.rotation.z = -Math.PI / 2;
      arch.position.set(side * 1.02, .56, z); body.add(arch);
    }
    for (let z = -1.6; z < 1.8; z += .45) cylinder(body, .025, .018, [side * 1.048, .62, z], chrome, [0, 0, Math.PI / 2], 6);
  }
  const front = box(body, [2.02, .16, .16], [0, .55, 2.26], metal);
  const rear = box(body, [2.02, .17, .16], [0, .59, -2.26], metal);
  box(body, [1.85, .26, .04], [0, .86, 2.225], darkMetal);
  for (let x = -.8; x <= .8; x += .13) box(body, [.024, .2, .035], [x, .86, 2.252], metal);
  const headlight = new THREE.MeshStandardMaterial({ color: '#ddd7ad', roughness: .48, emissive: '#928654', emissiveIntensity: .16 });
  for (const x of [-.76, -.48, .48, .76]) cylinder(body, .105, .04, [x, .95, 2.27], headlight, [Math.PI / 2, 0, 0], 16);
  for (const x of [-.77, .77]) box(body, [.29, .13, .05], [x, .89, -2.24], new THREE.MeshStandardMaterial({ color: '#863d2b', emissive: '#61231a', emissiveIntensity: .4 }));
  box(body, [.53, .15, .04], [0, .73, -2.26], stripe);
  box(body, [.56, .13, .45], [0, 1.23, 1.18], darkMetal);
  box(body, [.49, .12, .09], [0, 1.3, 1.38], metal);
  // Interior roll cage is visible through the dark glass.
  barBetween(body, [-.76, 1.15, -.4], [.76, 1.65, -.9], .035, metal);
  barBetween(body, [.76, 1.15, -.4], [-.76, 1.65, -.9], .035, metal);
  const wheels = [];
  for (const x of [-1.04, 1.04]) for (const z of [-1.38, 1.35]) {
    const wheel = new THREE.Group(); wheel.position.set(x, .49, z); car.add(wheel);
    cylinder(wheel, .47, .29, [0, 0, 0], rubber, [0, 0, Math.PI / 2], 28);
    cylinder(wheel, .27, .31, [0, 0, 0], metal);
    cylinder(wheel, .14, .32, [0, 0, 0], darkMetal);
    cylinder(wheel, .075, .34, [0, 0, 0], chrome, [0, 0, Math.PI / 2], 8);
    const outside = Math.sign(x) * .16;
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const spoke = box(wheel, [.018, .21, .05], [outside, Math.cos(angle) * .14, Math.sin(angle) * .14], chrome);
      spoke.rotation.x = angle;
    }
    for (let i = 0; i < 26; i++) {
      const angle = i / 26 * Math.PI * 2;
      const tread = box(wheel, [.295, .025, .09], [0, Math.cos(angle) * .466, Math.sin(angle) * .466], rubber);
      tread.rotation.x = angle;
    }
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(.275, .02, 6, 24), chrome);
    rimRing.rotation.y = Math.PI / 2; rimRing.position.x = outside; wheel.add(rimRing);
    batchMeshes(wheel);
    wheels.push(wheel);
  }
  if (index === 2) {
    box(body, [2.16, .27, .22], [0, .72, 2.38], metal);
    barBetween(body, [-.85, .78, 2.4], [-.85, 1.3, 2.4], .07, metal);
    barBetween(body, [.85, .78, 2.4], [.85, 1.3, 2.4], .07, metal);
    barBetween(body, [-.85, 1.3, 2.4], [.85, 1.3, 2.4], .07, metal);
  }
  // Hood-mounted rotary gun and twin roof rocket pods.
  const weaponAccent = new THREE.MeshStandardMaterial({ color: '#cb7c35', roughness: .62, metalness: .5 });
  const gun = new THREE.Group(); gun.position.set(0, 1.43, 1.32); body.add(gun);
  box(gun, [.42, .25, .45], [0, -.03, -.25], darkMetal);
  box(body, [.55, .12, .62], [0, 1.21, 1.22], metal);
  const barrels = new THREE.Group(); gun.add(barrels);
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    cylinder(barrels, .04, .95, [Math.cos(angle) * .11, Math.sin(angle) * .11, .26], chrome, [Math.PI / 2, 0, 0], 8);
  }
  cylinder(barrels, .155, .07, [0, 0, .55], darkMetal, [Math.PI / 2, 0, 0]);
  cylinder(barrels, .16, .08, [0, 0, -.05], weaponAccent, [Math.PI / 2, 0, 0]);
  batchMeshes(barrels); batchMeshes(gun);
  const muzzleFlash = new THREE.Mesh(new THREE.ConeGeometry(.18, .48, 5), new THREE.MeshBasicMaterial({ color: '#fff1ad', transparent: true, opacity: .9, depthWrite: false }));
  muzzleFlash.position.z = .94; muzzleFlash.rotation.x = Math.PI / 2; muzzleFlash.visible = false; gun.add(muzzleFlash);
  for (const side of [-1, 1]) {
    box(body, [.35, .14, .7], [side * .66, 1.88, -.42], metal);
    for (const x of [side * .66 - .085, side * .66 + .085]) {
      cylinder(body, .13, 1.1, [x, 2.07, -.32], darkMetal, [Math.PI / 2, 0, 0], 10);
      cylinder(body, .105, .055, [x, 2.07, .25], weaponAccent, [Math.PI / 2, 0, 0], 10);
      cylinder(body, .065, .065, [x, 2.07, .29], rubber, [Math.PI / 2, 0, 0], 8);
    }
  }
  body.scale.y = .85;
  car.scale.z = 1.12;
  batchMeshes(body, [hood, front, rear]);
  car.userData = { body, wheels, hood, front, rear, paint, barrels, muzzleFlash, weapons: weaponState(), config, health: config.health, maxHealth: config.health, speed: 0, velocity: new THREE.Vector2(), angle: 0, alive: true, cooldown: 0, aiTimer: 0, aiTarget: 0, aggression: rand(.6, 1), wobble: 0 };
  return car;
}

export class DerbyScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#777461', .015);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    const mobile = container.clientWidth < 800;
    this.camera = new THREE.PerspectiveCamera(mobile ? 46 : 42, container.clientWidth / container.clientHeight, .1, 220);
    this.camera.position.set(...(mobile ? [14, 8.5, 23] : [11.5, 6.3, 15.5]));
    this.camera.lookAt(...(mobile ? [-.5, -.5, 2] : [-5, -3.7, .5]));
    this.clock = new THREE.Clock();
    this.keys = {}; this.mode = 'lobby'; this.carIndex = 0; this.arenaIndex = 0; this.effects = []; this.tracks = []; this.projectiles = [];
    this.weaponHitCooldown = 0;
    this.time = 0; this.boost = 100; this.takedowns = 0; this.damageDealt = 0; this.impactShake = 0; this.view = 0;
    this.buildEnvironment(); this.destruction = new DestructionEffects(this.scene); this.spawnPreview();
    this.resizeObserver = new ResizeObserver(() => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix(); this.renderer.setSize(container.clientWidth, container.clientHeight);
    }); this.resizeObserver.observe(container);
    this.renderer.setAnimationLoop(() => this.animate());
  }

  buildEnvironment() {
    const hemisphere = new THREE.HemisphereLight('#d6d6b8', '#3b382a', 2.5); this.scene.add(hemisphere); this.ambient = hemisphere;
    this.sun = new THREE.DirectionalLight('#ffe2aa', 3.3); this.sun.position.set(-28, 31, -10);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -45; this.sun.shadow.camera.right = 45; this.sun.shadow.camera.top = 45; this.sun.shadow.camera.bottom = -45;
    this.sun.shadow.camera.far = 110; this.sun.shadow.normalBias = .04; this.sun.shadow.bias = -.00015;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight('#c3d3c5', .7); fill.position.set(10, 8, 30); this.scene.add(fill);
    const skyGeo = new THREE.SphereGeometry(160, 24, 16);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { topColor: { value: new THREE.Color('#343b38') }, bottomColor: { value: new THREE.Color('#b0a47c') } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPosition; void main(){float h=normalize(vPosition).y; vec3 col=mix(bottomColor,topColor,pow(max(h,0.),.42)); float haze=sin(vPosition.x*.06+vPosition.z*.018)*sin(vPosition.z*.03)*.04; gl_FragColor=vec4(col+haze,1.);}',
      depthWrite: false,
    });
    const sky = new THREE.Mesh(skyGeo, this.skyMaterial); this.scene.add(sky);
    const dirtTexture = canvasTexture(1024, (ctx, s) => {
      ctx.fillStyle = '#b6ac94'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 60000; i++) {
        const shade = Math.round(rand(55, 170));
        ctx.fillStyle = `rgba(${shade},${shade * .9},${shade * .68},${rand(.03, .22)})`;
        ctx.fillRect(rand(0, s), rand(0, s), rand(1, 5), rand(1, 4));
      }
      for (let i = 0; i < 160; i++) {
        ctx.strokeStyle = '#443f2e19'; ctx.lineWidth = rand(1, 4);
        ctx.beginPath(); ctx.ellipse(rand(0, s), rand(0, s), rand(30, 200), rand(15, 80), rand(0, 6), 0, 4); ctx.stroke();
      }
    });
    dirtTexture.wrapS = dirtTexture.wrapT = THREE.RepeatWrapping; dirtTexture.repeat.set(5, 5);
    dirtTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: ARENAS[0].ground, map: dirtTexture, bumpMap: dirtTexture, bumpScale: .055, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -.015; this.scene.add(ground);
    // Scuffed oval tire grooves in the sand.
    const trackMaterial = new THREE.MeshBasicMaterial({ color: '#3f3828', transparent: true, opacity: .11, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 16; i++) {
      const curve = new THREE.EllipseCurve(0, 0, rand(10, 27), rand(8, 25), rand(0, 3), rand(4, 6.28));
      const pts = curve.getPoints(90).map(p => new THREE.Vector3(p.x, .015, p.y));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .045, 3, false), trackMaterial);
      this.scene.add(tube);
    }
    const barrierWhite = new THREE.MeshStandardMaterial({ color: '#b0ad94', roughness: 1, map: paintTexture('#aaa68d') });
    const barrierOrange = new THREE.MeshStandardMaterial({ color: '#b76439', roughness: .95, map: paintTexture('#bb6b40') });
    for (let i = 0; i < 62; i++) {
      const a = i / 62 * Math.PI * 2;
      const wall = box(this.scene, [3.3, 1.25, .8], [Math.sin(a) * 34, .625, Math.cos(a) * 34], i % 6 < 3 ? barrierWhite : barrierOrange);
      wall.rotation.y = a;
      if (i % 2 === 0) {
        const pole = cylinder(this.scene, .055, 3.1, [Math.sin(a) * 34.5, 2.2, Math.cos(a) * 34.5], metal, [0, 0, 0], 6);
        pole.rotation.z = rand(-.02, .02);
      }
    }
    // Arena fencing, grandstand, and industrial silhouettes.
    const fenceMaterial = new THREE.MeshStandardMaterial({ color: '#777a66', transparent: true, opacity: .25, roughness: .8 });
    const fenceMap = canvasTexture(64, (ctx, s) => {
      ctx.clearRect(0, 0, s, s); ctx.strokeStyle = '#d2d2ac'; ctx.lineWidth = 1;
      for (let i = -s; i < s * 2; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - s, s); ctx.stroke(); }
    });
    fenceMap.wrapS = fenceMap.wrapT = THREE.RepeatWrapping; fenceMap.repeat.set(8, 2);
    fenceMaterial.map = fenceMap; fenceMaterial.side = THREE.DoubleSide; fenceMaterial.alphaTest = .1;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(9.1, 2.6), fenceMaterial);
      fence.position.set(Math.sin(a) * 34.5, 2.5, Math.cos(a) * 34.5); fence.rotation.y = a; this.scene.add(fence);
    }
    const standMat = new THREE.MeshStandardMaterial({ color: '#494e41', roughness: .9, metalness: .3 });
    const spectatorMaterials = ['#8d846b', '#555b4b', '#655841', '#a2987e'].map(color => new THREE.MeshStandardMaterial({ color }));
    for (let row = 0; row < 7; row++) {
      box(this.scene, [43, .35, 1.15], [0, 1.2 + row * .62, -38 - row * 1.2], standMat);
      box(this.scene, [43, .17, .35], [0, 1.55 + row * .62, -38.2 - row * 1.2], darkMetal);
      for (let n = 0; n < 31; n++) {
        if (Math.random() > .25) {
          const spectator = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .22, 2, 4), spectatorMaterials[n % 4]);
          spectator.position.set(-19 + n * 1.3 + rand(-.3, .3), 1.8 + row * .62, -38.2 - row * 1.2); this.scene.add(spectator);
        }
      }
    }
    for (const x of [-19, -9, 9, 19]) box(this.scene, [.17, 6, .17], [x, 2.7, -43], metal);
    box(this.scene, [45, .25, 10], [0, 6, -41.4], standMat, [-.06, 0, 0]);
    this.makeBillboard('W R E C K Y A R D', [0, 5.1, -32.8], 13, 2.2, '#e5dcc0', '#2e3428');
    this.makeBillboard('NO RULES. ALL GAS.', [-22, 2.5, -26], 7, 1.65, '#282b22', '#b37347', .55);
    this.makeBillboard('BREAK SOMETHING.', [25, 2.5, -24], 7, 1.65, '#d8d1b1', '#3d4533', -.65);
    for (const [x, z] of [[-27, -24], [26, -25], [-30, 19], [29, 16]]) {
      cylinder(this.scene, .14, 15, [x, 7.5, z], metal, [0, 0, 0], 8);
      box(this.scene, [3.3, .17, .25], [x, 14.5, z], metal);
      for (let n = 0; n < 4; n++) {
        const floodMat = new THREE.MeshStandardMaterial({ color: '#dddab5', emissive: '#f0df9f', emissiveIntensity: 2 });
        box(this.scene, [.62, .45, .22], [x - 1.22 + n * .82, 14.4, z + .12], floodMat, [.2, 0, 0]);
      }
      const light = new THREE.PointLight('#ffe7a9', 20, 35, 2); light.position.set(x, 13, z); this.scene.add(light);
    }
    this.obstacles = [];
    for (const [x, z, count] of [[-18, 10, 5], [17, -11, 5], [-8, -15, 4], [22, 16, 4]]) {
      for (let i = 0; i < count; i++) {
        const tire = cylinder(this.scene, .68, .42, [x + rand(-.4, .4), .21 + i * .4, z + rand(-.2, .2)], rubber, [0, 0, 0], 18);
        tire.rotation.z = rand(-.12, .12);
      }
      this.obstacles.push({ x, z, radius: 1.1 });
    }
    const barrelMat = new THREE.MeshStandardMaterial({ color: '#886b43', map: paintTexture('#976c3a'), roughness: .85, metalness: .3 });
    for (let i = 0; i < 8; i++) {
      const x = rand(-25, 25), z = rand(-23, -19);
      cylinder(this.scene, .38, 1.05, [x, .52, z], barrelMat, [0, 0, 0], 12);
      for (const y of [.18, .8]) cylinder(this.scene, .397, .035, [x, y, z], metal, [0, 0, 0], 12);
      this.obstacles.push({ x, z, radius: .45 });
    }
    const mountainMaterial = new THREE.MeshStandardMaterial({ color: '#626954', roughness: 1 });
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, r = rand(80, 115), h = rand(5, 13);
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(rand(12, 26), h, 5), mountainMaterial);
      mountain.position.set(Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r); mountain.rotation.y = rand(0, 6); this.scene.add(mountain);
    }
    // Shredded metal and stones give the floor some scale.
    const debrisGeo = new THREE.DodecahedronGeometry(1, 0);
    const debris = new THREE.InstancedMesh(debrisGeo, new THREE.MeshStandardMaterial({ color: '#71684d', roughness: 1 }), 160);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      const a = rand(0, 6.28), r = rand(12, 33);
      dummy.position.set(Math.cos(a) * r, .03, Math.sin(a) * r); dummy.scale.set(rand(.04, .14), rand(.025, .08), rand(.04, .18)); dummy.rotation.set(rand(0, 3), rand(0, 3), 0); dummy.updateMatrix(); debris.setMatrixAt(i, dummy.matrix);
    } debris.receiveShadow = true; this.scene.add(debris);
    batchMeshes(this.scene, [ground, sky]);
    this.dustTexture = canvasTexture(128, (ctx, s) => {
      const gradient = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gradient.addColorStop(0, '#e0ccab80'); gradient.addColorStop(.35, '#c6b28c40'); gradient.addColorStop(1, '#c6b28c00');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, s, s);
    });
  }

  makeBillboard(text, position, width, height, color, background, angle = 0) {
    const group = new THREE.Group(); group.position.set(...position); group.rotation.y = angle;
    box(group, [width + .2, height + .2, .17], [0, 0, 0], metal);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: labelTexture(text, color, background), roughness: .9 }));
    mesh.position.z = .1; group.add(mesh);
    for (const x of [-width * .4, width * .4]) box(group, [.12, position[1], .12], [x, -position[1] / 2, -.1], metal);
    batchMeshes(group);
    this.scene.add(group);
  }

  clearCars() {
    this.clearProjectiles();
    this.destruction.clear(); this.takedownFocus = null;
    if (this.cars) this.cars.forEach(car => {
      this.scene.remove(car);
      const materials = new Set();
      car.traverse(child => { if (child.isMesh) { child.geometry.dispose(); if (![metal, darkMetal, rubber, chrome, glass].includes(child.material)) materials.add(child.material); } });
      materials.forEach(mat => { mat.map?.dispose(); mat.dispose(); });
    });
    this.cars = [];
  }

  spawnPreview() {
    this.clearCars();
    const positions = [[4.5, 5.8, -.63], [-3, -4, .9], [11, -7, -1.3], [-14, -12, .45]];
    positions.forEach(([x, z, a], i) => {
      const car = makeCar(CARS[i === 0 ? this.carIndex : (i + 1) % 3], i === 0 ? this.carIndex : (i + 1) % 3);
      car.position.set(x, 0, z); car.rotation.y = a; car.userData.angle = a;
      this.scene.add(car); this.cars.push(car);
    });
    this.player = this.cars[0]; this.mode = 'lobby';
  }

  selectCar(index) { this.carIndex = index; this.spawnPreview(); }

  selectArena(index) {
    this.arenaIndex = index;
    const arena = ARENAS[index]; this.groundMaterial.color.set(arena.ground); this.scene.fog.color.set(arena.fog);
    this.scene.fog.density = index === 1 ? .02 : .015;
    this.skyMaterial.uniforms.topColor.value.set(index === 2 ? '#121d24' : index === 1 ? '#3d4b48' : '#343b38');
    this.skyMaterial.uniforms.bottomColor.value.set(index === 2 ? '#435452' : index === 1 ? '#9ba58f' : '#b0a47c');
    this.sun.intensity = index === 2 ? .6 : index === 1 ? 1.8 : 3.3;
    this.ambient.intensity = index === 2 ? 1.3 : 2.5;
  }

  start() {
    this.clearCars();
    this.time = ARENAS[this.arenaIndex].time; this.boost = 100; this.takedowns = 0; this.damageDealt = 0; this.keys = {}; this.weaponHitCooldown = 0;
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const config = i === 0 ? CARS[this.carIndex] : { ...CARS[i % 3], color: ['#b94e31', '#6c7d79', '#a5a082', '#615e85', '#ba9146', '#597159', '#8f4540', '#426469'][i], number: String(10 + i * 7) };
      const car = makeCar(config, i === 0 ? this.carIndex : i % 3);
      car.position.set(Math.sin(angle) * 22, 0, Math.cos(angle) * 22); car.rotation.y = angle + Math.PI;
      car.userData.angle = angle + Math.PI; car.userData.aiTarget = (i + 4) % 8;
      if (i > 0) car.userData.weapons.rocketCooldown = rand(6, 14);
      this.cars.push(car); this.scene.add(car);
    }
    this.player = this.cars[0]; this.mode = 'countdown'; this.impactShake = 0;
    this.camera.position.set(0, 5.2, 31); this.camera.lookAt(0, 1, 15);
    return this.player;
  }

  play() { this.mode = 'playing'; }
  pause() { if (this.mode === 'playing') { this.mode = 'paused'; this.keys = {}; } }
  resume() { if (this.mode === 'paused') this.mode = 'playing'; }
  lobby() { this.spawnPreview(); }

  resetCar() {
    const data = this.player.userData;
    const distance = this.player.position.length();
    if (distance > 28) this.player.position.multiplyScalar(24 / distance);
    data.speed = 0; data.velocity.set(0, 0); data.wobble = 0;
    data.angle = Math.atan2(-this.player.position.x, -this.player.position.z);
  }

  spawnDust(position, count = 1, intensity = 1, airborne = false) {
    if (this.effects.length > 160) return;
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({ map: this.dustTexture, transparent: true, opacity: .35 * intensity, depthWrite: false, color: '#d5c7a2' });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position); sprite.position.x += rand(-.6, .6); sprite.position.z += rand(-.6, .6); sprite.position.y = airborne ? position.y : rand(.2, .6);
      const scale = rand(.6, 1.6); sprite.scale.set(scale, scale, scale);
      this.scene.add(sprite); this.effects.push({ mesh: sprite, life: rand(.6, 1.4), maxLife: 1.4, velocity: new THREE.Vector3(rand(-.7, .7), rand(.6, 1.1), rand(-.7, .7)), opacity: .35 * intensity, dust: true });
    }
  }

  sparks(position, strength) {
    for (let i = 0; i < Math.min(20, strength); i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.035, .035, rand(.1, .25)), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffd06a' : '#ff7137' }));
      mesh.position.copy(position); mesh.position.y = .7; this.scene.add(mesh);
      this.effects.push({ mesh, life: rand(.2, .6), maxLife: .6, velocity: new THREE.Vector3(rand(-5, 5), rand(2, 5), rand(-5, 5)), dust: false });
    }
    this.spawnDust(position, strength > 5 ? 8 : 1, strength > 5 ? 1.5 : .5);
  }

  disposeProjectile(projectile) {
    this.scene.remove(projectile.mesh);
    projectile.mesh.traverse(child => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
  }

  clearProjectiles() {
    this.projectiles.forEach(p => this.disposeProjectile(p));
    this.projectiles.length = 0;
  }

  fireWeapon(car, type) {
    if (this.mode !== 'playing' || !car.userData.alive || this.projectiles.length >= 128) return false;
    const d = car.userData, w = d.weapons, stats = WEAPON_STATS[type];
    if (!stats) return false;
    if (type === 'minigun' && (w.overheated || w.gunCooldown > 0)) return false;
    if (type === 'rocket' && (w.rockets <= 0 || w.rocketCooldown > 0 || w.reload > 0)) return false;
    const angle = d.angle + (type === 'minigun' ? rand(-.012, .012) : 0);
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const right = new THREE.Vector3(Math.cos(d.angle), 0, -Math.sin(d.angle));
    const position = car.position.clone().addScaledVector(direction, type === 'rocket' ? .9 : 2.75);
    position.y = type === 'rocket' ? 1.76 : 1.21;
    let mesh;
    if (type === 'minigun') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(.065, .065, 1.25), new THREE.MeshBasicMaterial({ color: '#ffdd7e', toneMapped: false }));
      w.gunCooldown = stats.interval; w.heat = Math.min(100, w.heat + stats.heatPerShot);
      w.overheated = w.heat >= 100; w.shots++; w.flash = .055;
      d.muzzleFlash.visible = true; d.barrels.rotation.z += .8;
    } else {
      mesh = new THREE.Group(); position.addScaledVector(right, w.launches % 2 ? -.66 : .66);
      const shell = new THREE.MeshStandardMaterial({ color: '#b9b69b', roughness: .45, metalness: .65 });
      const tip = new THREE.MeshBasicMaterial({ color: '#ff6536' });
      cylinder(mesh, .105, .64, [0, 0, 0], shell, [Math.PI / 2, 0, 0], 10);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(.105, .23, 10), tip);
      nose.rotation.x = Math.PI / 2; nose.position.z = .435; mesh.add(nose);
      box(mesh, [.36, .025, .22], [0, 0, -.24], shell.clone());
      box(mesh, [.025, .36, .22], [0, 0, -.24], shell.clone());
      const exhaust = new THREE.Mesh(new THREE.ConeGeometry(.15, .52, 6), new THREE.MeshBasicMaterial({ color: '#ffbc53', toneMapped: false }));
      exhaust.rotation.x = -Math.PI / 2; exhaust.position.z = -.58; mesh.add(exhaust);
      w.rockets--; w.launches++; w.rocketCooldown = car === this.player ? stats.cooldown : 9;
      if (w.rockets === 0) w.reload = stats.reload;
      if (car === this.player) this.impactShake = Math.max(this.impactShake, .06);
    }
    mesh.position.copy(position); mesh.rotation.y = angle; this.scene.add(mesh);
    this.projectiles.push({ mesh, owner: car, type, velocity: direction.multiplyScalar(stats.speed), life: type === 'rocket' ? stats.lifetime : stats.range / stats.speed, trail: 0 });
    this.onWeaponFire?.(type, car === this.player);
    return true;
  }

  updateWeapons(dt) {
    this.weaponHitCooldown = Math.max(0, this.weaponHitCooldown - dt);
    this.cars.forEach((car, index) => {
      const d = car.userData, w = d.weapons;
      w.gunCooldown = Math.max(0, w.gunCooldown - dt); w.rocketCooldown = Math.max(0, w.rocketCooldown - dt);
      w.flash = Math.max(0, w.flash - dt); d.muzzleFlash.visible = d.alive && w.flash > 0;
      if (w.reload > 0) { w.reload = Math.max(0, w.reload - dt); if (w.reload === 0) w.rockets = WEAPON_STATS.rocket.capacity; }
      let gun = false, rocket = false;
      if (index === 0) { gun = !!this.keys.f; rocket = !!this.keys.e; }
      else {
        w.aiPhase += dt;
        const target = this.cars[d.aiTarget];
        if (target?.userData.alive) {
          const delta = target.position.clone().sub(car.position), distance = delta.length();
          const alignment = distance > 0 ? (delta.x * Math.sin(d.angle) + delta.z * Math.cos(d.angle)) / distance : 0;
          gun = distance < 25 && alignment > .985 && Math.floor(w.aiPhase * 1.5) % 3 === 0;
          rocket = distance > 10 && distance < 30 && alignment > .997;
        }
      }
      if (!d.alive) return;
      if (!gun || w.overheated) w.heat = Math.max(0, w.heat - WEAPON_STATS.minigun.cooling * dt);
      if (w.overheated && w.heat <= WEAPON_STATS.minigun.resumeHeat) w.overheated = false;
      if (gun && !w.overheated) { d.barrels.rotation.z += dt * 35; this.fireWeapon(car, 'minigun'); }
      if (rocket) this.fireWeapon(car, 'rocket');
    });
  }

  explodeRocket(projectile, directTarget = null) {
    const position = projectile.mesh.position, playerShot = projectile.owner === this.player;
    let dealt = 0;
    for (const car of this.cars) {
      if (car === projectile.owner || !car.userData.alive) continue;
      const distance = Math.hypot(car.position.x - position.x, car.position.z - position.z);
      const amount = rocketDamage(distance, car === directTarget, playerShot ? WEAPON_STATS.rocket.damage : 32);
      if (amount <= 0) continue;
      const applied = this.damage(car, amount, position, playerShot);
      if (playerShot) dealt += applied;
      const impulse = new THREE.Vector2(car.position.x - position.x, car.position.z - position.z).normalize();
      car.userData.velocity.addScaledVector(impulse, 7 * (1 - Math.min(distance / WEAPON_STATS.rocket.radius, 1)));
      if (car === this.player) { this.impactShake = .4; this.onHit?.('ROCKET IMPACT!', -Math.round(applied), 20); }
    }
    if (playerShot && dealt > 0) this.onHit?.(directTarget ? 'ROCKET HIT!' : 'BLAST DAMAGE!', Math.round(dealt), 20);
    this.destruction.blast(position);
    const distance = position.distanceTo(this.player.position);
    this.impactShake = Math.max(this.impactShake, .2 * Math.max(0, 1 - distance / 20));
    this.onExplosion?.(distance, 'rocket');
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i], start = p.mesh.position.clone(), end = start.clone().addScaledVector(p.velocity, dt);
      let contact = 1, target = null, collided = false;
      for (const car of this.cars) {
        if (car === p.owner) continue;
        for (const offset of [-1.1, 1.1]) {
          const x = car.position.x + Math.sin(car.userData.angle) * offset, z = car.position.z + Math.cos(car.userData.angle) * offset;
          const t = segmentCircleHit(start.x, start.z, end.x, end.z, x, z, p.type === 'rocket' ? 1.25 : 1.1);
          if (t !== null && t <= contact) { contact = t; target = car; collided = true; }
        }
      }
      for (const obstacle of this.obstacles) {
        const t = segmentCircleHit(start.x, start.z, end.x, end.z, obstacle.x, obstacle.z, obstacle.radius);
        if (t !== null && t < contact) { contact = t; target = null; collided = true; }
      }
      p.mesh.position.lerpVectors(start, end, contact); p.life -= dt;
      if (Math.hypot(p.mesh.position.x, p.mesh.position.z) >= 33.6) {
        const scale = 33.6 / Math.hypot(p.mesh.position.x, p.mesh.position.z);
        p.mesh.position.x *= scale; p.mesh.position.z *= scale; collided = true; target = null;
      }
      if (p.type === 'rocket') {
        p.trail -= dt; p.mesh.position.y = Math.max(1.1, p.mesh.position.y - dt * .45);
        if (p.trail <= 0) { this.spawnDust(p.mesh.position, 1, 1.1, true); p.trail = .045; }
      }
      if (collided || p.life <= 0) {
        if (p.type === 'rocket') this.explodeRocket(p, target);
        else if (collided) {
          if (target?.userData.alive) {
            const amount = this.damage(target, p.owner === this.player ? WEAPON_STATS.minigun.damage : 1.6, p.mesh.position, p.owner === this.player);
            if (p.owner === this.player && !this.weaponHitCooldown) { this.onHit?.('MINIGUN HIT!', Math.round(amount), 2); this.weaponHitCooldown = .35; }
          }
          this.sparks(p.mesh.position, 2);
        }
        this.disposeProjectile(p); this.projectiles.splice(i, 1);
      }
    }
  }

  damage(car, amount, position, byPlayer = false) {
    const d = car.userData;
    if (!d.alive) return 0;
    const applied = Math.min(d.health, Math.max(0, amount));
    d.health -= applied; d.wobble = .16;
    if (byPlayer && applied > 0) d.lastPlayerHitAt = this.time;
    const damageLevel = 1 - d.health / d.maxHealth;
    d.hood.rotation.x = -.035 - damageLevel * .15; d.hood.rotation.z = damageLevel * .065;
    d.front.position.z = 2.26 - damageLevel * .35; d.front.rotation.y = damageLevel * .14;
    d.body.scale.z = 1 - damageLevel * .1;
    d.paint.color.setRGB(1 - damageLevel * .24, 1 - damageLevel * .26, 1 - damageLevel * .26);
    if (byPlayer) this.damageDealt += applied;
    if (d.health <= 0) {
      d.alive = false; d.speed *= .2;
      d.paint.color.set('#35372f');
      const credited = car !== this.player && (byPlayer || (d.lastPlayerHitAt !== undefined && d.lastPlayerHitAt - this.time >= 0 && d.lastPlayerHitAt - this.time <= 5));
      this.destruction.destroy(car);
      const distance = this.player.position.distanceTo(car.position);
      this.impactShake = Math.max(this.impactShake, (credited ? .65 : .45) * Math.max(.15, 1 - distance / 35));
      if (credited) { this.takedowns++; this.takedownFocus = { car, life: 1.4 }; }
      this.onExplosion?.(distance, 'wreck');
      this.onWreck?.(car === this.player, credited, { number: d.config.number, count: this.takedowns });
    }
    return applied;
  }

  updateCar(car, dt, input) {
    const d = car.userData;
    d.cooldown = Math.max(0, d.cooldown - dt); d.wobble *= Math.exp(-dt * 8);
    if (!d.alive) {
      d.velocity.multiplyScalar(Math.exp(-dt * 3));
      car.position.x += d.velocity.x * dt; car.position.z += d.velocity.y * dt;
      return;
    }
    const forward = new THREE.Vector2(Math.sin(d.angle), Math.cos(d.angle));
    const speed = d.velocity.dot(forward);
    const boosting = input.boost && this.boost > 0 && input.throttle > 0 && car === this.player;
    const maxSpeed = d.config.maxSpeed * (boosting ? 1.45 : 1);
    if (boosting) this.boost = Math.max(0, this.boost - dt * 27);
    else if (car === this.player) this.boost = Math.min(100, this.boost + dt * 9);
    let accel = input.throttle * d.config.acceleration * (boosting ? 1.65 : 1);
    if (input.throttle < 0 && speed > 1) accel *= 1.7;
    if (speed > maxSpeed && accel > 0) accel = 0;
    if (speed < -10 && accel < 0) accel = 0;
    d.velocity.addScaledVector(forward, accel * dt);
    // Separate longitudinal and lateral grip gives the rear wheels a controllable slide.
    const lateral = new THREE.Vector2(Math.cos(d.angle), -Math.sin(d.angle));
    const sideSpeed = d.velocity.dot(lateral);
    d.velocity.addScaledVector(lateral, -sideSpeed * Math.min(1, dt * (input.brake ? 1.8 : 6.5)));
    d.velocity.multiplyScalar(Math.exp(-dt * (input.brake ? 1.45 : .28)));
    const steering = input.steer * (1.5 + d.config.handling * .07) * Math.min(Math.abs(speed) / 7, 1) * Math.sign(speed || 1);
    d.angle -= steering * dt * (input.brake ? 1.4 : 1);
    car.position.x += d.velocity.x * dt; car.position.z += d.velocity.y * dt;
    d.speed = speed; car.rotation.y = d.angle;
    d.body.rotation.z = clamp(sideSpeed * -.015, -.07, .07) + Math.sin(performance.now() * .03) * d.wobble;
    d.body.rotation.x = clamp(accel * -.0015, -.025, .025);
    d.body.position.y = Math.sin(performance.now() * .025 + car.position.x) * Math.min(Math.abs(speed) * .0015, .025);
    d.wheels.forEach(wheel => { wheel.rotation.x += speed * dt / .47; if (wheel.position.z > 0) wheel.rotation.y = input.steer * .3; });
    if (Math.abs(speed) > 3 && Math.random() < dt * 18) {
      const rear = car.position.clone().add(new THREE.Vector3(-forward.x * 1.7, 0, -forward.y * 1.7));
      this.spawnDust(rear, boosting ? 3 : 1, Math.min(Math.abs(speed) / 15, 1));
    }
    const radius = Math.hypot(car.position.x, car.position.z);
    if (radius > 31.6) {
      const normal = new THREE.Vector2(car.position.x, car.position.z).normalize();
      const impact = d.velocity.dot(normal);
      car.position.x = normal.x * 31.6; car.position.z = normal.y * 31.6;
      if (impact > 0) d.velocity.addScaledVector(normal, -impact * 1.45);
      if (impact > 5 && d.cooldown === 0) {
        this.damage(car, impact * .65, car.position); this.sparks(car.position, impact);
        d.cooldown = .6;
        if (car === this.player) { this.impactShake = impact * .018; this.onHit?.('BARRIER HIT', -Math.round(impact * .65), impact); }
      }
    }
    for (const obstacle of this.obstacles) {
      const diff = new THREE.Vector2(car.position.x - obstacle.x, car.position.z - obstacle.z);
      if (diff.length() < 1.25 + obstacle.radius) {
        const normal = diff.normalize(); const impact = -d.velocity.dot(normal);
        car.position.x = obstacle.x + normal.x * (1.25 + obstacle.radius); car.position.z = obstacle.z + normal.y * (1.25 + obstacle.radius);
        if (impact > 0) d.velocity.addScaledVector(normal, impact * 1.3);
        if (impact > 4 && !d.cooldown) { this.damage(car, impact * .3, car.position); this.sparks(car.position, impact); d.cooldown = .6; if (car === this.player) this.impactShake = .12; }
      }
    }
  }

  aiInput(car, index, dt) {
    const d = car.userData; d.aiTimer -= dt;
    if (d.aiTimer <= 0 || !this.cars[d.aiTarget]?.userData.alive || d.aiTarget === index) {
      const candidates = this.cars.map((c, i) => ({ c, i })).filter(({ c, i }) => c.userData.alive && i !== index);
      if (candidates.length) {
        const target = Math.random() < .24 && this.player.userData.alive ? { i: 0 } : candidates[Math.floor(Math.random() * candidates.length)];
        d.aiTarget = target.i;
      }
      d.aiTimer = rand(2, 5);
    }
    const target = this.cars[d.aiTarget] || this.player;
    const dx = target.position.x + target.userData.velocity.x * .2 - car.position.x;
    const dz = target.position.z + target.userData.velocity.y * .2 - car.position.z;
    const desired = Math.atan2(dx, dz);
    let difference = desired - d.angle;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    // Reverse out of a jam instead of endlessly pushing the wall.
    d.stuckTime = Math.abs(d.speed) < 2 ? (d.stuckTime || 0) + dt : 0;
    if (d.stuckTime > .9 && d.reverseTime === undefined) { d.reverseTime = rand(1, 1.6); d.stuckTime = 0; d.aiTimer = 0; }
    if (d.reverseTime > 0) { d.reverseTime -= dt; if (d.reverseTime <= 0) { delete d.reverseTime; d.stuckTime = 0; } return { throttle: -1, steer: clamp(difference, -1, 1), brake: false }; }
    return { throttle: Math.abs(difference) > 1.5 && Math.abs(d.speed) > 8 ? .1 : .65 + d.aggression * .35, steer: clamp(-difference * 1.8, -1, 1), brake: Math.abs(difference) > 1.7 && Math.abs(d.speed) > 15 };
  }

  carCollisions() {
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i], b = this.cars[j];
      const da = a.userData, db = b.userData;
      // Two contact circles approximate each long car, keeping nose and rear hits distinct.
      for (const offsetA of [-1.1, 1.1]) for (const offsetB of [-1.1, 1.1]) {
        const ax = a.position.x + Math.sin(da.angle) * offsetA, az = a.position.z + Math.cos(da.angle) * offsetA;
        const bx = b.position.x + Math.sin(db.angle) * offsetB, bz = b.position.z + Math.cos(db.angle) * offsetB;
        const normal = new THREE.Vector2(bx - ax, bz - az), distance = normal.length();
        if (distance >= 2.15 || distance < .001) continue;
        normal.divideScalar(distance);
        const overlap = (2.15 - distance) * .5;
        a.position.x -= normal.x * overlap; a.position.z -= normal.y * overlap;
        b.position.x += normal.x * overlap; b.position.z += normal.y * overlap;
        const relative = da.velocity.clone().sub(db.velocity).dot(normal);
        if (relative <= 0) continue;
        const impulse = relative * .68;
        da.velocity.addScaledVector(normal, -impulse); db.velocity.addScaledVector(normal, impulse);
        da.angle -= normal.x * offsetA * relative * .002; db.angle += normal.x * offsetB * relative * .002;
        if (relative > 3 && !da.cooldown && !db.cooldown) {
          const position = a.position.clone().add(b.position).multiplyScalar(.5);
          const aAttacking = Math.abs(da.speed) > Math.abs(db.speed) + 2;
          const attackDamage = relative * 1.6, selfDamage = relative * .55;
          this.damage(a, aAttacking ? selfDamage : attackDamage, position, b === this.player);
          this.damage(b, aAttacking ? attackDamage : selfDamage, position, a === this.player);
          da.cooldown = db.cooldown = .5; this.sparks(position, relative);
          if (a === this.player || b === this.player) {
            this.impactShake = Math.max(this.impactShake, Math.min(.5, relative * .025));
            const attack = a === this.player ? aAttacking : !aAttacking;
            this.onHit?.(attack ? relative > 15 ? 'MASSIVE HIT!' : 'SOLID HIT!' : 'OUCH. THAT LEFT A MARK.', Math.round(attack ? attackDamage : -attackDamage), relative);
          }
        }
      }
    }
  }

  animate() {
    const frameDt = Math.min(this.clock.getDelta(), .1);
    const dt = Math.min(frameDt, .035);
    if (this.mode === 'playing') {
      this.time = Math.max(0, this.time - dt);
      const throttle = (this.keys.w || this.keys.ArrowUp ? 1 : 0) - (this.keys.s || this.keys.ArrowDown ? 1 : 0);
      const steer = (this.keys.d || this.keys.ArrowRight ? 1 : 0) - (this.keys.a || this.keys.ArrowLeft ? 1 : 0);
      this.cars.forEach((car, index) => this.updateCar(car, dt, index === 0 ? { throttle, steer, brake: this.keys[' '], boost: this.keys.Shift } : this.aiInput(car, index, dt)));
      this.carCollisions();
      this.updateWeapons(dt); this.updateProjectiles(dt);
      const alive = this.cars.filter(c => c.userData.alive).length;
      const aim = this.player.position.clone().add(new THREE.Vector3(Math.sin(this.player.userData.angle) * 18, 1.2, Math.cos(this.player.userData.angle) * 18)).project(this.camera);
      this.onUpdate?.({ time: this.time, health: Math.max(0, this.player.userData.health / this.player.userData.maxHealth * 100), speed: Math.abs(this.player.userData.speed) * 3.6, boost: this.boost, takedowns: this.takedowns, alive, reverse: this.player.userData.speed < -1, weapons: this.player.userData.weapons, aim });
      if (!this.player.userData.alive || alive <= 1 || this.time === 0) {
        this.mode = 'finished';
        this.clearProjectiles();
        const ranks = this.cars.filter(c => c.userData.alive).sort((a, b) => b.userData.health / b.userData.maxHealth - a.userData.health / a.userData.maxHealth);
        const won = this.player.userData.alive && (alive <= 1 || ranks[0] === this.player);
        this.onFinish?.({ won, survived: this.player.userData.alive, takedowns: this.takedowns, damage: Math.round(this.damageDealt), elapsed: ARENAS[this.arenaIndex].time - this.time, rank: this.player.userData.alive ? Math.max(1, ranks.indexOf(this.player) + 1) : alive + 1 });
      }
    }
    if (['playing', 'countdown', 'finished'].includes(this.mode)) {
      const angle = this.player.userData.angle;
      const target = this.player.position.clone();
      const desired = target.clone().add(new THREE.Vector3(-Math.sin(angle) * 8.5, 5.1, -Math.cos(angle) * 8.5));
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
      if (this.impactShake > .01) {
        this.camera.position.x += rand(-this.impactShake, this.impactShake); this.camera.position.y += rand(-this.impactShake, this.impactShake); this.impactShake *= .86;
      }
      target.add(new THREE.Vector3(Math.sin(angle) * 4, 1.1, Math.cos(angle) * 4));
      if (this.takedownFocus) {
        target.lerp(this.takedownFocus.car.position.clone().add(new THREE.Vector3(0, 1.2, 0)), .65 * Math.min(1, this.takedownFocus.life / .4));
        this.takedownFocus.life -= frameDt;
        if (this.takedownFocus.life <= 0) this.takedownFocus = null;
      }
      this.camera.lookAt(target);
      const fov = 48 + Math.min(Math.abs(this.player.userData.speed) * .25, 8); this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, dt * 2); this.camera.updateProjectionMatrix();
    } else if (this.mode === 'lobby') {
      const t = performance.now() * .0001;
      const isMobile = this.container.clientWidth < 800;
      const desired = this.view % 2 === 0 ? new THREE.Vector3(11.5 + Math.sin(t) * .35, 6.3, 15.5) : new THREE.Vector3(14.5, 5.8, 9.5);
      if (isMobile) desired.set(14, 8.5, 23);
      this.camera.position.lerp(desired, dt * 3);
      this.camera.lookAt(isMobile ? -.5 : -5, isMobile ? -.5 : -3.7, isMobile ? 2 : .5);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, isMobile ? 46 : 42, dt * 3); this.camera.updateProjectionMatrix();
    }
    if (this.mode !== 'paused') {
      this.destruction.update(frameDt);
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const effect = this.effects[i]; effect.life -= dt;
        if (effect.life <= 0) { this.scene.remove(effect.mesh); effect.mesh.material.dispose(); if (effect.mesh.isMesh) effect.mesh.geometry.dispose(); this.effects.splice(i, 1); continue; }
        effect.mesh.position.addScaledVector(effect.velocity, dt);
        if (effect.expand) { effect.mesh.scale.addScalar(dt * effect.expand); effect.mesh.material.opacity = effect.opacity * effect.life / effect.maxLife; }
        else if (effect.dust) { effect.mesh.scale.addScalar(dt * 1.4); effect.mesh.material.opacity = effect.opacity * effect.life / effect.maxLife; }
        else { effect.velocity.y -= dt * 14; effect.mesh.rotation.x += dt * 10; }
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
