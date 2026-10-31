import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { isModel } from "@/lib/stems";
import { VOICE_LAYERS, backfillVoiceLayers, layerPath, layersReady, type VoiceLayer } from "@/lib/vocalLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?hash&model -> { layers: [...] } (starts the render in the background when missing); &name=third_up -> the OGG file
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") ?? "";
  const m = q.get("model") ?? "htdemucs";
  if (!/^[0-9a-f]{8,64}$/.test(hash) || !isModel(m)) return NextResponse.json({ layers: [] }, { status: 400 });
  const opts = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  const name = q.get("name");
  if (name) {
    if (!VOICE_LAYERS.includes(name as VoiceLayer) || !layersReady(hash, m, opts).includes(name as VoiceLayer)) return new NextResponse(null, { status: 404 });
    const buf = await readFile(layerPath(hash, m, name as VoiceLayer, opts));
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "audio/ogg", "cache-control": "private, max-age=86400" } });
  }
  const layers = layersReady(hash, m, opts);
  if (!layers.length) backfillVoiceLayers(hash, m, opts);
  return NextResponse.json({ layers });
}
