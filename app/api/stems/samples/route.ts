import { NextRequest, NextResponse } from "next/server";
import { isModel } from "@/lib/stems";
import { makeStemSamples } from "@/lib/stemSamples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const hash = q.get("hash");
  const model = q.get("model") ?? "htdemucs";
  const bpm = parseFloat(q.get("bpm") || "");
  const offset = parseFloat(q.get("offset") || "");
  const opts = {
    ultra: q.get("ultra") === "1",
    lossless: q.get("wav") === "1",
    denoiseVocals: q.get("denoise") === "1"
  };

  if (!hash || !hash.match(/^[0-9a-f]{8,64}$/) || !isModel(model) || !isFinite(bpm) || bpm < 40 || bpm > 250 || !isFinite(offset) || offset < 0 || offset > 30) {
    return NextResponse.json({ samples: null }, { status: 400 });
  }

  const roundedBpm = Math.round(bpm * 10) / 10;
  const roundedOffset = Math.round(offset * 100) / 100;
  const samples = await makeStemSamples(hash, model, opts, roundedBpm, roundedOffset);

  return NextResponse.json({ samples });
}
