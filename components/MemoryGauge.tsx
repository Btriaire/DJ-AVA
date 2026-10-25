"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { freeMemoryNow, getMemSnap, startMemoryGovernor, subscribeMem } from "@/lib/memoryGovernor";

const COLOR = { ok: "#34d399", warn: "#ffcc00", critical: "#ef4444" } as const;

export function MemoryGauge() {
  const snap = useSyncExternalStore(subscribeMem, getMemSnap, () => null);
  const [isFreeing, setIsFreeing] = useState(false);

  useEffect(() => startMemoryGovernor(), []);

  if (!snap) return null; // web build: no native memory info

  const totalGB = snap.usedMB / 1024;
  const value = totalGB < 1 ? `${snap.usedMB} Mo` : `${totalGB.toFixed(1).replace(".", ",")} Go`;
  const color = COLOR[snap.level];
  const detail =
    snap.level === "critical"
      ? "Mémoire presque pleine : les tâches lourdes (stems, analyse de la radio) sont ralenties."
      : snap.level === "warn"
        ? "Mémoire élevée : DJSynth libère ce qu'il peut tout seul."
        : "Mémoire normale.";

  const handleClick = async () => {
    if (isFreeing) return;
    setIsFreeing(true);
    await freeMemoryNow();
    setTimeout(() => setIsFreeing(false), 2000);
  };

  return (
    <button
      onClick={handleClick}
      className="hw-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold"
      style={{ ["--led" as string]: color, color }}
      title={`${detail} DJSynth : appli ${snap.appMB} Mo, serveur et outils ${snap.serverMB} Mo, sur ${Math.round(snap.totalMB / 1024)} Go de mémoire. Limites : ${snap.warnMB} Mo / ${snap.criticalMB} Mo. Libéré automatiquement ${snap.autoFrees} fois. Clic : libérer maintenant.`}
    >
      {isFreeing ? "Libéré" : `MÉM ${value}${snap.level === "critical" ? " · éco" : ""}`}
    </button>
  );
}
