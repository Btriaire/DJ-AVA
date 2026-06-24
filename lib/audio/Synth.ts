import { PitchShifter } from "./PitchShifter";

export type Wave = "sawtooth" | "square" | "triangle" | "sine";

export function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

interface Voice {
  sources: AudioScheduledSourceNode[];
  filter: BiquadFilterNode;
  amp: GainNode;
  panners?: StereoPannerNode[]; // unison panners (osc voices) — opposed L/R spread
  note: number; // the keyboard note (without octave) — to re-pitch live
  shifter?: PitchShifter; // present for sample voices (keeps tempo on transpose)
  sampleT0?: number; // ctx time the sample voice started — drives the live playhead
  loopS?: number; // loop start, in seconds
  loopE?: number; // loop end, in seconds
  keyed?: boolean; // voice plays a per-key sample (fixed pitch, ignores octave)
  globalSample?: boolean; // voice plays the global sampleBuffer (drives the playhead)
}

// A sample bound to a single keyboard key. The keyboard becomes a multi-sample
// kit: each assigned key triggers its own buffer at natural pitch (so the same
// key always sounds the same hit, regardless of the octave switch).
export interface KeySample {
  buffer: AudioBuffer;
  name: string;
  start: number; // trim region start, 0..1
  end: number; // trim region end,   0..1
}

// Subtractive poly synth: 2 detuned oscillators -> resonant lowpass -> ADSR amp.
// Plays into the master so it layers over whatever the decks are playing.
// When a sample is loaded, the keys play that buffer pitched per key instead
// of the oscillators — turning the keyboard into a tuned sampler.
export class Synth {
  readonly ctx: AudioContext;
  readonly out: GainNode;
  readonly analyser: AnalyserNode; // time-domain tap for the on-panel oscilloscope
  private voices = new Map<number, Voice>();

  sampleBuffer: AudioBuffer | null = null;
  sampleName = "";
  baseNote = 60; // midi note at which the sample plays at natural speed
  sampleStart = 0; // trim region start, 0..1 of the buffer
  sampleEnd = 1; //   trim region end,   0..1 of the buffer

  // per-key samples (keyed by keyboard note, before octave). When a key has its
  // own sample it wins over the global sampleBuffer and plays at natural pitch.
  private keySamples = new Map<number, KeySample>();

  wave: Wave = "sawtooth";
  cutoff = 2400;
  reso = 6;
  detune = 10;
  width = 0.4; // unison stereo width: 0 = mono centred, 1 = hard L/R
  attack = 0.01;
  decay = 0.25;
  sustain = 0.6;
  release = 0.4;
  octave = 0;
  glideVol = 0.7;
  tune = 0; // master fine/coarse tune, in semitones (the big FREQ wheel)

  // --- performance modulation ---
  portamento = 0; // glide time in seconds (0 = off) between successive notes
  bend = 0; // live pitch-bend, in semitones, applied to every held voice
  vibratoDepth = 0; // LFO → pitch depth, in cents
  vibratoRate = 5; // vibrato LFO speed, Hz
  lfoDepth = 0; // LFO → filter-cutoff depth, in Hz
  lfoRate = 2; // filter LFO speed, Hz
  envAmt = 0; // filter envelope amount, Hz (follows the amp ADSR)

  // two always-running global LFOs; their depth gains are wired into each voice
  private vibLFO: OscillatorNode;
  private vibGain: GainNode; // → oscillator detune (vibrato)
  private filtLFO: OscillatorNode;
  private filtGain: GainNode; // → filter frequency (auto-wah / wobble)
  private lastFreq = 0; // last note frequency, for portamento glide

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.glideVol;
    // force a true stereo bus so the unison-panned voices keep their image
    this.out.channelCount = 2;
    this.out.channelCountMode = "explicit";
    this.out.channelInterpretation = "speakers";
    // oscilloscope tap (parallel sink — does not alter the audio path)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.out.connect(this.analyser);

    this.vibLFO = ctx.createOscillator();
    this.vibLFO.type = "sine";
    this.vibLFO.frequency.value = this.vibratoRate;
    this.vibGain = ctx.createGain();
    this.vibGain.gain.value = this.vibratoDepth;
    this.vibLFO.connect(this.vibGain);
    this.vibLFO.start();

    this.filtLFO = ctx.createOscillator();
    this.filtLFO.type = "sine";
    this.filtLFO.frequency.value = this.lfoRate;
    this.filtGain = ctx.createGain();
    this.filtGain.gain.value = this.lfoDepth;
    this.filtLFO.connect(this.filtGain);
    this.filtLFO.start();
  }

  noteOn(note: number, velocity = 1) {
    if (this.voices.has(note)) return;
    const t = this.ctx.currentTime;
    const midi = note + this.octave * 12;
    const peak = 0.8 * Math.max(0.05, Math.min(1, velocity)); // velocity-scaled amp

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.cutoff;
    filter.Q.value = this.reso;
    // wire the filter LFO (wobble) into every voice's cutoff
    this.filtGain.connect(filter.frequency);

    const amp = this.ctx.createGain();
    amp.gain.value = 0;

    filter.connect(amp);
    amp.connect(this.out);

    const sources: AudioScheduledSourceNode[] = [];
    let panners: StereoPannerNode[] | undefined;
    let shifter: PitchShifter | undefined;
    let sampleT0: number | undefined;
    let loopS: number | undefined;
    let loopE: number | undefined;
    // a per-key sample wins over the global sample; it plays at natural pitch
    // (octave is ignored) so each key is a fixed "pad" hit.
    const keySample = this.keySamples.get(note);
    const buf = keySample ? keySample.buffer : this.sampleBuffer;
    const keyed = !!keySample;
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      // Keep the sample playing at its natural rate so the loop holds its tempo;
      // transpose pitch with the delay-line shifter instead of playbackRate.
      src.playbackRate.value = 1;
      // play/loop only the trimmed region
      const dur = buf.duration;
      const ts = keySample ? keySample.start : this.sampleStart;
      const te = keySample ? keySample.end : this.sampleEnd;
      const s = ts * dur;
      const e = Math.max(s + 0.001, te * dur);
      src.loop = true;
      src.loopStart = s;
      src.loopEnd = e;
      // keyed samples sound at natural pitch (bend+tune only); the global sample
      // is transposed per key relative to baseNote.
      const semis = keyed ? this.bend + this.tune : midi - this.baseNote + this.bend + this.tune;
      if (Math.abs(semis) < 0.01) {
        src.connect(filter); // unison: bypass the shifter for cleanest sound
      } else {
        shifter = new PitchShifter(this.ctx);
        shifter.setSemitones(semis);
        shifter.start(t);
        src.connect(shifter.input);
        shifter.output.connect(filter);
      }
      src.start(t, s);
      sources.push(src);
      sampleT0 = t;
      loopS = s;
      loopE = e;
    } else {
      const freq = midiToFreq(midi);
      const bendCents = this.bend * 100 + this.tune * 100; // bend + master tune
      const o1 = this.ctx.createOscillator();
      o1.type = this.wave;
      o1.detune.value = bendCents;
      const o2 = this.ctx.createOscillator();
      o2.type = this.wave;
      o2.detune.value = this.detune + bendCents;
      // portamento: glide from the previous note's pitch to this one
      if (this.portamento > 0 && this.lastFreq > 0) {
        o1.frequency.setValueAtTime(this.lastFreq, t);
        o1.frequency.exponentialRampToValueAtTime(freq, t + this.portamento);
        o2.frequency.setValueAtTime(this.lastFreq, t);
        o2.frequency.exponentialRampToValueAtTime(freq, t + this.portamento);
      } else {
        o1.frequency.value = freq;
        o2.frequency.value = freq;
      }
      this.lastFreq = freq;
      // vibrato LFO modulates both oscillators' detune
      this.vibGain.connect(o1.detune);
      this.vibGain.connect(o2.detune);
      // unison stereo: pan the two detuned oscillators in opposite directions so
      // the natural detune spreads across the image (width 0 = both centred)
      const p1 = this.ctx.createStereoPanner();
      const p2 = this.ctx.createStereoPanner();
      p1.pan.value = -this.width;
      p2.pan.value = this.width;
      o1.connect(p1);
      o2.connect(p2);
      p1.connect(filter);
      p2.connect(filter);
      panners = [p1, p2];
      o1.start();
      o2.start();
      sources.push(o1, o2);
    }

    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + this.attack);
    amp.gain.linearRampToValueAtTime(peak * this.sustain, t + this.attack + this.decay);

    // filter envelope: sweep the cutoff with the same ADSR shape (amount in Hz)
    if (Math.abs(this.envAmt) > 0.5) {
      const f = filter.frequency;
      const peak = Math.max(40, Math.min(18000, this.cutoff + this.envAmt));
      const sus = Math.max(40, Math.min(18000, this.cutoff + this.envAmt * this.sustain));
      f.cancelScheduledValues(t);
      f.setValueAtTime(this.cutoff, t);
      f.linearRampToValueAtTime(peak, t + this.attack);
      f.linearRampToValueAtTime(sus, t + this.attack + this.decay);
    }

    this.voices.set(note, {
      sources,
      filter,
      amp,
      panners,
      note,
      shifter,
      sampleT0,
      loopS,
      loopE,
      keyed,
      globalSample: !!buf && !keyed,
    });
  }

  // Live playback positions (normalized 0..1 of the full buffer) for every held
  // sample voice — the sample loops at natural rate so position = elapsed time
  // wrapped into the loop window. Used to draw a playhead over the waveform.
  samplePlayheads(): number[] {
    const buf = this.sampleBuffer;
    if (!buf) return [];
    const dur = buf.duration;
    const now = this.ctx.currentTime;
    const out: number[] = [];
    this.voices.forEach((v) => {
      if (!v.globalSample) return; // only the global sample drives the on-panel playhead
      if (v.sampleT0 == null || v.loopS == null || v.loopE == null) return;
      const span = v.loopE - v.loopS;
      if (span <= 0) return;
      const pos = v.loopS + ((now - v.sampleT0) % span);
      out.push(Math.max(0, Math.min(1, pos / dur)));
    });
    return out;
  }

  noteOff(note: number) {
    const v = this.voices.get(note);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setValueAtTime(v.amp.gain.value, t);
    v.amp.gain.linearRampToValueAtTime(0, t + this.release);
    v.sources.forEach((s) => {
      try {
        s.stop(t + this.release + 0.05);
      } catch {}
    });
    v.shifter?.dispose(t + this.release + 0.1);
    this.voices.delete(note);
    setTimeout(
      () => {
        try {
          this.filtGain.disconnect(v.filter.frequency);
        } catch {}
        v.sources.forEach((s) => {
          if (s instanceof OscillatorNode) {
            try {
              this.vibGain.disconnect(s.detune);
            } catch {}
          }
        });
        try {
          v.amp.disconnect();
          v.filter.disconnect();
        } catch {}
      },
      (this.release + 0.2) * 1000
    );
  }

  setSample(buf: AudioBuffer, name: string) {
    this.sampleBuffer = buf;
    this.sampleName = name;
    this.sampleStart = 0;
    this.sampleEnd = 1;
  }
  clearSample() {
    this.sampleBuffer = null;
    this.sampleName = "";
    this.sampleStart = 0;
    this.sampleEnd = 1;
  }

  // --- per-key (multi-sample) assignment ---

  // bind a sample to a single keyboard note (replaces any previous one)
  assignKeySample(note: number, buf: AudioBuffer, name: string, start = 0, end = 1) {
    this.keySamples.set(note, { buffer: buf, name, start, end });
  }
  clearKeySample(note: number) {
    this.keySamples.delete(note);
  }
  clearAllKeySamples() {
    this.keySamples.clear();
  }
  hasKeySample(note: number): boolean {
    return this.keySamples.has(note);
  }
  keySampleName(note: number): string | null {
    return this.keySamples.get(note)?.name ?? null;
  }
  // notes that currently have a per-key sample (sorted ascending)
  keySampleNotes(): number[] {
    return [...this.keySamples.keys()].sort((a, b) => a - b);
  }

  // set the trimmed playback region (normalized 0..1)
  setSampleTrim(start: number, end: number) {
    const s = Math.max(0, Math.min(1, start));
    const e = Math.max(s + 0.002, Math.min(1, end));
    this.sampleStart = s;
    this.sampleEnd = e;
  }

  // --- graphical sample editing (operate on the selected region) ---

  // sample-index bounds of the current trim selection
  private regionBounds(): [number, number] {
    const buf = this.sampleBuffer!;
    const s = Math.floor(this.sampleStart * buf.length);
    const e = Math.floor(this.sampleEnd * buf.length);
    return [Math.max(0, s), Math.max(s + 1, Math.min(buf.length, e))];
  }

  // reverse the selected region in place
  reverseRegion() {
    const buf = this.sampleBuffer;
    if (!buf) return;
    const [s, e] = this.regionBounds();
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      let i = s;
      let j = e - 1;
      while (i < j) {
        const t = d[i];
        d[i] = d[j];
        d[j] = t;
        i++;
        j--;
      }
    }
  }

  // scale the selected region so its peak hits 0.99
  normalizeRegion() {
    const buf = this.sampleBuffer;
    if (!buf) return;
    const [s, e] = this.regionBounds();
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = s; i < e; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
      }
    }
    if (peak < 1e-5) return;
    const g = 0.99 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = s; i < e; i++) d[i] *= g;
    }
  }

  // linear fade in/out across the selected region
  fadeRegion(dir: "in" | "out") {
    const buf = this.sampleBuffer;
    if (!buf) return;
    const [s, e] = this.regionBounds();
    const n = Math.max(1, e - s);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = s; i < e; i++) {
        const p = (i - s) / n;
        d[i] *= dir === "in" ? p : 1 - p;
      }
    }
  }

  // multiply the selected region's amplitude (hard-clipped to ±1)
  gainRegion(factor: number) {
    const buf = this.sampleBuffer;
    if (!buf) return;
    const [s, e] = this.regionBounds();
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = s; i < e; i++) d[i] = Math.max(-1, Math.min(1, d[i] * factor));
    }
  }

  // destructively crop the buffer down to the current selection, trim reset
  cropToSelection() {
    const cut = this.getTrimmedSample();
    if (!cut) return;
    this.sampleBuffer = cut;
    this.sampleStart = 0;
    this.sampleEnd = 1;
  }

  // one-level undo helpers (snapshot before an edit, restore on undo)
  cloneSampleBuffer(): AudioBuffer | null {
    const b = this.sampleBuffer;
    if (!b) return null;
    const out = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) out.getChannelData(c).set(b.getChannelData(c));
    return out;
  }
  restoreSampleBuffer(buf: AudioBuffer) {
    this.sampleBuffer = buf;
    if (this.sampleEnd > 1) this.sampleEnd = 1;
  }

  // a new buffer containing only the trimmed region (for saving)
  getTrimmedSample(): AudioBuffer | null {
    const buf = this.sampleBuffer;
    if (!buf) return null;
    const s = Math.floor(this.sampleStart * buf.length);
    const e = Math.floor(this.sampleEnd * buf.length);
    const len = Math.max(1, e - s);
    const out = this.ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c).subarray(s, e));
    }
    return out;
  }

  // back to factory defaults, drop any captured sample, kill held voices
  reset() {
    [...this.voices.keys()].forEach((n) => this.noteOff(n));
    this.wave = "sawtooth";
    this.cutoff = 2400;
    this.reso = 6;
    this.detune = 10;
    this.width = 0.4;
    this.attack = 0.01;
    this.decay = 0.25;
    this.sustain = 0.6;
    this.release = 0.4;
    this.octave = 0;
    this.glideVol = 0.7;
    this.out.gain.value = 0.7;
    this.tune = 0;
    // performance modulation back to neutral
    this.portamento = 0;
    this.bend = 0;
    this.vibratoDepth = 0;
    this.vibratoRate = 5;
    this.lfoDepth = 0;
    this.lfoRate = 2;
    this.envAmt = 0;
    this.lastFreq = 0;
    this.vibGain.gain.value = 0;
    this.vibLFO.frequency.value = this.vibratoRate;
    this.filtGain.gain.value = 0;
    this.filtLFO.frequency.value = this.lfoRate;
    this.clearSample();
    this.clearAllKeySamples();
  }

  setVolume(v: number) {
    this.out.gain.value = v;
  }
  setWave(w: Wave) {
    this.wave = w;
    this.voices.forEach((v) =>
      v.sources.forEach((s) => {
        if (s instanceof OscillatorNode) s.type = w;
      })
    );
  }
  setCutoff(v: number) {
    this.cutoff = v;
    this.voices.forEach((vo) => (vo.filter.frequency.value = v));
  }
  setReso(v: number) {
    this.reso = v;
    this.voices.forEach((vo) => (vo.filter.Q.value = v));
  }
  // Change the keyboard octave. For held sample voices this re-transposes the
  // pitch *live* through the shifter while the loop keeps playing in time —
  // the tempo is preserved, only the pitch moves.
  setOctave(o: number) {
    this.octave = o;
    this.voices.forEach((v) => {
      if (!v.shifter) return;
      v.shifter.setSemitones(this.voiceSemitones(v));
    });
  }

  // semitone offset for a held sample voice — keyed pads stay at natural pitch
  // (bend+tune only); the global sample tracks the keyboard relative to baseNote.
  private voiceSemitones(v: Voice): number {
    if (v.keyed) return this.bend + this.tune;
    const midi = v.note + this.octave * 12;
    return midi - this.baseNote + this.bend + this.tune;
  }
  setDetune(v: number) {
    this.detune = v;
    const bendCents = this.bend * 100 + this.tune * 100;
    this.voices.forEach((vo) =>
      vo.sources.forEach((s, i) => {
        if (s instanceof OscillatorNode) s.detune.value = (i === 1 ? v : 0) + bendCents;
      })
    );
  }
  // unison stereo width (0..1) — re-pans every held oscillator voice live
  setWidth(v: number) {
    this.width = Math.max(0, Math.min(1, v));
    const now = this.ctx.currentTime;
    this.voices.forEach((vo) => {
      if (!vo.panners) return;
      vo.panners[0]?.pan.setValueAtTime(-this.width, now);
      vo.panners[1]?.pan.setValueAtTime(this.width, now);
    });
  }
  // master tune (the big FREQ wheel), in semitones — re-pitches every held voice live
  setTune(semi: number) {
    this.tune = semi;
    const cents = (this.bend + this.tune) * 100;
    const now = this.ctx.currentTime;
    this.voices.forEach((v) => {
      v.sources.forEach((s, i) => {
        if (s instanceof OscillatorNode) s.detune.setValueAtTime((i === 1 ? this.detune : 0) + cents, now);
      });
      if (v.shifter) v.shifter.setSemitones(this.voiceSemitones(v));
    });
  }

  // --- performance modulation setters (all apply live to held voices) ---
  setPortamento(sec: number) {
    this.portamento = Math.max(0, sec);
  }
  // live pitch-bend in semitones (e.g. ±2). Updates every sounding voice.
  setBend(semi: number) {
    this.bend = semi;
    const cents = (semi + this.tune) * 100;
    const now = this.ctx.currentTime;
    this.voices.forEach((v) => {
      v.sources.forEach((s, i) => {
        if (s instanceof OscillatorNode) s.detune.setValueAtTime((i === 1 ? this.detune : 0) + cents, now);
      });
      if (v.shifter) v.shifter.setSemitones(this.voiceSemitones(v));
    });
  }
  setVibrato(depthCents: number, rateHz?: number) {
    this.vibratoDepth = Math.max(0, depthCents);
    this.vibGain.gain.value = this.vibratoDepth;
    if (rateHz != null) {
      this.vibratoRate = rateHz;
      this.vibLFO.frequency.value = rateHz;
    }
  }
  setLfo(depthHz: number, rateHz?: number) {
    this.lfoDepth = Math.max(0, depthHz);
    this.filtGain.gain.value = this.lfoDepth;
    if (rateHz != null) {
      this.lfoRate = rateHz;
      this.filtLFO.frequency.value = rateHz;
    }
  }
  setEnvAmt(hz: number) {
    this.envAmt = hz;
  }
}
