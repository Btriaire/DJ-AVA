// Previous / next song on a deck, from any player (the Console's decks, the Platine view…).
// The library of the Sets view registers the real stepper: it follows the set sent to that deck
// (or else the singles filed on it) and keeps the live and relay positions in step.
// Without it, the caller falls back to its own stepping through the filed singles.
type Stepper = (side: "A" | "B", dir: 1 | -1) => Promise<boolean>; // false: no song queued for that deck

let stepper: Stepper | null = null;

export function registerDeckStep(fn: Stepper): () => void {
  stepper = fn;
  return () => {
    if (stepper === fn) stepper = null;
  };
}

// null when no library is there to do it; otherwise whether a song was found
export function deckStep(side: "A" | "B", dir: 1 | -1): Promise<boolean> | null {
  return stepper ? stepper(side, dir) : null;
}
