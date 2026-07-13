// Per-deck serial DSP rack. A reorderable chain of insert modules — each with a
// power (bypass) switch, a dry/wet mix, and its own parameters — plus 4 assignable
// macro knobs and save/recall presets. Sits as one insert in the deck's signal
// path. The channel strip (EQ, filter, crowd, auto-tune) stays separate; this is
// the studio effects rack.
//
// Creative effects (shimmer, glitch, wavefold, ringmod, gate, auto-wah, resonator,
// robot) are built on Tone.js nodes, bridged into the native graph through plain
// `fxIn`/`fxOut` GainNodes (`Tone.connect`). The classic utilities (comp, drive,
// crush, delay, reverb, limiter) stay hand-written. Two effects (voyelle formant,
// voice isolator) are native mid-side / formant filters with no Tone equivalent.

import * as Tone from "tone";

export type RackModuleId =
  | "isolator"
  | "eq"
  | "autotune"
  | "comp"
  | "drive"
  | "wavefold"
  | "crush"
  | "robot"
  | "ringmod"
  | "voyelle"
  | "autowah"
  | "resonator"
  | "gate"
  | "glitch"
  | "shimmer"
  | "delay"
  | "reverb"
  | "limiter"
  | "loudness"
  | "surround"
  | "exciter"
  | "transient"
  | "multiband"
  | "xymatrix"
  | "phaser"
  | "combfilter";

export interface RackParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  fmt?: (v: number) => string;
}

export interface RackModuleDef {
  id: RackModuleId;
  label: string;
  title: string;
  params: RackParamDef[];
  flags?: { key: string; label: string }[]; // boolean toggles (e.g. delay ping-pong)
}

const hz = (v: number) => `${v.toFixed(2)} Hz`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ms = (v: number) => `${Math.round(v * 1000)} ms`;
const hzr = (v: number) => `${Math.round(v)} Hz`;
const dbr = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;
const VOWELS = "AEIOU";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_LABELS = ["CHRO", "MAJ", "MIN"];
// pitch-class sets for the auto-tune module (chromatic / major / minor)
const AUTOTUNE_SCALES: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 8, 10],
];

// 15-band 2/3-octave graphic EQ — ISO standard centre frequencies, one gain fader each.
// Shared by the engine and the panel (fader labels + response curve).
export const EQ_FREQS = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
const eqLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

// UI-facing definitions: drive the rack panel. Engine reads `def` for defaults.
export const RACK_MODULES: RackModuleDef[] = [
  // EQ is pinned first in the chain and rendered as an always-visible panel
  // above the DSP pedalboard (not a reorderable/collapsible card).
  {
    id: "eq",
    label: "EQ",
    title: "Égaliseur graphique 10 bandes — un curseur vertical par fréquence, balayage large et précis du spectre",
    params: EQ_FREQS.map((f, i) => ({
      key: `g${i}`,
      label: eqLabel(f),
      min: -18,
      max: 18,
      def: 0,
      fmt: dbr,
    })),
  },
  {
    id: "isolator",
    label: "ISO VOIX",
    title: "Isolateur de voix — garde le centre · KARAOKE retire la voix",
    params: [{ key: "focus", label: "Focus", min: 0, max: 1, def: 0.7, fmt: pct }],
    flags: [{ key: "karaoke", label: "KARAOKE" }],
  },
  {
    id: "autotune",
    label: "AUTO-TUNE",
    title: "Auto-Tune — correction de hauteur monophonique (brille sur une voix seule · solo le stem VOIX)",
    params: [
      { key: "amount", label: "Dose", min: 0, max: 1, def: 1, fmt: pct },
      { key: "retune", label: "Glisse", min: 0, max: 1, def: 0.2, fmt: pct },
      { key: "key", label: "Tonalité", min: 0, max: 11, def: 0, fmt: (v) => NOTE_NAMES[((Math.round(v) % 12) + 12) % 12] },
      { key: "scale", label: "Gamme", min: 0, max: 2, def: 0, fmt: (v) => SCALE_LABELS[Math.max(0, Math.min(2, Math.round(v)))] },
    ],
  },
  {
    id: "comp",
    label: "COMP",
    title: "Compresseur — colle et donne du punch",
    params: [
      { key: "thresh", label: "Seuil", min: -60, max: 0, def: -24, fmt: dbr },
      { key: "ratio", label: "Ratio", min: 1, max: 20, def: 4, fmt: (v) => `${v.toFixed(1)}:1` },
      { key: "gain", label: "Gain", min: 0, max: 24, def: 0, fmt: (v) => `+${Math.round(v)} dB` },
    ],
  },
  {
    id: "drive",
    label: "DRIVE",
    title: "Saturation analogique — chaleur et grain",
    params: [
      { key: "drive", label: "Drive", min: 0, max: 1, def: 0.4, fmt: pct },
      { key: "tone", label: "Tone", min: 0, max: 1, def: 0.6, fmt: pct },
    ],
  },
  {
    id: "wavefold",
    label: "WAVEFOLD",
    title: "Repli d'onde (Tchebychev) — harmoniques riches et métalliques",
    params: [
      { key: "fold", label: "Pli", min: 0, max: 1, def: 0.4, fmt: pct },
      { key: "tone", label: "Tone", min: 0, max: 1, def: 0.6, fmt: pct },
    ],
  },
  {
    id: "crush",
    label: "CRUSH",
    title: "Bit-crusher — réduction de résolution (lo-fi)",
    params: [{ key: "bits", label: "Bits", min: 1, max: 8, def: 4, fmt: (v) => `${Math.round(v)} bit` }],
  },
  {
    id: "robot",
    label: "ROBOT",
    title: "Voix robotique — bitcrush + décalage + médium",
    params: [
      { key: "carrier", label: "Carrier", min: -500, max: 500, def: 0, fmt: hzr },
      { key: "grit", label: "Grain", min: 1, max: 8, def: 4, fmt: (v) => `${Math.round(v)} bit` },
      { key: "tone", label: "Médium", min: 200, max: 4000, def: 1200, fmt: hzr },
    ],
  },
  {
    id: "ringmod",
    label: "RINGMOD",
    title: "Décalage de fréquence — métallique / cloche / alien",
    params: [
      { key: "freq", label: "Fréq", min: -1000, max: 1000, def: 200, fmt: hzr },
      { key: "depth", label: "Dosage", min: 0, max: 1, def: 1, fmt: pct },
    ],
  },
  {
    id: "voyelle",
    label: "VOYELLE",
    title: "Filtre de formant — morphe les voyelles A·E·I·O·U",
    params: [
      { key: "morph", label: "Voyelle", min: 0, max: 1, def: 0.3, fmt: (v) => VOWELS[Math.min(4, Math.floor(v * 5))] },
      { key: "reso", label: "Réso", min: 1, max: 20, def: 8, fmt: (v) => v.toFixed(0) },
    ],
  },
  {
    id: "autowah",
    label: "AUTO-WAH",
    title: "Auto-wah — filtre qui suit le volume du son",
    params: [
      { key: "base", label: "Base", min: 50, max: 600, def: 120, fmt: hzr },
      { key: "sens", label: "Sensib.", min: -40, max: 0, def: -20, fmt: dbr },
      { key: "q", label: "Réso", min: 0.5, max: 10, def: 4, fmt: (v) => v.toFixed(1) },
    ],
  },
  {
    id: "resonator",
    label: "RÉSO",
    title: "Résonateur accordé — fait chanter le son sur une note",
    params: [
      { key: "tune", label: "Note", min: 50, max: 1000, def: 220, fmt: hzr },
      { key: "reso", label: "Réso", min: 0, max: 0.95, def: 0.8, fmt: pct },
    ],
  },
  {
    id: "gate",
    label: "GATE",
    title: "Trance gate — hachage rythmique on/off, synchronisable au BPM",
    params: [
      { key: "rate", label: "Vitesse", min: 0.5, max: 16, def: 8, fmt: hz },
      { key: "depth", label: "Profond.", min: 0, max: 1, def: 1, fmt: pct },
    ],
  },
  {
    id: "glitch",
    label: "GLITCH",
    title: "Stutter / bégaiement — tiens REPEAT pour figer · synchronisable",
    params: [
      { key: "time", label: "Temps", min: 0.02, max: 0.5, def: 0.12, fmt: ms },
      { key: "fb", label: "Retour", min: 0, max: 0.95, def: 0.4, fmt: pct },
    ],
    flags: [{ key: "repeat", label: "REPEAT" }],
  },
  {
    id: "shimmer",
    label: "SHIMMER",
    title: "Octave shimmer — nappe éthérée à l'octave supérieure",
    params: [
      { key: "decay", label: "Taille", min: 1, max: 8, def: 4, fmt: (v) => `${v.toFixed(1)} s` },
      { key: "shimmer", label: "Shimmer", min: 0, max: 0.9, def: 0.5, fmt: pct },
    ],
  },
  {
    id: "delay",
    label: "DELAY",
    title: "Delay / ping-pong — écho synchronisable",
    params: [
      { key: "time", label: "Temps", min: 0.02, max: 1.2, def: 0.38, fmt: ms },
      { key: "fb", label: "Retour", min: 0, max: 0.95, def: 0.55, fmt: pct },
    ],
    flags: [{ key: "pingpong", label: "PING" }],
  },
  {
    id: "reverb",
    label: "REVERB",
    title: "Reverb à convolution — espace et profondeur",
    params: [{ key: "decay", label: "Taille", min: 0.3, max: 6, def: 3, fmt: (v) => `${v.toFixed(1)} s` }],
  },
  {
    id: "limiter",
    label: "LIMITEUR",
    title: "Limiteur de sécurité — empêche l'écrêtage",
    params: [{ key: "ceil", label: "Plafond", min: -24, max: 0, def: -1, fmt: (v) => `${v.toFixed(1)} dB` }],
  },
  {
    id: "loudness",
    label: "LOUDNESS",
    title: "Maximiseur de loudness — compression + gain + limiteur brick-wall",
    params: [
      { key: "target", label: "Cible", min: 0, max: 1, def: 0.5, fmt: (v) => `${Math.round(-14 + v * 8)} LUFS` },
      { key: "punch", label: "Punch", min: 0, max: 1, def: 0.5, fmt: pct },
    ],
  },
  {
    id: "surround",
    label: "SURROUND",
    title: "Élargisseur stéréo M/S — de mono à super-large",
    params: [
      { key: "width", label: "Largeur", min: 0, max: 2, def: 1.5, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "depth", label: "Centre", min: 0, max: 1, def: 0, fmt: pct },
    ],
  },
  {
    id: "exciter",
    label: "EXCITER",
    title: "Excitatrice harmonique — enrichit les hautes fréquences par saturation douce",
    params: [
      { key: "harm", label: "Harm.", min: 0, max: 1, def: 0.5, fmt: pct },
      { key: "freq", label: "Fréq", min: 2000, max: 12000, def: 4000, fmt: hzr },
    ],
  },
  {
    id: "transient",
    label: "TRANSIENT",
    title: "Modeleur de transitoires — renforce l'attaque et façonne le sustain",
    params: [
      { key: "attack", label: "Attaque", min: 0, max: 1, def: 0.5, fmt: pct },
      { key: "sustain", label: "Sustain", min: 0, max: 1, def: 0.3, fmt: pct },
    ],
  },
  {
    id: "multiband",
    label: "MULTI-BAND",
    title: "Compresseur 3 bandes — grave · médium · aigu indépendants",
    params: [
      { key: "lo", label: "Grave", min: 0, max: 1, def: 0.4, fmt: pct },
      { key: "mid", label: "Médium", min: 0, max: 1, def: 0.3, fmt: pct },
      { key: "hi", label: "Aigu", min: 0, max: 1, def: 0.5, fmt: pct },
    ],
  },
  {
    id: "xymatrix",
    label: "XY MATRIX",
    title: "Pad tactile 2D : X = balayage filtre LP, Y = mix wet/dry",
    params: [
      { key: "x", label: "X", min: 0, max: 1, def: 0.5, fmt: pct },
      { key: "y", label: "Y", min: 0, max: 1, def: 0, fmt: pct },
      { key: "res", label: "Résonance", min: 1, max: 30, def: 1, fmt: (v) => `Q${v.toFixed(1)}` },
    ],
  },
  {
    id: "phaser",
    label: "PHASER",
    title: "Sweep modulation — effet spatial DJ classique",
    params: [
      { key: "rate", label: "Vitesse", min: 0.1, max: 10, def: 2, fmt: (v) => `${v.toFixed(1)} Hz` },
      { key: "depth", label: "Profondeur", min: 0, max: 1, def: 0, fmt: pct },
    ],
  },
  {
    id: "combfilter",
    label: "COMB",
    title: "Filtre à peigne — notches spectrales robotic/alien",
    params: [
      { key: "time", label: "Temps", min: 0.5, max: 50, def: 10, fmt: (v) => `${v.toFixed(1)} ms` },
      { key: "fb", label: "Feedback", min: 0, max: 0.95, def: 0.5, fmt: pct },
      { key: "lfoRate", label: "LFO", min: 0, max: 5, def: 0, fmt: (v) => `${v.toFixed(2)} Hz` },
    ],
  },
];

export const RACK_DEF = new Map(RACK_MODULES.map((m) => [m.id, m]));
const DEFAULT_ORDER: RackModuleId[] = RACK_MODULES.map((m) => m.id);

// one assignable macro: a knob value (0..1) mapped onto a set of module params
export interface MacroTarget {
  id: RackModuleId;
  key: string;
}
export interface RackPreset {
  order: RackModuleId[];
  modules: Record<string, { on: boolean; mix: number; params: Record<string, number>; flags?: Record<string, boolean> }>;
  macros: { value: number; targets: MacroTarget[] }[];
}

// internal: the live nodes + a param/flag applier for one module type
interface BuiltModule {
  fxIn: AudioNode;
  fxOut: AudioNode;
  onParam: (key: string, v: number) => void;
  onFlag?: (key: string, on: boolean) => void;
}

class RackSlot {
  readonly id: RackModuleId;
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private built: BuiltModule;
  on = false;
  mix = 1;
  params: Record<string, number> = {};
  flags: Record<string, boolean> = {};
  // Web Audio is a *pull* graph: while the wet branch reaches the output, the
  // effect (often a heavy convolver reverb / pitch-shifter / Tone.js node) is
  // rendered every quantum even when fully bypassed. We keep the wet branch
  // disconnected whenever the slot is off, so an idle module costs zero CPU,
  // and reconnect it just before fading back in. With ~15 modules × 2 decks
  // this is the single biggest CPU saving in the app.
  private wetLive = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: AudioContext, id: RackModuleId) {
    this.id = id;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.built = buildModule(ctx, id);

    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.input.connect(this.built.fxIn);
    this.built.fxOut.connect(this.wet);
    // NB: wet -> output is wired lazily (setWetLive) — the slot starts off, so
    // the effect stays idle and unpulled until it is first enabled.

    const def = RACK_DEF.get(id)!;
    for (const p of def.params) this.params[p.key] = p.def;
    for (const f of def.flags ?? []) this.flags[f.key] = false;
    // push defaults into the DSP
    for (const p of def.params) this.built.onParam(p.key, p.def);
    for (const f of def.flags ?? []) this.built.onFlag?.(f.key, false);
    this.refresh();
  }

  // connect / disconnect the wet branch from the output. Disconnecting it lets
  // the browser skip the effect's DSP entirely (nothing pulls it), so a
  // bypassed module is free.
  private setWetLive(live: boolean) {
    if (live === this.wetLive) return;
    try {
      if (live) this.wet.connect(this.output);
      else this.wet.disconnect(this.output);
    } catch {
      /* already in the desired state */
    }
    this.wetLive = live;
  }

  // Equal-power dry/wet crossfade (constant perceived level at mix 50%), applied
  // through short time-constants so toggling bypass / turning MIX never clicks.
  private refresh() {
    const c = this.input.context;
    const t = c.currentTime;
    const m = this.on ? this.mix : 0;
    const wet = Math.sin((m * Math.PI) / 2);
    const dry = this.on ? Math.cos((m * Math.PI) / 2) : 1;
    this.wet.gain.setTargetAtTime(wet, t, 0.012);
    this.dry.gain.setTargetAtTime(dry, t, 0.012);
  }
  setOn(on: boolean) {
    this.on = on;
    if (on) {
      // reconnect the wet branch *before* the fade so the ramp is heard
      if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
      this.setWetLive(true);
      this.refresh();
    } else {
      // fade out first, then idle the effect once the wet gain has reached ~0
      this.refresh();
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (!this.on) this.setWetLive(false);
      }, 120);
    }
  }
  setMix(v: number) {
    this.mix = Math.min(1, Math.max(0, v));
    this.refresh();
  }
  setParam(key: string, v: number) {
    this.params[key] = v;
    this.built.onParam(key, v);
  }
  setFlag(key: string, on: boolean) {
    this.flags[key] = on;
    this.built.onFlag?.(key, on);
  }
}

export class Rack {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: AudioContext;
  private dcBlock: BiquadFilterNode; // kill DC offset before the rack output
  private scope: AnalyserNode; // taps the rack output for the panel spectrum
  private levelBuf: Uint8Array<ArrayBuffer>;
  private slots = new Map<RackModuleId, RackSlot>();
  order: RackModuleId[] = [...DEFAULT_ORDER];
  macros: { value: number; targets: MacroTarget[] }[] = [
    { value: 0, targets: [] },
    { value: 0, targets: [] },
    { value: 0, targets: [] },
    { value: 0, targets: [] },
  ];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dcBlock = ctx.createBiquadFilter();
    this.dcBlock.type = "highpass";
    this.dcBlock.frequency.value = 18;
    this.dcBlock.connect(this.output);
    this.scope = ctx.createAnalyser();
    this.scope.fftSize = 1024;
    this.scope.smoothingTimeConstant = 0.8;
    this.output.connect(this.scope);
    this.levelBuf = new Uint8Array(new ArrayBuffer(this.scope.fftSize));
    for (const id of DEFAULT_ORDER) this.slots.set(id, new RackSlot(ctx, id));
    this.rewire();
  }

  // fill `arr` with the current magnitude spectrum of the rack output
  get spectrumBins(): number {
    return this.scope.frequencyBinCount;
  }
  getSpectrum(arr: Uint8Array<ArrayBuffer>): void {
    this.scope.getByteFrequencyData(arr);
  }

  // read-only state accessors for the UI
  isOn(id: RackModuleId): boolean {
    return !!this.slots.get(id)?.on;
  }
  getMix(id: RackModuleId): number {
    return this.slots.get(id)?.mix ?? 1;
  }
  getParam(id: RackModuleId, key: string): number {
    return this.slots.get(id)?.params[key] ?? 0;
  }
  getFlag(id: RackModuleId, key: string): boolean {
    return !!this.slots.get(id)?.flags[key];
  }
  // peak level 0..1 from the rack output (time-domain), for VU meters
  getLevel(): number {
    this.scope.getByteTimeDomainData(this.levelBuf);
    let peak = 0;
    for (const v of this.levelBuf) {
      const a = Math.abs(v - 128) / 128;
      if (a > peak) peak = a;
    }
    return peak;
  }
  isMacroTarget(i: number, target: MacroTarget): boolean {
    return !!this.macros[i]?.targets.some((t) => t.id === target.id && t.key === target.key);
  }

  // (re)connect the slots in `order`: input -> slot0 -> ... -> dcBlock -> output.
  // Wrapped in a short output fade so reordering never pops.
  private rewire() {
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setTargetAtTime(0, t, 0.004);
    this.input.disconnect();
    for (const s of this.slots.values()) s.output.disconnect();
    let prev: AudioNode = this.input;
    for (const id of this.order) {
      const s = this.slots.get(id)!;
      prev.connect(s.input);
      prev = s.output;
    }
    prev.connect(this.dcBlock);
    this.output.gain.setTargetAtTime(1, t + 0.02, 0.004);
  }

  setEnabled(id: RackModuleId, on: boolean) {
    this.slots.get(id)?.setOn(on);
  }
  setMix(id: RackModuleId, v: number) {
    this.slots.get(id)?.setMix(v);
  }
  setParam(id: RackModuleId, key: string, v: number) {
    this.slots.get(id)?.setParam(key, v);
  }
  setFlag(id: RackModuleId, key: string, on: boolean) {
    this.slots.get(id)?.setFlag(key, on);
  }

  // move a module up (-1) or down (+1) the chain
  move(id: RackModuleId, dir: -1 | 1) {
    const i = this.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.order.length) return;
    [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    this.rewire();
  }
  setOrder(order: RackModuleId[]) {
    const valid = order.filter((id) => this.slots.has(id));
    for (const id of DEFAULT_ORDER) if (!valid.includes(id)) valid.push(id);
    this.order = valid;
    this.rewire();
  }

  // ---- macros: each macro value 0..1 maps onto every assigned param's range ----
  setMacro(i: number, value: number) {
    const m = this.macros[i];
    if (!m) return;
    m.value = Math.min(1, Math.max(0, value));
    for (const t of m.targets) {
      const def = RACK_DEF.get(t.id)?.params.find((p) => p.key === t.key);
      if (!def) continue;
      this.setParam(t.id, t.key, def.min + (def.max - def.min) * m.value);
    }
  }
  toggleMacroTarget(i: number, target: MacroTarget) {
    const m = this.macros[i];
    if (!m) return;
    const idx = m.targets.findIndex((t) => t.id === target.id && t.key === target.key);
    if (idx >= 0) m.targets.splice(idx, 1);
    else m.targets.push(target);
  }

  // ---- presets ----
  export(): RackPreset {
    const modules: RackPreset["modules"] = {};
    for (const [id, s] of this.slots) {
      modules[id] = { on: s.on, mix: s.mix, params: { ...s.params }, flags: { ...s.flags } };
    }
    return {
      order: [...this.order],
      modules,
      macros: this.macros.map((m) => ({ value: m.value, targets: m.targets.map((t) => ({ ...t })) })),
    };
  }
  import(p: RackPreset | undefined | null) {
    if (!p) return;
    if (Array.isArray(p.order)) this.setOrder(p.order);
    if (p.modules) {
      for (const [id, m] of Object.entries(p.modules)) {
        const slot = this.slots.get(id as RackModuleId);
        if (!slot) continue;
        const def = RACK_DEF.get(id as RackModuleId)!;
        for (const pd of def.params) {
          const v = m.params?.[pd.key];
          slot.setParam(pd.key, typeof v === "number" ? v : pd.def);
        }
        for (const f of def.flags ?? []) slot.setFlag(f.key, !!m.flags?.[f.key]);
        slot.setMix(typeof m.mix === "number" ? m.mix : 1);
        slot.setOn(!!m.on);
      }
    }
    if (Array.isArray(p.macros)) {
      for (let i = 0; i < this.macros.length; i++) {
        const src = p.macros[i];
        if (!src) continue;
        this.macros[i] = {
          value: typeof src.value === "number" ? src.value : 0,
          targets: Array.isArray(src.targets) ? src.targets.map((t) => ({ ...t })) : [],
        };
      }
    }
  }
}

// load the auto-tune AudioWorklet once per context (shared with the deck's loader;
// addModule is idempotent for the same URL)
const autotuneWorklet = new WeakMap<BaseAudioContext, Promise<void>>();
function ensureAutotuneWorklet(c: AudioContext): Promise<void> {
  let p = autotuneWorklet.get(c);
  if (!p) {
    p = c.audioWorklet.addModule("/autotune-worklet.js");
    autotuneWorklet.set(c, p);
  }
  return p;
}

// ---- per-type DSP graph builders ----
function buildModule(c: AudioContext, id: RackModuleId): BuiltModule {
  // smooth a native AudioParam toward a value (anti-zipper)
  const at = (p: AudioParam, v: number, tc = 0.02) => p.setTargetAtTime(v, c.currentTime, tc);

  switch (id) {
    case "eq": {
      // 15-band 2/3-octave graphic EQ: a chain of peaking biquads, one per ISO centre
      // frequency (25 Hz … 16 kHz). Q=2.14 matches 2/3-octave bandwidth. Flat = transparent.
      const bands = EQ_FREQS.map((f) => {
        const b = c.createBiquadFilter();
        b.type = "peaking";
        b.frequency.value = f;
        b.Q.value = 2.14;
        b.gain.value = 0;
        return b;
      });
      for (let i = 0; i < bands.length - 1; i++) bands[i].connect(bands[i + 1]);
      return {
        fxIn: bands[0],
        fxOut: bands[bands.length - 1],
        onParam: (k, v) => {
          if (k[0] === "g") {
            const i = parseInt(k.slice(1), 10);
            if (bands[i]) at(bands[i].gain, v);
          }
        },
      };
    }
    case "autotune": {
      // monophonic pitch-correction worklet. Loads async; until ready, a dry
      // passthrough keeps audio flowing, then we crossfade into the corrected node.
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const bridge = c.createGain(); // dry passthrough while the worklet loads
      fxIn.connect(bridge);
      bridge.connect(fxOut);
      let node: AudioWorkletNode | null = null;
      let key = 0;
      let scale = 0;
      let amount = 1;
      let retune = 0.2;
      const pushScale = () => {
        if (!node) return;
        const k = ((Math.round(key) % 12) + 12) % 12;
        const set = AUTOTUNE_SCALES[Math.max(0, Math.min(2, Math.round(scale)))];
        node.port.postMessage({ type: "scale", classes: set.map((d) => (d + k) % 12) });
      };
      ensureAutotuneWorklet(c)
        .then(() => {
          node = new AudioWorkletNode(c, "autotune", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          const amp = node.parameters.get("amount");
          if (amp) amp.value = amount;
          const ret = node.parameters.get("retune");
          if (ret) ret.value = retune;
          fxIn.connect(node);
          node.connect(fxOut);
          bridge.gain.setTargetAtTime(0, c.currentTime, 0.01); // fade out the dry passthrough
          pushScale();
        })
        .catch((e) => console.error("[rack autotune]", e));
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "amount") {
            amount = v;
            const amp = node?.parameters.get("amount");
            if (amp) amp.value = v;
          } else if (k === "retune") {
            retune = v;
            const ret = node?.parameters.get("retune");
            if (ret) ret.value = v;
          } else if (k === "key") {
            key = v;
            pushScale();
          } else if (k === "scale") {
            scale = v;
            pushScale();
          }
        },
      };
    }
    case "comp": {
      const comp = c.createDynamicsCompressor();
      comp.knee.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      const makeup = c.createGain();
      comp.connect(makeup);
      return {
        fxIn: comp,
        fxOut: makeup,
        onParam: (k, v) => {
          if (k === "thresh") at(comp.threshold, v);
          else if (k === "ratio") at(comp.ratio, v);
          else if (k === "gain") at(makeup.gain, Math.pow(10, v / 20));
        },
      };
    }
    case "drive": {
      const pre = c.createGain();
      const shaper = c.createWaveShaper();
      shaper.oversample = "4x"; // anti-alias the saturation
      const tone = c.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 12000;
      const dc = c.createBiquadFilter();
      dc.type = "highpass";
      dc.frequency.value = 15; // DC blocker after the asymmetric shaper
      const makeup = c.createGain();
      pre.connect(shaper);
      shaper.connect(tone);
      tone.connect(dc);
      dc.connect(makeup);
      const setCurve = (amount: number) => {
        const n = 1024;
        const curve = new Float32Array(n);
        const k = 1 + amount * 60; // drive amount -> tanh hardness
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.tanh(k * x) / Math.tanh(k);
        }
        shaper.curve = curve;
      };
      setCurve(0.4);
      return {
        fxIn: pre,
        fxOut: makeup,
        onParam: (key, v) => {
          if (key === "drive") {
            at(pre.gain, 1 + v * 3);
            setCurve(v);
            at(makeup.gain, 1 / (1 + v * 0.7)); // level-match so bypass A/B is honest
          } else if (key === "tone") {
            at(tone.frequency, 600 * Math.pow(20, v)); // 600 Hz .. 12 kHz
          }
        },
      };
    }
    case "wavefold": {
      // Chebyshev polynomials = wave folding -> rich added harmonics
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const pre = c.createGain();
      pre.gain.value = 0.7; // keep input ≈in-range so Chebyshev folds cleanly (not noise)
      const cheby = new Tone.Chebyshev({ order: 6, wet: 1 });
      cheby.oversample = "4x";
      const tone = c.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 8000;
      const dc = c.createBiquadFilter();
      dc.type = "highpass";
      dc.frequency.value = 18;
      const makeup = c.createGain();
      makeup.gain.value = 1.3;
      fxIn.connect(pre);
      Tone.connect(pre, cheby);
      Tone.connect(cheby, tone);
      tone.connect(dc);
      dc.connect(makeup);
      makeup.connect(fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          // cap the order: very high Chebyshev orders are mostly harsh aliasing/noise
          if (k === "fold") cheby.order = Math.max(2, Math.round(2 + v * 14));
          else if (k === "tone") at(tone.frequency, 600 * Math.pow(20, v));
        },
      };
    }
    case "crush": {
      const shaper = c.createWaveShaper();
      shaper.oversample = "4x";
      const setBits = (bits: number) => {
        const n = 1024;
        const curve = new Float32Array(n);
        const step = Math.pow(2, Math.max(1, bits));
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.round(x * step) / step;
        }
        shaper.curve = curve;
      };
      setBits(4);
      return { fxIn: shaper, fxOut: shaper, onParam: (k, v) => k === "bits" && setBits(v) };
    }
    case "robot": {
      // bitcrush + frequency shift + mid bandpass -> robotic timbre
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const crusher = new Tone.BitCrusher({ bits: 4 });
      crusher.wet.value = 1;
      const shifter = new Tone.FrequencyShifter({ frequency: 0, wet: 1 });
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1200;
      band.Q.value = 1.2;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 16000; // tame the ring-mod aliasing
      Tone.connect(fxIn, crusher);
      crusher.connect(shifter);
      Tone.connect(shifter, band);
      band.connect(lp);
      lp.connect(fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "carrier") shifter.frequency.rampTo(v, 0.03);
          else if (k === "grit") crusher.bits.value = Math.max(1, Math.round(v));
          else if (k === "tone") at(band.frequency, v);
        },
      };
    }
    case "ringmod": {
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const shifter = new Tone.FrequencyShifter({ frequency: 200, wet: 1 });
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 16000;
      Tone.connect(fxIn, shifter);
      Tone.connect(shifter, lp);
      lp.connect(fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "freq") shifter.frequency.rampTo(v, 0.03);
          else if (k === "depth") shifter.wet.rampTo(v, 0.03);
        },
      };
    }
    case "voyelle": {
      // 3 parallel formant bandpasses morphing across A-E-I-O-U
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const F = [
        [800, 1150, 2800], // A
        [400, 1600, 2700], // E
        [350, 1700, 2700], // I
        [450, 800, 2830], // O
        [325, 700, 2530], // U
      ];
      fxOut.gain.value = 3.2; // makeup: parallel formant bandpasses lose a lot of level
      const bands = [0, 1, 2].map((i) => {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 8;
        const bg = c.createGain();
        bg.gain.value = i === 0 ? 1 : i === 1 ? 0.85 : 0.6; // formant balance (F1>F2>F3)
        fxIn.connect(bp);
        bp.connect(bg);
        bg.connect(fxOut);
        return bp;
      });
      const setMorph = (m: number) => {
        const x = Math.min(0.9999, Math.max(0, m)) * (F.length - 1);
        const i = Math.floor(x);
        const f = x - i;
        const a = F[i];
        const b = F[Math.min(F.length - 1, i + 1)];
        for (let k = 0; k < 3; k++) at(bands[k].frequency, a[k] + (b[k] - a[k]) * f);
      };
      setMorph(0.3);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "morph") setMorph(v);
          else if (k === "reso") bands.forEach((b) => at(b.Q, v));
        },
      };
    }
    case "autowah": {
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const wah = new Tone.AutoWah({ baseFrequency: 120, octaves: 5, sensitivity: -20, Q: 4, wet: 1 });
      Tone.connect(fxIn, wah);
      Tone.connect(wah, fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "base") wah.baseFrequency = v;
          else if (k === "sens") wah.sensitivity = v;
          else if (k === "q") wah.Q.rampTo(v, 0.05);
        },
      };
    }
    case "resonator": {
      // tuned feedback comb -> makes the signal "sing" a note
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const comb = new Tone.FeedbackCombFilter({ delayTime: 1 / 220, resonance: 0.8 });
      Tone.connect(fxIn, comb);
      Tone.connect(comb, fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "tune") comb.delayTime.rampTo(1 / Math.max(20, v), 0.03);
          else if (k === "reso") comb.resonance.rampTo(Math.min(0.9, v), 0.03); // <0.95 avoids self-oscillation/howl
        },
      };
    }
    case "gate": {
      // square-wave tremolo -> rhythmic on/off trance gate
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const trem = new Tone.Tremolo({ frequency: 8, depth: 1, type: "square", spread: 0, wet: 1 }).start();
      Tone.connect(fxIn, trem);
      Tone.connect(trem, fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "rate") trem.frequency.rampTo(v, 0.05);
          else if (k === "depth") trem.depth.rampTo(v, 0.05);
        },
      };
    }
    case "glitch": {
      // very short synced feedback delay; REPEAT momentarily freezes a slice
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const dl = new Tone.FeedbackDelay({ delayTime: 0.12, feedback: 0.4, wet: 1 });
      Tone.connect(fxIn, dl);
      Tone.connect(dl, fxOut);
      let baseFb = 0.4;
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "time") dl.delayTime.rampTo(Math.max(0.02, v), 0.02);
          else if (k === "fb") {
            baseFb = v;
            dl.feedback.rampTo(v, 0.03);
          }
        },
        onFlag: (k, on) => {
          if (k === "repeat") dl.feedback.rampTo(on ? 0.97 : baseFb, 0.02);
        },
      };
    }
    case "shimmer": {
      // octave-up pitch shift feeding a reverb -> ethereal rising pad
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const shift = new Tone.PitchShift({ pitch: 12, feedback: 0.5, wet: 1 });
      const rev = new Tone.Reverb({ decay: 4, wet: 1 });
      Tone.connect(fxIn, shift);
      shift.connect(rev);
      Tone.connect(rev, fxOut);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "decay") rev.decay = Math.max(0.1, v);
          else if (k === "shimmer") shift.feedback.rampTo(Math.min(0.6, v), 0.05); // cap feedback so the octave doesn't build into a squeal
        },
      };
    }
    case "delay": {
      // stereo delay; ping-pong cross-feeds L<->R when enabled
      const inGain = c.createGain();
      const out = c.createGain();
      const split = c.createChannelSplitter(2);
      const merge = c.createChannelMerger(2);
      inGain.channelCount = 2;
      inGain.channelCountMode = "explicit";
      inGain.channelInterpretation = "speakers";
      const dL = c.createDelay(2);
      const dR = c.createDelay(2);
      dL.delayTime.value = 0.38;
      dR.delayTime.value = 0.38;
      const fbL = c.createGain();
      const fbR = c.createGain();
      fbL.gain.value = 0.55;
      fbR.gain.value = 0.55;
      inGain.connect(split);
      split.connect(dL, 0);
      split.connect(dR, 1);
      dL.connect(fbL);
      dR.connect(fbR);
      dL.connect(merge, 0, 0);
      dR.connect(merge, 0, 1);
      merge.connect(out);
      let ping = false;
      const wireFeedback = () => {
        fbL.disconnect();
        fbR.disconnect();
        if (ping) {
          fbL.connect(dR);
          fbR.connect(dL);
        } else {
          fbL.connect(dL);
          fbR.connect(dR);
        }
      };
      wireFeedback();
      return {
        fxIn: inGain,
        fxOut: out,
        onParam: (k, v) => {
          if (k === "time") {
            at(dL.delayTime, v, 0.03);
            at(dR.delayTime, v, 0.03);
          } else if (k === "fb") {
            at(fbL.gain, v);
            at(fbR.gain, v);
          }
        },
        onFlag: (k, on) => {
          if (k === "pingpong") {
            ping = on;
            wireFeedback();
          }
        },
      };
    }
    case "reverb": {
      const conv = c.createConvolver();
      const out = c.createGain();
      out.gain.value = 1.4;
      const impulse = (decay: number) => {
        const rate = c.sampleRate;
        const len = Math.max(1, Math.floor(rate * decay));
        const buf = c.createBuffer(2, len, rate);
        for (let ch = 0; ch < 2; ch++) {
          const data = buf.getChannelData(ch);
          for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
        }
        return buf;
      };
      conv.buffer = impulse(3);
      conv.connect(out);
      return {
        fxIn: conv,
        fxOut: out,
        onParam: (k, v) => {
          if (k === "decay") conv.buffer = impulse(v);
        },
      };
    }
    case "isolator": {
      // mid-side: keep the centre (vocal) or, in KARAOKE, the sides (vocal removed)
      const fxIn = c.createGain();
      fxIn.channelCount = 2;
      fxIn.channelCountMode = "explicit";
      fxIn.channelInterpretation = "speakers";
      const fxOut = c.createGain();
      const split = c.createChannelSplitter(2);
      const lG = c.createGain();
      const rG = c.createGain();
      const midL = c.createGain();
      midL.gain.value = 0.5;
      const midR = c.createGain();
      midR.gain.value = 0.5;
      const mid = c.createGain();
      const sideL = c.createGain();
      sideL.gain.value = 0.5;
      const sideR = c.createGain();
      sideR.gain.value = -0.5;
      const side = c.createGain();
      fxIn.connect(split);
      split.connect(lG, 0);
      split.connect(rG, 1);
      lG.connect(midL);
      rG.connect(midR);
      midL.connect(mid);
      midR.connect(mid);
      lG.connect(sideL);
      rG.connect(sideR);
      sideL.connect(side);
      sideR.connect(side);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400;
      bp.Q.value = 0.7;
      mid.connect(bp);
      const keepGain = c.createGain(); // bandpassed centre (vocal kept)
      const sideKill = c.createGain(); // sides (vocal removed)
      sideKill.gain.value = 0;
      bp.connect(keepGain);
      keepGain.connect(fxOut);
      side.connect(sideKill);
      sideKill.connect(fxOut);
      let karaoke = false;
      let curFocus = 0.7;
      const apply = () => {
        if (karaoke) {
          at(keepGain.gain, 0, 0.01);
          at(sideKill.gain, 1, 0.01);
        } else {
          at(keepGain.gain, 0.6 + curFocus, 0.01);
          at(sideKill.gain, 0, 0.01);
        }
      };
      apply();
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "focus") {
            curFocus = v;
            at(bp.Q, 0.5 + v * 3);
            apply();
          }
        },
        onFlag: (k, on) => {
          if (k === "karaoke") {
            karaoke = on;
            apply();
          }
        },
      };
    }
    case "limiter": {
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -1;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.002;
      lim.release.value = 0.1;
      return { fxIn: lim, fxOut: lim, onParam: (k, v) => k === "ceil" && at(lim.threshold, v) };
    }
    case "loudness": {
      // 2-stage loudness maximizer: fast compressor + makeup gain + brick-wall limiter
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -30;
      comp.knee.value = 8;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      const makeup = c.createGain();
      makeup.gain.value = 3;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -2;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.06;
      fxIn.connect(comp);
      comp.connect(makeup);
      makeup.connect(lim);
      lim.connect(fxOut);
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "target") {
            at(comp.threshold, -40 + v * 18);
            at(comp.ratio, 4 + v * 12);
            at(makeup.gain, 1 + v * 6);
            at(lim.threshold, -1 - v * 3);
          } else if (k === "punch") {
            at(comp.attack, 0.001 + (1 - v) * 0.05);
            at(comp.release, 0.05 + v * 0.35);
          }
        },
      };
    }
    case "surround": {
      // M-S stereo widener: scale side signal to widen or narrow the stereo image
      const fxIn = c.createGain();
      fxIn.channelCount = 2;
      fxIn.channelCountMode = "explicit";
      fxIn.channelInterpretation = "speakers";
      const fxOut = c.createGain();
      const split = c.createChannelSplitter(2);
      const merge = c.createChannelMerger(2);
      const lG = c.createGain();
      const rG = c.createGain();
      // M = (L + R) * 0.5
      const mL = c.createGain(); mL.gain.value = 0.5;
      const mR = c.createGain(); mR.gain.value = 0.5;
      const mid = c.createGain();
      // S = (L - R) * 0.5, scaled by width
      const sL = c.createGain(); sL.gain.value = 0.5;
      const sR = c.createGain(); sR.gain.value = -0.5;
      const side = c.createGain(); side.gain.value = 1.5; // default: slightly wider
      const sideNeg = c.createGain(); sideNeg.gain.value = -1;
      // decode: L' = M + S*w, R' = M - S*w
      fxIn.connect(split);
      split.connect(lG, 0); split.connect(rG, 1);
      lG.connect(mL); rG.connect(mR);
      mL.connect(mid); mR.connect(mid);
      lG.connect(sL); rG.connect(sR);
      sL.connect(side); sR.connect(side);
      side.connect(sideNeg);
      mid.connect(merge, 0, 0); mid.connect(merge, 0, 1);
      side.connect(merge, 0, 0);
      sideNeg.connect(merge, 0, 1);
      merge.connect(fxOut);
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "width") at(side.gain, v * 2);
          else if (k === "depth") at(mid.gain, Math.max(0.01, 1 - v * 0.5));
        },
      };
    }
    case "exciter": {
      // harmonic exciter: high-pass signal -> soft saturation -> mix back (adds sparkle)
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4000;
      hp.Q.value = 0.7;
      const shaper = c.createWaveShaper();
      shaper.oversample = "4x";
      const excGain = c.createGain();
      excGain.gain.value = 0.4;
      const setCurve = (amt: number) => {
        const n = 512;
        const curve = new Float32Array(n);
        const k = 1 + amt * 15;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.tanh(k * x) / Math.tanh(k);
        }
        shaper.curve = curve;
      };
      setCurve(0.5);
      fxIn.connect(fxOut); // dry pass-through
      fxIn.connect(hp);
      hp.connect(shaper);
      shaper.connect(excGain);
      excGain.connect(fxOut);
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "harm") { setCurve(v); at(excGain.gain, 0.1 + v * 0.9); }
          else if (k === "freq") at(hp.frequency, v);
        },
      };
    }
    case "transient": {
      // parallel fast+slow compressors: fast sharpens attacks, slow controls sustain
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const transComp = c.createDynamicsCompressor();
      transComp.threshold.value = -24;
      transComp.knee.value = 2;
      transComp.ratio.value = 6;
      transComp.attack.value = 0.0005;
      transComp.release.value = 0.08;
      const transGain = c.createGain();
      transGain.gain.value = 1.5;
      const sustComp = c.createDynamicsCompressor();
      sustComp.threshold.value = -18;
      sustComp.knee.value = 8;
      sustComp.ratio.value = 3;
      sustComp.attack.value = 0.06;
      sustComp.release.value = 0.5;
      const sustGain = c.createGain();
      sustGain.gain.value = 0.4;
      fxIn.connect(transComp);
      transComp.connect(transGain);
      transGain.connect(fxOut);
      fxIn.connect(sustComp);
      sustComp.connect(sustGain);
      sustGain.connect(fxOut);
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "attack") at(transGain.gain, 0.5 + v * 2.5);
          else if (k === "sustain") at(sustGain.gain, v * 1.5);
        },
      };
    }
    case "multiband": {
      // 3-band parallel compressor: lo (<250Hz) / mid (250–4kHz) / hi (>4kHz)
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const loLp = c.createBiquadFilter(); loLp.type = "lowpass";  loLp.frequency.value = 250;
      const midLp = c.createBiquadFilter(); midLp.type = "lowpass"; midLp.frequency.value = 4000;
      const midHp = c.createBiquadFilter(); midHp.type = "highpass"; midHp.frequency.value = 250;
      const hiHp = c.createBiquadFilter(); hiHp.type = "highpass"; hiHp.frequency.value = 4000;
      const loComp = c.createDynamicsCompressor();
      const midComp = c.createDynamicsCompressor();
      const hiComp = c.createDynamicsCompressor();
      for (const comp of [loComp, midComp, hiComp]) {
        comp.threshold.value = -24;
        comp.knee.value = 6;
        comp.ratio.value = 4;
        comp.attack.value = 0.008;
        comp.release.value = 0.2;
      }
      fxIn.connect(loLp); loLp.connect(loComp); loComp.connect(fxOut);
      fxIn.connect(midLp); midLp.connect(midHp); midHp.connect(midComp); midComp.connect(fxOut);
      fxIn.connect(hiHp); hiHp.connect(hiComp); hiComp.connect(fxOut);
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          const comp = k === "lo" ? loComp : k === "mid" ? midComp : k === "hi" ? hiComp : null;
          if (comp) {
            at(comp.ratio, 1 + v * 14);
            at(comp.threshold, -12 - v * 24);
          }
        },
      };
    }
    case "xymatrix": {
      // 2D touch pad: X-axis filters (LP 200Hz → HP 16kHz), Y-axis mixes dry/wet
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const dryGain = c.createGain();
      const lpFilter = c.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.value = 200;
      const wetGain = c.createGain();
      const lfo = new Tone.LFO({ frequency: 0.5, amplitude: 1 });
      const lfoAmp = new Tone.Gain(0);
      lfo.connect(lfoAmp);
      lfoAmp.connect(wetGain.gain);
      lfo.start();
      fxIn.connect(dryGain);
      dryGain.connect(fxOut);
      fxIn.connect(lpFilter);
      lpFilter.connect(wetGain);
      wetGain.connect(fxOut);
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "x") {
            // X: filter sweep 200Hz→16kHz (logarithmic)
            const freq = 200 * Math.pow(80, v); // 200 @ v=0, 16000 @ v=1
            at(lpFilter.frequency, Math.max(20, Math.min(20000, freq)));
          } else if (k === "y") {
            // Y: wet/dry mix (starts at 0 = dry only)
            // Upper half of Y range: LFO modulation on wet mix
            if (v > 0.5) {
              const lfoDepth = (v - 0.5) * 2; // 0→1 in upper half
              lfoAmp.gain.value = lfoDepth * 0.3; // LFO amplitude: ±0.3
              at(wetGain.gain, 0.5 + lfoDepth * 0.5); // Base wet level 0.5→1
            } else {
              lfoAmp.gain.value = 0; // No LFO in lower half
              at(wetGain.gain, v * 2); // Simple crossfade 0→1 (scaled by 2)
            }
          } else if (k === "res") {
            // res: LP filter resonance (Q)
            at(lpFilter.Q, 1 + v * 29);
          }
        },
      };
    }
    case "phaser": {
      // LFO-modulated allpass filter for spatial sweep
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const dryGain = c.createGain();
      const allPass = c.createBiquadFilter();
      allPass.type = "allpass";
      allPass.frequency.value = 1000;
      const wetGain = c.createGain();
      const lfoAmp = new Tone.Gain(0);
      const lfo = new Tone.LFO({ frequency: 2, amplitude: 1 });
      lfo.connect(lfoAmp);
      lfoAmp.connect(allPass.frequency);
      lfo.start();
      fxIn.connect(dryGain);
      dryGain.connect(fxOut);
      fxIn.connect(allPass);
      allPass.connect(wetGain);
      wetGain.connect(fxOut);
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "rate") {
            // rate: LFO frequency 0.1→10 Hz
            lfo.frequency.value = 0.1 * Math.pow(100, v);
          } else if (k === "depth") {
            // depth: wet/dry mix (starts at 0)
            at(wetGain.gain, v);
            at(dryGain.gain, 1 - v);
            // Modulate LFO amplitude with depth
            lfoAmp.gain.value = v * 600; // sweep range 0→600 Hz around 1000 Hz base
          }
        },
      };
    }
    case "combfilter": {
      // Delay+feedback creates spectral notches, optional LFO sweep
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const delay = c.createDelay(0.5);
      const feedback = c.createGain();
      const wetGain = c.createGain();
      const lfoAmp = new Tone.Gain(0);
      const lfo = new Tone.LFO({ frequency: 1, amplitude: 1 });
      lfo.connect(lfoAmp);
      lfoAmp.connect(delay.delayTime);
      lfo.start();
      delay.delayTime.value = 0.01;
      feedback.gain.value = 0.5;
      fxIn.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      fxIn.connect(fxOut);
      wetGain.connect(fxOut);
      wetGain.gain.value = 0;
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "time") {
            // time: delay 0.5→50ms (logarithmic)
            const t = 0.0005 * Math.pow(100, v);
            at(delay.delayTime, Math.max(0.0005, Math.min(0.5, t)));
          } else if (k === "fb") {
            // fb: feedback 0→0.95
            at(feedback.gain, v * 0.95);
          } else if (k === "lfoRate") {
            // lfoRate: LFO sweep 0→5Hz, with sweep depth 0.005 (±0.5ms)
            lfo.frequency.value = v * 5;
            lfoAmp.gain.value = v > 0 ? 0.005 : 0; // ±0.5ms sweep when enabled
          }
        },
      };
    }
    default:
      throw new Error(`unknown rack module: ${id}`);
  }
}
