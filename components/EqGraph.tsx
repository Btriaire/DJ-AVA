"use client";
import { useEffect, useRef } from "react";
import type { Rack } from "@/lib/audio/Rack";
import { EQ_FREQS } from "@/lib/audio/Rack";
import { PAD, makeGeom, clampDb, fmtFreq, nodeHue, nearestNode, smoothDeltas, traceValues, type Geom } from "@/lib/audio/eqGraphGeom";

const MAJOR: Record<number, string> = { 100: "100", 1000: "1k", 10000: "10k" };

export function EqGraph({ rack, color, sampleRate, active, onEdit }: { rack: Rack; color: string; sampleRate: number; active: () => boolean; onEdit: (i: number, db: number, finished: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ rack, color, sampleRate, active, onEdit });
  const geom = useRef<Geom | null>(null);
  const drag = useRef<number | null>(null);
  const tracing = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastGain = useRef(0);
  const lastInteraction = useRef(0);
  const peak = useRef<number[]>([]);
  const bufPre = useRef(new Uint8Array(rack.eqSpectrumBins) as Uint8Array<ArrayBuffer>);
  const bufPost = useRef(new Uint8Array(rack.eqSpectrumBins) as Uint8Array<ArrayBuffer>);
  const freqBuf = useRef(new Float32Array(160) as Float32Array<ArrayBuffer>);
  const outBuf = useRef(new Float32Array(160) as Float32Array<ArrayBuffer>);
  const hover = useRef<number | null>(null);
  const lastDraw = useRef(0);
  const lastModifiedBand = useRef<number | null>(null);

  // keep the latest props readable from the draw loop and the handlers without re-creating the loop
  useEffect(() => {
    props.current = { rack, color, sampleRate, active, onEdit };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let raf = 0;

    const observer = new ResizeObserver((entries) => {
      const { width: W, height: H } = entries[0].contentRect;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geom.current = makeGeom(W, H);
      peak.current = new Array(Math.ceil(W)).fill(0);
    });
    observer.observe(canvas);

    const drawGrid = (ctx: CanvasRenderingContext2D, g: Geom) => {
      ctx.fillStyle = "#05080d";
      ctx.fillRect(0, 0, g.W, g.H);

      const gradient = ctx.createLinearGradient(0, 0, 0, g.H);
      gradient.addColorStop(0, "#05080d");
      gradient.addColorStop(1, "#0b121b");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, g.W, g.H);

      const freqs = [20, 30, 40, 50, 60, 80, 100, 200, 300, 400, 500, 600, 800, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 20000];
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      freqs.forEach(f => {
        const x = g.xOf(f);
        if (x < PAD.l || x > g.W - PAD.r) return;
        ctx.strokeStyle = MAJOR[f] ? "#ffffff22" : "#ffffff10";
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, g.H - PAD.b);
        ctx.stroke();

        if (MAJOR[f]) {
          ctx.fillStyle = "#6b7280";
          ctx.fillText(MAJOR[f], x, g.H - PAD.b + 10);
        }
      });

      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let db = -18; db <= 18; db += 6) {
        const y = g.yOf(db);
        ctx.strokeStyle = db === 0 ? "#ffffff30" : "#ffffff10";
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(g.W - PAD.r, y);
        ctx.stroke();

        if (db !== 0) {
          ctx.fillStyle = "#6b7280";
          ctx.fillText(db > 0 ? `+${db}` : `${db}`, PAD.l - 5, y);
        }
      }
    };

    const drawSpectra = (ctx: CanvasRenderingContext2D, g: Geom) => {
      const { rack, sampleRate, color } = props.current;
      const bins = rack.eqSpectrumBins;
      rack.getEqSpectrum("pre", bufPre.current);
      rack.getEqSpectrum("post", bufPost.current);

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t, g.plotW, g.plotH);
      ctx.clip();

      for (let c = 0; c < g.plotW; c += 2) {
        const x = PAD.l + c;
        const f0 = g.fOf(x);
        const f1 = g.fOf(x + 2);
        const b0 = Math.floor(f0 / (sampleRate / 2) * bins);
        const b1 = Math.ceil(f1 / (sampleRate / 2) * bins);
        let maxPre = 0, maxPost = 0;

        for (let b = Math.max(b0 + 1, Math.ceil(b0)); b < Math.min(b1, bins); b++) {
          maxPre = Math.max(maxPre, bufPre.current[b]);
          maxPost = Math.max(maxPost, bufPost.current[b]);
        }

        const hPre = g.plotH * 0.9 * (maxPre / 255);
        const hPost = g.plotH * 0.9 * (maxPost / 255);

        ctx.fillStyle = "#94a3b81a";
        ctx.fillRect(x, g.H - PAD.b - hPre, 2, hPre);

        const gradient = ctx.createLinearGradient(x, g.H - PAD.b - hPost, x, g.H - PAD.b);
        gradient.addColorStop(0, `${color}5a`);
        gradient.addColorStop(1, `${color}0d`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, g.H - PAD.b - hPost, 2, hPost);

        peak.current[c] = Math.max(hPost, peak.current[c] * 0.988);
        ctx.strokeStyle = `${color}8c`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, g.H - PAD.b - peak.current[c]);
        ctx.lineTo(x + 2, g.H - PAD.b - peak.current[c]);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawCurve = (ctx: CanvasRenderingContext2D, g: Geom) => {
      const { rack, color } = props.current;
      const freqs = freqBuf.current;
      const out = outBuf.current;

      for (let i = 0; i < 160; i++) {
        freqs[i] = 20 * Math.pow(1000, i / 159);
      }

      rack.eqResponse(freqs, out);

      ctx.beginPath();
      for (let i = 0; i < 160; i++) {
        const x = g.xOf(freqs[i]);
        const y = g.yOf(clampDb(out[i]));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.lineTo(g.W - PAD.r, g.yOf(0));
      ctx.lineTo(PAD.l, g.yOf(0));
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, PAD.t, 0, g.H - PAD.b);
      gradient.addColorStop(0, `${color}4d`);
      gradient.addColorStop(1, `${color}0d`);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 160; i++) {
        const x = g.xOf(freqs[i]);
        const y = g.yOf(clampDb(out[i]));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const drawNodes = (ctx: CanvasRenderingContext2D, g: Geom) => {
      const { rack } = props.current;
      const gains: number[] = [];
      for (let i = 0; i < 15; i++) {
        gains[i] = rack.getParam("eq", "g" + i);
      }

      for (let i = 0; i < 15; i++) {
        const x = g.xOf(EQ_FREQS[i]);
        const y = g.yOf(gains[i]);
        const radius = (hover.current === i || drag.current === i) ? 9 : 5.5;
        const hue = nodeHue(i, 15);

        ctx.fillStyle = `hsl(${hue} 85% 60%)`;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = `hsl(${hue} 85% 60%)`;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (hover.current !== null || drag.current !== null) {
        const i = hover.current ?? drag.current!;
        const x = g.xOf(EQ_FREQS[i]);
        const y = g.yOf(gains[i]);
        const text = `${fmtFreq(EQ_FREQS[i])}  ${gains[i] > 0 ? "+" : ""}${gains[i].toFixed(1)} dB`;

        ctx.fillStyle = "#000000cc";
        ctx.beginPath();
        ctx.roundRect(x - 30, y - 35, 60, 20, 4);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x, y - 25);
      }
    };

    const drawBypass = (ctx: CanvasRenderingContext2D, g: Geom) => {
      const { rack } = props.current;
      if (rack.isOn("eq")) return;

      ctx.fillStyle = "rgba(5,8,13,0.55)";
      ctx.fillRect(PAD.l, PAD.t, g.plotW, g.plotH);

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("BYPASS", g.W - PAD.r - 5, PAD.t + 5);
    };

    const draw = (ctx: CanvasRenderingContext2D, g: Geom) => {
      drawGrid(ctx, g);
      drawSpectra(ctx, g);
      drawCurve(ctx, g);
      drawNodes(ctx, g);
      drawBypass(ctx, g);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);

      if (document.hidden || !geom.current) return;

      const timeSinceLastDraw = now - lastDraw.current;
      const shouldDraw = props.current.active() || now - lastInteraction.current < 1500;
      if (!shouldDraw && timeSinceLastDraw < 250) return;

      lastDraw.current = now;
      ctx.save();
      draw(ctx, geom.current);
      ctx.restore();
    };

    raf = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [sampleRate]);

  // pointer position in the graph's CSS-pixel space (also correct under a CSS zoom on the page)
  const toLocal = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    const g = geom.current;
    if (!canvas || !g) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * (g.W / rect.width), y: (clientY - rect.top) * (g.H / rect.height) };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const local = toLocal(e.clientX, e.clientY);
    if (!local) return;

    const g = geom.current;
    if (!g) return;

    const gains: number[] = [];
    for (let i = 0; i < 15; i++) {
      gains[i] = props.current.rack.getParam("eq", "g" + i);
    }

    hover.current = nearestNode(g, EQ_FREQS, gains, local.x, local.y, 14);

    if (drag.current !== null) {
      const db = clampDb(g.dbOf(local.y));
      props.current.onEdit(drag.current, db, false);
      lastModifiedBand.current = drag.current;
      if (e.shiftKey) {
        const deltas = smoothDeltas(drag.current, db - lastGain.current, 15);
        deltas.forEach(({ k, d }) => {
          const current = props.current.rack.getParam("eq", "g" + k);
          props.current.onEdit(k, clampDb(current + d), false);
        });
      }
      lastGain.current = db;
      lastInteraction.current = performance.now();
    } else if (tracing.current) {
      const values = traceValues(g, EQ_FREQS, lastX.current, lastY.current, local.x, local.y);
      values.forEach(({ k, db }) => {
        props.current.onEdit(k, db, false);
        lastModifiedBand.current = k;
      });
      lastX.current = local.x;
      lastY.current = local.y;
      lastInteraction.current = performance.now();
    }

    canvas.style.cursor = drag.current !== null ? "grabbing" :
                         hover.current !== null ? "grab" :
                         tracing.current ? "crosshair" : "default";
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    const local = toLocal(e.clientX, e.clientY);
    if (!local) return;

    const g = geom.current;
    if (!g) return;

    const gains: number[] = [];
    for (let i = 0; i < 15; i++) {
      gains[i] = props.current.rack.getParam("eq", "g" + i);
    }

    const i = nearestNode(g, EQ_FREQS, gains, local.x, local.y, 14);
    if (i !== null) {
      drag.current = i;
      lastGain.current = gains[i];
      lastInteraction.current = performance.now();
    } else {
      tracing.current = true;
      lastX.current = local.x;
      lastY.current = local.y;
      lastInteraction.current = performance.now();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.releasePointerCapture(e.pointerId);
    if (drag.current !== null) {
      const db = props.current.rack.getParam("eq", "g" + drag.current);
      props.current.onEdit(drag.current, db, true);
      drag.current = null;
    } else if (tracing.current) {
      tracing.current = false;
      if (lastModifiedBand.current !== null) {
        const db = props.current.rack.getParam("eq", "g" + lastModifiedBand.current);
        props.current.onEdit(lastModifiedBand.current, db, true);
        lastModifiedBand.current = null;
      }
    }
  };

  const handlePointerLeave = () => {
    hover.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const local = toLocal(e.clientX, e.clientY);
    if (!local) return;

    const g = geom.current;
    if (!g) return;

    const gains: number[] = [];
    for (let i = 0; i < 15; i++) {
      gains[i] = props.current.rack.getParam("eq", "g" + i);
    }

    const i = nearestNode(g, EQ_FREQS, gains, local.x, local.y, 14);
    if (i !== null) {
      props.current.onEdit(i, 0, true);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const local = toLocal(e.clientX, e.clientY);
      if (!local) return;

      const g = geom.current;
      if (!g) return;

      const gains: number[] = [];
      for (let i = 0; i < 15; i++) {
        gains[i] = props.current.rack.getParam("eq", "g" + i);
      }

      const i = nearestNode(g, EQ_FREQS, gains, local.x, local.y, 14);
      if (i !== null) {
        const db = clampDb(gains[i] - Math.sign(e.deltaY) * 0.5);
        props.current.onEdit(i, db, true);
        lastInteraction.current = performance.now();
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="block h-[190px] w-full touch-none rounded-lg"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
