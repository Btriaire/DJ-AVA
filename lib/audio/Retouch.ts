// lib/audio/Retouch.ts — Audio retouch module for DJ decks
export type RetouchKey =
  | "bass" | "mud" | "presence" | "air" | "tilt"
  | "rumble" | "hum" | "deess"
  | "glue" | "warm" | "monobass" | "trim" | "limit";

export type RetouchGroup = "tone" | "clean" | "dynamics";

export interface RetouchParam {
  key: RetouchKey;
  label: string;
  group: RetouchGroup;
  min: number;
  max: number;
  def: number;
  fmt: (v: number) => string;
  toggle?: boolean;
}

export const RETOUCH_GROUPS: { id: RetouchGroup; label: string }[] = [
  { id: "tone", label: "TONALITÉ" },
  { id: "clean", label: "NETTOYAGE" },
  { id: "dynamics", label: "DYNAMIQUE" }
];

export const RETOUCH_PARAMS: RetouchParam[] = [
  {
    key: "bass",
    label: "Grave",
    group: "tone",
    min: -12,
    max: 12,
    def: 0,
    fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
  },
  {
    key: "mud",
    label: "Anti-boue",
    group: "tone",
    min: 0,
    max: 9,
    def: 0,
    fmt: (v) => `${v.toFixed(1)} dB`
  },
  {
    key: "presence",
    label: "Présence",
    group: "tone",
    min: -8,
    max: 8,
    def: 0,
    fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
  },
  {
    key: "air",
    label: "Air",
    group: "tone",
    min: -10,
    max: 10,
    def: 0,
    fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
  },
  {
    key: "tilt",
    label: "Teinte",
    group: "tone",
    min: -6,
    max: 6,
    def: 0,
    fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
  },
  {
    key: "rumble",
    label: "Anti-grondement",
    group: "clean",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => `${Math.round(10 * Math.pow(12, v))} Hz`
  },
  {
    key: "hum",
    label: "Anti-bourdon",
    group: "clean",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => `${v > 0 ? `-${Math.round(v * 30)} dB` : '0 dB'}`
  },
  {
    key: "deess",
    label: "De-esser",
    group: "clean",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => `${Math.round(v * 100)}%`
  },
  {
    key: "glue",
    label: "Colle",
    group: "dynamics",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => `${Math.round(v * 100)}%`
  },
  {
    key: "warm",
    label: "Chaleur",
    group: "dynamics",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => `${Math.round(v * 100)}%`
  },
  {
    key: "monobass",
    label: "Basses mono",
    group: "dynamics",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => `${Math.round(v * 100)}%`
  },
  {
    key: "trim",
    label: "Niveau",
    group: "dynamics",
    min: -12,
    max: 12,
    def: 0,
    fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
  },
  {
    key: "limit",
    label: "Limiteur",
    group: "dynamics",
    min: 0,
    max: 1,
    def: 0,
    fmt: (v) => v > 0 ? "ON" : "OFF",
    toggle: true
  }
];

export interface RetouchPreset {
  name: string;
  title: string;
  values: Partial<Record<RetouchKey, number>>;
}

export const RETOUCH_PRESETS: RetouchPreset[] = [
  { name: "Neutre", title: "Aucune retouche", values: {} },
  { name: "Club PA", title: "Son de sono de club : graves propres, présence, air, basses en mono", values: { rumble: 0.35, bass: 2, mud: 1.5, presence: 2, air: 3, glue: 0.35, monobass: 0.6, limit: 1 } },
  { name: "Vinyle chaud", title: "Rond et chaleureux, aigus adoucis", values: { bass: 2.5, air: -3, tilt: -1.5, warm: 0.55, glue: 0.3, rumble: 0.2 } },
  { name: "Radio claire", title: "Brillant et compressé façon radio", values: { tilt: 2, presence: 4, air: 4, deess: 0.4, glue: 0.5, rumble: 0.3, limit: 1 } },
  { name: "Voix claire", title: "Nettoie et met la voix en avant", values: { rumble: 0.6, mud: 4, presence: 4, deess: 0.55, glue: 0.25 } },
  { name: "Bass boost", title: "Gros graves, tenus en mono", values: { bass: 8, rumble: 0.2, monobass: 0.8, glue: 0.3, limit: 1 } },
  { name: "Téléphone", title: "Son étroit de combiné téléphonique", values: { rumble: 1, bass: -12, presence: 6, air: -10 } },
  { name: "Nuit", title: "Doux et feutré pour l'écoute tardive", values: { air: -4, tilt: -2, glue: 0.3, trim: -2 } }
];

export class Retouch {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly params: Map<RetouchKey, number> = new Map();
  private bypassActive = false;
  private chainLive = false;
  private disconnectTimer: number | null = null;

  // Processing nodes
  private chainIn: GainNode;
  private directGain: GainNode;
  private rumbleFilter: BiquadFilterNode;
  private humFilters: BiquadFilterNode[] = [];
  private bassFilter: BiquadFilterNode;
  private mudFilter: BiquadFilterNode;
  private presenceFilter: BiquadFilterNode;
  private tiltFilters: BiquadFilterNode[] = [];
  private airFilter: BiquadFilterNode;
  private deessIn: GainNode;
  private deessFilters: BiquadFilterNode[] = [];
  private deessLowDelay: DelayNode;
  private deessSum: GainNode;
  private deessCompressor: DynamicsCompressorNode;
  private deessMakeup: GainNode;
  private glueComp: DynamicsCompressorNode;
  private glueMakeup: GainNode;
  private warmIn: GainNode;
  private warmSum: GainNode;
  private warmShaper: WaveShaperNode;
  private warmGain: GainNode;
  private warmDry: GainNode;
  private monoIn: GainNode;
  private monoFilters: BiquadFilterNode[] = [];
  private lowNode: GainNode;
  private lowStereo: GainNode;
  private lowMono: GainNode;
  private monoSum: GainNode;
  private trimGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private limiterMakeup: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.chainIn = ctx.createGain();
    this.directGain = ctx.createGain();

    // Initialize all processing nodes
    this.rumbleFilter = ctx.createBiquadFilter();
    this.humFilters = [ctx.createBiquadFilter(), ctx.createBiquadFilter()];
    this.bassFilter = ctx.createBiquadFilter();
    this.mudFilter = ctx.createBiquadFilter();
    this.presenceFilter = ctx.createBiquadFilter();
    this.tiltFilters = [ctx.createBiquadFilter(), ctx.createBiquadFilter()];
    this.airFilter = ctx.createBiquadFilter();
    this.deessIn = ctx.createGain();
    this.deessFilters = [
      ctx.createBiquadFilter(), ctx.createBiquadFilter(),
      ctx.createBiquadFilter(), ctx.createBiquadFilter()
    ];
    this.deessLowDelay = ctx.createDelay(0.02);
    this.deessSum = ctx.createGain();
    this.deessCompressor = ctx.createDynamicsCompressor();
    this.deessMakeup = ctx.createGain();
    this.glueComp = ctx.createDynamicsCompressor();
    this.glueMakeup = ctx.createGain();
    this.warmIn = ctx.createGain();
    this.warmSum = ctx.createGain();
    this.warmShaper = ctx.createWaveShaper();
    this.warmGain = ctx.createGain();
    this.warmDry = ctx.createGain();
    this.monoIn = ctx.createGain();
    this.monoFilters = [
      ctx.createBiquadFilter(), ctx.createBiquadFilter(),
      ctx.createBiquadFilter(), ctx.createBiquadFilter()
    ];
    this.lowNode = ctx.createGain();
    this.lowStereo = ctx.createGain();
    this.lowMono = ctx.createGain();
    this.monoSum = ctx.createGain();
    this.trimGain = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiterMakeup = ctx.createGain();

    // Initialize parameter values
    RETOUCH_PARAMS.forEach(p => this.params.set(p.key, p.def));

    // Setup processing chain
    this.setupProcessingChain();

    // Initial routing (bypass active)
    this.input.connect(this.chainIn);
    this.input.connect(this.directGain);
    this.directGain.connect(this.output);
    this.chainIn.gain.value = 0;
    this.directGain.gain.value = 1;

    // Initialize all nodes to default values
    RETOUCH_PARAMS.forEach(p => this.updateProcessing(p.key, p.def));
    this.lowStereo.gain.value = 1;
    this.lowMono.gain.value = 0;
  }

  private setupProcessingChain(): void {
    // Configure all filters and nodes to transparent state
    this.rumbleFilter.type = "highpass";
    this.rumbleFilter.Q.value = -3.0103;
    this.rumbleFilter.frequency.value = 10;

    this.humFilters[0].type = "peaking";
    this.humFilters[0].frequency.value = 50;
    this.humFilters[0].Q.value = 14;
    this.humFilters[0].gain.value = 0;

    this.humFilters[1].type = "peaking";
    this.humFilters[1].frequency.value = 100;
    this.humFilters[1].Q.value = 14;
    this.humFilters[1].gain.value = 0;

    this.bassFilter.type = "lowshelf";
    this.bassFilter.frequency.value = 90;
    this.bassFilter.gain.value = 0;

    this.mudFilter.type = "peaking";
    this.mudFilter.frequency.value = 300;
    this.mudFilter.Q.value = 1.1;
    this.mudFilter.gain.value = 0;

    this.presenceFilter.type = "peaking";
    this.presenceFilter.frequency.value = 3200;
    this.presenceFilter.Q.value = 0.9;
    this.presenceFilter.gain.value = 0;

    this.tiltFilters[0].type = "lowshelf";
    this.tiltFilters[0].frequency.value = 700;
    this.tiltFilters[0].gain.value = 0;

    this.tiltFilters[1].type = "highshelf";
    this.tiltFilters[1].frequency.value = 700;
    this.tiltFilters[1].gain.value = 0;

    this.airFilter.type = "highshelf";
    this.airFilter.frequency.value = 10000;
    this.airFilter.gain.value = 0;

    // De-esser filters (Linkwitz-Riley 4th order)
    this.deessFilters[0].type = "lowpass";
    this.deessFilters[0].frequency.value = 6000;
    this.deessFilters[0].Q.value = -3.0103;

    this.deessFilters[1].type = "lowpass";
    this.deessFilters[1].frequency.value = 6000;
    this.deessFilters[1].Q.value = -3.0103;

    this.deessFilters[2].type = "highpass";
    this.deessFilters[2].frequency.value = 6000;
    this.deessFilters[2].Q.value = -3.0103;

    this.deessFilters[3].type = "highpass";
    this.deessFilters[3].frequency.value = 6000;
    this.deessFilters[3].Q.value = -3.0103;

    this.deessLowDelay.delayTime.value = 0.006;

    this.deessCompressor.threshold.value = 0;
    this.deessCompressor.ratio.value = 1;
    this.deessCompressor.attack.value = 0.001;
    this.deessCompressor.release.value = 0.06;
    this.deessCompressor.knee.value = 6;
    this.deessMakeup.gain.value = 1;

    this.glueComp.threshold.value = 0;
    this.glueComp.ratio.value = 1;
    this.glueComp.attack.value = 0.02;
    this.glueComp.release.value = 0.2;
    this.glueComp.knee.value = 12;
    this.glueMakeup.gain.value = 1;

    this.warmShaper.curve = this.generateWarmCurve(1);
    this.warmGain.gain.value = 0;
    this.warmDry.gain.value = 1;

    // Mono bass filters (Linkwitz-Riley 4th order)
    this.monoFilters[0].type = "lowpass";
    this.monoFilters[0].frequency.value = 120;
    this.monoFilters[0].Q.value = -3.0103;

    this.monoFilters[1].type = "lowpass";
    this.monoFilters[1].frequency.value = 120;
    this.monoFilters[1].Q.value = -3.0103;

    this.monoFilters[2].type = "highpass";
    this.monoFilters[2].frequency.value = 120;
    this.monoFilters[2].Q.value = -3.0103;

    this.monoFilters[3].type = "highpass";
    this.monoFilters[3].frequency.value = 120;
    this.monoFilters[3].Q.value = -3.0103;

    this.lowMono.channelCount = 1;
    this.lowMono.channelCountMode = "explicit";
    this.lowMono.channelInterpretation = "speakers";

    this.trimGain.gain.value = 1;

    this.limiter.threshold.value = 0;
    this.limiter.ratio.value = 1;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.limiter.knee.value = 0;
    this.limiterMakeup.gain.value = 1;

    // Connect processing chain
    this.chainIn.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.humFilters[0]);
    this.humFilters[0].connect(this.humFilters[1]);
    this.humFilters[1].connect(this.bassFilter);
    this.bassFilter.connect(this.mudFilter);
    this.mudFilter.connect(this.presenceFilter);
    this.presenceFilter.connect(this.tiltFilters[0]);
    this.tiltFilters[0].connect(this.tiltFilters[1]);
    this.tiltFilters[1].connect(this.airFilter);
    this.airFilter.connect(this.deessIn);

    // De-esser parallel processing
    this.deessIn.connect(this.deessFilters[0]);
    this.deessFilters[0].connect(this.deessFilters[1]);
    this.deessFilters[1].connect(this.deessLowDelay);
    this.deessLowDelay.connect(this.deessSum);

    this.deessIn.connect(this.deessFilters[2]);
    this.deessFilters[2].connect(this.deessFilters[3]);
    this.deessFilters[3].connect(this.deessCompressor);
    this.deessCompressor.connect(this.deessMakeup);
    this.deessMakeup.connect(this.deessSum);

    this.deessSum.connect(this.glueComp);
    this.glueComp.connect(this.glueMakeup);
    this.glueMakeup.connect(this.warmIn);

    // Warm parallel processing
    this.warmIn.connect(this.warmDry);
    this.warmDry.connect(this.warmSum);
    this.warmIn.connect(this.warmShaper);
    this.warmShaper.connect(this.warmGain);
    this.warmGain.connect(this.warmSum);

    this.warmSum.connect(this.monoIn);

    // Mono bass parallel processing
    this.monoIn.connect(this.monoFilters[0]);
    this.monoFilters[0].connect(this.monoFilters[1]);
    this.monoFilters[1].connect(this.lowNode);

    this.monoIn.connect(this.monoFilters[2]);
    this.monoFilters[2].connect(this.monoFilters[3]);
    this.monoFilters[3].connect(this.monoSum);

    this.lowNode.connect(this.lowStereo);
    this.lowNode.connect(this.lowMono);
    this.lowStereo.connect(this.monoSum);
    this.lowMono.connect(this.monoSum);

    this.monoSum.connect(this.trimGain);
    this.trimGain.connect(this.limiter);
    this.limiter.connect(this.limiterMakeup);
    this.limiterMakeup.connect(this.output);
  }

  private generateWarmCurve(k: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(new ArrayBuffer(2048 * 4));
    for (let i = 0; i < 2048; i++) {
      const x = (i - 1024) / 1024;
      curve[i] = Math.tanh(k * x) / k;
    }
    return curve;
  }

  private updateRouting(): void {
    const now = this.ctx.currentTime;
    const active = !this.bypassActive && !this.isNeutral();

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (active) {
      if (!this.chainLive) {
        this.limiterMakeup.connect(this.output);
        this.chainLive = true;
      }
      this.chainIn.gain.setTargetAtTime(1, now, 0.015);
      this.directGain.gain.setTargetAtTime(0, now, 0.015);
    } else {
      this.chainIn.gain.setTargetAtTime(0, now, 0.015);
      this.directGain.gain.setTargetAtTime(1, now, 0.015);

      if (this.chainLive) {
        this.disconnectTimer = window.setTimeout(() => {
          if (!this.bypassActive && this.isNeutral()) {
            try {
              this.limiterMakeup.disconnect(this.output);
            } catch {
              // Ignore disconnection errors
            }
            this.chainLive = false;
          }
          this.disconnectTimer = null;
        }, 60);
      }
    }
  }

  setParam(key: RetouchKey, v: number): void {
    const param = RETOUCH_PARAMS.find(p => p.key === key);
    if (!param) return;

    // Clamp value
    v = Math.max(param.min, Math.min(param.max, v));
    this.params.set(key, v);

    // Update processing
    this.updateProcessing(key, v);

    // Update routing
    this.updateRouting();
  }

  private updateProcessing(key: RetouchKey, v: number): void {
    const now = this.ctx.currentTime;
    switch (key) {
      case "bass":
        this.bassFilter.gain.setTargetAtTime(v, now, 0.02);
        break;
      case "mud":
        this.mudFilter.gain.setTargetAtTime(-v, now, 0.02);
        break;
      case "presence":
        this.presenceFilter.gain.setTargetAtTime(v, now, 0.02);
        break;
      case "air":
        this.airFilter.gain.setTargetAtTime(v, now, 0.02);
        break;
      case "tilt":
        this.tiltFilters[0].gain.setTargetAtTime(-v, now, 0.02);
        this.tiltFilters[1].gain.setTargetAtTime(v, now, 0.02);
        break;
      case "rumble":
        this.rumbleFilter.frequency.setTargetAtTime(
          10 * Math.pow(12, v), now, 0.02
        );
        break;
      case "hum":
        this.humFilters[0].gain.setTargetAtTime(-v * 30, now, 0.02);
        this.humFilters[1].gain.setTargetAtTime(-v * 30, now, 0.02);
        break;
      case "deess":
        const deessThr = v > 0 ? -18 - v * 27 : 0;
        const deessRatio = v > 0 ? 4 + v * 8 : 1;
        this.deessCompressor.threshold.setTargetAtTime(deessThr, now, 0.02);
        this.deessCompressor.ratio.setTargetAtTime(deessRatio, now, 0.02);
        this.deessMakeup.gain.setTargetAtTime(
          Math.pow(10, 0.6 * deessThr * (1 - 1/deessRatio) / 20), now, 0.02
        );
        break;
      case "glue":
        const glueThr = -v * 28;
        const glueRatio = 1 + v * 3;
        this.glueComp.threshold.setTargetAtTime(glueThr, now, 0.02);
        this.glueComp.ratio.setTargetAtTime(glueRatio, now, 0.02);
        this.glueMakeup.gain.setTargetAtTime(
          (1 + v * 0.6) * Math.pow(10, 0.6 * glueThr * (1 - 1/glueRatio) / 20), now, 0.02
        );
        break;
      case "warm":
        this.warmShaper.curve = this.generateWarmCurve(1 + v * 4);
        this.warmGain.gain.setTargetAtTime(v * 0.5, now, 0.02);
        this.warmDry.gain.setTargetAtTime(1 - v * 0.5, now, 0.02);
        break;
      case "monobass":
        this.lowStereo.gain.setTargetAtTime(1 - v, now, 0.02);
        this.lowMono.gain.setTargetAtTime(v, now, 0.02);
        break;
      case "trim":
        this.trimGain.gain.setTargetAtTime(
          Math.pow(10, v / 20), now, 0.02
        );
        break;
      case "limit":
        if (v > 0) {
          const limiterThr = -1.5;
          const limiterRatio = 20;
          this.limiter.threshold.setTargetAtTime(limiterThr, now, 0.02);
          this.limiter.ratio.setTargetAtTime(limiterRatio, now, 0.02);
          this.limiterMakeup.gain.setTargetAtTime(
            Math.pow(10, 0.6 * limiterThr * (1 - 1/limiterRatio) / 20), now, 0.02
          );
        } else {
          this.limiter.threshold.setTargetAtTime(0, now, 0.02);
          this.limiter.ratio.setTargetAtTime(1, now, 0.02);
          this.limiterMakeup.gain.setTargetAtTime(1, now, 0.02);
        }
        break;
    }
  }

  getParam(key: RetouchKey): number {
    return this.params.get(key) || 0;
  }

  setBypass(on: boolean): void {
    this.bypassActive = on;
    this.updateRouting();
  }

  getBypass(): boolean {
    return this.bypassActive;
  }

  isNeutral(): boolean {
    for (const param of RETOUCH_PARAMS) {
      const current = this.params.get(param.key) || 0;
      if (Math.abs(current - param.def) > 1e-6) {
        return false;
      }
    }
    return true;
  }

  applyPreset(name: string): void {
    this.reset();
    const preset = RETOUCH_PRESETS.find(p => p.name === name);
    if (!preset) return;

    for (const [key, value] of Object.entries(preset.values)) {
      this.setParam(key as RetouchKey, value);
    }
  }

  reset(): void {
    RETOUCH_PARAMS.forEach(p => {
      this.params.set(p.key, p.def);
      this.updateProcessing(p.key, p.def);
    });
    this.updateRouting();
  }

  export(): Record<string, number> {
    const result: Record<string, number> = {};
    this.params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  import(v: Record<string, number> | undefined): void {
    if (!v) return;

    for (const [key, value] of Object.entries(v)) {
      if (this.params.has(key as RetouchKey)) {
        this.setParam(key as RetouchKey, value);
      }
    }
    this.updateRouting();
  }
}
