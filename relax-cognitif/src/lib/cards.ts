// ── Jeu de 52 cartes classiques ────────────────────────────────────
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Card = {
  id: string;
  rank: number; // 1..13 (1 = As, 11 = Valet, 12 = Dame, 13 = Roi)
  suit: Suit;
  red: boolean; // cœur / carreau
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "\u2660", // ♠
  hearts: "\u2665", // ♥
  diamonds: "\u2666", // ♦
  clubs: "\u2663", // ♣
};

export const SUIT_LABEL: Record<Suit, string> = {
  spades: "pique",
  hearts: "cœur",
  diamonds: "carreau",
  clubs: "trèfle",
};

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

/** Symbole court affiché au coin de la carte (A, 2…10, V, D, R). */
export function rankLabel(rank: number): string {
  switch (rank) {
    case 1:
      return "A";
    case 11:
      return "V";
    case 12:
      return "D";
    case 13:
      return "R";
    default:
      return String(rank);
  }
}

/** Nom complet, pour la lecture vocale / les messages. */
export function rankFull(rank: number): string {
  switch (rank) {
    case 1:
      return "As";
    case 11:
      return "Valet";
    case 12:
      return "Dame";
    case 13:
      return "Roi";
    default:
      return String(rank);
  }
}

export function cardName(c: Card): string {
  return `${rankFull(c.rank)} de ${SUIT_LABEL[c.suit]}`;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    const red = suit === "hearts" || suit === "diamonds";
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}-${rank}`, rank, suit, red });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
