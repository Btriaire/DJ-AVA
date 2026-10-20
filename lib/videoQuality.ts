export type VideoLevel = "4K" | "FHD" | "HD" | "SD";

export const VIDEO_LABEL: Record<VideoLevel, string> = {
  "4K": "4K",
  FHD: "Full HD",
  HD: "HD",
  SD: "SD"
};

export const VIDEO_RANK: Record<VideoLevel, number> = {
  SD: 0,
  HD: 1,
  FHD: 2,
  "4K": 3
};

export function videoLevelFromHeight(h: number | null | undefined): VideoLevel | undefined {
  if (h == null || h <= 0) return undefined;

  if (h >= 2160) return "4K";
  if (h >= 1080) return "FHD";
  if (h >= 720) return "HD";
  return "SD";
}

export function heightHintFromTitle(title: string): number | undefined {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("4k") || lowerTitle.includes("2160p") || lowerTitle.includes("uhd")) {
    return 2160;
  }

  if (lowerTitle.includes("1440p") || lowerTitle.includes("2k")) {
    return 1440;
  }

  if (lowerTitle.includes("1080p") || lowerTitle.includes("fhd") || lowerTitle.includes("full hd") || lowerTitle.includes("fullhd")) {
    return 1080;
  }

  if (/\bhd\b/.test(lowerTitle)) {
    return 720;
  }

  return undefined;
}

export function effectiveVideoLevel(height: number | undefined, title: string): { level: VideoLevel; fromTitle: boolean } | undefined {
  if (height != null && height > 0) {
    const level = videoLevelFromHeight(height);
    if (level) return { level, fromTitle: false };
  }

  const hint = heightHintFromTitle(title);
  if (hint != null) {
    const level = videoLevelFromHeight(hint);
    if (level) return { level, fromTitle: true };
  }

  return undefined;
}
