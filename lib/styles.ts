// Radio by style (artists typical of a genre) and by collection (named lists of songs): the radio fills its list from
// these, the same way it does from composers (lib/classical.ts).

export interface Style {
  key: string;
  label: string;
  artists: string[];
}
export interface Collection {
  key: string;
  label: string;
  songs: { artist: string; title: string }[];
}

const s = (artist: string, title: string) => ({ artist, title });

export const STYLES: Style[] = [
  { key: "house", label: "House", artists: ["Daft Punk", "Calvin Harris", "David Guetta", "Fisher", "Disclosure", "Swedish House Mafia"] },
  { key: "techno", label: "Techno", artists: ["Charlotte de Witte", "Amelie Lens", "Adam Beyer", "Nina Kraviz", "Boris Brejcha", "Carl Cox"] },
  { key: "deep", label: "Deep / chill", artists: ["Kygo", "Lane 8", "Bonobo", "Jax Jones", "Petit Biscuit", "Odesza"] },
  { key: "pop-fr", label: "Pop française", artists: ["Stromae", "Indochine", "Angèle", "Christine and the Queens", "Louane", "Vianney"] },
  { key: "rap-fr", label: "Rap français", artists: ["Orelsan", "Nekfeu", "PNL", "Booba", "Jul", "Damso"] },
  { key: "hiphop", label: "Hip-hop", artists: ["Kendrick Lamar", "Drake", "Eminem", "Travis Scott", "J. Cole", "Jay-Z"] },
  { key: "rock", label: "Rock", artists: ["Queen", "AC/DC", "Led Zeppelin", "Foo Fighters", "Muse", "Red Hot Chili Peppers"] },
  { key: "disco-funk", label: "Disco / funk", artists: ["Chic", "Earth, Wind & Fire", "Donna Summer", "Kool & The Gang", "Bee Gees", "Daft Punk"] },
  { key: "pop", label: "Pop", artists: ["Dua Lipa", "The Weeknd", "Ed Sheeran", "Ariana Grande", "Harry Styles", "Bruno Mars"] },
  { key: "reggae", label: "Reggae", artists: ["Bob Marley", "Peter Tosh", "Damian Marley", "Chronixx", "Sean Paul", "Toots and the Maytals"] },
  { key: "latino", label: "Latino", artists: ["Bad Bunny", "Shakira", "J Balvin", "Luis Fonsi", "Rosalía", "Daddy Yankee"] },
  { key: "jazz", label: "Jazz", artists: ["Miles Davis", "John Coltrane", "Nina Simone", "Ella Fitzgerald", "Herbie Hancock", "Norah Jones"] },
  { key: "80s", label: "Années 80", artists: ["Depeche Mode", "A-ha", "Duran Duran", "Michael Jackson", "Madonna", "Cyndi Lauper"] },
  { key: "afro", label: "Afrobeats", artists: ["Burna Boy", "Wizkid", "Tems", "Rema", "Davido", "Aya Nakamura"] },
];

export const COLLECTIONS: Collection[] = [
  {
    key: "dancefloor",
    label: "Dancefloor classics",
    songs: [s("Daft Punk", "One More Time"), s("Calvin Harris", "Summer"), s("Avicii", "Levels"), s("David Guetta", "Titanium"), s("Swedish House Mafia", "Don't You Worry Child"), s("Robin S", "Show Me Love"), s("Eric Prydz", "Pjanoo"), s("Faithless", "Insomnia"), s("Calvin Harris", "Feel So Close"), s("Martin Solveig", "Hello")],
  },
  {
    key: "80s",
    label: "Hits des années 80",
    songs: [s("Michael Jackson", "Billie Jean"), s("a-ha", "Take On Me"), s("Madonna", "Like a Prayer"), s("Depeche Mode", "Enjoy the Silence"), s("Prince", "Kiss"), s("Cyndi Lauper", "Girls Just Want to Have Fun"), s("Duran Duran", "Rio"), s("Eurythmics", "Sweet Dreams"), s("Whitney Houston", "I Wanna Dance with Somebody"), s("Kool & The Gang", "Celebration")],
  },
  {
    key: "90s",
    label: "Hits des années 90",
    songs: [s("Haddaway", "What Is Love"), s("Snap", "Rhythm Is a Dancer"), s("Backstreet Boys", "I Want It That Way"), s("Spice Girls", "Wannabe"), s("Aqua", "Barbie Girl"), s("Eiffel 65", "Blue"), s("The Prodigy", "Firestarter"), s("Cher", "Believe"), s("Ace of Base", "The Sign"), s("Dr. Alban", "It's My Life")],
  },
  {
    key: "2000s",
    label: "Hits des années 2000",
    songs: [s("Outkast", "Hey Ya"), s("Beyoncé", "Crazy in Love"), s("Justin Timberlake", "SexyBack"), s("Rihanna", "Umbrella"), s("Black Eyed Peas", "I Gotta Feeling"), s("Usher", "Yeah"), s("Kylie Minogue", "Can't Get You Out of My Head"), s("The Killers", "Mr. Brightside"), s("Shakira", "Hips Don't Lie"), s("Mika", "Grace Kelly")],
  },
  {
    key: "disco",
    label: "Soirée disco",
    songs: [s("Chic", "Le Freak"), s("Bee Gees", "Stayin' Alive"), s("Donna Summer", "I Feel Love"), s("Earth, Wind & Fire", "September"), s("Gloria Gaynor", "I Will Survive"), s("ABBA", "Dancing Queen"), s("Sister Sledge", "We Are Family"), s("Boney M.", "Daddy Cool"), s("Village People", "Y.M.C.A."), s("Kool & The Gang", "Get Down on It")],
  },
  {
    key: "fr",
    label: "Tubes français",
    songs: [s("Stromae", "Papaoutai"), s("Indochine", "J'ai demandé à la lune"), s("Daft Punk", "Around the World"), s("Christine and the Queens", "Tilted"), s("Gims", "Bella"), s("Phoenix", "1901"), s("Air", "Sexy Boy"), s("Justice", "D.A.N.C.E."), s("Aya Nakamura", "Djadja"), s("Angèle", "Balance ton quoi")],
  },
  {
    key: "chill",
    label: "Chill-out",
    songs: [s("Kygo", "Firestone"), s("Petit Biscuit", "Sunset Lover"), s("Bonobo", "Kerala"), s("Odesza", "Say My Name"), s("Lane 8", "Road"), s("Jungle", "Busy Earnin'"), s("Tycho", "A Walk"), s("Rüfüs Du Sol", "Innerbloom"), s("Fleetwood Mac", "Dreams"), s("Röyksopp", "Eple")],
  },
  {
    key: "rock",
    label: "Classiques rock",
    songs: [s("Queen", "Don't Stop Me Now"), s("AC/DC", "Back in Black"), s("Led Zeppelin", "Whole Lotta Love"), s("Deep Purple", "Smoke on the Water"), s("Nirvana", "Smells Like Teen Spirit"), s("Foo Fighters", "Everlong"), s("Muse", "Uprising"), s("The White Stripes", "Seven Nation Army"), s("Red Hot Chili Peppers", "Can't Stop"), s("Guns N' Roses", "Sweet Child o' Mine")],
  },
  {
    key: "latino",
    label: "Latino party",
    songs: [s("Luis Fonsi", "Despacito"), s("Daddy Yankee", "Gasolina"), s("Shakira", "Waka Waka"), s("Bad Bunny", "Tití Me Preguntó"), s("J Balvin", "Mi Gente"), s("Ricky Martin", "Livin' la Vida Loca"), s("Enrique Iglesias", "Bailando"), s("Pitbull", "Give Me Everything"), s("Maluma", "Felices los 4"), s("Karol G", "Tusa")],
  },
];

export const findStyle = (key: string): Style | undefined => STYLES.find((x) => x.key === key);
export const findCollection = (name: string): Collection | undefined => COLLECTIONS.find((c) => c.label.toLowerCase() === name.trim().toLowerCase());

// `count` songs of the collection, moving along the list on every call (`offset`): "Autre" and "Régénérer" get other songs
export function pickSongs(c: Collection, count: number, offset = 0): { artist: string; title: string }[] {
  if (c.songs.length === 0) return [];
  const start = (offset * count) % c.songs.length;
  return Array.from({ length: Math.min(count, c.songs.length) }, (_, k) => c.songs[(start + k) % c.songs.length]);
}
