"use client";
import { useRef } from "react";

export function FxXyPad({
  x,
  y,
  color,
  labelX,
  labelY,
  fmtX,
  fmtY,
  defX,
  defY,
  onChange,
}: {
  x: number;
  y: number;
  color: string;
  labelX: string;
  labelY: string;
  fmtX: (v: number) => string;
  fmtY: (v: number) => string;
  defX: number;
  defY: number;
  onChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function setFromEvent(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange(nx, 1 - ny);
  }

  const active = x !== defX || y !== defY;

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={ref}
        className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-lg"
        style={{
          width: "100%",
          height: 110,
          background: "radial-gradient(120% 120% at 50% 0%, #0b1420 0%, #04070c 75%)",
          boxShadow: `inset 0 0 22px rgba(0,0,0,0.9), inset 0 0 0 1px ${active ? color + "55" : "#1b2a3a"}`,
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setFromEvent(e);
        }}
        onPointerMove={(e) => dragging.current && setFromEvent(e)}
        onPointerUp={() => (dragging.current = false)}
        onDoubleClick={() => onChange(defX, defY)}
        title="Glisse pour régler les deux paramètres. Double-clic : valeurs par défaut"
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          {[25, 50, 75].map((g) => (
            <line key={"v" + g} x1={g} y1="0" x2={g} y2="100" stroke="#13202e" strokeWidth="1" />
          ))}
          {[33, 66].map((g) => (
            <line key={"h" + g} x1="0" y1={g} x2="100" y2={g} stroke="#13202e" strokeWidth="1" />
          ))}
          <line x1="50" y1="0" x2="50" y2="100" stroke="#243a50" strokeWidth="1" strokeDasharray="3 4" />
        </svg>
        <div
          className="pointer-events-none absolute h-[1px] w-full"
          style={{
            top: `${(1 - y) * 100}%`,
            backgroundColor: `${color}59`,
          }}
        />
        <div
          className="pointer-events-none absolute h-full w-[1px]"
          style={{
            left: `${x * 100}%`,
            backgroundColor: `${color}59`,
          }}
        />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${x * 100}%`,
            top: `${(1 - y) * 100}%`,
            background: `radial-gradient(circle at 35% 30%, #fff, ${color} 55%, ${color}88)`,
            boxShadow: `0 0 10px ${color}, 0 0 22px ${color}99, 0 0 0 2px #000`,
          }}
        />
      </div>
      <div className="flex justify-between font-mono text-[11px]" style={{ color }}>
        <span>{labelX} {fmtX(x)}</span>
        <span>{labelY} {fmtY(y)}</span>
      </div>
    </div>
  );
}
