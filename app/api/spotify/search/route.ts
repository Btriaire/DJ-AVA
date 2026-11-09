import { NextRequest, NextResponse } from "next/server";
import { notInstalled, searchSpotify } from "@/lib/spotifyDl";
import { PAGE } from "@/lib/searchMore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VPS_BACKEND = "https://dj.46.202.131.240.nip.io";

// Spotify's catalogue through spotDL: on this machine when spotDL is installed, else on the VPS
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    return NextResponse.json({ tracks: await searchSpotify(q, PAGE) });
  } catch (e) {
    if (!notInstalled(e)) return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
  try {
    const vps = new URL("/api/spotify/search", VPS_BACKEND);
    vps.searchParams.set("q", q);
    const r = await fetch(vps, { headers: { "User-Agent": "Mozilla/5.0 (DJSynth-Proxy)" }, signal: AbortSignal.timeout(35_000) });
    if (r.ok) return NextResponse.json(await r.json());
  } catch {
    // the VPS did not answer either
  }
  return NextResponse.json({ error: "spotDL n'est pas installé ici et le serveur ne répond pas (pip install spotdl)", tracks: [] }, { status: 502 });
}
