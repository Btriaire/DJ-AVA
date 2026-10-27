import { NextRequest, NextResponse } from "next/server";
import { isModel } from "@/lib/stems";
import { backfillVocalPitch } from "@/lib/vocalPitch";
import { analyseStems } from "@/lib/stemAnalysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The map of a prepared song (peaks, slow parts, blanks): read from the cache, or made once from its stems.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") ?? "";
  const m = q.get("model") ?? "htdemucs";
  if (!/^[0-9a-f]{8,64}$/.test(hash) || !isModel(m)) return NextResponse.json({ map: null }, { status: 400 });
  const map = await analyseStems(hash, m, { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" }).catch(() => null);
  if (map) backfillVocalPitch(hash, m, { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" });
  return NextResponse.json({ map });
}
