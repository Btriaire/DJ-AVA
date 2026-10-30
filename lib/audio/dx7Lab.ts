// DX7 LAB: the DX7 as a stem module: 2-operator FM voices (the classic patches plus DJ stabs) that play the song's
// chords in rhythm, hold them, double the bass stem, or answer chord pads in the song's key
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { monoBass } from "./jamReplay";
import { chordAt, degreeChord, degreeNames, heardShift, onJamTick, songToCtx, voiceLead } from "./stemJam";
export type Env = [attack: number, decay: number, sustain: number, release: number];
export type FmPatch = { label: string; ratio: number; index: number; amp: Env; mod: Env; wave: OscillatorType };
export const FM_PATCHES = {
  stab: { label: "STAB HOUSE", ratio: 1, index: 7, amp: [0.001, 0.25, 0, 0.2], mod: [0.001, 0.12, 0, 0.1], wave: "square" },
  organ90: { label: "ORGUE 90", ratio: 2, index: 1.5, amp: [0.001, 0.3, 0.6, 0.15], mod: [0.001, 0.2, 0.3, 0.1], wave: "sine" },
  ep1: { label: "E.PIANO 1", ratio: 1, index: 3.2, amp: [0.001, 1.6, 0.15, 1.4], mod: [0.001, 0.35, 0, 0.3], wave: "sine" },
  ep2: { label: "E.PIANO 2", ratio: 2, index: 5, amp: [0.001, 1.2, 0.1, 1.1], mod: [0.001, 0.3, 0, 0.25], wave: "sine" },
  bells: { label: "CLOCHES", ratio: 3.01, index: 14, amp: [0.001, 2.5, 0, 2.5], mod: [0.001, 0.4, 0, 0.4], wave: "sine" },
  marimba: { label: "MARIMBA", ratio: 4, index: 6, amp: [0.001, 0.6, 0, 0.6], mod: [0.001, 0.2, 0, 0.2], wave: "sine" },
  clav: { label: "CLAV", ratio: 3, index: 8, amp: [0.001, 0.5, 0.1, 0.4], mod: [0.001, 0.15, 0, 0.15], wave: "sine" },
  brass: { label: "CUIVRES", ratio: 1, index: 6, amp: [0.06, 0.2, 0.8, 0.4], mod: [0.05, 0.2, 0.7, 0.4], wave: "sine" },
  strings: { label: "NAPPE CORDES", ratio: 1, index: 2, amp: [0.4, 0.3, 0.9, 1.2], mod: [0.3, 0.3, 0.6, 0.8], wave: "sine" },
  sbass: { label: "BASSE FM", ratio: 0.5, index: 5, amp: [0.001, 0.4, 0.5, 0.3], mod: [0.001, 0.1, 0.2, 0.2], wave: "sine" },
  slap: { label: "SLAP", ratio: 1, index: 10, amp: [0.001, 0.3, 0.2, 0.25], mod: [0.001, 0.08, 0, 0.1], wave: "sine" },
  koto: { label: "KOTO", ratio: 3, index: 5, amp: [0.001, 1.2, 0, 1.0], mod: [0.001, 0.3, 0, 0.3], wave: "sine" },
} satisfies Record<string, FmPatch>;
export type FmPatchId = keyof typeof FM_PATCHES;

// the ADSR level 0..1 at t seconds after note-on, for a note held dur seconds (what fmNote schedules)
export function envAt(e: Env, t: number, dur: number): number {
  const [a, d, s, r] = e;
  const held = (u: number) => (u < a ? u / a : s + (1 - s) * Math.exp(-(u - a) / Math.max(1e-3, d / 3)));
  if (t < 0) return 0;
  const off = Math.max(dur, a);
  if (t < off) return held(t);
  return held(off) * Math.exp(-(t - off) / Math.max(1e-3, r / 3));
}

export function fmNote(ctx: BaseAudioContext, dest: AudioNode, p: FmPatch, midi: number, at: number, dur: number, vel: number, bright = 1): void {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const carrier = new OscillatorNode(ctx, { type: p.wave, frequency: f });
  const modulator = new OscillatorNode(ctx, { type: "sine", frequency: f * p.ratio });
  const modGain = new GainNode(ctx, { gain: 0 });
  const amp = new GainNode(ctx, { gain: 0 });

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(amp).connect(dest);

  const adsr = (param: AudioParam, e: Env, at: number, dur: number, peak: number) => {
    const [a, d, s, r] = e;
    const off = at + Math.max(dur, a);
    param.setValueAtTime(0, at);
    param.linearRampToValueAtTime(peak, at + a);
    param.setTargetAtTime(peak * s, at + a, d / 3);
    if (param.cancelAndHoldAtTime) {
      param.cancelAndHoldAtTime(off);
    } else {
      param.cancelScheduledValues(off);
      param.setValueAtTime(param.value, off);
    }
    param.setTargetAtTime(0, off, r / 3);
  };

  adsr(amp.gain, p.amp, at, dur, 0.18 * vel);
  adsr(modGain.gain, p.mod, at, dur, f * p.ratio * p.index * bright);

  carrier.start(at);
  modulator.start(at);

  const off = at + Math.max(dur, p.amp[0]);
  carrier.stop(off + 4 * p.amp[3]);
  modulator.stop(off + 4 * p.amp[3]);
  carrier.onended = () => {
    carrier.disconnect();
    modulator.disconnect();
    modGain.disconnect();
    amp.disconnect();
  };
}

export type StabRhythm = "contretemps" | "house" | "croches" | "deuxquatre" | "charleston";

export const STAB_RHYTHMS: Record<StabRhythm, { label: string; steps: number[] }> = {
  contretemps: { label: "Contretemps", steps: [2, 6, 10, 14] },
  house: { label: "House", steps: [0, 3, 6, 10, 12] },
  croches: { label: "Croches", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
  deuxquatre: { label: "Sur 2 et 4", steps: [4, 12] },
  charleston: { label: "Charleston", steps: [0, 6] },
};

export function rhythmSteps(name: StabRhythm): number[] {
  return STAB_RHYTHMS[name].steps;
}

export type Dx7Mode = "off" | "stabs" | "accords" | "basse";

export class Dx7Lab extends JamModule {
  mode: Dx7Mode = "off";
  patch: FmPatchId = "stab";
  rhythm: StabRhythm = "contretemps";
  octave = 0;          // -1..1
  bright = 1;          // 0..2, FM index multiplier (BRILLANCE)
  gate = 0.5;          // 0.1..1, how long a stab lasts, part of a sixteenth * 2
  level = 1;           // 0..1.5 (setLevel applies outGain)
  echo = 0;            // 0..1 (setEcho applies the echo send)
  degree: number | null = null; // a chord pad held
  private voicing: number[] | null = null;
  private outGain: GainNode; private echoIn: GainNode; private delay: DelayNode;
  private bassCache = new WeakMap<object, [number, number, number, number][]>();

  constructor(engine: DJEngine) {
    super(engine, "other");
    this.outGain = new GainNode(engine.ctx, { gain: 1 });
    this.outGain.connect(this.bus);
    this.echoIn = new GainNode(engine.ctx, { gain: 0 });
    this.delay = new DelayNode(engine.ctx, { maxDelayTime: 2, delayTime: 0.375 });
    this.echoIn.connect(this.delay);
    const lowpass = new BiquadFilterNode(engine.ctx, { type: "lowpass", frequency: 3000 });
    this.delay.connect(lowpass);
    lowpass.connect(this.bus);
    const feedback = new GainNode(engine.ctx, { gain: 0.35 });
    lowpass.connect(feedback);
    feedback.connect(this.delay);
    onJamTick(engine, (d, from, to) => this.tick(d, from, to));
  }

  setLevel(v: number) {
    this.level = Math.max(0, Math.min(1.5, v));
    this.outGain.gain.setTargetAtTime(this.level, this.engine.ctx.currentTime, 0.05);
  }

  setEcho(v: number) {
    this.echo = Math.max(0, Math.min(1, v));
    this.echoIn.gain.setTargetAtTime(0.5 * this.echo, this.engine.ctx.currentTime, 0.05);
  }

  protected routeTarget(deck: Deck) {
    return super.routeTarget(deck) ?? deck.crowdInput();
  }

  protected swapStems(d: Deck): number[] {
    const name = this.mode === "basse" ? "bass" : "other";
    const i = this.stem(d) >= 0 ? d.stemIndex(name) : -1;
    return i >= 0 ? [i] : [];
  }

  status() {
    return this.deck()?.playing ? "ok" : "stopped";
  }

  warning() {
    if (this.stem(this.deck()) < 0) {
      return this.mode === "basse" ? "Doubler la basse demande les stems du morceau." : "Sans stems : les accords restent sur la tonalité du morceau.";
    }
    return null;
  }

  private chord(d: Deck, t: number): number[] {
    const base = this.degree !== null ? degreeChord(d, this.degree, 48, "seventh") : chordAt(d, t, "seventh");
    const c = base.map((n) => n + 12 * this.octave);
    this.voicing = voiceLead(this.voicing, c);
    return this.voicing;
  }

  private play(notes: number[], at: number, dur: number, vel: number) {
    for (const n of notes) {
      fmNote(this.engine.ctx, this.outGain, FM_PATCHES[this.patch], n, at, dur, vel, this.bright);
    }
    this.hit(at);
  }

  private tick(d: Deck, from: number, to: number) {
    if (d !== this.deck()) return;
    this.route(d);
    if (d.bpm <= 0) return;
    const sixteenth = 60 / d.bpm / 4;
    const rate = Math.max(0.25, d.playbackRate);

    if (this.mode === "stabs" || this.degree !== null) {
      for (let k = Math.ceil((from - d.beatGridOffset) / sixteenth); k * sixteenth + d.beatGridOffset < to; k++) {
        const s = d.beatGridOffset + k * sixteenth;
        const step = ((k % 16) + 16) % 16;
        if (rhythmSteps(this.rhythm).includes(step)) {
          this.play(this.chord(d, s + 0.02), songToCtx(d, s), this.gate * 2 * sixteenth / rate, 0.55 + 0.45 * this.dyn(d, s));
        }
      }
    } else if (this.mode === "accords") {
      for (let k = Math.ceil((from - d.beatGridOffset) / (16 * sixteenth)); k * 16 * sixteenth + d.beatGridOffset < to; k++) {
        const b = d.beatGridOffset + k * 16 * sixteenth;
        this.play(this.chord(d, b + 0.02), songToCtx(d, b), 4 * 4 * sixteenth / rate * 0.98, 0.5 + 0.4 * this.dyn(d, b));
      }
    } else if (this.mode === "basse") {
      const notes = this.bassCache.get(d.stemNotes?.bass ?? []) ?? monoBass(d.stemNotes?.bass ?? []);
      if (!this.bassCache.has(d.stemNotes?.bass ?? [])) {
        this.bassCache.set(d.stemNotes?.bass ?? [], notes);
      }
      for (const [s, e, m, v] of notes) {
        if (from <= s && s < to) {
          this.play([m + heardShift(d) + 12 * this.octave], songToCtx(d, s), Math.max(0.08, (e - s) / rate), Math.min(1, 0.4 + 0.6 * v));
        }
      }
    }
  }

  padChord(degree: number, on: boolean) {
    if (on) {
      this.degree = degree;
      if (this.status() === "stopped") {
        const d = this.deck();
        this.route(d);
        this.play(this.chord(d, d.position()), d.ctx.currentTime + 0.005, 0.6, 0.8);
      }
    } else if (this.degree === degree) {
      this.degree = null;
    }
    jamChanged();
  }

  pads(): PadDef[] {
    return [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `deg${i}`,
        label: degreeNames(this.deck())[i],
        sub: ["I", "II", "III", "IV", "V", "VI"][i],
        mode: "hold" as const,
        run: (on: boolean) => this.padChord(i, on),
      })),
      {
        id: "hit",
        label: "STAB",
        sub: "maintenant",
        mode: "hold" as const,
        run: (on: boolean) => {
          if (on) {
            const d = this.deck();
            this.route(d);
            this.play(this.chord(d, d.position()), d.ctx.currentTime + 0.005, 0.25, 0.9);
          }
        },
      },
    ];
  }
  protected keep(): string[] {
    return ["mode", "patch", "rhythm", "octave", "bright", "gate", "level", "echo"];
  }
  protected resetFields(): void {
    this.mode = "off";
    this.patch = "stab";
    this.rhythm = "contretemps";
    this.octave = 0;
    this.bright = 1;
    this.gate = 0.5;
    this.setLevel(1);
    this.setEcho(0);
    this.degree = null;
    this.voicing = null;
  }
}

const dx7LabCache = new WeakMap<DJEngine, Dx7Lab>();
export function dx7Lab(engine: DJEngine): Dx7Lab {
  if (!dx7LabCache.has(engine)) {
    const m = new Dx7Lab(engine);
    try {
      const o = JSON.parse(localStorage.getItem("djsynth.dx7lab.v1") || "{}");
      m.restore(o);
      m.setLevel(m.level);
      m.setEcho(m.echo);
    } catch { /* first launch or storage blocked: the defaults stay */ }
    dx7LabCache.set(engine, m);
    setInterval(() => {
      try {
        const s = JSON.stringify(m.snapshot());
        if (s !== localStorage.getItem("djsynth.dx7lab.v1")) {
          localStorage.setItem("djsynth.dx7lab.v1", s);
        }
      } catch { /* storage blocked: the settings last the session */ }
    }, 2000);
  }
  return dx7LabCache.get(engine)!;
}

// runnable check: the envelope shape the FM notes follow, and the stab rhythms
export function dx7Test(): void {
  const e: [number, number, number, number] = [0.01, 0.3, 0.5, 0.2];
  if (envAt(e, -1, 1) !== 0 || Math.abs(envAt(e, 0.005, 1) - 0.5) > 1e-9) throw new Error("dx7 attack");
  if (Math.abs(envAt(e, 0.9, 1) - 0.5) > 0.01) throw new Error("dx7 sustain");
  if (envAt(e, 1.5, 1) > 0.01 || envAt(e, 1.05, 1) >= envAt(e, 1, 1)) throw new Error("dx7 release");
  for (const r of Object.values(STAB_RHYTHMS)) if (!r.steps.length || r.steps.some((x) => x < 0 || x > 15)) throw new Error("dx7 rhythm");
  if (rhythmSteps("deuxquatre").join() !== "4,12") throw new Error("dx7 2 and 4");
}
