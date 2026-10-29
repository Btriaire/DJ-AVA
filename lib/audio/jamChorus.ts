// Stereo chorus that widens the synth (MaRuche/Falken)
export class StereoChorus {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  public width = 0;

  constructor(ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.output = ctx.createGain();

    const panner = ctx.createStereoPanner();
    const merger = ctx.createChannelMerger(2);

    this.input.connect(this.dry).connect(panner).connect(this.output);
    this.input.connect(this.createDelayChain(ctx, 0.012, 0.31)).connect(merger, 0, 0);
    this.input.connect(this.createDelayChain(ctx, 0.017, 0.43)).connect(merger, 0, 1);
    merger.connect(this.wet).connect(this.output);

    this.output.channelCount = 2;
    this.output.channelCountMode = "explicit";
    this.setWidth(0);
  }

  private createDelayChain(ctx: BaseAudioContext, delayTime: number, lfoFreq: number): DelayNode {
    const delay = ctx.createDelay(0.05);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    delay.delayTime.value = delayTime;
    lfo.frequency.value = lfoFreq;
    lfoGain.gain.value = 0.003;

    lfo.connect(lfoGain).connect(delay.delayTime);
    lfo.start();

    return delay;
  }

  setWidth(v: number): void {
    this.width = v;
    this.wet.gain.setTargetAtTime(0.7 * v, 0, 0.03);
    this.dry.gain.setTargetAtTime(1 - 0.25 * v, 0, 0.03);
  }
}

export function selfTest(): void {
  if (typeof OfflineAudioContext === "undefined") return;
  const ctx = new OfflineAudioContext(2, 128, 44100);
  const chorus = new StereoChorus(ctx);
  chorus.setWidth(0.5);
  if (chorus.width !== 0.5) throw new Error("Width mismatch");
}
