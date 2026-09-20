/**
 * Race modes + quality presets.
 * Minified sources: `Iz` (modes), `Lz` (quality text), `yz` (quality numbers).
 */

export const MODES = {
  quick: {
    label: 'QUICK RACE',
    description: 'Eight rivals. Three laps. Leave everything on the circuit.',
  },
  'time-trial': {
    label: 'TIME TRIAL',
    description: 'Find your perfect lap. Chase your personal-best ghost.',
  },
  championship: {
    label: 'CHAMPIONSHIP',
    description: 'Set your qualifying lap. Take on a three-race championship.',
  },
};

export const QUALITY_PRESETS = {
  low:    { dpr: 1,    maxHeight: 720,  shadow: 1024, particles: 384,  rain: 700,   ao: false, bloom: false },
  medium: { dpr: 1.25, maxHeight: 1080, shadow: 1536, particles: 900,  rain: 1600,  ao: false, bloom: true },
  high:   { dpr: 1.5,  maxHeight: null, shadow: 2048, particles: 2200, rain: 3800,  ao: true,  bloom: true },
  ultra:  { dpr: 2,    maxHeight: null, shadow: 4096, particles: 8192, rain: 14000, ao: true,  bloom: true },
};

export const QUALITY_DESCRIPTIONS = {
  low: 'Essential effects, reduced shadows and particles. Built for a consistent frame rate.',
  medium: 'Balanced visuals with bloom and denser particles.',
  high: 'Full shadows, ambient occlusion and rich weather. The intended look.',
  ultra: 'Maximum everything. For powerful GPUs only.',
};

export const CHAMPIONSHIP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2];

export const DEFAULT_SETTINGS = {
  quality: 'high',
  adaptive: false,
  abs: true,
  traction: true,
  volume: 0.65,
  music: true,
};
