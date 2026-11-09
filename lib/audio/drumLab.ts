import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { nextGrid } from "./stemJam";
import { HIT_DIVS } from "./loopLevels";
import type { ReleaseSec } from "./padRelease";
import { pickHits, slicePeaks, type DrumHit, type DrumKind, type DrumPrep } from "../drumPrep";

export class DrumLab extends JamModule {
  prep: DrumPrep | null = null;
  state: "idle" | "loading" | "ready" | "none" = "idle";
  level = 0.9;
  divIdx = 0; // index in HIT_DIVS, 0 = auto
  latch = false; // a pad keeps looping after release until pressed again
  feel = 0.35; // 0..1 human touch
  release: ReleaseSec = 0; // RELEASE: each hit rings on (its room, its cymbal) and fades out (lib/audio/padRelease.ts)
  private loadedFor = "";
  private pools: Partial<Record<DrumKind, DrumHit[]>> = {};
  private rr: Partial<Record<DrumKind, number>> = {};
  private waves: Partial<Record<DrumKind, number[]>> = {}; // the best hit of each kind drawn on its pad
  private rolls = new Map<string, { timer: ReturnType<typeof setInterval>; next: number; n: number }>();

  protected closed(): void { this.stopRolls(); }
  constructor(engine: DJEngine) {
    super(engine, "drums");
    this.gateModule("drumlab");
    setInterval(() => this.tick(), 100);
  }

  private key(d: Deck): string {
    return d.stemHash ? `${d.stemHash}|${d.stemModel}|${d.stemOptsQS()}` : "";
  }

  private tick() {
    const d = this.deck();
    this.route(d);
    const k = this.key(d);
    if (k !== this.loadedFor) {
      this.prep = null;
      this.pools = {};
      this.rr = {};
      this.waves = {};
      this.loadedFor = k;
      this.state = k ? "loading" : "idle";
      if (k) void this.load(d, k);
      jamChanged();
    }
  }

  private async load(d: Deck, k: string) {
    try {
      const j = (await (await fetch(`/api/stems/drums?read=1&hash=${d.stemHash}&model=${d.stemModel}${d.stemOptsQS()}`)).json()) as { drums: DrumPrep | null };
      if (this.loadedFor !== k) return;
      if (j.drums) {
        this.prep = j.drums;
        this.state = "ready";
        for (const kind of ["kick", "snare", "hat"] as DrumKind[]) {
          this.pools[kind] = pickHits(j.drums?.hits ?? [], kind);
        }
        jamChanged();
      } else {
        this.state = "loading";
        const j2 = (await (await fetch(`/api/stems/drums?hash=${d.stemHash}&model=${d.stemModel}${d.stemOptsQS()}&bpm=${d.bpm.toFixed(1)}&offset=${d.beatGridOffset.toFixed(2)}`)).json()) as { drums: DrumPrep | null };
        if (this.loadedFor !== k) return;
        this.prep = j2.drums;
        this.state = j2.drums ? "ready" : "none";
        for (const kind of ["kick", "snare", "hat"] as DrumKind[]) {
          this.pools[kind] = pickHits(j2.drums?.hits ?? [], kind);
        }
        jamChanged();
      }
    } catch {
      if (this.loadedFor !== k) return;
      this.prep = null;
      this.state = "none";
      jamChanged();
    }
  }

  play(kind: DrumKind, at?: number, accent = false) {
    const d = this.deck();
    const i = this.stem(d);
    if (i < 0) return;
    const buf = d.getStemBuffer(i);
    const hits = this.pools[kind];
    if (!buf || !hits || hits.length === 0) return;
    const ctx = this.engine.ctx;
    const dur = kind === "kick" ? 0.3 : kind === "snare" ? 0.25 : 0.12;
    const f = this.feel;
    let when = at ?? (d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : ctx.currentTime + 0.01);
    when = Math.max(ctx.currentTime, when + (Math.random() - 0.5) * 0.014 * f);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = d.playRate;
    const g = ctx.createGain();
    const hit = hits[(this.rr[kind] ?? 0) % hits.length];
    this.rr[kind] = (this.rr[kind] ?? 0) + 1;
    const level = Math.min(1.2, this.level * (0.6 + 0.6 * hit.vel) * (1 + (Math.random() - 0.5) * 0.3 * f) * (accent ? 1 + 0.25 * f : 1));
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.002);
    if (this.release > 0) {
      g.gain.setValueAtTime(level, when + dur * 0.5);
      g.gain.setTargetAtTime(0, when + dur * 0.5, (dur * 0.5 + this.release) / 4.6); // the hit's own ring, fading
    } else {
      g.gain.linearRampToValueAtTime(0, when + dur);
    }
    src.connect(g);
    g.connect(this.bus);
    src.start(when, Math.max(0, hit.t - 0.003), dur + this.release);
    this.hit(when);
  }

  roll(kind: DrumKind, on: boolean, key: string = kind, beats = 0.25) {
    const old = this.rolls.get(key);
    if (old) clearInterval(old.timer);
    this.rolls.delete(key);
    if (!on) return;
    const d = this.deck();
    const period = d.bpm > 0 ? 60 / d.bpm * beats : beats * 0.5;
    const r = { timer: 0 as unknown as ReturnType<typeof setInterval>, next: d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : this.engine.ctx.currentTime + 0.01, n: 0 };
    r.timer = setInterval(() => {
      while (r.next < this.engine.ctx.currentTime + 0.3) {
        this.play(kind, r.next, r.n % 4 === 0);
        r.next += period;
        r.n++;
      }
    }, 80);
    this.rolls.set(key, r);
  }

  stopRolls() {
    for (const k of [...this.rolls.keys()]) this.roll("kick", false, k);
  }

  // Renvoie les crêtes de l'onde du meilleur coup pour le type donné, ou null si absent.
  waveOf(kind: "kick" | "snare" | "hat"): number[] | null {
    if (this.waves[kind]) return this.waves[kind];
    const pool = this.pools[kind];
    if (!pool || pool.length === 0) return null;
    const d = this.deck();
    const i = this.stem(d);
    if (i < 0) return null;
    const buf = d.getStemBuffer(i);
    if (!buf) return null;
    const dur = kind === "kick" ? 0.3 : kind === "snare" ? 0.25 : 0.12;
    const sr = buf.sampleRate;
    const hit = pool[0];
    const start = Math.max(0, Math.round((hit.t - 0.003) * sr));
    const peaks = slicePeaks(buf.getChannelData(0), start, Math.round(dur * sr), 24);
    this.waves[kind] = peaks;
    return peaks;
  }

  setLevel(v: number) {
    this.level = v;
    jamChanged();
  }

  setRelease(v: ReleaseSec) {
    this.release = v;
    jamChanged();
  }

  pads(): PadDef[] {
    return [
      { id: "kick", label: "Kick", sub: "le coup du morceau", mode: this.latch ? "toggle" : "hold", isOn: this.latch ? () => this.rolls.has(`hold-kick`) : undefined, run: (on) => this.loopPad("kick", on) },
      { id: "snare", label: "Caisse", sub: "la caisse du morceau", mode: this.latch ? "toggle" : "hold", isOn: this.latch ? () => this.rolls.has(`hold-snare`) : undefined, run: (on) => this.loopPad("snare", on) },
      { id: "hat", label: "Charley", sub: "le charley du morceau", mode: this.latch ? "toggle" : "hold", isOn: this.latch ? () => this.rolls.has(`hold-hat`) : undefined, run: (on) => this.loopPad("hat", on) },
      { id: "roll-snare", label: "Roulement caisse", sub: "caisse en 1/16", mode: "toggle", run: (on) => this.roll("snare", on) },
      { id: "roll-hat", label: "Roulement charley", sub: "charley en 1/16", mode: "toggle", run: (on) => this.roll("hat", on) },
      { id: "r8", label: "Roll 1/8", mode: "hold", run: (on) => this.fx("roll", on, 1/8) },
      { id: "r16", label: "Roll 1/16", mode: "hold", run: (on) => this.fx("roll", on, 1/16) },
      { id: "double", label: "Double", mode: "hold", run: (on) => this.fx("double", on) },
      { id: "half", label: "Demi-tempo", mode: "hold", run: (on) => this.fx("halftime", on) },
      { id: "brake", label: "Frein", mode: "hold", run: (on) => this.fx("brake", on) },
      { id: "scatter", label: "Éparpille", mode: "hold", run: (on) => this.fx("scatter", on) }
    ];
  }

  repeat = true;

  beatsFor(kind: DrumKind): number {
    return HIT_DIVS[this.divIdx] || (kind === "hat" ? 0.25 : 0.5);
  }

  loopPad(kind: DrumKind, on: boolean) {
    if (this.repeat || this.latch) this.roll(kind, on, `hold-${kind}`, this.beatsFor(kind));
    else if (on) this.play(kind);
  }

  setDiv(i: number) {
    this.divIdx = Math.max(0, Math.min(HIT_DIVS.length - 1, i));
    for (const kind of ["kick", "snare", "hat"] as DrumKind[]) if (this.rolls.has(`hold-${kind}`)) this.roll(kind, true, `hold-${kind}`, this.beatsFor(kind));
    jamChanged();
  }

  setLatch(v: boolean) {
    this.latch = v;
    if (!v) for (const kind of ["kick", "snare", "hat"] as DrumKind[]) if (!this.pressed.has(kind)) this.roll(kind, false, `hold-${kind}`);
    jamChanged();
  }

  setFeel(v: number) {
    this.feel = v;
    jamChanged();
  }

  setRepeat(v: boolean) {
    this.repeat = v;
    jamChanged();
  }

  isRepeating(id: string): boolean {
    return (id === "kick" || id === "snare" || id === "hat") && this.rolls.has(`hold-${id}`);
  }

  protected keep(): string[] {
    return ["level", "repeat", "divIdx", "latch", "feel", "release"];
  }

  protected resetFields() {
    this.stopRolls();
    this.level = 0.9;
    this.repeat = true;
    this.divIdx = 0;
    this.latch = false;
    this.feel = 0.35;
    this.release = 0;
  }

  warning(): string | null {
    if (!this.deck().stemHash) {
      return "Prépare les stems du morceau pour jouer sa batterie.";
    }
    if (this.state === "none") {
      return "Lance la « Prépa batterie » du morceau (Préparation) pour jouer ses vrais kicks, caisses et charleys.";
    }
    if (this.state === "loading") {
      return "Chargement de l'analyse de batterie…";
    }
    return null;
  }
}

const cache = new WeakMap<DJEngine, DrumLab>();
export function drumLab(engine: DJEngine): DrumLab {
  let lab = cache.get(engine);
  if (!lab) {
    lab = new DrumLab(engine);
    try {
      const saved = localStorage.getItem("djsynth.drumlab.v1");
      if (saved) {
        lab.restore(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to restore drum lab", e);
    }
    cache.set(engine, lab);
    const mine = lab;
    let lastSnapshot = JSON.stringify(mine.snapshot());
    setInterval(() => {
      const snapshot = JSON.stringify(mine.snapshot());
      if (snapshot !== lastSnapshot) {
        try {
          localStorage.setItem("djsynth.drumlab.v1", snapshot);
          lastSnapshot = snapshot;
        } catch (e) {
          console.error("Failed to save drum lab", e);
        }
      }
    }, 2000);
  }
  return lab;
}
