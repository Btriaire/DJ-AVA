"use client";

import { useEffect, useRef, useState } from "react";

interface HoldButtonProps {
  label: React.ReactNode;
  title: string;
  onConfirm: () => void;
  holdMs?: number;
  className?: string;
}

export function HoldButton({ label, title, onConfirm, holdMs = 700, className }: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const t0Ref = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);

  const startHold = () => {
    t0Ref.current = performance.now();
    timeoutRef.current = setTimeout(() => {
      onConfirm();
      setProgress(0);
    }, holdMs);

    const updateProgress = () => {
      const elapsed = performance.now() - t0Ref.current;
      setProgress(Math.min(1, elapsed / holdMs));
      rafRef.current = requestAnimationFrame(updateProgress);
    };
    rafRef.current = requestAnimationFrame(updateProgress);
  };

  const cancelHold = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(0);
  };

  useEffect(() => {
    return () => {
      cancelHold();
    };
  }, []);

  return (
    <button
      type="button"
      className={`relative overflow-hidden ${className}`}
      title={title}
      aria-label={title}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onKeyDown={(e) => {
        if (!e.repeat && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          cancelHold();
        }
      }}
    >
      {label}
      <div
        className="absolute inset-y-0 left-0 pointer-events-none bg-white/30"
        style={{ width: `${progress * 100}%` }}
      />
    </button>
  );
}
