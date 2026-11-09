import { NextRequest, NextResponse } from "next/server";
import { audioUrlFor, downloadMp3, isSpotifyId, notInstalled } from "@/lib/spotifyDl";
import { createMp3Stream } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VPS_BACKEND = "https://dj.46.202.131.240.nip.io";

// ?id=<Spotify track id>        the audio spotDL matched for that track, as an MP3 stream (for the decks)
// ?id=<Spotify track id>&dl=1   the MP3 made by spotDL, with its tags and cover, as a file to save
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!isSpotifyId(id)) return new NextResponse("missing or bad Spotify track id", { status: 400 });
  const dl = req.nextUrl.searchParams.get("dl") === "1";

  try {
    if (dl) {
      const { name, data } = await downloadMp3(id);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(data.length),
          "Content-Disposition": `attachment; filename="${name.replace(/["\\\r\n]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    const audio = await audioUrlFor(id);
    return new NextResponse(createMp3Stream(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    if (!notInstalled(e)) return new NextResponse((e as Error).message, { status: 502 });
  }

  // spotDL is not on this machine: the VPS does it
  try {
    const vps = new URL("/api/spotify/stream", VPS_BACKEND);
    req.nextUrl.searchParams.forEach((v, k) => vps.searchParams.set(k, v));
    const r = await fetch(vps, { headers: { "User-Agent": "Mozilla/5.0 (DJSynth-Proxy)", Accept: "*/*" }, signal: AbortSignal.timeout(dl ? 290_000 : 95_000) });
    if (r.ok && r.body) {
      const headers = new Headers({ "Content-Type": r.headers.get("Content-Type") || "audio/mpeg", "Cache-Control": "no-store" });
      const cd = r.headers.get("Content-Disposition");
      if (cd) headers.set("Content-Disposition", cd);
      return new NextResponse(r.body, { headers });
    }
  } catch {
    // the VPS did not answer either
  }
  return new NextResponse("spotDL n'est pas installé ici et le serveur ne répond pas (pip install spotdl)", { status: 502 });
}
