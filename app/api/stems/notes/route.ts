import { NextRequest, NextResponse } from "next/server";
import { isModel } from "@/lib/stems";
import { analyseStemNotes, readStemNotes, upgradeStemNotes } from "@/lib/stemNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The MIDI notes (synth, bass, drum attacks) of a prepared song: read from the cache, or made once from its stems.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") ?? "";
  const m = q.get("model") ?? "htdemucs";
  if (!/^[0-9a-f]{8,64}$/.test(hash) || !isModel(m)) return NextResponse.json({ notes: null }, { status: 400 });
  const o = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  // read=1: the cache only (what a deck does when it loads); otherwise it is made once, here
  if (q.get("read") === "1") upgradeStemNotes(hash, m, o);
  const map = q.get("read") === "1" ? readStemNotes(hash, m, o) : await analyseStemNotes(hash, m, o).catch(() => null);
  return NextResponse.json({ notes: map });
}
