/**
 * Environment: sky, lighting, fog, trees, mountains, stands, crowds,
 * balloons, clouds, finish confetti. All procedural, imports `three` only.
 *
 * API for main / HUD:
 *   buildEnvironment(scene, opts?) -> { group, update(dt, elapsed), confettiBurst(), setConfettiActive(bool) }
 *     opts: { centerSamples?: Vector3[]  (XZ samples to keep props off road),
 *             finishPosition?: Vector3, finishRotationY?: number }
 *   updateEnvironment(dt, elapsed)  // delegates to active env (optional helper)
 *   ENVIRONMENT_INFO: { drawCalls, skyRadius, fogNear, fogFar }
 */
import * as THREE from 'three';

export const ENVIRONMENT_INFO = {
  skyRadius: 800,
  fogNear: 180,
  fogFar: 700,
  treeCount: 64,
  crowdCount: 320,
  balloonCount: 10,
  confettiCount: 400,
};

let _active = null;

/** Delegate helper if main loop prefers a bare function import. */
export function updateEnvironment(dt, elapsed) {
  if (_active) _active.update(dt, elapsed);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6fc4) },
      mid: { value: new THREE.Color(0x7db8e8) },
      bot: { value: new THREE.Color(0xd8ecf7) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.12
          ? mix(mid, top, smoothstep(0.12, 0.75, h))
          : mix(bot, mid, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function stripedRoofTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#d23b2e' : '#f5f5f5';
    ctx.fillRect(i * 32, 0, 32, 64);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ centerSamples?: THREE.Vector3[], finishPosition?: THREE.Vector3, finishRotationY?: number }} opts
 */
export function buildEnvironment(scene, opts = {}) {
  const group = new THREE.Group();
  group.name = 'environment';
  const rand = mulberry(1337);

  // --- Fog + background -----------------------------------------------------
  scene.fog = new THREE.Fog(0xcfe0ef, ENVIRONMENT_INFO.fogNear, ENVIRONMENT_INFO.fogFar);
  scene.background = new THREE.Color(0x9fc8e8);

  // --- Lights ---------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x4d7c3c, 0.85);
  hemi.name = 'hemi';
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.7);
  sun.position.set(90, 130, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0004;
  sun.target.position.set(0, 0, 0);
  group.add(sun, sun.target);

  // --- Sky dome + sun disc ---------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(ENVIRONMENT_INFO.skyRadius, 24, 16),
    skyMaterial(),
  );
  sky.name = 'sky';
  group.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(28, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }),
  );
  sunDisc.position.set(320, 300, 180);
  sunDisc.lookAt(0, 0, 0);
  group.add(sunDisc);

  // --- Clouds (6 flattened blobs, merged into 1 geometry each? keep 6) ------
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    transparent: true,
    opacity: 0.92,
  });
  const cloudGeo = new THREE.SphereGeometry(1, 12, 10);
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(-260 + i * 95 + rand() * 30, 120 + rand() * 40, -200 + rand() * 320);
    m.scale.set(26 + rand() * 14, 7 + rand() * 3, 13 + rand() * 6);
    group.add(m);
    clouds.push(m);
  }

  // --- Mountains (instanced cones on the horizon) ---------------------------
  const mountGeo = new THREE.ConeGeometry(60, 110, 5);
  const mountMat = new THREE.MeshStandardMaterial({
    color: 0x6f7f96,
    roughness: 1,
    flatShading: true,
  });
  const mountains = new THREE.InstancedMesh(mountGeo, mountMat, 9);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r = 380 + rand() * 60;
    dummy.position.set(Math.cos(a) * r, 30 + rand() * 15, Math.sin(a) * r);
    dummy.rotation.y = rand() * Math.PI;
    const s = 0.8 + rand() * 0.9;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mountains.setMatrixAt(i, dummy.matrix);
  }
  mountains.instanceMatrix.needsUpdate = true;
  group.add(mountains);

  // --- Trees (instanced trunks + canopies), kept off the road ---------------
  const samples = opts.centerSamples || [];
  const clearOfRoad = (x, z, margin) => {
    for (let i = 0; i < samples.length; i += 4) {
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      if (dx * dx + dz * dz < margin * margin) return false;
    }
    return true;
  };
  const treePos = [];
  let guard = 0;
  while (treePos.length < ENVIRONMENT_INFO.treeCount && guard++ < 3000) {
    const x = (rand() * 2 - 1) * 240;
    const z = (rand() * 2 - 1) * 240;
    if (Math.hypot(x, z) < 40) continue;
    if (!clearOfRoad(x, z, 14)) continue;
    treePos.push([x, z, 0.7 + rand() * 0.7]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(2.6, 6, 7);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3e8e33,
    roughness: 1,
    flatShading: true,
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePos.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treePos.length);
  trunks.castShadow = leaves.castShadow = true;
  treePos.forEach(([x, z, s], i) => {
    dummy.position.set(x, 1.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, (3 + 3) * s, z);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
  group.add(trunks, leaves);

  // --- Grandstands + crowd near the start line ------------------------------
  const finish = opts.finishPosition || new THREE.Vector3(0, 0, -95);
  const finishRot = opts.finishRotationY || 0;
  const standGroup = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b93a1, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({
    map: stripedRoofTexture(),
    roughness: 0.8,
  });
  const sideX = Math.cos(finishRot) || 1;
  for (let s = 0; s < 3; s++) {
    const stand = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(26, 6, 10), baseMat);
    base.position.y = 3;
    base.castShadow = base.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(28, 0.6, 12), roofMat);
    roof.position.y = 10.2;
    roof.castShadow = true;
    stand.add(base, roof);
    // Legs.
    const legGeo = new THREE.BoxGeometry(0.8, 10, 0.8);
    for (const [lx, lz] of [[-13, -5], [13, -5], [-13, 5], [13, 5]]) {
      const leg = new THREE.Mesh(legGeo, baseMat);
      leg.position.set(lx, 5, lz);
      stand.add(leg);
    }
    const along = (s - 1) * 34;
    stand.position.set(
      finish.x + sideX * 22 + Math.sin(finishRot) * along,
      0,
      finish.z + (s - 1) * 10 + 6,
    );
    stand.position.x += along * 0.4;
    stand.rotation.y = -Math.PI / 2 + finishRot;
    standGroup.add(stand);
  }
  group.add(standGroup);

  // Crowd: one InstancedMesh of small capsules/boxes with random shirt colors.
  const crowdGeo = new THREE.BoxGeometry(0.7, 1.1, 0.5);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const crowd = new THREE.InstancedMesh(
    crowdGeo,
    crowdMat,
    ENVIRONMENT_INFO.crowdCount,
  );
  const palette = [0xd23b2e, 0xffcf3f, 0x2f6fc4, 0xf5f5f5, 0x33aa66, 0xff7ab8];
  const cc = new THREE.Color();
  for (let i = 0; i < ENVIRONMENT_INFO.crowdCount; i++) {
    const standIdx = i % 3;
    const row = Math.floor((i / 3) % 4);
    const col = Math.floor(i / 12) % 14;
    dummy.position.set(
      standGroup.children[standIdx].position.x + (col - 7) * 1.6,
      6.6 + row * 0.9,
      standGroup.children[standIdx].position.z + (row - 1.5) * 1.4,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    cc.setHex(palette[i % palette.length]);
    crowd.setColorAt(i, cc);
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);

  // --- Balloons (instanced spheres, bob in update) ---------------------------
  const balloonGeo = new THREE.SphereGeometry(1.6, 12, 10);
  const balloonMat = new THREE.MeshStandardMaterial({ roughness: 0.35 });
  const balloons = new THREE.InstancedMesh(
    balloonGeo,
    balloonMat,
    ENVIRONMENT_INFO.balloonCount,
  );
  const balloonBase = [];
  for (let i = 0; i < ENVIRONMENT_INFO.balloonCount; i++) {
    const a = (i / ENVIRONMENT_INFO.balloonCount) * Math.PI * 2;
    const bx = Math.cos(a) * (120 + (i % 3) * 25);
    const bz = Math.sin(a) * (110 + (i % 4) * 20);
    const by = 26 + (i % 5) * 4;
    balloonBase.push([bx, by, bz]);
    dummy.position.set(bx, by, bz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1.25, 1);
    dummy.updateMatrix();
    balloons.setMatrixAt(i, dummy.matrix);
    cc.setHex(palette[(i * 2 + 1) % palette.length]);
    balloons.setColorAt(i, cc);
  }
  balloons.instanceMatrix.needsUpdate = true;
  if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
  group.add(balloons);

  // --- Finish confetti (Points, animated in update) --------------------------
  const confettiCount = ENVIRONMENT_INFO.confettiCount;
  const cPos = new Float32Array(confettiCount * 3);
  const cCol = new Float32Array(confettiCount * 3);
  const cVel = new Float32Array(confettiCount * 3);
  for (let i = 0; i < confettiCount; i++) {
    resetConfettiParticle(cPos, cVel, i, finish, true);
    cc.setHex(palette[i % palette.length]);
    cCol[i * 3] = cc.r;
    cCol[i * 3 + 1] = cc.g;
    cCol[i * 3 + 2] = cc.b;
  }
  const confettiGeo = new THREE.BufferGeometry();
  confettiGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  confettiGeo.setAttribute('color', new THREE.BufferAttribute(cCol, 3));
  const confettiMat = new THREE.PointsMaterial({
    size: 0.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: true,
  });
  const confetti = new THREE.Points(confettiGeo, confettiMat);
  confetti.name = 'finish-confetti';
  confetti.position.y = 0;
  group.add(confetti);
  let confettiActive = true;

  function resetConfettiParticle(posArr, velArr, i, origin, randomHeight = false) {
    posArr[i * 3] = origin.x + (Math.random() * 2 - 1) * 10;
    posArr[i * 3 + 1] = randomHeight
      ? 4 + Math.random() * 14
      : 10 + Math.random() * 6;
    posArr[i * 3 + 2] = origin.z + (Math.random() * 2 - 1) * 6;
    velArr[i * 3] = (Math.random() * 2 - 1) * 1.2;
    velArr[i * 3 + 1] = -(1 + Math.random() * 2);
    velArr[i * 3 + 2] = (Math.random() * 2 - 1) * 1.2;
  }

  scene.add(group);

  const api = {
    group,
    setConfettiActive(v) {
      confettiActive = !!v;
      confetti.visible = confettiActive;
    },
    confettiBurst() {
      // Relaunch all particles above the finish line.
      const p = confettiGeo.attributes.position.array;
      for (let i = 0; i < confettiCount; i++)
        resetConfettiParticle(p, cVel, i, finish, false);
      confettiGeo.attributes.position.needsUpdate = true;
      confettiActive = true;
      confetti.visible = true;
    },
    update(dt, elapsed) {
      const step = Math.min(dt, 0.05);
      // Balloons bob + slow drift.
      for (let i = 0; i < balloonBase.length; i++) {
        const [bx, by, bz] = balloonBase[i];
        dummy.position.set(
          bx + Math.sin(elapsed * 0.25 + i * 1.7) * 3,
          by + Math.sin(elapsed * 0.7 + i) * 1.6,
          bz + Math.cos(elapsed * 0.2 + i * 0.9) * 3,
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1.25, 1);
        dummy.updateMatrix();
        balloons.setMatrixAt(i, dummy.matrix);
      }
      balloons.instanceMatrix.needsUpdate = true;
      // Clouds drift.
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x += step * (1.2 + i * 0.2);
        if (clouds[i].position.x > 300) clouds[i].position.x = -300;
      }
      // Confetti falls + recycles while visible.
      if (confettiActive) {
        const p = confettiGeo.attributes.position.array;
        for (let i = 0; i < confettiCount; i++) {
          p[i * 3] += (cVel[i * 3] + Math.sin(elapsed * 3 + i) * 0.6) * step;
          p[i * 3 + 1] += cVel[i * 3 + 1] * step;
          p[i * 3 + 2] += cVel[i * 3 + 2] * step;
          if (p[i * 3 + 1] < 0.2) resetConfettiParticle(p, cVel, i, finish, false);
        }
        confettiGeo.attributes.position.needsUpdate = true;
      }
      // Subtle crowd bounce (whole mesh, cheap).
      crowd.position.y = Math.sin(elapsed * 6) * 0.06;
    },
  };
  _active = api;
  return api;
}
