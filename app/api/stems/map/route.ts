import { NextRequest, NextResponse } from "next/server";
import { isCached, isModel } from "@/lib/stems";
import { backfillVocalPitch } from "@/lib/vocalPitch";
import { backfillStemNotes } from "@/lib/stemNotes";
import { analyseStems } from "@/lib/stemAnalysis";
import { analyseFx } from "@/lib/fxAnalysis";
import { backfillVoiceLayers } from "@/lib/vocalLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The map of a prepared song (peaks, slow parts, blanks): read from the cache, or made once from its stems.
// Whenever the stems exist, the notes and voice analyses are started too if they are missing (one at a time, in the background).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") ?? "";
  const m = q.get("model") ?? "htdemucs";
  if (!/^[0-9a-f]{8,64}$/.test(hash) || !isModel(m)) return NextResponse.json({ map: null }, { status: 400 });
  const opts = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  const map = await analyseStems(hash, m, opts).catch(() => null);
  if (isCached(hash, m, opts)) {
    void backfillStemNotes(hash, m, opts);
    backfillVocalPitch(hash, m, opts);
    void analyseFx(hash, m, opts).catch(() => null); // effects analyses, made once in the background
    backfillVoiceLayers(hash, m, opts); // human voice layers, once the vocal pitch exists
  }
  return NextResponse.json({ map });
}
