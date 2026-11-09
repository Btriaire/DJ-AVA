import { rand, loopedNoiseBuffer, wander } from "./ambienceNoise";

export class WindLayer {
  private ctx: AudioContext;
  private output: GainNode;
  private noiseBuffer: AudioBuffer;
  private leftVoice: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    panner: StereoPannerNode;
    wanderFreq: () => void;
    wanderQ: () => void;
  };
  private rightVoice: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    panner: StereoPannerNode;
    wanderFreq: () => void;
    wanderQ: () => void;
  };
  private growlSource: AudioBufferSourceNode;
  private growlGain: GainNode;
  private growlFilter: BiquadFilterNode;
  private whistleSource: AudioBufferSourceNode;
  private whistleFilter: BiquadFilterNode;
  private whistleGain: GainNode;
  private whistleWander: () => void;
  private gustTimer: number | null = null;
  private level: number = 0;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.output = new GainNode(ctx, { gain: 0 });
    this.output.connect(out);

    this.noiseBuffer = loopedNoiseBuffer(ctx, 22, 2);

    // Left voice
    this.leftVoice = this.createVoice(-0.6, { min: 220, max: 900, minSec: 2.5, maxSec: 7 }, { min: 0.6, max: 1.8, minSec: 3, maxSec: 8 });

    // Right voice
    this.rightVoice = this.createVoice(0.6, { min: 300, max: 1100, minSec: 2.5, maxSec: 7 }, { min: 0.6, max: 1.8, minSec: 3, maxSec: 8 });

    // Growl
    this.growlSource = new AudioBufferSourceNode(ctx, { buffer: this.noiseBuffer, loop: true });
    this.growlFilter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 140, Q: 1 });
    this.growlGain = new GainNode(ctx, { gain: 0.15 });
    this.growlSource.connect(this.growlFilter);
    this.growlFilter.connect(this.growlGain);
    this.growlGain.connect(this.output);
    this.growlSource.start(0, rand(0, 15));

    // Whistle
    this.whistleSource = new AudioBufferSourceNode(ctx, { buffer: this.noiseBuffer, loop: true });
    this.whistleFilter = new BiquadFilterNode(ctx, { type: "bandpass", Q: 30 });
    this.whistleGain = new GainNode(ctx, { gain: 0 });
    this.whistleSource.connect(this.whistleFilter);
    this.whistleFilter.connect(this.whistleGain);
    this.whistleGain.connect(this.output);
    this.whistleSource.start(0, rand(0, 15));
    this.whistleWander = wander(this.whistleFilter.frequency, ctx, { min: 900, max: 2100, minSec: 3, maxSec: 9 });

    this.scheduleGust();
  }

  private createVoice(pan: number, freqOpts: { min: number; max: number; minSec: number; maxSec: number }, qOpts: { min: number; max: number; minSec: number; maxSec: number }) {
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.noiseBuffer, loop: true });
    const filter = new BiquadFilterNode(this.ctx, { type: "bandpass" });
    const gain = new GainNode(this.ctx, { gain: 0.35 });
    const panner = new StereoPannerNode(this.ctx, { pan });

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.output);

    source.start(0, rand(0, 15));

    const wanderFreq = wander(filter.frequency, this.ctx, freqOpts);
    const wanderQ = wander(filter.Q, this.ctx, qOpts);

    return { source, filter, gain, panner, wanderFreq, wanderQ };
  }

  private scheduleGust() {
    if (this.level < 0.001) return;

    const g = rand(0.05, 1.0);
    const t = this.ctx.currentTime;
    const riseTime = rand(1.2, 3.5);

    this.leftVoice.gain.gain.setTargetAtTime(g * 0.8, t, riseTime);
    this.rightVoice.gain.gain.setTargetAtTime(g * 0.7, t, riseTime);

    if (g > 0.6) {
      this.whistleGain.gain.setTargetAtTime((g - 0.6) * 0.12, t, 1.5);
    } else {
      this.whistleGain.gain.setTargetAtTime(0.0, t, 1.5);
    }

    this.gustTimer = window.setTimeout(() => this.scheduleGust(), rand(4, 11) * 1000);
  }

  setLevel(v: number) {
    this.level = v;
    const now = this.ctx.currentTime;
    this.output.gain.setTargetAtTime(v * 3.5, now, 0.4);

    if (v < 0.001) {
      if (this.gustTimer !== null) {
        clearTimeout(this.gustTimer);
        this.gustTimer = null;
      }
    } else if (this.gustTimer === null) {
      this.scheduleGust();
    }
  }

  dispose() {
    this.leftVoice.source.stop();
    this.rightVoice.source.stop();
    this.growlSource.stop();
    this.whistleSource.stop();

    this.leftVoice.wanderFreq();
    this.leftVoice.wanderQ();
    this.rightVoice.wanderFreq();
    this.rightVoice.wanderQ();
    this.whistleWander();

    if (this.gustTimer !== null) {
      clearTimeout(this.gustTimer);
    }

    this.output.disconnect();
  }
}