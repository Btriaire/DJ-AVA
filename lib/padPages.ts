// the pool of samples of a stem, shown 5 pads at a time (REFRESH goes to the next page)
import type { PadSample } from "@/lib/stemSamples";

export function pageCount(pool: PadSample[]): number {
  const loops = pool.filter(s => s.kind === "loop").length;
  const shots = pool.filter(s => s.kind === "shot").length;
  if (pool.length === 0) return 0;
  return Math.max(Math.ceil(loops / 3), Math.ceil(shots / 2));
}

export function poolPage(pool: PadSample[], page: number, cols = 5): PadSample[] {
  const loops = pool.filter(s => s.kind === "loop");
  const shots = pool.filter(s => s.kind === "shot");
  const n = pageCount(pool);
  if (n === 0) return [];

  const p = ((page % n) + n) % n;
  const loopStart = p * 3;
  const shotStart = p * 2;

  const pageLoops = loops.slice(loopStart, loopStart + 3).concat(loops.slice(0, Math.max(0, loopStart + 3 - loops.length)));
  const pageShots = shots.slice(shotStart, shotStart + 2).concat(shots.slice(0, Math.max(0, shotStart + 2 - shots.length)));

  const pageItems = [...pageLoops, ...pageShots];
  const remainingItems = pool.filter(item => !pageItems.includes(item));

  while (pageItems.length < cols && remainingItems.length > 0) {
    pageItems.push(remainingItems.shift()!);
  }

  return pageItems;
}

export function padPagesTest(): void {
  const loops = Array(8).fill({ kind: "loop" } as PadSample);
  const shots = Array(3).fill({ kind: "shot" } as PadSample);
  const pool = [...loops, ...shots];

  if (pageCount(pool) !== 3) throw new Error("padPages pageCount");
  if (poolPage(pool, 0).length !== 5) throw new Error("padPages poolPage length");
  if (poolPage(pool, 0).filter(s => s.kind === "loop").length !== 3) throw new Error("padPages poolPage loops");
  if (poolPage(pool, 0).filter(s => s.kind === "shot").length !== 2) throw new Error("padPages poolPage shots");
  if (poolPage(pool, 3).filter((s, i) => s !== poolPage(pool, 0)[i]).length !== 0) throw new Error("padPages poolPage cycle");

  if (pageCount([]) !== 0) throw new Error("padPages empty pool pageCount");
  if (poolPage([], 0).length !== 0) throw new Error("padPages empty pool poolPage");

  const shotsOnly = Array(2).fill({ kind: "shot" } as PadSample);
  if (pageCount(shotsOnly) !== 1) throw new Error("padPages shots only pageCount");
  if (poolPage(shotsOnly, 0).length !== 2) throw new Error("padPages shots only poolPage length");
}
