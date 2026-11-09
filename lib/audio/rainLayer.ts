import { rand, loopedNoiseBuffer, wander } from "./ambienceNoise";

export class RainLayer {
  private ctx: AudioContext;
  private output: GainNode;
  private bedGain: GainNode;
  private dropInterval: number | null = null;
  private bigDropInterval: number | null = null;
  private nextDrop: number = 0;
  private nextBigDrop: number = 0;
  private whiteNoiseBuffer: AudioBuffer;
  private wanderStop: (() => void) | null = null;
  private sources: AudioBufferSourceNode[] = [];

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.output = new GainNode(ctx, { gain: 0 });
    this.output.connect(out);

    const rainBuffer = loopedNoiseBuffer(ctx, 18, 2);
    this.whiteNoiseBuffer = loopedNoiseBuffer(ctx, 0.1, 2);

    const rainSource = new AudioBufferSourceNode(ctx, { buffer: rainBuffer, loop: true, loopStart: 0, loopEnd: rainBuffer.duration });
    const rainHighpass = new BiquadFilterNode(ctx, { type: "highpass", frequency: 600 });
    const rainLowpass = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 7500 });
    this.bedGain = new GainNode(ctx, { gain: 0.35 });

    rainSource.connect(rainHighpass);
    rainHighpass.connect(rainLowpass);
    rainLowpass.connect(this.bedGain);
    this.bedGain.connect(this.output);

    const thunderSource = new AudioBufferSourceNode(ctx, { buffer: rainBuffer, loop: true, loopStart: 0, loopEnd: rainBuffer.duration });
    const thunderLowpass = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 350 });
    const thunderGain = new GainNode(ctx, { gain: 0.12 });

    thunderSource.connect(thunderLowpass);
    thunderLowpass.connect(thunderGain);
    thunderGain.connect(this.output);

    rainSource.start(0, rand(0, 10));
    thunderSource.start(0, rand(0, 10));
    this.sources.push(rainSource, thunderSource);

    this.wanderStop = wander(this.bedGain.gain, ctx, { min: 0.25, max: 0.45, minSec: 3, maxSec: 8 });
  }

  private scheduleDrops(): void {
    if (this.dropInterval !== null) return;

    this.dropInterval = window.setInterval(() => {
      if (this.output.gain.value <= 0.001) return;

      const now = this.ctx.currentTime;
      const maxTime = now + 0.25;
      if (this.nextDrop < now) this.nextDrop = now;
      while (this.nextDrop < maxTime) {
        const interval = -Math.log(1 - Math.random()) / 28;
        this.nextDrop += interval;

        if (this.nextDrop < maxTime) {
          this.createDrop(this.nextDrop);
        }
      }
    }, 80);

    this.bigDropInterval = window.setInterval(() => {
      if (this.output.gain.value <= 0.001) return;

      const now = this.ctx.currentTime;
      const maxTime = now + 0.25;

      if (this.nextBigDrop < now) this.nextBigDrop = now;
      while (this.nextBigDrop < maxTime) {
        const interval = -Math.log(1 - Math.random()) / 1.6;
        this.nextBigDrop += interval;

        if (this.nextBigDrop < maxTime) {
          this.createBigDrop(this.nextBigDrop);
        }
      }
    }, 80);
  }

  private createDrop(time: number): void {
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.whiteNoiseBuffer });
    const bandpass = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: rand(1500, 7500), Q: rand(3, 9) });
    const gain = new GainNode(this.ctx, { gain: 0 });
    const panner = new StereoPannerNode(this.ctx, { pan: rand(-0.9, 0.9) });

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panner);
    panner.connect(this.output);

    const a = 0.03 * Math.exp(rand(0, 2.2));
    const attackTime = 0.0007;
    const decayTime = rand(0.008, 0.03);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(a, time + attackTime);
    gain.gain.setTargetAtTime(0.0001, time + attackTime, decayTime);

    source.start(time);
    source.stop(time + 0.1);
  }

  private createBigDrop(time: number): void {
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.whiteNoiseBuffer });
    const bandpass = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: rand(500, 1800), Q: rand(2, 5) });
    const gain = new GainNode(this.ctx, { gain: 0 });
    const panner = new StereoPannerNode(this.ctx, { pan: rand(-0.9, 0.9) });

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panner);
    panner.connect(this.output);

    const a = 0.1 * Math.exp(rand(0, 1.4));
    const attackTime = 0.0007;
    const decayTime = rand(0.04, 0.09);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(a, time + attackTime);
    gain.gain.setTargetAtTime(0.0001, time + attackTime, decayTime);

    source.start(time);
    source.stop(time + 0.1);
  }

  setLevel(v: number): void {
    this.output.gain.setTargetAtTime(v * 4.5, this.ctx.currentTime, 0.4);

    if (v > 0.001 && this.dropInterval === null) {
      this.nextDrop = this.ctx.currentTime;
      this.nextBigDrop = this.ctx.currentTime;
      this.scheduleDrops();
    } else if (v <= 0.001) {
      if (this.dropInterval !== null) {
        clearInterval(this.dropInterval);
        this.dropInterval = null;
      }
      if (this.bigDropInterval !== null) {
        clearInterval(this.bigDropInterval);
        this.bigDropInterval = null;
      }
    }
  }
dispose(): void {
    if (this.wanderStop !== null) {
      this.wanderStop();
    }

    if (this.dropInterval !== null) {
      clearInterval(this.dropInterval);
    }

    if (this.bigDropInterval !== null) {
      clearInterval(this.bigDropInterval);
    }

    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* déjà arrêtée */
      }
    }

    this.output.disconnect();
  }
}