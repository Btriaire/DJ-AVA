import type { GameId, Session } from "./store";

// ─────────────────────────────────────────────────────────────────────
//  Score « médical » indicatif — réservé à l'espace administrateur
//
//  AVERTISSEMENT : ceci n'est PAS un test clinique. Les instruments
//  validés (MoCA®, SAGE, CoCA…) sont protégés et ne sont pas reproduits
//  ici. On s'inspire seulement de leur DÉCOUPAGE par domaines cognitifs
//  pour agréger les performances de jeu en une estimation heuristique.
//  Méthodologie inspirée des batteries en navigateur jsPsych & m2c2kit
//  (mesures répétées, écologiques) — mais sans valeur diagnostique.
// ─────────────────────────────────────────────────────────────────────

export type DomainId =
  | "memoire"
  | "attention"
  | "executif"
  | "visuospatial"
  | "langage";

export type Domain = {
  id: DomainId;
  label: string;
  // domaine MoCA-like de référence (pédagogique, affiché en sous-titre)
  ref: string;
  games: GameId[];
};

// Chaque jeu nourrit un domaine cognitif dominant.
export const DOMAINS: Domain[] = [
  {
    id: "memoire",
    label: "Mémoire",
    ref: "Rappel & reconnaissance",
    games: ["memory", "simon", "citations", "culture", "philo"],
  },
  {
    id: "attention",
    label: "Attention",
    ref: "Concentration & vigilance",
    games: ["stroop", "feuvert", "ordre", "rapidite"],
  },
  {
    id: "executif",
    label: "Fonctions exécutives",
    ref: "Logique & calcul",
    games: ["logique", "calcul", "sudoku", "dames", "puissance4", "mahjong"],
  },
  {
    id: "visuospatial",
    label: "Visuo-spatial",
    ref: "Repérage dans l'espace",
    games: ["tangram", "puzzle", "formes"],
  },
  {
    id: "langage",
    label: "Langage",
    ref: "Vocabulaire & mots",
    games: ["motscroises", "motsmeles", "anagrammes"],
  },
];

export type Trend = "up" | "flat" | "down" | "na";

export type DomainScore = {
  domain: Domain;
  score: number; // 0..100 (estimation lissée)
  plays: number; // nombre de parties prises en compte
  rawRate: number; // taux de réussite brut (0..100)
  confidence: "faible" | "moyenne" | "bonne";
  trend: Trend;
};

export type CognitiveScore = {
  domains: DomainScore[];
  composite: number; // 0..100 global pondéré par le volume de données
  moca: number; // composite ramené sur 30 (familiarité MoCA, indicatif)
  totalPlays: number;
  coverage: number; // domaines disposant d'au moins 1 partie (0..5)
  confidence: "faible" | "moyenne" | "bonne";
};

// Lissage bayésien : on tire vers une moyenne a priori de 50 %
// tant qu'on a peu de parties, pour éviter les scores extrêmes
// fondés sur 1 ou 2 essais. Le prior s'efface vers ~10 parties.
const PRIOR_RATE = 0.5;
const PRIOR_STRENGTH = 4;

function confidenceFor(plays: number): "faible" | "moyenne" | "bonne" {
  if (plays >= 15) return "bonne";
  if (plays >= 5) return "moyenne";
  return "faible";
}

function trendFor(rows: Session[]): Trend {
  if (rows.length < 6) return "na";
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  const mid = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, mid);
  const recent = sorted.slice(mid);
  const rate = (rs: Session[]) =>
    rs.filter((r) => r.outcome === "success").length / rs.length;
  const delta = rate(recent) - rate(older);
  if (delta > 0.1) return "up";
  if (delta < -0.1) return "down";
  return "flat";
}

function scoreDomain(domain: Domain, sessions: Session[]): DomainScore {
  const rows = sessions.filter((s) => domain.games.includes(s.game));
  const plays = rows.length;
  const success = rows.filter((r) => r.outcome === "success").length;
  const rawRate = plays ? Math.round((success / plays) * 100) : 0;

  // taux lissé (shrinkage vers le prior)
  const smoothed =
    (success + PRIOR_RATE * PRIOR_STRENGTH) / (plays + PRIOR_STRENGTH);

  return {
    domain,
    score: Math.round(smoothed * 100),
    plays,
    rawRate,
    confidence: confidenceFor(plays),
    trend: trendFor(rows),
  };
}

export function cognitiveScore(sessions: Session[]): CognitiveScore {
  const domains = DOMAINS.map((d) => scoreDomain(d, sessions));

  // Composite pondéré par le volume de données de chaque domaine
  // (un domaine peu joué pèse moins dans l'estimation globale).
  let wSum = 0;
  let wTot = 0;
  for (const d of domains) {
    const w = Math.min(d.plays, 20); // plafonne l'influence d'un domaine
    wSum += d.score * w;
    wTot += w;
  }
  const composite = wTot ? Math.round(wSum / wTot) : 0;
  const moca = Math.round((composite / 100) * 30);

  const totalPlays = domains.reduce((a, d) => a + d.plays, 0);
  const coverage = domains.filter((d) => d.plays > 0).length;

  // Confiance globale : il faut du volume ET de la couverture.
  let confidence: "faible" | "moyenne" | "bonne" = "faible";
  if (totalPlays >= 40 && coverage >= 4) confidence = "bonne";
  else if (totalPlays >= 15 && coverage >= 3) confidence = "moyenne";

  return { domains, composite, moca, totalPlays, coverage, confidence };
}
