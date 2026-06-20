import { NextRequest, NextResponse } from "next/server";
import { createScMp3Stream } from "@/lib/soundcloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Extract a SoundCloud track's audio with yt-dlp, transcode to MP3 with ffmpeg
// and stream it same-origin. `?id=` is the SoundCloud permalink URL (or `?url=`).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const url = req.nextUrl.searchParams.get("url");
  const target = id || url;
  if (!target) return new NextResponse("missing id/url", { status: 400 });
  try {
    return new NextResponse(createScMp3Stream(target), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 502 });
  }
}
