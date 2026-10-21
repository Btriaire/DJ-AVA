"use client";

import { useEffect, useState } from "react";
import { requestFreeMemory } from "@/lib/memory";

declare global {
  interface Window {
    djsynthNative?: {
      memory: () => Promise<{ appMB: number; serverMB: number }>;
      trim: () => Promise<boolean>;
    };
  }
}

export function MemoryGauge() {
  const [memory, setMemory] = useState<{ appMB: number; serverMB: number } | null>(null);
  const [isFreeing, setIsFreeing] = useState(false);

  useEffect(() => {
    const native = window.djsynthNative;
    if (!native) return; // web build: no native memory info

    const updateMemory = async () => {
      setMemory(await native.memory());
    };

    void updateMemory();
    const interval = setInterval(updateMemory, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!memory) return null;

  const totalMB = memory.appMB + memory.serverMB;
  const totalGB = totalMB / 1024;
  const displayValue = totalGB < 1
    ? `${totalMB} Mo`
    : `${totalGB.toFixed(1).replace(".", ",")} Go`;

  const color = totalMB < 2048
    ? "#34d399"
    : totalMB < 3584
      ? "#ffcc00"
      : "#ef4444";

  const handleClick = async () => {
    const native = window.djsynthNative;
    if (isFreeing || !native) return;
    setIsFreeing(true);
    requestFreeMemory(); // Atelier undo + inactive stems, download caches
    await native.trim(); // HTTP cache of the window
    setTimeout(() => setIsFreeing(false), 2000);
    setMemory(await native.memory());
  };

  return (
    <button
      onClick={handleClick}
      className="hw-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold"
      style={{ ["--led" as string]: color, color }}
      title={`Mémoire utilisée par DJSynth : appli ${memory.appMB} Mo, serveur ${memory.serverMB} Mo. Clic : libérer la mémoire (annulations et stems inactifs de l'Atelier, téléchargements en cache, cache HTTP).`}
    >
      {isFreeing ? "Libéré" : `MÉM ${displayValue}`}
    </button>
  );
}
