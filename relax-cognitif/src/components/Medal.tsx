import type { MedalTier } from "../lib/store";

const METAL: Record<Exclude<MedalTier, "none">, { face: string; edge: string; shine: string }> = {
  bronze: { face: "#b5733a", edge: "#7a4a20", shine: "#e0a268" },
  argent: { face: "#b9c0b2", edge: "#7f867a", shine: "#eef0e8" },
  or: { face: "#d8b13b", edge: "#9a7a18", shine: "#f6e08a" },
};

export default function Medal({ tier, size = 84 }: { tier: MedalTier; size?: number }) {
  if (tier === "none") return null;
  const c = METAL[tier];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {/* rubans */}
      <path d="M18 6l5 14h2L20 6z" fill="#7a3b2a" />
      <path d="M30 6l-5 14h-2L28 6z" fill="#9bbc0f" />
      {/* disque */}
      <circle cx="24" cy="30" r="13" fill={c.edge} />
      <circle cx="24" cy="30" r="11" fill={c.face} />
      <circle cx="20" cy="26" r="4" fill={c.shine} opacity="0.55" />
      {/* étoile */}
      <path
        d="M24 23l1.9 4.1 4.5.4-3.4 3 1 4.4L24 36.6 20 38.9l1-4.4-3.4-3 4.5-.4z"
        fill="#0f380f"
        opacity="0.85"
      />
    </svg>
  );
}
