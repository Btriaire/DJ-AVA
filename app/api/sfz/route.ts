// One file of a multisampled instrument bank (danigb/samples): downloaded once, then served from the disk cache
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get("p");
    if (typeof p !== "string" || p.length < 1 || p.length > 400 || p.includes("..") || p.startsWith("/") || p.includes("\\") || p.includes("://") || !p.endsWith(".json") && !p.endsWith(".ogg")) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const BASE = "https://danigb.github.io/samples/";
    const remote = BASE + p.split("/").map(encodeURIComponent).join("/");

    const dir = join(process.env.SAMPLES_CACHE_DIR || join(process.cwd(), ".samples-cache"), "sfz");
    const file = join(dir, createHash("sha1").update(p).digest("hex") + (p.endsWith(".json") ? ".json" : ".ogg"));

    if (existsSync(file)) {
      const bytes = readFileSync(file);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": p.endsWith(".json") ? "application/json" : "audio/ogg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(remote, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 12_000_000 || bytes.byteLength < 20) {
      return NextResponse.json({ error: "sample unavailable" }, { status: 502 });
    }

    mkdirSync(dir, { recursive: true });
    const tmpFile = `${file}.${process.pid}.tmp`;
    writeFileSync(tmpFile, Buffer.from(bytes));
    renameSync(tmpFile, file);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": p.endsWith(".json") ? "application/json" : "audio/ogg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "internal error" }, { status: 500 });
  }
}
