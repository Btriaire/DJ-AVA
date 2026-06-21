import { CITATIONS } from "./citations";

export type Step =
  | {
      kind: "logique";
      prompt: string;
      sequence: (number | null)[];
      options: number[];
      answer: number;
    }
  | {
      kind: "formes";
      prompt: string;
      cells: { shape: string; color: string }[];
      answer: number;
    }
  | {
      kind: "citation";
      prompt: string;
      before: string;
      after: string;
      choices: string[];
      answer: string;
      author: string;
    }
  | {
      kind: "calcul";
      prompt: string;
      text: string;
      options: number[];
      answer: number;
    };

const SHAPE_PAIRS = [
  ["circle", "hexagon"],
  ["square", "diamond"],
  ["triangle", "star"],
  ["heart", "droplet"],
  ["sun", "flower"],
];
const SHAPE_COLORS = ["#306230", "#6e8b2e"];

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function logiqueStep(): Step {
  const kind = rnd(0, 2);
  let full: number[];
  if (kind === 0) {
    const start = rnd(1, 9);
    const d = rnd(2, 9);
    full = [0, 1, 2, 3, 4].map((i) => start + i * d);
  } else if (kind === 1) {
    const start = rnd(1, 4);
    const r = rnd(2, 3);
    full = [0, 1, 2, 3, 4].map((i) => start * r ** i);
  } else {
    const start = rnd(1, 6);
    full = [start];
    for (let i = 1; i < 5; i++) full.push(full[i - 1] + i);
  }
  const answer = full[4];
  const set = new Set<number>([answer]);
  while (set.size < 4) {
    const delta = rnd(-6, 6);
    if (delta !== 0) set.add(Math.max(0, answer + delta));
  }
  return {
    kind: "logique",
    prompt: "Quel nombre complète la suite ?",
    sequence: [...full.slice(0, 4), null],
    options: shuffle([...set]),
    answer,
  };
}

function formesStep(): Step {
  const count = 9;
  const intruder = rnd(0, count - 1);
  const byColor = Math.random() < 0.5;
  const pair = SHAPE_PAIRS[rnd(0, SHAPE_PAIRS.length - 1)];
  let cells: { shape: string; color: string }[];
  if (byColor) {
    const shape = pair[rnd(0, 1)];
    cells = Array.from({ length: count }, (_, i) => ({
      shape,
      color: i === intruder ? SHAPE_COLORS[1] : SHAPE_COLORS[0],
    }));
  } else {
    const color = SHAPE_COLORS[rnd(0, 1)];
    cells = Array.from({ length: count }, (_, i) => ({
      shape: i === intruder ? pair[1] : pair[0],
      color,
    }));
  }
  return { kind: "formes", prompt: "Touchez la forme différente.", cells, answer: intruder };
}

function citationStep(): Step {
  const cit = CITATIONS[rnd(0, CITATIONS.length - 1)];
  const [before, after] = cit.template.split("___");
  return {
    kind: "citation",
    prompt: "Quel mot complète la citation ?",
    before,
    after,
    choices: shuffle([cit.answer, ...cit.distractors]),
    answer: cit.answer,
    author: cit.author,
  };
}

function calculStep(): Step {
  const ops = ["+", "−", "×"] as const;
  const op = ops[rnd(0, 2)];
  let a: number, b: number, answer: number;
  if (op === "×") {
    a = rnd(2, 9);
    b = rnd(2, 9);
    answer = a * b;
  } else if (op === "+") {
    a = rnd(10, 49);
    b = rnd(10, 49);
    answer = a + b;
  } else {
    a = rnd(20, 80);
    b = rnd(5, a - 1);
    answer = a - b;
  }
  const set = new Set<number>([answer]);
  while (set.size < 4) {
    const delta = rnd(-9, 9);
    if (delta !== 0) set.add(Math.max(0, answer + delta));
  }
  return {
    kind: "calcul",
    prompt: "Calcul mental",
    text: `${a} ${op} ${b}`,
    options: shuffle([...set]),
    answer,
  };
}

const GENERATORS = [logiqueStep, calculStep, formesStep, citationStep];

// Construit un parcours mélangé de `length` étapes, sans répéter deux fois le même
// type d'affilée, pour un enchaînement varié.
export function buildParcours(length = 6): Step[] {
  const steps: Step[] = [];
  let lastKind = "";
  for (let i = 0; i < length; i++) {
    let step: Step;
    do {
      step = GENERATORS[rnd(0, GENERATORS.length - 1)]();
    } while (step.kind === lastKind);
    lastKind = step.kind;
    steps.push(step);
  }
  return steps;
}

export const STEP_LABEL: Record<Step["kind"], string> = {
  logique: "Logique",
  calcul: "Calcul",
  formes: "Observation",
  citation: "Mémoire des mots",
};
