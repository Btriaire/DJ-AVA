// Played, not programmed: small deterministic timing and velocity variations (MaRuche/Codestral)
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function humanize(step: number, voice: number, amount: number): { dt: number; vel: number } {
  amount = Math.min(Math.max(amount, 0), 1);
  const r1 = hash01(step, voice);
  const r2 = hash01(step, voice + 101);
  return {
    dt: (r1 * 0.024 - 0.012) * amount,
    vel: (1 - 0.18 * amount) + r2 * (0.24 * amount)
  };
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(JSON.stringify(humanize(3, 1, 0)) === '{"dt":0,"vel":1}', 'humanize(3,1,0)');
  for (let s = 0; s < 200; s++) {
    for (let v = 0; v < 4; v++) {
      const { dt, vel } = humanize(s, v, 1);
      assert(Math.abs(dt) <= 0.012, `dt out of range: ${dt}`);
      assert(vel >= 0.82 && vel <= 1.06, `vel out of range: ${vel}`);
    }
  }
  const h1 = humanize(5, 2, 0.5);
  const h2 = humanize(5, 2, 0.5);
  assert(JSON.stringify(h1) === JSON.stringify(h2), 'non-deterministic');
  for (let i = 0; i < 1000; i++) {
    const h = hash01(i);
    assert(h >= 0 && h < 1, `hash01 out of range: ${h}`);
  }
  const first = hash01(0);
  assert(!Array.from({ length: 1000 }, (_, i) => hash01(i)).every(h => h === first), 'hash01 not random');
}
