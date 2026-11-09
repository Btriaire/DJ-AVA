// Fixed contract of the choir sounds: vowel formants and the voicing of each layer (no audio context here)
import { FORMANTS, voicing } from "./lyricChoirNotes";

export function lyricChoirNotesTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };
  const vowels = ["a", "e", "i", "o", "u"] as const;
  for (const v of vowels) {
    const f = FORMANTS[v];
    check(!!f && f.freq.length === 3 && f.gain.length === 3, `${v} : trois formants`);
    if (!f) continue;
    check(f.freq[0] < f.freq[1] && f.freq[1] < f.freq[2], `${v} : F1 < F2 < F3`);
    check(f.freq[0] >= 250 && f.freq[0] <= 900 && f.freq[2] <= 3500, `${v} : formants dans la voix humaine`);
    check(f.gain[0] >= f.gain[1] && f.gain[1] >= f.gain[2] && f.gain[0] <= 1, `${v} : le premier formant porte le plus`);
  }
  // the vowels must sound different: a is open (high F1), i is closed and bright (low F1, high F2), u and o are dark (low F2)
  check(FORMANTS.a.freq[0] > FORMANTS.i.freq[0] + 300, "a plus ouvert que i");
  check(FORMANTS.i.freq[1] > FORMANTS.u.freq[1] + 800, "i plus clair que u");
  check(FORMANTS.o.freq[1] < FORMANTS.e.freq[1], "o plus sombre que e");

  // voicing: each chord note in [low, low + 12), the root doubled an octave above, sorted, no duplicate
  check(voicing([48, 52, 55], 55).join() === "55,60,64,72", `do majeur au choeur : ${voicing([48, 52, 55], 55).join()}`);
  check(voicing([57, 60, 64], 48).join() === "48,52,57,69", `la mineur en nappe : ${voicing([57, 60, 64], 48).join()}`);
  check(voicing([50, 53, 57, 60], 60).join() === "60,62,65,69,74", `re mineur 7 aux cordes : ${voicing([50, 53, 57, 60], 60).join()}`);
  check(voicing([48, 60, 72], 55).join() === "60,72", "octaves fusionnees");
  check(voicing([], 55).length === 0, "pas d'accord, pas de note");
  return fails;
}
