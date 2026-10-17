"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Region } from "@/lib/atelier/types";

type Live = {
  sel: Region | null;
  playhead: () => number | null;
  grid?: { bpm: number; offset: number } | null;
  marks?: number[];
  part?: Region | null;
  peaks: Float32Array;
  color: string;
  duration: number;
  view: Region;
  dim?: boolean;
  label?: string;
};

function windowPeaks(buf: AudioBuffer, a: number, b: number, n: number): Float32Array {
  const rate = buf.sampleRate;
  const start = Math.floor(a * rate);
  const end = Math.floor(b * rate);
  const samplesPerCol = (end - start) / n;
  const step = Math.max(1, Math.floor(samplesPerCol / 512));
  const peaks = new Float32Array(n);
  let max = 0;
  const c0 = buf.getChannelData(0);
  const c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;

  for (let i = 0; i < n; i++) {
    const colStart = start + Math.floor(i * samplesPerCol);
    const colEnd = Math.min(colStart + Math.floor(samplesPerCol), end);
    let peak = 0;

    for (let j = colStart; j < colEnd; j += step) {
      let val = Math.abs(c0[j]);
      if (c1) {
        const val2 = Math.abs(c1[j]);
        if (val2 > val) val = val2;
      }
      if (val > peak) peak = val;
    }

    peaks[i] = peak;
    if (peak > max) max = peak;
  }

  if (max > 0) {
    for (let i = 0; i < n; i++) {
      peaks[i] /= max;
    }
  }

  return peaks;
}

export function WaveEditor({
  buf,
  sel,
  onSel,
  onSeek,
  onDoubleClick,
  playhead,
  grid,
  marks,
  part,
  view,
  color,
  height = 140,
  dim,
  label,
}: {
  buf: AudioBuffer;
  sel: Region | null;
  onSel?: (r: Region | null) => void;
  onSeek?: (t: number) => void;
  onDoubleClick?: () => void;
  playhead: () => number | null;
  grid?: { bpm: number; offset: number } | null;
  marks?: number[];
  part?: Region | null;
  view?: Region | null;
  color: string;
  height?: number;
  dim?: boolean;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const live = useRef<Live | null>(null);
  const va = view?.a ?? 0;
  const vb = view?.b ?? buf.duration;
  const visible = useMemo(() => ({ a: va, b: vb }), [va, vb]);
  const cols = Math.max(100, Math.floor(width));

  const peaks = useMemo(() => windowPeaks(buf, va, vb, cols), [buf, va, vb, cols]);

  useLayoutEffect(() => {
    live.current = {
      sel,
      playhead,
      grid,
      marks,
      part,
      peaks,
      color,
      duration: buf.duration,
      view: visible,
      dim,
      label,
    };
  }, [sel, playhead, grid, marks, part, peaks, color, buf.duration, visible, dim, label]);

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

      const { sel, playhead, grid, marks, part, peaks, color, view, dim, label } = live.current;
      const dpr = window.devicePixelRatio;
      const cw = canvas.clientWidth;
      const ch = height;
      const va = view.a;
      const vb = view.b;

      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, cw, ch);

      // Part background
      if (part) {
        const a = Math.max(va, Math.min(vb, part.a));
        const b = Math.max(va, Math.min(vb, part.b));
        const x1 = ((a - va) / (vb - va)) * cw;
        const x2 = ((b - va) / (vb - va)) * cw;
        ctx.fillStyle = `${color}26`;
        ctx.fillRect(x1, 0, x2 - x1, ch);
        ctx.fillStyle = color;
        ctx.fillRect(x1, 0, 3, ch);
        ctx.fillRect(x2 - 3, 0, 3, ch);
      }

      // Center line
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, ch / 2);
      ctx.lineTo(cw, ch / 2);
      ctx.stroke();

      // Waveform
      const barWidth = cw / peaks.length;
      ctx.fillStyle = dim ? `${color}55` : `${color}D9`;
      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i];
        const x = i * barWidth;
        const barHeight = peak * ch * 0.9;
        ctx.fillRect(x, (ch - barHeight) / 2, barWidth, barHeight);
      }

      // Grid: bar lines, plus beat lines once they are at least 14 px apart
      if (grid?.bpm && grid.bpm > 0) {
        const beat = 60 / grid.bpm;
        const showBeats = (cw * beat) / (vb - va) > 14;
        for (let k = Math.ceil((va - grid.offset) / beat); k <= Math.floor((vb - grid.offset) / beat); k++) {
          const isBar = ((k % 4) + 4) % 4 === 0;
          if (!isBar && !showBeats) continue;
          const x = ((grid.offset + k * beat - va) / (vb - va)) * cw;
          ctx.strokeStyle = isBar ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)";
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ch);
          ctx.stroke();
        }
      }

      // Marks
      if (marks) {
        ctx.strokeStyle = "rgba(250,204,21,0.75)";
        ctx.lineWidth = 1;
        for (const mark of marks) {
          if (mark >= va && mark <= vb) {
            const x = ((mark - va) / (vb - va)) * cw;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
            ctx.stroke();
          }
        }
      }

      // Selection
      if (sel) {
        const a = Math.max(va, Math.min(vb, sel.a));
        const b = Math.max(va, Math.min(vb, sel.b));
        const x1 = ((a - va) / (vb - va)) * cw;
        const x2 = ((b - va) / (vb - va)) * cw;
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
      if (currentPlayhead !== null && currentPlayhead >= va && currentPlayhead <= vb) {
        const x = ((currentPlayhead - va) / (vb - va)) * cw;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      }

      // Label
      if (label) {
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(label, 8, 12);
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
    const t = Math.max(visible.a, Math.min(visible.b, visible.a + (x / rect.width) * (visible.b - visible.a)));

    if (onSel && live.current.sel) {
      const { a, b } = live.current.sel;
      const aPx = ((a - visible.a) / (visible.b - visible.a)) * rect.width;
      const bPx = ((b - visible.a) / (visible.b - visible.a)) * rect.width;
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
    const t = Math.max(visible.a, Math.min(visible.b, visible.a + (x / rect.width) * (visible.b - visible.a)));

    if (onSel) {
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
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState.current.isDragging || !canvasRef.current || !live.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = ((dragState.current.anchor! - visible.a) / (visible.b - visible.a)) * rect.width;

    if (onSel && dragState.current.movingEdge === null && Math.abs(x - startX) < 3) {
      onSel(null);
      onSeek?.(dragState.current.anchor!);
    } else if (!onSel) {
      onSeek?.(dragState.current.anchor!);
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
        className={`w-full rounded-md touch-none ${onSel ? "cursor-crosshair" : "cursor-pointer"}`}
        style={{ height: `${height}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => onDoubleClick?.()}
      />
    </div>
  );
}
