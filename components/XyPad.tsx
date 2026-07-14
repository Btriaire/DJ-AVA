"use client";
import { useCallback, useRef } from "react";

interface Props {
  x: number; // 0..1
  y: number; // 0..1
  color: string;
  size?: number;
  onChange: (x: number, y: number) => void;
  xLabel?: string;
  yLabel?: string;
}

// Logic Pro–style 2D touch pad: drag a puck anywhere in the square to control
// two parameters at once (X horizontal, Y vertical — inverted so up = more).
export function XyPad({ x, y, color, size = 140, onChange, xLabel = "X", yLabel = "Y" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const ny = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
      onChange(nx, ny);
    },
    [onChange]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    updateFromPointer(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = false;
  };

  const px = x * size;
  const py = (1 - y) * size;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative touch-none select-none rounded"
        style={{
          width: size,
          height: size,
          background: "radial-gradient(circle at 50% 50%, #12141a 0%, #0a0b0e 100%)",
          boxShadow: "inset 0 0 0 1px #000, inset 0 2px 6px rgba(0,0,0,.8)",
          cursor: "crosshair",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
        }}
        title="Glisse le doigt/curseur — X et Y contrôlent 2 effets à la fois"
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <span key={"v" + f} style={{ position: "absolute", left: f * size, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.06)" }} />
        ))}
        {[0.25, 0.5, 0.75].map((f) => (
          <span key={"h" + f} style={{ position: "absolute", top: f * size, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.06)" }} />
        ))}
        {/* crosshair through the puck */}
        <span style={{ position: "absolute", left: px, top: 0, bottom: 0, width: 1, background: color + "55" }} />
        <span style={{ position: "absolute", top: py, left: 0, right: 0, height: 1, background: color + "55" }} />
        {/* puck */}
        <span
          style={{
            position: "absolute",
            left: px,
            top: py,
            width: 16,
            height: 16,
            marginLeft: -8,
            marginTop: -8,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, #fff8, ${color})`,
            boxShadow: `0 0 10px ${color}, 0 0 2px #000 inset`,
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        />
      </div>
      <div className="flex w-full justify-between px-0.5 font-mono text-[8px] font-bold" style={{ color }}>
        <span>{xLabel} {Math.round(x * 100)}%</span>
        <span>{yLabel} {Math.round(y * 100)}%</span>
      </div>
    </div>
  );
}
