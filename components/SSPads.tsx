import { useEffect, useRef, useState } from "react";

export type SSPadsProps = {
  onPlay: (index: number) => void;
  onRelease?: (index: number) => void;
  sliceLabel: (index: number) => string;
};

const KEYS = ["A","S","D","F","G","H","J","K","Z","X","C","V","B","N","M",","] as const;
const ROW_COLORS = ["#5ef2ff", "#a78bfa", "#fbbf24", "#fdba74"] as const;

export function SSPads({ onPlay, onRelease, sliceLabel }: SSPadsProps) {
  const [pressed, setPressed] = useState(new Set<number>());
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerDown = (index: number) => {
    setPressed((s) => new Set(s).add(index));
    onPlay(index);
  };

  const handlePointerUp = (index: number) => {
    setPressed((s) => {
      const newSet = new Set(s);
      newSet.delete(index);
      return newSet;
    });
    onRelease?.(index);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.repeat || target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      const keyIndex = KEYS.findIndex((k) => e.code === `Key${k}` || (k === "," && e.code === "Comma"));
      if (keyIndex === -1) return;

      e.preventDefault();
      setPressed((s) => new Set(s).add(keyIndex));
      onPlay(keyIndex);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyIndex = KEYS.findIndex((k) => e.code === `Key${k}` || (k === "," && e.code === "Comma"));
      if (keyIndex === -1) return;

      setPressed((s) => {
        const newSet = new Set(s);
        newSet.delete(keyIndex);
        return newSet;
      });
      onRelease?.(keyIndex);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onPlay, onRelease]);

  return (
    <div ref={ref} className="grid grid-cols-4 gap-2">
      {Array.from({ length: 16 }).map((_, i) => {
        const row = Math.floor(i / 4);
        const isPressed = pressed.has(i);
        const accentColor = ROW_COLORS[row];
        const keyLabel = KEYS[i];

        return (
          <div
            key={i}
            className="relative aspect-square rounded-[10px] overflow-hidden cursor-pointer"
            onPointerDown={() => handlePointerDown(i)}
            onPointerUp={() => handlePointerUp(i)}
            onPointerLeave={() => handlePointerUp(i)}
          >
            <div
              className="absolute inset-0 bg-gradient-to-b from-[#202126] to-[#0c0d10] border border-black rounded-[10px]"
              style={{
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
                backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 0%, transparent 50%)",
              }}
            >
              <div
                className="absolute top-0 left-0 w-full h-1 rounded-t-[10px]"
                style={{
                  backgroundColor: isPressed ? accentColor : "#333",
                  boxShadow: isPressed ? `0 0 8px ${accentColor}` : "none",
                }}
              />
              <div className="absolute top-2 left-2 text-xs text-gray-400">{i + 1}</div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-mono">{keyLabel}</div>
                <div className="text-xs mt-1">{sliceLabel(i)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
