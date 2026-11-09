// Deep check of the lyrics choir timing on real songs (network): run with  npx tsx scripts/lyrics-bench.ts
// It pairs every YouTube file of .audio-cache with its stems (.stems-cache/<sha1>/…/pitch.json), looks up the title and
// the timed lyrics, then measures the timing against the real voice: before calage, after the global offset, after the per-phrase refinement.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { alignOffset, alignQuality, buildPhrases, cleanTerm, parseLrc, refineOnVoice, type Phrase } from "../lib/lyricsPlan";

const P = process.cwd();
const PY = join(P, ".venv-spotdl", "bin", "python");
const MAX = Number(process.argv[2] ?? 24);
const voicedFrac = (v: number[], st: number, a: number, b: number) => { let n = 0, k = 0; for (let i = Math.max(0, Math.floor(a / st)); i < Math.floor(b / st); i++) { k++; if ((v[i] ?? -1) >= 0) n++; } return k ? n / k : 0; };
// distance from each phrase start to the nearest voice attack (within 1 s)
const onsetErr = (ph: Phrase[], v: number[], st: number, o: number) => ph.flatMap((p) => { const t0 = p.start + o; let bd = 9; for (let t = t0 - 1; t <= t0 + 1; t += st) { const i = Math.floor(t / st); if ((v[i] ?? -1) >= 0 && (v[i - 1] ?? -1) < 0) bd = Math.min(bd, Math.abs(t - t0)); } return bd < 9 ? [bd] : []; });
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * q)] : NaN; };

const songs: { id: string; hash: string; dir: string; voiced: number }[] = [];
for (const f of existsSync(join(P, ".audio-cache")) ? readdirSync(join(P, ".audio-cache")) : []) {
  if (!f.endsWith(".mp3")) continue;
  const hash = createHash("sha1").update(readFileSync(join(P, ".audio-cache", f))).digest("hex").slice(0, 16);
  const base = join(P, ".stems-cache", hash);
  const dir = existsSync(base) ? readdirSync(base).map((m) => join(base, m)).find((d) => existsSync(join(d, "pitch.json"))) : undefined;
  if (!dir) continue;
  const c: number[] = JSON.parse(readFileSync(join(dir, "pitch.json"), "utf8")).contour;
  const voiced = c.filter((x) => x >= 0).length / Math.max(1, c.length);
  if (voiced >= 0.3) songs.push({ id: f.slice(0, -4), hash, dir, voiced });
}
const titles: Record<string, string> = JSON.parse(execFileSync(PY, ["-I", "-c", `
import json,sys
from spotdl.utils.search import get_ytm_client
c=get_ytm_client(); out={}
for vid in sys.argv[1:]:
    try:
        d=c.get_song(vid)['videoDetails']; out[vid]=(d.get('author','')+' '+d.get('title','')).strip()
    except Exception: pass
print(json.dumps(out))`, ...songs.slice(0, MAX).map((s) => s.id)], { encoding: "utf8", timeout: 180000 }));

const tot = { n: 0, h0: 0, h1: 0, o0: [] as number[], o1: [] as number[], o2: [] as number[], uncertain: 0 };
for (const s of songs.slice(0, MAX)) {
  const name = titles[s.id];
  if (!name) continue;
  const pitch = JSON.parse(readFileSync(join(s.dir, "pitch.json"), "utf8"));
  const v: number[] = pitch.contour, st = pitch.hop * 4;
  const out = JSON.parse(execFileSync(PY, [join(P, "scripts", "spotdl_lyrics.py"), cleanTerm(name)], { encoding: "utf8", timeout: 40000 }).trim().split("\n").pop()!);
  const ph = out.lrc ? buildPhrases(parseLrc(out.lrc)) : [];
  if (ph.length < 4) { console.log(`${name.slice(0, 48).padEnd(48)} | ${out.lrc ? "sans minutage" : "aucune parole"}`); continue; }
  const off = alignOffset(ph, v, st), q0 = alignQuality(ph, v, st, 0), q = alignQuality(ph, v, st, off);
  const rf = refineOnVoice(ph, v, st, off);
  const e0 = onsetErr(ph, v, st, 0), e1 = onsetErr(ph, v, st, off), e2 = onsetErr(rf, v, st, off);
  tot.n++; tot.h0 += q0; tot.h1 += q; tot.o0.push(...e0); tot.o1.push(...e1); tot.o2.push(...e2); if (q < 0.5) tot.uncertain++;
  console.log(`${name.slice(0, 48).padEnd(48)} | ${String(ph.length).padStart(3)} phrases | calage ${off >= 0 ? "+" : ""}${off.toFixed(1)} s | voix au debut ${(q0 * 100).toFixed(0)} % -> ${(q * 100).toFixed(0)} %${q < 0.5 ? " (incertain)" : ""} | attaque mediane ${pct(e0, 0.5).toFixed(2)} -> ${pct(e1, 0.5).toFixed(2)} -> ${pct(e2, 0.5).toFixed(2)} s`);
}
const near = (a: number[]) => `${(a.filter((x) => x < 0.1).length / Math.max(1, a.length) * 100).toFixed(0)} %`;
console.log(`\n${tot.n} morceaux minutes : voix au debut de phrase ${(tot.h0 / tot.n * 100).toFixed(0)} % sans calage -> ${(tot.h1 / tot.n * 100).toFixed(0)} % avec ; ${tot.uncertain} signales incertains`);
console.log(`debut de phrase a moins de 0,1 s d'une attaque de voix : ${near(tot.o0)} sans calage, ${near(tot.o1)} apres le decalage global, ${near(tot.o2)} apres le recalage phrase par phrase`);
