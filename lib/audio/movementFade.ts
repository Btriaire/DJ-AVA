import type { DJEngine } from "./engine";

export function easeFade(from: number, to: number, t: number): number {
  if (isNaN(t)) return from;
  t = Math.min(Math.max(t, 0), 1);
  const x = t * t * (3 - 2 * t);
  return from + (to - from) * x;
}

export class MovementFade {
  constructor(private readonly engine: DJEngine) {}

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private from: number = 0;
  private to: number = 0;
  private seconds: number = 0;

  get running(): boolean {
    return this.intervalId !== null;
  }

  progress(): number {
    if (!this.running || this.seconds === 0) return 0;
    const elapsed = (Date.now() - this.startTime) / 1000;
    return Math.min(elapsed / this.seconds, 1);
  }

  target(): "A" | "B" {
    return this.running ? (this.to === 1 ? "B" : "A") : (this.engine.getCrossfade() < 0.5 ? "B" : "A");
  }

  cancel(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  start(seconds: number): void {
    this.cancel();
    this.from = this.engine.getCrossfade();
    this.to = this.from < 0.5 ? 1 : 0;
    this.seconds = Math.min(Math.max(seconds, 1), 120);
    this.startTime = Date.now();

    const targetDeck = this.to === 1 ? this.engine.deckB : this.engine.deckA;
    const sourceDeck = this.to === 1 ? this.engine.deckA : this.engine.deckB;

    if (!targetDeck.playing && targetDeck.duration > 0) {
      targetDeck.seek(0);
      targetDeck.play();
    }

    this.intervalId = setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000;
      if (elapsed >= this.seconds) {
        this.engine.setCrossfade(this.to);
        sourceDeck.pause();
        this.cancel();
      } else {
        this.engine.setCrossfade(easeFade(this.from, this.to, elapsed / this.seconds));
      }
    }, 50);
  }
}

export function movementSelfCheck(): string[] {
  const errors: string[] = [];

  if (easeFade(0, 1, 0) !== 0) errors.push("easeFade(0,1,0) !== 0");
  if (easeFade(0, 1, 1) !== 1) errors.push("easeFade(0,1,1) !== 1");
  if (Math.abs(easeFade(0, 1, 0.5) - 0.5) > 1e-9) errors.push("easeFade(0,1,0.5) !== 0.5");
  if (easeFade(2, 2, 0.3) !== 2) errors.push("easeFade(2,2,0.3) !== 2");
  if (easeFade(0, 1, NaN) !== 0) errors.push("easeFade(0,1,NaN) !== 0");

  let prev = easeFade(0, 1, 0);
  for (let i = 1; i <= 100; i++) {
    const current = easeFade(0, 1, i / 100);
    if (current < prev) {
      errors.push("easeFade n'est pas monotone");
      break;
    }
    prev = current;
  }

  return errors;
}