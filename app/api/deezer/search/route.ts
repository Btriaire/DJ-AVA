import { NextRequest, NextResponse } from "next/server";
import { searchDeezer } from "@/lib/deezer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await searchDeezer(q);
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
