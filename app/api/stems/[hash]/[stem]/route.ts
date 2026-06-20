import { NextRequest, NextResponse } from "next/server";
import { isCached, isModel, MODEL_STEMS, readStem, StemModel } from "@/lib/stems";

export const runtime = "nodejs";

// Serve one cached stem as MP3. The stems for a track live at
// /api/stems/<hash>/<stem>?model=<model>.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hash: string; stem: string }> }
) {
  const { hash, stem } = await params;
  const name = stem.replace(/\.mp3$/, "");
  const modelParam = req.nextUrl.searchParams.get("model") || "htdemucs";
  const model: StemModel = isModel(modelParam) ? modelParam : "htdemucs";
  if (!MODEL_STEMS[model].includes(name) || !/^[a-f0-9]{8,32}$/.test(hash)) {
    return new NextResponse("bad request", { status: 400 });
  }
  if (!isCached(hash, model)) return new NextResponse("not separated", { status: 404 });
  try {
    const buf = await readStem(hash, model, name);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 500 });
  }
}
