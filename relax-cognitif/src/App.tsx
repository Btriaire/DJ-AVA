import type { ReactNode } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import Sudoku from "./games/Sudoku";
import Memory from "./games/Memory";
import Logique from "./games/Logique";
import MotsCroises from "./games/MotsCroises";
import MotsMeles from "./games/MotsMeles";
import Anagrammes from "./games/Anagrammes";
import Puissance4 from "./games/Puissance4";
import Citations from "./games/Citations";
import Tangram from "./games/Tangram";
import Formes from "./games/Formes";
import Mahjong from "./games/Mahjong";
import Puzzle from "./games/Puzzle";
import Couleurs from "./games/Couleurs";
import Calcul from "./games/Calcul";
import Rapidite from "./games/Rapidite";
import FeuVert from "./games/FeuVert";
import Ordre from "./games/Ordre";
import Stroop from "./games/Stroop";
import Simon from "./games/Simon";
import Dames from "./games/Dames";
import Culture from "./games/Culture";
import Philo from "./games/Philo";
import MotMystere from "./games/MotMystere";
import Pyramide from "./games/Pyramide";
import PlusMoins from "./games/PlusMoins";
import Illusions from "./games/Illusions";
import Meditation from "./pages/Meditation";
import Parcours from "./pages/Parcours";
import Profil from "./pages/Profil";
import Stats from "./pages/Stats";
import Admin from "./pages/Admin";
import GameRules from "./components/GameRules";
import Splash from "./components/Splash";
import BrainBg from "./components/BrainBg";
import { ensureProfiles } from "./lib/profile";

// Garantit qu'un profil actif existe (et migre l'ancien) dès le chargement,
// avant tout rendu qui lit des sessions par profil.
ensureProfiles();

function Shell({ title, game, children }: { title: string; game?: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="app">
      {game && <GameRules game={game} />}
      <div className="topbar">
        <button className="back" onClick={() => navigate("/")} aria-label="Retour à l'accueil">
          ‹ Accueil
        </button>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <>
    <BrainBg />
    <Splash />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sudoku" element={<Shell title="Sudoku" game="sudoku"><Sudoku /></Shell>} />
      <Route path="/memory" element={<Shell title="Paires de mémoire" game="memory"><Memory /></Shell>} />
      <Route path="/logique" element={<Shell title="Suite logique" game="logique"><Logique /></Shell>} />
      <Route path="/mots-croises" element={<Shell title="Mots croisés" game="motscroises"><MotsCroises /></Shell>} />
      <Route path="/mots-meles" element={<Shell title="Mots mêlés" game="motsmeles"><MotsMeles /></Shell>} />
      <Route path="/anagrammes" element={<Shell title="Anagrammes" game="anagrammes"><Anagrammes /></Shell>} />
      <Route path="/illusions" element={<Shell title="Illusions d'optique" game="illusions"><Illusions /></Shell>} />
      <Route path="/puissance4" element={<Shell title="Puissance 4" game="puissance4"><Puissance4 /></Shell>} />
      <Route path="/citations" element={<Shell title="Citations" game="citations"><Citations /></Shell>} />
      <Route path="/tangram" element={<Shell title="Tangram" game="tangram"><Tangram /></Shell>} />
      <Route path="/formes" element={<Shell title="Intrus des formes" game="formes"><Formes /></Shell>} />
      <Route path="/mahjong" element={<Shell title="Mahjong" game="mahjong"><Mahjong /></Shell>} />
      <Route path="/puzzle" element={<Shell title="Puzzle" game="puzzle"><Puzzle /></Shell>} />
      <Route path="/couleurs" element={<Shell title="De toutes les couleurs" game="couleurs"><Couleurs /></Shell>} />
      <Route path="/calcul" element={<Shell title="Les bons signes" game="calcul"><Calcul /></Shell>} />
      <Route path="/rapidite" element={<Shell title="Rapidité au clic" game="rapidite"><Rapidite /></Shell>} />
      <Route path="/feu-vert" element={<Shell title="Feu vert" game="feuvert"><FeuVert /></Shell>} />
      <Route path="/ordre" element={<Shell title="Ordre éclair" game="ordre"><Ordre /></Shell>} />
      <Route path="/stroop" element={<Shell title="Couleurs trompeuses" game="stroop"><Stroop /></Shell>} />
      <Route path="/simon" element={<Shell title="Suite lumineuse" game="simon"><Simon /></Shell>} />
      <Route path="/dames" element={<Shell title="Dames éclair" game="dames"><Dames /></Shell>} />
      <Route path="/culture" element={<Shell title="Culture générale" game="culture"><Culture /></Shell>} />
      <Route path="/philo" element={<Shell title="Avec le Chat de..." game="philo"><Philo /></Shell>} />
      <Route path="/mot-mystere" element={<Shell title="Mot mystère" game="motmystere"><MotMystere /></Shell>} />
      <Route path="/pyramide" element={<Shell title="La Pyramide" game="pyramide"><Pyramide /></Shell>} />
      <Route path="/plus-moins" element={<Shell title="Plus ou moins" game="plusmoins"><PlusMoins /></Shell>} />
      <Route path="/stats" element={<Shell title="Mes statistiques"><Stats /></Shell>} />
      <Route path="/meditation" element={<Shell title="Méditation"><Meditation /></Shell>} />
      <Route path="/parcours" element={<Parcours />} />
      <Route path="/profil" element={<Profil />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}

function NotFound() {
  return (
    <div className="app">
      <div className="topbar"><h1>Page introuvable</h1></div>
      <Link className="btn" to="/">Retour à l'accueil</Link>
    </div>
  );
}
