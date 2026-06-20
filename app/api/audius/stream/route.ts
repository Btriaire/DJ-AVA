import { NextRequest, NextResponse } from "next/server";
import { getDiscoveryHost, appName } from "@/lib/audius";

// Proxies the Audius track stream so the browser fetches audio same-origin.
// This is what lets us decode the PCM and apply live FX / synth to it.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse("missing id", { status: 400 });
  try {
    const host = await getDiscoveryHost();
    const url = `${host}/v1/tracks/${id}/stream?app_name=${appName()}`;
    const r = await fetch(url, { redirect: "follow", cache: "no-store" });
    if (!r.ok || !r.body) return new NextResponse("stream error", { status: 502 });
    return new NextResponse(r.body, {
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 502 });
  }
}
