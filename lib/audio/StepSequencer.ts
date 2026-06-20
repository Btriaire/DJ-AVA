// Tiny monophonic step sequencer that drives the Synth.
// Each step holds a base midi note (60..72) or null (rest). The Synth applies
// its own octave on noteOn, so the OCT buttons transpose the running pattern
// live. Length is switchable 4 / 8 / 16; steps are 16th notes at `bpm`.
export class StepSequencer {
  steps: (number | null)[] = new Array(16).fill(null);
  length = 8;
  bpm = 120;
  playing = false;
  recording = false; // live overdub: keys played get written into the steps
  current = -1; // step index lit while playing, -1 when stopped
  onTick?: (i: number) => void; // UI callback to highlight the playhead
  onRecord?: (step: number, note: number) => void; // UI callback after a live write

  private timer: ReturnType<typeof setInterval> | null = null;
  private last: number | null = null; // currently sounding note (for mono gate)
  private lastTickAt = 0; // performance.now() of the last step, for quantizing

  constructor(
    private noteOn: (n: number) => void,
    private noteOff: (n: number) => void
  ) {}

  private stepMs() {
    return 60000 / this.bpm / 4; // one 16th note
  }

  private tick = () => {
    this.lastTickAt = performance.now();
    if (this.last !== null) {
      this.noteOff(this.last);
      this.last = null;
    }
    this.current = (this.current + 1) % this.length;
    const n = this.steps[this.current];
    if (n !== null) {
      this.noteOn(n);
      this.last = n;
    }
    this.onTick?.(this.current);
  };

  private arm() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(this.tick, this.stepMs());
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.current = -1;
    this.tick();
    this.arm();
  }

  stop() {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.last !== null) {
      this.noteOff(this.last);
      this.last = null;
    }
    this.current = -1;
    this.onTick?.(-1);
  }

  toggle() {
    if (this.playing) this.stop();
    else this.start();
  }

  setBpm(b: number) {
    this.bpm = Math.max(40, Math.min(300, Math.round(b)));
    if (this.playing) this.arm();
  }

  setLength(l: number) {
    this.length = l;
    if (this.current >= l) this.current = l - 1;
  }

  clear() {
    this.steps = new Array(16).fill(null);
  }

  // live record: write the played note into the step nearest the playhead,
  // quantized to the running step grid (only while playing + armed).
  recordNote(n: number) {
    if (!this.playing || !this.recording || this.current < 0) return;
    const frac = (performance.now() - this.lastTickAt) / this.stepMs();
    const target = frac > 0.5 ? (this.current + 1) % this.length : this.current;
    this.steps[target] = n;
    this.onRecord?.(target, n);
  }
}
