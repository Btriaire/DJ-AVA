"use client";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useIsClient } from "@/lib/useIsClient";
import { Deck } from "@/lib/audio/Deck";
import { automationFor } from "@/lib/audio/deckAutomation";
import { Knob } from "./Knob";
import { Fader } from "./Fader";
import { StemFxPanel } from "./StemFxPanel";
import { StemLoopPanel } from "./StemLoopPanel";
import { StemLanes } from "./StemLanes";
import { StemLiveMeter } from "./StemLiveMeter";
import { Waveform } from "./Waveform";
import { FxSection } from "./FxSection";
import { DeckTransport } from "./DeckTransport";
import { DeckHotCues } from "./DeckHotCues";
import { DeckLoopPads } from "./DeckLoopPads";
import { HoldButton } from "./HoldButton";
import { saveFileToLibrary, enqueuePrep, getPrepState, subscribePrep } from "@/lib/stemPrep";
import { cropWav } from "@/lib/audio/wavEncode";
import { Spectrum } from "./Spectrum";
import { RackPanel } from "./RackPanel";
import { EqRackStrip } from "./EqRackStrip";

import { loadLibrary, saveLibrary, idbPutBlob, idbGetBlob, uid, LibTrack } from "@/lib/library";
import { encodeWav } from "@/lib/audio/engine";

interface Props {
  deck: Deck;
  side: "A" | "B";
  color: string;
  tick: number; // forces re-render from the rAF loop
  onLoaded: () => void;
  onSync: () => void;
  onSendToConverter: (link: string) => void; // push the deck's YT source to the MP3 converter
  otherBpm: () => number; // live effective BPM of the opposite deck (for auto-sync)
  onStems?: () => void; // fired when stems become available (refreshes the library badge)
  onLibraryChange?: () => void; // fired after the deck writes to the library (save to playlist)
  onClose?: () => void; // fully remove this deck's panel from the layout (parent handles reopening)
  forceTrim?: number; // externally imposed trim (normalize button); updates knob display
  activeModules?: {
    eq?: boolean;
    fxpad?: boolean;
    loudness?: boolean;
    surround?: boolean;
    exciter?: boolean;
    transient?: boolean;
    multiband?: boolean;
    comp?: boolean;
    drive?: boolean;
    wavefold?: boolean;
    crush?: boolean;
    robot?: boolean;
    ringmod?: boolean;
    voyelle?: boolean;
    isolator?: boolean;
    autowah?: boolean;
    resonator?: boolean;
    gate?: boolean;
    glitch?: boolean;
    shimmer?: boolean;
    delay?: boolean;
    reverb?: boolean;
    limiter?: boolean;
    autotune?: boolean;
  };
}

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// short label + French title per Demucs stem name (4- and 6-stem models)
export const STEM_INFO: Record<string, { label: string; title: string }> = {
  drums: { label: "BAT", title: "Batterie" },
  bass: { label: "BAS", title: "Basse" },
  other: { label: "AUT", title: "Autres instruments" },
  vocals: { label: "VOIX", title: "Voix" },
  guitar: { label: "GUIT", title: "Guitare" },
  piano: { label: "PIANO", title: "Piano" },
};
// the three analysis qualities offered in the deck
const STEM_MODELS: { id: "htdemucs" | "htdemucs_ft" | "htdemucs_6s"; label: string; title: string }[] = [
  { id: "htdemucs", label: "STD", title: "Standard — 4 pistes, rapide" },
  { id: "htdemucs_ft", label: "FIN", title: "Fine-tuned — 4 pistes, ~4× plus lent, plus net" },
  { id: "htdemucs_6s", label: "6 PISTES", title: "6 pistes — ajoute guitare + piano" },
];
// names shown on the faders before the stems are actually separated, per model
const STEM_PREVIEW: Record<string, string[]> = {
  htdemucs: ["drums", "bass", "other", "vocals"],
  htdemucs_ft: ["drums", "bass", "other", "vocals"],
  htdemucs_6s: ["drums", "bass", "other", "vocals", "guitar", "piano"],
};

// ---- global STEM templates (numbered 1-5): per-stem volumes + loops + FOULE + makeup,
// reusable across any track. Applied by index up to the current model's stem
// count, so a 4-stem template still works on a 6-stem split (extra stems left).
const STEM_LS_KEY = "djsynth.stemtemplates.v1";
type StemTpl = {
  name?: string;
  vol: number[];
  crowd: number;
  makeup: boolean;
  loops?: ({ active: boolean; beats: number | null; start: number; end: number; smoothMs: number; rollAt: number | null } | null)[];
};
const STEM_SLOTS = 5;
function loadStemTpls(): (StemTpl | null)[] {
  const empty: (StemTpl | null)[] = Array(STEM_SLOTS).fill(null);
  if (typeof window === "undefined") return empty;
  try {
    const arr = JSON.parse(localStorage.getItem(STEM_LS_KEY) || "[]");
    if (Array.isArray(arr)) for (let i = 0; i < STEM_SLOTS; i++) empty[i] = arr[i] ?? null;
  } catch {
    /* corrupt — keep empties */
  }
  return empty;
}
function saveStemTpls(arr: (StemTpl | null)[]) {
  try {
    localStorage.setItem(STEM_LS_KEY, JSON.stringify(arr));
  } catch {
    /* quota / private mode — ignore */
  }
}

// Mini LED "equalizer" voyant for a stem: a vertical stack of segments lighting
// from the bottom up with the stem's live level. Top segment red, next two
// amber, the rest the deck colour — a classic VU look. Purely presentational;
// the parent re-renders each animation frame (via `tick`) so it animates.


export function DeckPanel({ deck, side, color, tick, onLoaded, onSync, onSendToConverter, otherBpm, onStems, onLibraryChange, onClose, forceTrim, activeModules }: Props) {
  void tick;
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // per-deck power switch — mutes this deck's final output while leaving
  // playback/EQ/FX running underneath (unlike PANIC, which resets everything).
  // Flipping it back on restores full volume.
  const [deckOn, setDeckOn] = useState(true);
  function togglePower() {
    const next = !deckOn;
    setDeckOn(next);
    deck.setVolume(next ? 1 : 0);
    rerender();
  }

  // progressive auto-sync: ramp this deck's tempo toward the other deck's BPM
  const [autoSync, setAutoSync] = useState(false);
  const [autoReset, setAutoReset] = useState(false);
  const syncRaf = useRef<number | null>(null);
  const stopAutoSync = () => {
    if (syncRaf.current !== null) cancelAnimationFrame(syncRaf.current);
    syncRaf.current = null;
    setAutoSync(false);
    setAutoReset(false);
  };
  const startAutoSync = () => {
    const other = otherBpm();
    if (!other || !deck.bpm) return;
    stopAutoSync();
    const fromPct = deck.pitchPct;
    const toPct = Math.max(-50, Math.min(50, (other / deck.bpm - 1) * 100));
    const ms = 6000;
    // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
    const t0 = performance.now();
    setAutoSync(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const v = fromPct + (toPct - fromPct) * e;
      setPitch(v);
      deck.setPitch(v);
      if (p < 1) {
        syncRaf.current = requestAnimationFrame(step);
      } else {
        syncRaf.current = null;
        setAutoSync(false);
      }
    };
    syncRaf.current = requestAnimationFrame(step);
  };

  // glide pitch smoothly back to normal (0%) over 5s
  const startPitchReset = () => {
    if (Math.abs(deck.pitchPct) < 0.05) return;
    stopAutoSync();
    const fromPct = deck.pitchPct;
    const toPct = 0;
    const ms = 5000;
    // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
    const t0 = performance.now();
    setAutoReset(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const v = fromPct + (toPct - fromPct) * e;
      setPitch(v);
      deck.setPitch(v);
      if (p < 1) {
        syncRaf.current = requestAnimationFrame(step);
      } else {
        syncRaf.current = null;
        setAutoReset(false);
      }
    };
    syncRaf.current = requestAnimationFrame(step);
  };
  useEffect(() => stopAutoSync, []);

  const [trim, setTrim] = useState(1);
  const prevForceTrimRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (forceTrim !== undefined && forceTrim !== prevForceTrimRef.current) {
      prevForceTrimRef.current = forceTrim;
      setTrim(Math.min(1.5, Math.max(0, forceTrim)));
    }
  }, [forceTrim]);

  const [pitch, setPitch] = useState(0);
  const [scratch, setScratch] = useState(0);
  const [loop, setLoop] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fxKey, setFxKey] = useState(0); // bump to remount the FX section on PANIC
  // stems are simply unavailable past 8 min (Demucs on CPU can't keep up) — the
  // whole trigger is hidden rather than allowing a click that fails later.
  const stemTooLongForTrack = !!deck.name && deck.duration > 8 * 60 && !deck.stemReady;
  const [dragOver, setDragOver] = useState(false);

  // per-deck PANIC: eject the loaded song and return every control of THIS deck
  // to zero (EQ, gain, filter, pitch, scratch, loop, FX) — the other deck is
  // untouched.
  function panic() {
    stopAutoSync();
    deck.unload();
    setTrim(1);
    setPitch(0);
    setScratch(0);
    setLoop(0);
    setLoading(false);
    setFxKey((k) => k + 1); // remount FXPad so its sliders re-read the cleared deck
    onLoaded();
    rerender();
  }

  const pos = deck.position();
  const progress = deck.duration ? pos / deck.duration : 0;

  // Cuts the selected part of the track into its own library entry and queues its stems:
  // only that part is separated, and it then loads and plays like any other track.
  const [selTrackId, setSelTrackId] = useState<string | null>(null);
  const prep = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);
  const selJob = selTrackId ? prep.jobs.find((j) => j.trackId === selTrackId) : undefined;
  const selReady = !!selTrackId && prep.ready.some((r) => r.trackId === selTrackId);
  const selMsg = loading
    ? "Découpe en cours…"
    : selReady
      ? "Stems prêts (dans la bibliothèque)"
      : selJob?.status === "error"
        ? `Échec : ${selJob.error ?? "erreur inconnue"}`
        : selJob?.status === "running"
          ? `Séparation ${selJob.progress} %`
          : selJob
            ? "En file d'attente"
            : null;

  async function separateSelection() {
    if (!sel || !deck.audioBuffer || !deck.duration) return;
    const from = Math.min(sel.start, sel.end) * deck.duration;
    const to = Math.max(sel.start, sel.end) * deck.duration;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const name = `${deck.name || "Morceau"} [${fmt(from)}-${fmt(to)}]`;
    setLoading(true);
    try {
      const file = new File([cropWav(deck.audioBuffer, from, to)], `${name}.wav`, { type: "audio/wav" });
      const t = await saveFileToLibrary(file);
      setSelTrackId(t.id);
      enqueuePrep([t]);
      onLibraryChange?.();
    } catch (err) {
      alert("Découpage impossible: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFile(file: File) {
    setLoading(true);
    setSel(null);
    try {
      // phase 1 starts the audio at once through the media element; the decode runs behind it
      const decoded = deck.loadStreaming(file, file.name.replace(/\.[^.]+$/, ""));
      deck.play();
      onLoaded();
      rerender();
      await decoded;
      void saveFileToLibrary(file)
        .then((t) => {
          enqueuePrep([t]);
          onLibraryChange?.();
        })
        .catch(() => {});
    } catch (err) {
      alert("Décodage impossible: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await loadFile(file);
  }

  // --- previous / next single -------------------------------------------
  // Navigate the singles filed for THIS deck (t.deck === side) in the library,
  // looping the queue, and load+play the prev/next one. Position is taken from
  // the deck's current origin, so it works no matter how the track was loaded.
  const [stepping, setStepping] = useState(false);
  async function stepSingle(dir: 1 | -1) {
    const q = loadLibrary().tracks.filter((t) => t.deck === side);
    if (!q.length || stepping) return;
    const cur = q.findIndex((t) => t.id === deck.origin?.id);
    const base = cur < 0 ? (dir > 0 ? -1 : 0) : cur;
    const t = q[(base + dir + q.length) % q.length];
    setStepping(true);
    // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
    deck.loading = true;
    deck.loadStartedAt = performance.now();
    try {
      if (t.source === "local") {
        const blob = await idbGetBlob(t.id);
        if (!blob) throw new Error("Fichier introuvable");
        // streaming: audio starts immediately; waveform/BPM arrive in the background
        void deck.loadStreaming(blob, t.name).then(() => onLoaded());
        deck.sourceLink = "";
      } else {
        const streamUrl = `/api/${t.source}/stream?id=${encodeURIComponent(t.url ?? "")}`;
        void deck.loadStreamingUrl(streamUrl, t.name, t.durationSec).then(() => onLoaded());
        deck.sourceLink =
          t.source === "youtube"
            ? `https://www.youtube.com/watch?v=${t.url}`
            : t.source === "soundcloud"
              ? t.url ?? ""
              : "";
      }
      deck.coverArt = t.art ?? "";
      deck.origin = { id: t.id, source: t.source, url: t.url, art: t.art };
      // start playing right away (streaming phase is already set up)
      deck.play();
      onLoaded();
    } catch {
      /* leave the previous track in place on failure */
    } finally {
      deck.loading = false;
      setStepping(false);
      rerender();
    }
  }

  // stems: remembered per-stem level so a mute toggle can restore it
  const stemPrev = useRef<number[]>([1, 1, 1, 1, 1, 1]);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  // when the loaded track changes, probe the server cache so the button can
  // advertise an instant load if the stems were already computed before. This
  // is read-only (a cheap cache check) — preparation is launched on demand from
  // the library, never automatically on load, so it can't slow playback.
  useEffect(() => {
    if (!deck.name || deck.stemReady) return;
    let cancelled = false;
    deck.probeStems().then(() => {
      if (cancelled) return;
      rerender();
      if (deck.stemCached) onStems?.(); // already on disk -> badge the library
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.name, deck.stemModel]);
  async function handleStems() {
    if (deck.stemStatus === "working") return;
    // defense-in-depth: the trigger is hidden past 8 min, but guard here too
    // in case this fires from a stale render.
    if (!deck.stemReady && deck.duration > 8 * 60) return;
    if (!deck.stemReady) {
      await deck.ensureStems();
      if (deck.stemReady) {
        deck.setStemsActive(true);
        onStems?.(); // freshly separated -> refresh the library badge
      }
    } else {
      deck.setStemsActive(!deck.stemsActive);
    }
    rerender();
  }
  function setStemModel(m: (typeof STEM_MODELS)[number]["id"]) {
    deck.setStemModel(m);
    stemPrev.current = [1, 1, 1, 1, 1, 1];
    rerender();
  }
  function toggleStemUltra() {
    deck.setStemUltra(!deck.stemUltra);
    rerender();
  }
  function toggleStemLossless() {
    deck.setStemLossless(!deck.stemLossless);
    rerender();
  }
  function toggleStemDenoise() {
    deck.setStemDenoiseVocals(!deck.stemDenoiseVocals);
    rerender();
  }
  function toggleStemMute(i: number) {
    if (deck.stemVol[i] > 0.001) {
      stemPrev.current[i] = deck.stemVol[i];
      deck.setStemVol(i, 0);
    } else {
      deck.setStemVol(i, stemPrev.current[i] || 1);
    }
    rerender();
  }
  // isolate one stem (mute every other) — lets a Rack FX enabled on this deck
  // audibly affect only that stem, since the others contribute silence to the
  // mix the FX chain processes. Clicking an already-soloed stem un-isolates
  // (restores every stem to its remembered level).
  function soloStem(i: number) {
    const alreadySolo =
      deck.stemVol[i] > 0.001 && deck.stemVol.every((v, j) => j === i || v <= 0.001);
    for (let j = 0; j < deck.stemVol.length; j++) {
      if (deck.stemVol[j] > 0.001) stemPrev.current[j] = deck.stemVol[j];
    }
    if (alreadySolo) {
      for (let j = 0; j < deck.stemVol.length; j++) deck.setStemVol(j, stemPrev.current[j] || 1);
    } else {
      for (let j = 0; j < deck.stemVol.length; j++) deck.setStemVol(j, j === i ? stemPrev.current[i] || 1 : 0);
    }
    rerender();
  }
  // per-stem beat loop — a popover with every length the main Beat Loop row
  // offers, so you can jump straight to e.g. 1/8 or 8 without cycling through
  // everything in between. Only this one stem loops; the others play on.
  const STEM_LOOP_BEATS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
  const STEM_LOOP_LABELS = ["1/16", "1/8", "1/4", "1/2", "1", "2", "4", "8", "16", "32"];
  // read live off the deck (not a mirrored useState) so the UI can never show a
  // loop as engaged when the deck-side call actually silently no-op'd — same
  // fix pattern the earlier "ghost-loop" bug used for the outer LOOP button,
  // now applied to the length picker and ½/×2 buttons too.
  const stemLoopBeats = deck.stemLoopBeatsVal;
  const [openStemLoopMenu, setOpenStemLoopMenu] = useState<number | null>(null);
  // ½ / ×2 — resize the current loop live, snapped to the same preset ladder
  // so the button label always reads a clean value. No-ops at the ends.
  function resizeStemLoop(i: number, factor: 0.5 | 2) {
    const cur = stemLoopBeats[i];
    if (cur == null) return;
    const idx = STEM_LOOP_BEATS.indexOf(cur);
    const nextIdx = idx + (factor === 2 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= STEM_LOOP_BEATS.length) return;
    deck.resizeStemLoop(i, factor);
    rerender();
  }
  const [openSendMenu, setOpenSendMenu] = useState<number | null>(null);
  // bulk faders: drop everything to silence (remembering levels) or push it all up
  function allStems(up: boolean) {
    if (!deck.stemReady) return;
    for (let i = 0; i < deck.stemVol.length; i++) {
      if (up) {
        deck.setStemVol(i, stemPrev.current[i] || 1);
      } else {
        if (deck.stemVol[i] > 0.001) stemPrev.current[i] = deck.stemVol[i];
        deck.setStemVol(i, 0);
      }
    }
    rerender();
  }

  // --- global STEM templates (1-5 shortcut slots) --------------------------
  const isClient = useIsClient();
  const [stemTplsOverride, setStemTpls] = useState<(StemTpl | null)[] | null>(null);
  const storedStemTpls = useMemo(() => (isClient ? loadStemTpls() : null), [isClient]);
  const stemTpls = stemTplsOverride ?? storedStemTpls ?? Array<StemTpl | null>(STEM_SLOTS).fill(null);
  const [stemSaveMode, setStemSaveMode] = useState(false);
  const [stemActiveTpl, setStemActiveTpl] = useState<number | null>(null);
  function saveStemSlot(n: number) {
    const loops = deck.stemNames.map((_, i) => deck.getStemLoopState(i));
    const tpl: StemTpl = {
      vol: deck.stemVol.slice(),
      crowd: deck.crowd,
      makeup: deck.stemMakeup,
      loops,
    };
    const next = stemTpls.slice();
    next[n] = tpl;
    setStemTpls(next);
    saveStemTpls(next);
    setStemSaveMode(false);
    setStemActiveTpl(n);
  }
  function recallStemSlot(n: number) {
    const tpl = stemTpls[n];
    if (!tpl) return;
    for (let i = 0; i < deck.stemVol.length && i < tpl.vol.length; i++) {
      deck.setStemVol(i, tpl.vol[i]);
    }
    deck.setStemMakeup(tpl.makeup);
    deck.setCrowd(tpl.crowd);
    if (tpl.loops && Array.isArray(tpl.loops)) {
      tpl.loops.forEach((lp, i) => {
        if (!lp || !lp.active) {
          deck.clearStemLoop(i);
        } else {
          deck.recallStemLoop(i, lp);
        }
      });
    }
    setStemActiveTpl(n);
    rerender();
  }

  // Export the active loop of stem `i` as a downloadable WAV sample file
  function exportStemLoopWav(stemIdx: number) {
    const name = deck.stemNames[stemIdx] || `stem_${stemIdx + 1}`;
    const beats = deck.stemLoopBeatsVal[stemIdx] || 4;
    const buf = deck.captureStemSlice(stemIdx, beats);
    if (!buf) {
      alert(`Impossible d'exporter la boucle du stem ${name} : assure-toi que le stem est chargé et en lecture.`);
      return;
    }
    const blob = encodeWav(buf);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name ? deck.name.replace(/[^a-zA-Z0-9_-]/g, "_") : "loop"}_${name}_${beats}b.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // --- save the track loaded on this deck into a playlist ------------------
  const [plMenu, setPlMenu] = useState(false);
  const [plFlash, setPlFlash] = useState("");
  function flashPl(m: string) {
    setPlFlash(m);
    setTimeout(() => setPlFlash((c) => (c === m ? "" : c)), 2000);
  }
  // ensure the deck's current track exists in the library, then add it to the
  // chosen playlist ("__new__" creates one). Writes straight to localStorage and
  // tells the parent so the Library panel reloads.
  async function addToPlaylist(target: string) {
    setPlMenu(false);
    if (!deck.name) return;
    const lib = loadLibrary();
    const o = deck.origin;
    let track = o ? lib.tracks.find((t) => t.id === o.id) : undefined;
    if (!track) {
      const id = o?.id ?? uid();
      const source = o?.source ?? "local";
      track = {
        id,
        name: deck.name,
        source,
        url: o?.url,
        art: o?.art ?? deck.coverArt ?? undefined,
        deck: null,
        // eslint-disable-next-line react-hooks/purity -- appel dans un gestionnaire d'événement, hors rendu
        addedAt: Date.now(),
      } as LibTrack;
      // a directly-loaded local file has no stored blob — persist its bytes so
      // it can be reloaded later from the playlist.
      if (source === "local") {
        const raw = deck.getRawBlob();
        if (raw) {
          try {
            await idbPutBlob(id, raw);
          } catch {
            /* metadata still saved even if the blob store is unavailable */
          }
        }
      }
      lib.tracks = [track, ...lib.tracks];
    }
    let plName = "";
    if (target === "__new__") {
      const name = prompt("Nom de la playlist ?")?.trim();
      if (!name) return;
      const pl = { id: uid(), name, trackIds: [track.id] };
      lib.playlists = [...lib.playlists, pl];
      plName = name;
    } else {
      let found = false;
      lib.playlists = lib.playlists.map((p) => {
        if (p.id !== target) return p;
        found = true;
        plName = p.name;
        return p.trackIds.includes(track!.id)
          ? p
          : { ...p, trackIds: [...p.trackIds, track!.id] };
      });
      if (!found) return;
    }
    saveLibrary(lib);
    onLibraryChange?.();
    flashPl(`Ajouté à « ${plName} »`);
  }

  const spinning = deck.playing;
  const auto = automationFor(deck);

  return (
    <div className="zoom-zone hw-screwed hw-panel flex flex-col gap-3 self-start p-4">
      {/* header */}
      <div className="hw-brushed flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs font-black text-black"
            style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
          >
            DECK {side}
          </span>
          <span className="max-w-[180px] truncate text-sm text-neutral-200">
            {deck.name || "— vide —"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {deck.streamOnly && (
            <span className="text-[9px] font-bold tracking-wider text-amber-300" title="Morceau de plus de 20 min : lu en streaming pour économiser la mémoire (pas de forme d'onde, de boucles ni de stems)">
              STREAMING · MORCEAU LONG
            </span>
          )}
          {/* loading indicator — two phases:
              1. "Chargement" (deck.loading) = fetch in flight, no audio yet
              2. "Décodage…" (deck.bufferLoading) = audio playing, waveform/BPM pending
              The bar fills during phase 1 (asymptotic trickle), then pulses during phase 2. */}
          {(deck.loading || deck.bufferLoading) && (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] uppercase leading-none text-neutral-500">
                {deck.loading ? "Chargement" : "Décodage…"}
              </span>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-black/60 ring-1 ring-black/40">
                {deck.loading ? (
                  <div
                    className="h-full rounded-full transition-[width] duration-150"
                    style={{
                      width: `${Math.round(
                        // eslint-disable-next-line react-hooks/purity -- temps de rendu pour une barre de chargement ; mis à jour à chaque rendu du composant
                        (1 - Math.exp(-(performance.now() - deck.loadStartedAt) / 900)) * 92
                      )}%`,
                      background: `linear-gradient(90deg, ${color}22 0%, ${color}88 55%, ${color} 100%)`,
                      boxShadow: `0 0 8px ${color}, inset 0 0 4px ${color}55`,
                    }}
                  />
                ) : (
                  // phase 2: stripe pulsing left-to-right while waveform/BPM decode
                  <div
                    className="h-full w-full animate-pulse rounded-full opacity-60"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
                    }}
                  />
                )}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="hw-led font-mono text-lg font-bold" style={{ color }}>
              {deck.effectiveBPM || "--"} <span className="text-xs text-neutral-500">BPM</span>
            </div>
          </div>
          {/* REC: record what is done to this song, replayed next time it plays */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase leading-none text-neutral-500">
              {auto.recording ? `${auto.recordedCount} action(s)` : auto.take ? `${auto.take.events.length} action(s)` : "Actions"}
            </span>
            <div className="flex items-center gap-1">
              <button
                className={`hw-btn px-2.5 py-1 text-xs font-bold ${auto.recording ? "hw-btn-on animate-pulse" : ""}`}
                style={{ ["--led" as string]: "#ef4444", color: auto.recording ? undefined : "#ef4444" }}
                disabled={!deck.name}
                onClick={() => {
                  if (auto.recording) auto.stop();
                  else auto.start();
                  rerender();
                }}
                title={auto.recording
                  ? "Arrêter l'enregistrement et le garder pour ce morceau"
                  : auto.take
                    ? "Réenregistrer : remplace les actions sur la partie du morceau jouée pendant l'enregistrement"
                    : "Enregistrer tout ce que tu fais sur ce morceau (volume, EQ, filtre, effets, stems, boucles…) pour le rejouer quand tu le relances"}
              >
                ● REC
              </button>
              {auto.take && !auto.recording && (
                <>
                  <button
                    className={`hw-btn px-2 py-1 text-[10px] ${auto.replay ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: color, color: auto.replay ? undefined : color }}
                    onClick={() => {
                      auto.toggleReplay();
                      rerender();
                    }}
                    title={auto.replay ? "Rejoue les actions enregistrées pendant la lecture — clique pour couper" : "Rejeu coupé — clique pour rejouer les actions enregistrées"}
                  >
                    AUTO
                  </button>
                  <HoldButton
                    onConfirm={() => {
                      auto.clear();
                      rerender();
                    }}
                    holdMs={600}
                    className="hw-btn px-1.5 py-1 text-[10px] text-neutral-400"
                    label="✕"
                    title="Maintiens 0,6 s pour effacer les actions enregistrées de ce morceau"
                  />
                </>
              )}
            </div>
          </div>
          {/* whole-track loop, sitting next to the BPM */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase leading-none text-neutral-500">Boucle</span>
            <button
              className={`hw-btn px-2.5 py-1 text-xs ${deck.repeat ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color: deck.repeat ? undefined : color }}
              onClick={() => {
                deck.toggleRepeat();
                rerender();
              }}
              title="Relance la chanson automatiquement quand elle se termine"
            >
              ↻
            </button>
          </div>
          <button
            onClick={togglePower}
            className={`hw-btn flex h-7 w-7 items-center justify-center rounded-full text-xs ${deckOn ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: deckOn ? "#ffcc00" : "#6b6b6b", color: deckOn ? undefined : "#6b6b6b" }}
            title={deckOn ? `Éteindre le Deck ${side} (coupe le son, garde la lecture, masque les outils ci-dessous)` : `Allumer le Deck ${side}`}
          >
            ⏻
          </button>
          <HoldButton
            onConfirm={panic}
            holdMs={700}
            className="hw-panic text-[11px]"
            label="PANIC"
            title={`PANIC Deck ${side} : maintiens 0,7 s pour éjecter le morceau et remettre les commandes à zéro`}
          />
          {onClose && (
            <button
              onClick={onClose}
              className="hw-btn flex h-7 w-7 items-center justify-center rounded-full text-xs text-neutral-400"
              title={`Fermer complètement le Deck ${side} — libère la place, se rouvre depuis le Mixer`}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* jog + waveform */}
      <div className="flex items-center gap-4">
        <div
          className="hw-jog relative h-32 w-32 shrink-0 rounded-full"
          style={{ boxShadow: spinning ? `0 0 26px ${color}55, inset 0 0 0 2px rgba(255,255,255,.06), inset 0 2px 10px rgba(0,0,0,.85), 0 8px 20px rgba(0,0,0,.7)` : undefined }}
        >
          {/* white illuminated edge ring */}
          <div className="hw-jog-ring absolute inset-[10px]" />
          {/* glossy platter, spins while playing */}
          <div
            className="hw-jog-face absolute inset-[13px]"
            style={{ animation: spinning ? "spin 2.2s linear infinite" : "none" }}
          >
            {/* red tach lines */}
            <div className="hw-jog-tach absolute inset-0" />
            {/* progress wedge in deck color */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from -90deg, ${color} ${progress * 360}deg, transparent 0deg)`,
                WebkitMask: "radial-gradient(circle, transparent 34%, #000 35%, #000 72%, transparent 73%)",
                mask: "radial-gradient(circle, transparent 34%, #000 35%, #000 72%, transparent 73%)",
                opacity: 0.9,
              }}
            />
            {/* position needle */}
            <div
              className="absolute left-1/2 top-[14%] h-[20%] w-[2px] origin-bottom -translate-x-1/2 rounded"
              style={{ background: "#fff", boxShadow: "0 0 4px #fff" }}
            />
            {/* cover art of the playing single = spinning vinyl label */}
            {deck.coverArt && (
              <img
                src={deck.coverArt}
                alt=""
                className="absolute inset-0 m-auto rounded-full object-cover"
                style={{
                  width: "62%",
                  height: "62%",
                  boxShadow: `0 0 0 2px rgba(0,0,0,.6), 0 0 10px ${color}66`,
                }}
              />
            )}
          </div>
          {/* center hub: full DECK label when empty, slim chrome spindle over art */}
          {deck.coverArt ? (
            <div
              className="hw-jog-hub absolute inset-0 m-auto h-4 w-4 rounded-full"
              style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,.5)" }}
            />
          ) : (
            <div className="hw-jog-hub absolute inset-0 m-auto flex h-12 w-12 flex-col items-center justify-center">
              <span className="text-[7px] font-bold tracking-widest text-neutral-500">DECK</span>
              <span className="text-sm font-black" style={{ color }}>
                {side}
              </span>
            </div>
          )}
        </div>
        <div
          className={`hw-screen relative flex-1 p-2 ${dragOver ? "ring-2 ring-offset-0" : ""}`}
          style={dragOver ? { ["--tw-ring-color" as string]: color } : undefined}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith("audio") || f && /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name)) loadFile(f);
          }}
        >
          {!deck.name && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-[inherit] text-center"
              title="Glisse un morceau ici, ou clique pour choisir un fichier"
            >
              <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color }}>
                {dragOver ? "Relâche pour charger" : "Glisse un morceau ici"}
              </span>
              <span className="text-[11px] text-neutral-400">ou clique pour choisir un fichier audio</span>
            </button>
          )}
          <Waveform
            peaks={deck.peaks}
            progress={progress}
            cue={deck.duration ? deck.cuePoint / deck.duration : 0}
            color={color}
            bpm={deck.bpm}
            beatOffset={deck.beatGridOffset}
            duration={deck.duration}
            selection={sel}
            onSelect={(s, e) => setSel({ start: s, end: e })}
            onSeek={(n) => {
              deck.seek(n * deck.duration);
              rerender();
            }}
          />
          {selMsg && <div className="mt-1 text-[11px] font-bold text-amber-300">⏳ {selMsg}</div>}
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-mono text-neutral-400">
              {sel
                ? `Sélection ${fmtTime(Math.min(sel.start, sel.end) * deck.duration)} → ${fmtTime(Math.max(sel.start, sel.end) * deck.duration)} · ${fmtTime(Math.abs(sel.end - sel.start) * deck.duration)}${deck.bpm ? ` · ${(Math.abs(sel.end - sel.start) * deck.duration * deck.bpm / 60 / 4).toFixed(1)} mesures` : ""}`
                : "Glisse sur la forme d'onde pour choisir une partie"}
            </span>
            <div className="flex gap-1">
              <button className="hw-btn px-2 py-1 text-[10px] font-bold" disabled={!sel} onClick={() => setSel(null)}>
                EFFACER
              </button>
              <button
                className="hw-btn px-2 py-1 text-[10px] font-bold"
                disabled={!sel || !deck.audioBuffer}
                onClick={() => {
                  if (!sel) return;
                  deck.setLoopRange(Math.min(sel.start, sel.end) * deck.duration, Math.max(sel.start, sel.end) * deck.duration);
                  rerender();
                }}
                title="Boucle la partie sélectionnée sur le deck"
              >
                BOUCLER
              </button>
              <button
                className="hw-btn px-2 py-1 text-[10px] font-bold"
                disabled={!sel || !deck.audioBuffer || loading}
                onClick={separateSelection}
                title="Découpe cette partie et la met en préparation des stems (seule cette partie est séparée)"
              >
                STEMS SÉLECTION
              </button>
            </div>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-neutral-500">
            <span>{fmtTime(pos)}</span>
            <span>{fmtTime(deck.duration)}</span>
          </div>
        </div>
      </div>

      {/* live spectrum */}
      <Spectrum deck={deck} color={color} />

      {/* transport: cue & play, zone and tempo — the big buttons are the ones used in performance */}
      <DeckTransport
        deck={deck}
        color={color}
        side={side}
        stepping={stepping}
        // eslint-disable-next-line react-hooks/immutability -- objet audio externe mutable, hors état React
        onStep={stepSingle}
        onSync={onSync}
        autoSync={autoSync}
        autoReset={autoReset}
        pitch={pitch}
        onToggleAutoSync={() => (autoSync ? stopAutoSync() : startAutoSync())}
        onTogglePitchReset={() => (autoReset ? stopAutoSync() : startPitchReset())}
        onChange={rerender}
      />
      <DeckHotCues deck={deck} color={color} onChange={rerender} />

      {/* pitch + scratch — two halves directly under the SYNC / Auto-sync buttons */}
      <div className="flex flex-wrap items-stretch gap-3">
        {/* left half: pitch / tempo */}
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <button
            onClick={() => {
              deck.toggleKeyLock();
              rerender();
            }}
            className={`hw-btn px-1.5 py-1 text-[9px] font-black uppercase ${deck.keyLock ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color, color: deck.keyLock ? undefined : color }}
            title={deck.keyLock ? "MASTER TEMPO (Key Lock) ACTIF : la tonalité musicale reste verrouillée malgré la variation de tempo" : "MASTER TEMPO INACTIF : variation de tonalité naturelle"}
          >
            MT
          </button>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums"
            style={{ color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`, boxShadow: "inset 0 0 0 1px #1a1a1a" }}
            title="Variation de vitesse de la platine (0 % = vitesse d'origine)"
          >
            {pitch > 0 ? "+" : ""}
            {pitch.toFixed(1)}%
          </span>
          <Fader
            value={pitch}
            min={-8}
            max={8}
            step={0.1}
            className="flex-1"
            ticks
            led={color}
            neutral={0}
            onChange={(v) => {
              setPitch(v);
              deck.setPitch(v);
            }}
          />
        </div>
        {/* right half: momentary scratch / pitch-bend (springs back to 0 on release) */}
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase text-neutral-500" title="Scratch : tire le curseur, il revient à zéro quand tu relâches">Scratch</span>
          <Fader
            value={scratch}
            min={-1}
            max={1}
            step={0.01}
            className="flex-1"
            ticks
            led={color}
            neutral={0}
            onChange={(v) => {
              setScratch(v);
              deck.scratch(v);
            }}
            onRelease={() => {
              setScratch(0);
              deck.scratch(0);
            }}
          />
        </div>
      </div>

      {/* channel strip — always visible: Gain + 3-band EQ (same fader model as
          the 15-band rack EQ below, so every EQ in the app reads the same way)
          + Filter */}
      <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
        <span>Voie</span>
        <span className="font-normal normal-case tracking-normal">Gain · aigus / médium / graves · filtre</span>
      </div>
      <div className="hw-recess flex items-center justify-around py-3">
        <Knob
          label="Gain"
          value={trim}
          min={0}
          max={1.5}
          defaultValue={1}
          color={color}
          onChange={(v) => { setTrim(v); deck.setTrim(v); }}
        />
        {(["high", "mid", "low"] as const).map((b) => (
          <div key={b} className="flex flex-col items-center gap-1">
            <span
              className="rounded px-0.5 py-0.5 text-center font-mono text-[10px] font-bold tracking-tight"
              style={{ width: 40, color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`, boxShadow: "inset 0 0 0 1px #1a1a1a" }}
            >{deck.eqDb(b) > 0 ? "+" : ""}{Math.round(deck.eqDb(b))}</span>
            <Fader
              value={deck.eqDb(b)} min={-26} max={12} step={0.1} neutral={0}
              vertical onChange={(v) => { deck.setEQ(b, v); rerender(); }}
              className="!h-[86px]"
            />
            <span className="text-center text-[10px] font-bold uppercase leading-none" style={{ color }}>{b}</span>
          </div>
        ))}
        <Knob label="Filter" value={deck.filterLive} min={-1} max={1} defaultValue={0} color={color}
          onChange={(v) => deck.setFilter(v)}
        />
      </div>

      {/* everything below is the deck's "tool belt" — EQ rack, FX pad, stems,
          DSP rack, pro FX, beat loop — hidden while the deck is powered off to
          reclaim screen space (and stop rendering things like the RackPanel's
          spectrum/VU meters for a deck nobody's looking at). Playback itself
          keeps running underneath (POWER only mutes output), so flipping it
          back on doesn't lose anything — just re-shows the same live state. */}
      {!deckOn && (
        <button
          onClick={togglePower}
          className="hw-recess flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500"
          title={`Allumer le Deck ${side} pour retrouver EQ, FX, stems et Rack DSP`}
        >
          ⏻ Deck éteint — outils masqués, clique pour rallumer
        </button>
      )}
      {deckOn && (
      <>
      {/* all-in-one FX unit — first tool, right under the channel strip */}
      {activeModules?.fxpad !== false && <div className="hw-recess p-3">
        <FxSection
          key={fxKey}
          rack={deck.fxRack}
          retouch={deck.retouchFx}
          color={color}
          storageKey={`deck${side}`}
          dsp={<RackPanel deck={deck} color={color} activeModules={activeModules} />}
        />
      </div>}

      {/* 15-band rack EQ — independent from Rack DSP, own toggle */}
      {activeModules?.eq !== false && <EqRackStrip deck={deck} color={color} />}

      {deck.stemReady && <StemLanes deck={deck} color={color} />}

      {/* stem separation (Demucs) — split the track into live faders. Demucs on
          CPU can't realistically finish beyond ~8 min of audio, so the trigger
          is removed outright for long tracks instead of failing after a click. */}
      {/* up to 6 stem fader columns + controls don't fit an iPhone width —
          scroll horizontally instead of squishing/overflowing the panel */}
      {/* contain: inline-size = ce scroll ne doit pas imposer sa largeur au deck (613 px -> 520 px) */}
      <div className="hw-recess flex items-stretch gap-3 overflow-x-auto p-3 [contain:inline-size]">
        <div className="flex w-28 shrink-0 flex-col justify-center gap-1">
          <span
            className="text-[10px] font-bold uppercase leading-none tracking-[0.15em] text-neutral-400"
            title="Choisis la qualité de séparation, puis clique STEMS dans la platine. Le calcul se fait à l'arrêt de la lecture."
          >
            Séparation
          </span>
          {stemTooLongForTrack ? (
            <span className="text-[9px] leading-tight text-amber-400">
              Indisponible — morceau &gt; 8 min
            </span>
          ) : (
            <>
              {/* quality / channel-count selector — changing it drops loaded stems */}
              <div className="flex overflow-hidden rounded ring-1 ring-neutral-700">
                {STEM_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setStemModel(m.id)}
                    disabled={deck.stemStatus === "working"}
                    className="flex-1 px-1 py-0.5 text-[8px] font-black disabled:opacity-40"
                    style={{
                      color: deck.stemModel === m.id ? "#0a0a0a" : color,
                      background: deck.stemModel === m.id ? color : "transparent",
                    }}
                    title={m.title}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {/* orthogonal quality knobs — stack on top of whichever model is
                  chosen above; each drops any loaded stems on change */}
              <div className="flex overflow-hidden rounded ring-1 ring-neutral-700">
                <button
                  onClick={toggleStemUltra}
                  disabled={deck.stemStatus === "working"}
                  className="flex-1 px-1 py-0.5 text-[7px] font-black disabled:opacity-40"
                  style={{
                    color: deck.stemUltra ? "#0a0a0a" : color,
                    background: deck.stemUltra ? color : "transparent",
                  }}
                  title="Mode ULTRA : passes de précision supplémentaires, séparation plus propre, plusieurs fois plus lent"
                >
                  ULTRA
                </button>
                <button
                  onClick={toggleStemLossless}
                  disabled={deck.stemStatus === "working"}
                  className="flex-1 px-1 py-0.5 text-[7px] font-black disabled:opacity-40"
                  style={{
                    color: deck.stemLossless ? "#0a0a0a" : color,
                    background: deck.stemLossless ? color : "transparent",
                  }}
                  title="Cache sans perte : stems en WAV au lieu de MP3 (plus lourd, aucun artefact de compression)"
                >
                  WAV
                </button>
                <button
                  onClick={toggleStemDenoise}
                  disabled={deck.stemStatus === "working"}
                  className="flex-1 px-1 py-0.5 text-[7px] font-black disabled:opacity-40"
                  style={{
                    color: deck.stemDenoiseVocals ? "#0a0a0a" : color,
                    background: deck.stemDenoiseVocals ? color : "transparent",
                  }}
                  title="Nettoyage vocal : réduction de bruit/souffle sur la piste voix (pas une vraie suppression de réverbe)"
                >
                  DENOISE
                </button>
              </div>
              <button
                className={`hw-btn px-2 py-1.5 text-[11px] ${deck.stemsActive ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: color, color: deck.stemsActive ? undefined : color }}
                disabled={deck.stemStatus === "working" || !deck.name}
                onClick={handleStems}
                title={
                  deck.stemCached && !deck.stemReady
                    ? "Stems déjà calculés pour ce morceau — chargement instantané"
                    : "Sépare le morceau en pistes avec Demucs, puis les contrôle en direct"
                }
              >
                {deck.stemStatus === "working"
                  ? deck.stemCached
                    ? "⏳ chargement…"
                    : deck.stemProgress != null
                    ? `⏳ ${deck.stemProgress}%`
                    : "⏳ …"
                  : deck.stemReady
                    ? deck.stemsActive
                      ? "● STEMS"
                      : "○ STEMS"
                    : deck.stemCached
                      ? "⚡ STEMS"
                      : "✂ STEMS"}
              </button>
              {deck.stemStatus === "working" && (
                <span className="text-[8px] leading-tight text-neutral-500">
                  {deck.stemCached
                    ? "depuis le cache, rien à calculer…"
                    : deck.stemModel === "htdemucs"
                      ? "peut prendre 1–2 min…"
                      : "qualité élevée — plus long…"}
                </span>
              )}
              {deck.stemCached && !deck.stemReady && deck.stemStatus !== "working" && (
                <span className="text-[8px] leading-tight text-neutral-500">en cache — instantané</span>
              )}
              {deck.stemStatus === "blocked" && (
                <span className="text-[9px] text-amber-300">mets les platines en pause pour séparer</span>
              )}
              {deck.stemStatus === "error" && (
                <span className="text-[9px] text-red-400">échec — réessaie</span>
              )}
              {/* bulk: drop or raise every stem fader at once */}
              <div className={`flex gap-1 ${deck.stemReady && deck.stemsActive ? "" : "pointer-events-none opacity-40"}`}>
                <button
                  className="hw-btn flex-1 px-1 py-1 text-[9px] font-bold"
                  style={{ ["--led" as string]: color, color }}
                  onClick={() => allStems(false)}
                  title="Coupe toutes les pistes d'un coup"
                >
                  ▼ ALL
                </button>
                <button
                  className="hw-btn flex-1 px-1 py-1 text-[9px] font-bold"
                  style={{ ["--led" as string]: color, color }}
                  onClick={() => allStems(true)}
                  title="Remonte toutes les pistes d'un coup"
                >
                  ▲ ALL
                </button>
              </div>
              {/* bulk: every stem effect or every stem loop off */}
              <div className={`flex gap-1 ${deck.stemReady && deck.stemsActive ? "" : "pointer-events-none opacity-40"}`}>
                <button
                  className="hw-btn flex-1 px-1 py-1 text-[9px] font-bold"
                  style={{ ["--led" as string]: color, color }}
                  disabled={!deck.hasStemFx}
                  onClick={() => {
                    deck.resetStemFx();
                    rerender();
                  }}
                  title="Coupe tous les effets des stems : filtre, saturation, envois reverb/delay, effets DJ et routage vers le rack"
                >
                  FX OFF
                </button>
                <button
                  className="hw-btn flex-1 px-1 py-1 text-[9px] font-bold"
                  style={{ ["--led" as string]: color, color }}
                  disabled={!deck.stemLoopActive.some(Boolean)}
                  onClick={() => {
                    deck.clearAllStemLoops();
                    rerender();
                  }}
                  title="Coupe toutes les boucles de stems ; chaque stem reprend en place"
                >
                  LOOPS OFF
                </button>
              </div>
              {/* STEM templates 1-5 : réglages mémorisés, réutilisables sur tout morceau */}
              <div className={`flex flex-col gap-1 ${deck.stemReady ? "" : "pointer-events-none opacity-40"}`}>
                <span
                  className="text-[10px] font-bold uppercase leading-none tracking-[0.15em] text-neutral-400"
                  title="Réglages de stems mémorisés (1 à 5), réutilisables sur n'importe quel morceau"
                >
                  Templates
                </span>
                <div className="flex gap-0.5">
                  {stemTpls.map((t, n) => {
                    const filled = !!t;
                    const active = stemActiveTpl === n;
                    return (
                      <button
                        key={n}
                        onClick={() => (stemSaveMode ? saveStemSlot(n) : recallStemSlot(n))}
                        disabled={!stemSaveMode && !filled}
                        title={stemSaveMode ? `Enregistrer dans ${n + 1}` : filled ? `Rappeler ${n + 1}` : "Vide"}
                        className="hw-btn flex h-5 flex-1 items-center justify-center text-[9px] font-black"
                        style={{
                          ["--led" as string]: color,
                          color: filled ? color : "#5b5b5b",
                          outline: active ? `1px solid ${color}` : undefined,
                          boxShadow: filled ? `0 0 4px ${color}55` : undefined,
                          opacity: !stemSaveMode && !filled ? 0.45 : 1,
                        }}
                      >
                        {n + 1}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setStemSaveMode((s) => !s)}
                  title="Mode sauvegarde : choisis ensuite un emplacement 1-5"
                  className="hw-btn px-1 py-0.5 text-[8px] font-black"
                  style={stemSaveMode ? { ["--led" as string]: "#ff5252", color: "#ff5252", boxShadow: "0 0 6px #ff525288" } : { ["--led" as string]: color, color }}
                >
                  {stemSaveMode ? "CHOISIR…" : "SAVE"}
                </button>
              </div>
            </>
          )}
        </div>
        <div
          className={`flex flex-1 items-stretch justify-around gap-1 ${
            deck.stemReady && deck.stemsActive ? "" : "pointer-events-none opacity-40"
          }`}
        >
          {(deck.stemReady ? deck.stemNames : STEM_PREVIEW[deck.stemModel]).map((name, i) => {
            const info = STEM_INFO[name] ?? { label: name.toUpperCase(), title: name };
            const lvl = deck.stemReady ? deck.stemVol[i] : 1;
            const muted = deck.stemReady && lvl <= 0.001;
            // live audio level of this stem (post-fader) -> mini LED equalizer

            return (
              <Fragment key={name}>
                <div className="flex flex-col items-center gap-1" title={info.title}>
                  {/* voyant équaliseur: barre de LED qui suit le niveau de la piste */}
                  <StemLiveMeter deck={deck} i={i} color={muted ? "#555" : color} />
                  {/* discreet graduation strips either side of the cap, like the other faders */}
                  <div className="flex items-stretch justify-center gap-0.5">
                    <span className="fader-ticks" aria-hidden />
                    <Fader
                      value={deck.stemReady ? deck.stemVol[i] : 1}
                      min={0}
                      max={1}
                      step={0.01}
                      vertical
                      onChange={(v) => {
                        deck.setStemVol(i, v);
                        rerender();
                      }}
                    />
                    <span className="fader-ticks" aria-hidden />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      className="text-[10px] font-bold uppercase leading-none"
                      style={{ color: muted ? "#777" : color }}
                      onClick={() => toggleStemMute(i)}
                    >
                      {info.label}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        className="min-w-[26px] rounded px-2 py-1 text-[11px] font-black leading-none"
                        style={
                          deck.stemReady && lvl > 0.001 && deck.stemVol.every((v, j) => j === i || v <= 0.001)
                            ? { background: color, color: "#0a0a0a" }
                            : { background: "rgba(255,255,255,0.1)", color: "#b0b0b0" }
                        }
                        title="Isoler ce stem — coupe le son de tous les autres pour ne garder que celui-ci"
                        onClick={() => soloStem(i)}
                      >
                        S
                      </button>
                      <button
                        className="min-w-[26px] rounded px-2 py-1 text-[11px] font-black leading-none disabled:opacity-30"
                        disabled={!deck.stemsActive}
                        style={
                          deck.stemSynthIndex === i
                            ? { background: "#e879f9", color: "#0a0a0a" }
                            : { background: "rgba(255,255,255,0.08)", color: "#b0b0b0" }
                        }
                        title="Remplace ce stem par le Synthé DJ (il passe par les filtres et effets de ce stem). Clique à nouveau pour rendre le stem"
                        onClick={() => {
                          deck.setStemSynth(deck.stemSynthIndex === i ? null : i);
                          rerender();
                        }}
                      >
                        SYN
                      </button>
                      <button
                        className="min-w-[26px] rounded px-2 py-1 text-[11px] font-black leading-none"
                        style={
                          deck.stemFxTargets.has(i)
                            ? { background: color, color: "#0a0a0a" }
                            : { background: "rgba(255,255,255,0.08)", color: "#b0b0b0" }
                        }
                        title="Route ce stem à travers le Rack DSP en bas — pense à aussi ALLUMER un module ET monter son fader INT là-bas, sinon rien ne s'entend (le Rack démarre à 0%)"
                        onClick={() => {
                          deck.toggleStemFxTarget(i);
                          rerender();
                        }}
                      >
                        RACK
                      </button>
                    </div>
                    <div className="relative w-full">
                      <button
                        className="w-full rounded px-2 py-1 text-[10px] font-black leading-none"
                        disabled={!deck.stemReady}
                        style={
                          (deck.stemReverbSend[i] ?? 0) > 0.01 ||
                          (deck.stemDelaySend[i] ?? 0) > 0.01 ||
                          Math.abs(deck.stemFilterX[i] ?? 0) > 0.01 ||
                          (deck.stemDriveAmt[i] ?? 0) > 0.01 ||
                          deck.hasStemDjFx(i)
                            ? { background: color, color: "#0a0a0a" }
                            : { background: "rgba(255,255,255,0.1)", color: "#b0b0b0" }
                        }
                        title="FX de ce stem seul : filtre, drive, envois Reverb/Delay et effets DJ (écho, dub, mash, vowel…)"
                        onClick={() => {
                          setOpenStemLoopMenu(null);
                          setOpenSendMenu(openSendMenu === i ? null : i);
                        }}
                      >
                        FX•
                      </button>
                      {openSendMenu === i && (
                        <StemFxPanel
                          deck={deck}
                          i={i}
                          label={info.label}
                          color={color}
                          rerender={rerender}
                          onClose={() => setOpenSendMenu(null)}
                        />
                      )}
                    </div>
                    <div className="relative flex w-full items-stretch gap-0.5">
                      <button
                        disabled={stemLoopBeats[i] == null || STEM_LOOP_BEATS.indexOf(stemLoopBeats[i]!) <= 0}
                        onClick={() => resizeStemLoop(i, 0.5)}
                        className="rounded px-1.5 py-1.5 text-[10px] font-black leading-none disabled:opacity-20"
                        style={{ background: "rgba(255,255,255,0.08)", color: "#d8d8d8" }}
                        title="Moitié — divise la longueur du loop par 2"
                      >
                        ½
                      </button>
                      <button
                        className="min-w-0 flex-1 rounded px-1 py-1.5 text-[11px] font-black leading-none disabled:opacity-30"
                        disabled={!deck.stemsActive || !deck.bpm}
                        style={
                          stemLoopBeats[i] != null
                            ? { background: color, color: "#0a0a0a", boxShadow: `0 0 6px ${color}88` }
                            : { background: "rgba(255,255,255,0.1)", color: "#b0b0b0" }
                        }
                        title={
                          !deck.bpm
                            ? "BPM pas encore détecté — attends la fin de l'analyse pour boucler ce stem"
                            : "Boucle ce stem seul — choisis une longueur, les autres stems continuent normalement"
                        }
                        onClick={() => {
                          setOpenSendMenu(null);
                          setOpenStemLoopMenu(openStemLoopMenu === i ? null : i);
                        }}
                      >
                        {stemLoopBeats[i] != null
                          ? `⟳${STEM_LOOP_LABELS[STEM_LOOP_BEATS.indexOf(stemLoopBeats[i]!)]}`
                          : "LOOP"}
                      </button>
                      <button
                        disabled={stemLoopBeats[i] == null || STEM_LOOP_BEATS.indexOf(stemLoopBeats[i]!) >= STEM_LOOP_BEATS.length - 1}
                        onClick={() => resizeStemLoop(i, 2)}
                        className="rounded px-1.5 py-1.5 text-[10px] font-black leading-none disabled:opacity-20"
                        style={{ background: "rgba(255,255,255,0.08)", color: "#d8d8d8" }}
                        title="Double — multiplie la longueur du loop par 2"
                      >
                        ×2
                      </button>
                      {openStemLoopMenu === i && (
                        <StemLoopPanel
                          deck={deck}
                          labels={deck.stemNames.map((n) => (STEM_INFO[n] ?? { label: n.toUpperCase() }).label)}
                          initial={i}
                          color={color}
                          rerender={rerender}
                          onExport={exportStemLoopWav}
                          onClose={() => setOpenStemLoopMenu(null)}
                        />
                      )}
                    </div>
                  </div>
                </div>
                {/* FOULE — placée juste à côté de VOIX. Reste active même stems coupés
                    (agit aussi sur le mix complet, extraction du centre mid-side). */}
                {name === "vocals" && (
                  <div
                    className="flex flex-col items-center justify-center gap-1 pointer-events-auto opacity-100"
                    title="FOULE — réduit le bruit de foule / l'ambiance d'un live (extraction du centre, mid-side). Marche sur n'importe quel morceau, avec ou sans stems."
                  >
                    <Knob
                      label="FOULE"
                      value={deck.crowd}
                      min={0}
                      max={1}
                      defaultValue={0}
                      size={40}
                      color={color}
                      led
                      format={(v) => (v < 0.005 ? "—" : `−${Math.round(v * 100)}%`)}
                      onChange={(v) => {
                        deck.setCrowd(v);
                        rerender();
                      }}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>


      {/* beat loop + actions */}
      <div className="flex items-end justify-between gap-4">
        <DeckLoopPads deck={deck} color={color} loop={loop} setLoop={setLoop} onChange={rerender} />

        {/* save the loaded track into a playlist (menu of existing + new) */}
        <div className="relative">
          <button
            className="hw-btn px-3 py-2 text-xs disabled:opacity-30"
            style={{ ["--led" as string]: color, color }}
            disabled={!deck.name}
            onClick={() => setPlMenu((v) => !v)}
            title="Enregistrer le morceau chargé dans une playlist"
          >
            ≣+ Playlist
          </button>
          {plMenu && (
            <div
              className="absolute bottom-full left-0 z-20 mb-1 max-h-52 w-44 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-xl"
              onMouseLeave={() => setPlMenu(false)}
            >
              {loadLibrary().playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToPlaylist(p.id)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                  title={`Ajouter à « ${p.name} »`}
                >
                  ≣ {p.name}{" "}
                  <span className="text-neutral-500">({p.trackIds.length})</span>
                </button>
              ))}
              <button
                onClick={() => addToPlaylist("__new__")}
                className="mt-0.5 block w-full rounded px-2 py-1 text-left text-xs font-bold hover:bg-neutral-800"
                style={{ color }}
              >
                + Nouvelle playlist…
              </button>
            </div>
          )}
          {plFlash && (
            <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-300">
              {plFlash}
            </span>
          )}
        </div>

        <button
          className="hw-btn px-3 py-2 text-xs disabled:opacity-30"
          style={{ ["--led" as string]: color, color }}
          disabled={!deck.sourceLink}
          onClick={() => deck.sourceLink && onSendToConverter(deck.sourceLink)}
          title={
            deck.sourceLink
              ? "Envoyer ce morceau YouTube vers le convertisseur MP3"
              : "Disponible seulement pour les morceaux chargés depuis YouTube"
          }
        >
          → MP3
        </button>
        <button
          className="hw-btn px-3 py-2 text-xs text-neutral-300"
          onClick={() => fileRef.current?.click()}
        >
          {loading ? "…" : "⤓ Charger"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      </>
      )}
    </div>
  );
}
