/**
 * Track catalogue — readable counterpart of minified `HI` + `UI` in the
 * original bundle (spline-rush.vercel.app/assets/index-*.js).
 *
 * Each track is a closed centripetal Catmull-Rom spline through the listed
 * control points ([x, y, z] metres). The original builds the curve with:
 *
 *   new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5)
 *   curve.arcLengthDivisions = 4096
 *
 * Minimap polylines in the original are precomputed from
 * `curve.getPoints(80)` normalised into a 0..1 box; we recompute them at
 * runtime in `spline-track.js` instead of hard-coding.
 */

// Minified source: `var HI = [...]`
export const TRACKS = [
  {
    id: 'coast',
    name: 'AZURE COAST',
    biome: 'coastal day',
    description:
      'A ribbon of tarmac above the Mediterranean. Fast sweepers, sea cliffs, and the tunnel at Cap Serein.',
    lengthLabel: '2.3 km',
    difficulty: 'FLOWING',
    timeOfDay: 0.36, // 0..1 mapped to a 24h clock in world.js
    rain: 0,
    color: '#4ce4d2',
    corners: [
      { name: 'Marina', s: 0.09 },
      { name: 'Cap Serein', s: 0.29 },
      { name: 'The Balcony', s: 0.43 },
      { name: 'Serpentine', s: 0.64 },
      { name: 'Lighthouse', s: 0.83 },
    ],
  },
  {
    id: 'mountain',
    name: 'ALPINE REACH',
    biome: 'mountain dusk',
    description:
      'Climb through granite peaks, commit to the ridge, then brake deep for the switchbacks.',
    lengthLabel: '2.7 km',
    difficulty: 'TECHNICAL',
    timeOfDay: 0.72,
    rain: 0,
    color: '#c9b1ff',
    corners: [
      { name: 'Treeline', s: 0.12 },
      { name: 'Summit', s: 0.34 },
      { name: 'Needle Eye', s: 0.46 },
      { name: "Devil's Elbow", s: 0.61 },
      { name: 'Granite Gate', s: 0.8 },
    ],
  },
  {
    id: 'desert',
    name: 'SOLSTICE CANYON',
    biome: 'desert sunset',
    description:
      'Burnt sandstone, long sightlines and a deceptively fast canyon descent beneath a copper sun.',
    lengthLabel: '2.3 km',
    difficulty: 'FAST',
    timeOfDay: 0.67,
    rain: 0,
    color: '#ffb667',
    corners: [
      { name: 'Mirage', s: 0.13 },
      { name: 'Red Mesa', s: 0.31 },
      { name: 'Scorpion', s: 0.48 },
      { name: 'The Furnace', s: 0.65 },
      { name: 'Sunset Bend', s: 0.84 },
    ],
  },
  {
    id: 'forest',
    name: 'VERDANT PASS',
    biome: 'forest rain',
    description:
      'Wet asphalt threads a dense conifer forest. Find the dry line and respect the standing water.',
    lengthLabel: '2.2 km',
    difficulty: 'WET',
    timeOfDay: 0.44,
    rain: 0.86,
    color: '#a1d9ac',
    corners: [
      { name: 'Fern Hollow', s: 0.12 },
      { name: 'Blackwater', s: 0.32 },
      { name: 'Cedar Hook', s: 0.47 },
      { name: 'Foxglove', s: 0.65 },
      { name: 'Old Mill', s: 0.82 },
    ],
  },
  {
    id: 'city',
    name: 'NOCTURNE GRID',
    biome: 'night city neon',
    description:
      'An after-hours street circuit between glass towers. Neon, concrete and an illuminated riverfront.',
    lengthLabel: '2.3 km',
    difficulty: 'PRECISION',
    timeOfDay: 0.92,
    rain: 0.25,
    color: '#f783d8',
    corners: [
      { name: 'The Strip', s: 0.13 },
      { name: 'Overpass', s: 0.3 },
      { name: 'Neon Chicane', s: 0.49 },
      { name: 'Financial District', s: 0.65 },
      { name: 'Rivergate', s: 0.84 },
    ],
  },
  {
    id: 'oval',
    name: 'VELOCITY RING',
    biome: 'high-speed oval',
    description:
      'A purpose-built cathedral of speed. High banking, long drafting battles and no room to lift.',
    lengthLabel: '2.5 km',
    difficulty: 'FLAT OUT',
    timeOfDay: 0.38,
    rain: 0,
    color: '#ffc755',
    corners: [
      { name: 'Turn One', s: 0.2 },
      { name: 'Turn Two', s: 0.34 },
      { name: 'Backstretch', s: 0.5 },
      { name: 'Turn Three', s: 0.7 },
      { name: 'Turn Four', s: 0.84 },
    ],
  },
];

// Minified source: `UI = { coast: [...], ... }`
export const TRACK_CONTROL_POINTS = {
  coast: [
    [-200, 24, 300], [100, 24, 300], [320, 29, 210], [400, 46, 0],
    [330, 76, -190], [125, 84, -295], [-80, 68, -205], [-115, 53, -70],
    [-290, 36, -105], [-390, 25, 65], [-330, 22, 225],
  ],
  mountain: [
    [-220, 34, 300], [60, 40, 300], [280, 72, 220], [370, 108, 15],
    [205, 148, -180], [55, 157, -225], [25, 132, -95], [155, 111, -10],
    [120, 78, 135], [-15, 61, 125], [-120, 78, -30], [-280, 99, -115],
    [-370, 69, 25], [-345, 45, 215],
  ],
  desert: [
    [-260, 20, 290], [40, 20, 310], [345, 23, 245], [425, 34, 60],
    [310, 44, -105], [135, 45, -90], [40, 36, -190], [-180, 30, -275],
    [-370, 22, -180], [-400, 18, 40],
  ],
  forest: [
    [-240, 28, 280], [60, 30, 300], [280, 39, 250], [335, 56, 60],
    [230, 73, -100], [285, 77, -240], [100, 72, -300], [-80, 58, -235],
    [-80, 39, -70], [-235, 33, -45], [-365, 40, 90],
  ],
  city: [
    [-290, 24, 260], [0, 24, 260], [270, 24, 260], [340, 25, 160],
    [340, 33, -40], [250, 40, -100], [100, 40, -100], [40, 37, -190],
    [-10, 30, -300], [-270, 24, -300], [-355, 24, -200], [-355, 24, 90],
  ],
  oval: [
    [-300, 22, 210], [0, 22, 210], [300, 22, 210], [455, 29, 120],
    [500, 36, 0], [455, 29, -120], [300, 22, -210], [0, 22, -210],
    [-300, 22, -210], [-455, 29, -120], [-500, 36, 0], [-455, 29, 120],
  ],
};

/** Tunnel segments as normalised [start, end] spline fractions. */
export const TUNNEL_ZONES = {
  coast: [[0.33, 0.395]],
  mountain: [[0.755, 0.82]],
  forest: [[0.59, 0.625]],
  city: [[0.24, 0.3]],
  desert: [],
  oval: [],
};

/** Championship rotation in the original: chosen track, then +2 / +4 mod 6. */
export function championshipRotation(startId) {
  const ids = TRACKS.map((t) => t.id);
  const i = Math.max(0, ids.indexOf(startId));
  return [0, 2, 4].map((k) => ids[(i + k) % ids.length]);
}

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
