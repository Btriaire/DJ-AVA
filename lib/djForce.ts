import type { DjOptions } from "@/lib/mixPlan";
import type { TransitionType } from "@/lib/library";

// "Force du DJ": how much the intelligent DJ does, from a discreet helper (1) to a DJ who never stops (5).
// One number sets the style of the transitions (plain blends -> an effect on every change) and how often the DJ
// touches the song while it plays (a slow filter breath every 32 bars -> a new move every 4 bars).

export type DjForce = 1 | 2 | 3 | 4 | 5;
export const FORCES: DjForce[] = [1, 2, 3, 4, 5];

export const FORCE_LABEL: Record<DjForce, string> = { 1: "Discret", 2: "Léger", 3: "Actif", 4: "Fort", 5: "Maximum" };
export const FORCE_HINT: Record<DjForce, string> = {
  1: "Fondus simples et volumes égalisés. Un souffle de filtre très lent de temps en temps pendant les morceaux.",
  2: "Fondus calés sur les temps, filtres et échange des basses. Un léger écho ou filtre toutes les 24 mesures.",
  3: "Effets sur les gros écarts de tempo, boucles, voix du DJ possible. Une intervention toutes les 16 mesures : filtre, écho, réverb, flanger.",
  4: "Un effet pour un enchaînement sur deux. Une intervention toutes les 8 mesures, avec les stems prêts : batterie seule, voix seule, voix ou harmonies coupées, écho de voix.",
  5: "Un effet à chaque enchaînement, transposition, stems percutants. Une intervention toutes les 4 mesures : roulements, gate, bruit, basse coupée puis claquée, batterie seule. Les effets rapides sont écartés sur les titres calmes ou lents.",
};

export type AccentKind =
  | "filterbreath"
  | "echothrow"
  | "reverbwash"
  | "flangersweep"
  | "gatechop"
  | "dubthrow"
  | "roll"
  | "noiseburst"
  | "drumsout"
  | "vocalecho"
  | "bassdrop"
  | "drumsolo"
  | "vocalsolo"
  | "voiceout"
  | "otherout";

export const ACCENT_LABEL: Record<AccentKind, string> = {
  filterbreath: "souffle de filtre",
  echothrow: "écho",
  reverbwash: "réverb",
  flangersweep: "flanger",
  gatechop: "gate",
  dubthrow: "dub",
  roll: "roulement",
  noiseburst: "souffle",
  drumsout: "batterie coupée",
  vocalecho: "écho de voix",
  bassdrop: "basse coupée",
  drumsolo: "batterie seule",
  vocalsolo: "voix seule",
  voiceout: "voix coupée",
  otherout: "harmonies coupées",
};

// What the DJ knows about the song that plays: its tempo, whether it is a classical piece, and the stems it has
// ready (empty = the song plays as one block). Every move is judged against it (see RULE).
export interface Feel {
  bpm: number;
  classical?: boolean;
  stems?: readonly string[];
}

const CALM_BPM = 92; // under this a song is calm: gentle moves only, and fewer of them
const has = (f: Feel, stem: string) => !!f.stems?.includes(stem);
const inRange = (f: Feel, lo: number, hi = 999) => f.bpm >= lo && f.bpm <= hi;

// Which moves suit a song: no fast effect on a calm song, no roll or gate at a slow tempo, no cut of the drums of a
// piece that has none to cut, no stem move without the stem. A classical piece only gets the softest moves.
const RULE: Record<AccentKind, (f: Feel) => boolean> = {
  filterbreath: () => true,
  reverbwash: () => true,
  echothrow: () => true,
  vocalecho: (f) => has(f, "vocals"),
  dubthrow: (f) => !f.classical && inRange(f, 70, 135),
  flangersweep: (f) => !f.classical && inRange(f, 95),
  gatechop: (f) => !f.classical && inRange(f, 105),
  noiseburst: (f) => !f.classical && inRange(f, 105),
  roll: (f) => !f.classical && inRange(f, 110),
  drumsout: (f) => !f.classical && has(f, "drums") && inRange(f, 95),
  drumsolo: (f) => !f.classical && has(f, "drums") && inRange(f, 95),
  bassdrop: (f) => !f.classical && has(f, "bass") && inRange(f, 100),
  vocalsolo: (f) => !f.classical && has(f, "vocals") && inRange(f, 85),
  voiceout: (f) => !f.classical && has(f, "vocals"),
  otherout: (f) => !f.classical && has(f, "other") && inRange(f, 90),
};

export const isCalm = (f: Feel) => !!f.classical || (f.bpm > 0 && f.bpm < CALM_BPM);
// a calm song is touched more gently
export const amountFor = (amount: number, f: Feel) => (isCalm(f) ? amount * 0.6 : amount);

// the same judgement for the effect that carries a transition: `slow` and `fast` are the tempos of the two songs
export function fitsEffect(fx: TransitionType, slow: number, fast: number): boolean {
  if (!(slow > 0)) return true; // tempo unknown: no reason to refuse
  switch (fx) {
    case "dub":
      return slow >= 70 && fast <= 135;
    case "loop":
      return slow >= 90;
    case "flanger":
      return slow >= 95;
    case "gate":
    case "noise":
      return slow >= 105;
    case "roll":
    case "drop":
      return slow >= 110;
    case "brake":
      return slow >= 85;
    default:
      return true;
  }
}

export interface ForceProfile {
  effects: number; // how many transitions get an effect: 0 = never, 0.5 = every other one, 1 = every one
  everyBars: number; // an intervention in the song every n bars (4 beats each)
  pool: AccentKind[];
  amount: number; // strength of the interventions, 0..1
  options: Partial<DjOptions>; // what this force switches on or off in the DJ options
}

export const PROFILE: Record<DjForce, ForceProfile> = {
  1: { effects: 0, everyBars: 32, pool: ["filterbreath"], amount: 0.35, options: { sync: false, bassSwap: false, tails: false, keyFix: false, stems: "off", phrase: false, loudness: true } },
  2: { effects: 0, everyBars: 24, pool: ["filterbreath", "echothrow"], amount: 0.45, options: { sync: true, bassSwap: true, tails: false, keyFix: false, stems: "off", phrase: true, loudness: true } },
  3: { effects: 0.2, everyBars: 16, pool: ["filterbreath", "echothrow", "reverbwash", "flangersweep", "vocalecho", "otherout"], amount: 0.55, options: { sync: true, bassSwap: true, tails: true, keyFix: false, stems: "smooth", phrase: true, loudness: true } },
  4: { effects: 0.5, everyBars: 8, pool: ["filterbreath", "echothrow", "reverbwash", "flangersweep", "gatechop", "dubthrow", "drumsout", "vocalecho", "drumsolo", "voiceout", "otherout", "vocalsolo"], amount: 0.7, options: { sync: true, bassSwap: true, tails: true, keyFix: true, stems: "punchy", phrase: true, loudness: true } },
  5: { effects: 1, everyBars: 4, pool: ["echothrow", "reverbwash", "flangersweep", "gatechop", "dubthrow", "roll", "noiseburst", "drumsout", "vocalecho", "bassdrop", "filterbreath", "drumsolo", "vocalsolo", "voiceout", "otherout"], amount: 0.9, options: { sync: true, bassSwap: true, tails: true, keyFix: true, stems: "punchy", phrase: true, loudness: true } },
};

export const forceOf = (dj: Pick<DjOptions, "force"> | undefined): DjForce => (dj?.force && dj.force >= 1 && dj.force <= 5 ? dj.force : 3);

// the DJ options a force stands for (what the user switched by hand afterwards is kept by the caller)
export function applyForce(dj: DjOptions, force: DjForce): DjOptions {
  return { ...dj, ...PROFILE[force].options, force };
}

const ALL_STEMS = ["drums", "bass", "other", "vocals"] as const;

// the move the DJ makes at the n-th intervention of a song: rotates through the moves of the force that suit the
// song (see RULE). `feel` = the song; `true` stands for a 120 BPM song with all its stems, `false` for one without.
export function pickAccent(force: DjForce, n: number, feel: Feel | boolean): AccentKind | null {
  const f: Feel = typeof feel === "boolean" ? { bpm: 120, stems: feel ? ALL_STEMS : [] } : feel;
  const pool = PROFILE[force].pool.filter((k) => RULE[k](f));
  return pool.length ? pool[n % pool.length] : null;
}

// is it time for an intervention? `bar` = index of the bar the song is in, `lastBar` = bar of the previous one.
// A calm song is touched half as often.
export function accentDue(force: DjForce, bar: number, lastBar: number, secPlayed: number, secLeft: number, transitionSec: number, calm = false): boolean {
  if (secPlayed < 12 || secLeft < transitionSec + 14) return false; // not at the very start, not into the transition
  return bar - lastBar >= PROFILE[force].everyBars * (calm ? 1.5 : 1);
}
