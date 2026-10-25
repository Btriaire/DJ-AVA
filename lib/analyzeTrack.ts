import { idbGetBlob, type LibTrack } from "@/lib/library";
import { queueAnalysis, type AnalysisResult } from "@/lib/analyze";

// Tempo and key of a library track, from its audio (local file or the source's stream).
// The analysis itself is queued by lib/analyze (one at a time); this resolves when it is done.
export async function analyzeLibraryTrack(track: LibTrack): Promise<AnalysisResult | null> {
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
