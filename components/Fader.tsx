"use client";

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onRelease?: () => void; // fired when the user lets go — used by the spring-back Scratch slider
  vertical?: boolean;
  className?: string;
  ticks?: boolean; // discreet white graduation marks along the track
  led?: string; // colour of the end-voyants that light up as the cap travels
  neutral?: number; // rest position (defaults to the track centre)
}

export function Fader({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onRelease,
  vertical,
  className,
  ticks,
  led,
  neutral,
}: Props) {
  const input = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      className={`dj-fader ${vertical ? "dj-fader-v" : ""} ${ticks || led ? "w-full" : className ?? ""}`}
    />
  );

  // plain render (e.g. master volume) — unchanged
  if (!ticks && !led) return input;

  const mid = neutral ?? (min + max) / 2;
  const eps = (max - min) * 0.015;
  const leftOn = value < mid - eps;
  const rightOn = value > mid + eps;

  return (
    <div className={`dj-fader-wrap ${className ?? ""}`} style={led ? { color: led } : undefined}>
      {ticks && <div className="dj-fader-ticks" />}
      {input}
      {led && (
        <>
          <span className="dj-fader-voyant dj-fader-voyant-l" data-on={leftOn || undefined} />
          <span className="dj-fader-voyant dj-fader-voyant-r" data-on={rightOn || undefined} />
        </>
      )}
    </div>
  );
}
