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
