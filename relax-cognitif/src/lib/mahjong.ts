import {
  MJ_FAMILIES,
  MJ_PIEGE_SYMBOLS,
  MJ_BONUS_SYMBOLS,
  isPiege,
  isBonus,
  type MjFamilyId,
} from "../components/MahjongTiles";

export type Pos = { x: number; y: number; z: number };
export type Tile = Pos & { id: number; sym: string };

export const CELL = 2; // unité de demi-cases pour un rendu façon mahjong

// Nombre de symboles (parmi ceux tirés dans la partie) transformés en tuiles
// piège / bonus. Chaque symbole choisi peut donner plusieurs paires si le
// sort l'a réutilisé plusieurs fois — c'est voulu, sans risque pour la
// solvabilité (voir applySpecials).
const PIEGE_SYMBOL_COUNT = 2;
const BONUS_SYMBOL_COUNT = 2;

// Grille de référence (portrait) : ses dimensions, combinées à la taille des
// tuiles choisie dans Mahjong.tsx, donnent le format du plateau. On la garde
// fixe d'une forme à l'autre pour que « la taille du plateau » ne bouge pas,
// seul le contour dessiné dedans change.
const GRID_W = 7;
const GRID_H = 11;
const CX = (GRID_W - 1) / 2;
const CY = (GRID_H - 1) / 2;

// Quatre silhouettes possibles, tirées au sort à chaque nouvelle partie.
// Chacune est une simple fonction « cette case fait-elle partie du plateau
// ? », ce qui permet des contours qui ne sont pas de simples rectangles.
function croix(x: number, y: number): boolean {
  return (
    (x >= 2 && x <= 4) ||
    (y >= 4 && y <= 6) ||
    (x <= 1 && y <= 1) ||
    (x >= 5 && y <= 1) ||
    (x <= 1 && y >= 9) ||
    (x >= 5 && y >= 9)
  );
}
function losange(x: number, y: number): boolean {
  const dx = Math.abs(x - CX) / (CX + 0.5);
  const dy = Math.abs(y - CY) / (CY + 0.5);
  return dx + dy <= 1.05;
}
function sablier(x: number, y: number): boolean {
  const t = Math.abs(y - CY) / CY; // 0 au centre, 1 en haut/bas
  const halfW = 0.6 + t * (CX - 0.6); // pincé au centre, évasé aux extrémités
  return Math.abs(x - CX) <= halfW;
}
function pyramideEscalier(x: number, y: number): boolean {
  const band = Math.min(4, Math.floor((y / GRID_H) * 5)); // 0 en haut -> 4 en bas
  const half = [0.5, 1.5, 2.2, 2.8, 3.4][band];
  return Math.abs(x - CX) <= half;
}

const SHAPES: ((x: number, y: number) => boolean)[] = [croix, losange, sablier, pyramideEscalier];

function buildFromMask(mask: (x: number, y: number) => boolean): Pos[] {
  const cells = new Map<string, Pos>();
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      if (mask(x, y)) cells.set(`${x},${y},0`, { x, y, z: 0 });
  // niveau 1 : même silhouette, resserrée vers le centre
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      if (mask(x, y) && Math.abs(x - CX) <= GRID_W * 0.24 && Math.abs(y - CY) <= GRID_H * 0.3)
        cells.set(`${x},${y},1`, { x, y, z: 1 });
  // niveau 2 : petit sommet, encore plus central
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      if (mask(x, y) && Math.abs(x - CX) <= GRID_W * 0.12 && Math.abs(y - CY) <= GRID_H * 0.14)
        cells.set(`${x},${y},2`, { x, y, z: 2 });
  const list = [...cells.values()];
  if (list.length % 2 === 1) list.pop(); // garantit un nombre pair de tuiles
  return list;
}

// Disposition façon mahjong classique : une silhouette tirée au sort parmi
// plusieurs (croix, losange, sablier, pyramide en escalier), dans un gabarit
// de taille constante — seul le contour change d'une partie à l'autre.
export function buildLayout(): Pos[] {
  const mask = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return buildFromMask(mask);
}

const key = (p: Pos) => `${p.x},${p.y},${p.z}`;

export function isFree(p: Pos, present: Set<string>, maxZ: number): boolean {
  for (let z = p.z + 1; z <= maxZ; z++) {
    if (present.has(`${p.x},${p.y},${z}`)) return false; // recouvert
  }
  const leftClear = !present.has(`${p.x - 1},${p.y},${p.z}`);
  const rightClear = !present.has(`${p.x + 1},${p.y},${p.z}`);
  return leftClear || rightClear;
}

function presentSet(positions: Pos[], gone: Set<number>): Set<string> {
  const s = new Set<string>();
  positions.forEach((p, i) => {
    if (!gone.has(i)) s.add(key(p));
  });
  return s;
}

// Affecte des symboles en simulant le retrait de paires libres : on garantit
// ainsi qu'au moins une solution existe.
export function assignSolvable(positions: Pos[], family: MjFamilyId = "nature"): string[] {
  const maxZ = positions.reduce((m, p) => Math.max(m, p.z), 0);
  const syms = new Array<string>(positions.length).fill("");
  const gone = new Set<number>();
  let symPtr = 0;
  const pool = MJ_FAMILIES[family].symbols;

  while (gone.size < positions.length) {
    const present = presentSet(positions, gone);
    const frees = positions
      .map((_, i) => i)
      .filter((i) => !gone.has(i) && isFree(positions[i], present, maxZ));

    let a: number, b: number;
    if (frees.length >= 2) {
      const i1 = Math.floor(Math.random() * frees.length);
      a = frees[i1];
      let i2 = Math.floor(Math.random() * frees.length);
      while (i2 === i1) i2 = Math.floor(Math.random() * frees.length);
      b = frees[i2];
    } else {
      // repli rare : apparie les deux premières positions restantes
      const rest = positions.map((_, i) => i).filter((i) => !gone.has(i));
      a = rest[0];
      b = rest[1] ?? rest[0];
    }
    const sym = pool[symPtr % pool.length];
    symPtr++;
    syms[a] = sym;
    syms[b] = sym;
    gone.add(a);
    gone.add(b);
  }
  return syms;
}

// Convertit quelques symboles tirés au sort en tuiles piège ou bonus. Comme
// la solvabilité ne dépend que des POSITIONS appariées (pas du texte du
// symbole), remplacer tous les tirages d'un même symbole par un symbole
// spécial identique ne casse jamais la garantie de résolution — au pire ça
// la renforce (plus de tuiles partagent le même symbole).
function applySpecials(syms: string[]): string[] {
  const distinct = Array.from(new Set(syms));
  for (let i = distinct.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distinct[i], distinct[j]] = [distinct[j], distinct[i]];
  }
  const pieges = distinct.slice(0, PIEGE_SYMBOL_COUNT);
  const bonuses = distinct.slice(PIEGE_SYMBOL_COUNT, PIEGE_SYMBOL_COUNT + BONUS_SYMBOL_COUNT);
  const map = new Map<string, string>();
  pieges.forEach((s, i) => map.set(s, MJ_PIEGE_SYMBOLS[i % MJ_PIEGE_SYMBOLS.length]));
  bonuses.forEach((s, i) => map.set(s, MJ_BONUS_SYMBOLS[i % MJ_BONUS_SYMBOLS.length]));
  return syms.map((s) => map.get(s) ?? s);
}

export function newGame(family: MjFamilyId = "nature"): Tile[] {
  const positions = buildLayout();
  const syms = applySpecials(assignSolvable(positions, family));
  return positions.map((p, i) => ({ ...p, id: i, sym: syms[i] }));
}

export { isPiege, isBonus };

// Réaffecte des symboles aux tuiles encore présentes en gardant la
// solvabilité, dans le même thème (les tuiles piège/bonus restantes sont
// alors neutralisées, redevenant des tuiles normales).
export function reshuffle(tiles: Tile[], gone: Set<number>, family: MjFamilyId = "nature"): Tile[] {
  const remaining = tiles.filter((t) => !gone.has(t.id));
  const positions = remaining.map((t) => ({ x: t.x, y: t.y, z: t.z }));
  const syms = assignSolvable(positions, family);
  const byId = new Map(remaining.map((t, i) => [t.id, syms[i]]));
  return tiles.map((t) => (byId.has(t.id) ? { ...t, sym: byId.get(t.id)! } : t));
}

export function freeIds(tiles: Tile[], gone: Set<number>): Set<number> {
  const maxZ = tiles.reduce((m, t) => Math.max(m, t.z), 0);
  const present = new Set<string>();
  tiles.forEach((t) => {
    if (!gone.has(t.id)) present.add(key(t));
  });
  const out = new Set<number>();
  tiles.forEach((t) => {
    if (!gone.has(t.id) && isFree(t, present, maxZ)) out.add(t.id);
  });
  return out;
}
