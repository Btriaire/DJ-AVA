"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { AudiusTrack } from "@/lib/audius";
import { LibTrack, TrackSource, loadLibrary, saveLibrary, uid, idbGetBlob } from "@/lib/library";
import { MediaLibrary } from "./MediaLibrary";

// A "single" the listening view can preview + analyse, from any catalogue.
type Sel = {
  id: string; // audius track id, youtube video id, or local library id
  title: string;
  artist?: string;
  art?: string | null;
  source: TrackSource;
  genre?: string;
  bpm?: number | null;
};

interface Props {
  engine: DJEngine;
  onLoaded?: () => void;
  stemRefresh?: number;
  libRefresh?: number;
}

const SRC = {
  local: { label: "FICHIER", color: "#9ca3af" },
  audius: { label: "AUDIUS", color: "#ffcc00" },
  youtube: { label: "YT", color: "#ef4444" },
  soundcloud: { label: "SC", color: "#ff7700" },
  deezer: { label: "DEEZER", color: "#a238ff" },
} as const;

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

// YouTube duration filters — forcing a bound makes yt-dlp surface a wider, more
// targeted set of results than the default mixed bag.
const DUR_FILTERS: { key: string; label: string; min?: number; max?: number }[] = [
  { key: "all", label: "Toutes durées" },
  { key: "1", label: "< 1 min", max: 60 },
  { key: "3", label: "< 3 min", max: 180 },
  { key: "5", label: "< 5 min", max: 300 },
  { key: "8", label: "< 8 min", max: 480 },
  { key: "15", label: "< 15 min", max: 900 },
  { key: "15+", label: "> 15 min", min: 900 },
];

// EQ-solo + rough "stem" modes applied to the isolated preview signal.
// Band modes solo a frequency range; the two stem modes use mid/side maths:
//   • Voix      → keep the center (L+R), where lead vocals usually sit
//   • Sans voix → keep the sides (L−R), cancelling center vocals (karaoke)
// It's crude (no ML) but instant and good enough to audition parts.
type FilterMode = "full" | "bass" | "mid" | "high" | "vocals" | "karaoke";
const FILTER_MODES: { key: FilterMode; label: string; color: string; stem?: boolean }[] = [
  { key: "full", label: "Plein", color: "#9ca3af" },
  { key: "bass", label: "Basse", color: "#ffcc00" },
  { key: "mid", label: "Médium", color: "#facc15" },
  { key: "high", label: "Aigu", color: "#ffcc00" },
  { key: "vocals", label: "Voix", color: "#e879f9", stem: true },
  { key: "karaoke", label: "Sans voix", color: "#38bdf8", stem: true },
];

// --- quick offline tempo estimate -----------------------------------------
// Energy-flux autocorrelation over the first slice of a track. Cheap and good
// enough for a "± BPM" readout when the catalogue doesn't already give us one.
function estimateBPM(buf: AudioBuffer): number {
  const sr = buf.sampleRate;
  const ch = buf.getChannelData(0);
  const maxSamples = Math.min(ch.length, sr * 30); // analyse ≤ 30 s — keep it snappy
  const hop = Math.floor(sr / 100); // ~10 ms frames → 100 fps envelope
  const frames = Math.floor(maxSamples / hop);
  if (frames < 8) return 0;
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let j = 0; j < hop; j++) {
      const v = ch[i * hop + j];
      s += v * v;
    }
    env[i] = Math.sqrt(s / hop);
  }
  const flux = new Float32Array(frames);
  for (let i = 1; i < frames; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  const fps = sr / hop;
  let bestBpm = 0;
  let bestScore = -1;
  for (let bpm = 70; bpm <= 180; bpm++) {
    const lag = Math.round((fps * 60) / bpm);
    if (lag < 1 || lag >= frames) continue;
    let sum = 0;
    for (let i = lag; i < frames; i++) sum += flux[i] * flux[i - lag];
    if (sum > bestScore) {
      bestScore = sum;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

export function StudioView({ engine, onLoaded, stemRefresh, libRefresh }: Props) {
  const [src, setSrc] = useState<"audius" | "youtube" | "soundcloud" | "deezer">("audius");
  const [durKey, setDurKey] = useState("all"); // YouTube duration filter
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AudiusTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [bpmEstimated, setBpmEstimated] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [bands, setBands] = useState<number[]>([0, 0, 0]); // Lo / Mid / Hi
  const [beat, setBeat] = useState(0); // 0..1 bass pulse
  const [mode, setMode] = useState<FilterMode>("full"); // EQ / rough-stem solo
  const [msg, setMsg] = useState("");

  // preview audio graph — kept fully separate from the DJ mix so it never leaks
  // into the master / recording. element → analyser → its own destination.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const lastAbRef = useRef<ArrayBuffer | null>(null); // for → Deck (raw bytes)
  const lastBufRef = useRef<AudioBuffer | null>(null); // for → Synth / Pad (decoded)
  const cascadeRef = useRef<HTMLCanvasElement | null>(null);
  // EQ / stem chain: direct stereo path + mid/side + a shared biquad. Modes blend
  // mid (center = vocals) vs side (L−R = instrumental) and EQ to "rough-separate".
  const directGainRef = useRef<GainNode | null>(null);
  const procGainRef = useRef<GainNode | null>(null);
  const midBusRef = useRef<GainNode | null>(null);
  const sideBusRef = useRef<GainNode | null>(null);
  const bandRef = useRef<BiquadFilterNode | null>(null);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((c) => (c === m ? "" : c)), 2200);
  };

  // push the current EQ/stem mode onto the live preview graph
  const applyMode = useCallback((m: FilterMode) => {
    const ctx = ctxRef.current;
    const direct = directGainRef.current;
    const proc = procGainRef.current;
    const midB = midBusRef.current;
    const sideB = sideBusRef.current;
    const band = bandRef.current;
    if (!ctx || !direct || !proc || !midB || !sideB || !band) return;
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
      case "bass": // mono downmix → lowpass
        set(midB.gain, 1); set(sideB.gain, 0);
        band.type = "lowpass"; band.frequency.value = 250; band.Q.value = 0.7;
        break;
      case "mid":
        set(midB.gain, 1); set(sideB.gain, 0);
        band.type = "bandpass"; band.frequency.value = 1000; band.Q.value = 0.6;
        break;
      case "high":
        set(midB.gain, 1); set(sideB.gain, 0);
        band.type = "highpass"; band.frequency.value = 3500; band.Q.value = 0.7;
        break;
      case "vocals": // keep center, band-limit to the vocal range
        set(midB.gain, 1.5); set(sideB.gain, 0);
        band.type = "bandpass"; band.frequency.value = 1200; band.Q.value = 0.5;
        break;
      case "karaoke": // keep sides only → cancels center vocals
        set(midB.gain, 0); set(sideB.gain, 1.8);
        band.type = "allpass"; band.frequency.value = 1000; band.Q.value = 0.7;
        break;
    }
  }, []);

  // lazily build the isolated preview context the first time we play something
  const ensureCtx = useCallback(() => {
    if (!audioRef.current) return;
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.7;
      const node = ctx.createMediaElementSource(audioRef.current);

      // everything sums into mix → analyser → speakers
      const mix = ctx.createGain();
      mix.connect(an);
      an.connect(ctx.destination);

      // (1) clean stereo path for "Plein"
      const direct = ctx.createGain();
      direct.gain.value = 1;
      node.connect(direct);
      direct.connect(mix);

      // (2) processed path: split → mid(L+R)/side(L−R) → busses → biquad → proc
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
      const band = ctx.createBiquadFilter();
      band.type = "allpass";
      midBus.connect(band); sideBus.connect(band);
      const proc = ctx.createGain(); proc.gain.value = 0;
      band.connect(proc); proc.connect(mix);

      ctxRef.current = ctx;
      analyserRef.current = an;
      freqRef.current = new Uint8Array(an.frequencyBinCount);
      directGainRef.current = direct;
      procGainRef.current = proc;
      midBusRef.current = midBus;
      sideBusRef.current = sideBus;
      bandRef.current = band;
      applyMode(mode);
    }
    if (ctxRef.current.state !== "running") ctxRef.current.resume().catch(() => {});
  }, [applyMode, mode]);

  async function search(durOverride?: string) {
    if (!q.trim()) return;
    setSearching(true);
    try {
      let url = `/api/${src}/search?q=${encodeURIComponent(q)}`;
      if (src === "youtube" || src === "soundcloud") {
        const f = DUR_FILTERS.find((d) => d.key === (durOverride ?? durKey));
        url += "&n=40"; // force a much wider pool than the old default of 15
        if (f?.min) url += `&min=${f.min}`;
        if (f?.max) url += `&max=${f.max}`;
      }
      const r = await fetch(url);
      const j = await r.json();
      setResults((j.tracks ?? []).map((t: AudiusTrack) => ({ ...t, source: t.source ?? src })));
      if ((j.tracks ?? []).length === 0) flash("Aucun résultat");
    } catch {
      flash("Recherche indisponible");
    } finally {
      setSearching(false);
    }
  }

  // fetch the audio once: stream it to the <audio> for instant listening AND
  // decode it for the BPM/frequency analysis + deck/synth/pad routing.
  const select = useCallback(
    async (s: Sel) => {
      setSel(s);
      setPlaying(false);
      setPos(0);
      setDur(0);
      setBpm(s.bpm ?? null);
      setBpmEstimated(false);
      setBands([0, 0, 0]);
      setBeat(0);
      lastAbRef.current = null;
      lastBufRef.current = null;
      setAnalyzing(true);
      try {
        let ab: ArrayBuffer;
        if (s.source === "local") {
          const blob = await idbGetBlob(s.id);
          if (!blob) throw new Error("Fichier introuvable");
          ab = await blob.arrayBuffer();
        } else {
          const res = await fetch(`/api/${s.source}/stream?id=${encodeURIComponent(s.id)}`);
          if (!res.ok) throw new Error("Flux indisponible");
          ab = await res.arrayBuffer();
        }
        lastAbRef.current = ab;

        // stream to the <audio> element from the bytes we already have
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(new Blob([ab]));
        blobUrlRef.current = url;
        if (audioRef.current) {
          audioRef.current.src = url;
          ensureCtx();
          audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
        }

        // decode a copy for analysis + routing (decode detaches its input)
        ensureCtx();
        const ctx = ctxRef.current;
        if (ctx) {
          const buf = await ctx.decodeAudioData(ab.slice(0));
          lastBufRef.current = buf;
          if (s.bpm == null) {
            const est = estimateBPM(buf);
            if (est) {
              setBpm(est);
              setBpmEstimated(true);
            }
          }
        }
      } catch (e) {
        flash((e as Error).message);
      } finally {
        setAnalyzing(false);
      }
    },
    [ensureCtx]
  );

  // re-apply EQ/stem mode whenever it changes
  useEffect(() => {
    applyMode(mode);
  }, [mode, applyMode]);

  // transport
  const toggle = () => {
    const a = audioRef.current;
    if (!a || !sel) return;
    ensureCtx();
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  // keep position + live spectrum / band meters going
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) {
        setPos(a.currentTime || 0);
        if (a.duration && isFinite(a.duration)) setDur(a.duration);
      }
      const an = analyserRef.current;
      const fr = freqRef.current;
      if (an && fr && !a?.paused) {
        an.getByteFrequencyData(fr);
        const n = fr.length;
        // 3 broad bands: lows / mids / highs
        const edge = [0, Math.floor(n * 0.12), Math.floor(n * 0.45), n];
        const out = [0, 0, 0];
        for (let b = 0; b < 3; b++) {
          let s = 0;
          for (let i = edge[b]; i < edge[b + 1]; i++) s += fr[i];
          out[b] = s / Math.max(1, edge[b + 1] - edge[b]) / 255;
        }
        setBands(out);
        setBeat(out[0]);
        drawCascade(fr);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // simple scrolling spectrogram (waterfall) — copy the canvas onto itself
  // shifted 1px left, then paint the newest column on the right edge.
  function drawCascade(fr: Uint8Array<ArrayBuffer>) {
    const cv = cascadeRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    ctx.drawImage(cv, -1, 0);
    const bins = Math.min(fr.length, 256); // low/mid range is the musical part
    for (let y = 0; y < h; y++) {
      const bin = Math.floor((1 - y / h) * (bins - 1)); // low freq at the bottom
      const v = fr[bin] / 255;
      ctx.fillStyle = heat(v);
      ctx.fillRect(w - 1, y, 1, 1);
    }
  }
  // dark → violet → orange → white heat ramp (matches the app palette)
  function heat(v: number): string {
    if (v < 0.02) return "#0a0a0f";
    if (v < 0.35) return `rgba(168,85,247,${0.25 + v})`; // violet
    if (v < 0.7) return `rgba(255,204,0,${v})`; // orange
    return `rgba(255,255,255,${v})`; // white peaks
  }

  // --- routing the previewed single onward ---
  function toDeck(side: "A" | "B") {
    const ab = lastAbRef.current;
    if (!ab || !sel) return flash("Analyse en cours…");
    const deck = side === "A" ? engine.deckA : engine.deckB;
    deck.loading = true;
    deck.load(ab.slice(0), `${sel.title}${sel.artist ? ` — ${sel.artist}` : ""}`)
      .then(() => {
        deck.coverArt = sel.art ?? "";
        deck.origin = { id: sel.id, source: sel.source, url: sel.id, art: sel.art ?? undefined };
        onLoaded?.();
        flash(`→ Deck ${side}`);
      })
      .catch((e) => flash(`Deck ${side}: ${(e as Error).message}`))
      .finally(() => (deck.loading = false));
  }
  function toSynth() {
    const buf = lastBufRef.current;
    if (!buf || !sel) return flash("Analyse en cours…");
    engine.synth.setSample(buf, sel.title);
    flash("→ Synthé (sample jouable au clavier)");
  }
  function toPad() {
    const buf = lastBufRef.current;
    if (!buf || !sel) return flash("Analyse en cours…");
    const slot = engine.sampler.nextGrabSlot();
    engine.sampler.setBuffer(slot, buf, sel.title);
    flash(`→ Pad ${slot + 1}`);
  }
  function toLibrary() {
    if (!sel) return;
    const lt: LibTrack = {
      id: sel.source === "local" ? sel.id : uid(),
      name: `${sel.title}${sel.artist ? ` — ${sel.artist}` : ""}`,
      source: sel.source,
      url: sel.source === "local" ? undefined : sel.id,
      deck: null,
      art: sel.art ?? undefined,
      addedAt: Date.now(),
    };
    const lib = loadLibrary();
    saveLibrary({ ...lib, tracks: [lt, ...lib.tracks.filter((t) => t.id !== lt.id)] });
    onLoaded?.();
    flash("≣ Ajouté à la bibliothèque");
  }

  // cleanup
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const styleText = sel
    ? [
        sel.genre || null,
        bands[0] > 0.55 ? "énergique" : bands[0] > 0.3 ? "groovy" : "posé",
        bands[2] > 0.4 ? "brillant" : "chaud",
      ]
        .filter(Boolean)
        .join(" · ")
    : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* ===== NOW PLAYING + ANALYSIS ===== */}
      <div className="hw-screwed hw-panel grid grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr]">
        {/* big cover + transport */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-white/10">
            {sel?.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sel.art} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-6xl text-neutral-700">
                ♪
              </div>
            )}
            {analyzing && (
              <div className="absolute inset-x-0 bottom-0 bg-fuchsia-600/80 py-1 text-center text-[11px] font-bold">
                Analyse…
              </div>
            )}
            {/* live beat pulse */}
            <div
              className="absolute right-2 top-2 h-4 w-4 rounded-full"
              style={{
                background: "#ffcc00",
                opacity: 0.25 + beat * 0.75,
                boxShadow: `0 0 ${4 + beat * 16}px rgba(255,204,0,${beat})`,
              }}
            />
          </div>
          <div className="min-h-[2.5rem]">
            <div className="truncate text-lg font-bold text-neutral-100">{sel?.title ?? "—"}</div>
            <div className="truncate text-sm text-neutral-400">{sel?.artist ?? ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              disabled={!sel}
              className="hw-btn hw-btn-on px-4 py-2 text-lg disabled:opacity-40"
              style={{ ["--led" as string]: "#e879f9" }}
            >
              {playing ? "❚❚" : "►"}
            </button>
            <input
              type="range"
              min={0}
              max={dur || 1}
              step={0.1}
              value={pos}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (audioRef.current) audioRef.current.currentTime = v;
                setPos(v);
              }}
              className="dj-fader flex-1"
            />
            <span className="w-20 text-right font-mono text-xs text-neutral-400">
              {fmt(pos)} / {fmt(dur)}
            </span>
          </div>
        </div>

        {/* cascade + analysis readout */}
        <div className="flex flex-col gap-3">
          <div className="hw-recess overflow-hidden rounded-md p-1">
            <canvas
              ref={cascadeRef}
              width={760}
              height={150}
              className="h-[150px] w-full rounded"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="BPM"
              value={bpm ? Math.round(bpm).toString() : "—"}
              sub={bpm ? (bpmEstimated ? "estimé" : "catalogue") : ""}
              color="#ffcc00"
            />
            <Stat label="Durée" value={dur ? fmt(dur) : "—"} color="#ffcc00" />
            <Stat
              label="Énergie"
              value={`${Math.round(((bands[0] + bands[1] + bands[2]) / 3) * 100)}%`}
              color="#facc15"
            />
            <Stat label="Style" value={styleText} small color="#e879f9" />
          </div>
          {/* EQ-solo + rough stem buttons — audition just one band / part */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Filtre / Stems
            </span>
            {FILTER_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                disabled={!sel}
                className={`rounded px-2 py-1 text-xs font-semibold disabled:opacity-30 ${
                  mode === m.key ? "hw-btn-on" : "text-neutral-400 ring-1 ring-white/10"
                } ${m.stem ? "italic" : ""}`}
                style={{ ["--led" as string]: m.color, color: mode === m.key ? undefined : m.color }}
                title={
                  m.stem
                    ? m.key === "vocals"
                      ? "Isole le centre (voix) — séparation rapide approximative"
                      : "Annule le centre (karaoké / instrumental) — approximatif"
                    : `Isole les ${m.label.toLowerCase()}s`
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          {/* 3-band frequency meters */}
          <div className="flex items-end gap-3">
            {(["Basses", "Médiums", "Aigus"] as const).map((lbl, i) => (
              <div key={lbl} className="flex flex-1 flex-col items-center gap-1">
                <div className="hw-recess flex h-20 w-full items-end overflow-hidden rounded">
                  <div
                    className="w-full transition-[height] duration-75"
                    style={{
                      height: `${Math.min(100, bands[i] * 130)}%`,
                      background:
                        i === 0 ? "#ffcc00" : i === 1 ? "#facc15" : "#ffcc00",
                    }}
                  />
                </div>
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">{lbl}</span>
              </div>
            ))}
          </div>
          {/* destination routing */}
          <div className="flex flex-wrap gap-2">
            <RouteBtn onClick={() => toDeck("A")} color="#ffcc00" label="→ Deck A" disabled={!sel} />
            <RouteBtn onClick={() => toDeck("B")} color="#ffcc00" label="→ Deck B" disabled={!sel} />
            <RouteBtn onClick={toSynth} color="#a78bfa" label="→ Synthé" disabled={!sel} />
            <RouteBtn onClick={toPad} color="#facc15" label="→ Pad" disabled={!sel} />
            <RouteBtn onClick={toLibrary} color="#ffcc00" label="≣ Bibliothèque" disabled={!sel} />
          </div>
        </div>
      </div>

      {/* ===== SEARCH + BIG-COVER RESULTS ===== */}
      <div className="hw-screwed hw-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex overflow-hidden rounded">
            {(
              [
                ["audius", "♫ Audius"],
                ["youtube", "▶ YouTube"],
                ["soundcloud", "☁ SoundCloud"],
                ["deezer", "◆ Deezer"],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setSrc(s)}
                className={`px-3 py-1.5 text-xs font-bold ${src === s ? "hw-btn-on" : "text-neutral-400"}`}
                style={{ ["--led" as string]: SRC[s].color }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Cherche un single à écouter / analyser…"
            className="flex-1 rounded bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 ring-1 ring-white/10 outline-none focus:ring-fuchsia-500/40"
          />
          <button onClick={() => search()} className="hw-btn px-3 py-1.5 text-sm" style={{ ["--led" as string]: "#e879f9", color: "#e879f9" }}>
            {searching ? "…" : "Chercher"}
          </button>
          {msg && <span className="text-xs text-fuchsia-300">{msg}</span>}
        </div>

        {/* YouTube / SoundCloud duration filter — forces a wider / more targeted result set */}
        {(src === "youtube" || src === "soundcloud") && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Durée
            </span>
            {DUR_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setDurKey(f.key);
                  if (q.trim()) search(f.key);
                }}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  durKey === f.key ? "hw-btn-on" : "text-neutral-400 ring-1 ring-white/10"
                }`}
                style={{ ["--led" as string]: "#ef4444" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        {results.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((t) => {
              const active = sel?.id === t.id;
              return (
                <li key={`${t.source}-${t.id}`}>
                  <button
                    onClick={() =>
                      select({
                        id: t.id,
                        title: t.title,
                        artist: t.artist,
                        art: t.artwork,
                        source: (t.source ?? src) as TrackSource,
                        genre: t.genre,
                        bpm: t.bpm,
                      })
                    }
                    className={`group w-full overflow-hidden rounded-lg text-left ring-1 transition ${
                      active ? "ring-fuchsia-500" : "ring-white/10 hover:ring-white/30"
                    }`}
                  >
                    <div className="relative aspect-square w-full bg-neutral-900">
                      {t.artwork ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.artwork} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl text-neutral-700">♪</div>
                      )}
                      <span
                        className="absolute left-1 top-1 rounded px-1 py-0.5 text-[8px] font-black"
                        style={{ background: SRC[(t.source ?? src) as TrackSource].color, color: "#0a0a0a" }}
                      >
                        {SRC[(t.source ?? src) as TrackSource].label}
                      </span>
                      {t.bpm ? (
                        <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-orange-300">
                          {Math.round(t.bpm)}
                        </span>
                      ) : null}
                    </div>
                    <div className="p-1.5">
                      <div className="truncate text-xs font-semibold text-neutral-100">{t.title}</div>
                      <div className="truncate text-[10px] text-neutral-400">{t.artist}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-neutral-600">
            Cherche un single ci-dessus, clique une pochette pour l&apos;écouter et l&apos;analyser
            (BPM, beats, fréquences), puis envoie-le vers un Deck, le Synthé ou un Pad.
          </p>
        )}
      </div>

      {/* ===== full toolset (playlists, base de données, Auto-IA) preserved ===== */}
      <MediaLibrary engine={engine} onLoaded={onLoaded} stemRefresh={stemRefresh} libRefresh={libRefresh} />

      {/* hidden preview element (its audio is routed through the isolated graph) */}
      <audio ref={audioRef} className="hidden" onEnded={() => setPlaying(false)} crossOrigin="anonymous" />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
  small,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="hw-recess rounded-md px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`${small ? "text-xs" : "text-2xl"} font-black leading-tight`} style={{ color }}>
        {value}
      </div>
      {sub ? <div className="text-[9px] text-neutral-500">{sub}</div> : null}
    </div>
  );
}

function RouteBtn({
  onClick,
  color,
  label,
  disabled,
}: {
  onClick: () => void;
  color: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hw-btn px-3 py-1.5 text-xs disabled:opacity-40"
      style={{ ["--led" as string]: color, color }}
    >
      {label}
    </button>
  );
}
