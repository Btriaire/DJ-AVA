// Symboles colorés pour le Mahjong — seul jeu de l'appli à sortir du style
// monochrome, pour des tuiles riches et faciles à distinguer d'un coup d'œil.
// 18 motifs « jardin zen » + 2 tuiles piège (couleurs d'alerte).

export const MJ_SYMBOLS = [
  "bambou", "lotus", "soleil", "lune", "vague", "erable",
  "montagne", "libellule", "koi", "sakura", "lanterne", "eventail",
  "pomme-pin", "champignon", "papillon", "etoile", "cloche", "trefle",
] as const;
export type MjSymbol = (typeof MJ_SYMBOLS)[number];

export const MJ_PIEGE_SYMBOLS = ["piege-tornade", "piege-brume"] as const;
export type MjPiegeSymbol = (typeof MJ_PIEGE_SYMBOLS)[number];

export function isPiege(sym: string): boolean {
  return (MJ_PIEGE_SYMBOLS as readonly string[]).includes(sym);
}

function Bambou() {
  return (
    <>
      <rect x="10" y="4" width="4.5" height="26" rx="2.2" fill="#5cb98a" stroke="#2e6b52" strokeWidth="1.2" />
      <rect x="9.6" y="11" width="5.3" height="2.2" rx="1.1" fill="#2e6b52" />
      <rect x="9.6" y="19" width="5.3" height="2.2" rx="1.1" fill="#2e6b52" />
      <rect x="18" y="8" width="4" height="22" rx="2" fill="#7dcf9e" stroke="#2e6b52" strokeWidth="1.2" />
      <rect x="17.7" y="15" width="4.6" height="2" rx="1" fill="#2e6b52" />
      <path d="M9 9 C3 7 2 3 2 3 C6 3 9 5 11 9 Z" fill="#4f9d83" />
      <path d="M23 6 C29 4 30 1 30 1 C27 3 24 4 21 7 Z" fill="#4f9d83" />
    </>
  );
}
function Lotus() {
  return (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="16" cy="16" rx="4.6" ry="10" fill="#ec9dc0" stroke="#c95c8f" strokeWidth="0.8" transform={`rotate(${a} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="4.6" fill="#f2c94c" stroke="#d4a020" strokeWidth="1" />
    </>
  );
}
function Soleil() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (i * 45)).map((a) => (
        <rect key={a} x="14.7" y="1.5" width="2.6" height="7" rx="1.3" fill="#f2994a" transform={`rotate(${a} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="8" fill="#f7c25e" stroke="#d4801f" strokeWidth="1.2" />
    </>
  );
}
function Lune() {
  return (
    <>
      <path d="M22 5 A11 11 0 1 0 22 27 A9 9 0 1 1 22 5 Z" fill="#7b8ce0" stroke="#4f5cb0" strokeWidth="1" />
      <path d="M25 9 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4 Z" fill="#f2c94c" />
    </>
  );
}
function Vague() {
  return (
    <>
      <path d="M2 22 C6 16 10 16 13 20 C16 24 20 24 23 19 C25 16 28 16 30 19 L30 30 L2 30 Z" fill="#5b9bd5" stroke="#3a6fa5" strokeWidth="1" />
      <path d="M2 26 C7 22 11 22 14 25 C18 29 22 27 26 24 C28 22.5 29 22.5 30 23.5 L30 30 L2 30 Z" fill="#8ec6e6" />
    </>
  );
}
function Erable() {
  return (
    <path
      d="M16 3 L18.5 9.5 L25 7.5 L21.5 13 L28 15 L21 17 L24.5 23 L18 20.5 L18.5 27.5 L16 22 L13.5 27.5 L14 20.5 L7.5 23 L11 17 L4 15 L10.5 13 L7 7.5 L13.5 9.5 Z"
      fill="#dd5b4a"
      stroke="#a33a2f"
      strokeWidth="1"
    />
  );
}
function Montagne() {
  return (
    <>
      <path d="M2 27 L11 11 L17 21 L21 15 L30 27 Z" fill="#7a9b7e" stroke="#4a6b4e" strokeWidth="1" />
      <path d="M11 11 L14.5 17 L7.5 17 Z" fill="#e7f0e6" />
      <path d="M21 15 L23.5 19 L18.5 19 Z" fill="#e7f0e6" />
    </>
  );
}
function Libellule() {
  return (
    <>
      <ellipse cx="10" cy="12" rx="8" ry="4" fill="#bfe8e4" stroke="#2fa8a0" strokeWidth="1" transform="rotate(-20 10 12)" />
      <ellipse cx="22" cy="12" rx="8" ry="4" fill="#bfe8e4" stroke="#2fa8a0" strokeWidth="1" transform="rotate(20 22 12)" />
      <ellipse cx="10" cy="21" rx="7" ry="3.4" fill="#dff4f2" stroke="#2fa8a0" strokeWidth="1" transform="rotate(-14 10 21)" />
      <ellipse cx="22" cy="21" rx="7" ry="3.4" fill="#dff4f2" stroke="#2fa8a0" strokeWidth="1" transform="rotate(14 22 21)" />
      <rect x="14.4" y="6" width="3.2" height="22" rx="1.6" fill="#2fa8a0" />
      <circle cx="16" cy="6" r="2.4" fill="#1f7a74" />
    </>
  );
}
function Koi() {
  return (
    <>
      <path d="M4 16 C4 9 10 5 18 5 C25 5 29 10 29 16 C29 22 25 27 18 27 C10 27 4 23 4 16 Z" fill="#f2994a" stroke="#c9702c" strokeWidth="1" />
      <path d="M4 16 L-1 10 L-1 22 Z" fill="#c9702c" transform="translate(3 0)" />
      <path d="M14 10 C17 12 17 14 14 16 C17 18 17 20 14 22" fill="none" stroke="#fdf3e0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="13" r="1.6" fill="#2c2c2c" />
    </>
  );
}
function Sakura() {
  return (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d="M16 16 C16 9 12 6 16 3 C20 6 16 9 16 16 Z" fill="#f6b8d0" stroke="#d94f86" strokeWidth="0.8" transform={`rotate(${a} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="2.6" fill="#d94f86" />
    </>
  );
}
function Lanterne() {
  return (
    <>
      <rect x="8" y="9" width="16" height="17" rx="6" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1.2" />
      <rect x="6" y="6" width="20" height="3.4" rx="1.6" fill="#f2c94c" stroke="#c9971f" strokeWidth="0.8" />
      <rect x="6" y="23" width="20" height="3.4" rx="1.6" fill="#f2c94c" stroke="#c9971f" strokeWidth="0.8" />
      <rect x="14.5" y="2" width="3" height="4.4" fill="#8a6a3a" />
      <rect x="14.5" y="26.6" width="3" height="4" fill="#8a6a3a" />
      <line x1="16" y1="9.5" x2="16" y2="25.5" stroke="#a33a2f" strokeWidth="1" />
    </>
  );
}
function Eventail() {
  return (
    <>
      <path
        d="M16 28 L4 12 A17 17 0 0 1 28 12 Z"
        fill="#3fa796"
        stroke="#227667"
        strokeWidth="1"
      />
      {[5, 10.4, 16, 21.6, 27].map((x, i) => (
        <line key={i} x1="16" y1="28" x2={x} y2="10" stroke="#227667" strokeWidth="0.9" />
      ))}
      <circle cx="16" cy="28" r="2.4" fill="#f2c94c" stroke="#c9971f" strokeWidth="0.8" />
    </>
  );
}
function PommePin() {
  return (
    <>
      <ellipse cx="16" cy="16" rx="9" ry="13" fill="#a9713f" stroke="#7a5027" strokeWidth="1" />
      {[7, 12, 17, 22].map((y, i) => (
        <g key={y}>
          <path d={`M${i % 2 === 0 ? 7 : 9} ${y} Q16 ${y + 3} ${i % 2 === 0 ? 25 : 23} ${y}`} fill="none" stroke="#7a5027" strokeWidth="1.3" />
        </g>
      ))}
    </>
  );
}
function Champignon() {
  return (
    <>
      <rect x="13" y="17" width="6" height="11" rx="2.4" fill="#f4ead2" stroke="#c9b98a" strokeWidth="1" />
      <path d="M4 17 C4 8 12 4 16 4 C20 4 28 8 28 17 C28 20 24 19 16 19 C8 19 4 20 4 17 Z" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1" />
      <circle cx="10" cy="11" r="1.7" fill="#fff" />
      <circle cx="17" cy="8" r="1.5" fill="#fff" />
      <circle cx="22" cy="12" r="1.7" fill="#fff" />
      <circle cx="14" cy="14" r="1.3" fill="#fff" />
    </>
  );
}
function Papillon() {
  return (
    <>
      <ellipse cx="10" cy="11" rx="7.4" ry="6.2" fill="#c9a6e6" stroke="#8a5cc4" strokeWidth="1" transform="rotate(-18 10 11)" />
      <ellipse cx="22" cy="11" rx="7.4" ry="6.2" fill="#c9a6e6" stroke="#8a5cc4" strokeWidth="1" transform="rotate(18 22 11)" />
      <ellipse cx="11" cy="21" rx="5.6" ry="5" fill="#e8bfe0" stroke="#8a5cc4" strokeWidth="1" transform="rotate(-10 11 21)" />
      <ellipse cx="21" cy="21" rx="5.6" ry="5" fill="#e8bfe0" stroke="#8a5cc4" strokeWidth="1" transform="rotate(10 21 21)" />
      <rect x="15" y="6" width="2" height="20" rx="1" fill="#5c3a80" />
    </>
  );
}
function Etoile() {
  return (
    <path
      d="M16 3 L19.4 12.2 L29 12.7 L21.4 18.7 L24 28 L16 22.4 L8 28 L10.6 18.7 L3 12.7 L12.6 12.2 Z"
      fill="#f2c94c"
      stroke="#c9971f"
      strokeWidth="1"
    />
  );
}
function Cloche() {
  return (
    <>
      <path d="M8 22 C8 12 12 6 16 6 C20 6 24 12 24 22 Z" fill="#c9a15b" stroke="#8a6a30" strokeWidth="1.2" />
      <rect x="6" y="22" width="20" height="3.4" rx="1.7" fill="#a9834a" stroke="#8a6a30" strokeWidth="1" />
      <circle cx="16" cy="28" r="2.4" fill="#8a6a30" />
      <circle cx="16" cy="4.5" r="2" fill="#f2c94c" stroke="#c9971f" strokeWidth="0.8" />
    </>
  );
}
function Trefle() {
  return (
    <>
      {[[11, 12], [21, 12], [11, 20], [21, 20]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="6.2" fill="#5cb98a" stroke="#2e6b52" strokeWidth="1" />
      ))}
      <rect x="14.6" y="16" width="2.8" height="12" rx="1.4" fill="#2e6b52" />
    </>
  );
}
function PiegeTornade() {
  return (
    <>
      <circle cx="16" cy="16" r="14" fill="#fbe3da" />
      <path
        d="M16 4 C24 4 27 9 24 13 C22 15.5 17 15 17 11 C17 8.5 20 8 20.5 10 M16 4 C8 4 5 9 8 13 C10 15.5 15 15.5 15.5 19 C16 22 12 24 9 22"
        fill="none"
        stroke="#e8834f"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="1.6" fill="#d9534f" />
      <circle cx="8" cy="25" r="1.2" fill="#d9534f" />
      <circle cx="27" cy="17" r="1.1" fill="#d9534f" />
    </>
  );
}
function PiegeBrume() {
  return (
    <>
      <circle cx="16" cy="16" r="14" fill="#e7ecef" />
      <path d="M6 12 C9 9 14 9 16 12 C18 9 23 9 26 12" fill="none" stroke="#8a97a3" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M5 18 C8 15 13 15 15 18 C17 15 22 15 25 18 C27 15 29 15.5 27 18" fill="none" stroke="#a6b2bd" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 24 C11 21 16 21 18 24 C20 21 25 21 27 24" fill="none" stroke="#8a97a3" strokeWidth="2.4" strokeLinecap="round" />
    </>
  );
}

const GLYPHS: Record<string, () => React.ReactNode> = {
  bambou: Bambou,
  lotus: Lotus,
  soleil: Soleil,
  lune: Lune,
  vague: Vague,
  erable: Erable,
  montagne: Montagne,
  libellule: Libellule,
  koi: Koi,
  sakura: Sakura,
  lanterne: Lanterne,
  eventail: Eventail,
  "pomme-pin": PommePin,
  champignon: Champignon,
  papillon: Papillon,
  etoile: Etoile,
  cloche: Cloche,
  trefle: Trefle,
  "piege-tornade": PiegeTornade,
  "piege-brume": PiegeBrume,
};

export default function MahjongGlyph({
  sym,
  size = 30,
  className,
}: {
  sym: string;
  size?: number;
  className?: string;
}) {
  const G = GLYPHS[sym];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-hidden="true"
    >
      {G ? G() : null}
    </svg>
  );
}
