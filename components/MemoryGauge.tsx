"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RamOptimizer } from "@/components/RamOptimizer";
import { MEM_PROFILE_LABEL, freeMemoryNow, getMemSnap, setMemProfile, startMemoryGovernor, subscribeMem, type MemProfile } from "@/lib/memoryGovernor";

const COLOR = { ok: "#34d399", warn: "#ffcc00", critical: "#ef4444" } as const;

export function MemoryGauge() {
  const snap = useSyncExternalStore(subscribeMem, getMemSnap, () => null);
  const [isFreeing, setIsFreeing] = useState(false);

  useEffect(() => startMemoryGovernor(), []);

  if (!snap) return <RamOptimizer />; // web build: no native memory info (the RAM tool still works on a local server)

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
    <span className="inline-flex items-center gap-1">
      <button
        onClick={handleClick}
        className="hw-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold"
        style={{ ["--led" as string]: color, color }}
        title={`${detail} DJSynth : appli ${snap.appMB} Mo, serveur et outils ${snap.serverMB} Mo, sur ${Math.round(snap.totalMB / 1024)} Go de mémoire. Limites (${MEM_PROFILE_LABEL[snap.profile]}) : alerte ${snap.warnMB} Mo, critique ${snap.criticalMB} Mo. Libéré automatiquement ${snap.autoFrees} fois. Clic : libérer maintenant.`}
      >
        {isFreeing ? "Libéré" : `MÉM ${value}${snap.level === "critical" ? " · éco" : ""}`}
      </button>
      <select
        className="hw-btn px-1.5 py-1.5 text-[11px] font-bold"
        value={snap.profile}
        onChange={(e) => setMemProfile(e.target.value as MemProfile)}
        aria-label="Mémoire allouée à DJSynth"
        title={`Mémoire que DJSynth s'autorise : Économe ${Math.round(snap.totalMB * 0.36 / 1024 * 10) / 10} Go, Normal ${Math.round(snap.totalMB * 0.6 / 1024 * 10) / 10} Go, Maximum ${Math.round(snap.totalMB * 0.8 / 1024 * 10) / 10} Go avant de ralentir les tâches lourdes`}
      >
        {(Object.keys(MEM_PROFILE_LABEL) as MemProfile[]).map((p) => (
          <option key={p} value={p}>
            {MEM_PROFILE_LABEL[p]}
          </option>
        ))}
      </select>
      <RamOptimizer />
    </span>
  );
}
