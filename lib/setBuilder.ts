import { type Cue, harmonicScore, tempoScore } from "@/lib/setPicker";

// Orders a group of tracks into one set: starts near the median tempo, then
// greedily picks the best tempo + key match among the rest. Unknown BPM
// (0) tracks go to the end in their input order.
// ponytail: O(n^2) greedy, fine under ~500 tracks; add a real TSP solver if sets get bigger.
export function buildSmartSet(tracks: Cue[]): string[] {
  const pool = tracks.filter((t) => t.bpm > 0);
  const unknown = tracks.filter((t) => t.bpm <= 0);
  if (pool.length === 0) return tracks.map((t) => t.id);

  const sorted = pool.map((t) => t.bpm).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let cur = pool.reduce((best, t) => (Math.abs(t.bpm - median) < Math.abs(best.bpm - median) ? t : best));

  const order: Cue[] = [cur];
  let remaining = pool.filter((t) => t.id !== cur.id);
  const score = (a: Cue, b: Cue) => 2 * tempoScore(a.bpm, b.bpm) + harmonicScore(a.camelot, b.camelot);

  while (remaining.length > 0) {
    const next = remaining.reduce((best, t) => {
      const s = score(cur, t);
      const bs = score(cur, best);
      if (s !== bs) return s > bs ? t : best;
      return Math.abs(t.bpm - cur.bpm) < Math.abs(best.bpm - cur.bpm) ? t : best;
    });
    order.push(next);
    cur = next;
    remaining = remaining.filter((t) => t.id !== next.id);
  }

  return [...order, ...unknown].map((t) => t.id);
}
