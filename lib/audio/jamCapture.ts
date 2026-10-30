// The song chords read into a 4-bar loop (MaRuche/Codestral)
export function captureBars(degreeAt: (t: number) => number, firstBarStart: number, barLen: number, beatsPerBar = 4): number[] {
  const bars: number[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const barStart = firstBarStart + bar * barLen;
    const counts: Record<number, number> = {};
    const degreesHeard: number[] = [];

    for (let beat = 0; beat < beatsPerBar; beat++) {
      const t = barStart + (beat + 0.5) * barLen / beatsPerBar;
      const degree = Math.floor(degreeAt(t)) % 7;
      counts[degree] = (counts[degree] || 0) + 1;
      degreesHeard.push(degree);
    }

    let maxDegree = degreesHeard[0];
    let maxCount = counts[maxDegree];
    for (const degree of degreesHeard) {
      if (counts[degree] > maxCount) {
        maxDegree = degree;
        maxCount = counts[degree];
      }
    }
    bars.push(maxDegree);
  }
  return bars;
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

  // Constant degree
  assert(captureBars(() => 3, 0, 1).every(d => d === 3), "Constant degree failed");

  // Linear progression
  assert(captureBars(t => Math.floor(t / 2) % 7, 0, 2).join() === "0,1,2,3", "Linear progression failed");

  // Tie resolution
  const tieResolver = (t: number) => [1, 2, 2, 1][Math.floor(t * 2) % 4];
  assert(captureBars(tieResolver, 0, 2)[0] === 1, "Tie resolution failed");

  // Range check
  const result = captureBars((t) => Math.floor(t * 7) % 7, 0, 1);
  assert(result.length === 4 && result.every(d => d >= 0 && d <= 6), "Range check failed");
}
