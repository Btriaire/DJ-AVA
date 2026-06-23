import { type Card, SUIT_SYMBOL, cardName, rankLabel } from "../lib/cards";

type Props = {
  card?: Card | null;
  faceUp?: boolean;
  selected?: boolean;
  dim?: boolean; // carte couverte / non jouable
  onClick?: () => void;
  width?: number; // largeur en px ; la hauteur suit le ratio
  className?: string;
};

const RATIO = 1.4; // hauteur / largeur (proche d'une vraie carte)

/** Une carte à jouer dessinée dans le style « Petit Bambou » (doux, épuré). */
export default function PlayingCard({
  card,
  faceUp = true,
  selected = false,
  dim = false,
  onClick,
  width = 56,
  className = "",
}: Props) {
  const style = {
    width,
    height: Math.round(width * RATIO),
    fontSize: Math.round(width * 0.34),
  };
  const cls = [
    "pcard",
    !faceUp || !card ? "back" : card.red ? "red" : "black",
    selected ? "sel" : "",
    dim ? "dim" : "",
    onClick ? "tappable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!faceUp || !card) {
    return (
      <div
        className={cls}
        style={style}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        aria-label={onClick ? "pioche" : "carte face cachée"}
      >
        <span className="pcard-back-art" aria-hidden />
      </div>
    );
  }

  const sym = SUIT_SYMBOL[card.suit];
  const lbl = rankLabel(card.rank);
  return (
    <div
      className={cls}
      style={style}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={cardName(card)}
    >
      <span className="pcard-corner tl" aria-hidden>
        <span className="pcard-rank">{lbl}</span>
        <span className="pcard-suit">{sym}</span>
      </span>
      <span className="pcard-pip" aria-hidden>
        {sym}
      </span>
      <span className="pcard-corner br" aria-hidden>
        <span className="pcard-rank">{lbl}</span>
        <span className="pcard-suit">{sym}</span>
      </span>
    </div>
  );
}
