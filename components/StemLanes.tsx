"use client";
import { useEffect, useRef } from "react";
import type { Deck } from "@/lib/audio/Deck";

const STEM_COLORS: Record<string, string> = {
  vocals: "#fdba74",
  drums: "#fb923c",
  bass: "#a78bfa",
  other: "#38bdf8",
  guitar: "#a3e635",
  piano: "#facc15",
};

export function StemLanes({ deck, color }: { deck: Deck; color: string }) {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const lastTime = useRef(0);
  const dirty = useRef(true);
  const lastState = useRef<{
    position: number;
    loopState: ({ active: boolean; start: number; end: number } | null)[];
    volumes: number[];
  }>({
    position: 0,
    loopState: [],
    volumes: [],
  });

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const canvas = entry.target as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth;
        const cssH = 26;

        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dirty.current = true;
      });
    });

    canvases.current.forEach((canvas) => {
      if (canvas) resizeObserver.observe(canvas);
    });

    let rafId: number;
    const draw = (time: number) => {
      if (time - lastTime.current < 33) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastTime.current = time;

      const needsRedraw = dirty.current || deck.playing ||
        deck.position() !== lastState.current.position ||
        deck.stemVol.some((v, i) => v !== lastState.current.volumes[i]) ||
        deck.stemNames.some((_, i) => {
          const ls = deck.getStemLoopState(i);
          const lastLs = lastState.current.loopState[i];
          return ls?.active !== lastLs?.active ||
            ls?.start !== lastLs?.start ||
            ls?.end !== lastLs?.end;
        });

      if (!needsRedraw) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      lastState.current = {
        position: deck.position(),
        loopState: deck.stemNames.map((_, i) => deck.getStemLoopState(i)),
        volumes: [...deck.stemVol],
      };

      canvases.current.forEach((canvas, i) => {
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth;
        const cssH = 26;
        const peaks = deck.getStemPeaks(i);
        const loopState = deck.getStemLoopState(i);
        const volume = deck.stemVol[i];
        const progress = deck.duration > 0 ? deck.position() / deck.duration : 0;

        ctx.clearRect(0, 0, cssW * dpr, cssH * dpr);

        if (!peaks || volume <= 0.001) {
          ctx.globalAlpha = 0.25;
        } else {
          ctx.globalAlpha = 1;
        }

        const stemColor = STEM_COLORS[deck.stemNames[i]] || color;

        // Draw waveform
        ctx.fillStyle = stemColor;
        for (let x = 0; x < cssW; x++) {
          const peak = peaks?.[Math.floor((x / cssW) * (peaks?.length || 0))] || 0;
          const height = peak * (cssH / 2 - 2);
          const isPlayed = x < progress * cssW;

          ctx.globalAlpha = isPlayed ? 1 : 0.35;
          ctx.fillRect(x, cssH / 2 - height, 1, height * 2);
        }

        // Draw loop
        if (loopState?.active) {
          ctx.globalAlpha = 0.18;
          const startX = (loopState.start / deck.duration) * cssW;
          const endX = (loopState.end / deck.duration) * cssW;
          ctx.fillStyle = stemColor;
          ctx.fillRect(startX, 0, endX - startX, cssH);
        }

        // Draw playhead
        if (deck.playing) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#fff";
          ctx.fillRect(progress * cssW, 0, 1.5, cssH);
        }
      });
      dirty.current = false;

      rafId = requestAnimationFrame(draw);
    };

    // first frame drawn synchronously: animation frames may not run while the page is hidden
    draw(performance.now());
    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [deck, color]);

  return (
    <div className="flex flex-col gap-1">
      {deck.stemNames.map((name, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-14 text-[10px] font-bold uppercase">
            {name}
          </span>
          <canvas
            ref={(el) => { canvases.current[i] = el; }}
            className="block w-full rounded bg-neutral-950"
            style={{ height: "26px", cursor: "pointer" }}
            onPointerDown={(e) => {
              const canvas = e.currentTarget;
              const r = canvas.getBoundingClientRect();
              const f = (e.clientX - r.left) / r.width;
              deck.seek(Math.max(0, Math.min(1, f)) * deck.duration);
            }}
            title="Clique pour te placer dans ce stem"
          />
        </div>
      ))}
    </div>
  );
}
