import { MJ_SYMBOLS, MJ_PIEGE_SYMBOLS, isPiege } from "../components/MahjongTiles";

export type Pos = { x: number; y: number; z: number };
export type Tile = Pos & { id: number; sym: string };

export const CELL = 2; // unité de demi-cases pour un rendu façon mahjong

// Nombre de symboles (parmi ceux tirés dans la partie) transformés en tuiles
// piège. Chaque symbole choisi peut donner plusieurs paires piège si le sort
// l'a réutilisé plusieurs fois — c'est voulu, sans risque pour la solvabilité
// (voir applyPieges).
const PIEGE_SYMBOL_COUNT = 2;

// Disposition en pyramide à trois niveaux, large, pour un plateau plus
// spectaculaire avec beaucoup plus de tuiles.
export function buildLayout(): Pos[] {
  const pos: Pos[] = [];
  // niveau 0 : 8 colonnes × 5 rangées
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 8; x++) pos.push({ x, y, z: 0 });
  // niveau 1 : bloc 6 × 4, posé sur le niveau 0
  for (let y = 0; y < 4; y++)
    for (let x = 1; x < 7; x++) pos.push({ x, y, z: 1 });
  // niveau 2 : petit sommet 2 × 2
  for (let y = 1; y < 3; y++)
    for (let x = 3; x < 5; x++) pos.push({ x, y, z: 2 });
  return pos;
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
export function assignSolvable(positions: Pos[]): string[] {
  const maxZ = positions.reduce((m, p) => Math.max(m, p.z), 0);
  const syms = new Array<string>(positions.length).fill("");
  const gone = new Set<number>();
  let symPtr = 0;
  const pool = MJ_SYMBOLS;

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

// Convertit quelques symboles tirés au sort en tuiles piège. Comme la
// solvabilité ne dépend que des POSITIONS appariées (pas du texte du
// symbole), remplacer tous les tirages d'un même symbole par un symbole
// piège identique ne casse jamais la garantie de résolution — au pire ça la
// renforce (plus de tuiles partagent le même symbole).
function applyPieges(syms: string[]): string[] {
  const distinct = Array.from(new Set(syms));
  for (let i = distinct.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distinct[i], distinct[j]] = [distinct[j], distinct[i]];
  }
  const toConvert = distinct.slice(0, Math.min(PIEGE_SYMBOL_COUNT, distinct.length));
  const map = new Map(toConvert.map((s, i) => [s, MJ_PIEGE_SYMBOLS[i % MJ_PIEGE_SYMBOLS.length]]));
  return syms.map((s) => map.get(s) ?? s);
}

export function newGame(): Tile[] {
  const positions = buildLayout();
  const syms = applyPieges(assignSolvable(positions));
  return positions.map((p, i) => ({ ...p, id: i, sym: syms[i] }));
}

export { isPiege };

// Réaffecte des symboles aux tuiles encore présentes en gardant la solvabilité.
export function reshuffle(tiles: Tile[], gone: Set<number>): Tile[] {
  const remaining = tiles.filter((t) => !gone.has(t.id));
  const positions = remaining.map((t) => ({ x: t.x, y: t.y, z: t.z }));
  const syms = assignSolvable(positions);
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
