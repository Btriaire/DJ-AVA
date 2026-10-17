"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildWaveformPeaks } from "@/lib/audio/bpm";
import type { Region } from "@/lib/atelier/types";

type Live = {
  sel: Region | null;
  playhead: () => number | null;
  grid?: { bpm: number; offset: number } | null;
  marks?: number[];
  peaks: Float32Array;
  color: string;
  duration: number;
};

export function WaveEditor({ buf, sel, onSel, playhead, grid, marks, color, height = 140 }: {
  buf: AudioBuffer;
  sel: Region | null;
  onSel: (r: Region | null) => void;
  playhead: () => number | null;
  grid?: { bpm: number; offset: number } | null;
  marks?: number[];
  color: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const live = useRef<Live | null>(null);

  const peaks = useMemo(() => buildWaveformPeaks(buf, Math.max(200, Math.floor(width))), [buf, width]);

  useLayoutEffect(() => {
    live.current = {
      sel,
      playhead,
      grid,
      marks,
      peaks,
      color,
      duration: buf.duration,
    };
  }, [sel, playhead, grid, marks, peaks, color, buf.duration]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number;
    const draw = () => {
      if (!live.current) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { sel, playhead, grid, marks, peaks, color, duration } = live.current;
      const dpr = window.devicePixelRatio;
      const cw = canvas.clientWidth;
      const ch = height;

      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, cw, ch);

      // Center line
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, ch / 2);
      ctx.lineTo(cw, ch / 2);
      ctx.stroke();

      // Waveform
      const barWidth = cw / peaks.length;
      ctx.fillStyle = `${color}D9`;
      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i];
        const x = i * barWidth;
        const barHeight = peak * ch * 0.9;
        ctx.fillRect(x, (ch - barHeight) / 2, barWidth, barHeight);
      }

      // Grid
      if (grid?.bpm && grid.bpm > 0) {
        const bar = (4 * 60) / grid.bpm;
        const firstBar = grid.offset;
        const bars = Math.ceil(duration / bar);
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        for (let i = -Math.ceil(firstBar / bar); i < bars; i++) {
          const barTime = firstBar + i * bar;
          if (barTime >= 0 && barTime <= duration) {
            const x = (barTime / duration) * cw;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
            ctx.stroke();
          }
        }
      }

      // Marks
      if (marks) {
        ctx.strokeStyle = "rgba(250,204,21,0.75)";
        ctx.lineWidth = 1;
        for (const mark of marks) {
          if (mark >= 0 && mark <= duration) {
            const x = (mark / duration) * cw;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
            ctx.stroke();
          }
        }
      }

      // Selection
      if (sel) {
        const a = Math.max(0, sel.a);
        const b = Math.min(duration, sel.b);
        const x1 = (a / duration) * cw;
        const x2 = (b / duration) * cw;
        ctx.fillStyle = `${color}33`;
        ctx.fillRect(x1, 0, x2 - x1, ch);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, ch);
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2, ch);
        ctx.stroke();
      }

      // Playhead
      const currentPlayhead = playhead();
      if (currentPlayhead !== null && currentPlayhead >= 0 && currentPlayhead <= duration) {
        const x = (currentPlayhead / duration) * cw;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [height]);

  const dragState = useRef<{
    isDragging: boolean;
    anchor: number | null;
    movingEdge: "left" | "right" | null;
  }>({
    isDragging: false,
    anchor: null,
    movingEdge: null,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !live.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(live.current.duration, (x / rect.width) * live.current.duration));

    if (live.current.sel) {
      const { a, b } = live.current.sel;
      const aPx = (a / live.current.duration) * rect.width;
      const bPx = (b / live.current.duration) * rect.width;
      if (Math.abs(x - aPx) < 6) {
        dragState.current = { isDragging: true, anchor: b, movingEdge: "left" };
      } else if (Math.abs(x - bPx) < 6) {
        dragState.current = { isDragging: true, anchor: a, movingEdge: "right" };
      } else {
        dragState.current = { isDragging: true, anchor: t, movingEdge: null };
      }
    } else {
      dragState.current = { isDragging: true, anchor: t, movingEdge: null };
    }

    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState.current.isDragging || !canvasRef.current || !live.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(live.current.duration, (x / rect.width) * live.current.duration));

    if (dragState.current.movingEdge === "left") {
      const newA = Math.min(t, dragState.current.anchor! - 0.01);
      onSel({ a: newA, b: dragState.current.anchor! });
    } else if (dragState.current.movingEdge === "right") {
      const newB = Math.max(t, dragState.current.anchor! + 0.01);
      onSel({ a: dragState.current.anchor!, b: newB });
    } else {
      const a = Math.min(dragState.current.anchor!, t);
      const b = Math.max(dragState.current.anchor!, t);
      onSel({ a, b });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState.current.isDragging || !canvasRef.current || !live.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = (dragState.current.anchor! / live.current.duration) * rect.width;

    if (dragState.current.movingEdge === null && Math.abs(x - startX) < 3) {
      onSel(null);
    }

    dragState.current = { isDragging: false, anchor: null, movingEdge: null };
    try {
      canvasRef.current.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-md touch-none cursor-crosshair"
        style={{ height: `${height}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
