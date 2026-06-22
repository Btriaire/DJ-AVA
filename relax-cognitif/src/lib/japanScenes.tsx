// 50 illustrations vectorielles « japonisantes » (non pixel) pour le Puzzle.
// Style ukiyo-e minimaliste, aplats de couleurs douces, repère carré 0..120.
import type { ReactNode } from "react";

export const SCENE_SIZE = 120;

// Composant de rendu d'une scène, avec fenêtre (crop) optionnelle pour le taquin.
export function JapanArt({
  scene,
  size = 120,
  className,
  crop,
}: {
  scene: JapanScene;
  size?: number;
  className?: string;
  crop?: { x: number; y: number; w: number; h: number };
}) {
  const vb = crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${SCENE_SIZE} ${SCENE_SIZE}`;
  const ratio = crop ? crop.h / crop.w : 1;
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * ratio)}
      viewBox={vb}
      role="img"
    >
      {scene.draw()}
    </svg>
  );
}

const C = {
  sky: "#e9f1ec",
  cream: "#f4e8d7",
  dawn: "#f6dcc4",
  dusk: "#e9bfa0",
  night: "#36465e",
  nightDk: "#283549",
  sun: "#e8835f",
  gold: "#e6a93f",
  moon: "#f4ecdd",
  fuji: "#5b8c79",
  fujiDk: "#487260",
  snow: "#f6faf6",
  water: "#8fb8c9",
  waterLt: "#c2dde4",
  red: "#c4544a",
  redDk: "#9c3f38",
  sakura: "#f0b3c1",
  sakuraDk: "#e08ea0",
  green: "#6e8b4e",
  greenDk: "#4f6b39",
  trunk: "#7a4a2b",
  ink: "#2f4034",
  white: "#ffffff",
  stone: "#a6a59b",
  cloud: "#fbf5ec",
};

// ── Motifs ────────────────────────────────────────────────────────
const bg = (k: string, fill: string) => <rect key={k} x={0} y={0} width={120} height={120} fill={fill} />;
const band = (k: string, fill: string, y: number, h: number) => <rect key={k} x={0} y={y} width={120} height={h} fill={fill} />;
const ground = (k: string, fill: string, y = 100) => <rect key={k} x={0} y={y} width={120} height={120 - y} fill={fill} />;
const sun = (k: string, cx: number, cy: number, r: number, fill: string) => <circle key={k} cx={cx} cy={cy} r={r} fill={fill} />;

const crescent = (k: string, cx: number, cy: number, r: number, fill: string, sky: string) => (
  <g key={k}>
    <circle cx={cx} cy={cy} r={r} fill={fill} />
    <circle cx={cx + r * 0.5} cy={cy - r * 0.25} r={r * 0.92} fill={sky} />
  </g>
);

function fuji(k: string, cx: number, baseY: number, w: number, h: number, color = C.fuji, snow = true): ReactNode {
  const topX = cx, topY = baseY - h;
  const lx = cx - w / 2, rx = cx + w / 2;
  const capW = w * 0.32;
  return (
    <g key={k}>
      <path d={`M${lx},${baseY} Q${cx},${baseY - h * 0.55} ${topX},${topY} Q${cx},${baseY - h * 0.55} ${rx},${baseY} Z`} fill={color} />
      {snow && (
        <path
          d={`M${topX - capW},${topY + h * 0.22} Q${topX},${topY} ${topX + capW},${topY + h * 0.22} L${topX + capW * 0.6},${topY + h * 0.3} L${topX + capW * 0.25},${topY + h * 0.2} L${topX},${topY + h * 0.32} L${topX - capW * 0.25},${topY + h * 0.2} L${topX - capW * 0.6},${topY + h * 0.3} Z`}
          fill={C.snow}
        />
      )}
    </g>
  );
}

const hill = (k: string, cx: number, baseY: number, w: number, h: number, color: string) => (
  <path key={k} d={`M${cx - w / 2},${baseY} Q${cx},${baseY - h} ${cx + w / 2},${baseY} Z`} fill={color} />
);

const waves = (k: string, y: number, color: string, amp = 4) => (
  <path
    key={k}
    d={`M0,${y} Q15,${y - amp} 30,${y} T60,${y} T90,${y} T120,${y}`}
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
  />
);

function torii(k: string, x: number, baseY: number, s: number, color = C.red): ReactNode {
  const w = 26 * s, postH = 30 * s, t = 3.2 * s;
  const lx = x - w / 2, rx = x + w / 2;
  const topY = baseY - postH;
  return (
    <g key={k} fill={color}>
      <rect x={lx} y={topY} width={t} height={postH} />
      <rect x={rx - t} y={topY} width={t} height={postH} />
      <rect x={lx - 4 * s} y={topY - 5 * s} width={w + 8 * s} height={4 * s} rx={1.5} />
      <rect x={lx - 2 * s} y={topY + 1 * s} width={w + 4 * s} height={3 * s} />
      <rect x={x - t / 2} y={topY - 5 * s} width={t} height={7 * s} />
    </g>
  );
}

function pagoda(k: string, x: number, baseY: number, color = C.red): ReactNode {
  const tiers = [0, 1, 2];
  return (
    <g key={k}>
      <rect x={x - 3} y={baseY - 34} width={6} height={34} fill={C.trunk} />
      {tiers.map((i) => {
        const w = 24 - i * 6;
        const y = baseY - 14 - i * 11;
        return (
          <g key={i}>
            <path d={`M${x - w / 2},${y} L${x + w / 2},${y} L${x + w / 2 - 4},${y - 6} L${x - w / 2 + 4},${y - 6} Z`} fill={color} />
            <rect x={x - (w / 2 - 4)} y={y} width={w - 8} height={5} fill={C.cream} />
          </g>
        );
      })}
      <path d={`M${x - 6},${baseY - 47} L${x + 6},${baseY - 47} L${x},${baseY - 56} Z`} fill={color} />
    </g>
  );
}

function bamboo(k: string, x: number, baseY: number, topY: number, color = C.green): ReactNode {
  const segs = [];
  for (let y = baseY; y > topY; y -= 9) segs.push(y);
  return (
    <g key={k}>
      <rect x={x - 2.2} y={topY} width={4.4} height={baseY - topY} fill={color} rx={1} />
      {segs.map((y, i) => <rect key={i} x={x - 2.6} y={y} width={5.2} height={1.4} fill={C.greenDk} />)}
      <path d={`M${x + 2},${topY + 8} q10,-3 16,4 q-12,2 -16,-4`} fill={color} />
      <path d={`M${x - 2},${topY + 16} q-10,-3 -16,4 q12,2 16,-4`} fill={color} />
    </g>
  );
}

function sakura(k: string, x: number, y: number, color = C.sakura): ReactNode {
  const blossoms = [
    [0, 0], [8, -6], [14, 2], [6, 8], [-6, 5], [-10, -4], [18, -8], [22, 3],
  ];
  return (
    <g key={k}>
      <path d={`M${x - 4},${y + 18} Q${x + 4},${y + 4} ${x + 14},${y - 4} M${x + 4},${y + 6} Q${x - 2},${y - 2} ${x - 8},${y - 2}`} fill="none" stroke={C.trunk} strokeWidth={1.6} strokeLinecap="round" />
      {blossoms.map(([dx, dy], i) => <circle key={i} cx={x + dx} cy={y + dy} r={2.6} fill={color} />)}
    </g>
  );
}

function pine(k: string, x: number, baseY: number): ReactNode {
  return (
    <g key={k}>
      <rect x={x - 2} y={baseY - 14} width={4} height={14} fill={C.trunk} />
      <path d={`M${x},${baseY - 34} L${x - 11},${baseY - 20} L${x + 11},${baseY - 20} Z`} fill={C.greenDk} />
      <path d={`M${x},${baseY - 26} L${x - 13},${baseY - 10} L${x + 13},${baseY - 10} Z`} fill={C.green} />
    </g>
  );
}

const koi = (k: string, x: number, y: number, color = C.sun, flip = false) => (
  <g key={k} transform={flip ? `translate(${2 * x},0) scale(-1,1)` : undefined}>
    <ellipse cx={x} cy={y} rx={9} ry={4.2} fill={color} />
    <path d={`M${x - 9},${y} l-6,-4 l0,8 Z`} fill={color} />
    <circle cx={x + 5} cy={y - 1} r={1} fill={C.white} />
  </g>
);

const cloud = (k: string, x: number, y: number, s = 1, fill = C.cloud) => (
  <g key={k} fill={fill}>
    <ellipse cx={x} cy={y} rx={12 * s} ry={5 * s} />
    <ellipse cx={x - 8 * s} cy={y + 1 * s} rx={7 * s} ry={4 * s} />
    <ellipse cx={x + 9 * s} cy={y + 1 * s} rx={6 * s} ry={3.5 * s} />
  </g>
);

const bird = (k: string, x: number, y: number, color = C.ink) => (
  <path key={k} d={`M${x - 5},${y} Q${x - 2},${y - 3} ${x},${y} Q${x + 2},${y - 3} ${x + 5},${y}`} fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
);

function crane(k: string, x: number, y: number): ReactNode {
  return (
    <g key={k}>
      <ellipse cx={x} cy={y} rx={9} ry={5} fill={C.white} stroke={C.ink} strokeWidth={0.6} />
      <path d={`M${x + 7},${y - 2} q6,-2 8,-9`} fill="none" stroke={C.white} strokeWidth={2.4} strokeLinecap="round" />
      <path d={`M${x + 7},${y - 2} q6,-2 8,-9`} fill="none" stroke={C.ink} strokeWidth={0.7} strokeLinecap="round" />
      <circle cx={x + 15} cy={y - 11} r={1.6} fill={C.red} />
      <path d={`M${x - 8},${y + 3} l-2,6 M${x - 4},${y + 4} l-1,6`} stroke={C.ink} strokeWidth={1} strokeLinecap="round" />
      <path d={`M${x - 9},${y - 3} l-7,3 l7,2`} fill={C.white} stroke={C.ink} strokeWidth={0.5} />
    </g>
  );
}

function lantern(k: string, x: number, baseY: number): ReactNode {
  return (
    <g key={k} fill={C.stone}>
      <rect x={x - 2} y={baseY - 10} width={4} height={10} />
      <path d={`M${x - 7},${baseY - 10} L${x + 7},${baseY - 10} L${x + 5},${baseY - 20} L${x - 5},${baseY - 20} Z`} />
      <rect x={x - 6} y={baseY - 22} width={12} height={3} />
      <path d={`M${x - 7},${baseY - 22} L${x + 7},${baseY - 22} L${x},${baseY - 30} Z`} />
      <rect x={x - 4.5} y={baseY - 19} width={9} height={7} fill={C.gold} />
    </g>
  );
}

const bridge = (k: string, x: number, y: number, w: number, color = C.red) => (
  <path key={k} d={`M${x - w / 2},${y} Q${x},${y - w * 0.4} ${x + w / 2},${y}`} fill="none" stroke={color} strokeWidth={3} />
);

const greatWave = (k: string, x: number, y: number, color = C.water) => (
  <g key={k}>
    <path d={`M${x - 20},${y} Q${x - 10},${y - 22} ${x + 4},${y - 18} Q${x + 18},${y - 14} ${x + 16},${y} Q${x + 8},${y - 8} ${x},${y - 4} Q${x - 8},${y - 2} ${x - 20},${y} Z`} fill={color} />
    <path d={`M${x + 2},${y - 16} q6,-2 8,2 q-5,-1 -8,-2`} fill={C.white} />
    <path d={`M${x - 6},${y - 8} q5,-2 7,1 q-5,0 -7,-1`} fill={C.white} />
  </g>
);

// ── Composition des 50 scènes ──────────────────────────────────────
export type JapanScene = { key: string; title: string; level: 1 | 2 | 3; draw: () => ReactNode };

export const JAPAN_SCENES: JapanScene[] = [
  // ▁ Niveau 1 — simples (1 à 2 motifs, grands aplats) ───────────────
  { key: "soleil", title: "Soleil levant", level: 1, draw: () => <>{bg("s", C.dawn)}{sun("o", 60, 58, 30, C.sun)}{ground("g", C.cream, 92)}</> },
  { key: "fuji", title: "Mont Fuji", level: 1, draw: () => <>{bg("s", C.sky)}{fuji("f", 60, 100, 86, 64)}{ground("g", C.fujiDk, 100)}</> },
  { key: "lune", title: "Pleine lune", level: 1, draw: () => <>{bg("s", C.night)}{sun("m", 60, 50, 26, C.moon)}{ground("g", C.nightDk, 96)}</> },
  { key: "torii", title: "Le torii", level: 1, draw: () => <>{bg("s", C.dawn)}{band("w", C.waterLt, 92, 28)}{torii("t", 60, 100, 1.7)}</> },
  { key: "bambou", title: "Bambou", level: 1, draw: () => <>{bg("s", C.sky)}{bamboo("b1", 45, 116, 12)}{bamboo("b2", 70, 116, 24)}{ground("g", C.green, 112)}</> },
  { key: "sakura1", title: "Cerisier", level: 1, draw: () => <>{bg("s", C.sky)}{sakura("k", 46, 56, C.sakura)}{ground("g", C.green, 104)}</> },
  { key: "vague1", title: "La vague", level: 1, draw: () => <>{bg("s", C.cream)}{band("w", C.waterLt, 70, 50)}{greatWave("v", 60, 90)}</> },
  { key: "pin", title: "Le pin", level: 1, draw: () => <>{bg("s", C.dawn)}{pine("p", 60, 108)}{ground("g", C.green, 104)}</> },
  { key: "carpe1", title: "La carpe koï", level: 1, draw: () => <>{bg("s", C.waterLt)}{koi("c", 56, 60, C.sun)}{waves("w1", 40, C.water)}{waves("w2", 80, C.water)}</> },
  { key: "lanterne", title: "Lanterne", level: 1, draw: () => <>{bg("s", C.dusk)}{lantern("l", 60, 110)}{ground("g", C.greenDk, 110)}</> },

  // ▃ Niveau 2 — moyens (paysages à 3-4 motifs) ─────────────────────
  { key: "fuji-soleil", title: "Fuji au soleil", level: 2, draw: () => <>{bg("s", C.dawn)}{sun("o", 88, 34, 16, C.gold)}{fuji("f", 54, 100, 80, 60)}{ground("g", C.fujiDk, 100)}</> },
  { key: "fuji-torii", title: "Fuji & torii", level: 2, draw: () => <>{bg("s", C.sky)}{fuji("f", 58, 92, 72, 52)}{band("w", C.waterLt, 92, 28)}{torii("t", 60, 116, 1.4)}</> },
  { key: "torii-lune", title: "Torii de nuit", level: 2, draw: () => <>{bg("s", C.night)}{sun("m", 86, 30, 15, C.moon)}{band("w", C.nightDk, 92, 28)}{torii("t", 56, 112, 1.5)}</> },
  { key: "sakura-riv", title: "Cerisier au bord de l'eau", level: 2, draw: () => <>{bg("s", C.sky)}{sakura("k1", 30, 44, C.sakura)}{sakura("k2", 78, 30, C.sakuraDk)}{band("w", C.waterLt, 96, 24)}{waves("w1", 104, C.water)}</> },
  { key: "pagode", title: "La pagode", level: 2, draw: () => <>{bg("s", C.dawn)}{hill("h", 84, 110, 70, 30, C.green)}{pagoda("p", 50, 108)}{ground("g", C.greenDk, 108)}</> },
  { key: "grue", title: "La grue", level: 2, draw: () => <>{bg("s", C.cream)}{sun("o", 92, 28, 14, C.sun)}{crane("c", 52, 64)}{ground("g", C.green, 104)}</> },
  { key: "koi-mare", title: "Bassin aux koïs", level: 2, draw: () => <>{bg("s", C.waterLt)}{koi("c1", 44, 48, C.sun)}{koi("c2", 78, 74, C.white, true)}{waves("w1", 32, C.water)}{waves("w2", 92, C.water)}{sakura("k", 84, 22, C.sakura)}</> },
  { key: "bambouseraie", title: "Bambouseraie", level: 2, draw: () => <>{bg("s", C.sky)}{bamboo("b1", 28, 120, 6)}{bamboo("b2", 50, 120, 16)}{bamboo("b3", 74, 120, 4)}{bamboo("b4", 96, 120, 20)}{ground("g", C.greenDk, 112)}</> },
  { key: "pont", title: "Le pont rouge", level: 2, draw: () => <>{bg("s", C.dawn)}{band("w", C.waterLt, 84, 36)}{bridge("p", 60, 96, 70)}{sakura("k", 96, 40, C.sakura)}{waves("w1", 110, C.water)}</> },
  { key: "voiles", title: "Barques au couchant", level: 2, draw: () => <>{bg("s", C.dusk)}{sun("o", 60, 46, 22, C.sun)}{band("w", C.water, 84, 36)}{koi("b", 40, 100, C.ink)}{koi("b2", 84, 104, C.ink, true)}</> },

  // ▇ Niveau 3 — détaillés (scènes riches) ──────────────────────────
  { key: "paysage1", title: "Aube sur le lac", level: 3, draw: () => <>{bg("s", C.dawn)}{sun("o", 30, 30, 14, C.gold)}{cloud("cl", 88, 26, 0.9)}{fuji("f", 64, 86, 78, 56)}{band("w", C.waterLt, 86, 34)}{torii("t", 40, 110, 1.1)}{waves("w1", 112, C.water)}</> },
  { key: "paysage2", title: "Jardin de thé", level: 3, draw: () => <>{bg("s", C.sky)}{hill("h", 30, 108, 60, 26, C.green)}{lantern("l", 84, 106)}{sakura("k", 24, 40, C.sakura)}{bridge("p", 58, 100, 44, C.red)}{band("w", C.waterLt, 100, 20)}{bird("d1", 90, 30)}{bird("d2", 100, 26)}</> },
  { key: "paysage3", title: "Village au crépuscule", level: 3, draw: () => <>{bg("s", C.dusk)}{crescent("m", 96, 26, 12, C.moon, C.dusk)}{fuji("f", 40, 92, 66, 50)}{pagoda("p", 86, 104)}{ground("g", C.greenDk, 104)}{bird("d1", 60, 34)}{bird("d2", 70, 30)}</> },
  { key: "paysage4", title: "Étang aux carpes", level: 3, draw: () => <>{bg("s", C.waterLt)}{sakura("k1", 22, 26, C.sakura)}{sakura("k2", 96, 18, C.sakuraDk)}{koi("c1", 40, 56, C.sun)}{koi("c2", 80, 80, C.white, true)}{koi("c3", 60, 100, C.gold)}{waves("w1", 40, C.water)}{waves("w2", 90, C.water)}{bridge("p", 60, 30, 50, C.red)}</> },
  { key: "paysage5", title: "Sommet enneigé", level: 3, draw: () => <>{bg("s", C.sky)}{cloud("cl1", 30, 30, 1)}{cloud("cl2", 92, 22, 0.8)}{fuji("f", 60, 100, 96, 72)}{hill("h1", 20, 104, 50, 18, C.greenDk)}{hill("h2", 100, 104, 50, 16, C.green)}{ground("g", C.greenDk, 104)}</> },
  { key: "paysage6", title: "Forêt de bambous & grue", level: 3, draw: () => <>{bg("s", C.cream)}{bamboo("b1", 22, 120, 8)}{bamboo("b2", 100, 120, 12)}{crane("c", 56, 70)}{ground("g", C.green, 106)}{sun("o", 96, 26, 12, C.sun)}</> },
  { key: "paysage7", title: "Temple sur la colline", level: 3, draw: () => <>{bg("s", C.dawn)}{sun("o", 26, 28, 13, C.gold)}{hill("h", 64, 110, 96, 40, C.green)}{pagoda("p", 64, 100)}{pine("t1", 24, 106)}{pine("t2", 100, 108)}{ground("g", C.greenDk, 106)}</> },
  { key: "paysage8", title: "Nuit de pleine lune", level: 3, draw: () => <>{bg("s", C.night)}{sun("m", 80, 32, 18, C.moon)}{fuji("f", 44, 96, 70, 54, C.fujiDk)}{sakura("k", 96, 70, C.sakura)}{band("w", C.nightDk, 100, 20)}{koi("c", 40, 110, C.white)}</> },
  { key: "paysage9", title: "Grande vague", level: 3, draw: () => <>{bg("s", C.cream)}{sun("o", 92, 28, 14, C.sun)}{fuji("f", 86, 92, 44, 30)}{band("w", C.waterLt, 70, 50)}{greatWave("v1", 36, 92)}{greatWave("v2", 80, 104, C.fuji)}{waves("w1", 116, C.water)}</> },
  { key: "paysage10", title: "Allée des torii", level: 3, draw: () => <>{bg("s", C.dusk)}{torii("t1", 60, 96, 1.8)}{torii("t2", 60, 90, 1.3, C.redDk)}{torii("t3", 60, 86, 1, C.red)}{ground("g", C.greenDk, 100)}{lantern("l1", 22, 110)}{lantern("l2", 98, 110)}</> },
  { key: "paysage11", title: "Cerisiers en fête", level: 3, draw: () => <>{bg("s", C.sky)}{sakura("k1", 16, 30, C.sakura)}{sakura("k2", 50, 20, C.sakuraDk)}{sakura("k3", 86, 34, C.sakura)}{lantern("l", 60, 110)}{band("w", C.waterLt, 100, 20)}{bird("d1", 30, 50)}{bird("d2", 96, 56)}</> },
  { key: "paysage12", title: "Pêcheur au matin", level: 3, draw: () => <>{bg("s", C.dawn)}{sun("o", 60, 40, 18, C.gold)}{fuji("f", 24, 96, 60, 46)}{band("w", C.water, 88, 32)}{koi("b", 70, 104, C.ink, true)}{bird("d1", 40, 30)}{bird("d2", 50, 26)}{bird("d3", 60, 28)}</> },
  { key: "paysage13", title: "Pavillon d'or", level: 3, draw: () => <>{bg("s", C.sky)}{hill("h", 40, 108, 70, 30, C.greenDk)}{pagoda("p", 70, 104, C.gold)}{band("w", C.waterLt, 104, 16)}{pine("t", 26, 106)}{sakura("k", 100, 40, C.sakura)}</> },
  { key: "paysage14", title: "Brume du soir", level: 3, draw: () => <>{bg("s", C.dusk)}{crescent("m", 30, 28, 12, C.moon, C.dusk)}{hill("h1", 24, 96, 70, 26, C.fuji)}{hill("h2", 92, 100, 70, 30, C.fujiDk)}{pagoda("p", 60, 96)}{ground("g", C.greenDk, 96)}</> },
  { key: "paysage15", title: "Jardin zen complet", level: 3, draw: () => <>{bg("s", C.dawn)}{sun("o", 96, 24, 12, C.sun)}{fuji("f", 30, 92, 56, 44)}{bridge("p", 70, 94, 48, C.red)}{lantern("l", 30, 110)}{koi("c1", 78, 108, C.sun)}{koi("c2", 96, 112, C.white, true)}{sakura("k", 100, 50, C.sakura)}{band("w", C.waterLt, 96, 24)}</> },

  // Compléments pour atteindre 50 (variations de teintes / cadrages) ─
  { key: "soleil2", title: "Disque d'or", level: 1, draw: () => <>{bg("s", C.cream)}{sun("o", 60, 56, 32, C.gold)}{ground("g", C.green, 96)}</> },
  { key: "fuji2", title: "Fuji vert", level: 1, draw: () => <>{bg("s", C.dawn)}{fuji("f", 60, 100, 90, 70, C.fujiDk)}{ground("g", C.greenDk, 100)}</> },
  { key: "lune2", title: "Croissant", level: 1, draw: () => <>{bg("s", C.night)}{crescent("m", 60, 50, 24, C.moon, C.night)}{ground("g", C.nightDk, 96)}</> },
  { key: "vague2", title: "Houle bleue", level: 1, draw: () => <>{bg("s", C.sky)}{band("w", C.water, 60, 60)}{waves("w1", 64, C.waterLt, 6)}{waves("w2", 84, C.white, 5)}{waves("w3", 104, C.waterLt, 6)}</> },
  { key: "sakura2", title: "Branche fleurie", level: 1, draw: () => <>{bg("s", C.cream)}{sakura("k1", 30, 60, C.sakuraDk)}{sakura("k2", 70, 44, C.sakura)}</> },
  { key: "carpe2", title: "Deux koïs", level: 2, draw: () => <>{bg("s", C.waterLt)}{koi("c1", 44, 50, C.sun)}{koi("c2", 74, 78, C.gold, true)}{waves("w1", 30, C.water)}{waves("w2", 96, C.water)}</> },
  { key: "torii2", title: "Torii d'or", level: 2, draw: () => <>{bg("s", C.night)}{sun("m", 60, 36, 16, C.moon)}{band("w", C.nightDk, 94, 26)}{torii("t", 60, 114, 1.6, C.gold)}</> },
  { key: "grue2", title: "Vol de grues", level: 3, draw: () => <>{bg("s", C.dawn)}{sun("o", 30, 30, 14, C.sun)}{crane("c1", 44, 56)}{crane("c2", 86, 84)}{ground("g", C.green, 110)}{bird("d1", 70, 24)}{bird("d2", 80, 28)}</> },
  { key: "pagode2", title: "Pagode au lac", level: 3, draw: () => <>{bg("s", C.sky)}{fuji("f", 88, 96, 52, 40)}{band("w", C.waterLt, 96, 24)}{pagoda("p", 36, 96)}{pine("t", 70, 100)}{ground("g", C.greenDk, 96)}</> },
  { key: "paysage16", title: "Crépuscule sur Fuji", level: 3, draw: () => <>{bg("s", C.dusk)}{sun("o", 70, 44, 20, C.sun)}{fuji("f", 50, 98, 84, 62)}{cloud("cl", 26, 36, 0.8, C.dawn)}{band("w", C.water, 98, 22)}{torii("t", 92, 116, 0.9)}</> },
  { key: "paysage17", title: "Sentier de pierre", level: 3, draw: () => <>{bg("s", C.cream)}{hill("h", 60, 110, 100, 36, C.green)}{lantern("l1", 30, 106)}{lantern("l2", 90, 106)}{pine("t", 60, 100)}{sun("o", 96, 26, 12, C.gold)}{ground("g", C.greenDk, 106)}</> },
  { key: "paysage18", title: "Reflet du soir", level: 3, draw: () => <>{bg("s", C.dusk)}{sun("o", 60, 40, 18, C.sun)}{fuji("f", 60, 70, 60, 40)}{band("w", C.water, 70, 50)}{fuji("fr", 60, 72, 60, 36, C.fujiDk, false)}{waves("w1", 104, C.waterLt)}</> },
  { key: "paysage19", title: "Matin de neige", level: 3, draw: () => <>{bg("s", C.sky)}{fuji("f", 40, 98, 64, 52)}{fuji("f2", 88, 100, 56, 44, C.fujiDk)}{pine("t1", 18, 110)}{pine("t2", 108, 112)}{ground("g", C.snow, 104)}{bird("d", 70, 26)}</> },
  { key: "paysage20", title: "Grand jardin", level: 3, draw: () => <>{bg("s", C.dawn)}{sun("o", 26, 26, 12, C.gold)}{pagoda("p", 92, 102)}{bridge("p2", 40, 96, 44, C.red)}{sakura("k", 18, 50, C.sakura)}{lantern("l", 70, 108)}{koi("c", 40, 110, C.sun)}{band("w", C.waterLt, 96, 24)}</> },
];
