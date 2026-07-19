import { NextRequest, NextResponse } from "next/server";
import { AudiusTrack } from "@/lib/audius";
import { searchYouTube } from "@/lib/youtube";

// Keyword-driven crate dig: "années 80; 100 BPM; Electro; live" → ~20 proposed
// singles, ready to drop into the library and/or a set. Unlike /api/ai/playlist
// (which expands ONE seed track into similar ones), this starts from raw,
// free-form intent with no track to anchor on — the whole point is launching a
// themed set fast without already having a first song in hand.
// YouTube-only: Audius' catalog skews thin/stale for keyword crate-digging
// (decade/mood searches mostly come up empty), so this pool is dropped —
// yt-dlp's flat-playlist search covers far more ground for this use case.

async function ytSearchSafe(q: string, maxDurationSec: number | null): Promise<AudiusTrack[]> {
  if (!q?.trim()) return [];
  try {
    const timeout = new Promise<never[]>((res) => setTimeout(() => res([]), 9000));
    const got = await Promise.race([
      searchYouTube(q, { limit: 25, maxDur: maxDurationSec ?? undefined }),
      timeout,
    ]);
    return (got as { id: string; title: string; artist: string; duration: number; artwork: string | null }[])
      .slice(0, 12)
      .map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        artwork: t.artwork,
        genre: undefined,
        bpm: null,
        source: "youtube" as const,
      }));
  } catch {
    return [];
  }
}

interface Criteria {
  queries: string[];
  bpmMin: number | null;
  bpmMax: number | null;
  genre: string | null;
}

// Ask Groq to turn free-form keywords into search phrases + a scoring target.
// Optional — falls back to a plain split of the raw keyword string.
async function aiCriteria(keywords: string): Promise<Criteria | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are a DJ crate-digging assistant. The user gives free-form keywords describing a vibe for a DJ set (decade, genre, mood, tempo, live/studio, etc — in any language, often French). Turn them into search phrases for a music catalog, PLUS a tempo range if one is implied. Respond ONLY as JSON: {"queries": string[], "bpmMin": number|null, "bpmMax": number|null, "genre": string|null}. 6-10 short queries (genre+era combos, style/mood phrases, representative artist names for that vibe) — never just repeat the raw keywords verbatim. If a decade is given (e.g. "80s", "années 90"), bake it into the query phrases. If a BPM or tempo range is implied, set bpmMin/bpmMax (±5 around a single value); otherwise null. genre = the single best-matching broad genre word, or null.',
          },
          { role: "user", content: keywords },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt) as Partial<Criteria>;
    if (!Array.isArray(parsed.queries) || !parsed.queries.length) return null;
    return {
      queries: parsed.queries.filter((q): q is string => typeof q === "string").slice(0, 10),
      bpmMin: typeof parsed.bpmMin === "number" ? parsed.bpmMin : null,
      bpmMax: typeof parsed.bpmMax === "number" ? parsed.bpmMax : null,
      genre: typeof parsed.genre === "string" ? parsed.genre : null,
    };
  } catch {
    return null;
  }
}

// No-AI fallback: split on common separators, pull a BPM number out if present,
// use the rest of the segments as search phrases as-is.
function fallbackCriteria(keywords: string): Criteria {
  const segments = keywords
    .split(/[;,|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let bpm: number | null = null;
  const queries: string[] = [];
  for (const seg of segments) {
    const m = seg.match(/(\d{2,3})\s*bpm/i) || seg.match(/^(\d{2,3})$/);
    if (m) {
      bpm = parseInt(m[1], 10);
      continue; // a bare BPM number isn't a useful search phrase on its own
    }
    queries.push(seg);
  }
  if (!queries.length) queries.push(keywords.trim());
  return {
    queries: queries.slice(0, 10),
    bpmMin: bpm != null ? bpm - 6 : null,
    bpmMax: bpm != null ? bpm + 6 : null,
    genre: null,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Long-form results (full DJ sets, live streams, mixtapes) drown out actual
// singles when crate-digging by vibe — soften them instead of hard-dropping,
// unless the caller picked an explicit duration cap (then searchYouTube's
// maxDur already excludes them upstream).
const LONG_TRACK_SEC = 600; // 10 min
function score(c: Criteria, t: AudiusTrack, sourceWeight: number): number {
  let s = sourceWeight;
  if (c.genre && t.genre && norm(t.genre).includes(norm(c.genre))) s += 2;
  if (c.bpmMin != null && c.bpmMax != null && t.bpm) {
    if (t.bpm >= c.bpmMin && t.bpm <= c.bpmMax) s += 3;
    else {
      const mid = (c.bpmMin + c.bpmMax) / 2;
      s += Math.max(0, 1 - Math.abs(t.bpm - mid) / 40) * 1.5;
    }
  }
  if (t.artwork) s += 0.3;
  if (t.duration > LONG_TRACK_SEC) s -= 2 + (t.duration - LONG_TRACK_SEC) / 300;
  return s;
}

export async function POST(req: NextRequest) {
  let body: { keywords?: string; maxDurationMin?: number | null };
  try {
    body = (await req.json()) as { keywords?: string; maxDurationMin?: number | null };
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const keywords = (body.keywords || "").trim();
  if (!keywords) return NextResponse.json({ error: "Mots-clés manquants" }, { status: 400 });
  const maxDurationSec =
    typeof body.maxDurationMin === "number" && body.maxDurationMin > 0 ? body.maxDurationMin * 60 : null;

  try {
    const ai = await aiCriteria(keywords);
    const usedAI = !!ai;
    const c = ai ?? fallbackCriteria(keywords);

    const resolved = await Promise.all(
      c.queries.map((q) => ytSearchSafe(q, maxDurationSec).then((tracks) => ({ tracks, w: 2 })))
    );

    const best = new Map<string, { t: AudiusTrack; w: number }>();
    for (const { tracks, w } of resolved) {
      for (const t of tracks) {
        if (!t.id) continue;
        const cur = best.get(t.id);
        if (!cur || w > cur.w) best.set(t.id, { t, w: Math.max(w, cur?.w ?? 0) });
      }
    }

    const LIMIT = 30;
    const ranked = [...best.values()]
      .map(({ t, w }) => ({ t, s: score(c, t, w) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, LIMIT)
      .map((x) => x.t);

    return NextResponse.json({ usedAI, count: ranked.length, tracks: ranked });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
