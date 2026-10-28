export type FxName =
  | "echo" | "reverb" | "flanger" | "phaser" | "gate"
  | "roll" | "brake" | "reverse" | "sweep" | "wobble" | "pump" | "pan"
  | "noise" | "crush" | "pitch"
  | "dub" | "ring" | "tape" | "mash" | "vowel" | "scatter"
  | "build" | "freeze" | "halftime" | "double" | "rise" | "echoout" | "wash";

export const BEAT_DIVS: number[] = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4, 8, 16];
export const BEAT_LABELS: string[] = ["1/16", "1/8", "1/4", "1/2", "3/4", "1", "2", "4", "8", "16"];

export interface BeatInfo { period: number; toNext: number }
export interface FxEnv { ctx: BaseAudioContext; beat: () => BeatInfo }

export interface FxUnit {
  input: AudioNode;
  output: AudioNode;
  setParam(key: "p1" | "p2", v: number): void;
  setBeat(idx: number): void;
  engage(): void;
  release(): number;
  retune(): void;
}

export function divSeconds(env: FxEnv, idx: number): number {
  const i = Math.max(0, Math.min(BEAT_DIVS.length - 1, Math.round(idx)));
  return env.beat().period * BEAT_DIVS[i];
}

const RAMP_LEN = 4096;
export function makeRamp(ctx: BaseAudioContext, freq: number): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, RAMP_LEN, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < RAMP_LEN; i++) d[i] = -1 + (2 * i) / (RAMP_LEN - 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = (RAMP_LEN / ctx.sampleRate) * freq;
  return src;
}
export function setRampFreq(ctx: BaseAudioContext, src: AudioBufferSourceNode, freq: number): void {
  src.playbackRate.setTargetAtTime((RAMP_LEN / ctx.sampleRate) * freq, ctx.currentTime, 0.05);
}
export function startAligned(ctx: BaseAudioContext, node: AudioScheduledSourceNode, env: FxEnv): number {
  const when = ctx.currentTime + Math.max(0, env.beat().toNext);
  node.start(when);
  return when;
}

export interface FxParamMeta { label: string; def: number; fmt: (v: number) => string }
export interface FxMeta {
  id: FxName;
  label: string;
  color: string;
  glyph: string;
  title: string;
  insert: boolean;
  always: boolean;
  trigger: boolean;
  beat: number | null;
  p1: FxParamMeta | null;
  p2: FxParamMeta | null;
  sendGain: number;
}

function fmtHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

export const FX_LIST: FxMeta[] = [
  {
    id: "echo",
    label: "ECHO",
    color: "#ffcc00",
    glyph: "⟲",
    title: "Répétitions du son calées sur le tempo",
    insert: false,
    always: false,
    trigger: false,
    beat: 3,
    p1: { label: "Retour", def: 0.5, fmt: (v) => `${Math.round(v * 92)}%` },
    p2: { label: "Ton", def: 0.6, fmt: (v) => fmtHz(800 * Math.pow(15, v)) },
    sendGain: 1.0
  },
  {
    id: "reverb",
    label: "REVERB",
    color: "#60a5fa",
    glyph: "〰",
    title: "Salle de réverbération pour donner de l'espace",
    insert: false,
    always: false,
    trigger: false,
    beat: null,
    p1: { label: "Pré-délai", def: 0.1, fmt: (v) => `${Math.round(v * 120)} ms` },
    p2: { label: "Amorti", def: 0.5, fmt: (v) => fmtHz(16000 * Math.pow(0.125, v)) },
    sendGain: 1.6
  },
  {
    id: "flanger",
    label: "FLANGER",
    color: "#34d399",
    glyph: "✺",
    title: "Balayage métallique de type avion, calé sur le tempo",
    insert: false,
    always: false,
    trigger: false,
    beat: 8,
    p1: { label: "Profond.", def: 0.6, fmt: (v) => `${(v * 4).toFixed(1)} ms` },
    p2: { label: "Retour", def: 0.6, fmt: (v) => `${Math.round(v * 90)}%` },
    sendGain: 1.0
  },
  {
    id: "phaser",
    label: "PHASER",
    color: "#fbbf24",
    glyph: "◐",
    title: "Balayage de phase spatial et chaud, calé sur le tempo",
    insert: false,
    always: false,
    trigger: false,
    beat: 8,
    p1: { label: "Profond.", def: 0.7, fmt: (v) => fmtHz(300 + v * 1700) },
    p2: { label: "Réso", def: 0.5, fmt: (v) => `${Math.round(1 + v * 11)}` },
    sendGain: 1.0
  },
  {
    id: "gate",
    label: "TRANS",
    color: "#a3e635",
    glyph: "▥",
    title: "Hachage rythmique du son (trance gate) calé sur le tempo",
    insert: true,
    always: false,
    trigger: false,
    beat: 2,
    p1: { label: "Durée", def: 0.5, fmt: (v) => `${Math.round(10 + v * 80)}%` },
    p2: { label: "Doux", def: 0.2, fmt: (v) => fmtHz(4000 * Math.pow(0.0125, v)) },
    sendGain: 1.0
  },
  {
    id: "roll",
    label: "ROLL",
    color: "#f472b6",
    glyph: "⟳",
    title: "Boucle les derniers temps tant que tu maintiens (loop roll)",
    insert: true,
    always: true,
    trigger: true,
    beat: 2,
    p1: { label: "Répét.", def: 0.95, fmt: (v) => `${Math.round(85 + v * 15)}%` },
    p2: { label: "Ton", def: 0.8, fmt: (v) => fmtHz(2000 * Math.pow(10, v)) },
    sendGain: 1.0
  },
  {
    id: "brake",
    label: "BRAKE",
    color: "#f87171",
    glyph: "⏷",
    title: "Frein vinyl : le son ralentit jusqu'à l'arrêt ; quand tu relâches il remonte de la même façon, puis reprend calé sur le temps",
    insert: true,
    always: true,
    trigger: true,
    beat: null,
    p1: { label: "Durée", def: 0.4, fmt: (v) => `${Math.round(250 + v * 2250)} ms` },
    p2: { label: "Relance", def: 0.42, fmt: (v) => `${Math.round(100 + v * 2400)} ms` },
    sendGain: 1.0
  },
  {
    id: "reverse",
    label: "REVERSE",
    color: "#c084fc",
    glyph: "⟵",
    title: "Joue à l'envers les derniers temps, en boucle tant que tu maintiens",
    insert: true,
    always: true,
    trigger: true,
    beat: 3,
    p1: null,
    p2: null,
    sendGain: 1.0
  },
  {
    id: "sweep",
    label: "FILTRE",
    color: "#38bdf8",
    glyph: "≋",
    title: "Filtre DJ : à gauche il étouffe, à droite il amincit",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: { label: "Position", def: 0.5, fmt: (v) => {
      if (v < 0.48) return `LP ${fmtHz(Math.round(20000 * Math.pow(80/20000, (0.5 - v)/0.5)))}`;
      if (v > 0.52) return `HP ${fmtHz(Math.round(20 * Math.pow(8000/20, (v - 0.5)/0.5)))}`;
      return "OFF";
    }},
    p2: { label: "Réso", def: 0.3, fmt: (v) => `${Math.round(0.7 + v * 13.3)}` },
    sendGain: 1.0
  },
  {
    id: "wobble",
    label: "WOBBLE",
    color: "#fb923c",
    glyph: "∿",
    title: "Filtre résonant qui pulse au tempo (basse wobble)",
    insert: true,
    always: false,
    trigger: false,
    beat: 5,
    p1: { label: "Profond.", def: 0.7, fmt: (v) => fmtHz(150 + v * 4850) },
    p2: { label: "Réso", def: 0.6, fmt: (v) => `${Math.round(2 + v * 16)}` },
    sendGain: 1.0
  },
  {
    id: "pump",
    label: "PUMP",
    color: "#4ade80",
    glyph: "▼",
    title: "Effet sidechain : le son se creuse à chaque temps puis remonte",
    insert: true,
    always: false,
    trigger: false,
    beat: 5,
    p1: { label: "Profond.", def: 0.8, fmt: (v) => `${Math.round(v * 95)}%` },
    p2: { label: "Relâche", def: 0.5, fmt: (v) => `${Math.round(0.5 + v * 3.5)}` },
    sendGain: 1.0
  },
  {
    id: "pan",
    label: "PAN",
    color: "#2dd4bf",
    glyph: "⇄",
    title: "Balance gauche/droite qui oscille au tempo",
    insert: true,
    always: false,
    trigger: false,
    beat: 6,
    p1: { label: "Largeur", def: 1, fmt: (v) => `${Math.round(v * 100)}%` },
    p2: null,
    sendGain: 1.0
  },
  {
    id: "noise",
    label: "RISER",
    color: "#e5e7eb",
    glyph: "░",
    title: "Montée de souffle (riser) sur la division choisie, pour monter un break",
    insert: false,
    always: false,
    trigger: false,
    beat: 8,
    p1: { label: "Départ", def: 0.3, fmt: (v) => fmtHz(150 * Math.pow(8, v)) },
    p2: { label: "Réso", def: 0.3, fmt: (v) => `${Math.round(0.5 + v * 11.5)}` },
    sendGain: 1.0
  },
  {
    id: "crush",
    label: "CRUSH",
    color: "#ff6a3d",
    glyph: "▦",
    title: "Bit-crusher : réduit la résolution pour un son lo-fi",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: { label: "Bits", def: 0.5, fmt: (v) => `${Math.round(12 - v * 10)} bit` },
    p2: { label: "Bande", def: 0.8, fmt: (v) => fmtHz(1500 * Math.pow(13, v)) },
    sendGain: 1.0
  },
  {
    id: "pitch",
    label: "PITCH",
    color: "#e879f9",
    glyph: "♯",
    title: "Transpose le son en demi-tons",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: { label: "Demi-tons", def: 0.708, fmt: (v) => `${v === 0.708 ? "0 st" : (Math.round(-12 + v * 24) > 0 ? "+" : "") + Math.round(-12 + v * 24)} st` },
    p2: null,
    sendGain: 1.0
  }, {
    id: "dub",
    label: "DUB",
    color: "#22c55e",
    glyph: "⇄",
    title: "Écho dub ping-pong : répétitions filtrées et saturées, calées sur le tempo",
    insert: false,
    always: false,
    trigger: false,
    beat: 4,
    p1: {
      label: "Retour",
      def: 0.55,
      fmt: (v) => `${Math.round((0.2 + v * 0.68) * 100)}%`
    },
    p2: {
      label: "Ton",
      def: 0.5,
      fmt: (v) => fmtHz(300 * Math.pow(12, v))
    },
    sendGain: 1.0
  }, {
    id: "ring",
    label: "RING",
    color: "#f472b6",
    glyph: "⊗",
    title: "Modulation en anneau : son métallique, robotique ou cloche",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Porteuse",
      def: 0.45,
      fmt: (v) => fmtHz(30 * Math.pow(100, v))
    },
    p2: {
      label: "Mélange",
      def: 0.7,
      fmt: (v) => `${Math.round(v * 100)}%`
    },
    sendGain: 1.0
  }, {
    id: "tape",
    label: "TAPE",
    color: "#f59e0b",
    glyph: "⌁",
    title: "Vieux magnéto : saturation, pleurage et souffle de bande",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Usure",
      def: 0.5,
      fmt: (v) => `${Math.round(v * 100)}%`
    },
    p2: {
      label: "Coupure",
      def: 0.55,
      fmt: (v) => fmtHz(2000 * Math.pow(8, v))
    },
    sendGain: 1.0
  }, {
    id: "mash",
    label: "MASH",
    color: "#f43f5e",
    glyph: "▦",
    title: "Beat masher : hachage aléatoire du son sur une grille de 16 pas",
    insert: true,
    always: false,
    trigger: false,
    beat: 0,
    p1: {
      label: "Densité",
      def: 0.5,
      fmt: (v) => `${Math.round((0.35 + v * 0.6) * 100)}%`
    },
    p2: {
      label: "Lissage",
      def: 0.3,
      fmt: (v) => `${Math.round(2 + v * 28)} ms`
    },
    sendGain: 1.0
  }, {
    id: "vowel",
    label: "VOWEL",
    color: "#a78bfa",
    glyph: "◌",
    title: "Filtre à voyelles : le son prononce a-e-i-o-u au tempo",
    insert: true,
    always: false,
    trigger: false,
    beat: 5,
    p1: {
      label: "Résonance",
      def: 0.5,
      fmt: (v) => `Q ${Math.round(4 + v * 16)}`
    },
    p2: {
      label: "Glissé",
      def: 0.4,
      fmt: (v) => `${Math.round(v * 100)}%`
    },
    sendGain: 1.0
  }, {
    id: "scatter",
    label: "SCATTER",
    color: "#22d3ee",
    glyph: "⁘",
    title: "Granulaire : le son éclate en grains rejoués au hasard",
    insert: false,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Densité",
      def: 0.4,
      fmt: (v) => `${Math.round(6 + v * 34)} gr/s`
    },
    p2: {
      label: "Dispersion",
      def: 0.4,
      fmt: (v) => `${Math.round((0.04 + v * 0.6) * 1000)} ms`
    },
    sendGain: 1.0
  }, {
    id: "build",
    label: "BUILD",
    color: "#f97316",
    glyph: "⇗",
    title: "Montée : le stem est roulé de plus en plus vite (1/2 → 1/32 de temps) pendant qu'un filtre monte ; relâche pour le drop",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Durée",
      def: 0.5,
      fmt: (v) => `${[2, 4, 8, 16][Math.min(3, Math.floor(v * 4))]} temps`
    },
    p2: {
      label: "Filtre",
      def: 0.75,
      fmt: (v) => fmtHz(200 * Math.pow(25, v))
    },
    sendGain: 1.0
  }, {
    id: "freeze",
    label: "FREEZE",
    color: "#7dd3fc",
    glyph: "❄",
    title: "Gel : fige le son du stem en une nappe continue (une note de voix, un accord) pendant que le reste joue",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Grain",
      def: 0.22,
      fmt: (v) => `${Math.round((0.06 + v * 0.54) * 1000)} ms`
    },
    p2: {
      label: "Brillance",
      def: 0.65,
      fmt: (v) => fmtHz(1000 * Math.pow(16, v))
    },
    sendGain: 1.0
  }, {
    id: "halftime",
    label: "HALF",
    color: "#84cc16",
    glyph: "½",
    title: "Demi-tempo : le stem est rejoué à moitié vitesse dans chaque fenêtre, une octave plus bas, calé sur les temps",
    insert: true,
    always: false,
    trigger: false,
    beat: 5,
    p1: {
      label: "Couleur",
      def: 1,
      fmt: (v) => fmtHz(400 * Math.pow(50, v))
    },
    p2: null,
    sendGain: 1.0
  }, {
    id: "double",
    label: "DOUBLE",
    color: "#facc15",
    glyph: "×2",
    title: "Double vitesse : chaque fenêtre est rejouée deux fois plus vite, une octave plus haut, calée sur les temps",
    insert: true,
    always: false,
    trigger: false,
    beat: 3,
    p1: {
      label: "Couleur",
      def: 1,
      fmt: (v) => fmtHz(400 * Math.pow(50, v))
    },
    p2: null,
    sendGain: 1.0
  }, {
    id: "rise",
    label: "RISE",
    color: "#e879f9",
    glyph: "↗",
    title: "Montée de hauteur : le stem grimpe en continu (jusqu'à 2 octaves) sur la durée choisie, sans changer le tempo",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Durée",
      def: 0.5,
      fmt: (v) => `${[2, 4, 8, 16][Math.min(3, Math.floor(v * 4))]} temps`
    },
    p2: {
      label: "Ambitus",
      def: 0.37,
      fmt: (v) => `+${Math.round(5 + v * 19)} dt`
    },
    sendGain: 1.0
  }, {
    id: "echoout",
    label: "OUT",
    color: "#38bdf8",
    glyph: "⇥",
    title: "Sortie en écho : le stem est coupé et ses derniers instants s'envolent en échos au tempo qui s'amincissent",
    insert: true,
    always: false,
    trigger: false,
    beat: 3,
    p1: {
      label: "Échos",
      def: 0.5,
      fmt: (v) => `${Math.round((0.35 + v * 0.5) * 100)}%`
    },
    p2: {
      label: "Amincir",
      def: 0.6,
      fmt: (v) => fmtHz(300 * Math.pow(15, v))
    },
    sendGain: 1.0
  }, {
    id: "wash",
    label: "WASH",
    color: "#c4b5fd",
    glyph: "≋",
    title: "Lavage : le stem se noie dans une immense réverbération pendant qu'un filtre s'ouvre ; relâche pour le retrouver",
    insert: true,
    always: false,
    trigger: false,
    beat: null,
    p1: {
      label: "Taille",
      def: 0.45,
      fmt: (v) => `${(1.5 + v * 5.5).toFixed(1)} s`
    },
    p2: {
      label: "Ouverture",
      def: 0.55,
      fmt: (v) => fmtHz(200 * Math.pow(25, v))
    },
    sendGain: 1.0
  }
];

export const FX_META = new Map<FxName, FxMeta>(FX_LIST.map((m) => [m.id, m]));

// pad order (3 x 3) of the all-in-one FX unit
export const DECK_FX: FxName[] = ["echo", "dub", "reverb", "flanger", "gate", "noise", "roll", "brake", "reverse"];
export const STEM_FX: FxName[] = [
  "echo", "dub", "vowel", "gate", "mash", "roll", "flanger", "crush", "scatter",
  "build", "freeze", "halftime", "wobble", "pump", "brake", "reverse",
  "double", "rise", "echoout", "wash",
];
