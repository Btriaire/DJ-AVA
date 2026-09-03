// Décor flottant, purement zen et décoratif : quelques pétales/feuilles
// pastel dérivent lentement derrière le plateau. Aucun impact sur le jeu.

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

const PALETTE = [
  { fill: "#f6b8d0", stroke: "#d94f86" }, // pétale rose
  { fill: "#f7dd85", stroke: "#c9971f" }, // pétale or
  { fill: "#bfe0d1", stroke: "#4f9d83" }, // feuille verte
];

export default function MahjongAmbient({ count = 10 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => {
    const palette = PALETTE[i % PALETTE.length];
    return {
      id: i,
      left: rnd(2, 96),
      size: rnd(11, 19),
      duration: rnd(16, 28),
      delay: -rnd(0, 26), // démarrage décalé, pour éviter l'effet « tous ensemble »
      drift: rnd(-26, 26),
      spin: rnd(-50, 50),
      ...palette,
    };
  });

  return (
    <div className="mj-ambient" aria-hidden="true">
      {items.map((p) => (
        <span
          key={p.id}
          className="mj-mote"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--mj-drift": `${p.drift}px`,
              "--mj-spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 20 20" width="100%" height="100%">
            <path
              d="M10 10 C10 4 6 2 10 0 C14 2 10 4 10 10 Z"
              fill={p.fill}
              stroke={p.stroke}
              strokeWidth={0.6}
            />
          </svg>
        </span>
      ))}
    </div>
  );
}
