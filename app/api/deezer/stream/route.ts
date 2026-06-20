import { NextRequest, NextResponse } from "next/server";
import { deezerPreviewUrl } from "@/lib/deezer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deezer full tracks are DRM-locked; only the official 30s preview is available.
// Resolve the numeric track id to its preview MP3 URL and proxy it same-origin.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse("missing id", { status: 400 });
  try {
    const preview = await deezerPreviewUrl(id);
    if (!preview) return new NextResponse("aperçu indisponible", { status: 404 });
    const r = await fetch(preview, { redirect: "follow", cache: "no-store" });
    if (!r.ok || !r.body) return new NextResponse("stream error", { status: 502 });
    return new NextResponse(r.body, {
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 502 });
  }
}
