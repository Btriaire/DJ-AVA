"use client";
import { useEffect, useRef } from "react";

interface Props {
  buffer: AudioBuffer;
  start: number; // 0..1
  end: number; // 0..1
  onChange: (start: number, end: number) => void;
  color?: string;
  height?: number;
  version?: number; // bump to force a redraw after in-place buffer edits
  playheads?: () => number[]; // live 0..1 positions to draw as moving cursors
}

// Compact waveform display with two draggable trim handles. Used by the OP-XY
// synth to visualise a captured sample and crop the looped region.
export function WaveTrimmer({ buffer, start, end, onChange, color = "#34d399", height = 56, version = 0, playheads }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<"start" | "end" | null>(null);

  // draw the waveform peaks once per buffer
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const w = cv.clientWidth || 280;
    const h = height;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    const mid = h / 2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      let min = 1;
      let max = -1;
      const s = x * step;
      for (let i = 0; i < step; i++) {
        const v = data[s + i] ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, mid + min * mid * 0.95);
      ctx.lineTo(x + 0.5, mid + max * mid * 0.95);
    }
    ctx.stroke();
  }, [buffer, color, height, version]);

  // live playhead overlay — animated on its own rAF so it doesn't redraw the
  // (expensive) waveform every frame. Draws one moving cursor per sounding voice.
  useEffect(() => {
    if (!playheads) return;
    const cv = playRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = cv.clientWidth || 1;
      const h = height;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ps = playheads();
      for (const p of ps) {
        const x = p * w;
        ctx.shadowColor = color;
        ctx.shadowBlur = 7;
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, 0, 2, h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(x - 0.4, 0, 0.9, h);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playheads, color, height]);

  const posFromEvent = (clientX: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = posFromEvent(e.clientX);
    if (drag.current === "start") onChange(Math.min(p, end - 0.01), end);
    else onChange(start, Math.max(p, start + 0.01));
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none rounded-md"
      style={{ height }}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-md bg-black/45 ring-1 ring-white/10">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      {/* live playhead(s) — moving cursor showing where playback is in the sample */}
      {playheads && <canvas ref={playRef} className="pointer-events-none absolute inset-0 h-full w-full" />}
      {/* dimmed outside regions */}
      <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-md bg-black/55" style={{ width: `${start * 100}%` }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-md bg-black/55" style={{ width: `${(1 - end) * 100}%` }} />
      {/* selected region outline */}
      <div
        className="pointer-events-none absolute inset-y-0 border-x-2"
        style={{ left: `${start * 100}%`, width: `${(end - start) * 100}%`, borderColor: color }}
      />
      {/* handles */}
      <div
        className="absolute inset-y-0 -ml-1.5 w-3 cursor-ew-resize"
        style={{ left: `${start * 100}%` }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = "start"; }}
      >
        <div className="mx-auto h-full w-[3px] rounded" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <div
        className="absolute inset-y-0 -ml-1.5 w-3 cursor-ew-resize"
        style={{ left: `${end * 100}%` }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = "end"; }}
      >
        <div className="mx-auto h-full w-[3px] rounded" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
    </div>
  );
}
