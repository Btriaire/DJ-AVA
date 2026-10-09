import { NextRequest, NextResponse } from "next/server";
import { searchYouTube } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VPS_BACKEND = "https://dj.46.202.131.240.nip.io";
const IS_VPS = process.env.STEMS_CACHE_DIR != null || process.env.YT_DLP_COOKIES != null;

const intParam = (req: NextRequest, key: string): number | undefined => {
  const v = parseInt(req.nextUrl.searchParams.get(key) ?? "", 10);
  return Number.isFinite(v) ? v : undefined;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });

  // 1. Try forwarding to VPS backend (Option B: equipped with yt-dlp & cookies)
  if (!IS_VPS) {
    try {
      const vpsUrl = new URL("/api/youtube/search", VPS_BACKEND);
      req.nextUrl.searchParams.forEach((val, key) => vpsUrl.searchParams.set(key, val));

      const vpsRes = await fetch(vpsUrl.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (Vercel-Proxy)" },
        signal: AbortSignal.timeout(10000),
      });

      if (vpsRes.ok) {
        const data = await vpsRes.json();
        if (data && data.tracks && data.tracks.length > 0) {
          return NextResponse.json(data);
        }
      }
    } catch (err) {
      console.warn("[youtube search proxy] VPS error, trying local:", (err as Error).message);
    }
  }

  // 2. Local fallback if running on local dev machine with yt-dlp
  try {
    const tracks = await searchYouTube(q, {
      limit: intParam(req, "n"),
      minDur: intParam(req, "min"),
      maxDur: intParam(req, "max"),
    });
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
