import { NextRequest, NextResponse } from "next/server";
import { getDiscoveryHost, appName, normalizeTrack } from "@/lib/audius";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    const host = await getDiscoveryHost();
    const url = `${host}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${appName()}&limit=60`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Audius ${r.status}`);
    const j = (await r.json()) as { data?: unknown[] };
    const tracks = (j.data ?? [])
      .map((t) => normalizeTrack(t as never))
      .filter((t) => t.title);
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
