import { applyStemFilter, driveCurve, makeReverbImpulse } from "@/lib/audio/Deck";
import * as ed from "./edit";
import { DEFAULT_CTL, type Region, type Stem, type StemCtl } from "./types";

type Bus = {
  bus: GainNode;
  revIn: ConvolverNode;
  dly: DelayNode;
  nodes: AudioNode[];
};

function buildBus(ctx: BaseAudioContext, dest: AudioNode, bpm: number): Bus {
  const bus = ctx.createGain();
  const revIn = ctx.createConvolver();
  const dly = ctx.createDelay(1.5);
  const revGain = ctx.createGain();
  const dlyGain = ctx.createGain();
  const dlyFb = ctx.createGain();

  revIn.buffer = makeReverbImpulse(ctx, 2.4);
  revGain.gain.value = 1.3;
  dly.delayTime.value = bpm > 0 ? Math.min(1.4, 0.75 * 60 / bpm) : 0.375;
  dlyFb.gain.value = 0.35;

  revIn.connect(revGain);
  revGain.connect(bus);
  dly.connect(dlyGain);
  dlyGain.connect(bus);
  dly.connect(dlyFb);
  dlyFb.connect(dly);

  bus.connect(dest);

  return {
    bus,
    revIn,
    dly,
    nodes: [bus, revIn, dly, revGain, dlyGain, dlyFb],
  };
}

type Chain = {
  input: GainNode;
  sub: GainNode;
  filter: BiquadFilterNode;
  drive: WaveShaperNode;
  pan: StereoPannerNode;
  rev: GainNode;
  dly: GainNode;
};

function buildChain(ctx: BaseAudioContext, b: Bus): Chain {
  const input = ctx.createGain();
  const sub = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const drive = ctx.createWaveShaper();
  const pan = ctx.createStereoPanner();
  const rev = ctx.createGain();
  const dly = ctx.createGain();

  filter.type = "allpass";
  drive.oversample = "2x";

  sub.connect(input);
  input.connect(filter);
  filter.connect(drive);
  drive.connect(pan);
  pan.connect(b.bus);
  pan.connect(rev);
  rev.connect(b.revIn);
  pan.connect(dly);
  dly.connect(b.dly);

  return { input, sub, filter, drive, pan, rev, dly };
}

function applyCtl(ch: Chain, c: StemCtl, audible: boolean, now: number | null) {
  const vol = audible ? c.vol : 0;
  if (now !== null) {
    ch.input.gain.setTargetAtTime(vol, now, 0.015);
  } else {
    ch.input.gain.value = vol;
  }
  applyStemFilter(ch.filter, c.filter);
  ch.drive.curve = driveCurve(c.drive);
  ch.pan.pan.value = c.pan;
  ch.rev.gain.value = c.rev;
  ch.dly.gain.value = c.dly;
  ch.sub.gain.value = c.sub;
}

function startClip(
  ctx: BaseAudioContext,
  dest: AudioNode,
  buf: AudioBuffer,
  at: number,
  loop: boolean,
  T0: number,
  T1: number,
  when: number
): AudioBufferSourceNode | null {
  const src = ctx.createBufferSource();
  src.buffer = buf;

  if (loop) {
    const len = buf.duration;
    if (len < 0.005) return null;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = len;
    const off = (((T0 - at) % len) + len) % len;
    src.start(when, off);
    src.stop(when + (T1 - T0));
  } else {
    const x = Math.max(T0, at);
    const y = Math.min(T1, at + buf.duration);
    if (y - x <= 0.001) return null;
    src.start(when + (x - T0), x - at, y - x);
  }

  src.connect(dest);
  return src;
}

function clipKey(ctl: StemCtl): string {
  return JSON.stringify([
    ctl.part?.a ?? null,
    ctl.part?.b ?? null,
    ctl.part?.loop ?? false,
    ctl.reverse,
    ctl.pitch,
  ]);
}

export class StemMixer {
  private ctx: AudioContext;
  private dest: AudioNode;
  private bus: Bus | null = null;
  private chains: Chain[] = [];
  private stems: Stem[] = [];
  private ctls: StemCtl[] = [];
  private clips: (AudioBuffer | null)[] = [];
  private subs: (AudioBuffer | null)[] = [];
  private clipKeys: string[] = [];
  private subKeys: string[] = [];
  private jobs: number[] = [];
  private pending = 0;
  private bpm = 0;
  private region: Region | null = null;
  private range: Region = { a: 0, b: 0 }; // effective play region (the whole timeline when region is null)
  private loopOn = false;
  private only: number | null = null;
  private passes: { T0: number; T1: number; when: number }[] = [];
  private timer: number | null = null;
  private sources: Set<AudioBufferSourceNode> = new Set();

  onChange: (() => void) | null = null;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  load(stems: Stem[], ctls: StemCtl[], bpm: number) {
    this.stop();
    this.stems = stems;
    this.ctls = stems.map((_, i) => ctls[i] ?? DEFAULT_CTL);
    this.clips = stems.map(s => s.buf);
    this.subs = new Array(stems.length).fill(null);
    this.clipKeys = stems.map(() => clipKey(DEFAULT_CTL));
    this.subKeys = new Array(stems.length).fill("");
    this.jobs = new Array(stems.length).fill(0);
    this.pending = 0;
    this.bpm = bpm;

    if (this.bus) {
      this.bus.nodes.forEach(n => n.disconnect());
    }
    this.bus = buildBus(this.ctx, this.dest, bpm);

    this.chains.forEach(ch => {
      Object.values(ch).forEach(n => n.disconnect());
    });
    this.chains = stems.map(() => buildChain(this.ctx, this.bus!));

    this.ctls.forEach((ctl, i) => {
      this.applyCtl(i, ctl);
      void this.refresh(i).catch(() => {});
    });
  }

  setCtl(i: number, ctl: StemCtl) {
    this.ctls[i] = ctl;
    this.applyLevels();
    this.applyCtl(i, ctl);
    void this.refresh(i).catch(() => {});
  }

  private applyCtl(i: number, ctl: StemCtl) {
    const audible = this.isAudible(i);
    const now = this.playing ? this.ctx.currentTime : null;
    applyCtl(this.chains[i], ctl, audible, now);
  }

  private isAudible(i: number): boolean {
    if (this.only !== null) return i === this.only;
    const ctl = this.ctls[i];
    if (ctl.mute) return false;
    return !this.ctls.some(c => c.solo) || ctl.solo;
  }

  private applyLevels() {
    this.ctls.forEach((ctl, i) => this.applyCtl(i, ctl));
  }

  play(from: number, region: Region | null, loop: boolean, only: number | null = null) {
    const dur = this.duration;
    if (dur <= 0) return;
    this.stop();
    this.region = region;
    this.loopOn = loop;
    this.only = only;
    this.applyLevels();

    const r = region ?? { a: 0, b: dur };
    this.range = r;
    const T0 = from >= r.a && from < r.b - 0.01 ? from : r.a;
    const when = this.ctx.currentTime + 0.03;

    this.schedulePass(T0, r.b, when);
    this.scheduleNextPass(r.b, when + (r.b - T0));
  }

  private schedulePass(T0: number, T1: number, when: number) {
    this.passes.push({ T0, T1, when });
    if (this.passes.length > 2) this.passes.shift();

    this.ctls.forEach((ctl, i) => {
      const clip = this.clips[i];
      if (!clip) return;

      const at = ctl.part?.a ?? 0;
      const loop = ctl.part?.loop ?? false;
      const src = startClip(
        this.ctx,
        this.chains[i].input,
        clip,
        at,
        loop,
        T0,
        T1,
        when
      );
      if (src) {
        this.sources.add(src);
        src.onended = () => {
          src.disconnect();
          this.sources.delete(src);
        };
      }

      if (ctl.sub > 0 && this.subs[i]) {
        const subSrc = startClip(
          this.ctx,
          this.chains[i].sub,
          this.subs[i]!,
          at,
          loop,
          T0,
          T1,
          when
        );
        if (subSrc) {
          this.sources.add(subSrc);
          subSrc.onended = () => {
            subSrc.disconnect();
            this.sources.delete(subSrc);
          };
        }
      }
    });
  }

  private scheduleNextPass(T1: number, when: number) {
    if (this.timer) clearTimeout(this.timer);

    if (this.loopOn) {
      const { a, b } = this.range;
      this.timer = window.setTimeout(() => {
        this.schedulePass(a, b, when);
        this.scheduleNextPass(b, when + (b - a));
      }, (when - this.ctx.currentTime - 0.2) * 1000);
    } else {
      this.timer = window.setTimeout(() => {
        this.stop();
        this.onChange?.();
      }, (when - this.ctx.currentTime + 0.01) * 1000);
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.sources.forEach(src => {
      try { src.stop(); } catch {}
      src.disconnect();
    });
    this.sources.clear();
    this.passes = [];
    this.region = null;
    this.loopOn = false;
    this.only = null;
    this.applyLevels();
  }

  get playing(): boolean {
    return this.passes.length > 0;
  }

  position(): number | null {
    if (!this.playing) return null;
    const now = this.ctx.currentTime;
    const last = this.passes.findLast(p => p.when <= now);
    if (!last) return this.passes[0].T0;
    return Math.min(last.T1, last.T0 + (now - last.when));
  }

  get duration(): number {
    return Math.max(...this.stems.map(s => s.buf.duration), 0);
  }

  get busy(): boolean {
    return this.pending > 0;
  }

  get looping(): boolean {
    return this.loopOn;
  }

  private resync() {
    if (!this.playing) return;
    const pos = this.position() ?? 0;
    this.play(pos, this.region, this.loopOn, this.only);
  }

  private async refresh(i: number) {
    const ctl = this.ctls[i];
    const key = clipKey(ctl);

    if (key !== this.clipKeys[i]) {
      await this.computeClip(i, ctl);
      if (ctl.sub > 0) {
        await this.computeSub(i, ctl);
      }
    } else if (ctl.sub > 0 && this.subKeys[i] !== key) {
      await this.computeSub(i, ctl);
    }
  }

  private async computeClip(i: number, ctl: StemCtl) {
    this.pending++;
    this.jobs[i]++;
    const jobId = this.jobs[i];

    try {
      let buf = this.stems[i].buf;
      if (ctl.part) {
        buf = ed.slice(buf, ctl.part);
      }
      if (ctl.reverse) {
        buf = ed.reverse(buf, { a: 0, b: buf.duration });
      }
      if (ctl.pitch !== 0) {
        buf = await ed.pitchKeep(buf, ctl.pitch);
      }
      if (ctl.part) {
        const len = buf.duration;
        const fade = Math.min(0.005, len / 4);
        buf = ed.fade(buf, { a: 0, b: fade }, "in");
        buf = ed.fade(buf, { a: len - fade, b: len }, "out");
      }

      if (this.jobs[i] !== jobId) return;
      this.clips[i] = buf;
      this.clipKeys[i] = clipKey(ctl);

      if (this.playing) this.resync();
      this.onChange?.();
    } finally {
      this.pending--;
    }
  }

  private async computeSub(i: number, ctl: StemCtl) {
    this.pending++;
    this.jobs[i]++;
    const jobId = this.jobs[i];

    try {
      const clip = this.clips[i];
      if (!clip) return;

      let buf = await ed.pitchKeep(clip, -12);
      buf = await ed.eq(buf, { low: 3, mid: 0, high: 0, hp: 25, lp: 180 });

      if (this.jobs[i] !== jobId) return;
      this.subs[i] = buf;
      this.subKeys[i] = clipKey(ctl);

      if (this.playing) this.resync();
      this.onChange?.();
    } finally {
      this.pending--;
    }
  }

  async render(region: Region | null, only: number | null = null): Promise<AudioBuffer> {
    while (this.busy) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (!this.stems.length) throw new Error("Pas de stems");
    const a = region?.a ?? 0;
    const b = region?.b ?? this.duration;
    const len = Math.max(1, Math.ceil((b - a) * this.stems[0].buf.sampleRate));
    const ctx = new OfflineAudioContext(2, len, this.stems[0].buf.sampleRate);

    const bus = buildBus(ctx, ctx.destination, this.bpm);
    const chains = this.stems.map(() => buildChain(ctx, bus));

    const anySolo = this.ctls.some((c) => c.solo);
    this.ctls.forEach((ctl, i) => {
      if (only !== null && i !== only) return;
      applyCtl(chains[i], ctl, only !== null || (!ctl.mute && (!anySolo || ctl.solo)), null);
    });

    await Promise.all(this.stems.map(async (stem, i) => {
      if (only !== null && i !== only) return;

      const ctl = this.ctls[i];
      const clip = this.clips[i];
      if (!clip) return;

      const at = ctl.part?.a ?? 0;
      const loop = ctl.part?.loop ?? false;
      startClip(ctx, chains[i].input, clip, at, loop, a, b, 0);

      if (ctl.sub > 0 && this.subs[i]) {
        startClip(ctx, chains[i].sub, this.subs[i]!, at, loop, a, b, 0);
      }
    }));

    return ctx.startRendering();
  }

  dispose() {
    this.stop();
    if (this.bus) {
      this.bus.nodes.forEach(n => n.disconnect());
    }
    this.chains.forEach(ch => {
      Object.values(ch).forEach(n => n.disconnect());
    });
  }
}
