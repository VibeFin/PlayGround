// Small synthesized cues keep the skirmish self-contained (no asset downloads).
export function createSound() {
  let context;
  let muted = false;
  let lastCombat = 0;
  const tones = {
    select: [[440, .035], [660, .06]],
    order: [[330, .04], [495, .08]],
    build: [[220, .07], [330, .07], [440, .12]],
    combat: [[110, .045]],
    spell: [[440, .1], [660, .1], [880, .2]],
    victory: [[392, .18], [494, .18], [587, .18], [784, .5]],
    defeat: [[294, .2], [247, .2], [196, .4]],
  };
  function unlock() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) context = new AudioContext();
    }
    if (context?.state === 'suspended') context.resume().catch(() => {});
  }
  function play(type) {
    if (muted || !context || context.state !== 'running') return;
    if (type === 'combat') {
      if (performance.now() - lastCombat < 180) return;
      lastCombat = performance.now();
    }
    let start = context.currentTime;
    for (const [frequency, duration] of tones[type] || tones.order) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type === 'combat' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (type === 'combat') oscillator.frequency.exponentialRampToValueAtTime(45, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(type === 'combat' ? .04 : .022, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + .015);
      start += duration;
    }
  }
  return { unlock, play, toggle() { muted = !muted; return muted; }, get muted() { return muted; } };
}
