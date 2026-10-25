import type { LibTrack, TransitionType } from "@/lib/library";
import type { SetArc } from "@/lib/setBuilder";
import { keyCompat, shiftCamelot } from "@/lib/camelot";

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
}

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
};

export const STEP_LABEL: Record<TransitionType, string> = { smooth: "Fondu doux", fade: "Fondu", filter: "Filtre", cut: "Coupe" };

// % between two tempos, folding a double or half tempo onto the same beat (130 and 65 mix on the beat)
export function tempoGap(a: number, b: number): { pct: number; folded: boolean } {
  if (!(a > 0) || !(b > 0)) return { pct: 0, folded: false };
  const r = b / a;
  if (Math.abs(r - 2) < 0.1) return { pct: (r / 2 - 1) * 100, folded: true };
  if (Math.abs(r - 0.5) < 0.05) return { pct: (r * 2 - 1) * 100, folded: true };
  return { pct: (r - 1) * 100, folded: false };
}

export function planStep(a: LibTrack, b: LibTrack, arc: SetArc, opts: DjOptions = DEFAULT_DJ): MixStep {
  if (opts.style === "classical") {
    // no beat to match, no bass to swap: a long, soft blend, never longer than a tenth of the shortest piece
    const shortest = Math.min(a.durationSec || 300, b.durationSec || 300);
    return { type: "smooth", sec: Math.round(Math.max(5, Math.min(14, shortest * 0.1))), sync: false, bassSwap: false, tail: "none", note: "Enchaînement classique : fondu long et doux, sans caler les tempos." };
  }
  const { pct, folded } = tempoGap(a.bpm ?? 0, b.bpm ?? 0);
  const gap = Math.abs(pct);
  const level = keyCompat(a.camelot, b.camelot).level;
  const friendly = level === "same" || level === "good";
  const known = (a.bpm ?? 0) > 0 && (b.bpm ?? 0) > 0;
  let step: Omit<MixStep, "bassSwap">;

  if (!known) {
    step = { type: "fade", sec: 8, sync: false, note: "Tempo inconnu : fondu classique, sans calage." };
  } else if (folded) {
    step = { type: "filter", sec: 8, sync: false, note: "Tempo double ou moitié : fondu filtré, sans calage (les temps tombent ensemble)." };
  } else if (gap <= 3) {
    step = friendly
      ? { type: "smooth", sec: 16, sync: true, note: `Même tempo (${gap.toFixed(1)} %) et tonalités amies : long fondu calé sur les temps.` }
      : level === "boost"
        ? { type: "smooth", sec: 12, sync: true, note: "Même tempo, montée d'énergie en tonalité : fondu calé, l'ensemble monte." }
        : { type: "filter", sec: 10, sync: true, note: "Même tempo mais tonalités qui s'opposent : le filtre cache le choc." };
  } else if (gap <= 6) {
    step =
      friendly || level === "boost"
        ? { type: "fade", sec: 10, sync: true, note: `Écart de tempo de ${gap.toFixed(1)} % : le titre entrant est calé sur le sortant, fondu moyen.` }
        : { type: "filter", sec: 8, sync: true, note: "Tonalités qui s'opposent : fondu filtré, tempo calé." };
  } else if (gap <= 10) {
    step = { type: "filter", sec: 6, sync: false, note: `Écart de tempo de ${gap.toFixed(0)} % : fondu filtré court, sans caler (un calage s'entendrait).` };
  } else {
    step = { type: "cut", sec: 0, sync: false, note: `Saut de tempo de ${gap.toFixed(0)} % : coupure nette, mieux qu'un fondu qui boite.` };
  }

  // the shape of the set: a rise tightens the blends, a fall lets them breathe
  const arcFactor = arc === "rise" ? 0.85 : arc === "fall" ? 1.15 : 1;
  // never longer than a fifth of the shortest song
  const shortest = Math.min(a.durationSec || 240, b.durationSec || 240);
  const sec = step.type === "cut" ? 0 : Math.round(Math.max(3, Math.min(20, step.sec * arcFactor, shortest * 0.2)));
  return {
    ...step,
    sec,
    sync: step.sync && opts.sync,
    bassSwap: opts.bassSwap && step.type !== "cut" && sec >= 6,
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
    const step = planStep(a, b, arc, opts);
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
