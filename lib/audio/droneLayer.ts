import { rand, wander } from "./ambienceNoise";

export class DroneLayer {
  private ctx: AudioContext;
  private out: AudioNode;
  private output: GainNode;
  private oscillators: { osc: OscillatorNode; ratio: number; baseDetune: number; stopWander: () => void }[] = [];
  private voiceGains: GainNode[] = [];
  private wanderStops: (() => void)[] = [];
  private lpFilter: BiquadFilterNode;
  private currentMidi: number = 60;
  private rooted = false;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
    this.output = new GainNode(ctx, { gain: 0 });
    this.output.connect(out);

    const voices: { ratio: number; level: number; type: OscillatorType }[] = [
      { ratio: 0.5, level: 0.35, type: "sine" },
      { ratio: 1, level: 0.5, type: "triangle" },
      { ratio: 2, level: 0.22, type: "sine" },
      { ratio: 3, level: 0.1, type: "sine" },
      { ratio: 1.5, level: 0.12, type: "sine" }
    ];

    this.lpFilter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1200 });
    this.lpFilter.connect(this.output);

    voices.forEach(voice => {
      const voiceGain = new GainNode(ctx, { gain: voice.level });
      voiceGain.connect(this.lpFilter);
      this.voiceGains.push(voiceGain);

      const baseDetune1 = rand(-6, -1);
      const baseDetune2 = rand(1, 6);

      const osc1 = new OscillatorNode(ctx, { type: voice.type, frequency: this.midiToFreq(this.currentMidi) * voice.ratio, detune: baseDetune1 });
      const osc2 = new OscillatorNode(ctx, { type: voice.type, frequency: this.midiToFreq(this.currentMidi) * voice.ratio, detune: baseDetune2 });

      osc1.start(ctx.currentTime + rand(0, 0.5));
      osc2.start(ctx.currentTime + rand(0, 0.5));

      const osc1Panner = new StereoPannerNode(ctx, { pan: -0.55 });
      const osc2Panner = new StereoPannerNode(ctx, { pan: +0.55 });
      osc1.connect(osc1Panner).connect(voiceGain);
      osc2.connect(osc2Panner).connect(voiceGain);

      this.oscillators.push({ osc: osc1, ratio: voice.ratio, baseDetune: baseDetune1, stopWander: wander(osc1.detune, ctx, { min: baseDetune1 - 5, max: baseDetune1 + 5, minSec: 2, maxSec: 6, tc: 1.5 }) });
      this.oscillators.push({ osc: osc2, ratio: voice.ratio, baseDetune: baseDetune2, stopWander: wander(osc2.detune, ctx, { min: baseDetune2 - 5, max: baseDetune2 + 5, minSec: 2, maxSec: 6, tc: 1.5 }) });

      this.wanderStops.push(wander(voiceGain.gain, ctx, { min: voice.level * 0.55, max: voice.level, minSec: 4, maxSec: 12, tc: 2.5 }));
    });

    this.wanderStops.push(wander(this.lpFilter.frequency, ctx, { min: 600, max: 1800, minSec: 5, maxSec: 14, tc: 3 }));
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setLevel(v: number): void {
    const now = this.ctx.currentTime;
    this.output.gain.setTargetAtTime(v * 0.4, now, 0.4);
  }
  setRoot(midi: number): void {
    this.currentMidi = midi;
    const now = this.ctx.currentTime;
    if (!this.rooted) {
      this.oscillators.forEach(({ osc, ratio }) => {
        osc.frequency.value = this.midiToFreq(midi) * ratio;
      });
      this.rooted = true;
    } else {
      this.oscillators.forEach(({ osc, ratio }) => {
        osc.frequency.setTargetAtTime(this.midiToFreq(midi) * ratio, now, 0.5);
      });
    }
  }
  dispose(): void {
    this.oscillators.forEach(({ osc, stopWander }) => {
      stopWander();
      osc.stop();
      osc.disconnect();
    });
    this.wanderStops.forEach(stop => stop());
    this.lpFilter.disconnect();
    this.output.disconnect();
  }
}