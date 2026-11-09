import { rand } from "./ambienceNoise";
import { AmbienceSample, pitchRatioFor } from "./sampleBank";

export class SampleBowlLayer {
  private ctx: AudioContext;
  private output: GainNode;
  private sample: AmbienceSample;
  private root: number = 48;
  private timer: number | null = null;
  private level: number = 0;

  constructor(ctx: AudioContext, out: AudioNode, sample: AmbienceSample) {
    this.ctx = ctx;
    this.sample = sample;
    this.output = new GainNode(ctx, { gain: 0 });
    this.output.connect(out);
  }

  setLevel(v: number): void {
    this.level = v;
    this.output.gain.setTargetAtTime(v * 3, this.ctx.currentTime, 0.4);
    if (v > 0.001) {
      if (this.timer === null) {
        this.timer = window.setTimeout(() => this.scheduleStrike(), 1200);
      }
    } else {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }

  setRoot(midi: number): void {
    this.root = midi;
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.output.disconnect();
  }

  private scheduleStrike(): void {
    if (this.level > 0.001) {
      this.strike();
      this.timer = window.setTimeout(() => this.scheduleStrike(), rand(6, 14) * 1000);
    } else {
      this.timer = null;
    }
  }

  private strike(): void {
    const intervals = [0, 0, 0, 7, 12];
    const interval = intervals[Math.floor(rand(0, intervals.length))];
    const targetHz = 440 * Math.pow(2, ((this.root + 12 + interval - 69) / 12));
    const ratio = this.sample.pitchHz ? pitchRatioFor(this.sample.pitchHz, targetHz) : 1;

    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.sample.buffer, playbackRate: ratio });
    const velocity = rand(0.6, 1) * this.sample.gain * 0.9;
    const gainNode = new GainNode(this.ctx, { gain: velocity });
    const panner = new StereoPannerNode(this.ctx, { pan: rand(-0.3, 0.3) });

    source.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.output);

    source.start(this.ctx.currentTime);
  }
}