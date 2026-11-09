import { onModuleGate } from "./moduleGate";
import type { DJEngine } from "./engine";
import { arcGain, isArcName, type ArcName } from "./sessionArc";
import { AmbienceLayers, type LayerName } from "./ambienceLayers";
import { SessionTimer } from "./sessionSpace";
import type { HallName } from "./concertHall";

export type PresetName = "piano" | "guitare" | "handpan" | "zen";
export const PRESETS: Record<PresetName, { label: string; levels: Record<LayerName, number>; root: number; space: number; hall: HallName | null }> = {
  piano: { label: "Piano", levels: { rain: 0, wind: 0, drone: 0.12, bowl: 0 }, root: 48, space: 0.4, hall: "chambre" },
  guitare: { label: "Guitare", levels: { rain: 0.1, wind: 0, drone: 0.1, bowl: 0 }, root: 43, space: 0.25, hall: "chambre" },
  handpan: { label: "Handpan", levels: { rain: 0, wind: 0.12, drone: 0.25, bowl: 0.2 }, root: 50, space: 0.5, hall: "eglise" },
  zen: { label: "Zen", levels: { rain: 0.25, wind: 0.2, drone: 0.35, bowl: 0.35 }, root: 48, space: 0.6, hall: "cathedrale" },
};
const sessionModules = new WeakMap<DJEngine, SessionModule>();

export class SessionModule {
  levels: Record<LayerName, number> = { rain: 0, wind: 0, drone: 0, bowl: 0 };
  root = 48;
  minutes = 20;
  fadeSec = 60;
  preset: PresetName | null = null;
  arc: ArcName = "constant";
  private arcTimer: ReturnType<typeof setInterval> | null = null;
  private open = true; // false while Acoustique is closed in the module picker: no ambience, no session fade
  private ambienceLayers: AmbienceLayers;
  private sessionTimer: SessionTimer;

  constructor(engine: DJEngine) {
    this.ambienceLayers = new AmbienceLayers(engine.ctx, engine.masterBus);
    this.sessionTimer = new SessionTimer(engine.masterBus);
    this.restoreSettings();
    this.applySettings();
    onModuleGate("session", (open) => {
      this.open = open;
      if (open) this.applySettings();
      else this.cancelTimer();
    });
  }

  private restoreSettings(): void {
    try {
      const saved = localStorage.getItem("djsynth.session.v1");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.levels) {
          for (const key in this.levels) {
            if (data.levels[key] !== undefined) {
              this.levels[key as LayerName] = this.clamp(data.levels[key], 0, 1);
            }
          }
        }
        if (Number.isFinite(data.root)) {
          this.root = this.clamp(data.root, 24, 72);
        }
        if (Number.isFinite(data.minutes)) {
          this.minutes = this.clamp(data.minutes, 1, 240);
        }
        if (Number.isFinite(data.fadeSec)) {
          this.fadeSec = this.clamp(data.fadeSec, 5, 300);
        }
        if (isArcName(data.arc)) {
          this.arc = data.arc;
        }
        if (data.preset && PRESETS[data.preset as PresetName]) {
          this.preset = data.preset as PresetName;
        } else {
          this.preset = null;
        }
      }
    } catch (e) {
      console.error("Failed to restore session settings", e);
    }
  }

  private applySettings(): void {
    const gain = this.currentGain();
    for (const key in this.levels) {
      this.ambienceLayers.set(key as LayerName, this.levels[key as LayerName] * gain);
    }
    this.ambienceLayers.setRoot(this.root);
  }

  private currentGain(): number {
    if (!this.open) return 0;
    if (!this.sessionTimer.running) return 1;
    const rem = this.sessionTimer.remaining();
    const total = this.minutes * 60;
    const elapsed = rem === null ? 0 : total - rem;
    return arcGain(this.arc, elapsed, total);
  }

  private saveSettings(): void {
    try {
      localStorage.setItem("djsynth.session.v1", JSON.stringify({
        levels: this.levels,
        root: this.root,
        minutes: this.minutes,
        fadeSec: this.fadeSec,
        preset: this.preset,
        arc: this.arc,
      }));
    } catch (e) {
      console.error("Failed to save session settings", e);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  setLevel(n: LayerName, v: number): void {
    this.levels[n] = this.clamp(v, 0, 1);
    this.ambienceLayers.set(n, this.levels[n] * this.currentGain());
    this.preset = null;
    this.saveSettings();
  }

  setRoot(m: number): void {
    this.root = this.clamp(m, 24, 72);
    this.ambienceLayers.setRoot(this.root);
    this.preset = null;
    this.saveSettings();
  }

  applyPreset(name: PresetName): void {
    const p = PRESETS[name];
    this.levels = { ...p.levels };
    this.root = p.root;
    this.applySettings();
    this.preset = name;
    this.saveSettings();
  }

  setMinutes(m: number): void {
    this.minutes = this.clamp(m, 1, 240);
    this.saveSettings();
  }

  setFadeSec(s: number): void {
    this.fadeSec = this.clamp(s, 5, 300);
    this.saveSettings();
  }

  startTimer(): void {
    this.sessionTimer.start(this.minutes, this.fadeSec);
    this.stopArc();
    this.applySettings();
    this.arcTimer = setInterval(() => {
      if (!this.sessionTimer.running) {
        this.stopArc();
        return;
      }
      this.applySettings();
    }, 1000);
  }

  cancelTimer(): void {
    this.sessionTimer.cancel();
    this.stopArc();
    this.applySettings();
  }

  private stopArc(): void {
    if (this.arcTimer !== null) {
      clearInterval(this.arcTimer);
      this.arcTimer = null;
    }
  }

  setArc(a: ArcName): void {
    this.arc = a;
    this.applySettings();
    this.saveSettings();
  }
  remaining(): number | null {
    return this.sessionTimer.remaining();
  }

  get timerRunning(): boolean {
    return this.sessionTimer.running;
  }

  reset(): void {
    this.levels = { rain: 0, wind: 0, drone: 0, bowl: 0 };
    this.root = 48;
    this.minutes = 20;
    this.fadeSec = 60;
    this.preset = null;
    this.arc = "constant";
    this.cancelTimer();
    this.applySettings();
    this.saveSettings();
  }
}

export function sessionModule(engine: DJEngine): SessionModule {
  if (!sessionModules.has(engine)) {
    sessionModules.set(engine, new SessionModule(engine));
  }
  return sessionModules.get(engine)!;
}
