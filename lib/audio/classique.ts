"use client";
import { onModuleGate } from "./moduleGate";
import type { DJEngine } from "./engine";
import { ConcertHall, HALLS, type HallName } from "./concertHall";
import { MovementFade } from "./movementFade";

const modules = new WeakMap<DJEngine, ClassiqueModule>();

export function classiqueModule(engine: DJEngine): ClassiqueModule {
  if (!modules.has(engine)) {
    modules.set(engine, new ClassiqueModule(engine));
  }
  return modules.get(engine)!;
}

export class ClassiqueModule {
  hall: HallName | null = null;
  amount = 0.35;
  warmth = 0.4;
  fadeSec = 20;
  private readonly hallReverb: ConcertHall;
  private readonly fade: MovementFade;
  private readonly dynamicsBuffer: { peak: number; rms: number }[] = [];
  private readonly timeDomainData: Float32Array<ArrayBuffer>;

  constructor(private readonly engine: DJEngine) {
    this.hallReverb = new ConcertHall(engine.ctx, engine.masterBus, engine.masterFx.input);
    this.fade = new MovementFade(engine);
    onModuleGate("session", (open) => {
      if (open) { this.setHall(this.hall); return; }
      this.cancelFade();
      this.hallReverb.setAmount(0);
    });
    this.timeDomainData = new Float32Array(new ArrayBuffer(engine.meterTap.fftSize * 4));

    try {
      const saved = JSON.parse(localStorage.getItem("djsynth.classique.v1") || "{}");
      if (saved.hall && HALLS[saved.hall as HallName]) {
        this.hall = saved.hall;
      }
      if (typeof saved.amount === "number" && !isNaN(saved.amount)) {
        this.amount = Math.max(0, Math.min(1, saved.amount));
      }
      if (typeof saved.warmth === "number" && !isNaN(saved.warmth)) {
        this.warmth = Math.max(0, Math.min(1, saved.warmth));
      }
      if (typeof saved.fadeSec === "number" && !isNaN(saved.fadeSec)) {
        this.fadeSec = Math.max(1, Math.min(120, saved.fadeSec));
      }
    } catch {}

    this.apply();
    this.save();
  }

  setHall(n: HallName | null): void {
    this.hall = n;
    if (n === null) {
      this.hallReverb.setAmount(0);
    } else {
      this.hallReverb.setHall(n);
      this.hallReverb.setAmount(this.amount);
    }
    this.save();
  }

  setAmount(v: number): void {
    this.amount = Math.max(0, Math.min(1, v));
    if (this.hall !== null) {
      this.hallReverb.setAmount(this.amount);
    }
    this.save();
  }

  setWarmth(v: number): void {
    this.warmth = Math.max(0, Math.min(1, v));
    this.hallReverb.setWarmth(this.warmth);
    this.save();
  }

  setFadeSec(s: number): void {
    this.fadeSec = Math.max(1, Math.min(120, s));
    this.save();
  }

  startFade(): void {
    this.fade.start(this.fadeSec);
  }

  cancelFade(): void {
    this.fade.cancel();
  }

  get fadeRunning(): boolean {
    return this.fade.running;
  }

  fadeProgress(): number {
    return this.fade.progress();
  }

  fadeTarget(): "A" | "B" {
    return this.fade.target();
  }

  sampleDynamics(): void {
    this.engine.meterTap.getFloatTimeDomainData(this.timeDomainData);
    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const sample = Math.abs(this.timeDomainData[i]);
      if (sample > peak) peak = sample;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / this.timeDomainData.length);
    if (peak > 0.0005) {
      this.dynamicsBuffer.push({ peak, rms });
      if (this.dynamicsBuffer.length > 40) {
        this.dynamicsBuffer.shift();
      }
    }
  }

  dynamics(): { peakDb: number; rmsDb: number; crestDb: number } | null {
    if (this.dynamicsBuffer.length < 5) return null;

    let maxPeak = 0;
    let sumRms = 0;
    for (const { peak, rms } of this.dynamicsBuffer) {
      if (peak > maxPeak) maxPeak = peak;
      sumRms += rms;
    }

    const peakDb = Math.max(-90, 20 * Math.log10(maxPeak));
    const rmsDb = Math.max(-90, 20 * Math.log10(sumRms / this.dynamicsBuffer.length));
    const crestDb = Math.max(-90, peakDb - rmsDb);

    return { peakDb, rmsDb, crestDb };
  }

  reset(): void {
    this.hall = null;
    this.amount = 0.35;
    this.warmth = 0.4;
    this.fadeSec = 20;
    this.cancelFade();
    this.apply();
    this.save();
  }

  private apply(): void {
    if (this.hall === null) {
      this.hallReverb.setAmount(0);
    } else {
      this.hallReverb.setHall(this.hall);
      this.hallReverb.setAmount(this.amount);
    }
    this.hallReverb.setWarmth(this.warmth);
  }

  private save(): void {
    try {
      localStorage.setItem(
        "djsynth.classique.v1",
        JSON.stringify({
          hall: this.hall,
          amount: this.amount,
          warmth: this.warmth,
          fadeSec: this.fadeSec,
        })
      );
    } catch {}
  }
}
