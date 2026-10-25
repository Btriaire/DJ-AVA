import { idbGetBlob, type LibTrack } from "@/lib/library";
import { queueAnalysis, type AnalysisResult } from "@/lib/analyze";

// Tempo and key of a library track, from its audio (local file or the source's stream).
// The analysis itself is queued by lib/analyze (one at a time); this resolves when it is done.
export async function analyzeLibraryTrack(track: LibTrack): Promise<AnalysisResult | null> {
  // a YouTube song is analysed from a short excerpt by the server, which remembers the result: whoever analysed it
  // first (Radio-AVA, Préparation, the Playlist view), the others get it at once and much faster
  if (track.source === "youtube" && track.url) {
    try {
      const r = await fetch(`/api/radio/analyze?id=${encodeURIComponent(track.url)}&dur=${Math.round(track.durationSec ?? 0)}`);
      if (r.ok) {
        const j = (await r.json()) as { bpm?: number; bpmConfidence?: number; camelot?: string; keyName?: string };
        if (j.bpm) return { bpm: j.bpm, bpmConfidence: j.bpmConfidence ?? 0, camelot: j.camelot ?? "", keyName: j.keyName ?? "" };
      }
    } catch {
      // the route is not there (not the local app): the whole file is analysed below
    }
  }
  try {
    const blob =
      track.source === "local"
        ? await idbGetBlob(track.id)
        : await fetch(`/api/${track.source}/stream?id=${encodeURIComponent(track.url ?? "")}`).then((r) => (r.ok ? r.blob() : null));
    if (!blob) return null;
    return await new Promise<AnalysisResult | null>((resolve) => queueAnalysis(blob, resolve));
  } catch {
    return null;
  }
}
