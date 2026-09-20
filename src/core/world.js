/**
 * Scene + atmosphere: renderer-agnostic world contents.
 * Readable subset of minified `Sz` day-cycle `A()`, lights, fog, sky.
 *
 * The original uses Three.js WebGPU + TSL (Sky node, GTAO, SSR, bloom,
 * god-rays). This rewrite targets plain WebGLRenderer with the same
 * *art direction*: warm sun, height-tinted fog, day cycle, wet weather.
 */
import * as THREE from 'three';

const BASE_HOURS = { coast: 14.6, mountain: 18.1, desert: 17.7, forest: 13.0, city: 23.0, oval: 15.8 };

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#152633');
    this.scene.fog = new THREE.FogExp2('#bdd2d7', 0.00115);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.2, 6500);
    this.camera.position.set(0, 5, -12);

    this.sun = new THREE.DirectionalLight('#fff0d5', 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.18;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 2400;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#c5e3f2', '#776350', 1.0);
    this.scene.add(this.hemi);

    this.fill = new THREE.PointLight('#8ca8c3', 0.18, 10, 2);
    this.scene.add(this.fill);

    this.skyDome = makeSkyDome();
    this.scene.add(this.skyDome);

    this.stars = makeStars();
    this.scene.add(this.stars);

    this.elapsed = 0;
    this.dayCycle = true;
    this.cycleMinutes = 24;
    this.baseHour = 14.6;
    this.rain = 0;
    this.wetness = 0;
    this.quality = 'high';
    this.resize();
  }

  setQuality(name, presets) {
    this.quality = name;
    const q = presets[name] ?? presets.high;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr, q.maxHeight ? q.maxHeight / h : Infinity);
    this.renderer.setPixelRatio(dpr);
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setTrackEnvironment(trackId, timeOfDay, rain) {
    this.baseHour = BASE_HOURS[trackId] ?? timeOfDay * 24;
    this.rain = rain;
    this.wetness = rain;
  }

  /** Day-cycle + fog update. `focus` = player world position. */
  update(dt, focus) {
    this.elapsed += dt;
    const t = (((this.baseHour + (this.dayCycle ? this.elapsed / (this.cycleMinutes * 60) * 24 : 0)) % 24) - 6) / 24 * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(t) * 0.68, Math.sin(t), -0.48).normalize();
    const dayFactor = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.3);

    this.sun.color.set(dayFactor < 0.7 ? '#ffb572' : '#fff2de');
    this.sun.intensity = THREE.MathUtils.lerp(1.05, 3.5, dayFactor) * (1 - this.rain * 0.5);
    this.sun.position.copy(focus).addScaledVector(sunDir, 800);
    if (sunDir.y < 0.01) this.sun.position.copy(focus).add(new THREE.Vector3(-350, 550, 240));
    this.sun.target.position.copy(focus);

    this.hemi.intensity = THREE.MathUtils.lerp(1.1, 0.8, dayFactor) * (1 - this.rain * 0.2);
    this.scene.fog.density = 0.00038 + this.rain * 0.0017;
    this.scene.fog.color.set(this.rain > 0.2 ? '#758e94' : '#accbd4');
    if (dayFactor < 0.3) this.scene.fog.color.set('#101a30');

    this.fill.position.copy(focus).add(new THREE.Vector3(0, 1.15, 0));
    this.skyDome.position.copy(this.camera.position);
    this.skyDome.material.color.lerpColors(
      new THREE.Color('#0b1526'), new THREE.Color('#9fc6d8'), dayFactor,
    );
    this.stars.position.copy(this.camera.position);
    this.stars.material.opacity = 1 - dayFactor;
    this.stars.visible = dayFactor < 0.94;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  getStats() {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      backend: 'WebGL2',
    };
  }
}

function makeSkyDome() {
  const geo = new THREE.SphereGeometry(4200, 24, 12);
  const mat = new THREE.MeshBasicMaterial({ color: '#9fc6d8', side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return mesh;
}

function makeStars() {
  const count = 1200;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(4100);
    pos.set([v.x, Math.abs(v.y) * 0.9 + 50, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#e0ecff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  return pts;
}
