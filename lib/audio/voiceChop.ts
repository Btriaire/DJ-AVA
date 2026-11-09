import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { nextGrid } from "./stemJam";
import { PHRASE_FRACS } from "./loopLevels";
import { fadeOut, type ReleaseSec } from "./padRelease";
import { slicePeaks } from "../drumPrep";
import type { VoicePrep, VoiceSeg } from "../voicePrep";

export class VoiceChop extends JamModule {
  private cur: GainNode | null = null;
  prep: VoicePrep | null = null;
  state: "idle" | "loading" | "ready" | "none" = "idle";
  level = 0.9;
  echoEnds = false;
  fracIdx = 0; // index in PHRASE_FRACS: the share of the phrase that loops
  latch = false; // a chop pad keeps looping after release until pressed again
  reverse = false;
  release: ReleaseSec = 0; // RELEASE: the syllable keeps sounding and fades out (lib/audio/padRelease.ts)
  private revs = new Map<number, AudioBuffer>();
  private loadedFor = "";
  private waves = new Map<number, number[]>();
  private stutterTimer: ReturnType<typeof setInterval> | null = null;
  private stutterNext = 0;
  private lastPos = 0;

  protected closed(): void { this.stopReps(); this.stutter(false); }
  constructor(engine: DJEngine) {
    super(engine, "vocals");
    this.gateModule("voicechop");
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
      this.waves.clear();
      this.revs.clear();
      this.loadedFor = k;
      this.state = k ? "loading" : "idle";
      if (k) void this.load(d, k);
      jamChanged();
    }
    if (this.echoEnds && this.prep && d.playing) {
      const pos = d.position();
      for (const p of this.prep.phrases) {
        if (p.end > this.lastPos && p.end <= pos) {
          this.fx("echo", true, 1/2);
          setTimeout(() => this.fx("echo", false), 1400);
        }
      }
      this.lastPos = pos;
    } else if (!d.playing) {
      this.lastPos = d.position();
    }
  }

  private async load(d: Deck, k: string) {
    try {
      const j = (await (await fetch(`/api/stems/voice?read=1&hash=${d.stemHash}&model=${d.stemModel}${d.stemOptsQS()}`)).json()) as { voice: VoicePrep | null };
      if (this.loadedFor !== k) return;
      if (j.voice) {
        this.prep = j.voice;
        this.state = "ready";
        jamChanged();
      } else {
        this.state = "loading";
        const j2 = (await (await fetch(`/api/stems/voice?hash=${d.stemHash}&model=${d.stemModel}${d.stemOptsQS()}`)).json()) as { voice: VoicePrep | null };
        if (this.loadedFor !== k) return;
        this.prep = j2.voice;
        this.state = j2.voice ? "ready" : "none";
        jamChanged();
      }
    } catch {
      if (this.loadedFor !== k) return;
      this.prep = null;
      this.state = "none";
      jamChanged();
    }
  }

  chop(i: number): VoiceSeg | null {
    return this.prep?.chops[i] ?? null;
  }

  private reversed(i: number): AudioBuffer | null {
    const hit = this.revs.get(i);
    if (hit) return hit;
    const seg = this.chop(i);
    const d = this.deck();
    const idx = this.stem(d);
    const buf = idx >= 0 ? d.getStemBuffer(idx) : null;
    if (!seg || !buf) return null;

    const ctx = this.engine.ctx;
    const channels = buf.numberOfChannels;
    const sampleRate = buf.sampleRate;
    const start = Math.max(0, seg.t);
    const end = Math.min(buf.duration, seg.t + seg.dur + 0.04);
    const length = Math.max(1, Math.floor((end - start) * sampleRate));

    const from = Math.floor(start * sampleRate);
    const reversedBuf = ctx.createBuffer(channels, length, sampleRate);

    for (let c = 0; c < channels; c++) {
      const channelData = buf.getChannelData(c);
      const reversedData = reversedBuf.getChannelData(c);
      for (let n = 0; n < length; n++) {
        reversedData[n] = channelData[from + length - 1 - n];
      }
    }

    this.revs.set(i, reversedBuf);
    return reversedBuf;
  }

  private hp: BiquadFilterNode | null = null;

  playChop(i: number, at?: number, frac = 1) {
    const seg = this.chop(i);
    const d = this.deck();
    const idx = this.stem(d);
    const buf = idx >= 0 ? d.getStemBuffer(idx) : null;
    if (!seg || !buf) return;
    const dur = seg.dur * frac;
    const ctx = this.engine.ctx;
    const when = at ?? (d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : ctx.currentTime + 0.01);
    const rev = this.reverse ? this.reversed(i) : null;
    const PRE = 0.015;
    const startAt = rev ? Math.max(ctx.currentTime, when) : Math.max(ctx.currentTime, when - PRE);
    const pre = rev ? 0 : Math.min(PRE, seg.t, Math.max(0, when - startAt));
    const offset = seg.t - pre;
    const src = ctx.createBufferSource();
    if (rev) {
        src.buffer = rev;
        src.start(startAt, 0, dur + pre + 0.18 + this.release);
    } else {
        src.buffer = buf;
        src.start(startAt, offset, dur + pre + 0.18 + this.release);
    }
    src.playbackRate.value = d.playRate;
    const g = ctx.createGain();
    if (this.cur) fadeOut(this.cur, startAt, this.release, when + 0.025 - startAt); // the previous syllable: cut, or its release
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(this.level, startAt + 0.008);
    g.gain.setValueAtTime(this.level, when + dur);
    g.gain.setTargetAtTime(0, when + dur, Math.max(0.05, this.release / 4.6)); // the voice's own tail with a RELEASE
    src.connect(g);
    if (!this.hp) {
        this.hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 90, Q: 0.7 });
        this.hp.connect(this.bus);
    }
    g.connect(this.hp);
    this.hit(when);
    this.cur = g;
  }

  stutter(on: boolean) {
    if (!on) {
      if (this.stutterTimer) clearInterval(this.stutterTimer);
      this.stutterTimer = null;
      return;
    }
    if (this.stutterTimer) {
      clearInterval(this.stutterTimer);
      this.stutterTimer = null;
    }
    const d = this.deck();
    const idx = this.stem(d);
    const buf = idx >= 0 ? d.getStemBuffer(idx) : null;
    if (!this.prep || !buf) return;
    const pos = d.position();
    const seg = this.prep.segs.reduce((prev, curr) => (curr.t <= pos ? curr : prev), this.prep.segs[0]);
    if (!seg) return;
    const period = d.bpm > 0 ? 60 / d.bpm / 4 : 0.125;
    const ctx = this.engine.ctx;
    this.stutterNext = d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : ctx.currentTime + 0.01;
    this.stutterTimer = setInterval(() => {
      while (this.stutterNext < ctx.currentTime + 0.3) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = d.playRate;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, this.stutterNext);
        g.gain.linearRampToValueAtTime(this.level, this.stutterNext + 0.003);
        g.gain.linearRampToValueAtTime(0, this.stutterNext + period * 0.95);
        src.connect(g);
        g.connect(this.bus);
        src.start(this.stutterNext, seg.t, period * 0.95);
        this.stutterNext += period;
      }
    }, 80);
  }

  waveOf(i: number): number[] | null {
    if (this.waves.has(i)) return this.waves.get(i) ?? null;
    const seg = this.chop(i);
    const d = this.deck();
    const idx = this.stem(d);
    const buf = idx >= 0 ? d.getStemBuffer(idx) : null;
    if (!seg || !buf) return null;
    const dur = Math.min(seg.dur, 0.9) + 0.04;
    const peaks = slicePeaks(buf.getChannelData(0), Math.max(0, Math.round((seg.t - 0.003) * buf.sampleRate)), Math.round(dur * buf.sampleRate), 24);
    this.waves.set(i, peaks);
    return peaks;
  }

  private reps = new Map<number, { timer: ReturnType<typeof setInterval>; next: number }>();

  repeatChop(i: number, on: boolean) {
    if (!on) {
      const old = this.reps.get(i);
      if (old) clearInterval(old.timer);
      this.reps.delete(i);
      return;
    }
    this.stopReps(); // the voice is monophonic
    const d = this.deck();
    const seg = this.chop(i);
    if (!seg) return;
    const r = { timer: 0 as unknown as ReturnType<typeof setInterval>, next: d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : this.engine.ctx.currentTime + 0.01 };
    r.timer = setInterval(() => {
      while (r.next < this.engine.ctx.currentTime + 0.3) {
        this.playChop(i, r.next, PHRASE_FRACS[this.fracIdx]);
        r.next += seg.dur * PHRASE_FRACS[this.fracIdx];
      }
    }, 80);
    this.reps.set(i, r);
  }

  stopReps() {
    for (const r of this.reps.values()) clearInterval(r.timer);
    this.reps.clear();
  }

  repeat = true;

  setRepeat(v: boolean) {
    this.repeat = v;
    jamChanged();
  }

  isRepeating(id: string): boolean {
    return id.startsWith("chop") && this.reps.has(parseInt(id.slice(4), 10));
  }

  setFrac(i: number) {
    this.fracIdx = Math.max(0, Math.min(PHRASE_FRACS.length - 1, i));
    const running = [...this.reps.keys()][0];
    if (running !== undefined) this.repeatChop(running, true);
    jamChanged();
  }

  setLatch(v: boolean) {
    this.latch = v;
    if (!v) for (const k of [...this.reps.keys()]) if (!this.pressed.has(`chop${k}`)) this.repeatChop(k, false);
    jamChanged();
  }

  setReverse(v: boolean) {
    this.reverse = v;
    jamChanged();
  }

  setLevel(v: number) { this.level = v; jamChanged(); }
  setRelease(v: ReleaseSec) { this.release = v; jamChanged(); }
  setEchoEnds(on: boolean) { this.echoEnds = on; jamChanged(); }

  pads(): PadDef[] {
    const pads: PadDef[] = [];
    for (let i = 0; i < 8; i++) {
      const seg = this.chop(i);
      pads.push({
        id: `chop${i}`,
        label: `PHR ${i + 1}`,
        sub: seg ? `${seg.t.toFixed(1)} s` : "vide",
        mode: this.latch ? "toggle" : "hold",
        isOn: this.latch ? () => this.reps.has(i) : undefined,
        run: (on) => { if (this.repeat || this.latch) this.repeatChop(i, on); else if (on) this.playChop(i); }
      });
    }
    pads.push({
      id: "stutter",
      label: "Bégaiement",
      sub: "répète la syllabe en cours",
      mode: "hold",
      run: (on) => this.stutter(on)
    });
    pads.push({
      id: "echo-end",
      label: "Écho de fin",
      sub: "écho à chaque fin de phrase",
      mode: "toggle",
      run: (on) => this.setEchoEnds(on),
      isOn: () => this.echoEnds
    });
    pads.push({
      id: "reverse",
      label: "Inverse",
      sub: "phrases à l'envers",
      mode: "toggle",
      run: (on) => this.setReverse(on),
      isOn: () => this.reverse
    });
    return pads;
  }

  protected keep(): string[] { return ["level", "echoEnds", "repeat", "fracIdx", "latch", "reverse", "release"]; }
  protected resetFields() { this.stopReps(); this.stutter(false); this.level = 0.9; this.echoEnds = false; this.repeat = true; this.fracIdx = 0; this.latch = false; this.reverse = false; this.release = 0; }

  warning(): string | null {
    if (!this.deck().stemHash) return "Prépare les stems du morceau pour jouer sa voix.";
    if (this.state === "none") return "Lance la « Prépa voix » du morceau (Préparation) pour jouer ses vraies phrases.";
    if (this.state === "loading") return "Chargement de l'analyse de la voix…";
    return null;
  }
}

const cache = new WeakMap<DJEngine, VoiceChop>();
export function voiceChop(engine: DJEngine): VoiceChop {
  let lab = cache.get(engine);
  if (!lab) {
    lab = new VoiceChop(engine);
    try {
      const saved = localStorage.getItem("djsynth.voicechop.v1");
      if (saved) lab.restore(JSON.parse(saved));
    } catch (e) { console.error("Failed to restore voice chop:", e); }
    cache.set(engine, lab);
    const mine = lab;
    let lastSnapshot = JSON.stringify(mine.snapshot());
    setInterval(() => {
      const currentSnapshot = JSON.stringify(mine.snapshot());
      if (currentSnapshot !== lastSnapshot) {
        try {
          localStorage.setItem("djsynth.voicechop.v1", currentSnapshot);
          lastSnapshot = currentSnapshot;
        } catch (e) { console.error("Failed to save voice chop:", e); }
      }
    }, 2000);
  }
  return lab;
}
