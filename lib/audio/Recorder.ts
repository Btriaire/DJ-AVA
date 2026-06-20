// Live recorder: taps a node (the master mix) and captures raw PCM into an
// AudioBuffer, up to maxSeconds. Used to sample a few live seconds of whatever
// is playing — both decks, FX, synth — then replay it on a sampler pad.
export class Recorder {
  readonly ctx: AudioContext;
  readonly input: GainNode;
  private proc: ScriptProcessorNode | null = null;
  private sink: GainNode;
  private chunks: Float32Array[][] = [[], []];
  private captured = 0;
  private maxSamples: number;
  recording = false;
  onProgress?: (sec: number) => void;

  constructor(ctx: AudioContext, maxSeconds = 30) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.maxSamples = Math.floor(maxSeconds * ctx.sampleRate);
    // a muted sink keeps the ScriptProcessor pulled without doubling the audio
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);
  }

  start() {
    if (this.recording) return;
    this.chunks = [[], []];
    this.captured = 0;
    this.recording = true;
    const proc = this.ctx.createScriptProcessor(4096, 2, 2);
    proc.onaudioprocess = (e) => {
      if (!this.recording) return;
      const inBuf = e.inputBuffer;
      const remaining = this.maxSamples - this.captured;
      const n = Math.min(inBuf.length, remaining);
      if (n <= 0) {
        this.stop();
        return;
      }
      for (let c = 0; c < 2; c++) {
        const src = inBuf.getChannelData(Math.min(c, inBuf.numberOfChannels - 1));
        this.chunks[c].push(src.slice(0, n));
      }
      this.captured += n;
      this.onProgress?.(this.captured / this.ctx.sampleRate);
      if (this.captured >= this.maxSamples) this.stop();
    };
    this.input.connect(proc);
    proc.connect(this.sink);
    this.proc = proc;
  }

  stop(): AudioBuffer | null {
    if (!this.recording) return null;
    this.recording = false;
    if (this.proc) {
      this.proc.onaudioprocess = null;
      try {
        this.input.disconnect(this.proc);
      } catch {}
      try {
        this.proc.disconnect();
      } catch {}
      this.proc = null;
    }
    if (this.captured === 0) return null;
    const buf = this.ctx.createBuffer(2, this.captured, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      let off = 0;
      for (const chunk of this.chunks[c]) {
        data.set(chunk, off);
        off += chunk.length;
      }
    }
    this.chunks = [[], []];
    return buf;
  }
}
