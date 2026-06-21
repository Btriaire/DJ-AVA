// Citations sur la mémoire et l'esprit, affichées en récompense.
export const MEMORY_QUOTES: { text: string; author: string }[] = [
  { text: "La mémoire est la sentinelle de l'esprit.", author: "William Shakespeare" },
  { text: "On se souvient surtout de ce que l'on a aimé.", author: "Proverbe" },
  { text: "La mémoire est le trésor et le gardien de toutes choses.", author: "Cicéron" },
  { text: "Se souvenir, c'est vivre deux fois.", author: "Proverbe" },
  { text: "L'esprit, comme un muscle, se renforce par l'exercice.", author: "Sénèque (d'après)" },
  { text: "Rien ne se fait sans un peu d'enthousiasme.", author: "Voltaire" },
  { text: "Chaque jour, un petit pas vaut mieux qu'un grand projet remis à demain.", author: "Proverbe" },
  { text: "La patience est la clé de toutes les portes.", author: "Proverbe" },
  { text: "Le plus beau voyage, c'est celui que l'on n'a pas encore fait.", author: "Loïck Peyron" },
  { text: "Un esprit calme apporte une force intérieure.", author: "Dalaï-Lama (d'après)" },
  { text: "Ce n'est pas la montagne que l'on conquiert, mais soi-même.", author: "Edmund Hillary" },
  { text: "Le succès, c'est se promener d'échec en échec sans perdre son enthousiasme.", author: "Winston Churchill" },
  { text: "Fais de ta vie un rêve, et d'un rêve une réalité.", author: "Antoine de Saint-Exupéry" },
  { text: "Tomber sept fois, se relever huit.", author: "Proverbe japonais" },
  { text: "La concentration est la racine de toutes les capacités de l'homme.", author: "Bruce Lee" },
  { text: "Chaque jour est une nouvelle page à écrire.", author: "Proverbe" },
  { text: "La sérénité naît de l'effort tranquille et régulier.", author: "Proverbe" },
  { text: "Un petit progrès chaque jour mène à de grands résultats.", author: "Proverbe" },
];

export function randomQuote() {
  return MEMORY_QUOTES[Math.floor(Math.random() * MEMORY_QUOTES.length)];
}
