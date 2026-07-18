import { NextRequest, NextResponse } from "next/server";
import { AudiusTrack, audiusGetTrack } from "@/lib/audius";
import { searchYouTube } from "@/lib/youtube";

// YouTube-only candidate pool (via yt-dlp). Audius' catalog is thin/stale for
// this kind of style-matching crate dig, so results come from YouTube alone —
// `audiusGetTrack` below is still used, but only to enrich the SEED's own
// genre/bpm when it came from an Audius track, not to fetch candidates.
// Raced against a timeout so a slow yt-dlp can never stall the whole request.
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

// Body sent by the library panel: a "seed" single to build a set around.
interface SeedIn {
  id?: string; // Audius track id, when the seed comes from Audius
  title: string;
  artist?: string;
  genre?: string;
  bpm?: number | null;
  sameArtist?: boolean; // restrict the whole set to the seed's artist/group
  maxDurationMin?: number | null; // hard cap; null = no cap (long tracks are still soft-penalized)
}

// Ask Groq (OpenAI-compatible) to expand a seed into similar search phrases.
// Optional — only runs when GROQ_API_KEY is configured; everything still works
// (Audius related + genre-trending pools) without it.
async function aiQueries(seed: SeedIn): Promise<string[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are a DJ crate-digging assistant. Given a seed track, return search phrases to find sonically SIMILAR tracks (same vibe, genre, energy, tempo) on a music catalog. Respond ONLY as JSON: {"queries": string[]}. 6-8 short phrases, each a similar artist name OR a style/mood/tempo keyword combo. No commentary.',
          },
          {
            role: "user",
            content: `Seed: "${seed.title}"${seed.artist ? ` by ${seed.artist}` : ""}. Genre: ${
              seed.genre || "unknown"
            }. BPM: ${seed.bpm || "unknown"}.`,
          },
        ],
      }),
      // don't let a slow LLM hold up the whole request
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return [];
    return parsed.queries.filter((q): q is string => typeof q === "string").slice(0, 8);
  } catch {
    return [];
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const genreRoot = (g?: string) => (g ? g.split("/")[0].trim().toLowerCase() : "");
// tight artist key: strips spaces/punctuation and the "- Topic" suffix YouTube
// adds, so "Swedish House Mafia" ≈ "swedishhousemafia" ≈ "SwedishHouseMafia - Topic".
const compact = (s: string) =>
  s.toLowerCase().replace(/-\s*topic\s*$/, "").replace(/[^a-z0-9]/g, "");

// Long-form results (full DJ sets, live streams, mixtapes) drown out actual
// singles — softened instead of hard-dropped, unless the caller picked an
// explicit duration cap (then searchYouTube's maxDur already excludes them).
const LONG_TRACK_SEC = 600; // 10 min

// How well a candidate matches the seed — higher is closer in style/BPM.
function score(seed: SeedIn, t: AudiusTrack, sourceWeight: number): number {
  let s = sourceWeight;
  if (seed.genre && t.genre) {
    if (norm(t.genre) === norm(seed.genre)) s += 2.5;
    else if (genreRoot(t.genre) === genreRoot(seed.genre)) s += 1;
  }
  if (seed.bpm && t.bpm) {
    const d = Math.abs(seed.bpm - t.bpm);
    s += Math.max(0, 1 - d / 40) * 3; // tighter tempo = more points
    if (d <= 4) s += 1.5; // beatmatchable straight away
    else if (Math.abs(d - seed.bpm) <= 6 || Math.abs(d - seed.bpm / 2) <= 6) s += 0.6; // half/double time
  } else if (!t.bpm) {
    s -= 0.2; // unknown tempo is slightly less useful for mixing
  }
  if (t.artwork) s += 0.3;
  if (t.duration > LONG_TRACK_SEC) s -= 2 + (t.duration - LONG_TRACK_SEC) / 300;
  return s;
}

export async function POST(req: NextRequest) {
  let seed: SeedIn;
  try {
    seed = (await req.json()) as SeedIn;
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!seed?.title) return NextResponse.json({ error: "Titre manquant" }, { status: 400 });

  const sameArtist = !!seed.sameArtist;
  const maxDurationSec =
    typeof seed.maxDurationMin === "number" && seed.maxDurationMin > 0 ? seed.maxDurationMin * 60 : null;

  try {
    // enrich the seed with genre / bpm if it came from Audius without them —
    // this is about understanding the SEED, not fetching Audius candidates
    if (seed.id && (!seed.genre || seed.bpm == null)) {
      const full = await audiusGetTrack(seed.id);
      if (full) {
        seed.genre = seed.genre || full.genre;
        seed.bpm = seed.bpm ?? full.bpm;
        seed.artist = seed.artist || full.artist;
      }
    }

    // deck seeds arrive as "Title — Artist"; recover the artist for same-artist mode
    if (sameArtist && !seed.artist && seed.title.includes(" — ")) {
      seed.artist = seed.title.split(" — ").pop()?.trim();
    }

    // same-artist mode is a focused crate dig: skip the AI's "similar style"
    // expansion entirely and search straight for the artist's catalog.
    const queries = sameArtist ? [] : await aiQueries(seed);
    const usedAI = queries.length > 0;

    // YouTube queries — the sole candidate source. In same-artist mode we search
    // only the artist's name so YT returns their catalog; otherwise reuse the
    // AI's similar-style phrases (or fall back to the seed's artist / genre+bpm).
    const ytQueries = (
      sameArtist
        ? [seed.artist, seed.artist ? `${seed.artist} mix` : ""]
        : usedAI
          ? queries
          : [seed.artist, seed.genre ? `${seed.genre}${seed.bpm ? ` ${Math.round(seed.bpm)} bpm` : ""}` : ""]
    )
      .filter((s): s is string => !!s && s.trim().length > 0)
      .slice(0, 8);
    if (!ytQueries.length && seed.title) ytQueries.push(`${seed.title} ${seed.artist ?? ""}`.trim());

    const resolved = await Promise.all(
      ytQueries.map((q) => ytSearchSafe(q, maxDurationSec).then((tracks) => ({ tracks, w: 2.2 })))
    );

    // merge & dedupe, keeping the strongest pool weight seen per track id
    const seedTitle = norm(seed.title);
    const best = new Map<string, { t: AudiusTrack; w: number }>();
    for (const { tracks, w } of resolved) {
      for (const t of tracks) {
        if (!t.id || t.id === seed.id) continue;
        if (norm(t.title) === seedTitle && norm(t.artist) === norm(seed.artist || "")) continue;
        const cur = best.get(t.id);
        if (!cur || w > cur.w) best.set(t.id, { t, w: Math.max(w, cur?.w ?? 0) });
      }
    }

    // same-artist mode: drop anything whose artist doesn't match the seed's. We
    // compare on the compact key and accept substring matches either way so
    // "Daft Punk" lines up with "Daft Punk - Topic" and feat./remix credits.
    if (sameArtist && seed.artist) {
      const a = compact(seed.artist);
      if (a) {
        for (const [id, v] of best) {
          const ta = compact(v.t.artist);
          if (!ta || !(ta.includes(a) || a.includes(ta))) best.delete(id);
        }
      }
    }

    const LIMIT = 24;
    const ranked = [...best.values()]
      .map(({ t, w }) => ({ t, s: score(seed, t, w) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, LIMIT)
      .map((x) => x.t);

    return NextResponse.json({
      seed: { ...seed },
      usedAI,
      count: ranked.length,
      tracks: ranked,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tracks: [] }, { status: 502 });
  }
}
