import { Cover, Mosaic } from "./parts";
import { inkOn, patternShapes, resolveArt, seedOf, type SetLook } from "@/lib/setLook";
import type { LibTrack } from "@/lib/library";

export function SetArt({ set, tracks, accent, size = 56, rounded = 6 }: { set: { name: string; cover?: string; look?: SetLook }; tracks: LibTrack[]; accent: string; size?: number; rounded?: number }) {
  const art = resolveArt(set);
  const showTitle = !!set.look?.showTitle && size >= 72;

  return (
    <div className="relative shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: rounded }} aria-hidden>
      {art === "image" && <Cover art={set.cover} name={set.name} size={size} rounded={rounded} />}
      {art === "mosaic" && <Mosaic tracks={tracks.slice(0, 4)} size={size} accent={accent} />}
      {art !== "image" && art !== "mosaic" && (
        <svg viewBox="0 0 100 100" width={size} height={size} className="block">
          <rect width="100" height="100" fill={`color-mix(in srgb, ${accent} 12%, #0b0d10)`} />
          {patternShapes(art, seedOf(set.name), tracks.map((t) => t.bpm ?? 0).filter((b) => b > 0)).map((s, i) => {
            switch (s.t) {
              case "circle":
                return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} stroke={accent} fill={s.fill ? accent : "none"} strokeWidth={0.8} opacity={s.o} />;
              case "line":
                return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={accent} strokeWidth={0.7} opacity={s.o} />;
              case "rect":
                return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={accent} opacity={s.o} />;
              case "poly":
                return <polyline key={i} points={s.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={accent} strokeWidth={1.1} opacity={s.o} />;
            }
          })}
        </svg>
      )}
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 truncate px-1.5 py-1 text-center font-black" style={{ background: accent, color: inkOn(accent), fontSize: Math.max(10, Math.round(size * 0.11)) }}>
          {set.name}
        </div>
      )}
    </div>
  );
}
