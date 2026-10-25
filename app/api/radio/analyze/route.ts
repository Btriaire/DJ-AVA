import { NextRequest, NextResponse } from "next/server";
import { analyzeYoutubeClip } from "@/lib/serverAnalyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/radio/analyze?id=<youtube id>&dur=<seconds>: tempo and key from a short excerpt of the song
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{11}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const dur = Number(req.nextUrl.searchParams.get("dur")) || 0;
  const r = await analyzeYoutubeClip(id, dur);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "analysis failed" }, { status: 502 });
}
