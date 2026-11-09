import { heardShift, jamScale, onJamTick, songToCtx, voiceLead, snapToScale } from "./stemJam";
import { Vocoder, VOCODER_DEFAULTS, VOCODER_VARIANTS, type VocoderNotes, type VocoderParam } from "./jamVocoder";
import { chordLabel, chordNotes, strongestChords, type BarChord } from "./chordHarmonyNotes";
import { voiceNotes, type VoiceNote } from "./jamVoiceNotes";
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";

type Note = [number, number, number, number];

export function carrierNotes(mode: VocoderNotes, chord: number[], melody: number | null, mono: boolean): number[] {
  if (melody === null || mode === "chord") return chord;
  if (mode === "melody" || mono) return [melody];
  if (chord.includes(melody)) return chord;
  return [...chord.slice(0, 3), melody];
}

export function melodyAt(segs: VoiceNote[], step: number, t: number): number | null {
  for (const s of segs) {
    if (s.k0 * step <= t && t < s.k1 * step) return s.midi;
  }
  return null;
}

// measured on a real vocal: 2 into the compressor gives the level of the voice with lower peaks; at knob 80 % the module sits about 2 dB over the voice
const VOCODER_DRIVE = 2;
export function vocoderGain(level: number): number { return (level / 0.8) * 1.25; }

export function nextVariant(id: string, dir: 1 | -1): string {
  const ids = VOCODER_VARIANTS.map((v) => v.id);
  const index = ids.indexOf(id);
  const start = index === -1 ? 0 : index;
  const nextIndex = (start + dir + ids.length) % ids.length;
  return ids[nextIndex];
}

export function cleanMelody(segs: VoiceNote[], pcs: number[]): VoiceNote[] {
  if (segs.length === 0) return [];
  const sorted = [...segs].sort((a, b) => a.midi - b.midi);
  let totalDuration = 0;
  for (const s of sorted) totalDuration += s.k1 - s.k0;
  let cumulativeDuration = 0;
  let median = sorted[0].midi;
  for (const s of sorted) {
    cumulativeDuration += s.k1 - s.k0;
    if (cumulativeDuration >= totalDuration / 2) {
      median = s.midi;
      break;
    }
  }
  return segs.map((s) => {
    let midi = s.midi;
    while (midi > median + 9) midi -= 12;
    while (midi < median - 9) midi += 12;
    midi = snapToScale(midi, pcs);
    return { ...s, midi };
  });
}

export class VocoderLab extends JamModule {
  readonly vocoder: Vocoder;
  on = false;
  level = 0.8;
  params: Record<VocoderParam, number> = { ...VOCODER_DEFAULTS };
  variant = "studio";
  source: VocoderNotes = "chord";
  private tapNode: AudioNode | null = null;
  private comp: DynamicsCompressorNode;
  private levelGain: GainNode;
  private chord: number[] | null = null;
  private songs = new WeakMap<Deck, { notes: unknown; bpm: number; grid: number; key: string; chords: BarChord[]; offset: number; unit: number }>();
  private segCache = new WeakMap<number[], VoiceNote[]>();
  private lastMelody: number | null = null;

  constructor(engine: DJEngine) {
    super(engine, "vocals");
    this.vocoder = new Vocoder(engine.ctx);
    this.comp = new DynamicsCompressorNode(engine.ctx, { threshold: -30, ratio: 4, attack: 0.003, release: 0.12, knee: 6 });
    this.levelGain = new GainNode(engine.ctx, { gain: vocoderGain(this.level) });
    // not this.vocoder.out.connect(this.bus): the compressor comes first
    this.vocoder.out.connect(this.comp).connect(this.levelGain).connect(this.bus);
    this.gateModule("vocoder");
    onJamTick(engine, (deck, from, to) => { if (this.active) this.tick(deck, from, to); });
  }

  protected closed(): void {
    if (this.on) this.setOn(false);
  }

  pads(): PadDef[] {
    return [];
  }

  protected keep(): string[] {
    return ["level", "params", "variant", "source"];
  }

  protected resetFields(): void {
    if (this.on) this.setOn(false);
    this.level = 0.8;
    this.params = { ...VOCODER_DEFAULTS };
    this.variant = "studio";
    this.source = "chord";
    this.vocoder.setVariant(VOCODER_VARIANTS[0]);
    (Object.keys(this.params) as VocoderParam[]).forEach((k) => this.vocoder.setParam(k, this.params[k]));
  }

  warning(): string | null {
    if (!this.on) return null;
    const d = this.deck();
    if (this.stem(d) < 0) return "Le vocodeur écoute la voix : active les stems du morceau.";
    if (d.bpm <= 0) return "Tempo inconnu : l'accord reste fixe.";
    if (this.source !== "chord" && this.segs(d).length === 0) return "Mélodie de la voix pas encore analysée : il joue l'accord.";
    return null;
  }

  variantInfo() {
    return VOCODER_VARIANTS.find((v) => v.id === this.variant) ?? VOCODER_VARIANTS[0];
  }

  private wire(deck: Deck) {
    const i = this.stem(deck);
    const tap = i >= 0 ? deck.stemPreTap(i) : null;
    if (tap === this.tapNode) return;
    if (this.tapNode) this.tapNode.disconnect(this.vocoder.mod);
    this.tapNode = tap;
    if (tap) tap.connect(this.vocoder.mod);
  }

  setOn(on: boolean) {
    this.on = on;
    this.route(this.deck());
    if (on) {
      this.wire(this.deck());
      this.vocoder.start();
      this.vocoder.setLevel(VOCODER_DRIVE);
      this.levelGain.gain.setTargetAtTime(vocoderGain(this.level), this.engine.ctx.currentTime, 0.02);
      this.vocoder.setVariant(this.variantInfo());
      (Object.keys(this.params) as VocoderParam[]).forEach((k) => this.vocoder.setParam(k, this.params[k]));
      this.lastMelody = null;
      this.chord = null;
      this.push(this.deck().ctx.currentTime);
    } else {
      this.vocoder.stop(this.deck().ctx.currentTime);
      if (this.tapNode) this.tapNode.disconnect(this.vocoder.mod);
      this.tapNode = null;
    }
    jamChanged();
  }

  setLevel(v: number) {
    this.level = v;
    this.levelGain.gain.setTargetAtTime(vocoderGain(this.level), this.engine.ctx.currentTime, 0.02);
  }

  setParam(name: VocoderParam, v: number) {
    this.params = { ...this.params, [name]: v };
    this.vocoder.setParam(name, v);
    jamChanged();
  }

  setVariant(id: string) {
    const v = VOCODER_VARIANTS.find((x) => x.id === id) ?? VOCODER_VARIANTS[0];
    this.variant = v.id;
    this.source = v.notes;
    this.params = { ...this.params, ...v.params };
    this.vocoder.setVariant(v);
    (Object.keys(this.params) as VocoderParam[]).forEach((k) => this.vocoder.setParam(k, this.params[k]));
    if (this.on) this.push(this.deck().ctx.currentTime);
    jamChanged();
  }

  setSource(n: VocoderNotes): void {
    this.source = n;
    if (this.on) this.push(this.deck().ctx.currentTime);
    jamChanged();
  }

  private segs(d: Deck): VoiceNote[] {
    const voice = d.stemMap?.voice;
    if (!voice) return [];
    const step = d.stemMap?.voiceStep ?? 0.1;
    if (!this.segCache.has(voice)) {
      const segs = cleanMelody(voiceNotes(voice, step), this.writtenScale(d));
      this.segCache.set(voice, segs);
    }
    return this.segCache.get(voice)!;
  }

  private writtenScale(d: Deck): number[] {
    return d.key?.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  }

  private song(d: Deck) {
    const key = `${d.key?.pitchClass}${d.key?.mode}`;
    const cached = this.songs.get(d);
    if (cached && cached.notes === d.stemNotes && cached.bpm === d.bpm && cached.grid === d.beatGridOffset && cached.key === key) return cached;
    const pcs = this.writtenScale(d);
    const root = d.key?.pitchClass ?? 0;
    const unit = d.bpm > 0 ? 120 / d.bpm : 1;
    const offset = d.beatGridOffset - Math.ceil(d.beatGridOffset / unit) * unit;
    const other = (d.stemNotes?.other ?? []) as Note[];
    const bass = (d.stemNotes?.bass ?? []) as Note[];
    const duration = Math.max(...[...other, ...bass].map((n) => n[1]));
    const chords = strongestChords(other, bass, pcs.map((p) => (p + root) % 12), unit, offset, duration);
    const s = { notes: d.stemNotes, bpm: d.bpm, grid: d.beatGridOffset, key, chords, offset, unit };
    this.songs.set(d, s);
    return s;
  }

  private chordAt(d: Deck, t: number): BarChord {
    const c = this.song(d);
    if (c.chords.length === 0) {
      const s = jamScale(d);
      return { root: s.pcs[0], minor: s.minor, rest: false, strength: 1, bass: s.pcs[0], seventh: true };
    }
    const index = Math.floor((t - c.offset + 1e-6) / c.unit);
    const b = c.chords[Math.max(0, Math.min(index, c.chords.length - 1))];
    return { ...b, root: (b.root + heardShift(d) + 12) % 12 };
  }

  private notesFor(d: Deck, t: number): number[] {
    const b = this.chordAt(d, t);
    const base = chordNotes(b.root, b.minor, b.seventh ? "seventh" : "triad", jamScale(d).pcs).map((m) => m + 12);
    this.chord = voiceLead(this.chord, base);
    const raw = melodyAt(this.segs(d), d.stemMap?.voiceStep ?? 0.1, t);
    const melody = raw === null ? this.lastMelody : raw + heardShift(d);
    this.lastMelody = melody;
    return carrierNotes(this.source, this.chord, melody, this.variantInfo().mono);
  }

  private push(at: number): void {
    const d = this.deck();
    this.vocoder.setChord(this.notesFor(d, d.position()), at);
  }

  private tick(deck: Deck, from: number, to: number) {
    if (!this.on || deck !== this.deck() || this.stem(deck) < 0) return;
    this.wire(deck);
    this.route(deck);
    const c = this.song(deck);
    const step = deck.stemMap?.voiceStep ?? 0.1;
    const times: number[] = [];
    if (deck.bpm) for (let k = Math.ceil((from - c.offset) / c.unit); c.offset + k * c.unit < to; k++) times.push(c.offset + k * c.unit);
    if (this.source !== "chord") for (const s of this.segs(deck)) { const t = s.k0 * step; if (t >= from && t < to) times.push(t); }
    times.sort((a, b) => a - b);
    for (const t of times) {
      const at = songToCtx(deck, t);
      this.vocoder.setChord(this.notesFor(deck, t + 0.001), at);
      this.hit(at);
    }
  }

  now(): string | null {
    if (!this.on || !this.deck().playing) return null;
    const d = this.deck();
    const t = d.position();
    const b = this.chordAt(d, t);
    const s = jamScale(d);
    const flat = (s.minor ? [2, 7, 0, 5, 10, 3] : [5, 10, 3, 8, 1, 6]).includes(s.root);
    const name = chordLabel(b.root, b.minor, flat) + (b.seventh ? "7" : "");
    if (this.source === "chord" || this.lastMelody === null) return `Accord : ${name}`;
    return `Accord : ${name} · Note : ${chordLabel(((this.lastMelody % 12) + 12) % 12, false, flat)}${Math.floor(this.lastMelody / 12) - 1}`;
  }
}

const vocoderLabCache = new WeakMap<DJEngine, VocoderLab>();
export function vocoderLab(engine: DJEngine): VocoderLab {
  if (!vocoderLabCache.has(engine)) {
    const m = new VocoderLab(engine);
    try {
      const o = JSON.parse(localStorage.getItem("djsynth.vocoder.v1") || "{}");
      m.restore(o);
      m.setLevel(m.level);
      m.vocoder.setVariant(m.variantInfo());
      (Object.keys(m.params) as VocoderParam[]).forEach((k) => m.vocoder.setParam(k, m.params[k]));
    } catch { /* first launch or storage blocked: the defaults stay */ }
    vocoderLabCache.set(engine, m);
    setInterval(() => {
      try {
        const s = JSON.stringify(m.snapshot());
        if (s !== localStorage.getItem("djsynth.vocoder.v1")) {
          localStorage.setItem("djsynth.vocoder.v1", s);
        }
      } catch { /* storage blocked: the settings last the session */ }
    }, 2000);
  }
  return vocoderLabCache.get(engine)!;
}
