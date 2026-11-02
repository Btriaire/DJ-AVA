// The "smart" mini-EQ of a Stem Sample Pad row: half the way to a balanced sound, plus what the stem wants (MaRuche, reviewed)
export const EQ_INTENT: Record<string, number[]> = {
  drums: [2, -3, 1, 2],
  bass: [3, -2, -1, -6],
  vocals: [-6, -2, 3, 2],
  other: [-2, -3, 1, 1],
  guitar: [-3, -2, 2, 1],
  piano: [-1, -2, 1, 1],
  unknown: [0, -2, 1, 1]
};

export function smartEqGains(stem: string, bands: number[]): number[] {
  const intent = EQ_INTENT[stem] || EQ_INTENT.unknown;
  const heard = bands.filter((b) => b >= -90);
  const mean = heard.length ? heard.reduce((sum, val) => sum + val, 0) / heard.length : 0;
  const tilt = [6, 2, -2, -6]; // a balanced sound: each region 4 dB under the previous one, around the mean
  const clamp = (g: number) => Math.max(-6, Math.min(6, Math.round(g * 2) / 2));
  // half the way to the balanced tilt, then what this stem wants; a silent region only gets the intent
  return bands.map((band, i) => clamp(band < -90 ? intent[i] : (mean + tilt[i] - band) / 2 + intent[i]));
}

export function padEqTest(): void {
  const v = smartEqGains("vocals", [-30, -30, -30, -30]);
  if (!(v[0] < 0 && v[2] > 0)) throw new Error("padEq vocals");
  if (smartEqGains("bass", [-120, -30, -34, -38])[0] !== 3) throw new Error("padEq silent band");
  for (const st of Object.keys(EQ_INTENT)) for (const g of smartEqGains(st, [-20, -45, -25, -60])) if (g < -6 || g > 6) throw new Error("padEq range");
}
