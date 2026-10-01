import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

function plumeTexture(fire) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Irregular, layered puffs keep blasts from looking like a solid polygonal ball.
  for (let i = 0; i < 32; i++) {
    const x = 128 + rand(-45, 45), y = 128 + rand(-45, 45), radius = rand(35, 75);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, fire ? 'rgba(255,250,203,.8)' : 'rgba(192,182,166,.55)');
    gradient.addColorStop(.3, fire ? 'rgba(255,172,51,.6)' : 'rgba(139,132,124,.4)');
    gradient.addColorStop(.65, fire ? 'rgba(236,54,8,.28)' : 'rgba(108,102,95,.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class DestructionEffects {
  constructor(scene) {
    this.scene = scene;
    this.fireTexture = plumeTexture(true);
    this.smokeTexture = plumeTexture(false);
    this.effects = [];
    this.wrecks = [];
    this.blasts = 0;
    // Keep the light count fixed so each explosion doesn't recompile all car shaders.
    this.flashLight = new THREE.PointLight('#ff922e', 0, 22, 2);
    this.scene.add(this.flashLight);
    this.lightLife = 0;
  }

  puff(position, { fire = false, size = 2, life = 2, velocity = new THREE.Vector3(0, 1, 0), growth = 1, opacity = .8, delay = 0 } = {}) {
    if (this.effects.length >= 420) return;
    const material = new THREE.SpriteMaterial({
      map: fire ? this.fireTexture : this.smokeTexture,
      color: fire ? '#ffb451' : '#292824',
      blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
      transparent: true, opacity, depthWrite: false, toneMapped: !fire,
    });
    material.rotation = rand(0, Math.PI * 2);
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position); sprite.scale.setScalar(size); sprite.visible = delay === 0;
    this.scene.add(sprite);
    this.effects.push({ mesh: sprite, life, maxLife: life, velocity, growth, opacity, delay, sprite: true, fire });
  }

  blast(position, scale = 1) {
    // Reserve room for the next blast even during a crowded, smoky pileup.
    while (this.effects.length > 356) {
      let index = this.effects.findIndex(effect => effect.sprite && !effect.fire);
      if (index < 0) index = this.effects.findIndex(effect => !effect.bounce);
      if (index < 0) break;
      this.remove(this.effects[index]); this.effects.splice(index, 1);
    }
    this.blasts++;
    this.flashLight.position.copy(position); this.flashLight.position.y += 1;
    this.lightLife = .85; this.flashLight.intensity = 90 * scale;
    // The initial burst is already car-sized on its first frame, not a tiny flash.
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2;
      const center = position.clone().add(new THREE.Vector3(Math.cos(angle) * .5, rand(-.1, .9), Math.sin(angle) * .5));
      this.puff(center, { fire: true, size: rand(2.8, 4.2) * scale, life: rand(.85, 1.25), growth: 3.5 * scale, velocity: new THREE.Vector3(Math.cos(angle) * 2.4, rand(.8, 2), Math.sin(angle) * 2.4), opacity: .85 });
    }
    for (let i = 0; i < 12; i++) {
      const angle = rand(0, Math.PI * 2);
      const center = position.clone().add(new THREE.Vector3(Math.cos(angle) * .8, rand(.3, 1), Math.sin(angle) * .8));
      this.puff(center, { size: rand(2, 3.7) * scale, life: rand(3.5, 5.5), growth: 1.1, velocity: new THREE.Vector3(Math.cos(angle) * 1.2, rand(1.1, 2.4), Math.sin(angle) * 1.2), opacity: .85, delay: rand(.1, .3) });
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffbb68', transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(position.x, .08, position.z); ring.scale.setScalar(1.6);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, life: .85, maxLife: .85, velocity: new THREE.Vector3(), growth: 12 * scale, opacity: .85, delay: 0 });
    for (let i = 0; i < 22; i++) {
      const ember = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, rand(.16, .4)), new THREE.MeshBasicMaterial({ color: '#ffcd6c', toneMapped: false }));
      ember.position.copy(position); this.scene.add(ember);
      this.effects.push({ mesh: ember, life: rand(.65, 1.4), maxLife: 1.4, velocity: new THREE.Vector3(rand(-10, 10), rand(3, 10), rand(-10, 10)).multiplyScalar(scale), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), gravity: 10, delay: 0 });
    }
  }

  destroy(car) {
    const d = car.userData, center = car.position.clone().add(new THREE.Vector3(0, 1, 0));
    this.blast(center, 1.45);
    d.hood.visible = false; d.front.visible = false; d.wheels[0].visible = false;
    d.muzzleFlash.visible = false;
    d.body.rotation.z = .16; d.body.rotation.x = -.07;
    this.wrecks.push({ car, life: 30, fireTimer: 0, smokeTimer: 0 });
    for (let i = 0; i < 12; i++) {
      let fragment;
      if (i === 0) {
        fragment = new THREE.Mesh(new THREE.BoxGeometry(1.8, .1, 1.45), new THREE.MeshStandardMaterial({ color: d.config.color, metalness: .55, roughness: .7 }));
      } else if (i === 1) {
        fragment = new THREE.Mesh(new THREE.CylinderGeometry(.47, .47, .29, 16), new THREE.MeshStandardMaterial({ color: '#171a15', roughness: 1 }));
      } else {
        fragment = new THREE.Mesh(new THREE.BoxGeometry(rand(.15, .7), rand(.03, .12), rand(.2, .8)), new THREE.MeshStandardMaterial({ color: i % 3 ? '#3b3c33' : d.config.color, metalness: .6, roughness: .8 }));
      }
      fragment.castShadow = true;
      fragment.position.copy(center).add(new THREE.Vector3(rand(-.8, .8), rand(0, .8), rand(-1, 1)));
      fragment.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); this.scene.add(fragment);
      this.effects.push({ mesh: fragment, life: rand(5, 8), maxLife: 8, velocity: new THREE.Vector3(rand(-7, 7) + d.velocity.x * .2, rand(5, 10), rand(-7, 7) + d.velocity.y * .2), spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), gravity: 13, bounce: true, delay: 0 });
    }
  }

  remove(effect) {
    this.scene.remove(effect.mesh);
    const materials = new Set();
    effect.mesh.traverse(mesh => { if (mesh.isMesh || mesh.isSprite) { if (mesh.isMesh) mesh.geometry.dispose(); materials.add(mesh.material); } });
    materials.forEach(material => material.dispose());
  }

  clear() {
    this.effects.forEach(effect => this.remove(effect)); this.effects.length = 0; this.wrecks.length = 0;
    this.lightLife = 0; this.flashLight.intensity = 0; this.blasts = 0;
  }

  update(dt) {
    this.lightLife = Math.max(0, this.lightLife - dt);
    this.flashLight.intensity *= Math.exp(-dt * 5);
    if (this.lightLife === 0) this.flashLight.intensity = 0;
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const wreck = this.wrecks[i]; wreck.life -= dt; wreck.fireTimer -= dt; wreck.smokeTimer -= dt;
      if (wreck.life <= 0) { this.wrecks.splice(i, 1); continue; }
      if (wreck.fireTimer <= 0) {
        const position = wreck.car.position.clone().add(new THREE.Vector3(rand(-.6, .6), 1.1, rand(-.7, 1.2)));
        this.puff(position, { fire: true, size: rand(1.2, 2.1), life: .85, growth: 1.4, opacity: .7, velocity: new THREE.Vector3(0, 1.4, 0) });
        wreck.fireTimer = .16;
      }
      if (wreck.smokeTimer <= 0) {
        const position = wreck.car.position.clone().add(new THREE.Vector3(rand(-.4, .4), 1.6, rand(-.4, .4)));
        this.puff(position, { size: rand(1.8, 2.5), life: 5, growth: .95, opacity: .7, velocity: new THREE.Vector3(.25, 1.6, .1) });
        wreck.smokeTimer = .32;
      }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      if (effect.delay > 0) { effect.delay -= dt; effect.mesh.visible = effect.delay <= 0; continue; }
      effect.life -= dt;
      if (effect.life <= 0) { this.remove(effect); this.effects.splice(i, 1); continue; }
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      if (effect.gravity) effect.velocity.y -= effect.gravity * dt;
      if (effect.spin) { effect.mesh.rotation.x += effect.spin.x * dt; effect.mesh.rotation.y += effect.spin.y * dt; effect.mesh.rotation.z += effect.spin.z * dt; }
      if (effect.bounce && effect.mesh.position.y < .2) {
        effect.mesh.position.y = .2; effect.velocity.y = Math.abs(effect.velocity.y) * .28;
        effect.velocity.x *= .65; effect.velocity.z *= .65; effect.spin.multiplyScalar(.6);
      }
      if (effect.growth) effect.mesh.scale.addScalar(effect.growth * dt);
      if (effect.opacity !== undefined) effect.mesh.material.opacity = effect.opacity * Math.min(1, effect.life / (effect.maxLife * .55));
      if (effect.fire) { effect.mesh.material.color.set(effect.life / effect.maxLife > .45 ? '#ffb451' : '#ff5422'); }
    }
  }
}
