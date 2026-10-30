export interface PadSlice { start: number; len: number }

export function gridSlices(barStart: number, sliceSec: number, count: number, duration: number): PadSlice[] {
  const slices: PadSlice[] = [];
  for (let k = 0; k < count; k++) {
    const start = barStart + k * sliceSec;
    if (start >= duration) break;
    const len = Math.min(sliceSec, duration - start);
    slices.push({ start, len });
  }
  return slices;
}

export function mergeEvents(lists: number[][], minGap = 0.06): number[] {
  const merged = lists.flat().sort((a, b) => a - b);
  const result: number[] = [];
  for (const time of merged) {
    if (result.length === 0 || time - result[result.length - 1] >= minGap) {
      result.push(time);
    }
  }
  return result;
}

export function hitSlices(events: number[], barStart: number, count: number, maxLen: number, duration: number, minGap = 0.06): PadSlice[] {
  const slices: PadSlice[] = [];
  let i = binarySearch(events, barStart - 0.005);
  while (i < events.length && slices.length < count) {
    const start = events[i];
    if (start >= duration) break;
    let nextStart = Infinity;
    for (let j = i + 1; j < events.length; j++) {
      if (events[j] - start >= minGap) {
        nextStart = events[j];
        break;
      }
    }
    const len = Math.min(nextStart - start, maxLen, duration - start);
    slices.push({ start, len });
    i++;
    while (i < events.length && events[i] - start < minGap) i++;
  }
  return slices;
}

function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return left;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function phraseStarts(notes: { start: number; end: number }[], gap = 0.35): number[] {
  const starts: number[] = [];
  let prevEnd = -Infinity;

  for (const note of notes) {
    if (note.start - prevEnd >= gap) {
      starts.push(note.start);
    }
    prevEnd = Math.max(prevEnd, note.end);
  }

  return starts;
}

export function selfTest(): void {
  const gridResult = gridSlices(10, 0.5, 4, 11.2);
  assert(gridResult.length === 3, "gridSlices length");
  assert(Math.abs(gridResult[0].start - 10) < 1e-9, "gridSlices start 0");
  assert(Math.abs(gridResult[1].start - 10.5) < 1e-9, "gridSlices start 1");
  assert(Math.abs(gridResult[2].start - 11) < 1e-9, "gridSlices start 2");
  assert(Math.abs(gridResult[2].len - 0.2) < 1e-9, "gridSlices len 2");

  const lists = [[1, 2, 3], [1.02, 2.5]];
  const merged = mergeEvents(lists);
  assert(merged.length === 4, "mergeEvents length");
  assert(Math.abs(merged[0] - 1) < 1e-9, "mergeEvents 0");
  assert(Math.abs(merged[1] - 2) < 1e-9, "mergeEvents 1");
  assert(Math.abs(merged[2] - 2.5) < 1e-9, "mergeEvents 2");
  assert(Math.abs(merged[3] - 3) < 1e-9, "mergeEvents 3");
  assert(lists[0].length === 3 && lists[1].length === 2, "mergeEvents inputs");

  const ev = [0.5, 1, 1.03, 1.5, 2, 2.6, 3.4];
  const hitResult1 = hitSlices(ev, 0.9, 3, 0.8, 10);
  assert(hitResult1.length === 3, "hitSlices length 1");
  assert(Math.abs(hitResult1[0].start - 1) < 1e-9, "hitSlices start 0 1");
  assert(Math.abs(hitResult1[1].start - 1.5) < 1e-9, "hitSlices start 1 1");
  assert(Math.abs(hitResult1[2].start - 2) < 1e-9, "hitSlices start 2 1");
  assert(Math.abs(hitResult1[0].len - 0.5) < 1e-9, "hitSlices len 0 1");
  assert(Math.abs(hitResult1[1].len - 0.5) < 1e-9, "hitSlices len 1 1");
  assert(Math.abs(hitResult1[2].len - 0.6) < 1e-9, "hitSlices len 2 1");

  const hitResult2 = hitSlices(ev, 2.5, 4, 0.5, 10);
  assert(hitResult2.length === 2, "hitSlices length 2");
  assert(Math.abs(hitResult2[0].start - 2.6) < 1e-9, "hitSlices start 0 2");
  assert(Math.abs(hitResult2[1].start - 3.4) < 1e-9, "hitSlices start 1 2");
  assert(Math.abs(hitResult2[0].len - 0.5) < 1e-9, "hitSlices len 0 2");
  assert(Math.abs(hitResult2[1].len - 0.5) < 1e-9, "hitSlices len 1 2");

  assert(hitSlices([], 0, 16, 1, 10).length === 0, "hitSlices empty");
  assert(hitSlices(ev, 9, 4, 1, 10).length === 0, "hitSlices out of range");
  assert(JSON.stringify(phraseStarts([])) === JSON.stringify([]), 'phraseStarts([]) should return an empty array');
  assert(JSON.stringify(phraseStarts([{ start: 1, end: 1.5 }, { start: 1.6, end: 2 }, { start: 2.5, end: 3 }, { start: 3.1, end: 3.2 }])) === JSON.stringify([1, 2.5]), 'phraseStarts with 0.1 gap should return [1, 2.5]');
  assert(JSON.stringify(phraseStarts([{ start: 0, end: 4 }, { start: 1, end: 1.2 }, { start: 4.2, end: 5 }])) === JSON.stringify([0]), 'phraseStarts with 0.35 gap should return [0]');
  assert(JSON.stringify(phraseStarts([{ start: 0, end: 1 }, { start: 2, end: 3 }], 2)) === JSON.stringify([0]), 'phraseStarts with custom gap should return [0]');
}
