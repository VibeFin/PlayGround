// Geometry is in metres, with the nose on +Z. Only the child chassis is animated;
// the caller owns the returned root's position and yaw. No DOM work at import time.
const PALETTE = ['#d6fb53', '#df593e', '#63aeb2', '#e7d4aa', '#9476b1', '#db933d', '#648675', '#bc597a', '#7c9bc3', '#c9c7b7'];
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const mix = (a, b, t) => a + (b - a) * t;
const resourceCache = new WeakMap();
const RIVAL_PROFILES = [
  {name:'fastback',roofHeight:.78,roofLength:1.14,roofShift:-.13,roofWidth:.91,deck:-.025,shoulder:-.018},
  {name:'notchback',roofHeight:1.12,roofLength:.84,roofShift:.1,roofWidth:.98,deck:.025,shoulder:.022},
  {name:'long-roof',roofHeight:.97,roofLength:1.28,roofShift:-.06,roofWidth:1,deck:-.012,shoulder:.012},
  {name:'chopped-coupe',roofHeight:.84,roofLength:.87,roofShift:.025,roofWidth:.94,deck:.048,shoulder:-.01},
];

// One smooth rest-shape transform keeps cage, glazing, fasteners and decals on
// their panels. Wheel mounts/arches below the belt line retain their dimensions.
function proportionPoint(x,y,z,profile,out) {
  if(profile) {
    const cabin=clamp((y-1.12)/.48),upper=clamp((y-.99)/.15);
    const hood=clamp((z-.65)/.45)*clamp((y-.94)/.16);
    out[0]=x*mix(1,profile.roofWidth,cabin);
    out[1]=y+Math.max(0,y-1.12)*(profile.roofHeight-1)
      +profile.shoulder*upper+profile.deck*hood;
    out[2]=z+cabin*((z+.18)*(profile.roofLength-1)+profile.roofShift);
  } else {out[0]=x;out[1]=y;out[2]=z;}
  return out;
}

function randomGenerator(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function idSeed(id) {
  const text = String(id ?? 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

// Small non-indexed geometry batcher: all the rivets, bars, tread blocks, etc.
// become material batches, rather than hundreds of Object3D/draw calls.
class ShapeBatch {
  constructor(THREE) {
    this.THREE = THREE;
    this.positions = [];
    this.uvs = [];
    this.colors = [];
  }

  triangle(a, b, c, shade = 1, uv = [[0, 0], [1, 0], [1, 1]]) {
    this.positions.push(...a, ...b, ...c);
    this.uvs.push(...uv[0], ...uv[1], ...uv[2]);
    for (let i = 0; i < 3; i++) this.colors.push(shade, shade, shade);
  }

  quad(a, b, c, d, shade = 1, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    this.triangle(a, b, c, shade, [uv[0], uv[1], uv[2]]);
    this.triangle(a, c, d, shade, [uv[0], uv[2], uv[3]]);
  }

  box(center, size, shade = 1) {
    const [x, y, z] = center;
    const [w, h, d] = size.map(n => n / 2);
    const p = [[x-w,y-h,z-d], [x+w,y-h,z-d], [x+w,y+h,z-d], [x-w,y+h,z-d],
      [x-w,y-h,z+d], [x+w,y-h,z+d], [x+w,y+h,z+d], [x-w,y+h,z+d]];
    for (const face of [[0,3,2,1], [4,5,6,7], [0,4,7,3], [5,1,2,6], [3,7,6,2], [0,1,5,4]]) {
      this.quad(...face.map(i => p[i]), shade);
    }
  }

  rod(a, b, radius, sides = 6, shade = 1, endRadius = radius) {
    const T = this.THREE;
    const axis = new T.Vector3(...b).sub(new T.Vector3(...a)).normalize();
    const ref = Math.abs(axis.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
    const u = new T.Vector3().crossVectors(axis, ref).normalize();
    const v = new T.Vector3().crossVectors(axis, u);
    const point = (base, r, angle) => [base[0] + r*(u.x*Math.cos(angle)+v.x*Math.sin(angle)),
      base[1] + r*(u.y*Math.cos(angle)+v.y*Math.sin(angle)), base[2] + r*(u.z*Math.cos(angle)+v.z*Math.sin(angle))];
    for (let i = 0; i < sides; i++) {
      const t = i / sides * Math.PI * 2, t1 = (i+1) / sides * Math.PI * 2;
      const p = point(a, radius, t), q = point(a, radius, t1);
      const r = point(b, endRadius, t1), s = point(b, endRadius, t);
      this.quad(p, q, r, s, shade);
      this.triangle(a, q, p, shade * 0.8);
      this.triangle(b, s, r, shade);
    }
  }

  // Revolved cross-section about X; useful for tires, dished rims and lamp holes.
  ring(profile, segments = 20, center = [0, 0, 0], shade = 1) {
    const p = (pair, a) => [center[0]+pair[0], center[1]+Math.cos(a)*pair[1], center[2]+Math.sin(a)*pair[1]];
    for (let j = 0; j < profile.length - 1; j++) {
      for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2, b = (i+1) / segments * Math.PI * 2;
        this.quad(p(profile[j], a), p(profile[j], b), p(profile[j+1], b), p(profile[j+1], a), shade);
      }
    }
  }

  geometry() {
    const T = this.THREE, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function canvasTexture(THREE, width, height, draw) {
  let canvas;
  if (typeof document !== 'undefined' && document.createElement) canvas = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch { return null; }
  if (!ctx) return null;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function sharedResources(THREE) {
  if (resourceCache.has(THREE)) return resourceCache.get(THREE);
  const paint = canvasTexture(THREE, 512, 512, (ctx, w, h) => {
    const rnd = randomGenerator(1947);
    ctx.fillStyle = '#eeeade';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const x = rnd()*w, y = rnd()*h, s = 1+rnd()*5;
      ctx.fillStyle = `rgba(49,36,23,${0.018+rnd()*0.055})`;
      ctx.fillRect(x, y, s*2.5, s);
    }
    for (let i = 0; i < 115; i++) {
      const x = rnd()*w, y = rnd()*h, length = 3+rnd()*65;
      ctx.lineWidth = 0.5+rnd()*2;
      ctx.strokeStyle = i%3 ? 'rgba(57,46,32,.27)' : 'rgba(255,255,239,.5)';
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+length,y+rnd()*7-3); ctx.stroke();
      if (i%5 === 0) {
        ctx.fillStyle = 'rgba(91,49,27,.4)';
        ctx.fillRect(x, y, length*0.3, 2+rnd()*3);
      }
    }
    const grime = ctx.createLinearGradient(0,0,0,h);
    grime.addColorStop(0,'rgba(42,28,17,.25)');
    grime.addColorStop(.24,'rgba(42,28,17,0)');
    grime.addColorStop(.77,'rgba(42,28,17,0)');
    grime.addColorStop(1,'rgba(42,28,17,.28)');
    ctx.fillStyle=grime; ctx.fillRect(0,0,w,h);
  });
  if (paint) {
    paint.wrapS = paint.wrapT = THREE.RepeatWrapping;
  }

  const tire = new ShapeBatch(THREE);
  tire.ring([[-.155,.235],[-.177,.31],[-.15,.405],[-.10,.435],[.10,.435],[.15,.405],[.177,.31],[.155,.235]], 24);
  // Chevrons are real silhouette geometry, batched into the tire itself.
  for (let i = 0; i < 32; i++) {
    const a = i/32*Math.PI*2;
    for (const side of [-1, 1]) {
      const b = a+side*.05;
      tire.rod([side*.018,Math.cos(a)*.437,Math.sin(a)*.437],
        [side*.118,Math.cos(b)*.426,Math.sin(b)*.426], .017, 4, .75);
    }
  }
  const rim = new ShapeBatch(THREE);
  for (const side of [-1,1]) {
    rim.ring([[side*.156,.238],[side*.177,.231],[side*.181,.204],[side*.126,.162],[side*.13,.072]], 20, [0,0,0], .82);
    rim.rod([side*.108,0,0],[side*.183,0,0],.068,10,.65);
    for (let i=0;i<5;i++) {
      const a=i/5*Math.PI*2;
      rim.rod([side*.135,Math.cos(a)*.055,Math.sin(a)*.055],
        [side*.145,Math.cos(a)*.195,Math.sin(a)*.195],.023,5,.74);
      rim.rod([side*.181,Math.cos(a)*.046,Math.sin(a)*.046],
        [side*.192,Math.cos(a)*.046,Math.sin(a)*.046],.009,5,1);
    }
    // Raised sidewall lettering-like witness marks and a bright valve stem.
    rim.rod([side*.174,.183,.045],[side*.189,.183,.045],.008,5,.6);
  }
  // A feathered, rounded-rectangle contact patch: vertex alpha avoids a texture
  // lookup and works even without a canvas or a renderer shadow map.
  const shadowPositions=[0,0,0],shadowColors=[0,0,0,.64],shadowIndices=[];
  const segments=32,rings=[[.45,.62],[.78,.3],[1,0]];
  for(const [radius,alpha] of rings) {
    for(let i=0;i<segments;i++) {
      const angle=i/segments*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
      shadowPositions.push(Math.sign(c)*Math.sqrt(Math.abs(c))*1.12*radius,0,
        Math.sign(s)*Math.sqrt(Math.abs(s))*2.22*radius);
      shadowColors.push(0,0,0,alpha);
    }
  }
  for(let i=0;i<segments;i++) {
    const next=(i+1)%segments;
    shadowIndices.push(0,1+next,1+i);
    for(let ring=0;ring<rings.length-1;ring++) {
      const a=1+ring*segments+i,b=1+ring*segments+next;
      const c=b+segments,d=a+segments;
      shadowIndices.push(a,b,d,b,c,d);
    }
  }
  const contactGeometry=new THREE.BufferGeometry();
  contactGeometry.setAttribute('position',new THREE.Float32BufferAttribute(shadowPositions,3));
  contactGeometry.setAttribute('color',new THREE.Float32BufferAttribute(shadowColors,4));
  contactGeometry.setIndex(shadowIndices);
  contactGeometry.computeBoundingSphere();
  const contactMaterial=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,
    depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const lowTire=new ShapeBatch(THREE),lowRim=new ShapeBatch(THREE);
  lowTire.ring([[-.155,.235],[-.17,.33],[-.1,.435],[.1,.435],[.17,.33],[.155,.235]],12);
  for(const side of [-1,1]) {
    lowRim.ring([[side*.156,.238],[side*.18,.218],[side*.13,.09]],10);
    for(let i=0;i<5;i++) {
      const a=i/5*Math.PI*2;
      lowRim.rod([side*.14,0,0],[side*.14,Math.cos(a)*.19,Math.sin(a)*.19],.026,3);
    }
  }
  const resources = { paint, tire: tire.geometry(), rim: rim.geometry(),lowTire:lowTire.geometry(),lowRim:lowRim.geometry(),contactGeometry,contactMaterial };
  resourceCache.set(THREE, resources);
  return resources;
}

function racingTexture(THREE, id, isPlayer) {
  const numeric = typeof id === 'number' && Number.isFinite(id) ? Math.abs(Math.trunc(id)) : idSeed(id)%99;
  const number = isPlayer ? '07' : String((numeric*13+11)%100).padStart(2,'0');
  return canvasTexture(THREE, 1024, 512, (ctx,w,h) => {
    const rnd = randomGenerator(idSeed(id));
    // Uneven dark sign-painter's number field; the paint around it stays visible.
    ctx.fillStyle = '#20231e';
    ctx.beginPath();ctx.moveTo(206,36);ctx.lineTo(794,23);ctx.lineTo(760,465);ctx.lineTo(179,476);ctx.closePath();ctx.fill();
    ctx.save();ctx.translate(502,257);ctx.transform(1,0,-.12,1,0,0);
    ctx.font='900 410px Impact, "Arial Black", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineWidth=14;ctx.strokeStyle='#777967';ctx.strokeText(number,0,12);
    ctx.fillStyle='#f3edcf';ctx.fillText(number,0,12);ctx.restore();
    const badge = (x,y,width,text,bg,fg) => {
      ctx.fillStyle=bg;ctx.fillRect(x,y,width,66);
      ctx.strokeStyle='#ddd4b9';ctx.lineWidth=3;ctx.strokeRect(x+3,y+3,width-6,60);
      ctx.fillStyle=fg;ctx.font='900 27px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x+width/2,y+35,width-12);
    };
    badge(802,83,211,'REDLINE','#a03928','#ffe8c8');
    badge(802,161,211,'WELD CO.','#dfd9b9','#272c25');
    badge(802,239,211,'OCTANE 98','#282d27','#e2dcbd');
    badge(14,312,159,'NO BRAKES','#d8d0ad','#22291f');
    ctx.fillStyle='#eee4c7';ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.fillText('DERBY DIVISION',493,491);
    ctx.fillStyle='#23271e';
    ctx.beginPath();ctx.moveTo(103,56);ctx.lineTo(27,178);ctx.lineTo(92,169);ctx.lineTo(61,273);ctx.lineTo(164,128);ctx.lineTo(105,140);ctx.closePath();ctx.fill();
    // Scratch through the decal, not simply a pristine sticker on dirty paint.
    ctx.globalCompositeOperation='destination-out';
    for(let i=0;i<170;i++) {ctx.fillStyle=`rgba(0,0,0,${.1+rnd()*.7})`;ctx.fillRect(rnd()*w,rnd()*h,2+rnd()*42,1+rnd()*3);}
  });
}

function bodyWidth(z) {
  return 1.015 - .11*clamp((Math.abs(z)-1.62)/.53);
}

function shoulder(z) {
  return 1.065 - .14*clamp((z-1.55)/.57) - .055*clamp((-z-1.65)/.5);
}

/** Create a ~2.1 x 4.5 metre, +Z-facing 1970s derby coupe (24 mesh batches).
 * Shared immutable tire/rim/contact geometries, contact material and paint texture
 * are cached per THREE. The soft contact patch extends slightly beyond the body.
 * Per-car mutable geometry/materials live below userData.vehicle.chassis.
 */
export function createVehicle(THREE, { color, isPlayer = false, id = 0, lowDetail = false } = {}) {
  const T=THREE, shared=sharedResources(T), seed=idSeed(id), rnd=randomGenerator(seed);
  const profile=isPlayer ? null : RIVAL_PROFILES[seed%RIVAL_PROFILES.length];
  const root=new T.Group(); root.name=`derby-car-${id}`;
  const contactShadow=new T.Mesh(shared.contactGeometry,shared.contactMaterial);
  contactShadow.name='contact-shadow';contactShadow.position.y=.016;
  contactShadow.castShadow=contactShadow.receiveShadow=false;
  root.add(contactShadow); // Grounded under the root, independent of chassis bounce/roll.
  const chassis=new T.Group(); chassis.name='sprung-chassis';root.add(chassis);
  // Include the projecting bumper corners and wheel hubs in the 2.1 x 4.5 envelope.
  chassis.scale.setScalar(.96);
  const paintColor=isPlayer ? '#d6fb53' : (color ?? PALETTE[1+seed%(PALETTE.length-1)]);
  const material=(c,metalness=0,roughness=.8,extra={}) => lowDetail
    ? new T.MeshLambertMaterial({color:c,vertexColors:true,...extra})
    : new T.MeshStandardMaterial({color:c,metalness,roughness,vertexColors:true,...extra});
  const materials={
    paint:material(paintColor,.32,.76,{map:shared.paint,side:T.DoubleSide}),
    hood:material(paintColor,.3,.82,{map:shared.paint,side:T.DoubleSide}),
    steel:material('#92958a',.78,.7,{map:shared.paint}),
    dark:material('#292c28',.55,.84),
    cage:material(isPlayer?'#c9cebb':'#acae9a',.7,.57),
    rust:material('#75503a',.42,.94),
    rubber:material('#1c1b18',.03,.98),
    rim:material(isPlayer?'#bbb8a1':'#b3b0a6',.76,.52,{side:T.DoubleSide}),
    interior:material('#252922',.05,.96),
    glass:material('#111e20',.37,.28,{side:T.DoubleSide}),
    decal:material('#ffffff',.03,.88,{map:racingTexture(T,id,isPlayer),transparent:true,alphaTest:.12,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
    lamp:material('#ab3924',.2,.47,{emissive:'#5c1708',emissiveIntensity:.25}),
    fire:new T.MeshBasicMaterial({color:'#ff6517',transparent:true,opacity:.6,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}),
    ember:material('#421a0b',.3,.7,{emissive:'#ff5a08',emissiveIntensity:0}),
  };
  const batches={};
  for(const key of ['body','hood','hoodSteel','trunk','steel','dark','cage','rust','interior','glass','decal','lamp','engine']) batches[key]=new ShapeBatch(T);
  const {body,hood,hoodSteel,trunk,steel,dark,cage,rust,interior,glass,decal,lamp,engine}=batches;

  // Continuous folded quarter panels. Their lower contour cuts actual wheel
  // openings; the tires aren't stuck onto the sides of a solid rectangular hull.
  const contour=[[-2.12,.43],[-1.99,.4],[-1.94,.59],[-1.83,.83],[-1.63,.98],[-1.4,1.015],[-1.17,.98],[-.97,.83],[-.86,.59],[-.83,.35],
    [-.7,.35],[-.5,.35],[-.3,.35],[-.1,.35],[.1,.35],[.3,.35],[.5,.35],[.67,.35],
    [.79,.35],[.84,.59],[.95,.83],[1.15,.98],[1.38,1.015],[1.61,.98],[1.81,.83],[1.92,.59],[1.97,.41],[2.12,.45]];
  for(const side of [-1,1]) {
    for(let i=0;i<contour.length-1;i++) {
      const [za,ya]=contour[i], [zb,yb]=contour[i+1];
      const a=[side*(bodyWidth(za)-.045),ya,za], b=[side*(bodyWidth(zb)-.045),yb,zb];
      const c=[side*bodyWidth(zb),shoulder(zb),zb], d=[side*bodyWidth(za),shoulder(za),za];
      const levels=[0,.34,.55,.76,1],shade=.9+rnd()*.07;
      for(let row=0;row<levels.length-1;row++) {
        const lo=levels[row],hi=levels[row+1];
        const lerpPoint=(p,q,t)=>p.map((n,k)=>mix(n,q[k],t));
        const points=[lerpPoint(a,d,lo),lerpPoint(b,c,lo),lerpPoint(b,c,hi),lerpPoint(a,d,hi)];
        const uv=points.map(p=>[p[2]*.26+.5,p[1]*.8]);
        if(side===1) {points.reverse();uv.reverse();}
        body.quad(...points,shade,uv);
      }
      // Folded return lip makes the wheel arches read as sheet metal.
      body.quad(a,b,[b[0]-side*.065,b[1]+.018,b[2]],[a[0]-side*.065,a[1]+.018,a[2]],.62);
      if((za>-1.99&&zb<-.83)||(za>.79&&zb<1.98)) {
        steel.rod([a[0]+side*.006,ya+.014,za],[b[0]+side*.006,yb+.014,zb],.009,4,.57);
      }
    }
    // Sill, folded shoulder rail, and oversized welded door seams.
    body.quad([side*.968,.36,-.82],[side*.968,.36,.78],[side*1.003,.52,.78],[side*1.003,.52,-.82],.71);
    body.quad([side*1.015,1.065,-1.64],[side*1.015,1.065,1.55],[side*.89,1.12,1.5],[side*.88,1.12,-1.58],.98);
    for(const z of [-.76,.7]) dark.rod([side*1.011,.49,z],[side*1.022,1.064,z],.009,4);
    dark.rod([side*1.02,.54,-.74],[side*1.02,.54,.69],.007,4);
    steel.box([side*1.026,1.008,-.47],[.023,.032,.13],.64);
    // Two broad scraped door reinforcement strips, with welded end tabs.
    steel.rod([side*1.03,.57,-.69],[side*1.03,.61,.63],.026,4,.56);
    for(const z of [-.66,.62]) rust.box([side*1.035,.591,z],[.018,.068,.087],.8);
    for(let i=0;i<12;i++) {
      const z=-1.99+i*.36;
      steel.rod([side*(bodyWidth(z)+.003),shoulder(z)-.04,z],
        [side*(bodyWidth(z)+.014),shoulder(z)-.04,z],.013,5,.85);
    }
  }

  // Faceted power-bulge hood with a taper in plan and a folded leading edge.
  const hoodRows=[[.83,.895,1.112],[1.08,.90,1.117],[1.64,.91,1.096],[2.08,.835,.955]];
  for(let i=0;i<hoodRows.length-1;i++) {
    const [za,wa,ya]=hoodRows[i], [zb,wb,yb]=hoodRows[i+1];
    for(const side of [-1,1]) {
      hood.quad([0,ya+.047,za],[side*wa*.61,ya+.036,za],[side*wb*.61,yb+.028,zb],[0,yb+.04,zb],1,
        [[.5,za*.5],[.5+side*.3,za*.5],[.5+side*.3,zb*.5],[.5,zb*.5]]);
      hood.quad([side*wa*.61,ya+.036,za],[side*wa,ya,za],[side*wb,yb,zb],[side*wb*.61,yb+.028,zb],.94);
    }
  }
  for(const side of [-1,1]) {
    const fender=[[1.5,.901,1.12],[1.64,.91,1.096],[2.08,.835,.955],[2.12,.827,.935]];
    for(let i=0;i<fender.length-1;i++) {
      const [za,xa,ya]=fender[i],[zb,xb,yb]=fender[i+1];
      body.quad([side*bodyWidth(za),shoulder(za),za],[side*bodyWidth(zb),shoulder(zb),zb],
        [side*xb,yb,zb],[side*xa,ya,za],.91);
    }
    body.quad([side*bodyWidth(-1.58),shoulder(-1.58),-1.58],[side*bodyWidth(-1.79),shoulder(-1.79),-1.79],
      [side*.9,1.105,-1.79],[side*.894,1.11,-1.58],.86);
    body.quad([side*bodyWidth(-1.79),shoulder(-1.79),-1.79],[side*bodyWidth(-2.12),shoulder(-2.12),-2.12],
      [side*.83,1.058,-2.12],[side*.9,1.105,-1.79],.79);
  }
  hood.quad([-.835,.955,2.08],[.835,.955,2.08],[.827,.91,2.11],[-.827,.91,2.11],.76);
  // Forward-facing sheet-metal scoop, open mouth, with a riveted flange.
  hood.quad([-.29,1.165,1.01],[-.255,1.33,1.25],[.255,1.33,1.25],[.29,1.165,1.01],.73);
  hood.quad([-.255,1.33,1.25],[-.3,1.32,1.68],[.3,1.32,1.68],[.255,1.33,1.25],.85);
  for(const side of [-1,1]) hood.quad([side*.29,1.165,1.01],[side*.32,1.14,1.68],[side*.3,1.32,1.68],[side*.255,1.33,1.25],.69);
  // Scoop mouth is assigned to the hood group below, so it lifts with the hood.
  const scoopMouth=new ShapeBatch(T);
  scoopMouth.quad([-.275,1.163,1.681],[.275,1.163,1.681],[.275,1.294,1.681],[-.275,1.294,1.681]);
  for(const side of [-1,1]) {
    for(const z of [1.03,1.32,1.62]) hoodSteel.rod([side*.335,1.154,z],[side*.335,1.167,z],.011,5);
    hoodSteel.rod([side*.72,1.106,1.8],[side*.72,1.128,1.8],.027,8,.65);
    hoodSteel.rod([side*.71,1.13,1.8],[side*.65,1.14,1.72],.007,5);
  }

  // Short kicked-up trunk and a rolled rear lip, not an attached cuboid.
  trunk.quad([-.88,1.119,-1.18],[.88,1.119,-1.18],[.9,1.105,-1.79],[-.9,1.105,-1.79],.88);
  trunk.quad([-.9,1.105,-1.79],[.9,1.105,-1.79],[.83,1.058,-2.12],[-.83,1.058,-2.12],.83);
  trunk.quad([-.83,1.058,-2.12],[.83,1.058,-2.12],[.84,.96,-2.14],[-.84,.96,-2.14],.65);
  for(const side of [-1,1]) steel.rod([side*.68,1.126,-1.36],[side*.68,1.085,-1.98],.02,4,.6);

  // Pillarless side openings with substantial sloping C pillars; the cabin has
  // a broad, low roof and long bonnet instead of a toy-like upright greenhouse.
  const roofFront=.29, roofRear=-.65;
  body.quad([-.72,1.65,roofFront],[.72,1.65,roofFront],[.73,1.69,roofRear],[-.73,1.69,roofRear],1);
  body.quad([-.72,1.65,roofFront],[-.68,1.7,.20],[.68,1.7,.20],[.72,1.65,roofFront],.9);
  body.quad([-.68,1.7,.20],[-.69,1.73,-.54],[.69,1.73,-.54],[.68,1.7,.20],1);
  body.quad([-.69,1.73,-.54],[-.73,1.69,roofRear],[.73,1.69,roofRear],[.69,1.73,-.54],.89);
  for(const side of [-1,1]) {
    body.quad([side*.72,1.65,.29],[side*.89,1.12,.87],[side*.9,1.12,.75],[side*.72,1.63,.19],.9);
    body.quad([side*.73,1.69,-.65],[side*.9,1.12,-1.23],[side*.91,1.12,-.88],[side*.73,1.65,-.43],.78);
    body.quad([side*.72,1.65,.29],[side*.73,1.69,-.65],[side*.75,1.62,-.65],[side*.74,1.59,.29],.87);
    steel.rod([side*.9,1.13,-1.13],[side*.895,1.13,.83],.017,5,.7);
    // Window safety bars, open air behind them, not opaque black side panels.
    for(const z of [-.39,-.06,.27]) {
      cage.rod([side*.9,1.13,z],[side*.728,1.615,z-.06],.017,6,.65);
    }
    cage.rod([side*.84,1.31,-.78],[side*.84,1.31,.61],.014,5,.6);
  }
  // A smoked lower windshield strip leaves the upper cage plainly visible.
  glass.quad([-.795,1.145,.843],[.795,1.145,.843],[.741,1.34,.637],[-.741,1.34,.637]);
  dark.rod([-.8,1.145,.851],[.8,1.145,.851],.023,6);
  dark.rod([-.716,1.636,.31],[.716,1.636,.31],.026,6);
  for(const x of [-.45,0,.45]) cage.rod([x,1.145,.843],[x*.87,1.637,.31],.018,6,.75);
  // Cross-welded internal six-point cage, visible from front, side, and rear.
  for(const z of [-.61,.37]) {
    cage.rod([-.79,.48,z],[ -.69,1.56,z],.035,8);
    cage.rod([.79,.48,z],[.69,1.56,z],.035,8);
    cage.rod([-.69,1.56,z],[.69,1.56,z],.035,8);
  }
  for(const side of [-1,1]) {
    cage.rod([side*.69,1.56,-.61],[side*.69,1.56,.37],.032,8);
    cage.rod([side*.75,.66,-.66],[side*.73,1.21,.47],.034,6);
    cage.rod([side*.75,1.21,-.66],[side*.73,.66,.47],.034,6);
    cage.rod([side*.69,1.56,-.61],[side*.76,.79,-1.49],.037,6,.77);
  }
  cage.rod([-.7,.72,-.62],[.69,1.55,-.62],.032,6,.85);
  cage.rod([.7,.72,-.62],[-.69,1.55,-.62],.032,6,.85);
  interior.box([0,.43,0],[1.68,.1,3.72]);
  interior.box([0,.88,.63],[1.62,.16,.23],.8);
  // Low-poly bucket seats with sloped backs and contrasting harness webbing.
  for(const x of [-.4,.4]) {
    interior.box([x,.61,-.13],[.43,.17,.48],.82);
    interior.quad([x-.23,.62,-.4],[x+.23,.62,-.4],[x+.19,1.22,-.57],[x-.19,1.22,-.57],.8);
    interior.quad([x-.19,1.22,-.57],[x+.19,1.22,-.57],[x+.19,1.22,-.63],[x-.19,1.22,-.63],.65);
    for(const dx of [-.115,.115]) rust.rod([x+dx,.68,-.29],[x+dx,1.18,-.557],.023,4,.9);
  }
  // Steering wheel faces the driver; rods keep the small mechanical parts cheap.
  dark.rod([-.4,.82,.43],[-.4,1.07,.27],.025,6);
  for(let i=0;i<12;i++) {
    const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;
    dark.rod([-.4+Math.cos(a)*.15,1.055+Math.sin(a)*.125,.27+Math.sin(a)*.06],
      [-.4+Math.cos(b)*.15,1.055+Math.sin(b)*.125,.27+Math.sin(b)*.06],.015,5);
  }
  steel.rod([-.54,1.055,.27],[-.26,1.055,.27],.009,5);

  // Black recessed front fascia, four empty headlight buckets, exposed slats.
  dark.box([0,.745,2.045],[1.8,.35,.14],.64);
  for(const side of [-1,1]) {
    for(const x of [.635,.835]) {
      const cx=side*x;
      // These rods point along Z, leaving the black well behind the metal lip.
      for(let i=0;i<10;i++) {
        const a=i/10*Math.PI*2,b=(i+1)/10*Math.PI*2;
        steel.rod([cx+Math.cos(a)*.082,.787+Math.sin(a)*.082,2.128],
          [cx+Math.cos(b)*.082,.787+Math.sin(b)*.082,2.128],.012,5,.55);
      }
      rust.rod([cx-.04,.727,2.132],[cx+.029,.832,2.132],.008,4,.7);
    }
  }
  for(let i=0;i<5;i++) steel.rod([-.48,.636+i*.055,2.126],[.48,.646+i*.055,2.126],.013,4,.53);
  for(const x of [-.35,0,.35]) dark.rod([x,.63,2.145],[x,.91,2.145],.018,4,.85);
  // Front/rear bumpers use deliberately bent sections, with welded brackets.
  for(const end of [-1,1]) {
    const points=[[-1.01,.53,end*2.13],[-.76,.55,end*2.23],[-.28,.51,end*2.24],[.25,.535,end*2.2],[.73,.56,end*2.23],[1.01,.51,end*2.1]];
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1];
      steel.rod(a,b,.095,4,.67+i*.035);
      dark.rod([a[0],a[1]-.08,a[2]-.02*end],[b[0],b[1]-.08,b[2]-.02*end],.015,4);
    }
    for(const x of [-.6,.6]) {
      steel.rod([x,.47,end*1.87],[x,.53,end*2.21],.05,4,.51);
      for(const dx of [-.04,.04]) steel.rod([x+dx,.55,end*2.25],[x+dx,.55,end*2.275],.02,6,.93);
    }
  }
  dark.box([0,.786,-2.095],[1.84,.3,.07]);
  for(const side of [-1,1]) {
    lamp.box([side*.67,.835,-2.139],[.39,.083,.016],.7);
    steel.box([side*.67,.837,-2.158],[.41,.015,.014],.6);
    body.quad([side*.98,.6,-2.12],[side*.98,.92,-2.12],[side*.89,1.03,-2.12],[side*.5,.62,-2.12],.71);
  }
  steel.box([0,.73,-2.145],[.33,.12,.017],.52);
  // Tow loops, exhaust and undercarriage remain visible in low chase views.
  for(const z of [-2.26,2.27]) {
    rust.rod([-.15,.49,z],[-.15,.36,z],.021,6);
    rust.rod([-.15,.36,z],[.03,.36,z],.021,6);
    rust.rod([.03,.36,z],[.03,.49,z],.021,6);
  }
  for(const side of [-1,1]) {
    dark.rod([side*.6,.33,-1.77],[side*.6,.33,1.79],.064,4);
    rust.rod([side*.68,.3,1.4],[side*.78,.3,-1.83],.044,8,.65);
    steel.rod([side*.78,.3,-1.83],[side*.8,.35,-2.18],.059,8,.58);
    dark.rod([side*.8,.35,-2.184],[side*.8,.35,-2.196],.045,8);
  }
  for(const z of [-1.4,1.38]) {
    dark.rod([-.9,.425,z],[.9,.425,z],.048,8);
    dark.rod([0,.35,z],[0,.51,z],.135,8);
    for(const side of [-1,1]) {
      steel.rod([side*.46,.31,z-.23],[side*.91,.42,z],.024,6,.6);
      steel.rod([side*.46,.31,z+.23],[side*.91,.42,z],.024,6,.6);
      steel.rod([side*.78,.42,z],[side*.68,.9,z],.026,6,.75);
      // Helical coil springs, individually faceted but one merged steel mesh.
      const springSegments=lowDetail?10:30;
      for(let i=0;i<springSegments;i++) {
        const a=i/springSegments*Math.PI*8,b=(i+1)/springSegments*Math.PI*8;
        steel.rod([side*.73+Math.cos(a)*.066,.48+i/springSegments*.33,z+Math.sin(a)*.066],
          [side*.73+Math.cos(b)*.066,.48+(i+1)/springSegments*.33,z+Math.sin(b)*.066],.012,lowDetail?3:5,.75);
      }
    }
  }
  // V8 below the bonnet: visible through grille and after the hood is lost.
  engine.box([0,.82,1.35],[.57,.32,.68],.6);
  for(const side of [-1,1]) {
    engine.rod([side*.16,.88,1.07],[side*.2,1.025,1.65],.13,4,.8);
    for(let i=0;i<4;i++) rust.rod([side*.27,.9,1.12+i*.13],[side*.44,.68,1.16+i*.13],.033,6,.67);
  }
  engine.rod([0,1.005,1.34],[0,1.08,1.34],.18,10,.9);

  // Decal quads conform to the actual sloping door skin (no floating billboards).
  for(const side of [-1,1]) {
    const z1=side===1?.67:-.70,z2=side===1?-.70:.67;
    const point=(z,y) => [side*(bodyWidth(z)-.045*(1.065-y)/(.715)+.014),y,z];
    for(let col=0;col<16;col++) for(let row=0;row<5;row++) {
      const u=col/16,u1=(col+1)/16,v=row/5,v1=(row+1)/5;
      decal.quad(point(mix(z1,z2,u),mix(.595,1.04,v)),point(mix(z1,z2,u1),mix(.595,1.04,v)),
        point(mix(z1,z2,u1),mix(.595,1.04,v1)),point(mix(z1,z2,u),mix(.595,1.04,v1)),1,[[u,v],[u1,v],[u1,v1],[u,v1]]);
    }
  }
  // Roof number for the high chase camera. Same atlas/material, only number UVs.
  decal.quad([-.55,1.737,-.5],[.55,1.737,-.5],[.55,1.714,.17],[-.55,1.714,.17],1,
    [[.78,.07],[.18,.07],[.18,.94],[.78,.94]]);

  const deformables=[];
  const meshes={};
  const add=(name,batch,mat,parent=chassis,deform=true) => {
    const geometry=batch.geometry(), mesh=new T.Mesh(geometry,mat);
    mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
    if(deform) {
      // Permanent shallow panel dings belong to the rest shape. The same field
      // puts door signs, seams and bolt heads into the dents with the sheet metal.
      const positions=geometry.getAttribute('position').array;
      const shaped=[0,0,0];
      for(let i=0;i<positions.length;i+=3) {
        const x=positions[i],y=positions[i+1],z=positions[i+2];
        const skin=clamp((Math.abs(x)-.82)/.14)*clamp((1.12-y)/.2)*clamp((y-.38)/.19);
        const ding=Math.exp(-((z+.18)**2/.14+(y-.76)**2/.03))*.05
          + Math.exp(-((z+1.89)**2/.07+(y-.78)**2/.04))*.042;
        positions[i]-=Math.sign(x)*skin*ding;
        proportionPoint(positions[i],y,z,profile,shaped);
        positions[i]=shaped[0];positions[i+1]=shaped[1];positions[i+2]=shaped[2];
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.getAttribute('position').setUsage(T.DynamicDrawUsage);
      const original=positions.slice(),coefficients=new Float32Array(original.length*4);
      for(let i=0;i<original.length;i+=3) {
        deformationCoefficients(original[i],original[i+1],original[i+2],(seed%6283)/1000,coefficients,i*4);
      }
      deformables.push({mesh,original,coefficients});
    }
    meshes[name]=mesh;
    return mesh;
  };
  add('painted-shell',body,materials.paint);
  const hoodGroup=new T.Group();hoodGroup.name='removable-hood';chassis.add(hoodGroup);
  add('hood',hood,materials.hood,hoodGroup);
  add('scoop-mouth',scoopMouth,materials.dark,hoodGroup);
  add('hood-pins',hoodSteel,materials.steel,hoodGroup);
  add('trunk',trunk,materials.paint);
  for(const key of ['steel','dark','cage','rust','interior','glass','decal','lamp']) {
    add(key,batches[key],materials[key]);
  }
  add('engine',engine,materials.ember);
  const wheels=[];
  for(const z of [1.38,-1.4]) {
    for(const side of [-1,1]) {
      const mount=new T.Group();mount.name=`${z>0?'front':'rear'}-${side<0?'left':'right'}-hub`;
      mount.position.set(side*.9,.443,z);chassis.add(mount);
      const spin=new T.Group();spin.name='wheel-spin';mount.add(spin);
      const tireMesh=new T.Mesh(lowDetail?shared.lowTire:shared.tire,materials.rubber),rimMesh=new T.Mesh(lowDetail?shared.lowRim:shared.rim,materials.rim);
      tireMesh.name='treaded-tire';rimMesh.name='five-spoke-steel-wheel';
      tireMesh.castShadow=rimMesh.castShadow=true;tireMesh.receiveShadow=rimMesh.receiveShadow=true;
      spin.add(tireMesh,rimMesh);
      wheels.push({mount,spin,side,front:z>0,baseX:side*.9,baseY:.443,baseZ:z});
    }
  }
  // Compact low-poly flame tongues, rather than a per-car light or particle system.
  const flameShape=new ShapeBatch(T);
  for(let i=0;i<7;i++) {
    const x=(rnd()-.5)*.52,z=(rnd()-.5)*.57,r=.07+rnd()*.055,h=.34+rnd()*.49;
    const tip=[x+(rnd()-.5)*.15,h,z-.08];
    for(let j=0;j<5;j++) {
      const a=j/5*Math.PI*2,b=(j+1)/5*Math.PI*2;
      flameShape.triangle([x+Math.cos(a)*r,0,z+Math.sin(a)*r],[x+Math.cos(b)*r,0,z+Math.sin(b)*r],tip);
    }
  }
  const fire=add('engine-fire',flameShape,materials.fire,chassis,false);
  fire.position.set(0,1.11,1.38);fire.visible=false;fire.castShadow=fire.receiveShadow=false;
  const tintMaterials=['paint','hood','steel','dark','cage','rust','rubber','rim','interior','glass','decal','lamp'];
  root.userData.vehicle={
    chassis, wheels, hood:hoodGroup, trunk:meshes.trunk, engine:meshes.engine, fire,contactShadow,
    meshes,materials,deformables,
    baseColors:tintMaterials.map(key=>({material:materials[key],color:materials[key].color.clone()})),
    charColor:new T.Color('#24221d'),
    id,isPlayer,seed,profile:profile?.name ?? 'player-muscle',phase:(seed%6283)/1000,damage:{front:0,rear:0,left:0,right:0},
    appliedDamage:{front:0,rear:0,left:0,right:0},displacement:[0,0,0],
    wheelAngle:0,wheelRadius:.435*.96,steering:0,roll:0,pitch:0,bounce:0,lastSpeed:0,health:1,lastTint:-1,
    initialized:false,impactPitch:0,impactRoll:0,impactY:0,pitchVelocity:0,rollVelocity:0,bounceVelocity:0,
    pointCoefficients:new Float64Array(12),inverseChassisQuaternion:new T.Quaternion(),contactPoint:new T.Vector3(),
    fireOrigin:proportionPoint(0,1.14,1.38,profile,[0,0,0]),
    // Shared resources must not be disposed by traversing a single removed car.
    sharedResources:shared,
  };
  root.userData.isPlayer=isPlayer;root.userData.id=id;
  return root;
}

// Smooth, regional displacement field evaluated against immutable rest vertices.
// Every chassis batch samples the same field, keeping seams, decals and fasteners
// together. Noise is spatial, so coincident vertices cannot tear apart.
// The field is linear in the four remapped damage amounts. Cache its basis once,
// avoiding per-vertex trigonometry/powers during multi-car collision frames.
const crumpleAmount = damage => damage*(1.65-.65*damage);

function deformationCoefficients(x,y,z,phase,out,i) {
  const front=clamp((z-.32)/1.82)**1.45,rear=clamp((-z-.47)/1.7)**1.45;
  const left=clamp((-x-.13)/.9)**1.25,right=clamp((x-.13)/.9)**1.25;
  const low=1-.65*clamp((y-1.1)/.65);
  const crease=Math.sin(z*8.4+x*4.2+phase)*Math.sin(y*7.1-z*3.3);
  const endX=Math.sin(z*5.2+phase)*.085;
  const panel=clamp((y-.59)/.45);
  // Broad folds lift the middle of the hood/trunk while the bumper drives in.
  // These affect the silhouette at medium damage, rather than merely rippling it.
  const frontFold=Math.sin(clamp((z-.55)/1.57)*Math.PI);
  const rearFold=Math.sin(clamp((-z-.65)/1.5)*Math.PI);
  const sideY=-.085*low+crease*.065,sideZ=crease*.095*low;
  const sideX=(.4+.12*Math.cos(z*2.3)**2)*low;
  out[i]=front*endX;out[i+1]=front*(.08+frontFold*.46+crease*.045)*panel;out[i+2]=-front*.8;
  out[i+3]=rear*endX;out[i+4]=rear*(.065+rearFold*.4+crease*.045)*panel;out[i+5]=rear*.72;
  out[i+6]=left*sideX;out[i+7]=left*sideY;out[i+8]=left*sideZ;
  out[i+9]=-right*sideX;out[i+10]=right*sideY;out[i+11]=right*sideZ;
}

function deformPoint(x,y,z,damage,phase,out,c) {
  deformationCoefficients(x,y,z,phase,c,0);
  const front=crumpleAmount(damage.front),rear=crumpleAmount(damage.rear);
  const left=crumpleAmount(damage.left),right=crumpleAmount(damage.right);
  out[0]=x+front*c[0]+rear*c[3]+left*c[6]+right*c[9];
  out[1]=y+front*c[1]+rear*c[4]+left*c[7]+right*c[10];
  out[2]=z+front*c[2]+rear*c[5]+left*c[8]+right*c[11];
  return out;
}

/** Visual-only update. Tolerates partial car objects, missing dt/time, and bad
 * numeric input. car.health uses 0..100 (default 100); regional damage uses 0..1.
 * Internal visual health is normalized to 0..1. Main retains all root transforms.
 * Reused models restore their rest geometry and paint as damage/health recover.
 */
export function updateVehicle(group, car = {}, dt = 0, time = 0) {
  const v=group?.userData?.vehicle;
  if(!v) return;
  car=car || {};
  dt=clamp(finite(dt),0,.1);time=finite(time);
  const speed=finite(car.speed,Math.hypot(finite(car.vx),finite(car.vz)));
  const health=clamp(finite(car.health,100)/100),alive=car.alive!==false;
  let dirty=false,frontHit=0,rearHit=0,leftHit=0,rightHit=0,totalDamage=0,oldDamage=0;
  for(const region of ['front','rear','left','right']) {
    const amount=clamp(finite(car.damage?.[region]));
    const delta=Math.max(0,amount-v.damage[region]);
    if(region==='front') frontHit=delta;
    else if(region==='rear') rearHit=delta;
    else if(region==='left') leftHit=delta;
    else rightHit=delta;
    oldDamage+=v.damage[region];totalDamage+=amount;
    v.damage[region]=amount;
    if(Math.abs(amount-v.appliedDamage[region])>.006 || (amount===0 && v.appliedDamage[region]!==0)) dirty=true;
  }
  const reset=(dt===0 && time===0) || (health===1 && totalDamage===0 && (v.health<1 || oldDamage>0));
  if(reset) {
    v.impactPitch=v.impactRoll=v.impactY=v.pitchVelocity=v.rollVelocity=v.bounceVelocity=0;
    v.pitch=v.roll=v.bounce=v.steering=v.wheelAngle=0;
    v.lastSpeed=speed;
  } else if(v.initialized && dt>0) {
    const speedKick=clamp((Math.abs(speed-v.lastSpeed)-Math.max(.8,dt*32))/7);
    const hit=frontHit+rearHit+leftHit+rightHit;
    v.pitchVelocity=clamp(v.pitchVelocity+(frontHit-rearHit)*9+speedKick*Math.sign(v.lastSpeed-speed)*1.1,-2.2,2.2);
    v.rollVelocity=clamp(v.rollVelocity+(rightHit-leftHit)*9,-2.2,2.2);
    v.bounceVelocity=clamp(v.bounceVelocity-hit*.95-speedKick*.35,-1.1,1.1);
  }
  // Short damped spring response, driven only by actual impact evidence. Small
  // fixed substeps keep suspension stable even on the software renderer tier.
  const steps=Math.ceil(dt*120),h=steps ? dt/steps : 0;
  for(let i=0;i<steps;i++) {
    v.pitchVelocity+=(-150*v.impactPitch-12*v.pitchVelocity)*h;
    v.rollVelocity+=(-150*v.impactRoll-12*v.rollVelocity)*h;
    v.bounceVelocity+=(-180*v.impactY-14*v.bounceVelocity)*h;
    v.impactPitch=clamp(v.impactPitch+v.pitchVelocity*h,-.16,.16);
    v.impactRoll=clamp(v.impactRoll+v.rollVelocity*h,-.16,.16);
    v.impactY=clamp(v.impactY+v.bounceVelocity*h,-.065,.065);
  }
  v.initialized=true;
  const response=1-Math.exp(-dt*11),settle=1-Math.exp(-dt*8);
  const inputSteer=clamp(finite(car.steer),-1,1);
  v.steering=mix(v.steering,alive?inputSteer*.47:0,response);
  v.wheelAngle=(v.wheelAngle+speed*dt/v.wheelRadius)%(Math.PI*2);
  const speedAmount=clamp(Math.abs(speed)/18),phase=v.phase;
  const acceleration=dt>0 ? clamp((speed-v.lastSpeed)/dt,-18,18) : 0;
  v.lastSpeed=speed;v.health=health;
  const desiredRoll=alive ? inputSteer*speedAmount*.065 : (v.damage.left-v.damage.right)*.035;
  const desiredPitch=alive ? -acceleration*.0018 : .018;
  v.roll=mix(v.roll,desiredRoll,settle);
  v.pitch=mix(v.pitch,desiredPitch,settle);
  v.bounce=mix(v.bounce,alive?0:-.035,response);
  const poseY=v.bounce+v.impactY;
  v.chassis.position.y=poseY*v.chassis.scale.y;
  v.chassis.rotation.x=v.pitch+v.impactPitch;
  v.chassis.rotation.z=v.roll+v.impactRoll;
  v.inverseChassisQuaternion.copy(v.chassis.quaternion).invert();
  if(dirty) {
    const front=crumpleAmount(v.damage.front),rear=crumpleAmount(v.damage.rear);
    const left=crumpleAmount(v.damage.left),right=crumpleAmount(v.damage.right);
    for(const {mesh,original,coefficients:c} of v.deformables) {
      const attribute=mesh.geometry.getAttribute('position'),p=attribute.array;
      for(let i=0;i<p.length;i+=3) {
        const j=i*4;
        p[i]=original[i]+front*c[j]+rear*c[j+3]+left*c[j+6]+right*c[j+9];
        p[i+1]=original[i+1]+front*c[j+1]+rear*c[j+4]+left*c[j+7]+right*c[j+10];
        p[i+2]=original[i+2]+front*c[j+2]+rear*c[j+5]+left*c[j+8]+right*c[j+11];
      }
      attribute.needsUpdate=true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    Object.assign(v.appliedDamage,v.damage);
  }
  for(const wheel of v.wheels) {
    const sideDamage=wheel.side<0?v.damage.left:v.damage.right;
    const endDamage=wheel.front?v.damage.front:v.damage.rear;
    // The chassis moves around the contact patches; counter-motion prevents
    // obvious tire hovering when the body pitches or rolls on its springs.
    const p=deformPoint(wheel.baseX,wheel.baseY,wheel.baseZ,v.damage,phase,v.displacement,v.pointCoefficients);
    v.contactPoint.set(p[0],wheel.baseY-poseY,p[2]).applyQuaternion(v.inverseChassisQuaternion);
    wheel.mount.position.copy(v.contactPoint);
    wheel.mount.quaternion.copy(v.inverseChassisQuaternion);
    wheel.mount.rotateY((wheel.front?v.steering:0)+wheel.side*sideDamage*endDamage*.055);
    wheel.mount.rotateZ(wheel.side*sideDamage*.085);
    wheel.spin.rotation.x=v.wheelAngle;
  }
  // The bonnet loosens, buckles, then disappears to expose the complete V8.
  v.hood.visible=v.damage.front<.86 && alive;
  v.hood.rotation.x=clamp((v.damage.front-.47)/.39)*-.075;
  v.hood.position.y=clamp((v.damage.front-.5)/.36)*.045;
  v.trunk.visible=v.damage.rear<.94;
  const burn=alive?clamp((.72-health)/.72)*.55:1;
  if(Math.abs(burn-v.lastTint)>.008) {
    for(const item of v.baseColors) {
      const amount=alive ? burn*(item.material===v.materials.decal ? .9 : .86) : .97;
      item.material.color.copy(item.color).lerp(v.charColor,amount);
    }
    v.materials.paint.roughness=mix(.76,1,burn);
    v.materials.hood.roughness=mix(.82,1,burn);
    v.materials.lamp.emissiveIntensity=alive ? .25 : 0;
    v.lastTint=burn;
  }
  const burning=(!alive || health<.28);
  v.fire.visible=burning;
  if(burning) {
    const intensity=alive?clamp((.3-health)/.3):.65;
    const flicker=.78+.15*Math.sin(time*22+phase)+.1*Math.sin(time*37+phase);
    v.fire.scale.set(.7+intensity*.35,(.5+intensity*.72)*flicker,.8+intensity*.25);
    v.fire.rotation.y=Math.sin(time*7+phase)*.13;
    const origin=deformPoint(...v.fireOrigin,v.damage,phase,v.displacement,v.pointCoefficients);
    v.fire.position.set(...origin);
    v.materials.fire.opacity=.4+flicker*.15;
    v.materials.ember.emissiveIntensity=(.2+intensity*.65)*flicker;
  } else v.materials.ember.emissiveIntensity=0;
}
