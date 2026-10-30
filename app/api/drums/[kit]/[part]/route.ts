// One drum sound of a real drum machine: downloaded once from the public collection, then served from the disk cache (MaRuche/Falken)
import { NextRequest, NextResponse } from "next/server";
import { drumKit, drumUrl, isDrumPart } from "@/lib/drumKits";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ kit: string; part: string }> }) {
  try {
    const { kit, part } = await params;
    const name = part.replace(/\.ogg$/, "");

    // Validate request
    const def = drumKit(kit);
    if (!def || !isDrumPart(name)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const url = drumUrl(def, name);
    if (!url) return NextResponse.json({ error: "this kit has no such sound" }, { status: 404 });

    // Cache setup
    const cacheRoot = process.env.SAMPLES_CACHE_DIR || join(process.cwd(), ".samples-cache");
    const dir = join(cacheRoot, "drums", kit);
    const file = join(dir, `${name}.ogg`);

    // Return cached file if exists
    if (existsSync(file)) {
      const bytes = readFileSync(file);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "audio/ogg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Fetch and cache new file
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 600000 || bytes.byteLength < 300) {
      return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    }

    mkdirSync(dir, { recursive: true });
    const tmpFile = `${file}.${process.pid}.tmp`;
    writeFileSync(tmpFile, Buffer.from(bytes));
    renameSync(tmpFile, file);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "audio/ogg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "internal error" }, { status: 500 });
  }
}
