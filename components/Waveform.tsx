"use client";
import { useEffect, useRef } from "react";

interface Props {
  peaks: Float32Array;
  progress: number; // 0..1
  cue: number; // 0..1
  color: string;
  onSeek: (norm: number) => void;
}

export function Waveform({ peaks, progress, cue, color, onSeek }: Props) {
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

    // cue marker
    const cx = cue * w;
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(cx, 0, 2, h);

    // playhead
    ctx.fillStyle = "#fff";
    ctx.fillRect(playedX - 1, 0, 2, h);
  }, [peaks, progress, cue, color]);

  return (
    <canvas
      ref={canvasRef}
      className="h-20 w-full cursor-pointer rounded bg-neutral-950"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    />
  );
}
