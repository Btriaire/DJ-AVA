// "Optimisation de RAM avancée": the programs of the user that DJSynth does not need, so that they can be closed and the
// whole Mac is left to the app. Pure functions (no process is touched here): the API route lists, checks and closes.
//
// What is ever listed: the user's own applications (.app outside the system folders) and their development tools
// (Homebrew, /usr/local, the home folder, external volumes). Never the system, never another user's processes.
// What is never closable, even when asked: DJSynth and everything it started (its server, stems, downloads), the
// processes that started it, the Finder / Dock / menu bar, and the Claude session that may be running this very work.

export interface Proc {
  pid: number;
  ppid: number;
  uid: number;
  rssKB: number;
  command: string;
}

export interface RamGroup {
  id: string; // "app:Safari" / "tool:node"
  name: string;
  kind: "app" | "tool";
  pids: number[];
  rssMB: number;
  locked: string | null; // why it cannot be closed (null = closable)
}

const LINE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/;

// `ps -axo pid=,ppid=,uid=,rss=,command=`
export function parsePs(out: string): Proc[] {
  const procs: Proc[] = [];
  for (const line of out.split("\n")) {
    const m = LINE.exec(line);
    if (m) procs.push({ pid: +m[1], ppid: +m[2], uid: +m[3], rssKB: +m[4], command: m[5] });
  }
  return procs;
}

// names of programs that stay, whatever happens (compared in lower case)
const KEEP_NAMES = new Set(["djsynth", "finder", "dock", "systemuiserver", "controlcenter", "windowserver", "loginwindow", "notificationcenter", "claude"]);
const KEEP_WHY = (name: string) => (name === "claude" ? "session Claude en cours" : name === "djsynth" ? "DJSynth lui-même" : "système");

// the bundle name of an application ("Google Chrome" for ".../Google Chrome.app/Contents/.../Google Chrome Helper.app/...")
export function appNameOf(command: string): string | null {
  const i = command.indexOf(".app/");
  if (i < 0) return null;
  const head = command.slice(0, i);
  return head.slice(head.lastIndexOf("/") + 1) || null;
}

const isSystemApp = (command: string) => command.startsWith("/System/Library/") || command.startsWith("/usr/") || command.startsWith("/sbin/") || command.startsWith("/bin/");
const userToolPath = (command: string, home: string) => /^(\/opt\/homebrew\/|\/usr\/local\/|\/Volumes\/)/.test(command) || (!!home && command.startsWith(home + "/"));
// the program name of a tool: the file name of its first word (tool paths have no spaces)
const exeOf = (command: string) => {
  const first = command.split(" ")[0];
  return first.slice(first.lastIndexOf("/") + 1).trim();
};

// the processes that must live: this one, the ones that started it (up to the app) and everything under that app
export function protectedPids(procs: Proc[], selfPid: number): Set<number> {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  let top = selfPid;
  for (let guard = 0; guard < 64; guard++) {
    const parent = byPid.get(top)?.ppid;
    if (!parent || parent <= 1 || !byPid.has(parent)) break;
    top = parent;
  }
  const kids = new Map<number, number[]>();
  for (const p of procs) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p.pid]);
  const keep = new Set<number>([selfPid, top]);
  const seen = new Set<number>([top]); // the walk down the tree (apart from `keep`, which also holds the chain upwards)
  const stack = [top];
  while (stack.length) {
    for (const k of kids.get(stack.pop()!) ?? []) {
      if (seen.has(k)) continue;
      seen.add(k);
      keep.add(k);
      stack.push(k);
    }
  }
  // the chain from this process up to the app
  for (let pid = selfPid, g = 0; pid > 1 && g < 64; g++) {
    keep.add(pid);
    pid = byPid.get(pid)?.ppid ?? 0;
  }
  return keep;
}

export interface RamContext {
  uid: number; // the user
  selfPid: number; // the server running this code
  home: string;
}

// everything started by Claude (its tools and servers): closing them would cut the session that may be running this work
export function claudePids(procs: Proc[]): Set<number> {
  const kids = new Map<number, number[]>();
  for (const p of procs) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p.pid]);
  const out = new Set<number>();
  const stack = procs.filter((p) => (appNameOf(p.command) ?? "").toLowerCase() === "claude").map((p) => p.pid);
  while (stack.length) {
    const pid = stack.pop()!;
    if (out.has(pid)) continue;
    out.add(pid);
    stack.push(...(kids.get(pid) ?? []));
  }
  return out;
}

// closable and locked programs, the biggest first
export function buildGroups(procs: Proc[], ctx: RamContext): RamGroup[] {
  const keep = protectedPids(procs, ctx.selfPid);
  const claude = claudePids(procs);
  const groups = new Map<string, RamGroup>();
  for (const p of procs) {
    if (p.uid !== ctx.uid || p.pid <= 1 || !p.command) continue;
    const app = appNameOf(p.command);
    let kind: "app" | "tool";
    let name: string;
    if (app) {
      if (isSystemApp(p.command)) continue; // the system's own helpers: never listed
      kind = "app";
      name = app;
    } else if (userToolPath(p.command, ctx.home)) {
      kind = "tool";
      name = exeOf(p.command);
      if (!name) continue;
    } else {
      continue; // system daemons, shells, anything not clearly the user's own program
    }
    const id = `${kind}:${name}`;
    const g = groups.get(id) ?? { id, name, kind, pids: [], rssMB: 0, locked: null };
    g.pids.push(p.pid);
    g.rssMB += p.rssKB / 1024;
    if (keep.has(p.pid)) g.locked = "nécessaire à DJSynth";
    else if (claude.has(p.pid) && !g.locked) g.locked = "session Claude en cours";
    groups.set(id, g);
  }
  for (const g of groups.values()) {
    const lower = g.name.toLowerCase();
    if (!g.locked && KEEP_NAMES.has(lower)) g.locked = KEEP_WHY(lower);
    if (!g.locked && /claude/i.test(g.name)) g.locked = "session Claude en cours";
    g.rssMB = Math.round(g.rssMB);
  }
  return [...groups.values()].filter((g) => g.rssMB >= 1).sort((a, b) => b.rssMB - a.rssMB);
}

// the pids to close for the ids the user chose: only groups that exist now and are not locked
export function pidsToClose(groups: RamGroup[], ids: string[]): { pids: number[]; apps: string[]; mb: number } {
  const chosen = groups.filter((g) => ids.includes(g.id) && !g.locked);
  return {
    pids: chosen.flatMap((g) => g.pids),
    apps: chosen.filter((g) => g.kind === "app").map((g) => g.name),
    mb: chosen.reduce((sum, g) => sum + g.rssMB, 0),
  };
}

// only this Mac, from this app: the route kills programs, so nothing else may call it
export function isLocalRequest(host: string | null, origin: string | null, header: string | null): boolean {
  const local = (h: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h);
  if (!host || !local(host)) return false;
  if (origin) {
    try {
      if (!local(new URL(origin).host)) return false;
    } catch {
      return false;
    }
  }
  return header === "1";
}
