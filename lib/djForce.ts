import type { DjOptions } from "@/lib/mixPlan";
import type { TransitionType } from "@/lib/library";
import { moveAllowed, type DjRules } from "@/lib/djRules";

// "Force du DJ": how much the intelligent DJ does, from a discreet helper (1) to a DJ who never stops (5).
// One number sets the style of the transitions (plain blends -> an effect on every change) and how often the DJ
// touches the song while it plays (a slow filter breath every 32 bars -> a new move every 4 bars).

export type DjForce = 1 | 2 | 3 | 4 | 5;
export const FORCES: DjForce[] = [1, 2, 3, 4, 5];

export const FORCE_LABEL: Record<DjForce, string> = { 1: "Discret", 2: "Léger", 3: "Actif", 4: "Fort", 5: "Maximum" };
export const FORCE_HINT: Record<DjForce, string> = {
  1: "Fondus simples et volumes égalisés. Un souffle de filtre très lent de temps en temps pendant les morceaux.",
  2: "Fondus calés sur les temps, filtres et échange des basses. Un écho ou un filtre toutes les 20 mesures.",
  3: "Effets sur les gros écarts de tempo, boucles, voix du DJ possible. Une intervention toutes les 12 mesures, bien audible : filtre, écho, réverb, flanger, phaser, voix ou harmonies coupées.",
  4: "Un effet pour un enchaînement sur deux. Une intervention toutes les 6 mesures, longue et franche, avec les stems prêts : batterie seule, voix seule, voix ou harmonies coupées, écho de voix.",
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
  | "otherout"
  // moves made with the effects of the master rack (the whole mix): see MASTER_MOVES
  | "phaserswirl"
  | "panswing"
  | "pumpduck"
  | "crushgrit"
  | "tapestop"
  | "vowelwah"
  | "scatterslice"
  | "freezehold"
  | "halftimedrop"
  | "doublecut"
  | "riserbuild"
  | "buildup"
  | "echoexit"
  | "mashfx"
  | "ringmod";

// What the DJ plays: each style has its own effects (see PALETTE). "auto" reads it from the tempo.
export type Genre = "auto" | "club" | "hiphop" | "pop" | "disco" | "dub" | "latino" | "chill" | "zen" | "calm";
export const GENRES: Genre[] = ["auto", "club", "hiphop", "pop", "disco", "dub", "latino", "chill", "zen", "calm"];
// zen and calm are gentle by nature: very few effects, only the softest ones, whatever the force says
export const isGentleGenre = (g: Genre | undefined): boolean => g === "zen" || g === "calm";
export const GENRE_LABEL: Record<Genre, string> = {
  auto: "Auto (selon le tempo)",
  club: "House / techno / électro",
  hiphop: "Hip-hop / rap",
  pop: "Pop / rock / variété",
  disco: "Disco / funk",
  dub: "Reggae / dub",
  latino: "Latino / afro",
  chill: "Chill / jazz / calme",
  zen: "Zen (ambient, méditation)",
  calm: "Calm (piano calme)",
};
export const GENRE_HINT: Record<Genre, string> = {
  auto: "Le DJ devine : tempo rapide = club, moyen = pop, lent = chill.",
  club: "Filtres, montées (riser, build) relâchées sur le temps fort, rolls, gate, pompe, phaser sur les mélodies. Le corps du morceau reste propre.",
  hiphop: "Sorties en échos, arrêt net ou demi-tempo, voix seule, scatter et crush brefs. Peu de réverb.",
  pop: "Réverb courte, écho en sortie, filtre, phaser léger, balancier stéréo. Jamais de roll ni de gate.",
  disco: "Phaser, flanger et filtre sur le groove, balancier stéréo, pompe douce. Batterie seule pour relancer.",
  dub: "Écho dub avec retour sur le temps, réverb, voix coupée, basse coupée puis claquée.",
  latino: "Rolls et gate courts sur les percussions, scatter, montées, échos. Batterie seule.",
  chill: "Réverb, écho, phaser très doux, gel du son. Rien de rapide.",
  zen: "Presque aucun effet : un souffle de filtre, une réverb ou un écho très doux, un gel du son. Fondus très longs.",
  calm: "Piano et douceur : réverb, queue d'écho en fin de morceau, souffle de filtre. Rien d'autre.",
};

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
  phaserswirl: "phaser",
  panswing: "balancier stéréo",
  pumpduck: "pompe",
  crushgrit: "crush",
  tapestop: "bande usée",
  vowelwah: "voyelles",
  scatterslice: "scatter",
  freezehold: "gel du son",
  halftimedrop: "demi-tempo",
  doublecut: "double tempo",
  riserbuild: "montée",
  buildup: "build",
  echoexit: "sortie en échos",
  mashfx: "mash",
  ringmod: "modulation en anneau",
};

// The moves made with the master effect rack (the effects of the Console): which effect, how strong, for how many bars.
// Short and conservative: a move puts itself back.
export type MasterKind = "phaserswirl" | "panswing" | "pumpduck" | "crushgrit" | "tapestop" | "vowelwah" | "scatterslice" | "freezehold" | "halftimedrop" | "doublecut" | "riserbuild" | "buildup" | "echoexit" | "mashfx" | "ringmod";
export const MASTER_MOVES: Record<MasterKind, { fx: string; wet: number; bars: number }> = {
  phaserswirl: { fx: "phaser", wet: 0.55, bars: 4 },
  panswing: { fx: "pan", wet: 0.6, bars: 2 },
  pumpduck: { fx: "pump", wet: 0.55, bars: 4 },
  crushgrit: { fx: "crush", wet: 0.45, bars: 1 },
  tapestop: { fx: "tape", wet: 0.7, bars: 2 },
  vowelwah: { fx: "vowel", wet: 0.55, bars: 2 },
  scatterslice: { fx: "scatter", wet: 0.65, bars: 1 },
  freezehold: { fx: "freeze", wet: 0.8, bars: 0.5 },
  halftimedrop: { fx: "halftime", wet: 0.8, bars: 2 },
  doublecut: { fx: "double", wet: 0.8, bars: 1 },
  riserbuild: { fx: "rise", wet: 0.8, bars: 4 },
  buildup: { fx: "build", wet: 0.8, bars: 4 },
  echoexit: { fx: "echoout", wet: 0.8, bars: 2 },
  mashfx: { fx: "mash", wet: 0.55, bars: 1 },
  ringmod: { fx: "ring", wet: 0.35, bars: 1 },
};
export const isMasterMove = (k: AccentKind): k is MasterKind => k in MASTER_MOVES;

// What the DJ knows about the song that plays: its tempo, whether it is a classical piece, and the stems it has
// ready (empty = the song plays as one block). Every move is judged against it (see RULE).
// The map of a song made when its stems were prepared (lib/stemAnalysis.ts), as far as the DJ needs it (client side)
export type SectionKind = "peak" | "slow" | "blank" | "normal";
export interface MapSection { start: number; end: number; kind: SectionKind }
export const sectionKindAt = (map: { sections: MapSection[] } | null | undefined, t: number): SectionKind | undefined => map?.sections.find((s) => t >= s.start && t < s.end)?.kind;
export const nextSectionStart = (map: { sections: MapSection[] } | null | undefined, t: number, kind: SectionKind): number | null => map?.sections.find((s) => s.kind === kind && s.start > t)?.start ?? null;
// what suits each kind of passage: a quick effect on a slow part is a mistake, a soft wash on a peak drowns it, a blank takes tails only
const IN_SLOW_NO: readonly AccentKind[] = ["roll", "gatechop", "noiseburst", "scatterslice", "doublecut", "crushgrit", "mashfx", "riserbuild", "buildup", "pumpduck", "drumsolo"];
const IN_PEAK_NO: readonly AccentKind[] = ["reverbwash", "freezehold", "tapestop", "halftimedrop", "echoexit", "filterbreath", "drumsout", "bassdrop", "vocalsolo"];
const IN_BLANK_OK: readonly AccentKind[] = ["reverbwash", "echoexit", "freezehold", "echothrow", "riserbuild", "buildup"];
export const fitsSection = (k: AccentKind, s: SectionKind | undefined): boolean => !s || s === "normal" || (s === "slow" ? !IN_SLOW_NO.includes(k) : s === "peak" ? !IN_PEAK_NO.includes(k) : IN_BLANK_OK.includes(k));
// while the voice sings, a move that cuts, stutters or stops the whole song would break the line; in a gap anything goes
const IN_VOICE_NO: readonly AccentKind[] = ["tapestop", "freezehold", "halftimedrop", "doublecut", "scatterslice", "crushgrit", "noiseburst", "roll", "gatechop"];
export type VoiceState = "sung" | "gap";
// is the voice singing at time t (the contour has one note per voiceStep seconds, -1 = silence)? undefined when the song has no voice map
export const voiceStateAt = (map: { voice?: number[]; voiceStep?: number } | null | undefined, t: number): VoiceState | undefined => {
  if (!map?.voice?.length || !map.voiceStep) return undefined;
  const i = Math.floor(t / map.voiceStep);
  return map.voice.slice(Math.max(0, i - 2), i + 3).some((n) => n >= 0) ? "sung" : "gap";
};
export const fitsVoice = (k: AccentKind, v: VoiceState | undefined): boolean => v !== "sung" || !IN_VOICE_NO.includes(k);
// the build-ups that announce a peak when it starts a few seconds later
export const RISERS: readonly AccentKind[] = ["riserbuild", "buildup", "noiseburst"];

export interface Feel {
  bpm: number;
  classical?: boolean;
  stems?: readonly string[];
  genre?: Genre; // the style the DJ plays (missing or "auto": read from the tempo)
  voice?: VoiceState; // is the voice singing right now (from the pitch map), when known
  section?: SectionKind; // where the song is now according to its map (peak, slow, blank), when the stems were analysed
}

// "auto" reads the style from the tempo: lively = club, middle = pop, slow = chill
export function genreOf(f: Feel): Exclude<Genre, "auto"> {
  if (f.genre && f.genre !== "auto") return f.genre;
  return f.bpm >= 118 ? "club" : f.bpm >= 96 ? "pop" : "chill";
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
  phaserswirl: (f) => !f.classical && inRange(f, 80),
  panswing: (f) => !f.classical,
  pumpduck: (f) => !f.classical && inRange(f, 110),
  crushgrit: (f) => !f.classical && inRange(f, 95),
  tapestop: (f) => !f.classical,
  vowelwah: (f) => !f.classical && inRange(f, 80),
  scatterslice: (f) => !f.classical && inRange(f, 100),
  freezehold: () => true,
  halftimedrop: (f) => !f.classical && inRange(f, 100),
  doublecut: (f) => !f.classical && inRange(f, 80, 112), // double time only makes sense on a slower song
  riserbuild: (f) => !f.classical && inRange(f, 100),
  buildup: (f) => !f.classical && inRange(f, 105),
  echoexit: () => true,
  mashfx: (f) => !f.classical && inRange(f, 110),
  ringmod: (f) => !f.classical && inRange(f, 110),
};

// The effects of each style (rules gathered from DJ teaching sources and common practice: restraint, echo / reverb
// tails to leave a song, risers released on the downbeat, phaser and flanger on melodic parts and never on bright
// hi-hats, no roll or gate outside dance music, stems to swap drums or bass or to bridge with a vocal).
// A move that is not in the palette of the style is never played; tempo and stems rules still apply on top.
const PALETTE: Record<Exclude<Genre, "auto">, readonly AccentKind[]> = {
  club: ["filterbreath", "echothrow", "reverbwash", "flangersweep", "phaserswirl", "gatechop", "roll", "noiseburst", "riserbuild", "buildup", "pumpduck", "scatterslice", "crushgrit", "doublecut", "mashfx", "ringmod", "echoexit", "drumsout", "drumsolo", "bassdrop", "otherout", "vocalecho", "vocalsolo", "voiceout", "dubthrow", "halftimedrop"],
  hiphop: ["echothrow", "echoexit", "reverbwash", "filterbreath", "tapestop", "scatterslice", "vowelwah", "crushgrit", "halftimedrop", "dubthrow", "drumsolo", "bassdrop", "vocalsolo", "voiceout", "vocalecho"],
  pop: ["filterbreath", "echothrow", "echoexit", "reverbwash", "phaserswirl", "panswing", "riserbuild", "vocalecho", "vocalsolo", "voiceout", "otherout", "tapestop"],
  disco: ["filterbreath", "phaserswirl", "flangersweep", "panswing", "pumpduck", "echothrow", "reverbwash", "vocalecho", "drumsolo", "drumsout", "otherout"],
  dub: ["echothrow", "dubthrow", "echoexit", "reverbwash", "filterbreath", "vowelwah", "tapestop", "drumsout", "bassdrop", "voiceout", "vocalecho"],
  latino: ["echothrow", "echoexit", "reverbwash", "filterbreath", "roll", "gatechop", "scatterslice", "riserbuild", "panswing", "drumsout", "drumsolo", "vocalecho", "vocalsolo"],
  chill: ["reverbwash", "echothrow", "echoexit", "filterbreath", "phaserswirl", "panswing", "freezehold", "tapestop", "vocalecho", "otherout"],
  zen: ["filterbreath", "reverbwash", "echothrow", "echoexit", "freezehold"],
  calm: ["reverbwash", "echoexit", "filterbreath", "freezehold"],
};
export const ruleOk = (k: AccentKind, f: Feel): boolean => RULE[k](f);
export const STEM_MOVES: readonly AccentKind[] = ["drumsout", "drumsolo", "bassdrop", "otherout", "vocalecho", "vocalsolo", "voiceout"];

export const isCalm = (f: Feel) => !!f.classical || (f.bpm > 0 && f.bpm < CALM_BPM);
// a calm song is touched more gently
export const amountFor = (amount: number, f: Feel) => (isCalm(f) ? amount * 0.6 : amount);

// the same judgement for the effect that carries a transition: `slow` and `fast` are the tempos of the two songs
const TRANSITION_PALETTE: Record<Exclude<Genre, "auto">, readonly TransitionType[]> = {
  club: ["echo", "wash", "flanger", "gate", "noise", "roll", "loop", "highpass", "eq", "drop", "dub", "brake", "reverse"],
  hiphop: ["echo", "brake", "reverse", "drop", "dub", "roll"],
  pop: ["echo", "wash", "highpass", "eq", "reverse", "flanger", "loop"],
  disco: ["flanger", "highpass", "eq", "echo", "loop", "wash"],
  dub: ["echo", "dub", "wash", "reverse", "eq"],
  latino: ["echo", "roll", "gate", "brake", "noise", "wash", "loop"],
  chill: ["wash", "echo", "eq", "highpass", "reverse"],
  zen: ["wash", "echo"],
  calm: ["wash", "echo"],
};
// the effects a style uses to carry a transition (the tempo rules of fitsEffect apply on top)
export const transitionPalette = (g: Genre, bpm: number): readonly TransitionType[] => TRANSITION_PALETTE[genreOf({ bpm, genre: g })];

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
  len: number; // how long a move lasts, as a multiple of its basic length (1 = a bar or two)
  options: Partial<DjOptions>; // what this force switches on or off in the DJ options
}

export const PROFILE: Record<DjForce, ForceProfile> = {
  1: { effects: 0, everyBars: 32, pool: ["filterbreath"], amount: 0.4, len: 1, options: { sync: false, bassSwap: false, tails: false, keyFix: false, stems: "off", phrase: false, loudness: true } },
  2: { effects: 0, everyBars: 20, pool: ["filterbreath", "echothrow"], amount: 0.55, len: 1.25, options: { sync: true, bassSwap: true, tails: false, keyFix: false, stems: "off", phrase: true, loudness: true } },
  3: { effects: 0.34, everyBars: 12, pool: ["filterbreath", "echothrow", "reverbwash", "flangersweep", "phaserswirl", "echoexit", "vocalecho", "otherout"], amount: 0.75, len: 1.5, options: { sync: true, bassSwap: true, tails: true, keyFix: false, stems: "smooth", phrase: true, loudness: true } },
  4: { effects: 0.5, everyBars: 6, pool: ["filterbreath", "echothrow", "reverbwash", "flangersweep", "phaserswirl", "echoexit", "gatechop", "dubthrow", "drumsout", "vocalecho", "drumsolo", "voiceout", "otherout", "vocalsolo", "panswing", "riserbuild", "vowelwah", "halftimedrop", "freezehold", "tapestop"], amount: 0.9, len: 2, options: { sync: true, bassSwap: true, tails: true, keyFix: true, stems: "punchy", phrase: true, loudness: true } },
  5: { effects: 1, everyBars: 4, pool: ["echothrow", "reverbwash", "flangersweep", "gatechop", "dubthrow", "roll", "noiseburst", "drumsout", "vocalecho", "bassdrop", "filterbreath", "drumsolo", "vocalsolo", "voiceout", "otherout", "phaserswirl", "panswing", "pumpduck", "crushgrit", "scatterslice", "riserbuild", "buildup", "doublecut", "mashfx", "ringmod", "echoexit", "halftimedrop", "vowelwah", "freezehold", "tapestop"], amount: 1, len: 2, options: { sync: true, bassSwap: true, tails: true, keyFix: true, stems: "punchy", phrase: true, loudness: true } },
};

export const forceOf = (dj: Pick<DjOptions, "force"> | undefined): DjForce => (dj?.force && dj.force >= 1 && dj.force <= 5 ? dj.force : 3);

// the DJ options a force stands for (what the user switched by hand afterwards is kept by the caller)
export function applyForce(dj: DjOptions, force: DjForce): DjOptions {
  return { ...dj, ...PROFILE[force].options, force };
}

const ALL_STEMS = ["drums", "bass", "other", "vocals"] as const;

// the move the DJ makes at the n-th intervention of a song: rotates through the moves of the force that suit the
// song (see RULE). `feel` = the song; `true` stands for a 120 BPM song with all its stems, `false` for one without.
export function pickAccent(force: DjForce, n: number, feel: Feel | boolean, rules?: DjRules): AccentKind | null {
  const f: Feel = typeof feel === "boolean" ? { bpm: 120, stems: feel ? ALL_STEMS : [], genre: "club" } : feel;
  const genre = genreOf(f);
  const palette = PALETTE[genre];
  // zen and calm take their whole (short) palette, whatever the force: the force only sets how often
  const pool = (isGentleGenre(genre) ? [...palette] : PROFILE[force].pool.filter((k) => palette.includes(k))).filter((k) => RULE[k](f) && moveAllowed(k, rules) && fitsSection(k, f.section) && fitsVoice(k, f.voice));
  if (!pool.length) return null;
  // a song that has its stems gets them used on every other move (from force 3): that is what they are prepared for
  const stemPool = pool.filter((k) => STEM_MOVES.includes(k));
  if (force >= 3 && stemPool.length && n % 2 === 1) return stemPool[(n >> 1) % stemPool.length];
  const rest = force >= 3 && stemPool.length ? pool.filter((k) => !STEM_MOVES.includes(k)) : pool;
  return rest.length ? rest[(force >= 3 && stemPool.length ? n >> 1 : n) % rest.length] : pool[n % pool.length];
}

// the move that goes with a transition (an effect of the master rack on top of the blend), or null: from force 3, on
// every other change, of the kind the style uses to leave a song or to build into the next one
const TRANSITION_MOVES: Record<Exclude<Genre, "auto">, readonly MasterKind[]> = {
  club: ["riserbuild", "echoexit", "buildup", "phaserswirl"],
  hiphop: ["echoexit", "tapestop", "halftimedrop"],
  pop: ["echoexit", "phaserswirl", "riserbuild"],
  disco: ["phaserswirl", "echoexit", "panswing"],
  dub: ["echoexit", "tapestop"],
  latino: ["echoexit", "riserbuild", "scatterslice"],
  chill: ["echoexit", "freezehold", "phaserswirl"],
  zen: [],
  calm: [],
};
export function pickTransitionMove(force: DjForce, index: number, feel: Feel, rules?: DjRules): MasterKind | null {
  if (force < 3 || isCalm(feel) && force < 5 || index % (force >= 5 ? 1 : 2) !== 0) return null;
  const list = TRANSITION_MOVES[genreOf(feel)].filter((k) => RULE[k](feel) && moveAllowed(k, rules));
  return list.length ? list[(index >> (force >= 5 ? 0 : 1)) % list.length] : null;
}

// is it time for an intervention? `bar` = index of the bar the song is in, `lastBar` = bar of the previous one.
// A calm song is touched half as often.
export function accentDue(force: DjForce, bar: number, lastBar: number, secPlayed: number, secLeft: number, transitionSec: number, calm = false): boolean {
  if (secPlayed < 12 || secLeft < transitionSec + 14) return false; // not at the very start, not into the transition
  return bar - lastBar >= PROFILE[force].everyBars * (calm ? 1.5 : 1);
}

// ---- TRANS (the rhythmic gate of the deck effects) tuned to the song --------------------------------------------------
// The gate chops the sound on the beat: too fast on a fast song it turns into a buzz, too slow on a slow one it drags.
// The length of one chop is chosen from the tempo so that it is close to what the style uses, the part of the beat left
// open (Durée) and the softness of the cut (Doux) follow the style. Zen, calm and classical never use it (null).

const BEAT_FRACTIONS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4]; // = BEAT_DIVS of lib/audio/fxTypes.ts (first ones)
const GATE_STYLE: Partial<Record<Exclude<Genre, "auto">, { period: number; open: number; soft: number }>> = {
  club: { period: 0.18, open: 0.5, soft: 0.2 },
  hiphop: { period: 0.25, open: 0.55, soft: 0.3 },
  pop: { period: 0.25, open: 0.6, soft: 0.4 },
  disco: { period: 0.22, open: 0.55, soft: 0.35 },
  dub: { period: 0.5, open: 0.6, soft: 0.5 },
  latino: { period: 0.2, open: 0.45, soft: 0.15 },
};
export interface GateSetting {
  beat: number; // index of the beat division of the effect (BEAT_DIVS)
  p1: number; // Durée, 0..1
  p2: number; // Doux, 0..1
}
export function gateSetting(bpm: number, genre: Genre = "auto", classical = false): GateSetting | null {
  if (!(bpm > 0) || classical) return null;
  const g = genreOf({ bpm, genre });
  const style = GATE_STYLE[g];
  if (!style) return null;
  const beatSec = 60 / bpm;
  let best = 3;
  let bestGap = Infinity;
  BEAT_FRACTIONS.forEach((f, i) => {
    const period = beatSec * f;
    if (period < 0.08) return; // faster than that is a buzz, not a rhythm
    const gap = Math.abs(period - style.period);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  // a slow song leaves a little more room, a fast one cuts shorter (the duty is the part of each chop that sounds)
  const open = Math.max(0.3, Math.min(0.75, style.open + (bpm < 100 ? 0.05 : bpm > 140 ? -0.05 : 0)));
  return { beat: best, p1: Math.max(0, Math.min(1, (open * 100 - 10) / 80)), p2: style.soft };
}
