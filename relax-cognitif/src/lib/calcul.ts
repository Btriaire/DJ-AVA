// Jeu « Les bons signes » — placer +, − (et ×) entre des nombres pour atteindre la cible.
// Générateur : on tire d'abord une solution, donc chaque grille est toujours résoluble.
export type Op = "+" | "-" | "×";

export type CalcPuzzle = {
  nums: number[];
  target: number;
  allowed: Op[];
  solution: Op[]; // une solution valide (pour l'indice)
};

export type CalcLevel = "facile" | "moyen" | "difficile";

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];

// Évalue en respectant la priorité de × sur + et −.
export function evaluate(nums: number[], ops: Op[]): number {
  const vals = [nums[0]];
  const adds: ("+" | "-")[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const n = nums[i + 1];
    if (op === "×") vals[vals.length - 1] *= n;
    else {
      adds.push(op);
      vals.push(n);
    }
  }
  let total = vals[0];
  for (let i = 0; i < adds.length; i++) {
    total += adds[i] === "+" ? vals[i + 1] : -vals[i + 1];
  }
  return total;
}

function settings(level: CalcLevel): { count: number; max: number; allowed: Op[] } {
  if (level === "facile") return { count: 3, max: 9, allowed: ["+", "-"] };
  if (level === "moyen") return { count: 4, max: 9, allowed: ["+", "-"] };
  return { count: 4, max: 6, allowed: ["+", "-", "×"] };
}

export function newPuzzle(level: CalcLevel): CalcPuzzle {
  const { count, max, allowed } = settings(level);
  for (let tries = 0; tries < 200; tries++) {
    const nums = Array.from({ length: count }, () => 1 + rnd(max));
    const solution: Op[] = Array.from({ length: count - 1 }, () => pick(allowed));
    const target = evaluate(nums, solution);
    // cible raisonnable et grille non triviale (le tout-« + » ne doit pas déjà donner la cible)
    const allPlus = evaluate(nums, solution.map(() => "+" as Op));
    if (target < -12 || target > 40) continue;
    if (allPlus === target) continue;
    return { nums, target, allowed, solution };
  }
  // repli sûr
  const nums = [4, 2, 3];
  return { nums, target: 3, allowed: ["+", "-"], solution: ["+", "-"] };
}
