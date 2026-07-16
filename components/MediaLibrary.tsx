"use client";
import { memo, useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import {
  LibraryData,
  LibTrack,
  TrackSource,
  TransitionType,
  loadLibrary,
  saveLibrary,
  uid,
  idbPutBlob,
  idbGetBlob,
  idbDelBlob,
  extractCover,
} from "@/lib/library";
import { AudiusTrack } from "@/lib/audius";
import { CdPlayerFace } from "./CdPlayerFace";

interface Props {
  engine: DJEngine;
  onLoaded?: () => void;
  // bumped by the parent whenever a deck finishes/probes a separation, so the
  // library re-fetches the set of hashes that have cached stems and re-badges.
  stemRefresh?: number;
  // bumped when a deck writes to the library (e.g. "save to playlist"), so this
  // panel reloads its in-memory copy from localStorage and shows the change.
  libRefresh?: number;
  // renders search (left) and the playlist workspace (right) as two permanent
  // columns instead of one tab-switched list — used by the dedicated Playlist view.
  splitLayout?: boolean;
}

// a "seed" single the AI auto-playlist builds a similar set around
type Seed = { id?: string; title: string; artist?: string; genre?: string; bpm?: number | null };

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}

// read a local file's duration without decoding the full PCM — just metadata
function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("lecture impossible"));
    };
    audio.src = url;
  });
}

// YouTube duration filters — force a wider, more relevant pool than the default.
// min/max in seconds (max 0 = no cap). Mirrors StudioView's DUR_FILTERS.
const DUR_FILTERS: { key: string; label: string; min: number; max: number }[] = [
  { key: "all", label: "Toutes", min: 0, max: 0 },
  { key: "1", label: "<1min", min: 0, max: 60 },
  { key: "3", label: "<3min", min: 0, max: 180 },
  { key: "5", label: "<5min", min: 0, max: 300 },
  { key: "8", label: "<8min", min: 0, max: 480 },
  { key: "15", label: "<15min", min: 0, max: 900 },
  { key: "15+", label: ">15min", min: 900, max: 0 },
];

const SRC_BADGE: Record<TrackSource, { label: string; color: string }> = {
  local: { label: "FICHIER", color: "#9ca3af" },
  audius: { label: "AUDIUS", color: "#ffcc00" },
  youtube: { label: "YT", color: "#ef4444" },
  soundcloud: { label: "SC", color: "#ff7700" },
  deezer: { label: "DEEZER", color: "#a238ff" },
};

// transition styles for the A→B→A auto-mix — inspired by the crossfade curves
// found on real DJ mixers/controllers (Pioneer DJM "smooth/sharp", Traktor's
// auto-crossfader curve, Serato's quick-cut vs. smooth-blend transitions).
const TRANSITION_TYPES: { key: TransitionType; label: string; hint: string }[] = [
  { key: "fade", label: "Fondu", hint: "Fondu enchaîné linéaire, classique" },
  { key: "cut", label: "Coupe", hint: "Bascule instantanée, sans fondu — punch-in de scratch DJ" },
  { key: "smooth", label: "Doux", hint: "Courbe en S — doux au début et à la fin, imperceptible" },
  { key: "filter", label: "Filtre", hint: "Fondu + coupe le filtre passe-bas du morceau sortant, comme fermer le knob FILTER avant de le retirer" },
];

// Docked media database under the Synth: a persistent collection of local files,
// Audius/YouTube finds and playlists. Each track can be filed for Deck A or B,
// loaded onto either deck even while playing, and can carry a captured FX
// snapshot per deck (Capture = read deck's live FX, Apply = push it back).
//
// Wrapped in memo() so the parent's 60fps `tick` re-render loop can't re-render
// this panel — its `engine` prop is a stable singleton and `onLoaded` is a
// stable useCallback. Without this, every frame gave the inner TrackRow a new
// identity, remounting each row's DOM and cancelling in-flight real mouse clicks
// on the delete / send-to-deck buttons.
function MediaLibraryImpl({ engine, onLoaded, stemRefresh, libRefresh, splitLayout }: Props) {
  const [data, setData] = useState<LibraryData>({ tracks: [], playlists: [] });
  const [tab, setTab] = useState<
    "files" | "playlists" | "audius" | "youtube" | "soundcloud" | "deezer" | "auto"
  >("files");
  const [q, setQ] = useState("");
  const [durKey, setDurKey] = useState<string>("all"); // YouTube duration filter
  const [results, setResults] = useState<AudiusTrack[]>([]);
  // --- AI auto-playlist (similar style / BPM / sound) ---
  const [autoSeed, setAutoSeed] = useState<Seed | null>(null);
  const [autoTracks, setAutoTracks] = useState<AudiusTrack[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoUsedAI, setAutoUsedAI] = useState(false);
  const [sameArtist, setSameArtist] = useState(false); // restrict Auto-IA to the seed's artist
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activePl, setActivePl] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [liveA, setLiveA] = useState(false);
  const [liveB, setLiveB] = useState(false);
  const [relay, setRelay] = useState(false); // A→B→A automix relay
  // optional per-side playlist that drives the consecutive-play queue. null =
  // fall back to "singles filed for this deck" (the original behaviour).
  const [queueSrc, setQueueSrc] = useState<{ A: string | null; B: string | null }>({ A: null, B: null });
  // the "affiche" — cover of the most recently loaded single, per deck
  const [active, setActive] = useState<{
    A: { name: string; art?: string } | null;
    B: { name: string; art?: string } | null;
  }>({ A: null, B: null });
  const fileRef = useRef<HTMLInputElement>(null);

  // live-mode bookkeeping (kept in refs so the interval reads fresh values)
  const dataRef = useRef(data);
  dataRef.current = data;
  const queueSrcRef = useRef(queueSrc);
  queueSrcRef.current = queueSrc;
  const liveIdx = useRef<{ A: number; B: number }>({ A: -1, B: -1 });
  const wasPlaying = useRef<{ A: boolean; B: boolean }>({ A: false, B: false });
  // pre-load cache: warms the next track a few seconds before the current one
  // ends, so the LIVE loop's hand-off has no audible loading gap — local blobs
  // are cached in memory (skips the IndexedDB round trip), remote streams get
  // their URL fetched early to warm the HTTP/CDN cache.
  const prefetchCache = useRef<Map<string, Blob>>(new Map());
  const prefetchedIds = useRef<Set<string>>(new Set());
  function prefetchTrack(t: LibTrack) {
    if (prefetchedIds.current.has(t.id)) return;
    prefetchedIds.current.add(t.id);
    if (t.source === "local") {
      idbGetBlob(t.id).then((blob) => {
        if (blob) prefetchCache.current.set(t.id, blob);
      });
    } else {
      const streamUrl = `/api/${t.source}/stream?id=${encodeURIComponent(t.url ?? "")}`;
      fetch(streamUrl).catch(() => {}); // fire-and-forget — warms the cache/CDN
    }
  }
  // A→B→A relay bookkeeping (refs so the watcher reads fresh values)
  const relayRef = useRef(false);
  const relaySide = useRef<"A" | "B">("A"); // deck currently in the foreground
  const relayIdx = useRef<{ A: number; B: number }>({ A: -1, B: -1 });
  // single shared pointer through the relay's combined queue — advanced once
  // per relayLoadNext() call regardless of which side is loading, so a full
  // set marches straight through in order (track0→A, track1→B, track2→A, …)
  // instead of each side keeping its own counter and both starting on track0.
  const relayPos = useRef(-1);
  const relayFading = useRef(false);
  const relayArmed = useRef(true); // fade exactly once per song
  // mirror of liveIdx as state so the track list re-renders when the queue moves
  // (used to highlight the playing track + blink the next one in the deck color)
  const [liveCur, setLiveCur] = useState<{ A: number; B: number }>({ A: -1, B: -1 });
  // mirror of the relay's loaded indices + foreground deck, so the list can mark
  // which single is playing now ("en cours") vs. cued next during A→B→A
  const [relayCur, setRelayCur] = useState<{ A: number; B: number }>({ A: -1, B: -1 });
  const [relayFg, setRelayFg] = useState<"A" | "B">("A");

  // set of content hashes that already have cached stems on the server, so a
  // track can show a "STEMS" badge. Refreshed on mount and whenever the parent
  // bumps `stemRefresh` (i.e. a deck just probed or finished a separation).
  const [stemSet, setStemSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setData(loadLibrary());
  }, []);

  // lightweight re-render clock so the playlist's play/pause transport button
  // reflects deck.playing even when it changed outside the LIVE/relay loops
  // (e.g. the user hit PLAY on the deck panel directly)
  const [, forceLibTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceLibTick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, []);

  // a deck saved a track to a playlist (wrote straight to localStorage) — pull
  // the fresh copy in so the playlists tab reflects it. Skipped on first mount.
  const firstLib = useRef(true);
  useEffect(() => {
    if (firstLib.current) {
      firstLib.current = false;
      return;
    }
    const fresh = loadLibrary();
    dataRef.current = fresh;
    setData(fresh);
  }, [libRefresh]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stems/list")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && Array.isArray(j.hashes)) setStemSet(new Set<string>(j.hashes));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stemRefresh]);

  // Functional updater: every change is computed from the LATEST state, so rapid
  // successive edits (e.g. deleting several rows quickly) never clobber each other
  // with a stale snapshot. The localStorage write happens off the captured value.
  function persist(update: (prev: LibraryData) => LibraryData) {
    const next = update(dataRef.current);
    dataRef.current = next; // keep the ref in sync IMMEDIATELY so back-to-back
    setData(next); //          calls in the same tick each see the latest list
    if (!saveLibrary(next))
      flash("⚠ Sauvegarde impossible (stockage navigateur plein) — réessaie après avoir effacé des morceaux.");
  }
  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2200);
  }

  // --- import local files into the collection (blob → IndexedDB) ---
  async function importFiles(files: FileList) {
    const added: LibTrack[] = [];
    try {
      for (const f of Array.from(files)) {
        const id = uid();
        await idbPutBlob(id, f); // store the audio blob first…
        const art = (await extractCover(f)) ?? undefined; // …then its embedded cover
        const durationSec = await probeDuration(f).catch(() => undefined);
        added.push({
          id,
          name: f.name.replace(/\.[^.]+$/, ""),
          source: "local",
          deck: null,
          art,
          durationSec,
          addedAt: Date.now(),
        });
      }
    } catch (e) {
      flash(`Import impossible : ${(e as Error).message}`);
      return;
    }
    if (added.length) {
      persist((d) => ({ ...d, tracks: [...added, ...d.tracks] }));
      flash(`${added.length} fichier(s) ajouté(s)`);
    }
  }

  // --- load a stored track onto a deck (and re-apply its saved FX) ---
  async function loadToDeck(t: LibTrack, side: "A" | "B") {
    setBusy(t.id + side);
    const deck = side === "A" ? engine.deckA : engine.deckB;
    deck.loading = true; // the deck panel shows a loading bar until ready
    deck.loadStartedAt = performance.now();
    try {
      if (t.source === "local") {
        const cached = prefetchCache.current.get(t.id);
        const blob = cached ?? (await idbGetBlob(t.id));
        prefetchCache.current.delete(t.id);
        prefetchedIds.current.delete(t.id);
        if (!blob) throw new Error("Fichier introuvable (effacé du navigateur)");
        // streaming: audio starts within ~200 ms; waveform/BPM decode in background
        deck.loadStreaming(blob, t.name);
        deck.sourceLink = "";
      } else {
        const streamUrl = `/api/${t.source}/stream?id=${encodeURIComponent(t.url ?? "")}`;
        deck.loadStreamingUrl(streamUrl, t.name);
        deck.sourceLink =
          t.source === "youtube"
            ? `https://www.youtube.com/watch?v=${t.url}`
            : t.source === "soundcloud"
              ? t.url ?? ""
              : "";
      }
      const fx = side === "A" ? t.fxA : t.fxB;
      if (fx) deck.applySettings(fx);
      deck.coverArt = t.art ?? ""; // shown on the deck while it plays
      deck.origin = { id: t.id, source: t.source, url: t.url, art: t.art }; // for "save to playlist"
      setActive((a) => ({ ...a, [side]: { name: t.name, art: t.art } }));
      onLoaded?.();
      flash(`« ${t.name} » → Deck ${side}`);
      // probe the server cache so we can record this track's content hash and
      // badge it if its stems already exist (no-op for non-stored results)
      deck.probeStems().then(() => {
        if (deck.stemHash) {
          if (deck.stemCached) setStemSet((s) => new Set(s).add(deck.stemHash));
          persist((d) => ({
            ...d,
            tracks: d.tracks.map((x) =>
              x.id === t.id && x.stemHash !== deck.stemHash
                ? { ...x, stemHash: deck.stemHash }
                : x
            ),
          }));
        }
      });
      // BPM decodes in the background after load — poll briefly and write it
      // back to the library entry once known, so local uploads get a BPM
      // column too (search results already carry one from their source).
      if (t.bpm == null) {
        let tries = 0;
        const pollBpm = () => {
          tries++;
          if (deck.bpm > 0) {
            persist((d) => ({
              ...d,
              tracks: d.tracks.map((x) => (x.id === t.id && x.bpm == null ? { ...x, bpm: deck.bpm } : x)),
            }));
          } else if (tries < 12) {
            window.setTimeout(pollBpm, 500);
          }
        };
        window.setTimeout(pollBpm, 500);
      }
    } catch (e) {
      flash(`Deck ${side} : ${(e as Error).message}`);
    } finally {
      deck.loading = false; // ready (or failed) — hide the loading bar
      setBusy(null);
    }
  }

  function fileFor(t: LibTrack, deck: "A" | "B" | null) {
    persist((d) => ({
      ...d,
      tracks: d.tracks.map((x) => (x.id === t.id ? { ...x, deck } : x)),
    }));
  }

  function captureFx(t: LibTrack, side: "A" | "B") {
    const s = (side === "A" ? engine.deckA : engine.deckB).getSettings();
    persist((d) => ({
      ...d,
      tracks: d.tracks.map((x) =>
        x.id === t.id ? { ...x, [side === "A" ? "fxA" : "fxB"]: s } : x
      ),
    }));
    flash(`FX deck ${side} capturés → « ${t.name} »`);
  }

  function applyFx(t: LibTrack, side: "A" | "B") {
    const fx = side === "A" ? t.fxA : t.fxB;
    if (!fx) {
      flash(`Aucun FX ${side} enregistré pour ce morceau`);
      return;
    }
    (side === "A" ? engine.deckA : engine.deckB).applySettings(fx);
    onLoaded?.();
    flash(`FX ${side} appliqués`);
  }

  async function del(t: LibTrack) {
    // remove from the UI/metadata FIRST so deletion always "works", even if the
    // blob store is momentarily unavailable; the blob removal is best-effort.
    persist((d) => ({
      tracks: d.tracks.filter((x) => x.id !== t.id),
      playlists: d.playlists.map((p) => ({
        ...p,
        trackIds: p.trackIds.filter((id) => id !== t.id),
      })),
    }));
    flash(`« ${t.name} » supprimé`);
    if (t.source === "local") {
      try {
        await idbDelBlob(t.id);
      } catch {
        /* blob already gone or store unavailable — metadata is what matters */
      }
    }
  }

  // wipe every track (and its stored blob); playlists are kept but emptied.
  async function delAll() {
    const locals = dataRef.current.tracks.filter((t) => t.source === "local");
    if (!dataRef.current.tracks.length) {
      flash("La bibliothèque est déjà vide");
      return;
    }
    if (!confirm("Effacer TOUS les morceaux de la bibliothèque ? (les playlists seront vidées)"))
      return;
    persist((d) => ({
      tracks: [],
      playlists: d.playlists.map((p) => ({ ...p, trackIds: [] })),
    }));
    flash("Bibliothèque vidée");
    for (const t of locals) {
      try {
        await idbDelBlob(t.id);
      } catch {
        /* best-effort */
      }
    }
  }

  // --- sets (ordered playlists that auto-mix with a configurable transition) ---
  function newPlaylist() {
    const name = prompt("Nom du set ?")?.trim();
    if (!name) return;
    const p = { id: uid(), name, trackIds: [] as string[], transitionSec: 12 };
    persist((d) => ({ ...d, playlists: [...d.playlists, p] }));
    setActivePl(p.id);
  }
  function delPlaylist(id: string) {
    persist((d) => ({ ...d, playlists: d.playlists.filter((p) => p.id !== id) }));
    if (activePl === id) setActivePl(null);
  }
  function setTransition(plId: string, sec: number) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => (p.id === plId ? { ...p, transitionSec: sec } : p)),
    }));
  }
  function setTransitionType(plId: string, type: TransitionType) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => (p.id === plId ? { ...p, transitionType: type } : p)),
    }));
  }
  function setPreloadSec(plId: string, sec: number) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => (p.id === plId ? { ...p, preloadSec: sec } : p)),
    }));
  }
  function toggleInPlaylist(plId: string, trackId: string) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => {
        if (p.id !== plId) return p;
        const has = p.trackIds.includes(trackId);
        return {
          ...p,
          trackIds: has
            ? p.trackIds.filter((id) => id !== trackId)
            : [...p.trackIds, trackId],
        };
      }),
    }));
  }
  // reorder a single inside a playlist (dir -1 = up, +1 = down). The play queue
  // reads trackIds in order, so this directly arranges the chain / setlist.
  function moveInPlaylist(plId: string, trackId: string, dir: -1 | 1) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => {
        if (p.id !== plId) return p;
        const ids = [...p.trackIds];
        const i = ids.indexOf(trackId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return p;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        return { ...p, trackIds: ids };
      }),
    }));
  }
  // add EVERY library track not already in the playlist, in one click — fast way
  // to seed a long chain, then prune/reorder. Respects the deck filter if set.
  function addAllToPlaylist(plId: string) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => {
        if (p.id !== plId) return p;
        const have = new Set(p.trackIds);
        const extra = d.tracks.filter((t) => !have.has(t.id)).map((t) => t.id);
        return { ...p, trackIds: [...p.trackIds, ...extra] };
      }),
    }));
  }

  // --- Audius / YouTube search ---
  async function search(durOverride?: string) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      let url = `/api/${tab}/search?q=${encodeURIComponent(q)}`;
      if (tab === "youtube" || tab === "soundcloud") {
        const f = DUR_FILTERS.find((d) => d.key === (durOverride ?? durKey)) ?? DUR_FILTERS[0];
        url += `&n=40&min=${f.min}&max=${f.max}`; // bigger pool + duration bounds
      }
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) flash(j.error);
      setResults(j.tracks ?? []);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function saveResult(t: AudiusTrack) {
    if (tab === "files" || tab === "playlists" || tab === "auto") return;
    const lt: LibTrack = {
      id: uid(),
      name: `${t.title} — ${t.artist}`,
      source: tab,
      url: t.id,
      deck: null,
      art: t.artwork ?? undefined,
      durationSec: t.duration || undefined,
      bpm: t.bpm ?? undefined,
      addedAt: Date.now(),
    };
    persist((d) => ({ ...d, tracks: [lt, ...d.tracks] }));
    flash("Ajouté à la bibliothèque");
  }
  function loadResult(t: AudiusTrack, side: "A" | "B") {
    loadToDeck(
      {
        id: t.id,
        name: `${t.title} — ${t.artist}`,
        source: tab as TrackSource,
        url: t.id,
        deck: null,
        art: t.artwork ?? undefined,
        addedAt: 0,
      },
      side
    );
  }

  // --- AI auto-playlist: build a set of singles close in style / BPM / sound ---
  async function generateAuto(seed: Seed, opts?: { sameArtist?: boolean }) {
    const only = opts?.sameArtist ?? sameArtist;
    setTab("auto");
    setAutoSeed(seed);
    setAutoTracks([]);
    setAutoLoading(true);
    try {
      const r = await fetch("/api/ai/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...seed, sameArtist: only }),
      });
      const j = await r.json();
      if (j.error) flash(j.error);
      setAutoTracks(j.tracks ?? []);
      setAutoUsedAI(!!j.usedAI);
      if ((j.tracks ?? []).length === 0 && !j.error)
        flash("Aucun titre proche trouvé — essaie une autre graine.");
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setAutoLoading(false);
    }
  }
  // seed the generator from whatever is loaded on a deck (uses its detected BPM)
  function seedFromDeck(side: "A" | "B") {
    const deck = side === "A" ? engine.deckA : engine.deckB;
    if (!deck.name) {
      flash(`Deck ${side} est vide`);
      return;
    }
    generateAuto({
      id: deck.origin?.source === "audius" ? deck.origin.url : undefined,
      title: deck.name,
      bpm: deck.bpm || null,
    });
  }
  // a generated track (Audius OR YouTube) → onto a deck, regardless of the tab
  function loadAutoTrack(t: AudiusTrack, side: "A" | "B") {
    loadToDeck(
      { id: t.id, name: `${t.title} — ${t.artist}`, source: (t.source ?? "audius") as TrackSource, url: t.id, deck: null, art: t.artwork ?? undefined, addedAt: 0 },
      side
    );
  }
  function saveAutoTrack(t: AudiusTrack) {
    const lt: LibTrack = {
      id: uid(), name: `${t.title} — ${t.artist}`, source: (t.source ?? "audius") as TrackSource, url: t.id,
      deck: null, art: t.artwork ?? undefined, durationSec: t.duration || undefined, bpm: t.bpm ?? undefined, addedAt: Date.now(),
    };
    persist((d) => ({ ...d, tracks: [lt, ...d.tracks] }));
    flash("Ajouté à la bibliothèque");
  }
  // persist the whole generated set as a real playlist (Audius tracks + playlist)
  function saveAutoAsPlaylist() {
    if (!autoTracks.length) return;
    const base = autoSeed?.title ? `Auto · ${autoSeed.title}`.slice(0, 40) : "Playlist auto";
    const name = (prompt("Nom de la playlist auto ?", base) || "").trim();
    if (!name) return;
    const newTracks: LibTrack[] = autoTracks.map((t) => ({
      id: uid(), name: `${t.title} — ${t.artist}`, source: (t.source ?? "audius") as TrackSource, url: t.id,
      deck: null, art: t.artwork ?? undefined, durationSec: t.duration || undefined, bpm: t.bpm ?? undefined, addedAt: Date.now(),
    }));
    const pl = { id: uid(), name, trackIds: newTracks.map((t) => t.id), transitionSec: 12 };
    persist((d) => ({ tracks: [...newTracks, ...d.tracks], playlists: [...d.playlists, pl] }));
    setTab("playlists");
    setActivePl(pl.id);
    flash(`Playlist « ${name} » créée (${newTracks.length} titres)`);
  }

  // --- LIVE: the consecutive-play queue for a deck ---
  // If a playlist is assigned to this side, play through it IN ORDER (many
  // titles back-to-back). Otherwise fall back to the singles filed for the deck.
  function liveQueue(side: "A" | "B"): LibTrack[] {
    const plId = queueSrcRef.current[side];
    if (plId) {
      const pl = dataRef.current.playlists.find((p) => p.id === plId);
      if (pl) {
        const byId = new Map(dataRef.current.tracks.map((t) => [t.id, t]));
        const q = pl.trackIds.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
        if (q.length) return q;
      }
    }
    return dataRef.current.tracks.filter((t) => t.deck === side);
  }
  async function liveAdvance(side: "A" | "B") {
    const q = liveQueue(side);
    if (!q.length) {
      flash(`Live ${side} : aucun single classé pour ce deck`);
      return;
    }
    liveIdx.current[side] = (liveIdx.current[side] + 1) % q.length;
    setLiveCur((c) => ({ ...c, [side]: liveIdx.current[side] }));
    const t = q[liveIdx.current[side]];
    const deck = side === "A" ? engine.deckA : engine.deckB;
    await loadToDeck(t, side);
    deck.play();
    wasPlaying.current[side] = true;
  }
  function toggleLive(side: "A" | "B") {
    const next = !(side === "A" ? liveA : liveB);
    (side === "A" ? setLiveA : setLiveB)(next);
    if (next && relay) {
      setRelay(false); // the relay drives both decks — can't also run a per-deck loop
      relayRef.current = false;
      setRelayCur({ A: -1, B: -1 });
    }
    if (next) {
      const deck = side === "A" ? engine.deckA : engine.deckB;
      if (deck.playing) {
        wasPlaying.current[side] = true;
      } else {
        liveIdx.current[side] = -1;
        liveAdvance(side);
      }
    } else {
      liveIdx.current[side] = -1;
      setLiveCur((c) => ({ ...c, [side]: -1 })); // stop highlighting this deck's queue
      setQueueSrc((s) => ({ ...s, [side]: null })); // release this deck's playlist source
    }
  }

  // --- play a chosen playlist consecutively, in order -----------------------
  // Assigns the playlist as the deck's queue source, then (re)starts the LIVE
  // loop so the deck rolls through every title back-to-back, looping forever.
  function playPlaylistLive(side: "A" | "B", plId: string) {
    const next = { ...queueSrcRef.current, [side]: plId };
    setQueueSrc(next);
    queueSrcRef.current = next; // make liveQueue() see it synchronously
    if (relay) {
      setRelay(false);
      relayRef.current = false;
      setRelayCur({ A: -1, B: -1 });
    }
    (side === "A" ? setLiveA : setLiveB)(true);
    liveIdx.current[side] = -1;
    liveAdvance(side); // loads + plays the playlist's first title
    const n = liveQueue(side).length;
    flash(`File Deck ${side} : playlist (${n} titre${n > 1 ? "s" : ""})`);
  }
  // Run the A→B→A relay through one playlist on both decks (long automix set).
  function playPlaylistRelay(plId: string) {
    const next = { A: plId, B: plId };
    setQueueSrc(next);
    queueSrcRef.current = next;
    if (relay) {
      // already running — restart so both decks reload from the playlist start
      relayRef.current = false;
      setRelay(false);
      window.setTimeout(() => toggleRelay(), 80);
    } else {
      toggleRelay();
    }
  }

  // watch each live deck; when its single ends (position snaps back to ~0 while
  // stopped) load + play the next filed single, looping the queue forever.
  useEffect(() => {
    if (!liveA && !liveB) return;
    const id = window.setInterval(() => {
      (["A", "B"] as const).forEach((side) => {
        if (!(side === "A" ? liveA : liveB)) return;
        const deck = side === "A" ? engine.deckA : engine.deckB;
        if (deck.playing) {
          wasPlaying.current[side] = true;
          // pre-load the upcoming track a few seconds before this one ends —
          // no gap when liveAdvance() swaps in the freshly-warmed track below.
          const remain = deck.duration - deck.position();
          if (deck.duration > 0 && remain > 0 && remain <= livePreloadSec(side)) {
            const q = liveQueue(side);
            if (q.length) prefetchTrack(q[(liveIdx.current[side] + 1) % q.length]);
          }
          return;
        }
        // bufferLoading = streaming phase 1 (full decode still in progress).
        // During the hot-swap _playing briefly dips to false while staying in
        // phase 1 — ignore the watchdog until the buffer is fully ready so we
        // don't misread that flicker as "track ended, advance the queue".
        if (wasPlaying.current[side] && deck.duration > 0 && deck.position() < 0.5 && !deck.bufferLoading) {
          wasPlaying.current[side] = false;
          liveAdvance(side);
        }
      });
    }, 400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveA, liveB]);

  // --- A→B→A relay: alternate decks, autofading at the end of every song ---
  // Loads the next filed single onto a deck (looping its queue). `andPlay`
  // starts it; otherwise it's left cued so the relay can crossfade into it.
  async function relayLoadNext(side: "A" | "B", andPlay: boolean): Promise<boolean> {
    const q = liveQueue(side);
    if (!q.length) return false;
    // advance the SHARED pointer, not a per-side one — otherwise A and B each
    // start counting from -1 independently and both land on track 0 first.
    relayPos.current = (relayPos.current + 1) % q.length;
    relayIdx.current[side] = relayPos.current;
    const deck = side === "A" ? engine.deckA : engine.deckB;
    await loadToDeck(q[relayIdx.current[side]], side);
    if (andPlay) deck.play();
    setRelayCur({ A: relayIdx.current.A, B: relayIdx.current.B }); // refresh list markers
    return true;
  }
  // crossfade animation toward deck A (0) or B (1) — the curve/style depends on
  // `type`, inspired by the transition modes found on real DJ mixers/controllers:
  //  - fade   : classic linear crossfade (constant-rate blend)
  //  - cut    : instant hard cut, like a scratch-DJ punch-in (no blend at all)
  //  - smooth : ease-in/out S-curve — gentle at both ends, like a mixer's
  //             "slow" crossfader curve, less perceptible than a linear ramp
  //  - filter : fades AND rolls the outgoing deck off through its low-pass
  //             filter (like closing the filter knob before pulling out a
  //             track) — the classic "filter transition" DJs use to tuck a
  //             song away instead of just fading its volume
  function relayFade(to: "A" | "B", secs: number, type: TransitionType = "fade") {
    relayFading.current = true;
    const from = engine.getCrossfade();
    const target = to === "B" ? 1 : 0;
    const outDeck = to === "B" ? engine.deckA : engine.deckB;
    if (type === "cut") {
      engine.setCrossfade(target);
      relayFading.current = false;
      return;
    }
    const t0 = performance.now();
    const step = () => {
      if (!relayRef.current) {
        relayFading.current = false;
        if (type === "filter") outDeck.setFilter(0);
        return;
      }
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      const eased = type === "smooth" ? (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) : k;
      engine.setCrossfade(from + (target - from) * eased);
      if (type === "filter") outDeck.setFilter(-eased); // sweep toward closed low-pass as it fades out
      if (k < 1) requestAnimationFrame(step);
      else {
        relayFading.current = false;
        if (type === "filter") outDeck.setFilter(0); // reset — this deck gets reused for the next song
      }
    };
    requestAnimationFrame(step);
  }
  function toggleRelay() {
    const next = !relay;
    setRelay(next);
    relayRef.current = next;
    if (!next) {
      setRelayCur({ A: -1, B: -1 }); // clear "en cours" markers
      return;
    }
    // mutually exclusive with the per-deck LIVE loops
    if (liveA) setLiveA(false);
    if (liveB) setLiveB(false);
    liveIdx.current = { A: -1, B: -1 };
    setLiveCur({ A: -1, B: -1 });
    relayIdx.current = { A: -1, B: -1 };
    relayPos.current = -1;
    relayFading.current = false;
    relayArmed.current = true;
    relaySide.current = "A";
    setRelayFg("A");
    engine.setCrossfade(0); // start fully on Deck A
    (async () => {
      const okA = await relayLoadNext("A", true); // A in the foreground, playing
      const okB = await relayLoadNext("B", false); // B cued, ready to fade in
      if (!okA || !okB) {
        flash("A→B→A : classe au moins 1 single sur le Deck A et le Deck B");
        setRelay(false);
        relayRef.current = false;
        setRelayCur({ A: -1, B: -1 });
      } else {
        flash("A→B→A : automix lancé");
      }
    })();
  }

  // transition length driving the auto-mix, taken from whichever set is queued
  // on Deck A (the relay's canonical source) — falls back to a smooth default.
  function relayTransitionSec(): number {
    const plId = queueSrcRef.current.A;
    const pl = plId ? dataRef.current.playlists.find((p) => p.id === plId) : null;
    return pl?.transitionSec ?? 12;
  }
  function relayTransitionType(): TransitionType {
    const plId = queueSrcRef.current.A;
    const pl = plId ? dataRef.current.playlists.find((p) => p.id === plId) : null;
    return pl?.transitionType ?? "fade";
  }
  // preload lead-time for a given deck's LIVE loop, from whichever set drives it
  function livePreloadSec(side: "A" | "B"): number {
    const plId = queueSrcRef.current[side];
    const pl = plId ? dataRef.current.playlists.find((p) => p.id === plId) : null;
    return pl?.preloadSec ?? 5;
  }

  // Watch the foreground deck; when a song is ~ending, start the other deck and
  // autofade across to it, then cue the next single on the deck that just freed up.
  useEffect(() => {
    if (!relay) return;
    const id = window.setInterval(() => {
      if (relayFading.current || !relayArmed.current) return;
      // re-read the transition length/type/preload EVERY tick, not once when
      // the relay started — otherwise changing the style/duration mid-set
      // (a very normal thing to do) was silently ignored until stop+restart.
      const FADE = relayTransitionSec();
      const TYPE = relayTransitionType();
      const side = relaySide.current;
      const other = side === "A" ? "B" : "A";
      const preload = livePreloadSec(other);
      const deck = side === "A" ? engine.deckA : engine.deckB;
      const otherDeck = other === "A" ? engine.deckA : engine.deckB;
      if (!deck.playing || deck.duration <= 0) return;
      const remain = deck.duration - deck.position();
      const preFadeWindow = TYPE === "cut" ? Math.max(2, preload) : FADE;
      if (remain > preFadeWindow + 0.3) return;
      relayArmed.current = false;
      const secs = TYPE === "cut" ? 0 : Math.min(FADE, Math.max(2, remain));
      otherDeck.play(); // bring in the cued deck
      relayFade(other, Math.max(secs, 0.05), TYPE);
      relaySide.current = other;
      setRelayFg(other); // the incoming deck is now "en cours" in the list
      // once the fade is done, stop the old deck and cue its next single
      window.setTimeout(() => {
        if (!relayRef.current) return;
        deck.pause();
        deck.setFilter(0); // reset — this deck gets reused for the next song
        relayLoadNext(side, false).then(() => {
          relayArmed.current = true;
        });
      }, (secs + 0.4) * 1000);
    }, 300);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relay]);

  // Jump a deck to the previous / next single filed for it (loops the queue).
  // Works standalone and keeps the LIVE / relay indices in sync so an active
  // auto-loop continues from where you skipped to. Preserves play/pause state.
  async function stepSingle(side: "A" | "B", dir: 1 | -1) {
    const q = liveQueue(side);
    if (!q.length) {
      flash(`Deck ${side} : aucun single classé`);
      return;
    }
    const deck = side === "A" ? engine.deckA : engine.deckB;
    let cur = liveIdx.current[side];
    if (cur < 0 || cur >= q.length) cur = q.findIndex((t) => t.id === deck.origin?.id);
    const base = cur < 0 ? (dir > 0 ? -1 : 0) : cur;
    const ni = (base + dir + q.length) % q.length;
    liveIdx.current[side] = ni;
    relayIdx.current[side] = ni;
    setLiveCur((c) => ({ ...c, [side]: ni }));
    setRelayCur({ A: relayIdx.current.A, B: relayIdx.current.B });
    const wasPlay = deck.playing;
    await loadToDeck(q[ni], side);
    if (wasPlay) deck.play();
  }

  const COLOR_A = "#ffcc00";
  const COLOR_B = "#ffcc00";

  // While LIVE is on for a deck, figure out which filed single is playing now and
  // which one is queued next, so the list can mark "en cours" and blink "à suivre"
  // in that deck's colour.
  function liveMark(side: "A" | "B"): { cur: string | null; next: string | null } {
    const q = data.tracks.filter((t) => t.deck === side);
    if (q.length === 0) return { cur: null, next: null };
    // A→B→A relay: foreground deck = playing now, the other = cued next (blinks)
    if (relay) {
      const i = relayCur[side];
      if (i < 0 || i >= q.length) return { cur: null, next: null };
      const id = q[i].id;
      return side === relayFg ? { cur: id, next: null } : { cur: null, next: id };
    }
    const on = side === "A" ? liveA : liveB;
    if (!on) return { cur: null, next: null };
    const i = liveCur[side];
    const cur = i >= 0 && i < q.length ? q[i].id : null;
    const next = q[((i < 0 ? -1 : i) + 1) % q.length]?.id ?? null;
    return { cur, next };
  }
  const markA = liveMark("A");
  const markB = liveMark("B");

  // one stored-track row
  const TrackRow = ({
    t,
    plId,
    idx,
    count,
  }: {
    t: LibTrack;
    plId?: string;
    idx?: number; // 0-based position when shown inside a playlist
    count?: number; // playlist length, to disable the last "↓"
  }) => {
    const badge = SRC_BADGE[t.source];
    const hasStems = !!t.stemHash && stemSet.has(t.stemHash);
    const inPl = plId != null && idx != null && count != null;
    // playing-now / next-up status for the deck-colour cues
    const curSide = markA.cur === t.id ? "A" : markB.cur === t.id ? "B" : null;
    const nextSide = markA.next === t.id ? "A" : markB.next === t.id ? "B" : null;
    const cueColor = (s: "A" | "B") => (s === "A" ? COLOR_A : COLOR_B);
    return (
      <li
        className={`flex flex-wrap items-center gap-2 rounded bg-neutral-800/40 px-2 py-1.5 hover:bg-neutral-800/70 ${
          nextSide ? "lib-next-blink" : ""
        }`}
        style={{
          ...(nextSide ? { ["--cue" as string]: cueColor(nextSide) } : {}),
          ...(curSide && !nextSide
            ? { boxShadow: `inset 3px 0 0 ${cueColor(curSide)}, 0 0 8px ${cueColor(curSide)}55` }
            : {}),
        }}
      >
        {/* position number + reorder arrows — only inside a playlist, so the
            chain order can be arranged like a real setlist */}
        {inPl && (
          <div className="flex shrink-0 items-center gap-1">
            <span
              className="w-5 text-right text-[11px] font-black tabular-nums text-violet-300"
              title="Position dans la file"
            >
              {idx! + 1}
            </span>
            <div className="flex flex-col">
              <button
                onClick={() => moveInPlaylist(plId!, t.id, -1)}
                disabled={idx === 0}
                className="px-1 text-[9px] leading-none text-neutral-400 disabled:opacity-20"
                title="Monter dans la file"
              >
                ▲
              </button>
              <button
                onClick={() => moveInPlaylist(plId!, t.id, 1)}
                disabled={idx === count! - 1}
                className="px-1 text-[9px] leading-none text-neutral-400 disabled:opacity-20"
                title="Descendre dans la file"
              >
                ▼
              </button>
            </div>
          </div>
        )}

        {/* cover thumbnail */}
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-neutral-900">
          {t.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.art} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl text-neutral-600">
              ♫
            </div>
          )}
        </div>

        {/* deck filing chips — which deck's "LIVE loop" this single belongs to
            when no set is queued. Only shown in the raw library: inside a set
            the order below already says everything about how it plays. */}
        {!inPl && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="text-[7px] uppercase leading-none text-neutral-600">Classer</span>
            <div className="flex overflow-hidden rounded ring-1 ring-neutral-700">
              {(["A", "B"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => fileFor(t, t.deck === d ? null : d)}
                  className="px-1.5 py-0.5 text-[10px] font-black"
                  style={{
                    color: t.deck === d ? "#0a0a0a" : d === "A" ? COLOR_A : COLOR_B,
                    background: t.deck === d ? (d === "A" ? COLOR_A : COLOR_B) : "transparent",
                  }}
                  title={`Classer ce single pour le Deck ${d} (lecture en boucle solo, sans set)`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* name + meta */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-neutral-100">{t.name}</div>
          <div className="flex items-center gap-1.5 text-[9px]">
            {typeof t.durationSec === "number" && (
              <span className="font-mono text-neutral-400">{fmt(t.durationSec)}</span>
            )}
            {typeof t.bpm === "number" && (
              <span className="font-mono text-amber-400">{Math.round(t.bpm)} BPM</span>
            )}
            {curSide && (
              <span className="font-black" style={{ color: cueColor(curSide) }}>
                ▶ EN COURS {curSide}
              </span>
            )}
            {nextSide && (
              <span className="font-black" style={{ color: cueColor(nextSide) }}>
                ⏭ À SUIVRE {nextSide}
              </span>
            )}
            <span className="font-bold" style={{ color: badge.color }}>
              {badge.label}
            </span>
            {hasStems && (
              <span
                className="rounded-sm px-1 font-black"
                style={{ color: "#0a0a0a", background: "#22d3ee" }}
                title="Stems déjà séparés — rechargement instantané"
              >
                ✂ STEMS
              </span>
            )}
            {t.fxA && <span style={{ color: COLOR_A }}>● FX A</span>}
            {t.fxB && <span style={{ color: COLOR_B }}>● FX B</span>}
          </div>
        </div>

        {/* load — each button only disables ITSELF while loading, so a slow or
            failed send never locks out the other rows/decks. Hidden inside a
            set: use the set's own ▶ Deck A/B/Relais controls instead. */}
        {!inPl && (
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="text-[7px] uppercase leading-none text-neutral-600">Charger</span>
          <div className="flex gap-1">
        <button
          onClick={() => loadToDeck(t, "A")}
          disabled={busy === t.id + "A"}
          className="hw-btn px-2 py-1 text-xs disabled:opacity-40"
          style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
        >
          {busy === t.id + "A" ? "…" : "→ A"}
        </button>
        <button
          onClick={() => loadToDeck(t, "B")}
          disabled={busy === t.id + "B"}
          className="hw-btn px-2 py-1 text-xs disabled:opacity-40"
          style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
        >
          {busy === t.id + "B" ? "…" : "→ B"}
        </button>
          </div>
        </div>
        )}

        {/* FX capture / apply — hidden inside a set for the same reason */}
        {!inPl && (
        <div className="flex items-center gap-0.5 rounded bg-neutral-900/60 px-1 py-0.5">
          <span className="text-[8px] font-bold uppercase text-neutral-500">FX</span>
          <button
            onClick={() => captureFx(t, "A")}
            className="px-1 text-[11px]"
            style={{ color: COLOR_A }}
            title="Capturer les FX du deck A pour ce morceau"
          >
            ⊕A
          </button>
          <button
            onClick={() => applyFx(t, "A")}
            className="px-1 text-[11px]"
            style={{ color: COLOR_A, opacity: t.fxA ? 1 : 0.35 }}
            title="Appliquer les FX A enregistrés"
          >
            ▸A
          </button>
          <button
            onClick={() => captureFx(t, "B")}
            className="px-1 text-[11px]"
            style={{ color: COLOR_B }}
            title="Capturer les FX du deck B pour ce morceau"
          >
            ⊕B
          </button>
          <button
            onClick={() => applyFx(t, "B")}
            className="px-1 text-[11px]"
            style={{ color: COLOR_B, opacity: t.fxB ? 1 : 0.35 }}
            title="Appliquer les FX B enregistrés"
          >
            ▸B
          </button>
        </div>
        )}

        {plId ? (
          <button
            onClick={() => toggleInPlaylist(plId, t.id)}
            className="hw-btn px-1.5 py-1 text-xs text-neutral-400"
            title="Retirer du set"
          >
            −
          </button>
        ) : (
          <>
            {/* one click adds this track to whichever set is currently open —
                no more hunting for a separate "add from library" list */}
            {activePl && !activePlaylist?.trackIds.includes(t.id) && (
              <button
                onClick={() => toggleInPlaylist(activePl, t.id)}
                className="hw-btn px-2 py-1 text-xs font-bold text-amber-300"
                style={{ ["--led" as string]: "#ffcc00" }}
                title={`Ajouter à « ${activePlaylist?.name ?? "…"} »`}
              >
                + Set
              </button>
            )}
            <button
              type="button"
              onClick={() => del(t)}
              className="hw-btn shrink-0 px-2 py-1 text-sm font-bold text-red-400 hover:bg-red-500/20"
              style={{ ["--led" as string]: "#ef4444" }}
              title="Supprimer définitivement de la bibliothèque"
            >
              🗑 Effacer
            </button>
          </>
        )}
      </li>
    );
  };

  const activePlaylist = data.playlists.find((p) => p.id === activePl) ?? null;
  const trackById = (id: string) => data.tracks.find((t) => t.id === id);

  // ===== PLAYLIST WORKSPACE — extracted so it can render in a right-hand
  // column (splitLayout) instead of only inline under the "Sets" tab =====
  const playlistsPanel = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {data.playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePl(p.id)}
            className={`hw-btn px-3 py-1 text-sm ${activePl === p.id ? "hw-btn-on" : "text-neutral-300"}`}
            style={{ ["--led" as string]: "#a78bfa" }}
          >
            {p.name} ({p.trackIds.length})
          </button>
        ))}
        <button onClick={newPlaylist} className="hw-btn px-3 py-1 text-sm text-violet-300">
          + Nouveau set
        </button>
      </div>

      {activePlaylist ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-violet-300">{activePlaylist.name}</span>
              <span className="text-[10px] text-neutral-500">
                {activePlaylist.trackIds.length} titre{activePlaylist.trackIds.length > 1 ? "s" : ""}
                {" · "}
                {fmt(
                  activePlaylist.trackIds.reduce((sum, id) => sum + (trackById(id)?.durationSec ?? 0), 0)
                )}{" "}
                au total
              </span>
            </div>
            <button
              onClick={() => delPlaylist(activePlaylist.id)}
              className="hw-btn px-2 py-0.5 text-[11px] text-neutral-500"
            >
              Supprimer le set
            </button>
          </div>

          {/* transition duration — the crossfade length used between every
              track when this set plays as A→B→A automix */}
          <div className="flex items-center gap-2 rounded bg-neutral-800/40 px-2 py-1.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Transition
            </span>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={activePlaylist.transitionSec ?? 12}
              onChange={(e) => setTransition(activePlaylist.id, parseInt(e.target.value, 10))}
              className="flex-1 accent-violet-400"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-violet-300">
              {activePlaylist.transitionSec ?? 12}s
            </span>
          </div>

          {/* transition style — how the outgoing track hands off to the next one */}
          <div className="flex flex-wrap items-center gap-1.5 rounded bg-neutral-800/40 px-2 py-1.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Style
            </span>
            {TRANSITION_TYPES.map((tt) => (
              <button
                key={tt.key}
                onClick={() => setTransitionType(activePlaylist.id, tt.key)}
                title={tt.hint}
                className={`rounded px-2 py-1 text-[11px] font-bold transition-colors ${
                  (activePlaylist.transitionType ?? "fade") === tt.key
                    ? "bg-violet-500 text-white"
                    : "bg-neutral-900/60 text-neutral-400 hover:text-violet-300"
                }`}
              >
                {tt.label}
              </button>
            ))}
          </div>

          {/* preload lead-time — how many seconds before a track ends the app
              starts warming the next one, so the hand-off has no loading gap */}
          <div
            className="flex items-center gap-2 rounded bg-neutral-800/40 px-2 py-1.5"
            title="Précharge le morceau suivant N secondes avant la fin du morceau en cours — évite tout blanc au changement (essentiel en LIVE mono-deck ; le relais A→B→A précharge déjà en avance)"
          >
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              ⏱ Préchargement
            </span>
            <input
              type="range"
              min={2}
              max={10}
              step={1}
              value={activePlaylist.preloadSec ?? 5}
              onChange={(e) => setPreloadSec(activePlaylist.id, parseInt(e.target.value, 10))}
              className="flex-1 accent-violet-400"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-violet-300">
              {activePlaylist.preloadSec ?? 5}s
            </span>
          </div>

          {/* play this whole playlist consecutively — right now, on a deck, or as A→B→A automix */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-600">
              Jouer maintenant :
            </span>
            <button
              onClick={() => playPlaylistLive("A", activePlaylist.id)}
              disabled={activePlaylist.trackIds.length === 0}
              className={`hw-btn px-2 py-1 text-[11px] font-bold disabled:opacity-40 ${queueSrc.A === activePlaylist.id && liveA ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: COLOR_A, color: queueSrc.A === activePlaylist.id && liveA ? undefined : COLOR_A }}
              title="Enchaîne tous les titres du set sur le Deck A, en boucle"
            >
              ▶ Deck A
            </button>
            <button
              onClick={() => playPlaylistLive("B", activePlaylist.id)}
              disabled={activePlaylist.trackIds.length === 0}
              className={`hw-btn px-2 py-1 text-[11px] font-bold disabled:opacity-40 ${queueSrc.B === activePlaylist.id && liveB ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: COLOR_B, color: queueSrc.B === activePlaylist.id && liveB ? undefined : COLOR_B }}
              title="Enchaîne tous les titres du set sur le Deck B, en boucle"
            >
              ▶ Deck B
            </button>
            <button
              onClick={() => playPlaylistRelay(activePlaylist.id)}
              disabled={activePlaylist.trackIds.length === 0}
              className={`hw-btn px-2 py-1 text-[11px] font-bold disabled:opacity-40 ${relay && queueSrc.A === activePlaylist.id ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: relay && queueSrc.A === activePlaylist.id ? undefined : "#a78bfa" }}
              title="Automix A→B→A : enchaîne le set en fondu entre les deux decks, avec la durée de transition réglée ci-dessus"
            >
              ⇄ Relais A→B→A
            </button>
          </div>

          {/* retro CD-player face — appears once this set is actively driving a
              deck: spinning disc, LCD track/time/BPM readout, progress bar and
              next-up preview, plus the classic ⏮ ▶/⏸ ⏭ transport — makes it
              obvious at a glance what's playing and what's coming up next. */}
          {(["A", "B"] as const).map((side) => {
            if (queueSrc[side] !== activePlaylist.id) return null;
            const deck = side === "A" ? engine.deckA : engine.deckB;
            const color = side === "A" ? COLOR_A : COLOR_B;
            const curIdx = activePlaylist.trackIds.findIndex((id) => id === deck.origin?.id);
            const nextT = curIdx >= 0 ? trackById(activePlaylist.trackIds[(curIdx + 1) % activePlaylist.trackIds.length]) : null;
            return (
              <CdPlayerFace
                key={side}
                deck={deck}
                color={color}
                side={side}
                trackNo={curIdx >= 0 ? curIdx + 1 : undefined}
                trackCount={activePlaylist.trackIds.length}
                nextName={nextT?.name ?? null}
                onPrev={() => stepSingle(side, -1)}
                onPlayPause={() => (deck.playing ? deck.pause() : deck.play())}
                onNext={() => stepSingle(side, 1)}
              />
            );
          })}

          <ul className={`flex flex-col gap-1 overflow-y-auto ${splitLayout ? "max-h-[28rem]" : "max-h-48"}`}>
            {activePlaylist.trackIds.length === 0 && (
              <p className="py-3 text-center text-xs text-neutral-600">
                Set vide — ajoute des morceaux ci-dessous, dans l&apos;ordre où ils doivent s&apos;enchaîner.
              </p>
            )}
            {activePlaylist.trackIds.map((id, i) => {
              const t = trackById(id);
              return t ? (
                <TrackRow key={id} t={t} plId={activePlaylist.id} idx={i} count={activePlaylist.trackIds.length} />
              ) : null;
            })}
          </ul>
          {data.tracks.some((t) => !activePlaylist.trackIds.includes(t.id)) && (
            <div className="flex items-center justify-between rounded bg-neutral-800/30 px-2 py-1.5">
              <span className="text-[10px] text-neutral-500">
                Clique <span className="rounded bg-neutral-900/60 px-1 font-bold text-amber-300">+ Set</span> sur
                n&apos;importe quel morceau (à gauche) pour l&apos;ajouter ici.
              </span>
              <button
                onClick={() => addAllToPlaylist(activePlaylist.id)}
                className="hw-btn shrink-0 px-2 py-0.5 text-[11px] text-violet-300"
                title="Ajouter tous les morceaux de la bibliothèque à ce set"
              >
                + Tout ajouter
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-neutral-600">Choisis un set ou crée-en un nouveau.</p>
      )}
    </div>
  );

  return (
    <div className="zoom-zone hw-screwed hw-panel flex flex-1 flex-col gap-3 p-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-[0.2em] text-neutral-300">
            ♫ Bibliothèque
          </span>
          <span className="text-[10px] text-neutral-600">
            {data.tracks.length} morceaux · {data.playlists.length} set{data.playlists.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Deck A : single précédent · LIVE · single suivant */}
          <button
            onClick={() => stepSingle("A", -1)}
            className="hw-btn px-1.5 py-1 text-xs"
            style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
            title="Deck A : single précédent (classés A)"
          >
            ⏮
          </button>
          <button
            onClick={() => toggleLive("A")}
            className={`hw-btn px-2 py-1 text-xs ${liveA ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: COLOR_A, color: liveA ? undefined : COLOR_A }}
            title="LIVE Deck A : enchaîne en continu les singles classés A (boucle la file)"
          >
            {liveA ? "● LIVE A" : "○ LIVE A"}
          </button>
          <button
            onClick={() => stepSingle("A", 1)}
            className="hw-btn px-1.5 py-1 text-xs"
            style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
            title="Deck A : single suivant (classés A)"
          >
            ⏭
          </button>
          {/* Deck B : single précédent · LIVE · single suivant */}
          <button
            onClick={() => stepSingle("B", -1)}
            className="hw-btn px-1.5 py-1 text-xs"
            style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
            title="Deck B : single précédent (classés B)"
          >
            ⏮
          </button>
          <button
            onClick={() => toggleLive("B")}
            className={`hw-btn px-2 py-1 text-xs ${liveB ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: COLOR_B, color: liveB ? undefined : COLOR_B }}
            title="LIVE Deck B : enchaîne en continu les singles classés B (boucle la file)"
          >
            {liveB ? "● LIVE B" : "○ LIVE B"}
          </button>
          <button
            onClick={() => stepSingle("B", 1)}
            className="hw-btn px-1.5 py-1 text-xs"
            style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
            title="Deck B : single suivant (classés B)"
          >
            ⏭
          </button>
          <button
            onClick={toggleRelay}
            className={`hw-btn px-2 py-1 text-xs ${relay ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: "#22d3ee" }}
            title="AUTOMIX A→B→A : joue le Deck A, puis bascule en autofade sur le Deck B en fin de morceau, puis revient sur A… en boucle"
          >
            <span style={{ color: COLOR_A }}>A</span>
            <span className="text-neutral-500">→</span>
            <span style={{ color: COLOR_B }}>B</span>
            <span className="text-neutral-500">→</span>
            <span style={{ color: COLOR_A }}>A</span>
          </button>
          {/* quick set launcher — play a saved playlist right from the header,
              without switching into the "Sets" tab first */}
          {data.playlists.length > 0 && (
            <div className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-1">
              <select
                value={activePl ?? ""}
                onChange={(e) => setActivePl(e.target.value || null)}
                className="rounded bg-neutral-800 px-1.5 py-1 text-xs text-violet-300 outline-none ring-1 ring-neutral-700"
                title="Choisir un set à lancer"
              >
                <option value="" disabled>
                  Set…
                </option>
                {data.playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.trackIds.length})
                  </option>
                ))}
              </select>
              <button
                onClick={() => activePl && playPlaylistLive("A", activePl)}
                disabled={!activePl}
                className="hw-btn px-1.5 py-1 text-xs disabled:opacity-30"
                style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
                title="Lancer ce set sur le Deck A, maintenant"
              >
                ▶A
              </button>
              <button
                onClick={() => activePl && playPlaylistLive("B", activePl)}
                disabled={!activePl}
                className="hw-btn px-1.5 py-1 text-xs disabled:opacity-30"
                style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
                title="Lancer ce set sur le Deck B, maintenant"
              >
                ▶B
              </button>
              <button
                onClick={() => activePl && playPlaylistRelay(activePl)}
                disabled={!activePl}
                className="hw-btn px-1.5 py-1 text-xs disabled:opacity-30"
                style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
                title="Relais A→B→A avec ce set, maintenant"
              >
                ⇄
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hw-btn px-2 py-0.5 text-xs text-neutral-400"
          >
            {collapsed ? "▼ Ouvrir" : "▲ Replier"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ===== affiche : cover of the active single on each deck ===== */}
          <div className="flex gap-3">
            {(["A", "B"] as const).map((side) => {
              const a = active[side];
              const color = side === "A" ? COLOR_A : COLOR_B;
              // while LIVE is on, peek at the next queued single for this deck
              const live = side === "A" ? liveA : liveB;
              const mark = side === "A" ? markA : markB;
              const nextT = live && mark.next ? trackById(mark.next) : null;
              return (
                <div
                  key={side}
                  className="flex flex-1 items-center gap-3 rounded-lg bg-black/40 p-2 ring-1"
                  style={{ ["--led" as string]: color, boxShadow: `inset 0 0 0 1px ${color}33` }}
                >
                  <div
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-800"
                    style={{ boxShadow: `0 0 12px ${color}55` }}
                  >
                    {a?.art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.art} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-2xl"
                        style={{ color }}
                      >
                        ♫
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
                      Deck {side}
                    </div>
                    <div className="truncate text-sm text-neutral-100">
                      {a?.name ?? "— aucun single —"}
                    </div>
                  </div>
                  {/* LIVE : aperçu du single suivant (petite pochette + titre) */}
                  {nextT && (
                    <div
                      className="lib-next-blink flex shrink-0 items-center gap-2 rounded-md bg-black/50 px-2 py-1"
                      style={{ ["--cue" as string]: color, boxShadow: `inset 0 0 0 1px ${color}55` }}
                      title={`À suivre sur le Deck ${side} : ${nextT.name}`}
                    >
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-[8px] font-black uppercase" style={{ color }}>
                          ⏭ À suivre
                        </span>
                        <span className="max-w-[7rem] truncate text-[10px] text-neutral-300">
                          {nextT.name}
                        </span>
                      </div>
                      <div
                        className="h-9 w-9 shrink-0 overflow-hidden rounded bg-neutral-800"
                        style={{ boxShadow: `0 0 8px ${color}66` }}
                      >
                        {nextT.art ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={nextT.art} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center text-base"
                            style={{ color }}
                          >
                            ♫
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={splitLayout ? "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start" : "contents"}>
          <div className="flex flex-col gap-3">

          {/* tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["files", "⤓ Mes fichiers", "#9ca3af"],
                // "Sets" is redundant in splitLayout — the right column already
                // always shows the current set, so hide the duplicate entry point.
                ...(splitLayout ? [] : [["playlists", "🎚 Sets", "#a78bfa"] as const]),
                ["audius", "♫ Audius", COLOR_B],
                ["youtube", "▶ YouTube", "#ef4444"],
                ["soundcloud", "☁ SoundCloud", "#ff7700"],
                ["deezer", "◆ Deezer", "#a238ff"],
                ["auto", "✨ Auto-IA", "#e879f9"],
              ] as const
            ).map(([key, label, color]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`hw-btn px-3 py-1 text-sm ${tab === key ? "hw-btn-on" : "text-neutral-300"}`}
                style={{ ["--led" as string]: color }}
              >
                {label}
              </button>
            ))}
            {tab === "files" && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={delAll}
                  disabled={data.tracks.length === 0}
                  className="hw-btn px-3 py-1 text-sm font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-30"
                  style={{ ["--led" as string]: "#ef4444" }}
                  title="Effacer tous les morceaux de la bibliothèque"
                >
                  🗑 Tout effacer
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="hw-btn hw-btn-on px-3 py-1 text-sm"
                  style={{ ["--led" as string]: COLOR_A }}
                >
                  + Importer
                </button>
              </div>
            )}
          </div>

          {msg && (
            <div className="rounded bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
              {msg}
            </div>
          )}

          {/* ===== FILES ===== */}
          {tab === "files" && (
            <ul className={`flex flex-col gap-1 overflow-y-auto ${splitLayout ? "max-h-[34rem]" : "max-h-80"}`}>
              {data.tracks.length === 0 && (
                <p className="py-6 text-center text-sm text-neutral-600">
                  Aucun morceau. Clique sur « + Importer » pour ajouter des MP3 / WAV, ou
                  enregistre des trouvailles Audius / YouTube.
                </p>
              )}
              {data.tracks.map((t) => (
                <TrackRow key={t.id} t={t} />
              ))}
            </ul>
          )}

          {/* PLAYLISTS panel now lives in `playlistsPanel` (see above `return`) —
              rendered inline here when not splitLayout, or in the right column when it is. */}
          {!splitLayout && tab === "playlists" && playlistsPanel}

          {/* ===== ONLINE catalogue search (Audius / YouTube / SoundCloud / Deezer) ===== */}
          {(tab === "audius" || tab === "youtube" || tab === "soundcloud" || tab === "deezer") && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder={
                    tab === "youtube"
                      ? "Rechercher une chanson sur YouTube…"
                      : tab === "soundcloud"
                        ? "Rechercher un titre sur SoundCloud…"
                        : tab === "deezer"
                          ? "Rechercher sur Deezer (aperçu 30s)…"
                          : "Rechercher un titre, un artiste…"
                  }
                  className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-[#ffcc00]"
                />
                <button
                  onClick={() => search()}
                  disabled={loading}
                  className="hw-btn hw-btn-on px-4 py-2 text-sm disabled:opacity-50"
                  style={{ ["--led" as string]: SRC_BADGE[tab as TrackSource]?.color ?? COLOR_B }}
                >
                  {loading ? "…" : "Chercher"}
                </button>
              </div>
              {(tab === "youtube" || tab === "soundcloud") && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-0.5 text-[10px] uppercase tracking-wide text-neutral-500">Durée</span>
                  {DUR_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => { setDurKey(f.key); if (q.trim()) search(f.key); }}
                      className="rounded px-2 py-1 text-[11px] transition-colors"
                      style={
                        durKey === f.key
                          ? { background: tab === "soundcloud" ? "#ff7700" : "#ef4444", color: "#fff" }
                          : { background: "rgba(255,255,255,0.05)", color: "#bbb" }
                      }
                      title={`Filtrer : ${f.label} — élargit le choix`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              <ul className={`flex flex-col gap-1 overflow-y-auto ${splitLayout ? "max-h-[34rem]" : "max-h-72"}`}>
                {results.length === 0 && !loading && (
                  <p className="py-6 text-center text-sm text-neutral-600">
                    {tab === "youtube"
                      ? "L'audio YouTube est importé (sans vidéo) et passe dans le mixeur."
                      : tab === "soundcloud"
                        ? "L'audio SoundCloud est importé et passe dans le mixeur."
                        : tab === "deezer"
                          ? "Deezer ne fournit qu'un aperçu de 30s (catalogue protégé)."
                          : "Explore le catalogue libre Audius."}
                  </p>
                )}
                {results.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded bg-neutral-800/50 p-2 hover:bg-neutral-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.artwork ?? ""}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded bg-neutral-700 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-100">{t.title}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {t.artist} · {fmt(t.duration)}
                        {t.bpm ? ` · ${t.bpm} BPM` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        generateAuto({
                          id: tab === "audius" ? t.id : undefined,
                          title: t.title,
                          artist: t.artist,
                          genre: t.genre,
                          bpm: t.bpm,
                        })
                      }
                      className="hw-btn px-2 py-1 text-xs"
                      style={{ ["--led" as string]: "#e879f9", color: "#e879f9" }}
                      title="Générer une playlist auto (style + BPM proches)"
                    >
                      ✨ Auto
                    </button>
                    <button
                      onClick={() => saveResult(t)}
                      className="hw-btn px-2 py-1 text-xs text-neutral-300"
                      title="Enregistrer dans la bibliothèque"
                    >
                      ＋ Lib
                    </button>
                    <button
                      onClick={() => loadResult(t, "A")}
                      disabled={busy === t.id + "A"}
                      className="hw-btn px-2 py-1 text-xs disabled:opacity-40"
                      style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
                    >
                      {busy === t.id + "A" ? "…" : "→ A"}
                    </button>
                    <button
                      onClick={() => loadResult(t, "B")}
                      disabled={busy === t.id + "B"}
                      className="hw-btn px-2 py-1 text-xs disabled:opacity-40"
                      style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
                    >
                      {busy === t.id + "B" ? "…" : "→ B"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ===== AUTO-IA : playlist auto par similarité (style / BPM / son) ===== */}
          {tab === "auto" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-300">
                  ✨ Playlist auto IA
                </span>
                <span className="text-[10px] text-neutral-500">
                  Graine ← un titre Audius (bouton ✨) ou un deck chargé. On classe par genre + BPM proches.
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const next = !sameArtist;
                      setSameArtist(next);
                      if (autoSeed) generateAuto(autoSeed, { sameArtist: next });
                    }}
                    className={`hw-btn px-2 py-1 text-xs ${sameArtist ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: "#e879f9", color: sameArtist ? "#0a0a0a" : "#e879f9" }}
                    title="Restreindre la sélection au même groupe / chanteur que la graine"
                  >
                    🎤 Même artiste{sameArtist ? " ✓" : ""}
                  </button>
                  <button
                    onClick={() => seedFromDeck("A")}
                    className="hw-btn px-2 py-1 text-xs"
                    style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
                    title="Générer à partir du morceau du Deck A"
                  >
                    ✨ ← Deck A
                  </button>
                  <button
                    onClick={() => seedFromDeck("B")}
                    className="hw-btn px-2 py-1 text-xs"
                    style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
                    title="Générer à partir du morceau du Deck B"
                  >
                    ✨ ← Deck B
                  </button>
                </div>
              </div>

              {/* seed card */}
              {autoSeed && (
                <div className="flex items-center gap-2 rounded bg-fuchsia-500/10 px-3 py-2 ring-1 ring-fuchsia-500/30">
                  <span className="text-lg">◎</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-neutral-100">{autoSeed.title}</div>
                    <div className="truncate text-[11px] text-neutral-400">
                      Graine{autoSeed.artist ? ` · ${autoSeed.artist}` : ""}
                      {autoSeed.genre ? ` · ${autoSeed.genre}` : ""}
                      {autoSeed.bpm ? ` · ${Math.round(autoSeed.bpm)} BPM` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black"
                    style={{ color: "#0a0a0a", background: sameArtist ? "#e879f9" : autoUsedAI ? "#e879f9" : "#6b7280" }}
                    title={sameArtist ? "Restreint au même artiste — Audius + YouTube" : autoUsedAI ? "Suggestions élargies par l'IA (Groq) — sources Audius + YouTube" : "IA non configurée — similarité Audius + YouTube (tendances + liés + BPM)"}>
                    {sameArtist ? "🎤 MÊME ARTISTE" : autoUsedAI ? "IA · AUDIUS+YT" : "AUDIUS+YT"}
                  </span>
                  {autoTracks.length > 0 && (
                    <button
                      onClick={saveAutoAsPlaylist}
                      className="hw-btn hw-btn-on shrink-0 px-3 py-1 text-xs"
                      style={{ ["--led" as string]: "#e879f9" }}
                      title="Enregistrer toute la sélection comme playlist"
                    >
                      ≣ Enregistrer la playlist
                    </button>
                  )}
                </div>
              )}

              {autoLoading && (
                <p className="py-6 text-center text-sm text-fuchsia-300">
                  ✨ Génération de la playlist… (analyse style + BPM)
                </p>
              )}

              {!autoLoading && !autoSeed && (
                <p className="py-6 text-center text-sm text-neutral-600">
                  Cherche un titre dans l&apos;onglet ♫ Audius et clique sur « ✨ Auto », ou pars d&apos;un
                  morceau chargé sur un deck. L&apos;IA proposera des singles proches en style, BPM et son.
                </p>
              )}

              {!autoLoading && autoTracks.length > 0 && (
                <ul className={`flex flex-col gap-1 overflow-y-auto ${splitLayout ? "max-h-[34rem]" : "max-h-72"}`}>
                  {autoTracks.map((t) => {
                    const seedBpm = autoSeed?.bpm ?? null;
                    const close = seedBpm && t.bpm ? Math.abs(seedBpm - t.bpm) <= 4 : false;
                    return (
                      <li key={t.id} className="flex items-center gap-3 rounded bg-neutral-800/50 p-2 hover:bg-neutral-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.artwork ?? ""} alt="" className="h-10 w-10 shrink-0 rounded bg-neutral-700 object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="shrink-0 rounded-sm px-1 text-[8px] font-black"
                              style={
                                t.source === "youtube"
                                  ? { color: "#fff", background: "#ef4444" }
                                  : { color: "#06281e", background: COLOR_B }
                              }
                            >
                              {t.source === "youtube" ? "YT" : "AUDIUS"}
                            </span>
                            <span className="truncate text-sm text-neutral-100">{t.title}</span>
                          </div>
                          <div className="truncate text-xs text-neutral-500">
                            {t.artist} · {fmt(t.duration)}
                            {t.genre ? ` · ${t.genre}` : ""}
                            {t.bpm ? (
                              <span style={close ? { color: "#ffcc00", fontWeight: 700 } : undefined}>
                                {" · "}{t.bpm} BPM{close ? " ✓" : ""}
                              </span>
                            ) : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => generateAuto({ id: t.source === "youtube" ? undefined : t.id, title: t.title, artist: t.artist, genre: t.genre, bpm: t.bpm })}
                          className="hw-btn px-2 py-1 text-xs"
                          style={{ ["--led" as string]: "#e879f9", color: "#e879f9" }}
                          title="Rebondir : nouvelle playlist à partir de ce titre"
                        >
                          ✨
                        </button>
                        <button onClick={() => saveAutoTrack(t)} className="hw-btn px-2 py-1 text-xs text-neutral-300" title="Enregistrer dans la bibliothèque">
                          ＋ Lib
                        </button>
                        <button
                          onClick={() => loadAutoTrack(t, "A")}
                          disabled={busy === t.id + "A"}
                          className="hw-btn px-2 py-1 text-xs disabled:opacity-40"
                          style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
                        >
                          {busy === t.id + "A" ? "…" : "→ A"}
                        </button>
                        <button
                          onClick={() => loadAutoTrack(t, "B")}
                          disabled={busy === t.id + "B"}
                          className="hw-btn px-2 py-1 text-xs disabled:opacity-40"
                          style={{ ["--led" as string]: COLOR_B, color: COLOR_B }}
                        >
                          {busy === t.id + "B" ? "…" : "→ B"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          </div>
          {splitLayout && (
            <div className="flex flex-col gap-3">
              {playlistsPanel}
            </div>
          )}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) importFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export const MediaLibrary = memo(MediaLibraryImpl);
