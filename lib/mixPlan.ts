import type { LibTrack, TransitionType } from "@/lib/library";
import type { SetArc } from "@/lib/setBuilder";
import { keyCompat, shiftCamelot } from "@/lib/camelot";
import { EFFECT_TRANSITIONS } from "@/lib/transitions";
import { PROFILE, fitsEffect, forceOf } from "@/lib/djForce";

// The "DJ brain": for every pair of songs of a set, decide HOW to go from one to the other, in advance.
// Pure and deterministic, so the plan can be shown, edited, saved with the set and replayed by the relay.

export interface MixStep {
  type: TransitionType;
  sec: number; // length of the blend (0 = hard cut)
  sync: boolean; // beat-match the incoming song to the outgoing one and start it on the beat
  bassSwap: boolean; // hold the incoming bass back, then swap the low end halfway through
  note: string; // why, in plain French
  keyShift?: number; // semitones to transpose the INCOMING song by (-2..2) so the two keys agree
  tail?: "none" | "brake"; // how the outgoing song leaves on a hard cut: vinyl brake instead of a bare cut
  manual?: boolean; // chosen by the user: kept when the plan is recomputed
}

export interface DjOptions {
  auto: boolean; // the relay follows the plan (otherwise the set's single style and length)
  sync: boolean;
  bassSwap: boolean;
  voice: "off" | "discret" | "radio"; // spoken announcements between the songs
  voiceEngine: "dj" | "system"; // the English DJ voice made on the server, or the voice of the computer
  voiceEvery: 0 | 1 | 2; // announce every song (1), every other song (2), or only when the artist changes (0)
  phrase: boolean; // start the incoming song on a bar (4 beats), not just on a beat
  loudness: boolean; // bring the incoming song to the volume of the outgoing one
  keyFix: boolean; // transpose the incoming song by up to a semitone when the keys clash
  tails: boolean; // brake the outgoing song on hard cuts
  endOfSet: "loop" | "stop"; // at the end of the set: start again, or finish with an outro
  style?: "club" | "classical"; // classical: long soft blends, never beat-matched
  stems?: "off" | "smooth" | "punchy"; // use the stems of the songs that have them ready (see lib/stemMix.ts)
  force?: 1 | 2 | 3 | 4 | 5; // how much the DJ does (lib/djForce.ts); 3 when missing
  blend?: "short" | "normal" | "long" | "xlong"; // length of the blends: x0.6, x1, x1.8, x3
}

export const BLEND_FACTOR = { short: 0.6, normal: 1, long: 1.8, xlong: 3 } as const;
export const BLEND_LABEL = { short: "Courts", normal: "Normaux", long: "Longs", xlong: "Très longs" } as const;

export const DEFAULT_DJ: DjOptions = {
  auto: true,
  sync: true,
  bassSwap: true,
  voice: "off",
  voiceEngine: "dj",
  voiceEvery: 1,
  phrase: true,
  loudness: true,
  keyFix: false,
  tails: true,
  endOfSet: "loop",
  stems: "punchy",
  force: 3,
  blend: "normal",
};

export { TRANSITION_LABEL as STEP_LABEL } from "@/lib/transitions";

// % between two tempos, folding a double or half tempo onto the same beat (130 and 65 mix on the beat)
export function tempoGap(a: number, b: number): { pct: number; folded: boolean } {
  if (!(a > 0) || !(b > 0)) return { pct: 0, folded: false };
  const r = b / a;
  if (Math.abs(r - 2) < 0.1) return { pct: (r / 2 - 1) * 100, folded: true };
  if (Math.abs(r - 0.5) < 0.05) return { pct: (r * 2 - 1) * 100, folded: true };
  return { pct: (r - 1) * 100, folded: false };
}

// `index` (position of the transition in the set) varies the effect transitions so a set does not repeat itself
// seconds of each effect blend, and why it was chosen
const FX_SEC: Partial<Record<TransitionType, number>> = { echo: 6, dub: 8, wash: 8, flanger: 10, gate: 8, noise: 8, roll: 6, brake: 4, reverse: 4, loop: 12, highpass: 10, eq: 14, drop: 8 };
const FX_NOTE: Partial<Record<TransitionType, string>> = {
  echo: "le titre qui sort part en échos",
  dub: "écho dub sous le nouveau titre",
  wash: "le titre qui sort se noie dans la réverb",
  flanger: "balayage de flanger pendant le fondu",
  gate: "le titre qui sort est haché (gate)",
  noise: "un souffle montant couvre le fondu",
  roll: "le titre qui sort roule avant de céder la place",
  brake: "le titre qui sort freine comme un vinyle",
  reverse: "les derniers temps repartent à l'envers",
  loop: "la dernière mesure tourne en boucle",
  highpass: "le titre qui sort monte dans les aigus",
  eq: "les bandes s'échangent une à une",
  drop: "coupure nette, vide, puis le nouveau claque",
};
const FIXED_LENGTH = new Set<TransitionType>(["echo", "dub", "brake", "wash", "reverse", "roll", "drop", "noise", "gate", "flanger"]);

export function planStep(a: LibTrack, b: LibTrack, arc: SetArc, opts: DjOptions = DEFAULT_DJ, index = 0): MixStep {
  if (opts.style === "classical") {
    // no beat to match, no bass to swap: a long, soft blend, never longer than a tenth of the shortest piece
    const shortest = Math.min(a.durationSec || 300, b.durationSec || 300);
    return { type: "smooth", sec: Math.round(Math.max(5, Math.min(14 * BLEND_FACTOR[opts.blend ?? "normal"], shortest * 0.1 * BLEND_FACTOR[opts.blend ?? "normal"]))), sync: false, bassSwap: false, tail: "none", note: "Enchaînement classique : fondu long et doux, sans caler les tempos." };
  }
  const { pct, folded } = tempoGap(a.bpm ?? 0, b.bpm ?? 0);
  const gap = Math.abs(pct);
  const level = keyCompat(a.camelot, b.camelot).level;
  const friendly = level === "same" || level === "good";
  const known = (a.bpm ?? 0) > 0 && (b.bpm ?? 0) > 0;
  let step: Omit<MixStep, "bassSwap">;
  const force = forceOf(opts);
  // a strong DJ puts an effect on every (5) or every other (4) change, whatever the songs are
  const effectEvery = PROFILE[force].effects;
  const wantsEffect = effectEvery >= 1 || (effectEvery >= 0.5 && index % 2 === 0) || (effectEvery > 0 && effectEvery < 0.5 && index % 5 === 2);

  if (known && !folded && gap <= 10 && wantsEffect) {
    // only effects that suit the tempo of the two songs: no roll or gate on a slow pair
    const fitting = EFFECT_TRANSITIONS.filter((e) => fitsEffect(e, Math.min(a.bpm ?? 0, b.bpm ?? 0), Math.max(a.bpm ?? 0, b.bpm ?? 0)));
    const fx = fitting[(index * 3 + force) % fitting.length] ?? "wash";
    const base = FX_SEC[fx] ?? 8;
    step = { type: fx, sec: base, sync: gap <= 6 && !["brake", "reverse", "wash", "drop"].includes(fx), note: `Force du DJ ${force} : ${FX_NOTE[fx] ?? "un effet accompagne l'enchaînement"}.` };
  } else if (!known) {
    step = { type: "fade", sec: 8, sync: false, note: "Tempo inconnu : fondu classique, sans calage." };
  } else if (folded) {
    step = opts.tails
      ? { type: "echo", sec: 6, sync: false, note: "Tempo double ou moitié : le titre qui sort part en échos sous le nouveau." }
      : { type: "filter", sec: 8, sync: false, note: "Tempo double ou moitié : fondu filtré, sans calage (les temps tombent ensemble)." };
  } else if (gap <= 3) {
    step = friendly
      ? index % 5 === 4 && opts.tails
        ? { type: "loop", sec: 12, sync: true, note: "Même tempo et tonalités amies : la dernière mesure tourne en boucle pendant que le nouveau titre entre." }
        : { type: "smooth", sec: 16, sync: true, note: `Même tempo (${gap.toFixed(1)} %) et tonalités amies : long fondu calé sur les temps.` }
      : level === "boost"
        ? { type: "smooth", sec: 12, sync: true, note: "Même tempo, montée d'énergie en tonalité : fondu calé, l'ensemble monte." }
        : index % 2
          ? { type: "highpass", sec: 10, sync: true, note: "Même tempo mais tonalités qui s'opposent : le titre qui sort monte dans les aigus et s'efface." }
          : { type: "filter", sec: 10, sync: true, note: "Même tempo mais tonalités qui s'opposent : le filtre cache le choc." };
  } else if (gap <= 6) {
    step =
      friendly || level === "boost"
        ? { type: "fade", sec: 10, sync: true, note: `Écart de tempo de ${gap.toFixed(1)} % : le titre entrant est calé sur le sortant, fondu moyen.` }
        : { type: "filter", sec: 8, sync: true, note: "Tonalités qui s'opposent : fondu filtré, tempo calé." };
  } else if (gap <= 10) {
    step = { type: "filter", sec: 6, sync: false, note: `Écart de tempo de ${gap.toFixed(0)} % : fondu filtré court, sans caler (un calage s'entendrait).` };
  } else if (opts.tails) {
    // too far apart to blend: an effect takes the old song away instead of a bare cut
    const away = (["echo", "brake", "wash", "reverse"] as const).filter((e) => fitsEffect(e, Math.min(a.bpm ?? 0, b.bpm ?? 0), Math.max(a.bpm ?? 0, b.bpm ?? 0)));
    const fx = away[index % away.length];
    const sec = { echo: 6, brake: 4, wash: 8, reverse: 4 }[fx];
    const how = { echo: "part en échos", brake: "freine comme un vinyle", wash: "se noie dans la réverb", reverse: "repart à l'envers" }[fx];
    step = { type: fx, sec, sync: false, note: `Saut de tempo de ${gap.toFixed(0)} % : pas de fondu possible, le titre qui sort ${how}.` };
  } else {
    step = { type: "cut", sec: 0, sync: false, note: `Saut de tempo de ${gap.toFixed(0)} % : coupure nette, mieux qu'un fondu qui boite.` };
  }

  // the shape of the set: a rise tightens the blends, a fall lets them breathe
  const arcFactor = arc === "rise" ? 0.85 : arc === "fall" ? 1.15 : 1;
  // never longer than a fifth of the shortest song
  const shortest = Math.min(a.durationSec || 240, b.durationSec || 240);
  const fxType = FIXED_LENGTH.has(step.type);
  const blend = BLEND_FACTOR[opts.blend ?? "normal"];
  // effect blends keep their own short length (a brake is a brake); the others follow the length option, the shape
  // of the set, and never exceed a quarter of the shortest song
  const sec = step.type === "cut" ? 0 : fxType ? Math.round(step.sec * Math.min(blend, 2)) : Math.round(Math.max(3, Math.min(60, step.sec * arcFactor * blend, shortest * 0.25)));
  return {
    ...step,
    sec,
    sync: step.sync && opts.sync,
    bassSwap: opts.bassSwap && !fxType && step.type !== "cut" && sec >= 6,
    tail: step.type === "cut" && opts.tails ? "brake" : "none",
  };
}

// when the keys clash and the tempos agree, a semitone up or down on the incoming song often makes them agree too
function keyFixFor(a: LibTrack, b: LibTrack, carry: number): { shift: number; note: string } | null {
  const bpmGap = Math.abs(tempoGap(a.bpm ?? 0, b.bpm ?? 0).pct);
  if (!(bpmGap <= 6) || !a.camelot || !b.camelot) return null;
  if (keyCompat(a.camelot, shiftCamelot(b.camelot, carry)).level !== "clash") return null;
  for (const s of [1, -1, 2, -2]) {
    const lvl = keyCompat(a.camelot, shiftCamelot(b.camelot, s)).level;
    if (lvl === "same" || lvl === "good") return { shift: s, note: `Transposé de ${s > 0 ? "+" : ""}${s} demi-ton pour rester accordé.` };
  }
  return null;
}

// one step per transition (n songs -> n - 1 steps); steps the user fixed by hand are kept when `previous` is given
export function planMix(tracks: LibTrack[], arc: SetArc, opts: DjOptions = DEFAULT_DJ, previous?: MixStep[]): MixStep[] {
  // the song playing at each point may itself be transposed by the previous step: its key is the shifted one
  let carry = 0;
  return tracks.slice(1).map((b, i) => {
    const kept = previous?.[i];
    if (kept?.manual) {
      carry = kept.keyShift ?? 0;
      return kept;
    }
    const a = { ...tracks[i], camelot: shiftCamelot(tracks[i].camelot, carry) };
    const fix = opts.keyFix ? keyFixFor(a, b, 0) : null;
    const step = planStep(a, b, arc, opts, i);
    carry = fix?.shift ?? 0;
    return fix ? { ...step, keyShift: fix.shift, note: `${step.note} ${fix.note}` } : step;
  });
}

// "Justice - Genesis (Official Audio)" -> "Genesis"
export function cleanTitle(name: string, artist?: string): string {
  let s = name.replace(/\(.*?\)|\[.*?\]/g, " ");
  if (artist) {
    const esc = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`^\\s*${esc}\\s*[-–—:]\\s*`, "i"), "");
  }
  s = s.replace(/^[^-–—]{2,40}\s[-–—]\s/, (m) => (artist ? m : "")); // unknown artist: drop an "Artist - " prefix
  return s.replace(/official|audio|video|clip|lyrics?/gi, " ").replace(/[†*]+/g, " ").replace(/\s+/g, " ").trim();
}

export function announcement(t: LibTrack, style: DjOptions["voice"], first = false): string {
  const title = cleanTitle(t.name, t.group);
  const who = t.group ? `${title}, de ${t.group}` : title;
  if (style === "radio") return first ? `Bienvenue sur Radio A V A. Pour commencer : ${who}.` : `Sur Radio A V A : ${who}.`;
  return who;
}
