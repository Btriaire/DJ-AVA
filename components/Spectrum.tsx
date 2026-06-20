"use client";
import { useEffect, useRef } from "react";
import { Deck } from "@/lib/audio/Deck";

interface Props {
  deck: Deck;
  color: string;
}

// Live frequency spectrum of whatever the deck is playing (post EQ/filter/FX).
// Runs its own animation loop reading the deck's analyser each frame.
export function Spectrum({ deck, color }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const data = new Uint8Array(deck.fftBins);
    const BARS = 48;
    let raf = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      deck.getSpectrum(data);
      ctx.clearRect(0, 0, w, h);

      const gap = 1;
      const bw = w / BARS;
      // map bars across the lower ~3/4 of bins (most musical energy) on a curve
      for (let i = 0; i < BARS; i++) {
        const frac = Math.pow(i / BARS, 1.6);
        const bin = Math.min(data.length - 1, Math.floor(frac * data.length * 0.75));
        const mag = data[bin] / 255;
        const bh = Math.max(1, mag * h);
        const grad = ctx.createLinearGradient(0, h, 0, h - bh);
        grad.addColorStop(0, color + "33");
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw, h - bh, bw - gap, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [deck, color]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={56}
      className="h-14 w-full rounded-lg bg-neutral-950 ring-1 ring-neutral-800"
    />
  );
}
