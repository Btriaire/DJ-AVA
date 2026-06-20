// Delay-line pitch shifter (Chris Wilson's "Jungle" technique).
//
// Shifts pitch up or down *without changing playback speed*. We feed it a
// sample played at its natural rate (playbackRate = 1) so the loop keeps its
// exact tempo, and the shifter transposes the pitch on top — letting the synth
// change octaves/keys while "maintaining the timing".
//
// Two modulated delay lines are swept in opposite directions and crossfaded so
// one is always in its smooth middle region while the other re-laps, producing
// a continuous resampled (pitch-shifted) stream.

const DELAY_TIME = 0.1;
const FADE_TIME = 0.05;
const BUFFER_TIME = 0.1;

function createFadeBuffer(ctx: AudioContext, activeTime: number, fadeTime: number) {
  const sr = ctx.sampleRate;
  const length1 = activeTime * sr;
  const length2 = (activeTime - 2 * fadeTime) * sr;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, sr);
  const p = buffer.getChannelData(0);
  const fadeLength = fadeTime * sr;
  const fadeIndex1 = fadeLength;
  const fadeIndex2 = length1 - fadeLength;
  for (let i = 0; i < length1; ++i) {
    let value: number;
    if (i < fadeIndex1) value = Math.sqrt(i / fadeLength);
    else if (i >= fadeIndex2) value = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
    else value = 1;
    p[i] = value;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

function createDelayTimeBuffer(
  ctx: AudioContext,
  activeTime: number,
  fadeTime: number,
  shiftUp: boolean
) {
  const sr = ctx.sampleRate;
  const length1 = activeTime * sr;
  const length2 = (activeTime - 2 * fadeTime) * sr;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, sr);
  const p = buffer.getChannelData(0);
  for (let i = 0; i < length1; ++i) {
    p[i] = shiftUp ? (length1 - i) / length : i / length1;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

export class PitchShifter {
  readonly input: GainNode;
  readonly output: GainNode;

  private nodes: AudioScheduledSourceNode[] = [];
  private mod1Gain: GainNode;
  private mod2Gain: GainNode;
  private mod3Gain: GainNode;
  private mod4Gain: GainNode;
  private modGain1: GainNode;
  private modGain2: GainNode;
  private started = false;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const shiftDown = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
    const shiftUp = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);
    const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);

    const mod1 = ctx.createBufferSource();
    const mod2 = ctx.createBufferSource();
    const mod3 = ctx.createBufferSource();
    const mod4 = ctx.createBufferSource();
    mod1.buffer = shiftDown;
    mod2.buffer = shiftDown;
    mod3.buffer = shiftUp;
    mod4.buffer = shiftUp;
    [mod1, mod2, mod3, mod4].forEach((m) => (m.loop = true));

    this.mod1Gain = ctx.createGain();
    this.mod2Gain = ctx.createGain();
    this.mod3Gain = ctx.createGain();
    this.mod4Gain = ctx.createGain();
    this.mod3Gain.gain.value = 0;
    this.mod4Gain.gain.value = 0;

    mod1.connect(this.mod1Gain);
    mod2.connect(this.mod2Gain);
    mod3.connect(this.mod3Gain);
    mod4.connect(this.mod4Gain);

    this.modGain1 = ctx.createGain();
    this.modGain2 = ctx.createGain();
    const delay1 = ctx.createDelay();
    const delay2 = ctx.createDelay();
    this.mod1Gain.connect(this.modGain1);
    this.mod3Gain.connect(this.modGain1);
    this.mod2Gain.connect(this.modGain2);
    this.mod4Gain.connect(this.modGain2);
    this.modGain1.connect(delay1.delayTime);
    this.modGain2.connect(delay2.delayTime);

    const fade1 = ctx.createBufferSource();
    const fade2 = ctx.createBufferSource();
    fade1.buffer = fadeBuffer;
    fade2.buffer = fadeBuffer;
    fade1.loop = true;
    fade2.loop = true;

    const mix1 = ctx.createGain();
    const mix2 = ctx.createGain();
    mix1.gain.value = 0;
    mix2.gain.value = 0;
    fade1.connect(mix1.gain);
    fade2.connect(mix2.gain);

    this.input.connect(delay1);
    this.input.connect(delay2);
    delay1.connect(mix1);
    delay2.connect(mix2);
    mix1.connect(this.output);
    mix2.connect(this.output);

    this.nodes = [mod1, mod2, mod3, mod4, fade1, fade2];
  }

  start(when = this.ctx.currentTime + 0.02) {
    if (this.started) return;
    this.started = true;
    const t2 = when + BUFFER_TIME - FADE_TIME;
    const [mod1, mod2, mod3, mod4, fade1, fade2] = this.nodes as AudioBufferSourceNode[];
    mod1.start(when);
    mod2.start(t2);
    mod3.start(when);
    mod4.start(t2);
    fade1.start(when);
    fade2.start(t2);
  }

  // semitones: how many semitones to transpose (can be fractional)
  setSemitones(semitones: number) {
    const mult = semitones / 12; // octaves
    if (mult > 0) {
      this.mod1Gain.gain.value = 0;
      this.mod2Gain.gain.value = 0;
      this.mod3Gain.gain.value = 1;
      this.mod4Gain.gain.value = 1;
    } else {
      this.mod1Gain.gain.value = 1;
      this.mod2Gain.gain.value = 1;
      this.mod3Gain.gain.value = 0;
      this.mod4Gain.gain.value = 0;
    }
    const d = 0.5 * DELAY_TIME * Math.abs(mult);
    this.modGain1.gain.setTargetAtTime(d, this.ctx.currentTime, 0.01);
    this.modGain2.gain.setTargetAtTime(d, this.ctx.currentTime, 0.01);
  }

  dispose(when = this.ctx.currentTime) {
    this.nodes.forEach((n) => {
      try {
        n.stop(when);
      } catch {}
    });
    setTimeout(() => {
      try {
        this.input.disconnect();
        this.output.disconnect();
        this.nodes.forEach((n) => n.disconnect());
      } catch {}
    }, Math.max(0, (when - this.ctx.currentTime) * 1000) + 200);
  }
}
