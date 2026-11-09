export type ChoirVowel = "a" | "e" | "i" | "o" | "u";
export const FORMANTS: Record<ChoirVowel, { freq: [number, number, number]; gain: [number, number, number] }> = {
  a: { freq: [800, 1150, 2800], gain: [1, 0.5, 0.18] },
  e: { freq: [400, 1700, 2600], gain: [1, 0.35, 0.18] },
  i: { freq: [300, 2100, 2900], gain: [1, 0.3, 0.15] },
  o: { freq: [450, 800, 2830], gain: [1, 0.45, 0.12] },
  u: { freq: [325, 700, 2530], gain: [1, 0.3, 0.08] },
};

export function voicing(chord: number[], low: number): number[] {
  if (chord.length === 0) return [];
  const pc = (n: number) => (((n - low) % 12) + 12) % 12;
  const set = new Set<number>(chord.map((n) => low + pc(n)));
  set.add(low + 12 + pc(chord[0]));
  return [...set].sort((a, b) => a - b);
}

export function choirVoice(ctx: BaseAudioContext, dest: AudioNode, midi: number, at: number, dur: number, vowels: { at: number; v: ChoirVowel }[], vel: number, pan: number): void {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const end = at + Math.max(0.3, dur);
  const v0 = vowels[0]?.v ?? "a";

  const src = ctx.createGain();
  src.gain.value = 1;
  src.connect(dest);

  const oscs: OscillatorNode[] = [];
  const cents = [-8, 0, 8];
  for (const c of cents) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f * 2 ** (c / 1200);
    const g = ctx.createGain();
    g.gain.value = 0.33;
    osc.connect(g);
    g.connect(src);
    oscs.push(osc);
  }

  const vibOsc = ctx.createOscillator();
  vibOsc.type = "sine";
  vibOsc.frequency.value = 5.2;
  const vibGain = ctx.createGain();
  vibGain.gain.setValueAtTime(0, at);
  vibGain.gain.setValueAtTime(0, at + 0.25);
  vibGain.gain.linearRampToValueAtTime(f * 0.004, at + 0.6);
  vibOsc.connect(vibGain);
  for (const osc of oscs) {
    vibGain.connect(osc.frequency);
  }

  const filters: BiquadFilterNode[] = [];
  const gainFormant: GainNode[] = [];
  for (let k = 0; k < 3; k++) {
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = FORMANTS[v0].freq[k];
    filt.Q.value = 5;
    const gf = ctx.createGain();
    gf.gain.value = FORMANTS[v0].gain[k];
    filt.connect(gf);
    filters.push(filt);
    gainFormant.push(gf);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(vel * 0.25, at + 0.18);
  env.gain.setValueAtTime(vel * 0.25, end);
  env.gain.linearRampToValueAtTime(0, end + 0.5);

  for (const gf of gainFormant) {
    gf.connect(env);
  }

  for (const filt of filters) {
    src.connect(filt);
  }

  for (const { at: t, v } of vowels) {
    if (t >= at && t < end) {
      for (let k = 0; k < 3; k++) {
        filters[k].frequency.setTargetAtTime(FORMANTS[v].freq[k], t, 0.035);
        gainFormant[k].gain.setTargetAtTime(FORMANTS[v].gain[k], t, 0.035);
      }
    }
  }

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  env.connect(panner);
  panner.connect(dest);

  for (const osc of oscs) {
    osc.start(at);
    osc.stop(end + 0.6);
  }
  vibOsc.start(at);
  vibOsc.stop(end + 0.6);
}

export function warmPad(ctx: BaseAudioContext, dest: AudioNode, midi: number, at: number, dur: number, vel: number): void {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const end = at + Math.max(0.4, dur);

  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = f * 2 ** (-6 / 1200);

  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = f * 2 ** (6 / 1200);

  const osc3 = ctx.createOscillator();
  osc3.type = "sawtooth";
  osc3.frequency.value = f * 0.5;
  const g3 = ctx.createGain();
  g3.gain.value = 0.12;
  osc3.connect(g3);

  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = 0.7;
  filt.frequency.setValueAtTime(600, at);
  filt.frequency.linearRampToValueAtTime(1600, at + Math.min(1.2, dur / 2));
  filt.frequency.linearRampToValueAtTime(700, end + 1);

  osc1.connect(filt);
  osc2.connect(filt);
  g3.connect(filt);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(vel * 0.1, at + 0.6);
  env.gain.setValueAtTime(vel * 0.1, end);
  env.gain.linearRampToValueAtTime(0, end + 1);

  filt.connect(env);
  env.connect(dest);

  osc1.start(at);
  osc1.stop(end + 1.1);
  osc2.start(at);
  osc2.stop(end + 1.1);
  osc3.start(at);
  osc3.stop(end + 1.1);
}
