import { NextRequest, NextResponse } from "next/server";
import { hashBytes, isModel, StemModel } from "@/lib/stems";
import { ensureMidi, isMidiCached, prefetchMidi, readMidi } from "@/lib/stemsMidi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // demucs + transcription on CPU is slow

// GET /api/stems/midi?hash=<>&model=<> → download the combined multi-track MIDI.
export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash") || "";
  const modelParam = req.nextUrl.searchParams.get("model") || "htdemucs";
  const model: StemModel = isModel(modelParam) ? modelParam : "htdemucs";
  if (!hash || !isMidiCached(hash, model)) {
    return NextResponse.json({ error: "not ready" }, { status: 404 });
  }
  const buf = await readMidi(hash, model);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/midi",
      "Content-Disposition": `attachment; filename="stems-${hash}.mid"`,
    },
  });
}

// POST the raw audio bytes. Returns { hash, model, cached }.
//   ?probe=1     → only report whether the combined MIDI is cached (no work)
//   ?prefetch=1  → kick off separation + transcription in the background, return now
//   (default)    → block until the MIDI is ready (may take minutes), then report cached
export async function POST(req: NextRequest) {
  try {
    const modelParam = req.nextUrl.searchParams.get("model") || "htdemucs";
    const model: StemModel = isModel(modelParam) ? modelParam : "htdemucs";
    const data = await req.arrayBuffer();
    if (!data.byteLength) return NextResponse.json({ error: "empty body" }, { status: 400 });

    if (req.nextUrl.searchParams.get("probe") === "1") {
      const hash = hashBytes(data);
      return NextResponse.json({ hash, model, cached: isMidiCached(hash, model) });
    }
    if (req.nextUrl.searchParams.get("prefetch") === "1") {
      const { hash, cached } = prefetchMidi(data, model);
      return NextResponse.json({ hash, model, cached, queued: !cached });
    }

    const hash = await ensureMidi(data, model);
    return NextResponse.json({ hash, model, cached: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
