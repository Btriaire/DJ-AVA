// "PLUS DE TITRES": an online catalogue asked for more results, page after page
export type MoreSource = "audius" | "youtube" | "soundcloud" | "deezer";
export const PAGE = 60;
export const MAX_PAGES = 5;

export const YT_VARIANTS = ["audio", "remix", "live", "extended mix", "clip officiel"];

export function searchUrl(src: MoreSource, q: string, page: number, dur?: { min: number; max: number }): string {
  const base = `/api/${src}/search?q=${encodeURIComponent(q)}`;
  if (src === "youtube") {
    if (page === 0) {
      return `${base}&n=${PAGE}&min=${dur?.min ?? 0}&max=${dur?.max ?? 100000}`;
    } else {
      const variant = YT_VARIANTS[(page - 1) % YT_VARIANTS.length];
      return `${base}%20${encodeURIComponent(variant)}&n=${PAGE}&min=${dur?.min ?? 0}&max=${dur?.max ?? 100000}`;
    }
  } else if (src === "soundcloud") {
    return `${base}&n=${PAGE * (page + 1)}&min=${dur?.min ?? 0}&max=${dur?.max ?? 100000}`;
  } else {
    return page > 0 ? `${base}&page=${page}` : base;
  }
}

export function mergeResults<T extends { id: string }>(prev: T[], next: T[]): { list: T[]; added: number } {
  const prevIds = new Set(prev.map(item => item.id));
  const newItems = next.filter(item => !prevIds.has(item.id));
  return { list: [...prev, ...newItems], added: newItems.length };
}

export function pageOffset(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 0;
  const page = Number.isFinite(n) ? n : 0; // a page that is not a number is the first one
  const validPage = Math.max(0, Math.min(page, MAX_PAGES - 1));
  return validPage * PAGE;
}

export function searchMoreTest(): void {
  // Test searchUrl
  const youtubeUrl0 = searchUrl("youtube", "test", 0, { min: 10, max: 20 });
  if (youtubeUrl0 !== "/api/youtube/search?q=test&n=60&min=10&max=20") {
    throw new Error("searchMore: youtube page 0 URL incorrect");
  }

  const youtubeUrl2 = searchUrl("youtube", "test", 2, { min: 10, max: 20 });
  if (youtubeUrl2 !== "/api/youtube/search?q=test%20remix&n=60&min=10&max=20") {
    throw new Error("searchMore: youtube page 2 URL incorrect");
  }

  const soundcloudUrl2 = searchUrl("soundcloud", "test", 2, { min: 0, max: 100000 });
  if (soundcloudUrl2 !== "/api/soundcloud/search?q=test&n=180&min=0&max=100000") {
    throw new Error("searchMore: soundcloud page 2 URL incorrect");
  }

  const deezerUrl0 = searchUrl("deezer", "test", 0);
  if (deezerUrl0 !== "/api/deezer/search?q=test") {
    throw new Error("searchMore: deezer page 0 URL incorrect");
  }

  const deezerUrl3 = searchUrl("deezer", "test", 3);
  if (deezerUrl3 !== "/api/deezer/search?q=test&page=3") {
    throw new Error("searchMore: deezer page 3 URL incorrect");
  }

  // Test mergeResults
  const prev = [{ id: "a" }, { id: "b" }];
  const next = [{ id: "b" }, { id: "c" }];
  const { list, added } = mergeResults(prev, next);
  if (list.length !== 3 || added !== 1 || list[2].id !== "c") {
    throw new Error("searchMore: mergeResults incorrect");
  }

  // Test pageOffset
  if (pageOffset("2") !== 120) {
    throw new Error("searchMore: pageOffset(2) incorrect");
  }
  if (pageOffset("-1") !== 0) {
    throw new Error("searchMore: pageOffset(-1) incorrect");
  }
  if (pageOffset("x") !== 0) {
    throw new Error("searchMore: pageOffset(x) incorrect");
  }
  if (pageOffset("99") !== 240) {
    throw new Error("searchMore: pageOffset(99) incorrect");
  }
}
