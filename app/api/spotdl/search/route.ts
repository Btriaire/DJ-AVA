import { NextRequest, NextResponse } from "next/server";
import { searchSpotdl, warmSpotdl } from "@/lib/spotdl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("warm") === "1") {
    warmSpotdl();
    return NextResponse.json({ ok: true });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });
  const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
  try {
    const tracks = await searchSpotdl(q, page);
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
