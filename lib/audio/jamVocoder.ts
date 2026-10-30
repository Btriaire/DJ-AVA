// Channel vocoder: the voice makes a chord of saws speak (MaRuche/Falken)
// Channel vocoder: the voice makes a chord of saws speak (MaRuche/Falken)
import { vocoderBands } from "./jamVocoderBands";

export class Vocoder {
  readonly mod: GainNode;
  readonly out: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly carrierBus: GainNode;
  private readonly oscillators: OscillatorNode[] = [];
  private readonly slotGains: GainNode[] = [];
  private lastLevel = 0.5;

  constructor(ctx: BaseAudioContext, bands = 16) {
    this.ctx = ctx;
    this.mod = ctx.createGain();
    this.out = ctx.createGain();
    this.carrierBus = ctx.createGain();
    this.carrierBus.gain.value = 0.35;

    // Create full-wave rectifier curve
    const rectifierCurve = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) {
      const x = (i / 2048) - 1;
      rectifierCurve[i] = Math.abs(x);
    }

    // Build modulator and carrier paths for each band
    const bandConfigs = vocoderBands(bands);
    for (let i = 0; i < bands; i++) {
      const { freq, q } = bandConfigs[i];

      // Modulator path
      const modBand = ctx.createBiquadFilter();
      modBand.type = "bandpass";
      modBand.frequency.value = freq;
      modBand.Q.value = q;

      const rectifier = ctx.createWaveShaper();
      rectifier.curve = rectifierCurve;

      const envLowpass = ctx.createBiquadFilter();
      envLowpass.type = "lowpass";
      envLowpass.frequency.value = 30;
      envLowpass.Q.value = 0.5;

      const envGain = ctx.createGain();
      envGain.gain.value = 6;

      // Carrier path
      const carrierBand = ctx.createBiquadFilter();
      carrierBand.type = "bandpass";
      carrierBand.frequency.value = freq;
      carrierBand.Q.value = q;

      const vca = ctx.createGain();
      vca.gain.value = 0;

      // Connect modulator path
      this.mod.connect(modBand);
      modBand.connect(rectifier);
      rectifier.connect(envLowpass);
      envLowpass.connect(envGain);
      envGain.connect(vca.gain);

      // Connect carrier path
      this.carrierBus.connect(carrierBand);
      carrierBand.connect(vca);
      vca.connect(this.out);
    }

    // Sibilance path
    const sibilanceHighpass = ctx.createBiquadFilter();
    sibilanceHighpass.type = "highpass";
    sibilanceHighpass.frequency.value = 6000;

    const sibilanceGain = ctx.createGain();
    sibilanceGain.gain.value = 0.25;

    this.mod.connect(sibilanceHighpass);
    sibilanceHighpass.connect(sibilanceGain);
    sibilanceGain.connect(this.out);
  }

  start(): void {
    if (this.running) return;

    // Create 4 voice slots (8 oscillators total)
    for (let i = 0; i < 4; i++) {
      const slotGain = this.ctx.createGain();
      slotGain.gain.value = 0;

      // Two detuned oscillators per slot
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.detune.value = -8;

      const osc2 = this.ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.detune.value = 8;

      osc1.connect(slotGain);
      osc2.connect(slotGain);
      slotGain.connect(this.carrierBus);

      this.oscillators.push(osc1, osc2);
      this.slotGains.push(slotGain);

      osc1.start();
      osc2.start();
    }

    // Restore last level
    this.out.gain.cancelScheduledValues(0);
    this.out.gain.setTargetAtTime(this.lastLevel, this.ctx.currentTime, 0.02);
  }

  stop(when: number): void {
    if (!this.running) return;

    // Fade out output
    this.out.gain.setTargetAtTime(0, Math.max(when - 0.03, this.ctx.currentTime), 0.01);

    // Stop oscillators
    const stopTime = when + 0.05;
    const localOscillators = [...this.oscillators];
    const localSlotGains = [...this.slotGains];
    this.oscillators.length = 0;
    this.slotGains.length = 0;

    localOscillators.forEach(osc => {
      osc.stop(stopTime);
      osc.onended = () => {
        if (localOscillators.indexOf(osc) === localOscillators.length - 1) {
          localOscillators.forEach(o => {
            o.disconnect();
            o.onended = null;
          });
          localSlotGains.forEach(g => g.disconnect());
        }
      };
    });
  }

  setChord(midis: number[], when: number): void {
    if (!this.running) return;

    const now = this.ctx.currentTime;
    const glideTime = Math.max(when, now);

    // Set slot gains and frequencies
    for (let i = 0; i < 4; i++) {
      const slotGain = this.slotGains[i];
      if (i < midis.length) {
        // Active slot
        const midi = midis[i];
        const freq = 440 * Math.pow(2, (midi - 69) / 12);

        // Set frequency for both oscillators in this slot
        this.oscillators[i * 2].frequency.setTargetAtTime(freq, glideTime, 0.015);
        this.oscillators[i * 2 + 1].frequency.setTargetAtTime(freq, glideTime, 0.015);

        slotGain.gain.setTargetAtTime(1, glideTime, 0.015);
      } else {
        // Inactive slot
        slotGain.gain.setTargetAtTime(0, glideTime, 0.015);
      }
    }
  }

  setLevel(v: number): void {
    this.lastLevel = v;
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  get running(): boolean {
    return this.oscillators.length > 0;
  }
}
