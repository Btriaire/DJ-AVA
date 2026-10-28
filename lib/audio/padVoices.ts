// Soft sustained voices for the rhythm links: choir, strings, dreamy synth. Built apart from the DJ synth so the link
// never changes its sound. Each note is a few detuned oscillators through a filter, with a slow attack and release.
export type PadStyle = "choir" | "strings" | "dream";

const midiFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

// vowel "ah" formants: the choir colour
const FORMANTS: [number, number, number][] = [[800, 8, 1], [1150, 10, 0.5], [2900, 12, 0.25]];

export class PadVoices {
  readonly out: GainNode;
  private readonly delay: DelayNode;
  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    // a little feedback echo gives the "floating" tail without a reverb buffer
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.2;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.out);
    this.out.connect(dest);
  }

  play(style: PadStyle, midi: number, vel: number, when: number, dur: number): void {
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime);
    const f = midiFreq(midi);
    const atk = style === "strings" ? 0.18 : 0.35;
    const rel = style === "dream" ? 1.6 : 0.9;
    const hold = Math.max(dur, 0.5);
    const end = t + hold + rel;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(Math.min(1, vel) * 0.6, t + atk);
    amp.gain.setValueAtTime(Math.min(1, vel) * 0.6, t + hold);
    amp.gain.linearRampToValueAtTime(0, end);

    const stage = ctx.createGain();
    const oscs: [OscillatorType, number, number][] =
      style === "choir" ? [["sawtooth", -5, 1], ["sawtooth", 5, 1], ["triangle", 0, 1]] :
      style === "strings" ? [["sawtooth", -7, 1], ["sawtooth", 0, 1], ["sawtooth", 7, 1]] :
      [["sine", -3, 1], ["triangle", 3, 2], ["sine", 0, 0.5]];
    const nodes: OscillatorNode[] = oscs.map(([type, cents, mult]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = cents;
      o.connect(stage);
      return o;
    });
    // slow vibrato, delayed so a held note starts steady
    const lfo = ctx.createOscillator();
    lfo.frequency.value = style === "dream" ? 0.9 : 5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(style === "dream" ? 6 : 3, t + hold * 0.6);
    lfo.connect(depth);
    nodes.forEach((o) => depth.connect(o.detune));
    nodes.push(lfo);

    if (style === "choir") {
      const sum = ctx.createGain();
      for (const [fr, q, g] of FORMANTS) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = fr;
        bp.Q.value = q;
        const gn = ctx.createGain();
        gn.gain.value = g * 2.2;
        stage.connect(bp);
        bp.connect(gn);
        gn.connect(sum);
      }
      sum.connect(amp);
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = style === "strings" ? 2400 : 1500;
      lp.Q.value = 0.4;
      stage.gain.value = style === "dream" ? 0.8 : 0.5;
      stage.connect(lp);
      lp.connect(amp);
    }
    amp.connect(this.out);
    amp.connect(this.delay);
    nodes.forEach((o) => { o.start(t); o.stop(end + 0.05); });
  }
}
