import type { Genre } from "@/lib/djForce";

// Radio by style (artists typical of a genre) and by collection (named lists of songs): the radio fills its list from
// these, the same way it does from composers (lib/classical.ts).

export interface Style {
  key: string;
  genre: Genre; // the effects the DJ uses for it
  label: string;
  artists: string[];
}
export interface Collection {
  key: string;
  genre: Genre;
  label: string;
  songs: { artist: string; title: string }[];
}

const s = (artist: string, title: string) => ({ artist, title });

export const STYLES: Style[] = [
  { key: "house", genre: "club", label: "House", artists: ["Daft Punk", "Calvin Harris", "David Guetta", "Fisher", "Disclosure", "Swedish House Mafia"] },
  { key: "techno", genre: "club", label: "Techno", artists: ["Charlotte de Witte", "Amelie Lens", "Adam Beyer", "Nina Kraviz", "Boris Brejcha", "Carl Cox"] },
  { key: "deep", genre: "chill", label: "Deep / chill", artists: ["Kygo", "Lane 8", "Bonobo", "Jax Jones", "Petit Biscuit", "Odesza"] },
  { key: "pop-fr", genre: "pop", label: "Pop française", artists: ["Stromae", "Indochine", "Angèle", "Christine and the Queens", "Louane", "Vianney"] },
  { key: "rap-fr", genre: "hiphop", label: "Rap français", artists: ["Orelsan", "Nekfeu", "PNL", "Booba", "Jul", "Damso"] },
  { key: "hiphop", genre: "hiphop", label: "Hip-hop", artists: ["Kendrick Lamar", "Drake", "Eminem", "Travis Scott", "J. Cole", "Jay-Z"] },
  { key: "rock", genre: "pop", label: "Rock", artists: ["Queen", "AC/DC", "Led Zeppelin", "Foo Fighters", "Muse", "Red Hot Chili Peppers"] },
  { key: "disco-funk", genre: "disco", label: "Disco / funk", artists: ["Chic", "Earth, Wind & Fire", "Donna Summer", "Kool & The Gang", "Bee Gees", "Daft Punk"] },
  { key: "pop", genre: "pop", label: "Pop", artists: ["Dua Lipa", "The Weeknd", "Ed Sheeran", "Ariana Grande", "Harry Styles", "Bruno Mars"] },
  { key: "reggae", genre: "dub", label: "Reggae", artists: ["Bob Marley", "Peter Tosh", "Damian Marley", "Chronixx", "Sean Paul", "Toots and the Maytals"] },
  { key: "latino", genre: "latino", label: "Latino", artists: ["Bad Bunny", "Shakira", "J Balvin", "Luis Fonsi", "Rosalía", "Daddy Yankee"] },
  { key: "jazz", genre: "chill", label: "Jazz", artists: ["Miles Davis", "John Coltrane", "Nina Simone", "Ella Fitzgerald", "Herbie Hancock", "Norah Jones"] },
  { key: "80s", genre: "pop", label: "Années 80", artists: ["Depeche Mode", "A-ha", "Duran Duran", "Michael Jackson", "Madonna", "Cyndi Lauper"] },
  { key: "afro", genre: "latino", label: "Afrobeats", artists: ["Burna Boy", "Wizkid", "Tems", "Rema", "Davido", "Aya Nakamura"] },
];

export const COLLECTIONS: Collection[] = [
  {
    key: "dancefloor", genre: "club",
    label: "Dancefloor classics",
    songs: [s("Daft Punk", "One More Time"), s("Calvin Harris", "Summer"), s("Avicii", "Levels"), s("David Guetta", "Titanium"), s("Swedish House Mafia", "Don't You Worry Child"), s("Robin S", "Show Me Love"), s("Eric Prydz", "Pjanoo"), s("Faithless", "Insomnia"), s("Calvin Harris", "Feel So Close"), s("Martin Solveig", "Hello")],
  },
  {
    key: "80s", genre: "pop",
    label: "Hits des années 80",
    songs: [s("Michael Jackson", "Billie Jean"), s("a-ha", "Take On Me"), s("Madonna", "Like a Prayer"), s("Depeche Mode", "Enjoy the Silence"), s("Prince", "Kiss"), s("Cyndi Lauper", "Girls Just Want to Have Fun"), s("Duran Duran", "Rio"), s("Eurythmics", "Sweet Dreams"), s("Whitney Houston", "I Wanna Dance with Somebody"), s("Kool & The Gang", "Celebration")],
  },
  {
    key: "90s", genre: "pop",
    label: "Hits des années 90",
    songs: [s("Haddaway", "What Is Love"), s("Snap", "Rhythm Is a Dancer"), s("Backstreet Boys", "I Want It That Way"), s("Spice Girls", "Wannabe"), s("Aqua", "Barbie Girl"), s("Eiffel 65", "Blue"), s("The Prodigy", "Firestarter"), s("Cher", "Believe"), s("Ace of Base", "The Sign"), s("Dr. Alban", "It's My Life")],
  },
  {
    key: "2000s", genre: "pop",
    label: "Hits des années 2000",
    songs: [s("Outkast", "Hey Ya"), s("Beyoncé", "Crazy in Love"), s("Justin Timberlake", "SexyBack"), s("Rihanna", "Umbrella"), s("Black Eyed Peas", "I Gotta Feeling"), s("Usher", "Yeah"), s("Kylie Minogue", "Can't Get You Out of My Head"), s("The Killers", "Mr. Brightside"), s("Shakira", "Hips Don't Lie"), s("Mika", "Grace Kelly")],
  },
  {
    key: "disco", genre: "disco",
    label: "Soirée disco",
    songs: [s("Chic", "Le Freak"), s("Bee Gees", "Stayin' Alive"), s("Donna Summer", "I Feel Love"), s("Earth, Wind & Fire", "September"), s("Gloria Gaynor", "I Will Survive"), s("ABBA", "Dancing Queen"), s("Sister Sledge", "We Are Family"), s("Boney M.", "Daddy Cool"), s("Village People", "Y.M.C.A."), s("Kool & The Gang", "Get Down on It")],
  },
  {
    key: "fr", genre: "pop",
    label: "Tubes français",
    songs: [s("Stromae", "Papaoutai"), s("Indochine", "J'ai demandé à la lune"), s("Daft Punk", "Around the World"), s("Christine and the Queens", "Tilted"), s("Gims", "Bella"), s("Phoenix", "1901"), s("Air", "Sexy Boy"), s("Justice", "D.A.N.C.E."), s("Aya Nakamura", "Djadja"), s("Angèle", "Balance ton quoi")],
  },
  {
    key: "chill", genre: "chill",
    label: "Chill-out",
    songs: [s("Kygo", "Firestone"), s("Petit Biscuit", "Sunset Lover"), s("Bonobo", "Kerala"), s("Odesza", "Say My Name"), s("Lane 8", "Road"), s("Jungle", "Busy Earnin'"), s("Tycho", "A Walk"), s("Rüfüs Du Sol", "Innerbloom"), s("Fleetwood Mac", "Dreams"), s("Röyksopp", "Eple")],
  },
  {
    key: "rock", genre: "pop",
    label: "Classiques rock",
    songs: [s("Queen", "Don't Stop Me Now"), s("AC/DC", "Back in Black"), s("Led Zeppelin", "Whole Lotta Love"), s("Deep Purple", "Smoke on the Water"), s("Nirvana", "Smells Like Teen Spirit"), s("Foo Fighters", "Everlong"), s("Muse", "Uprising"), s("The White Stripes", "Seven Nation Army"), s("Red Hot Chili Peppers", "Can't Stop"), s("Guns N' Roses", "Sweet Child o' Mine")],
  },
  {
    key: "latino", genre: "latino",
    label: "Latino party",
    songs: [s("Luis Fonsi", "Despacito"), s("Daddy Yankee", "Gasolina"), s("Shakira", "Waka Waka"), s("Bad Bunny", "Tití Me Preguntó"), s("J Balvin", "Mi Gente"), s("Ricky Martin", "Livin' la Vida Loca"), s("Enrique Iglesias", "Bailando"), s("Pitbull", "Give Me Everything"), s("Maluma", "Felices los 4"), s("Karol G", "Tusa")],
  },
];

// Zen: ambient and meditation, slow and without a beat. Calm: quiet piano. Both are played with soft blends and almost no DJ effect.
export const ZEN_COLLECTIONS: Collection[] = [
  {
    key: "zen-ambient",
    genre: "zen",
    label: "Ambient et méditation",
    songs: [s("Brian Eno", "An Ending (Ascent)"), s("Marconi Union", "Weightless"), s("Brian Eno", "Music for Airports 1/1"), s("Stars of the Lid", "Down 3"), s("Max Richter", "Sleep Dream 3"), s("Jon Hopkins", "Abandon Window"), s("Nils Frahm", "Says"), s("Hammock", "Breathturn"), s("Steve Roach", "Structures from Silence"), s("Ólafur Arnalds", "Near Light")],
  },
  {
    key: "zen-electro",
    genre: "zen",
    label: "Électronique planante",
    songs: [s("Jean-Michel Jarre", "Oxygène Part 4"), s("Vangelis", "Rachel's Song"), s("Tangerine Dream", "Love on a Real Train"), s("Moby", "God Moving Over the Face of the Waters"), s("Boards of Canada", "Roygbiv"), s("Air", "Alone in Kyoto"), s("Bonobo", "Kerala"), s("Tycho", "A Walk"), s("Brian Eno", "Thursday Afternoon"), s("Aphex Twin", "Rhubarb")],
  },
  {
    key: "zen-orient",
    genre: "zen",
    label: "Voix et horizons",
    songs: [s("Enya", "Only Time"), s("Enya", "Orinoco Flow"), s("Enya", "May It Be"), s("Kitaro", "Silk Road"), s("Deva Premal", "Gayatri Mantra"), s("Yanni", "Nightingale"), s("Lisa Gerrard", "Now We Are Free"), s("Sigur Rós", "Svefn-g-englar"), s("Loreena McKennitt", "The Mummers' Dance"), s("Dead Can Dance", "Rakim")],
  },
  {
    key: "zen-sleep",
    genre: "zen",
    label: "Sommeil profond",
    songs: [s("Max Richter", "On the Nature of Daylight"), s("Brian Eno", "An Ending (Ascent)"), s("Stars of the Lid", "Requiem for Dying Mothers"), s("Max Richter", "Sleep Dream 3"), s("Marconi Union", "Weightless"), s("Ólafur Arnalds", "Saman"), s("Hammock", "Tape Recorder"), s("Johann Johannsson", "Flight from the City"), s("Nils Frahm", "Ambre"), s("Hania Rani", "Esja")],
  },
];
export const CALM_COLLECTIONS: Collection[] = [
  {
    key: "calm-piano",
    genre: "calm",
    label: "Piano calme",
    songs: [s("Ludovico Einaudi", "Nuvole Bianche"), s("Ludovico Einaudi", "Una Mattina"), s("Yiruma", "River Flows in You"), s("Yiruma", "Kiss the Rain"), s("Ludovico Einaudi", "Experience"), s("Ludovico Einaudi", "Primavera"), s("Joep Beving", "Sleeping Lotus"), s("Dustin O'Halloran", "Opus 23"), s("Erik Satie", "Gymnopédie No. 1"), s("Claude Debussy", "Clair de lune")],
  },
  {
    key: "calm-cinema",
    genre: "calm",
    label: "Piano de cinéma",
    songs: [s("Yann Tiersen", "Comptine d'un autre été"), s("Yann Tiersen", "La Valse d'Amélie"), s("Joe Hisaishi", "One Summer's Day"), s("Joe Hisaishi", "Merry-Go-Round of Life"), s("Ryuichi Sakamoto", "Merry Christmas Mr. Lawrence"), s("Ryuichi Sakamoto", "Energy Flow"), s("Hans Zimmer", "Time"), s("Ennio Morricone", "Cinema Paradiso Love Theme"), s("Max Richter", "On the Nature of Daylight"), s("Ludovico Einaudi", "Fly")],
  },
  {
    key: "calm-jazz",
    genre: "calm",
    label: "Piano jazz doux",
    songs: [s("Bill Evans", "Waltz for Debby"), s("Bill Evans", "Peace Piece"), s("Miles Davis", "Blue in Green"), s("Keith Jarrett", "My Song"), s("Brad Mehldau", "Exit Music"), s("Norah Jones", "Don't Know Why"), s("Bill Evans", "Some Other Time"), s("Herbie Hancock", "Maiden Voyage"), s("Chet Baker", "My Funny Valentine"), s("Thelonious Monk", "Round Midnight")],
  },
  {
    key: "calm-strings",
    genre: "calm",
    label: "Piano et cordes",
    songs: [s("Hania Rani", "Esja"), s("Nils Frahm", "Says"), s("Ólafur Arnalds", "Saman"), s("Poppy Ackroyd", "Sinking"), s("Max Richter", "Vladimir's Blues"), s("Dustin O'Halloran", "Opus 55"), s("Chilly Gonzales", "Gogol"), s("Ludovico Einaudi", "I Giorni"), s("Yiruma", "Maybe"), s("Arvo Pärt", "Spiegel im Spiegel")],
  },
];

export const findStyle = (key: string): Style | undefined => STYLES.find((x) => x.key === key);
export const findCollection = (name: string): Collection | undefined => [...COLLECTIONS, ...ZEN_COLLECTIONS, ...CALM_COLLECTIONS].find((c) => c.label.toLowerCase() === name.trim().toLowerCase());

// `count` songs of the collection, moving along the list on every call (`offset`): "Autre" and "Régénérer" get other songs
export function pickSongs(c: Collection, count: number, offset = 0): { artist: string; title: string }[] {
  if (c.songs.length === 0) return [];
  const start = (offset * count) % c.songs.length;
  return Array.from({ length: Math.min(count, c.songs.length) }, (_, k) => c.songs[(start + k) % c.songs.length]);
}
