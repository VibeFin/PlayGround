/** Procedural Blackpine relay station. Coordinates are metres; the yard floor is y=0. */
export function createWorld(THREE, scene) {
  const root = new THREE.Group();
  root.name = 'BLACKPINE / relay station';
  scene.add(root);
  scene.background = new THREE.Color(0x17303e);
  scene.fog = new THREE.FogExp2(0x3e5967, 0.015);

  const colliders = [];
  const spawnPoints = [
    new THREE.Vector3(-21, 0, -20), new THREE.Vector3(21, 0, -20),
    new THREE.Vector3(-21, 0, 4), new THREE.Vector3(21, 0, 8),
    new THREE.Vector3(-17, 0, 21), new THREE.Vector3(17, 0, 21),
    new THREE.Vector3(0, 0, 23), new THREE.Vector3(21, 0, -5),
  ];
  const playerSpawn = new THREE.Vector3(0, 1.7, 12);
  const supplyPosition = new THREE.Vector3(-6.1, 0, 8.1);
  let seed = 1986;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range = (a, b) => a + random() * (b - a);
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.05, ...options,
  });
  const canvasTexture = (width, height, draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Blackpine procedural textures require a 2D canvas.');
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  const concreteTexture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#a0a49b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      const value = Math.floor(range(60, 200));
      ctx.fillStyle = `rgba(${value},${value},${value - 8},${range(0.03, 0.14)})`;
      ctx.fillRect(random() * w, random() * h, range(1, 5), range(1, 4));
    }
    for (let i = 0; i < 100; i++) {
      const x = random() * w;
      const y = random() * h;
      const stain = ctx.createLinearGradient(x, y, x, y + 130);
      stain.addColorStop(0, 'rgba(30,43,34,.17)');
      stain.addColorStop(1, 'rgba(30,43,34,0)');
      ctx.fillStyle = stain;
      ctx.fillRect(x, y, range(2, 18), range(40, 180));
    }
    ctx.strokeStyle = 'rgba(40,46,41,.22)';
    ctx.lineWidth = 2;
    for (const y of [2, 255, 510]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  });
  concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.repeat.set(2, 2);
  const asphaltTexture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#586268';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      ctx.fillStyle = random() > 0.5 ? 'rgba(160,168,160,.17)' : 'rgba(15,24,26,.22)';
      ctx.fillRect(random() * w, random() * h, range(1, 3), range(1, 3));
    }
    ctx.strokeStyle = 'rgba(17,26,27,.55)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      let x = random() * w;
      let y = random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 9; j++) {
        x += range(-16, 16); y += range(5, 24); ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.repeat.set(9, 9);
  const concrete = material(0x87918a, { map: concreteTexture });
  const paleConcrete = material(0xb4b6a5, { map: concreteTexture });
  const darkConcrete = material(0x485751, { map: concreteTexture });
  const metal = material(0x35474a, { metalness: 0.65, roughness: 0.58 });
  const rust = material(0x74513b, { metalness: 0.45 });
  const black = material(0x111e22);
  const ochre = material(0xc1a151);
  const timber = material(0x71674b, { map: concreteTexture });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const dummy = new THREE.Object3D();

  // Navigation uses XZ; ballistics also need explicit world-space vertical bounds.
  function solid(x, z, width, depth, minY, maxY) {
    colliders.push({ minX: x - width / 2, maxX: x + width / 2,
      minZ: z - depth / 2, maxZ: z + depth / 2, minY, maxY });
  }
  function box(x, y, z, width, height, depth, mat, cast = true) {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  function mesh(geometry, mat, x, y, z) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    root.add(object);
    return object;
  }
  function rod(a, b, radius, mat = metal) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const object = new THREE.Mesh(unitCylinder, mat);
    object.position.copy(start).add(end).multiplyScalar(0.5);
    object.scale.set(radius, direction.length(), radius);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    root.add(object);
    return object;
  }
  function cable(points, radius = 0.025, mat = black) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, 28, radius, 4, false), mat, 0, 0, 0);
  }
  function instances(name, geometry, mat, transforms, shadows = false) {
    const object = new THREE.InstancedMesh(geometry, mat, transforms.length);
    object.name = name;
    transforms.forEach((t, i) => {
      dummy.position.set(...t.p);
      dummy.rotation.set(...(t.r || [0, 0, 0]));
      dummy.scale.set(...t.s);
      dummy.updateMatrix();
      object.setMatrixAt(i, dummy.matrix);
      if (t.color !== undefined) object.setColorAt(i, new THREE.Color(t.color));
    });
    object.instanceMatrix.needsUpdate = true;
    object.castShadow = shadows;
    object.receiveShadow = true;
    object.computeBoundingSphere();
    root.add(object);
    return object;
  }
  function sign(text, subtext, width, height, x, y, z, light = false) {
    const map = canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#202e30'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#cbb971'; ctx.fillRect(20, 20, 7, h - 40);
      ctx.fillStyle = '#e3ddbb';
      ctx.font = 'bold 84px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 55, 102, w - 95);
      ctx.fillStyle = '#a7b6aa';
      ctx.font = '24px monospace'; ctx.fillText(subtext, 58, 189, w - 100);
      for (let i = 0; i < 1800; i++) {
        ctx.fillStyle = 'rgba(15,25,25,.15)';
        ctx.fillRect(random() * w, random() * h, range(1, 5), range(1, 3));
      }
      ctx.strokeStyle = '#64716a'; ctx.lineWidth = 3; ctx.strokeRect(7, 7, w - 14, h - 14);
    });
    const mat = material(0xffffff, { map, roughness: 0.75,
      emissive: light ? 0x899e8f : 0x000000, emissiveMap: map, emissiveIntensity: light ? 0.24 : 0 });
    return mesh(new THREE.PlaneGeometry(width, height), mat, x, y, z);
  }

  // Blue-hour atmosphere: a luminous horizon behind a darker upper sky.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: new THREE.Color(0x0a162a) }, horizon: { value: new THREE.Color(0x416773) } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 zenith;
      uniform vec3 horizon;
      varying vec3 vDirection;
      void main() {
        float h = clamp(normalize(vDirection).y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, zenith, pow(h, 0.55)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10;
  root.add(sky);
  const hemisphere = new THREE.HemisphereLight(0x9cbed8, 0x263b39, 0.85);
  root.add(hemisphere);
  const moonlight = new THREE.DirectionalLight(0xaccfff, 1.55);
  moonlight.position.set(-25, 38, -8);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(2048, 2048);
  Object.assign(moonlight.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 100 });
  moonlight.shadow.bias = -0.0003;
  moonlight.shadow.normalBias = 0.035;
  root.add(moonlight);
  root.add(moonlight.target);
  const fill = new THREE.DirectionalLight(0x73acaa, 0.18);
  fill.position.set(10, 12, 25);
  root.add(fill);

  const glowTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,.55)');
    g.addColorStop(0.4, 'rgba(255,255,255,.13)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  function glow(x, y, z, color, size, opacity) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color,
      transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sprite.position.set(x, y, z); sprite.scale.set(size, size, 1); root.add(sprite);
    return sprite;
  }
  const moon = mesh(new THREE.SphereGeometry(2.5, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xe0edce, fog: false }), -48, 35, -100);
  moon.castShadow = false;
  const moonHalo = glow(-48, 35, -101, 0xa8cfce, 21, 0.34);
  moonHalo.material.fog = false;

  // Terrain extends beyond the play square so no horizon edge is exposed.
  const earth = mesh(new THREE.PlaneGeometry(350, 350), material(0x354a43), 0, -0.08, 0);
  earth.rotation.x = -Math.PI / 2;
  earth.castShadow = false;
  const yard = mesh(new THREE.PlaneGeometry(48, 48), material(0x778783, {
    map: asphaltTexture, roughness: 0.9 }), 0, 0, 0);
  yard.rotation.x = -Math.PI / 2;
  yard.castShadow = false;
  // Four narrow curb sections leave deliberate entrances at each side.
  for (const x of [-24.3, 24.3]) {
    for (const z of [-15, 15]) box(x, 0.12, z, 0.35, 0.24, 12, darkConcrete, false);
  }
  for (const z of [-24.3, 24.3]) {
    for (const x of [-16, 16]) box(x, 0.12, z, 16, 0.24, 0.35, darkConcrete, false);
  }
  const paint = material(0xb0a46b, { transparent: true, opacity: 0.48, depthWrite: false });
  const paintMarks = [];
  for (let z = -5; z < 23; z += 5) paintMarks.push({ p: [3.4, 0.012, z], s: [0.11, 0.014, 2.4] });
  for (let x = -18; x <= -6; x += 4) paintMarks.push({ p: [x, 0.012, 5], s: [0.11, 0.014, 7] });
  paintMarks.push({ p: [-12, 0.014, 8.5], s: [12, 0.014, 0.11] });
  instances('faded yard markings', unitBox, paint, paintMarks);
  const puddleMat = material(0x415f67, { roughness: 0.16, metalness: 0.65,
    transparent: true, opacity: 0.68, depthWrite: false });
  for (const [x, z, sx, sz] of [[-3, 3, 3.5, 1.2], [8, 9, 2.6, 1], [-8, -7, 2.8, 0.7], [1, -6.6, 1.6, 1]]) {
    const puddle = mesh(new THREE.CircleGeometry(1, 13), puddleMat, x, 0.018, z);
    puddle.rotation.set(-Math.PI / 2, 0, range(0, 3)); puddle.scale.set(sx, sz, 1); puddle.castShadow = false;
  }

  // Station massing. The glowing door is shut: its wall collider is intentional.
  box(-4, 4.1, -15, 19, 8.2, 10, concrete);
  solid(-4, -14.7, 19.4, 10.6, 0, 8.6 + 0.48 / 2); // Parapet top.
  box(-4, 0.46, -9.86, 19.3, 0.92, 0.34, darkConcrete);
  box(-4, 8.3, -15, 19.7, 0.3, 10.6, darkConcrete);
  box(-4, 8.6, -9.93, 19.7, 0.48, 0.35, paleConcrete);
  box(-13.64, 8.6, -15, 0.35, 0.48, 10.5, paleConcrete);
  box(5.64, 8.6, -15, 0.35, 0.48, 10.5, paleConcrete);
  box(-4, 5.62, -9.78, 19.2, 0.18, 0.4, darkConcrete);
  for (const x of [-13.1, -7.3, -1.5, 5.1]) box(x, 3.05, -9.78, 0.32, 5.1, 0.42, paleConcrete);
  sign('BLACKPINE RELAY', 'NORTH RIDGE  /  COMMUNICATIONS DIVISION  /  EST. 1964', 15.3, 2.15, -4, 6.93, -9.69, true);
  box(-16.7, 2.05, -16, 6.3, 4.1, 8, darkConcrete);
  solid(-16.7, -15.875, 6.3, 8.25, 0, 4.18 + 0.2 / 2); // Annex roof top.
  box(-16.7, 4.18, -16, 6.8, 0.2, 8.5, metal);
  const slatTransforms = [];
  box(-16.7, 1.75, -11.93, 3.8, 3.3, 0.12, black);
  for (let y = 0.25; y < 3.3; y += 0.22) slatTransforms.push({ p: [-16.7, y, -11.81], s: [3.7, 0.12, 0.13] });
  instances('annex ventilation shutters', unitBox, metal, slatTransforms);
  sign('AUTHORIZED PERSONNEL', 'WARNING  /  HIGH VOLTAGE', 3.5, 0.76, -16.7, 3.55, -11.7);

  const poweredMaterials = [];
  const poweredLights = [];
  const poweredGlows = [];
  const warmGlass = material(0xc88943, { emissive: 0xff661c, emissiveIntensity: 1.25, roughness: 0.38 });
  poweredMaterials.push({ mat: warmGlass, intensity: 1.25 });
  const dimGlass = material(0x375151, { emissive: 0x709d91, emissiveIntensity: 0.045, roughness: 0.3, metalness: 0.4 });
  function windowFront(x, y, z, width, height, lit) {
    box(x, y, z, width + 0.25, height + 0.25, 0.22, black);
    box(x, y, z + 0.13, width, height, 0.045, lit ? warmGlass : dimGlass, false);
    box(x, y, z + 0.2, 0.065, height, 0.09, metal, false);
    box(x, y + 0.07, z + 0.2, width, 0.065, 0.09, metal, false);
    box(x, y - height / 2 - 0.14, z + 0.15, width + 0.5, 0.14, 0.5, paleConcrete);
    if (lit) {
      // Opaque blinds interrupt the emissive face, suggesting an inhabited interior.
      box(x - width * 0.21, y + 0.12, z + 0.18, width * 0.18, height * 0.88, 0.03, rust, false);
      const halo = glow(x, y, z + 0.4, 0xffa45b, width * 1.8, 0.08);
      poweredGlows.push({ sprite: halo, opacity: 0.08 });
    }
  }
  windowFront(-10.25, 3.4, -9.7, 3.45, 2.45, false);
  windowFront(-5.3, 3.4, -9.7, 3.05, 2.45, true);
  windowFront(3.65, 3.7, -9.7, 1.5, 1.9, false);
  // One damaged window bay has been hastily boarded; the adjacent office has
  // only a narrow strip of surviving light. Keep the entrance as the warm focus.
  const scorchedWood = material(0x493d2f, { map: concreteTexture });
  const boardedWindows = [];
  for (const [x, y, width, angle] of [
    [-10.3, 2.68, 3.55, 0.06], [-10.1, 3.36, 3.8, -0.13],
    [-10.45, 4.05, 3.3, 0.09], [-5.55, 3.93, 2.5, -0.035],
    [-5.8, 2.75, 2.15, 0.12],
  ]) boardedWindows.push({ p: [x, y, -9.38], s: [width, 0.36, 0.1], r: [0, 0, angle] });
  instances('hastily nailed window boards', unitBox, scorchedWood, boardedWindows);
  box(-5.94, 3.4, -9.43, 1.52, 2.4, 0.065, black, false);
  // A local soot-and-spalled-plaster decal, rather than uniform facade noise.
  const damageMap = canvasTexture(512, 512, ctx => {
    ctx.clearRect(0, 0, 512, 512);
    const soot = ctx.createRadialGradient(265, 255, 35, 265, 255, 245);
    soot.addColorStop(0, 'rgba(15,21,20,.88)');
    soot.addColorStop(0.52, 'rgba(24,29,25,.53)');
    soot.addColorStop(1, 'rgba(24,29,25,0)');
    ctx.fillStyle = soot; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 38; i++) {
      const x = range(75, 440), y = range(190, 410);
      ctx.fillStyle = 'rgba(26,29,24,.38)'; ctx.fillRect(x, y, range(2, 8), range(25, 100));
    }
    for (const [x, y, size] of [[330, 375, 19], [350, 315, 12], [146, 385, 26], [180, 198, 13]]) {
      ctx.fillStyle = '#a4a18a'; ctx.beginPath();
      for (let j = 0; j < 7; j++) {
        const a = j / 7 * Math.PI * 2, r = size * range(0.6, 1.2);
        if (j === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#222c29'; ctx.fillRect(x - 3, y - 3, 6, 5);
    }
  });
  const damage = mesh(new THREE.PlaneGeometry(5.35, 4.85), material(0xffffff, {
    map: damageMap, transparent: true, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), -10.15, 3.03, -9.535);
  damage.name = 'localized smoke damage and impact scars'; damage.castShadow = false;
  box(0.7, 2.0, -9.71, 3.25, 4.0, 0.3, black);
  box(0.7, 1.98, -9.52, 2.8, 3.7, 0.1, warmGlass, false);
  for (const x of [-0.65, 0.7, 2.05]) box(x, 1.98, -9.41, 0.09, 3.7, 0.1, metal, false);
  box(0.7, 1.18, -9.4, 2.8, 0.12, 0.13, metal, false);
  box(0.7, 0.55, -9.4, 2.8, 1, 0.13, darkConcrete);
  box(0.9, 1.68, -9.3, 0.06, 0.42, 0.07, ochre, false);
  box(0.7, 4.32, -8.98, 4.7, 0.16, 2.1, metal);
  rod([-1.5, 4.3, -8.1], [-1.5, 5.5, -9.8], 0.035);
  rod([2.9, 4.3, -8.1], [2.9, 5.5, -9.8], 0.035);
  sign('04 / CONTROL', 'KEEP DOOR SEALED', 2.65, 0.58, 0.7, 4.82, -9.54, true);
  // Shallow thresholds stay walkable; no raised ground is required by the game controller.
  box(0.7, 0.055, -8.84, 4.2, 0.11, 1.8, concrete, false);
  for (const x of [-1.9, 3.25]) {
    box(x, 0.62, -8.0, 0.18, 1.24, 0.18, ochre);
    box(x, 0.8, -7.99, 0.19, 0.18, 0.19, black);
    solid(x, -8, 0.2, 0.2, 0, 1.24);
  }
  function practical(x, y, z, intensity, distance) {
    const strength = Math.min(1, intensity / 105);
    const bulbMat = material(0xb69b70, { emissive: 0xffb56b, emissiveIntensity: 3.2 * strength });
    poweredMaterials.push({ mat: bulbMat, intensity: 3.2 * strength });
    box(x, y + 0.1, z, 0.68, 0.18, 0.42, metal);
    box(x, y - 0.02, z + 0.05, 0.5, 0.1, 0.24, bulbMat, false);
    const light = new THREE.PointLight(0xff983e, intensity, distance, 2);
    light.position.set(x, y - 0.2, z + 0.3); root.add(light);
    poweredLights.push({ light, intensity });
    const sprite = glow(x, y, z + 0.26, 0xffbd77, 1.5 + 1.5 * strength, 0.36 * strength);
    poweredGlows.push({ sprite, opacity: 0.36 * strength });
    return light;
  }
  practical(0.7, 4.05, -8.5, 120, 15);
  practical(-10.1, 4.95, -9.25, 0, 0); // Broken fixture over the boarded bay.
  practical(5.95, 5.7, -15.0, 14, 7);
  const doorHalo = glow(0.7, 2.5, -9.14, 0xffa459, 6.6, 0.2);
  poweredGlows.push({ sprite: doorHalo, opacity: 0.2 });
  // Soft projected amber pools also work with renderers that have no bloom enabled.
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xff9b42,
    transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z, sx, sz] of [[0.7, -6.7, 6.5, 9]]) {
    const pool = mesh(new THREE.PlaneGeometry(sx, sz), poolMat, x, 0.026, z);
    pool.rotation.x = -Math.PI / 2; pool.castShadow = false;
  }

  // Side elevation: corrugated service panels, conduits, ladder and rooftop equipment.
  box(5.58, 3.8, -15, 0.1, 2.8, 5.7, metal);
  const louvers = [];
  for (let z = -17.6; z < -12.2; z += 0.25) louvers.push({ p: [5.72, 3.8, z], s: [0.16, 2.5, 0.08] });
  instances('service wall ribs', unitBox, rust, louvers);
  for (const x of [-12.4, 4.8]) {
    rod([x, 0.1, -9.46], [x, 8.2, -9.46], 0.065, rust);
    for (const y of [1, 3, 5, 7]) box(x, y, -9.42, 0.2, 0.08, 0.14, metal, false);
  }
  cable([[-12.4, 5.3, -9.35], [-8, 4.9, -9.28], [-4.5, 5.3, -9.35], [4.8, 5.25, -9.35]], 0.036);
  box(-12, 1.8, -9.43, 0.7, 1.1, 0.36, metal);
  sign('DANGER', '440 V', 0.56, 0.32, -12, 1.9, -9.23);
  for (const z of [-18.6, -17.6]) rod([5.92, 0.3, z], [5.92, 9, z], 0.035, rust);
  const rungs = [];
  for (let y = 0.45; y <= 9; y += 0.35) rungs.push({ p: [5.93, y, -18.1], s: [0.07, 0.05, 1.1] });
  instances('ladder rungs', unitBox, rust, rungs);
  solid(5.93, -18.1, 0.14, 1.17, 0.3, 9);
  box(-6.5, 9.1, -15, 4.5, 1.35, 2.3, metal);
  const vents = [];
  for (let x = -8.4; x < -4.5; x += 0.22) vents.push({ p: [x, 9.1, -13.81], s: [0.09, 0.95, 0.06] });
  instances('roof cooling fins', unitBox, black, vents);
  for (const x of [-10, -1]) {
    mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.5, 10), rust, x, 9.2, -17);
    mesh(new THREE.ConeGeometry(0.65, 0.28, 10), metal, x, 10.0, -17);
  }
  rod([-9, 8.6, -18], [-9, 13.2, -18], 0.055);
  for (const y of [11, 11.65, 12.3]) rod([-10.2, y, -18], [-7.8, y, -18], 0.028);
  // A shallow parabolic dish, tilted toward the mountain transmitter.
  const dishGeo = new THREE.SphereGeometry(1.45, 24, 10, 0, Math.PI * 2, 0, 0.63);
  dishGeo.translate(0, -1.45, 0);
  const dish = mesh(dishGeo, material(0xa1afa8, { side: THREE.DoubleSide, metalness: 0.45 }), 1.5, 10.2, -15);
  dish.rotation.set(0.5, 0, -0.6);
  rod([1.5, 8.4, -15], [1.5, 10.1, -15], 0.12);
  rod([1.5, 10.1, -15], [2.2, 11.6, -14.3], 0.035);

  // Lattice radio mast. Batched steelwork keeps the detailed silhouette inexpensive.
  const towerStart = root.children.length;
  const towerX = 11.2;
  const towerZ = -20.5;
  const towerScaleY = 0.68;
  box(towerX, 0.22, towerZ, 4.3, 0.44, 4.3, darkConcrete);
  // Only the concrete plinth fills this footprint; the lattice above is open.
  solid(towerX, towerZ, 4.3, 4.3, 0, 0.44 * towerScaleY);
  const steelTransforms = [];
  function steel(a, b, thickness) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    dummy.position.copy(va).add(vb).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    steelTransforms.push({ p: dummy.position.toArray(), r: [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z],
      s: [thickness, d.length(), thickness] });
  }
  const halfAt = y => 1.8 - y * 0.062;
  for (let tier = 0; tier < 7; tier++) {
    const low = tier * 3 + 0.4, high = low + 3;
    const a = halfAt(low), b = halfAt(high);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let side = 0; side < 4; side++) {
      const [sx, sz] = corners[side], [nx, nz] = corners[(side + 1) % 4];
      const p = [towerX + sx * a, low, towerZ + sz * a];
      const q = [towerX + sx * b, high, towerZ + sz * b];
      const r = [towerX + nx * b, high, towerZ + nz * b];
      steel(p, q, 0.12);
      steel(q, r, 0.08);
      steel(p, r, 0.065);
      steel([towerX + nx * a, low, towerZ + nz * a], q, 0.055);
    }
  }
  instances('radio tower / lattice steel', unitBox, material(0x7c7970, { metalness: 0.7 }), steelTransforms, true);
  rod([towerX, 20.8, towerZ], [towerX, 25.6, towerZ], 0.085, rust);
  box(towerX, 18.5, towerZ, 2.1, 0.1, 2.1, metal);
  for (const side of [-1, 1]) {
    box(towerX + side * 0.88, 19.95, towerZ, 0.32, 2.3, 0.38, paleConcrete);
    rod([towerX, 19.6, towerZ], [towerX + side * 0.88, 19.6, towerZ], 0.045);
  }
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff302c, toneMapped: false });
  mesh(new THREE.SphereGeometry(0.16, 12, 8), beaconMat, towerX, 25.75, towerZ);
  const beacon = glow(towerX, 25.75, towerZ, 0xff2920, 3.5, 0.9);
  const lowerBeacon = glow(towerX, 14.9, towerZ + 0.9, 0xff3b25, 1.7, 0.45);
  // Guy wires remain above the playable eye line; ground anchors sit behind the station.
  cable([[towerX, 20, towerZ], [17, 10, -23], [22, 0.4, -29]], 0.018, metal);
  cable([[towerX, 20, towerZ], [9, 10, -27], [7, 0.4, -36]], 0.018, metal);
  cable([[towerX, 18, towerZ], [5, 13, -17], [-1, 8.7, -18]], 0.018, metal);
  // The full beacon silhouette fits the prescribed low menu-camera target.
  const tower = new THREE.Group();
  tower.name = 'emergency transmitter';
  for (const child of root.children.slice(towerStart)) tower.add(child);
  tower.scale.y = towerScaleY;
  root.add(tower);

  // Utility poles and a sagging overhead cable draw the courtyard into one composition.
  for (const [x, z, h] of [[-19, -5, 8.1], [18, 4, 7.3]]) {
    box(x, h / 2, z, 0.25, h, 0.25, timber);
    solid(x, z, 0.3, 0.3, 0, h);
    box(x, h - 0.4, z, 2.2, 0.12, 0.16, timber);
    for (const dx of [-0.8, 0.8]) mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.25, 8), paleConcrete, x + dx, h - 0.23, z);
  }
  for (const offset of [-0.8, 0.8]) cable([[-19 + offset, 7.9, -5], [-8, 5.7, -2.3], [5, 5.25, 1], [18 + offset, 7.1, 4]], 0.025);
  cable([[-19, 7.9, -5], [-15, 6.4, -8], [-12.4, 7.5, -9.6]], 0.035);
  practical(17.6, 6.65, 4, 12, 9);

  // Jersey barriers, hazard stripes and bolted storage crates.
  const barrierShape = new THREE.Shape();
  barrierShape.moveTo(-0.55, 0); barrierShape.lineTo(0.55, 0);
  barrierShape.lineTo(0.55, 0.25); barrierShape.lineTo(0.24, 0.7);
  barrierShape.lineTo(0.19, 1.15); barrierShape.lineTo(-0.19, 1.15);
  barrierShape.lineTo(-0.24, 0.7); barrierShape.lineTo(-0.55, 0.25); barrierShape.closePath();
  const barrierGeo = new THREE.ExtrudeGeometry(barrierShape, { depth: 4.1, bevelEnabled: false, steps: 1 });
  barrierGeo.translate(0, 0, -2.05);
  barrierGeo.rotateY(Math.PI / 2);
  const hazardMap = canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#bfa751'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#293332';
    for (let x = -64; x < w + 64; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 38, 0);
      ctx.lineTo(x - 6, h); ctx.lineTo(x - 44, h); ctx.fill();
    }
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = 'rgba(100,108,95,.4)'; ctx.fillRect(random() * w, random() * h, range(1, 8), range(1, 4));
    }
  });
  const hazardMat = material(0xffffff, { map: hazardMap });
  for (const [x, z, rotation] of [
    [-10, -3, 0], [10.5, -4.5, 0], [-16, 11, 0.15], [15, 13, -0.15],
    [-6.3, 6.6, 0], [-8.5, 8.05, Math.PI / 2], // Open-front resupply pocket.
  ]) {
    const barrier = mesh(barrierGeo, paleConcrete, x, 0, z); barrier.rotation.y = rotation;
    const strip = mesh(new THREE.PlaneGeometry(3.65, 0.3), hazardMat, x + Math.sin(rotation) * 0.235, 0.92, z + Math.cos(rotation) * 0.235);
    strip.rotation.y = rotation;
    const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
    solid(x, z, 4.1 * c + 1.1 * s, 1.1 * c + 4.1 * s, 0, 1.15);
  }
  const crateTrim = [];
  function crate(x, z, width, height, depth, bottom = 0) {
    box(x, bottom + height / 2, z, width, height, depth, timber);
    // Include the 2 cm batten overhang. The upper crate keeps its own smaller
    // footprint, contained inside the base crate's unchanged navigation bounds.
    solid(x, z, width + 0.1, depth + 0.1, Math.max(0, bottom - 0.02), bottom + height + 0.02);
    for (const dx of [-width / 2 + 0.1, width / 2 - 0.1]) {
      for (const dz of [-depth / 2 - 0.015, depth / 2 + 0.015]) crateTrim.push({ p: [x + dx, bottom + height / 2, z + dz], s: [0.16, height + 0.04, 0.08] });
    }
    for (const y of [bottom + 0.12, bottom + height - 0.12]) {
      for (const dz of [-depth / 2 - 0.04, depth / 2 + 0.04]) crateTrim.push({ p: [x, y, z + dz], s: [width + 0.04, 0.13, 0.1] });
    }
    const brace = box(x, bottom + height / 2, z + depth / 2 + 0.055, width * 0.9, 0.12, 0.08, ochre, false);
    brace.rotation.z = Math.atan2(height * 0.7, width * 0.9);
  }
  crate(-15, -6.8, 2, 1.6, 1.8);
  crate(-17.3, -7.1, 1.7, 1.15, 1.6);
  crate(-15, -6.8, 1.5, 1.05, 1.4, 1.6);
  crate(15.5, -8.4, 2, 1.4, 2);
  crate(17.6, -8.1, 1.6, 1.8, 1.8);
  crate(-20, 14.5, 1.5, 1.35, 1.7);
  instances('crate battens', unitBox, metal, crateTrim);
  sign('FIELD EQUIPMENT', 'BP-04  /  1986', 1.1, 0.38, -15, 1, -5.82);
  // A field-issued ammunition chest protected on the north/west, accessible
  // from the south/east. Its position suppresses the game's fallback crate.
  const cacheX = supplyPosition.x, cacheZ = supplyPosition.z;
  const cacheMat = material(0x3c5041, { metalness: 0.5, roughness: 0.65, map: concreteTexture });
  box(cacheX, 0.54, cacheZ, 2, 1.08, 1.1, cacheMat).name = 'field ammunition cache';
  box(cacheX, 1.09, cacheZ, 2.1, 0.12, 1.2, metal);
  solid(cacheX, cacheZ, 2.12, 1.32, 0, 1.15);
  const cacheFittings = [];
  for (const dx of [-0.84, 0.84]) {
    cacheFittings.push({ p: [cacheX + dx, 0.55, cacheZ + 0.58], s: [0.09, 1.08, 0.08] });
    cacheFittings.push({ p: [cacheX + dx, 1.16, cacheZ], s: [0.09, 0.02, 1.1] });
    box(cacheX + dx, 0.89, cacheZ + 0.63, 0.16, 0.22, 0.06, metal, false);
  }
  instances('cache straps and lid bands', unitBox, ochre, cacheFittings);
  const cacheLabel = canvasTexture(1024, 512, ctx => {
    ctx.fillStyle = '#172c27'; ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#b7ad77'; ctx.lineWidth = 12; ctx.strokeRect(18, 18, 988, 476);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1ddb0'; ctx.font = 'bold 174px Arial, sans-serif'; ctx.fillText('AMMO', 512, 151);
    ctx.fillStyle = '#eeb568'; ctx.font = 'bold 83px Arial, sans-serif'; ctx.fillText('300 ESSENCE', 512, 316);
    ctx.fillStyle = '#a8bbb0'; ctx.font = '32px monospace'; ctx.fillText('BP-04  /  FIELD RESUPPLY', 512, 433);
  });
  const cacheLabelMat = material(0xffffff, { map: cacheLabel, emissiveMap: cacheLabel,
    emissive: 0xe6a95e, emissiveIntensity: 0.48 });
  poweredMaterials.push({ mat: cacheLabelMat, intensity: 0.48 });
  mesh(new THREE.PlaneGeometry(1.62, 0.81), cacheLabelMat, cacheX, 0.58, cacheZ + 0.656).name = 'AMMO / 300 ESSENCE';
  practical(cacheX, 1.27, cacheZ - 0.2, 25, 5);
  box(cacheX, 1.18, cacheZ - 0.2, 0.08, 0.12, 0.12, metal);
  // Separate low lid bands and lamp bounds avoid raising the entire chest's hitbox.
  for (const dx of [-0.84, 0.84]) solid(cacheX + dx, cacheZ, 0.09, 1.1, 1.15, 1.17);
  solid(cacheX, cacheZ - 0.175, 0.68, 0.47, 1.12, 1.46);
  const drumMat = material(0x697565, { metalness: 0.48, roughness: 0.65 });
  for (const [x, z] of [[7.9, -12], [8.1, -10.6], [-18.8, -9.5]]) {
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.12, 12), drumMat, x, 0.56, z);
    for (const y of [0.18, 0.93]) mesh(new THREE.TorusGeometry(0.405, 0.025, 4, 12), metal, x, y, z).rotation.x = Math.PI / 2;
    solid(x, z, 0.82, 0.82, 0, 1.12);
  }
  // Perimeter chain-link fences use a cutout texture rather than thousands of wires.
  const fenceTexture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#8d9e96'; ctx.lineWidth = 2;
    for (let x = -128; x < 256; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 128, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 128, 128); ctx.stroke();
    }
  });
  fenceTexture.wrapS = fenceTexture.wrapT = THREE.RepeatWrapping;
  fenceTexture.repeat.set(4, 1);
  const fenceMat = material(0x83948c, { map: fenceTexture, transparent: false,
    alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.65 });
  for (const x of [-25, 25]) {
    for (const z of [-17, -9, 11, 19]) {
      if (x === -25 && z === -9) {
        // The torn fence folds away from the existing west-side entry lane.
        const torn = mesh(new THREE.PlaneGeometry(5.5, 2.5, 7, 3), fenceMat, -26, 1.1, -10.2);
        const points = torn.geometry.getAttribute('position');
        for (let i = 0; i < points.count; i++) {
          const edge = (points.getX(i) + 2.75) / 5.5;
          points.setZ(i, Math.sin(edge * 3) * 0.55);
          points.setY(i, points.getY(i) - edge * edge * 0.7);
        }
        torn.geometry.computeVertexNormals(); torn.rotation.set(-0.2, Math.PI / 2, -0.2);
        torn.castShadow = false; torn.name = 'breached west fence';
        rod([-25, 0, -12.8], [-25.8, 2.3, -12.4], 0.055, rust);
        rod([-25, 0, -5.2], [-25.4, 1.5, -6.2], 0.055, rust);
        continue;
      }
      const panel = mesh(new THREE.PlaneGeometry(7.6, 2.5), fenceMat, x, 1.45, z);
      panel.rotation.y = Math.PI / 2; panel.castShadow = false;
      for (const dz of [-3.8, 3.8]) rod([x, 0, z + dz], [x, 3, z + dz], 0.055);
      rod([x, 2.75, z - 3.8], [x, 2.75, z + 3.8], 0.035);
    }
  }

  // Layered mountains and 300 individually varied pines, all outside the play square.
  const mountains = [];
  for (let i = 0; i < 26; i++) {
    const angle = i / 26 * Math.PI * 2;
    const radius = range(85, 128), height = range(19, 45);
    mountains.push({ p: [Math.cos(angle) * radius, height / 2 - 3, Math.sin(angle) * radius],
      s: [range(16, 30), height, range(14, 27)], r: [0, range(0, 6), 0], color: i % 2 ? 0x3b555d : 0x334b55 });
  }
  const mountainGeo = new THREE.ConeGeometry(1, 1, 11, 5);
  const mountainVertices = mountainGeo.getAttribute('position');
  for (let i = 0; i < mountainVertices.count; i++) {
    const x = mountainVertices.getX(i), y = mountainVertices.getY(i), z = mountainVertices.getZ(i);
    const angle = Math.atan2(z, x);
    const ridge = 1 + Math.sin(angle * 3 + y * 5) * 0.17 + Math.cos(angle * 7) * 0.1;
    mountainVertices.setXYZ(i, x * ridge + y * 0.16, y, z * ridge);
  }
  mountainGeo.computeVertexNormals();
  instances('distant mountain ridges', mountainGeo, material(0xffffff, { flatShading: true }), mountains);
  // Serrated radial skirts suggest hanging branch tips instead of perfect cones.
  const pineVertices = [], pineIndices = [];
  const rings = [[0.5, 0], [0.3, 0.22], [0.17, 0.38], [-0.03, 0.47], [-0.2, 0.73], [-0.4, 0.83], [-0.5, 1]];
  const sides = 18;
  rings.forEach(([y, radius], ring) => {
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2;
      const jagged = i % 2 ? 0.69 : 1;
      const r = radius * jagged * (1 + Math.sin(angle * 5) * 0.12);
      pineVertices.push(Math.cos(angle) * r, y - (i % 2 === 0 && ring > 0 ? 0.095 : 0), Math.sin(angle) * r);
      if (ring < rings.length - 1) {
        const a = ring * sides + i, b = ring * sides + (i + 1) % sides;
        pineIndices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  });
  const pineGeo = new THREE.BufferGeometry();
  pineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pineVertices, 3));
  pineGeo.setIndex(pineIndices);
  pineGeo.computeVertexNormals();
  const trunks = [], needles = [];
  const groves = [[-35, -20, 9, 16], [-46, -43, 16, 13], [29, -39, 10, 12],
    [47, -10, 15, 10], [-45, 26, 13, 12], [39, 38, 15, 10], [0, -74, 23, 12]];
  for (let i = 0; i < 300; i++) {
    const [gx, gz, spread, canopy] = groves[i % groves.length];
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * spread;
    const x = gx + Math.cos(angle) * radius, z = gz + Math.sin(angle) * radius;
    if (Math.abs(x) < 27 && Math.abs(z) < 28) continue;
    const height = canopy * range(0.55, 1.35), width = range(1.25, 3.1), yaw = random() * Math.PI;
    const leanX = range(-0.045, 0.045), leanZ = range(-0.06, 0.06);
    trunks.push({ p: [x + leanZ * height * 0.43, height * 0.43, z - leanX * height * 0.43],
      s: [height * 0.017, height * 0.86, height * 0.017], r: [leanX, yaw, -leanZ] });
    const tiers = i % 5 === 0 ? 3 : 5;
    for (let tier = 0; tier < tiers; tier++) {
      const level = tier / (tiers - 1), y = height * (0.3 + level * 0.56);
      const size = width * (1 - level * 0.69) * range(0.8, 1.16);
      needles.push({ p: [x + leanZ * y + range(-0.22, 0.22), y, z - leanX * y + range(-0.2, 0.2)],
        s: [size, height * (0.34 - level * 0.08), size * range(0.62, 1.12)],
        r: [leanX, yaw + tier * 0.7, -leanZ], color: [0x172f2c, 0x223a35, 0x2b4339, 0x354d40][i % 4] });
    }
  }
  instances('pine trunks', unitCylinder, material(0x3c3c31), trunks);
  instances('layered pine crowns', pineGeo, material(0xffffff, { side: THREE.DoubleSide }), needles);

  const grasses = [], stones = [], papers = [];
  for (let i = 0; i < 1400; i++) {
    let x = range(-39, 39), z = range(-36, 36);
    if (Math.abs(x) < 22 && z > -23 && z < 23) {
      if (i % 9 !== 0 || Math.abs(x) < 8) continue;
    }
    // Decorative tufts are below ankle height in the actual yard.
    const outside = Math.abs(x) > 24 || Math.abs(z) > 24;
    const h = outside ? range(0.18, 0.8) : range(0.08, 0.22);
    grasses.push({ p: [x, h / 2, z], s: [range(0.1, 0.3), h, range(0.1, 0.3)],
      r: [range(-0.16, 0.16), range(0, 6), range(-0.16, 0.16)], color: i % 3 ? 0x5a6850 : 0x8a8560 });
  }
  instances('roadside grass tufts', new THREE.ConeGeometry(1, 1, 3), material(0xffffff), grasses);
  // Damage has origins: a west breach, spalled window bay and abandoned field
  // equipment. Keep the spawn-to-door lane and east approach free of loose bits.
  const debrisSites = [[-23.7, -8.3, 1.2, 2.3, 28], [-10.6, -8.5, 2, 0.45, 23],
    [-15.3, -5.15, 1.7, 0.65, 18], [-10.6, -2.4, 1.3, 0.45, 15]];
  const splinters = [];
  for (const [x, z, sx, sz, count] of debrisSites) {
    for (let i = 0; i < count; i++) {
      const angle = range(0, Math.PI * 2), radius = random() * random();
      stones.push({ p: [x + Math.cos(angle) * radius * sx, 0.045, z + Math.sin(angle) * radius * sz],
        s: [range(0.07, 0.22), range(0.025, 0.075), range(0.06, 0.19)], r: [0, range(0, 6), 0] });
    }
    for (let i = 0; i < 4; i++) splinters.push({ p: [x + range(-sx, sx), 0.045, z + range(-sz, sz)],
      s: [range(0.3, 0.85), 0.05, range(0.08, 0.17)], r: [0, range(-1, 1), 0] });
  }
  for (let i = 0; i < 9; i++) papers.push({ p: [-14.1 + range(-1.1, 1.1), 0.028, -5.1 + range(-0.7, 0.7)],
    s: [range(0.12, 0.25), 1, range(0.17, 0.3)], r: [-Math.PI / 2, 0, range(0, 6)] });
  instances('localized breach and impact rubble', new THREE.DodecahedronGeometry(1, 0), darkConcrete, stones);
  instances('broken packing slats', unitBox, scorchedWood, splinters);
  // A damaged receiver sits among its opened field cases, rather than another
  // unrelated obstacle in the courtyard's combat lanes.
  box(-17.3, 1.37, -7.1, 1.3, 0.4, 1.1, metal);
  box(-17.3, 1.38, -6.535, 1.13, 0.28, 0.045, black, false);
  solid(-17.3, -7.1, 1.3, 1.1, 1.17, 1.57);
  for (const x of [-17.65, -17.4, -17.05]) mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 8), ochre, x, 1.38, -6.49).rotation.x = Math.PI / 2;
  cable([[-17, 1.2, -6.6], [-16.6, 0.06, -5.9], [-16, 0.04, -5.1], [-15.5, 0.05, -5.55]], 0.028);
  // Plane local x/y become ground x/z after rotation.
  papers.forEach(p => { p.s = [p.s[0], p.s[2], 1]; });
  instances('discarded field notes', new THREE.PlaneGeometry(1, 1), material(0xa5aa92, { side: THREE.DoubleSide }), papers);

  // Distant wisps are transparent sprites; they never obscure the combat sightline.
  const mist = [];
  for (let i = 0; i < 13; i++) {
    const x = range(-37, 37), z = range(-38, -24), y = range(1.4, 4.2);
    const sprite = glow(x, y, z, 0x85abb0, range(15, 26), range(0.035, 0.075));
    sprite.scale.y *= 0.22;
    mist.push({ sprite, x, z, phase: range(0, Math.PI * 2) });
  }
  // One bounded point cloud for drifting ash/insects in the station lights.
  const motesGeo = new THREE.BufferGeometry();
  const motePositions = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) {
    motePositions[i * 3] = range(-19, 19);
    motePositions[i * 3 + 1] = range(0.5, 7);
    motePositions[i * 3 + 2] = range(-12, 16);
  }
  motesGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ color: 0xc8d5b9, size: 0.045,
    map: glowTexture, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(motes);
  const pennant = mesh(new THREE.PlaneGeometry(0.8, 1.45, 1, 6), material(0xac8b51, { side: THREE.DoubleSide }), -18.7, 5.5, -5);
  const flagAttribute = pennant.geometry.getAttribute('position');
  const flagRest = flagAttribute.array.slice();

  let power = true;
  let elapsed = 0;
  function setPower(enabled) {
    power = Boolean(enabled);
    for (const { mat, intensity } of poweredMaterials) mat.emissiveIntensity = power ? intensity : 0.025;
    for (const { light, intensity } of poweredLights) light.intensity = power ? intensity : 0;
    for (const { sprite, opacity } of poweredGlows) sprite.material.opacity = power ? opacity : 0;
    poolMat.opacity = power ? 0.22 : 0;
  }
  function update(dt = 0, time) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    elapsed = Number.isFinite(time) ? time : elapsed + step;
    // The tower uses independent emergency power, including when station power is cut.
    const pulse = Math.pow(Math.max(0, Math.sin(elapsed * 2.3)), 8);
    beacon.material.opacity = 0.18 + pulse * 0.82;
    beacon.scale.setScalar(2.2 + pulse * 1.6);
    lowerBeacon.material.opacity = 0.18 + pulse * 0.32;
    beaconMat.color.setRGB(1, 0.035 + pulse * 0.09, 0.025);
    if (power) {
      const flicker = 0.97 + Math.sin(elapsed * 13.7) * 0.018 + Math.sin(elapsed * 31.3) * 0.012;
      poweredLights[0].light.intensity = poweredLights[0].intensity * flicker;
    }
    for (const wisp of mist) {
      wisp.sprite.position.x = wisp.x + Math.sin(elapsed * 0.07 + wisp.phase) * 3;
      wisp.sprite.position.z = wisp.z + Math.cos(elapsed * 0.05 + wisp.phase) * 1.5;
    }
    motes.position.x = Math.sin(elapsed * 0.09) * 0.7;
    motes.position.y = Math.sin(elapsed * 0.17) * 0.18;
    for (let i = 0; i < flagAttribute.count; i++) {
      const x = flagRest[i * 3], y = flagRest[i * 3 + 1];
      const loose = (0.725 - y) / 1.45;
      flagAttribute.setZ(i, Math.sin(elapsed * 2.6 + y * 4 + x) * 0.16 * loose);
    }
    flagAttribute.needsUpdate = true;
    pennant.geometry.computeVertexNormals();
  }
  update(0, 0);
  return { colliders, spawnPoints, playerSpawn, supplyPosition, update, setPower };
}
