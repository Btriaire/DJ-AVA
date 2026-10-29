// A real instrument played from per-note samples (MaRuche/Falken)
import { instrument, nearestZone, noteName, zonesFor } from "@/lib/sampleFont";

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
          const audioBuf = await this.ctx.decodeAudioData(buf);
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

  note(midi: number, when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad"): void {
    if (!this.ready()) return;
    this.ends = this.ends.filter(e => e > this.ctx.currentTime);
    if (this.ends.length >= 24) return;

    when = Math.max(when, this.ctx.currentTime);

    const zones = Array.from(this.buffers.keys());
    const { zone, rate } = nearestZone(midi, zones);
    const buffer = this.buffers.get(zone);
    if (!buffer) return;

    const source = new AudioBufferSourceNode(this.ctx, { buffer, playbackRate: rate });
    const filter = new BiquadFilterNode(this.ctx, {
      type: "lowpass",
      frequency: 1500 + vel * 9000,
    });
    const env = new GainNode(this.ctx);

    source.connect(filter).connect(env).connect(this.out);

    const attack = kind === "pad" ? 0.12 : 0.003;
    const release = kind === "pad" ? 0.6 : 0.25;
    const d = kind === "stab" ? Math.min(dur, 0.25) : dur;
    const end = when + d;
    const bufferEndAt = when + buffer.duration / rate;
    const releaseStart = Math.max(when + attack + 0.01, Math.min(end, bufferEndAt - 0.05));

    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(vel * 0.9, when + attack);
    env.gain.setValueAtTime(vel * 0.9, releaseStart);
    env.gain.linearRampToValueAtTime(0, releaseStart + release);

    source.start(when);
    source.stop(releaseStart + release + 0.02);

    this.ends.push(releaseStart + release);
  }

  chord(midis: number[], when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad", strum = 0): void {
    midis.forEach((midi, i) => this.note(midi, when + i * strum, dur, vel, kind));
  }
}
