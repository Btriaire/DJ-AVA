"use client";
import { useEffect, useRef } from "react";

interface Props {
  peaks: Float32Array;
  progress: number; // 0..1
  cue: number; // 0..1
  color: string;
  onSeek: (norm: number) => void;
  bpm?: number;
  beatOffset?: number; // seconds to the first beat
  duration?: number; // track length in seconds
}

export function Waveform({ peaks, progress, cue, color, onSeek, bpm, beatOffset = 0, duration = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const mid = h / 2;
    const n = peaks.length || 1;
    const playedX = progress * w;

    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const amp = peaks.length ? peaks[i] * (h / 2) * 0.95 : 0;
      ctx.fillStyle = x <= playedX ? color : "#3f3f46";
      ctx.fillRect(x, mid - amp, Math.max(1, w / n), amp * 2);
    }

    // beat grid: a faint line per beat, a brighter one per bar (every 4 beats)
    if (bpm && duration > 0) {
      const spb = 60 / bpm;
      for (let k = 0; k * spb + beatOffset <= duration; k++) {
        const t = beatOffset + k * spb;
        if (t < 0) continue;
        ctx.fillStyle = k % 4 === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.08)";
        ctx.fillRect((t / duration) * w, 0, 1, h);
      }
    }

    // cue marker
    const cx = cue * w;
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(cx, 0, 2, h);

    // playhead
    ctx.fillStyle = "#fff";
    ctx.fillRect(playedX - 1, 0, 2, h);
  }, [peaks, progress, cue, color, bpm, beatOffset, duration]);

  return (
    <canvas
      ref={canvasRef}
      className="h-28 w-full cursor-pointer rounded bg-neutral-950"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    />
  );
}
