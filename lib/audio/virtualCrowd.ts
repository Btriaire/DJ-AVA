// VIRTUAL CROWD: a synthetic concert audience under a deck. A babbling bed that follows the song's energy,
// hands clapping on beats 2 and 4 in the loud parts, a cheer when a section lifts, and the crowd singing
// along with the vocal stem (taken before its fader, so it still sings when the singer is muted).
import type { Deck } from "./Deck";
import { makeReverbImpulse } from "./Deck";
import type { StemMap } from "@/lib/stemAnalysis";


export type CrowdEvent = { t: number; kind: "clap" | "cheer"; v: number };

export function rng(seed: number): () => number {
  let t = seed;
  return function() {
    t += 0x6D2B79F5;
    let k = t;
    k = Math.imul(k ^ k >>> 15, k | 1);
    k ^= k + Math.imul(k ^ k >>> 7, k | 61);
    return ((k ^ k >>> 14) >>> 0) / 4294967296;
  };
}

const crowdCurvesCache = new WeakMap<StemMap, { energy: number[]; drums: number[]; cheers: number[] }>();

export function crowdCurves(map: StemMap): { energy: number[]; drums: number[]; cheers: number[] } {
  if (crowdCurvesCache.has(map)) {
    return crowdCurvesCache.get(map)!;
  }

  const energy = map.energy.map(e => Math.max(0, Math.min(1, e)));
  const drums = map.drums.slice().sort((a, b) => a - b);
  const percentileIndex = Math.floor(0.9 * (drums.length - 1));
  const percentile = drums[percentileIndex];
  const drumsNormalized = percentile === 0 ? new Array(map.drums.length).fill(0) : map.drums.map(d => Math.max(0, Math.min(1, d / percentile)));

  // a lift: the next 4 s louder than the last 4 s by 0.25; the cheer lands where the jump is the largest
  const cheers: number[] = [];
  const n = energy.length, mean = (a: number, b: number) => energy.slice(a, b).reduce((s, e) => s + e, 0) / (b - a);
  const lift = (i: number) => (i >= 8 && i + 8 <= n ? mean(i, i + 8) - mean(i - 8, i) : 0);
  // a song with a flat energy still gets its biggest lift cheered (when it lifts by 0.1 at least)
  let maxLift = 0;
  for (let i = 8; i + 8 <= n; i++) maxLift = Math.max(maxLift, lift(i));
  const need = Math.max(0.1, Math.min(0.25, 0.9 * maxLift));
  for (let i = 8; i + 8 <= n; i++) {
    if (lift(i) < need) continue;
    while (i + 1 + 8 <= n && lift(i + 1) > lift(i)) i++;
    if (!cheers.length || i * map.hop - cheers[cheers.length - 1] >= 16) cheers.push(i * map.hop);
    while (i + 8 <= n && lift(i) >= need) i++;
  }
  // the ovation: when the last loud moment of the song ends
  let last = n - 1;
  while (last > 0 && energy[last] < 0.5) last--;
  if (last > 16 && last < n - 1) cheers.push((last + 1) * map.hop);

  for (let i = 1; i < map.sections.length; i++) {
    if (map.sections[i].kind === "peak" && map.sections[i - 1].kind !== "peak") {
      const sectionStart = map.sections[i].start;
      const isWithinRange = cheers.some(cheer => Math.abs(cheer - sectionStart) <= 8);
      if (!isWithinRange) {
        cheers.push(sectionStart);
      }
    }
  }

  cheers.sort((a, b) => a - b);

  const result = { energy, drums: drumsNormalized, cheers };
  crowdCurvesCache.set(map, result);
  return result;
}

export function crowdEvents(map: StemMap | null, bpm: number, offset: number, from: number, to: number): CrowdEvent[] {
  if (!map || bpm <= 0 || map.energy.length === 0) {
    return [];
  }

  const c = crowdCurves(map);
  const events: CrowdEvent[] = [];

  const beat = 60 / bpm;
  let k = Math.max(1, Math.ceil((from - offset) / beat));
  if (k % 2 === 0) k++;
  for (; ; k += 2) {
    const b = offset + k * beat;
    if (b >= to) break;
    if (b >= from) {
      const energy = c.energy[Math.min(Math.floor(b / map.hop), c.energy.length - 1)];
      const drums = c.drums[Math.min(Math.floor(b / map.hop), c.drums.length - 1)];
      if (energy >= 0.6 && drums >= 0.5) {
        const v = Math.max(0, Math.min(1, 0.4 + 0.6 * energy));
        events.push({ t: b, kind: "clap", v });
      }
    }
  }

  for (const t of c.cheers) {
    if (t >= from && t < to) {
      const energy = c.energy[Math.min(Math.floor(t / map.hop), c.energy.length - 1)];
      const v = Math.max(0, Math.min(1, 0.6 + 0.4 * energy));
      events.push({ t, kind: "cheer", v });
    }
  }

  events.sort((a, b) => a.t - b.t);
  return events;
}

export function selfTest(): void {
  const map = {
    hop: 0.5,
    duration: 20,
    energy: [...Array(16).fill(0.2), ...Array(24).fill(0.9)],
    drums: [...Array(16).fill(0.01), ...Array(24).fill(0.08)],
    sections: [{ start: 0, end: 20, kind: "normal", level: 0.7 }]
  } as unknown as StemMap;

  const events = crowdEvents(map, 120, 0, 0, 20);
  const claps = events.filter((e) => e.kind === "clap"), cheers = events.filter((e) => e.kind === "cheer");
  if (claps.length !== 12 || claps[0].t !== 8.5 || claps.some((e, i) => e.t !== 8.5 + i)) throw new Error("claps on beats 2 and 4 from the loud part");
  if (cheers.length !== 1 || cheers[0].t < 6 || cheers[0].t > 8) throw new Error("one cheer at the lift");
  const flat = { ...map, energy: [...Array(40).fill(0.7), 0.85, 0.85, ...Array(18).fill(0.85), ...Array(10).fill(0.1)] } as unknown as StemMap;
  const fc = crowdCurves(flat).cheers;
  if (fc.length !== 2 || fc[0] < 18 || fc[0] > 22 || fc[1] !== 30) throw new Error("a flat song cheers its biggest lift and its end");
  if (crowdEvents(map, 120, 0, 9, 10).filter((e) => e.kind === "clap").map((e) => e.t).join() !== "9.5") throw new Error("a window finds its own clap");

  if (crowdEvents(null, 120, 0, 0, 8).length !== 0) {
    throw new Error("crowdEvents test 3 failed");
  }

  const c1 = crowdCurves(map);
  const c2 = crowdCurves(map);
  if (c1 !== c2) {
    throw new Error("crowdCurves cache test failed");
  }
}

export function bedLevel(map: StemMap | null, t: number): number {
  if (!map || map.energy.length === 0) return 0.35;
  const index = Math.min(map.energy.length - 1, Math.max(0, Math.floor(t / map.hop)));
  const e = map.energy[index];
  return 0.25 + 0.75 * e;
}

export function clapSamples(sr: number, seed: number): [Float32Array, Float32Array] {
  const len = Math.floor(0.35 * sr);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const rand = rng(seed);
  const numHands = 60;

  for (let i = 0; i < numHands; i++) {
    const startOffset = Math.max(0.03 + gaussian(rand) * 0.012, 0) * sr;
    const startSample = Math.floor(startOffset);
    const gain = 0.4 + rand() * 0.6;
    const pan = rand();
    const leftGain = Math.cos(pan * Math.PI / 2) * gain;
    const rightGain = Math.sin(pan * Math.PI / 2) * gain;

    let y = 0;
    let xPrev = 0;

    for (let j = startSample; j < len; j++) {
      const t = (j - startSample) / sr;
      if (t > 0.012) break;

      const x = (rand() * 2 - 1) * Math.exp(-t / 0.004);
      y = 0.9 * (y + x - xPrev);
      xPrev = x;

      left[j] += y * leftGain;
      right[j] += y * rightGain;
    }
  }

  normalize(left, right, 0.9);
  return [left, right];
}

// ---- synthesis helpers (written after two failed MaRuche rounds)
class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private b0 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  bandpass(f: number, q: number, sr: number): void {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    this.b0 = alpha / a0; this.b2 = -alpha / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function gaussian(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

function normalize(l: Float32Array, r: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < l.length; i++) max = Math.max(max, Math.abs(l[i]), Math.abs(r[i]));
  if (max < 1e-9) return;
  const s = peak / max;
  for (let i = 0; i < l.length; i++) { l[i] *= s; r[i] *= s; }
}

// 40 people talking: noise through two drifting formants per voice, syllables with pauses, seamless loop
export function babbleSamples(sr: number, sec: number, seed: number): [Float32Array, Float32Array] {
  const n = Math.floor(sec * sr), fade = Math.floor(0.5 * sr), total = n + fade;
  const L = new Float32Array(total), R = new Float32Array(total), rand = rng(seed);
  const smooth = 1 - Math.exp(-1 / (0.02 * sr));
  for (let v = 0; v < 40; v++) {
    const p = rand(), gl = Math.cos((p * Math.PI) / 2), gr = Math.sin((p * Math.PI) / 2);
    const b1 = new Biquad(), b2 = new Biquad();
    let f1 = 300 + 600 * rand(), f2 = 1000 + 1600 * rand(), t1 = f1, t2 = f2, g = 0, tg = 0, next = 0;
    for (let j = 0; j < total; j++) {
      if (j >= next) {
        next = j + Math.floor((0.15 + 0.2 * rand()) * sr);
        t1 = 300 + 600 * rand(); t2 = 1000 + 1600 * rand();
        tg = rand() < 0.25 ? 0 : 0.2 + 0.8 * rand();
      }
      if (j % 64 === 0) {
        f1 += (t1 - f1) * 0.08; f2 += (t2 - f2) * 0.08;
        b1.bandpass(f1, 6, sr); b2.bandpass(f2, 6, sr);
      }
      g += (tg - g) * smooth;
      const x = rand() * 2 - 1, y = (b1.run(x) + b2.run(x)) * g;
      L[j] += y * gl; R[j] += y * gr;
    }
  }
  const a = Math.exp((-2 * Math.PI * 3000) / sr);
  let yl = 0, yr = 0;
  for (let j = 0; j < total; j++) { yl = (1 - a) * L[j] + a * yl; yr = (1 - a) * R[j] + a * yr; L[j] = yl; R[j] = yr; }
  // the tail past n fades out over the head, so sample n-1 runs into sample 0 without a click
  for (let j = 0; j < fade; j++) { const w = j / fade; L[j] = L[j] * w + L[n + j] * (1 - w); R[j] = R[j] * w + R[n + j] * (1 - w); }
  const l = L.slice(0, n), r = R.slice(0, n);
  normalize(l, r, 0.9);
  return [l, r];
}

// a cheer: the babble louder plus "woo" voices gliding up then down, and some breath
export function cheerSamples(sr: number, sec: number, seed: number): [Float32Array, Float32Array] {
  const [l, r] = babbleSamples(sr, sec, seed), n = l.length, rand = rng(seed + 1);
  for (let j = 0; j < n; j++) { l[j] *= 0.6; r[j] *= 0.6; }
  for (let v = 0; v < 25; v++) {
    const f0 = 220 + 300 * rand(), vr = 5 + 2 * rand(), start = Math.floor(0.4 * rand() * sr);
    const life = Math.min((1.2 + (sec - 1.2) * rand()) * sr, n - start);
    const p = rand(), gl = Math.cos((p * Math.PI) / 2) * 0.5, gr = Math.sin((p * Math.PI) / 2) * 0.5;
    const formant = new Biquad(), body = new Biquad();
    body.bandpass(900, 2, sr);
    let phase = 0;
    for (let k = 0; k < life; k++) {
      const q = k / life, t = k / sr;
      const f = f0 * (q < 0.4 ? 1 + 0.3 * (q / 0.4) : 1.3 - 0.5 * ((q - 0.4) / 0.6)) * (1 + 0.015 * Math.sin(2 * Math.PI * vr * t));
      if (k % 64 === 0) formant.bandpass(2.2 * f, 3, sr);
      phase += f / sr; if (phase >= 1) phase -= 1;
      const saw = 2 * phase - 1, env = Math.min(1, t / 0.15) * (q > 0.6 ? (1 - q) / 0.4 : 1);
      const y = (formant.run(saw) + body.run(saw)) * env;
      l[start + k] += y * gl; r[start + k] += y * gr;
    }
  }
  const breath = new Biquad();
  breath.bandpass(2500, 1, sr);
  for (let j = 0; j < n; j++) {
    const t = j / sr, y = breath.run(rand() * 2 - 1) * 0.15;
    const swell = Math.min(1, t / 0.4) * (t > sec / 2 ? (sec - t) / (sec / 2) : 1);
    l[j] = (l[j] + y) * swell; r[j] = (r[j] + y) * swell;
  }
  normalize(l, r, 0.9);
  return [l, r];
}

export function synthTest(): void {
  const sr = 8000, [l, r] = babbleSamples(sr, 1, 3);
  if (l.length !== sr || r.length !== sr) throw new Error("babble length");
  let diff = 0, peak = 0;
  for (let i = 0; i < l.length; i++) { diff += Math.abs(l[i] - r[i]); peak = Math.max(peak, Math.abs(l[i])); }
  if (!(diff > 1)) throw new Error("babble keeps stereo");
  if (!(peak <= 0.9 + 1e-6 && peak > 0.3)) throw new Error("babble normalised");
  // the loop point is no louder a step than the signal's usual step
  let step = 0;
  for (let i = 1; i < l.length; i++) step += Math.abs(l[i] - l[i - 1]);
  if (Math.abs(l[0] - l[l.length - 1]) > 8 * (step / l.length)) throw new Error("babble loop clicks");
  const [cl] = clapSamples(sr, 11);
  let first = -1;
  for (let i = 0; i < cl.length; i++) if (Math.abs(cl[i]) > 0.05) { first = i; break; }
  if (first < 0 || first / sr > 0.03) throw new Error("clap starts early");
  const [ch] = cheerSamples(sr, 2, 21);
  if (ch.length !== 2 * sr || !ch.every(Number.isFinite)) throw new Error("cheer");
}

// ---- the player, one per deck
export type CrowdOpts = { venue: VenueId; claps: boolean; cheers: boolean; sing: boolean };
export const CROWD_DEFAULTS: CrowdOpts = { venue: "salle", claps: true, cheers: true, sing: true };

export class VirtualCrowd {
  level = 0;
  opts: CrowdOpts = { ...CROWD_DEFAULTS };
  private ctx: AudioContext;
  private out: GainNode;
  private venueIn: GainNode;
  private lowpass: BiquadFilterNode;
  private room: ConvolverNode;
  private dry: GainNode;
  private wet: GainNode;
  private bedGain: GainNode;
  private singIn: GainNode;
  private singGain: GainNode;
  private beds: AudioBufferSourceNode[] = [];
  private kit: CrowdKit | null = null;
  private kitFor: VenueId | null = null;
  private bedBuf: AudioBuffer | null = null; // synthesized fallback when the recordings cannot load
  private clapBufs: AudioBuffer[] = [];
  private cheerBuf: AudioBuffer | null = null;
  private singSrc: AudioNode | null = null;
  private singStem = -1;
  private lastTo: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private lfos: OscillatorNode[] = [];
  private lfoOn = false;

  constructor(private deck: Deck) {
    const ctx = (this.ctx = deck.ctx);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(deck.crowdInput());
    // the venue: distance (low-pass) then dry + room
    this.venueIn = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.room = ctx.createConvolver();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.venueIn.connect(this.lowpass);
    this.lowpass.connect(this.dry).connect(this.out);
    this.lowpass.connect(this.room).connect(this.wet).connect(this.out);
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    this.bedGain.connect(this.venueIn);
    // sing-along: three slowly wandering copies of the voice, band-limited and thrown into a big room
    this.singIn = ctx.createGain();
    this.singGain = ctx.createGain();
    this.singGain.gain.value = 0;
    const hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), room = ctx.createConvolver();
    hp.type = "highpass"; hp.frequency.value = 250;
    lp.type = "lowpass"; lp.frequency.value = 2600;
    room.buffer = makeReverbImpulse(ctx, 3.2);
    [0.021, 0.034, 0.047].forEach((d, i) => {
      const delay = ctx.createDelay(0.1), lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
      delay.delayTime.value = d;
      lfo.frequency.value = [0.31, 0.47, 0.63][i];
      depth.gain.value = 0.003;
      g.gain.value = 0.33;
      lfo.connect(depth).connect(delay.delayTime);
      this.singIn.connect(delay).connect(g).connect(hp);
      this.lfos.push(lfo);
    });
    hp.connect(lp).connect(room).connect(this.singGain).connect(this.out);
    this.applyVenue();
  }

  private toBuffer([l, r]: [Float32Array, Float32Array]): AudioBuffer {
    const b = this.ctx.createBuffer(2, l.length, this.ctx.sampleRate);
    b.getChannelData(0).set(l); b.getChannelData(1).set(r);
    return b;
  }

  private buildSynth(): void {
    const sr = this.ctx.sampleRate;
    if (!this.bedBuf) this.bedBuf = this.toBuffer(babbleSamples(sr, 8, 7));
    if (!this.clapBufs.length) this.clapBufs = [11, 12, 13].map((s) => this.toBuffer(clapSamples(sr, s)));
    if (!this.cheerBuf) this.cheerBuf = this.toBuffer(cheerSamples(sr, 4, 21));
  }

  private applyVenue(): void {
    const v = VENUES[this.opts.venue], t = this.ctx.currentTime;
    this.room.buffer = makeReverbImpulse(this.ctx, v.room);
    this.lowpass.frequency.setTargetAtTime(v.lowpass, t, 0.05);
    this.dry.gain.setTargetAtTime(1 - 0.5 * v.wet, t, 0.05);
    this.wet.gain.setTargetAtTime(v.wet * 1.5, t, 0.05);
  }

  // the recordings of the venue, loaded once; the bed restarts on them when they arrive
  private ensureKit(): void {
    const v = this.opts.venue;
    if (this.kitFor === v) return;
    this.kitFor = v;
    void loadCrowdKit(this.ctx, v).then((kit) => {
      if (this.opts.venue !== v) return;
      this.kit = kit;
      if (!kit) this.buildSynth();
      if (this.level > 0) this.startBed();
    });
  }

  // several copies of the crowd spread across the stereo field, slightly detuned so they never line up
  private startBed(): void {
    this.stopBed();
    const v = VENUES[this.opts.venue];
    const list = this.kit ? this.kit.beds : this.bedBuf ? [this.bedBuf] : [];
    if (!list.length) return;
    const n = this.kit ? v.layers : 1;
    for (let k = 0; k < n; k++) {
      const buf = list[k % list.length], src = this.ctx.createBufferSource(), pan = this.ctx.createStereoPanner(), g = this.ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 1 + (k % 2 ? 1 : -1) * 0.025 * Math.ceil(k / 2);
      pan.pan.value = n === 1 ? 0 : -0.7 + (1.4 * k) / (n - 1);
      g.gain.value = 1 / Math.sqrt(n);
      src.connect(g).connect(pan).connect(this.bedGain);
      src.start(this.ctx.currentTime, Math.random() * buf.duration);
      this.beds.push(src);
    }
  }

  private stopBed(): void {
    for (const b of this.beds) { try { b.stop(); } catch { /* not started */ } b.disconnect(); }
    this.beds = [];
  }

  // follows the vocal stem: connected before its fader, re-plugged when the stems change
  private plugVoice(): void {
    const i = this.deck.stemsActive && this.deck.stemReady ? this.deck.stemIndex("vocals") : -1;
    if (i === this.singStem && (i < 0 || this.singSrc)) return;
    if (this.singSrc) { try { this.singSrc.disconnect(this.singIn); } catch { /* already gone */ } }
    this.singSrc = i >= 0 ? this.deck.stemPreTap(i) : null;
    this.singSrc?.connect(this.singIn);
    this.singStem = i;
  }

  setLevel(k: number): void {
    k = Math.min(1, Math.max(0, k));
    const was = this.level;
    this.level = k;
    this.out.gain.setTargetAtTime(k * 0.28, this.ctx.currentTime, 0.1); // at 100 % about 10 dB under the music
    if (k > 0 && was === 0) {
      if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
      if (!this.lfoOn) { this.lfos.forEach((o) => o.start()); this.lfoOn = true; }
      this.ensureKit();
      if (!this.beds.length) this.startBed();
      this.setOpts({});
      if (!this.timer) this.timer = setInterval(() => this.tick(), 30);
    } else if (k === 0 && was > 0) {
      this.stopTimer = setTimeout(() => this.halt(), 600);
    }
  }

  private halt(): void {
    this.stopTimer = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.stopBed();
    if (this.singSrc) { try { this.singSrc.disconnect(this.singIn); } catch { /* already gone */ } }
    this.singSrc = null;
    this.singStem = -1;
    this.lastTo = null;
  }

  setOpts(p: Partial<CrowdOpts>): void {
    const venue = this.opts.venue;
    this.opts = { ...this.opts, ...p };
    this.singGain.gain.setTargetAtTime(this.opts.sing && this.level > 0 ? 8 : 0, this.ctx.currentTime, 0.1);
    if (this.opts.venue !== venue) {
      this.applyVenue();
      if (this.level > 0) this.ensureKit();
    }
  }

  private play(buf: AudioBuffer, at: number, gain: number, rate = 1, offset = 0, len?: number, fadeIn = 0.004): void {
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + fadeIn);
    if (len) g.gain.setTargetAtTime(0, at + fadeIn, len / 4);
    src.connect(g).connect(this.venueIn);
    src.start(at, offset, len);
  }

  // a crowd clap in time: a short cut of a real applause (many hands at once), else the synthesized clap
  private clap(at: number, v: number): void {
    const a = this.kit?.applause, rate = 0.97 + 0.06 * Math.random();
    if (a) this.play(a, at, v * 2.4, rate, Math.random() * (a.duration - 0.4), 0.22, 0.003);
    else if (this.clapBufs.length) this.play(this.clapBufs[Math.floor(Math.random() * this.clapBufs.length)], at, v * 0.7, rate);
  }

  // a real shout with an applause swelling under it
  private shout(at: number, v: number): void {
    const k = this.kit;
    if (k?.cheers.length) {
      this.play(k.cheers[Math.floor(Math.random() * k.cheers.length)], at, v * 1.2, 0.97 + 0.06 * Math.random());
      this.play(k.applause, at, v * 0.8, 1, Math.random() * (k.applause.duration - 5), 4, 0.4);
    } else if (this.cheerBuf) this.play(this.cheerBuf, at, v);
  }

  // one cheer now (the button)
  cheer(): void {
    if (this.level > 0) this.shout(this.ctx.currentTime, 0.9);
  }

  private tick(): void {
    const d = this.deck, now = this.ctx.currentTime;
    this.plugVoice();
    if (!d.playing) {
      this.lastTo = null;
      this.bedGain.gain.setTargetAtTime(0.15 * bedLevel(d.stemMap, d.position()), now, 0.5);
      return;
    }
    const pos = d.position(), rate = Math.max(0.25, d.playbackRate);
    const to = pos + 0.15 * rate;
    const from = this.lastTo === null || this.lastTo < pos - 0.3 || this.lastTo > to ? pos : this.lastTo;
    this.lastTo = to;
    this.bedGain.gain.setTargetAtTime(bedLevel(d.stemMap, pos), now, 0.5);
    for (const e of crowdEvents(d.stemMap, d.bpm, d.beatGridOffset, from, to)) {
      const at = now + Math.max(0, (e.t - pos) / rate);
      if (e.kind === "clap") { if (this.opts.claps) this.clap(at, e.v); }
      else if (this.opts.cheers) this.shout(at, e.v);
    }
  }

  dispose(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.halt();
    this.out.disconnect();
  }
}

// ---- real crowds: CC0 recordings from BigSoundBank (Joseph Sardin), one set per venue
export type VenueId = "club" | "salle" | "stade" | "plein";
export type Venue = { label: string; hint: string; beds: string[]; layers: number; applause: string; cheers: string[]; room: number; wet: number; lowpass: number };
export const VENUES: Record<VenueId, Venue> = {
  club: {
    label: "CLUB",
    hint: "Petite salle, 200 personnes tout près",
    beds: ["3515"],
    layers: 1,
    applause: "0019",
    cheers: ["0236", "0237", "2481", "2483"],
    room: 1.0,
    wet: 0.15,
    lowpass: 12000
  },
  salle: {
    label: "SALLE",
    hint: "Salle de concert, 2 000 personnes",
    beds: ["3516", "0642"],
    layers: 2,
    applause: "0020",
    cheers: ["2480", "2484", "2485", "2487"],
    room: 2.4,
    wet: 0.35,
    lowpass: 9000
  },
  stade: {
    label: "STADE",
    hint: "Stade, 30 000 personnes, immense et lointain",
    beds: ["3515", "3516", "0642", "0825"],
    layers: 4,
    applause: "0021",
    cheers: ["2480", "2484", "2485", "2487", "0236", "0237"],
    room: 4.5,
    wet: 0.55,
    lowpass: 5000
  },
  plein: {
    label: "PLEIN AIR",
    hint: "Festival en plein air, presque sans écho",
    beds: ["3516", "0825"],
    layers: 3,
    applause: "0021",
    cheers: ["2480", "2484", "2487", "0236"],
    room: 0.6,
    wet: 0.08,
    lowpass: 7000
  }
};

export const VENUE_IDS = Object.keys(VENUES) as VenueId[];

export function loopArray(x: Float32Array, s: number, e: number, f: number): Float32Array {
  e = Math.min(e, x.length);
  const L = e - s - f;
  if (L <= f) return x.slice(s, e);
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    if (i < f) {
      out[i] = x[s + i] * Math.sqrt(i / f) + x[s + L + i] * Math.sqrt(1 - i / f);
    } else {
      out[i] = x[s + i];
    }
  }
  return out;
}

export function normalizeRms(chs: Float32Array[], targetDb: number): void {
  let sumSq = 0;
  for (const ch of chs) {
    for (let i = 0; i < ch.length; i++) {
      sumSq += ch[i] * ch[i];
    }
  }
  const rms = Math.sqrt(sumSq / (chs.length * chs[0].length));
  if (rms < 1e-6) return;
  const gain = Math.pow(10, targetDb / 20) / rms;
  for (const ch of chs) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] *= gain;
    }
  }
}

const clipCache = new Map<string, Promise<AudioBuffer | null>>();

export function loadClip(ctx: BaseAudioContext, id: string, loop?: [number, number]): Promise<AudioBuffer | null> {
  const key = id + (loop ? ":loop" : "");
  if (clipCache.has(key)) return clipCache.get(key)!;
  const promise = (async () => {
    try {
      const response = await fetch(`/api/crowd?id=${id}`);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const chs: Float32Array[] = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i));
      if (loop) {
        const [startSec, endSecFromEnd] = loop;
        const sr = audioBuffer.sampleRate;
        const s = Math.round(startSec * sr);
        const e = audioBuffer.length - Math.round(endSecFromEnd * sr);
        const f = Math.round(0.5 * sr);
        for (let i = 0; i < chs.length; i++) {
          chs[i] = loopArray(chs[i], s, e, f);
        }
      }
      normalizeRms(chs, -20);
      const newBuffer = ctx.createBuffer(audioBuffer.numberOfChannels, chs[0].length, audioBuffer.sampleRate);
      for (let i = 0; i < chs.length; i++) {
        newBuffer.getChannelData(i).set(chs[i]);
      }
      return newBuffer;
    } catch {
      return null;
    }
  })();
  clipCache.set(key, promise);
  promise.then(result => {
    if (result === null) clipCache.delete(key);
  });
  return promise;
}

export type CrowdKit = { beds: AudioBuffer[]; applause: AudioBuffer; cheers: AudioBuffer[] };

export async function loadCrowdKit(ctx: BaseAudioContext, v: VenueId): Promise<CrowdKit | null> {
  const venue = VENUES[v];
  const [beds, [applause], cheers] = await Promise.all([
    Promise.all(venue.beds.map(id => loadClip(ctx, id, [2, 2]))),
    Promise.all([loadClip(ctx, venue.applause, [3, 3])]),
    Promise.all(venue.cheers.map(id => loadClip(ctx, id))),
  ]);
  if (beds.every(bed => bed === null) || applause === null) return null;
  return {
    beds: beds.filter(bed => bed !== null) as AudioBuffer[],
    applause,
    cheers: cheers.filter(cheer => cheer !== null) as AudioBuffer[]
  };
}

export function kitTest(): void {
  const x = new Float32Array(1000);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.05);
  const y = loopArray(x, 100, 900, 100);
  if (y.length !== 700) throw new Error("loop length");
  if (Math.abs(y[0] - x[800]) > 1e-6 || Math.abs(y[699] - x[799]) > 1e-6) throw new Error("loop seam");
  const a = [new Float32Array([0.5, -0.5, 0.5, -0.5])];
  normalizeRms(a, -20);
  if (Math.abs(Math.abs(a[0][0]) - 0.1) > 1e-6) throw new Error("rms");
  for (const v of VENUE_IDS.map((k) => VENUES[k])) if (v.layers < 1 || !v.beds.length || !v.cheers.length || v.wet < 0 || v.wet > 1) throw new Error("venue");
}
