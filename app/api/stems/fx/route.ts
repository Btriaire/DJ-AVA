import { NextRequest, NextResponse } from "next/server";
import { isModel } from "@/lib/stems";
import { analyseFx, readFx } from "@/lib/fxAnalysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The effects analyses of a prepared song (spectra, loudness, sung phrase ends): read from the cache, or made once from its stems.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") ?? "";
  const m = q.get("model") ?? "htdemucs";
  if (!/^[0-9a-f]{8,64}$/.test(hash) || !isModel(m)) return NextResponse.json({ fx: null }, { status: 400 });
  const opts = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  const fx = q.get("read") === "1" ? readFx(hash, m, opts) : await analyseFx(hash, m, opts).catch(() => null);
  return NextResponse.json({ fx });
}
