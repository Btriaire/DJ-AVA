import { useRef, useState } from "react";
import { getConfig, logSession, type GameId, type Outcome } from "./store";

export function useGameSession(game: GameId, level?: string) {
  const hintLimit = getConfig().hintLimit;
  const startRef = useRef(Date.now());
  const hintsRef = useRef(0);
  const loggedRef = useRef(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [won, setWon] = useState(false);

  function reset() {
    startRef.current = Date.now();
    hintsRef.current = 0;
    loggedRef.current = false;
    setHintsUsed(0);
    setWon(false);
  }

  function useHint(): boolean {
    if (hintsRef.current >= hintLimit) return false;
    hintsRef.current += 1;
    setHintsUsed(hintsRef.current);
    return true;
  }

  function record(outcome: Outcome, score?: number, maxScore?: number) {
    if (loggedRef.current) return;
    loggedRef.current = true;
    if (outcome === "success") setWon(true);
    logSession({
      game,
      level,
      outcome,
      durationMs: Date.now() - startRef.current,
      hintsUsed: hintsRef.current,
      at: Date.now(),
      ...(score != null ? { score, maxScore } : {}),
    });
  }

  return {
    hintLimit,
    hintsUsed,
    hintsLeft: hintLimit - hintsUsed,
    won,
    useHint,
    record,
    reset,
  };
}
