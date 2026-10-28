// Soft sustained voices for the rhythm links: choir, strings, dreamy synth. Built apart from the DJ synth so the link
// never changes its sound. What makes it read as a group of players in a room, not a synth:
//  - an ensemble: several voices per note, each with its own detune, pan, vibrato rate and vibrato delay
//  - a room: a generated stereo impulse response (convolution reverb), not an echo
//  - choir: vowels (formants) that drift during the note, breath noise, a soft glottal edge
//  - legato: a note that follows another within 0.4 s glides from it, and the old note fades instead of piling up
export type PadStyle = "choir" | "strings" | "dream";

const midiFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// vowel formants [Hz, Q, gain]
const VOWELS: Record<string, [number, number, number][]> = {
  ah: [[800, 9, 1], [1150, 11, 0.5], [2900, 14, 0.2]],
  oh: [[450, 9, 1], [800, 11, 0.45], [2830, 14, 0.15]],
  eh: [[600, 9, 1], [1700, 11, 0.4], [2600, 14, 0.2]],
};

interface Last { freq: number; end: number; amp: GainNode }

export class PadVoices {
  readonly out: GainNode;
  private readonly send: GainNode;
  private noise: AudioBuffer;
  private last: Partial<Record<PadStyle, Last>> = {};

  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.send = ctx.createGain();
    this.send.gain.value = 0.55;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    this.send.connect(verb);
    verb.connect(wet);
    wet.connect(this.out);
    this.out.connect(dest);
    // one second of noise, reused for the breath
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // a room: decaying noise, darker as it fades, different on each ear
  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n;
        const k = 0.9 - 0.8 * x; // low-pass gets stronger over time
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        d[i] = lp * (1 - x) ** 2.4 * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
      }
    }
    return buf;
  }

  play(style: PadStyle, midi: number, vel: number, when: number, dur: number): void {
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime);
    const f = midiFreq(midi);
    const hold = Math.max(dur, 0.45);
    const atk = style === "strings" ? rnd(0.14, 0.24) : rnd(0.22, 0.4);
    const rel = style === "dream" ? 1.8 : 1.1;
    const end = t + hold + rel;
    const level = Math.min(1, vel) * 0.5;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(level, t + atk);
    amp.gain.linearRampToValueAtTime(level * 0.8, t + atk + 0.5); // a swell, then a steady sustain
    amp.gain.setValueAtTime(level * 0.8, t + hold);
    amp.gain.linearRampToValueAtTime(0, end);

    // legato: the previous note of this style gives way, and this one glides in from it
    const prev = this.last[style];
    let startFreq = f;
    if (prev && t - prev.end < 0.4) {
      prev.amp.gain.cancelScheduledValues(t);
      prev.amp.gain.setValueAtTime(prev.amp.gain.value, t);
      prev.amp.gain.linearRampToValueAtTime(0, t + 0.18);
      if (Math.abs(12 * Math.log2(prev.freq / f)) < 8) startFreq = prev.freq;
    }
    this.last[style] = { freq: f, end: t + hold, amp };

    const tone = ctx.createGain();
    const voices = style === "dream" ? 3 : style === "strings" ? 5 : 4;
    const nodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
    for (let v = 0; v < voices; v++) {
      const spread = voices === 1 ? 0 : v / (voices - 1) * 2 - 1;
      const types: OscillatorType[] = style === "dream" ? ["sine", "triangle", "sine"] : style === "strings" ? ["sawtooth"] : ["sawtooth", "triangle"];
      const o = ctx.createOscillator();
      o.type = types[v % types.length];
      o.frequency.setValueAtTime(startFreq, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      o.detune.value = rnd(-6, 6) + spread * 3;
      // each singer has her own vibrato: speed, depth, and when it begins
      const lfo = ctx.createOscillator();
      lfo.frequency.value = style === "dream" ? rnd(0.5, 1.2) : rnd(4.6, 5.9);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + atk + rnd(0.05, 0.3));
      depth.gain.linearRampToValueAtTime(style === "dream" ? rnd(4, 9) : rnd(6, 14), t + atk + rnd(0.6, 1.1));
      lfo.connect(depth);
      depth.connect(o.detune);
      const pan = ctx.createStereoPanner();
      pan.pan.value = spread * 0.7;
      const g = ctx.createGain();
      g.gain.value = 1 / Math.sqrt(voices);
      o.connect(g);
      g.connect(pan);
      pan.connect(tone);
      nodes.push(o, lfo);
    }

    if (style === "choir") {
      // vowel: starts on one and drifts toward another while the note is held
      const names = Object.keys(VOWELS);
      const a = VOWELS[names[Math.floor(Math.random() * names.length)]];
      const b = VOWELS[names[Math.floor(Math.random() * names.length)]];
      const sum = ctx.createGain();
      for (let i = 0; i < 3; i++) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(a[i][0], t);
        bp.frequency.linearRampToValueAtTime(b[i][0], t + hold);
        bp.Q.value = a[i][1];
        const gn = ctx.createGain();
        gn.gain.value = a[i][2] * 2.4;
        tone.connect(bp);
        bp.connect(gn);
        gn.connect(sum);
      }
      // the breath around the vowel
      const br = ctx.createBufferSource();
      br.buffer = this.noise;
      br.loop = true;
      const bf = ctx.createBiquadFilter();
      bf.type = "bandpass";
      bf.frequency.value = 2600;
      bf.Q.value = 0.8;
      const bg = ctx.createGain();
      bg.gain.value = 0.09;
      br.connect(bf);
      bf.connect(bg);
      bg.connect(sum);
      nodes.push(br);
      // the glottal edge is softened: choir voices are not buzzy
      const soft = ctx.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = 5200;
      sum.connect(soft);
      soft.connect(amp);
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.5;
      // strings open up as the bow takes; the dream pad stays dark
      lp.frequency.setValueAtTime(style === "strings" ? 900 : 700, t);
      lp.frequency.linearRampToValueAtTime(style === "strings" ? 3200 : 1700, t + atk + 0.4);
      tone.gain.value = style === "dream" ? 0.9 : 0.6;
      tone.connect(lp);
      lp.connect(amp);
    }

    amp.connect(this.out);
    amp.connect(this.send);
    nodes.forEach((n) => { n.start(t); n.stop(end + 0.05); });
  }
}
