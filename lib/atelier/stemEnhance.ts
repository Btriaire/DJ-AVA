import * as ed from "./edit";
import * as se from "./stemEdit";

type Region = { a: number; b: number };

export type Enhancement = {
  key: string;
  label: string;
  hint: string;
  run: (buf: AudioBuffer) => Promise<AudioBuffer> | AudioBuffer;
};

export function enhanceOptions(stemName: string): Enhancement[] {
  const full: Region = { a: 0, b: Infinity };
  const common: Enhancement[] = [
    {
      key: "normalize",
      label: "Normaliser",
      hint: "Remonte le pic à -1 dB sans toucher à la dynamique",
      run: (buf) => se.normalize(buf, full, -1),
    },
    {
      key: "dc",
      label: "Retirer le DC",
      hint: "Supprime un décalage continu parasite",
      run: (buf) => se.removeDC(buf),
    },
    {
      key: "declick",
      label: "Supprimer les clics",
      hint: "Corrige les pics isolés (clics, craquements)",
      run: (buf) => {
        const out = new AudioBuffer({
          length: buf.length,
          numberOfChannels: buf.numberOfChannels,
          sampleRate: buf.sampleRate,
        });

        for (let c = 0; c < buf.numberOfChannels; c++) {
          const src = buf.getChannelData(c);
          const dst = out.getChannelData(c);
          declick(src, dst);
        }

        return out;
      },
    },
    {
      key: "denoise",
      label: "Réduire le bruit",
      hint: "Coupe le souffle entre les notes (gate à -50 dB)",
      run: (buf) => se.gate(buf, full, -50, 2, 60, 120),
    },
  ];

  const typeSpecific: Record<string, Enhancement[]> = {
    drums: [
      {
        key: "punch",
        label: "Punch",
        hint: "Accentue les attaques, garde le corps",
        run: (buf) => se.transient(buf, full, 6, -3),
      },
      {
        key: "dcomp",
        label: "Compresser",
        hint: "Compression douce pour la cohésion",
        run: (buf) =>
          se.compress(buf, full, {
            thresholdDb: -18,
            ratio: 3,
            attackMs: 10,
            releaseMs: 120,
            makeupDb: 2,
          }),
      },
      {
        key: "bright",
        label: "Cymbales claires",
        hint: "Aigus +2 dB au-dessus de 8 kHz",
        run: (buf) => ed.eq(buf, { low: 0, mid: 0, high: 2, hp: 30, lp: 20000 }),
      },
    ],
    bass: [
      {
        key: "warm",
        label: "Chaleur",
        hint: "Basses +3 dB, coupe le grave inutile sous 30 Hz",
        run: (buf) => ed.eq(buf, { low: 3, mid: 0, high: 0, hp: 30, lp: 18000 }),
      },
      {
        key: "sat",
        label: "Saturation douce",
        hint: "Ajoute des harmoniques pour se entendre sur petites enceintes",
        run: (buf) => saturate(buf, 1.4, 0.25),
      },
      {
        key: "bcomp",
        label: "Compresser",
        hint: "Tient le niveau de la basse",
        run: (buf) =>
          se.compress(buf, full, {
            thresholdDb: -20,
            ratio: 4,
            attackMs: 15,
            releaseMs: 150,
            makeupDb: 2,
          }),
      },
    ],
    vocals: [
      {
        key: "presence",
        label: "Présence voix",
        hint: "Médiums +3 dB à 1 kHz et aigus +2 dB, coupe le grave sous 80 Hz",
        run: (buf) => ed.eq(buf, { low: 0, mid: 3, high: 2, hp: 80, lp: 16000 }),
      },
      {
        key: "vcomp",
        label: "Compresser voix",
        hint: "Niveau régulier entre les phrases",
        run: (buf) =>
          se.compress(buf, full, {
            thresholdDb: -20,
            ratio: 3,
            attackMs: 8,
            releaseMs: 120,
            makeupDb: 2,
          }),
      },
      {
        key: "vgate",
        label: "Couper le souffle",
        hint: "Gate à -45 dB entre les phrases",
        run: (buf) => se.gate(buf, full, -45, 3, 80, 150),
      },
    ],
    other: [
      {
        key: "air",
        label: "Air",
        hint: "Aigus +3 dB au-dessus de 10 kHz",
        run: (buf) => ed.eq(buf, { low: 0, mid: 0, high: 3, hp: 30, lp: 20000 }),
      },
      {
        key: "width",
        label: "Élargir",
        hint: "Élargit l'image stéréo (mid/side x1.3)",
        run: (buf) => widen(buf, 1.3),
      },
      {
        key: "sat",
        label: "Saturation douce",
        hint: "Chaleur par saturation légère",
        run: (buf) => saturate(buf, 1.3, 0.2),
      },
    ],
  };

  const stemType = stemName.toLowerCase();
  const specific = typeSpecific[stemType] || typeSpecific.other;
  return [...common, ...specific];
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
