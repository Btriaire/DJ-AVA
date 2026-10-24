import { NextRequest, NextResponse } from "next/server";
import { getFailure, getProgress, isCached, isModel, MODEL_STEMS, StemModel, StemOpts } from "@/lib/stems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const hash = searchParams.get("hash");
    const model = (searchParams.get("model") ?? "htdemucs") as StemModel;
    const ultra = searchParams.get("ultra") === "1";
    const wav = searchParams.get("wav") === "1";
    const denoise = searchParams.get("denoise") === "1";

    if (!hash || !/^[a-f0-9]{8,32}$/.test(hash)) {
      return NextResponse.json({ error: "bad hash" }, { status: 400 });
    }

    if (!isModel(model)) {
      return NextResponse.json({ error: "bad model" }, { status: 400 });
    }

    const opts: StemOpts = { ultra, lossless: wav, denoiseVocals: denoise };
    return NextResponse.json({
      cached: isCached(hash, model, opts),
      stems: MODEL_STEMS[model], // names to fetch under /api/stems/<hash>/<stem> once cached
      progress: getProgress(hash, model, opts),
      error: getFailure(hash, model, opts),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    );
  }
}
