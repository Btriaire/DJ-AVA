import { PIXEL_PALETTE } from "../lib/pixelScenes";

type Props = {
  rows: string[];
  size?: number;
  className?: string;
  // fenêtre optionnelle pour n'afficher qu'une portion (utilisé par le taquin)
  crop?: { x: number; y: number; w: number; h: number };
};

export default function PixelArt({ rows, size = 120, className, crop }: Props) {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const vb = crop
    ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}`
    : `0 0 ${w} ${h}`;
  const ratio = crop ? crop.h / crop.w : h / w;
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * ratio)}
      viewBox={vb}
      shapeRendering="crispEdges"
      role="img"
    >
      {rows.map((row, y) =>
        row.split("").map((ch, x) => {
          const fill = PIXEL_PALETTE[ch] ?? "transparent";
          if (fill === "transparent") return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />;
        })
      )}
    </svg>
  );
}
