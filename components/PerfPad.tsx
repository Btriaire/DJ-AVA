"use client";

import { useRef } from "react";

export function PerfPad({
  label,
  sub,
  color,
  active = false,
  lit = false,
  height = 52,
  title,
  disabled = false,
  onDown,
  onUp,
}: {
  label: string;
  sub?: string;
  color: string;
  active?: boolean;
  lit?: boolean;
  height?: number;
  title?: string;
  disabled?: boolean;
  onDown?: () => void;
  onUp?: () => void;
}) {
  const isPressed = useRef(false);

  const handleDown = () => {
    if (disabled || isPressed.current) return;
    isPressed.current = true;
    onDown?.();
  };

  const handleUp = () => {
    if (!isPressed.current) return;
    isPressed.current = false;
    onUp?.();
  };

  return (
    <button
      type="button"
      className={`hw-pad ${lit && !active ? "hw-pad-loaded" : ""} ${
        active ? "hw-pad-hit" : ""
      } w-full touch-none select-none disabled:opacity-40`}
      style={{ ["--rgb" as string]: color, height: `${height}px` }}
      aria-pressed={!!active}
      title={title}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        handleDown();
      }}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onLostPointerCapture={handleUp}
      onKeyDown={(e) => {
        if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
        e.preventDefault();
        handleDown();
      }}
      onKeyUp={(e) => {
        if (e.key !== " " && e.key !== "Enter") return;
        e.preventDefault();
        handleUp();
      }}
    >
      <div className="flex flex-col items-center justify-center h-full min-w-0">
        <span className="text-[11px] font-bold uppercase truncate">
          {label}
        </span>
        {sub && (
          <span className="text-[10px] opacity-75 truncate">{sub}</span>
        )}
      </div>
    </button>
  );
}
