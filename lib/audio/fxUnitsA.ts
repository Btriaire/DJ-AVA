import { divSeconds, makeRamp, setRampFreq, startAligned, FxEnv, FxUnit } from "./fxTypes";

export function buildUnitA(name: "echo" | "reverb" | "flanger" | "phaser" | "gate" | "sweep" | "noise" | "crush", env: FxEnv): FxUnit {
  const c = env.ctx;

  switch (name) {
    case "echo": {
      let beatIdx = 3;
      const delay = c.createDelay(4);
      const lp = c.createBiquadFilter();
      const hp = c.createBiquadFilter();
      const fb = c.createGain();
      const gateIn = c.createGain(); // closed between presses: the repeats keep ringing after a release (an echo throw)
      const input = c.createGain();
      const output = lp;

      lp.type = "lowpass";
      hp.type = "highpass";
      hp.frequency.value = 150;

      gateIn.gain.value = 0;
      input.connect(gateIn).connect(delay);
      delay.connect(lp).connect(hp).connect(fb).connect(delay);

      let feedback = 0.5 * 0.92;
      let tone = 0.6 * 800 * Math.pow(15, 0.6);

      fb.gain.value = feedback;
      lp.frequency.value = tone;

      const retune = () => {
        const t = Math.max(0.02, Math.min(3.9, divSeconds(env, beatIdx)));
        delay.delayTime.setTargetAtTime(t, c.currentTime, 0.08);
      };

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            feedback = v * 0.92;
            fb.gain.setTargetAtTime(feedback, c.currentTime, 0.08);
          } else {
            tone = 800 * Math.pow(15, v);
            lp.frequency.setTargetAtTime(tone, c.currentTime, 0.08);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          retune();
        },
        engage() {
          const now = c.currentTime;
          gateIn.gain.cancelScheduledValues(now);
          gateIn.gain.setValueAtTime(gateIn.gain.value, now);
          gateIn.gain.linearRampToValueAtTime(1, now + 0.005);
        },
        release() {
          const now = c.currentTime;
          gateIn.gain.cancelScheduledValues(now);
          gateIn.gain.setValueAtTime(gateIn.gain.value, now);
          gateIn.gain.linearRampToValueAtTime(0, now + 0.005);
          const d = Math.max(0.02, Math.min(3.9, divSeconds(env, beatIdx)));
          return Math.min(8, d * Math.log(0.001) / Math.log(Math.max(0.05, feedback)));
        },
        retune,
      };
    }

    case "reverb": {
      const pre = c.createDelay(0.2);
      const conv = c.createConvolver();
      const damp = c.createBiquadFilter();
      const boost = c.createGain();
      const gateIn = c.createGain(); // closed between presses: the tail rings on after a release (a reverb throw)
      const input = c.createGain();
      const output = boost;
      gateIn.gain.value = 0;
      input.connect(gateIn).connect(pre).connect(conv).connect(damp).connect(boost);

      // a room: sparse early reflections, then a noise tail that darkens as it fades, one per ear.
      // Scaled to the energy of the former plain impulse, so the level does not move
      const SEC = 3.2;
      const len = Math.floor(c.sampleRate * SEC);
      const impulse = c.createBuffer(2, len, c.sampleRate);
      const early = Math.floor(0.03 * c.sampleRate);
      const target = Math.sqrt(len / 3 / 5.4); // energy of uniform noise with a (1-x)^2.2 envelope
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let k = 0; k < 9; k++) d[Math.floor(Math.random() * early)] += (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
        let lp = 0;
        for (let i = early; i < len; i++) {
          const x = (i - early) / (len - early);
          const a = 0.15 + 0.8 * x; // the low-pass closes over time
          lp += ((Math.random() * 2 - 1) - lp) * (1 - a);
          d[i] = lp * Math.pow(1 - x, 2.2) * (i - early < 0.01 * c.sampleRate ? (i - early) / (0.01 * c.sampleRate) : 1);
        }
        let e = 0;
        for (let i = 0; i < len; i++) e += d[i] * d[i];
        const k = e > 0 ? target / Math.sqrt(e) : 1;
        for (let i = 0; i < len; i++) d[i] *= k;
      }
      conv.buffer = impulse;

      damp.type = "lowpass";
      boost.gain.value = 1.5;

      let predelay = 0.1 * 0.12;
      let dampFreq = 0.6 * 16000 * Math.pow(0.125, 0.6);
      pre.delayTime.value = predelay;
      damp.frequency.value = dampFreq;

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            predelay = v * 0.12;
            pre.delayTime.setTargetAtTime(predelay, c.currentTime, 0.08);
          } else {
            dampFreq = 16000 * Math.pow(0.125, v);
            damp.frequency.setTargetAtTime(dampFreq, c.currentTime, 0.08);
          }
        },
        setBeat() {},
        engage() {
          const now = c.currentTime;
          gateIn.gain.cancelScheduledValues(now);
          gateIn.gain.setValueAtTime(gateIn.gain.value, now);
          gateIn.gain.linearRampToValueAtTime(1, now + 0.005);
        },
        release() {
          const now = c.currentTime;
          gateIn.gain.cancelScheduledValues(now);
          gateIn.gain.setValueAtTime(gateIn.gain.value, now);
          gateIn.gain.linearRampToValueAtTime(0, now + 0.005);
          return SEC;
        },
        retune() {},
      };
    }

    case "flanger": {
      let beatIdx = 8;
      const delay = c.createDelay(0.05);
      const fb = c.createGain();
      const input = c.createGain();
      const output = delay;
      let osc: OscillatorNode | null = null;
      let depthGain: GainNode | null = null;

      delay.delayTime.value = 0.006;
      fb.gain.value = 0.6 * 0.9;

      input.connect(delay);
      delay.connect(fb).connect(delay);

      let depth = 0.6 * 0.004;
      let feedback = 0.6 * 0.9;

      fb.gain.value = feedback;

      const retune = () => {
        if (osc) {
          const freq = 1 / divSeconds(env, beatIdx);
          osc.frequency.setTargetAtTime(freq, c.currentTime, 0.05);
        }
      };

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            depth = v * 0.004;
            if (depthGain) depthGain.gain.setTargetAtTime(depth, c.currentTime, 0.08);
          } else {
            feedback = v * 0.9;
            fb.gain.setTargetAtTime(feedback, c.currentTime, 0.08);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          retune();
        },
        engage() {
          osc = c.createOscillator();
          depthGain = c.createGain();
          osc.type = "sine";
          depthGain.gain.value = depth;
          osc.connect(depthGain).connect(delay.delayTime);
          startAligned(c, osc, env);
          osc.frequency.value = 1 / divSeconds(env, beatIdx);
        },
        release() {
          if (osc) {
            osc.stop();
            osc.disconnect();
            osc = null;
          }
          if (depthGain) {
            depthGain.disconnect();
            depthGain = null;
          }
          return 0;
        },
        retune,
      };
    }

    case "phaser": {
      let beatIdx = 8;
      const stages = 6;
      const baseFreqs = [400, 750, 1100, 1450, 1800, 2150];
      const allpasses: BiquadFilterNode[] = [];
      const input = c.createGain();
      let output: AudioNode = input;
      let osc: OscillatorNode | null = null;
      let depthGain: GainNode | null = null;

      for (let i = 0; i < stages; i++) {
        const ap = c.createBiquadFilter();
        ap.type = "allpass";
        ap.frequency.value = baseFreqs[i];
        ap.Q.value = 1;
        output.connect(ap);
        output = ap;
        allpasses.push(ap);
      }

      let depth = 0.6 * 300 + 0.6 * 1700;
      let q = 0.6 * 1 + 0.6 * 11;

      const retune = () => {
        if (osc) {
          const freq = 1 / divSeconds(env, beatIdx);
          osc.frequency.setTargetAtTime(freq, c.currentTime, 0.05);
        }
      };

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            depth = 300 + v * 1700;
            if (depthGain) depthGain.gain.setTargetAtTime(depth, c.currentTime, 0.08);
          } else {
            q = 1 + v * 11;
            allpasses.forEach(ap => ap.Q.setTargetAtTime(q, c.currentTime, 0.08));
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          retune();
        },
        engage() {
          osc = c.createOscillator();
          depthGain = c.createGain();
          osc.type = "sine";
          depthGain.gain.value = depth;
          osc.connect(depthGain);
          allpasses.forEach(ap => depthGain!.connect(ap.frequency));
          startAligned(c, osc, env);
          osc.frequency.value = 1 / divSeconds(env, beatIdx);
        },
        release() {
          if (osc) {
            osc.stop();
            osc.disconnect();
            osc = null;
          }
          if (depthGain) {
            depthGain.disconnect();
            depthGain = null;
          }
          return 0;
        },
        retune,
      };
    }

    case "gate": {
      let beatIdx = 2;
      const g = c.createGain();
      const input = c.createGain();
      const output = g;
      let ramp: AudioBufferSourceNode | null = null;
      let shaper: WaveShaperNode | null = null;
      let smooth: BiquadFilterNode | null = null;

      input.connect(g);

      let duty = 0.5 * 0.1 + 0.5 * 0.8;
      let smoothFreq = 0.6 * 4000 * Math.pow(0.0125, 0.6);

      function updateShaper() {
        const curve = new Float32Array(2048);
        for (let i = 0; i < 2048; i++) {
          const u = i / 2047;
          curve[i] = u < duty ? 1 : 0;
        }
        if (shaper) shaper.curve = curve;
      }

      const retune = () => {
        if (ramp) {
          setRampFreq(c, ramp, 1 / divSeconds(env, beatIdx));
        }
      };

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            duty = 0.1 + v * 0.8;
            updateShaper();
          } else {
            smoothFreq = 4000 * Math.pow(0.0125, v);
            if (smooth) smooth.frequency.setTargetAtTime(smoothFreq, c.currentTime, 0.08);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          retune();
        },
        engage() {
          ramp = makeRamp(c, 1 / divSeconds(env, beatIdx));
          shaper = c.createWaveShaper();
          smooth = c.createBiquadFilter();
          smooth.type = "lowpass";
          smooth.frequency.value = smoothFreq;

          updateShaper();
          ramp.connect(shaper).connect(smooth).connect(g.gain);

          const when = startAligned(c, ramp, env);
          g.gain.setValueAtTime(0, when);
        },
        release() {
          if (ramp) {
            ramp.stop();
            ramp.disconnect();
            ramp = null;
          }
          if (shaper) {
            shaper.disconnect();
            shaper = null;
          }
          if (smooth) {
            smooth.disconnect();
            smooth = null;
          }
          const now = c.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.value = 1;
          return 0;
        },
        retune,
      };
    }

    case "sweep": {
      const lp = c.createBiquadFilter();
      const hp = c.createBiquadFilter();
      const input = c.createGain();
      const output = hp;

      lp.type = "lowpass";
      hp.type = "highpass";

      input.connect(lp).connect(hp);

      let position = 0.5;
      let q = 0.7 + 0.6 * 13.3;

      function updateFilters() {
        if (position < 0.5) {
          const lpFreq = 20000 * Math.pow(80 / 20000, (0.5 - position) / 0.5);
          lp.frequency.setTargetAtTime(lpFreq, c.currentTime, 0.03);
          hp.frequency.setTargetAtTime(10, c.currentTime, 0.03);
        } else {
          const hpFreq = 20 * Math.pow(8000 / 20, (position - 0.5) / 0.5);
          hp.frequency.setTargetAtTime(hpFreq, c.currentTime, 0.03);
          lp.frequency.setTargetAtTime(20000, c.currentTime, 0.03);
        }
        lp.Q.setTargetAtTime(q, c.currentTime, 0.03);
        hp.Q.setTargetAtTime(q, c.currentTime, 0.03);
      }

      updateFilters();

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            position = v;
            updateFilters();
          } else {
            q = 0.7 + v * 13.3;
            updateFilters();
          }
        },
        setBeat() {},
        engage() {},
        release() {
          return 0;
        },
        retune() {},
      };
    }

    case "noise": {
      const out = c.createGain();
      const bp = c.createBiquadFilter();
      const input = c.createGain(); // unused: the riser is a generated sound
      const output = out;
      let src: AudioBufferSourceNode | null = null;
      let beatIdx = 8;
      let start = 150 * Math.pow(8, 0.3);
      let q = 0.5 + 0.3 * 11.5;
      const TOP = 12000;
      const PEAK = 1.0; // top of the rise stays below full scale (measured peak ~0.76)

      bp.type = "bandpass";
      bp.frequency.value = start;
      bp.Q.value = q;
      out.gain.value = 0;

      // Create noise buffer once
      const noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            start = 150 * Math.pow(8, v); // used at the next engage
          } else {
            q = 0.5 + v * 11.5;
            bp.Q.setTargetAtTime(q, c.currentTime, 0.08);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
        },
        engage() {
          if (src) {
            try { src.stop(); } catch {}
            src.disconnect();
            src = null;
          }
          const now = c.currentTime;
          const rise = Math.max(0.25, divSeconds(env, beatIdx));
          const s = c.createBufferSource();
          s.buffer = noiseBuf;
          s.loop = true;
          s.connect(bp).connect(out);
          bp.frequency.cancelScheduledValues(now);
          bp.frequency.setValueAtTime(start, now);
          bp.frequency.exponentialRampToValueAtTime(TOP, now + rise);
          out.gain.cancelScheduledValues(now);
          out.gain.setValueAtTime(PEAK * 0.063, now);
          out.gain.linearRampToValueAtTime(PEAK, now + rise);
          s.start(now);
          src = s;
        },
        release() {
          const s = src;
          src = null;
          if (s) {
            s.stop(c.currentTime + 0.04);
            s.onended = () => s.disconnect();
          }
          return 0.04;
        },
        retune() {},
      };
    }

    case "crush": {
      const shaper = c.createWaveShaper();
      const lp = c.createBiquadFilter();
      const input = c.createGain();
      const output = lp;

      lp.type = "lowpass";
      shaper.oversample = "none";

      input.connect(shaper).connect(lp);

      let bits = Math.round(12 - 0.6 * 10);
      let band = 1500 * Math.pow(13, 0.6);

      lp.frequency.value = band;

      function updateShaper() {
        const levels = Math.pow(2, bits - 1);
        const curve = new Float32Array(4096);
        for (let i = 0; i < 4096; i++) {
          const x = (i / 4095) * 2 - 1;
          curve[i] = Math.round(x * levels) / levels;
        }
        shaper.curve = curve;
      }

      updateShaper();

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            bits = Math.round(12 - v * 10);
            updateShaper();
          } else {
            band = 1500 * Math.pow(13, v);
            lp.frequency.setTargetAtTime(band, c.currentTime, 0.08);
          }
        },
        setBeat() {},
        engage() {},
        release() {
          return 0;
        },
        retune() {},
      };
    }

    default:
      throw new Error(`Unknown effect: ${name}`);
  }
}
