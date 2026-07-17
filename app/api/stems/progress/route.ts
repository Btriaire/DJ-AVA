import { NextRequest, NextResponse } from "next/server";
import { getProgress, isModel, StemModel, StemOpts } from "@/lib/stems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight polling endpoint: how far along (0..100) is the separation
// currently running for this hash/model/quality combo, or null if nothing is
// running (finished, failed, or never started — the caller falls back to
// isCached()/the stems-list endpoint to tell those apart).
// GET /api/stems/progress?hash=<hash>&model=<model>[&ultra=1][&wav=1][&denoise=1]
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") || "";
  if (!/^[a-f0-9]{8,32}$/.test(hash)) {
    return NextResponse.json({ progress: null }, { status: 400 });
  }
  const modelParam = q.get("model") || "htdemucs";
  const model: StemModel = isModel(modelParam) ? modelParam : "htdemucs";
  const opts: StemOpts = {
    ultra: q.get("ultra") === "1",
    lossless: q.get("wav") === "1",
    denoiseVocals: q.get("denoise") === "1",
  };
  return NextResponse.json({ progress: getProgress(hash, model, opts) });
}
