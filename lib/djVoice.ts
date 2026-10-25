// The radio voice: the system voice (French when there is one) announces the songs. Browser speech only:
// it needs no server and no download. Callers lower the music while it speaks (onStart / onEnd).

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function frenchVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("fr-fr") && v.localService) ?? voices.find((v) => v.lang.toLowerCase().startsWith("fr"));
}

export function speak(text: string, hooks: { onStart?: () => void; onEnd?: () => void } = {}): void {
  if (!canSpeak() || !text.trim()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  const v = frenchVoice();
  if (v) u.voice = v;
  u.rate = 1.02;
  u.onstart = () => hooks.onStart?.();
  u.onend = () => hooks.onEnd?.();
  u.onerror = () => hooks.onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
  stopLines();
}

// ---- the English DJ voice: clips made ahead of time on the server (lib/voiceVps.ts), played from the cache ----

let current: HTMLAudioElement | null = null;
let restore: (() => void) | null = null; // gives the music its volume back if the clips are cut short

export const lineUrl = (text: string, cacheOnly: boolean) => `/api/radio/voice?text=${encodeURIComponent(text)}${cacheOnly ? "&only=cache" : ""}`;

// plays the clips one after the other; a clip that is not made yet is skipped (never waits for the server)
export function playLines(texts: string[], hooks: { onStart?: () => void; onEnd?: () => void } = {}): void {
  if (typeof window === "undefined" || texts.length === 0) return;
  let started = false;
  const finish = () => {
    current = null;
    restore = null;
    if (started) hooks.onEnd?.();
  };
  restore = () => {
    restore = null;
    if (started) hooks.onEnd?.();
  };
  const next = (i: number) => {
    if (i >= texts.length) return finish();
    const a = new Audio(lineUrl(texts[i], true));
    current = a;
    a.onplaying = () => {
      if (!started) {
        started = true;
        hooks.onStart?.();
      }
    };
    a.onended = () => next(i + 1);
    a.onerror = () => next(i + 1); // 404: this clip is not made yet
    a.play().catch(() => next(i + 1));
  };
  next(0);
}

export function stopLines(): void {
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    current = null;
  }
  restore?.();
}
