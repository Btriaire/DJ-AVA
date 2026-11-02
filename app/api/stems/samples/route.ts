import { NextRequest, NextResponse } from "next/server";
import { isModel } from "@/lib/stems";
import { makeDeepSamples, makeStemSamples, readDeepSamples } from "@/lib/stemSamples";

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

  // Stems Pad (Préparation): the in-depth analysis, asked once per song; afterwards it is served first
  if (q.get("deep") === "1") {
    if (!hash || !/^[0-9a-f]{8,64}$/.test(hash) || !isModel(model)) return NextResponse.json({ samples: null }, { status: 400 });
    const deep = await makeDeepSamples(hash, model, opts, isFinite(bpm) && bpm >= 40 && bpm <= 250 ? bpm : undefined);
    return NextResponse.json({ samples: deep, deep: !!deep });
  }
  if (hash && /^[0-9a-f]{8,64}$/.test(hash) && isModel(model)) {
    const deep = readDeepSamples(hash, model, opts);
    if (deep) return NextResponse.json({ samples: deep, deep: true });
  }
  if (!hash || !hash.match(/^[0-9a-f]{8,64}$/) || !isModel(model) || !isFinite(bpm) || bpm < 40 || bpm > 250 || !isFinite(offset) || offset < 0 || offset > 30) {
    return NextResponse.json({ samples: null }, { status: 400 });
  }

  const roundedBpm = Math.round(bpm * 10) / 10;
  const roundedOffset = Math.round(offset * 100) / 100;
  const samples = await makeStemSamples(hash, model, opts, roundedBpm, roundedOffset);

  return NextResponse.json({ samples, deep: false });
}

// which songs already have their in-depth Stems Pad samples: POST ?status=1&model&(ultra, wav, denoise) { hashes }
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const model = q.get("model") ?? "htdemucs";
  if (q.get("status") !== "1" || !isModel(model)) return NextResponse.json({ ready: [] }, { status: 400 });
  const opts = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  const body = (await request.json().catch(() => ({}))) as { hashes?: unknown };
  const hashes = Array.isArray(body.hashes) ? body.hashes.filter((h): h is string => typeof h === "string" && /^[0-9a-f]{8,64}$/.test(h)).slice(0, 2000) : [];
  return NextResponse.json({ ready: hashes.filter((h) => readDeepSamples(h, model, opts)) });
}
