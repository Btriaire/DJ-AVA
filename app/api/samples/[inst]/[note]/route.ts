// One note of a real instrument: downloaded once from the public soundfont, then served from the disk cache (MaRuche/Falken)
import { NextRequest, NextResponse } from "next/server";
import { instrument, sampleUrl } from "@/lib/sampleFont";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ inst: string; note: string }> }) {
  try {
    const { inst, note } = await params;
    const name = note.replace(/\.mp3$/, "");

    // Validate request
    const def = instrument(inst);
    if (!def || !/^[A-G]b?[0-8]$/.test(name)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    // Cache setup
    const dir = join(process.env.SAMPLES_CACHE_DIR || join(process.cwd(), ".samples-cache"), inst);
    const file = join(dir, `${name}.mp3`);

    // Return cached file if exists
    if (existsSync(file)) {
      const bytes = readFileSync(file);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Fetch and cache new file
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(sampleUrl(def, name), {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 600000 || bytes.byteLength < 1000) {
      return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    }

    mkdirSync(dir, { recursive: true });
    const tmpFile = `${file}.${process.pid}.tmp`;
    writeFileSync(tmpFile, Buffer.from(bytes));
    renameSync(tmpFile, file);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "internal error" }, { status: 500 });
  }
}
