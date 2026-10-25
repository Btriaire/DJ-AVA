import { NextRequest, NextResponse } from "next/server";
import { cachedLine, cleanLine, synthesizeLine } from "@/lib/voiceVps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

const wav = (b: Buffer) => new NextResponse(new Uint8Array(b), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });

// GET /api/radio/voice?text=...            makes the line (a minute or more) unless it is cached, then returns the audio
// GET /api/radio/voice?text=...&only=cache the audio if it is already made, 404 otherwise: used while playing, never waits
export async function GET(req: NextRequest) {
  const text = cleanLine(req.nextUrl.searchParams.get("text") ?? "");
  if (text.length < 2) return NextResponse.json({ error: "no text" }, { status: 400 });
  const hit = cachedLine(text);
  if (hit) return wav(hit);
  if (req.nextUrl.searchParams.get("only") === "cache") return new NextResponse(null, { status: 404 });
  try {
    return wav(await synthesizeLine(text));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
