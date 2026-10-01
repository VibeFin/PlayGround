/**
 * WRECKAGE / The Iron Pit. All dimensions are metres; the driving surface is y=0.
 * Main owns the sky, lighting, fog and camera. Suggested overview: (50,42,61),
 * looking at (0,0,0), warm sun from the southwest and beige distance fog.
 * Everything created here is owned by the returned group. No external assets.
 */
export function createArena(THREE, { lowDetail = false } = {}) {
  const root = new THREE.Group();
  root.name = 'WRECKAGE — The Iron Pit';
  let seed = 0x19a4c82f;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (a, b) => a + (b - a) * random();
  const pick = (values) => values[Math.floor(random() * values.length)];
  const textures = [];

  function canvasTexture(width, height, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The arena requires a Canvas 2D context.');
    paint(context, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }

  // One continuous, non-repeating clay map keeps the racing scars at world scale.
  const clayMap = canvasTexture(2048, 1536, (ctx, w, h) => {
    ctx.fillStyle = '#98734e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = random() * w;
      const y = random() * h;
      const r = between(20, 170);
      const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
      wash.addColorStop(0, random() < 0.5 ? 'rgba(60,44,31,.09)' : 'rgba(231,190,125,.10)');
      wash.addColorStop(1, 'rgba(140,105,65,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // A churned oval, rather than painted track boundaries.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 135; i++) {
      ctx.beginPath();
      ctx.ellipse(between(-14, 14), between(-10, 10), between(645, 852), between(429, 592),
        between(-0.045, 0.045), 0, Math.PI * 2);
      ctx.lineWidth = between(1, 10);
      ctx.strokeStyle = `rgba(48,37,28,${between(0.012, 0.055)})`;
      ctx.stroke();
    }
    ctx.restore();
    // Pairs of drifting tyre marks, including short lock-ups and figure eights.
    for (let i = 0; i < 82; i++) {
      ctx.save();
      ctx.translate(between(210, w - 210), between(180, h - 180));
      ctx.rotate(between(0, Math.PI * 2));
      const radius = between(65, 410);
      const arc = between(0.2, 1.65);
      for (const offset of [-12, 12]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius + offset, radius * 0.64 + offset, 0, 0, arc);
        ctx.strokeStyle = `rgba(39,34,28,${between(0.06, 0.19)})`;
        ctx.lineWidth = between(3, 5);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Ghosted event stencil underneath a season's worth of abrasion.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.065);
    ctx.strokeStyle = 'rgba(230,206,150,.20)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(0, 0, 283, 230, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([20, 13]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 301, 248, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(238,214,158,.22)';
    ctx.textAlign = 'center';
    ctx.font = '900 87px Impact, Arial Black, sans-serif';
    ctx.fillText('WRECKAGE', 0, 18, 492);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('THE IRON PIT  /  EST. 1997', 0, 58);
    ctx.restore();
    // Small aggregates and flecks remain visible at chase-camera distance.
    const grain = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < grain.data.length; i += 4) {
      const noise = (random() - 0.5) * 27;
      grain.data[i] += noise;
      grain.data[i + 1] += noise;
      grain.data[i + 2] += noise * 0.8;
    }
    ctx.putImageData(grain, 0, 0);
    for (let i = 0; i < 30000; i++) {
      ctx.fillStyle = random() < 0.6 ? 'rgba(42,33,25,.16)' : 'rgba(234,209,164,.23)';
      const size = between(0.5, 2.6);
      ctx.fillRect(random() * w, random() * h, size * 1.6, size);
    }
    // Loose, pale dirt accumulates at the barricades.
    const edge = ctx.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, 'rgba(213,179,124,.35)');
    edge.addColorStop(0.07, 'rgba(213,179,124,0)');
    edge.addColorStop(0.93, 'rgba(213,179,124,0)');
    edge.addColorStop(1, 'rgba(213,179,124,.35)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
  });

  const aggregateMap = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a7977b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 18000; i++) {
      const value = Math.floor(between(85, 198));
      ctx.fillStyle = `rgba(${value},${value},${value},${between(0.08, 0.5)})`;
      const size = between(0.5, 2);
      ctx.fillRect(random() * w, random() * h, size, size);
    }
  });
  aggregateMap.wrapS = aggregateMap.wrapT = THREE.RepeatWrapping;
  aggregateMap.repeat.set(180, 180);

  const concreteMap = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a49e8a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12500; i++) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(37,36,29,.15)' : 'rgba(242,232,207,.16)';
      ctx.fillRect(random() * w, random() * h, between(1, 3), between(1, 4));
    }
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = 'rgba(54,44,32,.09)';
      ctx.fillRect(random() * w, h * 0.4, between(1, 5), random() * h * 0.6);
    }
    ctx.strokeStyle = 'rgba(50,46,35,.30)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = random() * w;
      let y = random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += between(-20, 20);
        y += between(6, 22);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const dirt = ctx.createLinearGradient(0, 0, 0, h);
    dirt.addColorStop(0, 'rgba(32,29,24,0)');
    dirt.addColorStop(0.65, 'rgba(47,38,26,.06)');
    dirt.addColorStop(1, 'rgba(48,36,23,.5)');
    ctx.fillStyle = dirt;
    ctx.fillRect(0, 0, w, h);
  });

  const cautionMap = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d4a62e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#292d2b';
    for (let x = -h; x < w + h; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 64, 0);
      ctx.lineTo(x + 64 - h * 0.58, h);
      ctx.lineTo(x - h * 0.58, h);
      ctx.fill();
    }
    for (let i = 0; i < 7000; i++) {
      ctx.fillStyle = pick(['rgba(151,141,115,.32)', 'rgba(222,205,164,.22)', 'rgba(30,28,24,.15)']);
      ctx.fillRect(random() * w, random() * h, between(1, 6), between(1, 3));
    }
    const dirt = ctx.createLinearGradient(0, 0, 0, h);
    dirt.addColorStop(0, 'rgba(37,29,22,0)');
    dirt.addColorStop(1, 'rgba(37,29,22,.50)');
    ctx.fillStyle = dirt;
    ctx.fillRect(0, 0, w, h);
  });

  const fenceMap = canvasTexture(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#77776b';
    for (let i = -128; i <= 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
      ctx.moveTo(i, 0);
      ctx.lineTo(i - 128, 128);
      ctx.stroke();
    }
  });
  fenceMap.wrapS = fenceMap.wrapT = THREE.RepeatWrapping;
  fenceMap.repeat.set(3, 2);

  const standard = (color, options = {}) => {
    if (lowDetail) {
      const { metalness, roughness, ...surface } = options;
      return new THREE.MeshLambertMaterial({ color, ...surface });
    }
    return new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...options });
  };
  const mat = {
    steel: standard('#424946', { metalness: 0.62, roughness: 0.65 }),
    dark: standard('#262b2a', { metalness: 0.35 }),
    zinc: standard('#888e84', { metalness: 0.65, roughness: 0.65 }),
    yellow: standard('#d0a031', { metalness: 0.25 }),
    rust: standard('#795043', { metalness: 0.3 }),
    concrete: standard('#ffffff', { map: concreteMap }),
    caution: standard('#ffffff', { map: cautionMap }),
    rubber: standard('#232521', { roughness: 0.98 }),
    hub: standard('#575b53', { metalness: 0.65 }),
    paint: standard('#ffffff', { metalness: 0.25 }),
    crowd: standard('#ffffff', { roughness: 1 }),
    skin: standard('#ffffff', { roughness: 1 }),
    lamp: standard('#fff0c8', { emissive: '#ffdc94', emissiveIntensity: 1.65, roughness: 0.4 }),
    glass: standard('#505f59', { metalness: 0.45, roughness: 0.38 }),
    fence: standard('#c1bca4', { map: fenceMap, alphaTest: 0.38, side: THREE.DoubleSide }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, lowDetail ? 6 : 12);
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const tyreGeometry = new THREE.TorusGeometry(0.48, 0.19, lowDetail ? 4 : 7, lowDetail ? 8 : 14);
  const headGeometry = lowDetail ? new THREE.IcosahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 7, 5);
  const batches = new Map();
  const transform = new THREE.Object3D();
  const vector = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // All repeated structures, including truss members, share material/geometry batches.
  function instance(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], color, shadow = true) {
    // Spatial batches let the chase camera cull spectators behind the driver.
    const zone = lowDetail && (material === mat.crowd || material === mat.skin || material === mat.rubber)
      ? `${position[0] < 0 ? 'w' : 'e'}${position[2] < 0 ? 's' : 'n'}` : 'all';
    const key = `${geometry.uuid}:${material.uuid}:${shadow}:${zone}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, shadow, items: [] });
    transform.position.set(...position);
    transform.rotation.set(...rotation);
    transform.scale.set(...scale);
    transform.updateMatrix();
    batches.get(key).items.push({ matrix: transform.matrix.clone(), color });
  }
  const box = (material, p, s, ry = 0, color, shadow = true) =>
    instance(unitBox, material, p, s, [0, ry, 0], color, shadow);
  const cylinder = (material, p, radius, height, color, rotation = [0, 0, 0]) =>
    instance(unitCylinder, material, p, [radius, height, radius], rotation, color);
  function beam(material, a, b, width = 0.12, depth = width) {
    vector.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = vector.length();
    transform.quaternion.setFromUnitVectors(up, vector.normalize());
    const rotation = transform.rotation.toArray().slice(0, 3);
    instance(unitBox, material, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      [width, length, depth], rotation);
  }
  function mesh(geometry, material, name, position, rotation) {
    const item = new THREE.Mesh(geometry, material);
    item.name = name;
    if (position) item.position.set(...position);
    if (rotation) item.rotation.set(...rotation);
    item.receiveShadow = true;
    root.add(item);
    return item;
  }

  const outside = standard('#8d7d62', { map: aggregateMap });
  mesh(new THREE.PlaneGeometry(700, 700), outside, 'Surrounding dusty industrial apron',
    [0, -0.025, 0], [-Math.PI / 2, 0, 0]);
  const groundMaterial = standard('#ffffff', { map: clayMap, roughness: 1 });
  const ground = mesh(new THREE.PlaneGeometry(88, 66), groundMaterial,
    'Flat clay driving surface / paired skid marks', [0, 0, 0], [-Math.PI / 2, 0, 0]);
  ground.castShadow = false;

  // Extruded Jersey cross-section: broad foot, sloping belly, narrow vertical top.
  function jerseyGeometry() {
    const profile = [[-0.58, 0], [0.58, 0], [0.58, 0.2], [0.26, 0.74],
      [0.22, 1.3], [-0.22, 1.3], [-0.26, 0.74], [-0.58, 0.2]];
    const shape = new THREE.Shape();
    profile.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 });
    geometry.translate(0, 0, -0.5);
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const side = Math.abs(normals.getX(i)) > 0.1;
      uv.setXY(i, side ? positions.getZ(i) + 0.5 : positions.getX(i) / 1.16 + 0.5,
        positions.getY(i) / 1.3);
    }
    return geometry;
  }
  const jersey = jerseyGeometry();
  // A single material per instance avoids the extrusion's default two-material split.
  jersey.clearGroups();
  for (const z of [-33, 33]) {
    for (let i = 0; i < 22; i++) {
      instance(jersey, i % 5 === 0 || i % 5 === 1 ? mat.caution : mat.concrete,
        [-42 + i * 4, 0, z], [1, 1, 3.92], [0, Math.PI / 2, 0]);
    }
  }
  for (const x of [-44, 44]) {
    for (let i = 0; i < 16; i++) {
      instance(jersey, i % 5 < 2 ? mat.caution : mat.concrete,
        [x, 0, -30.9375 + i * 4.125], [1, 1, 4.04]);
    }
  }

  function fenceRun(a, b, sections, height = 2.7) {
    const dx = (b[0] - a[0]) / sections;
    const dz = (b[1] - a[1]) / sections;
    const width = Math.hypot(dx, dz);
    const ry = -Math.atan2(dz, dx);
    for (let i = 0; i <= sections; i++) {
      const x = a[0] + dx * i;
      const z = a[1] + dz * i;
      box(mat.steel, [x, 1.3 + height / 2, z], [0.10, height + 0.15, 0.10]);
      if (i < sections) {
        instance(unitPlane, mat.fence, [x + dx / 2, 1.3 + height / 2, z + dz / 2],
          [width, height, 1], [0, ry, 0], undefined, false);
        beam(mat.steel, [x, 1.3 + height, z], [x + dx, 1.3 + height, z + dz], 0.065);
        beam(mat.steel, [x, 1.35, z], [x + dx, 1.35, z + dz], 0.055);
      }
    }
  }
  fenceRun([-44.9, -34], [44.9, -34], 22);
  fenceRun([-44.9, 34], [44.9, 34], 22, 2.15);
  fenceRun([-45, -34], [-45, 34], 17);
  fenceRun([45, -34], [45, 34], 17, 2.35);

  function bannerTexture(title, subtitle, background, foreground) {
    return canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = foreground;
      ctx.fillRect(22, 20, 8, h - 40);
      ctx.fillRect(w - 30, 20, 8, h - 40);
      ctx.globalAlpha = 0.25;
      for (let x = 42; x < w - 42; x += 28) ctx.fillRect(x, h - 19, 15, 3);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 132px Impact, Arial Black, sans-serif';
      ctx.fillText(title, w / 2, 113, w - 105);
      ctx.font = 'bold 25px Arial, sans-serif';
      ctx.fillText(subtitle, w / 2, 209, w - 125);
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = random() < 0.5 ? 'rgba(20,19,15,.12)' : 'rgba(221,202,156,.12)';
        ctx.fillRect(random() * w, random() * h, between(1, 8), between(1, 3));
      }
      ctx.fillStyle = '#9f9988';
      for (const x of [12, w - 12]) {
        for (const y of [12, h - 12]) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
  const bannerMaterials = [
    ['WRECKAGE', 'DEMOLITION DERBY  /  THE IRON PIT', '#252a27', '#e2b343'],
    ['IRONCLAD', 'BUILT TO TAKE THE HIT', '#b4a991', '#292f2c'],
    ['FULL CONTACT', 'HEAVY METAL.  NO MERCY.', '#873f2f', '#e6d4ad'],
    ['NO BRAKES', 'ALL THROTTLE  /  SINCE 1986', '#c69b35', '#242c29'],
  ].map((args) => standard('#ffffff', { map: bannerTexture(...args), side: THREE.DoubleSide, roughness: 0.95 }));
  function banner(index, x, y, z, width, height, ry = 0) {
    instance(unitPlane, bannerMaterials[index], [x, y, z], [width, height, 1], [0, ry, 0], undefined, false);
  }
  for (let i = 0; i < 7; i++) {
    banner(i % 4, -36 + i * 12, 2.55, -33.88, 10.3, 1.95);
  }
  for (const x of [-44.88, 44.88]) {
    for (let i = 0; i < 4; i++) banner((i + 1) % 4, x, 2.25, -24 + i * 16, 11, 1.65,
      x < 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  // Grandstands rise away from the track, with open braced steel below the decks.
  const shirtColors = ['#c69739', '#343d3b', '#a64a36', '#d5c7a6', '#5a777e', '#48605b',
    '#b66b42', '#637b91', '#8d3430', '#9b957c', '#e1d6b7', '#3e4d67'];
  const skinColors = ['#bc8863', '#d0a67b', '#986b4e', '#704c38', '#dcba92'];
  function stand(cx, cz, width, rows, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const local = (x, y, z) => [cx + x * cos + z * sin, y, cz - x * sin + z * cos];
    const localBox = (material, p, s, color) => box(material, local(...p), s, angle, color);
    const columns = Math.floor(width / 0.76);
    for (let row = 0; row < rows; row++) {
      const z = -row * 1.17;
      const y = 1.35 + row * 0.63;
      localBox(mat.zinc, [0, y - 0.12, z], [width, 0.15, 1.12]);
      localBox(mat.dark, [0, y + 0.3, z - 0.17], [width, 0.12, 0.36]);
      localBox(mat.yellow, [0, y - 0.015, z + 0.51], [width, 0.035, 0.055]);
      for (let col = 0; col < columns; col++) {
        const x = (col - (columns - 1) / 2) * 0.76;
        // Stair aisles and a few irregular gaps prevent an artificial solid crowd.
        if (Math.abs(x) < 0.95 || random() < 0.105) continue;
        const px = x + between(-0.1, 0.1);
        const py = y + between(0.62, 0.74);
        const pz = z + between(-0.05, 0.12);
        const shirt = pick(shirtColors);
        const skin = pick(skinColors);
        const cheering = random() < 0.13;
        localBox(mat.crowd, [px, py, pz], [between(0.35, 0.46), 0.53, 0.27], shirt);
        instance(headGeometry, mat.skin, local(px, py + 0.44, pz), [0.155, 0.19, 0.155],
          [0, angle, 0], skin, false);
        localBox(mat.crowd, [px, py - 0.34, pz + 0.16], [0.37, 0.18, 0.46], '#303b3e');
        if (random() < 0.3) localBox(mat.crowd, [px, py + 0.6, pz + 0.025], [0.31, 0.08, 0.35], shirt);
        for (const side of [-1, 1]) {
          const a = local(px + side * 0.21, py + 0.12, pz);
          const b = local(px + side * (cheering ? 0.34 : 0.24), py + (cheering ? 0.67 : -0.27), pz + 0.12);
          // Sleeved arms use the crowd batch, with their own instance colour.
          vector.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const length = vector.length();
          transform.quaternion.setFromUnitVectors(up, vector.normalize());
          instance(unitBox, mat.crowd, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
            [0.12, length, 0.14], transform.rotation.toArray().slice(0, 3), shirt);
        }
      }
      // Central concrete stair treads.
      localBox(mat.concrete, [0, y + 0.03, z], [1.35, 0.22, 1.12]);
    }
    const backZ = -(rows - 1) * 1.17 - 0.62;
    const backY = 1.35 + (rows - 1) * 0.63;
    for (let x = -width / 2; x <= width / 2 + 0.01; x += width / 6) {
      beam(mat.steel, local(x, 0, backZ), local(x, backY + 1.15, backZ), 0.16);
      beam(mat.steel, local(x, 0, 0.5), local(x, 1.5, 0.5), 0.15);
      beam(mat.steel, local(x, 0.2, 0.5), local(x, backY - 0.2, backZ), 0.14);
      if (x < width / 2 - 0.01) beam(mat.steel, local(x, 0.3, backZ), local(x + width / 6, backY, backZ), 0.1);
    }
    for (const height of [0.55, 1.1]) beam(mat.steel, local(-width / 2, backY + height, backZ),
      local(width / 2, backY + height, backZ), 0.08);
    for (const side of [-1, 1]) {
      const x = side * width / 2;
      beam(mat.steel, local(x, 2.4, 0.5), local(x, backY + 1.05, backZ), 0.085);
      for (let row = 0; row < rows; row += 2) beam(mat.steel,
        local(x, 1.35 + row * 0.63, -row * 1.17), local(x, 2.4 + row * 0.63, -row * 1.17), 0.065);
    }
  }
  stand(-29.5, -39.3, 25, 8, 0);
  stand(0, -40, 28, 9, 0);
  stand(29.5, -39.3, 25, 8, 0);
  stand(-51, -14, 25, 7, Math.PI / 2);
  stand(-51, 16, 25, 7, Math.PI / 2);
  stand(51.5, -15, 27, 5, -Math.PI / 2);

  // The main sign is high enough to read above the far crowd in the overview.
  const signZ = -51.5;
  for (const x of [-18, 18]) {
    for (const z of [signZ - 1, signZ + 1]) {
      box(mat.steel, [x, 6.9, z], [0.32, 13.8, 0.32]);
      box(mat.concrete, [x, 0.4, z], [1.4, 0.8, 1.4]);
    }
    for (let y = 1; y < 13; y += 2) {
      beam(mat.steel, [x, y, signZ - 1], [x, y + 2, signZ + 1], 0.12);
      beam(mat.steel, [x, y, signZ + 1], [x, y + 2, signZ - 1], 0.12);
    }
  }
  for (const y of [9.1, 14.0]) box(mat.steel, [0, y, signZ], [37, 0.22, 1]);
  box(mat.dark, [0, 11.55, signZ], [35.5, 4.65, 0.4]);
  banner(0, 0, 11.55, signZ + 0.23, 35, 4.4);
  for (let x = -16; x <= 16; x += 4) {
    beam(mat.steel, [x, 14, signZ], [x, 14.55, signZ + 1], 0.09);
    box(mat.lamp, [x, 14.45, signZ + 0.85], [0.7, 0.12, 0.3], 0, undefined, false);
  }

  // Dry rubber buffers are entirely outside the rectangular simulation boundary.
  function tyre(x, y, z, radius = 1, rotation = [-Math.PI / 2, 0, 0]) {
    instance(tyreGeometry, mat.rubber, [x, y, z], [radius, radius, radius], rotation);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 19; i++) {
      const z = -29 + i * 3.25;
      for (let layer = 0; layer < (i % 4 === 0 ? 4 : 3); layer++) {
        tyre(side * 46.4 + between(-0.07, 0.07), 0.2 + layer * 0.37, z, 1.06);
      }
    }
    for (let i = 0; i < 18; i++) {
      tyre(side * between(48, 63), 0.22, between(29, 39), between(0.88, 1.32),
        [-Math.PI / 2 + between(-0.15, 0.15), between(0, 3), 0]);
    }
  }
  for (const x of [-39, -35, 35, 39]) {
    for (let i = 0; i < 4; i++) tyre(x, 0.21 + i * 0.38, 35.5, 1.15);
  }

  function container(x, z, color, angle = 0, base = 0, length = 12.2) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (a, y, b) => [x + a * cos + b * sin, y + base, z - a * sin + b * cos];
    const height = 2.6;
    box(mat.paint, at(0, height / 2, 0), [length, height, 2.44], angle, color);
    for (const side of [-1, 1]) {
      for (let a = -length / 2 + 0.25; a < length / 2; a += 0.34) {
        box(mat.paint, at(a, height / 2, side * 1.24), [0.075, height - 0.26, 0.07], angle, color);
      }
      for (const y of [0.12, height - 0.1]) box(mat.steel, at(0, y, side * 1.25), [length, 0.12, 0.11], angle);
      for (const a of [-length / 2 + 0.08, length / 2 - 0.08]) {
        box(mat.steel, at(a, height / 2, side * 1.24), [0.14, height, 0.14], angle);
      }
    }
    for (const b of [-0.63, 0.63]) {
      box(mat.zinc, at(length / 2 + 0.045, height / 2, b), [0.055, 2.22, 0.055], angle);
      box(mat.zinc, at(length / 2 + 0.08, 1.1, b + 0.12), [0.10, 0.065, 0.3], angle);
    }
    // Roof ridges catch the low sun from the overview.
    for (let a = -length / 2 + 0.3; a < length / 2; a += 0.65) {
      box(mat.paint, at(a, height + 0.02, 0), [0.065, 0.045, 2.25], angle, color);
    }
    return at;
  }
  container(-26, 43, '#704b37', 0.06);
  container(-26.5, 43, '#a38b50', 0.03, 2.65);
  container(28, 44, '#475f5a', -0.1);
  container(55, 27, '#925b3d', Math.PI / 2);
  container(-62, -41, '#53605a', Math.PI / 2);
  container(63, -42, '#8a7b50', 0.14);
  banner(1, -26.2, 4.0, 44.35, 8.5, 1.75, Math.PI);
  banner(3, 28, 1.4, 45.35, 8.5, 1.65, Math.PI);

  // Southern service gate: open centre, low foreground silhouette.
  for (const x of [-11, 11]) {
    box(mat.yellow, [x, 3.25, 40], [0.32, 6.5, 0.32]);
    box(mat.concrete, [x, 0.45, 40], [1.0, 0.9, 1]);
    for (let y = 0.7; y < 3; y += 0.6) box(mat.dark, [x, y, 40], [0.34, 0.23, 0.34]);
  }
  box(mat.steel, [0, 6.5, 40], [22.6, 0.3, 0.42]);
  for (const x of [-10.5, 10.5]) beam(mat.steel, [x, 4.5, 40], [x + (x < 0 ? 2 : -2), 6.5, 40], 0.16);
  banner(3, 0, 6.35, 40.24, 8, 1.2, Math.PI);

  // Portable marshal hut, service drums and a little trackside equipment.
  box(mat.paint, [42, 1.5, 42], [4, 3, 3.2], 0, '#bcb298');
  box(mat.dark, [42, 3.1, 42], [4.5, 0.22, 3.7]);
  box(mat.glass, [42, 2.0, 40.38], [3.4, 0.95, 0.035]);
  for (const x of [40.95, 42, 43.05]) box(mat.zinc, [x, 2.0, 40.34], [0.05, 1, 0.06]);
  box(mat.dark, [39.97, 1.2, 42.2], [0.045, 2.3, 0.95]);
  banner(2, 42, 0.9, 40.35, 3.4, 0.65);
  const coneGeometry = new THREE.ConeGeometry(0.24, 0.78, 8);
  for (const x of [-42, -39.5, 39.5, 42]) {
    box(mat.rubber, [x, 0.07, 37], [0.6, 0.12, 0.6]);
    instance(coneGeometry, mat.paint, [x, 0.5, 37], [1, 1, 1], [0, 0, 0], '#d0823e');
  }
  for (let i = 0; i < 15; i++) {
    const x = (i < 8 ? -1 : 1) * between(52, 61);
    const z = between(33, 42);
    const color = pick(['#936d3b', '#745346', '#4f635d']);
    cylinder(mat.paint, [x, 0.57, z], 0.37, 1.1, color);
    for (const y of [0.24, 0.86]) cylinder(mat.dark, [x, y, z], 0.385, 0.045);
  }

  function floodlight(x, z, height) {
    const angle = Math.atan2(-x, -z);
    box(mat.concrete, [x, 0.6, z], [1.8, 1.2, 1.8]);
    // Narrow lattice masts have readable silhouettes without large occluding poles.
    for (const dx of [-0.35, 0.35]) {
      for (const dz of [-0.35, 0.35]) beam(mat.zinc, [x + dx, 1, z + dz], [x + dx * 0.55, height, z + dz * 0.55], 0.13);
    }
    for (let y = 1.3; y < height - 1; y += 2) {
      beam(mat.steel, [x - 0.34, y, z + 0.34], [x + 0.34, y + 1.9, z + 0.34], 0.065);
      beam(mat.steel, [x + 0.34, y, z - 0.34], [x - 0.34, y + 1.9, z - 0.34], 0.065);
      beam(mat.steel, [x - 0.34, y, z - 0.34], [x - 0.34, y + 1.9, z + 0.34], 0.065);
    }
    box(mat.steel, [x, height, z], [5.4, 0.18, 0.75], angle);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const offset = (col - 1.5) * 1.22;
        const px = x + Math.cos(angle) * offset;
        const pz = z - Math.sin(angle) * offset;
        instance(unitBox, mat.dark, [px, height + 0.5 + row * 0.85, pz], [1.03, 0.66, 0.34], [-0.18, angle, 0]);
        instance(unitBox, mat.lamp, [px + Math.sin(angle) * 0.2, height + 0.48 + row * 0.85,
          pz + Math.cos(angle) * 0.2], [0.86, 0.49, 0.04], [-0.18, angle, 0], undefined, false);
      }
    }
  }
  floodlight(-48, -36.5, 20);
  floodlight(48, -36.5, 21);
  floodlight(-49, 36.5, 18);
  floodlight(49, 36.5, 18);

  // Large, restrained background masses leave the arena itself as the focal point.
  function warehouse(x, z, width, depth, height, color) {
    box(mat.paint, [x, height / 2, z], [width, height, depth], 0, color);
    const rise = width * 0.10;
    const roofAngle = Math.atan2(rise, width / 2);
    const slope = Math.hypot(width / 2, rise);
    for (const side of [-1, 1]) {
      instance(unitBox, mat.dark, [x + side * width / 4, height + rise / 2, z],
        [slope + 0.65, 0.18, depth + 1], [0, 0, -side * roofAngle]);
    }
    // Gable infill, rendered in the same weathered sheet metal as the walls.
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute('position', new THREE.Float32BufferAttribute([
      -width / 2, 0, 0, width / 2, 0, 0, 0, rise, 0,
    ], 3));
    triangle.computeVertexNormals();
    instance(triangle, mat.paint, [x, height, z + depth / 2], [1, 1, 1], [0, 0, 0], color);
    instance(triangle, mat.paint, [x, height, z - depth / 2], [1, 1, 1], [0, Math.PI, 0], color);
    for (let a = -width / 2 + 0.7; a < width / 2; a += 1.25) {
      for (const side of [-1, 1]) box(mat.steel, [x + a, height / 2, z + side * (depth / 2 + 0.035)], [0.06, height, 0.08]);
    }
    for (let a = -width / 2 + 4; a < width / 2 - 1; a += 7.5) {
      box(mat.dark, [x + a, 2.4, z + depth / 2 + 0.06], [5.2, 4.8, 0.07]);
      box(mat.glass, [x + a, height - 1.65, z + depth / 2 + 0.08], [4.8, 1.35, 0.06]);
      for (let i = -2; i <= 2; i++) box(mat.zinc, [x + a + i * 0.87, height - 1.65, z + depth / 2 + 0.13], [0.06, 1.4, 0.06]);
    }
    for (let a = -width / 2 + 5; a < width / 2; a += 11) {
      const roofY = height + rise * (1 - Math.abs(a) / (width / 2));
      box(mat.zinc, [x + a, roofY + 0.48, z], [1.25, 1.3, 1.25]);
      box(mat.dark, [x + a, roofY + 1.2, z], [1.75, 0.14, 1.75]);
    }
  }
  warehouse(-35, -85, 47, 21, 10, '#74746a');
  warehouse(34, -94, 51, 26, 12, '#777469');
  warehouse(-93, -5, 24, 68, 10, '#666b64');
  warehouse(99, -28, 26, 55, 12, '#777d70');
  banner(1, -35, 9.5, -74.42, 21, 3.1);

  // Pipework and stacks behind the grandstand: warm rust against smoky beige.
  const stackGeometry = new THREE.CylinderGeometry(1, 1.23, 1, 16);
  for (const [x, z, height, radius] of [[-66, -88, 30, 1.5], [-59, -89, 24, 1.15],
    [57, -106, 33, 1.7], [66, -109, 27, 1.35]]) {
    instance(stackGeometry, mat.rust, [x, height / 2, z], [radius, height, radius]);
    for (const fraction of [0.67, 0.82, 0.94]) cylinder(mat.concrete, [x, height * fraction, z], radius * 1.11, 1.45);
    cylinder(mat.dark, [x, height + 0.08, z], radius * 1.10, 0.26);
    cylinder(mat.dark, [x, 1.1, z], radius * 1.75, 2.2);
    for (let y = 2; y < height - 1; y += 0.6) box(mat.steel, [x + radius * 1.16, y, z], [0.6, 0.065, 0.085]);
  }
  for (const x of [-68, -62]) {
    cylinder(mat.zinc, [x, 3.7, -66], 3.5, 7.4);
    cylinder(mat.dark, [x, 7.48, -66], 3.6, 0.15);
    beam(mat.rust, [x, 5, -66], [x, 5, -80], 0.48);
  }

  function crane(x, z, height, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (a, y, b = 0) => [x + a * cos + b * sin, y, z - a * sin + b * cos];
    box(mat.concrete, at(0, 0.65), [5, 1.3, 5]);
    for (const a of [-0.8, 0.8]) for (const b of [-0.8, 0.8]) {
      beam(mat.yellow, at(a, 1, b), at(a, height, b), 0.22);
    }
    for (let y = 1; y < height - 2; y += 2.5) {
      for (const b of [-0.8, 0.8]) {
        beam(mat.yellow, at(-0.8, y, b), at(0.8, y + 2.5, b), 0.12);
        beam(mat.yellow, at(0.8, y, b), at(-0.8, y + 2.5, b), 0.12);
      }
    }
    for (const b of [-0.7, 0.7]) {
      beam(mat.yellow, at(-9, height, b), at(27, height, b), 0.2);
      beam(mat.yellow, at(-9, height + 1.5, b), at(27, height + 1.5, b), 0.16);
      for (let a = -9; a < 27; a += 3) beam(mat.yellow, at(a, height, b), at(a + 3, height + 1.5, b), 0.11);
    }
    beam(mat.steel, at(0, height + 5), at(24, height + 1.5), 0.065);
    beam(mat.steel, at(0, height + 5), at(-9, height + 1.5), 0.065);
    beam(mat.yellow, at(0, height), at(0, height + 5), 0.2);
    box(mat.concrete, at(-7, height - 0.75), [3.8, 2, 2.5], angle);
    box(mat.yellow, at(2.1, height - 0.9), [2.7, 2.3, 2.5], angle);
    box(mat.glass, at(2.1, height - 0.4, 1.27), [2.25, 1.05, 0.06], angle);
    beam(mat.dark, at(19, height), at(19, height - 13), 0.055);
    cylinder(mat.dark, at(19, height - 13.2), 0.3, 0.6);
  }
  crane(-76, -61, 26, -0.32);
  crane(78, -73, 30, 0.48);

  const wires = [];
  function wire(a, b, sag) {
    let previous = a;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const next = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag,
        a[2] + (b[2] - a[2]) * t];
      wires.push(...previous, ...next);
      previous = next;
    }
  }
  for (const x of [-109, 113]) {
    for (const z of [-82, -22, 43]) {
      for (const side of [-1, 1]) beam(mat.steel, [x + side * 2, 0, z], [x + side * 0.6, 22, z], 0.18);
      for (let y = 2; y < 21; y += 3) {
        const span = 2 - y / 22 * 1.4;
        beam(mat.steel, [x - span, y, z], [x + span - 0.19, y + 3, z], 0.095);
      }
      for (const y of [18, 21]) box(mat.steel, [x, y, z], [7, 0.17, 0.35]);
      for (const dx of [-3, 3]) {
        cylinder(mat.concrete, [x + dx, 20.6, z], 0.16, 0.6);
        if (z !== 43) wire([x + dx, 20.3, z], [x + dx, 20.3, z === -82 ? -22 : 43], 3.5);
      }
    }
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const powerLines = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: '#353c36' }));
  powerLines.name = 'Sagging utility cables';
  root.add(powerLines);

  const smokeMap = canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 3, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(188,179,154,.52)');
    gradient.addColorStop(0.35, 'rgba(173,166,147,.30)');
    gradient.addColorStop(0.7, 'rgba(160,155,142,.12)');
    gradient.addColorStop(1, 'rgba(160,155,142,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  const smokeMaterial = new THREE.MeshBasicMaterial({ map: smokeMap, transparent: true,
    opacity: 0.52, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, color: '#b6ad96' });
  for (const [x, z, height] of [[-66, -88, 30], [57, -106, 33]]) {
    for (let i = 0; i < 11; i++) {
      const size = 3.3 + i * 1.25;
      instance(unitPlane, smokeMaterial, [x + i * 1.7, height + 1.0 + i * 1.3, z + i * 0.45],
        [size, size * 0.8, 1], [0, 0.45, between(-0.6, 0.6)], undefined, false);
    }
  }

  let instanceCount = 0;
  for (const { geometry, material, items, shadow } of batches.values()) {
    const batch = new THREE.InstancedMesh(geometry, material, items.length);
    batch.name = `Arena batch / ${material === mat.crowd ? 'spectators' : material.type} / ${geometry.type}`;
    const hasColors = items.some((item) => item.color !== undefined);
    const color = new THREE.Color();
    items.forEach((item, index) => {
      batch.setMatrixAt(index, item.matrix);
      if (hasColors) batch.setColorAt(index, color.set(item.color ?? '#ffffff'));
    });
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.castShadow = shadow;
    batch.receiveShadow = material !== smokeMaterial && material !== mat.lamp;
    batch.computeBoundingSphere();
    root.add(batch);
    instanceCount += items.length;
  }
  // Useful to the integration owner; these are recommendations, not global mutations.
  root.userData.arena = {
    halfExtents: { x: 43, z: 32 },
    overviewPosition: [50, 42, 61],
    overviewTarget: [0, 0, 0],
    suggestedFogColor: '#b9ab91',
    suggestedFogNear: 85,
    suggestedFogFar: 235,
    instanceCount,
    renderableCount: root.children.length,
    proceduralTextureCount: textures.length,
  };
  return root;
}
