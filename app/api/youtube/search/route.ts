import { NextRequest, NextResponse } from "next/server";
import { searchYouTube } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intParam = (req: NextRequest, key: string): number | undefined => {
  const v = parseInt(req.nextUrl.searchParams.get(key) ?? "", 10);
  return Number.isFinite(v) ? v : undefined;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await searchYouTube(q, {
      limit: intParam(req, "n"), // bigger pool on demand
      minDur: intParam(req, "min"), // duration filter (seconds)
      maxDur: intParam(req, "max"),
    });
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
