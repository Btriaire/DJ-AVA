import type { TransitionType } from "@/lib/library";

// Transitions that play with the STEMS of the two songs (drums, bass, other, vocals) instead of only the
// crossfader: one stem at a time leaves or enters, so the blend is built like a DJ with a stem mixer would.
// Pure: `stemFrame` gives, for a progress k (0..1) through the blend, the level of every stem of both songs.

export type StemName = "drums" | "bass" | "other" | "vocals";
export type StemTech = "build" | "drumswap" | "vocalhandoff" | "bassslam" | "stripout" | "drumbridge";
export type StemMode = "off" | "smooth" | "punchy";

export const STEM_TECH_LABEL: Record<StemTech, string> = {
  build: "Montée par stems",
  drumswap: "Échange de batterie",
  vocalhandoff: "Voix sur le nouveau rythme",
  bassslam: "Claque de basse",
  stripout: "Dépouillement + écho de voix",
  drumbridge: "Pont de batterie",
};

export const STEM_TECH_NOTE: Record<StemTech, string> = {
  build: "Le titre qui arrive entre par la batterie, puis la basse, les harmonies et la voix ; l'ancien se retire dans l'ordre inverse.",
  drumswap: "La batterie de l'ancien titre cède la place à celle du nouveau, puis le reste suit.",
  vocalhandoff: "La voix de l'ancien titre chante encore sur le rythme du nouveau, avec un écho, avant que la voix du nouveau prenne le relais.",
  bassslam: "Le nouveau titre entre sans basse, puis sa basse remplace d'un coup celle de l'ancien : l'effet percutant.",
  stripout: "L'ancien titre est dépouillé instrument par instrument ; seule sa voix reste, avec un écho, au-dessus du nouveau titre.",
  drumbridge: "Les deux titres ne gardent que leur batterie : elles roulent ensemble sur les mêmes temps, puis la basse, les harmonies et la voix du nouveau titre reviennent.",
};

export interface StemFrame {
  out: Partial<Record<StemName, number>>; // levels of the outgoing song's stems (missing = untouched)
  inn: Partial<Record<StemName, number>>; // levels of the incoming song's stems
  outEcho: number; // delay send of the outgoing vocals, 0..1
  cross: number; // progress of the crossfader, 0..1: it leaves the edge, stays near the middle, then finishes
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ramp = (k: number, a: number, b: number) => smooth(clamp01((k - a) / Math.max(b - a, 1e-6)));

// the crossfader holds the middle while the stems do the work, so a stem that stays is not dimmed by it
export function crossCurve(k: number): number {
  if (k < 0.12) return 0.5 * smooth(k / 0.12);
  if (k > 0.88) return 0.5 + 0.5 * smooth((k - 0.88) / 0.12);
  return 0.5;
}

// how fast a stem changes: a punchy slam is nearly instant, a smooth blend takes its time
function widthOf(tech: StemTech, mode: StemMode): number {
  if (mode !== "punchy") return 0.2;
  return tech === "bassslam" ? 0.03 : tech === "drumswap" ? 0.06 : tech === "drumbridge" ? 0.08 : 0.12;
}

export function stemFrame(tech: StemTech, k: number, mode: StemMode = "smooth"): StemFrame {
  const w = widthOf(tech, mode);
  const up = (a: number, wide = w) => ramp(k, a, Math.min(1, a + wide));
  const down = (a: number, wide = w) => 1 - up(a, wide);
  const cross = crossCurve(k);
  switch (tech) {
    case "build":
      return {
        inn: { drums: up(0), bass: up(0.45), other: up(0.55), vocals: up(0.7) },
        out: { vocals: down(0.25), bass: down(0.4), other: down(0.55), drums: down(0.7) },
        outEcho: 0,
        cross,
      };
    case "drumswap":
      return {
        inn: { drums: up(0.25), bass: up(0.5), other: up(0.5), vocals: up(0.5) },
        out: { drums: down(0.25), bass: down(0.5), other: down(0.5), vocals: down(0.5) },
        outEcho: 0,
        cross,
      };
    case "vocalhandoff":
      return {
        inn: { drums: up(0.15), bass: up(0.15), other: up(0.15), vocals: up(0.85) },
        out: { drums: down(0.3), bass: down(0.3), other: down(0.3), vocals: down(0.85) },
        outEcho: 0.9 * ramp(k, 0.55, 0.85),
        cross,
      };
    case "bassslam":
      return {
        inn: { drums: up(0, 0.3), other: up(0.15, 0.3), vocals: up(0.35, 0.3), bass: up(0.5) },
        out: { bass: down(0.5), drums: down(0.5, 0.4), other: down(0.5, 0.4), vocals: down(0.5, 0.4) },
        outEcho: 0,
        cross,
      };
    case "drumbridge":
      // the old song loses everything but its drums, the new one enters by its drums alone: for a while only
      // two drum kits play (on the same beat), then the new song's bass, harmonies and voice come back
      return {
        inn: { drums: up(0.25), bass: up(0.65), other: up(0.7), vocals: up(0.78) },
        out: { vocals: down(0.1), other: down(0.15), bass: down(0.2), drums: down(0.72) },
        outEcho: 0,
        cross,
      };
    case "stripout":
      return {
        inn: {},
        out: { drums: down(0.2), other: down(0.3), bass: down(0.45), vocals: down(0.85) },
        outEcho: 0.9 * ramp(k, 0.5, 0.85),
        cross,
      };
  }
}

// which technique this transition uses, or null (plain blend). Techniques rotate with the transition index so a
// set does not repeat the same trick; what the two songs have (stems loaded or not) limits the choice.
// `bpm` (the slower of the two songs) and `sync` let the choice fit the songs: drums played together need the
// same beat, a slammed bass needs a tempo that can take it, a calm pair only gets the soft techniques.
export function pickTech(o: { outStems: boolean; inStems: boolean; index: number; mode: StemMode; type: TransitionType; sec: number; bpm?: number; sync?: boolean; noVocals?: boolean }): StemTech | null {
  if (o.mode === "off" || o.type === "cut" || o.sec < 6) return null;
  const bpm = o.bpm ?? 120;
  const beat = o.sync !== false && bpm >= 90; // drum-on-drum blends only work on a shared beat
  const punchy: StemTech[] = ["drumswap", "vocalhandoff", "bassslam", "build", "drumbridge"].filter(
    (t) => (t !== "drumswap" && t !== "drumbridge") || beat
  ) as StemTech[];
  const both: StemTech[] = o.mode === "punchy" ? punchy.filter((t) => t !== "bassslam" || bpm >= 100) : ["build", "vocalhandoff"];
  // voices switched off (the tempos are too far apart): no technique built around a voice
  const VOICE_TECHS: StemTech[] = ["vocalhandoff", "stripout"];
  const pool: StemTech[] = o.outStems && o.inStems ? both : o.inStems ? ["build"] : o.outStems ? ["stripout"] : [];
  const list = pool.filter((t) => !o.noVocals || !VOICE_TECHS.includes(t));
  return list.length ? list[o.index % list.length] : null;
}
