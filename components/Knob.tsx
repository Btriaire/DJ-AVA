"use client";
import { useCallback, useRef } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  onChange: (v: number) => void;
  color?: string;
  size?: number;
  format?: (v: number) => string;
  variant?: "dark" | "op1";
  capColor?: string;
  // show a small LED "voyant" under the knob that lights up (in `color`) as soon
  // as the value leaves its default — i.e. when the pot is actually in use.
  led?: boolean;
}

// Vertical-drag rotary knob. Double-click resets to default.
export function Knob({
  label,
  value,
  min,
  max,
  defaultValue = (min + max) / 2,
  onChange,
  color = "#ff8a1e",
  size = 54,
  format,
  variant = "dark",
  capColor = "#e8e6e0",
  led = false,
}: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const range = max - min;
  const norm = (value - min) / range;
  const angle = -135 + norm * 270;
  // "in use" = value moved off its default → arc lights up, voyant glows
  const active = Math.abs(value - defaultValue) > range * 0.005;
  // when an LED knob is idle, the arc/needle are dimmed so only used pots glow
  const live = led && !active ? "#4a4633" : color;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, v: value };
    },
    [value]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const dy = drag.current.y - e.clientY;
      const next = Math.max(min, Math.min(max, drag.current.v + (dy / 150) * range));
      onChange(next);
    },
    [min, max, range, onChange]
  );

  const end = () => (drag.current = null);

  // value arc: from -135° start, sweeping clockwise. SVG uses 0° = up.
  const arcR = size / 2 - 1;
  const cx = size / 2;
  const sweep = norm * 270;
  const pol = (deg: number) => {
    const r = ((deg - 90) * Math.PI) / 180;
    return [cx + arcR * Math.cos(r), cx + arcR * Math.sin(r)];
  };
  const [sx, sy] = pol(-135);
  const [ex, ey] = pol(-135 + sweep);
  const large = sweep > 180 ? 1 : 0;

  if (variant === "op1") {
    return (
      <div className="flex flex-col items-center gap-1 select-none">
        <div
          className="op1-knob relative cursor-ns-resize"
          style={{ width: size, height: size }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          onDoubleClick={() => onChange(defaultValue)}
        >
          <div
            className="op1-knob-cap absolute inset-[3px] rounded-full"
            style={{ background: capColor, transform: `rotate(${angle}deg)` }}
          >
            <div
              className="absolute left-1/2 top-[5px] h-[6px] w-[6px] -translate-x-1/2 rounded-full"
              style={{ background: capColor === "#e8e6e0" ? "#333" : "#fff" }}
            />
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
        {format && <span className="text-[10px] text-neutral-400">{format(value)}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        className="hw-knob relative cursor-ns-resize"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => onChange(defaultValue)}
      >
        {/* value arc */}
        <svg className="pointer-events-none absolute inset-0" width={size} height={size}>
          <path
            d={`M ${pol(-135)[0]} ${pol(-135)[1]} A ${arcR} ${arcR} 0 1 1 ${pol(135)[0]} ${pol(135)[1]}`}
            fill="none"
            stroke="#000"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.6}
          />
          {sweep > 0.5 && (
            <path
              d={`M ${sx} ${sy} A ${arcR} ${arcR} 0 ${large} 1 ${ex} ${ey}`}
              fill="none"
              stroke={live}
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ filter: led ? "none" : `drop-shadow(0 0 3px ${live})` }}
            />
          )}
        </svg>
        {/* rotating cap */}
        <div
          className="hw-knob-cap absolute inset-[5px] rounded-full"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div
            className="absolute left-1/2 top-[3px] -translate-x-1/2 rounded-full"
            style={{
              width: 3,
              height: size / 4,
              // led knobs: plain matte pointer (no glow) so the voyant is the ONLY light
              background: led ? "#cdcabb" : live,
              boxShadow: led ? "none" : `0 0 5px ${live}`,
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        {led && (
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: active ? color : "#2a2a22",
              boxShadow: active ? `0 0 6px ${color}, 0 0 2px ${color}` : "inset 0 0 2px #000",
              transition: "background .1s, box-shadow .1s",
            }}
          />
        )}
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
      </div>
      {format && <span className="text-[10px] text-neutral-500">{format(value)}</span>}
    </div>
  );
}
