// Symboles colorés pour le Mahjong — seul jeu de l'appli à sortir du style
// monochrome, pour des tuiles riches et faciles à distinguer d'un coup d'œil.
// 4 familles de thèmes au choix + tuiles piège et bonus (communes à toutes).

const NATURE_SYMBOLS = [
  "bambou", "lotus", "soleil", "lune", "vague", "erable",
  "montagne", "libellule", "koi", "sakura", "lanterne", "eventail",
  "pomme-pin", "champignon", "papillon", "etoile", "cloche", "trefle",
] as const;

const VACANCES_SYMBOLS = [
  "valise", "avion", "palmier", "tong", "parasol", "bouee",
  "coquillage", "appareil-photo", "boussole", "carte-postale",
  "glace", "chapeau-paille", "bateau", "ballon-plage",
] as const;

const TRAVAIL_SYMBOLS = [
  "ordinateur", "cafe", "dossier", "stylo", "horloge", "ampoule",
  "trombone", "cible", "graphique", "porte-documents", "cadenas",
  "tampon", "poignee-main", "fusee",
] as const;

const ANIMAUX_SYMBOLS = [
  "chat", "chien", "oiseau", "poisson", "lapin", "tortue",
  "herisson", "ours", "renard", "ecureuil", "coccinelle", "abeille",
  "escargot", "hibou",
] as const;

export const MJ_FAMILIES = {
  nature: { label: "Nature", symbols: NATURE_SYMBOLS },
  vacances: { label: "Vacances", symbols: VACANCES_SYMBOLS },
  travail: { label: "Travail", symbols: TRAVAIL_SYMBOLS },
  animaux: { label: "Animaux", symbols: ANIMAUX_SYMBOLS },
} as const;
export type MjFamilyId = keyof typeof MJ_FAMILIES;
export const MJ_FAMILY_IDS = Object.keys(MJ_FAMILIES) as MjFamilyId[];

// Rétro-compatibilité : pool par défaut (thème Nature).
export const MJ_SYMBOLS = NATURE_SYMBOLS;

export const MJ_PIEGE_SYMBOLS = ["piege-tornade", "piege-brume"] as const;
export type MjPiegeSymbol = (typeof MJ_PIEGE_SYMBOLS)[number];

export const MJ_BONUS_SYMBOLS = ["bonus-cadeau", "bonus-etoile-filante"] as const;
export type MjBonusSymbol = (typeof MJ_BONUS_SYMBOLS)[number];

export function isPiege(sym: string): boolean {
  return (MJ_PIEGE_SYMBOLS as readonly string[]).includes(sym);
}
export function isBonus(sym: string): boolean {
  return (MJ_BONUS_SYMBOLS as readonly string[]).includes(sym);
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
// ── Famille Vacances ──────────────────────────────────────────────
function Valise() {
  return (
    <>
      <rect x="10" y="6" width="12" height="5" rx="2" fill="#8a97a3" stroke="#5c6670" strokeWidth="1" />
      <rect x="4" y="10" width="24" height="18" rx="4" fill="#3fa796" stroke="#227667" strokeWidth="1.2" />
      <rect x="4" y="17" width="24" height="4" fill="#227667" />
      <rect x="14" y="17" width="4" height="4" fill="#f2c94c" />
    </>
  );
}
function Avion() {
  return (
    <>
      <path d="M3 18 L22 15 L29 17 L22 19 Z" fill="#e6eaee" stroke="#9aa6b2" strokeWidth="1" />
      <path d="M13 15 L18 6 L21 6.5 L18.5 15.6 Z" fill="#dd5b4a" />
      <path d="M13 19 L18 27 L21 26.6 L18.5 18.4 Z" fill="#dd5b4a" />
      <circle cx="9" cy="17" r="1.4" fill="#5c6670" />
    </>
  );
}
function Palmier() {
  return (
    <>
      <path d="M15 30 C15 20 17 16 19 10" fill="none" stroke="#a9713f" strokeWidth="3" strokeLinecap="round" />
      <path d="M19 10 C12 8 7 10 4 15 C10 13 14 13 19 12 Z" fill="#4f9d83" />
      <path d="M19 10 C26 6 30 8 30 8 C25 10 22 11 19 12 Z" fill="#5cb98a" />
      <path d="M19 10 C15 4 10 3 10 3 C13 7 16 9 19 12 Z" fill="#4f9d83" />
      <path d="M19 10 C22 3 27 2 27 2 C25 6 22 9 19 12 Z" fill="#5cb98a" />
      <circle cx="17" cy="13" r="1.6" fill="#8a5a30" />
      <circle cx="20" cy="14" r="1.6" fill="#8a5a30" />
    </>
  );
}
function Tong() {
  return (
    <>
      <ellipse cx="11" cy="20" rx="7" ry="9.5" fill="#f2994a" stroke="#c9702c" strokeWidth="1" />
      <ellipse cx="21" cy="12" rx="7" ry="9.5" fill="#f2994a" stroke="#c9702c" strokeWidth="1" />
      <path d="M11 20 L11 12 M11 12 L7 6 M11 12 L15 6" fill="none" stroke="#227667" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 12 L21 4 M21 4 L17 -2 M21 4 L25 -2" fill="none" stroke="#227667" strokeWidth="2" strokeLinecap="round" transform="translate(0 6)" />
    </>
  );
}
function Parasol() {
  return (
    <>
      <rect x="15" y="14" width="2" height="16" fill="#a9713f" />
      <path d="M4 14 A12 10 0 0 1 28 14 Z" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1" />
      <path d="M9 14 A7 6 0 0 1 16 8 L16 14 Z" fill="#fdf3e0" />
      <path d="M16 14 A7 6 0 0 1 23 14 L16 14 Z" fill="#fdf3e0" />
    </>
  );
}
function Bouee() {
  return (
    <>
      <circle cx="16" cy="16" r="13" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1" />
      <circle cx="16" cy="16" r="6.5" fill="#eef2ea" />
      {[0, 90, 180, 270].map((a) => (
        <rect key={a} x="14.5" y="3" width="3" height="8" fill="#fff" transform={`rotate(${a} 16 16)`} />
      ))}
    </>
  );
}
function Coquillage() {
  return (
    <>
      <path d="M16 4 C24 8 28 18 28 26 L4 26 C4 18 8 8 16 4 Z" fill="#f6c9b0" stroke="#d99065" strokeWidth="1" />
      {[6, 11, 16, 21, 26].map((x, i) => (
        <line key={i} x1="16" y1="9" x2={x} y2="26" stroke="#d99065" strokeWidth="1.2" />
      ))}
      <circle cx="16" cy="7" r="1.8" fill="#f6b8d0" />
    </>
  );
}
function AppareilPhoto() {
  return (
    <>
      <rect x="4" y="9" width="24" height="17" rx="3" fill="#5c6670" stroke="#2c2c2c" strokeWidth="1" />
      <rect x="11" y="4" width="8" height="5" rx="1.5" fill="#5c6670" />
      <circle cx="16" cy="18" r="6" fill="#8ec6e6" stroke="#2c2c2c" strokeWidth="1.4" />
      <circle cx="16" cy="18" r="2.6" fill="#2c2c2c" />
      <circle cx="24" cy="13" r="1.3" fill="#f2c94c" />
    </>
  );
}
function Boussole() {
  return (
    <>
      <circle cx="16" cy="16" r="13" fill="#f4ead2" stroke="#8a6a30" strokeWidth="1.4" />
      <path d="M16 6 L19 16 L16 26 L13 16 Z" fill="#dd5b4a" />
      <path d="M6 16 L16 13 L26 16 L16 19 Z" fill="#5c6670" opacity="0.4" />
      <circle cx="16" cy="16" r="2" fill="#8a6a30" />
    </>
  );
}
function CartePostale() {
  return (
    <>
      <rect x="3" y="6" width="26" height="20" rx="2" fill="#fdf3e0" stroke="#c9b98a" strokeWidth="1.2" />
      <rect x="20" y="9" width="6" height="7" fill="#8ec6e6" stroke="#5c6670" strokeWidth="0.8" />
      <line x1="6" y1="11" x2="15" y2="11" stroke="#8a97a3" strokeWidth="1.4" />
      <line x1="6" y1="15" x2="15" y2="15" stroke="#8a97a3" strokeWidth="1.4" />
      <line x1="6" y1="19" x2="17" y2="19" stroke="#8a97a3" strokeWidth="1.4" />
      <line x1="6" y1="23" x2="26" y2="23" stroke="#c9b98a" strokeWidth="1" />
    </>
  );
}
function Glace() {
  return (
    <>
      <path d="M11 15 L21 15 L16 29 Z" fill="#e8c99a" stroke="#c9a15b" strokeWidth="1" />
      <path d="M9 15 L11 15 L13 15 M15 15 L17 15 M19 15 L21 15 L23 15" stroke="#c9a15b" strokeWidth="0.8" />
      <circle cx="16" cy="10" r="7" fill="#f6b8d0" stroke="#d94f86" strokeWidth="1" />
      <circle cx="10.5" cy="12" r="5.5" fill="#fdf3e0" stroke="#c9b98a" strokeWidth="1" />
      <circle cx="21" cy="12" r="5.5" fill="#c9a6e6" stroke="#8a5cc4" strokeWidth="1" />
    </>
  );
}
function ChapeauPaille() {
  return (
    <>
      <ellipse cx="16" cy="21" rx="15" ry="4.5" fill="#e8c99a" stroke="#c9a15b" strokeWidth="1" />
      <path d="M8 21 C8 12 11 7 16 7 C21 7 24 12 24 21 Z" fill="#f0d9ab" stroke="#c9a15b" strokeWidth="1" />
      <rect x="8" y="17.5" width="16" height="3.4" fill="#dd5b4a" />
    </>
  );
}
function Bateau() {
  return (
    <>
      <path d="M4 22 L28 22 L24 28 L8 28 Z" fill="#a9713f" stroke="#7a5027" strokeWidth="1" />
      <rect x="15" y="4" width="1.6" height="18" fill="#7a5027" />
      <path d="M16.6 6 L26 21 L16.6 21 Z" fill="#eef2ea" stroke="#8a97a3" strokeWidth="0.8" />
      <path d="M15 8 L15 21 L8 21 Z" fill="#dd5b4a" />
    </>
  );
}
function BallonPlage() {
  return (
    <>
      <circle cx="16" cy="16" r="13" fill="#fdf3e0" stroke="#c9b98a" strokeWidth="1" />
      <path d="M16 3 A13 13 0 0 1 27.2 22 L16 16 Z" fill="#dd5b4a" />
      <path d="M16 3 A13 13 0 0 0 4.8 22 L16 16 Z" fill="#5b9bd5" />
      <path d="M4.8 22 A13 13 0 0 0 27.2 22 L16 16 Z" fill="#f2c94c" />
    </>
  );
}

// ── Famille Travail ───────────────────────────────────────────────
function Ordinateur() {
  return (
    <>
      <rect x="6" y="5" width="20" height="14" rx="1.5" fill="#5c6670" stroke="#2c2c2c" strokeWidth="1" />
      <rect x="8" y="7" width="16" height="10" fill="#8ec6e6" />
      <path d="M2 26 L30 26 L26 21 L6 21 Z" fill="#8a97a3" stroke="#5c6670" strokeWidth="1" />
    </>
  );
}
function Cafe() {
  return (
    <>
      <path d="M7 12 L23 12 L22 24 C22 27 18 29 15 29 C12 29 8 27 8 24 Z" fill="#a9713f" stroke="#7a5027" strokeWidth="1" />
      <path d="M23 14 C28 14 28 21 23 21" fill="none" stroke="#7a5027" strokeWidth="2" />
      <path d="M11 9 C10 6 12 6 11 3" fill="none" stroke="#c9b98a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 9 C15 6 17 6 16 3" fill="none" stroke="#c9b98a" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}
function Dossier() {
  return (
    <>
      <path d="M3 9 L13 9 L15 12 L29 12 L29 26 L3 26 Z" fill="#f2c94c" stroke="#c9971f" strokeWidth="1.2" />
      <rect x="3" y="12" width="26" height="14" fill="#f7dd85" stroke="#c9971f" strokeWidth="1" />
    </>
  );
}
function Stylo() {
  return (
    <>
      <rect x="14.5" y="6" width="4" height="20" rx="1" fill="#5b9bd5" stroke="#3a6fa5" strokeWidth="1" transform="rotate(20 16 16)" />
      <path d="M12 24 L15 30 L18 25 Z" fill="#2c2c2c" transform="rotate(20 16 16)" />
      <rect x="14.5" y="3" width="4" height="4" fill="#f2c94c" transform="rotate(20 16 16)" />
    </>
  );
}
function Horloge() {
  return (
    <>
      <circle cx="16" cy="16" r="13" fill="#fdf3e0" stroke="#2c2c2c" strokeWidth="1.4" />
      <line x1="16" y1="16" x2="16" y2="8" stroke="#2c2c2c" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="16" x2="21" y2="18" stroke="#2c2c2c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.6" fill="#dd5b4a" />
    </>
  );
}
function Ampoule() {
  return (
    <>
      <circle cx="16" cy="13" r="9" fill="#f7dd85" stroke="#c9971f" strokeWidth="1.2" />
      <rect x="12.5" y="20" width="7" height="5" fill="#8a97a3" stroke="#5c6670" strokeWidth="0.8" />
      <rect x="13" y="26" width="6" height="2.4" rx="1" fill="#5c6670" />
      <path d="M13 13 L15 9 L19 13 L17 17 Z" fill="#f2c94c" opacity="0.7" />
    </>
  );
}
function Trombone() {
  return (
    <path
      d="M10 8 C10 4 16 4 16 8 L16 22 C16 25 12 25 12 22 L12 10"
      fill="none"
      stroke="#5b9bd5"
      strokeWidth="3"
      strokeLinecap="round"
      transform="rotate(15 16 16)"
    />
  );
}
function Cible() {
  return (
    <>
      <circle cx="16" cy="16" r="13" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1" />
      <circle cx="16" cy="16" r="8.5" fill="#fdf3e0" />
      <circle cx="16" cy="16" r="4" fill="#dd5b4a" />
    </>
  );
}
function Graphique() {
  return (
    <>
      <line x1="4" y1="28" x2="28" y2="28" stroke="#5c6670" strokeWidth="1.6" />
      <rect x="6" y="18" width="5" height="10" fill="#5b9bd5" />
      <rect x="13.5" y="11" width="5" height="17" fill="#3fa796" />
      <rect x="21" y="6" width="5" height="22" fill="#5cb98a" />
    </>
  );
}
function PorteDocuments() {
  return (
    <>
      <rect x="3" y="12" width="26" height="15" rx="2" fill="#a9713f" stroke="#7a5027" strokeWidth="1.2" />
      <rect x="12" y="8" width="8" height="5" rx="1.5" fill="none" stroke="#7a5027" strokeWidth="1.6" />
      <rect x="14" y="17" width="4" height="4" fill="#f2c94c" />
    </>
  );
}
function Cadenas() {
  return (
    <>
      <path d="M10 14 L10 10 A6 6 0 0 1 22 10 L22 14" fill="none" stroke="#8a97a3" strokeWidth="2.6" />
      <rect x="7" y="14" width="18" height="14" rx="2.5" fill="#f2c94c" stroke="#c9971f" strokeWidth="1.2" />
      <circle cx="16" cy="20" r="2" fill="#7a5027" />
    </>
  );
}
function Tampon() {
  return (
    <>
      <rect x="10" y="4" width="12" height="6" rx="1.5" fill="#5c6670" />
      <path d="M8 10 L24 10 L22 18 L10 18 Z" fill="#8a97a3" stroke="#5c6670" strokeWidth="1" />
      <rect x="7" y="22" width="18" height="6" rx="1.5" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1" />
      <rect x="8" y="18" width="16" height="4" fill="#c9b98a" />
    </>
  );
}
function PoigneeMain() {
  return (
    <>
      <path d="M3 16 L12 12 L16 15 L12 19 Z" fill="#f2c99a" stroke="#c9971f" strokeWidth="0.8" />
      <path d="M29 16 L20 12 L16 15 L20 19 Z" fill="#e8b07f" stroke="#c9702c" strokeWidth="0.8" />
      <rect x="1" y="14" width="8" height="7" rx="2" fill="#5b9bd5" />
      <rect x="23" y="14" width="8" height="7" rx="2" fill="#3fa796" />
    </>
  );
}
function Fusee() {
  return (
    <>
      <path d="M16 3 C21 8 21 18 16 24 C11 18 11 8 16 3 Z" fill="#eef2ea" stroke="#8a97a3" strokeWidth="1" />
      <circle cx="16" cy="12" r="2.6" fill="#5b9bd5" />
      <path d="M11 18 L6 24 L11 22 Z" fill="#dd5b4a" />
      <path d="M21 18 L26 24 L21 22 Z" fill="#dd5b4a" />
      <path d="M13 24 L16 30 L19 24 Z" fill="#f2994a" />
    </>
  );
}

// ── Famille Animaux ───────────────────────────────────────────────
function Chat() {
  return (
    <>
      <path d="M8 10 L4 3 L11 8 Z" fill="#e8a86a" stroke="#b9793f" strokeWidth="1" />
      <path d="M24 10 L28 3 L21 8 Z" fill="#e8a86a" stroke="#b9793f" strokeWidth="1" />
      <circle cx="16" cy="16" r="11" fill="#f0c088" stroke="#b9793f" strokeWidth="1.2" />
      <circle cx="12" cy="14" r="1.6" fill="#2c2c2c" />
      <circle cx="20" cy="14" r="1.6" fill="#2c2c2c" />
      <path d="M16 18 L14 20 L18 20 Z" fill="#dd5b4a" />
      <path d="M2 18 L9 17 M2 22 L9 19 M30 18 L23 17 M30 22 L23 19" stroke="#b9793f" strokeWidth="1" />
    </>
  );
}
function Chien() {
  return (
    <>
      <ellipse cx="8" cy="16" rx="5" ry="7" fill="#a9713f" stroke="#7a5027" strokeWidth="1" transform="rotate(-15 8 16)" />
      <ellipse cx="24" cy="16" rx="5" ry="7" fill="#a9713f" stroke="#7a5027" strokeWidth="1" transform="rotate(15 24 16)" />
      <circle cx="16" cy="17" r="10.5" fill="#e8c99a" stroke="#a9713f" strokeWidth="1.2" />
      <ellipse cx="16" cy="22" rx="4" ry="3" fill="#fdf3e0" />
      <circle cx="12" cy="15" r="1.6" fill="#2c2c2c" />
      <circle cx="20" cy="15" r="1.6" fill="#2c2c2c" />
      <circle cx="16" cy="20" r="1.8" fill="#2c2c2c" />
    </>
  );
}
function Oiseau() {
  return (
    <>
      <circle cx="16" cy="17" r="10" fill="#5b9bd5" stroke="#3a6fa5" strokeWidth="1.2" />
      <path d="M22 12 C28 10 28 16 22 16 Z" fill="#3a6fa5" />
      <path d="M26 16 L31 17 L26 19 Z" fill="#f2994a" />
      <circle cx="20" cy="14" r="1.4" fill="#2c2c2c" />
    </>
  );
}
function Poisson() {
  return (
    <>
      <ellipse cx="14" cy="16" rx="11" ry="8" fill="#f2994a" stroke="#c9702c" strokeWidth="1.2" />
      <path d="M25 16 L31 10 L31 22 Z" fill="#c9702c" />
      <circle cx="9" cy="13" r="1.6" fill="#2c2c2c" />
      <path d="M8 20 C11 22 15 22 18 20" fill="none" stroke="#fdf3e0" strokeWidth="1.6" />
    </>
  );
}
function Lapin() {
  return (
    <>
      <ellipse cx="11" cy="8" rx="3" ry="9" fill="#fdf3e0" stroke="#c9b98a" strokeWidth="1" transform="rotate(-10 11 8)" />
      <ellipse cx="21" cy="8" rx="3" ry="9" fill="#fdf3e0" stroke="#c9b98a" strokeWidth="1" transform="rotate(10 21 8)" />
      <ellipse cx="11" cy="9" rx="1.4" ry="5" fill="#f6b8d0" transform="rotate(-10 11 9)" />
      <ellipse cx="21" cy="9" rx="1.4" ry="5" fill="#f6b8d0" transform="rotate(10 21 9)" />
      <circle cx="16" cy="20" r="9" fill="#fdf3e0" stroke="#c9b98a" strokeWidth="1.2" />
      <circle cx="13" cy="19" r="1.4" fill="#2c2c2c" />
      <circle cx="19" cy="19" r="1.4" fill="#2c2c2c" />
      <path d="M16 22 L14.5 24 L17.5 24 Z" fill="#f6b8d0" />
    </>
  );
}
function Tortue() {
  return (
    <>
      <ellipse cx="16" cy="17" rx="11" ry="9" fill="#5cb98a" stroke="#2e6b52" strokeWidth="1.2" />
      <path d="M16 10 L21 14 L19 20 L13 20 L11 14 Z" fill="#2e6b52" />
      <circle cx="27" cy="15" r="3.4" fill="#8fce9e" stroke="#2e6b52" strokeWidth="1" />
      <ellipse cx="6" cy="24" rx="2.6" ry="1.8" fill="#8fce9e" />
      <ellipse cx="26" cy="24" rx="2.6" ry="1.8" fill="#8fce9e" />
    </>
  );
}
function Herisson() {
  return (
    <>
      <path d="M6 20 C4 12 10 6 18 7 C26 8 29 15 26 21 C22 27 10 27 6 20 Z" fill="#a9713f" stroke="#7a5027" strokeWidth="1" />
      {[[9, 10], [14, 6], [19, 6], [24, 9], [26, 14]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} L${x - 2} ${y - 5} L${x + 3} ${y - 2} Z`} fill="#7a5027" />
      ))}
      <circle cx="10" cy="20" r="6" fill="#f0d9ab" />
      <circle cx="8" cy="19" r="1.2" fill="#2c2c2c" />
      <circle cx="6" cy="21" r="1" fill="#2c2c2c" />
    </>
  );
}
function Ours() {
  return (
    <>
      <circle cx="8" cy="8" r="3.6" fill="#a9713f" stroke="#7a5027" strokeWidth="1" />
      <circle cx="24" cy="8" r="3.6" fill="#a9713f" stroke="#7a5027" strokeWidth="1" />
      <circle cx="16" cy="18" r="11" fill="#c99a5f" stroke="#7a5027" strokeWidth="1.2" />
      <ellipse cx="16" cy="21" rx="4.6" ry="3.6" fill="#f0d9ab" />
      <circle cx="12" cy="15" r="1.5" fill="#2c2c2c" />
      <circle cx="20" cy="15" r="1.5" fill="#2c2c2c" />
      <circle cx="16" cy="19" r="1.6" fill="#2c2c2c" />
    </>
  );
}
function Renard() {
  return (
    <>
      <path d="M16 4 L26 15 L20 27 L12 27 L6 15 Z" fill="#f2994a" stroke="#c9702c" strokeWidth="1" />
      <path d="M16 15 L20 27 L12 27 Z" fill="#fdf3e0" />
      <path d="M9 8 L4 3 L10 6 Z" fill="#f2994a" stroke="#c9702c" strokeWidth="0.8" />
      <path d="M23 8 L28 3 L22 6 Z" fill="#f2994a" stroke="#c9702c" strokeWidth="0.8" />
      <circle cx="12" cy="14" r="1.4" fill="#2c2c2c" />
      <circle cx="20" cy="14" r="1.4" fill="#2c2c2c" />
      <path d="M16 18 L14.5 21 L17.5 21 Z" fill="#2c2c2c" />
    </>
  );
}
function Ecureuil() {
  return (
    <>
      <path d="M22 6 C30 6 30 20 22 22 C26 16 26 10 22 6 Z" fill="#c9702c" stroke="#a9713f" strokeWidth="1" />
      <circle cx="12" cy="18" r="9" fill="#e8a86a" stroke="#a9713f" strokeWidth="1.2" />
      <ellipse cx="12" cy="21" rx="3.4" ry="2.6" fill="#fdf3e0" />
      <circle cx="9" cy="16" r="1.4" fill="#2c2c2c" />
      <path d="M6 10 L4 5 L9 8 Z" fill="#c9702c" />
    </>
  );
}
function Coccinelle() {
  return (
    <>
      <circle cx="16" cy="17" r="11" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1.2" />
      <path d="M16 6 L16 28" stroke="#2c2c2c" strokeWidth="1.6" />
      <circle cx="16" cy="8" r="4.5" fill="#2c2c2c" />
      {[[10, 13], [22, 13], [10, 21], [22, 21], [16, 18]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#2c2c2c" />
      ))}
    </>
  );
}
function Abeille() {
  return (
    <>
      <ellipse cx="10" cy="12" rx="7" ry="5" fill="#e6eef7" opacity="0.8" transform="rotate(-15 10 12)" />
      <ellipse cx="22" cy="12" rx="7" ry="5" fill="#e6eef7" opacity="0.8" transform="rotate(15 22 12)" />
      <ellipse cx="16" cy="18" rx="10" ry="8" fill="#f2c94c" stroke="#2c2c2c" strokeWidth="1.2" />
      <rect x="6" y="15" width="20" height="3.4" fill="#2c2c2c" />
      <rect x="6" y="21" width="20" height="3.4" fill="#2c2c2c" />
    </>
  );
}
function Escargot() {
  return (
    <>
      <ellipse cx="12" cy="22" rx="10" ry="5" fill="#c9a6e6" stroke="#8a5cc4" strokeWidth="1.2" />
      <circle cx="19" cy="14" r="8" fill="#f2994a" stroke="#c9702c" strokeWidth="1.2" />
      <path d="M19 14 A4 4 0 1 1 15 10" fill="none" stroke="#c9702c" strokeWidth="1.4" />
      <path d="M4 20 L1 12 M9 19 L8 11" stroke="#8a5cc4" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="1" cy="11" r="1.3" fill="#8a5cc4" />
      <circle cx="8" cy="10" r="1.3" fill="#8a5cc4" />
    </>
  );
}
function Hibou() {
  return (
    <>
      <ellipse cx="16" cy="18" rx="12" ry="11" fill="#a9713f" stroke="#7a5027" strokeWidth="1.2" />
      <path d="M8 8 L5 2 L11 6 Z" fill="#7a5027" />
      <path d="M24 8 L27 2 L21 6 Z" fill="#7a5027" />
      <circle cx="11" cy="16" r="5.2" fill="#fdf3e0" stroke="#7a5027" strokeWidth="1" />
      <circle cx="21" cy="16" r="5.2" fill="#fdf3e0" stroke="#7a5027" strokeWidth="1" />
      <circle cx="11" cy="16" r="2.2" fill="#2c2c2c" />
      <circle cx="21" cy="16" r="2.2" fill="#2c2c2c" />
      <path d="M16 19 L13.5 23 L18.5 23 Z" fill="#f2994a" />
    </>
  );
}

// ── Tuiles bonus (récompense, communes à toutes les familles) ─────
function BonusCadeau() {
  return (
    <>
      <circle cx="16" cy="16" r="14" fill="#eaf6ee" />
      <rect x="6" y="14" width="20" height="13" rx="1.5" fill="#dd5b4a" stroke="#a33a2f" strokeWidth="1.2" />
      <rect x="4" y="10" width="24" height="5" rx="1.5" fill="#f2c94c" stroke="#c9971f" strokeWidth="1" />
      <rect x="14.5" y="10" width="3" height="17" fill="#c9971f" />
      <path d="M16 10 C10 10 10 4 16 6 C22 4 22 10 16 10 Z" fill="#f2c94c" stroke="#c9971f" strokeWidth="1" />
    </>
  );
}
function BonusEtoileFilante() {
  return (
    <>
      <circle cx="16" cy="16" r="14" fill="#eef2fb" />
      <path
        d="M21 11 L23 15.5 L28 16.2 L24.4 19.4 L25.4 24 L21 21.6 L16.6 24 L17.6 19.4 L14 16.2 L19 15.5 Z"
        fill="#f2c94c"
        stroke="#c9971f"
        strokeWidth="1"
      />
      <path d="M14 18 L4 24" stroke="#c9a6e6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="21" r="1.2" fill="#c9a6e6" />
      <circle cx="6" cy="23" r="0.9" fill="#c9a6e6" />
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
  "bonus-cadeau": BonusCadeau,
  "bonus-etoile-filante": BonusEtoileFilante,
  valise: Valise,
  avion: Avion,
  palmier: Palmier,
  tong: Tong,
  parasol: Parasol,
  bouee: Bouee,
  coquillage: Coquillage,
  "appareil-photo": AppareilPhoto,
  boussole: Boussole,
  "carte-postale": CartePostale,
  glace: Glace,
  "chapeau-paille": ChapeauPaille,
  bateau: Bateau,
  "ballon-plage": BallonPlage,
  ordinateur: Ordinateur,
  cafe: Cafe,
  dossier: Dossier,
  stylo: Stylo,
  horloge: Horloge,
  ampoule: Ampoule,
  trombone: Trombone,
  cible: Cible,
  graphique: Graphique,
  "porte-documents": PorteDocuments,
  cadenas: Cadenas,
  tampon: Tampon,
  "poignee-main": PoigneeMain,
  fusee: Fusee,
  chat: Chat,
  chien: Chien,
  oiseau: Oiseau,
  poisson: Poisson,
  lapin: Lapin,
  tortue: Tortue,
  herisson: Herisson,
  ours: Ours,
  renard: Renard,
  ecureuil: Ecureuil,
  coccinelle: Coccinelle,
  abeille: Abeille,
  escargot: Escargot,
  hibou: Hibou,
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
