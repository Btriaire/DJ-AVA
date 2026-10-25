import { NextRequest, NextResponse } from "next/server";
import { isVideoId, warmAudio } from "@/lib/audioCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// GET /api/radio/warm?id=<youtube id>: downloads the song into the disk cache (answers when it is there)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!isVideoId(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const ok = await warmAudio(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
}
