import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PY = join(process.cwd(), ".venv-spotdl", "bin", "python");
const SCRIPT = join(process.cwd(), "scripts", "spotdl_lyrics.py");

type Lyrics = { lrc: string | null; synced: boolean };

const cache = new Map<string, Lyrics>();
const inflight = new Map<string, Promise<Lyrics>>();

function run(q: string): Promise<Lyrics> {
  return new Promise((resolve, reject) => {
    const child = spawn(PY, [SCRIPT, q], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      stdout += data;
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("paroles : delai depasse"));
    }, 25000);

    child.on("close", () => {
      clearTimeout(timeout);
      const lines = stdout.trim().split("\n");
      const lastLine = lines[lines.length - 1];
      try {
        const o = JSON.parse(lastLine);
        resolve({
          lrc: typeof o.lrc === "string" ? o.lrc : null,
          synced: o.synced === true
        });
      } catch {
        reject(new Error("paroles : reponse illisible"));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) {
    return NextResponse.json({ lrc: null, synced: false });
  }

  if (!existsSync(PY)) {
    return NextResponse.json({ error: "spotDL n'est pas installe", lrc: null, synced: false }, { status: 503 });
  }

  const key = q.toLowerCase().replace(/\s+/g, " ");
  if (cache.has(key)) {
    return NextResponse.json(cache.get(key));
  }

  let p = inflight.get(key);
  if (!p) {
    p = run(q).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }

  try {
    const r = await p;
    cache.set(key, r);
    if (cache.size > 300) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, lrc: null, synced: false }, { status: 502 });
  }
}
