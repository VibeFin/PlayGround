// All sounds are synthesized locally. No network assets or autoplay surprises.
export class DerbyAudio {
  constructor() { this.muted = false; this.ctx = null; }
  async init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : .45;
      const limiter=c.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.18;
      this.master.connect(limiter);limiter.connect(c.destination);
      this.engine = c.createOscillator(); this.engine.type = 'sawtooth';
      this.engine2 = c.createOscillator(); this.engine2.type = 'triangle';
      this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 240;
      this.motorGain = c.createGain(); this.motorGain.gain.value = 0;
      this.engine.connect(this.filter); this.engine2.connect(this.filter); this.filter.connect(this.motorGain); this.motorGain.connect(this.master);
      this.engine.start(); this.engine2.start();
      this.noise = c.createBuffer(1,c.sampleRate*2,c.sampleRate);
      const data=this.noise.getChannelData(0); for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const gravel=c.createBufferSource();gravel.buffer=this.noise;gravel.loop=true;
      const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=650;
      this.roadGain=c.createGain();this.roadGain.gain.value=0;gravel.connect(low);low.connect(this.roadGain);this.roadGain.connect(this.master);gravel.start();
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  mute() {this.muted=!this.muted;if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:.45,this.ctx.currentTime,.04);return this.muted;}
  update(speed,throttle,boost,active) {
    if(!this.ctx)return;const t=this.ctx.currentTime;
    const rpm=40+Math.abs(speed)*3.7+Math.abs(throttle)*20;
    this.engine.frequency.setTargetAtTime(rpm,t,.12);this.engine2.frequency.setTargetAtTime(rpm*.501,t,.12);
    this.filter.frequency.setTargetAtTime(180+Math.abs(speed)*19+(boost?300:0),t,.1);
    this.motorGain.gain.setTargetAtTime(active?.08+Math.abs(throttle)*.07:0,t,.15);
    this.roadGain.gain.setTargetAtTime(active?Math.min(.06,Math.abs(speed)*.002):0,t,.1);
  }
  hit(force=0.5) {
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime,f=Math.max(.1,Math.min(1,force));
    const src=c.createBufferSource();src.buffer=this.noise;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900+f*1800;
    const gain=c.createGain();gain.gain.setValueAtTime(f*.65,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12+f*.3);
    src.connect(filter);filter.connect(gain);gain.connect(this.master);src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};src.start();src.stop(t+.5);
    const osc=c.createOscillator(),g=c.createGain();osc.frequency.setValueAtTime(90,t);osc.frequency.exponentialRampToValueAtTime(25,t+.25);g.gain.setValueAtTime(f*.6,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);osc.connect(g);g.connect(this.master);osc.onended=()=>{osc.disconnect();g.disconnect();};osc.start();osc.stop(t+.31);
  }
  beep(final=false){if(!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.frequency.value=final?880:440;o.type='square';g.gain.setValueAtTime(.045,t);g.gain.exponentialRampToValueAtTime(.001,t+(final?.5:.14));o.connect(g);g.connect(this.master);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(t+.6);}
}
