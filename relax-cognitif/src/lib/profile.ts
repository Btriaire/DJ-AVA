import {
  dayStreak,
  getActiveProfileId,
  setActiveProfileId,
  type GameId,
  type Session,
} from "./store";
import { PARCOURS, type ParcoursTheme } from "./parcours";

// ── Profils multiples (plusieurs personnes sur le même appareil) ────
// Chaque profil a sa propre progression : les sessions sont stockées
// sous `ec.sessions.<id>` (cf. store.ts). Ici on gère la liste, le profil
// actif, et la migration depuis l'ancien profil unique `ec.profile`.
const PROFILE_KEY = "ec.profile";       // ancien profil unique (migration)
const PROFILES_KEY = "ec.profiles";     // liste des profils
const LEGACY_SESSIONS_KEY = "ec.sessions"; // anciennes sessions globales

export type Profile = { id: string; name: string; avatar: string; createdAt: number };

export const AVATARS = [
  "🌸", "🍃", "🌿", "🌞", "🦊", "🦋",
  "🐢", "🦉", "🐱", "🌳", "⛩️", "🍵",
];

const DEFAULT_AVATAR = "🌸";

function genId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function readProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Profile[];
    return Array.isArray(arr) ? arr.filter((p) => p && p.id) : [];
  } catch {
    return [];
  }
}

function writeProfiles(list: Profile[]) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// Crée le premier profil (ou migre l'ancien) et le rend actif.
// Appelée une fois au démarrage de l'app, avant tout rendu lisant des sessions.
export function ensureProfiles(): Profile {
  let list = readProfiles();

  if (list.length === 0) {
    // Migration : reprendre l'ancien profil unique s'il existe.
    let name = "";
    let avatar = DEFAULT_AVATAR;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const old = JSON.parse(raw) as Partial<Profile>;
        if (typeof old.name === "string") name = old.name;
        if (typeof old.avatar === "string" && old.avatar) avatar = old.avatar;
      }
    } catch { /* ignore */ }

    const first: Profile = { id: genId(), name, avatar, createdAt: Date.now() };
    list = [first];
    writeProfiles(list);
    setActiveProfileId(first.id);

    // Reprendre les anciennes sessions globales pour ce premier profil.
    try {
      const legacy = localStorage.getItem(LEGACY_SESSIONS_KEY);
      if (legacy && !localStorage.getItem(`${LEGACY_SESSIONS_KEY}.${first.id}`)) {
        localStorage.setItem(`${LEGACY_SESSIONS_KEY}.${first.id}`, legacy);
      }
    } catch { /* ignore */ }
  }

  // S'assurer qu'un profil actif valide est sélectionné.
  const activeId = getActiveProfileId();
  const active = list.find((p) => p.id === activeId);
  if (!active) setActiveProfileId(list[0].id);
  return list.find((p) => p.id === getActiveProfileId()) ?? list[0];
}

export function listProfiles(): Profile[] {
  const list = readProfiles();
  return list.length ? list : [ensureProfiles()];
}

export function getProfile(): Profile {
  const list = listProfiles();
  return list.find((p) => p.id === getActiveProfileId()) ?? list[0];
}

export function addProfile(name: string, avatar: string): Profile {
  const list = readProfiles();
  const p: Profile = { id: genId(), name: name.trim(), avatar: avatar || DEFAULT_AVATAR, createdAt: Date.now() };
  writeProfiles([...list, p]);
  setActiveProfileId(p.id); // bascule sur le nouveau profil
  return p;
}

export function updateProfile(id: string, patch: Partial<Pick<Profile, "name" | "avatar">>) {
  const list = readProfiles().map((p) =>
    p.id === id ? { ...p, ...patch } : p
  );
  writeProfiles(list);
}

export function deleteProfile(id: string) {
  const list = readProfiles();
  if (list.length <= 1) return; // on garde toujours au moins un profil
  const next = list.filter((p) => p.id !== id);
  writeProfiles(next);
  // Effacer les données de progression du profil supprimé.
  try {
    localStorage.removeItem(`${LEGACY_SESSIONS_KEY}.${id}`);
  } catch { /* ignore */ }
  if (getActiveProfileId() === id) setActiveProfileId(next[0].id);
}

export function switchProfile(id: string) {
  if (readProfiles().some((p) => p.id === id)) setActiveProfileId(id);
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
