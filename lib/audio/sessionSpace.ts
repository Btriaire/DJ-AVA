// lib/audio/sessionSpace.ts

export class SessionSpace {
  private ctx: AudioContext;
  private sendGain: GainNode;
  private wetGain: GainNode;
  private convolver: ConvolverNode;

  constructor(ctx: AudioContext, from: AudioNode, to: AudioNode) {
    this.ctx = ctx;
    this.sendGain = new GainNode(ctx, { gain: 0 });
    this.wetGain = new GainNode(ctx, { gain: 0 });
    this.convolver = new ConvolverNode(ctx, { buffer: this.createImpulseResponse() });

    from.connect(this.sendGain);
    this.sendGain.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(to);
  }

  private createImpulseResponse(): AudioBuffer {
    const duration = 4.5;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let y = 0;

      for (let i = 0; i < length; i++) {
        const t = i / length;
        const x = (Math.random() * 2 - 1) * (1 - t) ** 2.5;
        y += 0.35 * (x - y);
        data[i] = y;
      }
    }

    return buffer;
  }

  setAmount(v: number): void {
    const now = this.ctx.currentTime;
    const wetTarget = v * 0.55;
    const sendTarget = v > 0.001 ? 1 : 0;

    this.wetGain.gain.setTargetAtTime(wetTarget, now, 0.3);
    this.sendGain.gain.setTargetAtTime(sendTarget, now, 0.3);
  }

  dispose(): void {
    this.sendGain.disconnect();
    this.wetGain.disconnect();
    this.convolver.disconnect();
  }
}

export class SessionTimer {
  private master: GainNode;
  private timeoutId: number | null = null;
  private startTime: number | null = null;
  private endTime: number | null = null;
  private originalGain: number | null = null;

  constructor(master: GainNode) {
    this.master = master;
  }

  start(minutes: number, fadeSec: number): void {
    this.cancel();

    minutes = Math.max(1, Math.min(240, minutes));
    fadeSec = Math.max(5, Math.min(300, Math.min(fadeSec, minutes * 60)));

    const now = this.master.context.currentTime;
    const duration = minutes * 60;
    this.startTime = now;
    this.endTime = now + duration;
    this.originalGain = this.master.gain.value;

    this.timeoutId = window.setTimeout(() => {
      const fadeStart = this.endTime! - fadeSec;
      const currentTime = this.master.context.currentTime;

      if (currentTime < fadeStart) {
        this.master.gain.setValueAtTime(this.originalGain!, currentTime);
        this.master.gain.linearRampToValueAtTime(0, this.endTime!);
      } else {
        this.master.gain.setValueAtTime(this.originalGain!, currentTime);
        this.master.gain.linearRampToValueAtTime(0, currentTime + fadeSec);
      }
    }, (duration - fadeSec) * 1000);
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.startTime !== null && this.endTime !== null) {
      const now = this.master.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this.originalGain!, now + 0.5);
    }

    this.startTime = null;
    this.endTime = null;
    this.originalGain = null;
  }

  remaining(): number | null {
    if (this.startTime === null || this.endTime === null) {
      return null;
    }

    const now = this.master.context.currentTime;
    const remaining = this.endTime - now;

    return remaining > 0 ? remaining : 0;
  }

  get running(): boolean {
    return this.startTime !== null && this.endTime !== null && this.master.context.currentTime < this.endTime;
  }
}
