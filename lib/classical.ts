// Classical radio: composers and their best-known works, so a search names the work (precise, and different pieces
// on every regeneration) instead of hoping that "Bach" alone returns music and not a compilation.

export type Era = "baroque" | "classique" | "romantique" | "impressionniste" | "moderne";
export type Instrument = "piano" | "orchestre" | "cordes" | "orgue" | "voix" | "guitare";
export type Mood = "calme" | "joyeux" | "dramatique" | "intense";

export const ERA_LABEL: Record<Era, string> = { baroque: "Baroque", classique: "Classique", romantique: "Romantique", impressionniste: "Impressionniste", moderne: "XXe siècle" };
export const INSTRUMENT_LABEL: Record<Instrument, string> = { piano: "Piano", orchestre: "Orchestre", cordes: "Cordes", orgue: "Orgue", voix: "Voix et chœur", guitare: "Guitare" };
export const MOOD_LABEL: Record<Mood, string> = { calme: "Calme", joyeux: "Joyeux", dramatique: "Dramatique", intense: "Intense" };

export interface Work {
  q: string; // what is typed after the composer's name
  i: Instrument;
  m: Mood;
}
export interface Composer {
  name: string;
  era: Era;
  works: Work[];
}

const w = (q: string, i: Instrument, m: Mood): Work => ({ q, i, m });

export const COMPOSERS: Composer[] = [
  { name: "Bach", era: "baroque", works: [w("Prelude in C major BWV 846", "piano", "calme"), w("Air on the G string", "cordes", "calme"), w("Toccata and Fugue in D minor", "orgue", "dramatique"), w("Brandenburg Concerto No. 3", "orchestre", "joyeux"), w("Cello Suite No. 1 Prelude", "cordes", "calme"), w("Goldberg Variations Aria", "piano", "calme"), w("Jesu Joy of Man's Desiring", "orchestre", "calme"), w("Concerto for Two Violins BWV 1043", "cordes", "joyeux"), w("Badinerie", "orchestre", "joyeux")] },
  { name: "Vivaldi", era: "baroque", works: [w("Four Seasons Spring", "cordes", "joyeux"), w("Four Seasons Summer Presto", "cordes", "intense"), w("Four Seasons Winter Allegro", "cordes", "dramatique"), w("Four Seasons Autumn", "cordes", "joyeux"), w("Concerto for Two Violins in A minor", "cordes", "dramatique"), w("Gloria RV 589", "voix", "joyeux")] },
  { name: "Handel", era: "baroque", works: [w("Hallelujah Chorus Messiah", "voix", "joyeux"), w("Water Music Alla Hornpipe", "orchestre", "joyeux"), w("Music for the Royal Fireworks", "orchestre", "joyeux"), w("Sarabande HWV 437", "piano", "dramatique"), w("Lascia ch'io pianga", "voix", "calme"), w("Zadok the Priest", "voix", "intense")] },
  { name: "Pachelbel", era: "baroque", works: [w("Canon in D", "cordes", "calme"), w("Chaconne in F minor", "orgue", "calme")] },
  { name: "Albinoni", era: "baroque", works: [w("Adagio in G minor", "cordes", "dramatique"), w("Oboe Concerto in D minor", "orchestre", "calme")] },
  { name: "Mozart", era: "classique", works: [w("Eine kleine Nachtmusik", "orchestre", "joyeux"), w("Piano Sonata No. 11 Rondo alla Turca", "piano", "joyeux"), w("Requiem Lacrimosa", "voix", "dramatique"), w("Symphony No. 40 first movement", "orchestre", "dramatique"), w("Clarinet Concerto Adagio", "orchestre", "calme"), w("Piano Concerto No. 21 Andante", "orchestre", "calme"), w("Piano Sonata No. 16 K 545", "piano", "joyeux"), w("Queen of the Night aria Magic Flute", "voix", "intense"), w("Symphony No. 41 Jupiter finale", "orchestre", "intense")] },
  { name: "Beethoven", era: "classique", works: [w("Symphony No. 5 first movement", "orchestre", "intense"), w("Moonlight Sonata first movement", "piano", "calme"), w("Für Elise", "piano", "calme"), w("Symphony No. 9 Ode to Joy", "voix", "joyeux"), w("Pathétique Sonata second movement", "piano", "calme"), w("Piano Concerto No. 5 Emperor Adagio", "orchestre", "calme"), w("Symphony No. 7 Allegretto", "orchestre", "dramatique"), w("Appassionata first movement", "piano", "intense"), w("Egmont Overture", "orchestre", "intense")] },
  { name: "Schubert", era: "romantique", works: [w("Ave Maria", "voix", "calme"), w("Serenade Ständchen", "voix", "calme"), w("Impromptu Op. 90 No. 3", "piano", "calme"), w("Symphony No. 8 Unfinished first movement", "orchestre", "dramatique"), w("Death and the Maiden second movement", "cordes", "dramatique"), w("Trout Quintet fourth movement", "cordes", "joyeux"), w("Moment Musical No. 3", "piano", "joyeux")] },
  { name: "Chopin", era: "romantique", works: [w("Nocturne Op. 9 No. 2", "piano", "calme"), w("Nocturne in C sharp minor Lento con gran espressione", "piano", "calme"), w("Etude Op. 10 No. 12 Revolutionary", "piano", "intense"), w("Minute Waltz Op. 64 No. 1", "piano", "joyeux"), w("Ballade No. 1 in G minor", "piano", "dramatique"), w("Prelude Op. 28 No. 15 Raindrop", "piano", "calme"), w("Fantaisie-Impromptu", "piano", "intense"), w("Heroic Polonaise Op. 53", "piano", "intense"), w("Etude Op. 25 No. 1", "piano", "calme")] },
  { name: "Liszt", era: "romantique", works: [w("Liebestraum No. 3", "piano", "calme"), w("La Campanella", "piano", "intense"), w("Hungarian Rhapsody No. 2", "piano", "joyeux"), w("Consolation No. 3", "piano", "calme"), w("Les Préludes", "orchestre", "intense")] },
  { name: "Brahms", era: "romantique", works: [w("Hungarian Dance No. 5", "orchestre", "joyeux"), w("Wiegenlied Lullaby", "voix", "calme"), w("Symphony No. 3 third movement", "orchestre", "calme"), w("Piano Concerto No. 2 third movement", "orchestre", "calme"), w("Symphony No. 1 fourth movement", "orchestre", "intense"), w("Intermezzo Op. 118 No. 2", "piano", "calme")] },
  { name: "Tchaikovsky", era: "romantique", works: [w("Swan Lake Scene", "orchestre", "dramatique"), w("Dance of the Sugar Plum Fairy", "orchestre", "joyeux"), w("Waltz of the Flowers", "orchestre", "joyeux"), w("1812 Overture", "orchestre", "intense"), w("Piano Concerto No. 1 first movement", "orchestre", "intense"), w("Pathétique Symphony Adagio lamentoso", "orchestre", "dramatique"), w("Violin Concerto Canzonetta", "orchestre", "calme"), w("Romeo and Juliet Fantasy Overture", "orchestre", "dramatique")] },
  { name: "Dvořák", era: "romantique", works: [w("New World Symphony Largo", "orchestre", "calme"), w("Slavonic Dance No. 8", "orchestre", "joyeux"), w("Humoresque No. 7", "cordes", "joyeux"), w("Song to the Moon Rusalka", "voix", "calme"), w("Cello Concerto second movement", "cordes", "calme")] },
  { name: "Grieg", era: "romantique", works: [w("Peer Gynt Morning Mood", "orchestre", "calme"), w("In the Hall of the Mountain King", "orchestre", "intense"), w("Piano Concerto in A minor first movement", "orchestre", "dramatique"), w("Solveig's Song", "voix", "calme"), w("Holberg Suite Praeludium", "cordes", "joyeux")] },
  { name: "Rachmaninoff", era: "romantique", works: [w("Piano Concerto No. 2 first movement", "orchestre", "dramatique"), w("Piano Concerto No. 2 Adagio sostenuto", "orchestre", "calme"), w("Vocalise", "cordes", "calme"), w("Prelude in C sharp minor", "piano", "dramatique"), w("Rhapsody on a Theme of Paganini Variation 18", "orchestre", "calme"), w("Piano Concerto No. 3 first movement", "orchestre", "intense"), w("Symphony No. 2 Adagio", "orchestre", "calme")] },
  { name: "Verdi", era: "romantique", works: [w("Nabucco Va pensiero", "voix", "dramatique"), w("Requiem Dies Irae", "voix", "intense"), w("Aida Triumphal March", "orchestre", "intense"), w("La Traviata Libiamo", "voix", "joyeux"), w("Rigoletto La donna è mobile", "voix", "joyeux")] },
  { name: "Puccini", era: "romantique", works: [w("Nessun dorma", "voix", "intense"), w("O mio babbino caro", "voix", "calme"), w("Un bel dì vedremo Madama Butterfly", "voix", "dramatique"), w("Che gelida manina La Bohème", "voix", "calme"), w("Tosca E lucevan le stelle", "voix", "dramatique")] },
  { name: "Saint-Saëns", era: "romantique", works: [w("The Swan Carnival of the Animals", "cordes", "calme"), w("Danse macabre", "orchestre", "dramatique"), w("Organ Symphony finale", "orgue", "intense"), w("Aquarium Carnival of the Animals", "orchestre", "calme"), w("Introduction and Rondo Capriccioso", "cordes", "joyeux")] },
  { name: "Fauré", era: "romantique", works: [w("Pavane Op. 50", "orchestre", "calme"), w("Requiem Pie Jesu", "voix", "calme"), w("Après un rêve", "cordes", "calme"), w("Sicilienne", "cordes", "calme"), w("Cantique de Jean Racine", "voix", "calme")] },
  { name: "Tárrega", era: "romantique", works: [w("Recuerdos de la Alhambra", "guitare", "calme"), w("Lágrima", "guitare", "calme"), w("Capricho árabe", "guitare", "dramatique")] },
  { name: "Widor", era: "romantique", works: [w("Symphony No. 5 Toccata", "orgue", "intense")] },
  { name: "Debussy", era: "impressionniste", works: [w("Clair de lune", "piano", "calme"), w("Arabesque No. 1", "piano", "joyeux"), w("Rêverie", "piano", "calme"), w("La fille aux cheveux de lin", "piano", "calme"), w("Prélude à l'après-midi d'un faune", "orchestre", "calme"), w("Golliwogg's Cakewalk", "piano", "joyeux"), w("La cathédrale engloutie", "piano", "dramatique")] },
  { name: "Ravel", era: "impressionniste", works: [w("Boléro", "orchestre", "intense"), w("Pavane pour une infante défunte", "orchestre", "calme"), w("Gaspard de la nuit Ondine", "piano", "dramatique"), w("Piano Concerto in G Adagio assai", "orchestre", "calme"), w("Daphnis et Chloé Suite No. 2", "orchestre", "intense"), w("Jeux d'eau", "piano", "joyeux")] },
  { name: "Satie", era: "impressionniste", works: [w("Gymnopédie No. 1", "piano", "calme"), w("Gymnopédie No. 2", "piano", "calme"), w("Gymnopédie No. 3", "piano", "calme"), w("Gnossienne No. 1", "piano", "calme"), w("Gnossienne No. 3", "piano", "calme")] },
  { name: "Stravinsky", era: "moderne", works: [w("The Rite of Spring Introduction", "orchestre", "dramatique"), w("The Firebird Finale", "orchestre", "intense"), w("The Firebird Infernal Dance", "orchestre", "intense"), w("Petrushka Russian Dance", "orchestre", "joyeux"), w("Pulcinella Suite", "orchestre", "joyeux")] },
  { name: "Prokofiev", era: "moderne", works: [w("Romeo and Juliet Dance of the Knights", "orchestre", "intense"), w("Peter and the Wolf", "orchestre", "joyeux"), w("Lieutenant Kijé Troika", "orchestre", "joyeux"), w("Classical Symphony Gavotte", "orchestre", "joyeux"), w("Piano Concerto No. 3 first movement", "orchestre", "intense")] },
  { name: "Shostakovich", era: "moderne", works: [w("Waltz No. 2", "orchestre", "joyeux"), w("Symphony No. 5 Largo", "orchestre", "calme"), w("Piano Concerto No. 2 Andante", "orchestre", "calme"), w("Romance The Gadfly", "cordes", "calme"), w("String Quartet No. 8", "cordes", "dramatique")] },
  { name: "Elgar", era: "moderne", works: [w("Nimrod Enigma Variations", "orchestre", "calme"), w("Pomp and Circumstance March No. 1", "orchestre", "intense"), w("Salut d'amour", "cordes", "calme"), w("Cello Concerto first movement", "cordes", "dramatique")] },
  { name: "Barber", era: "moderne", works: [w("Adagio for Strings", "cordes", "dramatique"), w("Violin Concerto second movement", "orchestre", "calme"), w("Knoxville Summer of 1915", "voix", "calme")] },
  { name: "Holst", era: "moderne", works: [w("The Planets Jupiter", "orchestre", "joyeux"), w("The Planets Mars", "orchestre", "intense"), w("The Planets Venus", "orchestre", "calme"), w("The Planets Neptune", "orchestre", "calme")] },
  { name: "Gershwin", era: "moderne", works: [w("Rhapsody in Blue", "piano", "joyeux"), w("Summertime", "voix", "calme"), w("An American in Paris", "orchestre", "joyeux"), w("Piano Concerto in F second movement", "orchestre", "calme")] },
  { name: "Rodrigo", era: "moderne", works: [w("Concierto de Aranjuez Adagio", "guitare", "calme"), w("Concierto de Aranjuez Allegro gentile", "guitare", "joyeux")] },
  { name: "Pärt", era: "moderne", works: [w("Spiegel im Spiegel", "cordes", "calme"), w("Fratres", "cordes", "dramatique"), w("Für Alina", "piano", "calme")] },
];

export interface ClassicalFilters {
  instrument: Instrument | "all";
  mood: Mood | "all";
}

export const findComposer = (name: string): Composer | undefined => COMPOSERS.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());

// `count` works of the composer to search for. The ones matching the filters come first; when there are not enough
// the others fill in, so a strict filter never leaves the radio empty. `offset` moves along the list: every
// regeneration passes the next number and gets other works.
export function pickWorks(composer: Composer, count: number, filters: ClassicalFilters, offset = 0): Work[] {
  const fits = (x: Work) => (filters.instrument === "all" || x.i === filters.instrument) && (filters.mood === "all" || x.m === filters.mood);
  const list = [...composer.works.filter(fits), ...composer.works.filter((x) => !fits(x))];
  if (list.length === 0) return [];
  const start = (offset * count) % list.length;
  return Array.from({ length: Math.min(count, list.length) }, (_, k) => list[(start + k) % list.length]);
}
