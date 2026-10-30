// SOLAR LAB: the Solar 42F drone as a stem module: a nappe in the song's key that follows its chords, ducks under
// the voice, freezes a stem (GEL) and takes the "other" stem over (REMPLACER); also plays on a song without stems
import { makeReverbImpulse } from "./Deck";
import { loopArray } from "./virtualCrowd";
import { StereoChorus } from "./jamChorus";
import { SyncedSweep } from "./jamSweep";
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { Riser } from "./jamVoices";
import { envelope, levelAt, percentile } from "./jamPrecision";
import { chordAt, jamScale, nextGrid, onJamTick, songToCtx, spb, voiceLead } from "./stemJam";

export type DroneWave = "pur" | "chaud" | "riche";
const OSC: Record<DroneWave, OscillatorType> = { pur: "sine", chaud: "triangle", riche: "sawtooth" };

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function tonicNotes(root: number, octave: number): number[] {
  const base = 36 + ((root % 12) + 12) % 12 + 12 * octave;
  return [base, base + 7, base + 12, base + 19];
}

export function openHz(open: number): number {
  return 200 * 2 ** (6 * Math.min(Math.max(open, 0), 1));
}

export class DroneEngine {
  readonly out: GainNode;
  readonly ctx: BaseAudioContext;
  private voices: { oscs: OscillatorNode[]; gain: GainNode }[] = [];
  private filter: BiquadFilterNode;
  readonly sweep: SyncedSweep;
  readonly chorus: StereoChorus;
  private level: GainNode;
  readonly duck: GainNode;
  private dry: GainNode;
  private send: GainNode;
  private reverb: ConvolverNode;
  private shimmer: OscillatorNode[] = [];
  private shimmerGain: GainNode;
  notes: number[] = [];
  private gel: AudioBufferSourceNode[] = [];
  private gelGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.sweep = new SyncedSweep(ctx);
    this.chorus = new StereoChorus(ctx);
    this.duck = ctx.createGain();
    this.level = ctx.createGain();
    this.dry = ctx.createGain();
    this.send = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.shimmerGain = ctx.createGain();
    this.gelGain = ctx.createGain();
    this.level.gain.value = 0; // silent until JOUE
    this.shimmerGain.gain.value = 0;
    this.gelGain.gain.value = 0;

    // four voices of three detuned oscillators
    for (let i = 0; i < 4; i++) {
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.25 / 3;
      const oscs: OscillatorNode[] = [];
      for (let j = 0; j < 3; j++) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.detune.value = (j - 1) * 12;
        osc.start();
        osc.connect(voiceGain);
        oscs.push(osc);
      }
      this.voices.push({ oscs, gain: voiceGain });
    }

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = openHz(0.45);
    this.filter.Q.value = 0.7;

    // voices -> filter -> synced sweep -> chorus -> duck -> level -> dry + long reverb
    this.voices.forEach(voice => voice.gain.connect(this.filter));
    this.filter.connect(this.sweep.input);
    this.sweep.output.connect(this.chorus.input);
    this.chorus.output.connect(this.duck);
    this.duck.connect(this.level);
    this.level.connect(this.dry);
    this.dry.connect(this.out);
    this.level.connect(this.send);
    this.send.connect(this.reverb);
    this.reverb.connect(this.out);

    // BRILLANCE: two sines an octave and a twelfth above the top note, only in the reverb
    for (let i = 0; i < 2; i++) {
      const shimmerOsc = ctx.createOscillator();
      shimmerOsc.type = "sine";
      shimmerOsc.start();
      shimmerOsc.connect(this.shimmerGain);
      this.shimmer.push(shimmerOsc);
    }
    this.shimmerGain.connect(this.reverb);

    // GEL: the frozen loop, filtered, ducked and leveled like the nappe
    const gelFilter = ctx.createBiquadFilter();
    gelFilter.type = "lowpass";
    gelFilter.frequency.value = 3500;
    this.gelGain.connect(gelFilter);
    gelFilter.connect(this.duck);

    this.chorus.setWidth(0.6);
    this.reverb.buffer = makeReverbImpulse(ctx, 7);
    this.glide(tonicNotes(0, 0), ctx.currentTime, 0.01);
  }

  glide(notes: number[], at: number, tau = 0.35): void {
    this.notes = notes;
    const top = Math.max(...notes);
    this.shimmer[0].frequency.setTargetAtTime(midiHz(top + 12), at, tau);
    this.shimmer[1].frequency.setTargetAtTime(midiHz(top + 19), at, tau);
    this.voices.forEach((voice, i) => {
      const note = notes[i % notes.length];
      voice.oscs.forEach(osc => {
        osc.frequency.setTargetAtTime(midiHz(note), at, tau);
      });
    });
  }

  setOn(on: boolean, at: number): void {
    this.level.gain.setTargetAtTime(on ? 1 : 0, at, on ? 0.6 : 0.9);
  }

  setLevelNow(v: number, at: number, tau: number): void {
    this.level.gain.setTargetAtTime(v, at, tau);
  }

  setWave(w: DroneWave): void {
    this.voices.forEach(voice => {
      voice.oscs.forEach(osc => {
        osc.type = OSC[w];
      });
    });
  }

  setSpread(cents: number): void {
    this.voices.forEach(voice => {
      voice.oscs.forEach((osc, i) => {
        osc.detune.value = (i - 1) * cents;
      });
    });
  }

  setOpen(open: number): void {
    const freq = openHz(open);
    this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    this.sweep.setCenter(freq);
  }

  setSpace(v: number): void {
    this.send.gain.setTargetAtTime(1.2 * v, this.ctx.currentTime, 0.1);
    this.dry.gain.setTargetAtTime(1 - 0.4 * v, this.ctx.currentTime, 0.1);
  }

  setShine(v: number): void {
    this.shimmerGain.gain.setTargetAtTime(0.06 * v, this.ctx.currentTime, 0.1);
  }

  startGel(buf: AudioBuffer, from: number, len: number): void {
    this.stopGel(this.ctx.currentTime);
    const sr = buf.sampleRate;
    const channels: Float32Array[] = [];
    for (let i = 0; i < buf.numberOfChannels; i++) {
      const channelData = buf.getChannelData(i);
      channels.push(loopArray(channelData, Math.round(from * sr), Math.round((from + len) * sr), Math.round(0.4 * sr)));
    }
    const gelBuf = this.ctx.createBuffer(buf.numberOfChannels, channels[0].length, sr);
    for (let i = 0; i < gelBuf.numberOfChannels; i++) {
      gelBuf.getChannelData(i).set(channels[i]);
    }
    for (let i = 0; i < 3; i++) {
      const source = this.ctx.createBufferSource();
      source.buffer = gelBuf;
      source.detune.value = [-7, 0, 7][i];
      source.loop = true;
      source.start(this.ctx.currentTime, Math.random() * gelBuf.duration);
      const g = this.ctx.createGain();
      g.gain.value = 0.35;
      source.connect(g).connect(this.gelGain);
      this.gel.push(source);
    }
    this.gelGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.8);
  }

  stopGel(at: number): void {
    this.gelGain.gain.setTargetAtTime(0, at, 0.7);
    this.gel.forEach(source => source.stop(at + 4));
    this.gel = [];
  }
}

export class SolarLab extends JamModule {
  readonly drone: DroneEngine;
  readonly riser: Riser;

  playing = false;
  follow: "accords" | "tonique" = "accords";
  octave = 0;
  riserBars: 4 | 8 = 8;
  gelSource: "vocals" | "other" | "mix" = "other";
  motionDiv = 4;
  gelOn = false;

  private _level = 0.8;
  private _open = 0.45;
  private _space = 0.6;
  private _motion = 0;
  private _shine = 0;
  private _duck = 0.5;
  private _spread = 12;
  private _wave: DroneWave = "chaud";

  constructor(engine: DJEngine) {
    super(engine, "other");
    this.drone = new DroneEngine(engine.ctx);
    this.drone.out.connect(this.bus);
    this.riser = new Riser(engine.ctx);
    this.riser.out.connect(this.bus);
    this.level = 0.8;
    this.open = 0.45;
    this.space = 0.6;
    this.motion = 0;
    this.shine = 0;
    this.duck = 0.5;
    this.spread = 12;
    this.wave = "chaud";
    onJamTick(engine, (d, from, to) => this.tick(d, from, to));
  }

  get level(): number { return this._level; }
  set level(v: number) { this._level = Math.max(0, Math.min(1.4, v)); this.drone.out.gain.setTargetAtTime(0.6 * this._level, this.engine.ctx.currentTime, 0.05); }

  get open(): number { return this._open; }
  set open(v: number) { this._open = Math.max(0, Math.min(1, v)); this.drone.setOpen(this._open); }

  get space(): number { return this._space; }
  set space(v: number) { this._space = Math.max(0, Math.min(1, v)); this.drone.setSpace(this._space); }

  get motion(): number { return this._motion; }
  set motion(v: number) { this._motion = Math.max(0, Math.min(1, v)); this.drone.sweep.setDepth(this._motion); this.drone.sweep.setRate(SyncedSweep.rateFor(this.deck().bpm || 120, this.motionDiv)); }

  get shine(): number { return this._shine; }
  set shine(v: number) { this._shine = Math.max(0, Math.min(1, v)); this.drone.setShine(this._shine); }

  get duck(): number { return this._duck; }
  set duck(v: number) { this._duck = Math.max(0, Math.min(1, v)); }

  get spread(): number { return this._spread; }
  set spread(v: number) { this._spread = Math.max(0, Math.min(40, v)); this.drone.setSpread(this._spread); }

  get wave(): DroneWave { return this._wave; }
  set wave(v: DroneWave) { this._wave = v; this.drone.setWave(this._wave); }

  protected routeTarget(deck: Deck): AudioNode | null {
    return super.routeTarget(deck) ?? deck.crowdInput();
  }

  status(): "ok" | "nostems" | "stopped" {
    const d = this.deck();
    return d.playing ? "ok" : "stopped";
  }

  warning(): string | null {
    return this.stem(this.deck()) < 0 ? "Sans stems : la nappe tient la tonalité du morceau, mais ne suit pas ses accords ni la voix." : null;
  }

  target(d: Deck, t: number): number[] {
    if (this.follow === "tonique" || this.stem(d) < 0) {
      return tonicNotes(jamScale(d).root, this.octave);
    } else {
      return voiceLead(this.drone.notes.length ? this.drone.notes : null, chordAt(d, t, "seventh").map(n => n - 12 + 12 * this.octave));
    }
  }

  private vocalEnv = new WeakMap<AudioBuffer, { env: Float32Array; ref: number }>();

  private vocalLevel(d: Deck, t: number): number {
    const stem = this.stem(d) >= 0 ? d.stemIndex("vocals") : -1;
    if (stem < 0) return 0;
    const buffer = d.getStemBuffer(stem);
    if (!buffer) return 0;
    let envData = this.vocalEnv.get(buffer);
    if (!envData) {
      const env = envelope(buffer.getChannelData(0), buffer.sampleRate);
      const ref = Math.max(1e-4, percentile(env, 0.95));
      envData = { env, ref };
      this.vocalEnv.set(buffer, envData);
    }
    return Math.min(1, levelAt(envData.env, 0.005, t, envData.ref));
  }

  private tick(d: Deck, from: number, to: number) {
    if (d !== this.deck()) return;
    this.route(d);
    if (!this.playing) return;
    const bpm = d.bpm;
    if (bpm <= 0) return;
    const beatGridOffset = d.beatGridOffset;
    const beatLen = 60 / bpm;
    for (let k = Math.ceil((from - beatGridOffset) / beatLen); k * beatLen + beatGridOffset < to; k++) {
      const b = beatGridOffset + k * beatLen;
      const n = this.target(d, b + 0.05);
      if (JSON.stringify(n) !== JSON.stringify(this.drone.notes)) {
        this.drone.glide(n, songToCtx(d, b));
        this.hit(songToCtx(d, b));
      }
    }
    if (this.motion > 0) this.drone.sweep.setRate(1 / (spb(d) * this.motionDiv)); // one sweep every motionDiv beats, at the heard tempo
    const v = this.vocalLevel(d, to);
    this.drone.duck.gain.setTargetAtTime(1 - 0.85 * this.duck * v, songToCtx(d, to) - 0.05, 0.12);
  }

  play(on: boolean) {
    this.playing = on;
    this.route(this.deck());
    if (on) {
      const d = this.deck();
      const n = this.target(d, d.position());
      this.drone.glide(n, d.ctx.currentTime, 0.05);
      this.drone.setOn(true, d.ctx.currentTime);
    } else {
      this.drone.setOn(false, this.engine.ctx.currentTime);
    }
    jamChanged();
  }

  gel(on: boolean) {
    this.gelOn = on;
    const d = this.deck();
    if (on) {
      const stemIndex = this.stem(d) >= 0 && this.gelSource !== "mix" ? d.stemIndex(this.gelSource) : -1;
      const buffer = (stemIndex >= 0 ? d.getStemBuffer(stemIndex) : null) ?? d.audioBuffer; // no stems: the whole song
      if (!buffer) {
        this.gelOn = false;
        return;
      }
      const pos = d.position();
      const len = 1.6;
      const from = pos >= len ? pos - len : pos;
      this.drone.startGel(buffer, from, len);
      if (!this.playing) {
        this.play(true);
      }
    } else {
      this.drone.stopGel(this.engine.ctx.currentTime);
    }
    jamChanged();
  }

  drop(on: boolean) {
    const d = this.deck();
    if (on) {
      this.drone.setLevelNow(0, this.engine.ctx.currentTime, 0.02);
    } else {
      const at = d.playing ? nextGrid(d, 4).at : this.engine.ctx.currentTime;
      this.drone.setLevelNow(this.playing ? 1 : 0, at, spb(d) / 2);
    }
  }

  breath(on: boolean) {
    const d = this.deck();
    if (on) {
      this.drone.setOpen(1);
      this.drone.setLevelNow(1.4, this.engine.ctx.currentTime, spb(d));
    } else {
      this.drone.setOpen(this.open);
      this.drone.setLevelNow(this.playing ? 1 : 0, this.engine.ctx.currentTime, spb(d) / 2);
    }
  }

  rise(on: boolean) {
    if (!on) {
      this.riser.stop(this.engine.ctx.currentTime);
      return;
    }
    const d = this.deck();
    this.route(d);
    const at = d.playing ? nextGrid(d, 4).at : this.engine.ctx.currentTime + 0.02;
    this.riser.play(at, this.riserBars * 4 * spb(d), 48 + jamScale(d).root);
    this.hit(at);
  }

  pads(): PadDef[] {
    return [
      { id: "play", label: "JOUE", sub: "la nappe", mode: "toggle", run: this.play.bind(this), isOn: () => this.playing },
      { id: "gel", label: "GEL", sub: "fige le son", mode: "toggle", run: this.gel.bind(this), isOn: () => this.gelOn },
      { id: "breath", label: "SOUFFLE", sub: "ouvre et monte", mode: "hold", run: this.breath.bind(this) },
      { id: "drop", label: "DROP", sub: "coupe, revient sur la mesure", mode: "hold", run: this.drop.bind(this) },
      { id: "rise", label: "MONTÉE", sub: `${this.riserBars} mesures`, mode: "hold", run: this.rise.bind(this) }
    ];
  }

  protected keep(): string[] {
    return ["follow", "octave", "riserBars", "gelSource", "motionDiv", "level", "open", "space", "motion", "shine", "duck", "spread", "wave"];
  }

  protected resetFields() {
    this.play(false);
    this.gel(false);
    this.follow = "accords";
    this.octave = 0;
    this.riserBars = 8;
    this.gelSource = "other";
    this.motionDiv = 4;
    this.level = 0.8;
    this.open = 0.45;
    this.space = 0.6;
    this.motion = 0;
    this.shine = 0;
    this.duck = 0.5;
    this.spread = 12;
    this.wave = "chaud";
  }
}

const solarCache = new WeakMap<DJEngine, SolarLab>();
export function solarLab(engine: DJEngine): SolarLab {
  if (!solarCache.has(engine)) {
    const m = new SolarLab(engine);
    try {
      const saved = localStorage.getItem("djsynth.solar.v1");
      if (saved) {
        m.restore(JSON.parse(saved));
      }
    } catch { /* first launch or storage blocked: the defaults stay */ }
    solarCache.set(engine, m);
    let last = "";
    setInterval(() => {
      const now = JSON.stringify(m.snapshot());
      if (now === last) return;
      last = now;
      try { localStorage.setItem("djsynth.solar.v1", now); } catch { /* storage blocked: the settings last the session */ }
    }, 2000);
  }
  return solarCache.get(engine)!;
}

// runnable check: the tonic drone and the OUVERTURE range
export function solarTest(): void {
  if (JSON.stringify(tonicNotes(9, 0)) !== JSON.stringify([45, 52, 57, 64])) throw new Error("solar tonic");
  if (JSON.stringify(tonicNotes(-3, -1)) !== JSON.stringify([33, 40, 45, 52])) throw new Error("solar tonic octave");
  if (openHz(0) !== 200 || openHz(1) !== 12800 || openHz(2) !== 12800) throw new Error("solar open");
  if (Math.abs(midiHz(69) - 440) > 1e-9) throw new Error("solar midi");
}
