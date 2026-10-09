import { NextRequest, NextResponse } from "next/server";
import { createMp3Stream, getTitle } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VPS_BACKEND = "https://dj.46.202.131.240.nip.io";
const IS_VPS = process.env.STEMS_CACHE_DIR != null || process.env.YT_DLP_COOKIES != null;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const url = req.nextUrl.searchParams.get("url");
  const target = id || url;
  if (!target) return new NextResponse("missing id/url", { status: 400 });

  const dl = req.nextUrl.searchParams.get("dl") === "1";

  // 1. Try forwarding to VPS backend (if running on Vercel/external, forward to Option B VPS)
  if (!IS_VPS) {
    try {
      const vpsUrl = new URL("/api/youtube/stream", VPS_BACKEND);
    req.nextUrl.searchParams.forEach((val, key) => vpsUrl.searchParams.set(key, val));

    const vpsRes = await fetch(vpsUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Vercel-Proxy)",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(30000),
    });

      if (vpsRes.ok && vpsRes.body) {
        const headers = new Headers();
        headers.set("Content-Type", vpsRes.headers.get("Content-Type") || "audio/mpeg");
        headers.set("Cache-Control", "no-store");
        headers.set("Access-Control-Allow-Origin", "*");
        if (vpsRes.headers.get("Content-Disposition")) {
          headers.set("Content-Disposition", vpsRes.headers.get("Content-Disposition")!);
        } else if (dl) {
          headers.set("Content-Disposition", `attachment; filename="youtube-audio.mp3"`);
        }
        return new NextResponse(vpsRes.body, { headers });
      }
    } catch (err) {
      console.warn("[youtube stream proxy] VPS error, trying local:", (err as Error).message);
    }
  }

  // 2. Local fallback if yt-dlp & ffmpeg are installed on the host
  try {
    const headers: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
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
