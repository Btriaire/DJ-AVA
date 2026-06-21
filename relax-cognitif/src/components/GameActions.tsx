import Icon from "./Icon";

type Props = {
  hintsLeft: number;
  hintLimit: number;
  onHint: () => void;
  onAbandon: () => void;
  finished: boolean;
  abandoned: boolean;
};

export default function GameActions({
  hintsLeft,
  hintLimit,
  onHint,
  onAbandon,
  finished,
  abandoned,
}: Props) {
  if (abandoned) return null;
  return (
    <div className="game-actions">
      <button
        className="btn btn-ghost"
        onClick={onHint}
        disabled={finished || hintsLeft <= 0}
      >
        <Icon name="bulb" size={20} /> Indice ({hintsLeft}/{hintLimit})
      </button>
      <button className="btn btn-danger" onClick={onAbandon} disabled={finished}>
        J'abandonne
      </button>
    </div>
  );
}
