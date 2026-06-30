import type { IllusionKind } from "../lib/illusions";

type Props = { kind: IllusionKind; reveal: boolean };

const GREEN = "#1f9d57";

// Couleur de « preuve » révélée après la réponse.
const proof = {
  fill: "none",
  stroke: GREEN,
  strokeWidth: 2.5,
  strokeDasharray: "5 4",
} as const;

function MullerLyer({ reveal }: { reveal: boolean }) {
  return (
    <>
      {/* trait du haut — pointes vers l'intérieur (paraît plus court) */}
      <g stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round">
        <line x1={60} y1={55} x2={180} y2={55} />
        <line x1={60} y1={55} x2={75} y2={45} />
        <line x1={60} y1={55} x2={75} y2={65} />
        <line x1={180} y1={55} x2={165} y2={45} />
        <line x1={180} y1={55} x2={165} y2={65} />
        {/* trait du bas — pointes vers l'extérieur (paraît plus long) */}
        <line x1={60} y1={125} x2={180} y2={125} />
        <line x1={60} y1={125} x2={45} y2={115} />
        <line x1={60} y1={125} x2={45} y2={135} />
        <line x1={180} y1={125} x2={195} y2={115} />
        <line x1={180} y1={125} x2={195} y2={135} />
      </g>
      {reveal && (
        <g {...proof}>
          <line x1={60} y1={40} x2={60} y2={140} />
          <line x1={180} y1={40} x2={180} y2={140} />
        </g>
      )}
    </>
  );
}

function VerticalHorizontal({ reveal }: { reveal: boolean }) {
  return (
    <>
      <g stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round">
        <line x1={60} y1={140} x2={160} y2={140} />
        <line x1={110} y1={140} x2={110} y2={40} />
      </g>
      {reveal && (
        <g stroke={GREEN} strokeWidth={2.5} strokeDasharray="5 4" strokeLinecap="round">
          <line x1={110} y1={40} x2={110} y2={140} />
          <line x1={60} y1={158} x2={160} y2={158} />
        </g>
      )}
    </>
  );
}

const CIRCLE_POS = [
  [60, 55], [120, 48], [182, 60],
  [70, 122], [130, 128], [186, 116],
];
function CountCircles({ reveal }: { reveal: boolean }) {
  return (
    <>
      {CIRCLE_POS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={16} fill="#5b8def" />
      ))}
      {reveal &&
        CIRCLE_POS.map(([x, y], i) => (
          <text key={i} x={x} y={y + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff">
            {i + 1}
          </text>
        ))}
    </>
  );
}

function ring(cx: number, cy: number, R: number, r: number, count: number, key: string) {
  return Array.from({ length: count }, (_, k) => {
    const a = (k / count) * Math.PI * 2 - Math.PI / 2;
    return (
      <circle key={`${key}-${k}`} cx={cx + R * Math.cos(a)} cy={cy + R * Math.sin(a)} r={r} fill="#c4c4c4" />
    );
  });
}
function Ebbinghaus({ reveal }: { reveal: boolean }) {
  return (
    <>
      {ring(72, 90, 44, 21, 6, "L")}
      {ring(170, 90, 30, 8, 7, "R")}
      <circle cx={72} cy={90} r={18} fill="#ef8e26" />
      <circle cx={170} cy={90} r={18} fill="#ef8e26" />
      {reveal && (
        <g {...proof}>
          <circle cx={72} cy={90} r={18} />
          <circle cx={170} cy={90} r={18} />
        </g>
      )}
    </>
  );
}

function Ponzo({ reveal }: { reveal: boolean }) {
  return (
    <>
      <g stroke="#8a8a8a" strokeWidth={3}>
        <line x1={45} y1={172} x2={105} y2={28} />
        <line x1={195} y1={172} x2={135} y2={28} />
      </g>
      <g stroke="#f2c200" strokeWidth={8} strokeLinecap="round">
        <line x1={100} y1={58} x2={140} y2={58} />
        <line x1={100} y1={140} x2={140} y2={140} />
      </g>
      {reveal && (
        <g {...proof}>
          <line x1={100} y1={45} x2={100} y2={155} />
          <line x1={140} y1={45} x2={140} y2={155} />
        </g>
      )}
    </>
  );
}

function Delboeuf({ reveal }: { reveal: boolean }) {
  return (
    <>
      <circle cx={72} cy={90} r={24} fill="none" stroke="#9a9a9a" strokeWidth={2} />
      <circle cx={168} cy={90} r={42} fill="none" stroke="#9a9a9a" strokeWidth={2} />
      <circle cx={72} cy={90} r={16} fill="#2b2b2b" />
      <circle cx={168} cy={90} r={16} fill="#2b2b2b" />
      {reveal && (
        <g {...proof}>
          <circle cx={72} cy={90} r={16} />
          <circle cx={168} cy={90} r={16} />
        </g>
      )}
    </>
  );
}

// Pièces de Jastrow : deux secteurs d'anneau identiques empilés.
const JASTROW_PATH =
  "M41.3 105.3 A210 210 0 0 1 198.7 105.3 L187.4 133.1 A180 180 0 0 0 52.6 133.1 Z";
function Jastrow({ reveal }: { reveal: boolean }) {
  return (
    <>
      <path d={JASTROW_PATH} fill="#e29a3c" />
      <g transform="translate(0,34)">
        <path d={JASTROW_PATH} fill="#4a90d9" />
      </g>
      {reveal && (
        <>
          <path d={JASTROW_PATH} {...proof} />
          <g transform="translate(0,34)">
            <path d={JASTROW_PATH} {...proof} />
          </g>
        </>
      )}
    </>
  );
}

function CafeWall({ reveal }: { reveal: boolean }) {
  const cell = 24;
  const rows = 5;
  const cols = 9;
  const x0 = 12;
  const y0 = 36;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : cell / 2;
    for (let c = 0; c < cols; c++) {
      const dark = (c + r) % 2 === 0;
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={x0 + c * cell - offset}
          y={y0 + r * cell}
          width={cell}
          height={cell}
          fill={dark ? "#222" : "#f4f4f4"}
        />
      );
    }
  }
  return (
    <>
      {/* fond + mortier gris */}
      <rect x={x0} y={y0} width={cols * cell - cell} height={rows * cell} fill="#999" />
      {rects}
      {reveal &&
        Array.from({ length: rows - 1 }, (_, i) => (
          <line
            key={i}
            x1={x0}
            y1={y0 + (i + 1) * cell}
            x2={x0 + cols * cell - cell}
            y2={y0 + (i + 1) * cell}
            stroke={GREEN}
            strokeWidth={2.5}
            strokeDasharray="6 4"
          />
        ))}
    </>
  );
}

function Hermann({ reveal }: { reveal: boolean }) {
  const sq = 34;
  const gap = 10;
  const n = 4;
  const x0 = 40;
  const y0 = 24;
  const squares: React.ReactNode[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      squares.push(
        <rect
          key={`${r}-${c}`}
          x={x0 + c * (sq + gap)}
          y={y0 + r * (sq + gap)}
          width={sq}
          height={sq}
          fill="#222"
        />
      );
  return (
    <>
      {squares}
      {reveal &&
        Array.from({ length: n - 1 }, (_, ri) =>
          Array.from({ length: n - 1 }, (_, ci) => (
            <circle
              key={`${ri}-${ci}`}
              cx={x0 + (ci + 1) * (sq + gap) - gap / 2}
              cy={y0 + (ri + 1) * (sq + gap) - gap / 2}
              r={6}
              fill="none"
              stroke={GREEN}
              strokeWidth={2.5}
            />
          ))
        )}
    </>
  );
}

function Adelson({ reveal }: { reveal: boolean }) {
  const cell = 30;
  const cols = 5;
  const rows = 4;
  const x0 = 45;
  const y0 = 24;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const light = (r + c) % 2 === 0;
      let fill = light ? "#b9b9b9" : "#6f6f6f";
      // A = case foncée éclairée ; B = case claire à l'ombre
      if (r === 2 && c === 1) fill = "#7d7d7d"; // A
      if (r === 0 && c === 3) fill = "#9f9f9f"; // B (base plus claire, assombrie par l'ombre)
      cells.push(
        <rect key={`${r}-${c}`} x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell} fill={fill} />
      );
    }
  const ax = x0 + 1 * cell + cell / 2;
  const ay = y0 + 2 * cell + cell / 2;
  const bx = x0 + 3 * cell + cell / 2;
  const by = y0 + 0 * cell + cell / 2;
  return (
    <>
      {cells}
      {/* ombre projetée sur la droite */}
      <polygon
        points={`${x0 + 2.4 * cell},${y0} ${x0 + cols * cell},${y0} ${x0 + cols * cell},${y0 + rows * cell} ${x0 + 3.4 * cell},${y0 + rows * cell}`}
        fill="#1c2a1c"
        opacity={0.22}
      />
      {/* étiquettes A / B */}
      <text x={ax} y={ay + 5} textAnchor="middle" fontSize={16} fontWeight={800} fill="#fff">A</text>
      <text x={bx} y={by + 5} textAnchor="middle" fontSize={16} fontWeight={800} fill="#111">B</text>
      {reveal && (
        <rect x={ax} y={Math.min(ay, by) - 6} width={bx - ax} height={12} fill="#7d7d7d" />
      )}
    </>
  );
}

function Kanizsa({ reveal }: { reveal: boolean }) {
  return (
    <>
      <g fill="#262626">
        <path d="M120 40 L107 62.5 A26 26 0 1 1 133 62.5 Z" />
        <path d="M60 135 L86 135.9 A26 26 0 1 1 73.8 113 Z" />
        <path d="M180 135 L166 113 A26 26 0 1 1 154 135.9 Z" />
      </g>
      {reveal && (
        <polygon points="120,64 79,124 161,124" {...proof} />
      )}
    </>
  );
}

function Fraser({ reveal }: { reveal: boolean }) {
  const cx = 120;
  const cy = 90;
  const radii = [22, 42, 62, 80];
  const segs: React.ReactNode[] = [];
  radii.forEach((R, ri) => {
    const count = Math.round(R / 3);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const tang = a + Math.PI / 2;
      const tilt = 0.5; // inclinaison qui crée la fausse spirale
      const len = 7;
      const px = cx + R * Math.cos(a);
      const py = cy + R * Math.sin(a);
      const dx = Math.cos(tang + tilt) * len;
      const dy = Math.sin(tang + tilt) * len;
      segs.push(
        <line
          key={`${ri}-${k}`}
          x1={px - dx}
          y1={py - dy}
          x2={px + dx}
          y2={py + dy}
          stroke={ri % 2 === 0 ? "#222" : "#777"}
          strokeWidth={3}
          strokeLinecap="round"
        />
      );
    }
  });
  return (
    <>
      {segs}
      {reveal && <circle cx={cx} cy={cy} r={62} fill="none" stroke={GREEN} strokeWidth={3} />}
    </>
  );
}

function Contrast({ reveal }: { reveal: boolean }) {
  return (
    <>
      <rect x={20} y={40} width={100} height={100} fill="#2a2a2a" />
      <rect x={120} y={40} width={100} height={100} fill="#dcdcdc" />
      <rect x={55} y={75} width={30} height={30} fill="#888" />
      <rect x={155} y={75} width={30} height={30} fill="#888" />
      {reveal && <rect x={70} y={80} width={100} height={20} fill="#888" />}
    </>
  );
}

function Necker({ reveal }: { reveal: boolean }) {
  return (
    <>
      <g stroke="#3a3a3a" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* face arrière (en haut à droite) */}
        <rect x={108} y={28} width={82} height={82} />
        {/* face avant (en bas à gauche) */}
        <rect x={66} y={70} width={82} height={82} />
        {/* arêtes de liaison */}
        <line x1={66} y1={70} x2={108} y2={28} />
        <line x1={148} y1={70} x2={190} y2={28} />
        <line x1={66} y1={152} x2={108} y2={110} />
        <line x1={148} y1={152} x2={190} y2={110} />
      </g>
      {reveal && (
        <g {...proof}>
          <rect x={108} y={28} width={82} height={82} />
          <rect x={66} y={70} width={82} height={82} />
        </g>
      )}
    </>
  );
}

function GradientBar({ reveal }: { reveal: boolean }) {
  return (
    <>
      <defs>
        <linearGradient id="ec-gbar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ededed" />
          <stop offset="100%" stopColor="#262626" />
        </linearGradient>
      </defs>
      <rect x={20} y={35} width={200} height={110} fill="url(#ec-gbar)" />
      <rect x={20} y={78} width={200} height={24} fill="#8a8a8a" />
      {reveal && (
        <>
          <rect x={20} y={78} width={200} height={24} {...proof} />
          <rect x={32} y={48} width={20} height={20} fill="#8a8a8a" stroke={GREEN} strokeWidth={2} />
          <rect x={188} y={48} width={20} height={20} fill="#8a8a8a" stroke={GREEN} strokeWidth={2} />
        </>
      )}
    </>
  );
}

function Zollner({ reveal }: { reveal: boolean }) {
  const ytop = 18;
  const ybot = 162;
  const dx = 26;
  const baseXs = [25, 80, 135, 190];
  const main: React.ReactNode[] = [];
  const hatch: React.ReactNode[] = [];
  baseXs.forEach((bx, i) => {
    const x1 = bx;
    const x2 = bx + dx;
    main.push(
      <line key={`m${i}`} x1={x1} y1={ytop} x2={x2} y2={ybot} stroke="#2b2b2b" strokeWidth={3} />
    );
    const tilt = i % 2 === 0 ? 0.9 : -0.9;
    const hx = Math.cos(tilt) * 9;
    const hy = Math.sin(tilt) * 9;
    const steps = 9;
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      const px = x1 + (x2 - x1) * f;
      const py = ytop + (ybot - ytop) * f;
      hatch.push(
        <line key={`h${i}-${s}`} x1={px - hx} y1={py - hy} x2={px + hx} y2={py + hy} stroke="#2b2b2b" strokeWidth={2} />
      );
    }
  });
  return (
    <>
      {main}
      {hatch}
      {reveal && (
        <g {...proof}>
          {baseXs.map((bx, i) => (
            <line key={i} x1={bx} y1={ytop} x2={bx + dx} y2={ybot} />
          ))}
        </g>
      )}
    </>
  );
}

function Hering({ reveal }: { reveal: boolean }) {
  const cx = 120;
  const cy = 90;
  const rays: React.ReactNode[] = [];
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    rays.push(
      <line key={a} x1={cx} y1={cy} x2={cx + Math.cos(ang) * 280} y2={cy + Math.sin(ang) * 280} stroke="#9aa6c0" strokeWidth={1.5} />
    );
  }
  return (
    <>
      {rays}
      <line x1={70} y1={14} x2={70} y2={166} stroke="#d11" strokeWidth={3.5} />
      <line x1={170} y1={14} x2={170} y2={166} stroke="#d11" strokeWidth={3.5} />
      {reveal && (
        <g {...proof}>
          <line x1={70} y1={14} x2={70} y2={166} />
          <line x1={170} y1={14} x2={170} y2={166} />
        </g>
      )}
    </>
  );
}

function Scintillating({ reveal }: { reveal: boolean }) {
  const n = 5;
  const step = 34;
  const x0 = 40;
  const y0 = 22;
  const W = (n - 1) * step;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(
      <line key={`v${i}`} x1={x0 + i * step} y1={y0} x2={x0 + i * step} y2={y0 + W} stroke="#9b9b9b" strokeWidth={8} />
    );
    lines.push(
      <line key={`h${i}`} x1={x0} y1={y0 + i * step} x2={x0 + W} y2={y0 + i * step} stroke="#9b9b9b" strokeWidth={8} />
    );
  }
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      dots.push(<circle key={`${r}-${c}`} cx={x0 + c * step} cy={y0 + r * step} r={6} fill="#fff" />);
  return (
    <>
      <rect x={x0 - 12} y={y0 - 12} width={W + 24} height={W + 24} fill="#2b2b2b" />
      {lines}
      {dots}
      {reveal &&
        Array.from({ length: n }, (_, r) =>
          Array.from({ length: n }, (_, c) => (
            <circle
              key={`${r}-${c}`}
              cx={x0 + c * step}
              cy={y0 + r * step}
              r={9}
              fill="none"
              stroke={GREEN}
              strokeWidth={2.5}
            />
          ))
        )}
    </>
  );
}

function Poggendorff({ reveal }: { reveal: boolean }) {
  // ligne de gauche, prolongée (en pointillé vert) jusqu'à la ligne B.
  return (
    <>
      <line x1={25} y1={55} x2={100} y2={90} stroke="#2b2b2b" strokeWidth={4} />
      <rect x={100} y={12} width={40} height={156} fill="#b8c4d6" />
      {/* B = vrai prolongement (plus bas) */}
      <line x1={140} y1={108.7} x2={215} y2={143.7} stroke="#2b2b2b" strokeWidth={4} />
      {/* A = leurre (plus haut, semble aligné) */}
      <line x1={140} y1={86} x2={215} y2={121} stroke="#2b2b2b" strokeWidth={4} />
      <text x={150} y={80} fontSize={15} fontWeight={800} fill="#111">A</text>
      <text x={150} y={132} fontSize={15} fontWeight={800} fill="#111">B</text>
      {reveal && (
        <line x1={25} y1={55} x2={215} y2={143.7} {...proof} strokeWidth={3} />
      )}
    </>
  );
}

function White({ reveal }: { reveal: boolean }) {
  const n = 8;
  const bw = 26;
  const x0 = 8;
  const ytop = 25;
  const h = 130;
  const grey = "#8d8d8d";
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < n; i++)
    bars.push(
      <rect key={i} x={x0 + i * bw} y={ytop} width={bw} height={h} fill={i % 2 === 0 ? "#1b1b1b" : "#f2f2f2"} />
    );
  return (
    <>
      {bars}
      {/* gris posé sur une barre noire */}
      <rect x={x0 + 2 * bw} y={62} width={bw} height={56} fill={grey} />
      {/* gris posé sur une barre blanche */}
      <rect x={x0 + 5 * bw} y={62} width={bw} height={56} fill={grey} />
      {reveal && (
        <g {...proof}>
          <rect x={x0 + 2 * bw} y={62} width={bw} height={56} />
          <rect x={x0 + 5 * bw} y={62} width={bw} height={56} />
        </g>
      )}
    </>
  );
}

function paraPath(ox: number, oy: number, u: [number, number], v: [number, number]) {
  const ax = ox;
  const ay = oy;
  const bx = ox + u[0];
  const by = oy + u[1];
  const cx = ox + u[0] + v[0];
  const cy = oy + u[1] + v[1];
  const dx = ox + v[0];
  const dy = oy + v[1];
  return `M${ax} ${ay} L${bx} ${by} L${cx} ${cy} L${dx} ${dy} Z`;
}
function Shepard({ reveal }: { reveal: boolean }) {
  // Deux plateaux congruents : le droit est le gauche tourné de 90°.
  const left = paraPath(35, 70, [58, -22], [20, 30]);
  const right = paraPath(165, 55, [22, 58], [-30, 20]);
  return (
    <>
      <path d={left} fill="#caa97a" stroke="#7a5c33" strokeWidth={2} />
      <path d={right} fill="#caa97a" stroke="#7a5c33" strokeWidth={2} />
      {/* quelques pieds pour suggérer des tables */}
      <g stroke="#7a5c33" strokeWidth={3} strokeLinecap="round">
        <line x1={55} y1={100} x2={55} y2={120} />
        <line x1={113} y1={78} x2={113} y2={98} />
        <line x1={157} y1={133} x2={157} y2={153} />
        <line x1={187} y1={113} x2={187} y2={133} />
      </g>
      {reveal && (
        <g {...proof}>
          <path d={left} />
          <path d={right} />
        </g>
      )}
    </>
  );
}

// Vase de Rubin : figure / fond. Le profil noir du vase EST aussi deux visages.
const RUBIN_LEFT: [number, number][] = [
  [100, 34], [96, 44], [99, 56], [90, 66], [82, 78], [95, 86],
  [89, 94], [92, 100], [86, 108], [99, 120], [94, 134], [108, 152],
];
function Rubin({ reveal }: { reveal: boolean }) {
  const right = [...RUBIN_LEFT].reverse().map(([x, y]) => [240 - x, y] as [number, number]);
  const poly = [...RUBIN_LEFT, ...right].map((p) => p.join(",")).join(" ");
  return (
    <>
      <polygon points={poly} fill="#262626" />
      {reveal && (
        <g {...proof}>
          <polyline points={RUBIN_LEFT.map((p) => p.join(",")).join(" ")} />
          <polyline points={right.map((p) => p.join(",")).join(" ")} />
        </g>
      )}
    </>
  );
}

// Canard-lapin : deux pointes à gauche (bec OU oreilles), tête ronde à droite.
const DUCK_RABBIT =
  "M34,66 L120,72 C150,58 185,66 196,92 C200,112 180,126 150,128 " +
  "C130,130 120,120 116,110 L34,106 L70,86 Z";
function DuckRabbit({ reveal }: { reveal: boolean }) {
  return (
    <>
      <path d={DUCK_RABBIT} fill="#c9b48a" stroke="#7a6a42" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={138} cy={82} r={6} fill="#2b2b2b" />
      {reveal && (
        <g {...proof}>
          {/* les deux pointes : bec de canard / oreilles de lapin */}
          <line x1={34} y1={66} x2={116} y2={74} />
          <line x1={34} y1={106} x2={116} y2={100} />
        </g>
      )}
    </>
  );
}

// Image rémanente : drapeau en couleurs complémentaires + point de fixation.
function Afterimage({ reveal }: { reveal: boolean }) {
  return (
    <>
      <rect x={30} y={40} width={60} height={100} fill="#ff7a00" />
      <rect x={90} y={40} width={60} height={100} fill="#111" />
      <rect x={150} y={40} width={60} height={100} fill="#00e0e0" />
      <circle cx={120} cy={90} r={4} fill="#fff" />
      {reveal && (
        <g>
          <rect x={84} y={150} width={24} height={22} fill="#0a3d91" />
          <rect x={108} y={150} width={24} height={22} fill="#f4f4f4" stroke="#bbb" strokeWidth={0.5} />
          <rect x={132} y={150} width={24} height={22} fill="#d52b1e" />
        </g>
      )}
    </>
  );
}

// Cécité au mouvement : grille bleue qui tourne + points jaunes fixes.
function MotionBlind({ reveal }: { reveal: boolean }) {
  const crosses: React.ReactNode[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const x = 36 + c * 42;
      const y = 18 + r * 36;
      crosses.push(
        <g key={`${r}-${c}`} stroke="#4a78e8" strokeWidth={3} strokeLinecap="round">
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
        </g>
      );
    }
  const dots: [number, number][] = [[78, 54], [162, 54], [120, 126]];
  return (
    <>
      <rect x={0} y={0} width={240} height={180} fill="#101018" />
      <g>
        {crosses}
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 120 90"
          to="360 120 90"
          dur="9s"
          repeatCount="indefinite"
        />
      </g>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={7} fill="#ffd21e" />
      ))}
      {/* croix de fixation rouge */}
      <g stroke="#ff3b30" strokeWidth={3} strokeLinecap="round">
        <line x1={114} y1={90} x2={126} y2={90} />
        <line x1={120} y1={84} x2={120} y2={96} />
      </g>
      {reveal &&
        dots.map(([x, y], i) => (
          <circle key={`r${i}`} cx={x} cy={y} r={11} fill="none" stroke={GREEN} strokeWidth={2.5} />
        ))}
    </>
  );
}

// Triangle de Penrose : objet impossible. Trois poutres qui se chevauchent
// en boucle (chaque poutre dépasse le coin et passe « devant » la suivante).
function Penrose({ reveal }: { reveal: boolean }) {
  const O: [number, number][] = [
    [120, 32],  // sommet
    [58, 150],  // bas-gauche
    [182, 150], // bas-droite
  ];
  const G: [number, number] = [
    (O[0][0] + O[1][0] + O[2][0]) / 3,
    (O[0][1] + O[1][1] + O[2][1]) / 3,
  ];
  const w = 22; // épaisseur des poutres
  const faces: string[] = [];
  for (let i = 0; i < 3; i++) {
    const P = O[i];
    const Q = O[(i + 1) % 3];
    const ex = Q[0] - P[0], ey = Q[1] - P[1];
    const el = Math.hypot(ex, ey);
    const ux = ex / el, uy = ey / el;
    let nx = -uy, ny = ux; // normale, orientée vers le centre
    const mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2;
    if ((G[0] - mx) * nx + (G[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
    // la poutre dépasse le coin Q d'une largeur w → chevauchement
    const A: [number, number] = [P[0], P[1]];
    const B: [number, number] = [Q[0] + ux * w, Q[1] + uy * w];
    const C: [number, number] = [Q[0] + ux * w + nx * w, Q[1] + uy * w + ny * w];
    const D: [number, number] = [P[0] + nx * w, P[1] + ny * w];
    faces.push(`M${A[0]} ${A[1]} L${B[0]} ${B[1]} L${C[0]} ${C[1]} L${D[0]} ${D[1]} Z`);
  }
  const shades = ["#dadada", "#b0b0b0", "#828282"];
  return (
    <>
      {faces.map((d, i) => (
        <path key={i} d={d} fill={shades[i]} stroke="#2b2b2b" strokeWidth={2} strokeLinejoin="round" />
      ))}
      {reveal && (
        <text x={120} y={174} textAnchor="middle" fontSize={13} fontWeight={700} fill={GREEN}>
          objet impossible
        </text>
      )}
    </>
  );
}

const RENDERERS: Record<IllusionKind, (p: { reveal: boolean }) => React.ReactNode> = {
  "muller-lyer": MullerLyer,
  "vertical-horizontal": VerticalHorizontal,
  "count-circles": CountCircles,
  ebbinghaus: Ebbinghaus,
  ponzo: Ponzo,
  delboeuf: Delboeuf,
  jastrow: Jastrow,
  "cafe-wall": CafeWall,
  hermann: Hermann,
  adelson: Adelson,
  kanizsa: Kanizsa,
  fraser: Fraser,
  contrast: Contrast,
  necker: Necker,
  "gradient-bar": GradientBar,
  zollner: Zollner,
  hering: Hering,
  scintillating: Scintillating,
  poggendorff: Poggendorff,
  white: White,
  shepard: Shepard,
  rubin: Rubin,
  "duck-rabbit": DuckRabbit,
  afterimage: Afterimage,
  "motion-blind": MotionBlind,
  penrose: Penrose,
};

export default function IllusionArt({ kind, reveal }: Props) {
  const R = RENDERERS[kind];
  return (
    <svg className="illusion-art" viewBox="0 0 240 180" role="img" aria-label="Illusion d'optique">
      <rect x={0} y={0} width={240} height={180} fill="#fff" />
      {R({ reveal })}
    </svg>
  );
}
