"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { DJEngine } from "@/lib/audio/engine";
import {
  LibraryData,
  LibTrack,
  TrackSource,
  TransitionType,
  loadLibrary,
  loadPlaylistTrash,
  saveLibrary,
  uid,
  idbPutBlob,
  idbGetBlob,
  idbDelBlob,
  extractCover,
  auditLibrary,
  removeOrphanBlobs,
  storageUsage,
  wasLastSaveSlim,
  type LibraryAudit,
  type Playlist,
} from "@/lib/library";
import { enqueuePrep, getPrepState, getPreparedStems, PREP_OPTS, subscribePrep } from "@/lib/stemPrep";
import { queueAnalysis } from "@/lib/analyze";
import { pickNext, type Cue } from "@/lib/setPicker";
import { AudiusTrack } from "@/lib/audius";
import { CdPlayerFace } from "./CdPlayerFace";
import { buildSet, type SetArc } from "@/lib/setBuilder";
import { PlaylistStudio } from "./playlist/PlaylistStudio";
import type { DeckInfo, DeckLive, Side as PlSide, StemInfo, TrackMark } from "./playlist/types";
import { fmtDur } from "./prep/parts";
import { thumbSrc } from "@/lib/thumb";
import { SetWizard, type SetDraft, type WizardInitial } from "./playlist/SetWizard";
import { buildJourney } from "./prep/Journey";
import { analyzeLibraryTrack } from "@/lib/analyzeTrack";
import { alignDelaySec } from "@/lib/audio/beatAlign";
import { EFFECT_TRANSITIONS, TRANSITIONS, TRANSITION_FX, crossfadeAt } from "@/lib/transitions";
import { VOCAL_GAP_BPM, announcement, bpmDiff, DEFAULT_DJ, planMix, type DjOptions, type MixStep } from "@/lib/mixPlan";
import { playLines, speak, stopSpeaking } from "@/lib/djVoice";
import { INTRO_LINE, OUTRO_LINE, djLineFor } from "@/lib/djLines";
import { prepareSet, useSetPrep, wantsStems } from "@/lib/setPrep";
import { useStemsShared } from "@/lib/stemsShared";
import { type QueueTrack, getRelayHost, publishRelayHost, registerRelayHost, relayHostStart, relayHostStop, subscribeRelayHost } from "@/lib/relayHost";
import { cachedLoudness, loudnessFor, matchTrimDb } from "@/lib/audio/levelMatch";
import { getDjLive, setDjStems, showDjAction, useDjLive } from "@/lib/djLive";
import { RISERS, ruleOk, nextSectionStart, sectionKindAt, voiceStateAt, ACCENT_LABEL, MASTER_MOVES, gateSetting, isGentleGenre, PROFILE as FORCE_PROFILE, accentDue, amountFor, forceOf, isCalm, isMasterMove, pickAccent, pickTransitionMove, type AccentKind, type Feel, type Genre } from "@/lib/djForce";
import type { FxName } from "@/lib/audio/FXRack";
import { moveAllowed, capAmount, fadeFactor, getDjRules, transitionAllowed, type DjRules } from "@/lib/djRules";
import { pickTech, stemFrame, STEM_TECH_LABEL, type StemMode, type StemName, type StemTech } from "@/lib/stemMix";
import { getMemLevel } from "@/lib/memoryGovernor";

const NO_IDS: ReadonlySet<string> = new Set();

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
  launchTick?: number; // bumped by the page when a set is sent here (the Playlist view stays mounted, hidden)
  // whether the panel starts expanded (true) instead of collapsed (false)
  defaultExpanded?: boolean;
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
const TRANSITION_TYPES = TRANSITIONS;

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
// The Console/Écoute/Playlist workspaces each mount their own MediaLibrary
// instance (three separate places in the tree, never simultaneously — see
// app/page.tsx and StudioView.tsx), so switching between them unmounts one
// and mounts a fresh one with blank React state. Search results (and the
// tab/query that produced them) are stashed in sessionStorage on every
// change and read back on mount, so hopping between workspaces — or loading
// a track and coming back — doesn't force the same search to be re-run.
// sessionStorage (not localStorage): a stale search from days ago isn't
// worth resurrecting, but "I just searched, then tapped over to Playlist" is.
const SEARCH_STATE_KEY = "djsynth.searchState.v1";
interface SearchState {
  tab: "files" | "playlists" | "audius" | "youtube" | "soundcloud" | "deezer" | "auto";
  q: string;
  durKey: string;
  results: AudiusTrack[];
}
function loadSearchState(): SearchState | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_STATE_KEY);
    return raw ? (JSON.parse(raw) as SearchState) : null;
  } catch {
    return null;
  }
}

// A set sent from the Préparation tab waits in localStorage until the playlists view mounts.
const PENDING_SET_KEY = "djsynth.pendingSet";
type PendingSet = { side: "A" | "B" | "relay" | "open"; id: string };
function readPendingSet(): PendingSet | null {
  try {
    const raw = localStorage.getItem(PENDING_SET_KEY);
    return raw ? (JSON.parse(raw) as PendingSet) : null;
  } catch {
    return null;
  }
}

function MediaLibraryImpl({ engine, onLoaded, stemRefresh, libRefresh, splitLayout, defaultExpanded, launchTick }: Props) {
  const [data, setData] = useState<LibraryData>({ tracks: [], playlists: [] });
  // memoized once via useState's lazy initializer, not a ref — reading a ref's
  // .current during render is flagged (and rightly so, it's not meant for that)
  const [initialSearch] = useState(loadSearchState);
  const [pending] = useState(readPendingSet); // read-only here: the effect below consumes the key
  const [tab, setTab] = useState<
    "files" | "playlists" | "audius" | "youtube" | "soundcloud" | "deezer" | "auto"
  >(pending?.side === "open" ? "playlists" : initialSearch?.tab ?? "files");
  const [q, setQ] = useState(initialSearch?.q ?? "");
  const [durKey, setDurKey] = useState<string>(initialSearch?.durKey ?? "all"); // YouTube duration filter
  const [results, setResults] = useState<AudiusTrack[]>(initialSearch?.results ?? []);
  useEffect(() => {
    try {
      sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ tab, q, durKey, results }));
    } catch {
      /* quota/unavailable — persistence is a nicety, not required */
    }
  }, [tab, q, durKey, results]);
  // --- AI auto-playlist (similar style / BPM / sound) ---
  const [autoSeed, setAutoSeed] = useState<Seed | null>(null);
  const [autoTracks, setAutoTracks] = useState<AudiusTrack[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoUsedAI, setAutoUsedAI] = useState(false);
  const [sameArtist, setSameArtist] = useState(false); // restrict Auto-IA to the seed's artist
  // keyword-driven discovery ("années 80; 100 BPM; Electro; live" → ~20 proposals),
  // an alternate entry point into the same Auto-IA result list/UI — no seed track
  // needed, so a themed set can be launched from a pure idea instead
  const [autoKeywords, setAutoKeywords] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  // duration cap for Auto-IA results (minutes; null = no hard cap — long tracks
  // are still soft-penalized server-side so full sets/mixes don't crowd out singles)
  const [autoMaxDurationMin, setAutoMaxDurationMin] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activePl, setActivePl] = useState<string | null>(pending?.side === "open" ? pending.id : null);
  const [wizard, setWizard] = useState<{ nonce: number; initial?: WizardInitial } | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(!defaultExpanded && !pending); // a set sent from Préparation opens the panel
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
  useLayoutEffect(() => { dataRef.current = data; });
  const queueSrcRef = useRef(queueSrc);
  useLayoutEffect(() => { queueSrcRef.current = queueSrc; });
  const liveIdx = useRef<{ A: number; B: number }>({ A: -1, B: -1 });
  // tracks already played in the current pass of each deck's set (reset when the set is exhausted)
  const playedRef = useRef<{ A: Set<string>; B: Set<string> }>({ A: new Set(), B: new Set() });
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
  const vocalHeld = useRef<Record<"A" | "B", boolean>>({ A: false, B: false }); // the voice of that deck is off for a change: no move may bring it back
  const stemLoadTried = useRef<Record<"A" | "B", string>>({ A: "", B: "" }); // the song whose stems were already asked for, per deck
  const accentRef = useRef({ A: { id: "", lastBar: Number.NEGATIVE_INFINITY, count: 0, busy: 0 }, B: { id: "", lastBar: Number.NEGATIVE_INFINITY, count: 0, busy: 0 } }); // the DJ's interventions in the song that plays on each deck
  const djLive = useDjLive(); // the always-at-hand DJ switch (top bar)
  const djAction = djLive.action; // what the DJ just did, shown in the Lecture tile
  const baseTrim = useRef<{ A?: number; B?: number }>({}); // trim of a deck before the volume matching touched it
  const relayArmed = useRef(true); // fade exactly once per song
  // mirror of liveIdx as state so the track list re-renders when the queue moves
  // (used to highlight the playing track + blink the next one in the deck color)
  const [liveCur, setLiveCur] = useState<{ A: number; B: number }>({ A: -1, B: -1 });
  // mirror of the relay's loaded indices + foreground deck, so the list can mark
  // which single is playing now ("en cours") vs. cued next during A→B→A
  const [relayCur, setRelayCur] = useState<{ A: number; B: number }>({ A: -1, B: -1 });
  const [relayFg, setRelayFg] = useState<"A" | "B">("A");
  // The relay runs in the Playlist view only (always mounted). Other libraries show its state and send it orders.
  const host = useSyncExternalStore(subscribeRelayHost, getRelayHost, getRelayHost);
  const relayOn = splitLayout ? relay : host.running;
  const relayFgShown = splitLayout ? relayFg : host.fg;
  const relayCurShown = splitLayout ? relayCur : host.cur;

  // set of content hashes that already have cached stems on the server, so a
  // track can show a "STEMS" badge. Refreshed on mount and whenever the parent
  // bumps `stemRefresh` (i.e. a deck just probed or finished a separation).
  const [stemSet, setStemSet] = useState<Set<string>>(new Set());
  const setPreps = useSetPrep();
  const sharedStems = useStemsShared();
  // manual "prepare stems" button: `preparing` = the POST to launch the job is
  // in flight (fast); `queued` = the server is separating it in the background
  // and we're polling the cache list until it lands (see the effect below).
  const [stemsQueued, setStemsQueued] = useState<Set<string>>(new Set());
  const prep = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);

  // single entry point for "prepare this track": goes through the preparation queue
  // (it waits for playback to stop), so the library never separates on its own
  function queueStemsPrep(t: LibTrack) {
    enqueuePrep([t]);
    flash(`« ${t.name} » ajouté à la préparation des stems`);
  }
  // 0..100 per queued track id, polled from /api/stems/progress — separate
  // from stemsQueued (which only tracks membership) because progress needs
  // the hash + model/quality querystring the job was actually launched with
  const [, setStemsProgress] = useState<Map<string, number>>(new Map());
  const stemsRun = useRef<Map<string, { hash: string; model: string; qs: string }>>(new Map());
  // ids already prepped once per side during the LIVE preload window, so the
  // tick loop below doesn't refire the request every 400ms while it's in range
  const stemsPrefetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec le stockage local ou une prop au montage/changement ; pas de cascade de rendus
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

  // while any manually-prepped track is still being separated server-side,
  // poll the cheap cache-list endpoint until its hash shows up, then drop it
  // out of the "queued" set (its ✂ STEMS badge appears via the stemSet update)
  useEffect(() => {
    if (stemsQueued.size === 0) return;
    const id = window.setInterval(() => {
      fetch("/api/stems/list")
        .then((r) => r.json())
        .then((j) => {
          if (!Array.isArray(j.hashes)) return;
          const fresh = new Set<string>(j.hashes);
          setStemSet(fresh);
          setStemsQueued((cur) => {
            const next = new Set(cur);
            for (const id2 of cur) {
              const track = dataRef.current.tracks.find((x) => x.id === id2);
              if (track?.stemHash && fresh.has(track.stemHash)) {
                next.delete(id2);
                stemsRun.current.delete(id2);
                setStemsProgress((m) => {
                  if (!m.has(id2)) return m;
                  const n = new Map(m);
                  n.delete(id2);
                  return n;
                });
              }
            }
            return next;
          });
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [stemsQueued.size]);

  // faster companion poll: while any track is queued, refresh its live 0..100
  // percentage every ~3s (the 15s poll above only detects completion, which is
  // too coarse to feel "live" on a badge the DJ is actively watching)
  useEffect(() => {
    if (stemsQueued.size === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec le stockage local ou une prop au montage/changement ; pas de cascade de rendus
      setStemsProgress(new Map());
      return;
    }
    const id = window.setInterval(() => {
      for (const trackId of stemsQueued) {
        const run = stemsRun.current.get(trackId);
        if (!run) continue;
        fetch(`/api/stems/progress?hash=${run.hash}&model=${run.model}${run.qs}`)
          .then((r) => r.json())
          .then((j) => {
            if (typeof j.progress === "number") {
              setStemsProgress((m) => new Map(m).set(trackId, j.progress));
            }
          })
          .catch(() => {});
      }
    }, 3000);
    return () => clearInterval(id);
  }, [stemsQueued]);

  // Functional updater: every change is computed from the LATEST state, so rapid
  // successive edits (e.g. deleting several rows quickly) never clobber each other
  // with a stale snapshot. The localStorage write happens off the captured value.
  function persist(update: (prev: LibraryData) => LibraryData) {
    // Built on what is stored, not on this view's copy: other parts of the app (the radio, the preparation) write
    // to the same library, and this view may have been hidden for a while. A stale copy would erase their work.
    let base = dataRef.current;
    try {
      base = loadLibrary();
    } catch {
      // unreadable storage: this view's own copy is the best there is
    }
    const next = update(base);
    dataRef.current = next; // keep the ref in sync IMMEDIATELY so back-to-back
    setData(next); //          calls in the same tick each see the latest list
    if (!saveLibrary(next))
      flash("⚠ Sauvegarde impossible (stockage navigateur plein) — réessaie après avoir effacé des morceaux.");
    else if (wasLastSaveSlim())
      flash("⚠ Stockage plein : les pochettes ont été retirées de la bibliothèque.");
  }
  const [audit, setAudit] = useState<LibraryAudit | null>(null);
const [usage, setUsage] = useState<{ usedMb: number; quotaMb: number } | null>(null);

  async function runAudit() {
    try {
      const result = await auditLibrary(dataRef.current.tracks);
      setAudit(result);
      setUsage(await storageUsage());
      if (result.missing.length === 0 && result.orphans.length === 0) {
        flash("Bibliothèque cohérente");
      } else {
        flash("Incohérences trouvées");
      }
    } catch (e) {
      flash(`Audit impossible : ${(e as Error).message}`);
    }
  }

  function fixMissing() {
    if (!audit?.missing.length) return;
    persist((d) => ({
      ...d,
      tracks: d.tracks.filter((t) => !audit.missing.some((m) => m.id === t.id)),
    }));
    setAudit({ ...audit, missing: [] });
    flash(`${audit.missing.length} piste(s) sans fichier retirée(s)`);
  }

  async function fixOrphans() {
    if (!audit?.orphans.length) return;
    if (window.confirm(`Supprimer ${audit.orphans.length} fichier(s) audio qui n'appartiennent à aucune piste ? Irréversible.`)) {
      await removeOrphanBlobs(audit.orphans);
      setAudit({ ...audit, orphans: [] });
      flash(`${audit.orphans.length} fichier(s) orphelin(s) supprimé(s)`);
    }
  }

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2200);
  }

  // --- import local files into the collection (blob → IndexedDB) ---
  // "à jouer plus tard": file a YouTube/Audius search result in the library, flagged for later
  function markLater(t: AudiusTrack, source: "youtube" | "audius") {
    persist((d) => {
      if (d.tracks.some((x) => x.later && x.url === t.id)) return d;
      const track: LibTrack = {
        id: uid(),
        name: t.title,
        source,
        url: t.id,
        deck: null,
        art: t.artwork ?? undefined,
        durationSec: t.duration || undefined,
        bpm: t.bpm ?? undefined,
        later: true,
        addedAt: Date.now(),
      };
      return { ...d, tracks: [track, ...d.tracks] };
    });
  }
  // a result found by artist in the Sets view: filed in the library (if new) and added to the open set
  function addFoundToSet(t: AudiusTrack) {
    const plId = activePl;
    if (!plId) {
      flash("Choisis d'abord un set");
      return;
    }
    const existing = dataRef.current.tracks.find((x) => x.url === t.id && x.source === "youtube");
    const id = existing?.id ?? uid();
    if (!existing) {
      persist((d) => ({
        ...d,
        tracks: [{ id, name: t.title, source: "youtube", url: t.id, deck: null, art: t.artwork ?? undefined, durationSec: t.duration || undefined, bpm: t.bpm ?? undefined, later: true, addedAt: Date.now() } as LibTrack, ...d.tracks],
      }));
    }
    addTracksAt(plId, [id]);
  }
  async function importFiles(fileList: FileList) {
    // snapshot now: the input is cleared after this call, which empties a live FileList
    const files = Array.from(fileList);
    const added: LibTrack[] = [];
    const existingNames = new Set(
      dataRef.current.tracks
        .filter((t) => t.source === "local")
        .map((t) => t.name.toLowerCase().replace(/\.[^.]+$/, ""))
    );
    let skipped = 0;

    try {
      for (const f of Array.from(files)) {
        const cleanName = f.name.toLowerCase().replace(/\.[^.]+$/, "");
        if (existingNames.has(cleanName)) {
          skipped++;
          continue;
        }
        existingNames.add(cleanName);

        const id = uid();
        await idbPutBlob(id, f);
        const art = (await extractCover(f)) ?? undefined;
        const durationSec = await probeDuration(f).catch(() => undefined);
        added.push({
          id,
          name: f.name.replace(/\.[^.]+$/, ""),
          source: "local",
          deck: null,
          art,
          durationSec,
          // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
          addedAt: Date.now(),
        });
      }
    } catch (e) {
      flash(`Import impossible : ${(e as Error).message}`);
      return;
    }

    if (added.length || skipped > 0) {
      if (added.length) {
        persist((d) => ({ ...d, tracks: [...added, ...d.tracks] }));
        enqueuePrep(added);
        for (const t of added) {
          const file = files.find((f) => f.name.replace(/\.[^.]+$/, "") === t.name);
          if (!file) continue;
          queueAnalysis(file, (r) => {
            if (!r) return;
            persist((d) => ({
              ...d,
              tracks: d.tracks.map((x) =>
                x.id === t.id && x.bpm == null
                  ? { ...x, bpm: r.bpm, bpmEstimated: true, bpmConfidence: r.bpmConfidence, camelot: r.camelot || undefined }
                  : x
              ),
            }));
          });
        }
      }
      flash(
        `${added.length} fichier(s) ajouté(s)` +
          (skipped > 0 ? ` — ${skipped} doublon(s) ignoré(s)` : "")
      );
    }
  }

  // --- load a stored track onto a deck (and re-apply its saved FX) ---
  // What a deck finds out about a song (tempo, key) is written back to the library, so the Radio, the Préparation
  // and the Playlist views use it too instead of analysing the song again.
  async function shareDeckAnalysis(t: LibTrack, deck: typeof engine.deckA) {
    if (t.bpm && t.camelot) return;
    for (let i = 0; i < 20 && !(deck.bpm > 0 && deck.key); i++) await new Promise((r) => setTimeout(r, 1000));
    if (deck.origin?.id !== t.id || !(deck.bpm > 0)) return;
    const bpm = Math.round(deck.bpm * 100) / 100;
    const camelot = deck.key?.camelot;
    persist((d) => ({
      ...d,
      tracks: d.tracks.map((x) => (x.id !== t.id ? x : { ...x, bpm: x.bpm || bpm, bpmEstimated: x.bpm ? x.bpmEstimated : true, camelot: x.camelot || camelot })),
    }));
  }
  async function loadToDeck(t: LibTrack, side: "A" | "B") {
    setBusy(t.id + side);
    const deck = side === "A" ? engine.deckA : engine.deckB;
    // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
    deck.loading = true; // the deck panel shows a loading bar until ready
    // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
    deck.loadStartedAt = performance.now();
    try {
      if (t.source === "local") {
        const cached = prefetchCache.current.get(t.id);
        const blob = cached ?? (await idbGetBlob(t.id));
        prefetchCache.current.delete(t.id);
        prefetchedIds.current.delete(t.id);
        if (!blob) throw new Error("Fichier introuvable (effacé du navigateur)");
        // streaming: audio starts within ~200 ms; waveform/BPM decode in background
        void deck.loadStreaming(blob, t.name).then(() => {
          onLoaded?.();
          void shareDeckAnalysis(t, deck);
        });
        deck.sourceLink = "";
      } else {
        const streamUrl = `/api/${t.source}/stream?id=${encodeURIComponent(t.url ?? "")}`;
        void deck.loadStreamingUrl(streamUrl, t.name, t.durationSec).then(() => {
          onLoaded?.();
          void shareDeckAnalysis(t, deck);
        });
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
      // stems prepared in advance for this track: the deck loads exactly those from the server cache,
      // instead of looking for (and then computing) its own default variant
      const prepared = getPreparedStems(t.id);
      if (prepared) {
        void deck
          .adoptPreparedStems({
            hash: prepared.hash,
            model: prepared.model as typeof deck.stemModel,
            ultra: prepared.ultra ?? PREP_OPTS.ultra,
            lossless: prepared.lossless ?? PREP_OPTS.lossless,
          })
          .then((ok) => {
            if (!ok) return;
            setStemSet((s) => new Set(s).add(prepared.hash));
            onLoaded?.();
          });
      }
      // probe the server cache so we can record this track's content hash and
      // badge it if its stems already exist (no-op for non-stored results).
      // Use the result THIS call returned, not deck.stemHash read after the
      // await — if the user loads a different track onto this deck before the
      // probe resolves, deck.stemHash may already belong to that newer track,
      // and writing it into t.id's (this track's) library record would
      // silently tag the wrong single as having stems ready.
      deck.probeStems().then((result) => {
        if (result?.hash) {
          if (result.cached) setStemSet((s) => new Set(s).add(result.hash));
          persist((d) => ({
            ...d,
            tracks: d.tracks.map((x) =>
              x.id === t.id && x.stemHash !== result.hash ? { ...x, stemHash: result.hash } : x
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
  async function delAll(skipConfirm = false) {
    const locals = dataRef.current.tracks.filter((t) => t.source === "local");
    if (!dataRef.current.tracks.length) {
      flash("La bibliothèque est déjà vide");
      return;
    }
    if (!skipConfirm && !confirm("Effacer TOUS les morceaux de la bibliothèque ? (les playlists seront vidées)"))
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

  // rename / duplicate / clear a set (immutable updates: persist gets the previous state)
  function renamePlaylist(id: string) {
    const current = dataRef.current.playlists.find((pl) => pl.id === id)?.name;
    if (!current) return;
    const next = prompt("Renommer le set", current)?.trim();
    if (!next) return;
    persist((d) => ({ ...d, playlists: d.playlists.map((pl) => (pl.id === id ? { ...pl, name: next } : pl)) }));
  }
  function duplicatePlaylist(id: string) {
    const original = dataRef.current.playlists.find((pl) => pl.id === id);
    if (!original) return;
    const copy = { id: uid(), name: `${original.name} (copie)`, trackIds: [...original.trackIds] };
    persist((d) => ({ ...d, playlists: [...d.playlists, copy] }));
    setActivePl(copy.id);
    flash(`Set dupliqué : ${original.name}`);
  }
  function clearPlaylist(id: string) {
    const name = dataRef.current.playlists.find((pl) => pl.id === id)?.name;
    if (!name || !confirm(`Vider le set « ${name} » ?`)) return;
    persist((d) => ({ ...d, playlists: d.playlists.map((pl) => (pl.id === id ? { ...pl, trackIds: [] } : pl)) }));
    flash("Set vidé");
  }

  // --- set management for the Playlist view: names come from inline fields, confirmations from
  // two-click buttons, because prompt() and confirm() never answer in the Mac app ---
  function createSetNamed(name: string) {
    const p = { id: uid(), name, trackIds: [] as string[], transitionSec: 12 };
    persist((d) => ({ ...d, playlists: [...d.playlists, p] }));
    setActivePl(p.id);
    flash(`Set « ${name} » créé`);
  }
  // tempo and key of the titles that lack them, one after the other; what is already known is kept
  async function analyzeIds(ids: string[]) {
    const todo = dataRef.current.tracks.filter((t) => ids.includes(t.id));
    setAnalyzingIds((prev) => new Set([...prev, ...todo.map((t) => t.id)]));
    for (const t of todo) {
      const r = await analyzeLibraryTrack(t);
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(t.id);
        return next;
      });
      if (!r) continue;
      persist((d) => ({
        ...d,
        tracks: d.tracks.map((x) =>
          x.id !== t.id ? x : { ...x, bpm: x.bpm || r.bpm, bpmEstimated: x.bpm ? x.bpmEstimated : true, bpmConfidence: x.bpm ? x.bpmConfidence : r.bpmConfidence, camelot: x.camelot || r.camelot }
        ),
      }));
    }
  }
  // a set made in the assistant: new, or the one it was last saved as; names stay unique
  function saveWizardSet(draft: SetDraft): string {
    const existing = draft.id ? dataRef.current.playlists.find((p) => p.id === draft.id) : undefined;
    const id = existing?.id ?? uid();
    const taken = new Set(dataRef.current.playlists.filter((p) => p.id !== id).map((p) => p.name));
    let name = draft.name;
    for (let n = 2; taken.has(name); n++) name = `${draft.name} (${n})`;
    const set: Playlist = { ...existing, id, name, trackIds: draft.trackIds, transitionType: draft.transitionType, transitionSec: draft.transitionSec, preloadSec: existing?.preloadSec ?? 15 };
    persist((d) => ({ ...d, playlists: existing ? d.playlists.map((p) => (p.id === id ? set : p)) : [...d.playlists, set] }));
    flash(`Set « ${name} » enregistré : ${draft.trackIds.length} titres`);
    return id;
  }
  // the DJ plan of a set: computed from its songs (kept in the set), or switched off
  function setMixPlan(plId: string, on: boolean, patch?: DjOptions) {
    const cur = dataRef.current.playlists.find((p) => p.id === plId);
    if (!cur) return;
    const byId = new Map(dataRef.current.tracks.map((t) => [t.id, t]));
    const tracks = cur.trackIds.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
    const dj = { ...DEFAULT_DJ, ...cur.dj, ...patch, auto: on };
    persist((d) => ({ ...d, playlists: d.playlists.map((p) => (p.id === plId ? { ...p, dj, mixPlan: on ? planMix(tracks, "flow", dj, p.mixPlan) : p.mixPlan } : p)) }));
    flash(on ? "Plan DJ calculé : le relais suit ces enchaînements" : "Plan DJ désactivé : un seul style pour tout le set");
  }
  function renameNow(id: string, name: string) {
    persist((d) => ({ ...d, playlists: d.playlists.map((pl) => (pl.id === id ? { ...pl, name } : pl)) }));
  }
  function clearNow(id: string) {
    persist((d) => ({ ...d, playlists: d.playlists.map((pl) => (pl.id === id ? { ...pl, trackIds: [] } : pl)) }));
    flash("Set vidé");
  }
  // move the track at `from` so that it ends at index `to` (drag-and-drop and the ▲ ▼ buttons)
  function moveIndex(plId: string, from: number, to: number) {
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => {
        if (p.id !== plId || from < 0 || from >= p.trackIds.length) return p;
        const ids = [...p.trackIds];
        const [moved] = ids.splice(from, 1);
        ids.splice(Math.max(0, Math.min(ids.length, to)), 0, moved);
        return { ...p, trackIds: ids };
      }),
    }));
  }
  // add library tracks (not already in the set) at an index, or at the end
  function addTracksAt(plId: string, ids: string[], at?: number) {
    const cur = dataRef.current.playlists.find((p) => p.id === plId);
    if (!cur) return;
    const have = new Set(cur.trackIds);
    const fresh = [...new Set(ids)].filter((id) => !have.has(id) && dataRef.current.tracks.some((t) => t.id === id));
    if (fresh.length === 0) {
      flash("Déjà dans le set");
      return;
    }
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => {
        if (p.id !== plId) return p;
        const list = [...p.trackIds];
        list.splice(at === undefined ? list.length : Math.max(0, Math.min(list.length, at)), 0, ...fresh);
        return { ...p, trackIds: list };
      }),
    }));
    flash(`${fresh.length} titre${fresh.length > 1 ? "s" : ""} ajouté${fresh.length > 1 ? "s" : ""} à « ${cur.name} »`);
  }
  // reorder a set for an energy shape (same engine as the Préparation set creator)
  function optimizePlaylist(plId: string, arc: SetArc) {
    const pl = dataRef.current.playlists.find((p) => p.id === plId);
    if (!pl) return;
    const cues = pl.trackIds
      .map((id) => dataRef.current.tracks.find((t) => t.id === id))
      .filter((t): t is LibTrack => !!t)
      .map((t) => ({ id: t.id, bpm: t.bpm ?? 0, camelot: t.camelot ?? "", durationSec: t.durationSec ?? 0 }));
    const order = buildSet(cues, { arc });
    persist((d) => ({ ...d, playlists: d.playlists.map((p) => (p.id === plId ? { ...p, trackIds: order } : p)) }));
    flash(`Set réordonné (${{ flow: "fluide", rise: "montée", fall: "descente", peak: "pic", wave: "vague" }[arc]})`);
  }

  // --- Audius / YouTube search ---
  async function search(durOverride?: string) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      let url = `/api/${tab}/search?q=${encodeURIComponent(q)}`;
      if (tab === "youtube" || tab === "soundcloud") {
        const f = DUR_FILTERS.find((d) => d.key === (durOverride ?? durKey)) ?? DUR_FILTERS[0];
        url += `&n=60&min=${f.min}&max=${f.max}`; // bigger pool + duration bounds
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
      // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
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
    setAutoKeywords(null);
    setAutoSeed(seed);
    setAutoTracks([]);
    setAutoLoading(true);
    try {
      const r = await fetch("/api/ai/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...seed, sameArtist: only, maxDurationMin: autoMaxDurationMin }),
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
  // keyword-driven discovery: "années 80; 100 BPM; Electro; live" → ~20
  // proposals, no seed track needed — reuses the same Auto-IA result list/UI.
  async function generateDiscover(keywords: string) {
    const kw = keywords.trim();
    if (!kw) return;
    setTab("auto");
    setAutoSeed(null);
    setAutoKeywords(kw);
    setAutoTracks([]);
    setAutoLoading(true);
    try {
      const r = await fetch("/api/ai/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: kw, maxDurationMin: autoMaxDurationMin }),
      });
      const j = await r.json();
      if (j.error) flash(j.error);
      setAutoTracks(j.tracks ?? []);
      setAutoUsedAI(!!j.usedAI);
      if ((j.tracks ?? []).length === 0 && !j.error)
        flash("Aucun titre trouvé — essaie d'autres mots-clés.");
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
      // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
      deck: null, art: t.artwork ?? undefined, durationSec: t.duration || undefined, bpm: t.bpm ?? undefined, addedAt: Date.now(),
    };
    persist((d) => ({ ...d, tracks: [lt, ...d.tracks] }));
    flash("Ajouté à la bibliothèque");
  }
  // persist the whole generated set as a real playlist (Audius tracks + playlist)
  function saveAutoAsPlaylist() {
    if (!autoTracks.length) return;
    const base = autoSeed?.title
      ? `Auto · ${autoSeed.title}`.slice(0, 40)
      : autoKeywords
        ? `Auto · ${autoKeywords}`.slice(0, 40)
        : "Playlist auto";
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

  // --- classement : tri, filtres thème/groupe, édition, liste depuis la vue ---
  const [libSort, setLibSort] = useState<"recent" | "title" | "bpm" | "key" | "theme" | "group">("recent");
  const [libTheme, setLibTheme] = useState("");
  const [libGroup, setLibGroup] = useState("");
  function setTrackField(id: string, field: "theme" | "group", value: string) {
    persist((d) => ({
      ...d,
      tracks: d.tracks.map((x) => (x.id === id ? { ...x, [field]: value.trim() || undefined } : x)),
    }));
  }
  function visibleLibTracks(): LibTrack[] {
    const list = data.tracks.filter(
      (t) => (!libTheme || t.theme === libTheme) && (!libGroup || t.group === libGroup)
    );
    const cmp: Record<string, (a: LibTrack, b: LibTrack) => number> = {
      recent: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.name.localeCompare(b.name),
      bpm: (a, b) => (a.bpm ? a.bpm : Infinity) - (b.bpm ? b.bpm : Infinity) || 0, // unknown BPM last
      key: (a, b) => (a.camelot ?? "").localeCompare(b.camelot ?? ""),
      theme: (a, b) => (a.theme ?? "").localeCompare(b.theme ?? ""),
      group: (a, b) => (a.group ?? "").localeCompare(b.group ?? ""),
    };
    return [...list].sort(cmp[libSort]);
  }
  function createListFromView(vis: LibTrack[]) {
    if (!vis.length) return;
    const base = libTheme || libGroup || "Sélection";
    const pl: Playlist = { id: uid(), name: `${base} · ${vis.length}`, trackIds: vis.map((t) => t.id) };
    persist((d) => ({ ...d, playlists: [...d.playlists, pl] }));
    flash(`Liste « ${pl.name} » créée`);
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
    const deck = side === "A" ? engine.deckA : engine.deckB;
    const other = side === "A" ? engine.deckB : engine.deckA;
    // smart pick: the track that best matches the one playing on the other deck (tempo, then key)
    const curT = other.origin ? q.find((x) => x.id === other.origin?.id) : undefined;
    const played = playedRef.current[side];
    let idx = (liveIdx.current[side] + 1) % q.length;
    if (curT) {
      const toCue = (x: LibTrack): Cue => ({ id: x.id, bpm: x.bpm ?? 0, camelot: x.camelot ?? "" });
      const pick = pickNext(toCue(curT), q.map(toCue), played);
      if (pick) {
        idx = q.findIndex((x) => x.id === pick.id);
      } else {
        played.clear(); // every track of the set was played: start a new pass
      }
    }
    played.add(q[idx].id);
    liveIdx.current[side] = idx;
    setLiveCur((c) => ({ ...c, [side]: idx }));
    const t = q[idx];
    await loadToDeck(t, side);
    if (curT) engine.sync(side); // match the incoming deck's tempo to the one already playing
    if (deck.audioBuffer) deck.play(); // a failed load leaves nothing to play
    wasPlaying.current[side] = true;
  }
  function toggleLive(side: "A" | "B", startIdx?: number) {
    const next = !(side === "A" ? liveA : liveB);
    (side === "A" ? setLiveA : setLiveB)(next);
    if (next && relayOn && !splitLayout) relayHostStop();
    if (next && relay) {
      setRelay(false); // the relay drives both decks — can't also run a per-deck loop
      relayRef.current = false;
      setRelayCur({ A: -1, B: -1 });
    }
    if (next) {
      const deck = side === "A" ? engine.deckA : engine.deckB;
      if (deck.playing && startIdx == null) {
        wasPlaying.current[side] = true;
      } else {
        // one below the desired start so liveAdvance()'s +1 lands exactly on it
        liveIdx.current[side] = (startIdx ?? 0) - 1;
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
  // `startIdx` (default 0) lets a set be picked up from any track, not just
  // the top — the rest of the playlist still follows in order after it.
  function playPlaylistLive(side: "A" | "B", plId: string, startIdx?: number) {
    const next = { ...queueSrcRef.current, [side]: plId };
    setQueueSrc(next);
    queueSrcRef.current = next; // make liveQueue() see it synchronously
    if (relay) stopRelay();
    (side === "A" ? setLiveA : setLiveB)(true);
    liveIdx.current[side] = (startIdx ?? 0) - 1;
    liveAdvance(side); // loads + plays from startIdx (0 = the playlist's first title)
    const n = liveQueue(side).length;
    flash(`File Deck ${side} : playlist (${n} titre${n > 1 ? "s" : ""})`);
  }
  // Run the A→B→A relay through one playlist on both decks (long automix set).
  // `startIdx` (default 0) picks up the set from any track — B cues the very
  // next track after it, and the relay continues in order from there, looping.
  // Always goes through startRelay() directly (never the on/off toggleRelay())
  // so re-triggering it while a relay is already running — e.g. jumping to a
  // different track mid-set via "▶ ici" — can't hit the stale-closure trap a
  // stop-then-setTimeout-then-restart dance would (setRelay(false) followed
  // 80ms later by a toggle that still closes over the pre-update `relay`
  // value used to silently no-op the restart: it started fine, then never
  // advanced again).
  function playPlaylistRelay(plId: string, startIdx?: number) {
    if (!splitLayout && relayHostStart(plId, startIdx)) return; // the Playlist view runs it, so it goes on when this tab is left
    const next = { A: plId, B: plId };
    setQueueSrc(next);
    queueSrcRef.current = next;
    startRelay(startIdx);
  }
  // A set sent from the Préparation tab (see `pending`): queued on Deck A or B, or run as
  // the A→B→A relay. "open" needs no playback: it is applied as the initial tab / playlist.
  function takePendingSet(p: PendingSet | null) {
    if (!p || !splitLayout) return; // only the Playlist view plays what is sent to it
    try {
      if (localStorage.getItem(PENDING_SET_KEY) === null) return; // already taken: dev StrictMode runs effects twice
      localStorage.removeItem(PENDING_SET_KEY);
    } catch {
      return;
    }
    // next tick: the decks and the library are settled once the view has mounted
    // (no cleanup: the second dev run finds the key gone and must not cancel this one)
    window.setTimeout(() => {
      if (p.side === "relay") playPlaylistRelay(p.id);
      else if (p.side === "A" || p.side === "B") playPlaylistLive(p.side, p.id);
      else if (p.side === "open") setActivePl(p.id);
    }, 0);
  }
  // at mount (the page was opened on this view) ...
  useEffect(() => {
    takePendingSet(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount
  }, []);
  // ... and every time the page sends a set while this view is already mounted (it stays mounted when hidden)
  const firstTick = useRef(true);
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      return;
    }
    takePendingSet(readPendingSet());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchTick]);

  // watch each live deck; when its single ends (position snaps back to ~0 while
  // stopped) load + play the next filed single, looping the queue forever.
  function livePreloadSec(side: "A" | "B"): number {
    const plId = queueSrcRef.current[side];
    const pl = plId ? dataRef.current.playlists.find((p) => p.id === plId) : null;
    return pl?.preloadSec ?? 5;
  }

  // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
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
            if (q.length) {
              const nt = q[(liveIdx.current[side] + 1) % q.length];
              prefetchTrack(nt);
            }
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
    if (andPlay) {
      await armStems(side, 1500); // the first song too: its prepared stems are switched on before it is heard
      deck.play();
    } else void armStems(side); // a cued song loads its prepared stems in the background, to mix with them
    void measureLevel(side);
    // the songs to come get their stems prepared while this one plays (in the background, one at a time): the longer the
    // set runs, the more songs have them. Not when memory is tight; nothing new is computed for songs already done.
    const live = getDjLive();
    const pl = relayPlaylist();
    if ((live.on || wantsStems(pl?.dj)) && pl?.dj?.stems !== "off" && getMemLevel() === "ok" && q.length > 1) {
      enqueuePrep([1, 2, 3].map((k) => q[(relayIdx.current[side] + k) % q.length]).filter((t) => !!t && t.source !== "local"));
    }
    setRelayCur({ A: relayIdx.current.A, B: relayIdx.current.B }); // refresh list markers
    return true;
  }
  // The loudness of a song is measured as soon as it is decoded, long before its transition: measuring takes
  // a moment of CPU, and doing it at the transition delayed the start of the blend.
  async function measureLevel(side: "A" | "B") {
    if (relayPlaylist()?.dj?.loudness === false) return;
    const deck = side === "A" ? engine.deckA : engine.deckB;
    const id = deck.origin?.id;
    for (let i = 0; i < 60 && !deck.audioBuffer; i++) await new Promise((r) => setTimeout(r, 1000));
    if (!id || deck.origin?.id !== id || !deck.audioBuffer) return;
    await new Promise((r) => setTimeout(r, 1500)); // let the decode and the first beats settle
    if (deck.origin?.id === id) loudnessFor(id, deck.audioBuffer);
  }
  // A cued song whose stems are ready loads them and switches its deck to stem playback (while it is silent, so
  // there is no glitch). The DJ plan then mixes with them. Skipped when memory is tight or the set says no.
  async function armStems(side: "A" | "B", maxWaitMs = 12000) {
    const mode = relayPlaylist()?.dj?.stems ?? "punchy";
    const deck = side === "A" ? engine.deckA : engine.deckB;
    // the top-bar DJ also wants stems when the set itself has no DJ options
    if ((!relayPlaylist()?.dj && !getDjLive().on) || mode === "off" || deck.streamOnly) return;
    const id = deck.origin?.id;
    if (maxWaitMs < 12000 && !getPreparedStems(id ?? "")) return; // about to play: never wait for stems nobody prepared
    for (let i = 0; i < maxWaitMs / 500 && !deck.stemCached; i++) await new Promise((r) => setTimeout(r, 500)); // the load settles first
    if (!deck.stemCached || deck.origin?.id !== id || getMemLevel() === "critical") return;
    await deck.ensureStems();
    if (deck.origin?.id === id && deck.stemReady && !deck.playing && relayRef.current) deck.setStemsActive(true);
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
  function relayFade(to: "A" | "B", secs: number, type: TransitionType = "fade", bassSwap = false, stem?: { tech: StemTech; mode: StemMode }, opts: { holdVocals?: boolean } = {}) {
    relayFading.current = true;
    const from = engine.getCrossfade();
    const target = to === "B" ? 1 : 0;
    const outDeck = to === "B" ? engine.deckA : engine.deckB;
    const inDeck = to === "B" ? engine.deckB : engine.deckA;
    // Tempos too far apart (see VOCAL_GAP_BPM): the voices are switched off for the change. The outgoing voice fades out
    // over the first fifth of the blend; the incoming one stays off until the song is back at its own tempo.
    const hold = !!opts.holdVocals;
    const vOut = hold ? outDeck.stemNames.indexOf("vocals") : -1;
    const vIn = hold ? inDeck.stemNames.indexOf("vocals") : -1;
    const holdVocals = (k: number) => {
      if (vOut >= 0 && outDeck.stemsActive) outDeck.rampStemVol(vOut, 1 - Math.min(1, k / 0.2), 0.35);
      if (vIn >= 0 && inDeck.stemsActive) inDeck.rampStemVol(vIn, 0, 0.35);
    };
    const BASS_CUT = -24; // dB
    // bass swap: the incoming song's low end is held back, then the two lows trade places around the middle of the blend
    const swap = (k: number) => {
      const s = Math.max(0, Math.min(1, (k - 0.4) / 0.2));
      inDeck.setEQ("low", BASS_CUT * (1 - s));
      outDeck.setEQ("low", BASS_CUT * s);
    };
    const swapDone = () => {
      inDeck.setEQ("low", 0);
      outDeck.setEQ("low", 0);
    };
    // stem technique: the level of every stem of both songs follows the progress of the blend
    const applyStems = (k: number) => {
      if (!stem) return;
      const f = stemFrame(stem.tech, k, stem.mode);
      const put = (d: typeof outDeck, lv: Partial<Record<StemName, number>>) => {
        for (const [name, v] of Object.entries(lv) as [StemName, number][]) {
          if (hold && name === "vocals") continue; // the voices are handled apart
          const i = d.stemNames.indexOf(name);
          if (i >= 0) d.rampStemVol(i, v, k > 0 ? 0.35 : 0); // between two ticks the level glides, it does not jump
        }
      };
      put(outDeck, f.out);
      put(inDeck, f.inn);
      const vi = outDeck.stemNames.indexOf("vocals");
      if (vi >= 0 && !hold) outDeck.setStemDelaySend(vi, f.outEcho);
    };
    const stemsEnd = () => {
      if (!stem) return;
      applyStems(1);
      inDeck.stemNames.forEach((_, i) => inDeck.setStemVol(i, i === vIn ? 0 : 1)); // the incoming song ends with all its stems (its voice comes back later)
    };
    holdVocals(0);
    applyStems(0); // the incoming song starts with the stems it comes in with, before it is heard
    // effect transitions: the deck effect of the outgoing song goes on at its moment, its dry sound may stop
    // (its echoes / reverb keep ringing), a loop holds its last bar
    const fx = TRANSITION_FX[type];
    let fxOn = false;
    let dryCut = false;
    const dryTrim = outDeck.trimValue;
    const applyFx = (k: number) => {
      if (fx && !fxOn && k >= fx.at) {
        fxOn = true;
        outDeck.setFxWet(fx.fx, fx.wet);
      }
      if (fx?.dryCut !== undefined && !dryCut && k >= fx.dryCut) {
        dryCut = true;
        outDeck.setTrim(0); // the trim is before the effects: the tail still sounds
      }
      if (type === "highpass") outDeck.setFilter(Math.min(0.95, k * 1.1)); // positive = high-pass sweep
      if (type === "eq") {
        // three-band blend: the old song loses lows, then mids, then highs; the new one gains them in the reverse order
        const r = (a: number, b: number) => Math.max(0, Math.min(1, (k - a) / (b - a)));
        outDeck.setEQ("low", -26 * r(0, 0.4));
        outDeck.setEQ("mid", -26 * r(0.3, 0.7));
        outDeck.setEQ("high", -26 * r(0.6, 1));
        inDeck.setEQ("high", -26 * (1 - r(0, 0.4)));
        inDeck.setEQ("mid", -26 * (1 - r(0.2, 0.6)));
        inDeck.setEQ("low", -26 * (1 - r(0.4, 0.8)));
      }
    };
    if (type === "loop") outDeck.setBeatLoop(4);
    if (type === "cut") {
      engine.setCrossfade(target);
      relayFading.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
    const t0 = performance.now();
    // the outgoing deck gets its effects, loop and trim back once it is silent (it is reused for the next song)
    const fxEnd = () => {
      if (fx) outDeck.setFxWet(fx.fx, 0);
      if (dryCut) outDeck.setTrim(dryTrim);
      if (type === "loop") outDeck.clearLoop();
      if (type === "filter" || type === "highpass") outDeck.setFilter(0);
      if (type === "eq") {
        for (const d of [outDeck, inDeck]) for (const b of ["low", "mid", "high"] as const) d.setEQ(b, 0);
      }
    };
    // Driven by a timer, not by requestAnimationFrame: animation frames stop when the window is hidden or
    // behind another one, and the blend froze half-way (no song change at all). A timer keeps running.
    const step = () => {
      if (!relayRef.current) {
        relayFading.current = false;
        if (bassSwap) swapDone();
        stemsEnd();
        fxEnd();
        return;
      }
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      const eased = stem ? stemFrame(stem.tech, k, stem.mode).cross : crossfadeAt(type, k);
      applyStems(k);
      holdVocals(k);
      applyFx(k);
      engine.setCrossfade(from + (target - from) * eased);
      if (type === "filter") outDeck.setFilter(-eased); // sweep toward closed low-pass as it fades out
      if (bassSwap) swap(k);
      if (k < 1) window.setTimeout(step, 25);
      else {
        relayFading.current = false;
        if (bassSwap) swapDone();
        stemsEnd();
        // effect tails ring a little after the crossfader has moved on
        window.setTimeout(fxEnd, fx ? 2500 : 0);
      }
    };
    window.setTimeout(step, 0);
  }
  // `startIdx` (default 0) is where the SHARED relay pointer picks up — Deck A
  // starts there, Deck B cues the track right after it, and the relay carries
  // on in order (looping) from that point instead of always from track 0.
  // Unconditional (does NOT read `relay` to decide anything) so it's safe to
  // call whether or not a relay is already running — see stopRelay/toggleRelay
  // below for why that matters.
  function startRelay(startIdx?: number) {
    setRelay(true);
    relayRef.current = true;
    // mutually exclusive with the per-deck LIVE loops
    if (liveA) setLiveA(false);
    if (liveB) setLiveB(false);
    liveIdx.current = { A: -1, B: -1 };
    setLiveCur({ A: -1, B: -1 });
    relayIdx.current = { A: -1, B: -1 };
    // one below the desired start so relayLoadNext()'s +1 lands exactly on it
    relayPos.current = (startIdx ?? 0) - 1;
    relayFading.current = false;
    relayArmed.current = true;
    relaySide.current = "A";
    setRelayFg("A");
    engine.setCrossfade(0); // start fully on Deck A
    (async () => {
      const okA = await relayLoadNext("A", true); // A in the foreground, playing
      if (okA) announceOver("A", true);
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
  function stopRelay() {
    stopSpeaking();
    setRelay(false);
    relayRef.current = false;
    setRelayCur({ A: -1, B: -1 }); // clear "en cours" markers
  }
  // header button: flip on/off. NOT used for "jump to a different track while
  // already running" — that always goes through startRelay directly (see
  // playPlaylistRelay) so it never has to read stale `relay` state through a
  // closure captured before a pending setState landed.
  function toggleRelay() {
    if (!splitLayout) {
      // same relay, run by the Playlist view: stop it, or start it on the singles filed for the decks
      if (host.running) relayHostStop();
      else relayHostStart(null);
      return;
    }
    if (relay) stopRelay();
    else startRelay();
  }
  // ---- the songs to come (shown in the line at the top of the Console, see components/NextUpBar.tsx) ----
  // The queue as a list that starts with the song playing: r[0] = now, r[1] = waiting on the other deck, and so on.
  const skipNow = useRef(false); // "next song now": the tick of the relay starts the change at once
  function rotatedQueue(): { q: LibTrack[]; r: LibTrack[]; cur: number; fg: "A" | "B" } | null {
    const q = liveQueue("A");
    const fg = relaySide.current;
    const cur = relayIdx.current[fg];
    if (!q.length || cur < 0 || cur >= q.length) return null;
    return { q, cur, fg, r: [...q.slice(cur), ...q.slice(0, cur)] };
  }
  const queueEditable = () => {
    const plId = queueSrcRef.current.A;
    const pl = plId ? dataRef.current.playlists.find((p) => p.id === plId) : undefined;
    return !!pl && pl.trackIds.length === liveQueue("A").length; // a set (not the singles filed on the decks), all of whose songs are known
  };
  // writes the new order (the song playing keeps its place), re-plans the changes and reloads the song waiting on the other deck
  function applyQueueOrder(r: LibTrack[], cur: number, fg: "A" | "B", firstChanged: boolean) {
    const plId = queueSrcRef.current.A;
    if (!plId || !queueEditable()) return;
    const len = r.length;
    const ids: string[] = new Array(len);
    r.forEach((t, i) => {
      ids[(cur + i) % len] = t.id;
    });
    persist((d) => ({
      ...d,
      playlists: d.playlists.map((p) => {
        if (p.id !== plId) return p;
        const byId = new Map(d.tracks.map((t) => [t.id, t]));
        const ordered = ids.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
        // the plan was made for the old order: made again (steps fixed by hand were for other pairs of songs)
        return { ...p, trackIds: ids, mixPlan: p.mixPlan ? planMix(ordered, "flow", p.dj ?? DEFAULT_DJ) : p.mixPlan };
      }),
    }));
    const other = fg === "A" ? "B" : "A";
    const od = other === "A" ? engine.deckA : engine.deckB;
    if (firstChanged && relayArmed.current && !relayFading.current && !od.playing) {
      relayArmed.current = false; // no change starts while the waiting song is being replaced
      relayPos.current = cur;
      relayLoadNext(other, false)
        .catch(() => false)
        .finally(() => {
          relayArmed.current = true;
        });
    }
  }
  function queueZap(k: number) {
    const rq = rotatedQueue();
    if (!rq || k < 1 || k >= rq.r.length || !queueEditable()) return;
    const [item] = rq.r.splice(k, 1);
    rq.r.push(item); // to the end of the set: it comes back after all the others
    applyQueueOrder(rq.r, rq.cur, rq.fg, k === 1);
    flash(`« ${item.name} » passé en fin de set`);
  }
  function queueSwap(a: number, b: number) {
    const rq = rotatedQueue();
    if (!rq || a < 1 || b < 1 || a >= rq.r.length || b >= rq.r.length || a === b || !queueEditable()) return;
    [rq.r[a], rq.r[b]] = [rq.r[b], rq.r[a]];
    applyQueueOrder(rq.r, rq.cur, rq.fg, a === 1 || b === 1);
  }
  const toQueueTrack = (t: LibTrack): QueueTrack => ({ id: t.id, name: t.name, bpm: t.bpm, camelot: t.camelot, art: t.art });

  // the order box of the relay (see lib/relayHost.ts): the Playlist view registers itself, the others publish through it
  const hostApi = useRef<{ start: (id: string | null, idx?: number) => void; stop: () => void; zap: (k: number) => void; swap: (a: number, b: number) => void; skipNow: () => void }>({ start: () => {}, stop: () => {}, zap: () => {}, swap: () => {}, skipNow: () => {} });
  useEffect(() => {
    hostApi.current = {
      start: (id, idx) => {
        // the order may come from a library that changed the sets a moment ago: read what is stored
        const fresh = loadLibrary();
        dataRef.current = fresh;
        setData(fresh);
        if (id) playPlaylistRelay(id, idx);
        else {
          const none = { A: null, B: null };
          queueSrcRef.current = none;
          setQueueSrc(none);
          startRelay(idx);
        }
      },
      stop: () => {
        if (relayRef.current) stopRelay();
      },
      zap: (k) => queueZap(k),
      swap: (a, b) => queueSwap(a, b),
      skipNow: () => {
        if (!relayRef.current) return;
        skipNow.current = true;
        flash("Titre suivant : l'enchaînement démarre");
      },
    };
  });
  useEffect(() => {
    if (!splitLayout) return;
    return registerRelayHost({ start: (id, idx) => hostApi.current.start(id, idx), stop: () => hostApi.current.stop(), zap: (k) => hostApi.current.zap(k), swap: (a, b) => hostApi.current.swap(a, b), skipNow: () => hostApi.current.skipNow() });
  }, [splitLayout]);
  useEffect(() => {
    if (!splitLayout) return;
    const rq = relay ? rotatedQueue() : null;
    publishRelayHost({
      running: relay,
      fg: relayFg,
      cur: relayCur,
      now: rq ? toQueueTrack(rq.r[0]) : null,
      upcoming: rq ? rq.r.slice(1, 9).map(toQueueTrack) : [],
      editable: !!rq && queueEditable(),
      firstLocked: !!rq && relayFading.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the refs of the relay at each change of its state or of the library
  }, [splitLayout, relay, relayFg, relayCur, data]);

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
  // The relay's playlist (the one queued on Deck A) and the step of its mix plan for the song playing on `side`
  function relayPlaylist() {
    const plId = queueSrcRef.current.A;
    return plId ? dataRef.current.playlists.find((p) => p.id === plId) : undefined;
  }
  function relayStepFor(side: "A" | "B"): MixStep | undefined {
    const pl = relayPlaylist();
    // a plan made for another order of the set (songs added, removed or moved since) is not followed
    if (!pl?.mixPlan || pl.dj?.auto === false || pl.mixPlan.length !== pl.trackIds.length - 1) return undefined;
    const idx = relayIdx.current[side];
    return idx >= 0 ? pl.mixPlan[idx] : undefined;
  }
  // the radio voice announces the song coming in; the music steps down while it speaks.
  // "dj": the English clips made ahead of time (a clip not ready is simply skipped); "system": the computer's voice
  function announceOver(side: "A" | "B", first = false) {
    const pl = relayPlaylist();
    const dj = pl?.dj;
    if (!dj || dj.voice === "off") return;
    const queue = liveQueue(side);
    const idx = relayIdx.current[side];
    const decks = [engine.deckA, engine.deckB];
    const base = decks.map((d) => d.volumeValue);
    const duck = {
      onStart: () => decks.forEach((d, i) => d.setVolume(base[i] * 0.45)),
      onEnd: () => decks.forEach((d, i) => d.setVolume(base[i])),
    };
    if (dj.voiceEngine === "system") {
      const t = queue[idx];
      if (t) speak(announcement(t, dj.voice, first), duck);
      return;
    }
    const line = djLineFor(queue, idx, dj);
    const clips = [...(first && dj.voice === "radio" ? [INTRO_LINE] : []), ...(line ? [line] : [])];
    if (clips.length) playLines(clips, duck);
  }
  // the closing words, when the set is set to stop at its end
  function outroOver() {
    const dj = relayPlaylist()?.dj;
    if (!dj || dj.voice === "off" || dj.voiceEngine !== "dj") return;
    const decks = [engine.deckA, engine.deckB];
    const base = decks.map((d) => d.volumeValue);
    playLines([OUTRO_LINE], { onStart: () => decks.forEach((d, i) => d.setVolume(base[i] * 0.45)), onEnd: () => decks.forEach((d, i) => d.setVolume(base[i])) });
  }
  // TRANS (the rhythmic gate of the deck) set for the tempo and the style of the song that plays on this deck
  function tuneGate(deck: typeof engine.deckA, genre: Genre, classical = false) {
    const g = gateSetting(deck.bpm, genre, classical);
    if (!g) return;
    deck.setFxBeat("gate", g.beat);
    deck.setFxParam("gate", "p1", g.p1);
    deck.setFxParam("gate", "p2", g.p2);
  }
  // One move of the DJ on the song that plays (the "force" of the DJ sets how often, how strongly and for how long).
  // Every move puts everything back by itself. Resolves to the length of the move in seconds.
  function runAccent(deck: typeof engine.deckA, kind: AccentKind, amount: number, maxSec = 12, len = 1, voiceOff = false, genreForGate: Genre = "auto", rules?: DjRules): number {
    amount = capAmount(amount, rules);
    const glide = fadeFactor(rules); // how slowly the stems go down and come back
    const spb = 60 / deck.bpm;
    const bar = spb * 4;
    const L = (sec: number) => Math.min(sec * len, maxSec); // the length of this move, stretched by the force
    if (isMasterMove(kind)) {
      // an effect of the master rack (the whole mix), then put back
      const mv = MASTER_MOVES[kind];
      const fxName = mv.fx as FxName;
      const sec = L(mv.bars * bar);
      engine.setMasterFx(fxName, Math.min(1, mv.wet * (0.75 + 0.5 * amount)));
      window.setTimeout(() => engine.setMasterFx(fxName, 0), sec * 1000);
      return sec;
    }
    // moves put themselves back even when no relay runs (songs played by hand get them too)
    const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
    const burst = (fx: "echo" | "reverb" | "gate" | "roll" | "dub" | "flanger" | "noise", wet: number, sec: number) => {
      deck.setFxWet(fx, Math.min(1, wet));
      later(sec * 1000, () => deck.setFxWet(fx, 0));
      return sec;
    };
    const stem = (name: string) => deck.stemNames.indexOf(name);
    // a stem move: those stems go down, then come back after `sec`
    const stemsDown = (all: number[], sec: number) => {
      if (!all.length || all.some((i) => i < 0)) return 0;
      // the voice is off for a change: a move neither touches it nor brings it back
      const vi = voiceOff ? deck.stemNames.indexOf("vocals") : -1;
      const idx = all.filter((i) => i !== vi);
      if (!idx.length) return 0;
      // never a cut: the stems glide down and glide back (a bass drop comes back faster, but still over a few tenths)
      const out = Math.min(1.4, Math.max(0.4, sec * 0.3)) * glide;
      const back = (kind === "bassdrop" ? 0.3 : Math.min(1.2, Math.max(0.5, sec * 0.25))) * glide;
      idx.forEach((i) => deck.rampStemVol(i, 0, out));
      later(Math.max(out, sec - back * 0.5) * 1000, () => idx.forEach((i) => deck.rampStemVol(i, 1, back)));
      return sec;
    };
    switch (kind) {
      case "filterbreath": {
        // the bass thins out (high-pass) over two bars, then the filter opens again over one
        const down = L(bar * 2);
        deck.rampFilter(0.3 + 0.6 * amount, down);
        later(down * 1000, () => deck.rampFilter(0, bar));
        later((down + bar) * 1000 + 150, () => deck.setFilter(0));
        return down + bar;
      }
      case "echothrow":
        return burst("echo", 0.5 + 0.5 * amount, L(bar * 1.5));
      case "reverbwash":
        return burst("reverb", 0.7 + 0.3 * amount, L(bar));
      case "flangersweep":
        return burst("flanger", 0.6 + 0.4 * amount, L(bar * 2));
      case "gatechop":
        tuneGate(deck, genreForGate); // TRANS tuned to the tempo and the style of the song
        return burst("gate", 0.8 + 0.2 * amount, L(bar * 1.5));
      case "dubthrow":
        return burst("dub", 0.6 + 0.4 * amount, L(bar * 1.5));
      case "roll":
        return burst("roll", 1, L(spb * 4));
      case "noiseburst":
        return burst("noise", 0.5 + 0.5 * amount, L(bar * 2));
      case "drumsout":
        return stemsDown([stem("drums")], L(bar * 1.5));
      case "vocalecho": {
        const i = stem("vocals");
        if (i < 0) return 0;
        const sec = L(bar * 2);
        deck.setStemDelaySend(i, 0.6 + 0.4 * amount);
        later(sec * 1000, () => deck.setStemDelaySend(i, 0));
        return sec;
      }
      case "bassdrop": // out for a bar and a half, then it slams back
        return stemsDown([stem("bass")], L(spb * 6));
      case "drumsolo": // everything but the drums drops out, then comes back together
      case "vocalsolo": {
        const keep = stem(kind === "drumsolo" ? "drums" : "vocals");
        if (keep < 0) return 0;
        return stemsDown(deck.stemNames.map((_, i) => i).filter((i) => i !== keep), L(bar * 1.5));
      }
      case "voiceout": // an instrumental moment
        return stemsDown([stem("vocals")], L(bar * 2.5));
      case "otherout":
        return stemsDown([stem("other")], L(bar * 1.5));
    }
    return 0;
  }
  // At the start of a bar, when the force of the DJ says it is time and the song is neither starting nor about to
  // change, the DJ makes one move.
  function maybeAccent(side: "A" | "B", deck: typeof engine.deckA, remain: number, fadeSec: number) {
    const dj = relayPlaylist()?.dj;
    const live = getDjLive();
    // the top-bar switch rules (and works on songs played by hand); otherwise the set's own DJ options
    const active = live.on; // the DJ switch of the top bar rules: off = no move at all
    if (!active || !deck.playing || !(deck.bpm > 0) || relayFading.current) return; // no move in the middle of a change
    // a zen or calm set keeps its own gentle force and style, whatever the top-bar DJ says
    const gentle = isGentleGenre(dj?.genre);
    const force = live.on && !gentle ? live.force : forceOf(dj);
    const st = accentRef.current[side];
    const id = deck.origin?.id ?? deck.name;
    if (st.id !== id) {
      st.id = id;
      st.lastBar = Number.NEGATIVE_INFINITY;
      st.count = 0;
      // a new song: TRANS is set for its tempo and style, so that it also sounds right when pressed by hand
      tuneGate(deck, live.on && !gentle ? live.genre : dj?.genre ?? "auto", dj?.style === "classical");
    }
    const bar = (60 / deck.bpm) * 4;
    const rel = deck.position() - deck.beatGridOffset;
    const barIdx = Math.floor(rel / bar);
    if (rel - barIdx * bar > 0.45 || barIdx < 0) return; // only on the first beat of a bar
    // eslint-disable-next-line react-hooks/purity -- gestionnaire d'événement, hors rendu
    if (performance.now() < st.busy) return; // the previous move is still going
    // the first move comes after about half an interval, the next ones at the full interval
    if (st.lastBar === Number.NEGATIVE_INFINITY) st.lastBar = barIdx - Math.round(FORCE_PROFILE[force].everyBars / 2);
    // what the DJ knows of the song: its tempo, whether it is classical, the stems it really has
    const feel: Feel = { bpm: deck.bpm, classical: dj?.style === "classical", stems: deck.stemsActive && deck.stemReady ? deck.stemNames.filter((n) => !(vocalHeld.current[side] && n === "vocals")) : [], genre: live.on && !gentle ? live.genre : dj?.genre };
    if (!accentDue(force, barIdx, st.lastBar, deck.position(), remain, fadeSec, isCalm(feel))) return;
    const rules = dj?.rules ?? getDjRules();
    // the map of the song: the move fits the passage that plays, and a peak that starts in a few seconds gets its build-up
    const pos = deck.position();
    feel.section = sectionKindAt(deck.stemMap, pos);
    feel.voice = voiceStateAt(deck.stemMap, pos);
    const peakIn = nextSectionStart(deck.stemMap, pos, "peak");
    const riser = force >= 3 && peakIn !== null && peakIn - pos > 3 && peakIn - pos < 14 ? RISERS.find((k) => moveAllowed(k, rules) && ruleOk(k, feel)) : undefined;
    const kind = riser ?? pickAccent(force, st.count, feel, rules);
    if (!kind) return;
    st.lastBar = barIdx;
    st.count++;
    const sec = runAccent(deck, kind, amountFor(FORCE_PROFILE[force].amount, feel), 14, FORCE_PROFILE[force].len, vocalHeld.current[side], feel.genre ?? "auto", rules);
    // eslint-disable-next-line react-hooks/purity -- gestionnaire d'événement, hors rendu
    st.busy = performance.now() + sec * 1000 + 400; // the next move waits for this one to finish
    showDjAction(`${ACCENT_LABEL[kind]}${deck.name ? ` (${side})` : ""}`);
  }
  // songs played by hand (no relay on that deck) get the DJ's moves too when the top-bar switch is ON
  useEffect(() => {
    if (!splitLayout) return;
    const id = window.setInterval(() => {
      // the top bar says whether the DJ can use the stems of what plays: in use / available (on disk or loaded) / none
      const playing = [engine.deckA, engine.deckB].filter((d) => d.playing);
      setDjStems(playing.filter((d) => d.stemsActive && d.stemReady).length, playing.filter((d) => d.stemReady || d.stemCached).length);
      // The DJ uses the stems of a song that has them but plays as one block (played by hand, first song of a relay...):
      // loaded first (from the disk cache, nothing is computed), then switched on at the start of a bar
      const wantsStems = getDjLive().on && (relayPlaylist()?.dj?.rules ?? getDjRules()).autoStems !== false;
      if (wantsStems) {
        for (const side of ["A", "B"] as const) {
          const d = side === "A" ? engine.deckA : engine.deckB;
          if (!d.playing || d.stemsActive || d.streamOnly || relayFading.current || d.duration - d.position() < 25 || getMemLevel() === "critical") continue;
          if (d.stemReady) {
            const bar = d.bpm > 0 ? (60 / d.bpm) * 4 : 0;
            if (bar > 0 && (d.position() - d.beatGridOffset) % bar > 0.5) continue; // wait for the first beat of a bar
            d.setStemsActive(true);
            showDjAction(`stems activés (${side})`);
          } else if (d.stemCached && stemLoadTried.current[side] !== (d.origin?.id ?? d.name)) {
            stemLoadTried.current[side] = d.origin?.id ?? d.name;
            void d.ensureStems();
          }
        }
      }
      if (!getDjLive().on) return;
      for (const side of ["A", "B"] as const) {
        if (relayRef.current && relaySide.current === side) continue; // the relay tick looks after its own deck
        const d = side === "A" ? engine.deckA : engine.deckB;
        if (d.playing && d.duration > 0) maybeAccent(side, d, d.duration - d.position(), 0);
      }
    }, 400);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitLayout]);
  // The voice of a song that came in with its voice off comes back, over two seconds, once the blend is over and the
  // song is back at its own tempo (a voice pitched to another tempo is the first thing one hears).
  function releaseVocalsWhenHome(deck: typeof engine.deckA, id: string | undefined, side: "A" | "B") {
    let waited = 0;
    const poll = window.setInterval(() => {
      waited += 400;
      if (deck.origin?.id !== id || !deck.playing) {
        window.clearInterval(poll);
        vocalHeld.current[side] = false;
        return;
      }
      if (relayFading.current || (Math.abs(deck.pitchPct) > 0.7 && waited < 45000)) return;
      window.clearInterval(poll);
      vocalHeld.current[side] = false; // the voice is back: moves may use it again
      const i = deck.stemNames.indexOf("vocals");
      if (i < 0 || !deck.stemsActive) return;
      let v = 0;
      const ramp = window.setInterval(() => {
        v = Math.min(1, v + 0.1);
        deck.rampStemVol(i, v, 0.3);
        if (v >= 1 || deck.origin?.id !== id) window.clearInterval(ramp);
      }, 200);
    }, 400);
  }
  // vinyl brake: the song slows down to a stop in under a second
  function brakeOut(deck: typeof engine.deckA) {
    let a = 0.25;
    const timer = window.setInterval(() => {
      a = Math.min(1, a + 0.12);
      deck.scratch(-a);
      if (a >= 1) window.clearInterval(timer);
    }, 90);
  }
  // after a beat-matched blend the incoming song drifts back to its own tempo instead of staying pitched
  function pitchHome(deck: typeof engine.deckA) {
    const id = deck.origin?.id;
    const timer = window.setInterval(() => {
      const p = deck.pitchPct;
      if (!relayRef.current || deck.origin?.id !== id || Math.abs(p) < 0.05) {
        window.clearInterval(timer);
        if (relayRef.current && deck.origin?.id === id) deck.setPitch(0);
        return;
      }
      deck.setPitch(p * 0.93);
    }, 400);
  }

  // Watch the foreground deck; when a song is ~ending, start the other deck and
  // autofade across to it, then cue the next single on the deck that just freed up.
  // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
  useEffect(() => {
    if (!relay) return;
    const id = window.setInterval(() => {
      if (relayFading.current || !relayArmed.current) return;
      // re-read the transition length/type/preload EVERY tick, not once when
      // the relay started — otherwise changing the style/duration mid-set
      // (a very normal thing to do) was silently ignored until stop+restart.
      const side = relaySide.current;
      const other = side === "A" ? "B" : "A";
      const pl = relayPlaylist();
      const dj = pl?.dj;
      // the mix plan (prepared in advance, one step per song) wins over the set's single style and length
      const step = relayStepFor(side);
      const FADE = step ? Math.max(step.sec, 0) : relayTransitionSec();
      const rules = dj?.rules ?? getDjRules();
      const wanted = step?.type ?? relayTransitionType();
      const djOn = getDjLive().on; // DJ off: no effect on the change, a plain blend
      const TYPE = transitionAllowed(wanted, rules) && (djOn || !EFFECT_TRANSITIONS.includes(wanted)) ? wanted : "fade"; // a blend the user forbade since the plan was made
      const preload = livePreloadSec(other);
      const deck = side === "A" ? engine.deckA : engine.deckB;
      const otherDeck = other === "A" ? engine.deckA : engine.deckB;
      if (!deck.playing || deck.duration <= 0) return;
      let remain = deck.duration - deck.position();
      if (skipNow.current) remain = Math.min(remain, FADE + 2.6); // "next song now": as if the end were near

      maybeAccent(side, deck, remain, FADE);

      // end of the set: no new song, the closing words, then the relay stops with the last song
      if (dj?.endOfSet === "stop" && relayIdx.current[side] === liveQueue(side).length - 1) {
        relayArmed.current = false;
        window.setTimeout(outroOver, Math.max(0, remain - 10) * 1000);
        window.setTimeout(() => {
          if (relayRef.current) stopRelay();
        }, (remain + 0.6) * 1000);
        return;
      }


      // a beat-matched start waits for the next beat or bar: begin that much earlier so the blend keeps its length
      const lead = step?.sync && TYPE !== "cut" ? (dj?.phrase === false ? 0.8 : 2.6) : 0;
      const preFadeWindow = TYPE === "cut" ? Math.max(2, preload) : FADE + lead;
      if (remain > preFadeWindow + 0.3) return;
      relayArmed.current = false;
      skipNow.current = false;
      // tempos too far apart: the voices of the two songs are switched off for the change
      // the tempo of each song: what the deck measured, or the library's when the deck has not finished measuring (the song
      // waiting on the other deck may still be loading)
      const libBpm = (d: typeof deck, side: "A" | "B") => (d.bpm > 0 ? d.bpm : liveQueue(side)[relayIdx.current[side]]?.bpm ?? 0);
      const bpmOut = libBpm(deck, side);
      const bpmIn = libBpm(otherDeck, other);
      const gapLimit = dj?.vocalGap ?? VOCAL_GAP_BPM;
      const bigGap = gapLimit > 0 && bpmDiff(bpmOut, bpmIn) >= gapLimit && TYPE !== "cut";
      const vocalHold = bigGap && (deck.stemsActive || otherDeck.stemsActive);
      // what the DJ saw at this change (visible in the console of the app: useful when a change does not sound as expected)
      console.info("[DJ enchaînement]", { type: TYPE, bpmOut, bpmIn, ecart: Math.round(bpmDiff(bpmOut, bpmIn) * 10) / 10, seuil: gapLimit, stemsOut: deck.stemsActive && deck.stemReady, stemsIn: otherDeck.stemsActive && otherDeck.stemReady, voixCoupees: vocalHold });
      // beat-matched: the incoming tempo follows the outgoing one and it starts exactly on a beat (or on a bar)
      let wait = 0;
      if (step?.sync && TYPE !== "cut") {
        engine.sync(other);
        wait = alignDelaySec(deck, otherDeck, dj?.phrase === false ? 1 : 4);
        if (wait > Math.max(0, remain - 3)) wait = alignDelaySec(deck, otherDeck, 1); // too close to the end for a bar
      }
      const secs = TYPE === "cut" ? 0 : Math.min(FADE, Math.max(2, remain - wait - 0.2));
      const braking = TYPE === "cut" && step?.tail === "brake";
      // both songs in stem mode (or one of them): a stem technique replaces the plain blend
      const stemMode: StemMode = dj?.stems ?? "punchy";
      const tech =
        step && dj && djOn
          ? pickTech({ outStems: deck.stemsActive && deck.stemReady, inStems: otherDeck.stemsActive && otherDeck.stemReady, index: relayIdx.current[side], mode: stemMode, type: TYPE, sec: secs, bpm: Math.min(deck.bpm || 120, otherDeck.bpm || 120), sync: !!step?.sync, noVocals: vocalHold, rules })
          : null;
      if (tech) flash(`DJ : ${STEM_TECH_LABEL[tech]}`);
      const go = () => {
        if (!relayRef.current) return;
        let vocalNote = "";
        // same volume as the song that is leaving
        if (dj?.loudness !== false && step) {
          const lo = cachedLoudness(deck.origin?.id ?? "");
          const li = cachedLoudness(otherDeck.origin?.id ?? "");
          if (lo !== null && li !== null) {
            const outDb = 20 * Math.log10(Math.max(deck.trimValue, 1e-3));
            if (baseTrim.current[other] === undefined) baseTrim.current[other] = otherDeck.trimValue;
            otherDeck.setTrim(Math.pow(10, matchTrimDb(lo, outDb, li) / 20));
          }
        }
        if (step?.keyShift) otherDeck.setKeyShift(step.keyShift); // transposed so the two keys agree
        if (step?.bassSwap && !tech) otherDeck.setEQ("low", -24);
        if (tech) {
          // the incoming stems start at their first level before the song is heard (fade starts them below)
          const f0 = stemFrame(tech, 0, stemMode).inn;
          for (const [n, v] of Object.entries(f0) as [StemName, number][]) {
            const i = otherDeck.stemNames.indexOf(n);
            if (i >= 0) otherDeck.setStemVol(i, v);
          }
        }
        // a "gate" change: TRANS of the song that leaves is set for its tempo and style first
        if (TYPE === "gate") tuneGate(deck, getDjLive().on && !isGentleGenre(dj?.genre) ? getDjLive().genre : dj?.genre ?? "auto", dj?.style === "classical");
        otherDeck.play(); // bring in the cued deck
        if (braking) {
          relayFade(other, 0.9, "fade", false); // the old song slows down while it fades away
          brakeOut(deck);
        } else {
          relayFade(other, Math.max(secs, 0.05), TYPE, !!step?.bassSwap && !tech, tech ? { tech, mode: stemMode } : undefined, { holdVocals: vocalHold });
          if (vocalHold) {
            vocalHeld.current[other] = true;
            releaseVocalsWhenHome(otherDeck, otherDeck.origin?.id, other);
          }
          vocalNote = vocalHold ? `voix coupées (${Math.round(bpmDiff(bpmOut, bpmIn))} BPM d'écart)` : bigGap ? `${Math.round(bpmDiff(bpmOut, bpmIn))} BPM d'écart, stems indisponibles : voix gardées` : "";
        }
        // the style's own touch on the change: an echo out, a riser, a phaser... on top of the blend (from force 3)
        const live = getDjLive();
        if (TYPE !== "cut" && !braking && live.on) {
          const gentle = isGentleGenre(dj?.genre);
          const force = live.on && !gentle ? live.force : forceOf(dj);
          const feelT: Feel = { bpm: Math.min(deck.bpm || 120, otherDeck.bpm || 120), classical: dj?.style === "classical", genre: live.on && !gentle ? live.genre : dj?.genre };
          const move = deck.bpm > 0 ? pickTransitionMove(force, relayIdx.current[side], feelT, rules) : null;
          if (move) {
            runAccent(deck, move, amountFor(FORCE_PROFILE[force].amount, feelT), Math.max(2, secs), FORCE_PROFILE[force].len, false, "auto", rules);
            showDjAction(`${vocalNote ? `${vocalNote} + ` : ""}${ACCENT_LABEL[move]} (enchaînement)`);
            vocalNote = "";
          }
        }
        if (vocalNote) showDjAction(vocalNote); // (when no move of the style came with the change)
        if (step?.sync && TYPE !== "cut") window.setTimeout(() => pitchHome(otherDeck), (secs + 1) * 1000);
        window.setTimeout(() => announceOver(other), TYPE === "cut" ? 300 : Math.min(secs * 0.35, 4) * 1000);
      };
      if (wait > 0) window.setTimeout(go, wait * 1000);
      else go();
      relaySide.current = other;
      setRelayFg(other); // the incoming deck is now "en cours" in the list
      // once the fade is done, stop the old deck and cue its next single
      window.setTimeout(() => {
        if (!relayRef.current) return;
        deck.pause();
        deck.setFilter(0); // reset — this deck gets reused for the next song
        deck.setPitch(0);
        deck.setEQ("low", 0);
        deck.setKeyShift(0);
        if (baseTrim.current[side] !== undefined) {
          deck.setTrim(baseTrim.current[side]!);
          baseTrim.current[side] = undefined;
        }
        deck.scratch(0);
        // re-armed whatever happens: a song that fails to load must not freeze the relay for good
        relayLoadNext(side, false)
          .catch(() => false)
          .finally(() => {
            relayArmed.current = true;
          });
      }, ((braking ? 0.9 : secs) + wait + 0.5) * 1000);
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
    if (relayOn) {
      const i = relayCurShown[side];
      if (i < 0 || i >= q.length) return { cur: null, next: null };
      const id = q[i].id;
      return side === relayFgShown ? { cur: id, next: null } : { cur: null, next: id };
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
    nested = false,
  }: {
    t: LibTrack;
    plId?: string;
    idx?: number; // 0-based position when shown inside a playlist
    count?: number; // playlist length, to disable the last "↓"
    nested?: boolean; // already inside an <li> (library list): render a <div>, an <li> can't hold an <li>
  }) => {
    const Row = nested ? "div" : "li";
    const badge = SRC_BADGE[t.source];
    const hasStems = !!t.stemHash && stemSet.has(t.stemHash);
    const prepJob = prep.jobs.find((j) => j.trackId === t.id);
    const prepReady = prep.ready.some((r) => r.trackId === t.id);
    const inPl = plId != null && idx != null && count != null;
    // playing-now / next-up status for the deck-colour cues
    const curSide = markA.cur === t.id ? "A" : markB.cur === t.id ? "B" : null;
    const nextSide = markA.next === t.id ? "A" : markB.next === t.id ? "B" : null;
    const cueColor = (s: "A" | "B") => (s === "A" ? COLOR_A : COLOR_B);
    return (
      <Row
        className={`hw-strip flex flex-wrap items-center gap-2 px-2 py-1.5 ${nextSide ? "lib-next-blink" : ""}`}
        style={{
          ...(nextSide ? { ["--cue" as string]: cueColor(nextSide) } : {}),
          ...(curSide && !nextSide
            ? {
                boxShadow: `inset 3px 0 0 ${cueColor(curSide)}, 0 0 8px ${cueColor(curSide)}55, inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 5px rgba(0,0,0,0.5)`,
              }
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
                className="px-1 text-[10px] leading-none text-neutral-400 disabled:opacity-20"
                title="Monter dans la file"
              >
                ▲
              </button>
              <button
                onClick={() => moveInPlaylist(plId!, t.id, 1)}
                disabled={idx === count! - 1}
                className="px-1 text-[10px] leading-none text-neutral-400 disabled:opacity-20"
                title="Descendre dans la file"
              >
                ▼
              </button>
            </div>
            <button
              onClick={() => playPlaylistRelay(plId!, idx!)}
              className="rounded px-1.5 py-1 text-[10px] font-black leading-none text-violet-300 ring-1 ring-violet-800/60"
              title="Démarrer le set ici : Relais A→B→A à partir de ce titre — les suivants s'enchaînent dans l'ordre, en boucle"
            >
              ▶ ici
            </button>
          </div>
        )}

        {/* cover thumbnail — bigger in a set (explicit ask), a bit smaller in
            the plain library list ("Écouter") so more rows fit at once */}
        <div className={`${inPl ? "h-24 w-24" : "h-16 w-16"} hw-cover shrink-0 rounded-md bg-neutral-900`}>
          {t.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(t.art, 120)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="hw-vinyl flex h-full w-full items-center justify-center text-base font-black text-white drop-shadow"
              style={{ ["--led" as string]: "#8a8a92" }}
            >
              ♫
            </div>
          )}
        </div>

        {/* deck filing chips — which deck's "LIVE loop" this single belongs to
            when no set is queued. Only shown in the raw library: inside a set
            the order below already says everything about how it plays. */}
        {!inPl && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase leading-none text-neutral-600">Classer</span>
            <div className="hw-well flex overflow-hidden">
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
          <div className="flex items-center gap-1.5 text-[10px]">
            {typeof t.durationSec === "number" && (
              <span className="font-mono text-neutral-400">{fmt(t.durationSec)}</span>
            )}
            {typeof t.bpm === "number" && (
              <span
                className="font-mono text-amber-400"
                title={t.bpmEstimated ? `BPM estimé (confiance ${Math.round((t.bpmConfidence ?? 0) * 100)} %)` : "BPM de la source"}
              >
                {t.bpmEstimated ? "≈ " : ""}{Math.round(t.bpm)} BPM
              </span>
            )}
            {t.camelot && <span className="font-mono text-cyan-300">{t.camelot}</span>}
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
            {!hasStems && prepReady && (
              <span className="rounded-sm px-1 font-black text-cyan-300" title="Stems préparés : se chargent sans attendre">
                ✂ PRÊT
              </span>
            )}
            {!hasStems && !prepReady && prepJob?.status === "running" && (
              <span className="font-bold text-cyan-400" title="Séparation en cours (elle se met en pause pendant la lecture)">
                ⏳ séparation {prepJob.progress} %
              </span>
            )}
            {!hasStems && !prepReady && prepJob?.status === "queued" && (
              <span className="font-bold text-cyan-500" title="Dans la file : la préparation démarre quand les platines sont à l'arrêt">
                ⏳ en file
              </span>
            )}
            {!hasStems && !prepReady && prepJob?.status === "error" && prepJob.error === "fichier introuvable" && (
              <span className="rounded-sm px-1 font-black text-red-300" title="Le fichier audio n'est plus dans le navigateur : réimporte le morceau">
                ✂ FICHIER ABSENT
              </span>
            )}
            {!hasStems && !prepReady && prepJob?.status === "error" && prepJob.error !== "fichier introuvable" && (
              <button
                onClick={() => queueStemsPrep(t)}
                className="rounded-sm px-1 font-black text-red-300 ring-1 ring-red-800"
                title={`Échec : ${prepJob.error ?? "erreur inconnue"}. Cliquer pour relancer`}
              >
                ✂ RÉESSAYER
              </button>
            )}
            {!hasStems && !prepReady && !prepJob && (
              <button
                onClick={() => queueStemsPrep(t)}
                className="rounded-sm px-1 font-black text-cyan-300 ring-1 ring-cyan-800"
                title="Ajoute ce morceau à la préparation : ses stems seront prêts à charger"
              >
                ✂ PRÉPARER
              </button>
            )}
            {t.fxA && <span style={{ color: COLOR_A }}>● FX A</span>}
            {t.fxB && <span style={{ color: COLOR_B }}>● FX B</span>}
          </div>
        </div>

        {/* load — each button only disables ITSELF while loading, so a slow or
            failed send never locks out the other rows/decks. Hidden inside a
            set: use the set's own ▶ Deck A/B/Relais controls instead. */}
        {!inPl && (
        <div className="flex basis-full flex-col items-center gap-0.5 sm:basis-auto sm:shrink-0">
          <span className="text-[9px] uppercase leading-none text-neutral-600">Charger</span>
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
          <span className="text-[9px] font-bold uppercase text-neutral-500">FX</span>
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
      </Row>
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

      {/* CD players — always shown as soon as a deck has a track loaded, so it's
          obvious at a glance what's playing on each deck and what comes next. */}
      {(["A", "B"] as const).map((side) => {
        const deck = side === "A" ? engine.deckA : engine.deckB;
        if (!deck.name) return null;
        const color = side === "A" ? COLOR_A : COLOR_B;
        // find "now / next" from whichever set is driving this deck, else the active one
        const drivingId = queueSrc[side] ?? activePl;
        const drivingPl = drivingId ? data.playlists.find((p) => p.id === drivingId) : null;
        const ids = drivingPl?.trackIds ?? [];
        const curIdx = ids.findIndex((id) => id === deck.origin?.id);
        const nextT = curIdx >= 0 && ids.length ? trackById(ids[(curIdx + 1) % ids.length]) : null;
        return (
          <CdPlayerFace
            key={side}
            deck={deck}
            color={color}
            side={side}
            trackNo={curIdx >= 0 ? curIdx + 1 : undefined}
            trackCount={ids.length || undefined}
            nextName={nextT?.name ?? null}
            onPrev={() => stepSingle(side, -1)}
            onPlayPause={() => (deck.playing ? deck.pause() : deck.play())}
            onNext={() => stepSingle(side, 1)}
          />
        );
      })}

      {activePlaylist ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="max-w-[60vw] truncate text-xs font-bold text-violet-300" title={activePlaylist.name}>
                {activePlaylist.name}
              </span>
              <span className="shrink-0 text-[10px] text-neutral-500">
                {activePlaylist.trackIds.length} titre{activePlaylist.trackIds.length > 1 ? "s" : ""}
                {" · "}
                {fmt(
                  activePlaylist.trackIds.reduce((sum, id) => sum + (trackById(id)?.durationSec ?? 0), 0)
                )}{" "}
                au total
              </span>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="hw-btn px-2 py-0.5 text-[10px] font-bold" title="Renommer le set" onClick={() => renamePlaylist(activePlaylist.id)}>
                RENOMMER
              </button>
              <button className="hw-btn px-2 py-0.5 text-[10px] font-bold" title="Dupliquer le set" onClick={() => duplicatePlaylist(activePlaylist.id)}>
                DUPLIQUER
              </button>
              <button className="hw-btn px-2 py-0.5 text-[10px] font-bold" title="Vider le set (les morceaux restent dans la bibliothèque)" onClick={() => clearPlaylist(activePlaylist.id)}>
                VIDER
              </button>
              <button
                className="hw-btn px-2 py-0.5 text-[10px] font-bold text-red-400"
                title="Supprimer le set (les morceaux restent dans la bibliothèque)"
                onClick={() => {
                  const name = dataRef.current.playlists.find((pl) => pl.id === activePlaylist.id)?.name;
                  if (name && confirm(`Supprimer le set « ${name} » ? Les morceaux restent dans la bibliothèque.`)) {
                    delPlaylist(activePlaylist.id);
                  }
                }}
              >
                SUPPRIMER LE SET
              </button>
            </div>
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
              // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
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
              className={`hw-btn px-2 py-1 text-[11px] font-bold disabled:opacity-40 ${relayOn && queueSrc.A === activePlaylist.id ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: relayOn && queueSrc.A === activePlaylist.id ? undefined : "#a78bfa" }}
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

  const onlineSources = (
    <>
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
                      className="h-16 w-16 shrink-0 rounded bg-neutral-700 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-100">{t.title}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {t.artist} · {fmt(t.duration)}
                        {t.bpm ? ` · ${t.bpm} BPM` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => markLater(t, tab === "youtube" ? "youtube" : "audius")}
                      className="hw-btn shrink-0 px-2 py-1 text-xs"
                      title="Garder ce morceau pour plus tard (préparer ses stems en lot)"
                    >
                      + PLUS TARD
                    </button>
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

              {/* keyword-driven discovery — no seed track needed: launch a themed
                  set straight from an idea ("années 80; 100 BPM; Electro; live") */}
              <div className="flex items-center gap-1.5 rounded bg-fuchsia-500/5 px-2 py-1.5 ring-1 ring-fuchsia-500/20">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">
                  🔍 Découverte par mots-clés
                </span>
                <input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") generateDiscover(keywordInput);
                  }}
                  placeholder="ex : années 80 ; 100 BPM ; Electro ; live"
                  className="min-w-0 flex-1 rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none ring-1 ring-neutral-700 placeholder:text-neutral-600"
                  title="Sépare tes mots-clés par ; — décennie, genre, BPM, ambiance… L'IA propose ~20 titres, sans avoir besoin d'un morceau de départ"
                />
                <button
                  onClick={() => generateDiscover(keywordInput)}
                  disabled={!keywordInput.trim()}
                  className="hw-btn shrink-0 px-2 py-1 text-xs disabled:opacity-30"
                  style={{ ["--led" as string]: "#e879f9", color: "#e879f9" }}
                >
                  Chercher
                </button>
              </div>

              {/* duration filter — long-form results (sets/mixes/live streams)
                  are always soft-penalized; picking a cap here hard-excludes them */}
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  ⏱ Durée
                </span>
                {([
                  [null, "Tout"],
                  [5, "≤ 5 min"],
                  [8, "≤ 8 min"],
                  [10, "≤ 10 min"],
                ] as const).map(([min, label]) => (
                  <button
                    key={String(min)}
                    onClick={() => {
                      setAutoMaxDurationMin(min);
                      if (autoKeywords) generateDiscover(autoKeywords);
                      else if (autoSeed) generateAuto(autoSeed);
                    }}
                    className={`hw-btn px-2 py-1 text-xs ${autoMaxDurationMin === min ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: "#e879f9", color: autoMaxDurationMin === min ? "#0a0a0a" : "#e879f9" }}
                    title={min == null ? "Pas de plafond — les titres longs (sets/mixes/lives) restent juste moins bien classés" : `Exclut tout ce qui dépasse ${min} minutes`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* keywords card */}
              {autoKeywords && (
                <div className="flex items-center gap-2 rounded bg-fuchsia-500/10 px-3 py-2 ring-1 ring-fuchsia-500/30">
                  <span className="text-lg">🔍</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-neutral-100">{autoKeywords}</div>
                    <div className="truncate text-[11px] text-neutral-400">Mots-clés</div>
                  </div>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black"
                    style={{ color: "#0a0a0a", background: autoUsedAI ? "#e879f9" : "#6b7280" }}
                    title={autoUsedAI ? "Mots-clés interprétés par l'IA (Groq) — sources Audius + YouTube" : "IA non configurée — recherche directe des mots-clés, Audius + YouTube"}
                  >
                    {autoUsedAI ? "IA · AUDIUS+YT" : "AUDIUS+YT"}
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
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black"
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

              {!autoLoading && !autoSeed && !autoKeywords && (
                <p className="py-6 text-center text-sm text-neutral-600">
                  Tape des mots-clés ci-dessus (décennie, genre, BPM, ambiance…) pour un set instantané sur
                  un thème, ou cherche un titre dans l&apos;onglet ♫ Audius et clique sur « ✨ Auto », ou pars
                  d&apos;un morceau chargé sur un deck. L&apos;IA propose ~20 titres à écouter, filer en
                  bibliothèque et enchaîner en set.
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
                        <img src={t.artwork ?? ""} alt="" className="h-14 w-14 shrink-0 rounded bg-neutral-700 object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="shrink-0 rounded-sm px-1 text-[9px] font-black"
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

    </>
  );
  const auditWidget = (
  <div className="flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-1.5">
    <div className={`hw-led ${audit === null ? 'bg-[#525252]' : (audit ? audit.missing.length + audit.orphans.length : 0) > 0 ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`} />
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-bold text-neutral-200">
        {audit === null ? 'Non vérifiée' : (audit ? audit.missing.length + audit.orphans.length : 0) > 0 ? `${audit.missing.length} sans fichier · ${audit.orphans.length} orphelins` : 'Cohérente'}
      </div>
      {usage && (
        <>
          <div className="relative h-1.5 w-40 rounded-full bg-neutral-800">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-[#38bdf8] to-[#a78bfa]"
              style={{ width: `${Math.min(100, (usage.usedMb / usage.quotaMb) * 100)}%` }}
            />
          </div>
          <div className="text-[9px] font-mono text-neutral-500">
            {usage.usedMb.toFixed(1)} Mo / {Math.round(usage.quotaMb)} Mo
          </div>
        </>
      )}
    </div>
    <button
      className="hw-btn px-2.5 py-1 text-[10px] font-bold"
      onClick={async () => {
        setUsage(await storageUsage());
        runAudit();
      }}
      title="Vérifie que chaque piste a son fichier et que chaque fichier a sa piste"
    >
      VÉRIFIER
    </button>
    {audit && audit.missing.length > 0 && (
      <button
        className="hw-btn px-2.5 py-1 text-[10px] font-bold"
        onClick={fixMissing}
      >
        Retirer sans fichier ({audit.missing.length})
      </button>
    )}
    {audit && audit.orphans.length > 0 && (
      <button
        className="hw-btn px-2.5 py-1 text-[10px] font-bold"
        onClick={fixOrphans}
      >
        Supprimer orphelins ({audit.orphans.length})
      </button>
    )}
  </div>

  );
  const fileInput = (
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

  );

  // ===== Playlist view (splitLayout): data and actions for the presentational components =====
  const readLive = useCallback(
    (side: PlSide): DeckLive => {
      const d = side === "A" ? engine.deckA : engine.deckB;
      return { title: d.name || null, playing: d.playing, pos: d.position(), dur: d.duration || 0 };
    },
    [engine]
  );

  if (splitLayout) {
    const deckOf = (side: PlSide) => (side === "A" ? engine.deckA : engine.deckB);
    const liveOf = (side: PlSide) => (side === "A" ? liveA : liveB);
    const deckInfo = (side: PlSide): DeckInfo => {
      const d = deckOf(side);
      const origin = d.origin ? trackById(d.origin.id) : undefined;
      const srcId = liveOf(side) || relay ? queueSrc[side] : null;
      const pl = srcId ? data.playlists.find((p) => p.id === srcId) : undefined;
      const ids = pl?.trackIds ?? [];
      const ci = origin ? ids.indexOf(origin.id) : -1;
      const nextT = ci >= 0 && ids.length > 1 ? trackById(ids[(ci + 1) % ids.length]) : undefined;
      return {
        side,
        title: d.name || null,
        art: active[side]?.art ?? origin?.art,
        bpm: origin?.bpm ?? (d.effectiveBPM || undefined),
        camelot: origin?.camelot,
        stemMap: d.stemMap,
        live: liveOf(side),
        trackNo: ci >= 0 ? ci + 1 : undefined,
        trackCount: pl ? ids.length : undefined,
        setName: pl?.name,
        next: nextT ? { title: nextT.name, art: nextT.art } : null,
      };
    };
    // which set drives which deck right now
    const driving = (id: string) => ({
      A: queueSrc.A === id && (liveA || relay),
      B: queueSrc.B === id && (liveB || relay),
      relay: relay && queueSrc.A === id,
    });
    // where a track sits relative to the decks: on air, or cued next
    const marksFor = (id: string): TrackMark => {
      let cur: PlSide | null = null;
      let next: PlSide | null = null;
      for (const side of ["A", "B"] as const) {
        const d = deckOf(side);
        if (d.name && d.origin?.id === id) {
          if (relay && relayFg !== side) next = side;
          else cur = side;
        }
        if (!relay && liveOf(side)) {
          const ids = data.playlists.find((p) => p.id === queueSrc[side])?.trackIds ?? [];
          const ci = d.origin ? ids.indexOf(d.origin.id) : -1;
          if (ci >= 0 && ids.length > 1 && ids[(ci + 1) % ids.length] === id) next = next ?? side;
        }
      }
      return { cur, next };
    };
    const stemOf = (id: string): StemInfo => {
      const t = trackById(id);
      const job = prep.jobs.find((j) => j.trackId === id);
      if ((t?.stemHash && stemSet.has(t.stemHash)) || sharedStems.has(t)) return { state: "done", pct: 100 };
      if (job?.status === "running") return job.phase === "download" ? { state: "download", pct: null } : { state: "run", pct: job.progress };
      if (job?.status === "queued") return { state: "queued", pct: null };
      if (job?.status === "error") return { state: "error", pct: null, error: job.error };
      return { state: "none", pct: null };
    };
    const sendSet = (dest: "A" | "B" | "relay", id: string, startIdx?: number) => {
      if (dest === "relay") playPlaylistRelay(id, startIdx);
      else playPlaylistLive(dest, id, startIdx);
    };
    const ap = activePlaylist ?? data.playlists[0] ?? null; // the first set is open by default
    const setIds = new Set(ap?.trackIds ?? []);
    const allSec = data.tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
    const readyCount = data.tracks.filter((t) => stemOf(t.id).state === "done").length;
    const laterCount = data.tracks.filter((t) => t.later).length;
    const status = relay ? "Relais" : liveA && liveB ? "LIVE A+B" : liveA ? "LIVE A" : liveB ? "LIVE B" : "À l'arrêt";

    return (
      <PlaylistStudio
        tiles={[
          { label: "Bibliothèque", value: String(data.tracks.length), sub: `${fmtDur(allSec)} · ${laterCount} à jouer plus tard`, color: "var(--prep-accent)" },
          { label: "Sets", value: String(data.playlists.length), sub: `${new Set(data.playlists.flatMap((p) => p.trackIds)).size} titre(s) rangé(s)`, color: "#a78bfa" },
          { label: "Stems prêts", value: `${readyCount}/${data.tracks.length}`, sub: "chargement instantané", color: "#34d399", meter: data.tracks.length ? readyCount / data.tracks.length : 0 },
          { label: "Lecture", value: status, sub: relay ? `en antenne : deck ${relayFg}${djAction ? ` · DJ : ${djAction}` : ""}` : "platines A et B", color: "#ffcc00" },
        ]}
        decks={{
          decks: { A: deckInfo("A"), B: deckInfo("B") },
          readLive,
          relay,
          relayFg,
          onPrev: (side) => stepSingle(side, -1),
          onToggle: (side) => {
            const d = deckOf(side);
            if (d.playing) d.pause();
            else d.play();
            onLoaded?.();
          },
          onNext: (side) => stepSingle(side, 1),
          onToggleLive: (side) => toggleLive(side),
          // the relay button of the Playlist view plays the set that is open (it used to look for singles filed on
          // the decks, found none and silently did nothing)
          onToggleRelay: () => {
            if (relay) stopRelay();
            else if (ap && ap.trackIds.length >= 2) playPlaylistRelay(ap.id);
            else flash("Relais : ouvre un set d'au moins 2 titres, puis relance");
          },
        }}
        onAddFound={addFoundToSet}
        rail={{
          tracks: data.tracks,
          playlists: data.playlists,
          activeId: ap?.id ?? null,
          driving,
          onSelect: (id) => setActivePl(id),
          onCreate: createSetNamed,
          onDropTracks: (id, ids) => addTracksAt(id, ids),
          onPlay: (dest, id) => sendSet(dest, id),
          stemReady: (id) => stemOf(id).state === "done",
          onWizard: () => setWizard((w) => ({ nonce: (w?.nonce ?? 0) + 1 })),
          trash: loadPlaylistTrash().map((t) => ({ at: t.at, count: t.playlists.length, names: t.playlists.map((p) => p.name).join(", ") })),
          onRestore: (i) => {
            const entry = loadPlaylistTrash()[i];
            if (!entry) return;
            persist((d) => ({ ...d, playlists: [...d.playlists, ...entry.playlists.filter((p) => !d.playlists.some((x) => x.id === p.id))] }));
            flash(`${entry.playlists.length} set(s) restauré(s)`);
          },
        }}
        detail={{
          playlist: ap,
          tracks: data.tracks,
          marks: marksFor,
          stemOf,
          driving: ap ? driving(ap.id) : { A: false, B: false, relay: false },
          onRename: (name) => ap && renameNow(ap.id, name),
          onDuplicate: () => ap && duplicatePlaylist(ap.id),
          onClear: () => ap && clearNow(ap.id),
          onDelete: () => ap && delPlaylist(ap.id),
          onTransitionSec: (sec) => ap && setTransition(ap.id, sec),
          onTransitionType: (type) => ap && setTransitionType(ap.id, type),
          onPreload: (sec) => ap && setPreloadSec(ap.id, sec),
          onMove: (from, to) => ap && moveIndex(ap.id, from, to),
          onRemove: (trackId) => ap && toggleInPlaylist(ap.id, trackId),
          onAddTracks: (ids, at) => ap && addTracksAt(ap.id, ids, at),
          onPlay: (dest, startIdx) => ap && sendSet(dest, ap.id, startIdx),
          onOptimize: (arc) => ap && optimizePlaylist(ap.id, arc),
          onPrepareStems: (ids) => {
            const list = ids.map((id) => trackById(id)).filter((t): t is LibTrack => !!t);
            if (list.length === 0) return;
            enqueuePrep(list);
            flash(list.length === 1 ? `« ${list[0].name} » ajouté à la préparation des stems` : `${list.length} titres ajoutés à la préparation des stems`);
          },
          analyzing: analyzingIds,
          onAnalyze: analyzeIds,
          onMixPlan: (on) => ap && setMixPlan(ap.id, on),
          onDj: (next) => ap && setMixPlan(ap.id, true, next),
          prep: ap ? setPreps[ap.id] : undefined,
          onPrepare: () => ap && void prepareSet(ap.id),
        }}
        library={{
          tabs: [
            { key: "files", label: "Mes fichiers", color: "#34d399" },
            { key: "audius", label: "Audius", color: "#38bdf8" },
            { key: "youtube", label: "YouTube", color: "#ef4444" },
            { key: "soundcloud", label: "SoundCloud", color: "#ff7700" },
            { key: "deezer", label: "Deezer", color: "#a238ff" },
            { key: "auto", label: "Auto-IA", color: "#e879f9" },
          ],
          tab,
          onTab: (key) => setTab(key as typeof tab),
          sources: onlineSources,
          maintenance: auditWidget,
          notice: msg,
          tracks: data.tracks,
          inSet: setIds,
          activeSetName: ap?.name ?? null,
          marks: marksFor,
          stemOf,
          busyKey: busy,
          onAdd: (ids) => ap && addTracksAt(ap.id, ids),
          onLoad: (id, side) => {
            const t = trackById(id);
            if (t) void loadToDeck(t, side);
          },
          onFile: (id, side) => {
            const t = trackById(id);
            if (t) fileFor(t, side);
          },
          onPrepareStems: (id) => {
            const t = trackById(id);
            if (t) queueStemsPrep(t);
          },
          onPrepareAllLater: () => enqueuePrep(data.tracks.filter((t) => t.later)),
          onCaptureFx: (id, side) => {
            const t = trackById(id);
            if (t) captureFx(t, side);
          },
          onApplyFx: (id, side) => {
            const t = trackById(id);
            if (t) applyFx(t, side);
          },
          onDelete: (id) => {
            const t = trackById(id);
            if (t) void del(t);
          },
          onDeleteAll: () => void delAll(true),
          onSetField: setTrackField,
          onImport: () => fileRef.current?.click(),
          onListFromIds: (ids) =>
            createListFromView(ids.map((id) => trackById(id)).filter((t): t is LibTrack => !!t)),
        }}
        extras={fileInput}
        journey={buildJourney({
          tracks: data.tracks,
          playlists: data.playlists,
          stemsReady: readyCount,
          playing: relay || liveA || liveB,
        }).map((st) => ({
          ...st,
          onClick:
            st.key === "stems"
              ? () => {
                  const todo = data.tracks.filter((t) => stemOf(t.id).state === "none");
                  if (todo.length === 0) return;
                  enqueuePrep(todo);
                  flash(`${todo.length} titres ajoutés à la préparation des stems`);
                }
              : st.key === "set"
                ? () => setWizard((w) => ({ nonce: (w?.nonce ?? 0) + 1 }))
                : st.key === "play" && ap && ap.trackIds.length >= 2
                  ? () => sendSet("relay", ap.id)
                  : undefined,
        }))}
        wizard={
          wizard ? (
            <SetWizard
              key={wizard.nonce}
              bac={data.tracks}
              allTracks={data.tracks}
              checkedIds={NO_IDS}
              playlists={data.playlists}
              initial={wizard.initial}
              poolLabel="la bibliothèque"
              isStemReady={(id) => stemOf(id).state === "done"}
              analyzing={analyzingIds}
              onAnalyze={analyzeIds}
              onPrepareStems={(ids) => {
                const list = ids.map((id) => trackById(id)).filter((t): t is LibTrack => !!t);
                if (list.length > 0) enqueuePrep(list);
              }}
              onSave={saveWizardSet}
              onSend={(dest, id) => {
                if (dest === "open") {
                  setActivePl(id);
                  setWizard(null);
                } else sendSet(dest, id);
              }}
              canSend
              onClose={() => setWizard(null)}
            />
          ) : null
        }
      />
    );
  }

  return (
    <div className="zoom-zone hw-screwed hw-panel flex flex-1 flex-col gap-3 p-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-[0.2em] text-neutral-300">
            ♫ Bibliothèque
          </span>
          <span className="text-[10px] text-neutral-600">
            {data.tracks.length} morceaux · {data.playlists.length} set{data.playlists.length > 1 ? "s" : ""}
          </span>
        </div>
        {/* LIVE A/B + relais + lanceur de set rapide — beaucoup de boutons, ne
            tient jamais sur une largeur d'iPhone : retour à la ligne au lieu
            de déborder hors du panneau. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Deck A : single précédent · LIVE · single suivant */}
          <button
            // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
            onClick={() => stepSingle("A", -1)}
            className="hw-btn px-1.5 py-1 text-xs"
            style={{ ["--led" as string]: COLOR_A, color: COLOR_A }}
            title="Deck A : single précédent (classés A)"
          >
            ⏮
          </button>
          <button
            // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
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
            onClick={() => toggleRelay()}
            className={`hw-btn px-2 py-1 text-xs ${relayOn ? "hw-btn-on" : ""}`}
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
          <div className="flex flex-wrap gap-3">
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
                  className="hw-strip flex flex-1 items-center gap-3 p-2.5"
                  style={{ ["--led" as string]: color, boxShadow: `inset 0 0 0 1px ${color}33, inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 5px rgba(0,0,0,0.5)` }}
                >
                  <div
                    className="hw-cover relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-neutral-800"
                    style={{ boxShadow: `0 0 12px ${color}55` }}
                  >
                    {a?.art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(a.art, 120)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className="hw-vinyl flex h-full w-full items-center justify-center text-2xl font-black drop-shadow"
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
                        <span className="text-[9px] font-black uppercase" style={{ color }}>
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
                          <img src={thumbSrc(nextT.art, 120)} alt="" className="h-full w-full object-cover" />
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
          <div className="hw-well flex flex-wrap items-center gap-1.5 p-1.5">
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
{auditWidget}
                <button
                  onClick={() => delAll()}
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
          {tab === "files" && data.tracks.some((t) => t.later) && (
            <div className="flex items-center gap-2 px-1 py-1 text-xs text-neutral-400">
              <span>{data.tracks.filter((t) => t.later).length} à jouer plus tard</span>
              <button
                onClick={() => enqueuePrep(data.tracks.filter((t) => t.later))}
                className="hw-btn px-2 py-1 text-xs"
                title="Séparer en stems tous les morceaux marqués à jouer plus tard"
              >
                PRÉPARER LES STEMS
              </button>
            </div>
          )}
          {tab === "files" && (
            <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-xs text-neutral-300">
              <select value={libSort} onChange={(e) => setLibSort(e.target.value as typeof libSort)} className="rounded bg-neutral-800 px-1 py-0.5">
                <option value="recent">Récents</option>
                <option value="title">Titre</option>
                <option value="bpm">BPM</option>
                <option value="key">Tonalité</option>
                <option value="theme">Thème</option>
                <option value="group">Groupe</option>
              </select>
              <select value={libTheme} onChange={(e) => setLibTheme(e.target.value)} className="rounded bg-neutral-800 px-1 py-0.5">
                <option value="">Tous thèmes</option>
                {[...new Set(data.tracks.map((t) => t.theme).filter((x): x is string => !!x))].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
              <select value={libGroup} onChange={(e) => setLibGroup(e.target.value)} className="rounded bg-neutral-800 px-1 py-0.5">
                <option value="">Tous groupes</option>
                {[...new Set(data.tracks.map((t) => t.group).filter((x): x is string => !!x))].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
              <button onClick={() => createListFromView(visibleLibTracks())} className="hw-btn px-2 py-1 text-xs" title="Enregistrer la vue filtrée comme liste">
                CRÉER UNE LISTE
              </button>
            </div>
          )}
          {tab === "files" && (
            <ul className={`flex flex-col gap-1 overflow-y-auto ${splitLayout ? "max-h-[34rem]" : "max-h-80"}`}>
              {data.tracks.length === 0 && (
                <p className="py-6 text-center text-sm text-neutral-600">
                  Aucun morceau. Clique sur « + Importer » pour ajouter des MP3 / WAV, ou
                  enregistre des trouvailles Audius / YouTube.
                </p>
              )}
              {visibleLibTracks().map((t) => (
                <li key={t.id} className="flex flex-col gap-1">
                  <TrackRow t={t} nested />
                  <div className="flex items-center gap-2 px-2 pb-1 text-[11px] text-neutral-400">
                    <input
                      defaultValue={t.theme ?? ""}
                      onBlur={(e) => setTrackField(t.id, "theme", e.target.value)}
                      placeholder="thème"
                      list="lib-themes"
                      className="w-32 rounded bg-neutral-900 px-1 py-0.5 text-neutral-200"
                    />
                    <input
                      defaultValue={t.group ?? ""}
                      onBlur={(e) => setTrackField(t.id, "group", e.target.value)}
                      placeholder="groupe"
                      list="lib-groups"
                      className="w-32 rounded bg-neutral-900 px-1 py-0.5 text-neutral-200"
                    />
                  </div>
                </li>
              ))}
              <datalist id="lib-themes">
                {[...new Set(data.tracks.map((t) => t.theme).filter((x): x is string => !!x))].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <datalist id="lib-groups">
                {[...new Set(data.tracks.map((t) => t.group).filter((x): x is string => !!x))].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </ul>
          )}

          {/* PLAYLISTS panel now lives in `playlistsPanel` (see above `return`) —
              rendered inline here when not splitLayout, or in the right column when it is. */}
          {!splitLayout && tab === "playlists" && playlistsPanel}

          {onlineSources}
          </div>
          {splitLayout && (
            <div className="flex flex-col gap-3">
              {playlistsPanel}
            </div>
          )}
          </div>
        </>
      )}

      {fileInput}
    </div>
  );
}

export const MediaLibrary = memo(MediaLibraryImpl);
