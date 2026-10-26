import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { buildGroups, isLocalRequest, parsePs, pidsToClose, type RamGroup } from "@/lib/ramOptimizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);

// This route closes programs: only on the Mac that runs DJSynth, only from the app itself (see isLocalRequest), never on
// the VPS. The list is recomputed here at every call, nothing the browser sends is trusted but the ids it picked.
const allowed = (req: NextRequest) =>
  process.platform === "darwin" &&
  process.env.STEMS_CACHE_DIR == null &&
  isLocalRequest(req.headers.get("host"), req.headers.get("origin"), req.headers.get("x-djsynth-ram"));

async function snapshot(): Promise<RamGroup[]> {
  const { stdout } = await run("ps", ["-axo", "pid=,ppid=,uid=,rss=,command="], { maxBuffer: 16 * 1024 * 1024 });
  return buildGroups(parsePs(stdout), { uid: process.getuid?.() ?? -1, selfPid: process.pid, home: homedir() });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ error: "Réservé à l'application DJSynth sur ce Mac." }, { status: 403 });
  return NextResponse.json({ groups: await snapshot() });
}

// body: { ids: string[], mode: "quit" | "force" }
//   quit  = ask the applications to quit (they offer to save), terminate the tools politely
//   force = kill what is still there afterwards
export async function POST(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ error: "Réservé à l'application DJSynth sur ce Mac." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; mode?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  const mode = body.mode === "force" ? "force" : "quit";
  if (!ids.length) return NextResponse.json({ error: "Rien n'est choisi." }, { status: 400 });

  const before = await snapshot();
  const target = pidsToClose(before, ids);
  if (!target.pids.length) return NextResponse.json({ closed: [], left: [], freedMB: 0, groups: before });

  if (mode === "quit") {
    // applications: asked to quit (they may ask to save); tools: terminated politely
    await Promise.all(
      target.apps.map((name) =>
        run("osascript", ["-e", `tell application "${name.replace(/["\\]/g, "")}" to quit`], { timeout: 8000 }).catch(() => undefined)
      )
    );
    const appPids = new Set(before.filter((g) => g.kind === "app" && ids.includes(g.id)).flatMap((g) => g.pids));
    for (const pid of target.pids) {
      if (!appPids.has(pid)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
  } else {
    // what is still running among the programs chosen: killed. Locked ones were already left out by pidsToClose.
    for (const pid of target.pids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }

  await sleep(mode === "force" ? 800 : 4000); // the applications need a moment to quit (or to ask about unsaved work)
  const after = await snapshot();
  const stillIds = new Set(after.map((g) => g.id));
  const closed = before.filter((g) => ids.includes(g.id) && !g.locked && !stillIds.has(g.id)).map((g) => g.name);
  const left = after.filter((g) => ids.includes(g.id) && !g.locked).map((g) => g.name);
  const freedMB = Math.max(0, before.reduce((s, g) => s + g.rssMB, 0) - after.reduce((s, g) => s + g.rssMB, 0));
  return NextResponse.json({ closed, left, freedMB, groups: after });
}
