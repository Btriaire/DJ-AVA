"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Knob } from "../Knob";
import { encodeWav } from "@/lib/audio/engine";
import { downloadBlob } from "@/lib/atelier/download";
import { sha1Hex16 } from "@/lib/audio/stemHash";
import * as ed from "@/lib/atelier/edit";
import { addToBank } from "@/lib/atelier/bank";
import type { DJEngine } from "@/lib/audio/engine";
import type { WorkSample } from "@/lib/atelier/types";
import type { Previewer } from "@/lib/atelier/players";

const STEM_NAMES: Record<string, string> = {
  vocals: "VOIX",
  drums: "BATTERIE",
  bass: "BASSE",
  other: "AUTRES",
  guitar: "GUITARE",
  piano: "PIANO",
};

const STEM_COLORS: Record<string, string> = {
  vocals: "#ff6b6b",
  drums: "#6bff6b",
  bass: "#6b6bff",
  other: "#ffd700",
  guitar: "#ff9900",
  piano: "#cc66ff",
};

type Stem = {
  name: string;
  buf: AudioBuffer;
  vol: number;
  mute: boolean;
  solo: boolean;
  rev: boolean;
};

type Status = "idle" | "sep" | "ready" | "error";

export function StemWorkbench({
  engine,
  sample,
  color,
  preview,
  onNewSample,
  onSaved,
  toKeys,
}: {
  engine: DJEngine;
  sample: WorkSample;
  color: string;
  preview: Previewer;
  onNewSample: (buf: AudioBuffer, name: string) => void;
  onSaved: () => void;
  toKeys: (buf: AudioBuffer, name: string) => void;
}) {
  const [model, setModel] = useState<"htdemucs" | "htdemucs_6s">("htdemucs");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string>("");
  const [stems, setStems] = useState<Stem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const abort = useRef<AbortController | null>(null);
  const mixSources = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  }[]>([]);

  const stopMix = useCallback(() => {
    mixSources.current.forEach(({ source, gain }) => {
      source.stop();
      gain.disconnect();
    });
    mixSources.current = [];
    setPlaying(false);
  }, []);

  const updateMixGains = useCallback(() => {
    const solo = stems.find((s) => s.solo);
    mixSources.current.forEach(({ gain }, i) => {
      const stem = stems[i];
      const targetGain = stem.mute || (solo && !stem.solo) ? 0 : stem.vol;
      gain.gain.setTargetAtTime(targetGain, engine.ctx.currentTime, 0.02);
    });
  }, [engine.ctx, stems]);

  const handleMix = useCallback(() => {
    if (playing) {
      stopMix();
      return;
    }

    preview.stop();
    setPlaying(true);
    const startTime = engine.ctx.currentTime + 0.05;
    const solo = stems.find((s) => s.solo);

    mixSources.current = stems.map((stem) => {
      const source = engine.ctx.createBufferSource();
      const gain = engine.ctx.createGain();

      const buf = stem.rev ? ed.reverse(stem.buf, { a: 0, b: stem.buf.duration }) : stem.buf;
      source.buffer = buf;
      source.loop = true;
      source.start(startTime);

      const targetGain = stem.mute || (solo && !stem.solo) ? 0 : stem.vol;
      gain.gain.setValueAtTime(targetGain, startTime);

      source.connect(gain).connect(engine.masterIn);
      return { source, gain };
    });
  }, [engine, preview, stems, playing, stopMix]);

  const handleQuickMix = useCallback((preset: "acapella" | "instru" | "drums" | "noDrums" | "all") => {
    setStems((prev) =>
      prev.map((stem) => {
        let mute = false;
        const solo = false; // a preset always clears the solos

        switch (preset) {
          case "acapella":
            mute = stem.name !== "vocals";
            break;
          case "instru":
            mute = stem.name === "vocals";
            break;
          case "drums":
            mute = stem.name !== "drums";
            break;
          case "noDrums":
            mute = stem.name === "drums";
            break;
          case "all":
            mute = false;
            break;
        }

        return { ...stem, mute, solo };
      })
    );
  }, []);

  const handleSeparate = useCallback(async () => {
    if (status === "sep") return;

    setStatus("sep");
    setProgress(0);
    setErr("");
    abort.current = new AbortController();

    try {
      const bytes = await encodeWav(sample.buf, 24).arrayBuffer();
      const hash = await sha1Hex16(bytes);

      const progressInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/stems/progress?hash=${hash}&model=${model}&wav=1`, {
            signal: abort.current?.signal,
          });
          const data = await res.json();
          if (data.progress !== null) setProgress(data.progress);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          console.error(e);
        }
      }, 1000);

      try {
        const res = await fetch(`/api/stems/separate?model=${model}&wav=1`, {
          method: "POST",
          body: bytes,
          signal: abort.current?.signal,
        });

        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const { stems: stemNames } = await res.json();

        const newStems: Stem[] = [];
        for (const name of stemNames) {
          const stemRes = await fetch(`/api/stems/${hash}/${name}?model=${model}&wav=1`, {
            signal: abort.current?.signal,
          });
          if (!stemRes.ok) throw new Error(`Stem introuvable : ${name}`);
          const stemBytes = await stemRes.arrayBuffer();
          const buf = await engine.ctx.decodeAudioData(stemBytes);
          newStems.push({
            name,
            buf,
            vol: 1,
            mute: false,
            solo: false,
            rev: false,
          });
        }

        setStems(newStems);
        setStatus("ready");
      } finally {
        clearInterval(progressInterval);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("idle");
      } else {
        setStatus("error");
        setErr(e instanceof Error ? e.message : "Erreur inconnue");
      }
    }
  }, [engine.ctx, model, sample.buf, status]);

  const handleSaveStem = useCallback(
    async (stem: Stem) => {
      try {
        const buf = stem.rev ? ed.reverse(stem.buf, { a: 0, b: stem.buf.duration }) : stem.buf;
        const wav = encodeWav(buf, 24);
        const name = `${sample.name} · ${STEM_NAMES[stem.name] || stem.name.toUpperCase()}`;

        await addToBank(wav, {
          name,
          kind: "stem",
          stem: stem.name,
          from: sample.from,
          bpm: sample.bpm,
          key: sample.key,
          dur: buf.duration,
          tags: "",
        });

        setSaved((prev) => new Set(prev).add(stem.name));
        onSaved();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur de sauvegarde");
      }
    },
    [sample, onSaved]
  );

  const handleMixToSample = useCallback(async () => {
    const mixedBuf = await ed.mixStems(
      stems.map((stem) => ({
        buf: stem.rev ? ed.reverse(stem.buf, { a: 0, b: stem.buf.duration }) : stem.buf,
        gain: stem.mute ? 0 : stem.vol,
      }))
    );
    onNewSample(mixedBuf, `${sample.name} · mix`);
  }, [stems, sample.name, onNewSample]);

  useEffect(() => {
    return () => {
      abort.current?.abort();
      stopMix();
    };
  }, [stopMix]);

  useEffect(() => {
    if (playing) updateMixGains();
  }, [playing, stems, updateMixGains]);

  return (
    <div className="hw-panel flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          STEMS DU SAMPLE
        </h2>
        <span style={{ color }}>{sample.name}</span>
      </div>

      <div className="flex gap-1">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${model === "htdemucs" ? "hw-btn-on" : ""}`}
          onClick={() => setModel("htdemucs")}
        >
          4 PISTES
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${model === "htdemucs_6s" ? "hw-btn-on" : ""}`}
          onClick={() => setModel("htdemucs_6s")}
        >
          6 PISTES
        </button>
      </div>

      <button
        className="hw-btn px-2 py-1 text-[11px] font-bold"
        onClick={handleSeparate}
        disabled={status === "sep"}
      >
        SÉPARER
      </button>

      {status === "sep" && (
        <div className="text-[11px]">
          Séparation… {progress !== null ? `${progress} %` : "0 %"}
        </div>
      )}

      {status === "error" && <div className="text-red-500 text-[11px]">{err}</div>}

      {status === "ready" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${playing ? "hw-btn-on" : ""}`}
              onClick={handleMix}
            >
              {playing ? "■ STOP" : "▶ MIX"}
            </button>

            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => handleQuickMix("acapella")}
            >
              ACAPELLA
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => handleQuickMix("instru")}
            >
              INSTRU
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => handleQuickMix("drums")}
            >
              BATTERIE SEULE
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => handleQuickMix("noDrums")}
            >
              SANS BATTERIE
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => handleQuickMix("all")}
            >
              TOUT
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {stems.map((stem) => (
              <div key={stem.name} className="flex flex-wrap items-center gap-1.5">
                <span style={{ color: STEM_COLORS[stem.name] || "#ffffff" }}>
                  {STEM_NAMES[stem.name] || stem.name.toUpperCase()}
                </span>

                <button
                  className="hw-btn px-2 py-1 text-[11px] font-bold"
                  onClick={() => preview.play(stem.rev ? ed.reverse(stem.buf, { a: 0, b: stem.buf.duration }) : stem.buf)}
                >
                  ▶
                </button>

                <button
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${stem.solo ? "hw-btn-on" : ""}`}
                  onClick={() =>
                    setStems((prev) =>
                      prev.map((s) =>
                        s.name === stem.name ? { ...s, solo: !s.solo } : { ...s, solo: false }
                      )
                    )
                  }
                >
                  SOLO
                </button>

                <button
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${stem.mute ? "hw-btn-on" : ""}`}
                  onClick={() =>
                    setStems((prev) =>
                      prev.map((s) => (s.name === stem.name ? { ...s, mute: !s.mute } : s))
                    )
                  }
                >
                  MUET
                </button>

                <Knob
                  label="VOL"
                  value={stem.vol}
                  min={0}
                  max={1.5}
                  defaultValue={1}
                  onChange={(v) =>
                    setStems((prev) =>
                      prev.map((s) => (s.name === stem.name ? { ...s, vol: v } : s))
                    )
                  }
                  color={STEM_COLORS[stem.name] || "#ffffff"}
                  size={32}
                  format={(v) => v.toFixed(1)}
                />

                <button
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${stem.rev ? "hw-btn-on" : ""}`}
                  onClick={() =>
                    setStems((prev) =>
                      prev.map((s) => (s.name === stem.name ? { ...s, rev: !s.rev } : s))
                    )
                  }
                >
                  INVERSÉ
                </button>

                <button
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${saved.has(stem.name) ? "hw-btn-on" : ""}`}
                  onClick={() => handleSaveStem(stem)}
                  disabled={saved.has(stem.name)}
                >
                  {saved.has(stem.name) ? "SAUVÉ" : "SAUVER"}
                </button>

                <button
                  className="hw-btn px-2 py-1 text-[11px] font-bold"
                  onClick={() =>
                    toKeys(
                      stem.rev ? ed.reverse(stem.buf, { a: 0, b: stem.buf.duration }) : stem.buf,
                      `${sample.name} · ${STEM_NAMES[stem.name] || stem.name.toUpperCase()}`
                    )
                  }
                >
                  CLAVIER
                </button>

                <button
                  className="hw-btn px-2 py-1 text-[11px] font-bold"
                  onClick={() => {
                    const buf = stem.rev ? ed.reverse(stem.buf, { a: 0, b: stem.buf.duration }) : stem.buf;
                    downloadBlob(encodeWav(buf, 24), `${sample.name}-${stem.name}.wav`);
                  }}
                >
                  ⤓ WAV
                </button>
              </div>
            ))}
          </div>

          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold mt-2"
            onClick={handleMixToSample}
          >
            MIX → NOUVEAU SAMPLE
          </button>
        </>
      )}
    </div>
  );
}
