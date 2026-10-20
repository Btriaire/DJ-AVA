import { QualityLevel } from "@/lib/quality";
import { VideoMeta } from "@/lib/videoMeta";

export type ProbeResult = {
  abr?: number;
  quality?: QualityLevel;
  height?: number;
  meta?: VideoMeta;
};

const CACHE_KEY = "djsynth.ytquality.v3";
const activeProbes = new Set<string>();

const getCache = (): Record<string, ProbeResult> => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

const setCache = (cache: Record<string, ProbeResult>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
};

export function getCachedQuality(id: string): ProbeResult | undefined {
  const cache = getCache();
  return cache[id];
}

export async function probeQualities(
  ids: string[],
  onEach: (id: string, result: ProbeResult | null) => void,
  concurrency = 3
): Promise<void> {
  const cache = getCache();
  const toProbe = ids.filter(id => !cache[id] && !activeProbes.has(id));

  if (toProbe.length === 0) {
    ids.forEach(id => {
      if (cache[id]) onEach(id, cache[id]);
    });
    return;
  }

  const queue = [...toProbe];
  const active = new Set<string>();

  const processQueue = async () => {
    while (queue.length > 0 && active.size < concurrency) {
      const id = queue.shift()!;
      active.add(id);
      activeProbes.add(id);

      try {
        const res = await fetch(`/api/youtube/quality?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("HTTP error");

        const data: {
          abr?: number | null;
          quality?: QualityLevel | null;
          height?: number | null;
          meta?: VideoMeta | null;
        } = await res.json();

        const result: ProbeResult = {
          abr: data.abr ?? undefined,
          quality: data.quality ?? undefined,
          height: data.height ?? undefined,
          meta: data.meta && Object.keys(data.meta).length > 0 ? data.meta : undefined
        };

        cache[id] = result;
        setCache(cache);
        onEach(id, result);
      } catch {
        onEach(id, null);
      } finally {
        active.delete(id);
        activeProbes.delete(id);
        processQueue();
      }
    }
  };

  await processQueue();
}
