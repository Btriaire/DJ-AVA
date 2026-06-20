import { NextResponse } from "next/server";
import { listCachedHashes } from "@/lib/stems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight: returns every content hash that already has cached stems, so the
// library can badge tracks whose stems exist (no audio is re-read or hashed).
export async function GET() {
  try {
    return NextResponse.json({ hashes: listCachedHashes() });
  } catch (e) {
    return NextResponse.json({ hashes: [], error: (e as Error).message }, { status: 500 });
  }
}
