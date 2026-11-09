"use client";
import { ReactNode, useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

try {
  open = localStorage.getItem("djsynth.jamhelp.v1") === "1";
} catch {}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return open;
}

function getServerSnapshot() {
  return false;
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function JamHelp({ children }: { children: ReactNode }) {
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open !== open) {
      open = e.currentTarget.open;
      try {
        localStorage.setItem("djsynth.jamhelp.v1", open ? "1" : "0");
      } catch {}
      notifyListeners();
    }
  };

  return (
    <details
      className="group"
      open={isOpen}
      onToggle={handleToggle}
    >
      <summary className="text-[10px] font-black uppercase tracking-[0.2em] text-[oklch(0.78_0.01_260)] cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[oklch(0.83_0.10_215)]">
        Aide
        <svg
          className="inline-block w-2 h-2 ml-1 transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="mt-1 text-[11px] leading-relaxed text-[var(--jam-text-2)]">
        {children}
      </div>
    </details>
  );
}
