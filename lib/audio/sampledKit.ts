// A real drum machine kit, played hit by hit (MaRuche/Falken)
import { CORE_PARTS, drumKit, type DrumPart } from "@/lib/drumKits";
import { leadingSilence } from "./jamPrecision";

export class SampledKit {
  readonly out: GainNode;
  current: string | null = null;
  failed = false;
  private buffers: Partial<Record<DrumPart, AudioBuffer>> = {};
  private openHat: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(ctx: BaseAudioContext) {
    this.out = new GainNode(ctx, { gain: 0.9 });
  }

  async load(id: string): Promise<boolean> {
    if (id === this.current) return this.ready();

    const kit = drumKit(id);
    if (!kit) {
      this.failed = true;
      return false;
    }

    this.current = id;
    this.failed = false;
    this.buffers = {};

    const parts = Object.keys(kit.parts) as DrumPart[];
    const promises = parts.map(async (part) => {
      try {
        const response = await fetch(`/api/drums/${id}/${part}.ogg`);
        if (!response.ok) return;

        const arrayBuffer = await response.arrayBuffer();
        let audioBuffer = await this.out.context.decodeAudioData(arrayBuffer);

        if (this.current === id) {
          this.normalizeBuffer(audioBuffer);
          const chans = Array.from({ length: audioBuffer.numberOfChannels }, (_, c) => audioBuffer.getChannelData(c));
          const n = leadingSilence(chans, audioBuffer.sampleRate);
          if (n > 0) {
            const newBuf = this.out.context.createBuffer(audioBuffer.numberOfChannels, audioBuffer.length - n, audioBuffer.sampleRate);
            for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
              const oldCh = audioBuffer.getChannelData(c);
              const newCh = newBuf.getChannelData(c);
              newCh.set(oldCh.subarray(n));
            }
            audioBuffer = newBuf;
          }
          this.buffers[part] = audioBuffer;
        }
      } catch {
        // Silently skip failing parts
      }
    });

    await Promise.all(promises);
    this.failed = !this.ready();
    return this.ready();
  }

  private normalizeBuffer(buffer: AudioBuffer): void {
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
    }

    if (peak < 1e-6) return;

    const gain = 0.89 / peak;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }
  }

  ready(): boolean {
    if (!this.current) return false;
    return CORE_PARTS.every(part => this.buffers[part] !== undefined);
  }

  has(part: DrumPart): boolean {
    return this.buffers[part] !== undefined;
  }

  play(part: DrumPart, when: number, vel: number): void {
    if (!this.ready() || !this.has(part)) return;

    const ctx = this.out.context;
    when = Math.max(when, ctx.currentTime);
    const buffer = this.buffers[part];
    if (!buffer) return;

    const source = new AudioBufferSourceNode(ctx, { buffer });
    const gainNode = new GainNode(ctx, { gain: vel });

    source.connect(gainNode).connect(this.out);
    source.start(when);

    if (part === "hat") {
      if (this.openHat) {
        const fadeOutTime = 0.01;
        const fadeOutEnd = when + fadeOutTime;

        this.openHat.gain.gain.setValueAtTime(this.openHat.gain.gain.value, when);
        this.openHat.gain.gain.linearRampToValueAtTime(0, fadeOutEnd);
        this.openHat.src.stop(fadeOutEnd + 0.01);
        this.openHat = null;
      }
    } else if (part === "open") {
      this.openHat = { src: source, gain: gainNode };
    }
  }
}
