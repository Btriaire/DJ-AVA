"use client"


export type HallName = "chambre" | "salle" | "eglise" | "cathedrale"

export const HALLS: Record<HallName, { label: string, seconds: number, damping: number, preDelayMs: number, hint: string }> = {
  chambre: { label: "Chambre", seconds: 1.2, damping: 0.25, preDelayMs: 8, hint: "Intime, pour piano seul ou quatuor" },
  salle: { label: "Salle", seconds: 2.4, damping: 0.35, preDelayMs: 18, hint: "Salle de concert classique" },
  eglise: { label: "Église", seconds: 3.8, damping: 0.45, preDelayMs: 28, hint: "Pierre et nef, chant et orgue" },
  cathedrale: { label: "Cathédrale", seconds: 6.5, damping: 0.55, preDelayMs: 40, hint: "Très longue, musique sacrée" }
}

export function hallImpulse(sampleRate: number, name: HallName, rand: () => number = Math.random): [Float32Array, Float32Array] {
  const { seconds, damping, preDelayMs } = HALLS[name]
  const preDelaySamples = Math.round(preDelayMs * sampleRate / 1000)
  const totalSamples = Math.round((preDelayMs / 1000 + seconds) * sampleRate)
  const impulse: [Float32Array, Float32Array] = [new Float32Array(totalSamples), new Float32Array(totalSamples)]

  for (let channel = 0; channel < 2; channel++) {
    let y = 0
    for (let i = 0; i < totalSamples; i++) {
      if (i < preDelaySamples) {
        impulse[channel][i] = 0
        continue
      }
      const t = (i - preDelaySamples) / sampleRate
      const env = Math.pow(10, -3 * t / seconds)
      const a = Math.max(0.04, 1 - damping * (0.5 + t / seconds))
      y += a * ((rand() * 2 - 1) * env - y)
      impulse[channel][i] = y
    }

    // Ajoute 6 réflexions précoces
    for (let i = 0; i < 6; i++) {
      const delay = Math.round((5 + rand() * 55) * sampleRate / 1000) + preDelaySamples
      if (delay < totalSamples) {
        impulse[channel][delay] += (6 - i) * 0.05
      }
    }
  }

  // Normalise
  let maxAbs = 0
  for (let i = 0; i < totalSamples; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(impulse[0][i]), Math.abs(impulse[1][i]))
  }
  const scale = 0.5 / maxAbs
  for (let i = 0; i < totalSamples; i++) {
    impulse[0][i] *= scale
    impulse[1][i] *= scale
  }

  return impulse
}

export class ConcertHall {
  private ctx: AudioContext
  private from: AudioNode
  private to: AudioNode
  private sendGain: GainNode
  private convolver: ConvolverNode
  private toneFilter: BiquadFilterNode
  private wetGain: GainNode
  private amount: number = 0
  private timeoutId: number | null = null

  constructor(ctx: AudioContext, from: AudioNode, to: AudioNode) {
    this.ctx = ctx
    this.from = from
    this.to = to

    this.sendGain = ctx.createGain()
    this.convolver = ctx.createConvolver()
    this.toneFilter = ctx.createBiquadFilter()
    this.wetGain = ctx.createGain()

    this.sendGain.gain.value = 0
    this.wetGain.gain.value = 0
    this.toneFilter.type = "lowpass"
    this.toneFilter.frequency.value = 16000

    this.from.connect(this.sendGain)
    this.sendGain.connect(this.convolver)
    this.convolver.connect(this.toneFilter)
    this.toneFilter.connect(this.wetGain)
    this.wetGain.connect(this.to)

    this.setHall("salle")
  }

  setHall(name: HallName) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    this.wetGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
    this.timeoutId = window.setTimeout(() => {
      const impulse = hallImpulse(this.ctx.sampleRate, name)
      const audioBuffer = this.ctx.createBuffer(2, impulse[0].length, this.ctx.sampleRate)
      audioBuffer.getChannelData(0).set(impulse[0])
      audioBuffer.getChannelData(1).set(impulse[1])
      this.convolver.buffer = audioBuffer
      this.wetGain.gain.setTargetAtTime(this.amount * 0.6, this.ctx.currentTime, 0.05)
    }, 80)
  }

  setAmount(v: number) {
    this.amount = v
    this.wetGain.gain.setTargetAtTime(v * 0.6, this.ctx.currentTime, 0.3)
    this.sendGain.gain.value = v > 0.001 ? 1 : 0
  }

  setWarmth(v: number) {
    this.toneFilter.frequency.setTargetAtTime(16000 * Math.pow(3000 / 16000, v), this.ctx.currentTime, 0.2)
  }

  dispose() {
    this.from.disconnect(this.sendGain)
    this.sendGain.disconnect(this.convolver)
    this.convolver.disconnect(this.toneFilter)
    this.toneFilter.disconnect(this.wetGain)
    this.wetGain.disconnect(this.to)
  }
}

export function hallSelfCheck(): string[] {
  const errors: string[] = [];
  const sampleRate = 8000;
  const randGen = (seed: number) => {
    let s = seed;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
  const hallNames = Object.keys(HALLS) as HallName[];
  let chambreLength = 0;
  let cathedraleLength = 0;
  for (const name of hallNames) {
    const rand = randGen(12345);
    const [irL, irR] = hallImpulse(sampleRate, name, rand);
    const expectedLength = Math.round((HALLS[name].preDelayMs / 1000 + HALLS[name].seconds) * sampleRate);
    if (irL.some(isNaN) || irR.some(isNaN)) {
      errors.push(`${name}: NaN value detected`);
    }
    let maxAbs = 0;
    for (let i = 0; i < irL.length; i++) {
      const absL = Math.abs(irL[i]);
      const absR = Math.abs(irR[i]);
      maxAbs = Math.max(maxAbs, absL, absR);
    }
    if (Math.abs(maxAbs - 0.5) > 1e-6) {
      errors.push(`${name}: max commun différent de 0.5`);
    }    if (irL.length !== expectedLength || irR.length !== expectedLength) {
      errors.push(`${name}: Incorrect impulse response length`);
    }
    const halfLength = Math.floor(irL.length / 2);
    const energyFirstHalf = irL.slice(0, halfLength).reduce((sum, val) => sum + val * val, 0);
    const energySecondHalf = irL.slice(halfLength).reduce((sum, val) => sum + val * val, 0);
    if (energySecondHalf > energyFirstHalf) {
      errors.push(`${name}: Energy of second half greater than first half`);
    }
    if (name === "chambre") {
      chambreLength = irL.length;
    } else if (name === "cathedrale") {
      cathedraleLength = irL.length;
    }
  }
  if (cathedraleLength <= chambreLength) {
    errors.push("cathedrale length not greater than chambre length");
  }
  return errors;
}
