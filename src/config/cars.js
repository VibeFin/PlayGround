/**
 * Car catalogue — readable counterpart of minified `nL` (specs),
 * `rL` (body proportions) and `eB` (engine-audio profiles).
 */

export const CARS = [
  {
    id: 'apex', name: 'APEX R', subtitle: 'MID-ENGINE / REAR DRIVE',
    power: 612, mass: 1395, maxSpeed: 326, acceleration: 3.1, handling: 1.0,
    length: 4.68, width: 1.94, wheelbase: 2.72, color: '#f1492e',
    drivetrain: 'RWD',
  },
  {
    id: 'vanta', name: 'VANTA GT', subtitle: 'GRAND TOURER / TWIN TURBO',
    power: 568, mass: 1580, maxSpeed: 310, acceleration: 3.6, handling: 0.92,
    length: 4.96, width: 1.96, wheelbase: 2.88, color: '#175e62',
    drivetrain: 'RWD',
  },
  {
    id: 'spectre', name: 'SPECTRE X', subtitle: 'HYPERCAR / ACTIVE AERO',
    power: 820, mass: 1340, maxSpeed: 354, acceleration: 2.6, handling: 1.04,
    length: 4.76, width: 2.05, wheelbase: 2.77, color: '#a8bb46',
    drivetrain: 'AWD',
  },
  {
    id: 'rift', name: 'RIFT RS', subtitle: 'RALLY SPORT / ALL WHEEL DRIVE',
    power: 438, mass: 1270, maxSpeed: 276, acceleration: 3.8, handling: 0.98,
    length: 4.24, width: 1.85, wheelbase: 2.42, color: '#e4e1d7',
    drivetrain: 'AWD',
  },
  {
    id: 'vector', name: 'VECTOR 01', subtitle: 'ENDURANCE / TRACK PROTOTYPE',
    power: 744, mass: 1035, maxSpeed: 362, acceleration: 2.7, handling: 1.1,
    length: 4.9, width: 2.08, wheelbase: 2.9, color: '#4967e9',
    drivetrain: 'RWD',
  },
];

/** Body-shell proportions (minified `rL`). Used by vehicle.js. */
export const CAR_BODIES = {
  apex:    { roof: 1.2,  front: 1.37, rear: -1.35, cabinFront: 0.73,  cabinRear: -1.08, roofFront: 0.16,  roofRear: -0.58, windowWidth: 0.67, radius: 0.357, spokes: 5, accent: '#1e2025', noseTaper: 0.18, flare: 0.2,  archClearance: 0.066 },
  vanta:   { roof: 1.31, front: 1.48, rear: -1.4,  cabinFront: 0.36,  cabinRear: -1.28, roofFront: -0.16, roofRear: -0.86, windowWidth: 0.7,  radius: 0.372, spokes: 7, accent: '#a59261', noseTaper: 0.15, flare: 0.17, archClearance: 0.062 },
  spectre: { roof: 1.11, front: 1.46, rear: -1.31, cabinFront: 0.75,  cabinRear: -1.09, roofFront: 0.22,  roofRear: -0.55, windowWidth: 0.6,  radius: 0.362, spokes: 5, accent: '#b9d84a', wing: true, noseTaper: 0.23, flare: 0.23, archClearance: 0.066 },
  rift:    { roof: 1.43, front: 1.22, rear: -1.2,  cabinFront: 0.61,  cabinRear: -1.45, roofFront: 0.2,   roofRear: -1.05, windowWidth: 0.7,  radius: 0.371, spokes: 6, accent: '#ed5034', wing: true, rally: true, noseTaper: 0.13, flare: 0.25, archClearance: 0.096 },
  vector:  { roof: 1.05, front: 1.5,  rear: -1.4,  cabinFront: 0.88,  cabinRear: -1.07, roofFront: 0.22,  roofRear: -0.55, windowWidth: 0.43, radius: 0.357, spokes: 9, accent: '#f1f0e5', wing: true, prototype: true, noseTaper: 0.27, flare: 0.29, archClearance: 0.06 },
};

/** Engine-audio profiles (minified `eB`). */
export const ENGINE_PROFILES = {
  apex:    { cylinders: 8,  intake: 1.0,  exhaust: 1.0,  turbo: 0.38, mechanical: 0.72, redline: 9000 },
  vanta:   { cylinders: 8,  intake: 0.88, exhaust: 0.92, turbo: 0.82, mechanical: 0.68, redline: 8600 },
  spectre: { cylinders: 10, intake: 1.1,  exhaust: 1.14, turbo: 0.48, mechanical: 0.56, redline: 9500 },
  rift:    { cylinders: 4,  intake: 0.78, exhaust: 0.96, turbo: 0.72, mechanical: 0.98, redline: 7800 },
  vector:  { cylinders: 6,  intake: 0.92, exhaust: 0.86, turbo: 0.64, mechanical: 0.52, redline: 8800 },
};

export const FACTORY_PAINTS = [
  '#d0ff58', '#eaece2', '#f1492e', '#24a6ba', '#4063bf', '#222a2c',
];

export const GHOST_COLOR = '#7ceaff';

export function getCar(id) {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

/** Derived arcade-physics constants (minified `wL`). */
export function deriveCarStats(car) {
  const topSpeed = (car.maxSpeed / 3.6); // m/s
  const accel = (27.778 / car.acceleration) * 1.16; // m/s^2 launch feel
  return {
    topSpeed,
    acceleration: accel,
    powerWatts: car.power * 745.7,
    grip: 1.2 * car.handling,
    trackWidth: car.width - 0.208,
    frontAxle: car.wheelbase / 2,
    rearAxle: -car.wheelbase / 2,
  };
}
