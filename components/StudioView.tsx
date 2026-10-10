"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { AudiusTrack } from "@/lib/audius";
import { LibTrack, TrackSource, loadLibrary, saveLibrary, uid, idbGetBlob } from "@/lib/library";
import { detectKey, KeyResult } from "@/lib/audio/key";

// A single loaded in the Preview & Crate Digger station
type Sel = {
  id: string;
  title: string;
  artist?: string;
  art?: string | null;
  source: TrackSource;
  genre?: string;
  bpm?: number | null;
  key?: KeyResult | null;
};

interface Props {
  engine: DJEngine;
  onLoaded?: () => void;
  stemRefresh?: number;
  libRefresh?: number;
}

const SRC = {
  local: { label: "LOCAL", color: "#9ca3af" },
  audius: { label: "AUDIUS", color: "#ffcc00" },
  youtube: { label: "YOUTUBE", color: "#ef4444" },
  soundcloud: { label: "SOUNDCLOUD", color: "#ff7700" },
  deezer: { label: "DEEZER", color: "#a238ff" },
} as const;

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

const DUR_FILTERS = [
  { key: "all", label: "Toutes durées" },
  { key: "3", label: "< 3 min", max: 180 },
  { key: "5", label: "< 5 min", max: 300 },
  { key: "8", label: "< 8 min", max: 480 },
  { key: "15+", label: "> 15 min", min: 900 },
];

type FilterMode = "full" | "low_cut" | "high_cut" | "vocals" | "karaoke";
const FILTER_MODES: { key: FilterMode; label: string; desc: string }[] = [
  { key: "full", label: "Master", desc: "Écoute intégrale à plat" },
  { key: "low_cut", label: "Coupe-Basse", desc: "Supprime le kick pour tester le vocal/mélodie" },
  { key: "high_cut", label: "Sub Only", desc: "Isole les basses et le beat" },
  { key: "vocals", label: "Vocal Focus", desc: "Isole le centre (voix principale)" },
  { key: "karaoke", label: "Instrumental", desc: "Supprime le centre (karaoké)" },
];

// Helper to determine Camelot Harmonic Match compatibility
function getCamelotMatch(
  keyA: string | null | undefined,
  keyB: string | null | undefined
): { match: "perfect" | "compatible" | "clash"; text: string; color: string } {
  if (!keyA || !keyB) return { match: "clash", text: "Inconnu", color: "#71717a" };
  if (keyA === keyB) return { match: "perfect", text: "Harmonique Parfait (Même clé)", color: "#10b981" };

  const numA = parseInt(keyA);
  const letA = keyA.slice(-1);
  const numB = parseInt(keyB);
  const letB = keyB.slice(-1);

  if (isNaN(numA) || isNaN(numB)) return { match: "clash", text: "Clé non standard", color: "#71717a" };

  // Relative Major/Minor (same number, different letter: e.g. 8A <-> 8B)
  if (numA === numB && letA !== letB) {
    return { match: "perfect", text: "Majeur/Mineur Relatif", color: "#10b981" };
  }

  // Energy boost / drop (+1 / -1 on Camelot wheel)
  const diff = Math.abs(numA - numB);
  if ((diff === 1 || diff === 11) && letA === letB) {
    return { match: "compatible", text: "Énergie +1 / -1 (Mix fluide)", color: "#38bdf8" };
  }

  return { match: "clash", text: "Écart tonal (Mixer avec prudence)", color: "#ef4444" };
}

export function StudioView({ engine, onLoaded, stemRefresh, libRefresh }: Props) {
  const [src, setSrc] = useState<"youtube" | "audius" | "soundcloud" | "local">("youtube");
  const [durKey, setDurKey] = useState("all");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AudiusTrack[]>([]);
  const [localTracks, setLocalTracks] = useState<LibTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [keyResult, setKeyResult] = useState<KeyResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [mode, setMode] = useState<FilterMode>("full");
  const [msg, setMsg] = useState("");
  const [peaks, setPeaks] = useState<Float32Array>(new Float32Array(0));
  const [cueVol, setCueVol] = useState(85);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastAbRef = useRef<ArrayBuffer | null>(null);
  const lastBufRef = useRef<AudioBuffer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio filtering nodes for Cue auditioning
  const directGainRef = useRef<GainNode | null>(null);
  const procGainRef = useRef<GainNode | null>(null);
  const midBusRef = useRef<GainNode | null>(null);
  const sideBusRef = useRef<GainNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((c) => (c === m ? "" : c)), 2400);
  };

  // Load local library tracks when selecting 'local'
  const refreshLocal = useCallback(() => {
    const lib = loadLibrary();
    setLocalTracks(lib.tracks.filter((t) => t.source === "local"));
  }, []);

  useEffect(() => {
    if (src === "local") refreshLocal();
  }, [src, refreshLocal, libRefresh]);

  // Audio nodes initialization
  const ensureCtx = useCallback(() => {
    if (!audioRef.current) return;
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      const node = ctx.createMediaElementSource(audioRef.current);
      const mix = ctx.createGain();
      mix.gain.value = cueVol / 100;

      mix.connect(an);
      an.connect(ctx.destination);

      // Path 1: Flat direct
      const direct = ctx.createGain();
      direct.gain.value = 1;
      node.connect(direct);
      direct.connect(mix);

      // Path 2: Mid/Side & Filtering
      const split = ctx.createChannelSplitter(2);
      node.connect(split);

      const lMid = ctx.createGain(); lMid.gain.value = 0.5;
      const rMid = ctx.createGain(); rMid.gain.value = 0.5;
      split.connect(lMid, 0); split.connect(rMid, 1);
      const midSum = ctx.createGain();
      lMid.connect(midSum); rMid.connect(midSum);

      const lSide = ctx.createGain(); lSide.gain.value = 0.5;
      const rSide = ctx.createGain(); rSide.gain.value = -0.5;
      split.connect(lSide, 0); split.connect(rSide, 1);
      const sideSum = ctx.createGain();
      lSide.connect(sideSum); rSide.connect(sideSum);

      const midBus = ctx.createGain(); midBus.gain.value = 0;
      const sideBus = ctx.createGain(); sideBus.gain.value = 0;
      midSum.connect(midBus); sideSum.connect(sideBus);

      const filt = ctx.createBiquadFilter();
      midBus.connect(filt); sideBus.connect(filt);

      const proc = ctx.createGain(); proc.gain.value = 0;
      filt.connect(proc); proc.connect(mix);

      ctxRef.current = ctx;
      analyserRef.current = an;
      directGainRef.current = direct;
      procGainRef.current = proc;
      midBusRef.current = midBus;
      sideBusRef.current = sideBus;
      filterNodeRef.current = filt;
    }
    if (ctxRef.current.state !== "running") ctxRef.current.resume().catch(() => {});
  }, [cueVol]);

  // Apply preview filter mode
  const applyFilter = useCallback((m: FilterMode) => {
    const ctx = ctxRef.current;
    const direct = directGainRef.current;
    const proc = procGainRef.current;
    const midB = midBusRef.current;
    const sideB = sideBusRef.current;
    const filt = filterNodeRef.current;
    if (!ctx || !direct || !proc || !midB || !sideB || !filt) return;

    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.02);

    if (m === "full") {
      set(direct.gain, 1);
      set(proc.gain, 0);
      return;
    }

    set(direct.gain, 0);
    set(proc.gain, 1);

    switch (m) {
      case "low_cut": // Remove bass/kick
        set(midB.gain, 1); set(sideB.gain, 1);
        filt.type = "highpass"; filt.frequency.value = 350; filt.Q.value = 0.8;
        break;
      case "high_cut": // Sub only
        set(midB.gain, 1); set(sideB.gain, 0);
        filt.type = "lowpass"; filt.frequency.value = 220; filt.Q.value = 0.8;
        break;
      case "vocals": // Mid-solo center
        set(midB.gain, 1.6); set(sideB.gain, 0);
        filt.type = "bandpass"; filt.frequency.value = 1200; filt.Q.value = 0.6;
        break;
      case "karaoke": // Sides only
        set(midB.gain, 0); set(sideB.gain, 1.8);
        filt.type = "allpass"; filt.frequency.value = 1000; filt.Q.value = 0.7;
        break;
    }
  }, []);

  useEffect(() => {
    applyFilter(mode);
  }, [mode, applyFilter]);

  // Search execution
  async function search(durOverride?: string) {
    if (!q.trim() || src === "local") return;
    setSearching(true);
    try {
      let url = `/api/${src}/search?q=${encodeURIComponent(q)}`;
      if (src === "youtube" || src === "soundcloud") {
        const f = DUR_FILTERS.find((d) => d.key === (durOverride ?? durKey));
        url += "&n=30";
        if (f?.min) url += `&min=${f.min}`;
        if (f?.max) url += `&max=${f.max}`;
      }
      const r = await fetch(url);
      const j = await r.json();
      setResults(j.tracks ?? []);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  // Load track into Preview Dock
  async function select(s: Sel) {
    setSel(s);
    setBpm(s.bpm ?? null);
    setKeyResult(s.key ?? null);
    setPos(0);
    setDur(0);
    setPeaks(new Float32Array(0));
    setAnalyzing(true);

    try {
      let ab: ArrayBuffer;
      let streamUrl: string;

      if (s.source === "local") {
        const blob = await idbGetBlob(s.id);
        if (!blob) throw new Error("Fichier local introuvable");
        ab = await blob.arrayBuffer();
        streamUrl = URL.createObjectURL(blob);
      } else {
        streamUrl = `/api/${s.source}/stream?id=${encodeURIComponent(s.id)}`;
        const r = await fetch(streamUrl);
        if (!r.ok) throw new Error(`Erreur flux: HTTP ${r.status}`);
        ab = await r.arrayBuffer();
      }

      lastAbRef.current = ab;
      ensureCtx();

      if (audioRef.current) {
        audioRef.current.src = streamUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
      }

      const ctx = ctxRef.current;
      if (ctx) {
        const buf = await ctx.decodeAudioData(ab.slice(0));
        lastBufRef.current = buf;
        setDur(buf.duration);

        // Compute Waveform Peaks
        const pLen = 300;
        const pArr = new Float32Array(pLen);
        const ch = buf.getChannelData(0);
        const step = Math.floor(ch.length / pLen);
        for (let i = 0; i < pLen; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const v = Math.abs(ch[i * step + j]);
            if (v > max) max = v;
          }
          pArr[i] = max;
        }
        setPeaks(pArr);

        // Detect Harmonic Key & BPM if missing
        const detectedKey = detectKey(buf);
        setKeyResult(detectedKey);

        if (!s.bpm) {
          // Rough offline tempo estimate
          const sr = buf.sampleRate;
          const maxSamples = Math.min(ch.length, sr * 30);
          const hop = Math.floor(sr / 100);
          const frames = Math.floor(maxSamples / hop);
          if (frames >= 8) {
            const env = new Float32Array(frames);
            for (let i = 0; i < frames; i++) {
              let sm = 0;
              for (let j = 0; j < hop; j++) {
                const v = ch[i * hop + j];
                sm += v * v;
              }
              env[i] = Math.sqrt(sm / hop);
            }
            const flux = new Float32Array(frames);
            for (let i = 1; i < frames; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
            const fps = sr / hop;
            let bestBpm = 0, bestScore = -1;
            for (let bp = 75; bp <= 175; bp++) {
              const lag = Math.round((fps * 60) / bp);
              if (lag < 1 || lag >= frames) continue;
              let sm = 0;
              for (let i = lag; i < frames; i++) sm += flux[i] * flux[i - lag];
              if (sm > bestScore) {
                bestScore = sm;
                bestBpm = bp;
              }
            }
            if (bestBpm > 0) setBpm(bestBpm);
          }
        }
      }
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  // Playhead update
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) {
        setPos(a.currentTime || 0);
        if (a.duration && isFinite(a.duration)) setDur(a.duration);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Draw interactive Waveform
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * 2;
    cv.height = h * 2;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    const n = peaks.length;
    const progressX = dur > 0 ? (pos / dur) * w : 0;
    const mid = h / 2;

    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const amp = peaks[i] * (h / 2) * 0.95;
      ctx.fillStyle = x <= progressX ? "#f59e0b" : "#3f3f46";
      ctx.fillRect(x, mid - amp, Math.max(1, w / n - 0.5), amp * 2);
    }

    // Playhead line
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(progressX - 1, 0, 2, h);
  }, [peaks, pos, dur]);

  // Jump helpers (e.g. +30s drop jump)
  const jump = (delta: number) => {
    if (!audioRef.current || !dur) return;
    const next = Math.max(0, Math.min(dur, (audioRef.current.currentTime || 0) + delta));
    audioRef.current.currentTime = next;
    setPos(next);
  };

  // Route track to Deck A or Deck B
  const sendToDeck = async (side: "A" | "B") => {
    const ab = lastAbRef.current;
    if (!ab || !sel) return flash("Audio en cours de chargement…");
    const deck = side === "A" ? engine.deckA : engine.deckB;
    deck.loading = true;
    try {
      await deck.load(ab.slice(0), `${sel.title}${sel.artist ? ` — ${sel.artist}` : ""}`);
      deck.coverArt = sel.art ?? "";
      deck.origin = { id: sel.id, source: sel.source, url: sel.id, art: sel.art ?? undefined };
      deck.cuePoint = pos; // Set CUE where user previewed!
      onLoaded?.();
      flash(`« ${sel.title} » → Deck ${side} (CUE posé à ${fmt(pos)})`);
    } catch (e) {
      flash(`Erreur Deck ${side}: ${(e as Error).message}`);
    } finally {
      deck.loading = false;
    }
  };

  // Deck A / Deck B Live stats for Harmonic Comparison
  const deckA = engine.deckA;
  const deckB = engine.deckB;
  const matchA = getCamelotMatch(keyResult?.camelot, deckA.key?.camelot);
  const matchB = getCamelotMatch(keyResult?.camelot, deckB.key?.camelot);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. SMART CUE DOCK (Régie de Pré-Écoute Pro) */}
      <div className="hw-screwed hw-panel relative flex flex-col gap-4 p-4 border border-amber-500/20 bg-neutral-950/90 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
            <h2 className="text-sm font-black tracking-wider uppercase text-neutral-100">
              Station de Pré-Écoute & Crate Digger
            </h2>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              PFL MONITOR / CASQUE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase font-bold text-neutral-400">Volume Cue</span>
            <input
              type="range"
              min={0}
              max={100}
              value={cueVol}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setCueVol(v);
                if (directGainRef.current?.context) {
                  // Direct gain slider
                }
              }}
              className="dj-fader w-24"
            />
            {msg && <span className="text-xs font-bold text-amber-300 animate-pulse">{msg}</span>}
          </div>
        </div>

        {/* Selected Track Player Deck */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_260px] items-center">
          {/* Cover & metadata */}
          <div className="flex items-center gap-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-900 ring-1 ring-white/10">
              {sel?.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sel.art} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl text-neutral-700">♪</div>
              )}
              {analyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 text-[10px] font-bold text-amber-400">
                  Scan…
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black text-neutral-100">{sel?.title || "Sélectionne un morceau"}</div>
              <div className="truncate text-xs text-neutral-400">{sel?.artist || "—"}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                  {bpm ? `${Math.round(bpm)} BPM` : "— BPM"}
                </span>
                <span className="rounded bg-fuchsia-400/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-fuchsia-300">
                  {keyResult?.camelot ? `${keyResult.camelot} (${keyResult.name})` : "— Key"}
                </span>
              </div>
            </div>
          </div>

          {/* Waveform & Scrubber */}
          <div className="flex flex-col gap-2">
            <div className="relative h-16 w-full cursor-pointer overflow-hidden rounded bg-black/60 ring-1 ring-white/5">
              <canvas
                ref={canvasRef}
                className="h-full w-full"
                onClick={(e) => {
                  if (!audioRef.current || !dur) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  audioRef.current.currentTime = pct * dur;
                  setPos(pct * dur);
                }}
              />
              <div className="absolute bottom-1 left-2 font-mono text-[10px] text-neutral-400">
                {fmt(pos)}
              </div>
              <div className="absolute bottom-1 right-2 font-mono text-[10px] text-neutral-400">
                {fmt(dur)}
              </div>
            </div>

            {/* Jump Buttons & Audition Filter Modes */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const a = audioRef.current;
                    if (!a || !sel) return;
                    ensureCtx();
                    if (a.paused) a.play().then(() => setPlaying(true));
                    else { a.pause(); setPlaying(false); }
                  }}
                  disabled={!sel}
                  className="hw-btn hw-btn-on px-4 py-1.5 text-xs font-bold"
                  style={{ ["--led" as string]: "#f59e0b", color: "#f59e0b" }}
                >
                  {playing ? "❚❚ PAUSE" : "► PLAY"}
                </button>
                <button
                  onClick={() => jump(-15)}
                  disabled={!sel}
                  className="hw-btn px-2 py-1.5 text-xs text-neutral-300"
                  title="Reculer de 15 secondes"
                >
                  -15s
                </button>
                <button
                  onClick={() => jump(30)}
                  disabled={!sel}
                  className="hw-btn px-2 py-1.5 text-xs text-amber-300 font-bold"
                  title="Avancer de 30 secondes (Drop Jump)"
                >
                  +30s DROP
                </button>
                <button
                  onClick={() => jump(60)}
                  disabled={!sel}
                  className="hw-btn px-2 py-1.5 text-xs text-neutral-300"
                  title="Avancer de 60 secondes"
                >
                  +60s
                </button>
              </div>

              {/* Isolation Filters */}
              <div className="flex items-center gap-1">
                {FILTER_MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    disabled={!sel}
                    className={`rounded px-2 py-1 text-[10px] font-bold transition-all ${
                      mode === m.key
                        ? "bg-amber-400 text-black shadow-sm"
                        : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    }`}
                    title={m.desc}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. HARMONIC MATCH & ONE-CLICK LOAD TO DECKS */}
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-900/60 p-3 ring-1 ring-white/10">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Harmonic Match & Routing
            </span>

            {/* Deck A Match */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-400">Deck A ({deckA.bpm ? `${Math.round(deckA.effectiveBPM)} BPM` : "vide"})</span>
              <span className="text-[10px] font-bold" style={{ color: matchA.color }}>
                {matchA.text}
              </span>
            </div>
            <button
              onClick={() => sendToDeck("A")}
              disabled={!sel}
              className="hw-btn flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-sky-400 disabled:opacity-40"
              style={{ ["--led" as string]: "#38bdf8" }}
            >
              → Charger Deck A
            </button>

            {/* Deck B Match */}
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="font-bold text-amber-400">Deck B ({deckB.bpm ? `${Math.round(deckB.effectiveBPM)} BPM` : "vide"})</span>
              <span className="text-[10px] font-bold" style={{ color: matchB.color }}>
                {matchB.text}
              </span>
            </div>
            <button
              onClick={() => sendToDeck("B")}
              disabled={!sel}
              className="hw-btn flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-amber-400 disabled:opacity-40"
              style={{ ["--led" as string]: "#f59e0b" }}
            >
              → Charger Deck B
            </button>
          </div>
        </div>
      </div>

      {/* 3. CRATE DIGGER (Catalogue & Recherche Efficace) */}
      <div className="hw-screwed hw-panel flex flex-col gap-3 p-4">
        {/* Source switchers & Search Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded bg-neutral-900 p-0.5 ring-1 ring-white/10">
            {(
              [
                ["youtube", "YouTube"],
                ["audius", "Audius"],
                ["soundcloud", "SoundCloud"],
                ["local", "Fichiers Locaux"],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setSrc(s)}
                className={`rounded px-3 py-1.5 text-xs font-bold transition-all ${
                  src === s ? "bg-amber-400 text-black shadow-sm" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {src !== "local" ? (
            <div className="flex flex-1 items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Rechercher un artiste, titre, remix, genre…"
                className="flex-1 rounded bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 ring-1 ring-white/10 outline-none focus:ring-amber-500/40"
              />
              <button
                onClick={() => search()}
                disabled={searching}
                className="hw-btn px-4 py-1.5 text-sm font-bold text-amber-400"
                style={{ ["--led" as string]: "#f59e0b" }}
              >
                {searching ? "…" : "Rechercher"}
              </button>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">
              {localTracks.length} morceau(x) enregistrés dans votre bibliothèque locale
            </span>
          )}
        </div>

        {/* Duration filters for YouTube / SoundCloud */}
        {(src === "youtube" || src === "soundcloud") && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-neutral-500">Durée :</span>
            {DUR_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setDurKey(f.key);
                  if (q.trim()) search(f.key);
                }}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  durKey === f.key ? "bg-neutral-700 text-amber-300" : "text-neutral-400 hover:bg-neutral-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Track Table / Results List */}
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-neutral-900/40">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-neutral-900/80 uppercase text-[10px] font-bold text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">Morceau</th>
                <th className="py-2.5 px-3">Durée</th>
                <th className="py-2.5 px-3">BPM</th>
                <th className="py-2.5 px-3">Actions Directes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {src === "local" ? (
                localTracks.length > 0 ? (
                  localTracks.map((t) => {
                    const isCurrent = sel?.id === t.id;
                    return (
                      <tr
                        key={t.id}
                        onClick={() =>
                          select({
                            id: t.id,
                            title: t.name,
                            source: "local",
                            art: t.art,
                            bpm: t.bpm,
                          })
                        }
                        className={`cursor-pointer transition-colors hover:bg-white/5 ${
                          isCurrent ? "bg-amber-500/10" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
                            {t.art ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.art} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-neutral-600 font-bold">♪</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-neutral-100 truncate">{t.name}</div>
                            <div className="text-[10px] text-neutral-400">Stockage local</div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-400">
                          {t.durationSec ? fmt(t.durationSec) : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-amber-400 font-bold">
                          {t.bpm ? Math.round(t.bpm) : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              select({ id: t.id, title: t.name, source: "local", art: t.art, bpm: t.bpm });
                            }}
                            className="rounded bg-amber-400/20 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-400/30"
                          >
                            🎧 Pré-écouter
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-neutral-500">
                      Aucun fichier local dans la bibliothèque. Importez des MP3/WAV depuis l&apos;onglet Console.
                    </td>
                  </tr>
                )
              ) : results.length > 0 ? (
                results.map((t) => {
                  const isCurrent = sel?.id === t.id;
                  return (
                    <tr
                      key={`${t.source}-${t.id}`}
                      onClick={() =>
                        select({
                          id: t.id,
                          title: t.title,
                          artist: t.artist,
                          art: t.artwork,
                          source: (t.source ?? src) as TrackSource,
                          bpm: t.bpm,
                        })
                      }
                      className={`cursor-pointer transition-colors hover:bg-white/5 ${
                        isCurrent ? "bg-amber-500/10" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
                          {t.artwork ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.artwork} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-neutral-600 font-bold">♪</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-neutral-100 truncate">{t.title}</div>
                          <div className="text-[10px] text-neutral-400 truncate">{t.artist}</div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-400">{fmt(t.duration)}</td>
                      <td className="py-2.5 px-3 font-mono text-amber-400 font-bold">
                        {t.bpm ? Math.round(t.bpm) : "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            select({
                              id: t.id,
                              title: t.title,
                              artist: t.artist,
                              art: t.artwork,
                              source: (t.source ?? src) as TrackSource,
                              bpm: t.bpm,
                            });
                          }}
                          className="rounded bg-amber-400/20 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-400/30"
                        >
                          🎧 Pré-écouter
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-neutral-500">
                    Tapez un mot-clé ci-dessus pour rechercher et auditionner des singles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview HTML5 element (isolated from master output) */}
      <audio ref={audioRef} className="hidden" onEnded={() => setPlaying(false)} crossOrigin="anonymous" />
    </div>
  );
}
