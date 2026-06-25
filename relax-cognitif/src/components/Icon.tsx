type Props = { name: string; size?: number; className?: string };

const PATHS: Record<string, React.ReactNode> = {
  // Icônes de menu
  sudoku: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </>
  ),
  crossword: (
    <>
      <path d="M14.5 4.5l5 5L8 21l-5 1 1-5 10.5-12.5z" />
      <path d="M13 6l5 5" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="6" width="11" height="14" rx="2" />
      <rect x="10" y="3" width="11" height="14" rx="2" />
    </>
  ),
  logic: (
    <>
      <circle cx="12" cy="6" r="1.4" />
      <circle cx="12" cy="18" r="1.4" />
      <path d="M5 12h14" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20C4 11 11 4 20 4c0 9-7 16-16 16z" />
      <path d="M4 20C8 15 12 12 18 9" />
    </>
  ),
  quote: (
    <>
      <path d="M9 7H4v6h5V7c0 3-1 4-3 5" />
      <path d="M20 7h-5v6h5V7c0 3-1 4-3 5" />
    </>
  ),
  tangram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 3l18 18M21 3L3 21M12 3v18M3 12h18" />
    </>
  ),
  shapes: (
    <>
      <circle cx="7" cy="7" r="3.5" />
      <rect x="13" y="3.5" width="7" height="7" rx="1" />
      <path d="M7 14l4 6H3z" />
      <path d="M17 13l3.5 7h-7z" />
    </>
  ),
  erase: (
    <>
      <path d="M3 13l6-6a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-3 3H9l-6-6z" />
      <path d="M12 9l5 5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3z" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 14l3-4 3 3 4-6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  mahjong: (
    <>
      <rect x="3" y="5" width="7" height="9" rx="1" />
      <rect x="9" y="9" width="7" height="10" rx="1" />
      <rect x="15" y="4" width="6" height="8" rx="1" />
    </>
  ),
  puzzle: (
    <path d="M10 4a2 2 0 1 1 4 0h3v3a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H5v-4a2 2 0 1 1 0-4V4z" />
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-3.6-4-7-9-7z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="8" r="1" />
    </>
  ),
  calc: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0" />
    </>
  ),
  scroll: (
    <>
      <path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 9h8M8 12h8M8 15h5" />
      <path d="M4 4a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeWidth="1.4" />
    </>
  ),
  flash: (
    <path d="M13 2L5 13h6l-1 9 8-12h-6z" />
  ),
  order: (
    <>
      <path d="M4 7h2V3M4 14h2.5a1.2 1.2 0 1 0 0-2.4M4 16.6a1.2 1.2 0 1 0 2 1.4M10 5h10M10 12h10M10 19h10" strokeWidth="1.6" />
    </>
  ),
  letters: (
    <>
      <path d="M3 17l3.5-9 3.5 9M4.3 14h4.4" />
      <path d="M14 8.5a2.5 2.5 0 1 1 0 4H14v-4zM14 12.5h.6a2.5 2.5 0 1 1 0 5H14v-5z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  car: (
    <>
      <path d="M3 13l1.8-5a2 2 0 0 1 1.9-1.3h10.6a2 2 0 0 1 1.9 1.3L21 13v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3.5 13h17" />
      <circle cx="7.5" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="16" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  connect4: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="13" cy="9" r="1.6" />
      <circle cx="8" cy="15" r="1.6" />
      <circle cx="13" cy="15" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="15" r="1.6" />
    </>
  ),
  dames: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M2 9h20M2 15h20M9 2v20M15 2v20" strokeWidth="1" />
      <circle cx="5.5" cy="5.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="18.5" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="1.6" />
      <circle cx="18" cy="5" r="1.6" />
      <path d="M6 17V9a3 3 0 0 1 3-3h6M18 7v8a3 3 0 0 1-3 3H9" />
    </>
  ),
  flame: (
    <path d="M12 3c1.2 3.5 4.5 4.5 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.8.8-2.8 1.8-3.8.2 1.8 1 2.6 1.8 2.8-.4-2.6.5-5-.9-7.5z" />
  ),
  trophy: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11" />
      <path d="M9 16h6M8 20h8M12 12v4" />
    </>
  ),
  cards: (
    <>
      <rect x="3.5" y="7" width="11" height="14" rx="2" transform="rotate(-9 9 14)" />
      <rect x="10" y="3" width="11" height="15" rx="2" />
      <path d="M15.5 8.8c.6-1.1 2-.6 2 .4 0 .7-1 1.5-2 2.3-1-.8-2-1.6-2-2.3 0-1 1.4-1.5 2-.4z" fill="currentColor" stroke="none" />
    </>
  ),
  hilo: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 10.5l3-3 3 3M15 13.5l-3 3-3-3" />
    </>
  ),
  "arrow-next": (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  // Symboles du jeu de paires
  circle: <circle cx="12" cy="12" r="8" />,
  square: <rect x="5" y="5" width="14" height="14" rx="2" />,
  triangle: <path d="M12 4l8 15H4z" />,
  diamond: <path d="M12 3l9 9-9 9-9-9z" />,
  star: <path d="M12 3l2.6 6 6.4.5-4.9 4.2 1.6 6.3L12 16.8 6.3 20l1.6-6.3L3 9.5 9.4 9z" />,
  "star-fill": <path d="M12 3l2.6 6 6.4.5-4.9 4.2 1.6 6.3L12 16.8 6.3 20l1.6-6.3L3 9.5 9.4 9z" fill="currentColor" stroke="none" />,
  heart: <path d="M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11z" />,
  hexagon: <path d="M7 4h10l5 8-5 8H7l-5-8z" />,
  plus: <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />,
  droplet: <path d="M12 3s7 7.5 7 11.5A7 7 0 0 1 5 14.5C5 10.5 12 3 12 3z" />,
  moon: <path d="M16 3a9 9 0 1 0 5 15A7 7 0 1 1 16 3z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M20 4l-2 2M6 18l-2 2" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 15a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM3 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM15 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0z" />
    </>
  ),
};

export const MEMORY_SYMBOLS = [
  "circle", "square", "triangle", "diamond", "star", "heart",
  "hexagon", "plus", "droplet", "moon", "sun", "flower",
];

export default function Icon({ name, size = 24, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
