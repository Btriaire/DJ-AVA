import { NextRequest, NextResponse } from "next/server";
import { isModel } from "@/lib/stems";
import { analyseVoice, readVoicePrep } from "@/lib/voicePrepStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hash = q.get("hash") ?? "";
  const m = q.get("model") ?? "htdemucs";
  if (!/^[0-9a-f]{8,64}$/.test(hash) || !isModel(m)) return NextResponse.json({ voice: null }, { status: 400 });
  const opts = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  const voice = q.get("read") === "1" ? readVoicePrep(hash, m, opts) : await analyseVoice(hash, m, opts).catch(() => null);
  return NextResponse.json({ voice });
}

export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const model = q.get("model") ?? "htdemucs";
  if (q.get("status") !== "1" || !isModel(model)) return NextResponse.json({ ready: [] }, { status: 400 });
  const opts = { ultra: q.get("ultra") === "1", lossless: q.get("wav") === "1", denoiseVocals: q.get("denoise") === "1" };
  const body = (await request.json().catch(() => ({}))) as { hashes?: unknown };
  const hashes = Array.isArray(body.hashes) ? body.hashes.filter((h): h is string => typeof h === "string" && /^[0-9a-f]{8,64}$/.test(h)).slice(0, 2000) : [];
  return NextResponse.json({ ready: hashes.filter((h) => readVoicePrep(h, model, opts) !== null) });
}
