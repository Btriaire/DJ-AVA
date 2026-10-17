"use client";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { encodeWav } from "@/lib/audio/engine";
import type { Region, WorkSample } from "@/lib/atelier/types";
import { Previewer, SampleKeys } from "@/lib/atelier/players";
import { addToBank } from "@/lib/atelier/bank";
import * as ed from "@/lib/atelier/edit";
import { downloadBlob } from "@/lib/atelier/download";
import { Knob } from "../Knob";
import { detectBPM } from "@/lib/audio/bpm";
import { detectKey } from "@/lib/audio/key";
import { loadLibrary, idbGetBlob } from "@/lib/library";
import { WaveEditor } from "./WaveEditor";
import { EditTools, type ApplyResult } from "./EditTools";
import { SampleList } from "./SampleList";
import { StemWorkbench } from "./StemWorkbench";
import { BankPanel } from "./BankPanel";
import { MiniKeys } from "./MiniKeys";

const COLOR = "#22d3ee";

export function AtelierView({ engine }: { engine: DJEngine }) {
  const [preview] = useState(() => new Previewer(engine.ctx, engine.masterIn));
  const [keys] = useState(() => new SampleKeys(engine.ctx, engine.masterIn));
  const [track, setTrack] = useState<{
    name: string;
    buf: AudioBuffer;
    bpm: number;
    key: string;
    offset: number;
  } | null>(null);
  const [undo, setUndo] = useState<{ buf: AudioBuffer; bpm: number }[]>([]);
  const [sel, setSel] = useState<Region | null>(null);
  const [samples, setSamples] = useState<WorkSample[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [bankVersion, setBankVersion] = useState(0);
  const [loop, setLoop] = useState(false);
  const [sens, setSens] = useState(0.5);
  const [libId, setLibId] = useState("");
  const [trackPlaying, setTrackPlaying] = useState(false);
  const [, setKeysVersion] = useState(0);
  const toKeys = useCallback((buf: AudioBuffer, name: string) => {
    keys.setSample(buf, name);
    setKeysVersion((v) => v + 1);
  }, [keys]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const playingTrack = useRef(false);

  const playhead = useCallback(() => (trackPlaying ? preview.position() : null), [preview, trackPlaying]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (clearConfirm) setClearConfirm(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [clearConfirm]);

  useEffect(() => {
    return () => {
      preview.stop();
      keys.allOff();
    };
  }, [preview, keys]);

  const open = useCallback(async (name: string, buf: AudioBuffer, bpm?: number) => {
    preview.stop();
    setBusy("Analyse…");
    try {
      const detectedBpm = bpm || detectBPM(buf);
      const keyInfo = await detectKey(buf);
      const keyText = keyInfo ? `${keyInfo.camelot} · ${keyInfo.name}` : "";
      const onsets = ed.onsets(buf, 0.5);
      const offset = onsets[0] ?? 0;

      setTrack({ name, buf, bpm: detectedBpm, key: keyText, offset });
      setUndo([]);
      setSel(null);
    } catch {
      setErr("Analyse impossible");
    } finally {
      setBusy("");
    }
  }, [preview]);

  const loadBytes = useCallback(async (name: string, bytes: ArrayBuffer) => {
    setBusy("Décodage…");
    try {
      const buf = await engine.ctx.decodeAudioData(bytes);
      await open(name, buf);
    } catch {
      setErr("Décodage impossible");
    } finally {
      setBusy("");
    }
  }, [engine.ctx, open]);

  const apply = useCallback(async (label: string, run: () => Promise<ApplyResult>) => {
    if (!track) return;
    preview.stop();
    setBusy(`${label}…`);
    try {
      const res = await run();
      setUndo(prev => [{ buf: track.buf, bpm: track.bpm }, ...prev].slice(0, 5));
      setTrack(prev => ({
        ...prev!,
        buf: res.buf,
        bpm: res.bpm !== undefined ? res.bpm : prev!.bpm
      }));
      if (res.sel !== undefined) setSel(res.sel);
    } catch {
      setErr(`${label} impossible`);
    } finally {
      setBusy("");
    }
  }, [track, preview]);

  const undoLast = useCallback(() => {
    if (!track || undo.length === 0) return;
    const last = undo[0];
    setUndo(prev => prev.slice(1));
    setTrack(prev => ({ ...prev!, buf: last.buf, bpm: last.bpm }));
  }, [track, undo]);

  const exportTrack = useCallback(async (fmt: "wav" | "mp3") => {
    if (!track) return;
    preview.stop();
    const buf = sel ? ed.slice(track.buf, sel) : track.buf;
    if (fmt === "wav") {
      downloadBlob(encodeWav(buf, 24), `${track.name}${sel ? "-selection" : ""}.wav`);
    } else {
      setBusy("Encodage MP3…");
      try {
        const wav = encodeWav(buf, 24);
        const res = await fetch("/api/audio/mp3", {
          method: "POST",
          body: wav
        });
        if (res.ok) {
          downloadBlob(await res.blob(), `${track.name}${sel ? "-selection" : ""}.mp3`);
        } else {
          setErr("Export MP3 impossible");
        }
      } catch {
        setErr("Export MP3 impossible");
      } finally {
        setBusy("");
      }
    }
  }, [track, sel, preview]);

  const addSample = useCallback((buf: AudioBuffer, name: string, at?: number) => {
    setSamples(prev => [...prev, {
      id: Math.random().toString(36).slice(2, 10),
      name,
      buf,
      from: track?.name ?? "",
      bpm: track?.bpm ?? 0,
      key: buf.duration >= 4 ? (detectKey(buf)?.name ?? "") : (track?.key ?? ""),
      at
    }]);
  }, [track]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("Chargement…");
    try {
      const bytes = await file.arrayBuffer();
      await loadBytes(file.name, bytes);
      e.target.value = "";
    } catch {
      setErr("Chargement impossible");
    } finally {
      setBusy("");
    }
  }, [loadBytes]);

  const tracks = useMemo(() => loadLibrary().tracks, []);

  const handleLibOpen = useCallback(async () => {
    const t = tracks.find((x) => x.id === libId);
    if (!t) return;
    setBusy("Chargement…");
    try {
      let bytes: ArrayBuffer;
      if (t.source === "local") {
        const blob = await idbGetBlob(t.id);
        if (!blob) throw new Error("Morceau local introuvable");
        bytes = await blob.arrayBuffer();
      } else {
        const res = await fetch(`/api/${t.source}/stream?id=${encodeURIComponent(t.url ?? "")}`);
        if (!res.ok) throw new Error("Téléchargement impossible");
        bytes = await res.arrayBuffer();
      }
      await loadBytes(t.name, bytes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setBusy("");
    }
  }, [tracks, libId, loadBytes]);

  const handleDeckOpen = useCallback(async (side: "A" | "B") => {
    const d = side === "A" ? engine.deckA : engine.deckB;
    if (!d.audioBuffer) {
      setErr(`Pas de morceau sur la platine ${side}`);
      return;
    }
    await open(d.name, d.audioBuffer, d.bpm);
  }, [engine.deckA, engine.deckB, open]);

  const handlePlay = useCallback(() => {
    if (!track) return;
    playingTrack.current = true;
    setTrackPlaying(true);
    preview.play(
      track.buf,
      sel ? sel.a : 0,
      sel ? sel.b : track.buf.duration,
      loop
    );
  }, [track, sel, loop, preview]);

  const handleStop = useCallback(() => {
    playingTrack.current = false;
    setTrackPlaying(false);
    preview.stop();
  }, [preview]);

  const handleSlice = useCallback(async (bars: number) => {
    if (!track || track.bpm <= 0) return;
    setBusy("Découpage…");
    try {
      const regions = ed.barRegions(
        track.buf.duration,
        track.bpm,
        sel ? sel.a : track.offset,
        bars
      ).slice(0, 64);
      const cuts = regions.map((r, i) => {
        const buf = ed.slice(track.buf, r);
        return {
          buf,
          name: `${track.name} ${samples.length + i + 1}`,
          at: r.a
        };
      });
      cuts.forEach(s => addSample(s.buf, s.name, s.at));
    } catch {
      setErr("Découpage impossible");
    } finally {
      setBusy("");
    }
  }, [track, sel, samples, addSample]);

  const handleOnsets = useCallback(async () => {
    if (!track) return;
    setBusy("Recherche d&apos;attaques…");
    try {
      const onsets = ed.onsets(track.buf, sens);
      const regions = [];
      for (let i = 0; i < onsets.length; i++) {
        const a = onsets[i];
        const b = i < onsets.length - 1 ? onsets[i + 1] : track.buf.duration;
        if (b - a >= 0.05) {
          regions.push({ a, b });
        }
      }
      const cuts = regions.slice(0, 64).map((r, i) => {
        const buf = ed.slice(track.buf, r);
        return {
          buf,
          name: `${track.name} ${samples.length + i + 1}`,
          at: r.a
        };
      });
      cuts.forEach(s => addSample(s.buf, s.name, s.at));
    } catch {
      setErr("Recherche d&apos;attaques impossible");
    } finally {
      setBusy("");
    }
  }, [track, sens, samples, addSample]);

  const handleClearSamples = useCallback(() => {
    if (clearConfirm) {
      setSamples([]);
      setCurId(null);
      setClearConfirm(false);
    } else {
      setClearConfirm(true);
    }
  }, [clearConfirm]);

  const currentSample = useMemo(() => samples.find(s => s.id === curId) || null, [samples, curId]);

  const sampleMarks = useMemo(() => {
    if (!track) return [];
    return samples
      .filter(s => s.from === track.name && s.at !== undefined)
      .map(s => s.at!);
  }, [track, samples]);

  const selDuration = useMemo(() => {
    if (!sel) return "";
    const dur = sel.b - sel.a;
    const mins = Math.floor(dur / 60);
    const secs = Math.floor(dur % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [sel]);

  const trackDuration = useMemo(() => {
    if (!track) return "";
    const dur = track.buf.duration;
    const mins = Math.floor(dur / 60);
    const secs = Math.floor(dur % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [track]);

  return (
    <div className="flex flex-col gap-3 pb-48">
      <div className="hw-panel p-3">
        <h1 className="text-sm font-black tracking-[0.25em]" style={{ color: COLOR }}>ATELIER</h1>
        <p className="text-[11px] text-neutral-400">
          Prépare tes samples et tes stems hors mix : récupère un single, retouche le son, découpe, sépare en stems, sauve dans la banque et rejoue au clavier ou sur n&apos;importe quel single.
        </p>
        {(engine.deckA.playing || engine.deckB.playing) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-300 ring-1 ring-amber-500/30">
            <p>Une platine joue : l&apos;atelier est fait pour préparer hors mix (la séparation de stems charge beaucoup le processeur).</p>
            <button
              className="hw-btn mt-1"
              onClick={() => {
                engine.deckA.pause();
                engine.deckB.pause();
              }}
            >
              PAUSE DES PLATINES
            </button>
          </div>
        )}
      </div>

      <div className="hw-panel flex flex-wrap items-center gap-2 p-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Source</h2>
        <select
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          value={libId}
          onChange={(e) => setLibId(e.target.value)}
        >
          <option value="">Choisir un morceau</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="hw-btn px-2 py-1 text-[11px] font-bold" disabled={!libId || !!busy} onClick={handleLibOpen}>
          OUVRIR
        </button>
        <label className="hw-btn px-2 py-1 text-[11px] font-bold cursor-pointer">
          FICHIER…
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => handleDeckOpen("A")}
        >
          PLATINE A
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => handleDeckOpen("B")}
        >
          PLATINE B
        </button>
        {track && (
          <div className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="font-bold">{track.name}</span>
            <span>{trackDuration}</span>
            <span>BPM {track.bpm.toFixed(1)}</span>
            {track.key && <span>{track.key}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {busy && <span className="text-[11px]" style={{ color: COLOR }}>{busy}</span>}
        {err && (
          <div className="flex items-center gap-1 text-[11px] text-red-500">
            <span>✕ {err}</span>
            <button className="text-[11px]" onClick={() => setErr("")}>✕</button>
          </div>
        )}
      </div>

      {track && (
        <div className="hw-panel p-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Morceau</h2>
          <WaveEditor
            buf={track.buf}
            sel={sel}
            onSel={setSel}
            playhead={playhead}
            grid={{ bpm: track.bpm, offset: track.offset }}
            marks={sampleMarks}
            color={COLOR}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${trackPlaying && preview.playing ? "hw-btn-on" : ""}`}
              onClick={handlePlay}
            >
              ▶ LIRE
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={handleStop}
            >
              ■ STOP
            </button>
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${loop ? "hw-btn-on" : ""}`}
              onClick={() => setLoop(!loop)}
            >
              BOUCLE
            </button>
            {sel && <span className="text-[11px]">{selDuration}</span>}
          </div>
          <EditTools
            buf={track.buf}
            sel={sel}
            bpm={track.bpm}
            color={COLOR}
            busy={!!busy}
            canUndo={undo.length > 0}
            onApply={apply}
            onUndo={undoLast}
            onExport={exportTrack}
          />
        </div>
      )}

      <div className="hw-panel flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Samples</h2>
          <span className="text-[11px]">{samples.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {track && sel && (
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => {
                if (!track) return;
                const buf = ed.slice(track.buf, sel);
                addSample(buf, `${track.name} ${samples.length + 1}`, sel.a);
              }}
            >
              + SAMPLE
            </button>
          )}
          {track && track.bpm > 0 && (
            <>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleSlice(1)}
              >
                DÉCOUPER EN 1 MESURE
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleSlice(2)}
              >
                DÉCOUPER EN 2 MESURES
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleSlice(4)}
              >
                DÉCOUPER EN 4 MESURES
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleSlice(8)}
              >
                DÉCOUPER EN 8 MESURES
              </button>
            </>
          )}
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={handleOnsets}
            disabled={!track}
          >
            ATTAQUES
          </button>
          <Knob
            label="SENSIBILITÉ"
            value={sens}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={setSens}
            color={COLOR}
            size={32}
            format={(v) => v.toFixed(2)}
          />
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ml-auto ${clearConfirm ? "bg-red-500 text-white" : ""}`}
            onClick={handleClearSamples}
          >
            {clearConfirm ? "SÛR ?" : "VIDER LA LISTE"}
          </button>
        </div>
        <SampleList
          samples={samples}
          curId={curId}
          savedIds={savedIds}
          color={COLOR}
          onSelect={setCurId}
          onRename={(id, name) => {
            setSamples(prev => prev.map(s => s.id === id ? { ...s, name } : s));
          }}
          onRemove={(id) => {
            setSamples(prev => prev.filter(s => s.id !== id));
            if (id === curId) setCurId(null);
          }}
          onPlay={(s, loop) => {
            playingTrack.current = false;
            setTrackPlaying(false);
            preview.play(s.buf, 0, s.buf.duration, loop);
          }}
          onSave={async (s) => {
            try {
              const wav = encodeWav(s.buf, 24);
              await addToBank(wav, {
                name: s.name,
                kind: "sample",
                from: s.from,
                bpm: s.bpm,
                key: s.key,
                dur: s.buf.duration,
                tags: ""
              });
              setSavedIds(prev => new Set(prev).add(s.id));
              setBankVersion(v => v + 1);
            } catch {
              setErr("Sauvegarde impossible");
            }
          }}
          onKeys={(s) => toKeys(s.buf, s.name)}
          onWav={(s) => {
            downloadBlob(encodeWav(s.buf, 24), `${s.name}.wav`);
          }}
        />
      </div>

      {currentSample && (
        <StemWorkbench
          key={currentSample.id}
          engine={engine}
          sample={currentSample}
          color={COLOR}
          preview={preview}
          onNewSample={addSample}
          onSaved={() => setBankVersion(v => v + 1)}
          toKeys={toKeys}
        />
      )}

      <BankPanel
        engine={engine}
        version={bankVersion}
        onChanged={() => setBankVersion(v => v + 1)}
        toKeys={toKeys}
        preview={preview}
        color={COLOR}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
        <MiniKeys keys={keys} color={COLOR} active />
      </div>
    </div>
  );
}
