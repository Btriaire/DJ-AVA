// ── Types ─────────────────────────────────────────────────────────
export type MotsMelesGrid = {
  grid: string[][];
  words: string[];
  found: string[];
  size: number;
};

export type Category = {
  id: string;
  label: string;
  words: string[];
};

// ── Catégories et mots ────────────────────────────────────────────
export const CATEGORIES: Category[] = [
  {
    id: "animaux",
    label: "Animaux",
    words: [
      "ELEPHANT", "GIRAFE", "LEOPARD", "PANTHERE", "CROCODILE",
      "HIPPOPOTAME", "RHINOCEROS", "TIGRE", "JAGUAR", "GORILLE",
      "FLAMANT", "PERROQUET", "AUTRUCHE", "PINGOUIN", "DAUPHIN",
      "BALEINE", "REQUIN", "PIEUVRE", "HOMARD", "TORTUE",
    ],
  },
  {
    id: "couleurs",
    label: "Couleurs",
    words: [
      "VERMEIL", "CARMIN", "IVOIRE", "AZUREE", "INDIGO",
      "MAGENTA", "TURQUOISE", "ECARLATE", "VIOLET", "EMERAUDE",
      "SAFRAN", "AUBERGINE", "CORAIL", "ARDOISE", "PERVENCHE",
      "BRONZE", "CITRINE", "OPALE", "GRENAT", "ARGENTE",
    ],
  },
  {
    id: "fruits",
    label: "Fruits",
    words: [
      "MANGUE", "PAPAYE", "LITCHI", "GRENADE", "KIWI",
      "FRAMBOISE", "MYRTILLE", "GROSEILLE", "MELON", "PASTÈQUE",
      "NECTARINE", "PRUNE", "CERISE", "BANANE", "ANANAS",
      "AVOCAT", "GOYAVE", "KUMQUAT", "CARAMBOLE", "CLÉMENTINE",
    ],
  },
  {
    id: "legumes",
    label: "Légumes",
    words: [
      "COURGETTE", "AUBERGINE", "POIVRON", "BROCOLI", "FENOUIL",
      "ARTICHAUT", "ASPERGE", "CELERI", "EPINARD", "NAVET",
      "BETTERAVE", "RADIS", "POIREAU", "CHOU", "CORNICHON",
      "HARICOT", "POTIRON", "TOPINAMBOUR", "OSEILLE", "CIBOULETTE",
    ],
  },
  {
    id: "corps",
    label: "Corps humain",
    words: [
      "CLAVICULE", "OMOPLATES", "VERTEBRE", "STERNUM", "ROTULE",
      "PHALANGE", "TEMPE", "MÂCHOIRE", "TYMPAN", "CORNEE",
      "PUPILLE", "NARINE", "MENTON", "NUQUE", "POIGNET",
      "CHEVILLE", "MOLLET", "GENOU", "COUDE", "EPAULE",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    words: [
      "CASCADE", "GLACIER", "VOLCAN", "CANYON", "LAGUNE",
      "MANGROVE", "SAVANE", "TOUNDRA", "STEPPE", "DELTA",
      "TORRENT", "MARAIS", "FALAISE", "VALLEE", "SOMMET",
      "PRAIRIE", "FORET", "DESERT", "GROTTE", "FJORD",
    ],
  },
  {
    id: "sports",
    label: "Sports",
    words: [
      "NATATION", "CYCLISME", "ESCRIME", "PLONGEON", "AVIRON",
      "TRIATHLON", "BIATHLON", "PENTATHLON", "BOBSLEIGH", "CURLING",
      "HANDBALL", "VOLLEY", "KARATE", "JUDO", "BOXE",
      "TENNIS", "SQUASH", "BADMINTON", "TIRO", "LANCER",
    ],
  },
  {
    id: "pays",
    label: "Pays",
    words: [
      "ALLEMAGNE", "PORTUGAL", "ESPAGNE", "ITALIE", "BELGIQUE",
      "HOLLANDE", "AUTRICHE", "SUEDE", "NORVEGE", "FINLANDE",
      "POLOGNE", "HONGRIE", "ROUMANIE", "BULGARIE", "GRECE",
      "TURQUIE", "MAROC", "TUNISIE", "ALGERIE", "EGYPTE",
    ],
  },
  {
    id: "metiers",
    label: "Métiers",
    words: [
      "ARCHITECTE", "CHIRURGIEN", "AVOCAT", "NOTAIRE", "HUISSIER",
      "COMPTABLE", "INGENIEUR", "DENTISTE", "VETERINAIRE", "PHARMACIEN",
      "POMPIER", "POLICIER", "MILITAIRE", "PILOTE", "MARIN",
      "MENUISIER", "PLOMBIER", "ELECTRICIEN", "MAÇON", "CHARPENTIER",
    ],
  },
  {
    id: "cuisine",
    label: "Cuisine",
    words: [
      "CASSOULET", "RATATOUILLE", "BOUILLABAISSE", "GRATIN", "FRICASSEE",
      "BECHAMEL", "HOLLANDAISE", "MAYONNAISE", "VINAIGRETTE", "MOUSSE",
      "SOUFFLÉ", "TERRINE", "GALETTE", "CREPE", "BRIOCHE",
      "MADELEINE", "FINANCIER", "MACARON", "ECLAIR", "MILLEFEUILLE",
    ],
  },
];

// ── Directions : H-droite, V-bas, diag ↘, diag ↙ ─────────────────
type Direction = { dr: number; dc: number };
const DIRECTIONS: Direction[] = [
  { dr: 0, dc: 1 },   // H-droite
  { dr: 1, dc: 0 },   // V-bas
  { dr: 1, dc: 1 },   // diag ↘
  { dr: 1, dc: -1 },  // diag ↙
];

function canPlace(
  grid: string[][],
  word: string,
  r: number,
  c: number,
  dr: number,
  dc: number,
  size: number
): boolean {
  for (let i = 0; i < word.length; i++) {
    const nr = r + dr * i;
    const nc = c + dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) return false;
    const cell = grid[nr][nc];
    if (cell !== "" && cell !== word[i]) return false;
  }
  return true;
}

function placeWord(
  grid: string[][],
  word: string,
  r: number,
  c: number,
  dr: number,
  dc: number
) {
  for (let i = 0; i < word.length; i++) {
    grid[r + dr * i][c + dc * i] = word[i];
  }
}

// Sanitize: enlève accents et caractères non-alpha, met en majuscules
function sanitize(word: string): string {
  return word
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function buildGrid(
  words: string[],
  size = 9
): { grid: string[][]; placed: string[] } {
  // Sanitize les mots
  const sanitized = words.map(sanitize);

  // Initialise la grille vide
  const grid: string[][] = Array.from({ length: size }, () =>
    Array(size).fill("")
  );

  const placed: string[] = [];

  // Essaie de placer chaque mot avec des tentatives aléatoires
  for (const word of sanitized) {
    if (word.length > size) continue; // mot trop long pour la grille
    let success = false;
    // On mélange les directions et les positions
    const dirs = [...DIRECTIONS].sort(() => Math.random() - 0.5);
    // Génère des positions aléatoires
    const positions: [number, number][] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        positions.push([r, c]);
      }
    }
    positions.sort(() => Math.random() - 0.5);

    outer: for (const [r, c] of positions) {
      for (const { dr, dc } of dirs) {
        if (canPlace(grid, word, r, c, dr, dc, size)) {
          placeWord(grid, word, r, c, dr, dc);
          placed.push(word);
          success = true;
          break outer;
        }
      }
    }
    if (!success) {
      // mot non placé, on continue avec les autres
    }
  }

  // Remplit les cases vides avec des lettres aléatoires
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === "") {
        grid[r][c] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
    }
  }

  return { grid, placed };
}

// Sélectionne aléatoirement n mots d'une catégorie et essaie d'en placer jusqu'à maxWords
export function pickWords(category: Category, maxWords = 6): string[] {
  const shuffled = [...category.words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, maxWords);
}
