"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DJEngine,
  getEngine,
  rebuildEngine,
  saveEngineState,
  loadEngineState,
  hasSavedState,
} from "@/lib/audio/engine";
import { DeckPanel } from "@/components/DeckPanel";
import { Fader } from "@/components/Fader";
import { SynthPanel } from "@/components/SynthPanel";
import { SamplerPanel } from "@/components/SamplerPanel";
import DX7Synth from "@/components/DX7Synth";
import Solar42F from "@/components/Solar42F";
import { SoundFxPanel } from "@/components/SoundFxPanel";
import { MediaLibrary } from "@/components/MediaLibrary";
import { BossFxPanel } from "@/components/BossFxPanel";
import { LibraryPanel } from "@/components/LibraryPanel";
import { YouTubeDeck } from "@/components/YouTubeDeck";
import { Mp3Converter } from "@/components/Mp3Converter";
import { StemsMidiConverter } from "@/components/StemsMidiConverter";
import { LcdClock } from "@/components/LcdClock";
import { DeckTimers } from "@/components/DeckTimers";
import { MixScope } from "@/components/MixScope";
import { CpuMeter } from "@/components/CpuMeter";
import { StudioView } from "@/components/StudioView";
import { PlatineView } from "@/components/PlatineView";
import { Splash } from "@/components/Splash";

export default function Home() {
  const engineRef = useRef<DJEngine | null>(null);
  // hidden <audio> mirroring the master mix — see DJEngine.backgroundAudioStream
  // for why: an actively-playing HTMLMediaElement is what stops iOS Safari
  // from suspending the whole page (and its AudioContext) once backgrounded.
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  function attachBackgroundAudio(eng: DJEngine) {
    const el = bgAudioRef.current;
    if (!el) return;
    el.srcObject = eng.backgroundAudioStream;
    el.play().catch(() => {
      /* needs a user gesture — init()/recoverSound() are both click-triggered, so this should succeed */
    });
  }
  // animated opening screen — shown once per browser session
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("djsynth.splashSeen")) setSplash(false);
    } catch {
      /* ignore */
    }
  }, []);
  function dismissSplash() {
    setSplash(false);
    try {
      sessionStorage.setItem("djsynth.splashSeen", "1");
    } catch {
      /* ignore */
    }
  }
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [crossfade, setCrossfade] = useState(0.5);
  const [master, setMaster] = useState(0.9);
  const [view, setView] = useState<"console" | "studio" | "platine" | "playlist">("console"); // top-level workspace
  const [showLibrary, setShowLibrary] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showYouTube, setShowYouTube] = useState(false); // bottom YouTube video tool (optional)
  const [resetKey, setResetKey] = useState(0);
  // fully close a deck's whole panel (not just POWER, which only mutes output
  // and hides its tools — this removes it from the layout entirely so the
  // remaining deck + mixer get the freed-up width). Always keep at least one
  // open — closing both would leave nothing to mix.
  const [deckClosed, setDeckClosed] = useState<{ A: boolean; B: boolean }>({ A: false, B: false });
  function toggleDeckClosed(side: "A" | "B") {
    setDeckClosed((c) => {
      const wasClosed = c[side];
      const next = { ...c, [side]: !c[side] };
      if (next.A && next.B) return c; // never close both
      if (wasClosed && engineRef.current) {
        // reopening: the fresh DeckPanel's local POWER toggle defaults to
        // "on" (a brand-new mount has no memory of a prior mute) — force the
        // deck's actual volume to match so it isn't silently still muted
        // from before it was closed, with the panel showing no sign of it.
        const deck = side === "A" ? engineRef.current.deckA : engineRef.current.deckB;
        deck.setVolume(1);
      }
      return next;
    });
  }
  // device mode chosen at launch — "iphone" starts compact (single deck,
  // library collapsed) so the whole console fits without horizontal scroll;
  // "desktop" (PC/iPad) keeps both decks side by side as before. Persisted
  // and pre-guessed from screen width so returning visitors aren't asked
  // again, but always overridable from the launch screen.
  const [deviceMode, setDeviceMode] = useState<"desktop" | "iphone" | null>(null);
  // Resolved client-side only, after mount: reading localStorage/innerWidth in
  // the useState initializer would return a different value on the server
  // (no window) vs. the client, causing a hydration mismatch on first paint.
  // The one-tick "neither button highlighted yet" flash this causes instead
  // is invisible in practice — it resolves within the same frame.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("djsynth.deviceMode");
      if (saved === "desktop" || saved === "iphone") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate client-only init, see comment above
        setDeviceMode(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    setDeviceMode(window.innerWidth < 700 ? "iphone" : "desktop");
  }, []);
  function chooseDeviceMode(mode: "desktop" | "iphone") {
    setDeviceMode(mode);
    try {
      localStorage.setItem("djsynth.deviceMode", mode);
    } catch {
      /* ignore */
    }
  }
  const [autoDur, setAutoDur] = useState(8); // seconds-before-end trigger + fade length
  const [autoArmed, setAutoArmed] = useState(false); // "Auto-fade" toggle — watches for track-end
  const [autoRunning, setAutoRunning] = useState(false); // a sweep is actively animating right now
  const [autoFadeSync, setAutoFadeSync] = useState(false); // also glide tempo onto the incoming deck
  const autoRaf = useRef<number | null>(null);
  const [convLink, setConvLink] = useState(""); // shared MP3-converter input
  const [convFlash, setConvFlash] = useState(0); // bumps to flash the converter
  const [normTrimA, setNormTrimA] = useState<number | undefined>(undefined);
  const [normTrimB, setNormTrimB] = useState<number | undefined>(undefined);
  const [normFlash, setNormFlash] = useState(false);

  // --- Optional modules: all hidden by default, added on-the-fly ---------------
  type Modules = {
    synth: boolean;
    dx7: boolean;
    solar42: boolean;
    sampler: boolean;
    soundfx: boolean;
    boss: boolean;
    eq: boolean;
    fxpad: boolean;
    // DSP modules (individual)
    loudness: boolean;
    surround: boolean;
    exciter: boolean;
    transient: boolean;
    multiband: boolean;
    comp: boolean;
    drive: boolean;
    wavefold: boolean;
    crush: boolean;
    robot: boolean;
    ringmod: boolean;
    voyelle: boolean;
    isolator: boolean;
    autowah: boolean;
    resonator: boolean;
    gate: boolean;
    glitch: boolean;
    shimmer: boolean;
    delay: boolean;
    reverb: boolean;
    limiter: boolean;
    autotune: boolean;
  };
  const DEFAULT_MODULES: Modules = {
    synth: false,
    dx7: false,
    solar42: false,
    sampler: false,
    soundfx: false,
    boss: false,
    eq: false,
    fxpad: false,
    loudness: false,
    surround: false,
    exciter: false,
    transient: false,
    multiband: false,
    comp: false,
    drive: false,
    wavefold: false,
    crush: false,
    robot: false,
    ringmod: false,
    voyelle: false,
    isolator: false,
    autowah: false,
    resonator: false,
    gate: false,
    glitch: false,
    shimmer: false,
    delay: false,
    reverb: false,
    limiter: false,
    autotune: false,
  };
  const [modules, setModules] = useState<Modules>(() => {
    try {
      const raw = localStorage.getItem("djsynth.modules.v1");
      return raw ? { ...DEFAULT_MODULES, ...JSON.parse(raw) } : DEFAULT_MODULES;
    } catch {
      return DEFAULT_MODULES;
    }
  });
  const [showModulePicker, setShowModulePicker] = useState(false);
  function toggleModule(k: keyof Modules) {
    setModules((m) => {
      const next = { ...m, [k]: !m[k] };
      try {
        localStorage.setItem("djsynth.modules.v1", JSON.stringify(next));
      } catch { /**/ }
      return next;
    });
  }
  const MODULE_DEFS: { key: keyof Modules; label: string; scope: string; group?: string }[] = [
    { key: "synth", label: "Synthé", scope: "global" },
    { key: "dx7", label: "DX7 · Synthé + Sampler", scope: "global" },
    { key: "solar42", label: "Solar 42F · Drone Machine", scope: "global" },
    { key: "sampler", label: "Sculpteur de son", scope: "global" },
    { key: "soundfx", label: "FX Sonores", scope: "global" },
    { key: "boss", label: "Boss FX", scope: "mixer" },
    { key: "eq", label: "EQ 15 bandes", scope: "deck" },
    { key: "fxpad", label: "FX · Intensité", scope: "deck" },
    // DSP Modules
    { key: "isolator", label: "ISO VOIX", scope: "deck", group: "DSP" },
    { key: "autotune", label: "AUTO-TUNE", scope: "deck", group: "DSP" },
    { key: "comp", label: "COMP", scope: "deck", group: "DSP" },
    { key: "drive", label: "DRIVE", scope: "deck", group: "DSP" },
    { key: "wavefold", label: "WAVEFOLD", scope: "deck", group: "DSP" },
    { key: "crush", label: "CRUSH", scope: "deck", group: "DSP" },
    { key: "robot", label: "ROBOT", scope: "deck", group: "DSP" },
    { key: "ringmod", label: "RINGMOD", scope: "deck", group: "DSP" },
    { key: "voyelle", label: "VOYELLE", scope: "deck", group: "DSP" },
    { key: "autowah", label: "AUTO-WAH", scope: "deck", group: "DSP" },
    { key: "resonator", label: "RESONATOR", scope: "deck", group: "DSP" },
    { key: "gate", label: "GATE", scope: "deck", group: "DSP" },
    { key: "glitch", label: "GLITCH", scope: "deck", group: "DSP" },
    { key: "shimmer", label: "SHIMMER", scope: "deck", group: "DSP" },
    { key: "delay", label: "DELAY", scope: "deck", group: "DSP" },
    { key: "reverb", label: "REVERB", scope: "deck", group: "DSP" },
    { key: "limiter", label: "LIMITER", scope: "deck", group: "DSP" },
    { key: "loudness", label: "LOUDNESS", scope: "deck", group: "DSP" },
    { key: "surround", label: "SURROUND", scope: "deck", group: "DSP" },
    { key: "exciter", label: "EXCITER", scope: "deck", group: "DSP" },
    { key: "transient", label: "TRANSIENT", scope: "deck", group: "DSP" },
    { key: "multiband", label: "MULTI-BAND", scope: "deck", group: "DSP" },
  ];

  // Stable callback so the memoized MediaLibrary isn't re-rendered (and its rows
  // remounted) by the 60fps `tick` loop — remounting mid-click was cancelling
  // real mouse clicks on the delete / send-to-deck buttons.
  const bumpTick = useCallback(() => setTick((t) => t + 1), []);

  // bumped whenever a deck probes/finishes a stem separation, so the (memoized)
  // MediaLibrary re-fetches the cached-hash set and re-badges its rows.
  const [stemRefresh, setStemRefresh] = useState(0);
  const bumpStems = useCallback(() => setStemRefresh((n) => n + 1), []);

  // bumped when a deck writes to the library (save-to-playlist) so the memoized
  // MediaLibrary reloads its in-memory copy from localStorage.
  const [libRefresh, setLibRefresh] = useState(0);
  const bumpLib = useCallback(() => setLibRefresh((n) => n + 1), []);

  // a deck hands its YouTube source off to the converter
  function sendToConverter(link: string) {
    setConvLink(link);
    setConvFlash((n) => n + 1);
  }

  // live mirror of `crossfade` — the position watcher runs in a setInterval
  // whose closure would otherwise see a stale value from whenever the effect
  // last (re)ran, not the current fader position.
  const crossfadeRef = useRef(crossfade);
  crossfadeRef.current = crossfade;

  function stopAuto() {
    autoArmedRef.current = false;
    setAutoArmed(false);
    if (autoRaf.current !== null) cancelAnimationFrame(autoRaf.current);
    autoRaf.current = null;
    setAutoRunning(false);
  }

  // the crossfade sweep animation itself, from `from` toward the opposite side
  function runAutoSweep(from: number, secs: number) {
    const eng = engineRef.current;
    if (!eng || autoRaf.current !== null) return; // a sweep is already in flight
    const to = from < 0.5 ? 1 : 0;
    // the deck we're fading TOWARD (to=1 → B, to=0 → A) and the one we're leaving.
    const target = to === 1 ? eng.deckB : eng.deckA;
    const source = to === 1 ? eng.deckA : eng.deckB;
    // If the incoming deck has a track but isn't playing yet, start it so the
    // single is live for the blend.
    if (target.name && !target.playing) {
      eng.resume(); // make sure the audio context is awake
      target.play();
    }
    // Optional: progressively glide the INCOMING deck's tempo onto the outgoing
    // deck's BPM, finishing right as the crossfade completes (beat-matched mix).
    let tempoFromPct = 0;
    let tempoToPct = 0;
    const tempoAlign = autoFadeSync && !!target.bpm && !!source.effectiveBPM;
    if (tempoAlign) {
      tempoFromPct = target.pitchPct;
      tempoToPct = Math.max(-50, Math.min(50, (source.effectiveBPM / target.bpm - 1) * 100));
    }
    const t0 = performance.now();
    const ms = Math.max(0.2, secs) * 1000;
    setAutoRunning(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      // ease-in-out for a musical blend
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const v = from + (to - from) * e;
      setCrossfade(v);
      eng.setCrossfade(v);
      if (tempoAlign) {
        target.setPitch(tempoFromPct + (tempoToPct - tempoFromPct) * e);
      }
      if (p < 1) {
        autoRaf.current = requestAnimationFrame(step);
      } else {
        autoRaf.current = null;
        setAutoRunning(false);
      }
    };
    autoRaf.current = requestAnimationFrame(step);
  }

  // arm/disarm Auto-fade. While armed, a watcher (below) checks whichever
  // deck the crossfader currently favors and swaps to the other one `autoDur`
  // seconds before that track ends — same idea as the Playlist relay, but for
  // two manually-loaded singles instead of a queued set.
  const autoArmedRef = useRef(false);
  function toggleAutoArm() {
    const next = !autoArmedRef.current;
    autoArmedRef.current = next;
    setAutoArmed(next);
    if (!next && autoRaf.current !== null) {
      cancelAnimationFrame(autoRaf.current);
      autoRaf.current = null;
      setAutoRunning(false);
    }
  }
  // double-click: force the switch right now, regardless of position
  function forceAutoSwitch() {
    runAutoSweep(crossfadeRef.current, autoDur);
  }
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!autoArmedRef.current || autoRaf.current !== null) return;
      const eng = engineRef.current;
      if (!eng) return;
      const fg = crossfadeRef.current < 0.5 ? "A" : "B";
      const deck = fg === "A" ? eng.deckA : eng.deckB;
      if (!deck.playing || deck.duration <= 0) return;
      const remain = deck.duration - deck.position();
      if (remain > autoDur + 0.3) return;
      runAutoSweep(crossfadeRef.current, Math.min(autoDur, Math.max(2, remain)));
    }, 300);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDur, autoFadeSync]);

  function panic() {
    engineRef.current?.panic();
    stopAuto();
    setMaster(0.9);
    setCrossfade(0.5);
    setResetKey((k) => k + 1); // remount decks + synth so their local state re-reads defaults
  }

  // 🔊 SON: reliably bring the audio back when it's stuck for good. A wedged
  // AudioContext (e.g. a sample-rate change after switching output device) often
  // still reports "running" while playing to nothing, so resume()/setSinkId()
  // can't be trusted — we rebuild the whole engine on a FRESH AudioContext,
  // carrying the loaded tracks + mixer/FX across. Same effect as restarting the
  // app, without a page reload.
  const [recovering, setRecovering] = useState(false);
  const recoveringRef = useRef(false); // gesture-independent re-entry guard (engine can call this)
  const recoverSound = useCallback(async () => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    setRecovering(true);
    try {
      stopAuto();
      const next = await rebuildEngine();
      next.onFatalSilence = () => { void recoverSound(); }; // keep auto-heal wired on the new engine
      engineRef.current = next;
      attachBackgroundAudio(next); // fresh engine = fresh MediaStream, re-attach
      setCrossfade(0.5);
      setMaster(next.getMaster());
      setResetKey((k) => k + 1); // remount every panel onto the new decks
    } finally {
      recoveringRef.current = false;
      setRecovering(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Save State: persist the whole mix (both decks + all params + crossfader
  // + master) to disk so it can be restored after closing the session.
  const [stateBusy, setStateBusy] = useState<"" | "save" | "load">("");
  const [stateFlash, setStateFlash] = useState("");
  const [savedExists, setSavedExists] = useState(false);
  useEffect(() => {
    setSavedExists(hasSavedState());
  }, [ready]);
  function flashState(m: string) {
    setStateFlash(m);
    setTimeout(() => setStateFlash((c) => (c === m ? "" : c)), 2200);
  }
  async function saveState() {
    const eng = engineRef.current;
    if (!eng || stateBusy) return;
    setStateBusy("save");
    try {
      await saveEngineState(eng);
      setSavedExists(true);
      flashState("État sauvegardé ✓");
    } catch {
      flashState("Échec sauvegarde");
    } finally {
      setStateBusy("");
    }
  }
  async function restoreState() {
    const eng = engineRef.current;
    if (!eng || stateBusy) return;
    setStateBusy("load");
    try {
      stopAuto();
      const ok = await loadEngineState(eng);
      if (ok) {
        // the saved state doesn't include the per-deck POWER mute (that's
        // DeckPanel-local UI state, not part of the mix) — but resetKey below
        // remounts the panels, which resets their POWER toggle display back to
        // "on" regardless. Without this, a deck muted (volume 0) via POWER
        // before saving/restoring would silently stay muted while its panel
        // looks perfectly normal — audible only as "no sound, nothing wrong
        // on screen".
        eng.deckA.setVolume(1);
        eng.deckB.setVolume(1);
        setCrossfade(eng.getCrossfade());
        setMaster(eng.getMaster());
        setResetKey((k) => k + 1); // remount panels onto the restored decks
        flashState("État restauré ✓");
      } else {
        flashState("Aucun état sauvegardé");
      }
    } catch {
      flashState("Échec restauration");
    } finally {
      setStateBusy("");
    }
  }

  function normalizeLevels() {
    const eng = engineRef.current;
    if (!eng) return;
    // Loudness proxy: average of top-10% waveform peaks (stable across the whole track).
    // Falls back to live level if the buffer isn't decoded yet.
    function loudness(peaks: Float32Array, liveLevel: number): number {
      if (peaks.length === 0) return liveLevel;
      const sorted = Float32Array.from(peaks).sort();
      const topStart = Math.floor(sorted.length * 0.9);
      let sum = 0;
      for (let i = topStart; i < sorted.length; i++) sum += sorted[i];
      return sum / (sorted.length - topStart);
    }
    const lA = loudness(eng.deckA.peaks, eng.deckA.getLevel());
    const lB = loudness(eng.deckB.peaks, eng.deckB.getLevel());
    if (lA < 0.001 || lB < 0.001) return; // at least one deck silent/empty
    const tA = eng.deckA.trimValue;
    const tB = eng.deckB.trimValue;
    // Meet in the middle: both decks get trim so their effective level equals the average
    const target = (lA * tA + lB * tB) / 2;
    const newA = Math.min(4, Math.max(0.05, target / lA));
    const newB = Math.min(4, Math.max(0.05, target / lB));
    eng.deckA.setTrim(newA);
    eng.deckB.setTrim(newB);
    setNormTrimA(newA);
    setNormTrimB(newB);
    setNormFlash(true);
    setTimeout(() => setNormFlash(false), 600);
  }

  function init() {
    if (!engineRef.current) {
      const eng = getEngine();
      eng.onFatalSilence = () => { void recoverSound(); }; // let the engine self-heal silence
      engineRef.current = eng;
      setReady(true);
      // iPhone mode used to auto-close Deck B here to save width — dropped:
      // a deck vanishing right after launch, with no visible cue why, read as
      // broken rather than a space-saving feature. Both decks now start open
      // in every mode; the ✕ close button (added for this) is still there
      // for whoever wants to close one deliberately.
      attachBackgroundAudio(eng);
    }
    engineRef.current.resume();
  }

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // load saved config (YouTube video tool is hidden unless enabled)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("djsynth.config.v1");
      if (raw) setShowYouTube(!!JSON.parse(raw).showYouTube);
    } catch {
      /* ignore */
    }
  }, []);
  function toggleYouTube() {
    setShowYouTube((v) => {
      const next = !v;
      try {
        localStorage.setItem("djsynth.config.v1", JSON.stringify({ showYouTube: next }));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // clear the converter highlight a moment after a deck pushes a track in
  useEffect(() => {
    if (!convFlash) return;
    const t = setTimeout(() => setConvFlash(0), 1200);
    return () => clearTimeout(t);
  }, [convFlash]);

  // bring the audio back automatically when the tab/window regains focus —
  // the OS often suspends the AudioContext while we're in the background.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") engineRef.current?.resume();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);

  // Screen Wake Lock: stop iOS/Android from auto-locking the screen while the
  // console is running, so playback never gets backgrounded/suspended in the
  // first place. Honest limits: this only prevents the AUTO-lock timeout —
  // it can't stop the user manually pressing the side button, and there is
  // no web API to keep audio running once iOS Safari actually backgrounds a
  // tab (that needs a native app). The wake lock itself is also released by
  // the OS whenever the tab goes hidden, so it's re-requested on return.
  useEffect(() => {
    if (!ready || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        /* denied / unsupported in this context — playback still works, screen may just sleep */
      }
    };
    acquire();
    const reacquire = () => {
      if (!cancelled && document.visibilityState === "visible" && !sentinel) acquire();
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", reacquire);
      sentinel?.release().catch(() => {});
    };
  }, [ready]);

  // double-click the "metal" of a zone (deck, FX, synth, pad, boss) to pop it to
  // the centre, magnified; double-click again (or press Esc) to put it back.
  useEffect(() => {
    const clearZoom = () => {
      document.querySelectorAll(".zoom-zone.zoomed").forEach((z) => z.classList.remove("zoomed"));
      document.body.classList.remove("has-zoom");
    };
    const onDbl = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // ignore double-clicks on controls — only the chassis/metal zooms
      if (t.closest("input, button, select, textarea, a, canvas, .dj-fader, [data-no-zoom]")) return;
      const zone = t.closest<HTMLElement>(".zoom-zone");
      if (!zone) {
        if (document.body.classList.contains("has-zoom")) clearZoom();
        return;
      }
      const already = zone.classList.contains("zoomed");
      clearZoom();
      if (!already) {
        zone.classList.add("zoomed");
        document.body.classList.add("has-zoom");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearZoom();
    };
    document.addEventListener("dblclick", onDbl);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("dblclick", onDbl);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const engine = engineRef.current;

  return (
    <main className="hw-body min-h-screen p-4 text-neutral-100">
      {/* silent mirror of the master mix — keeps iOS Safari from suspending
          playback in the background, see attachBackgroundAudio() above */}
      <audio ref={bgAudioRef} playsInline className="hidden" />
      {splash && <Splash onDone={dismissSplash} />}
      <header className="hw-screwed hw-panel mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <h1 className="text-xl font-black tracking-tight">
          <span className="hw-led text-[#ffcc00]">DJ</span>
          <span className="hw-led text-[#ffcc00]">Synth</span>
          <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500">
            performance controller
          </span>
        </h1>
        {ready && (
          // horizontal scroll instead of overflow-hidden: on an iPhone-width
          // screen the 4 view buttons don't all fit, and clipping them would
          // make some views unreachable — swipe to see the rest instead.
          <div className="flex max-w-full overflow-x-auto rounded-lg ring-1 ring-white/10">
            <button
              onClick={() => setView("console")}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-bold ${view === "console" ? "hw-btn-on" : "text-neutral-400"}`}
              style={{ ["--led" as string]: "#ffcc00" }}
              title="Le contrôleur DJ complet (decks, mixer, synthé, pads)"
            >
              🎛 Console
            </button>
            <button
              onClick={() => setView("studio")}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-bold ${view === "studio" ? "hw-btn-on" : "text-neutral-400"}`}
              style={{ ["--led" as string]: "#e879f9" }}
              title="Écoute, analyse (BPM/beats/fréquences), playlists, base de données et Auto-IA"
            >
              🎧 Écoute
            </button>
            <button
              onClick={() => { setView("platine"); setShowLibrary(false); }}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-bold ${view === "platine" ? "hw-btn-on" : "text-neutral-400"}`}
              style={{ ["--led" as string]: "#ffcc00" }}
              title="Deux platines vinyles qui tournent : crossfade, Autofade et Autoplay pour un mix live simple"
            >
              💿 Platine
            </button>
            <button
              onClick={() => setView("playlist")}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-bold ${view === "playlist" ? "hw-btn-on" : "text-neutral-400"}`}
              style={{ ["--led" as string]: "#a78bfa" }}
              title="Crée et enchaîne des playlists : recherche à gauche, set à droite, choix du deck, BPM"
            >
              🎚 Playlist
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <LcdClock />
          {ready && engine && (
            <DeckTimers deckA={engine.deckA} deckB={engine.deckB} colorA="#ffcc00" colorB="#ffcc00" />
          )}
          {ready && (
            <button
              onClick={recoverSound}
              disabled={recovering}
              className="hw-btn px-3 py-2 text-sm disabled:opacity-50"
              style={{ ["--led" as string]: "#38bdf8", color: "#38bdf8" }}
              title="Le son a coupé et rien ne le rétablit ? Recrée le moteur audio (nouveau contexte) en gardant tes morceaux — l'équivalent d'un redémarrage, sans recharger la page"
            >
              {recovering ? "SON…" : "↻ SON"}
            </button>
          )}
          {ready && (
            <div className="flex items-center gap-1">
              <button
                onClick={saveState}
                disabled={!!stateBusy}
                className="hw-btn px-3 py-2 text-sm disabled:opacity-50"
                style={{ ["--led" as string]: "#facc15", color: "#facc15" }}
                title="Sauvegarder l'état complet (decks A & B, réglages, crossfader, master) pour le retrouver à la prochaine session"
              >
                {stateBusy === "save" ? "SAVE…" : "↧ SAVE"}
              </button>
              {savedExists && (
                <button
                  onClick={restoreState}
                  disabled={!!stateBusy}
                  className="hw-btn px-3 py-2 text-sm disabled:opacity-50"
                  style={{ ["--led" as string]: "#facc15", color: "#facc15" }}
                  title="Restaurer le dernier état sauvegardé (recharge les morceaux et tous les réglages)"
                >
                  {stateBusy === "load" ? "ÉTAT…" : "↥ ÉTAT"}
                </button>
              )}
              {stateFlash && (
                <span className="text-[10px] font-bold text-[#facc15]">{stateFlash}</span>
              )}
            </div>
          )}
          {ready && (
            <button
              onClick={panic}
              className="hw-panic"
              title="Tout remettre à zéro (garde les morceaux chargés)"
            >
              PANIC
            </button>
          )}
          {ready && view !== "platine" && (
            <button
              onClick={() => setShowLibrary(true)}
              className="hw-btn hw-btn-on px-4 py-2 text-sm"
              style={{ ["--led" as string]: "#ffcc00" }}
            >
              ♫ Bibliothèque
            </button>
          )}
          {ready && (
            <div className="relative">
              <button
                onClick={() => setShowModulePicker((v) => !v)}
                className={`hw-btn px-3 py-2 text-sm ${showModulePicker ? "hw-btn-on" : "text-neutral-300"}`}
                style={{ ["--led" as string]: "#ffcc00" }}
                title="Ajouter / retirer des modules"
              >
                ⊕ Modules
              </button>
              {showModulePicker && (
                <div className="hw-panel absolute right-0 top-full z-50 mt-2 w-56 p-3 text-sm">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Modules optionnels</div>
                  {MODULE_DEFS.map(({ key, label, scope }) => (
                    <label key={key} className="flex cursor-pointer items-center justify-between gap-2 py-1">
                      <span className="text-[11px] text-neutral-300">{label}</span>
                      <span className="text-[8px] text-neutral-600 capitalize">{scope}</span>
                      <button
                        onClick={() => toggleModule(key)}
                        className={`hw-btn px-2 py-0.5 text-[10px] ${modules[key] ? "hw-btn-on" : "text-neutral-500"}`}
                        style={{ ["--led" as string]: "#ffcc00" }}
                      >
                        {modules[key] ? "ON" : "OFF"}
                      </button>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {ready && (
            <div className="relative">
              <button
                onClick={() => setShowConfig((c) => !c)}
                className={`hw-btn px-3 py-2 text-sm ${showConfig ? "hw-btn-on" : "text-neutral-300"}`}
                style={{ ["--led" as string]: "#a78bfa" }}
                title="Configuration"
              >
                ⚙ Config
              </button>
              {showConfig && (
                <div className="hw-panel absolute right-0 top-full z-50 mt-2 w-64 p-3 text-sm">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Configuration
                  </div>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-neutral-200">
                      Outil YouTube (vidéos) en bas
                    </span>
                    <button
                      onClick={toggleYouTube}
                      className={`hw-btn px-2 py-1 text-xs ${showYouTube ? "hw-btn-on" : "text-neutral-400"}`}
                      style={{ ["--led" as string]: "#ef4444" }}
                    >
                      {showYouTube ? "ON" : "OFF"}
                    </button>
                  </label>
                </div>
              )}
            </div>
          )}
          {!ready && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-lg ring-1 ring-white/10">
                <button
                  onClick={() => chooseDeviceMode("desktop")}
                  className={`px-3 py-1.5 text-xs font-bold ${deviceMode === "desktop" ? "hw-btn-on" : "text-neutral-400"}`}
                  style={{ ["--led" as string]: "#ffcc00" }}
                  title="Console complète, les deux decks côte à côte"
                >
                  💻 PC / iPad
                </button>
                <button
                  onClick={() => chooseDeviceMode("iphone")}
                  className={`px-3 py-1.5 text-xs font-bold ${deviceMode === "iphone" ? "hw-btn-on" : "text-neutral-400"}`}
                  style={{ ["--led" as string]: "#ffcc00" }}
                  title="Démarre avec un seul deck affiché — tient sans défilement horizontal sur iPhone"
                >
                  📱 iPhone
                </button>
              </div>
              <button
                onClick={init}
                className="hw-btn hw-btn-on px-4 py-2 text-sm"
                style={{ ["--led" as string]: "#ffcc00" }}
              >
                ⏻ Démarrer l&apos;audio
              </button>
            </div>
          )}
        </div>
      </header>

      {ready && engine && showLibrary && view !== "platine" && (
        <LibraryPanel
          engine={engine}
          onClose={() => setShowLibrary(false)}
          onLoaded={() => setTick((t) => t + 1)}
        />
      )}

      {!ready ? (
        <div className="flex h-[60vh] items-center justify-center text-center text-neutral-500">
          <div>
            <p className="text-lg">Clique sur « Démarrer l&apos;audio »</p>
            <p className="text-sm">
              puis charge un fichier sur chaque deck (le navigateur exige un geste pour activer le
              son).
            </p>
          </div>
        </div>
      ) : (
        engine && (view === "platine" ? (
          <PlatineView engine={engine} />
        ) : view === "studio" ? (
          <StudioView
            engine={engine}
            onLoaded={bumpTick}
            stemRefresh={stemRefresh}
            libRefresh={libRefresh}
          />
        ) : view === "playlist" ? (
          <MediaLibrary
            engine={engine}
            onLoaded={bumpTick}
            stemRefresh={stemRefresh}
            libRefresh={libRefresh}
            splitLayout
          />
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 ${
              deckClosed.A ? "lg:grid-cols-[auto_1fr]" : deckClosed.B ? "lg:grid-cols-[1fr_auto]" : "lg:grid-cols-[1fr_auto_1fr]"
            }`}
          >
            {/* Edjay-style master screen: both tracks' spectra blended live */}
            <div
              className={`zoom-zone hw-screwed hw-panel flex items-stretch gap-3 p-3 ${
                deckClosed.A || deckClosed.B ? "lg:col-span-2" : "lg:col-span-3"
              }`}
            >
              <div className="min-w-0 flex-1">
                <MixScope
                  deckA={engine.deckA}
                  deckB={engine.deckB}
                  colorA="#ffcc00"
                  colorB="#ffcc00"
                  crossfade={crossfade}
                  onCrossfade={(v) => {
                    stopAuto();
                    setCrossfade(v);
                    engine.setCrossfade(v);
                  }}
                />
              </div>
              <CpuMeter engine={engine} />
            </div>

            {!deckClosed.A && (
            <DeckPanel
              key={`A-${resetKey}`}
              deck={engine.deckA}
              side="A"
              color="#ffcc00"
              tick={tick}
              onClose={() => toggleDeckClosed("A")}
              onLoaded={() => setTick((t) => t + 1)}
              onSync={() => engine.sync("A")}
              onSendToConverter={sendToConverter}
              otherBpm={() => engine.deckB.effectiveBPM}
              onStems={bumpStems}
              onLibraryChange={bumpLib}
              forceTrim={normTrimA}
              activeModules={{
                eq: modules.eq,
                fxpad: modules.fxpad,
                loudness: modules.loudness,
                surround: modules.surround,
                exciter: modules.exciter,
                transient: modules.transient,
                multiband: modules.multiband,
                comp: modules.comp,
                drive: modules.drive,
                wavefold: modules.wavefold,
                crush: modules.crush,
                robot: modules.robot,
                ringmod: modules.ringmod,
                voyelle: modules.voyelle,
                isolator: modules.isolator,
                autowah: modules.autowah,
                resonator: modules.resonator,
                gate: modules.gate,
                glitch: modules.glitch,
                shimmer: modules.shimmer,
                delay: modules.delay,
                reverb: modules.reverb,
                limiter: modules.limiter,
                autotune: modules.autotune,
              }}
            />
            )}

            <div className="hw-screwed hw-panel flex flex-col items-center justify-between gap-4 p-4 lg:w-52">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
                Mixer
              </span>
              {/* reopen a fully-closed deck — always at least one stays visible */}
              {(deckClosed.A || deckClosed.B) && (
                <div className="flex w-full gap-1.5">
                  {deckClosed.A && (
                    <button
                      onClick={() => toggleDeckClosed("A")}
                      className="hw-btn flex-1 px-2 py-1 text-[10px] font-bold"
                      style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                      title="Rouvrir le Deck A"
                    >
                      + Deck A
                    </button>
                  )}
                  {deckClosed.B && (
                    <button
                      onClick={() => toggleDeckClosed("B")}
                      className="hw-btn flex-1 px-2 py-1 text-[10px] font-bold"
                      style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                      title="Rouvrir le Deck B"
                    >
                      + Deck B
                    </button>
                  )}
                </div>
              )}
              <div className="hw-recess flex flex-col items-center gap-2 px-4 py-3">
                <span className="hw-led text-[10px] uppercase text-amber-400">Master</span>
                <Fader
                  value={master}
                  min={0}
                  max={1}
                  onChange={(v) => {
                    setMaster(v);
                    engine.setMaster(v);
                  }}
                  className="w-32"
                />
              </div>

              {/* Normalize: match the gain of both decks */}
              <button
                onClick={normalizeLevels}
                className={`hw-btn w-full px-3 py-2 text-[11px] font-bold tracking-widest ${normFlash ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: "#ffcc00" }}
                title="Égalise automatiquement le volume des deux decks (ajuste le GAIN)"
              >
                ⊜ NORMALIZE
              </button>

              <div className="flex w-full flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Crossfader
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={crossfade}
                  onChange={(e) => {
                    stopAuto();
                    const v = parseFloat(e.target.value);
                    setCrossfade(v);
                    engine.setCrossfade(v);
                  }}
                  className="dj-fader w-full"
                />
                <div className="flex w-full justify-between text-xs font-black">
                  <span className="hw-led text-[#ffcc00]">A</span>
                  <span className="hw-led text-[#ffcc00]">B</span>
                </div>

                {/* automatic progressive crossfade */}
                <div className="mt-1 flex w-full items-center gap-1.5">
                  <button
                    onClick={toggleAutoArm}
                    onDoubleClick={forceAutoSwitch}
                    className={`hw-btn flex-1 px-2 py-1 text-[11px] ${autoArmed ? "hw-btn-on" : "text-amber-300"}`}
                    style={{ ["--led" as string]: "#ffcc00" }}
                    title={`Bascule automatiquement vers l'autre platine ${autoDur}s avant la fin du morceau en cours — double-clic pour forcer maintenant`}
                  >
                    {autoRunning ? "⇄ Transition…" : autoArmed ? "⏳ Auto-fade armé" : "⇄ Auto-fade"}
                  </button>
                  <button
                    onClick={() => setAutoFadeSync((s) => !s)}
                    className={`hw-btn flex-1 px-2 py-1 text-[11px] ${autoFadeSync ? "hw-btn-on" : "text-neutral-300"}`}
                    style={{ ["--led" as string]: "#ffcc00" }}
                    title="Aligner aussi le tempo : la platine entrante glisse progressivement sur le BPM de l'autre pendant le fondu"
                  >
                    ♪ BPM
                  </button>
                  <button
                    onClick={() => setAutoDur((d) => (d >= 16 ? 4 : d * 2))}
                    className="hw-btn px-2 py-1 text-[11px] text-neutral-300"
                    title="Déclenche le fondu N secondes avant la fin du morceau (aussi la durée du fondu)"
                  >
                    {autoDur}s
                  </button>
                </div>
              </div>

              {/* vertical BOSS master-FX / metering unit tucked under the mixer */}
              {modules.boss && <BossFxPanel engine={engine} tick={tick} />}

              {/* YouTube → MP3 converter, placed right under the effects unit */}
              <Mp3Converter link={convLink} onLinkChange={setConvLink} flash={convFlash} />

              {/* Stems → MIDI: separate + transcribe a track to one multi-track MIDI */}
              <StemsMidiConverter />
            </div>

            {!deckClosed.B && (
            <DeckPanel
              key={`B-${resetKey}`}
              deck={engine.deckB}
              side="B"
              color="#ffcc00"
              tick={tick}
              onClose={() => toggleDeckClosed("B")}
              onLoaded={() => setTick((t) => t + 1)}
              onSync={() => engine.sync("B")}
              onSendToConverter={sendToConverter}
              otherBpm={() => engine.deckA.effectiveBPM}
              onStems={bumpStems}
              onLibraryChange={bumpLib}
              forceTrim={normTrimB}
              activeModules={{
                eq: modules.eq,
                fxpad: modules.fxpad,
                loudness: modules.loudness,
                surround: modules.surround,
                exciter: modules.exciter,
                transient: modules.transient,
                multiband: modules.multiband,
                comp: modules.comp,
                drive: modules.drive,
                wavefold: modules.wavefold,
                crush: modules.crush,
                robot: modules.robot,
                ringmod: modules.ringmod,
                voyelle: modules.voyelle,
                isolator: modules.isolator,
                autowah: modules.autowah,
                resonator: modules.resonator,
                gate: modules.gate,
                glitch: modules.glitch,
                shimmer: modules.shimmer,
                delay: modules.delay,
                reverb: modules.reverb,
                limiter: modules.limiter,
                autotune: modules.autotune,
              }}
            />
            )}

            {/* DX7 synth + sampler — full-width connectable module */}
            {modules.dx7 && (
              <div className={deckClosed.A || deckClosed.B ? "lg:col-span-2" : "lg:col-span-3"}>
                <DX7Synth key={`dx7-${resetKey}`} engine={engine} embedded />
              </div>
            )}

            {/* Solar 42F drone ambient machine — full-width connectable module */}
            {modules.solar42 && (
              <div className={deckClosed.A || deckClosed.B ? "lg:col-span-2" : "lg:col-span-3"}>
                <Solar42F key={`solar42-${resetKey}`} engine={engine} embedded />
              </div>
            )}

            <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${deckClosed.A || deckClosed.B ? "lg:col-span-2" : "lg:col-span-3"}`}>
              {/* left column: Synth on top, media database docked beneath it */}
              <div className="flex flex-col gap-4">
                {modules.synth && <SynthPanel key={`synth-${resetKey}`} engine={engine} />}
                <MediaLibrary
                  engine={engine}
                  onLoaded={bumpTick}
                  stemRefresh={stemRefresh}
                  libRefresh={libRefresh}
                />
              </div>
              {/* right column: optional Pads + sound-effects bank */}
              {(modules.sampler || modules.soundfx) && (
                <div className="flex flex-col gap-4">
                  {modules.sampler && <SamplerPanel engine={engine} />}
                  {modules.soundfx && <SoundFxPanel engine={engine} />}
                </div>
              )}
            </div>

            {/* optional video tool — toggled in Config (⚙) */}
            {showYouTube && <YouTubeDeck />}
          </div>
        ))
      )}

      <footer className="mt-6 text-center text-xs text-neutral-600">
        MVP+ — prochaines étapes : synthé sur la chanson, sources Audius, séparation de stems.
      </footer>
    </main>
  );
}
