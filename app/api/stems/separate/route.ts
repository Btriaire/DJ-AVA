import { NextRequest, NextResponse } from "next/server";
import { hashBytes, isCached, isModel, MODEL_STEMS, prefetch, separate, StemModel } from "@/lib/stems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // Demucs on CPU is slow (minutes per track)

// POST the raw audio bytes of a track. Returns { hash, cached, model, stems }
// once the stems are available under /api/stems/<hash>/<stem>?model=<model>.
// Query: `model` (htdemucs | htdemucs_ft | htdemucs_6s), `shifts` (precision),
// `probe=1` to only check the cache without launching a (long) separation,
// `prefetch=1` to schedule a low-priority background separation and return
// immediately (the caller polls `probe=1` to learn when it's ready).
export async function POST(req: NextRequest) {
  try {
    const modelParam = req.nextUrl.searchParams.get("model") || "htdemucs";
    const model: StemModel = isModel(modelParam) ? modelParam : "htdemucs";
    const shifts = parseInt(req.nextUrl.searchParams.get("shifts") || "0", 10) || 0;
    const stems = MODEL_STEMS[model];

    const data = await req.arrayBuffer();
    if (!data.byteLength) return NextResponse.json({ error: "empty body" }, { status: 400 });

    if (req.nextUrl.searchParams.get("probe") === "1") {
      const hash = hashBytes(data);
      return NextResponse.json({ hash, model, stems, cached: isCached(hash, model) });
    }

    // Non-blocking: queue a niced background job and return at once. The deck
    // polls `probe=1` to flip its badge once the cache is populated.
    if (req.nextUrl.searchParams.get("prefetch") === "1") {
      const { hash, cached } = prefetch(data, model, shifts);
      return NextResponse.json({ hash, model, stems, cached, queued: !cached });
    }

    const hash = await separate(data, model, shifts);
    return NextResponse.json({ hash, model, stems, cached: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
