"use client";
import { useEffect, useRef, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export function MasterRecorder({ engine }: { engine: DJEngine }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 500);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => () => recRef.current?.stop(), []);

  function start() {
    setErr(null);
    const mime = pickMime();
    if (mime === null) {
      setErr("Enregistrement non supporté par ce navigateur");
      return;
    }
    const rec = new MediaRecorder(engine.backgroundAudioStream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("mp4") ? "m4a" : "webm";
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `djsynth-set-${stamp}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    };
    rec.start(1000);
    recRef.current = rec;
    startedAtRef.current = performance.now();
    setElapsed(0);
    setRecording(true);
  }

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={recording ? stop : start}
        className={`hw-btn px-3 py-2 text-sm font-bold ${recording ? "hw-btn-on" : ""}`}
        style={{ ["--led" as string]: "#ef4444", color: recording ? "#fff" : "#ef4444" }}
        title={recording ? "Arrêter et télécharger l'enregistrement du set" : "Enregistrer la sortie master (le set complet) et le télécharger à l'arrêt"}
      >
        {recording ? `■ STOP ${fmt(elapsed)}` : "● REC"}
      </button>
      {err && <span className="text-[10px] font-bold text-red-400">{err}</span>}
    </div>
  );
}
