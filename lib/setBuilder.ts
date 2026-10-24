import { type Cue, harmonicScore, tempoScore } from "@/lib/setPicker";

export type SetArc = "flow" | "rise" | "fall" | "peak" | "wave";
export interface SetCue extends Cue { durationSec: number }
export interface SetOptions {
  arc: SetArc;
  targetMin?: number;
  startId?: string;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let t = (seed >>> 0);
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function arcTarget(arc: SetArc, t: number): number {
  t = Math.max(0, Math.min(1, t));
  switch (arc) {
    case "flow": return 0.5;
    case "rise": return t;
    case "fall": return 1 - t;
    case "peak": return t <= 0.7 ? t / 0.7 : 0.4 + 0.6 * (1 - t) / 0.3;
    case "wave": return 0.5 - 0.5 * Math.cos(4 * Math.PI * t);
  }
}

export function transitionScore(a: Cue, b: Cue): number {
  return 2 * tempoScore(a.bpm, b.bpm) + harmonicScore(a.camelot, b.camelot);
}

function stepCost(order: SetCue[], k: number, minBpm: number, range: number, arc: SetArc, m: number): number {
  const prev = order[k - 1];
  const cur = order[k];
  const t = m > 1 ? k / (m - 1) : 1;
  const tempoTerm = arc === "flow"
    ? 3 * Math.abs(cur.bpm - prev.bpm) / range
    : 3 * Math.abs(cur.bpm - (minBpm + arcTarget(arc, t) * range)) / range;
  return tempoTerm + (2 - tempoScore(prev.bpm, cur.bpm)) * 0.8 + (3 - harmonicScore(prev.camelot, cur.camelot)) * 0.5;
}

// Local search over pair swaps. The greedy pass leaves leftovers at the end (a "rise"
// can finish below the tempo it passed); swapping two tracks is kept when the total
// step cost drops. The first track never moves; only the order changes, not the tracks.
function polish(order: SetCue[], minBpm: number, range: number, arc: SetArc): SetCue[] {
  const m = order.length;
  if (m < 3 || m > 300) return order;
  const cost = (k: number) => (k > 0 && k < m ? stepCost(order, k, minBpm, range, arc, m) : 0);
  for (let sweep = 0; sweep < 20; sweep++) {
    let kept = false;
    for (let i = 1; i < m - 1; i++) {
      for (let j = i + 1; j < m; j++) {
        // a swap changes the cost of the swapped positions and of the ones right after them
        const ks = j === i + 1 ? [i, j, j + 1] : [i, i + 1, j, j + 1];
        const before = ks.reduce((sum, k) => sum + cost(k), 0);
        [order[i], order[j]] = [order[j], order[i]];
        const after = ks.reduce((sum, k) => sum + cost(k), 0);
        if (after < before - 1e-9) kept = true;
        else [order[i], order[j]] = [order[j], order[i]];
      }
    }
    if (!kept) break;
  }
  return order;
}

export function buildSet(tracks: SetCue[], opts: SetOptions): string[] {
  const pool = tracks.filter(t => t.bpm > 0);
  const unknown = tracks.filter(t => t.bpm <= 0).map(t => t.id);
  if (pool.length === 0) return tracks.map(t => t.id);

  const minBpm = Math.min(...pool.map(t => t.bpm));
  const maxBpm = Math.max(...pool.map(t => t.bpm));
  const range = Math.max(maxBpm - minBpm, 1);
  const wanted = opts.targetMin && opts.targetMin > 0 ? opts.targetMin * 60 : 0;
  const avgDuration = pool.filter(t => t.durationSec > 0).reduce((sum, t) => sum + t.durationSec, 0) / pool.filter(t => t.durationSec > 0).length || 240;
  const n = wanted > 0 ? Math.max(1, Math.min(Math.round(wanted / avgDuration), pool.length)) : pool.length;

  let remaining = [...pool];
  const result: SetCue[] = [];
  let totalDuration = 0;
  const rng = opts.seed !== undefined ? mulberry32(opts.seed) : undefined;

  const findStart = () => {
    if (opts.startId) {
      const start = remaining.find(t => t.id === opts.startId);
      if (start) return start;
    }
    const sorted = [...remaining].sort((a, b) => a.bpm - b.bpm);
    const median = sorted[Math.floor(sorted.length / 2)].bpm;
    if (opts.arc === "flow") {
      return remaining.reduce((best, cur) =>
        Math.abs(cur.bpm - median) < Math.abs(best.bpm - median) ? cur : best
      );
    } else {
      const targetBpm = minBpm + arcTarget(opts.arc, 0) * range;
      return remaining.reduce((best, cur) =>
        Math.abs(cur.bpm - targetBpm) < Math.abs(best.bpm - targetBpm) ? cur : best
      );
    }
  };

  const first = findStart();
  result.push(first);
  totalDuration += first.durationSec > 0 ? first.durationSec : 240;
  remaining = remaining.filter(t => t.id !== first.id);

  if (wanted > 0 && totalDuration >= wanted) {
    return result.map(t => t.id);
  }

  let prev = first;
  while (remaining.length > 0) {
    const t = n > 1 ? Math.min(1, result.length / (n - 1)) : 1;
    let best: SetCue | null = null;
    let bestCost = Infinity;

    for (const candidate of remaining) {
      const tempoTerm = opts.arc === "flow"
        ? 3 * Math.abs(candidate.bpm - prev.bpm) / range
        : 3 * Math.abs(candidate.bpm - (minBpm + arcTarget(opts.arc, t) * range)) / range;
      const cost = tempoTerm +
        (2 - tempoScore(prev.bpm, candidate.bpm)) * 0.8 +
        (3 - harmonicScore(prev.camelot, candidate.camelot)) * 0.5;
      const finalCost = rng ? cost + rng() * 0.35 : cost;
      if (finalCost < bestCost) {
        best = candidate;
        bestCost = finalCost;
      }
    }

    if (best) {
      result.push(best);
      totalDuration += best.durationSec > 0 ? best.durationSec : 240;
      remaining = remaining.filter(t => t.id !== best.id);
      prev = best;
      if (wanted > 0 && totalDuration >= wanted) break;
    } else break;
  }

  const polished = polish(result, minBpm, range, opts.arc);
  const ids = polished.map(t => t.id);
  if (wanted === 0) ids.push(...unknown);
  return ids;
}

export function buildSmartSet(tracks: Cue[]): string[] {
  return buildSet(tracks.map(t => ({ ...t, durationSec: 0 })), { arc: "flow" });
}
