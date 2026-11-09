export type Vowel = "a" | "e" | "i" | "o" | "u";

export interface LyricLine {
  t: number;
  text: string;
}

export interface Phrase {
  start: number;
  end: number;
  text: string;
  vowels: Vowel[];
  refrain: boolean;
}

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    let rest = raw;
    const times: number[] = [];
    let m: RegExpMatchArray | null;
    while ((m = rest.match(/^\s*\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/))) {
      times.push(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number("0." + m[3]) : 0));
      rest = rest.slice(m[0].length);
    }
    const text = rest.trim();
    for (const t of times) out.push({ t, text });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function cleanTerm(name: string): string {
  let cleaned = name.replace(/\.(mp3|wav|flac|m4a|webm|ogg|aiff?|opus)$/i, '');
  cleaned = cleaned.replace(/[\(\[].*?(official|officiel|video|clip|audio|lyrics|lyric|paroles|hd|4k|visualizer|remaster|remastered).*?[\)\]]/gi, '');
  cleaned = cleaned.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned;
}

export function vowelsOf(text: string): Vowel[] {
  const s = text.toLowerCase().replace(/[éèêë]/g, "ai").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = s.split(/[^a-z]+/).filter(word => word.length > 0);
  const vowels: Vowel[] = [];
  for (const word of words) {
    const groups = word.match(/[aeiouy]+/g) ?? [];
    if (groups.length >= 2 && groups[groups.length - 1] === "e" && /e$|es$/.test(word)) {
      groups.pop();
    }
    for (const g of groups) {
      let v: Vowel;
      if (/^ou|^oo/.test(g)) v = "u";
      else if (/^eau|^au/.test(g)) v = "o";
      else if (/^ai|^ei|^ay|^ey/.test(g)) v = "e";
      else if (/^oi|^oy/.test(g)) v = "a";
      else if (/^ee|^ea|^ie/.test(g)) v = "i";
      else v = g[0].replace("y", "i") as Vowel;
      vowels.push(v);
    }
  }
  if (vowels.length === 0) vowels.push("a");
  return vowels.slice(0, 24);
}

export function buildPhrases(lines: LyricLine[], maxLen = 8): Phrase[] {
  const phrases: Phrase[] = [];
  const CREDIT = /^(written|composed|lyrics|music|produced|arranged|mixed|mastered)( and [a-z]+)? by\b/i;
  const textCounts: Record<string, number> = {};
  for (const line of lines) {
    if (line.text && !CREDIT.test(line.text) && !(/[　-鿿]/.test(line.text) && /[:：]/.test(line.text))) {
      const key = line.text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      textCounts[key] = (textCounts[key] || 0) + 1;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.text && !CREDIT.test(line.text) && !(/[　-鿿]/.test(line.text) && /[:：]/.test(line.text))) {
      const start = line.t;
      const next = lines[i + 1];
      const sung = 0.5 + 0.28 * vowelsOf(line.text).length;
      let end = next ? Math.min(next.t - 0.1, start + maxLen, start + sung) : Math.min(start + maxLen, start + sung, start + 4);
      end = Math.max(end, start + 0.3);
      const key = line.text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const refrain = textCounts[key] >= 2;
      phrases.push({ start, end, text: line.text, vowels: vowelsOf(line.text), refrain });
    }
  }
  return phrases;
}

export function phraseAt(phrases: Phrase[], t: number): number {
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    if (p.start <= t && t < p.end) return i;
  }
  return -1;
}

export function nextPhrase(phrases: Phrase[], t: number): number {
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    if (p.start > t) return i;
  }
  return -1;
}

export function vowelTimes(p: Phrase): { at: number; v: Vowel }[] {
  const n = p.vowels.length;
  const times: { at: number; v: Vowel }[] = [];
  for (let i = 0; i < n; i++) {
    const at = p.start + i * (p.end - p.start) / n;
    times.push({ at, v: p.vowels[i] });
  }
  return times;
}

function frac(voice: number[], step: number, a: number, b: number): number {
  if (step <= 0 || voice.length === 0) return 0;
  const start = Math.floor(a / step);
  const end = Math.floor(b / step) - 1;
  if (start >= end) return 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    if (voice[i] >= 0) count++;
  }
  return count / (end - start + 1);
}

export function alignOffset(phrases: Phrase[], voice: number[], step: number, range = 6): number {
  if (phrases.length === 0 || voice.length === 0 || step <= 0) return 0;
  let bestO = 0;
  let bestScore = -Infinity;
  const q = (x: number): number => {
    let count = 0;
    for (const p of phrases) {
      if (frac(voice, step, p.start + x, p.start + x + 0.5) > 0.3) count++;
    }
    return count / phrases.length;
  };
  for (let k = -Math.round(range * 10); k <= Math.round(range * 10); k++) {
    const o = k / 10;
    let score = 0;
    for (const p of phrases) {
      score += 2 * frac(voice, step, p.start + o, p.start + o + 0.5) - frac(voice, step, p.start + o - 0.5, p.start + o);
    }
    if (score > bestScore || (Math.abs(score - bestScore) < 1e-9 && Math.abs(o) < Math.abs(bestO))) {
      bestScore = score;
      bestO = o;
    }
  }
  if (q(bestO) < q(0)) return 0;
  return Math.round(bestO * 10) / 10;
}

export function alignQuality(phrases: Phrase[], voice: number[], step: number, off: number): number {
  if (phrases.length === 0 || voice.length === 0 || step <= 0) return 0;
  let count = 0;
  for (const p of phrases) {
    if (frac(voice, step, p.start + off, p.start + off + 0.5) > 0.3) count++;
  }
  return count / phrases.length;
}

export function refineOnVoice(phrases: Phrase[], voice: number[], step: number, off: number): Phrase[] {
  if (voice.length === 0 || step <= 0) return phrases.map((p) => ({ ...p }));
  const voiced = (t: number): boolean => (voice[Math.floor(t / step)] ?? -1) >= 0;
  const refined: Phrase[] = [];
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    const s = p.start + off;
    let s2 = s;
    let minDist = Infinity;
    for (let t = s - 0.4; t <= s + 0.4; t += step) {
      if (voiced(t) && !voiced(t - step)) {
        const dist = Math.abs(t - s);
        if (dist < minDist) {
          minDist = dist;
          s2 = t;
        }
      }
    }
    const lim = phrases[i + 1] ? phrases[i + 1].start + off - 0.05 : s2 + 8;
    let last = -1;
    let gap = 0;
    let e2 = p.end + off;
    for (let t = s2; t < lim; t += step) {
      if (voiced(t)) {
        last = t;
        gap = 0;
      } else if (last >= 0) {
        gap += step;
        if (gap > 0.3) break;
      }
    }
    if (last >= 0 && last + step > s2 + 0.3) {
      e2 = Math.min(lim, last + step);
    }
    refined.push({ ...p, start: s2 - off, end: Math.max(e2, s2 + 0.3) - off });
  }
  return refined;
}
