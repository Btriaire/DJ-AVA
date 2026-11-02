"use client";

export interface PadPillProps {
  hasStems: boolean;
  ready: boolean;
  running: boolean;
  onRun: () => void;
}

export function PadPill({ hasStems, ready, running, onRun }: PadPillProps) {
  if (!hasStems) {
    return null;
  }

  if (running) {
    return (
      <span
        className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors animate-pulse"
        style={{ color: "#5ef2ff", background: "rgba(94,242,255,0.12)" }}
        title="Recherche des samples de pads en cours"
      >
        pads…
      </span>
    );
  }

  if (ready) {
    return (
      <span
        className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors"
        style={{ color: "#5ef2ff", background: "rgba(94,242,255,0.12)", boxShadow: "inset 0 0 0 1px rgba(94,242,255,0.4)" }}
        title="Samples de pads trouvés : boucles 1, 2 et 4 mesures, coups coupés"
      >
        ✓ pads
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onRun}
      className="whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-bold transition-colors hover:text-white"
      style={{ borderColor: "rgba(94,242,255,0.55)", color: "#5ef2ff" }}
      title="Chercher les boucles et coups de ce titre pour les pads du Stems Pad"
    >
      + pads
    </button>
  );
}
