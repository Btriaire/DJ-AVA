// CC0 crowd recordings from BigSoundBank (the virtual audience): downloaded once, then served from the disk cache
import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const runtime = "nodejs";
const CROWD_IDS = ["3515","3516","0642","0825","0019","0020","0021","2480","2481","2483","2484","2485","2487","0236","0237"];
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !CROWD_IDS.includes(id)) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const remote = `https://bigsoundbank.com/UPLOAD/ogg/${id}.ogg`;
    const dir = join(process.env.SAMPLES_CACHE_DIR || join(process.cwd(), ".samples-cache"), "crowd");
    const file = join(dir, `${id}.ogg`);
    if (existsSync(file)) { return new NextResponse(readFileSync(file), { headers: { "Content-Type": "audio/ogg", "Cache-Control": "public, max-age=31536000, immutable" } }); }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(remote, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!res.ok) return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 12_000_000 || bytes.byteLength < 20) return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    mkdirSync(dir, { recursive: true }); const tmpFile = `${file}.${process.pid}.tmp`; writeFileSync(tmpFile, Buffer.from(bytes)); renameSync(tmpFile, file);
    return new NextResponse(bytes, { headers: { "Content-Type": "audio/ogg", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "internal error" }, { status: 500 }); }
}
