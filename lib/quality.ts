export type QualityLevel = "HR" | "HQ" | "STD" | "LQ";

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  HR: "HiRes",
  HQ: "HQ",
  STD: "Standard",
  LQ: "Basse"
};

export const QUALITY_HINT: Record<QualityLevel, string> = {
  HR: "256 kbps et plus",
  HQ: "160 à 255 kbps",
  STD: "96 à 159 kbps",
  LQ: "moins de 96 kbps"
};

// Higher number = better. "HQ" as a filter means HQ or better.
export const QUALITY_RANK: Record<QualityLevel, number> = { LQ: 0, STD: 1, HQ: 2, HR: 3 };

export function qualityFromKbps(kbps: number | null | undefined): QualityLevel | undefined {
  if (kbps == null || kbps <= 0) return undefined;
  if (kbps >= 256) return "HR";
  if (kbps >= 160) return "HQ";
  if (kbps >= 96) return "STD";
  return "LQ";
}

export function kbpsFromSize(bytes: number, durationSec: number): number | undefined {
  if (bytes <= 0 || durationSec <= 0) return undefined;
  return Math.round((bytes * 8) / (durationSec * 1000));
}
