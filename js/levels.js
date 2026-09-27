// Level data. Item kinds: box, clay, bead, flower, spike, flag, goal
// box: {k,x,y,z,w,h,d,c}  (x,y,z = CENTER)
// clay: {k:'clay',x,y,z,shape} (x,y,z = base center on ground top; footprint 2.4)
// bead/flower/spike/flag/goal: {k,x,y,z}
function B(x, y, z, w, h, d, c) { return { k: 'box', x, y, z, w, h, d, c }; }
function C(x, y, z, shape = 0) { return { k: 'clay', x, y, z, shape }; }
function bead(x, y, z) { return { k: 'bead', x, y, z }; }
function flower(x, y, z) { return { k: 'flower', x, y, z }; }
function spike(x, y, z) { return { k: 'spike', x, y, z }; }
function flag(x, y, z) { return { k: 'flag', x, y, z }; }
function goal(x, y, z) { return { k: 'goal', x, y, z }; }

const CANYON = {
  id: 0, name: 'Canyon Capers', sub: 'Sculpted sandstone & sleepy mesas', emoji: '🏜️',
  sky: 0xffd9a0, fog: 0xf0a860, fogNear: 40, fogFar: 160, ground: 0xd9793c,
  hemi: [0xffe6c0, 0x8a4a20, 0.9], sun: [0xfff2d0, 1.4],
  deco: 'canyon', spawn: { x: 0, y: 4, z: 0 },
  items: [
    B(0, 0, 0, 10, 2, 8, 0xc96a2e),
    B(2, 1.2, 0, 2, 0.6, 2, 0xe08a3e),
    ...[0, 1, 2].map(i => bead(2 + i * 0.8, 2.6, 0)),
    B(9, 0, 0, 8, 2, 8, 0xc96a2e),
    flag(8, 1, 2.5),
    B(15, 1.5, 0, 3, 1, 3, 0xa84e22),
    C(19.5, 1, 0, 0),                       // clay puzzle: ramp up to high ledge
    B(24, 2.5, 0, 6, 1.5, 6, 0xc96a2e),
    ...[0, 1, 2].map(i => bead(23 + i, 4.6, 0)),
    B(30, 2.5, -1, 3, 1.5, 3, 0xc96a2e),
    spike(30, 3.3, -1),
    B(30, 2.5, 2.5, 3, 1.5, 1.6, 0xc96a2e), // safe edge around spikes
    B(36, 3, 0, 7, 2, 7, 0xc96a2e),
    flag(34, 4, 2),
    B(40, 4.5, 0, 2.4, 1, 2.4, 0xe08a3e),
    bead(40, 6, 0), bead(38, 5.4, -2), bead(42, 5.4, 2),
    C(45.5, 4, 0, 0),                       // clay: bridge the big gap
    B(52, 4, 0, 8, 2, 8, 0xc96a2e),
    flower(52, 6.5, -3.2),                  // secret behind rock
    B(52, 5.5, -3.2, 2, 1, 2, 0xa84e22),
    goal(54, 5, 0),
  ]
};

const TREETOP = {
  id: 1, name: 'Treetop Tangle', sub: 'Bouncy leaves & branch bridges', emoji: '🌳',
  sky: 0xbfefff, fog: 0x7ecf8a, fogNear: 45, fogFar: 170, ground: 0x4a8f3f,
  hemi: [0xd8ffe0, 0x2a5a28, 1.0], sun: [0xfffbe0, 1.3],
  deco: 'treetop', spawn: { x: 0, y: 5, z: 0 },
  items: [
    B(0, 0, 0, 9, 2, 9, 0x5aa04a),
    B(0, 1.2, 0, 3, 0.6, 3, 0x7a5230),
    flag(0, 1, 3),
    bead(2, 3, 0), bead(3, 3, 1), bead(4, 3, -1),
    B(8, 1, 0, 4, 1.2, 4, 0x5aa04a),
    C(12, 1.6, 0, 0),                       // ramp to high branch
    B(17, 3.5, 0, 5, 1, 4, 0x7a5230),
    B(22, 4.5, 0, 3.4, 0.8, 3.4, 0x4a9e57),
    bead(22, 6, 0), flower(22, 6, -3.4),    // flower on hidden leaf
    B(22, 4.5, -4.4, 2.2, 0.8, 2.2, 0x4a9e57),
    B(27, 4, 1.5, 3, 0.8, 3, 0x5aa04a),
    spike(27, 4.5, 1.5),
    B(27, 4, -1.8, 3, 0.8, 1.4, 0x5aa04a),
    B(33, 5, 0, 6, 1, 5, 0x7a5230),
    flag(31, 5.5, 1.5),
    ...[0, 1, 2].map(i => bead(32 + i, 6.8, 0)),
    C(38.5, 5.5, 0, 0),                     // bridge gap
    B(45, 5.5, 0, 8, 1.4, 6, 0x5aa04a),
    B(45, 6.8, -2, 2, 0.7, 2, 0x4a9e57),
    flower(45, 7.8, -2),
    bead(44, 7.2, 1), bead(46, 7.2, -1),
    goal(47, 6.2, 1.5),
  ]
};

const CAVES = {
  id: 2, name: 'Crystal Caves', sub: 'Glow-crystals & deep dark clay', emoji: '💎',
  sky: 0x120a24, fog: 0x2a1650, fogNear: 30, fogFar: 130, ground: 0x4a3670,
  hemi: [0x8a6aff, 0x1a0f30, 0.8], sun: [0xb08aff, 0.9],
  deco: 'caves', spawn: { x: 0, y: 4, z: 0 },
  dark: true,
  items: [
    B(0, 0, 0, 10, 2, 10, 0x5a4478),
    bead(0, 2.6, 0), bead(1.5, 2.6, 1), bead(-1.5, 2.6, -1),
    B(9, 0.5, 0, 6, 2, 6, 0x5a4478),
    flag(7, 1.5, 2),
    spike(9, 1.6, 0), spike(10.5, 1.6, 0),
    B(9, 0.5, 2.6, 6, 2, 1.4, 0x5a4478),    // safe ledge
    B(15, 1.5, 0, 4, 1.5, 4, 0x6a5088),
    C(19.5, 2.2, 0, 0),                     // ramp up
    B(24, 4, 0, 5, 1.2, 5, 0x6a5088),
    bead(24, 5.6, 0), bead(23, 5.6, 1.5), bead(25, 5.6, -1.5),
    B(29, 4.5, 0, 3, 1, 3, 0x5a4478),
    spike(29, 5.1, 0),
    B(29, 4.5, 2.6, 3, 1, 1.4, 0x5a4478),
    B(35, 5, 0, 7, 1.4, 6, 0x5a4478),
    flag(33, 5.7, 2),
    flower(33, 6.8, -2.4),
    C(40.5, 5.7, 0, 0),                     // bridge to finale
    B(47, 5.7, 0, 8, 1.6, 7, 0x6a5088),
    ...[0, 1, 2, 3].map(i => bead(45 + i, 7.4, (i % 2 ? 1 : -1))),
    flower(49, 7.2, -2.8),
    goal(49, 6.5, 1.5),
  ]
};

const CLOUD = {
  id: 3, name: 'Cloud City', sub: 'Floating islands & rainbow clay', emoji: '☁️',
  sky: 0xaee6ff, fog: 0xcfeaff, fogNear: 50, fogFar: 200, ground: 0xf4f8ff,
  hemi: [0xffffff, 0x7aa8d0, 1.1], sun: [0xffffff, 1.5],
  deco: 'cloud', spawn: { x: 0, y: 5, z: 0 },
  items: [
    B(0, 0, 0, 9, 1.6, 9, 0xffffff),
    flag(-2, 0.8, 3),
    bead(0, 2.4, 0), bead(1.5, 2.4, 1), bead(-1.5, 2.4, -1),
    B(8, 1, 0, 3.6, 1, 3.6, 0xfff2ad),
    B(13, 2, 0, 3.6, 1, 3.6, 0xffffff),
    bead(13, 3.6, 0),
    B(18, 3, 1, 3.4, 1, 3.4, 0xffd6e8),
    flower(18, 4.4, -1.4),                  // under-island secret
    B(18, 1.2, -1.4, 1.8, 0.7, 1.8, 0xffd6e8),
    B(23, 4, 0, 4.4, 1, 4.4, 0xffffff),
    flag(22, 4.5, 1.5),
    spike(23.5, 4.6, 0),
    B(23, 4, -2.8, 4.4, 1, 1.2, 0xffffff),
    C(28, 4.5, 0, 0),                       // ramp to sky palace
    B(33, 6.5, 0, 5, 1.2, 5, 0xfff2ad),
    ...[0, 1, 2].map(i => bead(32 + i, 8, 0)),
    B(39, 7.5, 0, 3.2, 0.9, 3.2, 0xffffff),
    B(44, 8.5, 0, 3.2, 0.9, 3.2, 0xffd6e8),
    bead(44, 10, 0), flower(44, 10, -2.6),
    B(44, 8.5, -3.4, 1.8, 0.7, 1.8, 0xffd6e8),
    C(48.5, 9, 0, 0),                       // final bridge
    B(55, 9, 0, 9, 1.6, 9, 0xffffff),
    flower(57, 10.6, -3),
    bead(54, 10.6, 0), bead(56, 10.6, 1),
    goal(57, 9.8, 1.5),
  ]
};

export const LEVELS = [CANYON, TREETOP, CAVES, CLOUD];
export const CLAY_SHAPES = ['Block', 'Ramp', 'Bridge'];
