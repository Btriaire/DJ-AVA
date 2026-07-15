"use client";
import { useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";

// Compact Web MIDI control: connect/disconnect a USB MIDI keyboard (Arturia
// MiniLab & co.), show the device name, and blink an LED on note activity.
// Clicking is what triggers the browser permission prompt, so this stays a
// user-gesture button rather than auto-connecting.
export function MidiButton({ engine }: { engine: DJEngine }) {
  const midi = engine.midi;
  const [, force] = useState(0);
  // defensive: an engine built before MIDI existed (stale hot-reload instance)
  // won't have `.midi` — render nothing rather than crash the synth panel.
  const ok = !!midi;
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!midi) return;
    const unsub = midi.subscribe(() => {
      force((n) => n + 1);
      // blink the LED whenever a note/pad just came in
      if (performance.now() - midi.lastNoteAt < 60) {
        setFlash(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(false), 130);
      }
    });
    return () => {
      unsub();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [midi]);

  if (!ok) return null;
  if (!midi.state.supported) {
    return (
      <span
        className="rounded px-1.5 py-1 text-[8px] font-bold uppercase text-neutral-600"
        title="Web MIDI non supporté par ce navigateur (essaie Chrome/Edge)"
      >
        MIDI ✕
      </span>
    );
  }

  const on = midi.state.enabled;
  const dev = midi.state.devices[0];
  return (
    <button
      onClick={() => midi.toggle()}
      className={`opxy-iconbtn relative ${on ? "opxy-iconbtn-on" : ""}`}
      title={
        on
          ? `MIDI actif${dev ? ` — ${dev}` : ""}. Touches → synthé · pads → sampler · molette/encodeurs → réglages. Clique pour couper.`
          : "Connecter un clavier MIDI (Arturia MiniLab…). Nécessite localhost ou HTTPS."
      }
    >
      <span
        className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
        style={{
          background: on ? (flash ? "#ffe000" : "#ffcc00") : "#444",
          boxShadow: on && flash ? "0 0 5px #ffe000" : "none",
        }}
      />
      <span className="text-[9px] font-bold tracking-wide">MIDI</span>
    </button>
  );
}
