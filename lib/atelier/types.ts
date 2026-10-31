export type Region = { a: number; b: number }; // seconds, a < b

export type StemPart = { a: number; b: number; loop: boolean }; // the part of a stem that plays (s); loop = repeats all along

export interface StemCtl {
  vol: number; // 0..1.5
  mute: boolean; // true = muted
  solo: boolean; // true = soloed
  filter: number; // -1..1, lowpass ← 0 → highpass
  drive: number; // 0..1, distortion amount
  pan: number; // -1..1, stereo panning
  rev: number; // reverb send 0..1
  dly: number; // echo send 0..1
  reverse: boolean; // the part, or the whole stem, plays backwards
  sub: number; // sub-octave layer 0..1
  pitch: number; // semitones -12..12, duration kept
  part: StemPart | null; // null = the whole stem
}

export const DEFAULT_CTL: StemCtl = {
  vol: 1,
  mute: false,
  solo: false,
  filter: 0,
  drive: 0,
  pan: 0,
  rev: 0,
  dly: 0,
  reverse: false,
  sub: 0,
  pitch: 0,
  part: null
};

export interface Stem {
  name: string;
  buf: AudioBuffer;
}

export type SoundKind = "track" | "sample" | "stem" | "bank";

export type StemModel = "htdemucs" | "htdemucs_6s";

export interface WorkSample {
  id: string;
  name: string;
  buf: AudioBuffer;
  kind: SoundKind;
  from: string; // name of the sound it came from, "" if none
  bpm: number; // 0 when unknown
  key: string; // "" when unknown
  offset: number; // first beat in s, for the bar grid
  at?: number; // start in the sound it was cut from
  stems?: Stem[];
  stemModel?: StemModel;
  stemHash?: string; // server cache key of the stems: lets us drop the decoded stems and reload them later
  stemNames?: string[]; // stem names, kept while the decoded stems are released
  ctls?: StemCtl[];
  undo?: { buf: AudioBuffer; bpm: number }[];
  info?: { label: string; value: string }[]; // source details, e.g. YouTube
}

export const STEM_FR: Record<string, string> = {
  drums: "BATTERIE",
  bass: "BASSE",
  other: "AUTRES",
  vocals: "VOIX",
  guitar: "GUITARE",
  piano: "PIANO"
};

export const STEM_COLOR: Record<string, string> = {
  vocals: "#fdba74",
  drums: "#fb923c",
  bass: "#a78bfa",
  other: "#38bdf8",
  guitar: "#a3e635",
  piano: "#facc15"
};

export const KIND_FR: Record<SoundKind, string> = {
  track: "MORCEAU",
  sample: "SAMPLE",
  stem: "STEM",
  bank: "BANQUE"
};
