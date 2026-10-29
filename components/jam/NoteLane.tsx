"use client";
import { useRef } from "react";
import { useFrameLoop } from "../frameLoop";

export interface LaneNote { start: number; end: number; midi: number; kind: "song" | "line" }
export interface LaneData { pos: number; beat: number; notes: LaneNote[] }

export function NoteLane({ data, color, accent, label }: { data: () => LaneData | null; color: string; accent: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastWidth = useRef(0);
  const lastHeight = useRef(0);

  const resolveCssVariable = (variable: string, canvas: HTMLCanvasElement): string => {
    if (variable.startsWith("var(")) {
      const name = variable.slice(4, -1);
      return getComputedStyle(canvas).getPropertyValue(name).trim();
    }
    return variable;
  };

  useFrameLoop(canvasRef, () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize canvas if needed
    const dpr = window.devicePixelRatio;
    if (canvas.clientWidth !== lastWidth.current || canvas.clientHeight !== lastHeight.current) {
      lastWidth.current = canvas.clientWidth;
      lastHeight.current = canvas.clientHeight;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear background
    ctx.fillStyle = "#0b0b0e";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const laneData = data();
    if (!laneData) {
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Pas de notes", canvas.clientWidth / 2, canvas.clientHeight / 2);
      return;
    }

    const { pos, beat, notes } = laneData;
    const beatTime = beat || 0.5;
    const timeStart = pos - beatTime;
    const timeEnd = pos + 3 * beatTime;

    // Filter visible notes
    const visibleNotes = notes.filter(n => n.end >= timeStart && n.start <= timeEnd);

    // Calculate pitch range
    let minMidi = 127, maxMidi = 0;
    visibleNotes.forEach(n => {
      minMidi = Math.min(minMidi, n.midi);
      maxMidi = Math.max(maxMidi, n.midi);
    });
    const pitchRange = Math.max(12, maxMidi - minMidi + 4);

    // Draw beat/bar lines
    const firstBeat = Math.floor(timeStart / beatTime);
    const lastBeat = Math.ceil(timeEnd / beatTime);

    for (let i = firstBeat; i <= lastBeat; i++) {
      const time = i * beatTime;
      const x = (time - timeStart) / (timeEnd - timeStart) * canvas.clientWidth;

      ctx.strokeStyle = i % 4 === 0 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.07)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.clientHeight);
      ctx.stroke();
    }

    // Draw notes
    visibleNotes.forEach(n => {
      const resolvedColor = resolveCssVariable(color, canvas);
      const resolvedAccent = resolveCssVariable(accent, canvas);

      const x1 = (n.start - timeStart) / (timeEnd - timeStart) * canvas.clientWidth;
      const x2 = (n.end - timeStart) / (timeEnd - timeStart) * canvas.clientWidth;
      const y1 = (maxMidi - n.midi) / pitchRange * canvas.clientHeight;
      const height = Math.max(3, canvas.clientHeight / pitchRange - 1);

      ctx.globalAlpha = n.kind === "song" ? 0.45 : 0.95;
      ctx.fillStyle = n.kind === "song" ? resolvedColor : resolvedAccent;
      ctx.beginPath();
      ctx.roundRect(x1, y1, x2 - x1, height, 2);
      ctx.fill();

      // Glow for notes under playhead
      if (n.start <= pos && n.end >= pos) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = n.kind === "song" ? resolvedColor : resolvedAccent;
        ctx.beginPath();
        ctx.roundRect(x1 - 1, y1 - 1, x2 - x1 + 2, height + 2, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // Draw playhead
    const playheadX = (pos - timeStart) / (timeEnd - timeStart) * canvas.clientWidth;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvas.clientHeight);
    ctx.stroke();
  }, 30);

  return (
    <div className="relative" aria-label={label} role="img">
      <canvas ref={canvasRef} className="block h-20 w-full rounded-md" />
      <div className="flex gap-2 text-[10px] text-neutral-400">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded" style={{ background: color, opacity: 0.45 }} />
          <span>notes du morceau</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded" style={{ background: accent, opacity: 0.95 }} />
          <span>ligne jouée</span>
        </div>
      </div>
    </div>
  );
}
