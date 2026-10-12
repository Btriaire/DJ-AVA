import { FXRack } from "./FXRack";
import { StepClock, type ClockFn } from "./stepClock";

export type DrumVoice = "kick" | "snare" | "clap" | "hatc" | "hato" | "tom" | "rim" | "perc";
export const DRUM_VOICES: { id: DrumVoice; label: string; color: string }[] = [
  { id: "kick", label: "KICK", color: "#ff6a3d" },
  { id: "snare", label: "SNARE", color: "#fbbf24" },
  { id: "clap", label: "CLAP", color: "#f472b6" },
  { id: "hatc", label: "HAT F", color: "#38bdf8" },
  { id: "hato", label: "HAT O", color: "#2dd4bf" },
  { id: "tom", label: "TOM", color: "#a78bfa" },
  { id: "rim", label: "RIM", color: "#a3e635" },
  { id: "perc", label: "PERC", color: "#e879f9" },
];

export type DrumKit = "808" | "909" | "techno";
export const DRUM_KITS: { id: DrumKit; label: string }[] = [
  { id: "808", label: "808" },
  { id: "909", label: "909" },
  { id: "techno", label: "TECHNO" },
];

export const DRUM_PRESETS: DrumPreset[] = [
  { id: "house", name: "House 4/4", bpm: 124, rows: { kick: "X...x...x...x...", snare: "................", clap: "....x.......x...", hatc: ".x.x.x.x.x.x.x.x", hato: "..x...x...x...x.", tom: "................", rim: "................", perc: "......x.......x." } },
  { id: "techno", name: "Techno", bpm: 130, rows: { kick: "x...x...x...x...", snare: "................", clap: "....x.......x...", hatc: ".X.x.X.x.X.x.X.x", hato: "..x...x...x...x.", tom: "..............x.", rim: "...x.......x...x", perc: ".x.......x......" } },
  { id: "electro", name: "Electro", bpm: 128, rows: { kick: "x..x..x...x..x..", snare: "....x.......x...", clap: "....x.......x...", hatc: "x.x.x.x.x.x.x.x.", hato: "..............x.", tom: "...........x....", rim: "................", perc: ".x.............." } },
  { id: "hiphop", name: "Hip-hop", bpm: 90, rows: { kick: "x......x..x.....", snare: "....x.......x...", clap: "....x.......x...", hatc: "x.x.x.x.x.x.x.x.", hato: "..............x.", tom: "................", rim: "...........x....", perc: "................" } },
  { id: "trap", name: "Trap", bpm: 140, rows: { kick: "x.....x...x.....", snare: "........x.......", clap: "........x.......", hatc: "XxxxXxxxXxxxXxxx", hato: "..............x.", tom: "................", rim: "................", perc: "......x........." } },
  { id: "dnb", name: "Drum & Bass", bpm: 174, rows: { kick: "x.........x.....", snare: "....x.......x...", clap: "................", hatc: "x.x.x.x.x.x.x.x.", hato: "......x.......x.", tom: "................", rim: "..x.............", perc: "................" } },
  { id: "reggaeton", name: "Reggaeton", bpm: 96, rows: { kick: "x...x...x...x...", snare: "...x..x....x..x.", clap: "................", hatc: "x.x.x.x.x.x.x.x.", hato: "................", tom: "................", rim: "................", perc: "................" } },
  { id: "disco", name: "Disco", bpm: 118, rows: { kick: "x...x...x...x...", snare: "....x.......x...", clap: "....x.......x...", hatc: ".x.x.x.x.x.x.x.x", hato: "..x...x...x...x.", tom: "................", rim: "................", perc: "...x.......x...." } },
  { id: "breakbeat", name: "Breakbeat", bpm: 135, rows: { kick: "x.....x...x..x..", snare: "....x.......x..x", clap: "................", hatc: "x.x.x.x.x.x.x.x.", hato: "..............x.", tom: "................", rim: ".........x......", perc: "................" } },
  { id: "minimal", name: "Minimal", bpm: 122, rows: { kick: "x...x...x...x...", snare: "................", clap: "........x.......", hatc: "..x...x...x...x.", hato: "................", tom: "..............x.", rim: ".x.....x..x.....", perc: "....x..........." } },
];

export type DrumRows = Record<DrumVoice, string>;
export interface DrumPreset { id: string; name: string; bpm: number; rows: DrumRows }
export interface DrumState {
  rows: DrumRows; kit: DrumKit; swing: number; level: number;
  mute: Record<DrumVoice, boolean>;
  vLevel: Record<DrumVoice, number>;
  vTune: Record<DrumVoice, number>;
  vDecay: Record<DrumVoice, number>;
}

const KITS = {
  "808": {
    kick: { f0: 170, f1: 46, pd: 0.10, ad: 0.70, click: 0, drive: 0 },
    snare: { body: 190, bd: 0.14, nhp: 1500, nd: 0.26, nl: 0.50, bl: 0.50 },
    clap: { bp: 1100, tail: 0.20 },
    hat: { cd: 0.05, od: 0.70 },
    tom: { f0: 130, ad: 0.34 }
  },
  "909": {
    kick: { f0: 260, f1: 52, pd: 0.045, ad: 0.40, click: 0.30, drive: 1.5 },
    snare: { body: 235, bd: 0.10, nhp: 1800, nd: 0.20, nl: 0.50, bl: 0.31 },
    clap: { bp: 1400, tail: 0.26 },
    hat: { cd: 0.04, od: 0.50 },
    tom: { f0: 165, ad: 0.28 }
  },
  techno: {
    kick: { f0: 330, f1: 50, pd: 0.03, ad: 0.30, click: 0.45, drive: 3.5 },
    snare: { body: 200, bd: 0.07, nhp: 2500, nd: 0.13, nl: 0.63, bl: 0.28 },
    clap: { bp: 1800, tail: 0.12 },
    hat: { cd: 0.03, od: 0.35 },
    tom: { f0: 190, ad: 0.20 }
  }
};

export class DrumMachine {
  readonly out: GainNode;
  readonly fx: FXRack;
  readonly clock: StepClock;
  rows: DrumRows;
  kit: DrumKit;
  mute: Record<DrumVoice, boolean>;
  vLevel: Record<DrumVoice, number>;
  vTune: Record<DrumVoice, number>;
  vDecay: Record<DrumVoice, number>;
  fill: boolean;
  breakMode: boolean;
  quantizeHits: boolean;
  onStep: ((step: number) => void) | null;

  private ctx: BaseAudioContext;
  private bus: GainNode;
  private voiceGains: Record<DrumVoice, GainNode>;
  private noiseBuffer: AudioBuffer;
  private tanh15: Float32Array<ArrayBuffer>;
  private tanh35: Float32Array<ArrayBuffer>;
  private openChoke: GainNode | null = null;

  constructor(ctx: BaseAudioContext, getClock: ClockFn) {
    this.ctx = ctx;
    this.out = new GainNode(ctx, { gain: 0.9 });
    this.bus = new GainNode(ctx, { gain: 1 });
    this.fx = new FXRack(ctx);
    this.fx.setClock(getClock);

    this.bus.connect(this.fx.input);
    this.fx.output.connect(this.out);

    this.voiceGains = {} as Record<DrumVoice, GainNode>;
    DRUM_VOICES.forEach(d => {
      const v = d.id;
      this.voiceGains[v] = new GainNode(ctx, { gain: 1 });
      this.voiceGains[v].connect(this.bus);
    });

    this.noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const noiseData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    this.tanh15 = this.makeTanhCurve(1.5);
    this.tanh35 = this.makeTanhCurve(3.5);

    this.clock = new StepClock(ctx, getClock, (n, t) => this.handleStep(n, t));
    this.clock.stepsPerBeat = 4;

    this.rows = { ...DRUM_PRESETS[0].rows };
    this.kit = "808";
    this.mute = { kick: false, snare: false, clap: false, hatc: false, hato: false, tom: false, rim: false, perc: false };
    this.vLevel = { kick: 1, snare: 1, clap: 1, hatc: 1, hato: 1, tom: 1, rim: 1, perc: 1 };
    this.vTune = { kick: 0, snare: 0, clap: 0, hatc: 0, hato: 0, tom: 0, rim: 0, perc: 0 };
    this.vDecay = { kick: 0, snare: 0, clap: 0, hatc: 0, hato: 0, tom: 0, rim: 0, perc: 0 };
    this.fill = false;
    this.breakMode = false;
    this.quantizeHits = false;
    this.onStep = null;
  }

  private makeTanhCurve(k: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(513) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < 513; i++) {
      const x = (i - 256) / 256;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  private handleStep(n: number, time: number): void {
    const i = n % 16;
    DRUM_VOICES.forEach(d => {
      const v = d.id;
      if (this.mute[v]) return;
      let c = this.rows[v][i];
      let vel = c === "X" ? 1 : 0.78;

      if (this.breakMode && v === "kick") return;
      if (this.fill && v === "snare") {
        c = "x";
        vel = 0.3 + 0.7 * (i / 15);
      }
      if (c === ".") return;

      this.play(v, vel, time);
    });

    if (this.onStep) {
      setTimeout(() => this.onStep?.(i), Math.max(0, (time - this.ctx.currentTime) * 1000));
    }
  }

  private play(v: DrumVoice, vel: number, t: number): void {
    const ts = Math.pow(2, this.vTune[v] * 0.5);
    const ds = Math.pow(2, this.vDecay[v]);
    const kit = KITS[this.kit];
    const nodes: AudioNode[] = [];
    let longest: AudioScheduledSourceNode | null = null;

    switch (v) {
      case "kick": {
        const osc = new OscillatorNode(this.ctx, { type: "sine", frequency: kit.kick.f0 * ts });
        const gain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(osc, gain);

        osc.connect(gain);
        if (kit.kick.drive > 0) {
          const shaper = new WaveShaperNode(this.ctx, {
            curve: kit.kick.drive <= 2 ? this.tanh15 : this.tanh35,
            oversample: "2x"
          });
          nodes.push(shaper);
          gain.connect(shaper);
          shaper.connect(this.voiceGains[v]);
        } else {
          gain.connect(this.voiceGains[v]);
        }

        this.env(gain, t, 0.95 * vel, kit.kick.ad * ds);
        osc.frequency.setValueAtTime(kit.kick.f0 * ts, t);
        osc.frequency.exponentialRampToValueAtTime(kit.kick.f1 * ts, t + kit.kick.pd);

        if (kit.kick.click > 0) {
          const click = this.noiseSrc(t, 0.02);
          const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 2500, Q: 1 });
          const clickGain = new GainNode(this.ctx, { gain: 0.0001 });
          nodes.push(click, hp, clickGain);
          click.connect(hp).connect(clickGain).connect(gain);
          this.env(clickGain, t, kit.kick.click * vel, 0.006);
        }

        osc.start(t);
        osc.stop(t + kit.kick.ad * ds + 0.1);
        longest = osc;
        break;
      }

      case "snare": {
        const body = new OscillatorNode(this.ctx, { type: "triangle", frequency: kit.snare.body * ts });
        const bodyGain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(body, bodyGain);
        body.connect(bodyGain).connect(this.voiceGains[v]);

        this.env(bodyGain, t, kit.snare.bl * vel, kit.snare.bd * ds);
        body.frequency.setValueAtTime(kit.snare.body * ts, t);
        body.frequency.exponentialRampToValueAtTime(kit.snare.body * ts * 0.8, t + 0.05);

        const noise = this.noiseSrc(t, kit.snare.nd * ds + 0.1);
        const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: kit.snare.nhp, Q: 1 });
        const noiseGain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(noise, hp, noiseGain);
        const lp = new BiquadFilterNode(this.ctx, { type: "lowpass", frequency: 7500, Q: 0.7 });
        nodes.push(lp);
        noise.connect(hp).connect(lp).connect(noiseGain).connect(this.voiceGains[v]);
        this.env(noiseGain, t, kit.snare.nl * vel, kit.snare.nd * ds);

        body.start(t);
        body.stop(t + kit.snare.bd * ds + 0.1);
        longest = body;
        break;
      }

      case "clap": {
        const noise = this.noiseSrc(t, kit.clap.tail * ds + 0.1);
        const bp = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: kit.clap.bp * ts, Q: 1 });
        const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 500, Q: 1 });
        const gain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(noise, bp, hp, gain);
        noise.connect(bp).connect(hp).connect(gain).connect(this.voiceGains[v]);

        const strikes = [t, t + 0.011, t + 0.022];
        strikes.forEach(s => {
          gain.gain.setValueAtTime(0.0001, s);
          gain.gain.linearRampToValueAtTime(1.3 * vel, s + 0.001);
          gain.gain.exponentialRampToValueAtTime(0.2 * vel, s + 0.009);
        });

        gain.gain.linearRampToValueAtTime(1.1 * vel, t + 0.034);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.034 + kit.clap.tail * ds);
        longest = noise;
        break;
      }

      case "hatc":
      case "hato": {
        this.metallic(t, vel, v === "hatc" ? kit.hat.cd : kit.hat.od, v === "hato", nodes);
        // metallic() handles its own longest node
        break;
      }

      case "tom": {
        const osc = new OscillatorNode(this.ctx, { type: "sine", frequency: kit.tom.f0 * ts });
        const gain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(osc, gain);
        osc.connect(gain).connect(this.voiceGains[v]);

        this.env(gain, t, 0.85 * vel, kit.tom.ad * ds);
        osc.frequency.setValueAtTime(kit.tom.f0 * ts, t);
        osc.frequency.exponentialRampToValueAtTime(kit.tom.f0 * ts * 0.6, t + 0.15);

        const click = this.noiseSrc(t, 0.02);
        const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 2000, Q: 1 });
        const clickGain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(click, hp, clickGain);
        click.connect(hp).connect(clickGain).connect(gain);
        this.env(clickGain, t, 0.2 * vel, 0.01);

        osc.start(t);
        osc.stop(t + kit.tom.ad * ds + 0.1);
        longest = osc;
        break;
      }

      case "rim": {
        const osc1 = new OscillatorNode(this.ctx, { type: "square", frequency: 1700 * ts });
        const osc2 = new OscillatorNode(this.ctx, { type: "square", frequency: 480 * ts });
        const bp = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: 2600, Q: 1.2 });
        const gain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(osc1, osc2, bp, gain);

        osc1.connect(bp);
        osc2.connect(bp);
        bp.connect(gain).connect(this.voiceGains[v]);
        this.env(gain, t, 0.55 * vel, 0.04);

        const click = this.noiseSrc(t, 0.02);
        const clickHp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 3000, Q: 1 });
        const clickGain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(click, clickHp, clickGain);
        click.connect(clickHp).connect(clickGain).connect(gain);
        this.env(clickGain, t, 0.3 * vel, 0.015);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.05);
        osc2.stop(t + 0.05);
        longest = osc1;
        break;
      }

      case "perc": {
        const osc1 = new OscillatorNode(this.ctx, { type: "square", frequency: 562 * ts });
        const osc2 = new OscillatorNode(this.ctx, { type: "square", frequency: 845 * ts });
        const bp = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: 2400, Q: 1 });
        const gain = new GainNode(this.ctx, { gain: 0.0001 });
        nodes.push(osc1, osc2, bp, gain);

        osc1.connect(bp);
        osc2.connect(bp);
        bp.connect(gain).connect(this.voiceGains[v]);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.6 * vel, t + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22 * ds);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.23 * ds);
        osc2.stop(t + 0.23 * ds);
        longest = osc1;
        break;
      }
    }

    if (longest) {
      longest.onended = () => nodes.forEach(n => n.disconnect());
    }
  }

  private metallic(t: number, vel: number, decay: number, open: boolean, nodes: AudioNode[]): void {
    const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800];
    const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 7000, Q: 1 });
    const bp = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: 10000, Q: 0.8 });
    const gain = new GainNode(this.ctx, { gain: 0.0001 });
    const choke = new GainNode(this.ctx, { gain: 1 });
    nodes.push(hp, bp, gain, choke);

    let longestStop = 0;
    let longest: AudioScheduledSourceNode | null = null;

    for (const f of freqs) {
      const osc = new OscillatorNode(this.ctx, { type: "square", frequency: f * 2 * Math.pow(2, this.vTune[open ? "hato" : "hatc"] * 0.5) });
      const oscGain = new GainNode(this.ctx, { gain: 0.15 });
      nodes.push(osc, oscGain);
      osc.connect(oscGain).connect(hp);
      osc.start(t);
      osc.stop(t + decay * Math.pow(2, this.vDecay[open ? "hato" : "hatc"]) + 0.1);

      if (!longest || (t + decay * Math.pow(2, this.vDecay[open ? "hato" : "hatc"]) + 0.1) > longestStop) {
        longest = osc;
        longestStop = t + decay * Math.pow(2, this.vDecay[open ? "hato" : "hatc"]) + 0.1;
      }
    }

    hp.connect(bp).connect(gain).connect(choke).connect(this.voiceGains[open ? "hato" : "hatc"]);
    this.env(gain, t, 3.0 * vel, decay * Math.pow(2, this.vDecay[open ? "hato" : "hatc"]));

    if (open) {
      if (this.openChoke) {
        this.openChoke.gain.setTargetAtTime(0, t, 0.004);
      }
      this.openChoke = choke;
    } else {
      if (this.openChoke) {
        this.openChoke.gain.setTargetAtTime(0, t, 0.004);
        this.openChoke = null;
      }
    }

    if (longest) {
      longest.onended = () => nodes.forEach(n => n.disconnect());
    }
  }

  private env(g: GainNode, t: number, peak: number, decay: number, attack = 0.001): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const src = new AudioBufferSourceNode(this.ctx, { buffer: this.noiseBuffer, loop: true });
    src.start(t, Math.random());
    src.stop(t + dur);
    return src;
  }

  get running(): boolean { return this.clock.running; }
  get bpm(): number { return this.clock.bpm; }
  get level(): number { return this.out.gain.value; }
  setLevel(v: number): void {
    v = Math.max(0, Math.min(1.5, v));
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }
  get swing(): number { return this.clock.swing; }
  setSwing(v: number): void {
    v = Math.max(0, Math.min(0.6, v));
    this.clock.swing = v;
  }

  setKit(k: DrumKit): void { this.kit = k; }
  setManualBpm(b: number): void {
    b = Math.max(40, Math.min(220, b));
    this.clock.manualBpm = b;
  }

  start(): void { this.clock.start("bar"); }
  stop(): void { this.clock.stop(); }
  toggle(): void { if (this.running) this.stop(); else this.start(); }

  cycleStep(v: DrumVoice, step: number): void {
    const current = this.rows[v][step];
    const next = current === "." ? "x" : current === "x" ? "X" : ".";
    this.rows[v] = this.rows[v].substring(0, step) + next + this.rows[v].substring(step + 1);
  }

  loadPreset(id: string): void {
    const preset = DRUM_PRESETS.find(p => p.id === id);
    if (preset) this.rows = { ...preset.rows };
  }

  clear(): void {
    DRUM_VOICES.forEach(d => {
      const v = d.id;
      this.rows[v] = "................";
    });
  }

  randomize(): void {
    const probs = {
      kick: [0.9, 0.12, 0.12, 0.12, 0.9, 0.12, 0.12, 0.12, 0.9, 0.12, 0.12, 0.12, 0.9, 0.12, 0.12, 0.12],
      snare: [0.06, 0.06, 0.06, 0.85, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.85, 0.06, 0.06, 0.06, 0.06],
      clap: [0.06, 0.06, 0.06, 0.85, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.85, 0.06, 0.06, 0.06, 0.06],
      hatc: [0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7],
      hato: [0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0],
      tom: [0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07],
      rim: [0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12],
      perc: [0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12]
    };

    DRUM_VOICES.forEach(d => {
      const v = d.id;
      let row = "";
      for (let i = 0; i < 16; i++) {
        if (Math.random() < probs[v][i]) {
          row += Math.random() < 0.2 ? "X" : "x";
        } else {
          row += ".";
        }
      }
      this.rows[v] = row;
    });
  }

  setMute(v: DrumVoice, on: boolean): void {
    this.mute[v] = on;
    this.voiceGains[v].gain.setTargetAtTime(on ? 0 : this.vLevel[v], this.ctx.currentTime, 0.005);
  }

  setVoiceLevel(v: DrumVoice, x: number): void {
    x = Math.max(0, Math.min(1.5, x));
    this.vLevel[v] = x;
    this.voiceGains[v].gain.setTargetAtTime(this.mute[v] ? 0 : x, this.ctx.currentTime, 0.005);
  }

  setVoiceTune(v: DrumVoice, x: number): void {
    x = Math.max(-1, Math.min(1, x));
    this.vTune[v] = x;
  }

  setVoiceDecay(v: DrumVoice, x: number): void {
    x = Math.max(-1, Math.min(1, x));
    this.vDecay[v] = x;
  }

  hit(v: DrumVoice, vel = 1, when?: number): void {
    if (this.mute[v]) return;
    const t = when ?? (this.quantizeHits ? this.clock.nextGrid(4) : this.ctx.currentTime);
    this.play(v, vel, t);
  }

  exportState(): DrumState {
    return {
      rows: { ...this.rows },
      kit: this.kit,
      swing: this.swing,
      level: this.level,
      mute: { ...this.mute },
      vLevel: { ...this.vLevel },
      vTune: { ...this.vTune },
      vDecay: { ...this.vDecay }
    };
  }

  importState(s: Partial<DrumState>): void {
    if (s.rows) this.rows = { ...s.rows };
    if (s.kit) this.kit = s.kit;
    if (s.swing !== undefined) this.setSwing(s.swing);
    if (s.level !== undefined) this.setLevel(s.level);
    if (s.mute) {
      DRUM_VOICES.forEach(d => {
        const v = d.id;
        if (s.mute?.[v] !== undefined) this.setMute(v, s.mute[v]);
      });
    }
    if (s.vLevel) {
      DRUM_VOICES.forEach(d => {
        const v = d.id;
        if (s.vLevel?.[v] !== undefined) this.setVoiceLevel(v, s.vLevel[v]);
      });
    }
    if (s.vTune) {
      DRUM_VOICES.forEach(d => {
        const v = d.id;
        if (s.vTune?.[v] !== undefined) this.setVoiceTune(v, s.vTune[v]);
      });
    }
    if (s.vDecay) {
      DRUM_VOICES.forEach(d => {
        const v = d.id;
        if (s.vDecay?.[v] !== undefined) this.setVoiceDecay(v, s.vDecay[v]);
      });
    }
  }

  panic(): void {
    this.stop();
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.005);
    setTimeout(() => {
      this.out.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.01);
    }, 80);
  }

  dispose(): void {
    this.clock.stop();
    this.fx.dispose();
  }
}
