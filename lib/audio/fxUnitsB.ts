import { divSeconds, makeRamp, setRampFreq, startAligned, FxEnv, FxUnit } from "./fxTypes";
import * as Tone from "tone";

export function buildUnitB(name: "roll" | "brake" | "reverse" | "wobble" | "pump" | "pan" | "pitch", env: FxEnv): FxUnit {
  const c = env.ctx;
  const input = c.createGain();
  const output = c.createGain();

  switch (name) {
    case "roll": {
      const delay = c.createDelay(4);
      const lp = c.createBiquadFilter();
      const fb = c.createGain();
      const gateIn = c.createGain();
      const fbIn = c.createGain();
      const sum = c.createGain();

      lp.type = "lowpass";
      gateIn.gain.value = 1;
      fb.gain.value = 0;
      delay.delayTime.value = divSeconds(env, 2);

      input.connect(gateIn);
      fb.connect(fbIn);
      fbIn.connect(sum);
      gateIn.connect(sum);
      sum.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      lp.connect(output);

      let engaged = false;
      let beatIdx = 2;
      let feedback = 0.85 + 0.95 * 0.15;
      let cutoff = 2000 * Math.pow(10, 0.8);

      lp.frequency.value = cutoff;

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") feedback = 0.85 + v * 0.15;
          else if (key === "p2") {
            cutoff = 2000 * Math.pow(10, v);
            lp.frequency.setTargetAtTime(cutoff, c.currentTime, 0.03);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          this.retune();
        },
        engage() {
          engaged = true;
          const t = c.currentTime;
          gateIn.gain.setValueAtTime(0, t);
          fb.gain.setValueAtTime(feedback, t);
        },
        release() {
          engaged = false;
          const t = c.currentTime;
          gateIn.gain.setValueAtTime(1, t);
          fb.gain.setValueAtTime(0, t);
          const L = Math.max(0.03, Math.min(3.9, divSeconds(env, beatIdx)));
          delay.delayTime.setTargetAtTime(L, t, 0.05);
          return 0;
        },
        retune() {
          if (!engaged) {
            const L = Math.max(0.03, Math.min(3.9, divSeconds(env, beatIdx)));
            delay.delayTime.setTargetAtTime(L, c.currentTime, 0.05);
          }
        },
      };
    }

    case "brake": {
      const delay = c.createDelay(4);
      const envNode = c.createGain();

      delay.delayTime.value = 0;
      envNode.gain.value = 1;

      input.connect(delay);
      delay.connect(envNode);
      envNode.connect(output);

      let engaged = false;
      let t0 = 0;
      let D = 0.25 + 0.4 * 2.25;
      let R = 0.05 + 0.3 * 0.75;

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") D = 0.25 + v * 2.25;
          else if (key === "p2") R = 0.05 + v * 0.75;
        },
        setBeat() {},
        engage() {
          engaged = true;
          t0 = c.currentTime;
          delay.delayTime.cancelScheduledValues(t0);
          delay.delayTime.setValueAtTime(0, t0);
          const N = 48;
          for (let k = 1; k <= N; k++) {
            delay.delayTime.linearRampToValueAtTime(0.5 * D * (k/N)**2, t0 + D * k / N);
          }
          envNode.gain.setValueAtTime(1, t0);
          envNode.gain.setValueAtTime(1, t0 + D - 0.04);
          envNode.gain.linearRampToValueAtTime(0, t0 + D);
        },
        release() {
          if (!engaged) return 0;
          engaged = false;
          const now = c.currentTime;
          const tau = Math.min(D, Math.max(0, now - t0));
          const cur = tau * tau / (2 * D);
          delay.delayTime.cancelScheduledValues(now);
          delay.delayTime.setValueAtTime(cur, now);
          delay.delayTime.linearRampToValueAtTime(0, now + R);
          envNode.gain.cancelScheduledValues(now);
          envNode.gain.setValueAtTime(1, now);
          return R + 0.02;
        },
        retune() {},
      };
    }

    case "reverse": {
      const delay = c.createDelay(4);
      const envNode = c.createGain();

      delay.delayTime.value = 0;
      envNode.gain.value = 0;

      input.connect(delay);
      delay.connect(envNode);
      envNode.connect(output);

      let engaged = false;
      let beatIdx = 3;
      let intervalId: number | null = null;
      let T = divSeconds(env, beatIdx);
      let nextStart = 0;

      const scheduleCycles = (startTime: number, count: number) => {
        for (let i = 0; i < count; i++) {
          const s = startTime + i * T;
          delay.delayTime.setValueAtTime(0, s);
          delay.delayTime.linearRampToValueAtTime(2 * T, s + T);
          envNode.gain.setValueAtTime(0, s);
          envNode.gain.linearRampToValueAtTime(1, s + 0.006);
          envNode.gain.setValueAtTime(1, s + T - 0.006);
          envNode.gain.linearRampToValueAtTime(0, s + T);
        }
        nextStart = startTime + count * T;
      };

      return {
        input,
        output,
        setParam() {},
        setBeat(idx) {
          beatIdx = idx;
          this.retune();
        },
        engage() {
          engaged = true;
          T = Math.max(0.05, Math.min(1.9, divSeconds(env, beatIdx)));
          const now = c.currentTime;
          nextStart = now;
          const N = Math.ceil(30 / T);
          scheduleCycles(now, N);

          if (typeof setInterval !== "undefined") {
            intervalId = window.setInterval(() => {
              if (engaged && nextStart - c.currentTime < 10) {
                const N = Math.ceil((30 - (nextStart - now)) / T);
                scheduleCycles(nextStart, N);
              }
            }, 5000);
          }
        },
        release() {
          engaged = false;
          const now = c.currentTime;
          delay.delayTime.cancelScheduledValues(now);
          envNode.gain.cancelScheduledValues(now);
          envNode.gain.setValueAtTime(envNode.gain.value, now);
          envNode.gain.linearRampToValueAtTime(0, now + 0.01);
          delay.delayTime.setValueAtTime(0, now + 0.012);

          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }

          return 0.012;
        },
        retune() {
          if (engaged) {
            this.release();
            this.engage();
          }
        },
      };
    }

    case "wobble": {
      const lp = c.createBiquadFilter();
      let osc: OscillatorNode | null = null;
      let depth: GainNode | null = null;
      let beatIdx = 5;
      let cutoffMax = 150 + 0.7 * 4850;
      let Q = 2 + 0.6 * 16;

      lp.type = "lowpass";
      lp.frequency.value = 20000;
      lp.Q.value = Q;

      input.connect(lp);
      lp.connect(output);

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            cutoffMax = 150 + v * 4850;
            if (osc && depth) {
              depth.gain.value = (cutoffMax - 150) / 2;
              lp.frequency.value = 150 + (cutoffMax - 150) / 2;
            }
          } else if (key === "p2") {
            Q = 2 + v * 16;
            lp.Q.setTargetAtTime(Q, c.currentTime, 0.03);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          this.retune();
        },
        engage() {
          osc = c.createOscillator();
          depth = c.createGain();
          osc.type = "sine";
          osc.frequency.value = 1 / divSeconds(env, beatIdx);
          depth.gain.value = (cutoffMax - 150) / 2;
          osc.connect(depth);
          depth.connect(lp.frequency);
          lp.frequency.value = 150 + (cutoffMax - 150) / 2;
          startAligned(c, osc, env);
        },
        release() {
          if (osc) {
            osc.stop();
            osc.disconnect();
            osc = null;
          }
          if (depth) {
            depth.disconnect();
            depth = null;
          }
          lp.frequency.setValueAtTime(20000, c.currentTime);
          return 0;
        },
        retune() {
          if (osc) {
            osc.frequency.setTargetAtTime(1 / divSeconds(env, beatIdx), c.currentTime, 0.03);
          }
        },
      };
    }

    case "pump": {
      const g = c.createGain();
      let ramp: AudioBufferSourceNode | null = null;
      let shaper: WaveShaperNode | null = null;
      let beatIdx = 5;
      let lowGain = 1 - 0.8 * 0.95;
      let expo = 0.5 + 0.5 * 3.5;

      g.gain.value = 1;

      input.connect(g);
      g.connect(output);

      const updateCurve = () => {
        if (!shaper) return;
        const curve = new Float32Array(2048);
        for (let i = 0; i < 2048; i++) {
          const u = i / 2047;
          curve[i] = lowGain + (1 - lowGain) * Math.pow(u, expo);
        }
        shaper.curve = curve;
      };

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            lowGain = 1 - v * 0.95;
            updateCurve();
          } else if (key === "p2") {
            expo = 0.5 + v * 3.5;
            updateCurve();
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          this.retune();
        },
        engage() {
          ramp = makeRamp(c, 1 / divSeconds(env, beatIdx));
          shaper = c.createWaveShaper();
          updateCurve();
          ramp.connect(shaper);
          shaper.connect(g.gain);
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
          g.gain.cancelScheduledValues(c.currentTime);
          g.gain.value = 1;
          return 0;
        },
        retune() {
          if (ramp) {
            setRampFreq(c, ramp, 1 / divSeconds(env, beatIdx));
          }
        },
      };
    }

    case "pan": {
      const panner = c.createStereoPanner();
      let osc: OscillatorNode | null = null;
      let width: GainNode | null = null;
      let beatIdx = 6;
      let widthValue = 1;

      panner.pan.value = 0;

      input.connect(panner);
      panner.connect(output);

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            widthValue = v;
            if (width) width.gain.value = widthValue;
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          this.retune();
        },
        engage() {
          osc = c.createOscillator();
          width = c.createGain();
          osc.type = "sine";
          osc.frequency.value = 1 / divSeconds(env, beatIdx);
          width.gain.value = widthValue;
          osc.connect(width);
          width.connect(panner.pan);
          startAligned(c, osc, env);
        },
        release() {
          if (osc) {
            osc.stop();
            osc.disconnect();
            osc = null;
          }
          if (width) {
            width.disconnect();
            width = null;
          }
          panner.pan.setValueAtTime(0, c.currentTime);
          return 0;
        },
        retune() {
          if (osc) {
            osc.frequency.setTargetAtTime(1 / divSeconds(env, beatIdx), c.currentTime, 0.03);
          }
        },
      };
    }

    case "pitch": {
      // Direct bypass until engaged
      input.connect(output);
      let shift: Tone.PitchShift | null = null;
      let semiTones = 5; // Default +5 semitones

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            semiTones = Math.round(-12 + v * 24);
            if (shift) shift.pitch = semiTones;
          }
        },
        engage() {
          if (shift) return; // Already engaged
          try {
            const fxIn = c.createGain();
            const fxOut = c.createGain();
            shift = new Tone.PitchShift({
              pitch: semiTones,
              windowSize: 0.1,
              feedback: 0,
              wet: 1
            });
            Tone.connect(fxIn, shift);
            Tone.connect(shift, fxOut);
            input.disconnect(output);
            input.connect(fxIn);
            fxOut.connect(output);
          } catch {
            // Fall back to bypass if Tone.js fails (e.g., offline context)
          }
        },
        release() {
          return 0;
        },
        setBeat() {},
        retune() {},
      };
    }

    default:
      throw new Error(`Unknown effect: ${name}`);
  }
}
