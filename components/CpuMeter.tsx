"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";

type RenderCapacityUpdate = { averageLoad: number; peakLoad: number; underrunRatio: number; timestamp: number };
type RenderCapacity = {
  start(options?: { updateInterval?: number }): void;
  stop(): void;
  addEventListener(type: "update", listener: (event: RenderCapacityUpdate) => void): void;
  removeEventListener(type: "update", listener: (event: RenderCapacityUpdate) => void): void;
};

const W = 132;
const H = 92;
const MAX_DPR = 2;
const REFRESH_INTERVAL = 80;
const DROP_LED_DURATION = 2000;
const STALE_THRESHOLD = 2000;
const LABEL_REFRESH_INTERVAL = 250;
const SMOOTHING_FACTOR = 0.25;
const PEAK_DECAY_FACTOR = 0.99;
const MIN_ESTIMATED_LOAD = 0.05;

export function CpuMeter({ engine }: { engine: DJEngine }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const renderCapacityRef = useRef<RenderCapacity | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const dropCountRef = useRef<number>(0);
  const dropLedVisibleRef = useRef<boolean>(false);
  const displayedLoadRef = useRef<number>(0);
  const displayedPeakRef = useRef<number>(0);
  const lastUnderrunRef = useRef<number>(0);
  const labelRef = useRef<"MESURÉ" | "ESTIMÉ" | "VEILLE">("VEILLE");
  const subscribedCtxRef = useRef<AudioContext | null>(null);
  const [, forceUpdate] = useState(0);

  const estimateLoad = (engine: DJEngine): number => {
    let raw = 0;
    for (const deck of [engine.deckA, engine.deckB]) {
      if (deck.playing) raw += 0.7;
      const onMods = deck.rack.order.filter(id => deck.rack.isOn(id)).length;
      raw += onMods * 0.95;
      if (deck.stemsActive) raw += 1.1 + deck.stemNames.length * 0.55;
      if (deck.autotuneOn) raw += 1.1;
      if (deck.bufferLoading) raw += 0.8;
    }
    raw += Math.min(0.5, engine.latencyMs() / 60);
    return Math.max(MIN_ESTIMATED_LOAD, 1 - Math.exp(-raw / 2.0));
  };

  const updateLabel = (engine: DJEngine, lastUpdate: number) => {
    const ctx = engine.ctx;
    const now = Date.now();
    const isRunning = ctx.state === "running";
    const isFresh = now - lastUpdate < STALE_THRESHOLD;

    if (!isRunning) {
      labelRef.current = "VEILLE";
    } else if (renderCapacityRef.current && isFresh) {
      labelRef.current = "MESURÉ";
    } else {
      labelRef.current = "ESTIMÉ";
    }
    forceUpdate(n => n + 1);
  };

  const handleUpdate = (event: RenderCapacityUpdate) => {
    lastUpdateRef.current = Date.now();
    displayedLoadRef.current = event.averageLoad;
    displayedPeakRef.current = Math.max(displayedPeakRef.current, event.peakLoad);

    if (event.underrunRatio > lastUnderrunRef.current) {
      dropCountRef.current += 1;
      dropLedVisibleRef.current = true;
      setTimeout(() => {
        dropLedVisibleRef.current = false;
        forceUpdate(n => n + 1);
      }, DROP_LED_DURATION);
    }
    lastUnderrunRef.current = event.underrunRatio;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const canvasCtx = canvasCtxRef.current;
    if (!canvas || !canvasCtx) return;

    // Background
    canvasCtx.clearRect(0, 0, W, H);
    canvasCtx.fillStyle = "#1a1a1a";
    canvasCtx.fillRect(0, 0, W, H);

    // Arc
    const centerX = W / 2;
    const centerY = H / 2;
    const radius = 30;
    const startAngle = -Math.PI * 0.7;
    const endAngle = Math.PI * 0.7;
    const arcWidth = 4;

    canvasCtx.lineWidth = arcWidth;
    canvasCtx.strokeStyle = "#333";
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, radius, startAngle, endAngle);
    canvasCtx.stroke();

    // Zones
    const zone1End = startAngle + (endAngle - startAngle) * 0.6;
    const zone2End = startAngle + (endAngle - startAngle) * 0.85;

    canvasCtx.strokeStyle = "#4CAF50";
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, radius, startAngle, zone1End);
    canvasCtx.stroke();

    canvasCtx.strokeStyle = "#FFC107";
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, radius, zone1End, zone2End);
    canvasCtx.stroke();

    canvasCtx.strokeStyle = "#F44336";
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, radius, zone2End, endAngle);
    canvasCtx.stroke();

    // Needle
    const loadAngle = startAngle + (endAngle - startAngle) * displayedLoadRef.current;
    canvasCtx.strokeStyle = "#FFF";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(centerX, centerY);
    canvasCtx.lineTo(
      centerX + radius * Math.cos(loadAngle),
      centerY + radius * Math.sin(loadAngle)
    );
    canvasCtx.stroke();

    // Peak marker
    const peakAngle = startAngle + (endAngle - startAngle) * displayedPeakRef.current;
    canvasCtx.fillStyle = "#F44336";
    canvasCtx.beginPath();
    canvasCtx.arc(
      centerX + (radius + 5) * Math.cos(peakAngle),
      centerY + (radius + 5) * Math.sin(peakAngle),
      2,
      0,
      Math.PI * 2
    );
    canvasCtx.fill();

    // Drop LED
    if (dropLedVisibleRef.current) {
      canvasCtx.fillStyle = "#F44336";
      canvasCtx.beginPath();
      canvasCtx.arc(10, 10, 5, 0, Math.PI * 2);
      canvasCtx.fill();
      canvasCtx.fillStyle = "#FFF";
      canvasCtx.font = "8px Arial";
      canvasCtx.fillText("DROP", 18, 13);
    }

    // Value
    canvasCtx.fillStyle = "#FFF";
    canvasCtx.font = "12px Arial";
    canvasCtx.textAlign = "center";
    canvasCtx.fillText(`${Math.round(displayedLoadRef.current * 100)}%`, centerX, centerY + 5);

    // Label
    canvasCtx.fillStyle = "#AAA";
    canvasCtx.font = "8px Arial";
    canvasCtx.textAlign = "left";
    canvasCtx.fillText(labelRef.current, 5, H - 5);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio, MAX_DPR);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasCtxRef.current = canvasCtx;

    const ctx = engine.ctx;
    const renderCapacity = (ctx as AudioContext & { renderCapacity?: RenderCapacity }).renderCapacity;

    if (renderCapacity) {
      renderCapacityRef.current = renderCapacity;
      subscribedCtxRef.current = ctx;
      renderCapacity.start({ updateInterval: 0.5 });
      renderCapacity.addEventListener("update", handleUpdate);
    }

    const labelInterval = setInterval(() => updateLabel(engine, lastUpdateRef.current), LABEL_REFRESH_INTERVAL);
    const animationFrame = requestAnimationFrame(function frame() {
      const now = Date.now();
      const isRunning = ctx.state === "running";
      const isFresh = now - lastUpdateRef.current < STALE_THRESHOLD;

      // Re-subscribe if context changed
      if (subscribedCtxRef.current !== ctx) {
        if (renderCapacityRef.current) {
          renderCapacityRef.current.stop();
          renderCapacityRef.current.removeEventListener("update", handleUpdate);
        }
        const newRenderCapacity = (ctx as AudioContext & { renderCapacity?: RenderCapacity }).renderCapacity;
        if (newRenderCapacity) {
          renderCapacityRef.current = newRenderCapacity;
          subscribedCtxRef.current = ctx;
          newRenderCapacity.start({ updateInterval: 0.5 });
          newRenderCapacity.addEventListener("update", handleUpdate);
        }
      }

      if (!renderCapacityRef.current || !isRunning || !isFresh) {
        const estimatedLoad = estimateLoad(engine);
        displayedLoadRef.current = SMOOTHING_FACTOR * estimatedLoad + (1 - SMOOTHING_FACTOR) * displayedLoadRef.current;
      }

      displayedPeakRef.current *= PEAK_DECAY_FACTOR;
      draw();

      setTimeout(() => requestAnimationFrame(frame), REFRESH_INTERVAL);
    });

    return () => {
      clearInterval(labelInterval);
      cancelAnimationFrame(animationFrame);

      if (renderCapacityRef.current) {
        renderCapacityRef.current.stop();
        renderCapacityRef.current.removeEventListener("update", handleUpdate);
      }
    };
  }, [engine, draw]);

  return (
    <div
      className="hw-recess flex shrink-0 items-center justify-center rounded p-1"
      title={
        labelRef.current === "MESURÉ"
          ? "Charge CPU mesurée par l'API Web Audio"
          : labelRef.current === "ESTIMÉ"
          ? "Charge CPU estimée par l'état des decks"
          : "Moteur audio en veille"
      }
      style={{ width: W, height: H }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
