"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";
import { Knob } from "./Knob";
import { Fader } from "./Fader";
import { Waveform } from "./Waveform";
import { FXPad } from "./FXPad";
import { Spectrum } from "./Spectrum";
import { RackPanel } from "./RackPanel";
import { EqRackStrip } from "./EqRackStrip";
import { loadLibrary, saveLibrary, idbPutBlob, idbGetBlob, uid, LibTrack } from "@/lib/library";

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
const STEM_INFO: Record<string, { label: string; title: string }> = {
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

// ---- global STEM templates (numbered 1-5): per-stem volumes + FOULE + makeup,
// reusable across any track. Applied by index up to the current model's stem
// count, so a 4-stem template still works on a 6-stem split (extra stems left).
const STEM_LS_KEY = "djsynth.stemtemplates.v1";
type StemTpl = { name?: string; vol: number[]; crowd: number; makeup: boolean };
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
function StemMeter({ level, color }: { level: number; color: string }) {
  const SEG = 6;
  const lit = Math.round(Math.min(1, Math.max(0, level)) * SEG);
  return (
    <div className="flex flex-col-reverse items-center gap-[1.5px]" aria-hidden>
      {Array.from({ length: SEG }).map((_, s) => {
        const on = s < lit;
        const segColor = s >= SEG - 1 ? "#ff4d4d" : s >= SEG - 3 ? "#ffd23d" : color;
        return (
          <span
            key={s}
            className="h-[3px] w-3 rounded-[1px]"
            style={{
              background: on ? segColor : "#241f18",
              boxShadow: on ? `0 0 4px ${segColor}` : "none",
              opacity: on ? 1 : 0.55,
            }}
          />
        );
      })}
    </div>
  );
}

export function DeckPanel({ deck, side, color, tick, onLoaded, onSync, onSendToConverter, otherBpm, onStems, onLibraryChange, forceTrim, activeModules }: Props) {
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

  // ---- pro performance FX: BRAKE (turntable stop), ECHO OUT, CENSOR (gate) ----
  const brakeRaf = useRef<number | null>(null);
  const [braking, setBraking] = useState(false);
  function brake() {
    if (brakeRaf.current !== null || !deck.playing) return;
    const startPct = pitch;
    const t0 = performance.now();
    const DUR = 900;
    setBraking(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const pct = startPct + (-100 - startPct) * p; // ramp toward rate≈0, like a platter losing power
      deck.setPitch(pct);
      if (p < 1) {
        brakeRaf.current = requestAnimationFrame(step);
      } else {
        brakeRaf.current = null;
        deck.pause();
        deck.setPitch(startPct); // restore normal pitch so the next PLAY isn't stuck slow
        setBraking(false);
      }
    };
    brakeRaf.current = requestAnimationFrame(step);
  }

  const [echoing, setEchoing] = useState(false);
  function echoOut() {
    if (echoing) return;
    setEchoing(true);
    const r = deck.rack;
    r.setEnabled("delay", true);
    const beatSec = deck.bpm > 0 ? 60 / deck.bpm : 0.375;
    r.setParam("delay", "time", Math.min(1.2, beatSec));
    r.setParam("delay", "fb", 0.55);
    const t0 = performance.now();
    const RISE = 250;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / RISE);
      r.setMix("delay", p);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        // let the repeats ring out, then fade the send back to nothing
        const t1 = performance.now();
        const TAIL = 1700;
        const fadeOut = (now2: number) => {
          const p2 = Math.min(1, (now2 - t1) / TAIL);
          r.setMix("delay", 1 - p2);
          if (p2 < 1) {
            requestAnimationFrame(fadeOut);
          } else {
            r.setEnabled("delay", false);
            setEchoing(false);
          }
        };
        requestAnimationFrame(fadeOut);
      }
    };
    requestAnimationFrame(step);
  }

  const censorTimer = useRef<number | null>(null);
  const [censoring, setCensoring] = useState(false);
  function censorStart() {
    if (censorTimer.current !== null) return;
    setCensoring(true);
    const beatSec = deck.bpm > 0 ? 60 / deck.bpm : 0.5;
    const gateMs = Math.max(50, (beatSec * 1000) / 4); // 1/16-note stutter gate
    let on = true;
    deck.setVolume(0);
    censorTimer.current = window.setInterval(() => {
      on = !on;
      deck.setVolume(on ? (deckOn ? 1 : 0) : 0);
    }, gateMs);
  }
  function censorStop() {
    if (censorTimer.current !== null) {
      window.clearInterval(censorTimer.current);
      censorTimer.current = null;
    }
    setCensoring(false);
    deck.setVolume(deckOn ? 1 : 0); // release — back to whatever the power switch says
  }
  useEffect(
    () => () => {
      if (brakeRaf.current !== null) cancelAnimationFrame(brakeRaf.current);
      if (censorTimer.current !== null) window.clearInterval(censorTimer.current);
    },
    []
  );

  // progressive auto-sync: ramp this deck's tempo toward the other deck's BPM
  const [autoSync, setAutoSync] = useState(false);
  const syncRaf = useRef<number | null>(null);
  const stopAutoSync = () => {
    if (syncRaf.current !== null) cancelAnimationFrame(syncRaf.current);
    syncRaf.current = null;
    setAutoSync(false);
  };
  const startAutoSync = () => {
    const other = otherBpm();
    if (!other || !deck.bpm) return;
    stopAutoSync();
    const fromPct = deck.pitchPct;
    const toPct = Math.max(-50, Math.min(50, (other / deck.bpm - 1) * 100));
    const ms = 6000;
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
  useEffect(() => stopAutoSync, []);

  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
  const [trim, setTrim] = useState(1);
  const prevForceTrimRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (forceTrim !== undefined && forceTrim !== prevForceTrimRef.current) {
      prevForceTrimRef.current = forceTrim;
      setTrim(Math.min(1.5, Math.max(0, forceTrim)));
    }
  }, [forceTrim]);
  const [filter, setFilter] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [scratch, setScratch] = useState(0);
  const [loop, setLoop] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fxKey, setFxKey] = useState(0); // bump to remount the FX section on PANIC
  // stems are simply unavailable past 8 min (Demucs on CPU can't keep up) — the
  // whole trigger is hidden rather than allowing a click that fails later.
  const stemTooLongForTrack = !!deck.name && deck.duration > 8 * 60 && !deck.stemReady;

  // per-deck PANIC: eject the loaded song and return every control of THIS deck
  // to zero (EQ, gain, filter, pitch, scratch, loop, FX) — the other deck is
  // untouched.
  function panic() {
    stopAutoSync();
    deck.unload();
    setEq({ low: 0, mid: 0, high: 0 });
    setTrim(1);
    setFilter(0);
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      deck.loadStreaming(file, file.name.replace(/\.[^.]+$/, ""));
      deck.play();
      onLoaded();
      rerender();
    } catch (err) {
      alert("Décodage impossible: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
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
    deck.loading = true;
    deck.loadStartedAt = performance.now();
    try {
      if (t.source === "local") {
        const blob = await idbGetBlob(t.id);
        if (!blob) throw new Error("Fichier introuvable");
        // streaming: audio starts immediately; waveform/BPM arrive in the background
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
  const STEM_LOOP_BEATS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16];
  const STEM_LOOP_LABELS = ["1/16", "1/8", "1/4", "1/2", "1", "2", "4", "8", "16"];
  // read live off the deck (not a mirrored useState) so the UI can never show a
  // loop as engaged when the deck-side call actually silently no-op'd — same
  // fix pattern the earlier "ghost-loop" bug used for the outer LOOP button,
  // now applied to the length picker and ½/×2 buttons too.
  const stemLoopBeats = deck.stemLoopBeatsVal;
  const [openStemLoopMenu, setOpenStemLoopMenu] = useState<number | null>(null);
  function setStemLoop(i: number, beats: number | null) {
    if (beats === null) deck.clearStemLoop(i);
    else deck.setStemBeatLoop(i, beats);
    setOpenStemLoopMenu(null);
    rerender();
  }
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
  const ROLL_OPTIONS: (number | null)[] = [null, 2, 4, 8]; // null = Lock (stays until cleared)
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
  const [stemTpls, setStemTpls] = useState<(StemTpl | null)[]>(() => Array(STEM_SLOTS).fill(null));
  const [stemSaveMode, setStemSaveMode] = useState(false);
  const [stemActiveTpl, setStemActiveTpl] = useState<number | null>(null);
  useEffect(() => setStemTpls(loadStemTpls()), []);
  function saveStemSlot(n: number) {
    const tpl: StemTpl = { vol: deck.stemVol.slice(), crowd: deck.crowd, makeup: deck.stemMakeup };
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
    setStemActiveTpl(n);
    rerender();
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
        addedAt: Date.now(),
      } as LibTrack;
      // a directly-loaded local file has no stored blob — persist its bytes so
      // it can be reloaded later from the playlist.
      if (source === "local") {
        const raw = deck.getRawData();
        if (raw) {
          try {
            await idbPutBlob(id, new Blob([raw]));
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

  return (
    <div className="zoom-zone hw-screwed hw-panel flex flex-col gap-3 self-start p-4">
      {/* header */}
      <div className="hw-brushed flex items-center justify-between px-3 py-2">
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
            title={deckOn ? `Éteindre le Deck ${side} (coupe le son, garde la lecture)` : `Allumer le Deck ${side}`}
          >
            ⏻
          </button>
          <button
            onClick={panic}
            className="hw-panic text-[11px]"
            title={`PANIC Deck ${side} : éjecte le morceau et remet toutes les commandes à zéro`}
          >
            PANIC
          </button>
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
        <div className="hw-screen flex-1 p-2">
          <Waveform
            peaks={deck.peaks}
            progress={progress}
            cue={deck.duration ? deck.cuePoint / deck.duration : 0}
            color={color}
            onSeek={(n) => {
              deck.seek(n * deck.duration);
              rerender();
            }}
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-neutral-500">
            <span>{fmtTime(pos)}</span>
            <span>{fmtTime(deck.duration)}</span>
          </div>
        </div>
      </div>

      {/* live spectrum */}
      <Spectrum deck={deck} color={color} />

      {/* transport */}
      <div className="flex gap-2">
        <button
          className="hw-btn px-2 py-2 text-sm disabled:opacity-40"
          style={{ ["--led" as string]: color, color }}
          disabled={stepping}
          onClick={() => stepSingle(-1)}
          title={`Single précédent (morceaux classés sur le Deck ${side})`}
        >
          ⏮
        </button>
        <button
          className="hw-btn px-2 py-2 text-sm disabled:opacity-40"
          style={{ ["--led" as string]: color, color }}
          disabled={stepping}
          onClick={() => stepSingle(1)}
          title={`Single suivant (morceaux classés sur le Deck ${side})`}
        >
          ⏭
        </button>
        <button
          className="hw-btn flex-1 py-2 text-sm"
          style={{ ["--led" as string]: color, color }}
          onClick={() => {
            deck.setCue();
            rerender();
          }}
        >
          SET CUE
        </button>
        <button
          className="hw-btn flex-1 py-2 text-sm"
          style={{ ["--led" as string]: color, color }}
          onClick={() => {
            deck.gotoCue();
            rerender();
          }}
        >
          CUE
        </button>
        <button
          className={`hw-btn flex-1 py-2 text-sm ${deck.playing ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          onClick={() => {
            deck.toggle();
            rerender();
          }}
        >
          {deck.playing ? "❚❚ PAUSE" : "▶ PLAY"}
        </button>
        {/* seek: retour rapide / retour / avance / avance rapide */}
        {(
          [
            ["«15", -15, "Retour rapide"],
            ["‹5", -5, "Retour"],
            ["5›", 5, "Avance"],
            ["15»", 15, "Avance rapide"],
          ] as [string, number, string][]
        ).map(([label, dt, title]) => (
          <button
            key={label}
            className="hw-btn px-1.5 py-2 text-[10px] font-bold leading-none"
            style={{ ["--led" as string]: color, color }}
            disabled={!deck.name}
            title={title}
            onClick={() => {
              const t = Math.min(deck.duration, Math.max(0, deck.position() + dt));
              deck.seek(t);
              rerender();
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="hw-btn px-3 py-2 text-sm text-neutral-200"
          onClick={onSync}
          title="Caler le tempo sur l'autre deck (immédiat)"
        >
          SYNC
        </button>
        <button
          className={`hw-btn px-3 py-2 text-sm ${autoSync ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color, color: autoSync ? undefined : color }}
          onClick={() => (autoSync ? stopAutoSync() : startAutoSync())}
          title="Glisser progressivement vers le tempo de l'autre deck (6 s)"
        >
          {autoSync ? "■ Sync…" : "⇄ Auto-sync"}
        </button>
      </div>

      {/* pitch + scratch — two halves directly under the SYNC / Auto-sync buttons */}
      <div className="flex items-stretch gap-3">
        {/* left half: pitch / tempo */}
        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase text-neutral-500">
            Pitch {pitch > 0 ? "+" : ""}
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
        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase text-neutral-500">Scratch</span>
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
              className="rounded px-0.5 py-0.5 text-center font-mono text-[8px] font-bold tracking-tight"
              style={{ width: 32, color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`, boxShadow: "inset 0 0 0 1px #1a1a1a" }}
            >{eq[b] > 0 ? "+" : ""}{Math.round(eq[b])}</span>
            <Fader
              value={eq[b]} min={-26} max={12} step={0.1} neutral={0}
              vertical onChange={(v) => { setEq((e) => ({ ...e, [b]: v })); deck.setEQ(b, v); }}
              className="!h-[86px]"
            />
            <span className="text-center text-[8px] font-bold uppercase leading-none" style={{ color }}>{b}</span>
          </div>
        ))}
        <Knob label="Filter" value={filter} min={-1} max={1} defaultValue={0} color={color}
          onChange={(v) => { setFilter(v); deck.setFilter(v); }}
        />
      </div>

      {/* 15-band rack EQ — independent from Rack DSP, own toggle */}
      {activeModules?.eq !== false && <EqRackStrip deck={deck} color={color} />}

      {/* FX pad */}
      {activeModules?.fxpad !== false && <div className="hw-recess p-3">
        <FXPad key={fxKey} deck={deck} color={color} />
      </div>}

      {/* stem separation (Demucs) — split the track into live faders. Demucs on
          CPU can't realistically finish beyond ~8 min of audio, so the trigger
          is removed outright for long tracks instead of failing after a click. */}
      <div className="hw-recess flex items-stretch gap-3 p-3">
        <div className="flex w-28 shrink-0 flex-col justify-center gap-1">
          <span className="text-[9px] uppercase leading-none text-neutral-500">Séparation</span>
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
                  ? "⏳ …"
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
                  {deck.stemModel === "htdemucs" ? "peut prendre 1–2 min…" : "qualité élevée — plus long…"}
                </span>
              )}
              {deck.stemCached && !deck.stemReady && deck.stemStatus !== "working" && (
                <span className="text-[8px] leading-tight text-neutral-500">en cache — instantané</span>
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
              {/* STEM templates 1-5 : réglages mémorisés, réutilisables sur tout morceau */}
              <div className={`flex flex-col gap-1 ${deck.stemReady ? "" : "pointer-events-none opacity-40"}`}>
                <span className="text-[8px] uppercase leading-none text-neutral-500">Templates</span>
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
            const meter = deck.stemReady && deck.stemsActive ? deck.stemLevel(i) : 0;
            return (
              <Fragment key={name}>
                <div className="flex flex-col items-center gap-1" title={info.title}>
                  {/* voyant équaliseur: barre de LED qui suit le niveau de la piste */}
                  <StemMeter level={meter} color={muted ? "#555" : color} />
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
                        className="min-w-[26px] rounded px-2 py-1 text-[11px] font-black leading-none"
                        style={
                          deck.stemFxTargets.has(i)
                            ? { background: color, color: "#0a0a0a" }
                            : { background: "rgba(255,255,255,0.1)", color: "#b0b0b0" }
                        }
                        title="Route ce stem à travers le Rack DSP en bas — pense à aussi ALLUMER un module ET monter son fader INT là-bas, sinon rien ne s'entend (le Rack démarre à 0%)"
                        onClick={() => {
                          deck.toggleStemFxTarget(i);
                          rerender();
                        }}
                      >
                        FX
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
                          (deck.stemDriveAmt[i] ?? 0) > 0.01
                            ? { background: color, color: "#0a0a0a" }
                            : { background: "rgba(255,255,255,0.1)", color: "#b0b0b0" }
                        }
                        title="FX dédiés à ce stem : filtre, drive, envois Reverb/Delay — toujours actifs, pas besoin du bouton FX (qui lui splice le Rack partagé)"
                        onClick={() => setOpenSendMenu(openSendMenu === i ? null : i)}
                      >
                        FX•
                      </button>
                      {openSendMenu === i && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenSendMenu(null)} />
                          <div
                            className="absolute bottom-full left-1/2 z-50 mb-1.5 flex w-max -translate-x-1/2 flex-col gap-2 rounded-lg p-2.5"
                            style={{
                              background: "linear-gradient(180deg,#1c1c1e,#0e0e10)",
                              border: "1px solid #000",
                              boxShadow: "0 10px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-10 shrink-0 text-[8px] font-bold uppercase text-neutral-500">Filtre</span>
                              <input
                                type="range"
                                min={-1}
                                max={1}
                                step={0.01}
                                value={deck.stemFilterX[i] ?? 0}
                                onChange={(e) => {
                                  deck.setStemFilter(i, parseFloat(e.target.value));
                                  rerender();
                                }}
                                className="h-1 w-28 accent-current"
                                style={{ color }}
                                title="Négatif = passe-bas (étouffe), positif = passe-haut (aminci) — centre = transparent"
                              />
                              <span className="w-9 shrink-0 text-right font-mono text-[9px]" style={{ color }}>
                                {Math.round((deck.stemFilterX[i] ?? 0) * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-10 shrink-0 text-[8px] font-bold uppercase text-neutral-500">Drive</span>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={deck.stemDriveAmt[i] ?? 0}
                                onChange={(e) => {
                                  deck.setStemDrive(i, parseFloat(e.target.value));
                                  rerender();
                                }}
                                className="h-1 w-28 accent-current"
                                style={{ color }}
                                title="Saturation douce (soft-clip) — ajoute du grain/de la chaleur"
                              />
                              <span className="w-9 shrink-0 text-right font-mono text-[9px]" style={{ color }}>
                                {Math.round((deck.stemDriveAmt[i] ?? 0) * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 border-t border-white/10 pt-2">
                              <span className="w-10 shrink-0 text-[8px] font-bold uppercase text-neutral-500">Verb</span>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={deck.stemReverbSend[i] ?? 0}
                                onChange={(e) => {
                                  deck.setStemReverbSend(i, parseFloat(e.target.value));
                                  rerender();
                                }}
                                className="h-1 w-28 accent-current"
                                style={{ color }}
                              />
                              <span className="w-9 shrink-0 text-right font-mono text-[9px]" style={{ color }}>
                                {Math.round((deck.stemReverbSend[i] ?? 0) * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-10 shrink-0 text-[8px] font-bold uppercase text-neutral-500">Delay</span>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={deck.stemDelaySend[i] ?? 0}
                                onChange={(e) => {
                                  deck.setStemDelaySend(i, parseFloat(e.target.value));
                                  rerender();
                                }}
                                className="h-1 w-28 accent-current"
                                style={{ color }}
                              />
                              <span className="w-9 shrink-0 text-right font-mono text-[9px]" style={{ color }}>
                                {Math.round((deck.stemDelaySend[i] ?? 0) * 100)}%
                              </span>
                            </div>
                          </div>
                        </>
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
                        disabled={!deck.stemsActive || !deck.playing || !deck.bpm}
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
                        onClick={() => setOpenStemLoopMenu(openStemLoopMenu === i ? null : i)}
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
                        <>
                          {/* backdrop — click anywhere outside to close */}
                          <div className="fixed inset-0 z-40" onClick={() => setOpenStemLoopMenu(null)} />
                          <div
                            className="absolute bottom-full left-1/2 z-50 mb-1.5 flex w-max -translate-x-1/2 flex-col gap-1.5 rounded-lg p-2"
                            style={{
                              background: "linear-gradient(180deg,#1c1c1e,#0e0e10)",
                              border: "1px solid #000",
                              boxShadow: "0 10px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
                            }}
                          >
                            <div className="grid grid-cols-3 gap-1">
                              {STEM_LOOP_BEATS.map((b, bi) => (
                                <button
                                  key={b}
                                  disabled={!deck.stemsActive || !deck.stemReady || !deck.bpm}
                                  onClick={() => setStemLoop(i, stemLoopBeats[i] === b ? null : b)}
                                  className="rounded px-2.5 py-1.5 text-[11px] font-bold leading-none disabled:opacity-30"
                                  style={
                                    stemLoopBeats[i] === b
                                      ? { background: color, color: "#0a0a0a" }
                                      : { background: "rgba(255,255,255,0.08)", color: "#d8d8d8" }
                                  }
                                >
                                  {STEM_LOOP_LABELS[bi]}
                                </button>
                              ))}
                            </div>

                            {/* Roll vs Lock: auto-release the loop after N repeats, or keep it until cleared */}
                            <div className="flex items-center gap-1 border-t border-white/10 pt-1.5">
                              <span className="mr-0.5 text-[8px] font-bold uppercase text-neutral-500">Fin</span>
                              {ROLL_OPTIONS.map((r) => (
                                <button
                                  key={String(r)}
                                  onClick={() => {
                                    deck.setStemLoopRoll(i, r);
                                    rerender();
                                  }}
                                  className="flex-1 rounded px-1.5 py-1 text-[9px] font-bold leading-none"
                                  style={
                                    (deck.stemLoopRollAt[i] ?? null) === r
                                      ? { background: color, color: "#0a0a0a" }
                                      : { background: "rgba(255,255,255,0.08)", color: "#d8d8d8" }
                                  }
                                  title={r == null ? "Lock — reste en boucle jusqu'à ce que tu l'arrêtes" : `Roll — se relâche automatiquement après ${r} répétitions et le morceau reprend son cours`}
                                >
                                  {r == null ? "LOCK" : `ROLL ${r}×`}
                                </button>
                              ))}
                            </div>

                            {/* Smooth: fade the loop seam instead of a hard cut */}
                            <div className="flex items-center gap-1.5 border-t border-white/10 pt-1.5">
                              <span className="text-[8px] font-bold uppercase text-neutral-500">Doux</span>
                              <input
                                type="range"
                                min={0}
                                max={60}
                                step={5}
                                value={deck.stemLoopSmoothMs[i] ?? 10}
                                onChange={(e) => {
                                  deck.setStemLoopSmooth(i, parseInt(e.target.value, 10));
                                  rerender();
                                }}
                                className="h-1 flex-1 accent-current"
                                style={{ color }}
                                title="Lisse la jonction du loop (fondu court) pour éviter le clic entre deux répétitions"
                              />
                              <span className="w-8 shrink-0 text-right font-mono text-[9px]" style={{ color }}>
                                {deck.stemLoopSmoothMs[i] ?? 10}ms
                              </span>
                            </div>

                            <button
                              onClick={() => setStemLoop(i, null)}
                              className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide text-red-400"
                              style={{ background: "rgba(255,60,60,0.14)" }}
                            >
                              ✕ Off
                            </button>
                          </div>
                        </>
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

      {/* full serial DSP rack — modules now individually selectable */}
      <RackPanel deck={deck} color={color} activeModules={activeModules} />

      {/* pro performance FX — the moves real DJs reach for between tracks */}
      <div className="hw-recess flex items-center gap-3 rounded px-3 py-2">
        <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-500">FX Perfo</span>
        <button
          onClick={brake}
          disabled={!deck.playing || braking}
          className={`hw-transport h-10 w-10 text-[9px] font-black ${braking ? "hw-transport-play" : ""}`}
          style={{ ["--led" as string]: color }}
          title="BRAKE — arrêt platine progressif (spinback), comme couper le moteur"
        >
          BRK
        </button>
        <button
          onClick={echoOut}
          disabled={echoing}
          className={`hw-transport h-10 w-10 text-[9px] font-black ${echoing ? "hw-transport-play" : ""}`}
          style={{ ["--led" as string]: color }}
          title="ECHO OUT — lâche un écho synchronisé au tempo qui s'éteint tout seul, classique pour sortir d'un mix"
        >
          ECHO
        </button>
        <button
          onMouseDown={censorStart}
          onMouseUp={censorStop}
          onMouseLeave={censorStop}
          onTouchStart={censorStart}
          onTouchEnd={censorStop}
          className={`hw-transport h-10 w-10 text-base ${censoring ? "hw-transport-play" : ""}`}
          style={{ ["--led" as string]: color }}
          title="CENSOR — maintiens pour hacher le son en rythme (1/16), relâche pour le révéler d'un coup"
        >
          ✂
        </button>
      </div>

      {/* beat loop + actions */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase text-neutral-500">Beat loop</span>
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                [1 / 16, "1/16"],
                [1 / 8, "1/8"],
                [1 / 4, "1/4"],
                [1 / 2, "1/2"],
                [1, "1"],
                [2, "2"],
                [4, "4"],
                [8, "8"],
                [16, "16"],
              ] as [number, string][]
            ).map(([b, l]) => (
              <button
                key={l}
                className={`hw-btn px-1.5 py-1 text-[11px] ${loop === b ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: color }}
                onClick={() => {
                  if (loop === b) {
                    deck.clearLoop();
                    setLoop(0);
                  } else {
                    deck.setBeatLoop(b);
                    setLoop(b);
                  }
                  rerender();
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

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
    </div>
  );
}
