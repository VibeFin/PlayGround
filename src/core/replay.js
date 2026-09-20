/**
 * 30 Hz replay recorder (minified `AB` + `MB` accumulator, capped 5400).
 * Stores minimal pose frames; playback lerps between them.
 */

export class Replay {
  constructor(maxFrames = 5400) {
    this.maxFrames = maxFrames;
    this.frames = [];
    this.accumulator = 0;
    this.playhead = 0;
  }

  clear() {
    this.frames = [];
    this.accumulator = 0;
    this.playhead = 0;
  }

  get length() {
    return this.frames.length;
  }

  record(dt, cars) {
    this.accumulator += dt;
    if (this.accumulator < 1 / 30) return;
    this.accumulator = 0;
    if (this.frames.length >= this.maxFrames) this.frames.shift();
    this.frames.push({
      time: (this.frames.at(-1)?.time ?? 0) + 1 / 30,
      cars: cars.map((c) => ({
        s: c.s, lateral: c.lateral, heading: c.heading,
        speed: c.speed, steer: c.steer, damage: c.damage,
      })),
    });
  }

  /** Interpolated snapshot at `time` seconds. */
  sample(time) {
    if (!this.frames.length) return null;
    const looped = time % (this.frames.at(-1).time || 1);
    let i = 0;
    while (i < this.frames.length - 1 && this.frames[i + 1].time < looped) i++;
    return this.frames[i];
  }
}
