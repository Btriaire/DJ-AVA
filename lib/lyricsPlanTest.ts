// Fixed contract of the lyrics plan: LRC lines, sung vowels, refrains, and the timing set on the real voice (no network here)
import { alignOffset, alignQuality, buildPhrases, refineOnVoice, cleanTerm, nextPhrase, parseLrc, phraseAt, vowelTimes, vowelsOf } from "./lyricsPlan";

export function lyricsPlanTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };
  const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

  // LRC: one or more time stamps per line, metadata tags ignored, sorted, empty lines kept as stops
  const lrc = "[ar:Artiste]\n[ti:Titre]\n[00:12.50]Bonjour la nuit\n[00:20.00][01:05.25] Refrain encore \n[00:30.00]\n[00:09.10]Avant";
  const lines = parseLrc(lrc);
  check(lines.length === 5, `5 lignes horodatees, recu ${lines.length}`);
  check(lines[0]?.text === "Avant" && near(lines[0].t, 9.1), "tri par temps");
  check(lines.some((l) => near(l.t, 65.25) && l.text === "Refrain encore"), "deux horodatages sur une ligne, texte rogne");
  check(lines.some((l) => near(l.t, 30) && l.text === ""), "une ligne vide reste comme arret");
  check(parseLrc("Juste du texte\nsans temps").length === 0, "texte simple : aucune ligne horodatee");
  check(parseLrc("[00:12.05]x")[0] !== undefined && near(parseLrc("[00:12.05]x")[0].t, 12.05), "centiemes avec un zero en tete");
  check(parseLrc("[01:02.3]x")[0] !== undefined && near(parseLrc("[01:02.3]x")[0].t, 62.3), "dixiemes acceptes");

  // the search term from a deck name
  check(cleanTerm("Daft Punk - Get Lucky (Official Video).mp3") === "Daft Punk - Get Lucky", `nom nettoye : ${cleanTerm("Daft Punk - Get Lucky (Official Video).mp3")}`);
  check(cleanTerm("Stromae_Alors_on_danse [Clip HD]") === "Stromae Alors on danse", `soulignes et crochets : ${cleanTerm("Stromae_Alors_on_danse [Clip HD]")}`);
  check(cleanTerm("Artiste - Titre (Remix)") === "Artiste - Titre (Remix)", "une parenthese musicale reste");

  // sung vowels, one per syllable
  check(vowelsOf("get lucky").join("") === "eui", `get lucky : ${vowelsOf("get lucky").join("")}`);
  check(vowelsOf("Amour").join("") === "au", `amour : ${vowelsOf("Amour").join("")}`);
  check(vowelsOf("je t'aime").join("") === "ee", `je t'aime (e muet final) : ${vowelsOf("je t'aime").join("")}`);
  check(vowelsOf("ÉTÉ").join("") === "ee", "accents enleves");
  check(vowelsOf("beau soir").join("") === "oa", `beau soir : ${vowelsOf("beau soir").join("")}`);
  check(vowelsOf("").join("") === "a" && vowelsOf("...").join("") === "a", "rien a chanter : un aa");
  check(vowelsOf("la ".repeat(40)).length === 24, "24 syllabes au plus par ligne");

  // phrases: they stop before the next line, last at most 8 s, the refrains are the lines heard twice
  const ph = buildPhrases(lines);
  check(ph.length === 4, `4 phrases chantees (la ligne vide n'en fait pas), recu ${ph.length}`);
  const bonjour = ph.find((p) => p.text === "Bonjour la nuit");
  // a phrase ends when its syllables are sung (0.5 s + 0.28 s each), at the latest 0.1 s before the next line
  const sung = (text: string) => 0.5 + 0.28 * vowelsOf(text).length;
  check(!!bonjour && near(bonjour.start, 12.5) && near(bonjour.end, 12.5 + sung("Bonjour la nuit")), `fin a la derniere syllabe : ${bonjour?.end}`);
  const long = buildPhrases([{ t: 0, text: "la ".repeat(20) }, { t: 3, text: "fin" }]);
  check(near(long[0].end, 2.9), `une longue phrase s'arrete 0,1 s avant la suivante : ${long[0].end}`);
  const solo = buildPhrases([{ t: 0, text: "la ".repeat(24) }]);
  check(near(solo[0].end, 4), `derniere ligne : 4 s au plus : ${solo[0].end}`);
  const refr = ph.filter((p) => p.text === "Refrain encore");
  check(refr.length === 2 && refr.every((p) => p.refrain), "une ligne entendue deux fois est un refrain");
  check(refr[0] !== undefined && near(refr[0].end, 20 + sung("Refrain encore")), `refrain : fin a la derniere syllabe : ${refr[0]?.end}`);
  check(near(buildPhrases([{ t: 0, text: "la ".repeat(24) }, { t: 30, text: "x" }])[0].end, 7.22), "24 syllabes : 7,22 s (sous les 8 s)");
  check(!!bonjour && !bonjour.refrain, "une ligne unique n'est pas un refrain");
  const last = ph[ph.length - 1];
  check(near(last.end - last.start, Math.min(4, sung(last.text))), `derniere phrase : ${last.end - last.start}`);
  const tight = buildPhrases([{ t: 5, text: "a" }, { t: 5.1, text: "b" }]);
  check(tight[0].end - tight[0].start >= 0.3 - 1e-9, "une phrase dure au moins 0,3 s");
  check(buildPhrases([{ t: 1, text: "Ho" }, { t: 4, text: "ho!" }]).every((p) => p.refrain), "refrain sans tenir compte de la casse ni de la ponctuation");

  // credit lines (NetEase puts the authors at 00:00) are not sung
  const credits = buildPhrases(parseLrc("[00:00.00] \u4f5c\u66f2 : Pharrell Williams\n[00:00.50]\u4f5c\u8bcd\uff1aX\n[00:01.00] Written by: Daft Punk\n[00:02.00] Produced by Nile\n[00:35.79] Like the legend of the phoenix"));
  check(credits.length === 1 && credits[0].text.startsWith("Like"), `credits ignores : ${credits.map((p) => p.text).join(" / ")}`);
  check(buildPhrases([{ t: 1, text: "Note: ceci reste" }]).length === 1, "un deux-points dans une vraie parole reste");
  check(phraseAt(ph, 13) === ph.indexOf(bonjour!), "phrase en cours");
  check(phraseAt(ph, 0) === -1 && phraseAt(ph, 500) === -1, "hors des phrases");
  check(nextPhrase(ph, 13) === ph.indexOf(bonjour!) + 1 && nextPhrase(ph, 500) === -1, "phrase suivante");

  const vt = vowelTimes({ start: 10, end: 12, text: "get lucky", vowels: ["e", "u", "i"], refrain: false });
  check(vt.length === 3 && near(vt[0].at, 10) && near(vt[1].at, 10 + 2 / 3) && vt[2].v === "i", "voyelles reparties sur la phrase");

  // the LRC can be ahead or behind the YouTube version: the offset is found on the voice stem
  const step = 0.05;
  const starts = [10, 16, 23, 31, 38, 47];
  const shift = 1.5;
  const voice = new Array(Math.round(60 / step)).fill(-1);
  for (const s of starts) for (let t = s + shift; t < s + shift + 3; t += step) voice[Math.round(t / step)] = 60;
  const sp = starts.map((s) => ({ start: s, end: s + 3, text: "x", vowels: ["a" as const], refrain: false }));
  const off = alignOffset(sp, voice, step);
  check(Math.abs(off - shift) <= 0.2, `decalage trouve sur la voix : ${off} au lieu de ${shift}`);
  const late = voice.map((_, i) => voice[i + Math.round(2 / step)] ?? -1);
  check(Math.abs(alignOffset(sp, late, step) - (shift - 2)) <= 0.2, `decalage negatif : ${alignOffset(sp, late, step)}`);
  check(alignOffset(sp, [], step) === 0 && alignOffset([], voice, step) === 0, "sans voix ou sans phrase : 0");
  check(Math.abs(alignOffset(sp, voice, step, 1)) <= 1, "le decalage reste dans la plage demandee");
  // the objective prefers the offset where the voice starts with the phrase, not one inside a long sung stretch
  const held = new Array(Math.round(60 / step)).fill(-1);
  for (let t = 9.0; t < 30; t += step) held[Math.round(t / step)] = 60; // one long sung stretch from 9 s
  const one = [{ start: 10, end: 13, text: "x", vowels: ["a" as const], refrain: false }];
  check(Math.abs(alignOffset(one, held, step) - -1) <= 0.15, `une phrase calee sur l'attaque de la voix : ${alignOffset(one, held, step)}`);

  // the global offset never loses phrases that start with the voice (Like a Prayer: 85 % -> 82 % before this rule)
  const tv = new Array(Math.round(70 / step)).fill(-1);
  const on = (a: number, b: number) => { for (let t = a; t < b - 1e-9; t += step) tv[Math.round(t / step)] = 60; };
  for (const s0 of [10, 20, 30, 40]) { on(s0 - 5, s0 - 2); on(s0 - 0.5, s0 + 3); } // the voice comes in 0.5 s early
  on(47, 49.5); on(50, 53); // here it starts exactly on time
  const tp = [10, 20, 30, 40, 50].map((t) => ({ start: t, end: t + 3, text: "x", vowels: ["a" as const], refrain: false }));
  check(alignOffset(tp, tv, step) === 0, `un decalage qui ferait perdre une phrase chantee est refuse : ${alignOffset(tp, tv, step)}`);
  check(alignQuality(tp, tv, step, -0.5) < alignQuality(tp, tv, step, 0), "cas du test : le decalage -0,5 perd une phrase");

  // quality: share of phrases with the voice present just after their start (calage incertain under 0.5)
  check(alignQuality(sp, voice, step, shift) > 0.95, `bonne qualite une fois cale : ${alignQuality(sp, voice, step, shift)}`);
  check(alignQuality(sp, voice, step, -1) < 0.5, "mauvaise qualite hors calage");
  check(alignQuality(sp, [], step, 0) === 0 && alignQuality([], voice, step, 0) === 0, "qualite nulle sans donnees");

  // per phrase: the start snaps to the real voice attack (0.4 s around), the end to the real end of the singing
  const rv = new Array(Math.round(40 / step)).fill(-1);
  const sing = (a: number, b: number) => { for (let t = a; t < b - 1e-9; t += step) rv[Math.round(t / step)] = 60; };
  sing(10.3, 12.0); sing(12.2, 13.1); // a short breath (0.2 s) inside the phrase is bridged
  sing(20.0, 21.0);
  const raw = [
    { start: 10, end: 12.5, text: "a", vowels: ["a" as const], refrain: false },
    { start: 15, end: 17, text: "b", vowels: ["a" as const], refrain: false }, // no voice near: kept as it was
    { start: 19.5, end: 23, text: "c", vowels: ["a" as const], refrain: false }, // attack 0.5 s later: too far, start kept
  ];
  const rf = refineOnVoice(raw, rv, step, 0);
  check(rf.length === 3 && rf[0].text === "a", "meme nombre de phrases, meme texte");
  check(near(rf[0].start, 10.3, 0.06), `debut sur l'attaque reelle : ${rf[0].start}`);
  check(near(rf[0].end, 13.1, 0.06), `fin sur la fin reelle, souffle court franchi : ${rf[0].end}`);
  check(near(rf[1].start, 15) && near(rf[1].end, 17), "sans voix autour : phrase inchangee");
  check(near(rf[2].start, 19.5), `attaque trop loin : debut garde : ${rf[2].start}`);
  const sh = refineOnVoice(raw, rv, step, 0.2);
  check(near(sh[0].start, 10.1, 0.06), `avec un decalage, la phrase reste dans le temps des paroles : ${sh[0].start}`);
  const capped = refineOnVoice([{ start: 10, end: 11, text: "a", vowels: ["a"], refrain: false }, { start: 12.5, end: 14, text: "b", vowels: ["a"], refrain: false }], rv, step, 0);
  check(capped[0].end <= 12.46, `la fin s'arrete avant la phrase suivante : ${capped[0].end}`);
  check(refineOnVoice(raw, [], step, 0).every((p, i) => p.start === raw[i].start && p.end === raw[i].end), "sans voix : rien ne change");
  return fails;
}
