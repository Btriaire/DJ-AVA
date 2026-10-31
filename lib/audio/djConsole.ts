// What a club mixer adds around the decks: headphone pre-listen (CUE), crossfader curves, a microphone
// with talkover, and the history of the set.
import type { Deck } from "./Deck";

export type XfCurve = "douce" | "mix" | "scratch";
export const XF_CURVES: [XfCurve, string, string][] = [
  ["douce", "Douce", "Fondu à puissance constante : pour les longues transitions"],
  ["mix", "Mix", "Les deux decks à fond au milieu : pour superposer"],
  ["scratch", "Scratch", "Coupure franche au bord : pour scratcher et couper net"],
];
// gains of decks A and B for a crossfader position 0 (A) .. 1 (B)
export function xfGains(x: number, curve: XfCurve): [number, number] {
  if (curve === "mix") return [Math.min(1, 2 * (1 - x)), Math.min(1, 2 * x)];
  if (curve === "scratch") return [x <= 0.97 ? 1 : (1 - x) / 0.03, x >= 0.03 ? 1 : x / 0.03];
  return [Math.cos((x * Math.PI) / 2), Math.cos(((1 - x) * Math.PI) / 2)];
}

export interface SetEntry { at: number; deck: "A" | "B"; name: string; bpm: number }
interface ConsoleEngine {
  ctx: AudioContext;
  deckA: Deck;
  deckB: Deck;
  masterIn: AudioNode;
  masterTap: AudioNode;
  setDuck(g: number): void;
}

export class DjConsole {
  // ---- CUE: each deck's sound before its fader, in the headphones, blended with the master ----
  readonly cue = { A: false, B: false };
  cueMix = 0.3; // 0 = only the CUE, 1 = only the master
  cueLevel = 0.8;
  split = false; // left ear CUE, right ear master
  device = ""; // headphone output id ("" = headphones off)
  private cueIn: Record<"A" | "B", GainNode>;
  private cueBus: GainNode;
  private masterIn: GainNode;
  private stereo: GainNode;
  private splitOut: ChannelMergerNode;
  private level: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private el: HTMLAudioElement | null = null;

  // ---- microphone ----
  micOn = false;
  micLevel = 0.9;
  talkover = true;
  talking = false;
  micError = "";
  private mic: { stream: MediaStream; src: MediaStreamAudioSourceNode; gain: GainNode; an: AnalyserNode } | null = null;
  private quietSince = 0;

  // ---- set history ----
  history: SetEntry[] = [];
  private last: Record<"A" | "B", string> = { A: "", B: "" };

  constructor(private e: ConsoleEngine) {
    const c = e.ctx;
    this.cueBus = c.createGain();
    this.cueIn = { A: c.createGain(), B: c.createGain() };
    for (const s of ["A", "B"] as const) {
      this.cueIn[s].gain.value = 0;
      (s === "A" ? e.deckA : e.deckB).rack.output.connect(this.cueIn[s]); // after the deck's effects, before its fader
      this.cueIn[s].connect(this.cueBus);
    }
    this.masterIn = c.createGain();
    e.masterTap.connect(this.masterIn);
    this.stereo = c.createGain();
    this.cueBus.connect(this.stereo);
    this.masterIn.connect(this.stereo);
    this.splitOut = c.createChannelMerger(2);
    const mono = (n: AudioNode, ch: number) => { const g = c.createGain(); g.channelCount = 1; g.channelCountMode = "explicit"; n.connect(g); g.connect(this.splitOut, 0, ch); };
    mono(this.cueBus, 0);
    mono(this.masterIn, 1);
    this.level = c.createGain();
    this.dest = c.createMediaStreamDestination();
    this.level.connect(this.dest);
    this.applyCue();
    setInterval(() => this.tick(), 30);
  }

  setCue(side: "A" | "B", on: boolean) { this.cue[side] = on; this.applyCue(); }
  setCueMix(v: number) { this.cueMix = v; this.applyCue(); }
  setCueLevel(v: number) { this.cueLevel = v; this.applyCue(); }
  setSplit(on: boolean) { this.split = on; this.applyCue(); }
  private applyCue() {
    const t = this.e.ctx.currentTime;
    for (const s of ["A", "B"] as const) this.cueIn[s].gain.setTargetAtTime(this.cue[s] ? 1 : 0, t, 0.01);
    // split: each ear at full level; blend: the knob mixes CUE and master
    this.cueBus.gain.setTargetAtTime(this.split ? 1 : Math.cos((this.cueMix * Math.PI) / 2), t, 0.02);
    this.masterIn.gain.setTargetAtTime(this.split ? 1 : Math.sin((this.cueMix * Math.PI) / 2), t, 0.02);
    this.level.gain.setTargetAtTime(this.cueLevel, t, 0.02);
    try { this.stereo.disconnect(); this.splitOut.disconnect(); } catch { /* not connected yet */ }
    (this.split ? this.splitOut : this.stereo).connect(this.level);
  }
  static async outputs(): Promise<{ id: string; label: string }[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === "audiooutput" && d.deviceId !== "default").map((d, i) => ({ id: d.deviceId, label: d.label || `Sortie ${i + 1}` }));
    } catch {
      return [];
    }
  }
  async setDevice(id: string) {
    this.device = id;
    if (!id) {
      this.el?.pause();
      this.el = null;
      return;
    }
    if (!this.el) {
      this.el = new Audio();
      this.el.srcObject = this.dest.stream;
    }
    const el = this.el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    await el.setSinkId?.(id);
    await el.play().catch(() => undefined);
  }

  async setMic(on: boolean) {
    this.micError = "";
    if (!on) {
      this.mic?.stream.getTracks().forEach((tr) => tr.stop());
      this.mic?.gain.disconnect();
      this.mic = null;
      this.micOn = false;
      this.e.setDuck(1);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const c = this.e.ctx;
      const src = c.createMediaStreamSource(stream);
      const gain = c.createGain();
      gain.gain.value = this.micLevel;
      const an = c.createAnalyser();
      an.fftSize = 1024;
      src.connect(gain);
      gain.connect(this.e.masterIn);
      src.connect(an);
      this.mic = { stream, src, gain, an };
      this.micOn = true;
    } catch {
      this.micError = "Micro refusé ou absent : autorise DJSynth dans Réglages Système > Confidentialité > Micro.";
      this.micOn = false;
    }
  }
  setTalkover(on: boolean) {
    this.talkover = on;
  }
  setMicLevel(v: number) {
    this.micLevel = v;
    this.mic?.gain.gain.setTargetAtTime(v, this.e.ctx.currentTime, 0.02);
  }

  private buf = new Float32Array(1024);
  private tick() {
    // talkover: the music dips 10 dB while the voice speaks, and comes back 0.4 s after it stops
    if (this.mic && this.talkover) {
      this.mic.an.getFloatTimeDomainData(this.buf);
      let e = 0;
      for (const v of this.buf) e += v * v;
      const db = 10 * Math.log10(e / this.buf.length + 1e-12);
      const now = performance.now();
      if (db > -38) { this.quietSince = now; if (!this.talking) { this.talking = true; this.e.setDuck(0.32); } }
      else if (this.talking && now - this.quietSince > 400) { this.talking = false; this.e.setDuck(1); }
    } else if (this.talking) {
      this.talking = false;
      this.e.setDuck(1);
    }
    // history: a track enters the set when it starts playing
    for (const s of ["A", "B"] as const) {
      const d = s === "A" ? this.e.deckA : this.e.deckB;
      if (d.playing && d.name && d.name !== this.last[s]) {
        this.last[s] = d.name;
        this.history.push({ at: Date.now(), deck: s, name: d.name, bpm: Math.round(d.effectiveBPM || d.bpm) });
      }
    }
  }
  historyText(): string {
    const t0 = this.history[0]?.at ?? Date.now();
    const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
    return this.history.map((h, i) => `${i + 1}\t${mmss(h.at - t0)}\t${h.deck}\t${h.bpm} BPM\t${h.name}`).join("\n");
  }
}

const consoles = new WeakMap<object, DjConsole>();
export function djConsole(e: ConsoleEngine): DjConsole {
  let c = consoles.get(e);
  if (!c) consoles.set(e, (c = new DjConsole(e)));
  return c;
}

export function djConsoleTest(): void {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const [a, b] = xfGains(0.5, "douce");
  if (!near(a * a + b * b, 1)) throw new Error("xf power");
  if (xfGains(0.5, "mix").join() !== "1,1") throw new Error("xf mix");
  if (xfGains(0.9, "scratch").join() !== "1,1" || xfGains(1, "scratch")[0] !== 0) throw new Error("xf scratch");
}
