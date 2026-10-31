// "Voix humaines": human variations of the song's vocal, rendered once at preparation (TD-PSOLA, sample-aligned
// with the vocal stem) and played in sync with the deck, inside the vocal stem's chain.
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";

export const VOICE_LOOKS: { id: string; label: string; sub: string; layers: [string, number][] }[] = [
  { id: "double", label: "Doublage", sub: "deux prises à gauche et à droite", layers: [["double", 0.9]] },
  { id: "choir", label: "Chœur", sub: "tierce, quinte et octave en dessous", layers: [["third_up", 0.6], ["fifth_up", 0.45], ["octave_down", 0.5]] },
  { id: "third_up", label: "Tierce +", sub: "harmonie au-dessus, dans la gamme", layers: [["third_up", 0.8]] },
  { id: "third_down", label: "Tierce −", sub: "harmonie en dessous", layers: [["third_down", 0.8]] },
  { id: "octave_down", label: "Octave grave", sub: "la même voix une octave plus bas", layers: [["octave_down", 0.8]] },
  { id: "girl", label: "Voix femme", sub: "plus aiguë, timbre plus clair", layers: [["girl", 0.9]] },
  { id: "man", label: "Voix homme", sub: "plus grave, timbre plus sombre", layers: [["man", 0.9]] },
  { id: "child", label: "Enfant", sub: "très aiguë et petite", layers: [["child", 0.9]] },
  { id: "whisper", label: "Chuchoté", sub: "le souffle des mots, sans la note", layers: [["whisper", 0.9]] },
  { id: "crowd", label: "Foule", sub: "six voix légèrement décalées", layers: [["crowd", 0.8]] },
];

// the gain of every layer for the looks switched on (weights add up, capped at 1)
export function layerGains(looks: Set<string>, level: number): Map<string, number> {
  const g = new Map<string, number>();
  for (const l of VOICE_LOOKS) if (looks.has(l.id)) for (const [name, w] of l.layers) g.set(name, Math.min(1, (g.get(name) ?? 0) + w));
  for (const [k, v] of g) g.set(k, v * level);
  return g;
}

// one rendered layer, kept on the song position: restarted when the deck jumps, changes speed, or drifts
class SyncVoice {
  readonly gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private startAt = 0;
  private offset = 0;
  private rate = 1;
  constructor(private ctx: AudioContext, private buffer: AudioBuffer, out: AudioNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
  }
  setLevel(v: number) {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }
  private played(): number {
    return this.offset + (this.ctx.currentTime - this.startAt) * this.rate;
  }
  sync(d: Deck) {
    if (!d.playing) return this.stop();
    const want = d.position();
    if (this.src && Math.abs(want - this.played()) < 0.04 && Math.abs(this.rate - d.playRate) < 0.001) return;
    const old = this.src;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.playbackRate.value = d.playRate;
    s.connect(this.gain);
    this.startAt = this.ctx.currentTime + 0.005;
    this.offset = Math.max(0, Math.min(this.buffer.duration, want + 0.005 * d.playRate));
    this.rate = d.playRate;
    s.start(this.startAt, this.offset);
    this.src = s;
    if (old) try { old.stop(this.ctx.currentTime + 0.02); } catch { /* already stopped */ }
  }
  stop() {
    if (!this.src) return;
    try { this.src.stop(); } catch { /* already stopped */ }
    this.src = null;
  }
}

export class VoiceLab extends JamModule {
  looks = new Set<string>();
  level = 0.8;
  available: string[] = [];
  state: "idle" | "loading" | "rendering" | "ready" = "idle";
  private loadedFor = "";
  private lastPoll = 0;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, SyncVoice>();

  constructor(engine: DJEngine) {
    super(engine, "vocals");
    setInterval(() => this.tick(), 50);
  }

  private key(d: Deck): string { return d.stemHash ? `${d.stemHash}|${d.stemModel}|${d.stemOptsQS()}` : ""; }
  private url(d: Deck, name?: string): string {
    return `/api/stems/layers?hash=${d.stemHash}&model=${d.stemModel}${d.stemOptsQS()}${name ? `&name=${name}` : ""}`;
  }
  private async list(d: Deck) {
    this.lastPoll = performance.now();
    try {
      const j = (await (await fetch(this.url(d))).json()) as { layers: string[] };
      this.available = j.layers ?? [];
    } catch {
      this.available = [];
    }
    this.state = this.available.length ? "ready" : "rendering";
    if (this.state === "ready") void this.apply(); // looks asked for while rendering start now
    jamChanged();
  }
  private buffer(d: Deck, name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      p = fetch(this.url(d, name)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? d.ctx.decodeAudioData(b) : null)).catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }
  // every layer at the gain the looks ask for (loading the ones never heard yet)
  private async apply() {
    const d = this.deck();
    const want = layerGains(this.looks, this.level);
    for (const name of want.keys()) {
      if (this.voices.has(name) || !this.available.includes(name)) continue;
      const b = await this.buffer(d, name);
      if (b && !this.voices.has(name) && this.loadedFor === this.key(d)) this.voices.set(name, new SyncVoice(d.ctx, b, this.bus));
    }
    for (const [name, v] of this.voices) v.setLevel(want.get(name) ?? 0);
    jamChanged();
  }
  async setLook(id: string, on: boolean) {
    if (on) this.looks.add(id); else this.looks.delete(id);
    await this.apply();
  }
  setLevel(v: number) {
    this.level = v;
    void this.apply();
  }
  private tick() {
    const d = this.deck();
    this.route(d);
    const k = this.key(d);
    if (k !== this.loadedFor) {
      for (const v of this.voices.values()) { v.stop(); v.gain.disconnect(); }
      this.voices.clear();
      this.buffers.clear();
      this.available = [];
      this.loadedFor = k;
      this.state = k ? "loading" : "idle";
      if (k) void this.list(d);
      jamChanged();
    } else if (this.state === "rendering" && performance.now() - this.lastPoll > 5000) {
      void this.list(d);
    }
    for (const v of this.voices.values()) v.sync(d);
  }
  pads(): PadDef[] {
    return VOICE_LOOKS.map((l) => ({ id: l.id, label: l.label, sub: l.sub, mode: "toggle" as const, isOn: () => this.looks.has(l.id), run: (on: boolean) => void this.setLook(l.id, on) }));
  }
  protected keep(): string[] { return ["level"]; }
  protected resetFields() {
    this.looks.clear();
    this.level = 0.8;
    void this.apply();
  }
  warning(): string | null {
    if (!this.deck().stemHash) return "Prépare les stems du morceau pour créer ses voix.";
    if (this.state === "rendering") return "Les voix de ce morceau sont en préparation (environ 30 s), elles arrivent toutes seules.";
    return null;
  }
}

const cache = new WeakMap<DJEngine, VoiceLab>();
export function voiceLab(engine: DJEngine): VoiceLab {
  let m = cache.get(engine);
  if (!m) {
    const lab = new VoiceLab(engine);
    m = lab;
    try {
      const saved = localStorage.getItem("djsynth.voicelab.v1");
      if (saved) lab.restore(JSON.parse(saved));
    } catch { /* first launch or storage blocked: the defaults stay */ }
    cache.set(engine, lab);
    let last = "";
    setInterval(() => {
      const now = JSON.stringify(lab.snapshot());
      if (now === last) return;
      last = now;
      try { localStorage.setItem("djsynth.voicelab.v1", now); } catch { /* storage blocked: the settings last the session */ }
    }, 2000);
  }
  return m;
}

export function voiceLabTest(): void {
  const g = layerGains(new Set(["choir", "third_up"]), 1);
  if (g.get("third_up") !== 1 || g.get("fifth_up") !== 0.45 || g.has("double")) throw new Error("voicelab gains");
  if (layerGains(new Set(), 1).size !== 0) throw new Error("voicelab empty");
}
