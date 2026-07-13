"use client";
import { useRef, useState } from "react";

type Model = "htdemucs" | "htdemucs_6s";
type Phase = "idle" | "working" | "ready" | "error";

const MAX_SEC = 8 * 60; // Demucs + basic-pitch on CPU can't keep up beyond this

// read a File's duration without decoding the full PCM (cheap: just metadata)
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

// Upload a track → separate its stems (Demucs) → transcribe each stem to MIDI
// (basic-pitch + drum onset detection) → download ONE multi-track MIDI file with
// every instrument on its own track. The heavy work runs on the server; we kick
// it off (prefetch) then poll until the combined MIDI is cached, so the request
// never blocks for minutes.
export function StemsMidiConverter() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [model, setModel] = useState<Model>("htdemucs_6s");
  const [msg, setMsg] = useState("");
  const [dl, setDl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDl(null);

    // Demucs + basic-pitch on CPU can't realistically finish beyond ~8 min of
    // audio (same limit as the deck's live stem separation) — refuse up front
    // instead of burning minutes on a job that will time out.
    try {
      const dur = await probeDuration(file);
      if (dur > MAX_SEC) {
        setPhase("error");
        setMsg(`Morceau de ${Math.round(dur / 60)} min — trop long (limite 8 min pour la séparation de stems).`);
        e.target.value = "";
        return;
      }
    } catch {
      /* metadata probe failed — let the server pipeline surface any real error */
    }

    setFileName(file.name);
    setPhase("working");
    setMsg("Analyse… séparation des stems puis transcription MIDI (plusieurs minutes)");

    const bytes = await file.arrayBuffer();
    const q = `model=${model}`;
    try {
      // 1. kick off the background job
      const r = await fetch(`/api/stems/midi?${q}&prefetch=1`, { method: "POST", body: bytes.slice(0) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const hash: string = j.hash;
      if (j.cached) return finish(hash);

      // 2. poll until the combined MIDI is ready
      const poll = async () => {
        try {
          const pr = await fetch(`/api/stems/midi?${q}&probe=1`, { method: "POST", body: bytes.slice(0) });
          const pj = await pr.json();
          if (pj.cached) return finish(pj.hash);
        } catch {
          /* transient — keep polling */
        }
        pollRef.current = setTimeout(poll, 4000);
      };
      pollRef.current = setTimeout(poll, 4000);
    } catch (err) {
      setPhase("error");
      setMsg((err as Error).message || "Échec de la conversion");
    }
  }

  function finish(hash: string) {
    if (pollRef.current) clearTimeout(pollRef.current);
    const url = `/api/stems/midi?hash=${hash}&model=${model}`;
    setDl(url);
    setPhase("ready");
    setMsg("MIDI prêt — un instrument par piste.");
    // auto-start the download
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, "") || "stems"}.mid`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-black/30 p-2.5 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">
          ♪ Stems → MIDI
        </span>
        {phase === "working" && <span className="animate-pulse text-[9px] text-amber-300">analyse…</span>}
        {phase === "ready" && <span className="text-[9px] text-emerald-300">prêt ✓</span>}
      </div>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value as Model)}
        disabled={phase === "working"}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs outline-none ring-1 ring-neutral-700 focus:ring-fuchsia-500 disabled:opacity-50"
      >
        <option value="htdemucs">4 instruments (batterie · basse · voix · autre)</option>
        <option value="htdemucs_6s">6 instruments (+ guitare · piano)</option>
      </select>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={phase === "working"}
        className="hw-btn hw-btn-on px-3 py-1.5 text-xs disabled:opacity-50"
        style={{ ["--led" as string]: "#e879f9" }}
      >
        ♪ Charger un morceau → MIDI
      </button>
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />

      {dl && (
        <a
          href={dl}
          download={`${fileName.replace(/\.[^.]+$/, "") || "stems"}.mid`}
          className="hw-btn px-3 py-1.5 text-center text-xs"
          style={{ ["--led" as string]: "#34d399" }}
        >
          ⤓ Re-télécharger le MIDI
        </a>
      )}

      {msg && <p className="text-[9px] leading-tight text-neutral-500">{msg}</p>}
      <p className="text-[9px] leading-tight text-neutral-600">
        Demucs (stems) + basic-pitch (audio→MIDI) · 1 piste par instrument, même fichier.
      </p>
    </div>
  );
}
