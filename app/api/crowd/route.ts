// CC0 crowd recordings from BigSoundBank and Freesound (the virtual audience): downloaded once, then served from the disk cache
import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const runtime = "nodejs";
const CROWD_IDS = ["3515","3516","0642","0825","0019","0020","0021","2480","2481","2483","2484","2485","2487","0236","0237"];
// Freesound previews, every one checked CC0 (public domain): cheers, woos, whistles, arena roars, a build-up
const FREESOUND: Record<string, string> = {
  fs182571: "https://cdn.freesound.org/previews/182/182571_71257-hq.mp3",
  fs182572: "https://cdn.freesound.org/previews/182/182572_71257-hq.mp3",
  fs397434: "https://cdn.freesound.org/previews/397/397434_4019029-hq.mp3",
  fs397435: "https://cdn.freesound.org/previews/397/397435_4019029-hq.mp3",
  fs365132: "https://cdn.freesound.org/previews/365/365132_3279490-hq.mp3",
  fs645337: "https://cdn.freesound.org/previews/645/645337_10678144-hq.mp3",
  fs730908: "https://cdn.freesound.org/previews/730/730908_15857333-hq.mp3",
  fs242861: "https://cdn.freesound.org/previews/242/242861_2979316-hq.mp3",
  fs455659: "https://cdn.freesound.org/previews/455/455659_612689-hq.mp3",
  fs187673: "https://cdn.freesound.org/previews/187/187673_2140699-hq.mp3",
  fs480725: "https://cdn.freesound.org/previews/480/480725_2524442-hq.mp3",
  fs333421: "https://cdn.freesound.org/previews/333/333421_5884138-hq.mp3",
  fs84525: "https://cdn.freesound.org/previews/84/84525_519220-hq.mp3",
  fs629884: "https://cdn.freesound.org/previews/629/629884_612689-hq.mp3",
  fs455660: "https://cdn.freesound.org/previews/455/455660_612689-hq.mp3",
  fs160493: "https://cdn.freesound.org/previews/160/160493_341440-hq.mp3",
  fs348978: "https://cdn.freesound.org/previews/348/348978_2247456-hq.mp3",
  fs353185: "https://cdn.freesound.org/previews/353/353185_6512973-hq.mp3",
  fs852097: "https://cdn.freesound.org/previews/852/852097_14269391-hq.mp3",
};
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || (!CROWD_IDS.includes(id) && !Object.hasOwn(FREESOUND, id))) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const fs = Object.hasOwn(FREESOUND, id);
    const remote = fs ? FREESOUND[id] : `https://bigsoundbank.com/UPLOAD/ogg/${id}.ogg`;
    const type = fs ? "audio/mpeg" : "audio/ogg";
    const dir = join(process.env.SAMPLES_CACHE_DIR || join(process.cwd(), ".samples-cache"), "crowd");
    const file = join(dir, `${id}.${fs ? "mp3" : "ogg"}`);
    if (existsSync(file)) { return new NextResponse(readFileSync(file), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } }); }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(remote, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!res.ok) return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 12_000_000 || bytes.byteLength < 20) return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    mkdirSync(dir, { recursive: true }); const tmpFile = `${file}.${process.pid}.tmp`; writeFileSync(tmpFile, Buffer.from(bytes)); renameSync(tmpFile, file);
    return new NextResponse(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "internal error" }, { status: 500 }); }
}
