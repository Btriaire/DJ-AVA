import { NextRequest, NextResponse } from "next/server";
import { createMp3Stream, getTitle } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Extract a YouTube video's audio with yt-dlp, transcode to MP3 with ffmpeg and
// stream it same-origin. `?id=` or `?url=`. Add `&dl=1` to force a file
// download (Content-Disposition) instead of inline playback.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const url = req.nextUrl.searchParams.get("url");
  const target = id || url;
  if (!target) return new NextResponse("missing id/url", { status: 400 });

  const dl = req.nextUrl.searchParams.get("dl") === "1";
  try {
    const headers: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    };
    if (dl) {
      const title = await getTitle(target);
      const safe = title.replace(/[^\w\sÀ-ÿ.\-]/g, "").trim().slice(0, 80) || "youtube-audio";
      headers["Content-Disposition"] = `attachment; filename="${safe}.mp3"`;
    }
    return new NextResponse(createMp3Stream(target), { headers });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 502 });
  }
}
