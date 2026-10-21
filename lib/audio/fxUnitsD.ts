import { divSeconds, makeRamp, setRampFreq, FxEnv, FxUnit } from "./fxTypes";

// Stem performance FX: build-up roll, note freeze, half-time.
export function buildUnitD(name: "build" | "freeze" | "halftime", env: FxEnv): FxUnit {
  const c = env.ctx;
  const input = new GainNode(c, { gain: 1 });
  const output = new GainNode(c, { gain: 1 });

  switch (name) {
    // BUILD: the stem is captured and rolled, the roll gets shorter stage by stage
    // (1/2 → 1/4 → 1/8 → 1/16 → 1/32 of a beat) while a high-pass rises: a drum roll
    // / riser from any stem, ready to drop on release.
    case "build": {
      const STAGES = [1 / 2, 1 / 4, 1 / 8, 1 / 16, 1 / 32];
      const SHARE = [0.3, 0.25, 0.2, 0.15, 0.1]; // part of the build spent on each stage
      const LENGTHS = [2, 4, 8, 16]; // beats
      const delay = c.createDelay(4);
      const hp = new BiquadFilterNode(c, { type: "highpass", frequency: 20, Q: 0.9 });
      const fb = new GainNode(c, { gain: 0 });
      const gateIn = new GainNode(c, { gain: 1 });
      const sum = new GainNode(c, { gain: 1 });
      input.connect(gateIn).connect(sum).connect(delay).connect(hp).connect(output);
      delay.connect(fb).connect(sum);
      let beats = 8;
      let topHz = 2500;
      const half = () => Math.min(3.9, Math.max(0.02, env.beat().period * STAGES[0]));
      delay.delayTime.value = half();
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") beats = LENGTHS[Math.min(3, Math.floor(v * 4))];
          else topHz = 200 * Math.pow(25, v);
        },
        setBeat() {},
        engage() {
          const t = c.currentTime;
          const period = env.beat().period;
          gateIn.gain.setTargetAtTime(0, t, 0.004);
          fb.gain.setValueAtTime(0.998, t); // near 1: the 1/32 stage repeats ~64×/s and must not die out
          // Each stage halves the loop. Switching exactly `next` seconds into a cycle
          // of the current loop makes the shorter loop repeat the START of the
          // captured slice (switching anywhere else repeats a later part, often the
          // silence between two hits).
          let loop = Math.max(0.005, period * STAGES[0]);
          let origin = t;
          let planned = t;
          delay.delayTime.setValueAtTime(loop, t);
          for (let k = 1; k < STAGES.length; k++) {
            planned += beats * period * SHARE[k - 1];
            const next = Math.max(0.005, period * STAGES[k]);
            const at = origin + next + Math.max(0, Math.ceil((planned - origin - next) / loop)) * loop;
            delay.delayTime.setValueAtTime(next, at);
            origin = at;
            loop = next;
          }
          hp.frequency.cancelScheduledValues(t);
          hp.frequency.setValueAtTime(20, t);
          hp.frequency.exponentialRampToValueAtTime(topHz, t + beats * period);
        },
        release() {
          const t = c.currentTime;
          delay.delayTime.cancelScheduledValues(t);
          hp.frequency.cancelScheduledValues(t);
          gateIn.gain.setTargetAtTime(1, t, 0.004);
          fb.gain.setValueAtTime(0, t);
          delay.delayTime.setValueAtTime(half(), t);
          hp.frequency.setValueAtTime(20, t);
          return 0;
        },
        retune() {
          if (fb.gain.value === 0) delay.delayTime.setTargetAtTime(half(), c.currentTime, 0.05);
        },
      };
    }

    // FREEZE: holds the last grain of the stem forever, smeared by all-pass
    // diffusion into a pad (freeze a vocal note or a chord while the beat goes on).
    case "freeze": {
      const delay = c.createDelay(1);
      const ap1 = new BiquadFilterNode(c, { type: "allpass", frequency: 700, Q: 0.6 });
      const ap2 = new BiquadFilterNode(c, { type: "allpass", frequency: 2300, Q: 0.6 });
      const lp = new BiquadFilterNode(c, { type: "lowpass", frequency: 6000, Q: 0.5 });
      const fb = new GainNode(c, { gain: 0 });
      const gateIn = new GainNode(c, { gain: 1 });
      const sum = new GainNode(c, { gain: 1 });
      input.connect(gateIn).connect(sum).connect(delay).connect(ap1).connect(ap2).connect(lp).connect(output);
      lp.connect(fb).connect(sum);
      delay.delayTime.value = 0.18;
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") delay.delayTime.setTargetAtTime(0.06 + v * 0.54, c.currentTime, 0.02);
          else lp.frequency.setTargetAtTime(1000 * Math.pow(16, v), c.currentTime, 0.03);
        },
        setBeat() {},
        engage() {
          const t = c.currentTime;
          gateIn.gain.setTargetAtTime(0, t, 0.01);
          fb.gain.setTargetAtTime(0.995, t, 0.005);
        },
        release() {
          const t = c.currentTime;
          // the frozen pad fades out instead of stopping dead; the live stem comes back after it
          fb.gain.setTargetAtTime(0, t, 0.08);
          gateIn.gain.setTargetAtTime(1, t + 0.3, 0.01);
          return 0.25;
        },
        retune() {},
      };
    }

    // HALF: half-time. In each window (beat division) the stem is replayed at half
    // speed from the window start — heavier groove, an octave down — with short
    // fades hiding the window jumps. Windows stay on the beat grid.
    case "halftime": {
      const delay = c.createDelay(8);
      const lp = new BiquadFilterNode(c, { type: "lowpass", frequency: 20000, Q: 0.5 });
      const fade = new GainNode(c, { gain: 0 });
      const depth = new GainNode(c, { gain: 0 });
      const edges = new WaveShaperNode(c, {
        curve: Float32Array.from({ length: 1024 }, (_, i) => Math.min(1, (1 - Math.abs(-1 + (2 * i) / 1023)) * 20)),
      });
      input.connect(delay).connect(lp).connect(fade).connect(output);
      let beatIdx = 5;
      let ramp: AudioBufferSourceNode | null = null;
      const span = () => Math.min(7.9, divSeconds(env, beatIdx));
      const tune = () => {
        const w = span();
        delay.delayTime.setTargetAtTime(w / 4, c.currentTime, 0.01);
        depth.gain.setTargetAtTime(w / 4, c.currentTime, 0.01); // delay sweeps 0 → w/2 per window = half speed
        if (ramp) setRampFreq(c, ramp, 1 / w);
      };
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") lp.frequency.setTargetAtTime(400 * Math.pow(50, v), c.currentTime, 0.03);
        },
        setBeat(idx) {
          beatIdx = idx;
          tune();
        },
        engage() {
          const w = span();
          ramp = makeRamp(c, 1 / w);
          ramp.connect(depth).connect(delay.delayTime);
          ramp.connect(edges).connect(fade.gain);
          tune();
          // start mid-window so the windows land on the beats, without waiting for the next one
          const into = (w - (env.beat().toNext % w)) / w;
          ramp.start(c.currentTime, into * (ramp.buffer!.duration));
        },
        release() {
          if (ramp) {
            try { ramp.stop(); } catch {}
            ramp.disconnect();
            ramp = null;
          }
          return 0;
        },
        retune() {
          tune();
        },
      };
    }
  }
}
