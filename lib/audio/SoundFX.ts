// One-shot DJ sound-effects, fully synthesised with the Web Audio API (no audio
// files needed). Each effect is a self-contained little patch that schedules its
// own envelope and tears itself down. Trigger them from a pad to drop airhorns,
// risers, impacts, sirens, etc. over the live mix.

export type SfxId =
  | "airhorn" | "riser" | "downlift" | "sweepup" | "sweepdn" | "snarebuild"
  | "impact" | "subdrop" | "explosion" | "stab"
  | "siren" | "laser" | "zap" | "bleep"
  | "vinylstop" | "scratch" | "rewind" | "wobble" | "revcymbal" | "whoosh";

export interface SfxDef {
  id: SfxId;
  label: string;
  glyph: string; // monochrome glyph to match the hardware look
  color: string;
  group: "Build" | "Drop" | "Tone" | "Scratch";
}

// The full palette, grouped by use. Colours follow the app's vocabulary.
export const SFX_LIST: SfxDef[] = [
  // builds / transitions — yellow
  { id: "riser", label: "Riser", glyph: "↗", color: "#fbbf24", group: "Build" },
  { id: "downlift", label: "Downlift", glyph: "↘", color: "#fbbf24", group: "Build" },
  { id: "sweepup", label: "Sweep Up", glyph: "⤴", color: "#fbbf24", group: "Build" },
  { id: "sweepdn", label: "Sweep Dn", glyph: "⤵", color: "#fbbf24", group: "Build" },
  { id: "snarebuild", label: "Snare Roll", glyph: "▦", color: "#fbbf24", group: "Build" },
  // drops / impacts — orange-red
  { id: "impact", label: "Impact", glyph: "✸", color: "#ff6a3d", group: "Drop" },
  { id: "subdrop", label: "Sub Drop", glyph: "▼", color: "#ff6a3d", group: "Drop" },
  { id: "explosion", label: "Explosion", glyph: "✺", color: "#ff6a3d", group: "Drop" },
  { id: "stab", label: "Stab Hit", glyph: "◆", color: "#ff6a3d", group: "Drop" },
  // tonal one-shots — cyan
  { id: "airhorn", label: "Air Horn", glyph: "❰", color: "#38bdf8", group: "Tone" },
  { id: "siren", label: "Siren", glyph: "∿", color: "#38bdf8", group: "Tone" },
  { id: "laser", label: "Laser", glyph: "↯", color: "#38bdf8", group: "Tone" },
  { id: "zap", label: "Zap", glyph: "⚡", color: "#38bdf8", group: "Tone" },
  { id: "bleep", label: "Bleep", glyph: "●", color: "#38bdf8", group: "Tone" },
  // scratch / turntable / bass — green
  { id: "vinylstop", label: "Vinyl Stop", glyph: "⏻", color: "#ffcc00", group: "Scratch" },
  { id: "scratch", label: "Scratch", glyph: "⟿", color: "#ffcc00", group: "Scratch" },
  { id: "rewind", label: "Rewind", glyph: "⟲", color: "#ffcc00", group: "Scratch" },
  { id: "wobble", label: "Wobble", glyph: "≋", color: "#ffcc00", group: "Scratch" },
  { id: "revcymbal", label: "Rev Cymbal", glyph: "⤒", color: "#ffcc00", group: "Scratch" },
  { id: "whoosh", label: "Whoosh", glyph: "～", color: "#ffcc00", group: "Scratch" },
];

export class SoundFX {
  readonly ctx: AudioContext;
  readonly output: GainNode;
  // every currently-sounding source, so STOP can cut them all at once
  private active: AudioScheduledSourceNode[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.9;
  }

  setVolume(v: number) {
    this.output.gain.value = Math.max(0, Math.min(2, v));
  }

  stopAll() {
    this.active.splice(0).forEach((n) => {
      try { n.stop(); } catch { /* already stopped */ }
    });
  }

  // start+schedule a source and auto-unregister it when it ends
  private play(node: AudioScheduledSourceNode, start: number, stop: number) {
    node.start(start);
    node.stop(stop);
    this.active.push(node);
    node.onended = () => {
      const i = this.active.indexOf(node);
      if (i >= 0) this.active.splice(i, 1);
    };
  }

  private noise(dur: number): AudioBufferSourceNode {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private gain(v = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.output);
    return g;
  }

  trigger(id: SfxId) {
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    const c = this.ctx;
    const t = c.currentTime;

    switch (id) {
      // ---- builds ----------------------------------------------------------
      case "riser": {
        const dur = 2.0;
        const n = this.noise(dur);
        const bp = c.createBiquadFilter();
        bp.type = "bandpass"; bp.Q.value = 2.2;
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
        const g = this.gain(0.05);
        g.gain.exponentialRampToValueAtTime(0.6, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
        n.connect(bp); bp.connect(g);
        this.play(n, t, t + dur + 0.05);
        const o = c.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(2200, t + dur);
        const og = this.gain(0.001);
        og.gain.exponentialRampToValueAtTime(0.16, t + dur);
        o.connect(og); this.play(o, t, t + dur);
        break;
      }
      case "downlift": {
        const dur = 1.8;
        const n = this.noise(dur);
        const bp = c.createBiquadFilter();
        bp.type = "bandpass"; bp.Q.value = 2.2;
        bp.frequency.setValueAtTime(8000, t);
        bp.frequency.exponentialRampToValueAtTime(250, t + dur);
        const g = this.gain(0.5);
        g.gain.exponentialRampToValueAtTime(0.05, t + dur);
        n.connect(bp); bp.connect(g);
        this.play(n, t, t + dur);
        const o = c.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(1600, t);
        o.frequency.exponentialRampToValueAtTime(120, t + dur);
        const og = this.gain(0.16);
        og.gain.exponentialRampToValueAtTime(0.01, t + dur);
        o.connect(og); this.play(o, t, t + dur);
        break;
      }
      case "sweepup": {
        const dur = 0.9;
        const n = this.noise(dur);
        const hp = c.createBiquadFilter(); hp.type = "highpass";
        hp.frequency.setValueAtTime(200, t);
        hp.frequency.exponentialRampToValueAtTime(9000, t + dur);
        const g = this.gain(0);
        g.gain.linearRampToValueAtTime(0.5, t + dur * 0.6);
        g.gain.linearRampToValueAtTime(0, t + dur);
        n.connect(hp); hp.connect(g);
        this.play(n, t, t + dur);
        break;
      }
      case "sweepdn": {
        const dur = 0.9;
        const n = this.noise(dur);
        const lp = c.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(9000, t);
        lp.frequency.exponentialRampToValueAtTime(250, t + dur);
        const g = this.gain(0.5);
        g.gain.linearRampToValueAtTime(0, t + dur);
        n.connect(lp); lp.connect(g);
        this.play(n, t, t + dur);
        break;
      }
      case "snarebuild": {
        const dur = 2.0;
        const hits = 18;
        for (let i = 0; i < hits; i++) {
          const frac = i / hits;
          const time = t + dur * Math.pow(frac, 1.7); // accelerating roll
          const n = this.noise(0.09);
          const bp = c.createBiquadFilter();
          bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1;
          const g = this.gain(0);
          g.gain.setValueAtTime(0, time);
          g.gain.linearRampToValueAtTime(0.25 + 0.35 * frac, time + 0.004);
          g.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
          n.connect(bp); bp.connect(g);
          this.play(n, time, time + 0.09);
        }
        break;
      }

      // ---- drops -----------------------------------------------------------
      case "impact": {
        const dur = 1.2;
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
        const g = this.gain(0.9);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        const n = this.noise(0.25);
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
        const ng = this.gain(0.5);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        n.connect(lp); lp.connect(ng); this.play(n, t, t + 0.25);
        break;
      }
      case "subdrop": {
        const dur = 1.6;
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
        const g = this.gain(0.95);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "explosion": {
        const dur = 1.4;
        const n = this.noise(dur);
        const lp = c.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(1400, t);
        lp.frequency.exponentialRampToValueAtTime(80, t + dur);
        const g = this.gain(0.85);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        n.connect(lp); lp.connect(g); this.play(n, t, t + dur);
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(95, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        const og = this.gain(0.7);
        og.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(og); this.play(o, t, t + dur);
        break;
      }
      case "stab": {
        const dur = 0.45;
        const lp = c.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(6000, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + dur);
        const amp = this.gain(0);
        amp.gain.linearRampToValueAtTime(0.5, t + 0.005);
        amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
        lp.connect(amp);
        [130.8, 155.6, 196, 261.6].forEach((f) => {
          const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
          const o2 = c.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f; o2.detune.value = 12;
          o.connect(lp); o2.connect(lp);
          this.play(o, t, t + dur); this.play(o2, t, t + dur);
        });
        break;
      }

      // ---- tonal -----------------------------------------------------------
      case "airhorn": {
        const dur = 1.3;
        const amp = this.gain(0);
        amp.gain.linearRampToValueAtTime(0.45, t + 0.03);
        amp.gain.setValueAtTime(0.45, t + dur - 0.15);
        amp.gain.linearRampToValueAtTime(0, t + dur);
        const vib = c.createOscillator(); vib.type = "sine"; vib.frequency.value = 6;
        const vibg = c.createGain(); vibg.gain.value = 6;
        vib.connect(vibg); this.play(vib, t, t + dur);
        [233, 277, 349].forEach((f) => {
          const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
          vibg.connect(o.detune);
          o.connect(amp); this.play(o, t, t + dur);
        });
        break;
      }
      case "siren": {
        const dur = 2.2;
        const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 800;
        const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 1.8;
        const ld = c.createGain(); ld.gain.value = 320;
        lfo.connect(ld); ld.connect(o.frequency); this.play(lfo, t, t + dur);
        const g = this.gain(0);
        g.gain.linearRampToValueAtTime(0.32, t + 0.05);
        g.gain.setValueAtTime(0.32, t + dur - 0.1);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "laser": {
        const dur = 0.5;
        const o = c.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(2200, t);
        o.frequency.exponentialRampToValueAtTime(120, t + dur);
        const g = this.gain(0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "zap": {
        const dur = 0.22;
        const o = c.createOscillator(); o.type = "square";
        o.frequency.setValueAtTime(1300, t);
        o.frequency.exponentialRampToValueAtTime(180, t + dur);
        const g = this.gain(0.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "bleep": {
        const dur = 0.5;
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = 1000;
        const g = this.gain(0);
        g.gain.linearRampToValueAtTime(0.32, t + 0.01);
        g.gain.setValueAtTime(0.32, t + dur - 0.01);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }

      // ---- scratch / turntable / bass -------------------------------------
      case "vinylstop": {
        const dur = 0.85;
        const o = c.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(20, t + dur);
        const lp = c.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(3000, t);
        lp.frequency.exponentialRampToValueAtTime(200, t + dur);
        const g = this.gain(0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(lp); lp.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "scratch": {
        const dur = 0.6;
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 200;
        // a few back-and-forth pitch jerks = a hand scratch
        const f = o.frequency;
        f.setValueAtTime(160, t);
        f.linearRampToValueAtTime(420, t + 0.12);
        f.linearRampToValueAtTime(140, t + 0.24);
        f.linearRampToValueAtTime(380, t + 0.36);
        f.linearRampToValueAtTime(150, t + 0.5);
        const g = this.gain(0.3);
        g.gain.setValueAtTime(0.3, t + dur - 0.05);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "rewind": {
        const dur = 1.1;
        const o = c.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(1700, t + dur);
        const g = this.gain(0.3);
        // tremolo wobble that speeds up = the classic rewind
        const lfo = c.createOscillator(); lfo.type = "sine";
        lfo.frequency.setValueAtTime(9, t);
        lfo.frequency.exponentialRampToValueAtTime(34, t + dur);
        const ld = c.createGain(); ld.gain.value = 0.28;
        lfo.connect(ld); ld.connect(g.gain); this.play(lfo, t, t + dur);
        g.gain.setValueAtTime(0.3, t + dur - 0.05);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); this.play(o, t, t + dur);
        break;
      }
      case "wobble": {
        const dur = 1.6;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 9;
        const base = c.createConstantSource(); base.offset.value = 900;
        const lfo = c.createOscillator(); lfo.type = "square"; lfo.frequency.value = 6;
        const ld = c.createGain(); ld.gain.value = 800;
        lfo.connect(ld); ld.connect(lp.frequency); base.connect(lp.frequency);
        this.play(base, t, t + dur); this.play(lfo, t, t + dur);
        const g = this.gain(0);
        g.gain.linearRampToValueAtTime(0.5, t + 0.03);
        g.gain.setValueAtTime(0.5, t + dur - 0.1);
        g.gain.linearRampToValueAtTime(0, t + dur);
        lp.connect(g);
        [55, 55].forEach((f, i) => {
          const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
          o.detune.value = i === 1 ? 8 : 0;
          o.connect(lp); this.play(o, t, t + dur);
        });
        break;
      }
      case "revcymbal": {
        const dur = 1.5;
        const n = this.noise(dur);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4000;
        const g = this.gain(0.001);
        g.gain.exponentialRampToValueAtTime(0.5, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
        n.connect(hp); hp.connect(g); this.play(n, t, t + dur + 0.05);
        break;
      }
      case "whoosh": {
        const dur = 0.7;
        const n = this.noise(dur);
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.5;
        bp.frequency.setValueAtTime(400, t);
        bp.frequency.exponentialRampToValueAtTime(4000, t + dur * 0.5);
        bp.frequency.exponentialRampToValueAtTime(400, t + dur);
        const g = this.gain(0);
        g.gain.linearRampToValueAtTime(0.4, t + dur * 0.4);
        g.gain.linearRampToValueAtTime(0, t + dur);
        n.connect(bp); bp.connect(g); this.play(n, t, t + dur);
        break;
      }
    }
  }
}
