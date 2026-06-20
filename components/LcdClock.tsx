"use client";
import { useEffect, useRef, useState } from "react";

// Top-of-rack LCD: live wall-clock time on the left, a performance stopwatch
// (minutes:seconds.milliseconds) on the right with start/stop + RAZ (reset).
export function LcdClock() {
  // Start null so SSR and the first client render produce identical markup
  // (a live Date() would differ between server and client → hydration mismatch,
  // which makes React throw away & rebuild the tree, breaking event handlers).
  const [now, setNow] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0); // ms
  const [running, setRunning] = useState(false);
  const startRef = useRef(0); // perf time the run started
  const accRef = useRef(0); // accumulated ms from previous runs

  // wall clock — refresh ~4x/s is plenty for HH:MM:SS
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, []);

  // stopwatch — rAF for millisecond resolution while running
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      setElapsed(accRef.current + (performance.now() - startRef.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const toggle = () => {
    if (running) {
      accRef.current += performance.now() - startRef.current;
      setRunning(false);
    } else {
      startRef.current = performance.now();
      setRunning(true);
    }
  };
  const raz = () => {
    accRef.current = 0;
    startRef.current = performance.now();
    setElapsed(0);
  };

  const hh = now ? now.getHours().toString().padStart(2, "0") : "--";
  const mm = now ? now.getMinutes().toString().padStart(2, "0") : "--";
  const ss = now ? now.getSeconds().toString().padStart(2, "0") : "--";

  const totalMs = Math.floor(elapsed);
  const cm = Math.floor(totalMs / 60000).toString().padStart(2, "0");
  const cs = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, "0");
  const cms = (totalMs % 1000).toString().padStart(3, "0");

  return (
    <div className="hw-screen flex items-center gap-3 px-3 py-1.5">
      {/* wall clock */}
      <div className="flex flex-col items-center leading-none">
        <span className="text-[7px] font-bold uppercase tracking-[0.25em] text-neutral-600">
          Heure
        </span>
        <span className="hw-led font-mono text-lg font-bold tabular-nums text-[#4dff84]">
          {hh}:{mm}
          <span className="text-[#4dff84]/60">:{ss}</span>
        </span>
      </div>

      <div className="h-8 w-px bg-[#19324a]" />

      {/* stopwatch */}
      <div className="flex flex-col items-center leading-none">
        <span className="text-[7px] font-bold uppercase tracking-[0.25em] text-neutral-600">
          Chrono
        </span>
        <span className="hw-led font-mono text-lg font-bold tabular-nums text-[#ff8a1e]">
          {cm}:{cs}
          <span className="text-[#ff8a1e]/60">.{cms}</span>
        </span>
      </div>

      {/* transport */}
      <div className="ml-1 flex items-center gap-1.5">
        <button
          onClick={toggle}
          className={`hw-btn px-2 py-1 text-[11px] ${running ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: "#ff8a1e", color: running ? undefined : "#ff8a1e" }}
          title={running ? "Pause" : "Démarrer le chrono"}
        >
          {running ? "❚❚" : "▶"}
        </button>
        <button
          onClick={raz}
          className="hw-btn px-2 py-1 text-[11px] text-neutral-300"
          title="Remettre le chrono à zéro"
        >
          RAZ
        </button>
      </div>
    </div>
  );
}
