export type QualityLevel = "HQ" | "STD" | "LQ";

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  HQ: "HQ",
  STD: "Standard",
  LQ: "Basse"
};

export const QUALITY_HINT: Record<QualityLevel, string> = {
  HQ: "160 kbps et plus",
  STD: "96 à 159 kbps",
  LQ: "moins de 96 kbps"
};

export function qualityFromKbps(kbps: number | null | undefined): QualityLevel | undefined {
  if (kbps == null || kbps <= 0) return undefined;
  if (kbps >= 160) return "HQ";
  if (kbps >= 96) return "STD";
  return "LQ";
}

export function kbpsFromSize(bytes: number, durationSec: number): number | undefined {
  if (bytes <= 0 || durationSec <= 0) return undefined;
  return Math.round((bytes * 8) / (durationSec * 1000));
}
