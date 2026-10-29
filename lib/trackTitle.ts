/**
 * Splits a raw track name (MaRuche/Falken, two rounds; case and featuring fixed by hand) into clean title, artist, and optional extra (featuring/from).
 * Rules applied in order; no dependencies, strict TypeScript.
 */
export function splitTitle(name: string): { title: string; artist: string; extra: string } {
  // Rule 1: Normalise spaces and quotes
  let cleaned = name
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // curly quotes to straight
    .replace(/[\u2013\u2014]/g, '-') // en dash/em dash to hyphen
    .replace(/\s+/g, ' ') // collapse spaces
    .trim();

  // Rule 1: Remove lone "†" and surrounding " - "
  cleaned = cleaned.replace(/ - † - /i, ' ').replace(/†/g, '').trim();

  // "(from X - Official Audio)" keeps its context, "(feat. X)" its guests: both survive the noise pass below
  cleaned = cleaned.replace(/\(from\s+([^)]*?)\s*-\s*official[^)]*\)/i, '(from $1)');
  let extra = '';
  const featInBrackets = cleaned.match(/\s*[([](?:feat\.|ft\.|featuring)\s+([^)\]]+)[)\]]/i);
  if (featInBrackets) {
    extra = `feat. ${featInBrackets[1].trim()}`;
    cleaned = cleaned.replace(featInBrackets[0], '').trim();
  }

  // Rule 2: Remove noise in brackets (both () and [])
  const noiseWords = ['official', 'audio', 'video', 'lyric', 'lyrics', 'clip', 'visualizer', 'visualiser',
    'hd', 'hq', '4k', 'uhd', '1080p', 'remaster', 'remastered', 'rm', 'full hd', 'music video', 'high-quality'];
  const noiseRegex = new RegExp(`\\s*[([](?!from\\s)[^)\\]]*\\b(${noiseWords.join('|')})\\b[^)\\]]*[)\\]]`, 'gi');
  cleaned = cleaned.replace(noiseRegex, '').trim();

  // Rule 5: Remove trailing noise outside brackets and anything after " | " or " // "
  const pipes = cleaned.split(/\s+\|\s+/);
  cleaned = pipes.length > 1 && !/ [-–—~•] /.test(pipes[0]) && pipes[0].split(/\s+/).length <= 3 ? `${pipes[0]} - ${pipes[1]}` : pipes[0];
  cleaned = cleaned.replace(/\s*\/\/\s*.*$/i, '').trim();
  cleaned = cleaned.replace(/\s*[([][^)\]]*$/, '').trim(); // a bracket cut off by the source ("[extra...")
  cleaned = cleaned.replace(/\s*\b(?:1080p|4k uhd)\b.*$/i, '').trim(); // "1080p Digitally Remastered & Restored"
  const trailingNoise = /\s*\b(?:HD and HQ|FULL HD|AUDIO HQ|HD|HQ|4K UHD video|Official Audio|High-Quality Audio)$/i;
  for (let prev = ''; prev !== cleaned; ) {
    prev = cleaned;
    cleaned = cleaned.replace(trailingNoise, '').replace(/\s*[-–—~•]\s*$/, '').trim();
  }

  // Rule 3: Extract featuring at the end
  const featMatch = cleaned.match(/(?:^|\s)(?:feat\.|ft\.)\s+([^)]+)(?:\)?\s*)?$/i);
  if (featMatch && !extra) {
    extra = `feat. ${featMatch[1].trim()}`;
    cleaned = cleaned.replace(/(?:feat\.|ft\.)\s+[^)]+(?:\)?\s*)?$/i, '').trim();
  }

  // Rule 4: "(from X)" leaves the title; it becomes the extra unless guests already took it
  const fromMatch = cleaned.match(/\(from\s+([^)]+)\)/i);
  if (fromMatch) {
    if (!extra) extra = `from ${fromMatch[1].trim()}`;
    cleaned = cleaned.replace(fromMatch[0], '').replace(/\s+/g, ' ').trim();
  }

  // Rule 6: Split artist/title
  let artist = '';
  let title = cleaned;

  // First try splitting on separators (only first occurrence)
  const splitRegex = /( - | – | — | ~ | • )/;
  const splitMatch = cleaned.match(splitRegex);
  if (splitMatch) {
    const index = splitMatch.index!;
    const left = cleaned.substring(0, index).trim();
    const right = cleaned.substring(index + splitMatch[0].length).trim();

    // Check for year or composer format
    if (!/^\d{4}$/.test(left) && !/^\d{4}$/.test(right)) {
      if (left.split(/\s+/).length <= 3 && !left.includes(':')) {
        // Composer format: left is artist, right is title
        artist = left;
        title = right;
      } else {
        // Standard format: left is artist, right is title
        artist = left;
        title = right;
      }
    }
  } else if (cleaned.toLowerCase().includes(' by ')) {
    // Rule 6: "by" separator
    const byParts = cleaned.split(/ by /i, 2);
    artist = byParts[1].trim();
    title = byParts[0].trim();
  } else if (cleaned.includes(':')) {
    // Composer format with colon
    const at = cleaned.indexOf(':');
    const left = cleaned.slice(0, at).trim();
    if (left && left.split(/\s+/).length <= 3) {
      artist = left;
      title = cleaned.slice(at + 1).trim();
    }
  }

  // Rule 7: Title case for ALL CAPS
  const SMALL = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'for', 'de', 'la', 'le', 'les', 'du', 'des', 'et']);
  const capWord = (w: string, first: boolean): string => {
    if (/^([A-Z]\.)+$/.test(w)) return w; // D.A.N.C.E., Y.M.C.A.
    const low = w.toLowerCase();
    if (!first && SMALL.has(low)) return low;
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  const toTitleCase = (str: string): string => {
    const letters = str.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 4 && !/[a-z]/.test(str)) return str.split(/\s+/).map((w, i) => capWord(w, i === 0)).join(' ');
    // mixed case: only shouting words of 4+ letters calm down (DONNA SUMMER I feel love)
    return str.split(/\s+/).map((w, i) => (w.length >= 4 && /^[A-Z]+$/.test(w) ? capWord(w, i === 0) : w)).join(' ');
  };

  const strip = (x: string) => {
    const t = x.replace(/^[-\s~•|*]+|[-\s~•|*]+$/g, '').trim();
    return /^['"«].*['"»]$/.test(t) ? t.slice(1, -1).trim() : t; // quotes only when they wrap the whole field
  };
  title = toTitleCase(strip(title));
  artist = toTitleCase(strip(artist));

  // Rule 8: Trim stray punctuation
  title = title.replace(/^[-\s~•|*]+|[-\s~•|*]+$/g, '').trim();
  artist = artist.replace(/^[-\s~•|*]+|[-\s~•|*]+$/g, '').trim();

  // Fallback to original if title is empty
  if (!title) {
    title = cleaned;
    artist = '';
  }

  return { title, artist, extra };
}

/**
 * Self-test with assert(cond, msg) throwing Error.
 */
export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

  // Test cases
  assert(JSON.stringify(splitTitle("Daft Punk - Harder, Better, Faster, Stronger (Official Audio)")) ===
    '{"title":"Harder, Better, Faster, Stronger","artist":"Daft Punk","extra":""}', "Case 1 failed");

  assert(JSON.stringify(splitTitle("Justice - D.A.N.C.E. - † (Official Audio)")) ===
    '{"title":"D.A.N.C.E.","artist":"Justice","extra":""}', "Case 2 failed");

  assert(JSON.stringify(splitTitle("AIR - All I Need (feat. Beth Hirsch) (from Moon Safari - Official Audio)")) ===
    '{"title":"All I Need","artist":"AIR","extra":"feat. Beth Hirsch"}', "Case 3 failed");

  assert(JSON.stringify(splitTitle("AIR - Sexy Boy (from Moon Safari - Official Audio)")) ===
    '{"title":"Sexy Boy","artist":"AIR","extra":"from Moon Safari"}', "Case 4 failed");

  assert(JSON.stringify(splitTitle("Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers")) ===
    '{"title":"Get Lucky","artist":"Daft Punk","extra":"feat. Pharrell Williams, Nile Rodgers"}', "Case 5 failed");

  assert(JSON.stringify(splitTitle("WE ARE FAMILY by Sister Sledge (With Lyrics)")) ===
    '{"title":"We Are Family","artist":"Sister Sledge","extra":""}', "Case 6 failed");

  assert(JSON.stringify(splitTitle("Bach - Air from Orchestral Suite no. 3 in D major BWV 1068 | Netherlands Bach Society")) ===
    '{"title":"Air from Orchestral Suite no. 3 in D major BWV 1068","artist":"Bach","extra":""}', "Case 7 failed");

  assert(JSON.stringify(splitTitle("Bach: Air on the G String (Orchestral Suite No. 3)")) ===
    '{"title":"Air on the G String (Orchestral Suite No. 3)","artist":"Bach","extra":""}', "Case 8 failed");

  assert(JSON.stringify(splitTitle("DONNA SUMMER   I feel love 1977 HD and HQ")) ===
    '{"title":"Donna Summer I feel love 1977","artist":"","extra":""}', "Case 9 failed");

  assert(JSON.stringify(splitTitle("Earth, Wind & Fire ~ September 1978 Disco Purrfection Version")) ===
    '{"title":"September 1978 Disco Purrfection Version","artist":"Earth, Wind & Fire","extra":""}', "Case 10 failed");

  assert(JSON.stringify(splitTitle("Air • Alone In Kyoto • Lost in Translation")) ===
    '{"title":"Alone In Kyoto • Lost in Translation","artist":"Air","extra":""}', "Case 11 failed");

  assert(JSON.stringify(splitTitle("Stars Of The Lid - Requiem For Dying Mothers (Pt. 2)")) ===
    '{"title":"Requiem For Dying Mothers (Pt. 2)","artist":"Stars Of The Lid","extra":""}', "Case 12 failed");

  assert(JSON.stringify(splitTitle("hania rani - esja")) ===
    '{"title":"esja","artist":"hania rani","extra":""}', "Case 13 failed");

  assert(JSON.stringify(splitTitle("One More Time")) ===
    '{"title":"One More Time","artist":"","extra":""}', "Case 14 failed");

  assert(JSON.stringify(splitTitle("Boney M. - Daddy Cool (Remastered) [Audio HQ]")) ===
    '{"title":"Daddy Cool","artist":"Boney M.","extra":""}', "Case 15 failed");
}
