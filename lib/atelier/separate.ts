import type { Stem, StemModel } from './types';
import { encodeWav } from "@/lib/audio/engine";
import { sha1Hex16 } from "@/lib/audio/stemHash";

export async function separateStems(
  ctx: BaseAudioContext,
  buf: AudioBuffer,
  model: StemModel,
  signal: AbortSignal,
  onProgress: (pct: number | null) => void
): Promise<Stem[]> {
  const bytes = await encodeWav(buf, 24).arrayBuffer();
  const local = await sha1Hex16(bytes);
  const timer = setInterval(async () => {
    try {
      const res = await fetch(`/api/stems/progress?hash=${local}&model=${model}&wav=1`);
      if (res.ok) {
        const data = await res.json() as { progress: number | null };
        onProgress(data.progress ?? null);
      }
    } catch {}
  }, 1000);

  try {
    const res = await fetch(`/api/stems/separate?model=${model}&wav=1`, {
      method: "POST",
      body: bytes,
      signal
    });

    if (!res.ok) {
      const detail = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
      throw new Error(detail || `Séparation impossible (${res.status})`);
    }

    const data = await res.json() as { hash?: string; stems: string[] };
    const hash = data.hash || local;
    const stems: Stem[] = [];

    for (const name of data.stems) {
      const r = await fetch(`/api/stems/${hash}/${name}?model=${model}&wav=1`, { signal });
      if (!r.ok) {
        throw new Error(`Stem introuvable : ${name}`);
      }
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      stems.push({ name, buf });
    }

    return stems;
  } finally {
    clearInterval(timer);
  }
}
