"use client";
import { useEffect, useState, useRef } from "react";

export const PAD_ROW_COLORS = ["#5ef2ff", "#a78bfa", "#fbbf24", "#fdba74", "#34d399", "#38bdf8"];
export const PAD_KEYS: { code: string; label: string }[][] = [
  [["Digit1","1"],["Digit2","2"],["Digit3","3"],["Digit4","4"],["Digit5","5"]],
  [["KeyQ","A"],["KeyW","Z"],["KeyE","E"],["KeyR","R"],["KeyT","T"]],
  [["KeyA","Q"],["KeyS","S"],["KeyD","D"],["KeyF","F"],["KeyG","G"]],
  [["KeyZ","W"],["KeyX","X"],["KeyC","C"],["KeyV","V"],["KeyB","B"]],
].map(r => r.map(([code, label]) => ({ code, label })));

export function SamplePadButton({ label, info, kind, color, on, keyLabel, onPress }: { label: string; info: string; kind: "loop" | "shot"; color: string; on: boolean; keyLabel?: string; onPress: (down: boolean) => void }) {
  const [hit, setHit] = useState(false);

  useEffect(() => {
    if (hit) {
      const timer = setTimeout(() => setHit(false), 120);
      return () => clearTimeout(timer);
    }
  }, [hit]);

  return (
    <button
      type="button"
      aria-pressed={on}
      title={kind === "loop" ? "Boucle : frappe pour lancer ou arrêter, calée sur la grille" : "Coup : joue une fois"}
      className={`hw-pad ${on ? "hw-pad-loaded" : ""} ${hit ? "hw-pad-hit" : ""} relative flex aspect-square w-full min-w-[64px] max-w-[120px] flex-col items-center justify-center gap-0.5 p-1.5 text-center select-none touch-none`}
      style={{ ["--rgb" as string]: color }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (err) {
          console.error("Failed to set pointer capture:", err);
        }
        setHit(true);
        onPress(true);
      }}
      onPointerUp={() => onPress(false)}
      onPointerCancel={() => onPress(false)}
    >
      <span className="text-[11px] font-black leading-tight">{label}</span>
      <span className="text-[9px] leading-tight opacity-80">{info}</span>
      <span className="absolute bottom-1 text-[8px] font-bold tracking-wider opacity-70">
        {kind === "loop" ? "BOUCLE" : "COUP"}
      </span>
      {keyLabel && (
        <span className="absolute left-1.5 top-1 text-[9px] font-bold opacity-60">
          {keyLabel}
        </span>
      )}
    </button>
  );
}

export function usePadKeys(enabled: boolean, rows: number, onKey: (row: number, col: number, down: boolean) => void) {
  const onKeyRef = useRef(onKey);

  useEffect(() => {
    onKeyRef.current = onKey;
  }, [onKey]);

  useEffect(() => {
    if (!enabled) return;

    const handleKey = (e: KeyboardEvent, down: boolean) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      for (let row = 0; row < Math.min(rows, PAD_KEYS.length); row++) {
        const col = PAD_KEYS[row].findIndex(key => key.code === e.code);
        if (col !== -1) {
          onKeyRef.current(row, col, down);
          e.preventDefault();
          break;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => handleKey(e, true);
    const handleKeyUp = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, rows]);
}
