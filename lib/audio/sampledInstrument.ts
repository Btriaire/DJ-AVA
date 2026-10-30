// A real instrument played from per-note samples, long notes kept alive by crossfaded restarts (MaRuche/Falken)
import { instrument, nearestZone, noteName, zonesFor } from "@/lib/sampleFont";
import { normGain } from "./sampleLevel";
import { leadingSilence } from "./jamPrecision";

export class SampledInstrument {
  readonly out: GainNode;
  current: string | null = null;
  done = 0;
  total = 0;
  failed = false;
  private buffers = new Map<number, AudioBuffer>();
  private ends: number[] = [];

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
          const n = leadingSilence(chans, audioBuf.sampleRate);
          if (n > 0) {
            const newBuf = this.ctx.createBuffer(audioBuf.numberOfChannels, audioBuf.length - n, audioBuf.sampleRate);
            for (let c = 0; c < audioBuf.numberOfChannels; c++) {
              const oldCh = audioBuf.getChannelData(c);
              const newCh = newBuf.getChannelData(c);
              newCh.set(oldCh.subarray(n));
            }
            audioBuf = newBuf;
          }
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

  ready(): boolean {
    return !!this.current && this.buffers.size >= Math.ceil(this.total / 2);
  }

  note(midi: number, when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad", detune = 0): void {
    if (!this.ready()) return;
    this.ends = this.ends.filter(e => e > this.ctx.currentTime);
    if (this.ends.length >= 24) return;

    when = Math.max(when, this.ctx.currentTime);

    const zones = Array.from(this.buffers.keys());
    const { zone, rate } = nearestZone(midi, zones);
    const buffer = this.buffers.get(zone);
    if (!buffer) return;

    const attack = kind === "pad" ? 0.12 : 0.003;
    const release = kind === "pad" ? 0.6 : 0.25;
    const d = kind === "stab" ? Math.min(dur, 0.25) : dur;
    const end = when + d;
    const bufferEndAt = when + buffer.duration / rate;
    const holdEnd = Math.max(when + attack + 0.01, end);

    if (kind === "pad" && holdEnd > bufferEndAt - 0.35) {
      // long sustain: segment 0 from the start with its attack; segment k >= 1 starts at when + k*seg - fade, skips the
      // attack (offset 0.4 s) and fades in while the one before fades out over the same 0.25 s; the last one releases
      const fade = 0.25, seg = buffer.duration / rate - 0.6, starts: number[] = [];
      for (let k = 0; k < 8; k++) { const t = k === 0 ? when : when + k * seg - fade; if (k > 0 && t >= holdEnd) break; starts.push(t); }
      starts.forEach((t, k) => {
        const source = new AudioBufferSourceNode(this.ctx, { buffer, playbackRate: rate });
        source.detune.value = detune;
        const filter = new BiquadFilterNode(this.ctx, { type: "lowpass", frequency: 1500 + vel * 9000 });
        const env = new GainNode(this.ctx);
        source.connect(filter).connect(env).connect(this.out);
        const g = env.gain;
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(vel * 0.9, t + (k === 0 ? attack : fade));
        const next = starts[k + 1];
        if (next !== undefined) {
          g.setValueAtTime(vel * 0.9, next);
          g.linearRampToValueAtTime(0, next + fade);
          source.start(t, k === 0 ? 0 : 0.4);
          source.stop(next + fade + 0.02);
        } else {
          g.setValueAtTime(vel * 0.9, holdEnd);
          g.linearRampToValueAtTime(0, holdEnd + release);
          source.start(t, k === 0 ? 0 : 0.4);
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
        frequency: 1500 + vel * 9000,
      });
      const env = new GainNode(this.ctx);

      source.detune.value = detune;
      source.connect(filter).connect(env).connect(this.out);

      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(vel * 0.9, when + attack);
      env.gain.setValueAtTime(vel * 0.9, releaseStart);
      env.gain.linearRampToValueAtTime(0, releaseStart + release);

      source.start(when);
      source.stop(releaseStart + release + 0.02);

      this.ends.push(releaseStart + release);
    }
  }

  chord(midis: number[], when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad", strum = 0, dir: "down" | "up" = "down"): void {
    const sorted = [...midis].sort((a, b) => dir === "down" ? a - b : b - a);
    sorted.forEach((midi, i) => this.note(midi, when + i * strum, dur, vel, kind));
  }
}
