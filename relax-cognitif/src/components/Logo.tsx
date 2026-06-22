type Props = { size?: number; className?: string };

// Logo « Esprit Clair » : un soleil levant (esprit clair, lumière)
// et une jeune pousse (l'esprit qu'on cultive, en douceur).
export default function Logo({ size = 64, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Esprit Clair"
    >
      <defs>
        <linearGradient id="ec-badge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbf3e6" />
          <stop offset="100%" stopColor="#dcebe0" />
        </linearGradient>
        <radialGradient id="ec-sun" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#f9e0a0" />
          <stop offset="65%" stopColor="#eeb84e" />
          <stop offset="100%" stopColor="#e6a93f" />
        </radialGradient>
        <linearGradient id="ec-leaf" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#3d7d68" />
          <stop offset="100%" stopColor="#6fb795" />
        </linearGradient>
      </defs>

      {/* Badge arrondi */}
      <rect x="2" y="2" width="60" height="60" rx="19" fill="url(#ec-badge)" stroke="#cfe0d2" strokeWidth="1.5" />

      {/* Halo doux du soleil */}
      <circle cx="32" cy="27" r="17" fill="#f7d98a" opacity="0.35" />
      {/* Soleil levant */}
      <circle cx="32" cy="27" r="12" fill="url(#ec-sun)" />

      {/* Pousse : tige + deux feuilles qui s'élèvent */}
      <path d="M32 50 C32 44 32 38 32 32" stroke="#3d7d68" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* feuille gauche */}
      <path d="M31.5 40 C25 39 20.5 33.5 21.5 28 C28 29 31.7 34 31.5 40 Z" fill="url(#ec-leaf)" />
      {/* feuille droite */}
      <path d="M32.5 35 C39 33.5 43.5 28 42.5 22.5 C36 24 32.3 29 32.5 35 Z" fill="url(#ec-leaf)" />

      {/* Petite colline / sol */}
      <path d="M14 50 Q32 44 50 50 L50 53 Q32 47 14 53 Z" fill="#cfe0d2" opacity="0.8" />
    </svg>
  );
}
