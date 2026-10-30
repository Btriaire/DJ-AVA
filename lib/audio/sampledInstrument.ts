// A real instrument played from per-note samples, long notes kept alive by crossfaded restarts (MaRuche/Falken)
import { instrument, nearestZone, noteName, zonesFor } from "@/lib/sampleFont";
import { normGain } from "./sampleLevel";
import { leadingSilence } from "./jamPrecision";
import { parseWebSfz, pickRegion, regionRate, type SfzRegion } from "@/lib/websfz";

export class SampledInstrument {
  readonly out: GainNode;
  current: string | null = null;
  done = 0;
  total = 0;
  failed = false;
  private buffers = new Map<number, AudioBuffer>();
  private ends: number[] = [];
  // a multisampled bank (velocity layers, round robins), when the instrument has one
  private sfz: { playable: SfzRegion[]; files: Map<SfzRegion, string>; buffers: Map<string, AudioBuffer> } | null = null;
  private rr = 0;

  constructor(private ctx: BaseAudioContext) {
    this.out = new GainNode(ctx, { gain: 0.8 });
  }

  async load(id: string): Promise<boolean> {
    if (id === this.current) return this.ready();
    this.current = id;
    this.done = 0;
    this.failed = false;
    this.buffers.clear();

    const inst = instrument(id);
    if (!inst) {
      this.failed = true;
      return false;
    }
    this.sfz = null;
    if (inst.sfz) return this.loadSfz(id, inst.sfz, inst.sfzPath);

    const zones = zonesFor(inst);
    this.total = zones.length;
    const queue = [...zones];

    const worker = async () => {
      while (queue.length && this.current === id) {
        const z = queue.shift()!;
        try {
          const res = await fetch(`/api/samples/${id}/${noteName(z)}.mp3`);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          let audioBuf = await this.ctx.decodeAudioData(buf);
          // the soundfont is recorded about 15 dB low: every sample is brought to the same playing level once, here
          const chans = Array.from({ length: audioBuf.numberOfChannels }, (_, c) => audioBuf.getChannelData(c));
          const g = normGain(chans, audioBuf.sampleRate);
          for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
          audioBuf = this.trim(audioBuf);
          if (this.current === id) {
            this.buffers.set(z, audioBuf);
          }
        } catch {
          // Skip failed loads
        } finally {
          if (this.current === id) this.done++;
        }
      }
    };

    await Promise.all([worker(), worker(), worker(), worker()]);
    this.failed = !this.ready();
    return this.ready();
  }

  // the sample starts on its attack: any silence before it is cut once, here
  private trim(buf: AudioBuffer): AudioBuffer {
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const n = leadingSilence(chans, buf.sampleRate);
    if (n <= 0) return buf;
    const out = this.ctx.createBuffer(buf.numberOfChannels, buf.length - n, buf.sampleRate);
    chans.forEach((ch, c) => out.getChannelData(c).set(ch.subarray(n)));
    return out;
  }

  // a bank from danigb/samples: every region's file loaded once, ONE level for the whole instrument so the
  // velocity layers keep their real dynamics (a soft note stays soft)
  private async loadSfz(id: string, sfz: string, sfzPath: string | undefined): Promise<boolean> {
    this.buffers.clear();
    const res = await fetch(`/api/sfz?p=${encodeURIComponent(sfz)}`).catch(() => null);
    if (!res?.ok) { this.failed = true; return false; }
    const { baseUrl, regions } = parseWebSfz(await res.json());
    const BASE = "https://danigb.github.io/samples/";
    let dir = baseUrl.startsWith(BASE) ? decodeURIComponent(baseUrl.slice(BASE.length)) : sfz.slice(0, sfz.lastIndexOf("/") + 1);
    if (dir && !dir.endsWith("/")) dir += "/";
    const files = new Map(regions.map((r) => [r, `${dir}${sfzPath ?? r.path}${r.sample}.ogg`.replace(/\\/g, "/")] as const));
    const queue = [...new Set(files.values())];
    this.total = queue.length;
    this.done = 0;
    const loaded = new Map<string, AudioBuffer>();
    const worker = async () => {
      while (queue.length && this.current === id) {
        const f = queue.shift()!;
        try {
          const r = await fetch(`/api/sfz?p=${encodeURIComponent(f)}`);
          if (r.ok) loaded.set(f, this.trim(await this.ctx.decodeAudioData(await r.arrayBuffer())));
        } catch {
          // a missing sample: its neighbours cover the note
        } finally {
          if (this.current === id) this.done++;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (this.current !== id) return false;
    // the level is set on each region as it will sound (its own volume included: VCSL lifts quiet takes by up to 40 dB),
    // then lowered if the loud regions would clip on their own at full velocity
    const playable = regions.filter((r) => loaded.has(files.get(r)!));
    const chans = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
    // set on the loudest layer (what a full-velocity note plays), like the soundfont samples; softer layers stay softer
    const top = Math.max(...playable.map((r) => r.hivel));
    const gains = playable.filter((r) => r.hivel === top).map((r) => { const b = loaded.get(files.get(r)!)!; return normGain(chans(b), b.sampleRate, -18, 60) / 10 ** (r.volume / 20); }).sort((x, y) => x - y);
    let g = gains[gains.length >> 1] ?? 1;
    const peakOf = new Map<AudioBuffer, number>();
    for (const b of loaded.values()) { let pk = 0; for (const ch of chans(b)) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > pk) pk = v; } peakOf.set(b, pk); }
    // ponytail: 90th percentile, not the max: one boosted quiet take with a stray click must not turn the whole bank down (the master limiter catches it)
    const peaks = playable.map((r) => peakOf.get(loaded.get(files.get(r)!)!)! * 10 ** (r.volume / 20)).sort((x, y) => x - y);
    const loudest = peaks[Math.floor(peaks.length * 0.9)] ?? 0;
    if (loudest * g * 0.9 > 1) g = 1 / (loudest * 0.9);
    for (const b of loaded.values()) for (const ch of chans(b)) for (let i = 0; i < ch.length; i++) ch[i] *= g;
    this.sfz = { playable, files, buffers: loaded };
    this.failed = !this.ready();
    return this.ready();
  }

  ready(): boolean {
    const n = this.sfz ? this.sfz.buffers.size : this.buffers.size;
    return !!this.current && n > 0 && n >= Math.ceil(this.total / 2);
  }

  note(midi: number, when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad", detune = 0): void {
    if (!this.ready()) return;
    this.ends = this.ends.filter(e => e > this.ctx.currentTime);
    if (this.ends.length >= 24) return;

    when = Math.max(when, this.ctx.currentTime);

    // which sample, how fast, how loud: from the bank (key, velocity layer, round robin) or the nearest soundfont zone
    let buffer: AudioBuffer | undefined, rate: number, peak: number, cutoff: number, offset = 0, release = kind === "pad" ? 0.6 : 0.25;
    if (this.sfz) {
      const r = pickRegion(this.sfz.playable, midi, Math.round(1 + vel * 126), this.rr++);
      if (!r) return;
      buffer = this.sfz.buffers.get(this.sfz.files.get(r)!);
      rate = regionRate(r, midi);
      peak = 0.9 * 10 ** (r.volume / 20) * (0.3 + 0.7 * vel); // the layer already brings the timbre of the velocity
      cutoff = 20000;
      offset = r.offset / (buffer?.sampleRate ?? 44100);
      if (r.release !== null) release = Math.min(3, Math.max(0.05, r.release));
    } else {
      const near = nearestZone(midi, Array.from(this.buffers.keys()));
      buffer = this.buffers.get(near.zone);
      rate = near.rate;
      peak = vel * 0.9;
      cutoff = 1500 + vel * 9000;
    }
    if (!buffer) return;

    const attack = kind === "pad" ? 0.12 : 0.003;
    const d = kind === "stab" ? Math.min(dur, 0.25) : dur;
    const end = when + d;
    const bufferEndAt = when + (buffer.duration - offset) / rate;
    const holdEnd = Math.max(when + attack + 0.01, end);

    if (kind === "pad" && holdEnd > bufferEndAt - 0.35) {
      // long sustain: segment 0 from the start with its attack; segment k >= 1 starts at when + k*seg - fade, skips the
      // attack (offset 0.4 s) and fades in while the one before fades out over the same 0.25 s; the last one releases
      const fade = 0.25, seg = (buffer.duration - offset) / rate - 0.6, starts: number[] = [];
      for (let k = 0; k < 8; k++) { const t = k === 0 ? when : when + k * seg - fade; if (k > 0 && t >= holdEnd) break; starts.push(t); }
      starts.forEach((t, k) => {
        const source = new AudioBufferSourceNode(this.ctx, { buffer, playbackRate: rate });
        source.detune.value = detune;
        const filter = new BiquadFilterNode(this.ctx, { type: "lowpass", frequency: cutoff });
        const env = new GainNode(this.ctx);
        source.connect(filter).connect(env).connect(this.out);
        const g = env.gain;
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(peak, t + (k === 0 ? attack : fade));
        const next = starts[k + 1];
        if (next !== undefined) {
          g.setValueAtTime(peak, next);
          g.linearRampToValueAtTime(0, next + fade);
          source.start(t, k === 0 ? offset : offset + 0.4);
          source.stop(next + fade + 0.02);
        } else {
          g.setValueAtTime(peak, holdEnd);
          g.linearRampToValueAtTime(0, holdEnd + release);
          source.start(t, k === 0 ? offset : offset + 0.4);
          source.stop(holdEnd + release + 0.02);
        }
      });
      this.ends.push(holdEnd + release);
    } else {
      // Original single-source path
      const releaseStart = Math.max(when + attack + 0.01, Math.min(end, bufferEndAt - 0.05));

      const source = new AudioBufferSourceNode(this.ctx, { buffer, playbackRate: rate });
      const filter = new BiquadFilterNode(this.ctx, {
        type: "lowpass",
        frequency: cutoff,
      });
      const env = new GainNode(this.ctx);

      source.detune.value = detune;
      source.connect(filter).connect(env).connect(this.out);

      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(peak, when + attack);
      env.gain.setValueAtTime(peak, releaseStart);
      env.gain.linearRampToValueAtTime(0, releaseStart + release);

      source.start(when, offset);
      source.stop(releaseStart + release + 0.02);

      this.ends.push(releaseStart + release);
    }
  }

  chord(midis: number[], when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad", strum = 0, dir: "down" | "up" = "down"): void {
    const sorted = [...midis].sort((a, b) => dir === "down" ? a - b : b - a);
    sorted.forEach((midi, i) => this.note(midi, when + i * strum, dur, vel, kind));
  }
}
