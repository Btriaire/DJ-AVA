const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export interface ClockInfo { bpm: number; toNextBeat: number; nextBeat?: number; playing?: boolean }
export type ClockFn = () => ClockInfo | null;
export type ClockAlign = "bar" | "beat" | "grid";

export class StepClock {
  stepsPerBeat = 4;
  beatsPerBar = 4;
  barShift = 0;
  swing = 0;
  manualBpm = 120;
  follow = true;

  private ctx: { currentTime: number };
  private getClock: ClockFn;
  private onStep: (step: number, time: number, stepDur: number) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private nextTime = 0;
  private stepIndex = 0;
  private lastTime = -Infinity;

  constructor(
    ctx: { currentTime: number },
    getClock: ClockFn,
    onStep: (step: number, time: number, stepDur: number) => void
  ) {
    this.ctx = ctx;
    this.getClock = getClock;
    this.onStep = onStep;
  }

  private info(): ClockInfo | null {
    if (!this.follow) return null;
    const c = this.getClock();
    return c && c.bpm > 0 ? c : null;
  }

  get bpm(): number {
    return this.info()?.bpm ?? this.manualBpm;
  }

  get running(): boolean {
    return this.active;
  }

  nextGrid(perBeat = this.stepsPerBeat): number {
    const now = this.ctx.currentTime;
    const c = this.info();
    if (!c || c.playing === false) return now + 0.003;
    const stepDur = 60 / c.bpm / perBeat;
    const beatTime = now + c.toNextBeat;
    const k = Math.ceil((now + 0.003 - beatTime) / stepDur);
    return beatTime + k * stepDur;
  }

  start(align: ClockAlign = "bar", useTimer = true): void {
    if (this.active) return;
    const now = this.ctx.currentTime;
    const c = this.info();
    let t = now + 0.05;

    if (c && c.playing !== false) {
      const spb = 60 / c.bpm;
      if (align === "grid") {
        t = this.nextGrid();
      } else {
        t = now + c.toNextBeat;
        if (align === "bar" && c.nextBeat !== undefined) {
          const k = (((c.nextBeat - this.barShift) % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
          if (k > 0) t += (this.beatsPerBar - k) * spb;
        }
      }
    }

    this.nextTime = t;
    this.stepIndex = 0;
    this.lastTime = -Infinity;
    this.active = true;

    if (useTimer) {
      this.timer = setInterval(() => this.pump(this.ctx.currentTime + LOOKAHEAD), TICK_MS);
    }

    this.pump(now + LOOKAHEAD);
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  pump(until: number): void {
    while (this.active && this.nextTime < until) {
      const c = this.info();
      const bpm = c ? c.bpm : this.manualBpm;
      const stepDur = 60 / bpm / this.stepsPerBeat;

      const t = this.nextTime + (this.stepIndex % 2 === 1 ? this.swing * stepDur : 0);
      const time = Math.max(t, this.ctx.currentTime);

      this.onStep(this.stepIndex, time, stepDur);
      this.lastTime = this.nextTime;
      this.stepIndex++;
      this.nextTime += stepDur;

      if (c && c.playing !== false) {
        const expected = this.ctx.currentTime + c.toNextBeat;
        let err = (expected - this.nextTime) % stepDur;
        if (err > stepDur / 2) err -= stepDur;
        if (err < -stepDur / 2) err += stepDur;
        if (Math.abs(err) > 0.0005) {
          this.nextTime = Math.max(this.nextTime + err * 0.5, this.lastTime + 0.25 * stepDur);
        }
      }
    }
  }
}
