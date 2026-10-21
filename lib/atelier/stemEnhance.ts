import * as ed from "./edit";
import * as se from "./stemEdit";

type Region = { a: number; b: number };

export type Family = "clean" | "dynamic" | "balance" | "color";

export type Enhancement = {
  key: string;
  label: string;
  hint: string;
  family: Family;
  run: (buf: AudioBuffer) => Promise<AudioBuffer> | AudioBuffer;
};

const full: Region = { a: 0, b: Infinity };

export function enhanceOptions(stemName: string): Enhancement[] {
  const stemType = stemName.toLowerCase();
  const lowCut = stemType === "vocals" ? 100 : stemType === "bass" ? 25 : stemType === "drums" ? 30 : 60;
  const common: Enhancement[] = [
    {
      key: "normalize",
      label: "Normaliser",
      hint: "Remonte le pic à -1 dB sans toucher à la dynamique",
      family: "clean",
      run: (buf) => se.normalize(buf, full, -1),
    },
    {
      key: "dc",
      label: "Retirer le DC",
      hint: "Supprime un décalage continu parasite",
      family: "clean",
      run: (buf) => se.removeDC(buf),
    },
    {
      key: "declick",
      label: "Supprimer les clics",
      hint: "Corrige les pics isolés (clics, craquements)",
      family: "clean",
      run: (buf) => {
        const out = blank(buf);
        for (let c = 0; c < buf.numberOfChannels; c++) declick(buf.getChannelData(c), out.getChannelData(c));
        return out;
      },
    },
    {
      key: "denoise",
      label: "Réduire le bruit",
      hint: "Coupe le souffle entre les notes (gate à -50 dB)",
      family: "clean",
      run: (buf) => se.gate(buf, full, -50, 2, 60, 120),
    },
    {
      key: "lowcut",
      label: "Coupe-bas",
      hint: `Retire le grave inutile sous ${lowCut} Hz (grondements, bruits de manipulation) : le mix respire`,
      family: "clean",
      run: (buf) => ed.eq(buf, { low: 0, mid: 0, high: 0, hp: lowCut, lp: 20000 }),
    },
    {
      key: "loud",
      label: "Plus fort",
      hint: "+4 dB puis limiteur à -1 dB : plus de présence sans écrêter",
      family: "dynamic",
      run: (buf) => se.limit(se.gain(buf, full, 4), full, -1, 5, 60),
    },
  ];

  const typeSpecific: Record<string, Enhancement[]> = {
    drums: [
      {
        key: "punch",
        label: "Punch",
        hint: "Accentue les attaques, garde le corps",
        family: "dynamic",
        run: (buf) => se.transient(buf, full, 6, -3),
      },
      {
        key: "dcomp",
        label: "Compresser",
        hint: "Compression douce pour la cohésion",
        family: "dynamic",
        run: (buf) => se.compress(buf, full, { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, makeupDb: 2 }),
      },
      {
        key: "pcomp",
        label: "Compression parallèle",
        hint: "Mélange la batterie écrasée à l'originale : plus épaisse, attaques gardées (« New York »)",
        family: "dynamic",
        run: async (buf) => {
          const crushed = await se.compress(buf, full, { thresholdDb: -32, ratio: 10, attackMs: 3, releaseMs: 80, makeupDb: 10 });
          return se.limit(mix(buf, 0.8, crushed, 0.5), full, -1, 5, 60);
        },
      },
      {
        key: "tight",
        label: "Resserrer",
        hint: "Attaques +2 dB, queues -6 dB : batterie sèche et précise, moins de pièce",
        family: "dynamic",
        run: (buf) => se.transient(buf, full, 2, -6),
      },
      {
        key: "bright",
        label: "Cymbales claires",
        hint: "Aigus +2 dB au-dessus de 8 kHz",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 0, mid: 0, high: 2, hp: 30, lp: 20000 }),
      },
      {
        key: "kick",
        label: "Kick plus rond",
        hint: "Graves +3 dB, médiums -1,5 dB : un kick plus gros, moins de carton",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 3, mid: -1.5, high: 0, hp: 30, lp: 20000 }),
      },
      {
        key: "room",
        label: "Pièce",
        hint: "Petite réverbération de pièce (0,6 s, 15 %) : batterie moins plate",
        family: "color",
        run: (buf) => reverb(buf, 0.6, 0.15),
      },
    ],
    bass: [
      {
        key: "warm",
        label: "Chaleur",
        hint: "Basses +3 dB, coupe le grave inutile sous 30 Hz",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 3, mid: 0, high: 0, hp: 30, lp: 18000 }),
      },
      {
        key: "sub",
        label: "Sub +",
        hint: "Graves +4 dB sous 100 Hz : plus de sub en club",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 4, mid: 0, high: 0, hp: 25, lp: 18000 }),
      },
      {
        key: "define",
        label: "Définition",
        hint: "Médiums +3 dB à 1 kHz : la basse s'entend aussi sur petites enceintes",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 0, mid: 3, high: 0, hp: 25, lp: 18000 }),
      },
      {
        key: "bcomp",
        label: "Compresser",
        hint: "Tient le niveau de la basse",
        family: "dynamic",
        run: (buf) => se.compress(buf, full, { thresholdDb: -20, ratio: 4, attackMs: 15, releaseMs: 150, makeupDb: 2 }),
      },
      {
        key: "sat",
        label: "Saturation douce",
        hint: "Ajoute des harmoniques pour s'entendre sur petites enceintes",
        family: "color",
        run: (buf) => saturate(buf, 1.4, 0.25),
      },
      {
        key: "growl",
        label: "Grognement",
        hint: "Saturation franche : basse plus agressive",
        family: "color",
        run: (buf) => saturate(buf, 2.6, 0.45),
      },
      {
        key: "bmono",
        label: "Basse mono",
        hint: "Met la basse au centre (standard club : grave solide sur tous les systèmes)",
        family: "color",
        run: (buf) => se.mono(buf, full),
      },
    ],
    vocals: [
      {
        key: "deess",
        label: "De-esser",
        hint: "Adoucit les « s » et « ch » sifflants sans ternir la voix",
        family: "clean",
        run: (buf) => deEss(buf, -32, 9),
      },
      {
        key: "vgate",
        label: "Couper le souffle",
        hint: "Gate à -45 dB entre les phrases",
        family: "clean",
        run: (buf) => se.gate(buf, full, -45, 3, 80, 150),
      },
      {
        key: "vcomp",
        label: "Compresser voix",
        hint: "Niveau régulier entre les phrases",
        family: "dynamic",
        run: (buf) => se.compress(buf, full, { thresholdDb: -20, ratio: 3, attackMs: 8, releaseMs: 120, makeupDb: 2 }),
      },
      {
        key: "presence",
        label: "Présence voix",
        hint: "Médiums +3 dB à 1 kHz et aigus +2 dB, coupe le grave sous 80 Hz",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 0, mid: 3, high: 2, hp: 80, lp: 16000 }),
      },
      {
        key: "vwarm",
        label: "Chaleur voix",
        hint: "Bas +2 dB, aigus -1 dB : voix plus ronde et douce",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 2, mid: 0, high: -1, hp: 90, lp: 18000 }),
      },
      {
        key: "double",
        label: "Doublage stéréo",
        hint: "Deux copies légèrement décalées à gauche et à droite : voix large et épaisse",
        family: "color",
        run: (buf) => doubler(buf),
      },
      {
        key: "plate",
        label: "Réverb plate",
        hint: "Réverbération de plaque (1,6 s, 22 %) : la voix prend de l'espace",
        family: "color",
        run: (buf) => reverb(buf, 1.6, 0.22),
      },
      {
        key: "phone",
        label: "Effet téléphone",
        hint: "Bande étroite 400 Hz - 3,4 kHz et saturation : voix radio / téléphone",
        family: "color",
        run: async (buf) => saturate(await ed.eq(buf, { low: 0, mid: 4, high: 0, hp: 400, lp: 3400 }), 1.8, 0.4),
      },
    ],
    other: [
      {
        key: "air",
        label: "Air",
        hint: "Aigus +3 dB au-dessus de 10 kHz",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 0, mid: 0, high: 3, hp: 30, lp: 20000 }),
      },
      {
        key: "dark",
        label: "Assombrir",
        hint: "Aigus -3 dB : instrument plus doux, laisse la place à la voix",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 0, mid: 0, high: -3, hp: 30, lp: 20000 }),
      },
      {
        key: "scoop",
        label: "Creuser les médiums",
        hint: "Médiums -3 dB à 1 kHz : libère de la place pour la voix",
        family: "balance",
        run: (buf) => ed.eq(buf, { low: 0, mid: -3, high: 0, hp: 30, lp: 20000 }),
      },
      {
        key: "width",
        label: "Élargir",
        hint: "Élargit l'image stéréo (mid/side x1.3)",
        family: "color",
        run: (buf) => widen(buf, 1.3),
      },
      {
        key: "chorus",
        label: "Chorus",
        hint: "Copies légèrement désaccordées qui ondulent : son ample et mouvant",
        family: "color",
        run: (buf) => chorus(buf),
      },
      {
        key: "hall",
        label: "Réverb",
        hint: "Réverbération de salle (2 s, 20 %)",
        family: "color",
        run: (buf) => reverb(buf, 2, 0.2),
      },
      {
        key: "sat",
        label: "Saturation douce",
        hint: "Chaleur par saturation légère",
        family: "color",
        run: (buf) => saturate(buf, 1.3, 0.2),
      },
    ],
  };

  const specific = typeSpecific[stemType] || typeSpecific.other;
  return [...common, ...specific];
}

function blank(buf: AudioBuffer, channels = buf.numberOfChannels): AudioBuffer {
  return new AudioBuffer({ length: buf.length, numberOfChannels: channels, sampleRate: buf.sampleRate });
}

// a·x + b·y, sample by sample (same length and channels)
function mix(x: AudioBuffer, a: number, y: AudioBuffer, b: number): AudioBuffer {
  const out = blank(x);
  for (let c = 0; c < x.numberOfChannels; c++) {
    const xs = x.getChannelData(c);
    const ys = y.getChannelData(Math.min(c, y.numberOfChannels - 1));
    const o = out.getChannelData(c);
    for (let i = 0; i < xs.length; i++) o[i] = a * xs[i] + b * ys[i];
  }
  return out;
}

// dry + convolution with a decaying-noise impulse response; the tail past the end is cut (length kept)
async function reverb(buf: AudioBuffer, seconds: number, wet: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const ir = ctx.createBuffer(2, Math.round(seconds * buf.sampleRate), buf.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet * 4 * Math.sqrt(2 / seconds); // a normalized IR spreads its energy: makeup grows as the tail shortens
  src.connect(ctx.destination);
  src.connect(conv).connect(wetGain).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

// de-esser: the band above ~5 kHz is turned down while it is loud (sibilants), the rest is untouched
function deEss(buf: AudioBuffer, thresholdDb: number, maxCutDb: number): AudioBuffer {
  const out = blank(buf);
  const sr = buf.sampleRate;
  const rc = 1 / (2 * Math.PI * 5000);
  const a = rc / (rc + 1 / sr);
  const att = Math.exp(-1 / (0.001 * sr));
  const rel = Math.exp(-1 / (0.06 * sr));
  const thr = Math.pow(10, thresholdDb / 20);
  const floor = Math.pow(10, -maxCutDb / 20);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    const o = out.getChannelData(c);
    let hp = 0;
    let prev = 0;
    let env = 0;
    for (let i = 0; i < x.length; i++) {
      hp = a * (hp + x[i] - prev);
      prev = x[i];
      const level = Math.abs(hp);
      env = level > env ? att * env + (1 - att) * level : rel * env + (1 - rel) * level;
      const g = env > thr ? Math.max(floor, Math.pow(thr / env, 0.7)) : 1;
      o[i] = x[i] - hp + hp * g;
    }
  }
  return out;
}

// reads x at fractional delay d (samples), linear interpolation
function tap(x: Float32Array, i: number, d: number): number {
  const p = i - d;
  const k = Math.floor(p);
  if (k < 0 || k + 1 >= x.length) return 0;
  const f = p - k;
  return x[k] * (1 - f) + x[k + 1] * f;
}

// two slowly drifting delayed copies (11 ms left, 17 ms right) for a double-tracked voice
function doubler(buf: AudioBuffer): AudioBuffer {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(Math.min(1, buf.numberOfChannels - 1));
  const out = blank(buf);
  const oL = out.getChannelData(0);
  const oR = out.getChannelData(Math.min(1, buf.numberOfChannels - 1));
  for (let i = 0; i < L.length; i++) {
    const t = i / sr;
    const dl = (0.011 + 0.0012 * Math.sin(2 * Math.PI * 0.27 * t)) * sr;
    const dr = (0.017 + 0.0012 * Math.sin(2 * Math.PI * 0.31 * t + 1.7)) * sr;
    const l = 0.8 * L[i] + 0.45 * tap(R, i, dl);
    const r = 0.8 * R[i] + 0.45 * tap(L, i, dr);
    if (oL === oR) oL[i] = (l + r) / 2;
    else {
      oL[i] = l;
      oR[i] = r;
    }
  }
  return out;
}

// classic chorus: 15 ms ± 3 ms modulated copy, opposite phase on each side
function chorus(buf: AudioBuffer): AudioBuffer {
  const sr = buf.sampleRate;
  const out = blank(buf);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    const o = out.getChannelData(c);
    const phase = c * Math.PI;
    for (let i = 0; i < x.length; i++) {
      const d = (0.015 + 0.003 * Math.sin(2 * Math.PI * 0.8 * (i / sr) + phase)) * sr;
      o[i] = 0.75 * x[i] + 0.45 * tap(x, i, d);
    }
  }
  return out;
}

function saturate(buf: AudioBuffer, drive: number, mix: number): AudioBuffer {
  const out = new AudioBuffer({
    length: buf.length,
    numberOfChannels: buf.numberOfChannels,
    sampleRate: buf.sampleRate,
  });

  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);

    for (let i = 0; i < src.length; i++) {
      const x = src[i];
      const y = Math.tanh(drive * x) / Math.tanh(drive);
      dst[i] = (1 - mix) * x + mix * y;
    }
  }

  return out;
}

function widen(buf: AudioBuffer, factor: number): AudioBuffer {
  if (buf.numberOfChannels !== 2) return buf;

  const out = new AudioBuffer({
    length: buf.length,
    numberOfChannels: 2,
    sampleRate: buf.sampleRate,
  });

  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const Lout = out.getChannelData(0);
  const Rout = out.getChannelData(1);

  for (let i = 0; i < L.length; i++) {
    const m = (L[i] + R[i]) / 2;
    let s = (L[i] - R[i]) / 2;
    s *= factor;
    Lout[i] = m + s;
    Rout[i] = m - s;
  }

  return out;
}

function declick(src: Float32Array, dst: Float32Array): void {
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < src.length; i++) {
    if (i < halfWindow || i >= src.length - halfWindow) {
      dst[i] = src[i];
      continue;
    }

    const window = [];
    for (let j = -halfWindow; j <= halfWindow; j++) {
      window.push(src[i + j]);
    }

    const sorted = [...window].sort((a, b) => Math.abs(a) - Math.abs(b));
    const median = sorted[Math.floor(windowSize / 2)];

    const neighbors = [
      Math.abs(src[i - 1]),
      Math.abs(src[i - 2]),
      Math.abs(src[i + 1]),
      Math.abs(src[i + 2]),
    ];
    const maxNeighbor = Math.max(...neighbors, 0.02);

    if (Math.abs(src[i] - median) > 0.25 * maxNeighbor) {
      dst[i] = median;
    } else {
      dst[i] = src[i];
    }
  }
}
