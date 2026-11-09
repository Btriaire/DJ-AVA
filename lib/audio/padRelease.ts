// RELEASE for the stem pads: when a pad ends or is let go, the stem keeps sounding and fades out over this time
// instead of stopping dead. The stem buffer itself carries on (the real tail of the note), only the gain fades.
export const RELEASES = [
  { sec: 0, label: "Off" },
  { sec: 0.15, label: "Court" },
  { sec: 0.4, label: "Moyen" },
  { sec: 1, label: "Long" },
  { sec: 2, label: "Très long" },
] as const;
export type ReleaseSec = (typeof RELEASES)[number]["sec"];

// fade the gain out from `at` over `release` seconds (about 99 % gone at the end); returns when the source can stop
export function fadeOut(g: GainNode, at: number, release: number, quick = 0.012): number {
  const p = g.gain;
  p.cancelScheduledValues(at);
  p.setValueAtTime(p.value, at);
  if (release <= 0) {
    p.linearRampToValueAtTime(0, at + quick);
    return at + quick + 0.01;
  }
  p.setTargetAtTime(0, at, release / 4.6); // e^-4.6 ≈ 1 %: inaudible by the end of the release
  return at + release + 0.02;
}
