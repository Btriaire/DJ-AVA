import {
  dayStreak,
  type GameId,
  type Session,
} from "./store";
import { PARCOURS, type ParcoursTheme } from "./parcours";

// ── Profil simple (prénom + avatar), stocké en local ───────────────
const PROFILE_KEY = "ec.profile";

export type Profile = { name: string; avatar: string };

export const AVATARS = [
  "🌸", "🍃", "🌿", "🌞", "🦊", "🦋",
  "🐢", "🦉", "🐱", "🌳", "⛩️", "🍵",
];

const DEFAULT_PROFILE: Profile = { name: "", avatar: "🌸" };

export function getProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      name: typeof p.name === "string" ? p.name : "",
      avatar: typeof p.avatar === "string" && p.avatar ? p.avatar : DEFAULT_PROFILE.avatar,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// ── Outils de dates ────────────────────────────────────────────────
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isToday(ts: number): boolean {
  return ts >= startOfToday();
}

function within7Days(ts: number): boolean {
  return ts >= Date.now() - 7 * 86400000;
}

// ── Objectifs personnalisés ────────────────────────────────────────
export type Objective = {
  id: string;
  icon: string;
  label: string;
  current: number;
  target: number;
  done: boolean;
};

const STREAK_MILESTONES = [3, 7, 14, 30, 60];

function nextMilestone(n: number): number {
  for (const m of STREAK_MILESTONES) if (n < m) return m;
  return STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
}

export function objectives(sessions: Session[]): Objective[] {
  const todayPlays = sessions.filter((s) => isToday(s.at)).length;
  const weekWins = sessions.filter((s) => s.outcome === "success" && within7Days(s.at)).length;
  const distinctGames = new Set(sessions.map((s) => s.game)).size;
  const streak = dayStreak(sessions);
  const target = nextMilestone(streak);

  return [
    {
      id: "today",
      icon: "leaf",
      label: "Jouer 3 fois aujourd'hui",
      current: Math.min(todayPlays, 3),
      target: 3,
      done: todayPlays >= 3,
    },
    {
      id: "streak",
      icon: "flame",
      label: `Tenir une série de ${target} jours`,
      current: Math.min(streak, target),
      target,
      done: streak >= target,
    },
    {
      id: "week",
      icon: "trophy",
      label: "10 victoires cette semaine",
      current: Math.min(weekWins, 10),
      target: 10,
      done: weekWins >= 10,
    },
    {
      id: "explore",
      icon: "globe",
      label: "Découvrir 8 jeux différents",
      current: Math.min(distinctGames, 8),
      target: 8,
      done: distinctGames >= 8,
    },
  ];
}

// ── Parcours recommandé sur mesure ─────────────────────────────────
// Trois grandes familles de facultés, et le parcours qui les renforce.
const FAMILIES: { id: string; label: string; games: GameId[]; parcours: string; reason: string }[] = [
  {
    id: "raisonnement",
    label: "Logique & calcul",
    games: ["sudoku", "logique", "calcul", "dames", "puissance4", "mahjong", "pyramide", "plusmoins"],
    parcours: "nombres",
    reason: "pour muscler votre logique et votre calcul mental",
  },
  {
    id: "memoire",
    label: "Mémoire & mots",
    games: ["memory", "motsmeles", "motscroises", "anagrammes", "citations", "culture", "philo", "simon", "couleurs", "motmystere"],
    parcours: "souvenirs",
    reason: "pour entretenir votre mémoire et le sens du détail",
  },
  {
    id: "vitesse",
    label: "Vitesse & réflexes",
    games: ["rapidite", "feuvert", "ordre", "stroop", "formes"],
    parcours: "cascade",
    reason: "pour aiguiser vos réflexes et votre vivacité",
  },
];

export type Recommendation = {
  theme: ParcoursTheme;
  reason: string;
  familyLabel: string;
};

export function recommendedParcours(sessions: Session[]): Recommendation {
  const wins = (games: GameId[]) =>
    sessions.filter((s) => s.outcome === "success" && games.includes(s.game as GameId)).length;

  // Famille la moins pratiquée = celle qu'on propose de renforcer.
  let weakest = FAMILIES[0];
  let min = Infinity;
  for (const fam of FAMILIES) {
    const w = wins(fam.games);
    if (w < min) {
      min = w;
      weakest = fam;
    }
  }

  // Joueur tout neuf : on propose la promenade douce d'initiation.
  const totalWins = sessions.filter((s) => s.outcome === "success").length;
  const themeId = totalWins < 3 ? "jardin" : weakest.parcours;
  const theme = PARCOURS.find((p) => p.id === themeId) ?? PARCOURS[0];

  const reason =
    totalWins < 3
      ? "une promenade douce et variée pour bien démarrer"
      : weakest.reason;

  return { theme, reason, familyLabel: weakest.label };
}
