"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Knob } from "@/components/Knob";
import { Waveform } from "@/components/Waveform";
import { VoiceExtractorEngine, OutputMode, StemBuffers } from "@/lib/audio/VoiceExtractorEngine";
import { CarrierType, HarmonizeMode, VocalParams, defaultVocalParams, renderVocalToWav } from "@/lib/audio/vocoderEngine";
import { FxName, FX_LIST } from "@/lib/audio/FXRack";

interface YTTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artwork: string | null;
}

type SourceTab = "search" | "upload";
type Phase = "idle" | "fetching" | "separating" | "decoding" | "ready" | "error";

interface LyricSegment {
  start: number;
  end: number;
  text: string;
}

function srtTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function segmentsToSrt(segments: LyricSegment[]): string {
  return segments.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join("\n");
}

function downloadText(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const MODEL_LABEL: Record<string, string> = {
  htdemucs_ft: "Précision max (htdemucs_ft, plus lent)",
  htdemucs: "Rapide (htdemucs)",
};

const MAX_SEC = 8 * 60;

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// downsample an AudioBuffer to a small peaks array for the Waveform canvas
function computePeaks(buffer: AudioBuffer, n = 400): Float32Array {
  const data = buffer.getChannelData(0);
  const peaks = new Float32Array(n);
  const chunk = Math.max(1, Math.floor(data.length / n));
  for (let i = 0; i < n; i++) {
    let max = 0;
    const start = i * chunk;
    const end = Math.min(data.length, start + chunk);
    for (let j = start; j < end; j++) max = Math.max(max, Math.abs(data[j]));
    peaks[i] = max;
  }
  return peaks;
}

function probeDuration(file: File | Blob): Promise<number> {
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

// ---------- photoreal gunmetal-chassis styling helpers (matches the look of
// DX7Synth/Solar42F, the other "VST plugin" modules in this project) ----------
const moduleStyle: React.CSSProperties = {
  background: "linear-gradient(180deg,#232427,#17181a)",
  border: "1px solid #000",
  boxShadow: "inset 0 2px 6px rgba(0,0,0,.65), inset 0 -1px 0 rgba(255,255,255,.04)",
};
const lcdStyle: React.CSSProperties = {
  background: "linear-gradient(180deg,#1a0518,#10020f)",
  border: "2px solid #05010a",
  boxShadow: "inset 0 0 14px rgba(232,121,249,.35)",
};
function membraneBtn(active: boolean, tint = "#e879f9"): React.CSSProperties {
  return {
    background: active
      ? `linear-gradient(180deg, color-mix(in srgb, ${tint} 88%, #fff) 0%, ${tint} 55%, color-mix(in srgb, ${tint} 55%, #000) 100%)`
      : "linear-gradient(180deg,#3a3c40,#232427)",
    color: active ? "#1a0518" : "#e9e5f0",
    border: "1px solid #000",
    boxShadow: active
      ? `inset 0 0 8px rgba(255,255,255,.35), 0 0 10px color-mix(in srgb, ${tint} 60%, transparent)`
      : "inset 0 1px 0 rgba(255,255,255,.08), 0 1px 2px rgba(0,0,0,.5)",
  };
}
function moduleLabel(text: string, color = "#f3b6fb") {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
      <span className="text-[9px] font-bold uppercase tracking-[.15em]" style={{ color }}>
        {text}
      </span>
    </div>
  );
}

export function VoiceExtractor() {
  const engineRef = useRef<VoiceExtractorEngine | null>(null);
  const getEngine = () => {
    if (!engineRef.current) engineRef.current = new VoiceExtractorEngine();
    return engineRef.current;
  };
  useEffect(() => () => engineRef.current?.dispose(), []);

  const [tab, setTab] = useState<SourceTab>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YTTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [trackName, setTrackName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const [model, setModel] = useState<"htdemucs_ft" | "htdemucs">("htdemucs_ft");
  const [ultra, setUltra] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [lossless, setLossless] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);

  const [peaks, setPeaks] = useState<Float32Array>(new Float32Array(400));
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [outputMode, setOutputMode] = useState<OutputMode>("mix");

  const [params, setParamsState] = useState<VocalParams>({ ...defaultVocalParams });
  const [masterVol, setMasterVol] = useState(0.9);
  const [bonusFx, setBonusFx] = useState<Record<FxName, number>>({
    echo: 0, reverb: 0, flanger: 0, phaser: 0, gate: 0, crush: 0,
  });

  const [vocalsBlobUrl, setVocalsBlobUrl] = useState<string | null>(null);
  const vocalsBlobRef = useRef<Blob | null>(null);
  const [rendering, setRendering] = useState(false);

  const [lyrics, setLyrics] = useState<LyricSegment[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  function setParam<K extends keyof VocalParams>(key: K, value: VocalParams[K]) {
    setParamsState((p) => ({ ...p, [key]: value }));
    getEngine().setParam(key, value);
  }

  const stemUrl = useCallback(
    (hash: string, stem: string) => {
      const q = new URLSearchParams({ model, ...(ultra ? { ultra: "1" } : {}), ...(lossless ? { wav: "1" } : {}), ...(denoise ? { denoise: "1" } : {}) });
      return `/api/stems/${hash}/${stem}?${q.toString()}`;
    },
    [model, ultra, lossless, denoise]
  );

  // --- search ---------------------------------------------------------
  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&n=15`);
      const j = await r.json();
      setResults(j.tracks ?? []);
    } catch {
      setMsg("Recherche YouTube indisponible");
    } finally {
      setSearching(false);
    }
  }

  async function pickTrack(t: YTTrack) {
    setPhase("fetching");
    setMsg(`Téléchargement audio « ${t.title} »…`);
    setTrackName(t.title);
    try {
      const r = await fetch(`/api/youtube/stream?id=${encodeURIComponent(t.id)}`);
      if (!r.ok) throw new Error("téléchargement YouTube échoué");
      const bytes = await r.arrayBuffer();
      await beginSeparation(bytes, t.title);
    } catch (e) {
      setPhase("error");
      setMsg((e as Error).message);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrackName(file.name);
    setPhase("fetching");
    setMsg("Lecture du fichier…");
    try {
      const dur = await probeDuration(file);
      if (dur > MAX_SEC) {
        setPhase("error");
        setMsg(`Morceau de ${Math.round(dur / 60)} min — limite 8 min pour la séparation.`);
        e.target.value = "";
        return;
      }
    } catch {
      /* metadata probe failed — let the server pipeline surface any real error */
    }
    const bytes = await file.arrayBuffer();
    await beginSeparation(bytes, file.name.replace(/\.[^.]+$/, ""));
  }

  // --- separation pipeline (prefetch → poll cache + poll progress) ----
  async function beginSeparation(bytes: ArrayBuffer, name: string) {
    bytesRef.current = bytes;
    setPhase("separating");
    setProgress(0);
    setMsg("Séparation des pistes (voix / batterie / basse / autre)…");

    const q = new URLSearchParams({
      model,
      ...(ultra ? { ultra: "1" } : {}),
      ...(lossless ? { wav: "1" } : {}),
      ...(denoise ? { denoise: "1" } : {}),
    });

    try {
      const r = await fetch(`/api/stems/separate?${q.toString()}&prefetch=1`, { method: "POST", body: bytes.slice(0) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (j.cached) return finishSeparation(j.hash, bytes, name);

      const pollProgress = async () => {
        try {
          const pr = await fetch(`/api/stems/progress?hash=${j.hash}&${q.toString()}`);
          const pj = await pr.json();
          if (typeof pj.progress === "number") setProgress(pj.progress);
        } catch {
          /* transient */
        }
        progressPollRef.current = setTimeout(pollProgress, 2000);
      };
      progressPollRef.current = setTimeout(pollProgress, 1500);

      const poll = async () => {
        try {
          const pr = await fetch(`/api/stems/separate?${q.toString()}&probe=1`, { method: "POST", body: bytes.slice(0) });
          const pj = await pr.json();
          if (pj.cached) return finishSeparation(pj.hash, bytes, name);
        } catch {
          /* transient — keep polling */
        }
        pollRef.current = setTimeout(poll, 3000);
      };
      pollRef.current = setTimeout(poll, 3000);
    } catch (e) {
      setPhase("error");
      setMsg((e as Error).message || "Échec de la séparation");
    }
  }

  async function finishSeparation(hash: string, originalBytes: ArrayBuffer, name: string) {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (progressPollRef.current) clearTimeout(progressPollRef.current);
    setProgress(100);
    setPhase("decoding");
    setMsg("Décodage des pistes…");
    try {
      const engine = getEngine();
      const [vocalsBuf, drumsBuf, bassBuf, otherBuf, originalBuf] = await Promise.all([
        fetch(stemUrl(hash, "vocals")).then((r) => r.arrayBuffer()),
        fetch(stemUrl(hash, "drums")).then((r) => r.arrayBuffer()),
        fetch(stemUrl(hash, "bass")).then((r) => r.arrayBuffer()),
        fetch(stemUrl(hash, "other")).then((r) => r.arrayBuffer()),
        Promise.resolve(originalBytes.slice(0)),
      ]);
      const [vocals, drums, bass, other, original] = await Promise.all(
        [vocalsBuf, drumsBuf, bassBuf, otherBuf, originalBuf].map((b) => engine.ctx.decodeAudioData(b.slice(0)))
      );
      const buffers: StemBuffers = { vocals, drums, bass, other, original };
      engine.setBuffers(buffers);
      engine.onEnded = () => setPlaying(false);
      engine.onPositionTick = (sec) => setPosition(sec);
      setDuration(vocals.duration);
      setPeaks(computePeaks(vocals));
      setPosition(0);
      const vBlob = new Blob([vocalsBuf], { type: lossless ? "audio/wav" : "audio/mpeg" });
      vocalsBlobRef.current = vBlob;
      setVocalsBlobUrl(URL.createObjectURL(vBlob));
      setLyrics(null);
      setLyricsError(null);
      setPhase("ready");
      setMsg(`« ${name} » — voix isolée, prête.`);
    } catch (e) {
      setPhase("error");
      setMsg((e as Error).message || "Échec du décodage");
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (progressPollRef.current) clearTimeout(progressPollRef.current);
    };
  }, []);

  // --- transport --------------------------------------------------------
  function togglePlay() {
    const engine = getEngine();
    if (playing) {
      engine.pause();
      setPlaying(false);
    } else {
      engine.play();
      setPlaying(true);
    }
  }
  function onSeek(norm: number) {
    const engine = getEngine();
    const sec = norm * duration;
    engine.seek(sec);
    setPosition(sec);
  }
  function changeOutputMode(mode: OutputMode) {
    setOutputMode(mode);
    getEngine().setOutputMode(mode);
  }
  function changeMasterVol(v: number) {
    setMasterVol(v);
    getEngine().setMasterVolume(v);
  }
  function setBonusWet(name: FxName, v: number) {
    setBonusFx((f) => ({ ...f, [name]: v }));
    getEngine().setBonusFxWet(name, v);
  }

  async function exportProcessedVocal() {
    const engine = engineRef.current;
    const vocals = engine?.vocalsBuffer;
    if (!vocals) return;
    setRendering(true);
    try {
      const wav = await renderVocalToWav(vocals, params);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(wav);
      a.download = `${trackName || "voix"}-vocoder.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setMsg((e as Error).message || "Échec de l'export");
    } finally {
      setRendering(false);
    }
  }

  // AI lyrics transcription (Groq Whisper) — transcribes the isolated vocal
  // stem, both as a lyrics feature and a quick sanity check of isolation
  // quality (garbled text usually means residual instrumental bleed).
  async function transcribeLyrics() {
    const blob = vocalsBlobRef.current;
    if (!blob) return;
    setLyricsLoading(true);
    setLyricsError(null);
    try {
      const bytes = await blob.arrayBuffer();
      const r = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "x-audio-type": blob.type || "audio/mpeg" },
        body: bytes,
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setLyrics(j.segments ?? []);
    } catch (e) {
      setLyricsError((e as Error).message || "Échec de la transcription");
    } finally {
      setLyricsLoading(false);
    }
  }

  function seekTo(sec: number) {
    getEngine().seek(sec);
    setPosition(sec);
  }

  const carrierOptions: { v: CarrierType; label: string }[] = [
    { v: "synth", label: "Synthé (accord)" },
    { v: "noise", label: "Bruit (chuchoté)" },
    { v: "instrumental", label: "Instrumental" },
  ];
  const harmonizeOptions: { v: HarmonizeMode; label: string }[] = [
    { v: "off", label: "Off" },
    { v: "third", label: "+ Tierce" },
    { v: "fifth", label: "+ Quinte" },
    { v: "octave", label: "+ Octave" },
  ];

  const busy = phase === "fetching" || phase === "separating" || phase === "decoding";
  const lcdMessage = trackName || (phase === "idle" ? "PRÊT — CHOISIR UNE SOURCE" : msg || "…");

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-3" style={{ background: "radial-gradient(circle at 50% -10%, #2a2c30, #0a0a0b)" }}>
      <div
        className="w-full max-w-5xl overflow-hidden"
        style={{
          borderRadius: "10px",
          background: "linear-gradient(180deg,#5a5d62 0%,#4a4d52 3%,#333538 8%,#1c1d1f 100%)",
          boxShadow: "0 24px 50px rgba(0,0,0,.75), inset 0 2px 0 rgba(220,220,230,.25), inset 0 -2px 6px rgba(0,0,0,.6)",
          border: "1px solid #0a0a0b",
        }}
      >
        {/* ============ CONTROL SURFACE (gunmetal) ============ */}
        <div className="px-3 pb-4 pt-3" style={{ background: "linear-gradient(180deg,#3c3e42 0%,#2c2e31 40%,#1c1d1f 100%)", borderBottom: "4px solid #050506" }}>
          {/* header: brand + LCD readout + link */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-3">
              <div className="flex flex-col leading-none">
                <span className="text-[9px] tracking-[.4em]" style={{ color: "#d7cfe0" }}>VX-16</span>
                <span className="text-2xl font-black italic tracking-tight" style={{ color: "#f3eef8", textShadow: "0 2px 3px rgba(0,0,0,.7)" }}>
                  VOCALIZER
                </span>
              </div>
              <span className="hidden max-w-[130px] text-[7px] leading-tight tracking-[.15em] sm:block" style={{ color: "#b8aec7" }}>
                AI VOCAL ISOLATION · VOCODER PROCESSOR
              </span>
            </div>

            {/* fluorescent LCD status readout */}
            <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded px-3 py-1.5 font-mono" style={lcdStyle}>
              <span className="shrink-0 text-[9px]" style={{ color: playing || busy ? "#e879f9" : "#5a3d55" }}>●</span>
              <span className="truncate text-[11px] font-bold tracking-wide" style={{ color: "#f3b6fb", textShadow: "0 0 6px rgba(232,121,249,.8)" }}>
                {lcdMessage}
              </span>
            </div>

            <Link
              href="/"
              className="shrink-0 rounded px-3 py-1.5 text-[10px] font-bold"
              style={{ background: "linear-gradient(180deg,#4a4d52,#2c2e31)", color: "#e9e5f0", border: "1px solid #000" }}
            >
              ← DJSynth
            </Link>
          </div>

          {/* ---------- source module ---------- */}
          <div className="rounded-md p-2.5" style={moduleStyle}>
            <div className="mb-2 flex gap-1.5">
              <button className="flex-1 rounded-sm py-1.5 text-[10px] font-bold tracking-wide" onClick={() => setTab("search")} style={membraneBtn(tab === "search")}>
                ▶ RECHERCHE YOUTUBE
              </button>
              <button className="flex-1 rounded-sm py-1.5 text-[10px] font-bold tracking-wide" onClick={() => setTab("upload")} style={membraneBtn(tab === "upload")}>
                ⤒ IMPORTER MP3
              </button>
            </div>

            {tab === "search" ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                    placeholder="Titre, artiste…"
                    className="flex-1 rounded-sm px-2 py-1.5 font-mono text-xs outline-none"
                    style={{ background: "#0d0e10", color: "#e9e5f0", border: "1px solid #000", boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)" }}
                  />
                  <button onClick={doSearch} disabled={searching} className="rounded-sm px-3 py-1.5 text-[10px] font-bold disabled:opacity-50" style={membraneBtn(false)}>
                    {searching ? "…" : "CHERCHER"}
                  </button>
                </div>
                {results.length > 0 && (
                  <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-sm p-1" style={{ background: "#0d0e10", border: "1px solid #000" }}>
                    {results.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => pickTrack(t)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:brightness-125 disabled:opacity-50"
                        style={{ background: "linear-gradient(180deg,#232427,#17181a)", border: "1px solid #000", color: "#e9e5f0" }}
                      >
                        {t.artwork && <img src={t.artwork} alt="" className="h-8 w-8 rounded-sm object-cover" />}
                        <span className="flex-1 truncate">{t.title}</span>
                        <span style={{ color: "#8d8697" }}>{fmtTime(t.duration)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="rounded-sm px-3 py-1.5 text-[10px] font-bold disabled:opacity-50"
                  style={membraneBtn(true)}
                >
                  ♪ CHOISIR UN FICHIER AUDIO
                </button>
                <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
              </div>
            )}

            {/* separation quality toggles */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: "rgba(255,255,255,.08)" }}>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as "htdemucs_ft" | "htdemucs")}
                disabled={phase === "separating" || phase === "decoding"}
                className="rounded-sm px-2 py-1 font-mono text-[10px] outline-none disabled:opacity-50"
                style={{ background: "#0d0e10", color: "#e9e5f0", border: "1px solid #000" }}
              >
                {Object.entries(MODEL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {[
                { label: "DÉBRUITAGE", checked: denoise, set: setDenoise },
                { label: "ULTRA", checked: ultra, set: setUltra },
                { label: "WAV", checked: lossless, set: setLossless },
              ].map((t) => (
                <button
                  key={t.label}
                  onClick={() => t.set((v: boolean) => !v)}
                  className="rounded-sm px-2 py-1 text-[9px] font-bold tracking-wide"
                  style={membraneBtn(t.checked, "#38bdf8")}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {phase !== "idle" && (
              <div className="mt-2 flex flex-col gap-1">
                <p className="text-[10px]" style={{ color: "#8d8697" }}>{msg}</p>
                {(phase === "separating" || phase === "fetching") && (
                  <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-sm p-[2px]" style={{ background: "#0d0e10", border: "1px solid #000" }}>
                    {Array.from({ length: 24 }).map((_, i) => {
                      const pct = phase === "fetching" ? 40 : Math.max(4, progress ?? 4);
                      const lit = i / 24 < pct / 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-[1px]"
                          style={{
                            background: lit ? "#e879f9" : "#2a2b2e",
                            boxShadow: lit ? "0 0 4px rgba(232,121,249,.8)" : "none",
                            opacity: phase === "fetching" ? 0.5 : 1,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============ LOWER BAY (dark) ============ */}
        <div className="flex flex-col gap-3 p-3" style={{ background: "linear-gradient(180deg,#16171a,#0e0f11)" }}>
          {phase === "ready" && (
            <>
              {/* ---------- transport module ---------- */}
              <div className="rounded-md p-2.5" style={moduleStyle}>
                {moduleLabel("Transport")}
                <div className="rounded-sm p-1.5" style={{ background: "#0d0e10", border: "1px solid #000", boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)" }}>
                  <Waveform peaks={peaks} progress={duration ? position / duration : 0} cue={0} color="#e879f9" onSeek={onSeek} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button onClick={togglePlay} className="rounded-sm px-4 py-1.5 text-xs font-bold" style={membraneBtn(playing, "#22c55e")}>
                    {playing ? "❚❚ PAUSE" : "▶ LECTURE"}
                  </button>
                  <span className="font-mono text-[10px]" style={{ color: "#c9c2d4" }}>
                    {fmtTime(position)} / {fmtTime(duration)}
                  </span>
                  <div className="flex flex-1 flex-wrap justify-end gap-1">
                    {(["vocals", "instrumental", "mix", "original"] as OutputMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => changeOutputMode(m)}
                        className="rounded-sm px-2.5 py-1 text-[10px] font-bold"
                        style={membraneBtn(outputMode === m, "#38bdf8")}
                      >
                        {m === "vocals" ? "VOIX" : m === "instrumental" ? "INSTRU" : m === "mix" ? "MIX" : "ORIGINAL"}
                      </button>
                    ))}
                  </div>
                  <Knob label="MASTER" value={masterVol} min={0} max={1} defaultValue={0.9} onChange={changeMasterVol} size={40} color="#38bdf8" />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {vocalsBlobUrl && (
                    <a
                      href={vocalsBlobUrl}
                      download={`${trackName || "voix"}.${lossless ? "wav" : "mp3"}`}
                      className="rounded-sm px-3 py-1.5 text-[10px] font-bold"
                      style={membraneBtn(false)}
                    >
                      ⤓ TÉLÉCHARGER LA VOIX ISOLÉE
                    </a>
                  )}
                  <button
                    onClick={exportProcessedVocal}
                    disabled={rendering}
                    className="rounded-sm px-3 py-1.5 text-[10px] font-bold disabled:opacity-50"
                    style={membraneBtn(false)}
                  >
                    {rendering ? "RENDU…" : "⤓ EXPORTER LA VOIX + EFFETS (WAV)"}
                  </button>
                </div>
              </div>

              {/* ---------- vocoder rack ---------- */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* PITCH / ROBOT */}
                <div className="rounded-md p-2.5" style={moduleStyle}>
                  {moduleLabel("Pitch", "#facc15")}
                  <div className="flex flex-col items-center gap-2">
                    <Knob
                      label="Semitones"
                      value={params.pitchSemis}
                      min={-12}
                      max={12}
                      defaultValue={0}
                      onChange={(v) => setParam("pitchSemis", v)}
                      color="#facc15"
                      format={(v) => v.toFixed(0)}
                      led
                    />
                    <button
                      onClick={() => setParam("robotOn", !params.robotOn)}
                      className="w-full rounded-sm px-2 py-1 text-[10px] font-bold"
                      style={membraneBtn(params.robotOn, "#facc15")}
                    >
                      ROBOT (QUANTIFIÉ)
                    </button>
                    <button
                      onClick={() => setParam("formantLock", !params.formantLock)}
                      title="Approximatif : passe par un vocodeur interne pour garder le grain de voix d'origine — pas une correction de formants studio."
                      className="w-full rounded-sm px-2 py-1 text-[10px] font-bold"
                      style={membraneBtn(params.formantLock, "#facc15")}
                    >
                      FORMANT LOCK (APPROX.)
                    </button>
                    <select
                      value={params.harmonize}
                      onChange={(e) => setParam("harmonize", e.target.value as HarmonizeMode)}
                      className="w-full rounded-sm px-2 py-1 font-mono text-[10px] outline-none"
                      style={{ background: "#0d0e10", color: "#e9e5f0", border: "1px solid #000" }}
                    >
                      {harmonizeOptions.map((o) => (
                        <option key={o.v} value={o.v}>
                          Harmonie : {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* VOCODER */}
                <div className="rounded-md p-2.5" style={moduleStyle}>
                  {moduleLabel("Vocodeur")}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => setParam("vocoderOn", !params.vocoderOn)}
                      className="w-full rounded-sm px-2 py-1 text-[10px] font-bold"
                      style={membraneBtn(params.vocoderOn)}
                    >
                      {params.vocoderOn ? "ON" : "OFF"}
                    </button>
                    <Knob label="Mix" value={params.vocoderMix} min={0} max={1} defaultValue={1} onChange={(v) => setParam("vocoderMix", v)} color="#e879f9" led />
                    <select
                      value={params.carrier}
                      onChange={(e) => setParam("carrier", e.target.value as CarrierType)}
                      className="w-full rounded-sm px-2 py-1 font-mono text-[10px] outline-none"
                      style={{ background: "#0d0e10", color: "#e9e5f0", border: "1px solid #000" }}
                    >
                      {carrierOptions.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {params.carrier === "synth" && (
                      <Knob
                        label="Note"
                        value={params.carrierNote}
                        min={24}
                        max={72}
                        defaultValue={45}
                        onChange={(v) => setParam("carrierNote", Math.round(v))}
                        color="#e879f9"
                        format={(v) => v.toFixed(0)}
                      />
                    )}
                  </div>
                </div>

                {/* EQ / DE-ESS */}
                <div className="rounded-md p-2.5" style={moduleStyle}>
                  {moduleLabel("EQ · De-ess", "#34d399")}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-2">
                      <Knob label="Low" value={params.eqLow} min={-12} max={12} defaultValue={0} onChange={(v) => setParam("eqLow", v)} size={40} color="#34d399" led />
                      <Knob label="Mid" value={params.eqMid} min={-12} max={12} defaultValue={0} onChange={(v) => setParam("eqMid", v)} size={40} color="#34d399" led />
                      <Knob label="High" value={params.eqHigh} min={-12} max={12} defaultValue={0} onChange={(v) => setParam("eqHigh", v)} size={40} color="#34d399" led />
                    </div>
                    <Knob label="De-ess" value={params.deess} min={0} max={18} defaultValue={0} onChange={(v) => setParam("deess", v)} color="#34d399" led />
                  </div>
                </div>

                {/* REVERB / DELAY + bonus FX */}
                <div className="rounded-md p-2.5" style={moduleStyle}>
                  {moduleLabel("Espace", "#38bdf8")}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-2">
                      <Knob label="Reverb" value={params.reverbWet} min={0} max={1} defaultValue={0} onChange={(v) => setParam("reverbWet", v)} size={40} color="#38bdf8" led />
                      <Knob label="Delay" value={params.delayWet} min={0} max={1} defaultValue={0} onChange={(v) => setParam("delayWet", v)} size={40} color="#38bdf8" led />
                    </div>
                    <div className="grid w-full grid-cols-2 gap-1">
                      {FX_LIST.filter((f) => f.id !== "reverb" && f.id !== "echo").map((f) => (
                        <div key={f.id} className="flex flex-col items-center gap-1">
                          <Knob
                            label={f.label}
                            value={bonusFx[f.id]}
                            min={0}
                            max={1}
                            defaultValue={0}
                            onChange={(v) => setBonusWet(f.id, v)}
                            size={34}
                            color={f.color}
                            led
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------- lyrics (AI transcription) — teleprompter LCD ---------- */}
              <div className="rounded-md p-2.5" style={moduleStyle}>
                <div className="mb-1.5 flex items-center justify-between">
                  {moduleLabel("🤖 Paroles (IA — Groq Whisper)")}
                  <button
                    onClick={transcribeLyrics}
                    disabled={lyricsLoading}
                    className="rounded-sm px-3 py-1.5 text-[10px] font-bold disabled:opacity-50"
                    style={membraneBtn(false)}
                  >
                    {lyricsLoading ? "TRANSCRIPTION…" : lyrics ? "↻ RETRANSCRIRE" : "▶ TRANSCRIRE LES PAROLES"}
                  </button>
                </div>
                {lyricsError && <p className="text-[10px] text-red-400">{lyricsError}</p>}
                {lyrics && lyrics.length > 0 && (
                  <>
                    <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-sm p-2 font-mono" style={lcdStyle}>
                      {lyrics.map((seg, i) => (
                        <button
                          key={i}
                          onClick={() => seekTo(seg.start)}
                          className="flex gap-2 rounded-sm px-1.5 py-1 text-left text-[11px] hover:brightness-125"
                          style={{
                            background: position >= seg.start && position < seg.end ? "rgba(232,121,249,.25)" : "transparent",
                            color: position >= seg.start && position < seg.end ? "#fbe4fe" : "#c98ee0",
                          }}
                        >
                          <span className="shrink-0" style={{ color: "#8d5799" }}>{fmtTime(seg.start)}</span>
                          <span className="truncate">{seg.text}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => downloadText(`${trackName || "paroles"}.srt`, segmentsToSrt(lyrics))}
                        className="rounded-sm px-3 py-1.5 text-[10px] font-bold"
                        style={membraneBtn(false)}
                      >
                        ⤓ .SRT
                      </button>
                      <button
                        onClick={() => downloadText(`${trackName || "paroles"}.txt`, lyrics.map((s) => s.text).join("\n"))}
                        className="rounded-sm px-3 py-1.5 text-[10px] font-bold"
                        style={membraneBtn(false)}
                      >
                        ⤓ .TXT
                      </button>
                    </div>
                  </>
                )}
                {lyrics && lyrics.length === 0 && !lyricsLoading && (
                  <p className="text-[10px]" style={{ color: "#8d8697" }}>Aucune parole détectée (voix trop faible/instrumentale ?).</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
