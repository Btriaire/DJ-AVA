"use client";
import { useEffect, useRef } from "react";
import { DJEngine } from "@/lib/audio/engine";

// Web Audio exposes no real CPU figure, so we estimate the DSP load from what's
// actually running: active rack modules (the Tone/convolver effects are the
// heavy ones), live stem playback (one decode + gain per stem), auto-tune
// (a worklet), and whether each deck is playing. A touch of the context's
// output latency is blended in since latency creeps up under load. The result
// is squashed through 1-e^-x so the needle reads a believable 0→100 %.
function estimateLoad(engine: DJEngine): number {
  let raw = 0;
  for (const deck of [engine.deckA, engine.deckB]) {
    if (!deck.playing) continue;
    raw += 0.4; // a playing deck: decode + EQ + filter + analyser
    const onMods = deck.rack.order.filter((id) => deck.rack.isOn(id)).length;
    raw += onMods * 0.5; // creative effects are the costly part
    if (deck.stemsActive) raw += 0.6 + deck.stemNames.length * 0.35;
    if (deck.autotuneOn) raw += 0.7; // pitch worklet
  }
  raw += Math.min(2, engine.latencyMs() / 30); // latency creep as a load proxy
  return 1 - Math.exp(-raw / 4); // soft saturation toward 1
}

const W = 132;
const H = 92;

export function CpuMeter({ engine }: { engine: DJEngine }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shownRef = useRef(0); // smoothed needle value

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // dial geometry: a 140° arc, centre near the bottom
    const cx = W / 2;
    const cy = H - 14;
    const r = 56;
    const a0 = Math.PI * 1.18; // left end
    const a1 = Math.PI * (2 - 0.18); // right end
    const span = a1 - a0;

    let raf = 0;
    const draw = () => {
      const target = estimateLoad(engine);
      shownRef.current += (target - shownRef.current) * 0.12; // ballistic smoothing
      const v = shownRef.current;

      ctx.clearRect(0, 0, W, H);

      // coloured zones: green → amber → red
      const zones: [number, number, string][] = [
        [0, 0.6, "#3ad17a"],
        [0.6, 0.85, "#ffb02e"],
        [0.85, 1, "#ff4646"],
      ];
      ctx.lineWidth = 6;
      for (const [z0, z1, col] of zones) {
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.arc(cx, cy, r, a0 + span * z0, a0 + span * z1);
        ctx.stroke();
      }

      // tick marks
      ctx.strokeStyle = "#7a7a7a";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const a = a0 + (span * i) / 10;
        const inner = i % 5 === 0 ? r - 11 : r - 7;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
        ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.stroke();
      }

      // needle
      const na = a0 + span * Math.min(1, Math.max(0, v));
      const nx = cx + Math.cos(na) * (r - 6);
      const ny = cy + Math.sin(na) * (r - 6);
      const hot = v > 0.85 ? "#ff4646" : v > 0.6 ? "#ffb02e" : "#e8e8e8";
      ctx.strokeStyle = hot;
      ctx.lineWidth = 2;
      ctx.shadowColor = hot;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // hub
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.stroke();

      // labels
      ctx.fillStyle = "#8a8a8a";
      ctx.font = "700 8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("CPU", cx, 12);
      ctx.fillStyle = hot;
      ctx.font = "700 11px ui-monospace, monospace";
      ctx.fillText(`${Math.round(v * 100)}%`, cx, cy + 8);

      raf = requestAnimationFrame(draw);
    };
    // throttle to ~15fps via timer-driven rAF would be ideal, but a rAF gated by
    // the smoothing constant is cheap enough; the needle integrates anyway.
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className="hw-recess flex shrink-0 items-center justify-center rounded p-1" title="Charge processeur (estimée)">
      <canvas ref={canvasRef} style={{ width: W, height: H }} />
    </div>
  );
}
