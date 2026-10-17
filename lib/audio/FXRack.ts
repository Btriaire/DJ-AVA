import { FxName, FxEnv, FxUnit, FX_LIST, FX_META, FxMeta } from "./fxTypes";
import { buildUnitA } from "./fxUnitsA";
import { buildUnitB } from "./fxUnitsB";
import { buildUnitC } from "./fxUnitsC";

export * from "./fxTypes";

export class FXRack {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private ctx: BaseAudioContext;
  private list: FxMeta[];
  private units = new Map<FxName, FxUnit>();
  private wets = new Map<FxName, GainNode>();
  private levels = new Map<FxName, number>();
  private effective = new Map<FxName, number>();
  private engaged = new Map<FxName, boolean>();
  private beats = new Map<FxName, number>();
  private params = new Map<FxName, { p1: number; p2: number }>();
  private wetLive = new Set<FxName>();
  private clock: (() => { bpm: number; toNextBeat: number } | null) | null = null;
  private manualBpm = 120;
  private lastBpm = 120;
  private bpmCheckInterval: NodeJS.Timeout | null = null;
  private releaseTimers = new Map<FxName, NodeJS.Timeout>();
  private env: FxEnv;

  // ids: only build these effects (default: all of FX_LIST)
  constructor(ctx: BaseAudioContext, ids?: FxName[]) {
    this.list = ids ? FX_LIST.filter((m) => ids.includes(m.id)) : FX_LIST;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    this.input.connect(this.dry);
    this.dry.connect(this.output);

    this.env = {
      ctx,
      beat: () => {
        const bpm = this.getBpm();
        const clock = this.readClock();
        return { period: 60 / bpm, toNext: clock ? clock.toNextBeat : 0 };
      }
    };

    for (const meta of this.list) {
      const wet = ctx.createGain();
      wet.gain.value = 0;
      this.wets.set(meta.id, wet);
      this.levels.set(meta.id, 0);
      this.effective.set(meta.id, 0);
      this.engaged.set(meta.id, false);
      this.beats.set(meta.id, meta.beat ?? 0);
      this.params.set(meta.id, {
        p1: meta.p1?.def ?? 0,
        p2: meta.p2?.def ?? 0
      });

      if (meta.always) {
        this.ensureUnit(meta.id);
        wet.connect(this.output);
        this.wetLive.add(meta.id);
      }
    }

    if (typeof window !== "undefined" && !(ctx instanceof OfflineAudioContext)) {
      this.bpmCheckInterval = setInterval(() => {
        const currentBpm = this.getBpm();
        if (Math.abs(currentBpm - this.lastBpm) > 0.05) {
          this.lastBpm = currentBpm;
          this.units.forEach((unit, name) => {
            if (this.levels.get(name)! > 0 || FX_META.get(name)!.always) {
              unit.retune();
            }
          });
        }
      }, 250);
    }
  }

  private readClock(): { bpm: number; toNextBeat: number } | null {
    return this.clock?.() ?? null;
  }

  // Build an effect the first time it is needed (most are never used): saves its
  // nodes, delay lines and buffers. Its stored settings are applied on creation.
  private ensureUnit(name: FxName): FxUnit | null {
    const existing = this.units.get(name);
    if (existing) return existing;
    const meta = FX_META.get(name);
    const wet = this.wets.get(name);
    if (!meta || !wet) return null;
    const unit = this.createUnit(name, this.env);
    this.input.connect(unit.input);
    unit.output.connect(wet);
    const p = this.params.get(name);
    if (meta.p1 && p) unit.setParam("p1", p.p1);
    if (meta.p2 && p) unit.setParam("p2", p.p2);
    if (meta.beat !== null) unit.setBeat(this.beats.get(name) ?? meta.beat);
    this.units.set(name, unit);
    return unit;
  }

  private createUnit(name: FxName, env: FxEnv): FxUnit {
    if (name === "dub" || name === "ring" || name === "tape" || name === "mash" || name === "vowel" || name === "scatter") {
      return buildUnitC(name, env);
    }
    if (name === "echo" || name === "reverb" || name === "flanger" || name === "phaser" ||
        name === "gate" || name === "sweep" || name === "noise" || name === "crush") {
      return buildUnitA(name, env);
    } else {
      return buildUnitB(name, env);
    }
  }

  private applyGains() {
    const insertEffects = this.list.filter(fx => fx.insert).map(fx => this.effective.get(fx.id)!);
    const dryGain = insertEffects.length > 0
      ? insertEffects.reduce((acc, level) => acc * Math.cos(level * Math.PI / 2), 1)
      : 1;

    this.dry.gain.setTargetAtTime(dryGain, this.ctx.currentTime, 0.01);

    this.list.forEach(fx => {
      const name = fx.id;
      const level = this.effective.get(name)!;
      const wet = this.wets.get(name)!;

      if (fx.insert) {
        const wetGain = Math.sin(level * Math.PI / 2);
        wet.gain.setTargetAtTime(wetGain, this.ctx.currentTime, 0.01);
      } else {
        const wetGain = level * fx.sendGain;
        wet.gain.setTargetAtTime(wetGain, this.ctx.currentTime, 0.01);
      }
    });
  }

  private scheduleDisconnect(name: FxName) {
    const meta = FX_META.get(name)!;
    if (meta.always) return;

    setTimeout(() => {
      if (this.levels.get(name) === 0 && this.effective.get(name) === 0) {
        const wet = this.wets.get(name)!;
        try {
          wet.disconnect(this.output);
          this.wetLive.delete(name);
        } catch {
          // Already disconnected
        }
      }
    }, 60);
  }

  setWet(name: FxName, v: number) {
    const meta = FX_META.get(name);
    if (!meta) return;

    const wet = this.wets.get(name);
    if (!wet) return;

    const clamped = Math.max(0, Math.min(1, v));
    const prevLevel = this.levels.get(name)!;
    this.levels.set(name, clamped);
    const unit = clamped > 0 ? this.ensureUnit(name) : this.units.get(name);
    if (!unit) return; // never built and asked to stay off: nothing to do

    if (clamped > 0) {
      const timer = this.releaseTimers.get(name);
      if (timer) {
        clearTimeout(timer);
        this.releaseTimers.delete(name);
      }

      this.effective.set(name, clamped);

      if (!this.engaged.get(name)) {
        unit.retune();
        if (!this.wetLive.has(name)) {
          wet.connect(this.output);
          this.wetLive.add(name);
        }
        unit.engage();
        this.engaged.set(name, true);
      }

      this.applyGains();
    } else if (prevLevel > 0) {
      const tail = unit.release();
      this.engaged.set(name, false);

      if (tail > 0) {
        const releaseTimer = setTimeout(() => {
          this.effective.set(name, 0);
          this.applyGains();
          this.scheduleDisconnect(name);
          this.releaseTimers.delete(name);
        }, tail * 1000);
        this.releaseTimers.set(name, releaseTimer);
      } else {
        this.effective.set(name, 0);
        this.applyGains();
        this.scheduleDisconnect(name);
      }
    }
  }

  getWet(name: FxName): number {
    return this.levels.get(name) ?? 0;
  }

  setBeat(name: FxName, idx: number) {
    if (!this.beats.has(name)) return;
    this.beats.set(name, idx);
    this.units.get(name)?.setBeat(idx);
  }

  getBeat(name: FxName): number {
    return this.beats.get(name) ?? 0;
  }

  setParam(name: FxName, key: "p1" | "p2", v: number) {
    const params = this.params.get(name);
    if (!params) return;
    const clamped = Math.max(0, Math.min(1, v));
    params[key] = clamped;
    this.units.get(name)?.setParam(key, clamped);
  }

  getParam(name: FxName, key: "p1" | "p2"): number {
    const params = this.params.get(name);
    return params ? params[key] : 0;
  }

  setClock(fn: (() => { bpm: number; toNextBeat: number } | null) | null) {
    this.clock = fn;
  }

  setManualBpm(bpm: number) {
    this.manualBpm = Math.max(40, Math.min(220, bpm));
  }

  // beat timing for UI feedback; null when the rack has no clock
  beatInfo(): { period: number; toNext: number } | null {
    const clock = this.readClock();
    if (!clock) return null;
    return { period: 60 / this.getBpm(), toNext: clock.toNextBeat };
  }

  getBpm(): number {
    const clock = this.readClock();
    return clock && clock.bpm > 0 ? clock.bpm : this.manualBpm;
  }

  resetAll() {
    this.list.forEach(fx => this.setWet(fx.id, 0));
  }

  dispose() {
    if (this.bpmCheckInterval) {
      clearInterval(this.bpmCheckInterval);
      this.bpmCheckInterval = null;
    }
    this.releaseTimers.forEach(timer => clearTimeout(timer));
    this.releaseTimers.clear();
  }

  static getMeta(name: FxName): FxMeta | undefined {
    return FX_META.get(name);
  }
}
