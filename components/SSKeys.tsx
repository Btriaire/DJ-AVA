import { useEffect, useRef, useState } from "react";

export type SSKeysProps = {
  baseNote: number;
  activeMask: number;
  onDown: (note: number) => void;
  onUp: (note: number) => void;
  onOctave: (delta: number) => void;
};

const KEY_IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false, false, true, false, true];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYBOARD_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma"];

export function SSKeys({ baseNote, activeMask, onDown, onUp, onOctave }: SSKeysProps) {
  const [, force] = useState(0);
  const pressedKeys = useRef(new Set<string>());
  const containerRef = useRef<HTMLDivElement>(null);

  const getNoteName = (index: number): string => {
    const note = baseNote + index;
    const octave = Math.floor(note / 12) - 1;
    return `${NOTE_NAMES[note % 12]}${octave}`;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target as HTMLElement).isContentEditable) {
      return;
    }

    if (e.code === "BracketLeft") {
      onOctave(-1);
      e.preventDefault();
      return;
    }

    if (e.code === "BracketRight") {
      onOctave(1);
      e.preventDefault();
      return;
    }

    const index = KEYBOARD_CODES.indexOf(e.code);
    if (index === -1 || pressedKeys.current.has(e.code)) {
      return;
    }

    pressedKeys.current.add(e.code);
    onDown(baseNote + index);
    e.preventDefault();
    force((n) => n + 1);
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const index = KEYBOARD_CODES.indexOf(e.code);
    if (index === -1) {
      return;
    }

    pressedKeys.current.delete(e.code);
    onUp(baseNote + index);
    force((n) => n + 1);
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [baseNote, onDown, onUp, onOctave]);

  const renderKey = (index: number) => {
    const isBlack = KEY_IS_BLACK[index];
    const isActive = (activeMask & (1 << index)) !== 0;
    const note = baseNote + index;
    const whiteBefore = KEY_IS_BLACK.slice(0, index).filter(b => !b).length;
    const whiteWidth = 100 / 9.3; // 9 touches blanches + marge pour la 16e touche noire
    const left = isBlack ? `${whiteBefore * whiteWidth - whiteWidth * 0.3}%` : `${whiteBefore * whiteWidth}%`;
    const width = isBlack ? `${whiteWidth * 0.6}%` : `${whiteWidth}%`;
    const height = isBlack ? "62%" : "100%";
    const zIndex = isBlack ? 1 : 0;
    const bgGradient = isBlack ? "linear-gradient(to bottom, #34343a, #050507)" : "linear-gradient(to bottom, #fbfaf5, #d9d5c9)";
    const boxShadow = isBlack ? "0 2px 4px rgba(0, 0, 0, 0.5)" : "0 3px 6px rgba(0, 0, 0, 0.3)";
    const activeStyle = isActive ? "border: 1px solid #5ef2ff; box-shadow: 0 0 10px #5ef2ff;" : "";

    return (
      <div
        key={index}
        style={{
          position: "absolute",
          left,
          width,
          height,
          zIndex,
          background: bgGradient,
          borderRadius: isBlack ? "0 0 4px 4px" : "0 0 6px 6px",
          boxShadow,
          cursor: "pointer",
          ...(isActive ? { border: "1px solid #5ef2ff", boxShadow: "0 0 10px #5ef2ff" } : {}),
        }}
        onPointerDown={() => onDown(note)}
        onPointerUp={() => onUp(note)}
        onPointerLeave={() => onUp(note)}
      >
        {!isBlack && (
          <div style={{ position: "absolute", bottom: "4px", width: "100%", textAlign: "center", fontSize: "12px", color: "#333" }}>
            {getNoteName(index)}
          </div>
        )}
        {isBlack && (
          <div style={{ position: "absolute", bottom: "4px", width: "100%", textAlign: "center", fontSize: "10px", color: "#fff" }}>
            {getNoteName(index)}
          </div>
        )}
        <div style={{ position: "absolute", top: "4px", width: "100%", textAlign: "center", fontSize: "10px", color: "#aaa" }}>
          {KEYBOARD_CODES[index].replace("Key", "")}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "220px",
        background: "linear-gradient(to bottom, #101114, #0a0b0e)",
        borderRadius: "8px",
        padding: "10px",
        border: "1px solid #000",
        boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", color: "#c9ccd1", fontSize: "12px" }}>
        <span>CLAVIER</span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span>OCT {Math.floor(baseNote / 12) - 1}</span>
          <button
            onClick={() => onOctave(-1)}
            style={{
              width: "20px",
              height: "20px",
              background: "#1a1b1f",
              border: "1px solid #000",
              color: "#c9ccd1",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            −
          </button>
          <button
            onClick={() => onOctave(1)}
            style={{
              width: "20px",
              height: "20px",
              background: "#1a1b1f",
              border: "1px solid #000",
              color: "#c9ccd1",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>
      </div>
      <div style={{ position: "relative", height: "176px" }}>
        {Array.from({ length: 16 }).map((_, index) => renderKey(index))}
      </div>
    </div>
  );
}
