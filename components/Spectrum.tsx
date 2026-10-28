"use client";
import { useRef } from "react";
import { useFrameLoop } from "./frameLoop";
import { Deck } from "@/lib/audio/Deck";
import { levelColor } from "./EqVisuals";

interface Props {
  deck: Deck;
  color: string;
}

// Live frequency spectrum of whatever the deck is playing (post EQ/filter/FX).
// Reads the deck's analyser in the shared frame loop.
// Bars are colorised green→yellow→orange→red by intensity, matching the EQ meters.
export function Spectrum({ deck }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const data = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // 30 frames per second, only while the spectrum is on screen (one shared loop for every meter)
  useFrameLoop(canvasRef, () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!data.current || data.current.length !== deck.fftBins) data.current = new Uint8Array(deck.fftBins);
    const d = data.current;
    const BARS = 48;
    const w = canvas.width;
    const h = canvas.height;
    deck.getSpectrum(d);
    ctx.clearRect(0, 0, w, h);
    const gap = 1;
    const bw = w / BARS;
    // map bars across the lower ~3/4 of bins (most musical energy) on a curve
    for (let i = 0; i < BARS; i++) {
      const frac = Math.pow(i / BARS, 1.6);
      const bin = Math.min(d.length - 1, Math.floor(frac * d.length * 0.75));
      const mag = d[bin] / 255;
      const bh = Math.max(1, mag * h);
      const barColor = levelColor(mag);
      const grad = ctx.createLinearGradient(0, h, 0, h - bh);
      grad.addColorStop(0, barColor + "33");
      grad.addColorStop(1, barColor);
      ctx.fillStyle = grad;
      ctx.fillRect(i * bw, h - bh, bw - gap, bh);
    }
  });

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={56}
      className="h-14 w-full rounded-lg bg-neutral-950 ring-1 ring-neutral-800"
    />
  );
}
