import { rand } from "./ambienceNoise";
import { AmbienceSample, pitchRatioFor } from "./sampleBank";

export interface BedOptions {
  segmentSec: number;
  fadeSec: number;
  rateJitter: number;
  level?: number;
}

export class SampleBedLayer {
  private ctx: AudioContext;
  private out: AudioNode;
  private sample: AmbienceSample;
  private opts: BedOptions;
  private output: GainNode;
  private nextStartTime: number = 0;
  private lastOffset: number = 0;
  private schedulerId: number | null = null;
  private level: number = 0;
  private pitchRatio: number = 1;

  constructor(ctx: AudioContext, out: AudioNode, sample: AmbienceSample, opts: BedOptions) {
    this.ctx = ctx;
    this.out = out;
    this.sample = sample;
    this.opts = opts;
    this.output = new GainNode(ctx, { gain: 0 });
    this.output.connect(out);
  }

  setLevel(v: number): void {
    this.level = v;
    this.output.gain.setTargetAtTime(v * this.sample.gain * (this.opts.level ?? 1), this.ctx.currentTime, 0.4);
    if (v > 0.001 && this.schedulerId === null) {
      this.scheduleNextSegment();
    }
  }

  setPitchRatio(r: number): void {
    this.pitchRatio = r;
  }

  dispose(): void {
    if (this.schedulerId !== null) {
      clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
    this.output.disconnect();
  }

  private scheduleNextSegment(): void {
    this.schedulerId = null; // the timer that called us has fired
    const now = this.ctx.currentTime;
    if (this.level <= 0.001) {
      return;
    }
    if (this.nextStartTime === 0) {
      this.nextStartTime = now + 0.05;
    }
    while (this.nextStartTime < now + 1.0) {
      this.scheduleSegment(this.nextStartTime);
      this.nextStartTime += this.opts.segmentSec - this.opts.fadeSec;
    }
    this.schedulerId = window.setTimeout(() => this.scheduleNextSegment(), 250);
  }

  private scheduleSegment(startTime: number): void {
    const segLen = Math.min(this.opts.segmentSec, this.sample.buffer.duration - 0.2);
    let offset = rand(0, Math.max(0, this.sample.buffer.duration - segLen));
    let attempts = 0;
    while (Math.abs(offset - this.lastOffset) < 2 && attempts < 5) {
      offset = rand(0, Math.max(0, this.sample.buffer.duration - segLen));
      attempts++;
    }
    this.lastOffset = offset;
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.sample.buffer, playbackRate: this.pitchRatio * rand(1 - this.opts.rateJitter, 1 + this.opts.rateJitter) });
    const envelope = new GainNode(this.ctx, { gain: 0 });
    source.connect(envelope).connect(this.output);
    const fadeInCurve = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      fadeInCurve[i] = Math.sin((i / 63) * Math.PI / 2);
    }
    const fadeOutCurve = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      fadeOutCurve[i] = Math.cos((i / 63) * Math.PI / 2);
    }
    envelope.gain.setValueCurveAtTime(fadeInCurve, startTime, this.opts.fadeSec);
    envelope.gain.setValueCurveAtTime(fadeOutCurve, startTime + segLen - this.opts.fadeSec, this.opts.fadeSec);
    source.start(startTime, offset);
    source.stop(startTime + segLen + 0.1);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
    };
  }
}

export class PitchedBedLayer {
  private bed: SampleBedLayer;
  private sample: AmbienceSample;

  constructor(ctx: AudioContext, out: AudioNode, sample: AmbienceSample, opts: BedOptions) {
    this.sample = sample;
    this.bed = new SampleBedLayer(ctx, out, sample, opts);
  }

  setLevel(v: number): void {
    this.bed.setLevel(v);
  }

  setRoot(midi: number): void {
    if (this.sample.pitchHz !== null) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      this.bed.setPitchRatio(pitchRatioFor(this.sample.pitchHz, f));
    }
  }

  dispose(): void {
    this.bed.dispose();
  }
}