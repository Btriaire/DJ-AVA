// A real drum kit, played hit by hit: a drum machine (one sample per part) or an acoustic kit (velocity layers and takes) (MaRuche)
import { CORE_PARTS, drumKit, type DrumPart } from "@/lib/drumKits";
import { leadingSilence } from "./jamPrecision";
import { parseWebSfz, pickRegion, type SfzRegion } from "@/lib/websfz";

export class SampledKit {
  readonly out: GainNode;
  current: string | null = null;
  failed = false;
  private buffers: Partial<Record<DrumPart, AudioBuffer>> = {};
  private openHat: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private rr = 0; // round robin: two hits in a row never use the same take

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
    this.sfzParts = {};
    if (kit.sfz) {
      await this.loadSfzKit(id, kit.sfz);
      this.failed = !this.ready();
      return this.ready();
    }

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

  // acoustic kits: each part is a VCSL bank, its velocity layers and takes kept (the regions of the part's key only)
  private sfzParts: Partial<Record<DrumPart, { regions: SfzRegion[]; buffers: Map<SfzRegion, AudioBuffer>; key: number }>> = {};
  private async loadSfzKit(id: string, parts: Partial<Record<DrumPart, { sfz: string; key: number }>>): Promise<void> {
    await Promise.all(Object.entries(parts).map(async ([part, p]) => {
      try {
        const response = await fetch(`/api/sfz?p=${encodeURIComponent(p.sfz)}`);
        if (!response.ok) return;
        const json = await response.json();
        const { baseUrl, regions } = parseWebSfz(json);
        const keptRegions = regions.filter(r => r.lokey <= p.key && p.key <= r.hikey);
        const BASE = "https://danigb.github.io/samples/";
        let dir = baseUrl.startsWith(BASE) ? decodeURIComponent(baseUrl.slice(BASE.length)) : p.sfz.slice(0, p.sfz.lastIndexOf("/") + 1);
        if (dir && !dir.endsWith("/")) dir += "/";
        const buffers = new Map<SfzRegion, AudioBuffer>();
        await Promise.all(keptRegions.map(async r => {
          try {
            const file = (dir + r.path + r.sample + ".ogg").replace(/\\/g, "/");
            const response = await fetch(`/api/sfz?p=${encodeURIComponent(file)}`);
            if (!response.ok) return;
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.out.context.decodeAudioData(arrayBuffer);
            const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i));
            const n = leadingSilence(channels, audioBuffer.sampleRate);
            if (n > 0) {
              const trimmedBuffer = this.out.context.createBuffer(audioBuffer.numberOfChannels, audioBuffer.length - n, audioBuffer.sampleRate);
              for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
                const ch = audioBuffer.getChannelData(c);
                const trimmedCh = trimmedBuffer.getChannelData(c);
                trimmedCh.set(ch.subarray(n));
              }
              buffers.set(r, trimmedBuffer);
            } else {
              buffers.set(r, audioBuffer);
            }
          } catch { /* a missing take: the others cover the hit */ }
        }));
        // the loudest take as it will sound (its region volume included) reaches 0.89 at full velocity
        let peak = 0;
        for (const [r, b] of buffers) {
          const v = 10 ** (r.volume / 20);
          for (let c = 0; c < b.numberOfChannels; c++) {
            const ch = b.getChannelData(c);
            for (let i = 0; i < ch.length; i++) {
              const a = Math.abs(ch[i]) * v;
              if (a > peak) peak = a;
            }
          }
        }
        if (peak > 1e-6) {
          const gain = 0.89 / peak;
          for (const b of buffers.values()) {
            for (let c = 0; c < b.numberOfChannels; c++) {
              const ch = b.getChannelData(c);
              for (let i = 0; i < ch.length; i++) {
                ch[i] *= gain;
              }
            }
          }
        }
        if (this.current === id && buffers.size > 0) {
          this.sfzParts[part as DrumPart] = { regions: keptRegions.filter(r => buffers.has(r)), buffers, key: p.key };
        }
      } catch { /* a part that fails stays silent, the kit keeps playing */ }
    }));
  }

  ready(): boolean {
    if (!this.current) return false;
    return CORE_PARTS.every(part => this.has(part));
  }
  has(part: DrumPart): boolean {
    return this.buffers[part] !== undefined || this.sfzParts[part] !== undefined;
  }
  play(part: DrumPart, when: number, vel: number): void {
    if (!this.ready() || !this.has(part)) return;
    const ctx = this.out.context;
    when = Math.max(when, ctx.currentTime);
    let buffer: AudioBuffer | undefined;
    let gain: number;
    const s = this.sfzParts[part];
    if (s) {
      const r = pickRegion(s.regions, s.key, Math.round(1 + vel * 126), this.rr++);
      buffer = r ? s.buffers.get(r) : undefined;
      gain = (0.35 + 0.65 * vel) * 10 ** ((r?.volume ?? 0) / 20);
    } else {
      buffer = this.buffers[part];
      gain = vel;
    }
    if (!buffer) return;
    const source = new AudioBufferSourceNode(ctx, { buffer });
    const gainNode = new GainNode(ctx, { gain });
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
