import type { Deck } from "./Deck";

export type PerfoMove = "brake" | "echo" | "censor";

export class DeckPerfo {
  onChange: (() => void) | null = null;
  private deck: Deck;
  private current: PerfoMove | null = null;
  private rafId = 0;
  private echoTimer: ReturnType<typeof setTimeout> | null = null;
  private brakeStart = 0;
  private prevWet = 0;
  private prevBeat = 0;
  private startPct = 0;

  constructor(deck: Deck) {
    this.deck = deck;
  }

  setListener(cb: (() => void) | null): void {
    this.onChange = cb;
  }

  get active(): PerfoMove | null {
    return this.current;
  }

  get beatSec(): number {
    const c = this.deck.fxClock();
    const bpm = c && c.bpm > 0 ? c.bpm : this.deck.bpm;
    return bpm > 0 ? 60 / bpm : 0.5;
  }

  brakeDown(beats: number): boolean {
    if (!this.deck.playing || this.current !== null) return false;

    this.startPct = this.deck.pitchPct;
    const durMs = Math.max(150, beats * this.beatSec * 1000);
    this.current = "brake";
    this.onChange?.();

    const t0 = performance.now();
    const loop = (now: number) => {
      const p = Math.min(1, (now - t0) / durMs);
      const pct = this.startPct + (-100 - this.startPct) * p * p;
      this.deck.setPitch(pct);

      if (p >= 1) {
        this.deck.pause();
        this.deck.setPitch(this.startPct);
        this.current = null;
        this.rafId = 0;
        this.onChange?.();
        return;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
    return true;
  }

  echoDown(divIdx: number, holdBeats: number): boolean {
    if (this.current === "echo") {
      this.echoUp();
      return false;
    }

    if (this.rack.getWet("echo") > 0) return false;

    this.rack.setBeat("echo", divIdx);
    this.rack.setWet("echo", 0.9);
    this.current = "echo";
    this.onChange?.();

    this.echoTimer = setTimeout(() => {
      this.echoUp();
    }, Math.max(0.25, holdBeats) * this.beatSec * 1000);

    return true;
  }

  echoUp(): void {
    if (this.echoTimer) {
      clearTimeout(this.echoTimer);
      this.echoTimer = null;
    }

    if (this.current === "echo") {
      this.rack.setWet("echo", 0);
      this.current = null;
      this.onChange?.();
    }
  }

  censorDown(divIdx: number): void {
    if (this.current === "censor" || this.current === "brake") return;

    this.prevWet = this.rack.getWet("gate");
    this.prevBeat = this.rack.getBeat("gate");
    this.rack.setBeat("gate", divIdx);
    this.rack.setWet("gate", 1);
    this.current = "censor";
    this.onChange?.();
  }

  censorUp(): void {
    if (this.current !== "censor") return;

    this.rack.setWet("gate", this.prevWet);
    this.rack.setBeat("gate", this.prevBeat);
    this.current = null;
    this.onChange?.();
  }

  panic(): void {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    if (this.echoTimer) {
      clearTimeout(this.echoTimer);
      this.echoTimer = null;
    }

    if (this.current === "brake") {
      this.deck.setPitch(this.startPct);
    } else if (this.current === "echo") {
      this.rack.setWet("echo", 0);
    } else if (this.current === "censor") {
      this.censorUp();
    }

    const wasActive = this.current !== null;
    this.current = null;

    if (wasActive) this.onChange?.();
  }

  private get rack() {
    return this.deck.fxRack;
  }
}
