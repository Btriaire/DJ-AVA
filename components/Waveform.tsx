"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// ---- the look of the waveform, shared by both decks and remembered ----------------------------------------
export type WaveLook = "barres" | "onde" | "classique";
const LOOKS: { id: WaveLook; label: string }[] = [
  { id: "barres", label: "Barres" },
  { id: "onde", label: "Onde" },
  { id: "classique", label: "Classique" },
];
const LOOK_KEY = "djsynth.waveLook.v1";
const lookListeners = new Set<() => void>();
let lookNow: WaveLook | null = null;
function getLook(): WaveLook {
  if (lookNow) return lookNow;
  try {
    const v = localStorage.getItem(LOOK_KEY);
    lookNow = LOOKS.some((l) => l.id === v) ? (v as WaveLook) : "barres";
  } catch {
    lookNow = "barres";
  }
  return lookNow;
}
function setLook(v: WaveLook) {
  lookNow = v;
  try {
    localStorage.setItem(LOOK_KEY, v);
  } catch {
    // private window: the look still changes for this visit
  }
  lookListeners.forEach((f) => f());
}
function subscribeLook(f: () => void) {
  lookListeners.add(f);
  return () => {
    lookListeners.delete(f);
  };
}

// the loudest peak of each slice, so a bar stands for its whole slice of the song
function buckets(peaks: Float32Array, count: number): Float32Array {
  const out = new Float32Array(Math.max(1, count));
  if (!peaks.length) return out;
  const step = peaks.length / out.length;
  for (let i = 0; i < out.length; i++) {
    let m = 0;
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    for (let j = a; j < b && j < peaks.length; j++) if (peaks[j] > m) m = peaks[j];
    out[i] = m;
  }
  return out;
}

type Scene = { w: number; h: number; peaks: Float32Array; playedX: number; color: string; bpm?: number; beatOffset: number; duration: number };

function beatGrid(ctx: CanvasRenderingContext2D, { w, h, bpm, beatOffset, duration }: Scene, strong: string, weak: string) {
  if (!bpm || duration <= 0) return;
  const spb = 60 / bpm;
  for (let k = 0; k * spb + beatOffset <= duration; k++) {
    const t = beatOffset + k * spb;
    if (t < 0) continue;
    ctx.fillStyle = k % 4 === 0 ? strong : weak;
    ctx.fillRect((t / duration) * w, 0, 1, h);
  }
}

function drawWave(ctx: CanvasRenderingContext2D, look: WaveLook, sc: Scene) {
  const { w, h, peaks, playedX, color } = sc;
  if (look === "classique") {
    const mid = h / 2;
    const n = peaks.length || 1;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const amp = peaks.length ? peaks[i] * (h / 2) * 0.95 : 0;
      ctx.fillStyle = x <= playedX ? color : "#3f3f46";
      ctx.fillRect(x, mid - amp, Math.max(1, w / n), amp * 2);
    }
    beatGrid(ctx, sc, "rgba(255,255,255,0.28)", "rgba(255,255,255,0.08)");
    return;
  }

  // the grid goes behind the sound on the new looks
  beatGrid(ctx, sc, "rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)");

  if (look === "barres") {
    // rounded bars standing on a line at two thirds of the height, with their reflection under it
    const base = Math.round(h * 0.68);
    const bw = 3;
    const gap = 1;
    const vals = buckets(peaks, Math.floor(w / (bw + gap)));
    const up = ctx.createLinearGradient(0, 0, 0, base);
    up.addColorStop(0, "#ffffff");
    up.addColorStop(0.35, color);
    up.addColorStop(1, color);
    for (let i = 0; i < vals.length; i++) {
      const x = i * (bw + gap);
      const v = Math.max(0.02, vals[i]);
      const top = v * (base - 4);
      const low = v * (h - base - 2);
      const played = x + bw <= playedX;
      ctx.globalAlpha = 1;
      ctx.fillStyle = played ? up : "rgba(255,255,255,0.22)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, base - top, bw, top, [1.5, 1.5, 0, 0]);
      else ctx.rect(x, base - top, bw, top);
      ctx.fill();
      ctx.globalAlpha = played ? 0.35 : 0.1;
      ctx.fillStyle = played ? color : "#ffffff";
      ctx.fillRect(x, base + 1, bw, low);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // "onde": a smooth envelope, mirrored, filled with a glowing gradient
  const mid = h / 2;
  const n = Math.max(2, Math.floor(w / 2));
  const raw = buckets(peaks, n);
  const vals = raw.map((_, i) => ((raw[i - 1] ?? raw[i]) + raw[i] * 2 + (raw[i + 1] ?? raw[i])) / 4); // a light smoothing
  const path = new Path2D();
  path.moveTo(0, mid);
  for (let i = 0; i < n; i++) path.lineTo((i / (n - 1)) * w, mid - vals[i] * (mid - 3));
  for (let i = n - 1; i >= 0; i--) path.lineTo((i / (n - 1)) * w, mid + vals[i] * (mid - 3));
  path.closePath();

  // still to play: a pale ghost of the song
  ctx.save();
  ctx.beginPath();
  ctx.rect(playedX, 0, w - playedX, h);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.fill(path);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();

  // played: the deck colour, brighter at the peaks, with a soft glow
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, playedX, h);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, color);
  g.addColorStop(0.5, color);
  g.addColorStop(0.7, color);
  g.addColorStop(1, "#ffffff");
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.restore();

  // the centre line
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, mid, w, 1);
}

interface Props {
  peaks: Float32Array;
  progress: number; // 0..1
  cue: number; // 0..1
  color: string;
  onSeek: (norm: number) => void;
  bpm?: number;
  beatOffset?: number; // seconds to the first beat
  duration?: number; // track length in seconds
  selection?: { start: number; end: number } | null;
  onSelect?: (start: number, end: number) => void;
}

export function Waveform({
  peaks,
  progress,
  cue,
  color,
  onSeek,
  bpm,
  beatOffset = 0,
  duration = 0,
  selection,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragState, setDragState] = useState<{
    start: number;
    end: number;
    edge?: "start" | "end";
  } | null>(null);
  const [, force] = useState(0);
  const look = useSyncExternalStore(subscribeLook, getLook, () => "barres" as WaveLook);

  // Snap to nearest beat if bpm is provided and Alt is not pressed
  const snapToBeat = (norm: number, e: React.MouseEvent): number => {
    if (!bpm || !duration || e.altKey) return norm;
    const spb = 60 / bpm;
    const t = norm * duration;
    const k = Math.round((t - beatOffset) / spb);
    const snappedT = Math.max(0, Math.min(duration, beatOffset + k * spb));
    return snappedT / duration;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const playedX = progress * w;
    const currentSelection = dragState ? { start: dragState.start, end: dragState.end } : selection;
    drawWave(ctx, look, { w, h, peaks, playedX, color, bpm, beatOffset, duration });

    // selection
    if (currentSelection) {
      const startX = Math.min(currentSelection.start, currentSelection.end) * w;
      const endX = Math.max(currentSelection.start, currentSelection.end) * w;
      ctx.fillStyle = `${color}55`;
      ctx.fillRect(startX, 0, endX - startX, h);
      ctx.fillStyle = "#fff";
      ctx.fillRect(startX, 0, 1, h);
      ctx.fillRect(endX, 0, 1, h);
    }

    // cue: a yellow line with a small flag on top
    const cx = cue * w;
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(cx, 0, 2, h);
    if (look !== "classique") {
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx + 8, 0);
      ctx.lineTo(cx, 8);
      ctx.closePath();
      ctx.fill();
    }

    // playhead (with a glow on the new looks)
    ctx.save();
    if (look !== "classique") {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(playedX - 1, 0, 2, h);
    ctx.restore();
  }, [peaks, progress, cue, color, bpm, beatOffset, duration, selection, dragState, look]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const snappedX = snapToBeat(x, e);

    if (selection && !e.altKey) {
      const w = rect.width;
      const startX = Math.min(selection.start, selection.end) * w;
      const endX = Math.max(selection.start, selection.end) * w;
      const mouseX = e.clientX - rect.left;

      if (Math.abs(mouseX - startX) <= 8) {
        setDragState({ start: snappedX, end: selection.end, edge: "start" });
        return;
      }
      if (Math.abs(mouseX - endX) <= 8) {
        setDragState({ start: selection.start, end: snappedX, edge: "end" });
        return;
      }
    }

    setDragState({ start: snappedX, end: snappedX });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const snappedX = snapToBeat(x, e);

    if (dragState.edge === "start") {
      setDragState({ start: snappedX, end: dragState.end, edge: "start" });
    } else if (dragState.edge === "end") {
      setDragState({ start: dragState.start, end: snappedX, edge: "end" });
    } else {
      setDragState({ start: dragState.start, end: snappedX });
    }
  };

  const handleMouseUp = () => {
    if (!dragState) return;
    const start = Math.min(dragState.start, dragState.end);
    const end = Math.max(dragState.start, dragState.end);
    if (Math.abs(end - start) > 0.01) {
      onSelect?.(start, end);
    } else {
      onSeek(start);
    }
    setDragState(null);
    force((n) => n + 1);
  };

  const nextLook = LOOKS[(LOOKS.findIndex((l) => l.id === look) + 1) % LOOKS.length];
  return (
    <div className="group relative">
      <canvas
        ref={canvasRef}
        className="h-28 w-full cursor-pointer rounded"
        style={{ background: look === "classique" ? "#0a0a0a" : `radial-gradient(120% 90% at 50% 100%, ${color}1f, #07080b 70%)` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDragState(null)}
      />
      <button
        type="button"
        onClick={() => setLook(nextLook.id)}
        className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-300 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
        title={`Rendu de la forme d'onde : ${LOOKS.find((l) => l.id === look)?.label} (clic : ${nextLook.label})`}
        aria-label={`Changer le rendu de la forme d'onde, actuellement ${LOOKS.find((l) => l.id === look)?.label}`}
      >
        {LOOKS.find((l) => l.id === look)?.label} ⟳
      </button>
    </div>
  );
}
