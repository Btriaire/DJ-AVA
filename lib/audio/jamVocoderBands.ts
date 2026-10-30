// Log-spaced vocoder bands (MaRuche/Codestral)
export function vocoderBands(n: number, lo = 120, hi = 7000): { freq: number; q: number }[] {
  if (n < 1) return [];
  const bands: { freq: number; q: number }[] = [];
  const logRatio = Math.log2(hi / lo);
  for (let k = 0; k < n; k++) {
    const freq = lo * (hi / lo) ** ((k + 0.5) / n);
    const w = logRatio / n;
    const q = Math.sqrt(2 ** w) / (2 ** w - 1);
    bands.push({ freq, q });
  }
  return bands;
}

export function selfTest(): void {
  const bands16 = vocoderBands(16);
  assert(bands16.length === 16, "16 bands -> 16 entries");
  for (let i = 1; i < bands16.length; i++) {
    assert(bands16[i].freq > bands16[i - 1].freq, "frequencies strictly increasing");
    assert(bands16[i].freq >= 120 && bands16[i].freq <= 7000, "all between lo and hi");
  }

  const bands1 = vocoderBands(1, 100, 400);
  assert(Math.abs(bands1[0].freq - 200) < 1e-9, "freq 200 within 1e-9");
  const expectedQ = 2 / 3; // w = 2 octaves: sqrt(4) / (4 - 1)
  assert(Math.abs(bands1[0].q - expectedQ) < 1e-9, "q close to expected value");

  assert(vocoderBands(0).length === 0, "vocoderBands(0) is empty");
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
