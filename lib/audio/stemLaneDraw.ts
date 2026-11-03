export const LANE_H = 30;
export const RULER_H = 14;
export const PLAN_H = 12;

export type PlanStep = { start: number; end: number; label: string; color: string };

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export function drawRuler(ctx: CanvasRenderingContext2D, o: { w: number; duration: number; plan?: PlanStep[] }): void {
  if (o.duration <= 0) return;

  ctx.save();
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let s = 0; s <= o.duration; s += 0.5) {
    const x = s / o.duration * o.w;
    if (s % 30 === 0) {
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, RULER_H - 4);
      ctx.stroke();
      if (s % 60 === 0) {
        ctx.fillText(fmtTime(s), x, RULER_H - 4);
      }
    }
  }

  if (o.plan) {
    for (const p of o.plan) {
      const x = p.start / o.duration * o.w;
      const w = (p.end - p.start) / o.duration * o.w;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, RULER_H + 2, w, PLAN_H);
      if (w > 40) {
        ctx.fillStyle = "#0a0a0a";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(p.label, x + 2, RULER_H + 2 + PLAN_H / 2);
      }
    }
  }

  ctx.restore();
}

export function drawLane(ctx: CanvasRenderingContext2D, o: { w: number; h: number; duration: number; progress: number; color: string; peaks: ArrayLike<number> | null; muted: boolean; playing: boolean; loop: { active: boolean; start: number; end: number } | null }): void {
  ctx.save();
  ctx.clearRect(0, 0, o.w, o.h);

  if (o.muted || !o.peaks) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = o.color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, o.h / 2);
    ctx.lineTo(o.w, o.h / 2);
    ctx.stroke();
  } else {
    for (let x = 0; x < o.w; x++) {
      const peak = o.peaks[Math.floor(x / o.w * o.peaks.length)] || 0;
      const height = peak * (o.h / 2 - 2);
      ctx.globalAlpha = x < o.progress * o.w ? 0.95 : 0.45;
      ctx.fillStyle = o.color;
      ctx.fillRect(x, o.h / 2 - height, 1, 2 * height);
    }
  }

  if (o.loop?.active) {
    const x = o.loop.start / o.duration * o.w;
    const w = (o.loop.end - o.loop.start) / o.duration * o.w;
    ctx.strokeStyle = o.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 0, w, o.h);
  }

  if (o.playing) {
    const x = o.progress * o.w;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, 0, 2, o.h);
  }

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.restore();
}
