"use client";
import { useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { loadPadPresets, savePadPresets, type Sampler } from "@/lib/audio/Sampler";
import { Knob } from "./Knob";

interface Props {
  engine: DJEngine;
}

// single luminous-yellow used by every per-pad potentiometer
const PAD_YELLOW = "#ffe000";

// one-octave note names for the Key-Shift pad keyboard
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];

// Serato-style colored-waveform editor for the selected pad. Renders the
// 3-band peaks (bass=red, mid=green, treble=blue), the beat grid, slice
// divisions, cue markers and draggable start/end trim handles. Clicking in
// "SET CUE" mode drops a cue at the pointer; slice/cue trigger buttons fire
// the corresponding region through the sampler's voice builder.
function WaveformEditor({
  sampler,
  sel,
  rev,
  onChange,
}: {
  sampler: Sampler;
  sel: number;
  rev: number;
  onChange: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cueMode, setCueMode] = useState(false);
  const drag = useRef<null | "start" | "end">(null);
  const pad = sampler.pads[sel];

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (w === 0) return;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0b0d";
    ctx.fillRect(0, 0, w, h);

    const peaks = pad.peaks;
    if (!peaks) {
      ctx.fillStyle = "#3a3a3a";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("— pad vide —", w / 2, h / 2);
      return;
    }
    const n = peaks.amp.length;
    const mid = h / 2;
    // colored waveform
    for (let x = 0; x < w; x++) {
      const b = Math.min(n - 1, Math.floor((x / w) * n));
      const a = peaks.amp[b];
      const bh = Math.max(0.5, a * mid * 0.95);
      ctx.strokeStyle = `rgb(${peaks.r[b]},${peaks.g[b]},${peaks.b[b]})`;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, mid - bh);
      ctx.lineTo(x + 0.5, mid + bh);
      ctx.stroke();
    }
    // beat grid
    const dur = pad.buffer?.duration ?? 0;
    if (dur > 0 && pad.beats.length > 1) {
      ctx.lineWidth = 1;
      pad.beats.forEach((t, idx) => {
        const x = (t / dur) * w;
        ctx.strokeStyle = idx % 4 === 0 ? "rgba(255,196,80,0.45)" : "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      });
    }
    // slice divisions (within the trimmed region)
    if (pad.slices > 0) {
      ctx.strokeStyle = "rgba(90,200,255,0.55)";
      ctx.setLineDash([3, 3]);
      for (let k = 1; k < pad.slices; k++) {
        const frac = pad.start + (pad.end - pad.start) * (k / pad.slices);
        const x = frac * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // dim the trimmed-away regions
    const sx = pad.start * w;
    const ex = pad.end * w;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, sx, h);
    ctx.fillRect(ex, 0, w - ex, h);
    // trim handles
    ctx.fillStyle = "#ff8a1e";
    ctx.fillRect(sx - 1, 0, 2, h);
    ctx.fillRect(sx - 5, 0, 10, 7);
    ctx.fillStyle = "#4dff84";
    ctx.fillRect(ex - 1, 0, 2, h);
    ctx.fillRect(ex - 5, 0, 10, 7);
    // cue markers
    pad.cues.forEach((c, idx) => {
      const x = c * w;
      ctx.fillStyle = "#facc15";
      ctx.fillRect(x - 1, 0, 2, h);
      ctx.fillRect(x, h - 11, 11, 11);
      ctx.fillStyle = "#000";
      ctx.font = "bold 8px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(String(idx + 1), x + 2.5, h - 2.5);
    });
  }, [pad, sel, rev, pad.peaks, pad.start, pad.end, pad.slices, pad.cues, pad.beats]);

  const fracFromEvent = (clientX: number) => {
    const cv = canvasRef.current;
    if (!cv) return 0;
    const rect = cv.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };
  const applyDrag = (f: number) => {
    if (drag.current === "start") sampler.setParam(sel, "start", Math.min(f, pad.end - 0.01));
    else if (drag.current === "end") sampler.setParam(sel, "end", Math.max(f, pad.start + 0.01));
    onChange();
  };
  const onDown = (e: React.PointerEvent) => {
    if (!pad.buffer) return;
    const f = fracFromEvent(e.clientX);
    if (cueMode) {
      sampler.addCue(sel, f);
      onChange();
      return;
    }
    drag.current = Math.abs(f - pad.start) <= Math.abs(f - pad.end) ? "start" : "end";
    (e.target as Element).setPointerCapture?.(e.pointerId);
    applyDrag(f);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current) applyDrag(fracFromEvent(e.clientX));
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
          Forme d&apos;onde
        </span>
        {pad.bpm > 0 && (
          <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">
            {pad.bpm} BPM
          </span>
        )}
        <span className="font-mono text-[9px] text-neutral-600">
          trim {Math.round(pad.start * 100)}–{Math.round(pad.end * 100)}%
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setCueMode((c) => !c)}
            className={`spd-btn px-1.5 text-[10px] ${cueMode ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#facc15" }}
            title="Active puis clique la forme d'onde pour poser un point de repère (cue)"
          >
            ✚ SET CUE
          </button>
          <button
            onClick={() => {
              sampler.clearCues(sel);
              onChange();
            }}
            className="spd-btn px-1.5 text-[10px]"
            title="Effacer les cues"
          >
            CLR CUE
          </button>
          <button
            onClick={() => {
              sampler.setParam(sel, "start", 0);
              sampler.setParam(sel, "end", 1);
              onChange();
            }}
            className="spd-btn px-1.5 text-[10px]"
            title="Réinitialiser le trim sur tout le sample"
          >
            ⤢ FULL
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="h-24 w-full touch-none rounded-md border border-[#3a1414] bg-black"
        style={{ cursor: cueMode ? "copy" : "ew-resize" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {/* slice / cue trigger pads */}
      {(pad.slices > 0 || pad.cues.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {pad.slices > 0 &&
            Array.from({ length: pad.slices }).map((_, k) => (
              <button
                key={`s${k}`}
                onMouseDown={() => sampler.playSlice(sel, k)}
                className="spd-btn px-1.5 text-[10px]"
                style={{ ["--led" as string]: "#5ac8ff" }}
                title={`Jouer la tranche ${k + 1}`}
              >
                ▷{k + 1}
              </button>
            ))}
          {pad.cues.map((_, k) => (
            <button
              key={`c${k}`}
              onMouseDown={() => sampler.playCue(sel, k)}
              className="spd-btn px-1.5 text-[10px]"
              style={{ ["--led" as string]: "#facc15" }}
              title={`Jouer le cue ${k + 1}`}
            >
              ◆{k + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// physical-key map (event.code) -> pad index, layout independent (AZERTY/QWERTY).
// Digits 1-9 mirror the 3x3 pad grid, row by row.
const PAD_KEYS: Record<string, number> = {
  Digit1: 0, Digit2: 1, Digit3: 2,
  Digit4: 3, Digit5: 4, Digit6: 5,
  Digit7: 6, Digit8: 7, Digit9: 8,
};

// Roland SPD-SX style sampling pad. 3x3 mesh pads with glowing red divider
// strips. Tap a pad = play + select; the bottom control strip edits the
// selected pad's performance FX (pitch, filter, decay/gain, reverb, reverse,
// loop). Double-tap a pad to load a file. GRAB captures 4 beats of a deck.
export function SamplerPanel({ engine }: Props) {
  const sampler = engine.sampler;
  const [rev, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [flash, setFlash] = useState<number | null>(null);
  const [sel, setSel] = useState(0);
  const [seqOn, setSeqOn] = useState(sampler.seqPlaying);
  const [seqRec, setSeqRec] = useState(sampler.seqRecording);
  const [grid, setGrid] = useState(false); // multi-pad grid vs. single selected row
  const [bpm, setBpm] = useState(sampler.seqBpm);
  const [steps, setSteps] = useState(sampler.seqSteps);
  const [vol, setVol] = useState(sampler.getVolume()); // master pad volume
  const uploadIdx = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- saved pad sequences (named presets in localStorage) ---
  const [presets, setPresets] = useState<Record<string, ReturnType<typeof sampler.exportPattern>>>(
    {}
  );
  const [seqMenu, setSeqMenu] = useState(false);
  useEffect(() => {
    setPresets(loadPadPresets());
  }, []);
  function saveSeqPreset() {
    const name = prompt("Nom de la séquence :")?.trim();
    if (!name) return;
    const all = { ...loadPadPresets(), [name]: sampler.exportPattern() };
    savePadPresets(all);
    setPresets(all);
  }
  function loadSeqPreset(name: string) {
    const all = loadPadPresets();
    const p = all[name];
    if (!p) return;
    sampler.importPattern(p);
    setSteps(sampler.seqSteps);
    setBpm(sampler.seqBpm);
    setSeqMenu(false);
    rerender();
  }
  function deleteSeqPreset(name: string) {
    const all = loadPadPresets();
    delete all[name];
    savePadPresets(all);
    setPresets(all);
  }

  // restore the saved master pad volume once on mount
  useEffect(() => {
    const saved = parseFloat(localStorage.getItem("djsynth.sampler.vol") ?? "");
    if (!Number.isNaN(saved)) {
      sampler.setVolume(saved);
      setVol(sampler.getVolume());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setMasterVol = (v: number) => {
    sampler.setVolume(v);
    setVol(sampler.getVolume());
    localStorage.setItem("djsynth.sampler.vol", String(sampler.getVolume()));
  };

  // animate the playhead while the sequencer runs
  useEffect(() => {
    if (!seqOn) return;
    let raf = 0;
    const loop = () => {
      rerender();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seqOn]);

  const trigger = (i: number) => {
    sampler.play(i);
    sampler.recordHit(i); // live overdub when REC is armed + sequencer running
    setSel(i);
    setFlash(i);
    setTimeout(() => setFlash(null), 120);
    rerender();
  };

  // play pads from the computer keyboard (1-9), like the synth's note keys
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || isTyping()) return;
      const i = PAD_KEYS[e.code];
      if (i !== undefined) {
        e.preventDefault();
        trigger(i);
      }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grab = (deck: "A" | "B") => {
    const slot = engine.grabToSampler(deck, 4);
    if (slot === null) {
      alert(`Deck ${deck} : charge et lance un morceau avant de l'échantillonner.`);
      return;
    }
    setSel(slot);
    setFlash(slot);
    setTimeout(() => setFlash(null), 300);
    rerender();
  };

  const pad = sampler.pads[sel];
  const padNo = (sel + 1).toString().padStart(3, "0");
  const playhead = seqOn ? sampler.currentStep() : -1; // lit step column

  const setP = (key: Parameters<typeof sampler.setParam>[1], v: number | boolean | string) => {
    sampler.setParam(sel, key, v);
    rerender();
  };

  return (
    <div className="zoom-zone hw-screwed spd-chassis flex flex-col gap-3 p-4">
      {/* ===== tools strip (moved up: LCD + per-pad FX knobs + REV/LOOP/GRAB) ===== */}
      <div className="spd-strip order-1 flex items-stretch gap-3 p-2">
        {/* LCD */}
        <div className="spd-lcd flex shrink-0 flex-col justify-center px-3 py-1.5">
          <span className="font-mono text-2xl font-bold leading-none text-orange-400">
            {padNo}
          </span>
          <span className="max-w-[110px] truncate text-[11px] font-semibold text-emerald-300">
            {pad.name}
          </span>
          <div className="mt-0.5 flex gap-1 text-[8px] font-bold uppercase">
            <span className={pad.reverse ? "text-red-400" : "text-neutral-600"}>REV</span>
            <span className={pad.loop ? "text-[#ff8a1e]" : "text-neutral-600"}>LOOP</span>
            <span className={pad.reverb > 0.01 ? "text-[#4dff84]" : "text-neutral-600"}>VERB</span>
          </div>
        </div>

        {/* master pad volume (global) */}
        <div className="flex shrink-0 flex-col items-center justify-center border-l border-r border-[#3a1414] px-3">
          <Knob
            label="Volume"
            value={vol}
            min={0}
            max={2}
            defaultValue={1.3}
            size={68}
            color="#ff8a1e"
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setMasterVol}
          />
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-neutral-500">
            Pads
          </span>
        </div>

        {/* per-pad effect knobs — uniform luminous yellow, lit voyant when in use */}
        <div className="flex flex-1 items-center justify-center gap-8">
          <Knob
            label="Pitch"
            value={pad.pitch}
            min={-12}
            max={12}
            defaultValue={0}
            size={48}
            color={PAD_YELLOW}
            led
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}st`}
            onChange={(v) => setP("pitch", v)}
          />
          <Knob
            label="Filter"
            value={pad.filter}
            min={0}
            max={1}
            defaultValue={0}
            size={48}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => setP("filter", v)}
          />
          <Knob
            label="Vol"
            value={pad.gain}
            min={0}
            max={2}
            defaultValue={1}
            size={48}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => setP("gain", v)}
          />
          <Knob
            label="Reverb"
            value={pad.reverb}
            min={0}
            max={1}
            defaultValue={0}
            size={48}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => setP("reverb", v)}
          />
        </div>

        {/* mode toggles + grab + Roland mark */}
        <div className="flex shrink-0 flex-col items-stretch justify-between gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="spd-logo">Roland</span>
            <span className="text-[9px] font-black italic tracking-wide text-red-500">SPD·SX</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setP("reverse", !pad.reverse)}
              className={`spd-btn ${pad.reverse ? "spd-btn-on" : ""}`}
            >
              ◁ REV
            </button>
            <button
              onClick={() => setP("loop", !pad.loop)}
              className={`spd-btn ${pad.loop ? "spd-btn-on spd-btn-on-cyan" : ""}`}
            >
              ↻ LOOP
            </button>
            <button
              onClick={() => {
                uploadIdx.current = sel;
                fileRef.current?.click();
              }}
              className="spd-btn"
              style={{ ["--led" as string]: "#3aa0ff" }}
              title="Charger un fichier dans le pad sélectionné"
            >
              ⤓ LOAD
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => grab("A")}
              className="spd-btn flex-1"
              style={{ ["--led" as string]: "#ff8a1e" }}
            >
              ⏺ GRAB A
            </button>
            <button
              onClick={() => grab("B")}
              className="spd-btn flex-1"
              style={{ ["--led" as string]: "#4dff84" }}
            >
              ⏺ GRAB B
            </button>
          </div>
        </div>
      </div>

      {/* ===== SCULPT : Serato-style sound design for the selected pad ===== */}
      <div className="spd-strip order-2 flex flex-col gap-2 p-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
            ✦ Sculpteur de son
          </span>
          <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: pad.color }}>
            {padNo} · {pad.name}
          </span>
        </div>

        <WaveformEditor sampler={sampler} sel={sel} rev={rev} onChange={rerender} />

        {/* mode bar — voicing / playback mode / performance flags / slicer */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* voicing */}
          <div className="flex items-center gap-0.5 rounded bg-black/40 p-0.5">
            {(["poly", "mono"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setP("voicing", m)}
                className={`spd-btn px-1.5 text-[10px] ${pad.voicing === m ? "spd-btn-on" : ""}`}
                style={{ ["--led" as string]: "#4dff84" }}
                title={m === "poly" ? "Polyphonique : les voix se superposent" : "Monophonique : chaque frappe coupe la précédente"}
              >
                {m === "poly" ? "POLY" : "MONO"}
              </button>
            ))}
          </div>
          {/* playback mode */}
          <div className="flex items-center gap-0.5 rounded bg-black/40 p-0.5">
            {([
              ["oneshot", "1-SHOT"],
              ["hold", "HOLD"],
              ["trigger", "TRIG"],
              ["key", "KEY"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setP("mode", m)}
                className={`spd-btn px-1.5 text-[10px] ${pad.mode === m ? "spd-btn-on" : ""}`}
                style={{ ["--led" as string]: "#ff8a1e" }}
                title={
                  m === "oneshot"
                    ? "One-shot : joue jusqu'au bout"
                    : m === "hold"
                      ? "Hold : ne joue que tant que le pad est tenu"
                      : m === "trigger"
                        ? "Trigger : redéclenche depuis le début à chaque frappe"
                        : "Key : clavier de transposition (voir touches ci-dessous)"
                }
              >
                {label}
              </button>
            ))}
          </div>
          {/* performance flags */}
          <button
            onClick={() => setP("velo", !pad.velo)}
            className={`spd-btn px-1.5 text-[10px] ${pad.velo ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#facc15" }}
            title="Mode vélocité : la force de frappe règle le volume"
          >
            VELO
          </button>
          <button
            onClick={() => setP("quantize", !pad.quantize)}
            className={`spd-btn px-1.5 text-[10px] ${pad.quantize ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#4dff84" }}
            title="Quantize : aligne les frappes sur la grille du séquenceur"
          >
            QUANT
          </button>
          <button
            onClick={() => setP("sync", !pad.sync)}
            disabled={pad.bpm <= 0}
            className={`spd-btn px-1.5 text-[10px] disabled:opacity-30 ${pad.sync ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#5ac8ff" }}
            title={pad.bpm > 0 ? "Sync : cale le tempo du sample sur le BPM du séquenceur" : "BPM inconnu (sample trop court)"}
          >
            SYNC
          </button>
          <button
            onClick={() => setP("random", !pad.random)}
            className={`spd-btn px-1.5 text-[10px] ${pad.random ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#ef4444" }}
            title="Random : chaque frappe joue une tranche / un cue au hasard"
          >
            RND
          </button>
          {/* slicer count */}
          <div className="flex items-center gap-1 rounded bg-black/40 px-1 py-0.5">
            <span className="text-[9px] font-bold uppercase text-neutral-500">Slices</span>
            <button
              onClick={() => setP("slices", Math.max(0, pad.slices - 1))}
              className="spd-btn px-1.5 text-[10px]"
            >
              −
            </button>
            <span className="w-4 text-center font-mono text-[11px] font-bold text-cyan-300">
              {pad.slices || "—"}
            </span>
            <button
              onClick={() => setP("slices", Math.min(16, pad.slices + 1))}
              className="spd-btn px-1.5 text-[10px]"
              style={{ ["--led" as string]: "#5ac8ff" }}
            >
              +
            </button>
          </div>
        </div>

        {/* sculpt knobs : ADSR envelope + filter resonance + tune / drive / pan */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-[#3a1414] pt-2">
          <Knob
            label="Attack"
            value={pad.attack}
            min={0}
            max={2}
            defaultValue={0.002}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 1000)}ms`}
            onChange={(v) => setP("attack", v)}
          />
          <Knob
            label="Decay"
            value={pad.decay}
            min={0}
            max={2}
            defaultValue={0}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 1000)}ms`}
            onChange={(v) => setP("decay", v)}
          />
          <Knob
            label="Sustain"
            value={pad.sustain}
            min={0}
            max={1}
            defaultValue={1}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => setP("sustain", v)}
          />
          <Knob
            label="Release"
            value={pad.release}
            min={0.005}
            max={3}
            defaultValue={0.04}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 1000)}ms`}
            onChange={(v) => setP("release", v)}
          />
          <Knob
            label="Reso"
            value={pad.reso}
            min={0}
            max={1}
            defaultValue={0}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => setP("reso", v)}
          />
          <Knob
            label="Tune"
            value={pad.tune}
            min={-100}
            max={100}
            defaultValue={0}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}¢`}
            onChange={(v) => setP("tune", v)}
          />
          <Knob
            label="Drive"
            value={pad.drive}
            min={0}
            max={1}
            defaultValue={0}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => setP("drive", v)}
          />
          <Knob
            label="Pan"
            value={pad.pan}
            min={-1}
            max={1}
            defaultValue={0}
            size={44}
            color={PAD_YELLOW}
            led
            format={(v) => (Math.abs(v) < 0.02 ? "C" : `${v < 0 ? "L" : "R"}${Math.round(Math.abs(v) * 100)}`)}
            onChange={(v) => setP("pan", v)}
          />
        </div>

        {/* key-shift keyboard : play the selected pad melodically (one octave) */}
        {pad.mode === "key" && (
          <div className="flex items-center gap-1 border-t border-[#3a1414] pt-2">
            <span className="mr-1 text-[9px] font-bold uppercase text-neutral-500">Clavier</span>
            {NOTE_NAMES.map((nm, semi) => {
              const sharp = nm.includes("#");
              return (
                <button
                  key={semi}
                  onMouseDown={() => sampler.playKey(sel, semi)}
                  className={`h-8 flex-1 rounded-sm text-[9px] font-bold ${
                    sharp ? "bg-neutral-800 text-neutral-300" : "bg-neutral-200 text-neutral-900"
                  } active:brightness-125`}
                  title={`Jouer ${nm} (+${semi} demi-tons)`}
                >
                  {nm}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== mesh pad grid with red divider strips ===== */}
      <div className="spd-grid order-4 relative grid grid-cols-3 gap-2">
        {/* glowing red divider strips */}
        <div className="spd-div spd-div-v" style={{ left: "calc(33.333% - 1px)" }} />
        <div className="spd-div spd-div-v" style={{ left: "calc(66.666% - 1px)" }} />
        <div className="spd-div spd-div-h" style={{ top: "calc(33.333% - 1px)" }} />
        <div className="spd-div spd-div-h" style={{ top: "calc(66.666% - 1px)" }} />

        {sampler.pads.map((p, i) => {
          const looping = sampler.isLooping(i);
          return (
            <button
              key={i}
              onClick={() => trigger(i)}
              className={`spd-pad relative flex aspect-[2/1] flex-col items-center justify-center ${
                flash === i ? "spd-pad-hit" : ""
              } ${p.buffer ? "spd-pad-loaded" : ""} ${sel === i ? "spd-pad-sel" : ""}`}
              style={{ ["--rgb" as string]: p.color }}
            >
              {looping && <span className="spd-loop-dot" />}
              <span className="absolute right-1.5 top-1 text-[8px] font-bold text-neutral-500">
                {i + 1}
              </span>
              <span className="text-[9px] font-bold tracking-wide text-neutral-300">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <span className="px-1 text-center text-[10px] font-semibold leading-tight text-neutral-200">
                {p.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===== 24-step sequencer (per pad) ===== */}
      <div className="spd-seq order-3 flex flex-col gap-2 rounded-md border border-[#3a1414] bg-black/40 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSeqOn(sampler.toggleSeq())}
            className={`spd-btn ${seqOn ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#ff3b3b" }}
          >
            {seqOn ? "■ STOP" : "▶ SEQ"}
          </button>
          <button
            onClick={() => {
              sampler.seqRecording = !sampler.seqRecording;
              setSeqRec(sampler.seqRecording);
            }}
            className={`spd-btn ${seqRec ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#ff3b3b" }}
            title="Enregistrement live : tape les pads (souris ou touches 1-9) pendant la lecture pour écrire le pattern"
          >
            {seqRec ? "● REC" : "○ REC"}
          </button>
          <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Séquenceur {steps} pas
          </span>
          <div className="flex items-center gap-0.5 rounded bg-black/40 p-0.5">
            {[4, 8, 12, 16, 24].map((n) => (
              <button
                key={n}
                onClick={() => {
                  sampler.setSeqSteps(n);
                  setSteps(sampler.seqSteps);
                  rerender();
                }}
                className={`spd-btn px-1.5 text-[10px] ${steps === n ? "spd-btn-on" : ""}`}
                style={{ ["--led" as string]: "#4dff84" }}
                title={`Boucle de ${n} pas`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={() => setGrid((g) => !g)}
            className={`spd-btn px-1.5 text-[10px] ${grid ? "spd-btn-on" : ""}`}
            style={{ ["--led" as string]: "#4dff84" }}
            title="Vue grille : voir et programmer plusieurs sons par pas"
          >
            ▦ GRILLE
          </button>
          <span
            className="ml-1 rounded bg-black/50 px-1.5 py-0.5 font-mono text-xs font-bold"
            style={{ color: pad.color }}
            title="Pad en cours d'édition"
          >
            {padNo} · {pad.name}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase text-neutral-500">BPM</span>
            <button
              onClick={() => {
                sampler.setSeqBpm(sampler.seqBpm - 1);
                setBpm(sampler.seqBpm);
              }}
              className="spd-btn px-1.5"
            >
              −
            </button>
            <input
              type="number"
              value={bpm}
              min={40}
              max={240}
              onChange={(e) => {
                sampler.setSeqBpm(parseInt(e.target.value || "120", 10));
                setBpm(sampler.seqBpm);
              }}
              className="w-12 rounded bg-neutral-900 px-1 py-0.5 text-center font-mono text-xs text-orange-300 outline-none ring-1 ring-neutral-700"
            />
            <button
              onClick={() => {
                sampler.setSeqBpm(sampler.seqBpm + 1);
                setBpm(sampler.seqBpm);
              }}
              className="spd-btn px-1.5"
            >
              +
            </button>
            <button
              onClick={() => {
                sampler.clearPadSteps(sel);
                rerender();
              }}
              className="spd-btn px-1.5 text-[10px]"
              title="Effacer le pattern de ce pad"
            >
              CLR
            </button>
            <button
              onClick={() => {
                sampler.clearAllSteps();
                rerender();
              }}
              className="spd-btn px-1.5 text-[10px]"
              title="Effacer tous les patterns"
            >
              CLR✱
            </button>
            {/* save / recall named pad sequences (persist across sessions) */}
            <button
              onClick={saveSeqPreset}
              className="spd-btn px-1.5 text-[10px]"
              style={{ ["--led" as string]: "#facc15" }}
              title="Sauvegarder la séquence (patterns + BPM + réglages des pads)"
            >
              ↧ SAVE
            </button>
            <div className="relative">
              <button
                onClick={() => setSeqMenu((m) => !m)}
                className={`spd-btn px-1.5 text-[10px] ${seqMenu ? "spd-btn-on" : ""}`}
                style={{ ["--led" as string]: "#facc15" }}
                title="Recharger une séquence sauvegardée"
              >
                ↥ SEQ ▾
              </button>
              {seqMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-56 w-48 overflow-auto rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
                  {Object.keys(presets).length === 0 ? (
                    <div className="px-2 py-1.5 text-[10px] text-neutral-500">
                      Aucune séquence sauvegardée
                    </div>
                  ) : (
                    Object.keys(presets).map((name) => (
                      <div key={name} className="flex items-center gap-1">
                        <button
                          onClick={() => loadSeqPreset(name)}
                          className="flex-1 truncate rounded px-2 py-1 text-left text-[11px] text-neutral-200 hover:bg-neutral-800"
                          title={`Charger « ${name} »`}
                        >
                          {name}
                        </button>
                        <button
                          onClick={() => deleteSeqPreset(name)}
                          className="rounded px-1.5 py-1 text-[11px] text-red-400 hover:bg-neutral-800"
                          title="Supprimer"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {grid ? (
          /* multi-pad grid — one row per loaded pad, several sounds per step column */
          <div className="flex flex-col gap-1">
            {sampler.pads.map((p, pi) =>
              !p.buffer ? null : (
                <div key={pi} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setSel(pi);
                      rerender();
                    }}
                    className="flex w-24 shrink-0 items-center gap-1 rounded px-1.5 py-1 text-left text-[9px] font-bold"
                    style={{
                      color: p.color,
                      boxShadow: sel === pi ? `inset 0 0 0 1px ${p.color}` : "inset 0 0 0 1px rgba(255,255,255,.05)",
                    }}
                    title={`Sélectionner ${p.name}`}
                  >
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                  <div className="flex flex-1 items-center gap-1">
                    {Array.from({ length: sampler.seqSteps }).map((_, s) => {
                      const on = sampler.isStep(pi, s);
                      const head = playhead === s;
                      return (
                        <button
                          key={s}
                          onClick={() => {
                            sampler.toggleStep(pi, s);
                            rerender();
                          }}
                          className={`spd-step h-5 flex-1 rounded-sm ${on ? "spd-step-on" : ""} ${
                            head ? "spd-step-head" : ""
                          } ${s % 4 === 0 ? "ml-1.5 first:ml-0" : ""}`}
                          style={{ ["--rgb" as string]: p.color }}
                          title={`${p.name} · pas ${s + 1}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          /* step row for the selected pad — grouped in beats of 4 */
          <div className="flex items-center gap-1">
            {Array.from({ length: sampler.seqSteps }).map((_, s) => {
              const on = sampler.isStep(sel, s);
              const head = playhead === s;
              return (
                <button
                  key={s}
                  onClick={() => {
                    sampler.toggleStep(sel, s);
                    rerender();
                  }}
                  className={`spd-step h-7 flex-1 rounded-sm ${on ? "spd-step-on" : ""} ${
                    head ? "spd-step-head" : ""
                  } ${s % 4 === 0 ? "ml-1.5 first:ml-0" : ""}`}
                  style={{ ["--rgb" as string]: pad.color }}
                  title={`Pas ${s + 1}`}
                />
              );
            })}
          </div>
        )}
      </div>

      <p className="order-5 text-center text-[10px] text-neutral-600">
        Tape un pad (souris ou touches 1-9) = jouer + sélectionner · LOAD/GRAB chargent un son · Sculpteur : glisse les poignées de la forme d&apos;onde pour rogner (trim), SET CUE pose des repères, Slices découpe le sample, POLY/MONO + 1-SHOT/HOLD/TRIG/KEY règlent la lecture, VELO/QUANT/SYNC/RND, et les boutons ADSR/Reso/Tune/Drive/Pan modèlent le son · SEQ = séquenceur par pad · REC = enregistrement live · GRILLE = plusieurs sons par pas
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            await sampler.loadFile(uploadIdx.current, f);
            rerender();
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
