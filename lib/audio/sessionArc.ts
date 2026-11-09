export type ArcName = "constant" | "montee" | "vague" | "descente";

export const ARCS: Record<ArcName, { label: string; hint: string }> = {
  constant: { label: "Constant", hint: "Ambiances stables" },
  montee: { label: "Montée", hint: "De 30 % à 100 % sur la séance" },
  vague: { label: "Vague", hint: "Respiration lente de 5 minutes" },
  descente: { label: "Descente", hint: "De 100 % à 40 % sur la séance" },
};

export function isArcName(v: unknown): v is ArcName {
  return typeof v === "string" && Object.hasOwn(ARCS, v);
}

export function arcGain(arc: ArcName, elapsedSec: number, totalSec: number): number {
  const elapsed = Math.max(0, isNaN(elapsedSec) ? 0 : elapsedSec);
  const f = totalSec > 0 ? Math.min(Math.max(elapsed / totalSec, 0), 1) : 0;

  switch (arc) {
    case "constant":
      return 1;
    case "montee":
      return 0.3 + 0.7 * f;
    case "descente":
      return 1 - 0.6 * f;
    case "vague":
      const boundedElapsed = Math.max(0, elapsed);
      return 0.7 + 0.3 * Math.sin(2 * Math.PI * boundedElapsed / 300);
    default:
      throw new Error(`Unknown arc: ${arc}`);
  }
}

export function selfCheck(): string[] {
  const errors: string[] = [];

  // Test constant
  if (arcGain("constant", 0, 100) !== 1 || arcGain("constant", 100, 100) !== 1) {
    errors.push("constant should always return 1");
  }

  // Test montee
  if (Math.abs(arcGain("montee", 0, 600) - 0.3) > 1e-9) {
    errors.push("montee(0,600) should be 0.3");
  }
  if (Math.abs(arcGain("montee", 600, 600) - 1) > 1e-9) {
    errors.push("montee(600,600) should be 1");
  }

  // Test descente
  if (Math.abs(arcGain("descente", 0, 600) - 1) > 1e-9) {
    errors.push("descente(0,600) should be 1");
  }
  if (Math.abs(arcGain("descente", 600, 600) - 0.4) > 1e-9) {
    errors.push("descente(600,600) should be 0.4");
  }

  // Test vague
  for (let t = 0; t <= 1200; t += 7) {
    const gain = arcGain("vague", t, 1200);
    if (gain < 0.4 - 1e-9 || gain > 1 + 1e-9) {
      errors.push(`vague gain out of bounds at t=${t}`);
      break;
    }
  }

  // Test edge cases
  if (arcGain("constant", 0, 0) < 0 || arcGain("constant", 0, 0) > 1) {
    errors.push("arcGain with totalSec 0 should return a value between 0 and 1");
  }
  if (arcGain("constant", NaN, 100) < 0 || arcGain("constant", NaN, 100) > 1) {
    errors.push("arcGain with NaN elapsed should return a value between 0 and 1");
  }
  if (arcGain("constant", -5, 100) < 0 || arcGain("constant", -5, 100) > 1) {
    errors.push("arcGain with negative elapsed should return a value between 0 and 1");
  }

  // Test isArcName
  if (isArcName("zen")) {
    errors.push("isArcName('zen') should be false");
  }
  if (!isArcName("vague")) {
    errors.push("isArcName('vague') should be true");
  }

  return errors;
}
