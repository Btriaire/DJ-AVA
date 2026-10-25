"use client";
import { useState } from "react";
import { useIsClient } from "@/lib/useIsClient";

// shown once after the Mac app restarted its window because it ran out of memory (see mac/main.cjs)
export function RecoveryNotice() {
  const client = useIsClient();
  const [closed, setClosed] = useState(false);
  if (!client || closed || !new URLSearchParams(window.location.search).has("recovered")) return null;
  return (
    <button
      type="button"
      onClick={() => setClosed(true)}
      className="hw-btn px-2.5 py-1.5 text-xs font-bold text-amber-300"
      title="Le journal est dans Library/Application Support/DJSynth/crash.log. Clic pour fermer ce message."
    >
      Affichage redémarré (mémoire) : ta bibliothèque est intacte
    </button>
  );
}
