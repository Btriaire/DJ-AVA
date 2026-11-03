"use client";
import { useEffect, useRef } from "react";
import type { Deck } from "@/lib/audio/Deck";
import { LANE_H, RULER_H, PLAN_H, drawRuler, drawLane, type PlanStep } from "@/lib/audio/stemLaneDraw";
import { usePlanSteps } from "@/lib/planStore";

const STEM_COLORS: Record<string, string> = {
  vocals: "#fdba74",
  drums: "#fb923c",
  bass: "#a78bfa",
  other: "#38bdf8",
  guitar: "#a3e635",
  piano: "#facc15",
};

const STEM_LABELS: Record<string, string> = {
  vocals: "Voix",
  drums: "Batterie",
  bass: "Basse",
  other: "Reste",
  guitar: "Guitare",
  piano: "Piano",
};

export function StemLanes({ deck, color, plan: planProp }: { deck: Deck; color: string; plan?: PlanStep[] }) {
  const storedPlan = usePlanSteps(deck);
  const plan = planProp ?? storedPlan;
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const rulerCanvas = useRef<HTMLCanvasElement | null>(null);
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
        const cssH = canvas === rulerCanvas.current ? RULER_H + PLAN_H + 4 : LANE_H;

        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dirty.current = true;
      });
    });

    if (rulerCanvas.current) resizeObserver.observe(rulerCanvas.current);
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

      if (rulerCanvas.current) {
        const ctx = rulerCanvas.current.getContext("2d");
        if (ctx) {
          drawRuler(ctx, {
            w: rulerCanvas.current.width,
            duration: deck.duration,
            plan,
          });
        }
      }

      canvases.current.forEach((canvas, i) => {
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth;
        const peaks = deck.getStemPeaks(i);
        const loopState = deck.getStemLoopState(i);
        const volume = deck.stemVol[i];
        const progress = deck.duration > 0 ? deck.position() / deck.duration : 0;
        const stemColor = STEM_COLORS[deck.stemNames[i]] || color;

        drawLane(ctx, {
          w: cssW * dpr,
          h: LANE_H * dpr,
          duration: deck.duration,
          progress,
          color: stemColor,
          peaks,
          muted: volume <= 0.001,
          playing: deck.playing,
          loop: loopState,
        });
      });
      dirty.current = false;

      rafId = requestAnimationFrame(draw);
    };

    draw(performance.now());
    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [deck, color, plan]);

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={rulerCanvas}
        className="block w-full rounded bg-neutral-950"
        style={{ height: `${RULER_H + PLAN_H + 4}px`, cursor: "pointer" }}
        onPointerDown={(e) => {
          const canvas = e.currentTarget;
          const r = canvas.getBoundingClientRect();
          const f = (e.clientX - r.left) / r.width;
          deck.seek(Math.max(0, Math.min(1, f)) * deck.duration);
        }}
        title="Clique pour te placer dans le stem"
      />
      {deck.stemNames.map((name, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-14 text-[10px] font-bold uppercase">
            {STEM_LABELS[name] || name}{deck.stemVol[i] <= 0.001 ? " (coupé)" : ""}
          </span>
          <canvas
            ref={(el) => { canvases.current[i] = el; }}
            className="block w-full rounded bg-neutral-950"
            style={{ height: `${LANE_H}px`, cursor: "pointer" }}
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
