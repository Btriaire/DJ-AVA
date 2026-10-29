"use client";
import { useRef } from "react";
import { useTick } from "../ticker";

export function ActivityLed({ lit, color }: { lit: () => boolean; color: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useTick(() => {
    if (!ref.current) return;
    const on = lit();
    ref.current.style.background = on ? color : "rgba(255,255,255,.12)";
    ref.current.style.boxShadow = on ? `0 0 10px ${color}` : "none";
  });

  return (
    <span
      ref={ref}
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full transition-[box-shadow] duration-75"
      title="Activité"
    />
  );
}
