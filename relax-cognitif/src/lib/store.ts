export type GameId =
  | "sudoku"
  | "memory"
  | "logique"
  | "motscroises"
  | "motsmeles"
  | "anagrammes"
  | "puissance4"
  | "citations"
  | "tangram"
  | "formes"
  | "mahjong"
  | "puzzle"
  | "couleurs"
  | "calcul"
  | "rapidite"
  | "feuvert"
  | "ordre"
  | "stroop"
  | "simon"
  | "dames"
  | "culture"
  | "philo"
  | "motmystere"
  | "pyramide"
  | "plusmoins"
  | "parcours";
export type Outcome = "success" | "failure" | "abandon";

export const GAME_LABELS: Record<GameId, string> = {
  sudoku: "Sudoku",
  memory: "Paires de mémoire",
  logique: "Suite logique",
  motscroises: "Mots croisés",
  motsmeles: "Mots mêlés",
  anagrammes: "Anagrammes",
  puissance4: "Puissance 4",
  citations: "Citations",
  tangram: "Tangram",
  formes: "Intrus des formes",
  mahjong: "Mahjong",
  puzzle: "Puzzle",
  couleurs: "De toutes les couleurs",
  calcul: "Les bons signes",
  rapidite: "Rapidité au clic",
  feuvert: "Feu vert",
  ordre: "Ordre éclair",
  stroop: "Couleurs trompeuses",
  simon: "Suite lumineuse",
  dames: "Dames éclair",
  culture: "Culture générale",
  philo: "Avec le Chat de...",
  motmystere: "Mot mystère",
  pyramide: "La Pyramide",
  plusmoins: "Plus ou moins",
  parcours: "Parcours de l'Esprit",
};

const GAME_IDS: GameId[] = [
  "sudoku",
  "memory",
  "logique",
  "motscroises",
  "motsmeles",
  "anagrammes",
  "puissance4",
  "citations",
  "tangram",
  "formes",
  "mahjong",
  "puzzle",
  "couleurs",
  "calcul",
  "rapidite",
  "feuvert",
  "ordre",
  "stroop",
  "simon",
  "dames",
  "culture",
  "philo",
  "motmystere",
  "pyramide",
  "plusmoins",
  "parcours",
];

export type Difficulty = "facile" | "moyen" | "difficile";

export type Config = {
  hintLimit: number;
  defaults: {
    sudokuSize: string; // "4" | "6" | "9"
    sudokuLevel: Difficulty;
    memoryLevel: Difficulty;
    crosswordIdx: number;
  };
};

const DEFAULT_CONFIG: Config = {
  hintLimit: 3,
  defaults: {
    sudokuSize: "9",
    sudokuLevel: "facile",
    memoryLevel: "facile",
    crosswordIdx: 0,
  },
};

const CONFIG_KEY = "ec.config";
const SESSIONS_KEY = "ec.sessions";

export function getConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      hintLimit: parsed.hintLimit ?? DEFAULT_CONFIG.hintLimit,
      defaults: { ...DEFAULT_CONFIG.defaults, ...(parsed.defaults ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: Config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export type Session = {
  game: GameId;
  level?: string;
  outcome: Outcome;
  durationMs: number;
  hintsUsed: number;
  at: number; // timestamp
};

export function getSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

export function logSession(s: Session) {
  const all = getSessions();
  all.push(s);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all.slice(-500)));
}

export function clearSessions() {
  localStorage.removeItem(SESSIONS_KEY);
}

export type GameStats = {
  game: GameId;
  total: number;
  success: number;
  failure: number;
  abandon: number;
  avgMs: number;
  successRate: number;
};

export function statsByGame(sessions: Session[]): GameStats[] {
  return GAME_IDS.map((game) => {
    const rows = sessions.filter((s) => s.game === game);
    const success = rows.filter((r) => r.outcome === "success").length;
    const failure = rows.filter((r) => r.outcome === "failure").length;
    const abandon = rows.filter((r) => r.outcome === "abandon").length;
    const totalMs = rows.reduce((a, r) => a + r.durationMs, 0);
    return {
      game,
      total: rows.length,
      success,
      failure,
      abandon,
      avgMs: rows.length ? Math.round(totalMs / rows.length) : 0,
      successRate: rows.length ? Math.round((success / rows.length) * 100) : 0,
    };
  });
}

export type MedalTier = "none" | "bronze" | "argent" | "or";

export const MEDAL_STEPS: Record<Exclude<MedalTier, "none">, number> = {
  bronze: 1,
  argent: 5,
  or: 15,
};

export function successCount(game: GameId, sessions: Session[]): number {
  return sessions.filter((s) => s.game === game && s.outcome === "success").length;
}

export function medalTier(count: number): MedalTier {
  if (count >= MEDAL_STEPS.or) return "or";
  if (count >= MEDAL_STEPS.argent) return "argent";
  if (count >= MEDAL_STEPS.bronze) return "bronze";
  return "none";
}

export function nextMedal(count: number): { tier: Exclude<MedalTier, "none">; need: number } | null {
  if (count < MEDAL_STEPS.bronze) return { tier: "bronze", need: MEDAL_STEPS.bronze - count };
  if (count < MEDAL_STEPS.argent) return { tier: "argent", need: MEDAL_STEPS.argent - count };
  if (count < MEDAL_STEPS.or) return { tier: "or", need: MEDAL_STEPS.or - count };
  return null;
}

export function totalSuccess(sessions: Session[]): number {
  return sessions.filter((s) => s.outcome === "success").length;
}

// La « Voie de l'Esprit » : progression globale du joueur (1 victoire = 1 pas).
export type Rank = { name: string; min: number };
export const RANKS: Rank[] = [
  { name: "Apprenti", min: 0 },
  { name: "Disciple", min: 5 },
  { name: "Initié", min: 15 },
  { name: "Sage", min: 30 },
  { name: "Maître", min: 60 },
  { name: "Grand Maître", min: 120 },
];

export function rankFor(xp: number): {
  rank: Rank;
  index: number;
  next: Rank | null;
  into: number; // pas effectués dans le rang courant
  span: number; // pas nécessaires pour atteindre le rang suivant
} {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].min) index = i;
  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const into = xp - rank.min;
  const span = next ? next.min - rank.min : 0;
  return { rank, index, next, into, span };
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function playedToday(sessions: Session[]): boolean {
  const today = dayKey(Date.now());
  return sessions.some((s) => dayKey(s.at) === today);
}

// nombre de jours consécutifs (jusqu'à aujourd'hui ou hier) avec au moins une partie
export function dayStreak(sessions: Session[]): number {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map((s) => dayKey(s.at)));
  const DAY = 86400000;
  let streak = 0;
  let cursor = Date.now();
  if (!days.has(dayKey(cursor))) cursor -= DAY; // tolère "pas encore joué aujourd'hui"
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY;
  }
  return streak;
}

// Suivi de série consécutive de victoires par jeu/niveau
export function getStreak(game: string, level: string): number {
  try { return parseInt(localStorage.getItem(`ec.streak.${game}.${level}`) ?? "0", 10); } catch { return 0; }
}
export function bumpStreak(game: string, level: string): number {
  const n = getStreak(game, level) + 1;
  try { localStorage.setItem(`ec.streak.${game}.${level}`, String(n)); } catch {}
  return n;
}
export function resetStreak(game: string, level: string) {
  try { localStorage.setItem(`ec.streak.${game}.${level}`, "0"); } catch {}
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} min ${r}s` : `${r}s`;
}
