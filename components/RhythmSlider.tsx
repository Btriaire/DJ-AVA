"use client";
import { useRef, type CSSProperties } from "react";

const CAP = "linear-gradient(180deg, oklch(62% 0.01 240), oklch(38% 0.01 240) 48%, oklch(30% 0.01 240) 52%, oklch(46% 0.01 240))";
const DEFAULT_COLOR = "oklch(76% 0.17 205)";

// horizontal console fader: lit groove, scale, metal cap, LCD readout.
// Drag (shift = fine), click on the groove, wheel, arrows, double-click or Home to reset.
export function HSlider({ label, value, min, max, step = 0.01, onChange, format, color = DEFAULT_COLOR, reset, ticks = 8, className }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  format?: (v: number) => string; color?: string; reset?: number; ticks?: number; className?: string;
}) {
  const groove = useRef<HTMLDivElement>(null);
  const span = max - min;
  const p = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  // the value, not a step, moves by a fraction: 1/200 of the range for fine moves (the step can be coarse)
  const put = (v: number) => onChange(Number(snap(v).toFixed(6)));
  const at = (x: number) => {
    const r = groove.current!.getBoundingClientRect();
    return min + Math.min(1, Math.max(0, (x - r.left) / r.width)) * span;
  };
  const text = format ? format(value) : String(value);

  return (
    <div className={`flex min-w-[120px] flex-col gap-0.5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</span>
        <span className="rounded-sm border border-neutral-700 bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums" style={{ color, textShadow: `0 0 4px ${color}` }}>{text}</span>
      </div>
      <div
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text}
        className="relative h-9 cursor-ew-resize touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        onPointerDown={(e) => {
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          let last = e.clientX;
          let cur = value;
          // a click on the groove jumps there; a click on the cap only starts the drag
          if (Math.abs(at(e.clientX) - value) > span * 0.06) { cur = at(e.clientX); put(cur); }
          const move = (m: PointerEvent) => {
            const w = groove.current!.getBoundingClientRect().width || 1;
            cur += ((m.clientX - last) / w) * span * (m.shiftKey ? 0.15 : 1);
            last = m.clientX;
            cur = Math.min(max, Math.max(min, cur));
            put(cur);
          };
          const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
          el.addEventListener("pointercancel", up);
        }}
        onDoubleClick={() => put(reset ?? min)}
        onWheel={(e) => put(value - Math.sign(e.deltaY) * (e.shiftKey ? span / 200 : Math.max(step, span / 40)))}
        onKeyDown={(e) => {
          const st = e.shiftKey ? span / 200 : Math.max(step, span / 40);
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); put(value + st); }
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); put(value - st); }
          else if (e.key === "Home") { e.preventDefault(); put(reset ?? min); }
          else if (e.key === "End") { e.preventDefault(); put(max); }
        }}
      >
        <div ref={groove} className="absolute left-2 right-2 top-0 bottom-0">
          {/* scale under the groove */}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const major = i === 0 || i === ticks || i * 2 === ticks;
            return <span key={i} className="absolute top-[26px] w-px -translate-x-1/2 bg-neutral-500" style={{ left: `${(i / ticks) * 100}%`, height: major ? 6 : 4 }} />;
          })}
          {reset !== undefined && span > 0 && <span className="absolute top-[7px] h-[17px] w-px" style={{ left: `${((reset - min) / span) * 100}%`, background: color, opacity: 0.55 }} />}
          <span className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-[calc(50%+4px)] rounded-full bg-black shadow-[inset_0_0_2px_rgba(0,0,0,1)]" />
          <span className="absolute left-0 top-1/2 h-1.5 -translate-y-[calc(50%+4px)] rounded-full" style={{ width: `${p * 100}%`, background: color, opacity: 0.85, boxShadow: `0 0 6px ${color}` }} />
          <span
            className="absolute top-1/2 h-[22px] w-3.5 -translate-x-1/2 -translate-y-[calc(50%+4px)] rounded-[3px] border border-neutral-500 shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
            style={{ left: `${p * 100}%`, background: CAP }}
          >
            <span className="absolute bottom-1 left-1/2 top-1 w-0.5 -translate-x-1/2 rounded-full" style={{ background: color }} />
          </span>
        </div>
      </div>
    </div>
  );
}

// hardware slide switch: dark groove, metal cap, LED lit in the colour when on
export function ToggleSwitch({ label, checked, onChange, color = DEFAULT_COLOR, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; color?: string; hint?: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-9 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <span className="relative h-5 w-10 shrink-0 rounded-full border border-neutral-600 bg-black shadow-[inset_0_0_3px_rgba(0,0,0,1)]" style={checked ? { boxShadow: `inset 0 0 3px rgba(0,0,0,1), 0 0 6px ${color}`, borderColor: color } : undefined}>
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full" style={{ left: checked ? 2 : "auto", right: checked ? "auto" : 2, background: checked ? color : "oklch(30% 0.01 240)", opacity: checked ? 0.35 : 1 }} />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-[4px] border border-neutral-500 shadow-[0_2px_3px_rgba(0,0,0,0.7)] transition-[left] duration-150"
          style={{ left: checked ? 21 : 2, background: CAP }}
        />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] text-neutral-200">{label}</span>
        {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
      </span>
    </button>
  );
}

// options side by side in a dark groove, the active one lit (MaRuche/Falken; focus only moves with the arrow keys)
export function Segmented<T extends string | number>({ label, value, options, onChange, color = DEFAULT_COLOR }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; color?: string;
}) {
  const active = options.findIndex((o) => o.value === value);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-md border border-neutral-700 bg-black/60 p-0.5" onKeyDown={onKeyDown}>
        {options.map((o, i) => {
          const on = i === active;
          const style: CSSProperties | undefined = on ? { background: `color-mix(in oklch, ${color} 22%, transparent)`, boxShadow: `inset 0 -2px 0 ${color}, 0 0 5px ${color}` } : undefined;
          return (
            <button
              key={String(o.value)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              ref={(el) => { refs.current[i] = el; }}
              className={`min-h-9 flex-1 rounded px-2 text-[11px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${on ? "text-neutral-50" : "text-neutral-400 hover:text-neutral-100"}`}
              style={style}
              onClick={() => { if (!on) onChange(o.value); }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
