import type { LibTrack } from "@/lib/library";
import { cleanTitle, type DjOptions } from "@/lib/mixPlan";

// What the English DJ says. Lines are plain text: the same text always gives the same cached clip,
// so the generic ones (intro, outro) are made once for every show.

export const INTRO_LINE = "You're listening to Radio Ava. Let's get started.";
export const OUTRO_LINE = "That was Radio Ava. Thanks for listening, and see you next time.";

// what the DJ says when song `i` comes in; null = nothing (the frequency option skips some songs)
export function djLineFor(tracks: LibTrack[], i: number, dj: DjOptions): string | null {
  if (dj.voice === "off" || i < 0 || i >= tracks.length) return null;
  const t = tracks[i];
  if (i > 0) {
    if (dj.voiceEvery === 2 && i % 2 !== 0) return null;
    if (dj.voiceEvery === 0 && tracks[i - 1].group && tracks[i - 1].group === t.group) return null;
  }
  const title = cleanTitle(t.name, t.group);
  const who = t.group ? `${t.group}, with ${title}` : title;
  if (dj.voice === "discret") return `${who}.`;
  if (i === 0) return `Let's start with ${who}.`;
  const variants = [`Next up: ${who}.`, `${who}. Keep it going.`, `Radio Ava. ${who}.`, `Here comes ${who}.`];
  return variants[(i - 1) % variants.length];
}

// every clip a show needs, without duplicates, in the order they will be played
export function djLinesForShow(tracks: LibTrack[], dj: DjOptions): string[] {
  if (dj.voice === "off") return [];
  const lines: string[] = [];
  if (dj.voice === "radio") lines.push(INTRO_LINE);
  tracks.forEach((_, i) => {
    const l = djLineFor(tracks, i, dj);
    if (l) lines.push(l);
  });
  if (dj.voice === "radio" || dj.endOfSet === "stop") lines.push(OUTRO_LINE);
  return [...new Set(lines)];
}
