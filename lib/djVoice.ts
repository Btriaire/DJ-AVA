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
}
