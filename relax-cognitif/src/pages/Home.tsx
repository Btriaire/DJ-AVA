import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import Medal from "../components/Medal";
import Logo from "../components/Logo";
import { randomQuote } from "../lib/memoryQuotes";
import {
  dayStreak,
  getSessions,
  medalTier,
  rankFor,
  successCount,
  totalSuccess,
  type GameId,
} from "../lib/store";

type Item = {
  to: string;
  icon: string;
  title: string;
  desc: string;
  game?: GameId;
};

type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "Réflexion & logique",
    items: [
      { to: "/sudoku", icon: "sudoku", title: "Sudoku", desc: "Logique et concentration", game: "sudoku" },
      { to: "/logique", icon: "logic", title: "Suite logique", desc: "Trouvez le bon nombre", game: "logique" },
      { to: "/calcul", icon: "calc", title: "Les bons signes", desc: "Placez +, − et × pour viser juste", game: "calcul" },
      { to: "/mots-croises", icon: "crossword", title: "Mots croisés", desc: "Vocabulaire et mémoire", game: "motscroises" },
      { to: "/mahjong", icon: "mahjong", title: "Mahjong", desc: "Retirez les paires libres", game: "mahjong" },
      { to: "/dames", icon: "dames", title: "Dames éclair", desc: "Affrontez l'IA sur mini-plateau", game: "dames" },
      { to: "/puissance4", icon: "connect4", title: "Puissance 4", desc: "Alignez 4 jetons contre l'IA", game: "puissance4" },
    ],
  },
  {
    title: "Mémoire & observation",
    items: [
      { to: "/memory", icon: "memory", title: "Paires de mémoire", desc: "Retrouvez les paires", game: "memory" },
      { to: "/simon", icon: "flower", title: "Suite lumineuse", desc: "Mémorisez et répétez la suite de pétales", game: "simon" },
      { to: "/couleurs", icon: "palette", title: "De toutes les couleurs", desc: "Quiz couleurs et expressions", game: "couleurs" },
      { to: "/culture", icon: "globe", title: "Culture générale", desc: "Capitales, rois, guerres, présidents…", game: "culture" },
      { to: "/formes", icon: "shapes", title: "Intrus des formes", desc: "Trouvez la forme différente", game: "formes" },
      { to: "/citations", icon: "quote", title: "Citations", desc: "Complétez les mots célèbres", game: "citations" },
      { to: "/philo", icon: "scroll", title: "Avec le Chat de...", desc: "Qui a dit ça ? Quel philosophe ?", game: "philo" },
      { to: "/mots-meles", icon: "grid", title: "Mots mêlés", desc: "Trouvez les mots cachés", game: "motsmeles" },
      { to: "/anagrammes", icon: "letters", title: "Anagrammes", desc: "Remettez les lettres en ordre", game: "anagrammes" },
    ],
  },
  {
    title: "Vitesse & réflexes",
    items: [
      { to: "/rapidite", icon: "target", title: "Rapidité au clic", desc: "Touchez les cibles le plus vite !", game: "rapidite" },
      { to: "/feu-vert", icon: "flash", title: "Feu vert", desc: "Touchez au vert, résistez au rouge", game: "feuvert" },
      { to: "/ordre", icon: "order", title: "Ordre éclair", desc: "Touchez les nombres 1 à 25 dans l'ordre", game: "ordre" },
      { to: "/stroop", icon: "palette", title: "Couleurs trompeuses", desc: "La couleur de l'encre, pas le mot !", game: "stroop" },
    ],
  },
  {
    title: "Formes & patience",
    items: [
      { to: "/tangram", icon: "tangram", title: "Tangram", desc: "Reconstituez la figure", game: "tangram" },
      { to: "/puzzle", icon: "puzzle", title: "Puzzle", desc: "Recomposez l'image", game: "puzzle" },
      { to: "/meditation", icon: "leaf", title: "Méditation", desc: "Détente et respiration" },
    ],
  },
];

export default function Home() {
  const sessions = getSessions();
  const xp = totalSuccess(sessions);
  const { rank, next, into, span } = rankFor(xp);
  const streak = dayStreak(sessions);
  const pct = span ? Math.min(100, Math.round((into / span) * 100)) : 100;
  const quote = randomQuote();

  return (
    <div className="app home">
      <header className="home-hero">
        <Logo size={108} className="home-hero-art" />
        <div className="home-hero-text">
          <h1>Esprit Clair</h1>
          <p>Entretenez votre esprit, en douceur, chaque jour.</p>
        </div>
      </header>

      <section className="prog-card">
        <div className="prog-head">
          <span className="prog-rank-icon" aria-hidden>
            <Icon name="trophy" size={26} />
          </span>
          <div className="prog-rank-text">
            <span className="prog-rank-name">{rank.name}</span>
            <span className="prog-rank-sub">
              {next ? `${into} / ${span} vers ${next.name}` : "Voie accomplie"}
            </span>
          </div>
          <div className="prog-stats">
            <span className="prog-stat">
              <Icon name="flame" size={16} /> {streak} j
            </span>
            <span className="prog-stat">
              <Icon name="trophy" size={16} /> {xp}
            </span>
          </div>
        </div>
        <div className="prog-bar">
          <div className="prog-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <Link className="featured" to="/parcours">
        <span className="featured-icon" aria-hidden>
          <Icon name="route" size={30} />
        </span>
        <span className="featured-text">
          <span className="featured-tag">Défi du jour</span>
          <span className="featured-title">Parcours de l'Esprit</span>
          <span className="featured-desc">5 chemins à choisir, chacun son histoire</span>
        </span>
        <span className="featured-go" aria-hidden>›</span>
      </Link>

      {SECTIONS.map((sec) => (
        <section key={sec.title} className="home-section">
          <h2 className="section-title">{sec.title}</h2>
          <nav className="menu">
            {sec.items.map((it) => {
              const tier = it.game ? medalTier(successCount(it.game, sessions)) : "none";
              return (
                <Link className="card" to={it.to} key={it.to}>
                  <span className="card-icon" aria-hidden>
                    <Icon name={it.icon} size={30} />
                  </span>
                  <span className="card-text">
                    <span className="card-title">{it.title}</span>
                    <span className="card-desc">{it.desc}</span>
                  </span>
                  {tier !== "none" && (
                    <span className="card-medal" aria-label={`Médaille ${tier}`}>
                      <Medal tier={tier} size={24} />
                    </span>
                  )}
                  <span className="card-go" aria-hidden>›</span>
                </Link>
              );
            })}
          </nav>
        </section>
      ))}

      <p className="home-quote">« {quote.text} » — {quote.author}</p>

      <div className="home-footer-links">
        <Link className="admin-link" to="/stats">
          <Icon name="chart" size={16} /> Mes statistiques
        </Link>
        <Link className="admin-link" to="/admin">
          <Icon name="gear" size={16} /> Espace administrateur
        </Link>
      </div>
    </div>
  );
}
