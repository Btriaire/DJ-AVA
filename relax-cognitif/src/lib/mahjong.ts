import { MEMORY_SYMBOLS } from "../components/Icon";

export type Pos = { x: number; y: number; z: number };
export type Tile = Pos & { id: number; sym: string };

export const CELL = 2; // unité de demi-cases pour un rendu façon mahjong

// Disposition en pyramide à deux niveaux, étroite (6 colonnes) pour de
// grandes tuiles confortables sur écran de téléphone.
export function buildLayout(): Pos[] {
  const pos: Pos[] = [];
  // niveau 0 : 6 colonnes × 4 rangées
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 6; x++) pos.push({ x, y, z: 0 });
  // niveau 1 : bloc central 4 × 3, posé sur le niveau 0
  for (let y = 0; y < 3; y++)
    for (let x = 1; x < 5; x++) pos.push({ x, y, z: 1 });
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
  const pool = MEMORY_SYMBOLS;

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

export function newGame(): Tile[] {
  const positions = buildLayout();
  const syms = assignSolvable(positions);
  return positions.map((p, i) => ({ ...p, id: i, sym: syms[i] }));
}

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
