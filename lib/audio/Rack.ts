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
import { buildEq, eqQ, type EqBuilt } from "./eqModule";

export type RackModuleId =
  | "isolator"
  | "eq"
  | "autotune"
  | "comp"
  | "drive"
  | "wavefold"
  | "crush"
  | "ringmod"
  | "voyelle"
  | "autowah"
  | "resonator"
  | "gate"
  | "glitch"
  | "shimmer"
  | "delay"
  | "reverb"
  | "loudness"
  | "surround"
  | "exciter"
  | "transient"
  | "multiband"
  | "xymatrix"
  | "phaser";

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
  sync?: { key: string; kind: "time" | "rate" }; // the param that follows the "div" (musical time) param
}

// musical times for the synced modules, in beats (0 = free, the knob rules)
export const RACK_DIVS: { label: string; beats: number }[] = [
  { label: "Libre", beats: 0 }, { label: "1/16", beats: 0.25 }, { label: "1/8", beats: 0.5 }, { label: "1/8 pointé", beats: 0.75 },
  { label: "1/4", beats: 1 }, { label: "1/2", beats: 2 }, { label: "1 mesure", beats: 4 }, { label: "2 mesures", beats: 8 },
];
const divParam = (def: number): RackParamDef => ({ key: "div", label: "Temps", min: 0, max: RACK_DIVS.length - 1, def, fmt: (v) => RACK_DIVS[Math.round(v)]?.label ?? "" });
// the value a synced param takes at this tempo, clamped to its range (null = free)
export function divValue(def: RackModuleDef, div: number, bpm: number): number | null {
  const beats = RACK_DIVS[Math.round(div)]?.beats ?? 0;
  const p = def.sync && def.params.find((q) => q.key === def.sync!.key);
  if (!beats || !p || !(bpm > 0)) return null;
  const sec = (beats * 60) / bpm;
  const v = def.sync!.kind === "time" ? sec : 1 / sec;
  return Math.min(p.max, Math.max(p.min, v));
}

// dosage an effect takes when it is switched on at 0 %: switching on is always heard
export const START_MIX: Record<string, number> = {
  isolator: 1, autotune: 1, comp: 1, drive: 0.6, wavefold: 0.5, crush: 0.6, ringmod: 0.5, voyelle: 0.8, autowah: 0.8,
  resonator: 0.5, gate: 1, glitch: 0.6, shimmer: 0.35, delay: 0.3, reverb: 0.35, loudness: 1, surround: 1, exciter: 0.5,
  transient: 1, multiband: 1, xymatrix: 1, phaser: 0.7,
};

const hz = (v: number) => `${v.toFixed(2)} Hz`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ms = (v: number) => `${Math.round(v * 1000)} ms`;
const hzr = (v: number) => `${Math.round(v)} Hz`;
const dbr = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;
// VOYELLE: vowel sets as [F1, F2, F3] formant frequencies (adult voice, Hz)
export const VOWEL_SETS: { name: string; vowels: { label: string; f: [number, number, number] }[] }[] = [
  { name: "Classique", vowels: [
    { label: "A", f: [800, 1150, 2800] }, { label: "E", f: [400, 1600, 2700] }, { label: "I", f: [350, 1700, 2700] },
    { label: "O", f: [450, 800, 2830] }, { label: "U", f: [325, 700, 2530] },
  ] },
  { name: "Français", vowels: [
    { label: "A", f: [750, 1300, 2500] }, { label: "È", f: [550, 1750, 2500] }, { label: "É", f: [400, 2000, 2550] },
    { label: "I", f: [280, 2250, 2900] }, { label: "U", f: [280, 1750, 2150] }, { label: "EU", f: [380, 1500, 2300] },
    { label: "ŒU", f: [550, 1450, 2450] }, { label: "O", f: [400, 750, 2400] }, { label: "OU", f: [300, 750, 2300] },
    { label: "AN", f: [650, 1050, 2500] },
  ] },
  { name: "Chœur", vowels: [
    { label: "OU", f: [350, 800, 2700] }, { label: "OH", f: [450, 850, 2600] }, { label: "AH", f: [850, 1250, 2800] },
    { label: "EH", f: [550, 1900, 2700] }, { label: "II", f: [300, 2300, 3100] },
  ] },
  { name: "Talk-box", vowels: [
    { label: "OU", f: [300, 750, 2300] }, { label: "WA", f: [650, 1000, 2500] }, { label: "A", f: [850, 1250, 2700] },
    { label: "YA", f: [600, 1900, 2700] }, { label: "I", f: [300, 2250, 3000] },
  ] },
  { name: "Nasales", vowels: [
    { label: "M", f: [250, 1100, 2500] }, { label: "N", f: [250, 1700, 2600] }, { label: "NG", f: [250, 1400, 2400] },
    { label: "AN", f: [650, 1050, 2500] }, { label: "ON", f: [450, 800, 2500] },
  ] },
];
const vowelSet = (v: number) => VOWEL_SETS[Math.max(0, Math.min(VOWEL_SETS.length - 1, Math.round(v)))];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_LABELS = ["CHRO", "MAJ", "MIN"];
// pitch-class sets for the auto-tune module (chromatic / major / minor)
const AUTOTUNE_SCALES: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 8, 10],
];

// XY Matrix: each axis can independently drive one of these targets — pick
// what X and Y do from the pad itself, like an assignable macro controller.
export const XY_TARGETS = ["Filtre", "Résonance", "Mix", "Echo", "Bitcrush", "Stutter"] as const;
const xyTargetLabel = (v: number) => XY_TARGETS[Math.max(0, Math.min(XY_TARGETS.length - 1, Math.round(v)))];

// XY Matrix: when an axis is assigned "Filtre", pick which kind it sweeps —
// each axis has its own filter node, so X and Y can run two different filter
// types at once (e.g. X = low-pass, Y = high-pass, like a DJ isolator pad).
export const XY_FILTER_TYPES = ["Passe-bas", "Passe-haut", "Passe-bande", "Coupe-bande"] as const;
const XY_FILTER_BIQUAD: BiquadFilterType[] = ["lowpass", "highpass", "bandpass", "notch"];
const xyFilterTypeLabel = (v: number) =>
  XY_FILTER_TYPES[Math.max(0, Math.min(XY_FILTER_TYPES.length - 1, Math.round(v)))];

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
    title: "Égaliseur graphique 15 bandes — une courbe interactive, la réponse réelle du filtre et un spectre avant/après",
    params: [
      ...EQ_FREQS.map((f, i) => ({
        key: `g${i}`,
        label: eqLabel(f),
        min: -18,
        max: 18,
        def: 0,
        fmt: dbr,
      })),
      {
        key: "q",
        label: "Largeur",
        min: 0,
        max: 1,
        def: 0.62,
        fmt: (v) => `${((2 / Math.LN2) * Math.asinh(1 / (2 * eqQ(v)))).toFixed(2)} oct`,
      },
    ],
    flags: [{ key: "auto", label: "AUTO GAIN" }],
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
    label: "CRUSH · ROBOT",
    title: "Bitcrusher et voix robot : son lo-fi qui grésille, ou voix de robot quand ROBOT monte",
    params: [
      { key: "bits", label: "Grain", min: 1, max: 8, def: 4, fmt: (v) => `${Math.round(v)} bit` },
      { key: "down", label: "Lo-fi", min: 1, max: 32, def: 6, fmt: (v) => `${Math.round(48 / v)} kHz` },
      { key: "robot", label: "Robot", min: 0, max: 1, def: 0, fmt: pct },
      { key: "shift", label: "Décalage", min: -500, max: 500, def: 0, fmt: hzr },
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
    title: "Filtre de formant — fait « parler » le son : jeux de voyelles (classique, français, chœur, talk-box, nasales), taille de voix, balayage auto",
    params: [
      { key: "set", label: "Jeu", min: 0, max: VOWEL_SETS.length - 1, def: 0, fmt: (v) => vowelSet(v).name },
      { key: "morph", label: "Voyelle", min: 0, max: 1, def: 0.3, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "size", label: "Voix", min: 0.7, max: 1.4, def: 1, fmt: (v) => (v < 0.9 ? "grave" : v > 1.12 ? "aiguë" : "normale") },
      { key: "auto", label: "Auto", min: 0, max: 6, def: 0, fmt: (v) => (v < 0.05 ? "off" : `${v.toFixed(1)} Hz`) },
      { key: "reso", label: "Réso", min: 1, max: 20, def: 8, fmt: (v) => v.toFixed(0) },
      divParam(0),
    ],
    sync: { key: "auto", kind: "rate" },
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
    label: "RÉSO · PEIGNE",
    title: "Résonateur et filtre à peigne : le son chante sur une note, ou balaie comme un jet quand MOUVEMENT monte",
    params: [
      { key: "tune", label: "Note", min: 50, max: 1000, def: 220, fmt: hzr },
      { key: "reso", label: "Réso", min: 0, max: 0.95, def: 0.8, fmt: pct },
      { key: "move", label: "Mouvement", min: 0, max: 1, def: 0, fmt: pct },
      { key: "rate", label: "Vitesse", min: 0.05, max: 8, def: 0.5, fmt: hz },
      divParam(0),
    ],
    sync: { key: "rate", kind: "rate" },
  },
  {
    id: "gate",
    label: "GATE",
    title: "Trance gate — hachage rythmique on/off, synchronisable au BPM",
    params: [
      { key: "rate", label: "Vitesse", min: 0.5, max: 16, def: 8, fmt: hz },
      { key: "depth", label: "Profond.", min: 0, max: 1, def: 1, fmt: pct },
      divParam(1),
    ],
    sync: { key: "rate", kind: "rate" },
  },
  {
    id: "glitch",
    label: "GLITCH",
    title: "Stutter / bégaiement — tiens REPEAT pour figer · synchronisable",
    params: [
      { key: "time", label: "Temps", min: 0.02, max: 0.5, def: 0.12, fmt: ms },
      { key: "fb", label: "Retour", min: 0, max: 0.95, def: 0.4, fmt: pct },
      divParam(1),
    ],
    flags: [{ key: "repeat", label: "REPEAT" }],
    sync: { key: "time", kind: "time" },
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
      divParam(3),
    ],
    flags: [{ key: "pingpong", label: "PING" }],
    sync: { key: "time", kind: "time" },
  },
  {
    id: "reverb",
    label: "REVERB",
    title: "Reverb à convolution — espace et profondeur",
    params: [{ key: "decay", label: "Taille", min: 0.3, max: 6, def: 3, fmt: (v) => `${v.toFixed(1)} s` }],
  },
  {
    id: "loudness",
    label: "LOUDNESS · LIMITEUR",
    title: "Plus fort et plus dense sans saturer ; CIBLE à 0 = simple limiteur de sécurité",
    params: [
      { key: "target", label: "Cible", min: 0, max: 1, def: 0.5, fmt: (v) => (v < 0.02 ? "limiteur" : `${Math.round(-14 + v * 8)} LUFS`) },
      { key: "punch", label: "Punch", min: 0, max: 1, def: 0.5, fmt: pct },
      { key: "ceil", label: "Plafond", min: -12, max: 0, def: -1, fmt: (v) => `${v.toFixed(1)} dB` },
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
    title: "Pad tactile 2D géant — assigne librement quel effet chaque axe contrôle",
    params: [
      { key: "x", label: "X", min: 0, max: 1, def: 0.5, fmt: pct },
      { key: "y", label: "Y", min: 0, max: 1, def: 0, fmt: pct },
      { key: "xTarget", label: "Effet X", min: 0, max: XY_TARGETS.length - 1, def: 0, fmt: xyTargetLabel },
      { key: "yTarget", label: "Effet Y", min: 0, max: XY_TARGETS.length - 1, def: 2, fmt: xyTargetLabel },
      { key: "xFilterType", label: "Filtre X", min: 0, max: XY_FILTER_TYPES.length - 1, def: 0, fmt: xyFilterTypeLabel },
      { key: "yFilterType", label: "Filtre Y", min: 0, max: XY_FILTER_TYPES.length - 1, def: 1, fmt: xyFilterTypeLabel },
    ],
  },
  {
    id: "phaser",
    label: "PHASER",
    title: "Phaser : le son tourne et se creuse en vagues, calé sur le tempo",
    params: [
      { key: "rate", label: "Vitesse", min: 0.1, max: 8, def: 0.5, fmt: (v) => `${v.toFixed(2)} Hz` },
      { key: "depth", label: "Profondeur", min: 0, max: 1, def: 0.6, fmt: pct },
      { key: "fb", label: "Retour", min: 0, max: 0.9, def: 0.5, fmt: pct },
      divParam(6),
    ],
    sync: { key: "rate", kind: "rate" },
  },
];

export const RACK_DEF = new Map(RACK_MODULES.map((m) => [m.id, m]));
const DEFAULT_ORDER: RackModuleId[] = RACK_MODULES.map((m) => m.id);

// one assignable macro: a knob value (0..1) mapped onto a set of module params
export interface MacroTarget {
  id: RackModuleId;
  key: string;
}
// one editable EQ curve: the deck EQ (curve -1) or the EQ of one stem (curve i)
export interface EqView {
  getGain(i: number): number;
  setGain(i: number, db: number): void;
  getQ(): number;
  isOn(): boolean;
  response(freqs: Float32Array, out: Float32Array): void;
  readonly spectrumBins: number;
  spectrum(which: "pre" | "post", arr: Uint8Array<ArrayBuffer>): void;
}

export interface RackPreset {
  stemEq?: (number[] | null)[]; // per-stem EQ band gains
  order: RackModuleId[];
  modules: Record<string, { on: boolean; mix: number; params: Record<string, number>; flags?: Record<string, boolean>; target?: number }>;
  macros: { value: number; targets: MacroTarget[] }[];
}

// internal: the live nodes + a param/flag applier for one module type
interface BuiltModule {
  fxIn: AudioNode;
  fxOut: AudioNode;
  onParam: (key: string, v: number) => void;
  onFlag?: (key: string, on: boolean) => void;
  eq?: EqBuilt;
}

class RackSlot {
  readonly id: RackModuleId;
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private built: BuiltModule | null = null;
  private ctx: AudioContext;
  on = false;
  // every module starts at 0% intensity — the "INT" fader must be raised by
  // hand before an enabled effect is audible, no exceptions. (EQ is the one
  // module that overrides this to 1 in the constructor below: its bands
  // default to flat/0dB, so 0% mix would make raising a band do nothing.)
  mix = 0;
  target = -1; // stem index this effect is aimed at (-1 = the whole deck)
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
    this.ctx = ctx;

    this.input.connect(this.dry);
    this.dry.connect(this.output);
    // NB: wet -> output is wired lazily (setWetLive) — the slot starts off, so
    // the effect stays idle and unpulled until it is first enabled.

    // the graphic EQ behaves like real hardware — always inline in the signal
    // path at full intensity, not an optional bypassable FX pedal. Flat bands
    // (0 dB, the default) are already transparent, so this doesn't add any
    // sound — it just means moving a band fader is audible immediately,
    // instead of being silently masked by a 0% INT mix.
    const def = RACK_DEF.get(id)!;
    for (const p of def.params) this.params[p.key] = p.def;
    for (const f of def.flags ?? []) this.flags[f.key] = false;

    if (id === "eq") {
      this.ensureBuilt();
      this.on = true;
      this.mix = 1;
      this.setWetLive(true); // Constructor bypasses setOn, so must connect wet branch manually
    }
    this.refresh();
  }

  // Build the module's DSP the first time it is switched on (most modules are never
  // used): saves its nodes and buffers. The stored params and flags are pushed into it.
  private ensureBuilt(): BuiltModule {
    if (this.built) return this.built;
    const b = buildModule(this.ctx, this.id);
    this.input.connect(b.fxIn);
    b.fxOut.connect(this.wet);
    for (const [k, v] of Object.entries(this.params)) b.onParam(k, v);
    for (const [k, v] of Object.entries(this.flags)) b.onFlag?.(k, v);
    this.built = b;
    return b;
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
    if (on && this.mix < 0.01) this.mix = START_MIX[this.id] ?? 0.5; // switching on is always heard
    if (on) {
      this.ensureBuilt();
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
    this.built?.onParam(key, v);
  }
  setFlag(key: string, on: boolean) {
    this.flags[key] = on;
    this.built?.onFlag?.(key, on);
  }

  eqResponse(freqs: Float32Array, out: Float32Array) {
    this.built?.eq?.response(freqs, out);
  }

  eqAnalyser(which: "pre" | "post"): AnalyserNode | null {
    return this.built?.eq ? this.built.eq[which] : null;
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
  // one insert point per stem: the deck wires stemOut[i] -> input and output -> its stem bus;
  // the effects aimed at stem i sit in between (in rack order), the rest stay on the whole deck
  private stemIns: { input: GainNode; output: GainNode }[] = [];
  private stemEqs: (EqBuilt | null)[] = []; // per-stem 15-band EQ, built on first use, first in its stem's chain
  private stemEqGains: number[][] = [];
  private stemEqTails: GainNode[] = []; // what each stem EQ feeds (rewired freely; the EQ's own analyser stays connected)
  private stemsLive = 0; // stems playing right now (0 = the full mix plays, every effect is on the whole deck)
  private bpm = 0;
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

  // (re)connect the slots in `order`: input -> slot0 -> ... -> dcBlock -> output, except the
  // slots aimed at a playing stem, which chain inside that stem's insert point instead.
  // Wrapped in a short output fade so reordering never pops.
  private rewire() {
    const t = this.ctx.currentTime;
    const outs = [this.output, ...this.stemIns.map((x) => x.output)];
    for (const o of outs) {
      o.gain.cancelScheduledValues(t);
      o.gain.setTargetAtTime(0, t, 0.004);
    }
    this.input.disconnect();
    for (const x of this.stemIns) x.input.disconnect();
    for (const t of this.stemEqTails) t?.disconnect();
    for (const s of this.slots.values()) s.output.disconnect();
    let prev: AudioNode = this.input;
    const stemPrev: AudioNode[] = this.stemIns.map((x, i) => {
      const eq = this.stemEqs[i];
      if (!eq) return x.input;
      x.input.connect(eq.fxIn);
      return this.stemEqTails[i];
    });
    for (const id of this.order) {
      const s = this.slots.get(id)!;
      const w = this.placeOf(s);
      if (w < 0) {
        prev.connect(s.input);
        prev = s.output;
      } else {
        stemPrev[w].connect(s.input);
        stemPrev[w] = s.output;
      }
    }
    prev.connect(this.dcBlock);
    this.stemIns.forEach((x, i) => stemPrev[i].connect(x.output));
    for (const o of outs) o.gain.setTargetAtTime(1, t + 0.02, 0.004);
  }

  // where a slot plays: its stem when that stem is playing, else the whole deck (-1)
  private placeOf(s: RackSlot): number {
    return s.target >= 0 && s.target < this.stemsLive && this.stemIns[s.target] ? s.target : -1;
  }

  stemInsert(i: number): { input: GainNode; output: GainNode } {
    while (this.stemIns.length <= i) {
      const x = { input: this.ctx.createGain(), output: this.ctx.createGain() };
      x.input.connect(x.output);
      this.stemIns.push(x);
    }
    return this.stemIns[i];
  }
  // the EQ of stem i, built on first use (flat, so building it changes nothing audible)
  private stemEq(i: number): EqBuilt {
    let eq = this.stemEqs[i];
    if (!eq) {
      this.stemInsert(i);
      eq = buildEq(this.ctx, EQ_FREQS); // no auto gain: a cut on a stem must stay a cut
      this.stemEqs[i] = eq;
      this.stemEqTails[i] = this.ctx.createGain();
      eq.fxOut.connect(this.stemEqTails[i]);
      this.stemEqGains[i] = EQ_FREQS.map(() => 0);
      this.rewire();
    }
    return eq;
  }
  // curve -1 = the deck EQ (goes through setParam, so REC automation records it), i = stem i
  eqView(curve: number): EqView {
    if (curve < 0) {
      return {
        getGain: (i) => this.getParam("eq", `g${i}`),
        setGain: (i, db) => this.setParam("eq", `g${i}`, db),
        getQ: () => this.getParam("eq", "q"),
        isOn: () => this.isOn("eq"),
        response: (f, o) => this.eqResponse(f, o),
        spectrumBins: this.eqSpectrumBins,
        spectrum: (w, a) => this.getEqSpectrum(w, a),
      };
    }
    const eq = () => this.stemEq(curve);
    return {
      getGain: (i) => this.stemEqGains[curve]?.[i] ?? 0,
      setGain: (i, db) => {
        eq().onParam(`g${i}`, db);
        this.stemEqGains[curve][i] = Math.max(-18, Math.min(18, db));
      },
      getQ: () => this.getParam("eq", "q"),
      isOn: () => true,
      response: (f, o) => eq().response(f, o),
      spectrumBins: 1024,
      spectrum: (w, a) => eq()[w].getByteFrequencyData(a),
    };
  }
  // stems whose EQ is not flat (for the panel badges)
  stemEqUsed(i: number): boolean {
    return !!this.stemEqGains[i]?.some((g) => Math.abs(g) > 0.05);
  }

  // the deck tells how many stems play (0 = the full mix): aimed effects move in or out of the stems
  setStemsLive(n: number) {
    if (n === this.stemsLive) return;
    this.stemsLive = n;
    this.rewire();
  }
  getTarget(id: RackModuleId): number {
    return this.slots.get(id)?.target ?? -1;
  }
  // aim one effect at stem i (-1 = the whole deck)
  setTarget(id: RackModuleId, i: number) {
    const s = this.slots.get(id);
    if (!s || s.id === "eq" || s.target === i) return;
    s.target = i;
    this.rewire();
  }
  get hasTargets(): boolean {
    for (const s of this.slots.values()) if (s.target >= 0) return true;
    return false;
  }
  clearTargets() {
    if (!this.hasTargets) return;
    for (const s of this.slots.values()) s.target = -1;
    this.rewire();
  }

  // the synced modules follow the deck tempo: polled, a tempo change re-times them
  setClock(bpm: () => number) {
    setInterval(() => {
      const b = bpm();
      if (b > 0 && Math.abs(b - this.bpm) > 0.05) this.setTempo(b);
    }, 250);
  }
  setTempo(bpm: number) {
    this.bpm = bpm;
    for (const id of this.slots.keys()) this.applyDiv(id);
  }
  private applyDiv(id: RackModuleId) {
    const def = RACK_DEF.get(id);
    const s = this.slots.get(id);
    if (!def?.sync || !s) return;
    const v = divValue(def, s.params.div ?? 0, this.bpm);
    if (v !== null) s.setParam(def.sync.key, v);
  }

  setEnabled(id: RackModuleId, on: boolean) {
    this.slots.get(id)?.setOn(on);
  }
  setMix(id: RackModuleId, v: number) {
    this.slots.get(id)?.setMix(v);
  }
  setParam(id: RackModuleId, key: string, v: number) {
    this.slots.get(id)?.setParam(key, v);
    if (key === "div") this.applyDiv(id);
  }
  setFlag(id: RackModuleId, key: string, on: boolean) {
    this.slots.get(id)?.setFlag(key, on);
  }

  eqResponse(freqs: Float32Array, out: Float32Array): void {
    this.slots.get("eq")?.eqResponse(freqs, out);
  }

  get eqSpectrumBins(): number {
    const a = this.slots.get("eq")?.eqAnalyser("post");
    return a ? a.frequencyBinCount : 0;
  }

  getEqSpectrum(which: "pre" | "post", arr: Uint8Array<ArrayBuffer>): void {
    const a = this.slots.get("eq")?.eqAnalyser(which);
    a?.getByteFrequencyData(arr);
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
      modules[id] = { on: s.on, mix: s.mix, params: { ...s.params }, flags: { ...s.flags }, target: s.target };
    }
    return {
      stemEq: this.stemEqGains.map((g) => (g && g.some((x) => Math.abs(x) > 0.05) ? [...g] : null)),
      order: [...this.order],
      modules,
      macros: this.macros.map((m) => ({ value: m.value, targets: m.targets.map((t) => ({ ...t })) })),
    };
  }
  import(p: RackPreset | undefined | null) {
    if (!p) return;
    if (Array.isArray(p.order)) this.setOrder(p.order);
    if (Array.isArray(p.stemEq)) {
      p.stemEq.forEach((g, i) => {
        if (!g && !this.stemEqs[i]) return;
        const v = this.eqView(i);
        EQ_FREQS.forEach((_, b) => v.setGain(b, g?.[b] ?? 0));
      });
    }
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
        slot.target = typeof m.target === "number" ? m.target : -1;
        this.applyDiv(id as RackModuleId);
      }
      this.rewire();
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
const worklets = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();
function ensureWorklet(c: AudioContext, url: string): Promise<void> {
  const m = worklets.get(c) ?? new Map<string, Promise<void>>();
  worklets.set(c, m);
  let p = m.get(url);
  if (!p) {
    p = c.audioWorklet.addModule(url);
    m.set(url, p);
  }
  return p;
}
const ensureAutotuneWorklet = (c: AudioContext) => ensureWorklet(c, "/autotune-worklet.js");

// linear interpolation in a [x, y] table sorted by x
function interp(t: [number, number][], x: number): number {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((x - t[i - 1][0]) / (t[i][0] - t[i - 1][0])) * (t[i][1] - t[i - 1][1]);
  return t[t.length - 1][1];
}
// drive makeup (dB) for its amount, measured on a full mix (We Are Family, -18 dB RMS)
const DRIVE_MAKEUP_DB: [number, number][] = [[0, 0], [0.1, -0.8], [0.4, 0.8], [0.7, 9.8], [1, 10.8]];

// ---- per-type DSP graph builders ----
function buildModule(c: AudioContext, id: RackModuleId): BuiltModule {
  // smooth a native AudioParam toward a value (anti-zipper)
  const at = (p: AudioParam, v: number, tc = 0.02) => p.setTargetAtTime(v, c.currentTime, tc);

  switch (id) {
    case "eq": {
      const eq = buildEq(c, EQ_FREQS);
      return { fxIn: eq.fxIn, fxOut: eq.fxOut, onParam: eq.onParam, onFlag: eq.onFlag, eq };
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
        const k = 1 + amount * amount * 30; // drive amount -> tanh hardness, unity gain for quiet signals
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.tanh(k * x) / k;
        }
        shaper.curve = curve;
      };
      setCurve(0.4);
      return {
        fxIn: pre,
        fxOut: makeup,
        onParam: (key, v) => {
          if (key === "drive") {
            at(pre.gain, 1 + v * 2);
            setCurve(v);
            at(makeup.gain, Math.pow(10, interp(DRIVE_MAKEUP_DB, v) / 20)); // level-match so bypass A/B is honest
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
      const fxIn = c.createGain();
      const quantizer = c.createWaveShaper();
      const plain = c.createGain();
      const robot = c.createGain();
      const shifter = new Tone.FrequencyShifter({ frequency: 0, wet: 1 });
      const band = c.createBiquadFilter();
      const makeup = c.createGain();
      const lp = c.createBiquadFilter();
      const fxOut = c.createGain();

      quantizer.curve = new Float32Array(1024).map((_, i) => {
        const x = (i - 512) / 512;
        const step = Math.pow(2, 4);
        return Math.round(x * step) / step;
      });
      quantizer.oversample = "4x";

      band.type = "bandpass";
      band.Q.value = 1.2;
      at(band.frequency, 1200);

      makeup.gain.value = 2.2;

      lp.type = "lowpass";
      lp.frequency.value = 16000;

      fxIn.connect(quantizer);
      // sample-rate reduction (the real lo-fi sound) once its worklet is loaded
      let hold: AudioWorkletNode | null = null;
      let down = 6;
      ensureWorklet(c, "/crush-worklet.js").then(() => {
        hold = new AudioWorkletNode(c, "crush", { channelCount: 2, channelCountMode: "explicit", outputChannelCount: [2] });
        hold.parameters.get("bits")!.value = 16;
        hold.parameters.get("down")!.value = down;
        fxIn.disconnect(quantizer);
        fxIn.connect(hold);
        hold.connect(quantizer);
      }).catch(() => { /* keep the plain bit crusher */ });
      quantizer.connect(plain);
      Tone.connect(quantizer, shifter);
      shifter.connect(band);
      band.connect(makeup);
      makeup.connect(robot);
      plain.connect(lp);
      robot.connect(lp);
      lp.connect(fxOut);

      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          switch (k) {
            case "bits":
              quantizer.curve = new Float32Array(1024).map((_, i) => {
                const x = (i - 512) / 512;
                const step = Math.pow(2, Math.max(1, Math.round(v)));
                return Math.round(x * step) / step;
              });
              break;
            case "down":
              down = Math.max(1, v);
              hold?.parameters.get("down")!.setValueAtTime(down, c.currentTime);
              break;
            case "robot":
              plain.gain.value = Math.cos(v * Math.PI / 2);
              robot.gain.value = Math.sin(v * Math.PI / 2);
              break;
            case "shift":
              shifter.frequency.rampTo(v, 0.03);
              break;
            case "tone":
              at(band.frequency, v);
              break;
          }
        }
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
      // 3 parallel formant bandpasses morphing across the vowels of the chosen set;
      // "size" scales every formant (lower = bigger/deeper voice), "auto" sweeps the
      // morph back and forth on its own
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      let F = VOWEL_SETS[0].vowels.map((v) => v.f);
      let morph = 0.3;
      let size = 1;
      let sweep: ReturnType<typeof setInterval> | null = null;
      fxOut.gain.value = 5.6; // makeup: parallel formant bandpasses lose a lot of level
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
        for (let k = 0; k < 3; k++) at(bands[k].frequency, Math.min(c.sampleRate / 2 - 100, (a[k] + (b[k] - a[k]) * f) * size));
      };
      const setAuto = (hz: number) => {
        if (sweep) clearInterval(sweep);
        sweep = null;
        if (hz < 0.05) {
          setMorph(morph);
          return;
        }
        const t0 = performance.now();
        // ponytail: JS timer at 30 Hz drives the sweep; an AudioParam LFO per band if it ever sounds steppy
        sweep = setInterval(() => {
          const phase = (((performance.now() - t0) / 1000) * hz) % 1;
          setMorph(phase < 0.5 ? phase * 2 : 2 - phase * 2); // triangle: first vowel → last → first
        }, 33);
      };
      setMorph(morph);
      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          if (k === "morph") {
            morph = v;
            if (!sweep) setMorph(v);
          } else if (k === "set") {
            F = vowelSet(v).vowels.map((x) => x.f);
            if (!sweep) setMorph(morph);
          } else if (k === "size") {
            size = v;
            if (!sweep) setMorph(morph);
          } else if (k === "auto") setAuto(v);
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
      const fxIn = c.createGain();
      const d = c.createDelay(0.1);
      const fb = c.createGain();
      const lfo = c.createOscillator();
      const lfoAmt = c.createGain();
      const outGain = c.createGain();
      const fxOut = c.createGain();

      let base = 1 / 220;
      let move = 0;
      d.delayTime.value = base;
      fb.gain.value = Math.min(0.92, 0.8);
      outGain.gain.value = 1 - 0.8 * 0.85;

      lfo.type = "sine";
      lfo.frequency.value = 0.5;
      lfoAmt.gain.value = 0;
      lfo.start();

      fxIn.connect(d);
      d.connect(fb);
      fb.connect(d);
      d.connect(outGain);
      outGain.connect(fxOut);
      lfo.connect(lfoAmt);
      lfoAmt.connect(d.delayTime);

      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          switch (k) {
            case "tune":
              base = 1 / Math.max(20, v);
              at(d.delayTime, base);
              at(lfoAmt.gain, move * base * 0.5);
              break;
            case "reso":
              fb.gain.value = Math.min(0.92, v);
              outGain.gain.value = 1 - 0.85 * v;
              break;
            case "move":
              move = v;
              at(lfoAmt.gain, move * base * 0.5);
              break;
            case "rate":
              at(lfo.frequency, v);
              break;
          }
        }
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
      const bp = c.createBiquadFilter(); // high-pass: the bass and kick leave, the voice stays
      bp.type = "highpass";
      bp.frequency.value = 310;
      bp.Q.value = 0.7;
      const bpTop = c.createBiquadFilter();
      bpTop.type = "lowpass";
      bpTop.frequency.value = 6200;
      mid.connect(bp);
      bp.connect(bpTop);
      const keepGain = c.createGain(); // bandpassed centre (vocal kept)
      const sideKill = c.createGain(); // sides (vocal removed)
      sideKill.gain.value = 0;
      bpTop.connect(keepGain);
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
          at(keepGain.gain, 1.6 + curFocus * 1.2, 0.01);
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
            at(bp.frequency, 100 + v * 300);
            at(bpTop.frequency, 9000 - v * 4000);
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
    case "loudness": {
      const fxIn = c.createGain();
      const comp = c.createDynamicsCompressor();
      const makeup = c.createGain();
      const lim = c.createDynamicsCompressor();
      const fxOut = c.createGain();

      comp.knee.value = 8;
      at(comp.threshold, -10 - 0.5 * 28);
      at(comp.ratio, 1 + 0.5 * 11);
      at(comp.attack, 0.003);
      at(comp.release, 0.15);
      makeup.gain.value = 1 + 0.5 * 1.0;

      lim.knee.value = 0;
      at(lim.ratio, 20);
      at(lim.attack, 0.001);
      at(lim.release, 0.06);
      at(lim.threshold, -1);

      fxIn.connect(comp);
      comp.connect(makeup);
      makeup.connect(lim);
      lim.connect(fxOut);

      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          switch (k) {
            case "target":
              at(comp.threshold, -10 - v * 28);
              at(comp.ratio, 1 + v * 11);
              at(makeup.gain, 1 + v * 1.0); // switching on stays a few dB louder, not a jump
              break;
            case "punch":
              at(comp.attack, 0.001 + (1 - v) * 0.05);
              at(comp.release, 0.05 + v * 0.35);
              break;
            case "ceil":
              at(lim.threshold, v);
              break;
          }
        }
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
          if (k === "harm") { setCurve(v); at(excGain.gain, 0.1 + v * 0.9); at(fxOut.gain, 1 / (1 + 1.2 * (0.1 + v * 0.9))); } // level-matched
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
      let a = 1.75, su = 0.45;
      const level = () => at(fxOut.gain, 0.95 / (a + su)); // the parallel sum is level-matched, only the balance changes
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "attack") at(transGain.gain, (a = 0.5 + v * 2.5));
          else if (k === "sustain") at(sustGain.gain, (su = v * 1.5));
          level();
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
      // 2D touch pad, now a genuinely independent multi-effect DSP: each axis
      // picks ANY of 6 targets (see XY_TARGETS) — Filtre, Résonance, Mix,
      // Echo, Bitcrush or Stutter — and drives it directly from the pad
      // position. X and Y each get their OWN full set of effect chains, all
      // gated to zero except whichever one that axis currently has assigned,
      // so e.g. X can run a low-pass filter while Y independently runs an
      // echo, both live and controllable at once — a real dual-effect pad,
      // not a single fixed effect with two knobs.
      const fxIn = c.createGain();
      const dryGain = c.createGain();
      const wetGain = c.createGain();
      const fxOut = c.createGain();
      fxIn.connect(dryGain);
      dryGain.connect(fxOut);
      wetGain.connect(fxOut);
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;

      type Chain = {
        filt: BiquadFilterNode; filtGate: GainNode;
        delay: DelayNode; fb: GainNode; echoGate: GainNode;
        crush: WaveShaperNode; crushGate: GainNode;
        stutDelay: DelayNode; stutFb: GainNode; stutGate: GainNode;
      };
      const makeChain = (defaultFilterType: BiquadFilterType): Chain => {
        const filt = c.createBiquadFilter();
        filt.type = defaultFilterType;
        filt.frequency.value = 200;
        const filtGate = c.createGain();
        filtGate.gain.value = 0;
        fxIn.connect(filt);
        filt.connect(filtGate);
        filtGate.connect(wetGain);

        // Echo: delay + feedback, position drives time and repeat count together
        const delay = c.createDelay(1);
        delay.delayTime.value = 0.25;
        const fb = c.createGain();
        fb.gain.value = 0.3;
        const echoGate = c.createGain();
        echoGate.gain.value = 0;
        fxIn.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(echoGate);
        echoGate.connect(wetGain);

        // Bitcrush: waveshaper quantizing the signal to fewer amplitude steps
        const crush = c.createWaveShaper();
        const crushGate = c.createGain();
        crushGate.gain.value = 0;
        fxIn.connect(crush);
        crush.connect(crushGate);
        crushGate.connect(wetGain);

        // Stutter: short delay + high feedback — a rhythmic repeat/glitch,
        // position drives the repeat rate from fast/robotic to slow/echoey —
        // the "loop with lots of variation" the pad's Stutter target gives you.
        const stutDelay = c.createDelay(0.25);
        stutDelay.delayTime.value = 0.06;
        const stutFb = c.createGain();
        stutFb.gain.value = 0.75;
        const stutGate = c.createGain();
        stutGate.gain.value = 0;
        fxIn.connect(stutDelay);
        stutDelay.connect(stutFb);
        stutFb.connect(stutDelay);
        stutDelay.connect(stutGate);
        stutGate.connect(wetGain);

        return { filt, filtGate, delay, fb, echoGate, crush, crushGate, stutDelay, stutFb, stutGate };
      };
      const X = makeChain("lowpass");
      const Y = makeChain("highpass");

      const setCrushAmount = (ws: WaveShaperNode, amt: number) => {
        // amt 0 = transparent, 1 = heavily quantized/crushed
        const n = 256;
        const curve = new Float32Array(n);
        const levels = Math.max(3, Math.round(64 - amt * 60));
        for (let i = 0; i < n; i++) {
          const xv = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.round(xv * levels) / levels;
        }
        ws.curve = curve;
      };
      setCrushAmount(X.crush, 0);
      setCrushAmount(Y.crush, 0);

      let xPos = 0.5;
      let yPos = 0;
      let xTarget = 0; // Filtre
      let yTarget = 2; // Mix
      const freqFor = (pos: number) => Math.max(20, Math.min(20000, 200 * Math.pow(80, pos)));
      // Non-linear response curve: gentle/wide in the middle of the pad, then
      // rapidly steepens toward each edge — so the last bit of travel near an
      // extreme packs a much bigger, more dramatic change than the same
      // physical distance near the centre. Endpoints and the midpoint (0, 0.5,
      // 1) stay put; only the "feel" between them is reshaped. gamma > 1
      // widens the calm middle zone and sharpens the edges (2.4 ≈ noticeably
      // "tighter steps, stronger effect" without the ends feeling twitchy).
      const GAMMA = 2.4;
      const curve = (pos: number) => {
        const t = pos - 0.5;
        return 0.5 + Math.sign(t) * Math.pow(Math.abs(t) * 2, GAMMA) / 2;
      };

      // zero every gate on both axes, then re-open whichever is currently assigned
      const updateGates = () => {
        for (const ch of [X, Y]) {
          ch.filtGate.gain.value = 0;
          ch.echoGate.gain.value = 0;
          ch.crushGate.gain.value = 0;
          ch.stutGate.gain.value = 0;
        }
        const open = (ch: Chain, target: number) => {
          if (target === 0) ch.filtGate.gain.value = 1;
          else if (target === 3) ch.echoGate.gain.value = 1;
          else if (target === 4) ch.crushGate.gain.value = 1;
          else if (target === 5) ch.stutGate.gain.value = 1;
        };
        open(X, xTarget);
        open(Y, yTarget);
      };
      updateGates();

      const applyTarget = (target: number, rawPos: number, axis: "x" | "y") => {
        const ch = axis === "x" ? X : Y;
        const pos = curve(rawPos); // shape the response — the pad's dot still tracks your finger 1:1
        if (target === 0) {
          // Filtre: sweep 200Hz → 16kHz (logarithmic), through this axis's own filter/type
          at(ch.filt.frequency, freqFor(pos));
        } else if (target === 1) {
          // Résonance: filter Q, 1 → 30 — shared, applies to whichever filter(s) are active
          at(X.filt.Q, 1 + pos * 29);
          at(Y.filt.Q, 1 + pos * 29);
        } else if (target === 2) {
          // Mix: wet/dry blend (0 = dry only)
          at(wetGain.gain, pos);
          at(dryGain.gain, 1 - pos);
        } else if (target === 3) {
          // Echo: position drives delay time (30ms→630ms) and repeat count together
          at(ch.delay.delayTime, 0.03 + pos * 0.6);
          at(ch.fb.gain, pos * 0.75);
        } else if (target === 4) {
          // Bitcrush: position drives how heavily quantized the signal is
          setCrushAmount(ch.crush, pos);
        } else if (target === 5) {
          // Stutter: position drives the repeat rate, fast/robotic → slow/echoey
          at(ch.stutDelay.delayTime, 0.015 + pos * 0.2);
          at(ch.stutFb.gain, 0.55 + pos * 0.35);
        }
      };
      return {
        fxIn, fxOut,
        onParam: (k, v) => {
          if (k === "x") {
            xPos = v;
            applyTarget(xTarget, v, "x");
          } else if (k === "y") {
            yPos = v;
            applyTarget(yTarget, v, "y");
          } else if (k === "xTarget") {
            xTarget = Math.round(v);
            updateGates();
            applyTarget(xTarget, xPos, "x");
          } else if (k === "yTarget") {
            yTarget = Math.round(v);
            updateGates();
            applyTarget(yTarget, yPos, "y");
          } else if (k === "xFilterType") {
            X.filt.type = XY_FILTER_BIQUAD[Math.round(v)];
          } else if (k === "yFilterType") {
            Y.filt.type = XY_FILTER_BIQUAD[Math.round(v)];
          }
        },
      };
    }
    case "phaser": {
      const fxIn = c.createGain();
      const fxOut = c.createGain();
      const ph = new Tone.Phaser({ frequency: 0.5, octaves: 3, stages: 8, Q: 6, baseFrequency: 350, wet: 1 });

      Tone.connect(fxIn, ph);
      ph.connect(fxOut);

      return {
        fxIn,
        fxOut,
        onParam: (k, v) => {
          switch (k) {
            case "rate":
              ph.frequency.rampTo(v, 0.05);
              break;
            case "depth":
              ph.octaves = 1 + v * 4;
              break;
            case "fb":
              ph.Q.value = 2 + v * 14;
              break;
          }
        }
      };
    }
    default:
      throw new Error(`unknown rack module: ${id}`);
  }
}

// musical times: 1/8 pointé at 120 BPM is 0.375 s, a 1/16 gate at 120 BPM chops 8 times a second, free returns null
export function rackDivTest(): void {
  const delay = RACK_DEF.get("delay")!;
  const gate = RACK_DEF.get("gate")!;
  if (Math.abs((divValue(delay, 3, 120) ?? 0) - 0.375) > 1e-9) throw new Error("rack div delay");
  if (Math.abs((divValue(gate, 1, 120) ?? 0) - 8) > 1e-9) throw new Error("rack div gate");
  if (divValue(delay, 0, 120) !== null || divValue(delay, 3, 0) !== null) throw new Error("rack div free");
  if (divValue(delay, 7, 60) !== 1.2) throw new Error("rack div clamp");
}
