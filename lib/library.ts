// Persistent media library for the DJ app.
// - Track/playlist metadata lives in localStorage (small, synchronous).
// - The actual audio for imported files lives in IndexedDB (blobs, survives reload).
import { DeckSettings } from "./audio/Deck";

export type TrackSource = "local" | "youtube" | "audius" | "soundcloud" | "deezer";

export interface LibTrack {
  id: string;
  name: string;
  source: TrackSource;
  url?: string; // youtube / audius stream or page link
  deck: "A" | "B" | null; // which deck this single is filed under
  fxA?: DeckSettings; // captured FX snapshot for deck A
  fxB?: DeckSettings; // captured FX snapshot for deck B
  art?: string; // cover/poster: remote URL (audius/yt) or small data-URL thumbnail (local ID3)
  stemHash?: string; // content hash of the audio; if its stems are cached server-side, badge it
  durationSec?: number; // track length — lets a set be built by ear-length, not guesswork
  bpm?: number; // tempo captured from the source search result (Audius/YouTube), if any
  addedAt: number;
}

export type TransitionType = "fade" | "cut" | "smooth" | "filter";

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  transitionSec?: number; // crossfade length (s) used between tracks when this set auto-mixes
  transitionType?: TransitionType; // crossfade curve/style — see TRANSITION_TYPES in MediaLibrary
  preloadSec?: number; // seconds before a track ends to start warming the next one (fewer gaps)
}

export interface LibraryData {
  tracks: LibTrack[];
  playlists: Playlist[];
}

const LS_KEY = "djsynth.library.v1"; // full library (tracks + playlists)
const LS_PL_KEY = "djsynth.playlists.v1"; // playlists ONLY — tiny, quota-safe mirror
const DB_NAME = "djsynth";
const STORE = "audio";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function loadLibrary(): LibraryData {
  if (typeof window === "undefined") return { tracks: [], playlists: [] };
  let tracks: LibTrack[] = [];
  let playlists: Playlist[] = [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw) as LibraryData;
      tracks = d.tracks ?? [];
      playlists = d.playlists ?? []; // legacy: playlists used to live only here
    }
  } catch {
    /* corrupt main blob — fall through, playlists may still be in their own key */
  }
  // The dedicated playlists key (written first, never starved by the quota)
  // wins if present, so playlists survive even when the heavy track blob can't.
  try {
    const rawPl = localStorage.getItem(LS_PL_KEY);
    if (rawPl) {
      const pl = JSON.parse(rawPl) as Playlist[];
      if (Array.isArray(pl)) playlists = pl;
    }
  } catch {
    /* keep whatever we recovered from the main blob */
  }
  return { tracks, playlists };
}

// Returns true on success. Playlists are tiny ({id,name,trackIds[]}) and are
// saved to their OWN key FIRST, so they always survive even if the heavy
// track/cover-art blob blows the localStorage quota. The full library is then
// written; on quota failure we retry once WITHOUT the heavy cover-art data-URLs
// (the only large field) so the essential metadata — including a deletion —
// still persists.
export function saveLibrary(data: LibraryData): boolean {
  if (typeof window === "undefined") return false;
  // 1. playlists first, in their own minuscule key — quota-safe.
  let plOk = true;
  try {
    localStorage.setItem(LS_PL_KEY, JSON.stringify(data.playlists));
  } catch {
    plOk = false;
  }
  // 2. the full library (tracks carry the heavy cover-art).
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return true;
  } catch {
    try {
      const slim: LibraryData = {
        ...data,
        tracks: data.tracks.map((t) =>
          t.art && t.art.startsWith("data:") ? { ...t, art: undefined } : t
        ),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(slim));
      return true;
    } catch {
      // Even slim tracks won't fit — but the playlists are safe in their own
      // key, so don't raise the scary "save failed" warning for that case.
      return plOk;
    }
  }
}

// --- IndexedDB blob store -------------------------------------------------
// Open the DB at a given version (or the current one when omitted). Always
// (re)creates our object store inside the upgrade transaction.
function rawOpen(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req =
      version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("IndexedDB bloqué — ferme les autres onglets de l'app puis recharge"));
  });
}

// Self-healing open: works regardless of the on-disk version. A stale "djsynth"
// created by an earlier build may exist WITHOUT our object store; if so we
// re-open at version+1 to trigger an upgrade that creates the store. This avoids
// VersionError (hardcoding a lower version than the existing DB) entirely.
async function openDB(): Promise<IDBDatabase> {
  let db = await rawOpen();
  if (!db.objectStoreNames.contains(STORE)) {
    const next = db.version + 1;
    db.close();
    db = await rawOpen(next);
  }
  return db;
}

export async function idbPutBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function idbGetBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => resolve((r.result as Blob) ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

// --- cover art -----------------------------------------------------------
// Pull the embedded picture from an MP3's ID3v2 tag (APIC frame) and downscale
// it to a tiny JPEG data-URL so it can live in localStorage without blowing the
// quota. Returns null when there's no tag / no picture / not in the browser.
export async function extractCover(file: File): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null; // "ID3"
    const buf = new Uint8Array(await file.arrayBuffer());
    const ver = buf[3]; // major version (3 or 4)
    const syncsafe = (a: number, b: number, c: number, d: number) =>
      (a << 21) | (b << 14) | (c << 7) | d;
    const tagSize = syncsafe(buf[6], buf[7], buf[8], buf[9]);
    let i = 10;
    const end = Math.min(10 + tagSize, buf.length);
    while (i + 10 <= end) {
      const id = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
      if (id === "\0\0\0\0") break;
      const size =
        ver >= 4
          ? syncsafe(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7])
          : (buf[i + 4] << 24) | (buf[i + 5] << 16) | (buf[i + 6] << 8) | buf[i + 7];
      const dataStart = i + 10;
      if (size <= 0 || dataStart + size > buf.length) break;
      if (id === "APIC") {
        let p = dataStart + 1; // skip text-encoding byte
        while (p < dataStart + size && buf[p] !== 0) p++; // MIME (null-terminated)
        const mime = String.fromCharCode(...buf.slice(dataStart + 1, p)) || "image/jpeg";
        p++; // null
        p++; // picture type
        while (p < dataStart + size && buf[p] !== 0) p++; // description (null-terminated)
        p++; // null
        const pic = buf.slice(p, dataStart + size);
        const blob = new Blob([pic], { type: mime });
        return await thumbnail(blob);
      }
      i = dataStart + size;
    }
    return null;
  } catch {
    return null;
  }
}

// draw a Blob image onto a 120px canvas and return a compact JPEG data-URL
function thumbnail(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const size = 120;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return resolve(null);
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function idbDelBlob(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
