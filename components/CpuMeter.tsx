"use client";
import { useEffect, useRef } from "react";
import { DJEngine } from "@/lib/audio/engine";

// Web Audio exposes no real CPU figure, so we estimate the DSP load from what's
// actually running: active rack modules (the Tone/convolver effects are the
// heavy ones), live stem playback (one decode + gain per stem), auto-tune
// (a worklet), and whether each deck is playing. One real, MEASURED signal is
// blended in so the needle actually breathes instead of sitting flat: main-
// thread frame jank (`jankExtra`, how far the rAF cadence slips past 16.7 ms).
// The sum is squashed through 1-e^-x so realistic loads reach the amber/red
// zones without idle sitting near the top.
function estimateLoad(engine: DJEngine, jankExtra: number): number {
  let raw = 0.05; // idle floor (audio thread + rAF loop never truly zero)
  for (const deck of [engine.deckA, engine.deckB]) {
    if (!deck.playing) continue;
    raw += 0.7; // playing deck: source node + EQ + filter + analyser
    const onMods = deck.rack.order.filter((id) => deck.rack.isOn(id)).length;
    raw += onMods * 0.95; // each active Rack module (convolver/delay are heavy)
    if (deck.stemsActive) raw += 1.1 + deck.stemNames.length * 0.55;
    if (deck.autotuneOn) raw += 1.1; // pitch worklet is expensive
    if (deck.bufferLoading) raw += 0.8; // background decodeAudioData in flight
  }
  // output latency is mostly hardware/OS-fixed, not an app-load signal — keep
  // its nudge small so it can't dominate the reading on its own.
  raw += Math.min(0.5, engine.latencyMs() / 60);
  // rAF jank: how many extra 16.7 ms frames the main thread took — a real,
  // if noisy, live CPU signal. Capped so a brief stall doesn't peg the meter.
  raw += Math.min(2.0, jankExtra * 1.1);
  // divisor 2.0: idle ≈8-15%, 1 deck ≈30-40%, stems+FX ≈60-75%, all-out ≈85%+.
  return 1 - Math.exp(-raw / 2.0);
}

const W = 132;
const H = 92;
const PAINT_INTERVAL_MS = 80; // ~12 fps — a needle gauge doesn't need 60 fps,
// and redrawing less means the meter stops feeding its own render cost back
// into the "jank" signal it uses to estimate load.
const WARMUP_MS = 2500; // ignore jank from initial page hydration/paint

export function CpuMeter({ engine }: { engine: DJEngine }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shownRef = useRef(0); // smoothed needle value
  const jankRef = useRef(0); // EMA of frame-time overshoot past 16.7 ms (live load)
  const lastTsRef = useRef(0); // previous rAF timestamp
  const lastPaintRef = useRef(0);
  const mountTsRef = useRef(0);

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

    mountTsRef.current = performance.now();
    let raf = 0;
    const tick = (ts: number) => {
      // Measure how much the frame cadence slips past the 60 fps budget —
      // but only once the page has settled; hydration/initial paint jank
      // isn't a meaningful "app is under load" signal and was the main
      // reason the needle used to slam to the top on first render.
      const warmedUp = ts - mountTsRef.current > WARMUP_MS;
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last && warmedUp) {
        const dt = ts - last;
        const extra = Math.max(0, dt - 16.7) / 16.7; // 0 at 60fps, ~1 at 30fps
        // fast attack so spikes show, slow release so it doesn't flicker to 0
        const k = extra > jankRef.current ? 0.4 : 0.06;
        jankRef.current += (extra - jankRef.current) * k;
      }

      const target = estimateLoad(engine, warmedUp ? jankRef.current : 0);
      shownRef.current += (target - shownRef.current) * 0.2; // ballistic smoothing

      // the needle value updates every frame (cheap), but the canvas only
      // repaints at ~12 fps — plenty smooth for a gauge, and it means this
      // component's own drawing no longer inflates the jank it measures.
      if (ts - lastPaintRef.current >= PAINT_INTERVAL_MS) {
        lastPaintRef.current = ts;
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
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className="hw-recess flex shrink-0 items-center justify-center rounded p-1" title="Charge processeur (estimée)">
      <canvas ref={canvasRef} style={{ width: W, height: H }} />
    </div>
  );
}
